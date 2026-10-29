// 召唤物：规则世界的召唤（summon）由运行时赋予气血 / 护盾 / 护甲 / 闪避 / 格挡 / 抗性，成为可被攻击的目标；
// 数量上限、精神、持续时间、攻速、移动与追击、优先目标、指令、继承、玩家联动、生成 / 死亡 / 牺牲 / 替换效果。
// 每个召唤物有自己的规则根（root），其命中可以归属到具体的召唤物。
import { INDEX_NONE } from '../types.mjs';
import { E, MINION_BASE as BASE } from './common.mjs';
import { createPawnEquipment } from '../pawn-equipment.mjs';

export const MINION_BASE = BASE;
const BASE_LIFE = 150;
const KIND_ELEMENT = { sentinel: E.frost, spirit: E.physical };

export class Minions {
  constructor(R) {
    this.R = R;
    this.states = new Map(); // summon id -> state
    this.revives = [];
    this.sacrificed = 0;
    this.lastReplaced = null;
    this.youCritUntil = 0;
  }
  s(p) { return this.R.s(p); }
  t(n) { return this.R.t(n); }
  get world() { return this.R.world; }

  heroSummons() { return this.world.summons.filter(s => !s.dead && !s.storm && this.R.isHeroRoot(this.world.roots[s.root]) && this.states.has(s.id)); }
  alive() { return this.heroSummons().map(s => this.states.get(s.id)).filter(st => st && !st.dead); }
  stateOfTarget(id) { return id >= MINION_BASE ? this.states.get(id - MINION_BASE) || null : null; }
  counted() { return this.alive().filter(st => !st.temp && !st.empowered); }

  // All player-controlled summons share this budget, including temporary and
  // empowered copies. Storms are effects, so heroSummons() excludes them.
  controlCap() { return Math.max(1, 1 + Math.floor(this.s('minion.control_cap'))); }
  enforceControlCap(incoming = null) {
    const units = this.alive().sort((a, b) => a.id - b.id);
    let changed = false;
    while (units.length > this.controlCap()) {
      const old = units.shift(), summon = old.summon;
      if (incoming) incoming.summon.nextFire = Math.max(incoming.summon.nextFire, summon.nextFire, this.world.clock);
      summon.dead = true; summon.replaced = true;
      this.world.releaseHeldRoot(summon.root);
      this.onEnd(summon);
      if (incoming && this.lastReplaced) incoming.life = Math.min(incoming.maxLife * 1.5,
        incoming.life + this.lastReplaced.life * this.s('minion.replace_transfer') / 100);
      this.lastReplaced = null;
      changed = true;
    }
    if (changed) this.world.summons = this.world.summons.filter(summon => !summon.dead);
  }

  // ---------------------------------------------------------------- caps (world hook)
  baseCap(cap) {
    let n = cap + Math.floor(this.s('minion.cap')) + Math.floor(this.s('minion.cap_same'));
    for (const t of this.t('minion_fewer_damage')) n -= t.params.cap;
    for (const t of this.t('minion_fewer_life')) n -= t.params.cap;
    for (const t of this.t('minion_more_weaker')) n += t.params.cap;
    return Math.max(1, n);
  }
  reservation() { return 20 * Math.max(0.05, 1 - this.s('minion.spirit') / 100); }
  capFor(cap, kind, context) {
    if (!this.R.isHeroRoot(context.root)) return cap;
    let n = this.baseCap(cap);
    if (this.t('minion_merge').length) n = 1;
    const others = this.counted().filter(st => st.summon.kindName.toLowerCase() !== String(kind).toLowerCase()).length;
    const bySpirit = Math.floor(100 / this.reservation()) - others;
    this.lastCap = n;
    return Math.max(0, Math.min(n, bySpirit));
  }

