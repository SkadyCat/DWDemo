// 金样导出：一组固定场景，每个场景按顺序记下全部事件（以及直接命中、属性探针、单位快照），
// UE 版用同样的场景、种子、输入跑一遍逐事件比对（见 docs/ue-rule-engine-port.md §5）。
//
//   node scripts/export-golden-traces.mjs [输出目录]          默认 export/golden
//   node scripts/export-golden-traces.mjs --only=horde_inferno_final
//
// 每个文件：{ scenario, seed, packs, ops, events:[...], final:{...} }。同一提交两次导出逐字节相同。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BASE } from '../core/content/base.mjs';
import { GAME_SKILLS } from '../core/content/skills.mjs';
import { MAP_PACK, mapProfile } from '../core/content/maps.mjs';
import { ARCHETYPES } from '../core/content/archetypes.mjs';
import { STAGES, stageBuild } from '../core/content/builds.mjs';
import { HERO_BASE } from '../core/sim.mjs';
import { RESISTS } from '../core/registry.mjs';
import { createWorld, compileContent } from '../core/index.mjs';
import { writeGolden } from './golden-runner.mjs';
import { plain } from './export-ue-content.mjs';
import { generateDungeon } from '../public/game/dungeon.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',');
const outDir = path.resolve(args.find(a => !a.startsWith('--')) ?? path.join(here, '..', 'export/golden'));
fs.mkdirSync(outDir, { recursive: true });

const base = () => plain(BASE);
const game = () => [plain(BASE), plain(GAME_SKILLS), plain(MAP_PACK)];
const affixData = a => plain({ id: a.id, name: a.name, tags: a.tags, mods: a.mods, rules: a.rules, grants: a.grants });

// ------------------------------------------------------------------ engine building blocks (tests/core-engine)
const heroOpts = (mods = [], o = {}) => ({ kind: 'hero', team: 0, mods: [{ stat: 'life', value: 1000 }, { stat: 'mana', value: 200 }, ...mods], ...o });
const dummyOpts = (mods = [], o = {}) => ({ team: 1, x: 100, brain: 'none', mods: [{ stat: 'life', value: 1e6 }, ...mods], ...o });
const S60 = { dt: 1 / 60 };

