import { Battle } from './battle.mjs';
import { generateDungeon, dungeonRandom } from './dungeon.mjs';
import { newBuild } from '../../engine/reader.mjs';
import { withHeld } from '../../engine/library.mjs';
import { MONSTER_RARITY_EQUIPMENT } from '../../engine/pawn-equipment.mjs';
import { FloorRewards } from '../../engine/floor-rewards.mjs';
import { MapUnit } from '../../engine/map-unit.mjs';
import { rollEquipment, registerEquipmentDropLibrary } from '../equipment-generation.mjs';
import { GLOBAL_MONSTER_SETTINGS } from '../data/global-monster-settings.mjs';
import { outpostMerchantLocation } from '../outpost-merchant-model.mjs';
import { dungeonMapEvents } from '../map-event-locations.mjs';
import { statusKey } from '../../engine/types.mjs';

export const FLOOR_TIME_LIMIT = 30;
export const MAX_TOWER_FLOOR = 100;
export function validateFloor(floor) {
  if (!Number.isInteger(floor) || floor < 1 || floor > MAX_TOWER_FLOOR) throw new Error(`挑战层数必须是 1–${MAX_TOWER_FLOOR} 的整数`);
  return floor;
}
export const MONSTER_BASE_DAMAGE = Object.freeze({ normal: 10, common: 10, magic: 10, rare: 20, boss: 30 });