  // ---------------------------------------------------------------- creation
  onSummon(summon, context, replaced) {
    const R = this.R;
    if (!R.isHeroRoot(context.root) || summon.storm) return;
    const s = p => this.s(p);
    const ri = R.rootInfo(context.rootIndex);
    const plan = context.plan;
    // Own root per summon: its hits are attributed to it. The cast root keeps no reference.
    const own = R.openRoot(context.root.plan, { kind: 'minion', triggered: !!ri?.triggered });
    if (own !== INDEX_NONE) { summon.root = own; --context.root.live; }
    const family = R.skillFamily(context.root.plan);
    const scale = 1 + (s('minion.duration') + (ri?.triggered ? s('trigger.duration') : 0) + (family.frost ? s('frost.duration') : 0)) / 100;
    summon.expire = this.world.clock + Math.max(0.05, (summon.expire - this.world.clock) * scale);
    const st = this.create(summon, { mobile: R.hasTag(plan, summon.tags, 'melee'), temp: !!this.spawningTemp, empowered: !!this.spawningEmpowered });
    if (own !== INDEX_NONE) R.register(own, { minion: st });
    if (replaced && this.lastReplaced) { st.life = Math.min(st.maxLife * 1.5, st.life + this.lastReplaced.life * s('minion.replace_transfer') / 100); this.lastReplaced = null; }
    this.enforceControlCap(st);
    this.spawned(st);
    // 每次召唤数量 +n
    if (!this.cloning) {
      this.cloning = true;
      for (let k = 0; k < Math.floor(s('minion.per_cast')); ++k) this.copy(summon, { dx: (k + 1) * 0.8, dy: (k % 2 ? 1 : -1) * 0.6 });
      this.cloning = false;
    }
    // 同类召唤物合并为一个
    for (const t of this.t('minion_merge')) {
      const same = this.alive().filter(o => o !== st && o.summon.kindName === summon.kindName);
      for (const o of same) { st.merged += 1 + o.merged; this.remove(o); }
      void t;
    }
  }

  create(summon, { mobile = false, temp = false, empowered = false } = {}) {
    const R = this.R;
    const st = {
      summon, equipment: summon.equipment, id: summon.id, kind: summon.kindName, mobile, temp, empowered, born: R.time, kills: 0, merged: 0, dead: false,
      baseInterval: summon.interval, baseRange: summon.range, immuneUntil: R.time + this.s('minion.immune'), sinceHit: 9,
      element: KIND_ELEMENT[String(summon.kindName).toLowerCase()] ?? E.physical, commandAt: Infinity, buffs: {},
      baseDuration: Math.max(1, summon.expire - this.world.clock), planIndex: summon.planIndex ?? this.world.roots[summon.root]?.plan ?? R.heroPlan(),
    };
    this.states.set(summon.id, st);
    st.maxLife = st.life = this.maxLife(st);
    st.maxShield = st.shield = this.maxShield(st);
    return st;
  }

  /** Extra summon (每次召唤数量 / 复活 / 临时 / 强化 / 重新召唤) next to a source summon. */
  copy(summon, { dx = 0.8, dy = 0, temp = false, empowered = false, duration = null, at = null } = {}) {
    const R = this.R;
    const w = this.world;
    const planIndex = summon.planIndex ?? this.states.get(summon.id)?.planIndex ?? w.roots[summon.root]?.plan ?? R.heroPlan();
    if (!w.plans[planIndex]) return null;
    const own = R.openRoot(planIndex, { kind: 'minion' });
    if (own === INDEX_NONE || w.summons.length >= 128) { if (own !== INDEX_NONE) w.releaseHeldRoot(own); return null; }
    const copy = { ...summon, equipment: createPawnEquipment(summon.equipment, 'summon'), planIndex, id: w.nextSummonId++, root: own, dead: false, replaced: false, x: (at?.x ?? summon.x) + dx, y: (at?.y ?? summon.y) + dy,
      expire: duration !== null ? w.clock + duration : summon.expire, nextFire: w.clock, hold: false, interval: this.states.get(summon.id)?.baseInterval ?? summon.interval };
    w.summons.push(copy);
    const st = this.create(copy, { mobile: this.states.get(summon.id)?.mobile ?? false, temp, empowered });
    R.register(own, { minion: st });
    this.enforceControlCap(st);
    this.spawned(st);
    return st;
  }

