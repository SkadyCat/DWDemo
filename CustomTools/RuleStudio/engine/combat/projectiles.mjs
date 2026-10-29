// 投射物：发射方式（环形 / 扇形 / 依次 / 汇聚 / 两侧交替 / 多发射位置 / 连续发射）、弹道（加速、减速、
// 曲线、波浪、环绕、追踪、返回、地形弹射）、命中行为（穿透概率、连锁、分裂、次级投射物、爆炸、持续区域）
// 以及逐命中伤害修正（穿透 / 连锁 / 弹射衰减与成长、近远距离、飞行距离、同批命中上限与衰减）。
import { INDEX_NONE, ERedirect, EEndReason, safeNormal, rotateAroundUp, tagBit, Tags } from '../types.mjs';
import { Projectiles } from '../world.mjs';
import { E, MINION_BASE as BASE } from './common.mjs';
import { createAreaRoaming, stepAreaRoaming } from './area-roaming.mjs';

const TAG_PROJECTILE = tagBit(Tags.Projectile);
const ARENA = 50; // meters (arena half extent)
const turnToward = (angle, want, turn) => {
  let delta = want - angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return angle + Math.max(-turn, Math.min(turn, delta));
};

export class ProjectileAffixes {
  constructor(R) {
    this.R = R;
    this.state = new Map();
    this.fields = [];
    this.volleys = [];
    this.recalled = 0;
  }
  s(p) { return this.R.s(p); }
  get c() { return this.R.world.carriers; }

  homing() {
    const s = p => this.s(p);
    return s('proj.homing_range') > 0 || s('proj.homing_turn') > 0 || s('proj.retarget') > 0 || s('proj.retarget_on_death') > 0
      || s('proj.prefer_elite') > 0 || s('proj.prefer_low') > 0 || this.R.t('proj_prefer_status').length > 0;
  }

  newState(index, extra = {}) {
    const c = this.c;
    const s = p => this.s(p);
    const st = {
      gen: 0, distance: 0, pierced: 0, chained: 0, bounced: 0, hits: 0, returning: false, retargets: 1 + Math.floor(s('proj.retarget')),
      chainsLeft: Math.floor(s('proj.chain')), bouncesLeft: Math.floor(s('proj.bounce')), splitsLeft: 1 + Math.floor(s('proj.split_times')),
      speed0: Math.hypot(c.vx[index], c.vy[index]), radius0: c.radius[index], age: 0, side: 1, hold: 0, target: -1, splitDone: false,
      x0: c.px[index], y0: c.py[index], lastSecondary: 0, rehitAt: 0, piercedSinceSecondary: 0,
      homingScale: 1,
      groundPosition: { x: c.px[index], y: c.py[index], z: c.pz[index] },
      groundContactEnabled: !!(s('proj.ground_contact') || this.R.planSheetStat(this.R.world.roots[c.root[index]]?.plan ?? -1, 'proj.ground_contact')),
      groundTintEnabled: !!(s('proj.ground_tint') || this.R.planSheetStat(this.R.world.roots[c.root[index]]?.plan ?? -1, 'proj.ground_tint')),
      ...extra,
    };
    const roamers = this.R.planSheet(this.R.world.roots[c.root[index]]?.plan ?? -1).triggers.filter(t => t.name === 'proj_roam');
    if (roamers.length && !(c.flags[index] & Projectiles.Parabolic)) {
      st.roamingSpec = { range: Math.max(.1, ...roamers.map(t => t.params.range)), interval: Math.max(.05, Math.min(...roamers.map(t => t.params.interval))) };
      st.rehitQueue = []; st.rehitHead = 0;
    }
    this.state.set(c.id[index], st);
    this.R.captures?.initialize(index, st);
    return st;
  }

