// Deterministic survival benchmark over the actual DungeonBattle/TowerRun host.
// The pilot writes normal movement/aim/cast input only; it never moves actors directly,
// edits enemy attributes, enables god mode, buys gear, or restores resources.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readRuleFiles, PROJECT_ROOT, TOOL_ROOT } from './rule-files.mjs';
import { checkRuleSet, createProgression, progressionLoadout } from '../engine/index.mjs';
import { TowerRun, FLOOR_TIME_LIMIT, MONSTER_BASE_DAMAGE } from '../public/sim/dungeon-battle.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';

const DT = 1 / 60;
const round = n => +n.toFixed(3);

export class TowerPilot {
  constructor({ mode = 'stand' } = {}) { this.mode = mode; }
  update(battle) {
    const map = battle.dungeon, h = battle.hero;
    if (this.battle !== battle) { this.battle = battle; this.direction = null; }
    const visible = battle.monsters.filter(m => m.health > 0 && map.sweep(h.x, h.y, m.x, m.y, 24) < 0);
    let nearest = null, distance = Infinity;
    for (const m of visible) {
      const d = Math.hypot(m.x - h.x, m.y - h.y);
      if (d < distance) { nearest = m; distance = d; }
    }
    const target = nearest || battle.boss || battle.monsters.find(m => m.health > 0);
    if (nearest) battle.setAim(nearest.x, nearest.y);
    h.casting = !!nearest && distance < 1600;
    h.move = { x: 0, y: 0 };
    const fight = !!nearest && distance <= 850;
    if (target && !fight) {
      h.move = battle.directionTo(h, target);
    } else if (fight && this.mode === 'kite') {
      // Score legal short walking directions to keep casting distance, avoid crowding and walls.
      let best = null, score = -Infinity;
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8, dx = Math.cos(angle), dy = Math.sin(angle);
        const px = h.x + dx * 180, py = h.y + dy * 180;
        if (map.sweep(h.x, h.y, px, py, h.radius + 1) >= 0) continue;
        let closest = Infinity, crowd = 0;
        for (const m of visible) {
          const d = Math.hypot(m.x - px, m.y - py); closest = Math.min(closest, d);
          if (d < 250) crowd += 250 - d;
        }
        const keepRange = -Math.abs(closest - 750);
        const turn = this.direction ? (dx * this.direction.x + dy * this.direction.y) * 60 : 0;
        const value = keepRange - crowd * 3 + turn;
        if (value > score) { score = value; best = { x: dx, y: dy }; }
      }
      if (best) { h.move = best; this.direction = best; }
    }
  }
}

export function runTower({ files, check, loadout, seed = 18, monsterCount = 20, mode = 'stand', maxFloors = 40, floorSeconds = FLOOR_TIME_LIMIT, onFloor = null }) {
  if (floorSeconds !== FLOOR_TIME_LIMIT) throw new Error('限时基准测试每层固定 30 秒，超时判失败');
  const tower = new TowerRun(files, { collections: check.collections, monsterTypes: [...check.monsters.values()].map(e => e.doc), seed, god: false, autoCast: false, autoAdvance: true, monsterCount, timeLimitEnabled: true });
  tower.setLoadout(loadout);
  const pilot = new TowerPilot({ mode }), floors = [];
  let frames = 0, status = 'limit', lastDamage = [], floorStart = null, metrics;
  const begin = battle => {
    floorStart = { life: battle.character.life, mana: battle.character.mana, shield: battle.character.shield };
    metrics = { peakMonsters: 0, peakProjectiles: 0, DepthBlocked: 0, ChainBlocked: 0, CapacityDrops: 0, DroppedEvents: 0, BudgetStops: 0 };
    const trace = battle.host.world.trace;
    battle.host.world.trace = (kind, row) => {
      trace?.(kind, row);
      if (kind !== 'damage' || row.TargetExternalId !== HERO_TARGET_ID) return;
      const owner = battle.host.world.owners[row.root.owner];
      const attacker = battle.monsters.find(m => m.owner === row.root.owner);
      lastDamage.push({ time: round(battle.elapsed), owner: owner?.externalId, monster: attacker?.name || '已死亡怪物', boss: !!attacker?.boss,
        amount: round(row.Amount), raw: round(row.raw), element: row.Element, critical: row.bCritical, plan: battle.host.world.plans[row.root.plan].traitIds });
      if (lastDamage.length > 12) lastDamage.shift();
    };
  };
  const record = (battle, result) => {
    const c = battle.character;
    const entry = { floor: battle.floor, result, seconds: round(battle.elapsed), spawned: battle.spawned, killed: battle.kills,
      phase: battle.phase, failureReason: battle.failureReason, wave: battle.wave, wavesCompleted: battle.wavesCompleted, waveCounts: battle.waveCounts,
      bossSpawned: !!battle.boss, bossKilled: !!battle.boss && battle.boss.health <= 0,
      bossLife: battle.boss ? round(battle.boss.health) : null, bossMaxLife: battle.boss ? round(battle.boss.maxHealth) : null,
      casts: battle.hero.casts, monsterCasts: battle.monsterCasts, damageDealt: round(battle.damageDealt), incomingDamage: round(battle.damageTaken),
      start: floorStart, end: { life: round(c.life), maxLife: c.maxLife, shield: round(c.shield), mana: round(c.mana) },
      character: { ...c.totals }, metrics: { ...metrics }, survivors: battle.monsters.filter(m => m.health > 0).length };
    floors.push(entry); onFloor?.(entry);
  };
  begin(tower.battle);
  while (tower.floor <= maxFloors) {
    const battle = tower.battle;
    const simulating = battle.phase !== 'cleared';
    pilot.update(battle);
    tower.step(DT); frames++;
    if (simulating) {
      const stats = battle.host.world.getStats();
      metrics.peakMonsters = Math.max(metrics.peakMonsters, battle.monsters.length);
      metrics.peakProjectiles = Math.max(metrics.peakProjectiles, stats.Projectiles);
      for (const key of ['DepthBlocked', 'ChainBlocked', 'CapacityDrops', 'DroppedEvents', 'BudgetStops']) metrics[key] += stats[key];
    }
    if (battle.hero.god || battle.hero.autoCast) throw new Error('Survival benchmark must use normal combat');
    if (battle.phase === 'failed') { status = battle.failureReason; record(battle, status); break; }
    if (battle.phase === 'cleared') {
      if (battle.spawned !== monsterCount || !battle.exitPortal || !battle.boss || battle.boss.health > 0) {
        record(battle, 'invalid-route'); status = 'invalid-route'; break;
      }
      record(battle, 'cleared');
      if (tower.floor >= maxFloors) break;
      tower.advance(); begin(tower.battle);
    }
  }
  return { seed, monsterCount, mode, status, cleared: floors.filter(f => f.result === 'cleared').length,
    failedFloor: ['dead', 'timeout'].includes(status) ? tower.floor : null,
    deathFloor: status === 'dead' ? tower.floor : null, reachedFloor: tower.floor, simulatedSeconds: round(frames * DT), floors,
    lastDamage: status === 'dead' ? lastDamage : [] };
}