const ENGINE = [
  { scenario: 'engine_mods', seed: 1, packs: [base()], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts([{ stat: 'damage', op: 'inc', value: 50 }, { stat: 'damage', op: 'inc', value: 50, tags: ['fire'] }, { stat: 'damage', op: 'more', value: 20 }, { stat: 'damage', op: 'more', value: 50, tags: ['spell'], notTags: ['fire'] }]) },
    { op: 'probe', actor: 'a', stat: 'damage', base: 100, tags: ['fire'] },
    { op: 'probe', actor: 'a', stat: 'damage', base: 100, tags: ['spell'] },
    { op: 'probe', actor: 'a', stat: 'damage', base: 100, tags: ['spell', 'fire'] },
  ] },
  { scenario: 'engine_conditions', seed: 1, packs: [base()], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts([{ stat: 'damage', op: 'more', value: 10, per: { res: 'power' } }, { stat: 'damage', op: 'inc', value: 100, when: { pct: 'life', lte: 50 } }, { stat: 'damage', op: 'more', value: 30, when: { status: 'shocked', of: 'target' } }]) },
    { op: 'spawn', as: 't', opts: dummyOpts() },
    { op: 'probe', actor: 'a', stat: 'damage', base: 100, target: 't' },
    { op: 'gain', actor: 'a', res: 'power', amount: 2 }, { op: 'probe', actor: 'a', stat: 'damage', base: 100, target: 't' },
    { op: 'gain', actor: 'a', res: 'power', amount: 5 }, { op: 'probe', actor: 'a', stat: 'damage', base: 100, target: 't' },
    { op: 'set', actor: 'a', field: 'life', value: 400 }, { op: 'probe', actor: 'a', stat: 'damage', base: 100, target: 't' },
    { op: 'applyStatus', actor: 't', id: 'shocked', opts: { magnitude: 0.2 } }, { op: 'probe', actor: 'a', stat: 'damage', base: 100, target: 't' },
    { op: 'flush' },
  ] },
  { scenario: 'engine_minions', seed: 1, packs: [base(), { minions: [{ id: 'zombie', life: 100 }] }], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts([{ stat: 'life', op: 'inc', value: 50, scope: 'minion' }, { stat: 'damage', op: 'more', value: 100, scope: 'minion' }]) },
    { op: 'spawnFromTemplate', as: 'm', id: 'zombie', opts: { owner: 'a', team: 0 } },
    { op: 'spawnFromTemplate', as: 'mm', id: 'zombie', opts: { owner: 'm', team: 0 } },
    { op: 'probe', actor: 'mm', stat: 'damage', base: 10 }, { op: 'snapshot' },
  ] },
  { scenario: 'engine_statuses', seed: 1, packs: [base(), { statuses: [{ id: 'buff', stacking: 'stack', max: 5, duration: 3, mods: [{ stat: 'damage', op: 'inc', value: 10 }] }] }], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts() }, { op: 'spawn', as: 't', opts: dummyOpts() },
    ...Array.from({ length: 7 }, () => ({ op: 'applyStatus', actor: 'a', id: 'buff' })),
    { op: 'probe', actor: 'a', stat: 'damage', base: 100 },
    { op: 'applyStatus', actor: 't', id: 'poisoned', opts: { dps: 10, duration: 1 } }, { op: 'applyStatus', actor: 't', id: 'poisoned', opts: { dps: 10, duration: 2 } },
    { op: 'applyStatus', actor: 't', id: 'ignited', opts: { dps: 5 } }, { op: 'applyStatus', actor: 't', id: 'ignited', opts: { dps: 50 } },
    { op: 'run', steps: 60, ...S60 }, { op: 'snapshot' }, { op: 'run', steps: 62, ...S60 }, { op: 'snapshot' },
  ] },
  { scenario: 'engine_dot_kill', seed: 1, packs: [base()], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts() }, { op: 'spawn', as: 't', opts: dummyOpts([{ stat: 'life', op: 'set', value: 30 }]) },
    { op: 'refreshPools', actor: 't', fill: true },
    { op: 'applyStatus', actor: 't', id: 'ignited', opts: { source: 'a', dps: 40, duration: 4 } },
    { op: 'run', steps: 90, ...S60 },
  ] },
  { scenario: 'engine_defences', seed: 1, packs: [base()], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts([{ stat: 'pen.fire', value: 20 }, { stat: 'conv.physical.lightning', value: 50 }, { stat: 'conv.lightning.cold', value: 50 }, { stat: 'extra.physical.fire', value: 10 }]) },
    { op: 'spawn', as: 't', opts: dummyOpts([{ stat: 'res.fire', value: 90 }, { stat: 'armour', value: 1000 }]) },
    { op: 'hit', spec: { source: 'a', target: 't', base: { fire: 100 } } },
    { op: 'applyStatus', actor: 't', id: 'scorched', opts: { magnitude: 0.1 } }, { op: 'hit', spec: { source: 'a', target: 't', base: { fire: 100 } } },
    { op: 'applyStatus', actor: 't', id: 'scorched', opts: { magnitude: 0.3 } }, { op: 'hit', spec: { source: 'a', target: 't', base: { fire: 100 } } },
    { op: 'hit', spec: { source: 'a', target: 't', base: { physical: 100 } } },
    { op: 'spawn', as: 's', opts: dummyOpts([{ stat: 'life', op: 'set', value: 100 }, { stat: 'es', value: 50 }]) },
    { op: 'refreshPools', actor: 's', fill: true },
    { op: 'hit', spec: { source: 'a', target: 's', base: { physical: 80 } } },
    { op: 'flush' }, { op: 'snapshot' },
  ] },
  { scenario: 'engine_rolls', seed: 5, packs: [base()], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts([{ stat: 'crit.bonus', value: 50 }, { stat: 'lucky.crit', op: 'flag' }]) }, { op: 'spawn', as: 't', opts: dummyOpts() },
    ...Array.from({ length: 150 }, () => ({ op: 'hit', spec: { source: 'a', target: 't', base: { physical: 10 }, crit: 25 } })),
    { op: 'applyStatus', actor: 't', id: 'brittle', opts: { magnitude: 1, duration: 99 } }, { op: 'probe', actor: 't', stat: 'crit.taken' },
    { op: 'spawn', as: 'b', opts: dummyOpts([{ stat: 'block', value: 50 }]) },
    ...Array.from({ length: 100 }, () => ({ op: 'hit', spec: { source: 'a', target: 'b', base: { physical: 1 } } })),
    { op: 'spawn', as: 'e', opts: dummyOpts([{ stat: 'evasion', value: 20000 }]) },
    ...Array.from({ length: 100 }, () => ({ op: 'hit', spec: { source: 'a', target: 'e', base: { physical: 1 }, attack: true } })),
    { op: 'flush' },
  ] },
  { scenario: 'engine_ailments', seed: 1, packs: [base()], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts([{ stat: 'chance.ignite', value: 100 }, { stat: 'chance.bleed', value: 100 }, { stat: 'chance.shock', value: 100 }, { stat: 'chance.freeze', value: 100 }, { stat: 'chance.poison', value: 100 }, { stat: 'conv.physical.fire', value: 60 }, { stat: 'ailmentDamage', op: 'inc', value: 100, tags: ['ignite'] }, { stat: 'ailmentStacks.poison', value: 2 }]) },
    { op: 'spawn', as: 't', opts: dummyOpts([{ stat: 'res.fire', value: 75 }, { stat: 'life', op: 'set', value: 2000 }]) },
    { op: 'refreshPools', actor: 't', fill: true },
    { op: 'hit', spec: { source: 'a', target: 't', base: { physical: 100, lightning: 40, cold: 300 } } },
    { op: 'snapshot' }, { op: 'run', steps: 240, ...S60 }, { op: 'snapshot' },
  ] },
  { scenario: 'engine_budget', seed: 1, eventBudget: 5000, maxDepth: 6, packs: [base(), { affixes: [{ id: 'loop', rules: [{ on: 'hit', chain: true, do: [{ do: 'damage', damage: { fire: 1 } }] }] }] }], ops: [
    { op: 'spawn', as: 'a', opts: heroOpts([], { affixes: ['loop'] }) }, { op: 'spawn', as: 't', opts: dummyOpts() },
    { op: 'hit', spec: { source: 'a', target: 't', base: { fire: 1 } } },
    { op: 'run', steps: 1, ...S60 },
  ] },
  ...[9, 10].map(seed => ({ scenario: `engine_bolt_seed${seed}`, seed, packs: [base(), { skills: [{ id: 'bolt', tags: ['spell', 'projectile', 'lightning'], time: .3, crit: 30, damage: { lightning: 30 }, actions: [{ do: 'projectile', speed: 1500, chain: 3 }] }] }], ops: [
    { op: 'spawn', as: 'h', opts: heroOpts([{ stat: 'chance.shock', value: 50 }, { stat: 'mana.regen', value: 50 }], { brain: 'turret', skills: ['bolt'] }) },
    ...Array.from({ length: 6 }, (_, i) => ({ op: 'spawn', as: `d${i}`, opts: dummyOpts([{ stat: 'life', op: 'set', value: 200 }], { x: 300 + i * 40, y: (i % 2) * 80 }) })),
    { op: 'run', steps: 300, ...S60 },
  ] })),
];

