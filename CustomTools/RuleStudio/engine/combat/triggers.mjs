// 触发：触发词条在事件 / 累计 / 时间 / 场上条件满足时，施放缝合进来的“挂载技能”。处理概率、失败补偿、
// 冷却与储存次数、延迟、重复、额外触发、同一事件上限、挂载数量与顺序、目标选择、消耗与返还，以及
// 触发技能的伤害加成（连续 / 交替 / 累计层数 / 无法手动施放）。
import { INDEX_NONE } from '../types.mjs';
import { newBuild } from '../reader.mjs';
import { sourcesKey, withHeld } from '../library.mjs';
import { offenseSource } from '../character.mjs';

const CHANCE = new Set(['trig_cast', 'trig_cast_spell', 'trig_cast_attack', 'trig_hit', 'trig_crit', 'trig_kill', 'trig_execute', 'trig_hit_elite', 'trig_hit_full', 'trig_hit_low',
  'trig_taken_hit', 'trig_taken_crit', 'trig_block', 'trig_evade', 'trig_charge_spent', 'trig_charge_gained', 'trig_poison', 'trig_shock', 'trig_freeze', 'trig_ignite', 'trig_erosion',
  'trig_ailment_consumed', 'trig_pierce', 'trig_chain', 'trig_return', 'trig_summon_spawn', 'trig_summon_crit', 'trig_summon_death', 'trig_dodge']);
const COUNTS = { trig_hits_count: 'hits', trig_crits_count: 'crits', trig_kills_count: 'kills', trig_blocks_count: 'blocks', trig_evades_count: 'evades' };
const FLOWS = { trig_mana_spent: 'manaSpent', trig_life_spent: 'lifeSpent', trig_shield_spent: 'shieldSpent', trig_mana_restored: 'manaRestored', trig_damage_taken: 'hitTaken' };
const CHARACTER_EVENTS = { evade: 'trig_evade', block: 'trig_block', enter_low: 'trig_enter_low', life_full: 'trig_life_full', shield_broken: 'trig_shield_broken', shield_full: 'trig_shield_full',
  recharge_start: 'trig_recharge_start', lethal: 'trig_lethal', charge_spent: 'trig_charge_spent', charge_gained: 'trig_charge_gained', charge_max: 'trig_charge_max' };

export class Triggers {
  constructor(R) {
    this.R = R;
    this.queue = [];
    this.plans = new Map();
    this.last = { skill: '', streak: 0 };
    this.lastCombat = -Infinity;
    this.moveTime = 0;
    this.stillTime = 0;
    this.moved = 0;
    this.channel = 0;
    this.crowd = false;
    this.elites = new Set();
    this.ailmentFired = new Set();
    this.hitEver = new Set();
    this.fired = 0;
  }
  s(p) { return this.R.s(p); }
  list(name) { return this.R.c.triggers.filter(t => t.name === name); }
  rt(t) {
    if (!t.rt) t.rt = { cooldown: 0, charges: 1 + Math.floor(this.s('trigger.charges')), fail: 0, layers: 0, rotate: 0, acc: 0, recharge: 0 };
    return t.rt;
  }

  // ---------------------------------------------------------------- firing
  /** One occurrence of an event: every trigger with that name may fire (同一次事件上限). */
  event(name, ctx = {}) {
    let fired = 0;
    const limit = 1 + Math.floor(this.s('trigger.per_event'));
    for (const t of this.list(name)) {
      if (fired >= limit) break;
      if (this.tryFire(t, ctx)) ++fired;
    }
  }
  tryFire(t, ctx) {
    const R = this.R;
    const s = p => this.s(p);
    const rt = this.rt(t);
    if (CHANCE.has(t.name) && t.params.chance !== undefined) {
      if (!R.chance(t.params.chance + s('trigger.chance') + rt.fail)) { rt.fail += s('trigger.fail_bonus'); this.defer(t,ctx); return false; }
      rt.fail = 0;
    }
    if (rt.charges <= 0) { rt.layers = Math.min(10, rt.layers + 1); this.defer(t,ctx); return false; }
    rt.pending = null;
    if (!R.chance(s('trigger.keep_charge'))) --rt.charges;
    this.fire(t, ctx);
    if (R.chance(s('trigger.extra_chance'))) this.fire(t, ctx);
    return true;
  }