  /** World hook: a rule emitted a projectile (after its pierce / ricochet setup). */
  onSpawn(index, rootIndex, data) {
    const R = this.R;
    const c = this.c;
    const root = R.world.roots[rootIndex];
    if (!R.isHeroRoot(root)) return;
    const s = p => this.s(p);
    const ri = R.rootInfo(rootIndex);
    const plan = R.world.plans[root.plan];
    const minion = !!ri?.minion || R.hasTag(plan, c.tags[index], 'summon');
    const st = this.newState(index, { minion, side: data.index % 2 ? -1 : 1, index: data.index, count: data.count,
      visualSeed: (Number(BigInt.asUintN(32, root.seed)) ^ Math.imul(data.index + 1, 2654435761)) >>> 0 });
    // A summon keeps one root across attacks; each volley needs a fresh hit budget.
    if (minion && ri) {
      if (ri.volleyTime !== R.time) { ri.volleyTime = R.time; ri.volleyBatch = new Map(); ri.repeatBatches = []; }
      st.batch = ri.volleyBatch;
    }
    const aim = Math.atan2(data.aimY ?? data.dy, data.aimX ?? data.dx);
    const speed = st.speed0;
    const setDir = angle => { c.vx[index] = Math.cos(angle) * speed; c.vy[index] = Math.sin(angle) * speed; };
    if (!minion && ri?.kind !== 'cast' && !ri?.triggered) return;
    // 环绕角色飞行: orbiting projectiles live 3 s (× 存在时间) instead of their straight flight time.
    if (s('proj.orbit')) c.life[index] = Math.max(c.life[index], 3 * (1 + s('proj.lifetime') / 100));
    // 发射方式
    if (s('proj.layout_ring') && data.count > 1) setDir(aim + data.index / data.count * Math.PI * 2);
    else if (s('proj.layout_fan') && data.count > 1) setDir(aim + (data.index / (data.count - 1) - 0.5) * Math.PI / 4);
    if (s('proj.layout_line')) st.hold = data.index * 0.06;
    if (s('proj.layout_alternate')) { const side = data.index % 2 ? -1 : 1; c.px[index] += -Math.sin(aim) * 0.5 * side; c.py[index] += Math.cos(aim) * 0.5 * side; }
    if (s('proj.layout_converge')) {
      const hero = R.heroPos();
      const target = R.enemiesNear(hero.x + Math.cos(aim) * 3, hero.y + Math.sin(aim) * 3, 6)[0];
      if (target) {
        const tx = target.x / 100, ty = target.y / 100, a = data.index / Math.max(1, data.count) * Math.PI * 2;
        c.px[index] = tx + Math.cos(a) * 3; c.py[index] = ty + Math.sin(a) * 3;
        setDir(Math.atan2(ty - c.py[index], tx - c.px[index]));
      }
    }
    // Capture curves follow the final launch layout, before origin copies receive their own paths.
    if (ri?.capture) R.captures.initialize(index, st);
    // 发射位置数量 / 间距
    const origins = Math.floor(s('proj.origins'));
    const spacing = 0.6 * (1 + s('proj.origin_spacing') / 100);
    const emitted = [index];
    for (let k = 1; k <= origins; ++k) {
      const side = k % 2 ? 1 : -1, step = Math.ceil(k / 2) * spacing * side;
      const copy = this.clone(index, rootIndex, { offset: [-Math.sin(aim) * step, Math.cos(aim) * step] });
      if (copy !== INDEX_NONE) emitted.push(copy);
    }
    // Repeating a summoning cast replaces the unit. Repeat its actual emitted
    // projectiles instead, with a fresh hit budget for each additional volley.
    if (minion && ri?.minion) {
      const repeats = Math.floor(s('proj.volleys'));
      const interval = 0.15 * Math.max(0.05, 1 - s('proj.volley_interval') / 100);
      for (let k = 1; k <= repeats; ++k) {
        ri.repeatBatches[k] ||= new Map();
        this.volleys.push({ at: R.time + k * interval, source: this.damageSource(index),
          shots: emitted.map(i => this.snapshot(i)), batch: ri.repeatBatches[k] });
      }
    }
  }

  snapshot(index) {
    const c = this.c, state = this.state.get(c.id[index]);
    const fields = Object.fromEntries(['pierce', 'ricochet', 'ret', 'reflect', 'refract', 'endEvent', 'gravity', 'vz'].map(key => [key, c[key][index]]));
    return { x: c.px[index], y: c.py[index], z: c.pz[index], dx: c.vx[index], dy: c.vy[index],
      life: c.life[index], radius: c.radius[index], damage: c.damage[index], element: c.element[index],
      kind: c.kind[index], tags: c.tags[index], generation: c.generation[index], lineage: c.lineage[index],
      flags: c.flags[index] & Projectiles.Parabolic, fields, side: state.side, gen: state.gen, hold: state.hold };
  }

  repeatVolley(job) {
    const R = this.R, w = R.world, c = this.c;
    if (job.source.minion.dead || job.source.minion.summon.dead) return;
    const rootIndex = R.openRoot(job.source.plan, { minion: job.source.minion, triggered: job.source.triggered });
    if (rootIndex === INDEX_NONE) return;
    const root = w.roots[rootIndex];
    for (const shot of job.shots) {
      const speed = Math.hypot(shot.dx, shot.dy);
      const index = w.spawnProjectile(root, rootIndex, shot.x, shot.y, shot.z, ...safeNormal(shot.dx, shot.dy, 0),
        speed, shot.life, shot.radius, shot.damage, shot.element, shot.kind, shot.tags, shot.generation, shot.lineage);
      if (index === INDEX_NONE) break;
      for (const [key, value] of Object.entries(shot.fields)) c[key][index] = value;
      c.flags[index] |= shot.flags;
      this.newState(index, { minion: true, batch: job.batch, side: shot.side, gen: shot.gen, hold: shot.hold });
    }
    w.releaseHeldRoot(rootIndex);
  }