// ------------------------------------------------------------------ skills one by one against a small pack (plain game content)
const PACK_AT = (n, cx, life, extra = []) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2, r = 40 + 25 * (i % 4);
  return { op: 'spawn', as: `m${i}`, opts: { team: 1, brain: 'none', x: cx + Math.cos(a) * r, y: Math.sin(a) * r, radius: 28, mods: [{ stat: 'life', value: life }, ...extra] } };
});
const SKILL_LIST = ['fireball', 'ice_nova', 'arc', 'frost_bolt', 'spark', 'flame_wall', 'heavy_strike', 'cleave', 'cyclone', 'falling_thunder', 'flicker_strike', 'viper_knives', 'summon_blades', 'storm_totem_place', 'tornado'];
const SKILLS = SKILL_LIST.map(id => ({ scenario: `skill_${id}`, seed: 3, packs: game(), ops: [
  { op: 'spawn', as: 'h', opts: { kind: 'hero', team: 0, brain: 'chase', radius: 30, skills: [id], mods: [{ stat: 'life', value: 3000 }, { stat: 'mana', value: 400 }, { stat: 'mana.regen', value: 40 }, { stat: 'chance.ignite', value: 30 }, { stat: 'chance.shock', value: 30 }, { stat: 'chance.freeze', value: 20 }, { stat: 'chance.bleed', value: 20 }, { stat: 'chance.poison', value: 20 }, { stat: 'crit.chance', value: 10 }],
    resources: { power: 3 } } },
  ...PACK_AT(12, 320, 260, [{ stat: 'armour', value: 200 }, { stat: 'evasion', value: 300 }, { stat: 'res.fire', value: 20 }]),
  { op: 'run', steps: 360, ...S60 }, { op: 'snapshot' },
] }));