  // One retained real occurrence per trigger. No occurrence means no retry/cast.
  defer(t, ctx) {
    if (!this.s('trigger.store_event')) return;
    const rt = this.rt(t); rt.pending ||= { ...ctx }; rt.retryAt = this.R.time + .25;
  }

  /** Mounted skills of a trigger: each stitched active plus the stitched supports. */
  mounted(sources) {
    const actives = sources.filter(src => src.rules.some(rule => rule.event === 'cast'));
    const supports = sources.filter(src => !actives.includes(src));
    return actives.map(a => [a, ...supports]);
  }
  fire(t, ctx) {
    const R = this.R;
    const s = p => this.s(p);
    const skills = this.mounted(t.stitched || []).slice(0, 1 + Math.floor(s('trigger.mount')));
    if (!skills.length) return;
    const rt = this.rt(t);
    let chosen = skills;
    if (s('trigger.order_random')) chosen = [skills[Math.floor(R.rand() * skills.length)]];
    else if (s('trigger.order_rotate')) chosen = [skills[rt.rotate++ % skills.length]];
    const layers = rt.layers;
    rt.layers = 0;
    const delay = 0.1 * Math.max(0, 1 - s('trigger.delay') / 100);
    const repeats = 1 + Math.floor(s('trigger.repeat'));
    const gap = 0.2 * Math.max(0.05, 1 - s('trigger.repeat_interval') / 100);
    let k = 0;
    for (const sources of chosen) {
      for (let r = 0; r < repeats; ++r) this.queue.push({ at: R.time + delay + r * gap + (s('trigger.order_sequence') ? k * 0.15 : 0), sources, ctx, trigger: t, layers });
      ++k;
    }
    ++this.fired;
    R.c.totals.triggers++;
  }

  /** Character triggers (cast_on_shield_restored …) go through the same casting path. */
  castFromCharacter(request) { this.queue.push({ at: this.R.time, sources: this.mounted(request.sources)[0] || request.sources, ctx: {}, trigger: null, layers: 0 }); }