export class DungeonBattle extends Battle {
  constructor(files, { floor = 1, mapTier = null, seed = 1, regionId = null, monsterCount = 20, monsterTypes = null, monsterPreview = false, rewards = null, mapEquipment, monsterSettings = GLOBAL_MONSTER_SETTINGS, timeLimitEnabled = false, ...options } = {}) {
    validateFloor(floor);
    if (mapTier != null && (!Number.isInteger(mapTier) || mapTier < 1 || mapTier > 16 || mapTier !== floor)) throw new Error('入场地图层级与战斗层级不一致');
    if (!Number.isInteger(monsterCount) || monsterCount < 20 || monsterCount > 300) throw new Error('每层怪物总数必须是 20–300 的整数');
    const eligibleTypes = monsterTypes?.filter(doc => doc.enabled && doc.weight > 0 && (monsterPreview || (doc.minFloor ?? 1) <= floor)) ?? null;
    if (eligibleTypes?.length === 0) throw new Error(`第 ${floor} 层没有可刷新的怪物配置，请检查开始出现层数、启用状态和权重`);
    super(files, { ...options, monsterTypes: eligibleTypes, seed, maxMonsters: Math.max(128, monsterCount), spawnRate: 0 });
    this.map = new MapUnit(this.host.library, this.collections, { owner: this.monsterOwner, equipment: mapEquipment });
    this.host.setOwnerStatusId(this.map.owner, this.map.id);
    this.baseMonsterCount = monsterCount;
    monsterCount = this.map.monsterCount(monsterCount);
    this.maxMonsters = Math.max(128, monsterCount);
    this.floor = floor;
    this.admittedMapTier = mapTier;
    this.monsterCount = monsterCount;
    this.dungeon = generateDungeon(seed, floor);
    this.regionId = regionId;
    this.outpostMerchant = outpostMerchantLocation(this.dungeon, regionId);
    this.mapEvents = dungeonMapEvents(this.dungeon, regionId);
    this.monsterSettings = { ...monsterSettings };
    this.navigationFlows = new Map();
    this.completionMode = 'boss';
    this.exitPortal = null;
    this.floorRandom = dungeonRandom(seed ^ 0x71c42a);
    this.roomStates = this.dungeon.rooms.map(r => ({ visited: r.id === this.dungeon.entryRoom, spawned: false, cleared: false }));
    this.waveCounts = [monsterCount - 1];
    this.wave = 0;
    this.wavesCompleted = 0;
    Object.assign(this.hero, this.dungeon.entry);
    this.phase = 'waves';
    this.failureReason = null;
    this.timeLimit = FLOOR_TIME_LIMIT;
    this.setTimeLimitEnabled(timeLimitEnabled);
    this.boss = null;
    this.nextIn = 2.5;
    if (rewards) registerEquipmentDropLibrary(files, this.host.library);
    this.rewards = rewards ? new FloorRewards(this.collections, this.host.library, rewards.catalog, { ...rewards, seed, floor,
      maxTier: Math.min(10, this.mapTier), mapTier: this.mapTier,
      bossMapDropChance: this.map.character.stat('map.boss_map_drop_chance') / 100, createEquipment: rollEquipment }) : null;
    const onKill = this.onKill;
    this.onKill = (stones, monster) => { onKill?.(stones, monster); this.rewards?.onKill(monster); };
    this.host.world.sweepObstacle = (sx, sy, ex, ey, radius) => this.dungeon.sweep(sx * 100, sy * 100, ex * 100, ey * 100, radius * 100);
  }
  get combatRooms() { return this.dungeon.rooms; }
  get mapTier() { return this.admittedMapTier ?? this.map.tier; }
  get clearedRooms() { return this.combatRooms.filter(r => this.roomStates[r.id].cleared).length; }
  get timeRemaining() { return this.timeLimitEnabled ? Math.max(0, this.timeLimitEndsAt - this.elapsed) : Infinity; }
  setTimeLimitEnabled(enabled) {
    const next = !!enabled;
    if (this.timeLimitEnabled === next) return;
    this.timeLimitEnabled = next;
    this.timeLimitEndsAt = next ? this.elapsed + this.timeLimit : null;
  }
  tickSpawner() {} // The dungeon encounter creates one finite population.
  setMapEquipment(equipment) {
    this.map.setEquipment(equipment);
    this.monsterCount = this.map.monsterCount(this.baseMonsterCount);
    this.maxMonsters = Math.max(128, this.monsterCount);
    this.waveCounts = [this.monsterCount - 1];
    for (const monster of this.monsters) if (monster.health > 0) this.refreshMonsterEquipment(monster);
    if (this.rewards) {
      this.rewards.maxTier = Math.min(10, this.mapTier);
      this.rewards.mapTier = this.mapTier;
      this.rewards.bossMapDropChance = this.map.character.stat('map.boss_map_drop_chance') / 100;
    }
  }
  onMonsterCreated(monster) { this.map.summon(monster); }
  monsterInheritedSources(monster) { return monster.summonerId === this.map.id ? this.map.summonSources : []; }
  moveActor(actor, x, y) { this.dungeon ? this.dungeon.move(actor, x, y) : super.moveActor(actor, x, y); }
  canMonsterAttack(monster) { return this.dungeon.sweep(monster.x, monster.y, this.hero.x, this.hero.y) < 0; }
  monsterSeekRange(monster) {
    const c = monster.equipmentCharacter;
    return Math.max(0, c?.stats.has('monster.seek_range') ? c.stat('monster.seek_range') : this.monsterSettings.aggroRadiusMeters);
  }
  canMonsterPursue(monster) {
    const range = this.monsterSeekRange(monster);
    return this.phase !== 'cleared' && range > 0 && Math.hypot(monster.x - this.hero.x, monster.y - this.hero.y) <= range * 100;
  }
  navigationTarget(actor, target) {
    const map = this.dungeon, radius = actor.radius || 45;
    if (map.sweep(actor.x, actor.y, target.x, target.y, radius + 1) < 0) return target;
    const end = map.tileOf(target.x, target.y), key = `${end.x}:${end.y}`;
    if (!this.navigationFlows.has(key)) {
      if (this.navigationFlows.size >= 4) this.navigationFlows.clear();
      this.navigationFlows.set(key, map.flow(target.x, target.y));
    }
    const distances = this.navigationFlows.get(key), at = map.tileOf(actor.x, actor.y);
    let best = distances[at.y * map.size + at.x], next = null;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = at.x + dx, y = at.y + dy, d = distances[y * map.size + x], p = map.tileCenter(x, y);
      if (map.walkable(x, y) && d >= 0 && (best < 0 || d < best) && map.sweep(actor.x, actor.y, p.x, p.y, radius + 1) < 0) { best = d; next = p; }
    }
    return next || map.tileCenter(at.x, at.y);
  }
  directionTo(actor, target) {
    const next = this.navigationTarget(actor, target), x = next.x - actor.x, y = next.y - actor.y, length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }
  pickupDirection(drop) {
    const tile = this.dungeon.tileOf(drop.x, drop.y);
    // A short loot scatter can cross a wall edge. Its birth point is still on
    // the floor and within pickup reach, whereas a flow to a wall has no path.
    const target = !this.dungeon.walkable(tile.x, tile.y) && Number.isFinite(drop.sourceX) && Number.isFinite(drop.sourceY)
      ? { x: drop.sourceX, y: drop.sourceY } : drop;
    return this.directionTo(this.hero, target);
  }
  steerTarget(monster) {
    const target = super.steerTarget(monster), tile = this.dungeon.tileOf(target.x, target.y);
    return this.navigationTarget(monster, this.dungeon.walkable(tile.x, tile.y) ? target : this.hero);
  }
  #aggregateAttackDamage(monster) {
    const damage = MONSTER_BASE_DAMAGE[monster.rarity] ?? MONSTER_BASE_DAMAGE.common;
    const skills = monster.type?.skills || [{ id: 'monster_claw', plan: this.clawPlan, name: '爪击', range: 180, cooldown: 1.2 }];
    monster.baseDamage = damage;
    monster.type = { ...monster.type, skills: skills.map(skill => {
      const source = this.host.planSources.get(skill.plan);
      if (!source) throw new Error(`怪物技能缺少聚合源：${skill.id}`);
      const active = source.traits.find(trait => trait.id.toLowerCase() === source.activeId.toLowerCase());
      // Fixed-damage skills (claw / ice lance) read their own parameter, rather than cast power.
      // Override that existing trait through normal aggregation; never mutate the shared skill.
      const key = active && [...active.params.keys()].find(key => key.toLowerCase() === 'damage');
      const held = key ? [{ ...active, params: new Map([...active.params, [key, damage]]) }] : [];
      const compiled = this.host.compileSource(newBuild(source.activeId, withHeld(source.traits, held)));
      if (compiled.error) throw new Error(compiled.error);
      return { ...skill, power: damage, plan: compiled.plan };
    }) };
  }
  #spawnEncounter(count) {
    const map = this.dungeon, bossRoom = map.rooms[map.bossRoom];
    const bossPosition = { x: bossRoom.centerX * map.tile - map.half, y: bossRoom.centerY * map.tile - map.half };
    const candidates = map.tiles.map(t => ({ ...map.tileCenter(t.x, t.y), room: t.room })).filter(p => p.room !== map.entryRoom && Math.hypot(p.x - map.entry.x, p.y - map.entry.y) >= this.monsterSettings.playerSpawnExclusionRadiusMeters * 100 && Math.hypot(p.x - bossPosition.x, p.y - bossPosition.y) >= 200 && map.sweep(p.x, p.y, p.x, p.y, 95) < 0);
    for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(this.floorRandom() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
    if (candidates.length < count - 1) throw new Error('随机地牢缺少安全刷怪位置');
    const previous = this.monsters.length;
    // Reuse authored monster selection, registered owners and compiled skill plans.
    super.spawnMonsters(count);
    for (const [index, m] of this.monsters.slice(previous).entries()) {
      const boss = index === count - 1, pos = boss ? bossPosition : candidates[index];
      m.x = pos.x; m.y = pos.y;
      m.roomId = boss ? bossRoom.id : pos.room; m.wave = boss ? null : 1; m.boss = boss;
      if (m.roomId >= 0) this.roomStates[m.roomId].spawned = true;
      if (boss) {
        this.setMonsterEquipment(m, 'rarity', MONSTER_RARITY_EQUIPMENT.boss);
        m.baseMaxHealth *= 9; m.baseMaxShield *= 9;
        this.refreshMonsterEquipment(m);
      }
      if (boss) {
        m.name = `第 ${this.floor} 层守卫`;
        m.color = '#d28c35'; m.radius = 90; m.speed = Math.min(m.speed, 230);
        const nova = this.host.compileNamedBuild('monster_nova');
        if (nova.plan >= 0) {
          const skills = m.type?.skills || [{ id: 'monster_claw', plan: this.clawPlan, name: '爪击', range: 180, cooldown: 1.2 }];
          m.type = { ...m.type, skills: [{ id: 'monster_nova', plan: nova.plan, name: '首领新星', range: 450, cooldown: 5 }, ...skills] };
          m.skillCooldowns = m.type.skills.map(() => 0);
        }
        this.boss = m;
        this.phase = 'boss';
      }
      this.#aggregateAttackDamage(m);
    }
    this.log.unshift({ t: this.elapsed, text: `${map.rooms.length} 个房间 · 寻找并击败地牢首领` });
    this.log.length = Math.min(this.log.length, 20);
  }
  step(dt) {
    if (this.phase === 'failed') return;
    if (this.hero.dead || this.character.dead) { this.syncHeroPools(); this.phase = 'failed'; this.failureReason = 'dead'; return; }
    const room = this.dungeon.tileOf(this.hero.x, this.hero.y), roomId = this.dungeon.roomTile(room.x, room.y);
    if (roomId >= 0) this.roomStates[roomId].visited = true;
    if (this.phase === 'cleared') {
      const step = Math.min(Math.max(0, dt), .05), c = this.character, h = this.hero;
      this.nextIn = Math.max(0, this.nextIn - step);
      // Recovery continues while collecting loot. Keep attacks, DOT and resource
      // healing stopped, but finish an in-flight stun and its layer recovery.
      const wasStunned = c.stunned > 0;
      c.stunned = Math.max(0, c.stunned - step);
      if (wasStunned && c.stunned === 0) this.host.world.consumeStatusKey(this.heroTargetId, statusKey('stun'), 1, true);
      this.stunCrust?.tick(step);
      h.stunned = c.stunned > 0;
      const length = Math.hypot(h.move.x, h.move.y), speed = h.speed * Math.max(.1, 1 + c.moveSpeed() / 100);
      if (length && !h.stunned) this.moveActor(h, h.x + h.move.x / length * speed * step, h.y + h.move.y / length * speed * step);
      return;
    }
    if (this.wave === 0) {
      this.wave = 1;
      this.#spawnEncounter(this.monsterCount);
    }
    super.step(Math.min(dt, this.timeRemaining));
    if (this.hero.dead) { this.phase = 'failed'; this.failureReason = 'dead'; return; }
    if (this.boss && this.boss.health <= 0) {
      // A kill delivered on the last allowed frame counts. Settle its normal reward now,
      // without advancing another combat frame past the deadline.
      this.phase = 'cleared';
      if (this.monsters.includes(this.boss)) super.tickMonsters(0);
      this.roomStates[this.boss.roomId].cleared = true;
      this.exitPortal = { id: `dungeon-exit-${this.dungeon.seed}-${this.floor}`, x: this.boss.x, y: this.boss.y, radius: 160 };
      this.rewards?.complete();
      this.log.unshift({ t: this.elapsed, text: `首领已击败 · 传送阵已开启` });
      return;
    }
    if (this.timeLimitEnabled && this.timeRemaining < 1e-8) {
      this.elapsed = this.timeLimitEndsAt;
      this.phase = 'failed'; this.failureReason = 'timeout';
      this.log.unshift({ t: this.elapsed, text: `${this.timeLimit} 秒未通关 · 挑战失败` });
      return;
    }
  }
}

