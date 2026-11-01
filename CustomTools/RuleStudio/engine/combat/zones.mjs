// 范围技能：技能主范围（施放事件上的 damage_area）由运行时接管为“区域”——形状（圆 / 环 / 扇 / 直线）、
// 落点、延迟、重复、扩散、额外区域、持续 / 跟随 / 移动 / 脉冲、牵引推开、结束爆炸与地面，以及
// 中心 / 边缘 / 衰减 / 重叠 / 连续命中等逐目标伤害修正。其他范围（爆炸、哨卫新星）按元素等面积词条缩放。
import { EBuiltinEvent, INDEX_NONE } from '../types.mjs';
import { E, MINION_BASE as BASE } from './common.mjs';
import { createAreaRoaming, stepAreaRoaming } from './area-roaming.mjs';

const TWO_PI = Math.PI * 2;
const RUNTIME_KEYS = new Set(['id', 't', 'tick', 'fired', 'repeatIndex', 'repeatsLeft', 'spreadsLeft', 'spreadRadius', 'nextAt', 'hitCounts', 'lastHit', 'stay', 'hitIds',
  'killSpreads', 'phase', 'currentRadius', 'ended', 'nextSpread', 'interval', 'maxRadius', 'roaming']);
const wrap = a => { while (a > Math.PI) a -= TWO_PI; while (a < -Math.PI) a += TWO_PI; return a; };

export class Zones {
  constructor(R) {
    this.R = R;
    this.zones = [];
    this.nextId = 1;
    this.recentHits = new Map(); // `${root}|${id}` -> {zone, time}
  }
  s(p) { return this.R.s(p); }

  /** World hook for every damage_area. Returns true when the runtime handles it. */
  onArea(request) {
    const R = this.R;
    const { context } = request;
    if (!R.isHeroRoot(context.root)) return false;
    const plan = context.plan;
    const ri = R.rootInfo(context.rootIndex);
    const minion = !!ri?.minion || R.hasTag(plan, request.base.tags, 'summon');
    const triggered = !!ri?.triggered;
    const primary = context.event.type === EBuiltinEvent.Cast && !minion && (ri?.kind === 'cast' || triggered);
    const ownPlan = plan.traitIds.includes('__combat_plan');
    const opts = { element: request.element, triggered, minion, primary };
    // The hero's own plan already carries the general area size; only the family-specific part is added here.
    let scale = ownPlan ? R.areaScale(opts) / R.areaScale() : R.areaScale(opts);
    let radius = request.radius * scale + (ownPlan ? 0 : this.s('area.base_radius'));
    if (!primary) {
      if (Math.abs(scale - 1) < 1e-6 && ownPlan) return false;
      this.instant(request, radius, ri);
      return true;
    }
    this.cast(request, radius, ri, { triggered, ownPlan });
    return true;
  }

  /** Plain circle now with the request's event template (non-skill areas with a scaled radius). */
  instant(request, radius, ri) {
    const R = this.R;
    const { context } = request;
    const victims = R.enemiesNear(request.x, request.y, radius);
    if (R.world.trace) R.world.trace('area', { x: request.x, y: request.y, radius, amount: request.amount, element: request.element, victims: victims.length, effect: context.plan.traitIds[context.rule.trait].split('~')[0], rule: context.rule.id });
    for (const m of victims) R.world.hostHit(context.rootIndex, m.id, request.amount, request.element, request.x, request.y, { base: request.base, eventType: request.action.event, info: { cx: request.x, cy: request.y, radius } });
    void ri;
  }