  spawned(st) {
    const R = this.R;
    const s = p => this.s(p);
    const sm = st.summon;
    if (s('minion.spawn_blast')) R.strike(sm.x, sm.y, 2.5 * R.areaScale({ minion: true }), R.power, st.element, { effect: 'minion_spawn', depth: 2 });
    if (s('minion.spawn_heal') > 0) { R.c.recover('life', s('minion.spawn_heal')); for (const o of this.alive()) if (o !== st) this.heal(o, s('minion.spawn_heal')); }
    for (const t of this.t('minion_spawn_speed')) st.buffs.spawn = { value: t.params.n, until: R.time + t.params.duration };
    R.triggers.event('trig_summon_spawn', { x: sm.x, y: sm.y });
  }

  // ---------------------------------------------------------------- stats
  emptySlots() { return Math.max(0, (this.lastCap || 1) - this.counted().length); }
  maxLife(st) {
    const s = p => this.s(p);
    const R = this.R;
    let increased = s('minion.life_increased') + this.emptySlots() * s('minion.empty_life');
    for (const t of this.t('minion_kill_life')) increased += Math.min(t.params.max, st.kills * t.params.n);
    let more = s('minion.life_more') * (1 + st.merged * (this.t('minion_merge')[0]?.params.n || 0) / 100) * (st.empowered ? 2 : 1);
    for (const t of this.t('minion_fewer_life')) more *= 1 + t.params.n / 100;
    const inherit = (R.c.base.life + R.c.stat('life.base')) * s('minion.inherit_life') / 100;
    return Math.max(1, (BASE_LIFE + s('minion.life_base') + inherit) * Math.max(0, 1 + increased / 100) * more);
  }
  maxShield(st) {
    const s = p => this.s(p);
    const inherit = this.R.c.stat('shield.base') * s('minion.inherit_shield') / 100;
    return Math.max(0, (s('minion.shield_base') + inherit) * Math.max(0, 1 + s('minion.shield_increased') / 100) * (st.empowered ? 2 : 1));
  }
  armour() { return (100 + this.R.c.armourValue() * this.s('minion.inherit_armour') / 100) * (1 + this.s('minion.armour') / 100); }
  evasion() { return (100 + this.R.c.evasionValue() * this.s('minion.inherit_evasion') / 100) * (1 + this.s('minion.evasion') / 100); }
  heal(st, amount) {
    if (!st || st.dead || !(amount > 0)) return;
    st.life = Math.min(st.maxLife, st.life + amount * Math.max(0, 1 + this.s('minion.heal_received') / 100));
  }
  isLow(st) { return st.life <= st.maxLife * 0.35; }
  speedBonus(st) {
    const s = p => this.s(p);
    const R = this.R;
    let bonus = (st.mobile ? s('minion.attack_speed') : s('minion.cast_speed')) + s('minion.skill_cooldown');
    bonus += R.c.actionSpeed(st.mobile ? 'attack' : 'spell') * s('minion.inherit_speed') / 100;
    if (this.isLow(st)) bonus += s('minion.low_life_speed');
    const same = this.alive().filter(o => o.kind === st.kind).length;
    for (const t of this.t('minion_per_same_speed')) bonus += Math.min(t.params.max, t.params.n * same);
    if (st.buffs.spawn?.until > R.time) bonus += st.buffs.spawn.value;
    return bonus;
  }