// ------------------------------------------------------------------ archetype hordes (analysis.hordeProbe, count 200, seed 11, first 30 s)
function hordeScenario(arch, stageIndex, { count = 200, radius = 1300, seconds = 30, seed = 11, aggro = 700 } = {}) {
  const build = stageBuild(arch, stageIndex);
  const tier = build.stage.maps[1];
  const profile = mapProfile(tier);
  // Spawn positions come from the world's own 'spawn' stream, exactly like hordeProbe.
  const probe = createWorld(compileContent(...game()), { seed });
  const ids = build.affixes.map(a => a.id);
  const uniq = new Map(); for (const a of build.affixes) uniq.set(a.id, affixData(a));
  const ops = [
    { op: 'spawn', as: 'hero', opts: { kind: 'hero', team: 0, brain: 'turret', radius: 30,
      mods: [...HERO_BASE, ...(build.mods ?? []), ...RESISTS.map(e => ({ stat: `res.${e}`, value: -profile.resistPenalty }))], affixes: ids, skills: build.skills } },
    { op: 'set', actor: 'hero', field: 'brain', value: 'chase' },
    { op: 'set', actor: 'hero', field: 'keepDistance', value: build.keepDistance ?? 0 },
    { op: 'set', actor: 'hero', field: 'aggro', value: 5000 },
    build.keepDistance > 0 ? { op: 'set', actor: 'hero', field: 'kite', value: build.keepDistance * 0.45 } : { op: 'set', actor: 'hero', field: 'closeIn', value: 30 },
  ];
  for (let i = 0; i < count; ++i) {
    const a = probe.roll('spawn') * Math.PI * 2, r = 220 + Math.sqrt(probe.roll('spawn')) * radius;
    ops.push({ op: 'spawn', as: `m${i}`, opts: { team: 1, kind: 'monster', x: Math.cos(a) * r, y: Math.sin(a) * r, radius: 28, aggro, skills: ['mob_strike'],
      mods: [{ stat: 'life', value: profile.monsterLife }, { stat: 'added.physical', value: profile.monsterDamage },
        ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: profile.monsterResist })), { stat: 'res.chaos', value: profile.monsterResist / 2 },
        { stat: 'armour', value: profile.monsterArmour }, { stat: 'evasion', value: profile.monsterEvasion }, { stat: 'accuracy', value: profile.monsterAccuracy }] } });
  }
  ops.push({ op: 'run', steps: seconds * 30, dt: 1 / 30, each: [{ op: 'fill', actor: 'hero', pools: ['life', 'mana'] }] });
  return { scenario: `horde_${arch.id}_${STAGES[stageIndex].id}`, seed, packs: [...game(), { affixes: [...uniq.values()] }], ops };
}
const HORDES = ARCHETYPES.flatMap(arch => STAGES.map((_, i) => () => hordeScenario(arch, i)));

// ------------------------------------------------------------------ boss: delayed slam (telegraph), nova, enrage
function bossScenario(arch, tier = 10) {
  const build = stageBuild(arch, 4), profile = mapProfile(tier);
  const uniq = new Map(); for (const a of build.affixes) uniq.set(a.id, affixData(a));
  return { scenario: `boss_${arch.id}_t${tier}`, seed: 4, packs: [...game(), { affixes: [...uniq.values()] }], ops: [
    { op: 'spawn', as: 'hero', opts: { kind: 'hero', team: 0, brain: 'chase', radius: 30, mods: [...HERO_BASE, ...RESISTS.map(e => ({ stat: `res.${e}`, value: -profile.resistPenalty }))], affixes: build.affixes.map(a => a.id), skills: build.skills } },
    { op: 'set', actor: 'hero', field: 'keepDistance', value: build.keepDistance ?? 0 },
    { op: 'spawn', as: 'boss', opts: { team: 1, kind: 'boss', x: 500, y: 0, radius: 70, aggro: 2500, skills: ['mob_strike', 'boss_slam', 'boss_nova'],
      mods: [{ stat: 'life', value: profile.bossLife }, { stat: 'added.fire', value: profile.monsterDamage * 2 }, { stat: 'armour', value: profile.monsterArmour }, { stat: 'evasion', value: profile.monsterEvasion }, { stat: 'accuracy', value: profile.monsterAccuracy },
        ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: profile.monsterResist })), { stat: 'res.chaos', value: profile.monsterResist / 2 }] } },
    { op: 'run', steps: 300, dt: 1 / 30, each: [{ op: 'fill', actor: 'hero', pools: ['life'] }] },
    { op: 'applyStatus', actor: 'boss', id: 'enraged', opts: {} },
    { op: 'run', steps: 300, dt: 1 / 30, each: [{ op: 'fill', actor: 'hero', pools: ['life'] }] },
    { op: 'snapshot' },
  ] };
}
const BOSSES = ['inferno', 'glacier'].map(id => () => bossScenario(ARCHETYPES.find(a => a.id === id)));

