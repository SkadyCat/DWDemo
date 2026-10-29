// 战斗词条运行时 (web-only). Implements the combat affix table (docs/combat-affix-table.md) on top of the
// rule world through its web-only hooks: damage resolution, statuses, projectiles, areas and summons.
// The arena / battle owns one instance (arena.combat). Sub-systems: ailments, zones, projectiles,
// minions, triggers (engine/combat/*.mjs). All randomness is seeded; positions are world meters.
import { ELEMENT_NAMES, INDEX_NONE, Tags, tagBit, EBuiltinEvent } from '../types.mjs';
import { newBuild, readTraitText } from '../reader.mjs';
import { E, ELEMENTAL, KEYS, POWER, MINION_BASE } from './common.mjs';
import { Ailments } from './ailments.mjs';
import { Zones } from './zones.mjs';
import { ProjectileAffixes } from './projectiles.mjs';
import { Minions } from './minions.mjs';
import { Triggers } from './triggers.mjs';
import { GroundFields } from './ground-fields.mjs';
import { monsterEquipmentRarity } from '../pawn-equipment.mjs';
import { applyDeliveryDamage } from './damage-values.mjs';
import { computeSheet } from '../character.mjs';
import { skillType } from '../skill-types.mjs';
import { HostileSpawns } from './hostile-spawns.mjs';
import { ProjectileCapture } from './projectile-capture.mjs';
import { RetaliationPulses } from './retaliation-pulses.mjs';

export { E, KEYS, POWER, MINION_BASE };
const TAG_PROJECTILE = tagBit(Tags.Projectile);
const TAG_AREA = tagBit(Tags.Area);
const TAG_CRITICAL = tagBit(Tags.Critical);

function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}

const newMod = () => ({ miss: false, flat: 0, increased: 0, more: 1, crit: 0, critScale: 1, critMulti: 0, pen: 0, taken: 1, adjust: null });

export class CombatRuntime {
  constructor(arena, { seed = 7 } = {}) {
    this.arena = arena;
    this.host = arena.host;
    this.world = arena.host.world;
    this.rand = makeRandom(seed);
    this.time = 0;
    this.roots = new Map();
    this.byId = new Map();
    this.marked = { id: 0, until: 0 };
    this.attackers = new Map();
    this.cooldowns = new Map();
    this.planSheets = new Map();
    this.strikeBudget = 400;
    this.seed = 1;
    this.lastCrit = new Map();
    this.log = [];
    const { trait } = readTraitText('{"id":"__combat","name":"战斗词条"}');
    this.neutralPlan = this.host.compileSource(newBuild('__combat', [trait])).plan;
    this.ailments = new Ailments(this);
    this.zones = new Zones(this);
    this.projectiles = new ProjectileAffixes(this);
    this.minions = new Minions(this);
    this.triggers = new Triggers(this);
    this.grounds = new GroundFields(this);
    this.retaliation = new RetaliationPulses(this);
  }

  get c() { return this.arena.character; }
  get hero() { return this.arena.hero; }
  s(path) { return this.c.stat(path); }
  t(name) { return this.c.triggersNamed(name); }
  has(name) { return this.c.triggers.some(t => t.name === name); }
  chance(percent) { return percent > 0 && (percent >= 100 || this.rand() * 100 < percent); }
  get power() { return this.hero.power || POWER; }
  get cooldown() { return Math.max(0, (this.cooldowns.get(this.hero.skill || this.hero.plan) || 0) - this.time); }
  set cooldown(value) { this.cooldowns.set(this.hero.skill || this.hero.plan, this.time + Math.max(0, value)); }
  planSheet(planIndex) {
    if (!this.planSheets.has(planIndex)) this.planSheets.set(planIndex, computeSheet((this.host.planSources.get(planIndex)?.traits || []).map(source => ({ source }))));
    return this.planSheets.get(planIndex);
  }
  planSheetStat(planIndex, name) { return this.planSheet(planIndex).stats.get(name) || 0; }
  note(text) { this.log.unshift({ t: this.arena.elapsed, text }); if (this.log.length > 30) this.log.length = 30; }