  /** The skill's primary area: placement, shape and every zone it spawns. */
  cast(request, radius, ri, { triggered, ownPlan }) {
    const R = this.R;
    const s = p => this.s(p);
    const { context } = request;
    const plan = context.plan;
    const hero = R.heroPos();
    const aim = R.hero.aim || { x: 1, y: 0 };
    const melee = plan.tagNames.find('melee') >= 0;
    const line = plan.tagNames.find('line') >= 0;
    const castRange = 6 * (1 + s('area.cast_range') / 100);
    const seek = 8 * (1 + s('area.seek_range') / 100);
    let x = request.x, y = request.y, follow = null;
    const nearest = R.enemiesNear(hero.x, hero.y, seek)[0];
    if (s('area.at_self')) { x = hero.x; y = hero.y; }
    else if (s('area.at_target') && nearest) { x = nearest.x / 100; y = nearest.y / 100; }
    else if (s('area.at_point') || (!melee && !line)) {
      // Spell areas: the enemy within the seek range closest to the aim direction (±60°, up to the cast
      // range), otherwise the point at the cast range in the aim direction.
      const px = hero.x + aim.x * castRange, py = hero.y + aim.y * castRange;
      const aimAngle = Math.atan2(aim.y, aim.x);
      const candidates = s('area.at_point') ? [] : R.enemiesNear(hero.x, hero.y, seek)
        .map(m => ({ m, off: Math.abs(wrap(Math.atan2(m.y / 100 - hero.y, m.x / 100 - hero.x) - aimAngle)) }))
        .filter(c => c.off <= Math.PI / 3).sort((a, b) => a.off - b.off);
      const near = candidates[0]?.m;
      if (near) {
        const dx = near.x / 100 - hero.x, dy = near.y / 100 - hero.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(d, castRange * 1.5);
        x = hero.x + dx / d * reach; y = hero.y + dy / d * reach;
      } else { x = px; y = py; }
    }
    if (line) { x = hero.x; y = hero.y; }
    // Triggered casts already chose their spot (触发技能以自身为中心 / 在事件位置 / 以敌人为目标).
    if (triggered && !line) { x = request.x; y = request.y; }
    if (s('area.follow_self')) follow = { type: 'self' };
    else if (s('area.follow_target') && nearest) follow = { type: 'target', id: nearest.id };
    let shape = line ? 'line' : 'circle';
    if (shape === 'circle' && s('area.to_ring')) shape = 'ring';
    if (shape === 'circle' && s('area.to_sector')) shape = 'sector';
    // 前方扇形: from the caster towards the aim, reaching the original area.
    if (shape === 'sector' && !follow) { x = hero.x; y = hero.y; }
    const element = request.element;
    let durationScale = 1 + s('area.duration') / 100 + (element === E.frost ? s('frost.duration') / 100 : 0) + (triggered ? s('trigger.duration') / 100 : 0);
    const roamers = R.t('area_roam');
    const roaming = roamers.length ? {
      speed: Math.max(0, ...roamers.map(t => t.params.speed)) * Math.max(0, 1 + s('area.move_speed') / 100),
      range: Math.max(.1, ...roamers.map(t => t.params.range)),
      interval: Math.max(.05, Math.min(...roamers.map(t => t.params.interval))),
    } : null;
    const persistent = !!(roaming || follow || s('area.move_forward') || s('area.pulse'));
    const baseLife = roamers.length ? Math.max(.05, ...roamers.map(t => t.params.duration)) : 2;
    const template = {
      rootIndex: context.rootIndex, base: request.base, eventType: request.action.event, element, amount: request.amount,
      effect: context.plan.traitIds[context.rule.trait].split('~')[0], rule: context.rule.id, shape, radius: Math.max(0.2, radius),
      inner: Math.max(0, radius * 0.5 - s('area.ring_inner')), outer: radius + s('area.ring_outer'),
      angle: (90 + s('area.sector_angle')) * Math.PI / 180, sectorRadius: radius * 2.5 + s('area.sector_radius'),
      length: 7 * (radius / Math.max(0.1, request.radius || radius)) + s('area.line_length'), width: 1.2 + s('area.line_width'),
      dir: Math.atan2(aim.y, aim.x), follow, primary: true, delay: melee || line ? 0 : 0.25 * Math.max(0, 1 - s('area.delay') / 100),
      persistent, life: persistent ? baseLife * durationScale : 0, ownPlan, roamingSpec: roaming,
    };
    const centers = [{ x, y, delay: 0 }];
    const step = radius * 1.5;
    const reach = Math.max(1, Math.hypot(x - hero.x, y - hero.y));
    if (s('area.multi_direction')) for (let k = 1; k < 4; ++k) { const a = template.dir + k * Math.PI / 2; centers.push({ x: hero.x + Math.cos(a) * reach, y: hero.y + Math.sin(a) * reach, delay: 0, dir: a }); }
    if (s('area.sequence_line')) for (let k = 1; k < 4; ++k) centers.push({ x: x + aim.x * step * k, y: y + aim.y * step * k, delay: 0.15 * k });
    const extra = Math.floor(s('area.extra_zones'));
    const distance = radius * 1.5 * (1 + s('area.extra_distance') / 100);
    const jitter = Math.max(0, 1 - s('area.extra_spread') / 100);
    for (let k = 0; k < extra; ++k) {
      const a = k / Math.max(1, extra) * TWO_PI + (R.rand() - 0.5) * jitter * (TWO_PI / Math.max(1, extra));
      centers.push({ x: x + Math.cos(a) * distance, y: y + Math.sin(a) * distance, delay: 0 });
    }
    const sets = R.chance(s('area.extra_cast_chance')) ? 2 : 1;
    for (let set = 0; set < sets; ++set) {
      for (const c of centers) {
        if (s('area.ring_around_target')) {
          for (let k = 0; k < 6; ++k) { const a = k / 6 * TWO_PI; this.spawn({ ...template, radius: template.radius * 0.5, x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius, delay: template.delay + c.delay + set * 0.3 }); }
        } else this.spawn({ ...template, x: c.x, y: c.y, dir: c.dir ?? template.dir, delay: template.delay + c.delay + set * 0.3 });
      }
    }
    void ri;
  }