  /** Copy of a carrier (same root / damage / kind), optionally rotated or offset. */
  clone(index, rootIndex, { angle = 0, offset = [0, 0], damageScale = 1, lifeScale = 1, gen = null, preserveAge = false } = {}) {
    const w = this.R.world;
    const c = this.c;
    const root = w.roots[rootIndex];
    const parent = this.state.get(c.id[index]);
    const speed = Math.hypot(c.vx[index], c.vy[index]) / (parent?.homingScale || 1);
    const [dx, dy, dz] = rotateAroundUp(...safeNormal(c.vx[index], c.vy[index], 0), angle * 180 / Math.PI);
    const spawned = w.spawnProjectile(root, rootIndex, c.px[index] + offset[0], c.py[index] + offset[1], c.pz[index], dx, dy, dz, speed,
      c.life[index] * lifeScale, c.radius[index], c.damage[index] * damageScale, c.element[index], c.kind[index], c.tags[index], c.generation[index], c.lineage[index]);
    if (spawned === INDEX_NONE) return INDEX_NONE;
    c.pierce[spawned] = c.pierce[index]; c.ricochet[spawned] = c.ricochet[index]; c.ret[spawned] = c.ret[index]; c.reflect[spawned] = c.reflect[index]; c.refract[spawned] = c.refract[index];
    c.endEvent[spawned] = c.endEvent[index];
    c.gravity[spawned] = c.gravity[index]; c.vz[spawned] = c.vz[index];
    c.flags[spawned] |= c.flags[index] & Projectiles.Parabolic;
    if (preserveAge) c.age[spawned] = c.age[index];
    this.newState(spawned, { ...(parent ? { minion: parent.minion, batch: rootIndex === c.root[index] ? parent.batch : undefined, hold: parent.hold, side: -parent.side,
      groundContactEnabled: parent.groundContactEnabled, groundTintEnabled: parent.groundTintEnabled, groundTint: parent.groundTint, index: parent.index, count: parent.count, visualSeed: parent.visualSeed,
      ...(preserveAge ? { age: parent.age, distance: parent.distance } : {}) } : {}), gen: gen ?? (parent?.gen || 0) });
    return spawned;
  }

  /** Derived hits keep the minion's plan and attribution instead of becoming player hits. */
  damageSource(index) {
    const rootIndex = this.c.root[index], root = this.R.world.roots[rootIndex];
    const info = this.R.rootInfo(rootIndex);
    return info?.minion ? { plan: root.plan, minion: info.minion, triggered: !!info.triggered } : {};
  }

  /** Runtime projectiles (冰刺, 次级投射物): radial or aimed, from a point. */
  fire({ x, y, count = 1, radial = false, dir = 0, damage, element = E.frost, tags = [], kind = '', speed = 18, life = 0.5, radius = 0.2, exclude = null, gen = 2, from = null }) {
    const R = this.R;
    const w = R.world;
    const source = from ? this.damageSource(from.index) : {};
    const planIndex = source.plan ?? R.heroPlan();
    const plan = w.plans[planIndex];
    const rootIndex = R.openRoot(planIndex, { depth: 2, ...(source.minion ? { minion: source.minion, triggered: source.triggered } : {}) });
    if (rootIndex === INDEX_NONE) return;
    const root = w.roots[rootIndex];
    const kindIndex = source.minion ? this.c.kind[from.index] : Math.max(0, plan.findKind(kind || 'ice_lance'));
    const mask = (source.minion ? this.c.tags[from.index] : R.tagMask(plan, tags)) | TAG_PROJECTILE;
    for (let k = 0; k < count; ++k) {
      const a = radial ? dir + k / count * Math.PI * 2 : dir + (count > 1 ? (k / (count - 1) - 0.5) * 0.5 : 0);
      const spawned = w.spawnProjectile(root, rootIndex, x, y, 0.6, Math.cos(a), Math.sin(a), 0, speed, life, radius, damage, element, kindIndex, mask, 3, 0);
      if (spawned === INDEX_NONE) break;
      const st = this.newState(spawned, { gen, minion: !!source.minion, ...(source.minion ? { batch: from.batch } : {}) });
      if (from) { st.chainsLeft = from.chainsLeft; st.splitsLeft = 0; }
      st.chainsLeft = from && this.R.chance(this.s('proj.secondary_inherit_chain')) ? from.chainsLeft : 0;
      this.c.pierce[spawned] = from && this.R.chance(this.s('proj.secondary_inherit_pierce')) ? this.c.pierce[from.index] || 0 : 0;
      if (exclude !== null) w.hitAdd(spawned, root, exclude >>> 0);
    }
    w.releaseHeldRoot(rootIndex);
  }
  secondary(index, st, n, dir = null) {
    const c = this.c;
    this.fire({ x: c.px[index], y: c.py[index], count: n, radial: dir === null, dir: dir ?? 0, damage: c.damage[index] * 0.4, element: c.element[index], gen: 2, from: { ...st, index } });
  }