  /** Hooks into the rule world; enemy homing reads its own skill/equipment plan. */
  install() {
    const w = this.world;
    this.hostileSpawns = new HostileSpawns(this);
    this.captures = new ProjectileCapture(this);
    w.spawnMonsterHook = request => this.hostileSpawns.spawn(request);
    w.interceptHook = (index, target, contact) => this.captures.intercept(index, target, contact);
    w.invulnerableHook = id => !!this.monster(id)?.invulnerable;
    w.damageHook = (root, target, amount, element, info) => this.damageMod(root, target, amount, element, info);
    w.statusHook = (targetId, key, value, duration, owner) => this.ailments.onStatus(targetId, key, value, duration, owner);
    w.statusConsumedHook = request => this.ailments.onStatusConsumed(request);
    w.emitterPulseHook = (index, source) => {
      const previous = this.rootInfo(source);
      this.register(index, { kind: 'cast', manual: false, emitter: true,
        more: previous?.more ?? 1, increased: previous?.increased ?? 0, critBonus: previous?.critBonus ?? 0,
        triggered: !!previous?.triggered, ...(previous?.minion ? { minion: previous.minion } : {}) });
    };
    w.repeatSkillHook = (index, source) => {
      const previous = this.rootInfo(source);
      this.register(index, { kind: 'cast', repeated: true, manual: false,
        more: previous?.more ?? 1, increased: previous?.increased ?? 0, critBonus: previous?.critBonus ?? 0 });
      this.projectiles.onCast(index, w.roots[index].plan);
    };
    w.areaHook = request => this.zones.onArea(request);
    w.spawnHook = (index, rootIndex, data) => this.projectiles.onSpawn(index, rootIndex, data);
    w.motionHook = (index, dt) => this.projectiles.onMotion(index, dt);
    w.contactHook = (index, target, result) => this.projectiles.onContact(index, target, result);
    w.wallHook = index => this.projectiles.onWall(index);
    w.endHook = (index, reason) => this.projectiles.onEnd(index, reason);
    w.ricochetHook = (index, event, radius) => this.projectiles.onRicochet(index, event, radius);
    w.redirectHook = (index, mode) => this.projectiles.onRedirect(index, mode);
    w.summonCapHook = (cap, kind, context) => this.minions.capFor(cap, kind, context);
    w.summonHook = (summon, context, replaced) => this.minions.onSummon(summon, context, replaced);
    w.summonTargetHook = (summon, nearest) => this.minions.target(summon, nearest);
    w.summonEndHook = summon => this.minions.onEnd(summon);
    w.sacrificeHook = request => this.minions.sacrifice(request);
    return this;
  }

  // ---------------------------------------------------------------- roots and positions
  /** Per-root info (cast kind, triggered, minion, bonuses). Root indices are recycled: validated by object identity. */
  rootInfo(rootIndex, create = false) {
    const root = this.world.roots[rootIndex];
    if (!root || !root.active) return null;
    let info = this.roots.get(rootIndex);
    if (info && info.root !== root) { this.roots.delete(rootIndex); info = null; }
    if (!info && create) { info = { root, kind: 'cast', more: 1, increased: 0, critBonus: 0, depth: 0, hits: new Map(), victims: new Set() }; this.roots.set(rootIndex, info); }
    return info;
  }
  register(rootIndex, data) {
    const info = this.rootInfo(rootIndex, true);
    if (info) Object.assign(info, data);
    return info;
  }

  heroPlan() { return this.hero.plan >= 0 ? this.hero.plan : this.neutralPlan; }
  isHeroRoot(root) { return root && root.owner === this.hero.owner; }
  monster(id) { return this.byId.get(id) || null; }
  heroPos() { return { x: this.hero.x / 100, y: this.hero.y / 100 }; }
  targetPos(id) {
    const m = this.monster(id);
    if (m) return { x: m.x / 100, y: m.y / 100 };
    const index = this.world.targetIndexOf(id);
    return index >= 0 ? { x: this.world.targets.px[index], y: this.world.targets.py[index] } : null;
  }
  /** Live hostile monsters (to the hero) within radius meters of a point, nearest first. */
  enemiesNear(x, y, radius, exclude = null) {
    const out = [];
    for (const m of this.arena.monsters) {
      if (!(m.health > 0) || (exclude && exclude.has(m.id))) continue;
      const d = Math.hypot(m.x / 100 - x, m.y / 100 - y);
      if (d <= radius + m.radius / 100) out.push({ m, d });
    }
    out.sort((a, b) => a.d - b.d || a.m.id - b.m.id);
    return out.map(e => e.m);
  }
  lifeFraction(m) { return m ? m.health / Math.max(1, m.maxHealth) : 1; }
  isElite(m) { return !!m?.elite; }
  status(id, name) { return this.world.getStatus(id, KEYS[name]); }
  hasAilment(id) { return ['poison', 'shock', 'chill', 'freeze', 'ignite', 'erosion', 'bleed'].some(k => this.status(id, k) > 0) || this.ailments.layers(id, 'poison') > 0; }
  /** status param of 优先…带有指定异常状态: 0 any, 1 poison, 2 shock, 3 chill, 4 ignite, 5 erosion. */
  hasStatusChoice(id, choice) {
    if (!choice) return this.hasAilment(id);
    const name = ['', 'poison', 'shock', 'chill', 'ignite', 'erosion'][choice];
    return name === 'poison' || name === 'erosion' ? this.ailments.layers(id, name) > 0 : this.status(id, name) > 0;
  }