  spawn(z) {
    const R = this.R;
    const s = p => this.s(p);
    if (!R.world.holdRoot(z.rootIndex)) return null;
    // Child zones are made from a parent ({...zone, …}): drop the parent's runtime state.
    const shape = Object.fromEntries(Object.entries(z).filter(([key]) => !RUNTIME_KEYS.has(key)));
    const zone = {
      id: this.nextId++, t: 0, tick: 0, fired: false, repeatIndex: 0, repeatsLeft: z.repeat === false ? 0 : Math.floor(s('area.repeats')),
      spreadsLeft: z.spread === false ? 0 : Math.floor(s('area.spreads')), spreadRadius: z.radius, nextAt: z.delay || 0,
      hitCounts: new Map(), lastHit: new Map(), stay: new Map(), hitIds: new Set(), killSpreads: 0, phase: 'expand', currentRadius: 0, ended: false, ...shape,
    };
    zone.interval = 0.5 / Math.max(0.1, 1 + s('area.tick_rate') / 100);
    zone.maxRadius = zone.radius * (s('area.pulse') ? Math.sqrt(1 + s('area.expand_max') / 100) : 1);
    // Every new area owns its path and seeded RNG, including copies made by a recast.
    if (zone.roamingSpec && zone.persistent && zone.primary && !zone.ground && !zone.secondary) {
      zone.roaming = createAreaRoaming(zone.roamingSpec, zone.x, zone.y, zone.dir, Math.floor(R.rand() * 4294967296));
    }
    this.zones.push(zone);
    return zone;
  }

  /** Targets inside a zone's shape (meters). */
  victims(zone, radius = zone.radius) {
    const R = this.R;
    const reach = zone.shape === 'line' ? zone.length : zone.shape === 'ring' ? zone.outer * radius / zone.radius : zone.shape === 'sector' ? zone.sectorRadius * radius / zone.radius : radius;
    const out = [];
    for (const m of R.enemiesNear(zone.x, zone.y, reach + 0.6)) {
      const dx = m.x / 100 - zone.x, dy = m.y / 100 - zone.y, d = Math.hypot(dx, dy), r = m.radius / 100;
      if (zone.shape === 'circle' && d > radius + r) continue;
      if (zone.shape === 'ring' && (d > reach + r || d < zone.inner * radius / zone.radius - r)) continue;
      if (zone.shape === 'sector' && (d > reach + r || Math.abs(wrap(Math.atan2(dy, dx) - zone.dir)) > zone.angle / 2 + Math.atan2(r, Math.max(0.1, d)))) continue;
      if (zone.shape === 'line') {
        const along = dx * Math.cos(zone.dir) + dy * Math.sin(zone.dir), across = Math.abs(-dx * Math.sin(zone.dir) + dy * Math.cos(zone.dir));
        if (along < -r || along > zone.length + r || across > zone.width / 2 + r) continue;
      }
      out.push({ m, d });
    }
    return out;
  }