export function summarizeRuns(runs) {
  const keys = [...new Set(runs.map(run => `${run.mode}:${run.monsterCount}`))];
  return keys.map(key => {
    const group = runs.filter(run => `${run.mode}:${run.monsterCount}` === key), counts = group.map(run => run.cleared).sort((a, b) => a - b);
    const middle = Math.floor(counts.length / 2);
    return { mode: group[0].mode, monsterCount: group[0].monsterCount, runs: group.length,
      clearedMin: counts[0], clearedMax: counts.at(-1), clearedMedian: counts.length % 2 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2,
      deaths: group.filter(run => run.status === 'dead').length, timeouts: group.filter(run => run.status === 'timeout').length,
      failures: group.filter(run => ['dead', 'timeout'].includes(run.status)).length,
      invalidRoutes: group.filter(run => run.status === 'invalid-route').length };
  });
}

export const ruleFilesHash = files => createHash('sha256').update(JSON.stringify(files.map(({ path, text }) => [path, text]).sort((a, b) => a[0].localeCompare(b[0])))).digest('hex');

async function main() {
  const args = process.argv.slice(2), arg = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
  const list = (name, fallback) => String(arg(name, fallback)).split(',').map(Number);
  const seeds = list('--seeds', '1,3,18,57,100'), densities = list('--counts', '20,100,200,300'), modes = String(arg('--modes', 'stand,kite')).split(',');
  const maxFloors = Number(arg('--max-floors', 40)), floorSeconds = Number(arg('--floor-seconds', FLOOR_TIME_LIMIT));
  const files = readRuleFiles(), check = checkRuleSet(files);
  if (!check.ok) throw new Error(check.error);
  const preset = String(arg('--preset', ''));
  if (preset && !/^[a-z0-9_]+$/.test(preset)) throw new Error('无效的 BD 预设 id');
  const loadout = preset ? JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, `../../Content/Rules/Presets/${preset}.json`), 'utf8')) :
    progressionLoadout(createProgression(check.collections, check.library), check.collections);
  const report = { schema: 2, createdAt: new Date().toISOString(), rulesHash: ruleFilesHash(files), preset, loadout, dt: DT, seeds, densities, modes, maxFloors, floorSeconds,
    conditions: { god: false, autoCast: false, roomsPerFloor: 1, wavesBeforeBoss: 3, floorTimeLimit: FLOOR_TIME_LIMIT,
      timeoutIsFailure: true, carryResources: true, autoUpgrade: false, consumables: [], countIncludesBoss: true,
      monsterBaseDamage: MONSTER_BASE_DAMAGE }, runs: [] };
  const destination = path.resolve(arg('--out', path.join(PROJECT_ROOT, 'Saved/TowerTests', `${preset || 'starter-weapon'}-${Date.now()}.json`)));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const save = () => fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  for (const mode of modes) for (const monsterCount of densities) for (const seed of seeds) {
    const started = performance.now();
    const result = runTower({ files, check, loadout, seed, monsterCount, mode, maxFloors, floorSeconds,
      onFloor: entry => console.log(JSON.stringify({ event: 'floor', seed, monsterCount, mode, ...entry })) });
    result.wallSeconds = round((performance.now() - started) / 1000); report.runs.push(result); save();
    console.log(JSON.stringify({ event: 'run', seed, monsterCount, mode, status: result.status, cleared: result.cleared, deathFloor: result.deathFloor, seconds: result.simulatedSeconds, wallSeconds: result.wallSeconds }));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  report.summary = summarizeRuns(report.runs); save();
  console.log(`REPORT ${destination}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