  tagMask(plan, names) {
    let mask = 0n;
    for (const name of names) { const i = plan.tagNames.find(name); if (i >= 0) mask |= tagBit(i); }
    return mask;
  }
  hasTag(plan, tags, name) { const i = plan.tagNames.find(name); return i >= 0 && (tags & tagBit(i)) !== 0n; }

  /** Radius multiplier of an area from "面积" stats: area +100% → radius × √2. */
  areaScale({ element = -1, triggered = false, minion = false, primary = false } = {}) {
    let area = this.s('area.size');
    if (element === E.frost) area += this.s('frost.area');
    if (element === E.fire) area += this.s('fire.area');
    if (element === E.void) area += this.s('void.area');
    if (triggered) area += this.s('trigger.area');
    if (minion) area += this.s('minion.area');
    let scale = Math.max(0, 1 + area / 100) * this.s('area.size_more');
    if (primary && this.s('area.focus')) scale *= 0.5;
    if (primary && this.s('area.widen')) scale *= 1.6;
    return Math.sqrt(Math.max(0.01, scale));
  }

  // ---------------------------------------------------------------- host hits
  /** Expose real host events to ordinary rules. No listeners means no new root. */
  emitRuleEvent(name, { id, layers = 1, x, y } = {}) {
    const w = this.world, planIndex = this.heroPlan(), plan = w.plans[planIndex];
    const event = plan?.findEvent(name);
    if (event === undefined || event < 0 || !plan.rules.some(rule => rule.event === event)) return;
    const index = this.openRoot(planIndex, { kind: 'event' });
    if (index === INDEX_NONE) return;
    const root = w.roots[index], owner = w.owners[root.owner], target = id === undefined ? INDEX_NONE : w.targetIndexOf(id);
    w.pushEvent({ type: event, root: index, sequence: root.nextSequence++, generation: 0, lineage: 0,
      targetIndex: target, targetId: target >= 0 ? id : 0xffffffff, sourceIndex: INDEX_NONE, sourceId: 0xffffffff,
      px: x ?? owner.px, py: y ?? owner.py, pz: owner.pz, dx: owner.aim[0], dy: owner.aim[1], dz: owner.aim[2],
      amount: layers, damage: 0, stored: 0, tags: 0n });
    w.releaseHeldRoot(index);
  }

  /** Opens a held root for host-made damage (zones, explosions, counters). */
  openRoot(plan = this.heroPlan(), data = {}) {
    const index = this.world.openRoot(plan, this.hero.owner, (this.seed = (this.seed * 48271) % 2147483647));
    if (index !== INDEX_NONE) this.register(index, { kind: 'derived', ...data });
    return index;
  }
  /**
   * Area strike at (x, y): every hostile target within radius. opts: element, amount, tags (names),
   * silent, depth, effect (trace name), exclude (Set of ids), only (id), plan, info.
   */
  strike(x, y, radius, amount, element, opts = {}) {
    if (!(amount > 0) || !(radius > 0)) return [];
    // Hard limits against cascades (explosion → kill → explosion …): depth and a per-frame budget.
    if ((opts.depth ?? 1) > 4 || this.strikeBudget <= 0) return [];
    --this.strikeBudget;
    const plan = opts.plan ?? this.heroPlan();
    const rootIndex = this.openRoot(plan, { depth: opts.depth ?? 1, kind: opts.kind || 'derived', triggered: !!opts.triggered, ...(opts.minion ? { minion: opts.minion } : {}) });
    if (rootIndex === INDEX_NONE) return [];
    const p = this.world.plans[plan];
    const tags = this.tagMask(p, opts.tags || [ELEMENT_NAMES[element], ...(element === E.frost ? ['cold'] : [])]) | (opts.area === false ? 0n : TAG_AREA);
    const victims = opts.only ? [this.monster(opts.only)].filter(Boolean) : this.enemiesNear(x, y, radius, opts.exclude);
    if (this.world.trace && opts.area !== false) this.world.trace('area', { x, y, radius, amount, element, victims: victims.length, effect: opts.effect || 'combat' });
    const results = [];
    for (const m of victims) {
      const r = this.world.hostHit(rootIndex, m.id, amount, element, x, y, { tags, silent: !!opts.silent, generation: 2 + (opts.depth ?? 1), info: { strike: opts.effect || 'strike', depth: opts.depth ?? 1, cx: x, cy: y, radius, ...(opts.info || {}) } });
      if (r) results.push({ m, ...r });
    }
    this.world.releaseHeldRoot(rootIndex);
    return results;
  }
  /** Single-target extra damage (extra / converted / settled damage): silent unless asked. */
  hit(targetId, amount, element, opts = {}) {
    const m = this.monster(targetId);
    if (!m || !(amount > 0)) return null;
    return this.strike(m.x / 100, m.y / 100, 0.01, amount, element, { ...opts, only: targetId, area: false, silent: opts.silent ?? true })[0] || null;
  }