  /** Damage of minion hits (召唤物伤害 …). */
  damageMod(mod, ri, element, targetId) {
    const s = p => this.s(p);
    const R = this.R;
    const st = ri?.minion;
    const elemental = element === E.fire || element === E.frost || element === E.lightning;
    mod.increased += s('minion.damage') + (element === E.physical ? s('minion.inc.physical') : 0) + (elemental ? s('minion.inc.elemental') : 0) + (element === E.void ? s('minion.inc.void') : 0);
    mod.increased += this.emptySlots() * s('minion.empty_damage');
    for (const t of this.t('minion_per_minion_damage')) mod.increased += Math.min(t.params.max, t.params.n * this.alive().length);
    mod.more *= s('minion.more');
    for (const t of this.t('minion_fewer_damage')) mod.more *= 1 + t.params.n / 100;
    for (const t of this.t('minion_more_weaker')) mod.more *= Math.max(0, 1 - t.params.n / 100);
    if (R.time < this.youCritUntil) mod.increased += this.youCritValue || 0;
    mod.flat += s(`minion.flat.${['fire', 'frost', 'lightning', 'physical', 'poison', 'void'][element]}`) + (R.c.offense().flat[['fire', 'frost', 'lightning', 'physical', 'poison', 'void'][element]] || 0) * s('minion.inherit_flat') / 100;
    mod.critScale += s('minion.crit') / 100;
    mod.crit += Math.max(0, R.host.getPlanStat(R.hero.plan, 'owner.critical_chance') - 5) * s('minion.inherit_crit') / 100;
    mod.critMulti += s('minion.crit_multi');
    if (!R.chance(Math.min(100, 90 * (1 + s('minion.accuracy') / 100)))) { mod.miss = true; return; }
    if (!st) return;
    mod.more *= (1 + st.merged * (this.t('minion_merge')[0]?.params.n || 0) / 100) * (st.empowered ? 2 : 1);
    if (st.life >= st.maxLife - 1e-6) mod.increased += s('minion.full_life_damage');
    if (targetId === R.marked.id) mod.increased += s('minion.marked_damage');
    if (st.buffs.command?.until > R.time) mod.increased += st.buffs.command.value;
    for (const t of this.t('minion_age_damage')) mod.increased += Math.min(t.params.max, Math.floor((R.time - st.born) / Math.max(0.1, t.params.seconds)) * t.params.n);
    for (const t of this.t('minion_ending_damage')) if (st.summon.expire - this.world.clock < t.params.seconds) mod.increased += t.params.n;
  }

  // ---------------------------------------------------------------- targeting / movement (world hook + per frame)
  target(summon, nearest) {
    const R = this.R;
    const st = this.states.get(summon.id);
    if (!st || summon.storm) return nearest;
    const s = p => this.s(p);
    const w = this.world;
    const base = R.c.stats.has('minion.seek_range') ? s('minion.seek_range') : st.baseRange;
    summon.range = Math.max(0, base) * Math.max(0, 1 + s('minion.seek') / 100);
    const range = summon.range;
    const list = range > 0 ? R.enemiesNear(summon.x, summon.y, range) : [];
    let pick = null;
    if (st.commandAt <= R.time && st.commandTarget) pick = list.find(m => m.id === st.commandTarget) || null;
    if (!pick) {
      const prefer = [];
      if (s('minion.prefer_marked')) prefer.push(m => m.id === R.marked.id);
      if (s('minion.prefer_elite')) prefer.push(m => m.elite);
      if (s('minion.prefer_low')) prefer.push(m => R.lifeFraction(m) <= 0.5);
      if (s('minion.prefer_attacker')) prefer.push(m => (R.attackers.get(m.id) ?? -Infinity) > R.time - 4);
      for (const t of this.t('minion_prefer_status')) prefer.push(m => R.hasStatusChoice(m.id, t.params.status));
      for (const test of prefer) { pick = list.find(test); if (pick) break; }
    }
    if (!pick) pick = list[0] || null;
    st.targetId = pick ? pick.id : 0;
    // Melee minions only strike inside their attack range.
    if (st.mobile) {
      const reach = 1.3 * (1 + s('minion.attack_range') / 100) + (pick ? pick.radius / 100 : 0);
      summon.hold = !pick || Math.hypot(pick.x / 100 - summon.x, pick.y / 100 - summon.y) > reach;
    }
    return pick ? w.targetIndexOf(pick.id) : (nearest >= 0 && list.length ? nearest : INDEX_NONE);
  }