  // ---------------------------------------------------------------- flight
  pickTarget(x, y, range, exclude) {
    const R = this.R;
    const s = p => this.s(p);
    const list = R.enemiesNear(x, y, range, exclude);
    if (!list.length) return null;
    const prefer = [];
    if (s('proj.prefer_elite')) prefer.push(m => m.elite);
    if (s('proj.prefer_low')) prefer.push(m => R.lifeFraction(m) <= 0.5);
    for (const t of R.t('proj_prefer_status')) prefer.push(m => R.hasStatusChoice(m.id, t.params.status));
    for (const test of prefer) { const hit = list.find(test); if (hit) return hit; }
    return list[0];
  }

  onMotion(index, dt) {
    const c = this.c;
    const R = this.R;
    const root = R.world.roots[c.root[index]];
    if (!R.isHeroRoot(root)) return this.hostileHoming(index, root, dt);
    let st = this.state.get(c.id[index]);
    // Rule copies/refractions use the shared allocator rather than the emit hook.
    if (!st && R.isHeroRoot(R.world.roots[c.root[index]]) && (R.rootInfo(c.root[index])?.capture || R.has('proj_roam') || R.s('proj.ground_contact') || R.planSheetStat(R.world.roots[c.root[index]].plan, 'proj.ground_contact'))) {
      st = this.newState(index, { minion: !!R.rootInfo(c.root[index])?.minion, gen: Math.max(0, c.generation[index] - 1) });
    }
    if (!st) return;
    const s = p => this.s(p);
    st.age += dt;
    if (st.captureCurve) return R.captures.motion(index, st, dt);
    let vx = c.vx[index], vy = c.vy[index];
    let speed = Math.hypot(vx, vy) || st.speed0;
    if (st.hold > 0) {
      st.hold -= dt;
      if (!st.saved) st.saved = [vx, vy];
      c.vx[index] = 0; c.vy[index] = 0; c.life[index] += dt;
      if (st.hold <= 0) { [c.vx[index], c.vy[index]] = st.saved; st.saved = null; }
      return;
    }
    // Undo only last frame's steering brake; pierce/acceleration speed modifiers survive.
    speed /= st.homingScale || 1;
    st.homingScale = 1;
    let angle = Math.atan2(vy, vx), motion = null;
    if (st.returning) {
      const h = R.heroPos();
      const dx = h.x - c.px[index], dy = h.y - c.py[index];
      if (Math.hypot(dx, dy) < 0.7) { this.recall(index, st); return; }
      angle = Math.atan2(dy, dx);
      speed = st.speed0 * (1 + s('proj.return_speed') / 100);
      c.life[index] = Math.max(c.life[index], c.age[index] + 1);
      if (R.t('proj_return_secondary').length && R.time - st.lastSecondary >= 0.3) {
        st.lastSecondary = R.time;
        const target = R.enemiesNear(c.px[index], c.py[index], 5)[0];
        if (target) for (const t of R.t('proj_return_secondary')) this.secondary(index, st, t.params.n, Math.atan2(target.y / 100 - c.py[index], target.x / 100 - c.px[index]));
      }
    } else if (s('proj.orbit') && st.gen === 0) {
      const h = R.heroPos();
      const r = 2 * (1 + s('proj.orbit_radius') / 100);
      st.phi = (st.phi ?? Math.atan2(c.py[index] - h.y, c.px[index] - h.x)) + Math.PI * 2 * (1 + s('proj.orbit_speed') / 100) * dt;
      const tx = h.x + Math.cos(st.phi) * r, ty = h.y + Math.sin(st.phi) * r;
      c.vx[index] = (tx - c.px[index]) / dt; c.vy[index] = (ty - c.py[index]) / dt;
      if (R.time >= st.rehitAt) { c.hitNum[index] = 0; c.hitOverflow[index] = 0; st.rehitAt = R.time + 0.5 * Math.max(0.05, 1 - s('proj.rehit_interval') / 100); }
      st.distance += Math.hypot(c.vx[index], c.vy[index]) * dt;
      return;
    } else if (st.roamingSpec && !(c.flags[index] & Projectiles.Parabolic)) {
      if (s('proj.accel')) speed *= 1 + s('proj.accel') / 100 * dt;
      if (s('proj.decel')) speed = Math.max(st.speed0 * .2, speed * (1 - .4 * dt));
      const m = st.roaming ||= createAreaRoaming({ ...st.roamingSpec, speed }, c.px[index], c.py[index], angle, Math.floor(R.rand() * 4294967296));
      m.x = c.px[index]; m.y = c.py[index]; m.dir = angle; m.speed = speed;
      const wallRadius = Math.min(.5, c.radius[index]), probe = { x: m.x * 100, y: m.y * 100, radius: wallRadius * 100 };
      stepAreaRoaming(m, Math.max(0, Math.min(dt, c.life[index] - c.age[index])), (x, y) => {
        R.arena.moveActor(probe, x * 100, y * 100);
        st.distance += Math.hypot(probe.x / 100 - m.x, probe.y / 100 - m.y);
        return { x: probe.x / 100, y: probe.y / 100 };
      });
      angle = m.dir; motion = { position: { x: m.x, y: m.y, z: c.pz[index] }, wallRadius };
      // Release expired target exclusions only, including the overflow set.
      const root = R.world.roots[c.root[index]];
      while (st.rehitHead < st.rehitQueue.length && st.rehitQueue[st.rehitHead].at <= R.time + 1e-7) {
        const { id } = st.rehitQueue[st.rehitHead++], base = index * 6;
        for (let k = 0; k < c.hitNum[index]; k++) if (c.hitIds[base + k] === id) {
          c.hitIds[base + k] = c.hitIds[base + --c.hitNum[index]]; break;
        }
        root.overflowHits.delete(`${c.id[index]}:${id}`);
      }
      if (st.rehitHead > 64) { st.rehitQueue = st.rehitQueue.slice(st.rehitHead); st.rehitHead = 0; }
    } else {
      if (s('proj.accel')) speed *= 1 + s('proj.accel') / 100 * dt;
      if (s('proj.decel')) speed = Math.max(st.speed0 * 0.2, speed * (1 - 0.4 * dt));
      if (s('proj.curve')) angle += st.side * Math.PI / 2 * dt;
      if (s('proj.wave')) { const before = 0.6 * Math.sin(Math.PI * 3 * (st.age - dt)); const after = 0.6 * Math.sin(Math.PI * 3 * st.age); angle += after - before; }
      if (this.homing()) {
        const range = 4 * (1 + s('proj.homing_range') / 100);
        const hit = id => R.world.hitContains(index, root, id);
        let target = st.target >= 0 ? R.monster(st.target) : null;
        if (target && !(target.health > 0)) { target = null; st.target = -1; if (!s('proj.retarget_on_death')) st.noHoming = true; }
        if (target && (hit(target.id) || Math.hypot(target.x / 100 - c.px[index], target.y / 100 - c.py[index]) > range + target.radius / 100)) {
          target = null; st.target = -1;
        }
        if (!target && !st.noHoming && st.retargets > 0) {
          const exclude = new Set(R.arena.monsters.filter(m => hit(m.id)).map(m => m.id));
          target = this.pickTarget(c.px[index], c.py[index], range, exclude);
          if (target) { st.target = target.id; --st.retargets; }
        }
        if (target) {
          const dx = target.x / 100 - c.px[index], dy = target.y / 100 - c.py[index];
          const want = Math.atan2(dy, dx), distance = Math.hypot(dx, dy);
          const turnRate = Math.max(0, Math.PI * (1 + s('proj.homing_turn') / 100));
          angle = turnToward(angle, want, turnRate * dt);
          const error = Math.abs(turnToward(0, want - angle, Math.PI));
          const hitRadius = c.radius[index] + target.radius / 100;
          // Bound the bearing's angular velocity below the available turn rate.
          // Aligned shots retain full speed and still hit through the ordinary sweep.
          if (turnRate > 0 && distance > hitRadius && error > Math.asin(Math.min(1, hitRadius / distance))) {
            const cruise = speed;
            speed = Math.min(speed, .35 * turnRate * distance / Math.max(.15, Math.sin(Math.min(error, Math.PI / 2))));
            st.homingScale = cruise > 0 ? speed / cruise : 1;
          }
        }
      }
    }
    c.vx[index] = Math.cos(angle) * speed; c.vy[index] = Math.sin(angle) * speed;
    if (!motion) st.distance += speed * dt;
    // 战场边界 = 地形：可弹射
    const nx = c.px[index] + c.vx[index] * dt, ny = c.py[index] + c.vy[index] * dt;
    if (!motion && (Math.abs(nx) > ARENA || Math.abs(ny) > ARENA) && st.bouncesLeft > 0 && !st.returning) {
      if (Math.abs(nx) > ARENA) c.vx[index] = -c.vx[index];
      if (Math.abs(ny) > ARENA) c.vy[index] = -c.vy[index];
      this.bounced(index, st);
    }
    // 飞行 n 米 / 存在 n 秒后分裂
    if (!st.splitDone && st.gen === 0) {
      for (const t of R.t('proj_split_after_distance')) if (st.distance >= t.params.meters) { st.splitDone = true; this.split(index, st, true); break; }
      for (const t of R.t('proj_split_after_time')) if (!st.splitDone && st.age >= t.params.seconds) { st.splitDone = true; this.split(index, st, true); break; }
    }
    if (st.returning) c.radius[index] = st.radius0 * (1 + s('proj.return_radius') / 100);
    return motion;
  }