  // ---------------------------------------------------------------- damage resolution hook
  damageMod(root, target, amount, element, info) {
    const w = this.world;
    const targetId = w.targets.externalId[target];
    if (this.monster(targetId)?.invulnerable) return { miss: true };
    if (info?.reflected) return newMod();
    if (!this.isHeroRoot(root)) return this.incomingMod(root, targetId, element, info);
    if (targetId === undefined) return null;
    const mod = newMod();
    const s = p => this.s(p);
    const ri = info ? this.rootInfo(info.rootIndex) : null;
    const plan = w.plans[root.plan];
    const tags = info?.tags ?? 0n;
    const projectile = (tags & TAG_PROJECTILE) !== 0n;
    const area = (tags & TAG_AREA) !== 0n;
    const minion = !!ri?.minion || this.hasTag(plan, tags, 'summon');
    const triggered = !!ri?.triggered;
    const m = this.monster(targetId);
    const life = this.lifeFraction(m);
    const poisoned = this.ailments.layers(targetId, 'poison');
    const shocked = this.status(targetId, 'shock') > 0;
    const chilled = this.status(targetId, 'chill') > 0;
    const frozen = this.status(targetId, 'freeze') > 0;
    const burning = this.ailments.isBurning(targetId);
    // Cast / trigger bonuses (下一次技能强化, 连续触发 …).
    if (ri) { mod.more *= ri.more || 1; mod.increased += ri.increased || 0; mod.crit += ri.critBonus || 0; }
    // 形态
    applyDeliveryDamage(mod, s, { projectile, area, triggered });
    if (minion) this.minions.damageMod(mod, ri, element, targetId, info);
    // 元素
    mod.pen += s(`damage.pen.${ELEMENT_NAMES[element]}`);
    if (element === E.fire) { mod.critMulti += s('fire.crit_multi'); if (burning) mod.increased += s('burn.vs_fire'); }
    if (element === E.frost) {
      if (chilled) mod.increased += s('chill.vs_frost');
      for (const t of this.t('slow_frost')) mod.more *= 1 + Math.min(t.params.max, this.ailments.slowOf(targetId)) / 100;
    }
    if (element === E.lightning) {
      mod.critScale += s('lightning.crit') / 100;
      if (shocked) mod.increased += s('shock.vs_lightning');
      const layers = this.ailments.shockLayers(targetId);
      for (const t of this.t('shock_per_layer')) mod.increased += t.params.n * layers;
      if (s('lightning.max') || s('lightning.min')) {
        const hi = 1.5 * (1 + s('lightning.max') / 100), lo = Math.min(hi, 0.5 * (1 + s('lightning.min') / 100));
        mod.more *= lo + (hi - lo) * this.rand();
      }
      if (layers > 0 && this.has('shock_consume') && !info?.strike) { for (const t of this.t('shock_consume')) mod.more *= 1 + t.params.n * layers / 100; this.ailments.consumeShock(targetId); }
    }
    if (element === E.void) {
      if (life >= 0.999) mod.increased += s('void.vs_full');
      if (life <= 0.35) mod.increased += s('void.vs_low');
      if (m && m.shield > 0) mod.increased += s('void.vs_shield');
      const layers = this.ailments.layers(targetId, 'erosion');
      for (const t of this.t('erosion_per_layer')) mod.increased += t.params.n * layers;
      for (const t of this.t('poison_void_taken')) mod.taken *= 1 + Math.min(t.params.max, t.params.n * poisoned) / 100;
      for (const t of this.t('erosion_consume_layers')) if (layers > 0 && !info?.strike) mod.more *= 1 + 0.15 * this.ailments.removeLayers(targetId, 'erosion', t.params.n);
    }
    // 状态 / 目标
    if (poisoned) { mod.increased += s('poison.vs_hit'); mod.critScale += s('poison.vs_crit') / 100; }
    if (burning) mod.increased += s('burn.vs_hit');
    if (frozen) { mod.critScale += s('freeze.vs_crit') / 100; mod.critMulti += s('freeze.vs_crit_multi'); }
    if (frozen && s('freeze.consume') && !info?.strike) { mod.more *= 1 + 0.3 * this.world.getStatusRemaining(targetId, KEYS.freeze); this.ailments.removeFreeze(targetId, true); }
    mod.taken *= this.ailments.takenMultiplier(targetId, element);
    if (projectile && info?.sourceIndex !== undefined) this.projectiles.damageMod(mod, info, targetId, ri);
    if (area && info) this.zones.damageMod(mod, info, targetId, element);
    // 物理/元素伤害的 n% 转化为另一类型: the source hit loses that share, the runtime deals it as the new type.
    const converted = info?.strike ? 0 : Math.min(100, this.convertTotal(element));
    const keep = Math.max(1e-4, 1 - converted / 100);
    if (converted > 0) mod.more *= keep;
    // 终结 and per-hit crit bookkeeping (ailment effects read whether the hit was a crit).
    const execute = element === E.void && m && !m.elite ? Math.max(0, ...this.t('void_execute').map(t => t.params.n)) : 0;
    mod.adjust = (dealt, health, critical) => {
      this.lastCrit.set(targetId, critical);
      if (converted > 0 && info) info.converted = dealt / keep * converted / 100;
      if (execute > 0 && m && (health - dealt) / Math.max(1, m.maxHealth + (m.maxShield || 0)) * 100 < execute && health - dealt > 0) {
        if (info) info.executed = true;
        return health;
      }
      return dealt;
    };
    return mod;
  }

