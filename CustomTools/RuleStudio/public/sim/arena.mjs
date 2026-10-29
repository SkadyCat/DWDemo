// Port of the Beta playable slice: ADWBHero (Source/DungeonWorldBeta/Private/DWBGame.cpp) and
// UDWBMonsterSubsystem/UDWBMonsterProcessor (DWBMonsters.cpp). Units are UE centimeters; all
// combat goes through the rule host exactly like the game: casts in, damage rows out.
import { RuleHost, withHeld } from '../../engine/library.mjs';
import { statusKey, INDEX_NONE, EStatusEffect, ELEMENT_NAMES, EOp } from '../../engine/types.mjs';
import { newBuild } from '../../engine/reader.mjs';
import { Character, offenseSource } from '../../engine/character.mjs';
import { EStat } from '../../engine/stats.mjs';
import { monsterTraitSources, parseMonsterTraits, readMonsters } from '../../engine/monsters.mjs';
import { loadTraitTierCatalog } from '../../engine/trait-tiers.mjs';
import { readCollections } from '../../engine/collections.mjs';
import { resolvePawnEquipment, pawnEquipmentSources, monsterTowerEquipment, monsterEquipmentDefaults, PLAYER_FIXED_EQUIPMENT, MONSTER_RARITY_EQUIPMENT, monsterEquipmentRarity } from '../../engine/pawn-equipment.mjs';

export const ARENA_HALF_EXTENT = 5000;
export const COMBAT_HEIGHT = 60;
export const TOGGLES = ['multiple_projectiles', 'pierce', 'ricochet', 'brittle', 'shatter', 'cold_mastery'];
// Ailment toggles (keys 7-0): each adds its trait plus the damage that triggers it.
export const AILMENT_TOGGLES = [
  { id: 'freeze', traits: ['freeze'] },
  { id: 'ignite', traits: ['fire_damage', 'ignite'] },
  { id: 'shock', traits: ['lightning_damage', 'shock'] },
  { id: 'bleed', traits: ['physical_damage', 'bleed', 'hobble'] },
];
// Status colors for rendering, strongest first.
export const STATUS_COLORS = [['freeze', '#d8f6ff'], ['ignite', '#ff7a2e'], ['shock', '#ffe14d'], ['bleed', '#c4162c'], ['chill', '#5ab8f0'], ['slow', '#8f8fb8']];
const HERO_RULE_ID = 1;
const HERO_TEAM = 0;
export const HERO_TARGET_ID = 0x40000000;
export { HERO_RULE_ID };
const MONSTER_FACTION_ID = 2;
const MONSTER_TEAM = 1;
const CELL = 150;

// Deterministic replacement for FMath::FRandRange in the sandbox (seeded per arena).
function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return (lo, hi) => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return lo + (hi - lo) * (s / 4294967296); };
}