  // Enemy skills read their own aggregated sheet, never the player's projectile affixes.
  hostileHoming(index, root, dt) {
    const R = this.R, w = R.world, c = this.c, owner = w.owners[root?.owner];
    if (!owner || owner.team === w.owners[R.hero.owner].team || (c.flags[index] & Projectiles.Parabolic)) return;
    const stats = R.planSheet(root.plan).stats;
    const rangeBonus = stats.get('proj.homing_range') || 0, turnBonus = stats.get('proj.homing_turn') || 0;
    if (!(rangeBonus > 0 || turnBonus > 0)) return;
    const target = w.nearestTarget(c.px[index], c.py[index], c.pz[index], 4 * (1 + rangeBonus / 100), index, root, owner.team);
    if (target === INDEX_NONE) return;
    const speed = Math.hypot(c.vx[index], c.vy[index]);
    const angle = turnToward(Math.atan2(c.vy[index], c.vx[index]),
      Math.atan2(w.targets.py[target] - c.py[index], w.targets.px[target] - c.px[index]), Math.PI * (1 + turnBonus / 100) * dt);
    c.vx[index] = Math.cos(angle) * speed; c.vy[index] = Math.sin(angle) * speed;
  }

  bounced(index, st) {
    ++st.bounced; --st.bouncesLeft;
    if (this.s('proj.bounce_retarget')) {
      const c = this.c;
      const target = this.pickTarget(c.px[index], c.py[index], 10);
      if (target) {
        const a = Math.atan2(target.y / 100 - c.py[index], target.x / 100 - c.px[index]), v = Math.hypot(c.vx[index], c.vy[index]);
        c.vx[index] = Math.cos(a) * v; c.vy[index] = Math.sin(a) * v; st.target = target.id;
      }
    }
    c_resetAge(this.c, index);
  }