  /** Damage dealt by monsters (to the hero or minions): 中毒敌人的伤害 -n%. */
  incomingMod(root, targetId, element, info) {
    const attacker = this.monsterOfOwner(root.owner);
    if (!attacker) return null;
    const weaken = this.ailments.layers(attacker.id, 'poison') > 0 ? this.s('poison.enemy_weaken') : 0;
    if (!weaken) return null;
    const mod = newMod();
    mod.more = Math.max(0, 1 - weaken / 100);
    return mod;
  }
  monsterOfOwner(owner) {
    const o = this.world.owners[owner];
    if (!o) return null;
    return this.monster(o.statusId) || null;
  }

  // ---------------------------------------------------------------- frame hooks (called by the arena)
  /** New monster: 精英 (8%) with a shield; elemental resistances (抗性穿透 has something to cut). */
  onSpawn(m) {
    m.rarity = m.equipment?.rarity ? monsterEquipmentRarity(m.equipment.rarity) : this.rand() < 0.08 ? 'rare' : 'common';
    m.elite = m.rarity === 'rare';
    if (m.elite) { m.maxHealth *= 3; m.health = m.maxHealth; m.radius *= 60 / 45; m.name = `精英·${m.name || '怪物'}`; }
    m.maxShield = m.elite ? m.maxHealth * 0.25 : 0;
    m.shield = m.maxShield;
    m.sinceHit = 0;
    const res = m.elite ? 40 : 20;
    m.resistance = [res, res, res, 0];
  }

  /** Movement multiplier of a monster (中毒敌人的移动速度 -n%, 牵引). */
  monsterPace(m) {
    return this.ailments.layers(m.id, 'poison') > 0 ? Math.max(0.1, 1 - this.s('poison.enemy_slow') / 100) : 1;
  }

  /** Splits damage on a monster between its shield and life (虚空伤害的 n% 绕过护盾). */
  damageMonster(m, row) {
    let amount = row.Amount;
    m.sinceHit = 0;
    if (m.shield > 0) {
      const bypass = row.Element === E.void && row.OwnerExternalId === this.world.owners[this.hero.owner].externalId ? Math.min(100, this.s('void.bypass_shield')) / 100 : 0;
      const toShield = Math.min(m.shield, amount * (1 - bypass));
      m.shield -= toShield;
      amount -= toShield;
    }
    m.health = Math.max(0, m.health - amount);
    if (row.bKilled) m.health = 0;
  }

  /** Before the world step: targets are in place. */
  beforeStep(dt) {
    this.time += dt;
    this.strikeBudget = 400;
    this.byId = new Map(this.arena.monsters.map(m => [m.id, m]));
    if (this.marked.until < this.time) this.marked.id = 0;
    // Monster regeneration and shields (效率 reduced by 中毒 / 侵蚀).
    for (const m of this.arena.monsters) {
      m.sinceHit = (m.sinceHit || 0) + dt;
      if (m.sinceHit < 3 || !(m.health > 0)) continue;
      const poison = this.ailments.layers(m.id, 'poison') > 0 ? this.s('poison.enemy_regen') : 0;
      const erosion = this.ailments.layers(m.id, 'erosion') > 0 ? this.s('erosion.enemy_regen') : 0;
      m.health = Math.min(m.maxHealth, m.health + m.maxHealth * 0.01 * dt * Math.max(0, 1 - (poison + erosion) / 100));
      if (m.maxShield > 0) {
        const eroded = this.ailments.layers(m.id, 'erosion') > 0;
        const start = eroded ? 3 / Math.max(0.1, 1 - this.s('erosion.enemy_recharge') / 100) : 3;
        if (m.sinceHit >= start) m.shield = Math.min(m.maxShield, m.shield + m.maxShield * 0.2 * dt * Math.max(0, 1 - (eroded ? this.s('erosion.enemy_shield_regen') : 0) / 100));
      }
    }
    // Chill cap (冰缓效果上限 +n 个百分点) on the shared status definition.
    const chill = this.world.statusDefs.get(KEYS.chill);
    if (chill) chill.cap = 70 + this.s('chill.cap');
    this.c.aura = new Map([['buff.damage_taken_reduction', this.minions.guardReduction()]]);
    this.ailments.tick(dt);
    this.grounds.tick(dt);
    this.zones.tick(dt);
    this.projectiles.tick(dt);
    this.minions.tick(dt);
    this.retaliation.tick(dt);
    this.triggers.tick(dt);
  }