// ------------------------------------------------------------------ dungeon terrain: walls, sliding, flow fields, wall-stopped projectiles
function dungeonScenario(name, skill, { seed = 5, mobs = 40, seconds = 25, build = null } = {}) {
  const d = generateDungeon(seed, 1);
  const rng = createWorld(compileContent(...game()), { seed: 99 });
  const floor = d.tiles.filter(t => d.rooms[t.room]?.kind !== 'entry' && t.room >= 0);
  const ops = [{ op: 'spawn', as: 'hero', opts: { kind: 'hero', team: 0, brain: 'chase', radius: 30, x: d.entry.x, y: d.entry.y, skills: [skill],
    affixes: build ? build.affixes.map(a => a.id) : [], mods: [...HERO_BASE, { stat: 'life', value: 4000 }, { stat: 'mana', value: 600 }, { stat: 'mana.regen', value: 80 }] } },
    { op: 'set', actor: 'hero', field: 'aggro', value: 5000 }];
  for (let i = 0; i < mobs; ++i) {
    const t = floor[Math.floor(rng.roll('place') * floor.length)], c = d.tileCenter(t.x, t.y);
    ops.push({ op: 'spawn', as: `m${i}`, opts: { team: 1, kind: 'monster', x: c.x, y: c.y, radius: 28, aggro: 2500, skills: [i % 3 ? 'mob_strike' : 'mob_bolt'],
      mods: [{ stat: 'life', value: 120 }, { stat: 'added.physical', value: 6 }, { stat: 'accuracy', value: 300 }] } });
    if (i % 3 === 0) ops.push({ op: 'set', actor: `m${i}`, field: 'keepDistance', value: 420 });
  }
  ops.push({ op: 'run', steps: seconds * 30, dt: 1 / 30, each: [{ op: 'fill', actor: 'hero', pools: ['life'] }] }, { op: 'snapshot' });
  const uniq = new Map(); for (const a of build?.affixes ?? []) uniq.set(a.id, affixData(a));
  return { scenario: `dungeon_${name}`, seed: 6, dungeon: { seed, floor: 1 }, packs: [...game(), { affixes: [...uniq.values()] }], ops };
}
const DUNGEONS = [
  () => dungeonScenario('fireball', 'fireball'),
  () => dungeonScenario('flicker', 'flicker_strike', { seed: 9 }),
  () => dungeonScenario('storm_final', 'arc', { seed: 12, build: stageBuild(ARCHETYPES.find(a => a.id === 'storm'), 4) }),
  // Travelling vortices bounce off the dungeon walls.
  () => dungeonScenario('tempest_final', 'tornado', { seed: 13, build: stageBuild(ARCHETYPES.find(a => a.id === 'tempest'), 4) }),
];

// ------------------------------------------------------------------ the 16 archetype mechanism chains (tests/core-archetypes.test.mjs)
// Recorded and replayed in a child process (golden-record-tests.mjs): the web registry is global, test packs
// redefine stats the game content also defines.
function exportArchetypes() {
  const stdout = execFileSync(process.execPath, [path.join(here, 'golden-record-tests.mjs'), outDir], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 }).toString();
  const line = stdout.split('\n').find(l => l.startsWith('@@DW_ARCHETYPES@@'));
  if (!line) throw new Error('录制流派机制链失败：子进程没有输出结果');
  return JSON.parse(line.slice('@@DW_ARCHETYPES@@'.length));
}

export const SCENARIOS = [...ENGINE.map(s => () => s), ...SKILLS.map(s => () => s), ...HORDES, ...BOSSES, ...DUNGEONS];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(outDir, { recursive: true });
  const index = [];
  for (const make of SCENARIOS) {
    const sc = make();
    if (only && !only.includes(sc.scenario)) continue;
    const row = writeGolden(outDir, sc);
    index.push(row);
    console.log(`${sc.scenario.padEnd(34)} ${String(row.events).padStart(8)} 事件  ${(row.bytes / 1024).toFixed(0).padStart(6)} KiB`);
  }
  if (!only || only.some(o => o.startsWith('archetype_'))) for (const row of exportArchetypes()) {
    if (only && !only.includes(row.scenario)) continue;
    index.push(row);
    console.log(`${row.scenario.padEnd(34)} ${String(row.events).padStart(8)} 事件  ${(row.bytes / 1024).toFixed(0).padStart(6)} KiB`);
  }
  if (!only) fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
}