  /** One damage pass of a zone. options: {scale (damage), radius, ring:[inner, outer] (spreads), persistentTick}. */
  resolve(zone, options = {}) {
    const R = this.R;
    const s = p => this.s(p);
    const radius = options.radius ?? zone.radius;
    let list = this.victims(zone, radius);
    if (options.ring) list = list.filter(v => v.d >= options.ring[0] && v.d <= options.ring[1] + v.m.radius / 100);
    if (s('area.no_rehit_spread')) list = list.filter(v => !zone.hitIds.has(v.m.id));
    const now = R.time;
    if (zone.persistent || zone.ground) {
      const cap = 3 + Math.floor(s('area.rehit_cap'));
      const gap = 0.5 * Math.max(0, 1 - s('area.rehit_interval') / 100);
      list = list.filter(v => (zone.hitCounts.get(v.m.id) || 0) < cap && now - (zone.lastHit.get(v.m.id) ?? -Infinity) >= gap - 1e-6);
    }
    if (R.world.trace) R.world.trace('area', { x: zone.x, y: zone.y, radius: zone.shape === 'line' ? zone.width / 2 : radius, amount: zone.amount, element: zone.element, victims: list.length, effect: zone.effect, rule: zone.rule, shape: zone.shape, dir: zone.dir, length: zone.length });
    const count = list.length;
    let countBonus = count === 1 ? s('area.single_target') : 0;
    for (const t of R.t('area_per_enemy')) countBonus += Math.min(t.params.max, t.params.n * count);
    const centerShare = Math.min(1, (30 + s('area.center_share')) / 100);
    const falloff = 0.25 * Math.max(0, 1 - s('area.falloff') / 100);
    const centerBonus = s('area.center_damage') + (zone.element === E.fire ? s('fire.center_damage') : 0);
    for (const { m, d } of list) {
      const reach = zone.shape === 'line' ? zone.length : radius;
      const ratio = Math.min(1, d / Math.max(0.1, reach));
      let more = (options.scale ?? 1) * (1 + countBonus / 100) * (zone.primary ? 1 - falloff * ratio : 1);
      more *= 1 + (ratio <= centerShare ? centerBonus : s('area.edge_damage')) / 100;
      const hits = zone.hitCounts.get(m.id) || 0;
      more *= 1 + hits * s('area.consecutive') / 100;
      for (const t of R.t('area_stay')) more *= 1 + Math.floor((zone.stay.get(m.id) || 0) / Math.max(0.1, t.params.seconds)) * t.params.n / 100;
      // 重叠：同一施放的另一区域 0.25 秒内已命中该目标。
      const key = `${zone.rootIndex}|${m.id}`;
      const recent = this.recentHits.get(key);
      if (recent && recent.zone !== zone.id && now - recent.time < 0.25) more *= Math.min(1, 0.5 * (1 + s('area.overlap') / 100));
      this.recentHits.set(key, { zone: zone.id, time: now });
      if (zone.primary && s('area.focus')) more *= 1.4;
      if (zone.primary && s('area.widen')) more *= 0.75;
      zone.hitCounts.set(m.id, hits + 1);
      zone.lastHit.set(m.id, now);
      zone.hitIds.add(m.id);
      R.world.hostHit(zone.rootIndex, m.id, zone.amount * (options.tick ?? 1), zone.element, zone.x, zone.y,
        { base: zone.base, eventType: zone.eventType, info: { cx: zone.x, cy: zone.y, radius, zone: zone.id, zoneMore: more, primary: zone.primary } });
    }
    // 牵引 / 推开 on an instant pass.
    if (!zone.persistent) this.pull(zone, list.map(v => v.m), 0.25);
    return count;
  }

  pull(zone, monsters, seconds) {
    const s = p => this.s(p);
    const sign = s('area.pull') ? -1 : s('area.push') ? 1 : 0;
    if (!sign) return;
    const speed = 2 * (1 + s('area.pull_speed') / 100) * 100 * seconds;
    for (const m of monsters) {
      const dx = m.x - zone.x * 100, dy = m.y - zone.y * 100, d = Math.hypot(dx, dy) || 1;
      const move = sign < 0 ? Math.min(speed, d) : speed;
      this.R.arena.moveActor(m, m.x + sign * dx / d * move, m.y + sign * dy / d * move);
    }
  }

  damageMod(mod, info) { if (info.zoneMore) mod.more *= info.zoneMore; }