  cast(job) {
    const R = this.R;
    const s = p => this.s(p);
    const c = R.c;
    const w = R.world;
    const cost = 3 * Math.max(0, 1 - s('trigger.cost') / 100);
    if (c.mana < cost && !R.hero.god) { if (job.trigger) this.defer(job.trigger,job.ctx); return; }
    if (!R.hero.god) { c.mana -= cost; c.flow.manaSpent += cost; if (R.chance(s('trigger.refund'))) c.mana = Math.min(c.manaCap, c.mana + cost); }
    // Mounted skills keep their own attacks and inherit the equipped projectile
    // supports through ordinary trait aggregation (including redirect rules).
    const parent = R.host.planSources.get(R.heroPlan());
    const owner = w.owners[R.hero.owner];
    const held = owner ? R.host.heldSources(owner.statusId) : [];
    const supports = withHeld(parent?.traits || [], held).filter(source =>
      !source.rules.some(rule => rule.event === 'cast') && source.modifiers.some(modifier => modifier.stat.startsWith('projectile.')));
    const sources = withHeld(job.sources, supports);
    const key = sourcesKey(sources);
    if (!this.plans.has(key)) this.plans.set(key, R.host.compileSource(newBuild(sources[0].id, sources)).plan);
    let plan = this.plans.get(key);
    if (plan === INDEX_NONE) return;
    // Triggered player skills use the same existing offense aggregation as manual
    // casts. Summoning remains excluded: minions have their own inheritance rules.
    if (!R.skillFamily(plan).summon) {
      const offense = offenseSource(c.offense(), w.plans[plan].stats);
      if (offense) plan = R.host.planWithSources(plan, [offense]);
      if (plan === INDEX_NONE) return;
    }
    const shape = R.planSource(w.plans[plan], { minion: !!R.skillFamily(plan).summon, projectileOnly: true });
    if (shape) plan = R.host.planWithSources(plan, [shape]);
    // Position and target.
    const hero = R.heroPos();
    let ox = hero.x, oy = hero.y;
    if (s('trigger.at_event') && job.ctx.x !== undefined && Number.isFinite(job.ctx.x)) { ox = job.ctx.x; oy = job.ctx.y; }
    const range = 10 * (1 + s('trigger.seek') / 100);
    let target = null;
    if (s('trigger.at_source') && job.ctx.id) target = R.monster(job.ctx.id);
    const list = R.enemiesNear(ox, oy, range);
    if (!target && s('trigger.prefer_marked')) target = list.find(m => m.id === R.marked.id) || null;
    if (!target && s('trigger.prefer_elite')) target = list.find(m => m.elite) || null;
    if (!target && s('trigger.prefer_unhit')) target = list.find(m => !this.hitEver.has(m.id)) || null;
    if (!target) target = list[0] || null;
    if (s('trigger.at_self')) { ox = hero.x; oy = hero.y; }
    let dx = R.hero.aim?.x ?? 1, dy = R.hero.aim?.y ?? 0;
    if (target) { const a = Math.atan2(target.y / 100 - oy, target.x / 100 - ox); dx = Math.cos(a); dy = Math.sin(a); }
    if (!s('trigger.at_self') && !s('trigger.at_event') && target && R.skillFamily(plan).area) { ox = target.x / 100; oy = target.y / 100; }
    // Parabolic emits need a landing point as well as an origin/direction. Keep
    // the selected enemy, or the event snapshot after its target has disappeared.
    // Straight projectiles and area actions do not read this root field.
    const eventPoint = (job.ctx.id || s('trigger.at_event')) && Number.isFinite(job.ctx.x) && Number.isFinite(job.ctx.y)
      ? { x: job.ctx.x, y: job.ctx.y, z: 0 } : null;
    const aimPoint = R.hero.aimPoint;
    const targetPoint = target ? { x: target.x / 100, y: target.y / 100, z: 0 } : eventPoint
      || (Number.isFinite(aimPoint?.x) && Number.isFinite(aimPoint?.y) ? { x: aimPoint.x / 100, y: aimPoint.y / 100, z: 0 } : null);
    // Damage bonuses: 连续触发同一技能 / 依次触发不同技能 / 消耗累计层数.
    const id = job.sources[0].id;
    let more = 1;
    if (this.last.skill === id) { this.last.streak++; for (const t of this.list('trigger_streak')) more *= 1 + Math.min(t.params.max, t.params.n * this.last.streak) / 100; } else {
      if (this.last.skill) more *= 1 + s('trigger.variety') / 100;
      this.last.streak = 0;
    }
    this.last.skill = id;
    more *= 1 + job.layers * s('trigger.consume_layers') / 100;
    const root = w.cast(plan, R.hero.owner, ox, oy, 0.6, dx, dy, 0, BigInt(Math.floor(R.rand() * 1e9)), R.power, targetPoint, { manual: false });
    if (root !== INDEX_NONE) R.register(root, { kind: 'trigger', triggered: true, depth: 1, more, trigger: job.trigger });
  }

