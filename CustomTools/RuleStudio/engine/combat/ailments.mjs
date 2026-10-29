// 异常状态：中毒、侵蚀（每层独立计时，由运行时结算）、感电与点燃（层数镜像到规则世界的状态）、
// 冰缓 / 冻结（积累、残留、碎冰、冰刺）、燃烧地面 / 毒池 / 冰缓区域，以及传播、引爆、坍缩。
import { hashName, INDEX_NONE } from '../types.mjs';
import { E, KEYS } from './common.mjs';

const POISON_INTERVAL = 0.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Ailments {
  constructor(R) {
    this.R = R;
    this.poison = new Map();   // id -> {layers:[{dps, left, total, keeps, gen}], tick, cd, fired:Set}
    this.erosion = new Map();
    this.shock = new Map();    // id -> [{value, left}]
    this.ignite = new Map();   // id -> [{dps, left, total}]
    this.burnTime = new Map(); // id -> seconds burning continuously
    this.freezeBuild = new Map();
    this.frozen = new Map();   // id -> {shatterFrozen}
    this.fields = [];          // poison pools, burning ground, chill zones
    this.scheduled = [];       // delayed spreads
    this.shockApplied = 0;
    this.poisonApplied = 0;
    this.lastToVoid = new Map();
    this.pendingEffect = 0;
  }
  get world() { return this.R.world; }
  s(p) { return this.R.s(p); }
  t(n) { return this.R.t(n); }

  // ---------------------------------------------------------------- queries
  layers(id, name) {
    if (name === 'poison') return this.poison.get(id)?.layers.length || 0;
    if (name === 'erosion') return this.erosion.get(id)?.layers.length || 0;
    if (name === 'shock') return this.shockLayers(id);
    if (name === 'ignite') return this.ignite.get(id)?.length || 0;
    return 0;
  }
  shockLayers(id) { return (this.shock.get(id) || []).filter(l => l.left > 0).length; }
  isBurning(id) { return this.R.status(id, 'ignite') > 0 || this.fields.some(f => f.type === 'burn' && f.inside.has(id)) || this.R.grounds.fields.some(f => f.type === 'burn' && f.inside.has(id)); }
  /** Strongest slow on a target (percent): chill and other move-speed statuses. */
  slowOf(id) { return Math.max(0, -this.world.getStatusEffect(id, 4).value); }
  /** Target-side multipliers: 中毒改为提高承受的命中伤害, 持续燃烧的火焰承伤. */
  takenMultiplier(id, element) {
    let taken = 1;
    for (const t of this.t('poison_no_damage')) taken *= 1 + Math.min(60, t.params.n * this.layers(id, 'poison')) / 100;
    if (element === E.fire) for (const t of this.t('burn_timer')) taken *= 1 + Math.min(t.params.max, Math.floor((this.burnTime.get(id) || 0) / Math.max(0.1, t.params.seconds)) * t.params.n) / 100;
    return taken;
  }

  /** Mirrors a runtime-managed ailment onto the rule world's status (UI, conditions, DoT ticks). */
  mirror(id, key, value, stacks, remaining) {
    const w = this.world;
    const slot = `${id >>> 0}|${key}`;
    let st = w.statuses.get(slot);
    if (!(remaining > 0) || !(value > 0) || !(stacks > 0)) { if (st && st.targetId === (id >>> 0)) st.expire = Math.min(st.expire, w.clock); return; }
    if (!st) { st = { targetId: id >>> 0, key, hash: hashName(key), value: 0, expire: 0, stacks: 0, owner: INDEX_NONE, nextTick: 0 }; w.statuses.set(slot, st); }
    const def = w.statusDefs.get(key);
    const live = st.targetId === (id >>> 0) && st.expire > w.clock;
    if (!live && def && def.tickInterval > 0) st.nextTick = w.clock + def.tickInterval;
    Object.assign(st, { targetId: id >>> 0, value, stacks, expire: w.clock + remaining, owner: this.R.hero.owner });
  }

  // ---------------------------------------------------------------- statuses applied by rules (world hook)
  onStatusConsumed({ targetId: id, key, count }) {
    if (key === KEYS.shock || key === KEYS.ignite) {
      const store = key === KEYS.shock ? this.shock : this.ignite, list = store.get(id);
      if (list) { list.splice(0, count); if (!list.length) store.delete(id); }
      if (key === KEYS.shock) this.syncShock(id); else this.syncIgnite(id);
    } else if (key === KEYS.poison || key === KEYS.erosion) {
      const name = key === KEYS.poison ? 'poison' : 'erosion', st = this.store(name).get(id);
      if (st) st.layers.splice(0, count); this.syncLayers(id, name);
    } else if (key === KEYS.freeze) this.frozen.delete(id);
    if (this.R.monster(id) && Object.values(KEYS).includes(key)) this.R.triggers.ailment('consumed', id);
  }

  onStatus(targetId, key, value, duration, owner) {
    const R = this.R;
    if (owner !== R.hero.owner) return { value, duration };
    const s = p => this.s(p);
    const effect = 1 + this.pendingEffect / 100;
    if (key === KEYS.chill) return { value: value * (1 + s('chill.effect') / 100) * effect, duration: duration * (1 + (s('chill.duration') + s('frost.duration')) / 100) };
    if (key === KEYS.freeze) {
      const result = { value, duration: duration * (1 + (s('freeze.duration') + s('frost.duration')) / 100) };
      if (!this.frozen.has(targetId)) this.frozen.set(targetId, { shatterFrozen: !!this.shatterFreeze });
      R.triggers.ailment('freeze', targetId);
      return result;
    }
    if (key === KEYS.shock) { this.addShock(targetId, value * effect, duration); return null; }
    if (key === KEYS.ignite) { this.addIgnite(targetId, value * effect, duration); return null; }
    // Rule-authored poison uses the hit amount as its strength, then enters the same layered
    // poison runtime as chance-on-hit poison. The world mirror records layers, never another DoT.
    if (key === KEYS.poison) {
      this.applyPoison(targetId, { amount: value, element: E.poison, duration, effect: this.pendingEffect, critical: !!R.lastCrit.get(targetId) });
      return null;
    }
    return { value, duration };
  }

  addShock(id, value, duration) {
    const s = p => this.s(p);
    const crit = this.R.lastCrit.get(id) ? s('shock.crit_effect') : 0;
    value *= 1 + (s('shock.effect') + crit) / 100;
    duration *= 1 + s('shock.duration') / 100;
    const max = 1 + Math.max(0, s('shock.max_stacks'));
    const list = (this.shock.get(id) || []).filter(l => l.left > 0);
    const adding = 1 + Math.max(0, s('shock.extra_layers'));
    for (let i = 0; i < adding; ++i) {
      if (list.length < max) list.push({ value, left: duration });
      else { list.sort((a, b) => a.value - b.value || a.left - b.left); if (list[0].value <= value) list[0] = { value, left: duration }; }
    }
    this.shock.set(id, list);
    this.syncShock(id);
    this.R.triggers.ailment('shock', id, list.length);
    this.shockApplied += adding;
    for (const t of this.t('shock_layers_strike')) {
      t.acc = (t.acc || 0) + adding;
      while (t.acc >= Math.max(1, t.params.per)) {
        t.acc -= Math.max(1, t.params.per);
        const p = this.R.targetPos(id);
        if (p) this.R.strike(p.x, p.y, 1.5 * this.R.areaScale({ element: E.lightning }), this.R.power * 2, E.lightning, { effect: 'lightning_strike', depth: 2 });
      }
    }
  }
  syncShock(id) {
    const list = (this.shock.get(id) || []).filter(l => l.left > 0);
    const value = list.length ? list.reduce((sum, l) => sum + l.value, 0) / list.length : 0;
    this.mirror(id, KEYS.shock, value, list.length, Math.max(0, ...list.map(l => l.left)));
  }
  consumeShock(id) {
    if (!this.shockLayers(id)) return;
    this.shock.delete(id);
    this.mirror(id, KEYS.shock, 0, 0, 0);
    this.R.triggers.ailment('consumed', id);
  }

  addIgnite(id, dps, duration) {
    const s = p => this.s(p);
    const crit = this.R.lastCrit.get(id) ? s('ignite.crit') : 0;
    const speed = Math.max(0.1, 1 + s('ignite.speed') / 100);
    dps = (dps + s('ignite.base')) * (1 + (s('ignite.damage') + crit) / 100) * speed;
    duration = duration * (1 + s('ignite.duration') / 100) / speed;
    const max = 1 + Math.max(0, s('ignite.max_stacks'));
    const list = (this.ignite.get(id) || []).filter(l => l.left > 0);
    if (list.length < max) list.push({ dps, left: duration });
    else { list.sort((a, b) => a.dps - b.dps); if (list[0].dps <= dps) list[0] = { dps, left: duration }; else list[0].left = Math.max(list[0].left, duration * 0); }
    this.ignite.set(id, list);
    this.syncIgnite(id);
    this.R.triggers.ailment('ignite', id, list.length);
  }
  syncIgnite(id) {
    const list = (this.ignite.get(id) || []).filter(l => l.left > 0);
    const total = list.reduce((sum, l) => sum + l.dps, 0);
    this.mirror(id, KEYS.ignite, list.length ? total / list.length : 0, list.length, Math.max(0, ...list.map(l => l.left)));
  }
  igniteRemaining(id) { return (this.ignite.get(id) || []).reduce((sum, l) => sum + l.dps * Math.max(0, l.left), 0); }

  // ---------------------------------------------------------------- layered DoTs: 中毒 / 侵蚀
  store(name) { return name === 'poison' ? this.poison : this.erosion; }
  removeLayers(id, name, count) {
    const st = this.store(name).get(id);
    if (!st || !st.layers.length) return 0;
    st.layers.sort((a, b) => a.left - b.left);
    const removed = st.layers.splice(0, Math.min(count, st.layers.length));
    this.syncLayers(id, name);
    if (removed.length) this.R.triggers.ailment('consumed', id);
    return removed.length;
  }
  remaining(id, name) { return (this.store(name).get(id)?.layers || []).reduce((sum, l) => sum + l.dps * (Number.isFinite(l.left) ? Math.max(0, l.left) : 4), 0); }
  syncLayers(id, name) {
    const st = this.store(name).get(id);
    const list = st?.layers || [];
    const remaining = list.length ? Math.max(...list.map(l => (Number.isFinite(l.left) ? l.left : 60))) : 0;
    this.mirror(id, KEYS[name], 1, list.length, remaining);
    if (st && !list.length) this.store(name).delete(id);
  }

  /** Poison layers from a hit (or spread). opts: {amount, element, critical, spread gen, layers, effect}. */
  applyPoison(id, opts) {
    const s = p => this.s(p);
    const R = this.R;
    const m = R.monster(id);
    if (!m) return;
    const st = this.poison.get(id) || { layers: [], tick: 0, cd: 0, fired: new Set() };
    const already = st.layers.length;
    const share = opts.element === E.physical ? s('poison.from_physical') : opts.element === E.void ? s('poison.from_void') : [E.fire, E.frost, E.lightning].includes(opts.element) ? s('poison.from_elemental') : 0;
    let increased = s('poison.damage') + (opts.critical ? s('poison.crit_damage') : 0) + (opts.effect || 0);
    const life = R.lifeFraction(m);
    if (life >= 0.999) increased += s('poison.vs_full');
    if (life <= 0.35) increased += s('poison.vs_low');
    if (R.status(id, 'bleed') > 0) increased += s('poison.vs_bleed');
    if (R.status(id, 'shock') > 0) increased += s('poison.vs_shock');
    for (const t of this.t('poison_per_layer')) increased += Math.min(t.params.max, t.params.n * already);
    if (opts.spread) increased += s('poison.spread_damage');
    if (opts.minion) increased += s('minion.dot');
    let more = s('poison.more');
    for (const t of this.t('poison_threshold_more')) if (already >= t.params.stacks) more *= 1 + t.params.n / 100;
    if (s('poison.single_layer')) more *= 1 + s('poison.single_layer') / 100;
    if (s('poison.unlimited')) more *= Math.max(0, 1 - s('poison.unlimited') / 100);
    let speed = 1 + s('poison.speed') / 100;
    let durationScale = 1 + s('poison.duration') / 100 + (R.status(id, 'chill') > 0 ? s('poison.vs_chill_duration') / 100 : 0) + (opts.spread ? s('poison.spread_duration') / 100 : 0);
    for (const t of this.t('poison_threshold_duration')) if (already >= t.params.stacks) durationScale += t.params.n / 100;
    for (const t of this.t('poison_quick')) { durationScale *= Math.max(0.05, 1 - t.params.duration / 100); speed *= 1 + t.params.speed / 100; }
    speed = Math.max(0.1, speed);
    const dps = Math.max(0, (s('poison.base') + (opts.amount || 0) * (20 + share) / 100) * (1 + increased / 100) * more) * speed;
    const eternal = this.t('poison_eternal');
    const duration = eternal.length ? Infinity : (opts.duration ?? 2) * Math.max(0.05, durationScale) / speed;
    if (!(dps > 0)) return;
    let count = opts.layers ?? (1 + s('poison.extra_layers') + (already > 0 ? s('poison.extra_on_poisoned') : 0));
    if (!opts.spread && R.chance(s('poison.double_chance'))) count *= 2;
    if (opts.spread) count += s('poison.spread_layers');
    const max = s('poison.single_layer') ? 1 : eternal.length ? Math.min(...eternal.map(t => t.params.n)) : s('poison.unlimited') ? 200 : 10 + s('poison.max_stacks');
    // Existing layers: 刷新 / 延长.
    if (s('poison.refresh')) for (const l of st.layers) l.left = Math.max(l.left, duration);
    if (s('poison.extend') > 0) for (const l of st.layers) l.left = Math.min(l.left + s('poison.extend'), 6 / speed);
    if (s('poison.merge') && st.layers.length) {
      const total = st.layers.reduce((sum, l) => sum + l.dps * (Number.isFinite(l.left) ? l.left : duration), 0) + dps * duration * count;
      st.layers = [{ dps: total / duration, left: duration, total, keeps: 0, gen: opts.gen || 0 }];
    } else {
      for (let i = 0; i < count; ++i) {
        const layer = { dps, left: duration, total: dps * (Number.isFinite(duration) ? duration : 4), keeps: 0, gen: opts.gen || 0 };
        if (st.layers.length < max) { st.layers.push(layer); continue; }
        if (s('poison.single_layer')) { if (st.layers[0].dps <= dps) st.layers[0] = layer; continue; }
        // Full: replace the weakest (中毒优先替换伤害最低的一层) or the oldest.
        let index = 0;
        if (s('poison.replace_lowest')) { for (let k = 1; k < st.layers.length; ++k) if (st.layers[k].dps < st.layers[index].dps) index = k; } else { for (let k = 1; k < st.layers.length; ++k) if (st.layers[k].left < st.layers[index].left) index = k; }
        st.layers[index] = layer;
      }
    }
    this.poison.set(id, st);
    this.syncLayers(id, 'poison');
    if (s('poison.self')) { const c = R.c; if (c.selfPoison.length < 10) c.selfPoison.push({ left: 2 }); }
    // Accumulations and thresholds.
    this.poisonApplied += count;
    for (const t of this.t('poison_layers_empower')) {
      t.acc = (t.acc || 0) + count;
      while (t.acc >= Math.max(1, t.params.per)) { t.acc -= Math.max(1, t.params.per); R.c.pendingEmpower += t.params.n; }
    }
    R.triggers.ailment('poison', id, st.layers.length);
    for (const t of this.t('poison_threshold_detonate')) if (st.layers.length >= t.params.stacks) this.detonate(id, Infinity);
  }

  applyErosion(id, opts) {
    const s = p => this.s(p);
    const st = this.erosion.get(id) || { layers: [], tick: 0, cd: 0, fired: new Set() };
    const dps = (s('erosion.base') + (opts.amount || 0) * 0.15) * (1 + (s('erosion.damage') + (opts.effect || 0) + (opts.minion ? s('minion.dot') : 0)) / 100);
    const duration = 3 * (1 + s('erosion.duration') / 100);
    if (!(dps > 0)) return;
    const count = opts.layers ?? (1 + s('erosion.extra_layers'));
    const max = 5 + s('erosion.max_stacks');
    for (let i = 0; i < count; ++i) {
      const layer = { dps, left: duration, total: dps * duration, keeps: 0, gen: 0 };
      if (st.layers.length < max) st.layers.push(layer);
      else { let index = 0; for (let k = 1; k < st.layers.length; ++k) if (st.layers[k].left < st.layers[index].left) index = k; st.layers[index] = layer; }
    }
    this.erosion.set(id, st);
    this.syncLayers(id, 'erosion');
    this.R.triggers.ailment('erosion', id, st.layers.length);
    for (const t of this.t('erosion_collapse')) if (st.layers.length >= t.params.stacks) this.collapse(id, false);
  }

  /** 虚空坍缩: consumes erosion, void area at the target. */
  collapse(id, fromExecute) {
    const R = this.R;
    const p = R.targetPos(id);
    if (!p) return;
    if (!fromExecute) this.removeLayers(id, 'erosion', Infinity);
    R.strike(p.x, p.y, 2.5 * Math.sqrt(1 + this.s('collapse.area') / 100) * R.areaScale({ element: E.void }), R.power * 1.5 * (1 + this.s('collapse.damage') / 100), E.void, { effect: 'void_collapse', depth: 2 });
  }

  /** 毒素引爆: consumes layers on a target; poison area damage from their remaining damage. */
  detonate(id, layers, force = false) {
    const s = p => this.s(p);
    const R = this.R;
    const st = this.poison.get(id);
    if (!st || !st.layers.length || this.detonating) return;
    if (!force && st.cd > 0) return;
    this.detonating = true;
    try { this.detonateNow(id, st, layers); } finally { this.detonating = false; }
  }
  detonateNow(id, st, layers) {
    const s = p => this.s(p);
    const R = this.R;
    st.cd = 1 / Math.max(0.1, 1 + s('poison.detonate_cooldown') / 100);
    st.layers.sort((a, b) => b.dps * b.left - a.dps * a.left);
    const taken = st.layers.slice(0, Math.min(layers, st.layers.length));
    const remaining = taken.reduce((sum, l) => sum + l.dps * (Number.isFinite(l.left) ? l.left : 4), 0);
    if (!R.chance(s('poison.detonate_keep_chance'))) st.layers = st.layers.slice(taken.length);
    this.syncLayers(id, 'poison');
    const p = R.targetPos(id);
    if (!p) return;
    const burning = this.isBurning(id) ? s('poison.detonate_vs_burning') : 0;
    const amount = remaining * (60 + s('poison.detonate_ratio')) / 100 * (1 + (s('poison.detonate_damage') + burning) / 100);
    const hits = R.strike(p.x, p.y, 2 * Math.sqrt(1 + s('poison.detonate_area') / 100) * R.areaScale(), amount, E.poison, { effect: 'poison_detonate', depth: 2, tags: ['poison'] });
    R.triggers.ailment('consumed', id);
    for (const h of hits) if (h.killed) for (const t of this.t('poison_detonate_spread')) this.spreadLayers(h.m.id, 'poison', t.params.n, 3);
  }

  /** Copies n layers from a target onto nearby enemies (传播). origin: {x, y, avg} captured earlier (dead targets). */
  spreadLayers(fromId, name, count, radius, targets = 2, gen = 0, origin = null) {
    const R = this.R;
    const p = origin || R.targetPos(fromId);
    if (!p) return;
    const source = this.store(name).get(fromId);
    const avg = origin?.avg ?? (source && source.layers.length ? source.layers.reduce((sum, l) => sum + l.dps, 0) / source.layers.length : R.power * 0.2);
    for (const m of R.enemiesNear(p.x, p.y, radius, new Set([fromId])).slice(0, targets)) {
      if (name === 'poison') this.applyPoison(m.id, { amount: avg * 5, layers: count, spread: true, gen });
      else this.applyErosion(m.id, { amount: avg / 0.15, layers: count });
    }
  }
  poisonSpread(fromId, count, gen) {
    const s = p => this.s(p);
    if (gen > s('poison.spread_times')) return;
    const delay = 0.3 * Math.max(0, 1 - s('poison.spread_interval') / 100);
    // The source may die before the delay ends: keep its position and layer strength now.
    const p = this.R.targetPos(fromId);
    if (!p) return;
    const layers = this.poison.get(fromId)?.layers || [];
    const origin = { x: p.x, y: p.y, avg: layers.length ? layers.reduce((sum, l) => sum + l.dps, 0) / layers.length : this.R.power * 0.2 };
    this.scheduled.push({ at: this.R.time + delay, run: () => this.spreadLayers(fromId, 'poison', Math.max(1, count), 3 + s('poison.spread_radius'), 2 + s('poison.spread_targets'), gen + 1, origin) });
  }

  // ---------------------------------------------------------------- hit / kill handling
  /** Ailment chance / effect bonus of a hit's delivery (投射物 / 范围 / 召唤物 / 触发). */
  deliveryBonus(hit) {
    const s = p => this.s(p);
    let chance = 0, effect = 0;
    if (hit.projectile) { chance += s('proj.ailment_chance'); effect += s('proj.ailment_effect'); }
    if (hit.area) { chance += s('area.ailment_chance'); effect += s('area.ailment_effect'); }
    if (hit.minion) { chance += s('minion.ailment_chance'); effect += s('minion.ailment_effect'); }
    if (hit.triggered) effect += s('trigger.effect');
    return { chance, effect };
  }

  onHit(hit) {
    const s = p => this.s(p);
    const R = this.R;
    const id = hit.id;
    if (hit.dot) { if (hit.killed) this.onKill(hit); return; }
    const bonus = this.deliveryBonus(hit);
    this.pendingEffect = bonus.effect;
    const heroOwner = R.hero.owner;
    const el = hit.element;
    // Derived damage (explosions, detonations, extra / converted parts) does not roll ailments again:
    // 毒伤跳动、引爆与额外伤害默认不再次施加异常。
    if (hit.silent) { this.pendingEffect = 0; if (hit.killed) this.onKill(hit); return; }
    if (R.chance(s('poison.chance') + bonus.chance) && !hit.killed) this.applyPoison(id, { amount: hit.amount, element: el, critical: hit.critical, effect: bonus.effect, minion: hit.minion });
    if (!hit.killed) {
      if (R.chance(s('shock.chance') + (el === E.lightning ? bonus.chance : 0))) this.world.applyStatusKey(id, KEYS.shock, 20, 3, heroOwner);
      if (R.chance(s('chill.chance') + (el === E.frost ? bonus.chance : 0))) this.world.applyStatusKey(id, KEYS.chill, 30, 2, heroOwner);
      if (R.chance(s('ignite.chance') + (el === E.fire ? bonus.chance : 0))) this.world.applyStatusKey(id, KEYS.ignite, hit.amount * 0.4, 4, heroOwner);
      if (R.chance(s('erosion.chance') + (el === E.void ? bonus.chance : 0))) this.applyErosion(id, { amount: hit.amount, effect: bonus.effect, minion: hit.minion });
      if (el === E.frost) this.buildFreeze(hit);
    }
    this.pendingEffect = 0;
    const st = this.poison.get(id);
    if (st?.layers.length && !hit.info.strike) {
      for (const t of this.t('poison_hit_detonate')) if (R.chance(t.params.chance)) this.detonate(id, t.params.layers);
      if (hit.critical) for (const t of this.t('poison_crit_detonate')) if (R.chance(t.params.chance)) this.detonate(id, t.params.layers);
      if (hit.critical && R.chance(s('poison.crit_spread_chance'))) this.poisonSpread(id, Math.ceil(st.layers.length / 2), 0);
      // 中毒剩余伤害的 n% 转化为命中附加虚空伤害（不消耗，同一目标每 0.5 秒一次）
      if (s('poison.to_void') > 0 && (this.lastToVoid.get(id) ?? -1) + 0.5 <= R.time) {
        this.lastToVoid.set(id, R.time);
        R.hit(id, this.remaining(id, 'poison') * s('poison.to_void') / 100, E.void, { effect: 'poison_to_void' });
      }
    }
    // 消耗点燃 / 侵蚀
    if (!hit.info.strike) {
      if (el === E.fire && (this.ignite.get(id) || []).length) for (const t of this.t('ignite_consume')) {
        R.hit(id, this.igniteRemaining(id) * t.params.n / 100, E.fire, { effect: 'ignite_consume' });
        if (!R.chance(s('ignite.keep_chance'))) { this.ignite.delete(id); this.syncIgnite(id); }
        R.triggers.ailment('consumed', id);
      }
      if (el === E.void && this.layers(id, 'erosion')) for (const t of this.t('erosion_consume_all')) {
        R.hit(id, this.remaining(id, 'erosion') * t.params.n / 100, E.void, { effect: 'erosion_consume' });
        this.removeLayers(id, 'erosion', Infinity);
      }
    }
    // 感电：电弧，闪电连锁
    if (R.status(id, 'shock') > 0 && R.chance(s('shock.arc_chance')) && hit.depth < 2) {
      const p = R.targetPos(id);
      const next = p && R.enemiesNear(p.x, p.y, 5, new Set([id]))[0];
      if (next) R.strike(next.x / 100, next.y / 100, 0.01, hit.amount * 0.5, E.lightning, { only: next.id, area: false, effect: 'arc', depth: hit.depth + 1 });
    }
    if (el === E.lightning && s('chain.count') > 0 && !hit.info.chain && hit.depth < 2) this.chain(hit);
    // 冰冻目标：冰刺，打破冻结
    if (R.status(id, 'freeze') > 0 && !hit.info.strike) {
      for (const t of this.t('frozen_spikes')) R.projectiles.fire({ x: hit.m.x / 100, y: hit.m.y / 100, count: t.params.n, radial: true, damage: hit.amount * 0.4, element: E.frost, tags: ['cold', 'frost'], kind: 'ice_lance', exclude: id });
      if (hit.m && hit.amount >= hit.m.maxHealth * 0.1) {
        if (s('freeze.break_damage') > 0) R.hit(id, s('freeze.break_damage'), E.frost, { effect: 'freeze_break' });
        if (s('freeze.break_damage') > 0) this.removeFreeze(id, true);
      }
    }
    if (hit.killed) this.onKill(hit);
  }

  /** 闪电连锁: successive hops to nearby enemies, damage decaying per hop. */
  chain(hit) {
    const s = p => this.s(p);
    const R = this.R;
    let hops = Math.floor(s('chain.count'));
    const range = 4 * (1 + s('chain.distance') / 100);
    const decay = 0.2 * Math.max(0, 1 - s('chain.decay') / 100);
    const hitSet = new Set([hit.id]);
    let from = hit.id, previous = hit.id, amount = hit.amount, k = 0;
    while (hops > 0) {
      const p = R.targetPos(from);
      if (!p) break;
      const exclude = s('chain.rehit') ? new Set([from, previous]) : new Set([...hitSet]);
      const next = R.enemiesNear(p.x, p.y, range, exclude)[0];
      if (!next) break;
      ++k; --hops;
      amount = hit.amount * Math.pow(1 - decay, k);
      R.strike(next.x / 100, next.y / 100, 0.01, amount, E.lightning, { only: next.id, area: false, effect: 'chain', depth: hit.depth + 1, info: { chain: true } });
      hitSet.add(next.id);
      previous = from; from = next.id;
    }
    if (hops > 0 && s('chain.overflow')) R.strike(0, 0, 0.01, amount * 0.2 * hops, E.lightning, { only: from, area: false, effect: 'chain', depth: hit.depth + 1, info: { chain: true } });
  }

  /** 冻结积累 (enabled by any freeze build-up affix). */
  buildFreeze(hit) {
    const s = p => this.s(p);
    const R = this.R;
    if (!(s('freeze.buildup') || s('freeze.threshold') || s('freeze.elite')) || !hit.m) return;
    const efficiency = (1 + s('freeze.buildup') / 100) * (hit.m.elite ? 0.5 * (1 + s('freeze.elite') / 100) : 1);
    const value = (this.freezeBuild.get(hit.id) || 0) + hit.amount / Math.max(1, hit.m.maxHealth) * 100 * efficiency;
    const threshold = 100 * Math.max(0.1, 1 - s('freeze.threshold') / 100);
    if (value >= threshold && R.status(hit.id, 'freeze') <= 0) {
      this.freezeBuild.set(hit.id, 0);
      this.world.applyStatusKey(hit.id, KEYS.freeze, 1, 1, R.hero.owner);
    } else this.freezeBuild.set(hit.id, Math.min(value, threshold * 2));
  }
  removeFreeze(id, consumed) {
    const st = this.world.statuses.get(`${id >>> 0}|${KEYS.freeze}`);
    if (st && st.expire > this.world.clock) st.expire = this.world.clock;
    if (consumed) this.R.triggers.ailment('consumed', id);
  }

  onKill(hit) {
    const s = p => this.s(p);
    const R = this.R;
    const id = hit.id;
    const m = hit.m;
    const p = m ? { x: m.x / 100, y: m.y / 100 } : null;
    if (!p) return;
    const poisonLayers = this.layers(id, 'poison');
    if (poisonLayers > 0) {
      R.c.recover('life', s('poison.kill_life')); R.c.recover('mana', s('poison.kill_mana')); R.c.recover('shield', s('poison.kill_shield'));
      if (R.chance(s('poison.kill_spread_chance'))) this.poisonSpread(id, Math.ceil(poisonLayers / 2), Math.max(...this.poison.get(id).layers.map(l => l.gen)));
      for (const t of this.t('poison_death_copy')) this.spreadLayers(id, 'poison', Math.min(t.params.n, poisonLayers), 3 + s('poison.spread_radius'), 2 + s('poison.spread_targets'), 1);
      for (const t of this.t('poison_pool')) {
        const rate = Math.min(1, ...this.t('poison_pool_rate').map(r => r.params.seconds));
        const avg = this.poison.get(id).layers.reduce((sum, l) => sum + l.dps, 0) / poisonLayers;
        this.fields.push({ type: 'poison', x: p.x, y: p.y, radius: 2 * Math.sqrt(1 + s('poison.pool_area') / 100), left: t.params.seconds * (1 + s('poison.pool_duration') / 100), interval: Math.max(0.1, rate), tick: 0, dps: avg, inside: new Set() });
      }
    }
    if (this.isBurning(id)) {
      if (R.chance(s('burn.explode_chance'))) {
        const life = (m.maxHealth || 0) * s('burn.explode_life') / 100 * (m.elite ? 0.5 : 1);
        R.strike(p.x, p.y, 2.5 * Math.sqrt(1 + s('burn.explode_area') / 100) * R.areaScale({ element: E.fire }), R.power * (1 + s('burn.explode_damage') / 100) + life, E.fire, { effect: 'fire_explosion', depth: 2, exclude: new Set([id]) });
      }
      for (const t of this.t('burn_ground')) this.fields.push({ type: 'burn', x: p.x, y: p.y, radius: 2, left: t.params.seconds * (1 + s('burn.ground_duration') / 100), interval: 0.5, tick: 0, dps: R.power * 0.3 * (1 + s('burn.ground_damage') / 100), inside: new Set() });
    }
    if ((this.ignite.get(id) || []).length && s('ignite.kill_spread')) {
      const list = this.ignite.get(id);
      for (const n of R.enemiesNear(p.x, p.y, 3 + s('ignite.spread_radius'), new Set([id])).slice(0, 2 + s('ignite.spread_targets'))) {
        for (const l of list) this.addIgnite(n.id, l.dps / Math.max(0.1, 1 + s('ignite.speed') / 100) / (1 + s('ignite.damage') / 100), 4);
      }
    }
    if (R.status(id, 'shock') > 0) {
      if (R.chance(s('shock.kill_wave_chance'))) R.strike(p.x, p.y, 3 * R.areaScale({ element: E.lightning }), R.power, E.lightning, { effect: 'shock_wave', depth: 2, exclude: new Set([id]) });
      for (const t of this.t('shock_kill_spread')) {
        const value = (this.shock.get(id) || [])[0]?.value || 20;
        for (const n of R.enemiesNear(p.x, p.y, 3 + s('shock.spread_radius'), new Set([id])).slice(0, t.params.n)) this.world.applyStatusKey(n.id, KEYS.shock, value / (1 + s('shock.effect') / 100), 3, R.hero.owner);
      }
    }
    // 碎冰
    if (R.status(id, 'freeze') > 0 && s('shatter.on_kill') && !this.frozen.get(id)?.shatterFrozen) {
      const hits = R.strike(p.x, p.y, 2.5 * Math.sqrt(1 + s('shatter.area') / 100) * R.areaScale({ element: E.frost }), m.maxHealth * 0.2 * (1 + s('shatter.damage') / 100), E.frost, { effect: 'shatter', depth: 2, exclude: new Set([id]), tags: ['cold', 'frost'] });
      this.shatterFreeze = true;
      for (const h of hits) if (!h.killed && R.chance(s('shatter.freeze_chance'))) { this.world.applyStatusKey(h.m.id, KEYS.freeze, 1, 1, R.hero.owner); this.frozen.set(h.m.id, { shatterFrozen: true }); }
      this.shatterFreeze = false;
    }
    this.forget(id);
  }

  forget(id) {
    this.poison.delete(id); this.erosion.delete(id); this.shock.delete(id); this.ignite.delete(id);
    this.burnTime.delete(id); this.freezeBuild.delete(id); this.frozen.delete(id); this.lastToVoid.delete(id);
  }

  // ---------------------------------------------------------------- per frame
  tick(dt) {
    const s = p => this.s(p);
    const R = this.R;
    const owner = R.hero.owner;
    for (const job of this.scheduled.filter(j => j.at <= R.time)) job.run();
    this.scheduled = this.scheduled.filter(j => j.at > R.time);
    for (const [name, store] of [['poison', this.poison], ['erosion', this.erosion]]) {
      const element = name === 'poison' ? E.poison : E.void;
      const interval = name === 'poison' ? POISON_INTERVAL / Math.max(0.1, 1 + s('poison.frequency') / 100) : 0.5;
      for (const [id, st] of store) {
        if (!R.monster(id)) { store.delete(id); continue; }
        st.cd = Math.max(0, (st.cd || 0) - dt);
        st.tick += dt;
        const silent = name === 'poison' && (s('poison.burst_end') || this.t('poison_no_damage').length);
        while (st.tick >= interval) {
          st.tick -= interval;
          const amount = st.layers.reduce((sum, l) => sum + (l.left > 0 ? l.dps : 0), 0) * interval;
          if (!silent && amount > 0) R.world.hostDot(owner, id, amount, element);
        }
        let changed = false;
        for (const l of st.layers) l.left -= dt;
        const ended = st.layers.filter(l => l.left <= 0);
        if (ended.length) {
          changed = true;
          st.layers = st.layers.filter(l => l.left > 0);
          for (const l of ended) {
            if (name === 'poison') {
              if (l.keeps < 3 && R.chance(s('poison.keep_chance'))) { l.keeps++; l.left = l.total / Math.max(1e-9, l.dps); st.layers.push(l); continue; }
              if (s('poison.burst_end')) R.world.hostDot(owner, id, l.total, element);
              if (s('poison.end_burst') > 0) R.world.hostDot(owner, id, l.total * s('poison.end_burst') / 100, element);
            }
          }
        }
        if (changed) this.syncLayers(id, name);
      }
    }
    for (const [id, list] of this.shock) {
      for (const l of list) l.left -= dt;
      if (list.some(l => l.left <= 0)) { this.shock.set(id, list.filter(l => l.left > 0)); this.syncShock(id); }
      if (!this.shock.get(id)?.length) this.shock.delete(id);
    }
    for (const [id, list] of this.ignite) {
      for (const l of list) l.left -= dt;
      if (list.some(l => l.left <= 0)) { this.ignite.set(id, list.filter(l => l.left > 0)); this.syncIgnite(id); }
      if (!this.ignite.get(id)?.length) this.ignite.delete(id);
    }
    // Frozen targets: residual chill and chill zone when the freeze ends.
    for (const [id, data] of this.frozen) {
      if (R.status(id, 'freeze') > 0) continue;
      this.frozen.delete(id);
      const p = R.targetPos(id);
      if (!p || !R.monster(id)) continue;
      if (s('freeze.residual_chill') > 0) this.world.applyStatusKey(id, KEYS.chill, 30, s('freeze.residual_chill'), owner);
      for (const t of this.t('freeze_end_zone')) this.fields.push({ type: 'chill', x: p.x, y: p.y, radius: 2, left: t.params.seconds, interval: 0.5, tick: 0, inside: new Set() });
      void data;
    }
    // Fields: poison pools, burning ground, chill zones.
    for (const f of this.fields) {
      f.left -= dt;
      f.tick += dt;
      f.inside = new Set(R.enemiesNear(f.x, f.y, f.radius).map(m => m.id));
      if (f.tick < f.interval) continue;
      f.tick -= f.interval;
      for (const id of f.inside) {
        if (f.type === 'poison') this.applyPoison(id, { amount: f.dps * 5, layers: 1, spread: false });
        else if (f.type === 'burn') R.world.hostDot(owner, id, f.dps * f.interval, E.fire);
        else this.world.applyStatusKey(id, KEYS.chill, 30, 1, owner);
      }
    }
    this.fields = this.fields.filter(f => f.left > 0);
    // Burning timers (敌人持续燃烧每满 n 秒 …).
    for (const m of R.arena.monsters) {
      if (this.isBurning(m.id)) this.burnTime.set(m.id, (this.burnTime.get(m.id) || 0) + dt);
      else this.burnTime.delete(m.id);
    }
  }

  /** Render data for fields (pools, ground, chill zones), meters. */
  view() { return this.fields.map(f => ({ type: f.type, x: f.x, y: f.y, radius: f.radius, left: f.left })); }
}

export { clamp };
