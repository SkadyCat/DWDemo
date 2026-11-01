// 载体系统：投射物与地面区域。投射物命中顺序沿用流放规则：穿透 → 分叉 → 连锁 → 分裂；
// 全部用完后，有回旋次数就折返（返程可以再次命中），否则在终点执行 onEnd。
import { hitAndFollow, run } from './actions.mjs';

const FORK_ANGLE = Math.PI / 6;

export class Carriers {
  constructor() { this.projectiles = []; this.zones = []; this.spawned = 0; }

  spawnProjectile(p) {
    p.dx = Math.cos(p.angle); p.dy = Math.sin(p.angle);
    p.life = p.lifetime; p.alive = true; p.returning = false; p.id = ++this.spawned;
    this.projectiles.push(p);
    p.inv.world.emit({ type: 'projectileSpawn', source: p.inv.caster, skill: p.inv.skill, x: p.x, y: p.y, angle: p.angle, carrier: p.id, kind: p.action.kind, depth: p.inv.depth });
    return p;
  }
  spawnZone(z) { z.alive = true; z.id = ++this.spawned; this.zones.push(z); z.inv.world.emit({ type: 'zoneSpawn', source: z.inv.caster, skill: z.inv.skill, x: z.x, y: z.y, radius: z.radius, kind: z.action.kind, carrier: z.id, depth: z.inv.depth }); return z; }

  step(world, dt) {
    for (const p of this.projectiles) if (p.alive) this.moveProjectile(world, p, dt);
    for (const z of this.zones) if (z.alive) this.tickZone(world, z, dt);
    if (this.projectiles.some(p => !p.alive)) this.projectiles = this.projectiles.filter(p => p.alive);
    if (this.zones.some(z => !z.alive)) this.zones = this.zones.filter(z => z.alive);
  }

  moveProjectile(world, p, dt) {
    const caster = p.inv.caster;
    if (p.returning) { const dx = caster.x - p.x, dy = caster.y - p.y, d = Math.hypot(dx, dy) || 1; p.dx = dx / d; p.dy = dy / d; }
    let travel = p.speed * dt;
    p.life -= dt;
    while (travel > 0 && p.alive) {
      // Closest enemy touched along this segment.
      let ex = p.x + p.dx * travel, ey = p.y + p.dy * travel, wall = false;
      if (world.terrain) { const f = world.terrain.sweep(p.x, p.y, ex, ey, 1); if (f >= 0) { ex = p.x + (ex - p.x) * f; ey = p.y + (ey - p.y) * f; travel *= f; wall = true; } }
      let best = null, bestT = Infinity;
      world.grid.query((p.x + ex) / 2, (p.y + ey) / 2, travel / 2 + p.radius, o => {
        if (p.hitIds.has(o.id)) return;
        const t = segmentHit(p.x, p.y, ex, ey, o.x, o.y, o.radius + p.radius);
        if (t !== null && (t < bestT || (t === bestT && o.id < best.id))) { bestT = t; best = o; }
      }, { notTeam: caster.team });
      if (!best) { p.x = ex; p.y = ey; travel = 0; if (wall) p.life = 0; break; }
      p.x += (ex - p.x) * bestT; p.y += (ey - p.y) * bestT;
      travel *= 1 - bestT;
      this.onHit(world, p, best);
    }
    if (p.returning && Math.hypot(caster.x - p.x, caster.y - p.y) < caster.radius + p.radius) p.life = 0;
    if (p.alive && p.life <= 0) this.end(world, p);
  }

  onHit(world, p, target) {
    p.hitIds.add(target.id);
    world.emit({ type: 'projectileHit', source: p.inv.caster, target, skill: p.inv.skill, x: target.x, y: target.y, carrier: p.id, depth: p.inv.depth });
    hitAndFollow(p.action, p.inv.fork({ target, origin: { x: p.x, y: p.y } }), target);
    if (p.returning) return;
    if (p.pierce > 0) { p.pierce--; return; }
    if (p.fork > 0) {
      p.fork--;
      const a = Math.atan2(p.dy, p.dx);
      this.spawnProjectile({ ...p, angle: a + FORK_ANGLE, hitIds: new Set(p.hitIds), life: undefined });
      p.dx = Math.cos(a - FORK_ANGLE); p.dy = Math.sin(a - FORK_ANGLE);
      return;
    }
    if (p.chain > 0) {
      const next = world.nearest(target, 'ally', p.chainRadius, p.hitIds);
      if (next && next.team !== p.inv.caster.team) {
        p.chain--;
        const dx = next.x - p.x, dy = next.y - p.y, d = Math.hypot(dx, dy) || 1;
        p.dx = dx / d; p.dy = dy / d; p.life = Math.max(p.life, d / p.speed + 0.1);
        return;
      }
    }
    if (p.split > 0) {
      const n = p.split, used = new Set(p.hitIds);
      for (let i = 0; i < n; ++i) {
        const t = world.nearest(target, 'ally', p.chainRadius, used);
        const ang = t && t.team !== p.inv.caster.team ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.dy, p.dx) + (i - (n - 1) / 2) * 0.5;
        if (t) used.add(t.id);
        // Split children keep piercing and returning but do not chain or fork again (no exponential trees).
        this.spawnProjectile({ ...p, angle: ang, split: 0, chain: 0, fork: 0, hitIds: new Set(p.hitIds), life: undefined });
      }
      p.split = 0;
    }
    this.end(world, p);
  }

  end(world, p) {
    if (p.returns > 0 && !p.returning) {
      p.returns--; p.returning = true; p.hitIds = new Set(); p.life = 4;
      world.emit({ type: 'projectileReturn', source: p.inv.caster, skill: p.inv.skill, x: p.x, y: p.y, carrier: p.id, depth: p.inv.depth });
      return;
    }
    p.alive = false;
    world.emit({ type: 'projectileEnd', source: p.inv.caster, skill: p.inv.skill, x: p.x, y: p.y, carrier: p.id, depth: p.inv.depth });
    if (p.action.onEnd) run(p.action.onEnd, p.inv.fork({ origin: { x: p.x, y: p.y }, aim: { x: p.x, y: p.y }, target: null }));
  }

  tickZone(world, z, dt) {
    if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; if (!z.follow.alive) z.remaining = 0; }
    z.remaining -= dt; z.timer -= dt;
    while (z.timer <= 0 && z.remaining > -1e-9) {
      z.timer += z.interval;
      const inv = z.inv.fork({ origin: { x: z.x, y: z.y }, aim: { x: z.x, y: z.y } });
      inv.vars = z.inv.vars; // zone variables persist across pulses (brand energy, stacking fields)
      if (z.follow && z.follow !== inv.caster) inv.target = z.follow;
      const a = z.action, hits = a.hit === true || !!a.damage, follow = hits ? a : { ...a, hit: false };
      if (hits || a.onHit) {
        const inside = [];
        world.around(z.x, z.y, z.radius, o => inside.push(o), { notTeam: inv.caster.team });
        inside.sort((p, q) => p.id - q.id);
        for (const o of inside) if (o.alive) hitAndFollow(follow, inv, o);
      }
      if (a.onPulse) run(a.onPulse, inv);
    }
    if (z.remaining <= 0) { z.alive = false; world.emit({ type: 'zoneEnd', source: z.inv.caster, x: z.x, y: z.y, carrier: z.id }); }
  }
}

/** Fraction t∈[0,1] along a→b where a circle (c, r) is first touched, or null. */
export function segmentHit(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (a === 0) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