  tick(dt) {
    const R = this.R;
    const s = p => this.s(p);
    const hero = R.heroPos();
    this.enforceControlCap();
    for (const st of [...this.states.values()]) {
      const sm = st.summon;
      if (sm.dead || st.dead) { if (sm.dead) this.states.delete(st.id); continue; }
      st.maxLife = this.maxLife(st);
      st.maxShield = this.maxShield(st);
      sm.interval = Math.max(0.05, st.baseInterval / Math.max(0.1, 1 + this.speedBonus(st) / 100));
      this.heal(st, (s('minion.regen_flat') + st.maxLife * s('minion.regen_percent') / 100) * dt);
      st.sinceHit += dt;
      if (st.sinceHit > 3) st.shield = Math.min(st.maxShield, st.shield + st.maxShield * 0.2 * dt);
      if (st.commandAt <= R.time && !st.commanded) {
        st.commanded = true;
        for (const t of this.t('minion_command_damage')) st.buffs.command = { value: t.params.n, until: R.time + t.params.duration };
        for (const t of this.t('minion_command_move')) st.buffs.move = { value: t.params.n, until: R.time + t.params.duration };
      }
      // Movement of melee minions: chase inside the leash, otherwise follow the hero; 传送.
      if (st.mobile) {
        const leash = 9 * (1 + s('minion.chase') / 100);
        const target = st.targetId ? R.monster(st.targetId) : null;
        let gx = hero.x + 1, gy = hero.y + 1;
        if (target && Math.hypot(target.x / 100 - hero.x, target.y / 100 - hero.y) <= leash) { gx = target.x / 100; gy = target.y / 100; }
        const speed = 4 * (1 + (s('minion.move_speed') + (st.buffs.move?.until > R.time ? st.buffs.move.value : 0)) / 100) * dt;
        const dx = gx - sm.x, dy = gy - sm.y, d = Math.hypot(dx, dy);
        const stop = target ? 1.0 : 1.5;
        if (d > stop) { const step = Math.min(speed, d - stop); sm.x += dx / d * step; sm.y += dy / d * step; }
      }
      for (const t of this.t('minion_teleport')) if (Math.hypot(sm.x - hero.x, sm.y - hero.y) > t.params.meters) { sm.x = hero.x + 1; sm.y = hero.y; }
    }
    // 复活
    for (const r of this.revives.filter(r => r.at <= R.time)) if (r.summon.expire - this.world.clock > 0.5) this.copy(r.summon, { dx: 0, dy: 0, duration: r.summon.expire - this.world.clock, at: { x: hero.x + 1, y: hero.y } });
    this.revives = this.revives.filter(r => r.at > R.time);
    // 你恢复气血时，恢复量的 n% 治疗召唤物
    const share = s('minion.recovery_share');
    const restored = R.c.flow.lifeRestored;
    if (share > 0 && restored > 0) { const list = this.alive(); for (const st of list) this.heal(st, restored * share / 100 / Math.max(1, list.length)); }
  }

  /** A monster engages a minion that is within 2.5 m of it and closer than the hero (minions draw attacks). */
  engage(m) {
    const hero = this.R.heroPos();
    const mx = m.x / 100, my = m.y / 100;
    const heroDistance = Math.hypot(hero.x - mx, hero.y - my);
    let best = null, bestD = 2.5;
    for (const st of this.alive()) {
      const d = Math.hypot(st.summon.x - mx, st.summon.y - my);
      if (d < bestD && d < heroDistance) { best = st; bestD = d; }
    }
    return best;
  }

  /** Targets for the world: minions are hostile to monsters and can be hit. */
  addTargets(host) {
    const res = this.s('minion.resistance');
    for (const st of this.alive()) {
      const sm = st.summon;
      host.addTarget({ x: sm.x * 100, y: sm.y * 100, z: 60 }, 40, st.life + st.shield, 0, MINION_BASE + st.id, [res, res, res, 0]);
    }
  }

  /** 附近每有一个召唤物，你受到的伤害 -n%. */
  guardReduction() {
    const hero = this.R.heroPos();
    const near = this.alive().filter(st => Math.hypot(st.summon.x - hero.x, st.summon.y - hero.y) <= 8).length;
    let total = 0;
    for (const t of this.t('minion_nearby_guard')) total += Math.min(t.params.max, t.params.n * near);
    return total;
  }