  /** Zone hits: 次级范围. */
  onHit(hit) {
    const R = this.R;
    const s = p => this.s(p);
    const zone = this.zones.find(z => z.id === hit.info.zone);
    if (!zone || zone.secondary || !R.chance(s('area.secondary_chance')) || !hit.m) return;
    this.spawn({ ...zone, x: hit.m.x / 100, y: hit.m.y / 100, radius: zone.radius * 0.5 * Math.sqrt(1 + s('area.secondary_size') / 100), amount: zone.amount * 0.5 * (1 + s('area.secondary_damage') / 100),
      shape: 'circle', persistent: false, follow: null, life: 0, delay: 0, secondary: true, primary: false, repeat: false, spread: false });
  }

  /** Zone kills: 剩余冷却 -n 秒, 击杀处再次释放, 无法重复命中但击杀后扩散. */
  onKill(hit) {
    const R = this.R;
    const s = p => this.s(p);
    if (!hit.info.zone || !hit.m) return;
    R.cooldown = Math.max(0, R.cooldown - s('area.kill_cooldown'));
    const zone = this.zones.find(z => z.id === hit.info.zone);
    if (!zone) return;
    if (!zone.recast && R.chance(s('area.kill_recast_chance'))) this.spawn({ ...zone, x: hit.m.x / 100, y: hit.m.y / 100, delay: 0.1, recast: true, persistent: false, follow: null, life: 0, repeat: false });
    if (s('area.no_rehit_spread') && zone.killSpreads < 6) {
      zone.killSpreads++;
      const child = this.spawn({ ...zone, x: hit.m.x / 100, y: hit.m.y / 100, delay: 0.15, recast: true, persistent: false, follow: null, life: 0, repeat: false, spread: false });
      if (child) { child.hitIds = zone.hitIds; child.killSpreads = zone.killSpreads; }
    }
  }

  tick(dt) {
    const R = this.R;
    const s = p => this.s(p);
    for (const zone of this.zones) {
      zone.t += dt;
      if (zone.roaming) {
        const age = Math.min(zone.life, Math.max(0, zone.t - zone.nextAt));
        const before = Math.min(zone.life, Math.max(0, zone.t - dt - zone.nextAt));
        // Host geometry is in centimeters; areas remain in meters. Only the area probe moves.
        const probe = { x: zone.x * 100, y: zone.y * 100, radius: Math.min(.5, zone.radius) * 100 };
        stepAreaRoaming(zone.roaming, age - before, (x, y) => {
          R.arena.moveActor(probe, x * 100, y * 100);
          return { x: probe.x / 100, y: probe.y / 100 };
        });
        zone.x = zone.roaming.x; zone.y = zone.roaming.y;
      } else {
        if (zone.follow?.type === 'self') { const h = R.heroPos(); zone.x = h.x; zone.y = h.y; }
        if (zone.follow?.type === 'target') { const p = R.targetPos(zone.follow.id); if (p) { zone.x = p.x; zone.y = p.y; } }
        if (zone.persistent && s('area.move_forward') && zone.primary) { const v = 3 * (1 + s('area.move_speed') / 100) * dt; zone.x += Math.cos(zone.dir) * v; zone.y += Math.sin(zone.dir) * v; }
      }
      if (zone.persistent && zone.shape === 'sector') zone.dir += Math.PI / 2 * (1 + s('area.rotate_speed') / 100) * dt;
      if (zone.t < zone.nextAt) continue;
      if (zone.persistent || zone.ground) { this.tickPersistent(zone, dt); continue; }
      // Instant zone: first pass, then repeats and spreads on their own timers.
      if (!zone.fired) {
        zone.fired = true;
        this.resolve(zone);
        zone.nextAt = zone.t + 0.35 * Math.max(0.05, 1 - s('area.repeat_interval') / 100);
        zone.nextSpread = zone.t + 0.25 * Math.max(0.05, 1 - s('area.spread_interval') / 100);
        continue;
      }
      if (zone.spreadsLeft > 0 && zone.t >= zone.nextSpread) {
        const before = zone.spreadRadius;
        zone.spreadRadius += zone.radius * 0.5 + s('area.spread_radius');
        --zone.spreadsLeft;
        this.resolve(zone, { radius: zone.spreadRadius, ring: [before, zone.spreadRadius] });
        zone.nextSpread = zone.t + 0.25 * Math.max(0.05, 1 - s('area.spread_interval') / 100);
      }
      if (zone.repeatsLeft > 0 && zone.t >= zone.nextAt) {
        --zone.repeatsLeft;
        const k = ++zone.repeatIndex;
        this.resolve(zone, { radius: zone.radius * Math.sqrt(1 + k * s('area.repeat_size') / 100), scale: 1 + k * s('area.repeat_damage') / 100 });
        zone.nextAt = zone.t + 0.35 * Math.max(0.05, 1 - s('area.repeat_interval') / 100);
      }
      if (zone.repeatsLeft <= 0 && zone.spreadsLeft <= 0) this.end(zone);
    }
    this.zones = this.zones.filter(z => !z.ended);
    if (this.recentHits.size > 2000) this.recentHits.clear();
  }