export class Arena {
  constructor(ruleFiles, { seed = 1, maxMonsters = 300, spawnRate = 25, god = false, allTraits = false, autoCast = false, monsterTypes = null, onDamageDealt = null } = {}) {
    this.host = new RuleHost();
    const loaded = this.host.loadRuleLibrary(ruleFiles);
    if (!loaded.ok) throw new Error(`Rule library failed: ${loaded.error}`);
    const tiers = loadTraitTierCatalog(ruleFiles, this.host.library);
    if (tiers.error) throw new Error(`Trait tiers failed: ${tiers.error}`);
    this.collections = readCollections(ruleFiles, this.host.library);
    this.monsterDefinitions = readMonsters(ruleFiles);
    this.random = makeRandom(seed);
    this.maxMonsters = maxMonsters;
    this.spawnRate = spawnRate;
    this.chillKey = statusKey('chill');
    this.statusKeys = STATUS_COLORS.map(([id, color]) => [statusKey(id), color]);
    this.elapsed = 0;
    this.kills = 0;
    this.spawned = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.onDamageDealt = onDamageDealt;
    this.spawnBudget = 0;
    this.nextMonsterId = 1;
    this.monsters = [];
    this.flashes = [];
    // Hero (ADWBHero)
    this.hero = {
      x: 0, y: 0, health: 400, maxHealth: 400, radius: 45, aim: { x: 1, y: 0 }, dead: false, god, autoCast, autoYaw: 0,
      casting: false, castClock: 0, casts: 0, skill: 'frost_lance',
      toggles: [...TOGGLES.map(id => ({ id, traits: [id], on: allTraits })), ...AILMENT_TOGGLES.map(t => ({ ...t, on: allTraits }))],
      baseCastsPerSecond: 3, castsPerSecond: 3, plan: INDEX_NONE, error: '', move: { x: 0, y: 0 }, speed: 620,
      pace: { move: 1, action: 1, frozen: false },
      equipment: resolvePawnEquipment(this.collections, PLAYER_FIXED_EQUIPMENT, 'player'),
    };
    this.hero.owner = this.host.registerOwner(HERO_RULE_ID, HERO_TEAM);
    this.heroTargetId = HERO_TARGET_ID;
    // Combat affix runtime (engine/combat): set by the loadout battle; null keeps the Beta slice unchanged.
    this.combat = null;
    // Statuses/timed traits on the hero live under its target id (its own defense sees them too).
    this.host.setOwnerStatusId(this.hero.owner, HERO_TARGET_ID);
    // Character sheet: life / shield / mana and every affix that works on them (engine/character.mjs).
    this.character = new Character({ seed });
    this.syncHeroPools();
    this.recompile();
    // Monster faction (UDWBMonsterSubsystem::EnsureSetup)
    const claw = this.host.compileNamedBuild('monster_claw');
    if (claw.plan === INDEX_NONE) throw new Error(`monster_claw: ${claw.error}`);
    this.clawPlan = claw.plan;
    this.monsterOwner = this.host.registerOwner(MONSTER_FACTION_ID, MONSTER_TEAM);
    this.monsterCasts = 0;
    this.monsterTypes = monsterTypes === null ? null : monsterTypes.filter(doc => doc.enabled && doc.weight > 0).map(doc => ({
      ...doc, skills: doc.skills.filter(s => s.enabled).map(skill => {
        const compiled = this.host.compileNamedBuild(skill.id);
        if (compiled.plan === INDEX_NONE) throw new Error(`${doc.name}: ${skill.id}: ${compiled.error}`);
        return { ...skill, plan: compiled.plan, name: this.host.library.buildDisplayName(skill.id) };
      }),
    }));
    this.report = this.host.getFrameReport();
  }

  recompile() {
    const hero = this.hero;
    const extra = [...new Set(hero.toggles.filter(t => t.on).flatMap(t => t.traits))].filter(id => this.host.library.trait(id));
    const equipped = pawnEquipmentSources(this.host.library, hero.equipment);
    const build = this.host.library.namedBuildSource(hero.skill, extra);
    const result = build.source ? this.host.compileSource(newBuild(build.source.activeId, withHeld(build.source.traits, equipped.sources))) : build;
    hero.error = result.error;
    if (result.plan === INDEX_NONE) return false;
    hero.plan = result.plan;
    this.character?.setSheet(equipped.sheetEntries);
    this.host.baseDefense.set(HERO_TARGET_ID, equipped.sources);
    this.host.bindDefense(HERO_TARGET_ID, equipped.sources);
    this.syncHeroPools?.();
    hero.castsPerSecond = hero.baseCastsPerSecond * Math.max(0.1, 1 + this.host.getPlanStat(hero.plan, 'cast.speed_percent') / 100);
    return true;
  }

  toggleTrait(index) {
    const toggle = this.hero.toggles[index];
    if (!toggle) return;
    toggle.on = !toggle.on;
    this.recompile();
  }

  // Host-side status effects (UDWRuleWorldSubsystem::GetStatusEffect): movement/action speed and control.
  statusPace(id) {
    if (this.host.getStatusEffect(id, EStatusEffect.Control).value > 0) return { move: 0, action: 0, frozen: true };
    const move = this.host.getStatusEffect(id, EStatusEffect.MoveSpeed).value;
    const action = this.host.getStatusEffect(id, EStatusEffect.ActionSpeed).value;
    return { move: Math.max(0.1, 1 + move / 100), action: Math.max(0.1, 1 + action / 100), frozen: false };
  }