  /** Damage on the hero (monster rows, transfers). 召唤物替你承担 n% unless already transferred. */
  heroDamage({ amount, originalDamage = amount, element, dot = false, kind = null, critical = false, attacker = null, transferred = false }) {
    if (!transferred && !dot) amount -= this.minions.absorbForHero(amount, element);
    const taken = this.c.takeHit({ amount, element, dot, kind, critical, attacker });
    if (!dot && !this.c.dead && taken?.taken > 0) this.retaliation.onHit(originalDamage);
    return taken;
  }
  /** A monster damage row on the hero: hit kind (攻击 / 法术 / 近战 / 投射物) from the attacker's plan tags. */
  heroRow(row) {
    const info = row.Info || {};
    const root = this.world.roots[info.rootIndex];
    const plan = root ? this.world.plans[root.plan] : null;
    const tags = info.tags ?? 0n;
    const spell = !!plan && this.hasTag(plan, tags, 'spell');
    const kind = { attack: !spell, spell, melee: !!plan && this.hasTag(plan, tags, 'melee'), projectile: (tags & TAG_PROJECTILE) !== 0n, area: (tags & TAG_AREA) !== 0n };
    const attacker = this.monsterOfOwner(info.owner ?? -1);
    if (attacker) this.attackers.set(attacker.id, this.time);
    return this.heroDamage({ amount: row.Amount, originalDamage: info.raw ?? row.Amount, element: ELEMENT_NAMES[row.Element], dot: !!row.bDot, kind, critical: row.bCritical, attacker: attacker?.id ?? null });
  }
  /** A monster damage row on a minion. */
  minionRow(row) {
    const st = this.minions.stateOfTarget(row.TargetExternalId);
    if (!st) return;
    const tags = row.Info?.tags ?? 0n;
    const root = this.world.roots[row.Info?.rootIndex];
    const plan = root ? this.world.plans[root.plan] : null;
    this.minions.takeDamage(st, { amount: row.Amount, element: row.Element, dot: !!row.bDot, area: (tags & TAG_AREA) !== 0n, spell: !!plan && this.hasTag(plan, tags, 'spell') });
  }
  /** 反击 / 反射 / 眩晕攻击者 after an evade or a block. */
  counter(attacker, type, e = {}) {
    if (!attacker) return;
    const s = p => this.s(p);
    if (type === 'block') {
      if (s('block.reflect_physical') > 0) this.hit(attacker.id, s('block.reflect_physical'), E.physical, { effect: 'reflect' });
      if (s('block.reflect_fire') > 0) this.hit(attacker.id, s('block.reflect_fire'), E.fire, { effect: 'reflect' });
      if (this.chance(s('block.stun_chance'))) this.world.applyStatusKey(attacker.id, KEYS.stun, 1, 1, this.hero.owner);
    }
    const chance = type === 'block' ? s('block.counter_chance') : Math.max(0, ...this.t('evade_counter').map(t => t.params.chance));
    if (!this.chance(chance)) return;
    const amount = this.power * (1 + (e.overflow || 0) * s('block.counter_per_overcap') / 100) + this.c.counterBank;
    this.c.counterBank = 0;
    this.hit(attacker.id, amount, E.physical, { effect: 'counter', silent: false });
    this.note('反击');
  }
  /** 闪避动作 (Shift). */
  dodge() { this.triggers.event('trig_dodge', this.heroPos()); }

  /** One damage row of this frame (after the world step): hero / minion damage dealt to monsters. */
  onRow(row) {
    const info = row.Info || {};
    if (info.reflected) return;
    const heroExternal = this.world.owners[this.hero.owner].externalId;
    if (row.OwnerExternalId !== heroExternal || !this.byId.has(row.TargetExternalId)) return;
    const ri = info.rootIndex !== undefined ? this.rootInfo(info.rootIndex) : null;
    // 召唤物的命中、击杀属于召唤物：角色的命中回复 / 偷取只来自自己的命中。
    if (!ri?.minion) this.c.onDealt({ amount: row.Amount, element: ELEMENT_NAMES[row.Element], critical: row.bCritical, killed: row.bKilled, dot: !!row.bDot });
    this.onHeroDealt(row, info);
  }