  // ---------------------------------------------------------------- damage taken by minions
  /** A monster damage row on a minion target. transferred: part of the hero's hit (no further transfer). */
  takeDamage(st, { amount, element, dot = false, area = false, spell = false, transferred = false }) {
    const R = this.R;
    const s = p => this.s(p);
    if (!st || st.dead || R.time < st.immuneUntil || !(amount > 0)) return;
    if (!dot) {
      const ev = this.evasion();
      if (!spell && R.chance(ev / (ev + 600) * 100)) return;
      if (R.chance(Math.min(75, spell ? s('minion.block_spell') : s('minion.block_attack')))) amount *= 0.3;
      if (element === E.physical) { const a = this.armour(); amount -= amount * Math.min(0.9, a / (a + 5 * amount)); }
    }
    amount *= Math.max(0, 1 - s('minion.taken') / 100) * (area ? Math.max(0, 1 - s('minion.taken_area') / 100) : 1) * (dot ? Math.max(0, 1 - s('minion.taken_dot') / 100) : 1);
    if (!transferred && s('minion.you_take') > 0) {
      const part = amount * Math.min(100, s('minion.you_take')) / 100;
      amount -= part;
      R.heroDamage({ amount: part, element: ['fire', 'frost', 'lightning', 'physical', 'poison', 'void'][element], dot, transferred: true });
    }
    st.sinceHit = 0;
    const toShield = Math.min(st.shield, amount);
    st.shield -= toShield;
    st.life -= amount - toShield;
    if (st.life <= 0) this.die(st, 'killed');
  }

  /** 召唤物替你承担受到命中伤害的 n%: returns the part moved to a nearby minion. */
  absorbForHero(amount, element) {
    const n = this.s('minion.take_for_you');
    if (!(n > 0)) return 0;
    const hero = this.R.heroPos();
    const holder = this.alive().filter(st => Math.hypot(st.summon.x - hero.x, st.summon.y - hero.y) <= 8).sort((a, b) => b.life - a.life)[0];
    if (!holder) return 0;
    const part = amount * Math.min(100, n) / 100;
    this.takeDamage(holder, { amount: part, element: E[element] ?? E.physical, transferred: true });
    return part;
  }

  // ---------------------------------------------------------------- death / end / sacrifice
  remove(st) {
    st.dead = true;
    st.summon.expire = this.world.clock;
  }
  die(st, reason) {
    const R = this.R;
    const s = p => this.s(p);
    if (st.dead) return;
    st.remainingAtDeath = Math.max(0, st.summon.expire - this.world.clock);
    this.remove(st);
    st.reason = reason;
    const sm = st.summon;
    if (reason === 'killed') {
      if (s('minion.death_explosion')) R.strike(sm.x, sm.y, 2.5 * Math.sqrt(1 + s('minion.death_area') / 100) * R.areaScale({ minion: true }), st.maxLife * (30 + s('minion.death_damage')) / 100, E.fire, { effect: 'minion_death', depth: 2 });
      if (s('minion.death_heal') > 0) { R.c.recover('life', s('minion.death_heal')); for (const o of this.alive()) this.heal(o, s('minion.death_heal')); }
      R.triggers.event('trig_summon_death', { x: sm.x, y: sm.y });
      const remaining = sm.expire - this.world.clock;
      if (!st.temp && R.chance(s('minion.resummon_chance'))) this.copy(sm, { dx: 0, dy: 0, at: R.heroPos(), duration: Math.max(1, st.baseDuration || 8) });
      else if (!st.temp && !st.empowered) this.revives.push({ at: R.time + 5 * Math.max(0.05, 1 - s('minion.revive') / 100), summon: { ...sm, planIndex: st.planIndex, expire: this.world.clock + Math.max(0, st.remainingAtDeath ?? remaining) } });
    }
  }
  /** World hook: a summon ended (expired or replaced). */
  onEnd(summon) {
    const st = this.states.get(summon.id);
    if (!st || st.dead) return;
    const R = this.R;
    st.dead = true;
    if (summon.replaced) { this.lastReplaced = { kind: st.kind, life: st.life }; return; }
    if (this.s('minion.end_attack')) R.strike(summon.x, summon.y, 6, R.power * 2, st.element, { effect: 'minion_end', depth: 2 });
  }
  /** Rule action: sacrifice this owner's oldest eligible controlled units. */
  sacrifice({ owner, count = 1, kind = '' }) {
    const R = this.R;
    if (owner !== R.hero.owner || R.hero.dead) return false;
    const selected = this.alive().filter(st => !kind || st.kind === kind)
      .sort((a, b) => a.born - b.born || a.id - b.id).slice(0, Math.min(32, Math.max(0, Math.floor(count))));
    for (const st of selected) this.sacrificeUnit(st);
    return selected.length > 0;
  }
  sacrificeUnit(st) {
    const R = this.R;
    const s = p => this.s(p);
    const c = R.c;
    this.die(st, 'sacrificed');
    c.recover('life', c.maxLife * s('minion.sacrifice_life') / 100);
    c.recover('shield', Math.max(0, st.life) * s('minion.sacrifice_shield') / 100);
    for (const t of this.t('minion_sacrifice_empower')) c.pendingEmpower += t.params.n;
    ++this.sacrificed;
    for (const t of this.t('minion_sacrifice_elite')) if (this.sacrificed % Math.max(1, t.params.per) === 0) this.copy(st.summon, { dx: 0, dy: 0, at: R.heroPos(), empowered: true, duration: 8 });
    R.triggers.event('trig_sacrifice', { x: st.summon.x, y: st.summon.y });
    R.note(`牺牲 ${st.kind}`);
  }