  // ---------------------------------------------------------------- event sources
  onDealt(hit) {
    const R = this.R;
    if (hit.dot) return;
    this.hitEver.add(hit.id);
    this.combat();
    if (hit.minion || hit.triggered || hit.info.strike) {
      if (hit.triggered && hit.killed && this.s('trigger.kill_restore') && hit.ri?.trigger) { const rt = this.rt(hit.ri.trigger); rt.charges = Math.min(1 + Math.floor(this.s('trigger.charges')), rt.charges + 1); }
      return;
    }
    const ctx = { x: hit.m ? hit.m.x / 100 : undefined, y: hit.m ? hit.m.y / 100 : undefined, id: hit.id };
    this.event('trig_hit', ctx);
    if (hit.critical) this.event('trig_crit', ctx);
    if (hit.killed) this.event('trig_kill', ctx);
    if (hit.killed && hit.info.executed) this.event('trig_execute', ctx);
    if (hit.m?.elite) this.event('trig_hit_elite', ctx);
    const life = hit.m ? (hit.m.health + hit.amount) / Math.max(1, hit.m.maxHealth) : 0;
    if (life >= 0.999) this.event('trig_hit_full', ctx);
    if (life <= 0.35) this.event('trig_hit_low', ctx);
    this.count('hits', 1, ctx);
    if (hit.critical) this.count('crits', 1, ctx);
    if (hit.killed) this.count('kills', 1, ctx);
    // 单次技能命中至少 n 个敌人
    if (hit.ri && !hit.ri.multiFired) for (const t of this.list('trig_multi_hit')) if (hit.ri.victims.size >= t.params.n) { hit.ri.multiFired = true; this.tryFire(t, ctx); }
  }
  count(kind, n, ctx) {
    for (const [name, k] of Object.entries(COUNTS)) {
      if (k !== kind) continue;
      for (const t of this.list(name)) {
        const per = Math.max(1, t.params.per - Math.floor(this.s('trigger.count_reduction')));
        t.acc = (t.acc || 0) + n;
        while (t.acc >= per) { t.acc -= per; this.tryFire(t, ctx); }
      }
    }
  }
  onCast(kind, pay) {
    const ctx = { x: this.R.heroPos().x, y: this.R.heroPos().y };
    this.combat();
    this.event('trig_cast', ctx);
    this.event(kind === 'attack' ? 'trig_cast_attack' : 'trig_cast_spell', ctx);
    const spent = (pay?.manaCost || 0) + (pay?.shieldCost || 0) + (pay?.lifeCost || 0);
    for (const t of this.list('trig_big_cost')) if (spent >= t.params.n) this.tryFire(t, ctx);
  }
  ailment(type, id, layers = 1) {
    const R = this.R;
    const m = R.monster(id);
    const ctx = { x: m ? m.x / 100 : undefined, y: m ? m.y / 100 : undefined, id };
    R.emitRuleEvent(`ailment_${type}`, { ...ctx, layers });
    const name = { poison: 'trig_poison', shock: 'trig_shock', freeze: 'trig_freeze', ignite: 'trig_ignite', erosion: 'trig_erosion', consumed: 'trig_ailment_consumed' }[type];
    if (name) this.event(name, ctx);
    if (type !== 'consumed' && type !== 'freeze') for (const t of this.list('trig_ailment_stacks')) {
      const key = `${id}|${type}`;
      if (layers >= t.params.n && !this.ailmentFired.has(key)) { this.ailmentFired.add(key); this.tryFire(t, ctx); }
      if (layers < t.params.n) this.ailmentFired.delete(key);
    }
  }
  combat() {
    const R = this.R;
    if (R.time - this.lastCombat >= 5) this.event('trig_combat_start', R.heroPos());
    this.lastCombat = R.time;
  }