  /** World hook: a wall / obstacle stopped the carrier. True = it bounced (地形弹射). */
  onWall(index) {
    const c = this.c;
    const st = this.state.get(c.id[index]);
    if (!st || st.bouncesLeft <= 0) return false;
    c.vx[index] = -c.vx[index]; c.vy[index] = -c.vy[index];
    this.bounced(index, st);
    return true;
  }

  split(index, st, force = false) {
    const R = this.R;
    const s = p => this.s(p);
    if (st.splitsLeft <= 0) return;
    if (!force && !(s('proj.split_on_hit') || R.chance(s('proj.split_chance')))) return;
    --st.splitsLeft;
    const c = this.c;
    const count = 2 + Math.floor(s('proj.split_count'));
    const spread = Math.max(0, 60 - s('proj.split_spread')) * Math.PI / 180;
    for (let k = 0; k < count; ++k) {
      const a = count > 1 ? (k / (count - 1) - 0.5) * spread : 0;
      const spawned = this.clone(index, c.root[index], { angle: a, damageScale: 0.5 * (1 + s('proj.split_damage') / 100), lifeScale: 1 + s('proj.split_distance') / 100, gen: st.gen });
      if (spawned !== INDEX_NONE) { c.copyHits(index, spawned); const child = this.state.get(c.id[spawned]); if (child) { child.splitsLeft = st.splitsLeft; child.splitDone = true; } }
    }
  }

  // ---------------------------------------------------------------- contact
  /** World hook after a projectile hit. True keeps the carrier (no pierce consumed). */
  onContact(index, target, result) {
    const c = this.c;
    const st = this.state.get(c.id[index]);
    if (!st) return false;
    const R = this.R;
    const s = p => this.s(p);
    ++st.hits;
    const targetId = R.world.targets.externalId[target];
    const x = c.px[index], y = c.py[index];
    if (st.roamingSpec) st.rehitQueue.push({ id: targetId, at: R.time + .5 * Math.max(.05, 1 - s('proj.rehit_interval') / 100) });
    if (result.applied > 0 && R.chance(s('proj.explode_chance'))) R.strike(x, y, 1.5 * Math.sqrt(1 + s('proj.explode_area') / 100) * R.areaScale({ element: c.element[index] }), result.applied * 0.6 * (1 + s('proj.explode_damage') / 100), c.element[index], { effect: 'projectile_explosion', depth: 2, ...this.damageSource(index) });
    if (s('proj.hit_zone')) this.fields.push({ x, y, left: 2, tick: 0, dps: Math.max(1, result.applied) * 0.2, element: c.element[index], source: this.damageSource(index) });
    if (st.gen === 0 || st.gen === 1) this.split(index, st);
    // 连锁 (runtime chains, independent of the 弹射 rule)
    if (st.chainsLeft > 0) {
      const exclude = new Set([targetId]);
      if (!s('proj.chain_rehit') || s('proj.prefer_unhit')) for (let k = 0; k < c.hitNum[index]; ++k) exclude.add(c.hitIds[index * 6 + k]);
      let next = R.enemiesNear(x, y, 8 * (1 + s('proj.chain_distance') / 100), exclude)[0];
      if (!next && s('proj.chain_rehit')) next = R.enemiesNear(x, y, 8 * (1 + s('proj.chain_distance') / 100), new Set([targetId]))[0];
      if (next) {
        --st.chainsLeft; ++st.chained;
        const a = Math.atan2(next.y / 100 - y, next.x / 100 - x), v = Math.hypot(c.vx[index], c.vy[index]);
        c.vx[index] = Math.cos(a) * v; c.vy[index] = Math.sin(a) * v; c.age[index] = 0;
        if (s('proj.chain_rehit')) { c.hitNum[index] = 0; c.hitOverflow[index] = 0; c.hitIds[index * 6] = targetId; c.hitNum[index] = 1; }
        for (const t of R.t('proj_chain_secondary')) this.secondary(index, st, t.params.n);
        R.triggers.event('trig_chain', { x, y, id: targetId });
        if (st.chainsLeft === 0 && s('proj.return_chain_done')) this.startReturn(index, st);
        return true;
      }
    }
    if (st.returning) return true;
    // Orbiting projectiles keep circling (they re-hit after the re-hit interval).
    if (s('proj.orbit') && st.gen === 0) return true;
    if (st.roamingSpec) return true;
    // 穿透概率
    if (R.chance(s('proj.pierce_chance'))) { this.pierced(index, st, x, y, targetId); return true; }
    if (c.pierce[index] > 0) { this.pierced(index, st, x, y, targetId); return false; }
    if (s('proj.return_pierce_done') && (st.pierced > 0 || c.pierce[index] === 0)) { this.startReturn(index, st); return true; }
    return false;
  }
  pierced(index, st, x, y, targetId) {
    const c = this.c;
    const R = this.R;
    const s = p => this.s(p);
    ++st.pierced;
    const v = 1 + s('proj.pierce_speed') / 100;
    c.vx[index] *= v; c.vy[index] *= v;
    c.radius[index] *= 1 + s('proj.pierce_radius') / 100;
    R.triggers.event('trig_pierce', { x, y, id: targetId });
    for (const t of R.t('proj_pierce_secondary')) if (++st.piercedSinceSecondary >= Math.max(1, t.params.per)) { st.piercedSinceSecondary = 0; this.secondary(index, st, 2); }
  }