  // ---------------------------------------------------------------- hits by / for minions
  onHit(hit) {
    const R = this.R;
    const s = p => this.s(p);
    const st = hit.ri?.minion;
    const c = R.c;
    if (st) {
      this.heal(st, s('minion.life_on_hit') + hit.amount * (s('minion.leech') + (hit.id === R.marked.id ? s('minion.marked_leech') : 0)) / 100);
    }
    if (s('minion.leech_to_you') > 0) c.addLeech('life', hit.amount * s('minion.leech_to_you') / 100);
    c.recover('shield', s('minion.hit_your_shield'));
    if (hit.critical) { c.recover('mana', s('minion.crit_your_mana')); R.triggers.event('trig_summon_crit', { x: hit.m?.x / 100, y: hit.m?.y / 100, id: hit.id }); }
    // 召唤物基础 X 伤害 of other elements than the hit: extra silent hits.
    for (const [name, e] of Object.entries(E)) if (e !== hit.element && e !== E.poison && s(`minion.flat.${name}`) > 0 && !hit.info.strike) R.hit(hit.id, s(`minion.flat.${name}`), e, { effect: 'minion_flat' });
  }
  onKill(hit) {
    const R = this.R;
    const s = p => this.s(p);
    if (!hit.minion) return;
    const st = hit.ri?.minion;
    if (st) st.kills++;
    R.c.recover('life', s('minion.kill_your_life'));
    if (st && !st.temp && R.chance(s('minion.kill_temp_chance'))) {
      this.spawningTemp = true;
      this.copy(st.summon, { dx: 0.6, dy: 0.6, temp: true, duration: 4 });
      this.spawningTemp = false;
    }
  }
  onHeroHit(hit) {
    const R = this.R;
    const s = p => this.s(p);
    if (s('minion.you_hit_heal') > 0) { const h = R.heroPos(); for (const st of this.alive()) if (Math.hypot(st.summon.x - h.x, st.summon.y - h.y) <= 8) this.heal(st, s('minion.you_hit_heal')); }
    if (hit.critical) for (const t of this.t('minion_you_crit_damage')) { this.youCritUntil = R.time + t.params.duration; this.youCritValue = t.params.n; }
  }
  onFlask(amount) { const n = this.s('minion.flask_share'); if (n > 0) for (const st of this.alive()) this.heal(st, amount * n / 100); }
  /** 指令: the hero's casts order minions onto the marked target after the response time. */
  onHeroCast() {
    const R = this.R;
    const delay = 0.6 * Math.max(0, 1 - this.s('minion.command_response') / 100);
    for (const st of this.alive()) { st.commandAt = R.time + delay; st.commandTarget = R.marked.id; st.commanded = false; }
  }

  view() {
    return this.alive().map(st => ({ id: st.id, kind: st.kind, x: st.summon.x, y: st.summon.y, life: st.life, maxLife: st.maxLife, shield: st.shield, temp: st.temp, empowered: st.empowered }));
  }
}