export class TowerRun {
  constructor(files, options = {}) {
    this.files = files; this.options = options; this.seed = options.seed ?? Date.now(); this.floor = validateFloor(options.floor ?? 1);
    this.loadout = { skills: [] }; this.startFloor();
  }
  startFloor(pools = null, selected = 0) {
    const visit = (this.visits || 0) + 1;
    // Atlas travel creates a new TowerRun each time. Carry its persistent
    // admission count into rewards so restarting cannot reuse owned item IDs.
    const rewardVisit = (this.options.rewards?.visit ?? 1) + visit - 1;
    const battle = new DungeonBattle(this.files, { ...this.options, floor: this.floor, seed: (this.seed + Math.imul(this.floor, 0x9e3779b9)) >>> 0,
      rewards: this.options.rewards ? { ...this.options.rewards, visit: rewardVisit } : null });
    battle.setLoadout(this.loadout); battle.select(selected);
    if (pools) {
      const c = battle.character;
      c.life = Math.min(c.maxLife, pools.life); c.shield = Math.min(c.shieldCap, pools.shield); c.mana = Math.min(c.manaCap, pools.mana);
      battle.syncHeroPools();
    }
    this.battle = battle; this.visits = visit;
  }
  setLoadout(loadout) { this.loadout = loadout; this.battle.setLoadout(loadout); }
  setTimeLimitEnabled(enabled) { this.options.timeLimitEnabled = !!enabled; this.battle.setTimeLimitEnabled(enabled); }
  setMapEquipment(equipment) { this.battle.setMapEquipment(equipment); this.options.mapEquipment = structuredClone(equipment); }
  advance(floor = this.floor + 1) {
    if (this.battle.phase !== 'cleared' || this.battle.hero.dead) return false;
    validateFloor(floor);
    const c = this.battle.character, pools = { life: c.life, shield: c.shield, mana: c.mana }, selected = this.battle.selected;
    const previous = this.floor;
    this.floor = floor;
    try { this.startFloor(pools, selected); } catch (error) { this.floor = previous; throw error; }
    return true;
  }
  step(dt) { this.battle.step(dt); return false; } // Travel is an explicit world-map choice through the exit portal.
}