  startReturn(index, st) {
    const c = this.c;
    if (st.returning) return;
    st.returning = true;
    c.flags[index] &= ~(Projectiles.PendingImpact | Projectiles.Parabolic);
    c.gravity[index] = 0; c.vz[index] = 0;
    if (this.s('proj.return_rehit')) { c.hitNum[index] = 0; c.hitOverflow[index] = 0; }
    this.R.triggers.event('trig_return', { x: c.px[index], y: c.py[index] });
  }

  recall(index, st) {
    const R = this.R;
    st.recalled = true;
    R.c.recover('mana', this.s('proj.recall_mana'));
    for (const t of R.t('proj_recall_empower')) {
      t.acc = (t.acc || 0) + 1;
      if (t.acc >= Math.max(1, t.params.per)) { t.acc = 0; R.c.pendingEmpower += t.params.n; }
    }
    ++this.recalled;
    R.world.endProjectile(index, EEndReason.Impact);
  }

  /** World hook before a carrier ends. True keeps it alive (returning). */
  onEnd(index, reason) {
    const c = this.c;
    const st = this.state.get(c.id[index]);
    if (!st) return false;
    const R = this.R;
    const s = p => this.s(p);
    if (st.recalled) { this.state.delete(c.id[index]); return false; }
    if (!st.returning && st.gen === 0) {
      if (reason === EEndReason.Expired && s('proj.return_at_max')) { this.startReturn(index, st); c.age[index] = 0; return true; }
      if (reason === EEndReason.Impact && s('proj.return_pierce_done')) { this.startReturn(index, st); return true; }
    }
    if (s('proj.explode_on_expire')) R.strike(c.px[index], c.py[index], 1.5 * Math.sqrt(1 + s('proj.explode_area') / 100) * R.areaScale({ element: c.element[index] }), c.damage[index] * 0.6 * (1 + s('proj.explode_damage') / 100), c.element[index], { effect: 'projectile_explosion', depth: 2, ...this.damageSource(index) });
    if (st.gen < 2) for (const t of R.t('proj_expire_secondary')) this.secondary(index, st, t.params.n);
    this.state.delete(c.id[index]);
    return false;
  }

  onRicochet(index, event) {
    if (!this.s('proj.chain_rehit')) return INDEX_NONE;
    const t = this.R.world.targets;
    let best = INDEX_NONE, bestD = Infinity;
    for (let i = 0; i < t.num; ++i) {
      if (!(t.health[i] > 0) || i === event.targetIndex || t.team[i] === 0) continue;
      const d = Math.hypot(t.px[i] - event.px, t.py[i] - event.py);
      if (d < bestD && d <= 8 * (1 + this.s('proj.chain_distance') / 100)) { bestD = d; best = i; }
    }
    return best;
  }