  onHeroDealt(row, info) {
    const id = row.TargetExternalId;
    const m = this.monster(id);
    const ri = info.rootIndex !== undefined ? this.rootInfo(info.rootIndex) : null;
    const dot = !!row.bDot;
    const element = row.Element;
    const hit = { id, m, amount: row.Amount, element, critical: row.bCritical, killed: row.bKilled, dot, info, ri,
      projectile: info.kind === 'projectile', area: info.cx !== undefined || info.kind === 'area', minion: !!ri?.minion, triggered: !!ri?.triggered,
      depth: info.depth ?? ri?.depth ?? 0, silent: !!info.strike && info.strike !== 'zone' && info.strike !== 'chain' && info.strike !== 'arc' };
    if (!dot && !hit.minion) this.marked = { id, until: this.time + 4 };
    if (ri) { ri.victims.add(id); ri.hitCount = (ri.hitCount || 0) + (dot ? 0 : 1); }
    if (!dot) {
      if (hit.minion) this.minions.onHit(hit);
      else this.onHeroHit(hit);
    }
    this.ailments.onHit(hit);
    this.grounds.onHit(hit);
    if (hit.killed) this.onKill(hit);
    this.triggers.onDealt(hit);
  }

  /** Hero (not minion) hit effects that are not ailments. */
  onHeroHit(hit) {
    const s = p => this.s(p);
    const c = this.c;
    if (hit.projectile) { c.recover('life', s('proj.hit_life')); c.recover('shield', s('proj.hit_shield')); c.recover('mana', s('proj.hit_mana')); }
    if (hit.info.zone) { c.recover('life', s('area.per_hit_life')); c.recover('mana', s('area.per_hit_mana')); this.zones.onHit(hit); }
    if (this.ailments.layers(hit.id, 'poison') > 0 && s('poison.vs_leech') > 0) c.addLeech('life', hit.amount * s('poison.vs_leech') / 100);
    this.minions.onHeroHit(hit);
    if (hit.info.strike && hit.info.strike !== 'zone') return;
    // 获得额外伤害 / 转化 (silent hits; never recursive).
    for (const t of this.t('extra_damage')) if (this.sourceMatches(t.params.source, hit.element)) this.hit(hit.id, hit.amount * t.params.n / 100, t.params.element, { effect: 'extra' });
    for (const t of this.t('convert_damage')) if (this.sourceMatches(t.params.source, hit.element) && hit.info.converted > 0) this.hit(hit.id, hit.info.converted * t.params.n / Math.max(1e-9, Math.min(100, this.convertTotal(hit.element))), t.params.element, { effect: 'convert' });
  }
  sourceMatches(source, element) { return source === -1 || (source === -2 ? ELEMENTAL.has(element) : source === element); }
  convertTotal(element) { return this.t('convert_damage').filter(t => this.sourceMatches(t.params.source, element)).reduce((sum, t) => sum + t.params.n, 0); }

  onKill(hit) {
    const s = p => this.s(p);
    const c = this.c;
    if (!hit.minion) {
      // 充能
      const was = c.charges;
      c.charges = Math.min(3, c.charges + 1);
      if (c.charges > was) { c.emit('charge_gained'); if (c.charges === 3) c.emit('charge_max'); }
    }
    if (hit.info.executed) {
      c.recover('life', s('execute.life'));
      for (const t of this.t('execute_spread')) this.ailments.spreadLayers(hit.id, 'erosion', t.params.n, 3);
      if (this.chance(s('execute.collapse_chance'))) this.ailments.collapse(hit.id, true);
    }
    this.minions.onKill(hit);
    this.zones.onKill(hit);
  }