  setAim(worldX, worldY) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    this.hero.aimPoint = { x: worldX, y: worldY, z: 0 };
    const dx = worldX - this.hero.x, dy = worldY - this.hero.y, length = Math.hypot(dx, dy);
    if (length > 1e-3) this.hero.aim = { x: dx / length, y: dy / length };
  }

  // Host geometry adapters. The arena keeps its original bounds; dungeons supply walls and paths.
  moveActor(actor, x, y) {
    actor.x = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, x));
    actor.y = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, y));
  }
  steerTarget(monster) {
    const hero = this.hero, distance = monster?.type?.followDistance || 0;
    if (!distance) return hero;
    const direction = Math.hypot(hero.move.x, hero.move.y) > 0 ? hero.move : hero.aim;
    const length = Math.hypot(direction.x, direction.y) || 1;
    return { x: hero.x - direction.x / length * distance, y: hero.y - direction.y / length * distance };
  }
  canMonsterAttack() { return true; }
  monsterSeekRange(monster) {
    const c = monster.equipmentCharacter;
    return Math.max(0, c?.stats.has('monster.seek_range') ? c.stat('monster.seek_range') : Infinity);
  }
  canMonsterPursue(monster) {
    const range = this.monsterSeekRange(monster);
    return range > 0 && Math.hypot(monster.x - this.hero.x, monster.y - this.hero.y) <= range * 100;
  }

  respawn() {
    Object.assign(this.hero, { dead: false, x: 0, y: 0 });
    this.host.forgetTarget(HERO_TARGET_ID);
    this.character.reset();
    this.syncHeroPools();
  }

  // Hero pools mirror the character (UI reads hero.health / shield / mana).
  syncHeroPools() {
    const c = this.character, hero = this.hero;
    if (hero.god && !c.dead) { c.life = c.maxLife; c.shield = Math.max(c.shield, c.maxShield); c.mana = c.manaCap; }
    Object.assign(hero, {
      health: c.life, maxHealth: c.maxLife, shield: c.shield, maxShield: c.maxShield, shieldCap: c.shieldCap,
      mana: c.mana, maxMana: c.maxMana, manaCap: c.manaCap, reservedMana: c.reservedMana, manaReservationPercent: c.manaReservationPercent,
      stunned: c.stunned > 0, recharging: c.recharging, dead: hero.dead || c.dead,
    });
  }

  // Triggered support skills (stitched traits cast from the hero) and triggered timed buffs.
  runCharacterTriggers(origin, aim) {
    const c = this.character;
    for (const request of c.pendingCasts.splice(0)) {
      if (this.combat) { this.combat.triggers.castFromCharacter(request); continue; }
      const active = request.sources.find(s => s.rules.some(rule => rule.event === 'cast'));
      if (!active) continue;
      const compiled = this.host.compileSource(newBuild(active.id, request.sources));
      if (compiled.plan !== INDEX_NONE) this.host.castBuild(compiled.plan, this.hero.owner, origin, aim, this.hero.power || 0);
    }
    for (const request of c.pendingGrants.splice(0)) this.host.grantSources(HERO_TARGET_ID, request.sources, request.duration, request.label);
  }

  tickHero(dt) {
    const hero = this.hero;
    const c = this.character;
    const combat = this.combat;
    if (hero.dead) return;
    const pace = this.statusPace(HERO_TARGET_ID);
    hero.pace = pace;
    const length = Math.hypot(hero.move.x, hero.move.y);
    const stunned = c.stunned > 0 || pace.frozen;
    c.tick(dt, { moving: length > 0 && !stunned });
    if (length > 0 && !stunned) {
      const speed = hero.speed * pace.move * Math.max(0.1, 1 + c.moveSpeed() / 100);
      this.moveActor(hero, hero.x + hero.move.x / length * speed * dt, hero.y + hero.move.y / length * speed * dt);
    }
    if (hero.autoCast) {
      hero.autoYaw += 140 * dt;
      hero.aim = { x: Math.cos(hero.autoYaw * Math.PI / 180), y: Math.sin(hero.autoYaw * Math.PI / 180) };
    } else if (hero.aimPoint) {
      this.setAim(hero.aimPoint.x, hero.aimPoint.y);
    }
    const targetPoint = !hero.autoCast ? hero.aimPoint : null;
    const muzzle = targetPoint ? Math.min(60, Math.hypot(targetPoint.x - hero.x, targetPoint.y - hero.y)) : 60;
    const origin = { x: hero.x + hero.aim.x * muzzle, y: hero.y + hero.aim.y * muzzle, z: COMBAT_HEIGHT };
    const aim = { x: hero.aim.x, y: hero.aim.y, z: 0 };
    this.host.updateOwner(hero.owner, origin, aim);
    this.runCharacterTriggers(origin, aim);
    if (hero.plan === INDEX_NONE) { hero.castClock = 0; return; }
    const kind = combat ? combat.skillKind() : 'spell';
    const bonus = c.actionSpeed(kind) + (combat ? combat.castSpeed() : 0);
    const interval = 1 / Math.max(0.1, hero.castsPerSecond * pace.action * Math.max(0.1, 1 + bonus / 100));
    hero.castClock += dt;
    if (['aura', 'trigger'].includes(combat?.skillKind(hero.plan)) || !(hero.casting || hero.autoCast) || stunned) { hero.castClock = Math.min(hero.castClock, interval); return; }
    let budget = 4;
    while (hero.castClock >= interval && budget-- > 0) {
      if (combat && !combat.canCast()) { hero.castClock = Math.min(hero.castClock, interval); break; }
      hero.castClock -= interval;
      // Cost (mana / shield / life shares, "消耗…" affixes); conditional offense rides along as a synthetic trait.
      // God mode pays nothing but still consumes "下一次技能…" effects.
      let pay = c.beforeCast(hero.god ? 0 : c.base.castCost, { kind, costScale: combat ? combat.costScale() : 1 });
      if (!pay.ok && hero.god) pay = { ok: true };
      if (!pay.ok) { hero.castClock = Math.min(hero.castClock, interval); hero.noResource = pay.reason === 'cost'; break; }
      hero.noResource = false;
      // 召唤物不继承角色的伤害词条：召唤技能的施放不带角色进攻特性。
      const summonSkill = combat && combat.skillFamily().summon;
      const extraFor = plan => {
        const out = [];
        const source = summonSkill ? null : offenseSource(c.offense(pay), plan.stats);
        if (source) out.push(source);
        const shape = combat ? combat.planSource(plan, { minion: !!summonSkill, projectileOnly: !!summonSkill }) : null;
        if (shape) out.push(shape);
        return out;
      };
      const root = this.host.castBuild(hero.plan, hero.owner, origin, aim, hero.power || 0, extraFor, targetPoint);
      if (root !== INDEX_NONE) { ++hero.casts; combat?.onHeroCast(root, pay); }
    }
    this.runCharacterTriggers(origin, aim);
  }

  spawnMonsters(count, { type: forcedType = null, position = null, duration = null, invulnerable = false, temporary = false } = {}) {
    if (!forcedType && this.monsterTypes && !this.monsterTypes.length) return;
    const health = Math.min(400, 45 + this.elapsed * 1.5);
    for (let i = 0; i < count; ++i) {
      const angle = this.random(0, 2 * Math.PI), distance = this.random(1600, 2600);
      const id = this.nextMonsterId++;
      let type = forcedType;
      if (!type && this.monsterTypes) {
        let pick = this.random(0, this.monsterTypes.reduce((sum, doc) => sum + doc.weight, 0));
        type = this.monsterTypes.find(doc => (pick -= doc.weight) < 0) || this.monsterTypes[0];
      }
      const maxHealth = type?.health ?? health;
      // With combat affixes every monster owns its attacks (counters / 正在攻击你的敌人 need the attacker).
      const owner = type || this.combat ? this.host.registerOwner(0x20000000 + id, MONSTER_TEAM) : this.monsterOwner;
      if (type || this.combat) this.host.setOwnerStatusId(owner, id);
      this.monsters.push({
        id, x: Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, this.hero.x + Math.cos(angle) * distance)),
        y: Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, this.hero.y + Math.sin(angle) * distance)),
        radius: 45 * (type?.scale ?? 1), health: maxHealth, maxHealth, speed: type?.speed ?? this.random(260, 380), cooldown: this.random(0.2, 1.0),
        attackRange: type?.stopDistance ?? 130, attackInterval: 1.2, hitFlash: 0, lastHealth: maxHealth, facing: { x: 1, y: 0 }, chill: 0, frozen: false, statusColor: null,
        type, owner, name: type?.name || '', color: type?.color || '#7a2018', skillCooldowns: type?.skills.map(() => 0) || [], casts: 0, lastSkill: '', lastCastAt: -Infinity,
      });
      const monster = this.monsters[this.monsters.length - 1];
      if (temporary) Object.assign(monster, { temporary: true, expiresAt: this.elapsed + duration, invulnerable });
      if (position) { monster.x = this.hero.x; monster.y = this.hero.y; this.moveActor(monster, position.x, position.y); }
      monster.equipment = resolvePawnEquipment(this.collections, type?.equipment ?? monsterEquipmentDefaults(), 'monster');
      this.onMonsterCreated?.(monster);
      this.combat?.onSpawn(monster);
      monster.rarity = monster.rarity || monsterEquipmentRarity(monster.equipment.rarity);
      if (!monster.equipment.rarity) monster.equipment.rarity = resolvePawnEquipment(this.collections, { rarity: MONSTER_RARITY_EQUIPMENT[monster.rarity] }, 'monster').rarity;
      monster.baseMaxHealth = monster.maxHealth; monster.baseMaxShield = monster.maxShield || 0;
      if (monster.equipment.tower) monster.equipment.tower = monsterTowerEquipment(this.collections, this.floor ?? 1, monster.equipment.tower);
      this.host.forgetTarget(id);
      this.setMonsterTraits(monster, type?.traits || []);
      ++this.spawned;
    }
  }

  /** Rebuild from the unmodified spawn attributes; repeated updates never compound the same affix. */
  setMonsterTraits(monster, entries) {
    const parsed = parseMonsterTraits(entries);
    const resolved = parsed.error ? { error: parsed.error } : monsterTraitSources(this.host.library, parsed.entries);
    if (resolved.error) throw new Error(resolved.error);
    const previous = monster.traits;
    monster.traits = parsed.entries;
    try { this.refreshMonsterEquipment(monster); }
    catch (error) { monster.traits = previous; throw error; }
  }

  setMonsterEquipment(monster, slot, item) {
    const next = resolvePawnEquipment(this.collections, { ...monster.equipment, [slot]: item }, 'monster');
    const previous = monster.equipment;
    monster.equipment = next;
    try { this.refreshMonsterEquipment(monster); }
    catch (error) { monster.equipment = previous; throw error; }
    if (slot === 'rarity') monster.rarity = monsterEquipmentRarity(monster.equipment.rarity);
  }

  /** Equipment and innate traits share the ordinary collection/plan pipeline. No floor bonus here. */
  refreshMonsterEquipment(monster) {
    const innate = monsterTraitSources(this.host.library, monster.traits || []);
    if (innate.error) throw new Error(innate.error);
    const equipped = pawnEquipmentSources(this.host.library, monster.equipment);
    const inherited = this.monsterInheritedSources?.(monster) || [];
    // Independent stat-only sources may share a library id across innate traits, gear and summoner inheritance.
    const used = new Set();
    const sources = [...innate.sources, ...equipped.sources, ...inherited].map(source => {
      let id = source.id, n = 2;
      if (!source.rules.length && !source.stitched?.length) while (used.has(id.toLowerCase())) id = `${source.id}~${n++}`;
      used.add(id.toLowerCase());
      return id === source.id ? source : { ...source, id };
    });
    const compiled = sources.length ? this.host.compileSource(newBuild(sources[0].id, sources)) : { plan: INDEX_NONE };
    if (compiled.error) throw new Error(compiled.error);
    const lifeRatio = monster.maxHealth > 0 ? monster.health / monster.maxHealth : 1;
    const shieldRatio = monster.maxShield > 0 ? monster.shield / monster.maxShield : 1;
    monster.traitSources = sources; monster.traitPlan = compiled.plan;
    monster.equipmentSources = equipped.sources; monster.equipmentContributions = equipped.contributions;
    const base = monster.baseMaxHealth ?? monster.maxHealth;
    const character = new Character({ base: { life: base, mana: 0, lifeRegen: 0 }, seed: monster.id });
    character.setSheet([...innate.sources.map(source => ({ source })), ...equipped.sheetEntries, ...inherited.map(source => ({ source }))]);
    monster.maxHealth = sources.length ? this.host.plan(compiled.plan).stats.from(EStat.OwnerMaxLife, character.maxLife) : character.maxLife;
    monster.health = monster.lastHealth = monster.maxHealth * lifeRatio;
    const lifeScale = monster.maxHealth / character.maxLife;
    monster.maxShield = ((monster.baseMaxShield || 0) * character.maxLife / base + character.maxShield) * lifeScale;
    monster.shield = monster.maxShield * shieldRatio;
    character.maxLife = monster.maxHealth; character.maxShield = monster.maxShield;
    character.shieldCap = monster.maxShield * (1 + Math.max(0, character.stat('shield.overflow_percent')) / 100);
    monster.equipmentCharacter = character;
    if (sources.length) this.host.baseDefense.set(monster.id, sources); else this.host.baseDefense.delete(monster.id);
    this.host.appliedDefense.delete(monster.id);
    this.host.bindDefense(monster.id, sources);
  }

  tickSpawner(dt) {
    if (this.monsterTypes && !this.monsterTypes.length) { this.spawnBudget = 0; return; }
    const target = Math.min(this.maxMonsters, 40 + Math.trunc(this.elapsed * 3));
    if (this.monsters.length >= target) { this.spawnBudget = 0; return; }
    this.spawnBudget += dt * this.spawnRate;
    const count = Math.min(Math.floor(this.spawnBudget), target - this.monsters.length);
    if (count > 0) { this.spawnBudget -= count; this.spawnMonsters(count); }
  }

  // UDWBMonsterProcessor::Execute: separation grid, steer, attack (claw cast), die.
  tickMonsters(dt) {
    const hero = this.hero;
    const heroAlive = !hero.dead;
    const grid = new Map();
    this.monsters.forEach((m, index) => {
      const key = `${Math.floor(m.x / CELL)},${Math.floor(m.y / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(index);
    });
    const attacks = [];
    const alive = [];
    for (let slot = 0; slot < this.monsters.length; ++slot) {
      const m = this.monsters[slot];
      if (m.temporary && this.elapsed + 1e-7 >= m.expiresAt) { this.host.forgetTarget(m.id); continue; }
      if (m.health <= 0) { this.host.forgetTarget(m.id); ++this.kills; continue; }
      alive.push(m);
      if (m.health < m.lastHealth) m.hitFlash = 0.08;
      m.lastHealth = m.health;
      m.hitFlash = Math.max(0, m.hitFlash - dt);
      m.chill = this.host.world.getStatus(m.id, this.chillKey);
      const sheet = m.equipmentCharacter;
      if (sheet) { sheet.life = m.health; sheet.shield = m.shield || 0; }
      const status = this.statusPace(m.id);
      const pace = Math.min(1, status.move) * (this.combat ? this.combat.monsterPace(m) : 1) * Math.max(.1, 1 + (sheet?.moveSpeed() || 0) / 100);
      m.frozen = status.frozen;
      m.statusColor = null;
      for (const [key, color] of this.statusKeys) if (this.host.world.getStatus(m.id, key) > 0) { m.statusColor = color; break; }
      const minion = this.combat ? this.combat.minions.engage(m) : null;
      const engaged = minion ? { x: minion.summon.x * 100, y: minion.summon.y * 100 } : null;
      const following = m.type?.followDistance > 0;
      const pursuing = this.canMonsterPursue(m, engaged);
      const distance = engaged ? Math.hypot(engaged.x - m.x, engaged.y - m.y) : Math.hypot(hero.x - m.x, hero.y - m.y), steering = pursuing ? ((!following && engaged) || this.steerTarget(m)) : m;
      const tx = steering.x - m.x, ty = steering.y - m.y, headingLength = Math.hypot(tx, ty);
      const canAttack = pursuing && this.canMonsterAttack(m);
      const fx = following ? hero.x - m.x : tx, fy = following ? hero.y - m.y : ty, facingLength = Math.hypot(fx, fy);
      if (!m.frozen) m.facing = facingLength > 1 ? { x: fx / facingLength, y: fy / facingLength } : { x: 1, y: 0 };
      let px = 0, py = 0, checked = 0;
      const cx = Math.floor(m.x / CELL), cy = Math.floor(m.y / CELL);
      for (let oy = -1; oy <= 1 && checked < 12; ++oy) for (let ox = -1; ox <= 1 && checked < 12; ++ox) {
        for (const other of grid.get(`${cx + ox},${cy + oy}`) || []) {
          if (other === slot || checked >= 12) continue;
          const o = this.monsters[other], ax = m.x - o.x, ay = m.y - o.y, d2 = ax * ax + ay * ay;
          const separation = m.radius + o.radius + 5;
          if (d2 < separation * separation && d2 > 1) { const d = Math.sqrt(d2); px += ax / d * (1 - d / separation); py += ay / d * (1 - d / separation); ++checked; }
        }
      }
      if (m.frozen || !pursuing) {
        // Frozen: no steering, no attack countdown.
      } else if (heroAlive && following) {
        // Follow a point behind the hero while the skill still aims at the hero.
        const speed = Math.min(m.speed * pace, Math.max(0, headingLength - m.attackRange) / Math.max(dt, 1e-6));
        this.moveActor(m, m.x + ((headingLength ? tx / headingLength : 0) * speed + px * 120 * pace) * dt,
          m.y + ((headingLength ? ty / headingLength : 0) * speed + py * 120 * pace) * dt);
      } else if (heroAlive && (distance > m.attackRange || !canAttack)) {
        this.moveActor(m, m.x + (m.facing.x * m.speed + px * 220) * pace * dt, m.y + (m.facing.y * m.speed + py * 220) * pace * dt);
      } else {
        this.moveActor(m, m.x + px * 120 * dt, m.y + py * 120 * dt);
        if (!m.type) {
          m.cooldown -= dt * Math.min(1, status.action);
          if (heroAlive && canAttack && m.cooldown <= 0) {
            m.cooldown = m.attackInterval;
            attacks.push({ at: { x: m.x + m.facing.x * 60, y: m.y + m.facing.y * 60, z: COMBAT_HEIGHT }, plan: this.clawPlan, owner: m.owner, power: 0, monster: m });
          }
        }
      }
      if (m.type && !m.frozen) {
        const actionDt = dt * Math.min(1, status.action);
        m.cooldown -= actionDt;
        m.skillCooldowns = m.skillCooldowns.map(value => Math.max(0, value - actionDt));
        // Range is measured in centimeters from monster center to hero center.
        const range = Math.hypot(hero.x - m.x, hero.y - m.y);
        const index = m.type.skills.findIndex((skill, i) => m.skillCooldowns[i] <= 0 && range <= skill.range);
        if (heroAlive && canAttack && m.cooldown <= 0 && index >= 0) {
          const skill = m.type.skills[index];
          m.skillCooldowns[index] = skill.cooldown;
          m.cooldown = 0.35;
          m.lastSkill = skill.name; m.lastCastAt = this.elapsed; m.casts++; this.monsterCasts++;
          attacks.push({ at: { x: m.x + m.facing.x * 60, y: m.y + m.facing.y * 60, z: COMBAT_HEIGHT }, plan: skill.plan, owner: m.owner, power: skill.power, monster: m });
          this.onMonsterCast?.(m, skill);
        }
      }
      m.x = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, m.x));
      m.y = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, m.y));
    }
    this.monsters = alive;
    for (const { at, plan, owner, power, monster } of attacks) {
      const dx = hero.x - at.x, dy = hero.y - at.y, length = Math.hypot(dx, dy) || 1;
      const aim = { x: dx / length, y: dy / length, z: 0 };
      this.host.updateOwner(owner, at, aim);
      this.host.castBuild(plan, owner, at, aim, power, compiled => this.monsterCastSources(monster, compiled, plan), { x: hero.x, y: hero.y, z: 0 });
    }
  }

  monsterCastSources(monster, plan, basePlan) {
    const sources = monster.traitSources || [];
    const character = monster.equipmentCharacter;
    if (!character) return sources;
    character.life = monster.health; character.shield = monster.shield || 0;
    // Active melee skills author their own primary hit events; secondary hits must not retrigger flats.
    const hitEvents = new Set(['hit']);
    const build = this.host.planSources.get(basePlan);
    const active = build?.traits.find(trait => trait.id === build.activeId);
    const inspect = actions => { for (const action of actions) {
      if ([EOp.DamageArea, EOp.DamageTarget].includes(action.op) && action.emitEvent) hitEvents.add(action.emitEvent);
      if (action.then) inspect(action.then);
    } };
    for (const rule of active?.rules || []) if (rule.event === 'cast') inspect(rule.actions);
    const stats = basePlan >= 0 ? this.host.plan(this.host.planWithSources(basePlan, sources)).stats : plan.stats;
    const offense = offenseSource(character.offense(), stats, [...hitEvents]);
    return offense ? [...sources, offense] : sources;
  }

  // One game frame: hero tick, Mass monster processor, rule world step (UDWRuleWorldSubsystem::StepFrame), commit.
  step(dt) {
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.tickSpawner(dt);
    this.tickHero(dt);
    this.tickMonsters(dt);
    this.host.beginTargets();
    for (const m of this.monsters) this.host.addTarget({ x: m.x, y: m.y, z: COMBAT_HEIGHT }, m.radius, m.health + (m.shield || 0), MONSTER_TEAM, m.id, m.resistance || null);
    // The world sees life + shield as the hero's health; the character decides how it is split.
    if (!this.hero.dead) this.host.addTarget({ x: this.hero.x, y: this.hero.y, z: COMBAT_HEIGHT }, this.hero.radius, this.character.life + this.character.shield, HERO_TEAM, HERO_TARGET_ID);
    const combat = this.combat;
    if (combat) { combat.minions.addTargets(this.host); combat.beforeStep(dt); }
    const rows = this.host.stepFrame(dt);
    combat?.grounds.onProjectilesMoved();
    const byId = new Map(this.monsters.map(m => [m.id, m]));
    // Display one total per target for this frame; damage rows still settle individually.
    const damageFlashes = new Map();
    for (const row of rows) {
      const monster = byId.get(row.TargetExternalId);
      const dot = !!row.bDot;
      if (monster) {
        if (combat) combat.damageMonster(monster, row); else monster.health = Math.max(0, monster.health - row.Amount);
        this.damageDealt += row.Amount;
        if (row.OwnerExternalId === HERO_RULE_ID) this.onDamageDealt?.(row);
        if (row.Amount > 0) {
          const flash = damageFlashes.get(monster.id);
          if (flash) {
            flash.amount += row.Amount;
            flash.critical ||= row.bCritical;
          } else if (this.flashes.length < 400) {
            const total = { targetId: monster.id, x: monster.x, y: monster.y, amount: row.Amount, critical: row.bCritical, age: 0 };
            damageFlashes.set(monster.id, total);
            this.flashes.push(total);
          }
        }
        if (combat) combat.onRow(row);
        else if (row.OwnerExternalId === HERO_RULE_ID) this.character.onDealt({ amount: row.Amount, element: ELEMENT_NAMES[row.Element], critical: row.bCritical, killed: row.bKilled, dot });
      } else if (row.TargetExternalId === HERO_TARGET_ID) {
        this.damageTaken += row.Amount;
        if (!this.hero.god) { if (combat) combat.heroRow(row); else this.character.takeHit({ amount: row.Amount, element: ELEMENT_NAMES[row.Element], dot }); }
      } else if (combat) combat.minionRow(row);
    }
    this.scaleHeroAilments();
    if (this.character.dead) this.hero.dead = true;
    this.syncHeroPools();
    this.host.drainDamage();
    for (const flash of this.flashes) flash.age += dt;
    this.flashes = this.flashes.filter(flash => flash.age < (this.flashLife || 0.6));
    this.report = this.host.getFrameReport();
    // Frames shorter than the fixed step run no substep; keep the last one that simulated.
    if (this.report.Substeps > 0 || !this.activeReport) this.activeReport = this.report;
  }

  /** 异常门槛: ailments newly landed on the hero are weakened by max life / ailment threshold. */
  scaleHeroAilments() {
    const scale = this.character.ailmentScale;
    if (!this.ailmentSeen) this.ailmentSeen = new Map();
    if (!this.ailmentKeys) this.ailmentKeys = new Set([...this.host.library.statuses.values()].filter(s => s.category === 'ailment').map(s => s.def.key));
    for (const status of this.host.world.statuses.values()) {
      if (status.targetId !== HERO_TARGET_ID || !this.ailmentKeys.has(status.key)) continue;
      const stamp = `${status.expire}|${status.stacks}`;
      if (this.ailmentSeen.get(status.key) === stamp) continue;
      this.ailmentSeen.set(status.key, stamp);
      if (scale < 1) status.value *= scale;
    }
  }

  /** Summon positions in cm for rendering (world runs in meters). */
  summons() {
    const world = this.host.world;
    return world.summons.map(s => ({
      id: s.id, kind: s.kindName, x: s.x * 100, y: s.y * 100, dx: s.dx, dy: s.dy,
      remaining: Math.max(0, s.expire - world.clock),
      shotAge: world.clock - (s.nextFire - s.interval),
      hostile: world.owners[world.roots[s.root].owner].team !== HERO_TEAM,
    }));
  }

  /** Projectile positions in cm for rendering (world runs in meters). */
  projectiles() {
    const c = this.host.world.carriers;
    const plan = this.host.world.plans;
    const out = [];
    for (let i = 0; i < c.num; ++i) {
      if (c.flags[i] & 1) continue;
      const root = this.host.world.roots[c.root[i]];
      const state = this.combat?.projectiles.state.get(c.id[i]);
      out.push({ id: c.id[i], x: c.px[i] * 100, y: c.py[i] * 100, z: c.pz[i] * 100, vx: c.vx[i], vy: c.vy[i], vz: c.vz[i], age: c.age[i], lifetime: c.life[i], radius: c.radius[i] * 100, kind: plan[root.plan].kindNames.names[c.kind[i]] || '', element: c.element[i], groundTint: state?.groundTint ?? null, ordinal: state?.index ?? c.id[i] - 1, visualSeed: state?.visualSeed ?? c.id[i], hostile: this.host.world.owners[c.owner[i]].team !== HERO_TEAM });
    }
    return out;
  }
}