  tick(dt) {
    const R = this.R;
    const s = p => this.s(p);
    const c = R.c;
    this.hitEver ||= new Set();
    // Cooldowns and stored charges.
    const cooldown = Math.max(0.05, 0.5 / Math.max(0.1, 1 + s('trigger.cooldown_recovery') / 100) - s('trigger.cooldown_flat'));
    const maxCharges = 1 + Math.floor(s('trigger.charges'));
    for (const t of c.triggers) {
      if (!t.name.startsWith('trig_')) continue;
      const rt = this.rt(t);
      if (rt.charges >= maxCharges) { rt.recharge = 0; continue; }
      rt.recharge += dt;
      while (rt.recharge >= cooldown && rt.charges < maxCharges) { rt.recharge -= cooldown; ++rt.charges; }
    }
    // Character events (闪避, 格挡, 受击, 低血, 回满, 击破, 回充, 抵挡致命, 充能, 药剂).
    for (const t of c.triggers) {
      if (!t.name.startsWith('trig_')) continue;
      const rt = this.rt(t);
      if (!s('trigger.store_event')) rt.pending = null;
      else if (rt.pending && rt.charges > 0 && (rt.retryAt || 0) <= R.time) this.tryFire(t,rt.pending);
    }
    const heroPos = R.heroPos();
    for (const e of c.combatEvents.splice(0)) {
      const attacker = e.attacker ? R.monster(e.attacker) : null;
      const ctx = { x: attacker ? attacker.x / 100 : heroPos.x, y: attacker ? attacker.y / 100 : heroPos.y, id: attacker?.id };
      if (e.type === 'hit_taken') { this.combat(); this.event('trig_taken_hit', ctx); if (e.critical) this.event('trig_taken_crit', ctx); continue; }
      if (e.type === 'flask') { R.minions.onFlask(e.amount); continue; }
      if (e.type === 'evade') { this.count('evades', 1, ctx); R.counter(attacker, 'evade'); }
      if (e.type === 'block') { this.count('blocks', 1, ctx); R.counter(attacker, 'block', e); }
      const name = CHARACTER_EVENTS[e.type];
      if (name) this.event(name, ctx);
    }
    // Resource flows (消耗 / 恢复 / 受到命中伤害 / 损失气血).
    for (const [name, key] of Object.entries(FLOWS)) {
      const amount = c.flow[key];
      if (!(amount > 0)) continue;
      for (const t of this.list(name)) {
        const per = Math.max(1, t.params.per * Math.max(0.1, 1 - s('trigger.resource_reduction') / 100));
        t.acc = (t.acc || 0) + amount;
        while (t.acc >= per) { t.acc -= per; this.tryFire(t, heroPos); }
      }
    }
    for (const t of this.list('trig_life_lost')) {
      const per = c.maxLife * Math.max(1, t.params.per * Math.max(0.1, 1 - s('trigger.resource_reduction') / 100)) / 100;
      t.acc = (t.acc || 0) + c.flow.lifeLost;
      while (t.acc >= per) { t.acc -= per; this.tryFire(t, heroPos); }
    }
    for (const key of Object.keys(c.flow)) c.flow[key] = 0;
    // Time, movement, crowds, elites, channelling.
    for (const t of this.list('trig_interval')) { t.acc = (t.acc || 0) + dt; if (t.acc >= Math.max(0.1, t.params.seconds)) { t.acc = 0; this.tryFire(t, heroPos); } }
    const moved = this.lastPos ? Math.hypot(heroPos.x - this.lastPos.x, heroPos.y - this.lastPos.y) : 0;
    this.lastPos = heroPos;
    for (const t of this.list('trig_distance')) { t.acc = (t.acc || 0) + moved; if (t.acc >= Math.max(0.5, t.params.meters)) { t.acc = 0; this.tryFire(t, heroPos); } }
    if (moved > 1e-4) { this.moveTime += dt; this.stillTime = 0; } else { this.stillTime += dt; this.moveTime = 0; }
    for (const t of this.list('trig_moving')) { if (this.moveTime >= t.params.seconds) { this.moveTime = 0; this.tryFire(t, heroPos); } }
    for (const t of this.list('trig_still')) { if (this.stillTime >= t.params.seconds) { this.stillTime = 0; this.tryFire(t, heroPos); } }
    const near = R.enemiesNear(heroPos.x, heroPos.y, 6).length;
    for (const t of this.list('trig_crowd')) { if (near >= t.params.n && !this.crowd) { this.crowd = true; this.tryFire(t, heroPos); } }
    if (near < Math.min(...this.list('trig_crowd').map(t => t.params.n), Infinity)) this.crowd = false;
    for (const t of this.list('trig_elite_near')) {
      for (const m of R.enemiesNear(heroPos.x, heroPos.y, t.params.meters)) if (m.elite && !this.elites.has(m.id)) { this.elites.add(m.id); this.tryFire(t, { x: m.x / 100, y: m.y / 100, id: m.id }); }
    }
    if (R.hero.casting) { this.channel += dt; for (const t of this.list('trig_channel')) { t.acc = (t.acc || 0) + dt; if (t.acc >= Math.max(0.1, t.params.seconds)) { t.acc = 0; this.tryFire(t, heroPos); } } } else { this.channel = 0; for (const t of this.list('trig_channel')) t.acc = 0; }
    // Queued casts (delay / repeat / sequence).
    const due = this.queue.filter(j => j.at <= R.time);
    this.queue = this.queue.filter(j => j.at > R.time);
    for (const job of due) this.cast(job);
  }
}