  onRedirect(index, mode) {
    const c = this.c;
    const st = this.state.get(c.id[index]);
    if (!st) return;
    if (mode === ERedirect.Return) {
      st.returning = true;
      if (this.s('proj.return_rehit')) { c.hitNum[index] = 0; c.hitOverflow[index] = 0; }
      this.R.triggers.event('trig_return', { x: c.px[index], y: c.py[index] });
    } else if (mode === ERedirect.Ricochet) {
      ++st.chained;
      for (const t of this.R.t('proj_chain_secondary')) this.secondary(index, st, t.params.n);
      this.R.triggers.event('trig_chain', { x: c.px[index], y: c.py[index] });
    }
  }

  // ---------------------------------------------------------------- damage
  damageMod(mod, info, targetId, ri) {
    const st = this.state.get(info.sourceId);
    const s = p => this.s(p);
    const R = this.R;
    if (st) {
      mod.more *= 1 + Math.min(100, (st.hits - 1) * s('proj.per_hit_damage')) / 100;
      mod.more *= Math.pow(1 - 0.15 * Math.max(0, 1 - s('proj.pierce_decay') / 100), st.pierced) * (1 + Math.min(100, st.pierced * s('proj.pierce_damage')) / 100);
      mod.more *= Math.pow(1 - 0.15 * Math.max(0, 1 - s('proj.chain_decay') / 100), st.chained) * (1 + Math.min(100, st.chained * s('proj.chain_damage')) / 100);
      mod.more *= 1 + st.bounced * s('proj.bounce_damage') / 100;
      if (st.returning) mod.more *= 1 + s('proj.return_damage') / 100;
      if (st.distance < 3) mod.increased += s('proj.near_damage');
      if (st.distance > 7) mod.increased += s('proj.far_damage');
      for (const t of R.t('proj_distance_damage')) mod.increased += Math.min(t.params.max, Math.floor(st.distance / Math.max(0.1, t.params.meters)) * t.params.n);
      if (s('proj.decel')) { const c = this.c, i = info.sourceIndex; mod.more *= 1 + 0.2 * Math.min(1, Math.max(0, 1 - Math.hypot(c.vx[i], c.vy[i]) / Math.max(1e-6, st.speed0)) / 0.4); }
    }
    // 同批投射物：同一目标的命中上限与衰减
    const batch = st?.batch ?? (ri?.kind === 'cast' ? (ri.batch ||= new Map()) : null);
    if (batch) {
      const count = batch.get(targetId) || 0;
      if (count >= 3 + Math.floor(s('proj.batch_cap')) && !st?.returning && !s('proj.orbit')) { mod.miss = true; return; }
      batch.set(targetId, count + 1);
      if (count > 0) mod.more *= Math.pow(1 - 0.3 * Math.max(0, 1 - s('proj.batch_decay') / 100), count);
    }
  }

  // ---------------------------------------------------------------- casts / per frame
  /** 连续发射: re-cast the same plan after the volley interval. */
  onCast(rootIndex, planIndex) {
    const n = Math.floor(this.s('proj.volleys'));
    const family = this.R.skillFamily(planIndex);
    if (!(n > 0) || !family.projectile || family.summon) return;
    const interval = 0.15 * Math.max(0.05, 1 - this.s('proj.volley_interval') / 100);
    for (let k = 1; k <= n; ++k) this.volleys.push({ at: this.R.time + k * interval, plan: planIndex, target: this.R.world.roots[rootIndex]?.targetPoint, capture: this.R.rootInfo(rootIndex)?.capture });
  }

  tick(dt) {
    const R = this.R;
    const w = R.world;
    for (const v of this.volleys.filter(v => v.at <= R.time)) {
      if (v.shots) { this.repeatVolley(v); continue; }
      const hero = R.hero, aim = hero.aim || { x: 1, y: 0 };
      const a = v.capture,root = w.cast(v.plan, hero.owner, a?.origin.x ?? hero.x / 100 + aim.x * 0.6, a?.origin.y ?? hero.y / 100 + aim.y * 0.6, a?.origin.z ?? 0.6, a?.dx ?? aim.x, a?.dy ?? aim.y, 0, BigInt(Math.floor(R.rand() * 1e9)), a?.power ?? hero.power ?? 0, v.target, { manual: false });
      if (root !== INDEX_NONE) R.register(root, { kind: 'cast', volley: true, ...(a?{capture:a}:{}) });
    }
    this.volleys = this.volleys.filter(v => v.at > R.time);
    for (const f of this.fields) {
      f.left -= dt; f.tick += dt;
      if (f.tick >= 0.5) { f.tick -= 0.5; R.strike(f.x, f.y, 1.2, f.dps * 0.5, f.element, { effect: 'projectile_zone', depth: 2, ...f.source }); }
    }
    this.fields = this.fields.filter(f => f.left > 0);
    if (this.state.size > 5000) for (const id of [...this.state.keys()].slice(0, 2500)) this.state.delete(id);
  }

  view() { return this.fields.map(f => ({ x: f.x, y: f.y, radius: 1.2, left: f.left, element: f.element })); }
}

function c_resetAge(c, index) { c.age[index] = Math.min(c.age[index], c.life[index] * 0.5); }