  tickPersistent(zone, dt) {
    const R = this.R;
    const s = p => this.s(p);
    if (zone.t - zone.nextAt >= zone.life) { this.end(zone); return; }
    const inside = this.victims(zone, zone.currentRadius || zone.radius).map(v => v.m);
    for (const m of inside) zone.stay.set(m.id, (zone.stay.get(m.id) || 0) + dt);
    this.pull(zone, inside, dt);
    if (s('area.pulse') && zone.primary && !zone.ground) {
      const expand = 0.4 / Math.max(0.1, 1 + s('area.expand_speed') / 100), contract = 0.4 / Math.max(0.1, 1 + s('area.contract_speed') / 100);
      const t = (zone.t - zone.nextAt) % (expand + contract);
      const wasExpanding = zone.phase === 'expand';
      zone.phase = t < expand ? 'expand' : 'contract';
      zone.currentRadius = zone.phase === 'expand' ? zone.maxRadius * t / expand : zone.maxRadius * (1 - (t - expand) / contract);
      if (wasExpanding && zone.phase === 'contract') { zone.hitCounts.clear(); zone.lastHit.clear(); this.resolve(zone, { radius: zone.maxRadius }); }
      if (!wasExpanding && zone.phase === 'expand' && s('area.pulse_both')) { zone.hitCounts.clear(); zone.lastHit.clear(); this.resolve(zone, { radius: Math.max(0.5, zone.maxRadius * 0.4) }); }
      return;
    }
    zone.tick += dt;
    if (zone.tick < zone.interval && zone.fired) return;
    zone.tick = 0;
    zone.fired = true;
    const per = zone.ground ? 0.2 * zone.interval : 0.4 * zone.interval / 0.5;
    if (s('area.consume_remaining') && !zone.ground) {
      const ticks = Math.max(1, Math.round((zone.life - (zone.t - zone.nextAt)) / zone.interval));
      this.resolve(zone, { tick: per * ticks });
      this.end(zone);
      return;
    }
    this.resolve(zone, { tick: per });
  }

  end(zone) {
    if (zone.ended) return;
    const R = this.R;
    const s = p => this.s(p);
    zone.ended = true;
    if (zone.primary && !zone.secondary) {
      if (s('area.end_explosion')) this.spawn({ ...zone, radius: zone.radius * 0.6, amount: zone.amount * 0.5, shape: 'circle', persistent: false, follow: null, life: 0, delay: 0, primary: false, secondary: true, repeat: false, spread: false });
      if (s('area.leave_ground')) this.spawn({ ...zone, shape: 'circle', persistent: false, ground: true, follow: null, life: 3 * (1 + s('area.duration') / 100), delay: 0, primary: false, secondary: true, repeat: false, spread: false, hitCounts: new Map(), lastHit: new Map() });
      if (!zone.recast && R.chance(s('area.recast_chance'))) this.spawn({ ...zone, delay: 0.2, recast: true, ended: false, fired: false, hitCounts: new Map(), lastHit: new Map(), hitIds: new Set() });
    }
    R.world.releaseHeldRoot(zone.rootIndex);
  }

  /** Render data (meters). */
  view() {
    return this.zones.filter(z => z.t >= z.nextAt).map(z => ({ shape: z.shape, x: z.x, y: z.y, radius: z.persistent && z.currentRadius ? z.currentRadius : z.radius, inner: z.inner, dir: z.dir, angle: z.angle, length: z.length, width: z.width, element: z.element, ground: !!z.ground }));
  }
}

export { INDEX_NONE };