  // ---------------------------------------------------------------- skills cast by the hero
  /** 'attack' for melee skills, 'spell' otherwise. */
  skillKind(planIndex = this.hero.plan) {
    const type = skillType(this.host.planSources.get(planIndex));
    if (type !== 'active') return type;
    const plan = this.world.plans[planIndex];
    return plan && plan.tagNames.find('melee') >= 0 ? 'attack' : 'spell';
  }
  skillTraits(planIndex = this.hero.plan) {
    const plan = this.world.plans[planIndex];
    return plan ? plan.traitIds.map(id => id.split('~')[0]) : [];
  }
  /** Skill families of a plan: area / projectile / summon / element tags. */
  skillFamily(planIndex = this.hero.plan) {
    const plan = this.world.plans[planIndex];
    if (!plan) return {};
    const has = name => plan.tagNames.find(name) >= 0;
    const ops = plan.actions.filter(Boolean).map(a => a.op);
    const element = a => plan.actions.some(x => x && x.element === a);
    return {
      area: ops.includes(2) && plan.rules.some(r => [EBuiltinEvent.Cast, EBuiltinEvent.ProjectileEnd].includes(r.event) && plan.actions.slice(r.actionFirst, r.actionFirst + r.actionCount).some(a => a?.op === 2)),
      projectile: ops.includes(0), summon: ops.includes(11),
      frost: has('cold') || has('frost') || element(E.frost), fire: has('fire') || element(E.fire), void: has('void') || element(E.void), lightning: has('lightning') || element(E.lightning), poison: has('poison') || element(E.poison),
    };
  }
  /** Skill cooldown (active trait param "cooldown"), shortened by the matching 冷却恢复速度. */
  cooldownFor(planIndex = this.hero.plan) {
    const plan = this.world.plans[planIndex];
    const lib = this.host.library;
    const active = plan ? lib.trait(plan.traitIds[0]?.split('~')[0]) : null;
    let base = 0;
    // Only active rule traits define skill cooldowns, including web character actions.
    // Passive affix params named "cooldown" still belong to their own triggers.
    const enabled = new Set(plan?.traitIds || []);
    for (const source of this.host.planSources.get(planIndex)?.traits || []) {
      const v = enabled.has(source.id) && source.rules.some(rule => rule.event === 'cast') ? source.params.get('cooldown') : 0;
      if (v > 0) base = Math.max(base, v);
    }
    if (!(base > 0) && !active) return 0;
    const f = this.skillFamily(planIndex);
    const recovery = (f.area ? this.s('area.cooldown') : 0) + (f.frost ? this.s('frost.cooldown') : 0) + (f.void ? this.s('void.cooldown') : 0) + (f.summon ? this.s('minion.cooldown') : 0);
    return base / Math.max(0.1, 1 + recovery / 100);
  }
  canCast() { return this.cooldown <= 0; }
  /** Cost multiplier of the selected skill (范围/投射物/召唤/虚空技能消耗, 每次重复消耗). */
  costScale(planIndex = this.hero.plan) {
    const f = this.skillFamily(planIndex);
    let reduction = 0;
    if (f.area) reduction += this.s('area.cost') + Math.min(90, this.s('area.repeats') * this.s('area.repeat_cost'));
    if (f.projectile) reduction += this.s('proj.cost');
    if (f.summon) reduction += this.s('minion.cost');
    if (f.void) reduction += this.s('void.cost');
    return Math.max(0.1, 1 - Math.min(90, reduction) / 100);
  }
  /** % added to the cast rate of the selected skill. */
  castSpeed(planIndex = this.hero.plan) {
    const f = this.skillFamily(planIndex);
    return (f.area ? this.s('area.cast_speed') : 0) + (f.lightning ? this.s('lightning.cast_speed') : 0) + (f.summon ? this.s('minion.summon_speed') : 0);
  }
  /** Extra trait for the hero's casts: projectile shape stats and area size (plan-level). */
  planSource(plan, { minion = false, projectileOnly = false } = {}) {
    const s = p => this.s(p);
    const params = {};
    const modifiers = [];
    const add = (target, stat, op, value, key) => { if (Math.abs(value) > 1e-9) { params[key] = Math.round(value * 1000) / 1000; modifiers.push({ target, stat, op, value: { param: key } }); } };
    add('projectile', 'count', 'add', s('proj.count') + (minion ? s('minion.proj_count') : 0), 'count');
    add('projectile', 'speed', 'multiply_percent', s('proj.speed') + (minion ? s('minion.proj_speed') : 0), 'speed');
    add('projectile', 'lifetime', 'multiply_percent', s('proj.lifetime') + s('proj.distance'), 'life');
    add('projectile', 'radius', 'multiply_percent', s('proj.radius'), 'radius');
    add('projectile', 'pierce', 'add', s('proj.pierce'), 'pierce');
    add('projectile', 'spread', 'add', s('proj.spread_more') - s('proj.spread_less'), 'spread');
    if (!projectileOnly) {
      add('area', 'radius', 'add', s('area.base_radius'), 'area_base');
      add('area', 'radius', 'multiply_percent', (this.areaScale() - 1) * 100, 'area');
    }
    if (!modifiers.length) return null;
    const key = JSON.stringify(params);
    this.planCache ||= new Map();
    if (!this.planCache.has(key)) this.planCache.set(key, readTraitText(JSON.stringify({ id: '__combat_plan', params, modifiers })).trait);
    return this.planCache.get(key);
  }
  /** After a successful hero cast (root index of the world cast). */
  onHeroCast(rootIndex, pay) {
    const planIndex = this.world.roots[rootIndex]?.plan ?? this.hero.plan;
    const kind = this.skillKind(planIndex);
    this.register(rootIndex, { kind: 'cast', manual: true, skill: this.hero.skill, critBonus: pay?.critBonus || 0 });
    this.cooldown = this.cooldownFor(planIndex);
    this.projectiles.onCast(rootIndex, planIndex);
    this.minions.onHeroCast();
    this.triggers.onCast(kind, pay, rootIndex);
  }
}

export { ELEMENTAL, TAG_PROJECTILE, TAG_AREA, TAG_CRITICAL, newMod };
