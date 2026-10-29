// Mirror of DWRuleWorld.h / DWRuleWorld.cpp / DWRuleVM.cpp: SoA carriers, host-filled
// targets, wave-based rule VM. Single thread (the native parallel sweep is order-independent
// by construction: contacts are sorted, so serial execution yields the same result).
import {
  f, FLT_MAX, KINDA_SMALL_NUMBER, InvalidId, INDEX_NONE, U16_MAX, MaxGeneration, NumResistances,
  EBuiltinEvent, EOp, ECond, EScope, ELayout, EOrigin, ERedirect, EEndReason, Tags, tagBit, KeepInherited,
  compare, mix64, random01, resistanceIndex, roundToInt32, floorToInt32, clamp, hashName,
  vsize, vsizeSquared, vdot, nearlyZero, safeNormal, rotateAroundUp,
  EStatusEffect, EStacking, EControl, MaxTicksPerSubstep,
} from './types.js';
import { sortStatusDefs } from './statuses.js';
import { EStat, getStatInfo, elementStatId, EElementStat } from './stats.js';
import { ESlot, EExprOp, ActionFlag, evaluateExpr } from './compiler.js';
import { parabolicLaunch } from './parabolic.js';
import { fallingLaunch, fallingOffset } from './falling.js';
import { rawHitDamage } from './combat/damage-values.js';

export const DEFAULT_WORLD_CONFIG = Object.freeze({
  MaxProjectiles: 4096,
  // Rule actions executed per world frame before remaining events are deferred.
  WorkPerFrame: 20000,
  RootWorkCap: 16384,
  MaxWaves: 8,
  MaxDeferredEvents: 65536,
  FixedStep: f(1 / 60),
  MaxSubsteps: 2,
  CellSize: 3,
  bParallel: true,
  ParallelChunk: 128,
});

const TAG_PROJECTILE = tagBit(Tags.Projectile);
// Accumulated tick times drift in float32; the tick landing on the expiry still counts.
const TICK_EPSILON = f(1e-3);
const TAG_DIRECT = tagBit(Tags.Direct);
const TAG_FIRST_HIT = tagBit(Tags.FirstHit);
const TAG_CRITICAL = tagBit(Tags.Critical);
const TAG_OWNER_KILL = tagBit(Tags.OwnerKill);
const TAG_AREA = tagBit(Tags.Area);
const TAG_REFRACTION = tagBit(Tags.Refraction);
const TAG_MANUAL_ROOT = tagBit(Tags.Manual) | tagBit(Tags.Root);

const channelDepth = (lineage, channel) => (lineage >>> (channel * 8)) & 0xFF;
function bumpChannel(lineage, channel) {
  if (channel < 0) return lineage;
  const depth = Math.min(channelDepth(lineage, channel) + 1, 255);
  const mask = (0xFF << (channel * 8)) >>> 0;
  return ((lineage & ~mask) | (depth << (channel * 8))) >>> 0;
}
function flatDirection(x, y, fallback) {
  return nearlyZero(x, y, 0) ? [fallback[0], fallback[1], fallback[2]] : safeNormal(x, y, 0);
}

// Earliest t in [0,1] where a segment enters a sphere; -1 if it never does.
function sweepSphere(sx, sy, sz, dx, dy, dz, cx, cy, cz, radius) {
  const ox = f(sx - cx), oy = f(sy - cy), oz = f(sz - cz);
  const c = f(vsizeSquared(ox, oy, oz) - f(radius * radius));
  if (c <= 0) return 0;
  const a = vsizeSquared(dx, dy, dz);
  if (a < KINDA_SMALL_NUMBER) return -1;
  const b = f(2 * vdot(ox, oy, oz, dx, dy, dz));
  const disc = f(f(b * b) - f(f(4 * a) * c));
  if (disc < 0) return -1;
  const time = f(f(-b - f(Math.sqrt(disc))) / f(2 * a));
  return time < 0 || time > 1 ? -1 : time;
}

const now = () => globalThis.performance.now();

// Host writes targets every frame (meters). Health is a mirror: the world decrements it
// and reports damage records that the host commits to its authoritative store.
export class Targets {
  constructor() { this.reset(); }
  reset() {
    this.px = []; this.py = []; this.pz = [];
    this.radius = []; this.health = []; this.team = []; this.externalId = [];
    // Four values per target: fire, frost, lightning, poison.
    this.resistance = [];
  }
  add(x, y, z, radius, health, team, externalId, resistance = null) {
    const index = this.px.length;
    this.px.push(f(x)); this.py.push(f(y)); this.pz.push(f(z));
    this.radius.push(f(radius)); this.health.push(f(health)); this.team.push(team & 0xFF); this.externalId.push(externalId >>> 0);
    for (let e = 0; e < NumResistances; ++e) this.resistance.push(resistance ? f(resistance[e] ?? 0) : 0);
    return index;
  }
  get num() { return this.px.length; }
}

const HIT_INLINE = 6;

export class Projectiles {
  static Dead = 1;
  static PendingImpact = 2;
  static Explicit = 4;
  static Parabolic = 8;
  static Falling = 16;
  static Ballistic = 24;

  constructor(capacity) {
    this.capacity = capacity;
    this.id = new Uint32Array(capacity);
    this.root = new Uint32Array(capacity);
    this.owner = new Uint32Array(capacity);
    this.px = new Float32Array(capacity); this.py = new Float32Array(capacity); this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity); this.vy = new Float32Array(capacity); this.vz = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.damage = new Float32Array(capacity);
    this.pierce = new Uint16Array(capacity);
    this.ricochet = new Uint16Array(capacity);
    this.reflect = new Uint16Array(capacity);
    this.ret = new Uint16Array(capacity);
    this.refract = new Uint16Array(capacity);
    this.kind = new Uint16Array(capacity);
    this.endEvent = new Uint16Array(capacity);
    this.generation = new Uint8Array(capacity);
    this.lineage = new Uint32Array(capacity);
    this.element = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.tags = new BigUint64Array(capacity);
    this.hitIds = new Uint32Array(capacity * HIT_INLINE);
    this.hitNum = new Uint8Array(capacity);
    this.hitOverflow = new Uint8Array(capacity);
    this.num = 0;
  }

  allocate(newId) {
    if (this.num >= this.capacity) return INDEX_NONE;
    const i = this.num++;
    this.id[i] = newId;
    this.age[i] = 0;
    this.gravity[i] = 0;
    this.pierce[i] = 0; this.ricochet[i] = 0; this.reflect[i] = 0; this.ret[i] = 0; this.refract[i] = 0;
    this.endEvent[i] = U16_MAX;
    this.flags[i] = 0;
    this.hitNum[i] = 0; this.hitOverflow[i] = 0;
    return i;
  }

  copyHits(from, to) {
    this.hitIds.copyWithin(to * HIT_INLINE, from * HIT_INLINE, from * HIT_INLINE + HIT_INLINE);
    this.hitNum[to] = this.hitNum[from];
    this.hitOverflow[to] = this.hitOverflow[from];
  }

  moveSlot(from, to) {
    for (const key of ['id', 'root', 'owner', 'px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'radius', 'damage', 'pierce', 'ricochet', 'reflect', 'ret',
      'refract', 'kind', 'endEvent', 'generation', 'lineage', 'element', 'flags', 'tags', 'gravity']) this[key][to] = this[key][from];
    this.copyHits(from, to);
  }
}

const newEvent = () => ({
  type: 0, generation: 0, element: 1, root: 0, sequence: 0, lineage: 0,
  sourceIndex: INDEX_NONE, sourceId: InvalidId, targetIndex: INDEX_NONE, targetId: InvalidId,
  px: 0, py: 0, pz: 0, dx: 0, dy: 0, dz: 0, amount: 0, damage: 0, stored: 0, tags: 0n,
});

const newFrameStats = () => ({
  Substeps: 0, Projectiles: 0, Contacts: 0, Hits: 0, Kills: 0, Events: 0, Actions: 0, Waves: 0, Deferred: 0, DroppedEvents: 0,
  BudgetStops: 0, DepthBlocked: 0, ChainBlocked: 0, CapacityDrops: 0, StatusApplied: 0, Statuses: 0, MotionMs: 0, RulesMs: 0, TotalMs: 0,
});

export class RuleWorld {
  constructor(config = {}) {
    this.config = { ...DEFAULT_WORLD_CONFIG, ...config };
    this.config.FixedStep = f(this.config.FixedStep);
    this.plans = [];
    this.owners = [];
    this.roots = [];
    this.freeRoots = [];
    this.targets = new Targets();
    this.carriers = new Projectiles(Math.max(1, this.config.MaxProjectiles));
    this.summons = [];
    this.emissions = [];
    this.nextSummonId = 1;
    this.current = [];
    this.next = [];
    this.deferred = [];
    this.damageLog = [];
    this.ownerState = new Map();
    this.targetState = new Map();
    this.statuses = new Map();
    this.statusDefs = new Map();
    this.effectDefs = Array.from({ length: EStatusEffect.Num }, () => []);
    this.targetDefensePlans = new Map();
    this.clock = 0;
    this.cells = new Map();
    this.cellOrder = [];
    this.maxTargetRadius = 0;
    this.contacts = [];
    this.frameStats = newFrameStats();
    this.nextProjectileId = 1;
    this.accumulator = 0;
    this.frameWork = 0;
    // Optional observer (tools only): (kind, payload) => void. Never alters results.
    this.trace = null;
  }

  // ---------------------------------------------------------------- public API

  addPlan(plan) { return this.plans.push(plan) - 1; }

  addOwner(externalId, team) {
    return this.owners.push({ px: 0, py: 0, pz: 0, aim: [1, 0, 0], externalId: externalId >>> 0, statusId: externalId >>> 0, team: team & 0xFF, liveProjectiles: 0 }) - 1;
  }

  // Id under which statuses applied to / read from this owner live (its own target id when it is also a target).
  setOwnerStatusId(owner, statusId) {
    if (this.owners[owner]) this.owners[owner].statusId = statusId >>> 0;
  }

  // Status definitions (engine effects, stacking, caps). Statuses without a definition keep the
  // default behaviour: strongest magnitude, longest duration, no runtime effect.
  setStatusDefs(defs) {
    this.statusDefs = new Map();
    this.effectDefs = Array.from({ length: EStatusEffect.Num }, () => []);
    for (const def of sortStatusDefs(defs)) {
      this.statusDefs.set(def.key, def);
      for (const effect of def.effects) this.effectDefs[effect.type].push({ def, scale: effect.scale, control: effect.control });
    }
  }

  updateOwner(owner, x, y, z, ax, ay, az) {
    const o = this.owners[owner];
    if (!o) return;
    o.px = f(x); o.py = f(y); o.pz = f(z);
    if (!nearlyZero(f(ax), f(ay), 0)) o.aim = safeNormal(f(ax), f(ay), 0);
  }

  getPlan(index) { return this.plans[index]; }
  getStats() { return this.frameStats; }
  getRoot(index) { return this.roots[index]; }
  activeRoots() { return this.roots.reduce((n, root) => n + (root.active ? 1 : 0), 0); }
  getClock() { return this.clock; }

  // Bind compiled defense traits to any target external id. INDEX_NONE clears the binding.
  setTargetDefensePlan(targetExternalId, plan) {
    if (targetExternalId === InvalidId) return false;
    if (plan === INDEX_NONE) { this.targetDefensePlans.delete(targetExternalId >>> 0); return true; }
    if (!this.plans[plan]) return false;
    this.targetDefensePlans.set(targetExternalId >>> 0, plan);
    return true;
  }

  // Returns the root index, or INDEX_NONE. Power is the cast event's amount ({"event":"amount"}).
  cast(planIndex, owner, ox, oy, oz, dx, dy, dz, seed, power = 0, targetPoint = null) {
    if (!this.plans[planIndex] || !this.owners[owner]) return INDEX_NONE;
    let index;
    if (this.freeRoots.length > 0) index = this.freeRoots.pop();
    else { index = this.roots.length; this.roots.push(null); }
    const plan = this.plans[planIndex];
    const root = {
      plan: planIndex, owner, seed: BigInt.asUintN(64, BigInt(seed)), nextSequence: 1, live: 0, pending: 0, work: 0, active: true,
      chainCount: new Uint16Array(plan.rules.length), castState: new Map(), overflowHits: new Set(),
      targetPoint: targetPoint && ['x', 'y', 'z'].every(key => Number.isFinite(targetPoint[key] ?? (key === 'z' ? 0 : NaN)))
        ? { x: f(targetPoint.x), y: f(targetPoint.y), z: f(targetPoint.z ?? 0) } : null,
    };
    this.roots[index] = root;
    const event = newEvent();
    event.type = EBuiltinEvent.Cast;
    event.root = index;
    event.sequence = root.nextSequence++;
    event.px = f(ox); event.py = f(oy); event.pz = f(oz);
    const fx = f(dx), fy = f(dy);
    const direction = nearlyZero(fx, fy, 0) ? this.owners[owner].aim : safeNormal(fx, fy, 0);
    [event.dx, event.dy, event.dz] = direction;
    event.tags = TAG_MANUAL_ROOT;
    event.amount = Number.isFinite(power) ? Math.max(0, f(power)) : 0;
    event.damage = event.amount;
    ++root.pending;
    this.deferred.push(event);
    return index;
  }

  step(deltaSeconds) {
    const start = now();
    this.frameStats = newFrameStats();
    this.frameWork = 0;
    const step = this.config.FixedStep;
    this.accumulator = Math.min(f(this.accumulator + Math.max(0, f(deltaSeconds))), f(step * this.config.MaxSubsteps));
    // Deferred events and new casts first: casts spawn carriers that move this frame.
    this.current = this.deferred;
    this.deferred = [];
    this.pruneStatuses();
    // Targets are replaced by the host each frame; queued area casts need the new spatial index.
    this.buildGrid();
    this.drainWaves();
    while (this.accumulator >= f(step * f(0.999))) {
      this.substep(step);
      this.accumulator = f(this.accumulator - step);
      ++this.frameStats.Substeps;
    }
    this.compact();
    this.releaseRoots();
    this.frameStats.Projectiles = this.carriers.num;
    this.frameStats.Deferred = this.deferred.length;
    this.frameStats.Statuses = this.statuses.size;
    this.frameStats.TotalMs = now() - start;
  }

  // Live magnitude of a status on a target external id (value × stacks, capped), 0 when absent or expired.
  getStatus(targetExternalId, key) {
    if (targetExternalId === InvalidId) return 0;
    const found = this.statuses.get(`${targetExternalId >>> 0}|${key}`);
    return found && found.targetId === (targetExternalId >>> 0) && found.expire > this.clock ? this.magnitude(found) : 0;
  }

  getStatusStacks(targetExternalId, key) {
    const found = this.statuses.get(`${targetExternalId >>> 0}|${key}`);
    return found && found.targetId === (targetExternalId >>> 0) && found.expire > this.clock ? found.stacks : 0;
  }

  magnitude(status) {
    let value = f(status.value * status.stacks);
    const def = this.statusDefs.get(status.key);
    if (def && def.cap > 0) value = Math.min(value, def.cap);
    return value;
  }

  // Σ scale × magnitude over the live statuses of one id that carry the effect (definition order).
  effectSum(statusId, type) {
    let sum = 0;
    for (const entry of this.effectDefs[type]) {
      const value = this.getStatus(statusId, entry.def.key);
      if (value > 0) sum = f(sum + f(entry.scale * value));
    }
    return sum;
  }

  /** Host query: summed effect (control: strongest EControl) and the longest remaining time of its sources. */
  getStatusEffect(targetExternalId, type) {
    let value = 0;
    let remaining = 0;
    for (const entry of this.effectDefs[type] || []) {
      const magnitude = this.getStatus(targetExternalId, entry.def.key);
      if (!(magnitude > 0)) continue;
      value = type === EStatusEffect.Control ? Math.max(value, entry.control) : f(value + f(entry.scale * magnitude));
      remaining = Math.max(remaining, this.getStatusRemaining(targetExternalId, entry.def.key));
    }
    return { value, remaining };
  }

  getStatusRemaining(targetExternalId, key) {
    const found = this.statuses.get(`${targetExternalId >>> 0}|${key}`);
    return found && found.targetId === (targetExternalId >>> 0) ? Math.max(0, f(found.expire - this.clock)) : 0;
  }

  clearTargetStatuses(targetExternalId) {
    for (const [slot, status] of this.statuses) if (status.targetId === (targetExternalId >>> 0)) this.statuses.delete(slot);
  }

  stateHash() {
    const c = this.carriers;
    const u32 = v => BigInt(v >>> 0);
    let hash = mix64(BigInt(c.num));
    for (let i = 0; i < c.num; ++i) {
      const quantized = (u32(roundToInt32(f(c.px[i] * 100))) << 32n) ^ u32(roundToInt32(f(c.py[i] * 100)));
      hash = mix64(hash ^ quantized ^ BigInt(c.id[i]));
    }
    for (const health of this.targets.health) hash = mix64(hash ^ u32(roundToInt32(f(health * 1000))));
    if (this.summons.length) {
      hash = mix64(hash ^ BigInt(this.summons.length));
      for (const s of this.summons) {
        const position = (u32(roundToInt32(f(s.x * 100))) << 32n) ^ u32(roundToInt32(f(s.y * 100)));
        hash = mix64(hash ^ position ^ BigInt(s.id) ^ u32(roundToInt32(f(s.expire * 1000))));
      }
    }
    for (const job of this.emissions) {
      const shot = job.shot;
      hash = mix64(hash ^ BigInt(shot.context.rootIndex) ^ u32(roundToInt32(job.at * 1000))
        ^ (u32(roundToInt32(shot.sx * 100)) << 32n) ^ u32(roundToInt32(shot.sy * 100)) ^ BigInt(shot.index));
    }
    return hash;
  }

  // ---------------------------------------------------------------- frame pipeline

  substep(dt) {
    this.clock = f(this.clock + dt);
    const motionStart = now();
    this.buildGrid();
    this.tickSummons();
    this.tickEmissions();
    this.drainWaves();
    this.moveAndSweep(dt);
    this.frameStats.MotionMs += now() - motionStart;
    const rulesStart = now();
    this.resolveContacts();
    this.drainWaves();
    this.endPendingImpacts();
    this.expireProjectiles();
    this.drainWaves();
    this.tickStatuses();
    this.frameStats.RulesMs += now() - rulesStart;
  }

  invCell() { return f(1 / Math.max(f(0.1), f(this.config.CellSize))); }

  buildGrid() {
    const inv = this.invCell();
    const t = this.targets;
    const keys = [];
    this.maxTargetRadius = 0;
    for (let i = 0; i < t.num; ++i) {
      if (t.health[i] <= 0) continue;
      keys.push([floorToInt32(f(t.px[i] * inv)), floorToInt32(f(t.py[i] * inv)), i]);
      this.maxTargetRadius = Math.max(this.maxTargetRadius, t.radius[i]);
    }
    keys.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    this.cells = new Map();
    this.cellOrder = new Array(keys.length);
    for (let i = 0; i < keys.length; ++i) {
      this.cellOrder[i] = keys[i][2];
      const key = `${keys[i][0]},${keys[i][1]}`;
      const range = this.cells.get(key);
      if (range) ++range[1];
      else this.cells.set(key, [i, 1]);
    }
  }

  queryTargets(minX, minY, maxX, maxY, visit) {
    const inv = this.invCell();
    const r = this.maxTargetRadius;
    const x0 = floorToInt32(f(f(minX - r) * inv)), x1 = floorToInt32(f(f(maxX + r) * inv));
    const y0 = floorToInt32(f(f(minY - r) * inv)), y1 = floorToInt32(f(f(maxY + r) * inv));
    for (let x = x0; x <= x1; ++x) {
      for (let y = y0; y <= y1; ++y) {
        const range = this.cells.get(`${x},${y}`);
        if (!range) continue;
        for (let slot = range[0]; slot < range[0] + range[1]; ++slot) visit(this.cellOrder[slot]);
      }
    }
  }

  forEachTargetInRadius(cx, cy, radius, visit) {
    const t = this.targets;
    this.queryTargets(f(cx - radius), f(cy - radius), f(cx + radius), f(cy + radius), target => {
      if (t.health[target] <= 0) return;
      const reach = f(radius + t.radius[target]);
      const ddx = f(cx - t.px[target]), ddy = f(cy - t.py[target]);
      if (f(f(ddx * ddx) + f(ddy * ddy)) <= f(reach * reach)) visit(target);
    });
  }

  isHostile(owner, target) {
    return !!this.owners[owner] && this.targets.team[target] !== this.owners[owner].team;
  }

  hitContains(projectile, root, targetId) {
    const c = this.carriers;
    const base = projectile * HIT_INLINE;
    for (let i = 0; i < c.hitNum[projectile]; ++i) if (c.hitIds[base + i] === targetId) return true;
    return c.hitOverflow[projectile] === 1 && root.overflowHits.has(`${c.id[projectile]}:${targetId}`);
  }

  hitAdd(projectile, root, targetId) {
    const c = this.carriers;
    if (c.hitNum[projectile] < HIT_INLINE) { c.hitIds[projectile * HIT_INLINE + c.hitNum[projectile]++] = targetId; return; }
    c.hitOverflow[projectile] = 1;
    root.overflowHits.add(`${c.id[projectile]}:${targetId}`);
  }

  nearestTarget(cx, cy, cz, radius, projectile, root, team) {
    const t = this.targets;
    let best = INDEX_NONE;
    let bestDistance = f(radius * radius);
    this.queryTargets(f(cx - radius), f(cy - radius), f(cx + radius), f(cy + radius), target => {
      if (t.health[target] <= 0 || t.team[target] === team) return;
      if (projectile !== INDEX_NONE && this.hitContains(projectile, root, t.externalId[target])) return;
      const distance = vsizeSquared(f(cx - t.px[target]), f(cy - t.py[target]), f(cz - t.pz[target]));
      if (distance < bestDistance || (distance === bestDistance && best !== INDEX_NONE && target < best)) {
        bestDistance = distance;
        best = target;
      }
    });
    return best;
  }

  moveAndSweep(dt) {
    const c = this.carriers;
    const t = this.targets;
    const out = [];
    for (let index = 0; index < c.num; ++index) {
      if (c.flags[index] & Projectiles.Dead) continue;
      // Web-only trajectories (curves, homing, orbit, acceleration). Unset: straight flight.
      if (this.motionHook) this.motionHook(index, dt);
      const sx = c.px[index], sy = c.py[index], sz = c.pz[index];
      const parabolic = (c.flags[index] & Projectiles.Ballistic) !== 0;
      const step = parabolic ? Math.max(0, Math.min(dt, c.life[index] - c.age[index])) : dt;
      const dx = f(c.vx[index] * step), dy = f(c.vy[index] * step);
      const dz = parabolic ? f(c.vz[index] * step + .5 * c.gravity[index] * step * step) : f(c.vz[index] * step);
      const sweep = parabolic ? { sx, sy, sz, dx, dy, dz } : null;
      if (parabolic) c.vz[index] = f(c.vz[index] + c.gravity[index] * step);
      const fx = f(sx + dx), fy = f(sy + dy), fz = f(sz + dz);
      const radius = c.radius[index];
      const root = this.roots[c.root[index]];
      const team = this.owners[root.owner].team;
      // Optional host geometry (web dungeon). With no provider the shared arena path is unchanged.
      const wallTime = this.sweepObstacle ? this.sweepObstacle(sx, sy, fx, fy, radius) : -1;
      const minX = f(Math.min(sx, fx) - radius), minY = f(Math.min(sy, fy) - radius);
      const maxX = f(Math.max(sx, fx) + radius), maxY = f(Math.max(sy, fy) + radius);
      this.queryTargets(minX, minY, maxX, maxY, target => {
        if (t.team[target] === team || t.health[target] <= 0) return;
        const time = sweepSphere(sx, sy, sz, dx, dy, dz, t.px[target], t.py[target], t.pz[target], f(radius + t.radius[target]));
        if (time < 0 || (wallTime >= 0 && time >= wallTime)) return;
        if (this.hitContains(index, root, t.externalId[target])) return;
        out.push({ projectileId: c.id[index], projectile: index, target, time, ...(sweep ? { sweep } : {}) });
      });
      if (wallTime >= 0) out.push({ projectileId: c.id[index], projectile: index, target: INDEX_NONE, time: wallTime, ...(sweep ? { sweep } : {}) });
      c.px[index] = fx; c.py[index] = fy; c.pz[index] = fz;
      c.age[index] = f(c.age[index] + dt);
    }
    // Stable order independent of thread count: carrier creation order, then time.
    out.sort((a, b) => (a.projectileId !== b.projectileId ? a.projectileId - b.projectileId : a.time !== b.time ? a.time - b.time : a.target - b.target));
    this.contacts = out;
    this.frameStats.Contacts += out.length;
  }

  resolveContacts() {
    const c = this.carriers;
    const t = this.targets;
    for (const contact of this.contacts) {
      const index = contact.projectile;
      if (contact.target === INDEX_NONE) {
        if (!(c.flags[index] & (Projectiles.Dead | Projectiles.PendingImpact))) {
          const back = f(this.config.FixedStep * f(1 - contact.time));
          c.px[index] = f(c.px[index] - f(c.vx[index] * back));
          c.py[index] = f(c.py[index] - f(c.vy[index] * back));
          c.pz[index] = f(c.pz[index] - f(c.vz[index] * back));
          if (contact.sweep) {
            const s = contact.sweep;
            c.px[index] = f(s.sx + s.dx * contact.time); c.py[index] = f(s.sy + s.dy * contact.time); c.pz[index] = f(s.sz + s.dz * contact.time);
          }
          this.traceProjectileHit(index, null, { surface: 'wall' });
          // Web-only terrain bounce (combat runtime): the carrier keeps flying.
          if (this.wallHook && this.wallHook(index)) continue;
          this.endProjectile(index, EEndReason.Impact);
        }
        continue;
      }
      if ((c.flags[index] & (Projectiles.Dead | Projectiles.PendingImpact)) || t.health[contact.target] <= 0) continue;
      const rootIndex = c.root[index];
      const root = this.roots[rootIndex];
      const targetId = t.externalId[contact.target];
      if (this.hitContains(index, root, targetId)) continue;
      this.hitAdd(index, root, targetId);
      const vx = c.vx[index], vy = c.vy[index], vz = c.vz[index];
      const back = f(this.config.FixedStep * f(1 - contact.time));
      const base = newEvent();
      base.root = rootIndex;
      base.generation = Math.min(c.generation[index] + 1, MaxGeneration);
      base.lineage = c.lineage[index];
      base.element = c.element[index];
      base.sourceIndex = index;
      base.sourceId = c.id[index];
      base.px = f(c.px[index] - f(vx * back)); base.py = f(c.py[index] - f(vy * back)); base.pz = f(c.pz[index] - f(vz * back));
      if (contact.sweep) {
        const s = contact.sweep;
        base.px = f(s.sx + s.dx * contact.time); base.py = f(s.sy + s.dy * contact.time); base.pz = f(s.sz + s.dz * contact.time);
      }
      [base.dx, base.dy, base.dz] = safeNormal(vx, vy, vz);
      base.tags = c.tags[index] | TAG_PROJECTILE | TAG_DIRECT;
      if (c.hitNum[index] === 1 && !c.hitOverflow[index]) base.tags |= TAG_FIRST_HIT;
      const sequence = root.nextSequence++;
      const requested = c.damage[index];
      const result = this.resolveDamage(root, contact.target, requested, c.element[index], sequence,
        { rootIndex, tags: base.tags, sourceIndex: index, sourceId: c.id[index], x: base.px, y: base.py, kind: 'projectile' });
      if (result.missed) continue;
      this.traceProjectileHit(index, base, { surface: 'unit', targetId, amount: result.applied, critical: result.critical });
      this.pushHitEvents(root, rootIndex, base, contact.target, result.applied, requested, result.critical, result.killed, EBuiltinEvent.Hit);
      this.applyRefraction(index, base.px, base.py, base.pz);
      // Web-only: pierce chance, splits, per-hit growth (combat runtime). Returning true keeps the pierce.
      if (this.contactHook && this.contactHook(index, contact.target, result)) continue;
      if (c.pierce[index] > 0) --c.pierce[index];
      else {
        c.flags[index] |= Projectiles.PendingImpact;
        if (contact.sweep) { c.px[index] = base.px; c.py[index] = base.py; c.pz[index] = base.pz; }
      }
    }
  }

  // Presentation fact, independent of damage or rule listeners. Capture the carrier
  // before a pierce/redirect/end or compaction can change its position and kind.
  traceProjectileHit(index, position, details) {
    if (!this.trace) return;
    const c = this.carriers, root = this.roots[c.root[index]];
    const [dx, dy, dz] = safeNormal(c.vx[index], c.vy[index], c.vz[index]);
    this.trace('projectile_hit', {
      id: c.id[index], kind: this.plans[root.plan].kindNames.names[c.kind[index]] || '',
      ownerId: this.owners[root.owner].externalId, element: c.element[index], radius: c.radius[index],
      x: position?.px ?? c.px[index], y: position?.py ?? c.py[index], z: position?.pz ?? c.pz[index],
      dx, dy, dz, ...details,
    });
  }

  applyRefraction(index, ax, ay, az) {
    const c = this.carriers;
    const count = c.refract[index];
    if (count <= 0 || (c.tags[index] & TAG_REFRACTION)) return;
    c.refract[index] = 0;
    const rootIndex = c.root[index];
    const root = this.roots[rootIndex];
    const angle = this.plans[root.plan].stats.get(EStat.ProjectileRefractionAngle);
    const vx = c.vx[index], vy = c.vy[index], vz = c.vz[index];
    const speed = vsize(vx, vy, vz);
    const [nx, ny, nz] = safeNormal(vx, vy, vz);
    for (let child = 0; child < count; ++child) {
      const offset = count > 1 ? f(angle * f(f(child / (count - 1)) - 0.5)) : 0;
      const [cx, cy, cz] = rotateAroundUp(nx, ny, nz, offset);
      const childTags = (c.tags[index] & KeepInherited) | TAG_REFRACTION;
      const spawned = this.spawnProjectile(root, rootIndex, ax, ay, az, cx, cy, cz, speed, c.life[index], c.radius[index], c.damage[index],
        c.element[index], c.kind[index], childTags, Math.min(c.generation[index] + 1, MaxGeneration), c.lineage[index]);
      if (spawned === INDEX_NONE) break;
      // The parent target must not be hit again by its own refraction.
      c.copyHits(index, spawned);
      c.flags[spawned] |= Projectiles.Explicit;
    }
  }

  resolveDamage(root, target, amount, element, sequence, info = null) {
    const t = this.targets;
    const health = t.health[target];
    if (health <= 0 || amount <= 0) return { applied: 0, critical: false, killed: false };
    const stats = this.plans[root.plan].stats;
    const ownerStatus = this.owners[root.owner].statusId;
    // Web-only combat affixes (engine/combat-runtime.mjs). Unset in the shared runtime: no effect.
    const mod = this.damageHook ? this.damageHook(root, target, amount, element, info) : null;
    if (mod && mod.miss) return { applied: 0, critical: false, killed: false, missed: true };
    let criticalChance = stats.get(EStat.OwnerCriticalChance);
    if (this.effectDefs[EStatusEffect.CriticalChance].length) criticalChance = f(criticalChance + this.effectSum(ownerStatus, EStatusEffect.CriticalChance));
    if (mod) criticalChance = f(criticalChance * mod.critScale + mod.crit);
    const critical = f(f(random01(root.seed, sequence, 0xC817)) * 100) < criticalChance;
    const criticalFactor = critical ? f((stats.get(EStat.OwnerCriticalMultiplier) + (mod ? mod.critMulti : 0)) / 100) : 1;
    const dealtBonus = this.effectDefs[EStatusEffect.DamageDealt].length ? this.effectSum(ownerStatus, EStatusEffect.DamageDealt) : 0;
    const raw = rawHitDamage(stats, amount, element, mod, criticalFactor, dealtBonus);
    const effective = this.effectiveResistance(target, element, f(stats.get(elementStatId(element, EElementStat.Penetration)) + (mod ? mod.pen : 0)));
    let dealt = this.applyDamageTaken(target, Math.max(0, f(raw * f(1 - f(effective / 100)))));
    if (mod && mod.taken !== 1) dealt = f(dealt * Math.max(0, mod.taken));
    if (mod && mod.adjust) dealt = f(mod.adjust(dealt, health, critical));
    const applied = Math.min(health, dealt);
    t.health[target] = f(health - dealt);
    const killed = t.health[target] <= 0;
    const record = {
      TargetExternalId: t.externalId[target], OwnerExternalId: this.owners[root.owner].externalId,
      Amount: applied, Element: element, bCritical: critical, bKilled: killed,
    };
    // Web-only detail for the combat runtime (non-enumerable: parity rows stay identical).
    if (info) Object.defineProperty(record, 'Info', { value: { ...info, requested: amount, raw, critical, owner: root.owner } });
    this.damageLog.push(record);
    ++this.frameStats.Hits;
    this.frameStats.Kills += killed ? 1 : 0;
    if (this.trace) this.trace('damage', { ...record, requested: f(amount), raw, resistance: effective, sequence, root: root });
    return { applied, critical, killed };
  }

  // Target's elemental resistance after defense traits, cap and penetration (0 for physical/void).
  effectiveResistance(target, element, penetration) {
    const resistIndex = resistanceIndex(element);
    if (resistIndex === INDEX_NONE) return 0;
    const t = this.targets;
    const resistanceStat = elementStatId(element, EElementStat.Resistance);
    const maxResistanceStat = elementStatId(element, EElementStat.MaxResistance);
    let resist = t.resistance[target * NumResistances + resistIndex];
    let cap = getStatInfo(maxResistanceStat).default;
    const defensePlan = this.targetDefensePlans.get(t.externalId[target]);
    if (defensePlan !== undefined) {
      const defense = this.plans[defensePlan].stats;
      resist = defense.from(resistanceStat, resist);
      cap = defense.get(maxResistanceStat);
    }
    resist = Math.min(resist, cap);
    return resist > 0 ? Math.max(0, f(resist - penetration)) : resist;
  }

  // Shock / protection: dealt × (1 + Σ damage_taken / 100), never negative.
  applyDamageTaken(target, dealt) {
    if (!this.effectDefs[EStatusEffect.DamageTaken].length) return dealt;
    const taken = this.effectSum(this.targets.externalId[target], EStatusEffect.DamageTaken);
    return taken !== 0 ? Math.max(0, f(dealt * Math.max(0, f(1 + f(taken / 100))))) : dealt;
  }

  // Damage over time: magnitude is damage per second, ticking every interval up to expiry.
  // Ticks bypass crit, damage bonuses and rules (no hit/kill events): they can never recurse.
  tickStatuses() {
    if (!this.effectDefs[EStatusEffect.DamageOverTime].length || this.statuses.size === 0) return;
    const due = [];
    for (const status of this.statuses.values()) {
      const def = this.statusDefs.get(status.key);
      if (def && def.tickInterval > 0 && status.targetId !== InvalidId && status.nextTick <= this.clock && status.nextTick <= f(status.expire + TICK_EPSILON)) due.push(status);
    }
    if (!due.length) return;
    due.sort((a, b) => a.targetId - b.targetId || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
    const t = this.targets;
    const index = new Map();
    for (let i = 0; i < t.num; ++i) if (!index.has(t.externalId[i])) index.set(t.externalId[i], i);
    for (const status of due) {
      const def = this.statusDefs.get(status.key);
      for (let count = 0; count < MaxTicksPerSubstep && status.nextTick <= this.clock && status.nextTick <= f(status.expire + TICK_EPSILON); ++count) {
        status.nextTick = f(status.nextTick + def.tickInterval);
        const target = index.get(status.targetId);
        if (target === undefined || t.health[target] <= 0) continue;
        const amount = f(this.magnitude(status) * def.tickInterval);
        if (!(amount > 0)) continue;
        const effective = this.effectiveResistance(target, def.tickElement, 0);
        const dealt = this.applyDamageTaken(target, Math.max(0, f(amount * f(1 - f(effective / 100)))));
        const health = t.health[target];
        const applied = Math.min(health, dealt);
        t.health[target] = f(health - dealt);
        const killed = t.health[target] <= 0;
        const owner = this.owners[status.owner];
        const record = {
          TargetExternalId: status.targetId, OwnerExternalId: owner ? owner.externalId : InvalidId,
          Amount: applied, Element: def.tickElement, bCritical: false, bKilled: killed,
        };
        // Web-only marker (non-enumerable: parity rows stay identical): damage over time, not a hit.
        Object.defineProperty(record, 'bDot', { value: true });
        this.damageLog.push(record);
        ++this.frameStats.Hits;
        this.frameStats.Kills += killed ? 1 : 0;
        if (this.trace) this.trace('damage', { ...record, requested: amount, raw: amount, resistance: effective, dot: def.id });
      }
    }
  }

  spawnProjectile(root, rootIndex, ox, oy, oz, dx, dy, dz, speed, life, radius, damageValue, element, kind, tagMask, generation, lineage) {
    const owner = this.owners[root.owner];
    const capacity = Math.trunc(this.plans[root.plan].stats.get(EStat.ProjectileCapacity));
    if (owner.liveProjectiles >= capacity) { ++this.frameStats.CapacityDrops; return INDEX_NONE; }
    const c = this.carriers;
    const index = c.allocate(this.nextProjectileId++);
    if (index === INDEX_NONE) { ++this.frameStats.CapacityDrops; return INDEX_NONE; }
    c.root[index] = rootIndex;
    c.owner[index] = root.owner;
    c.px[index] = ox; c.py[index] = oy; c.pz[index] = oz;
    const [nx, ny, nz] = safeNormal(dx, dy, dz);
    c.vx[index] = f(nx * speed); c.vy[index] = f(ny * speed); c.vz[index] = f(nz * speed);
    c.life[index] = life;
    c.radius[index] = radius;
    c.damage[index] = damageValue;
    c.kind[index] = kind;
    c.generation[index] = generation;
    c.lineage[index] = lineage;
    c.element[index] = element;
    c.tags[index] = BigInt.asUintN(64, tagMask);
    ++root.live;
    ++owner.liveProjectiles;
    return index;
  }

  endProjectile(index, reason) {
    const c = this.carriers;
    if (c.flags[index] & Projectiles.Dead) return;
    // Web-only: returning / expiry effects (combat runtime). Returning true keeps the carrier alive.
    if (this.endHook && this.endHook(index, reason)) return;
    if (reason === EEndReason.Expired && (c.flags[index] & Projectiles.Ballistic)) this.traceProjectileHit(index, null, { surface: 'ground' });
    c.flags[index] |= Projectiles.Dead;
    const rootIndex = c.root[index];
    const root = this.roots[rootIndex];
    --root.live;
    --this.owners[root.owner].liveProjectiles;
    const plan = this.plans[root.plan];
    const endEvent = c.endEvent[index];
    const endRules = plan.hasRules(EBuiltinEvent.ProjectileEnd);
    const custom = reason === EEndReason.Expired && endEvent !== U16_MAX && plan.hasRules(endEvent);
    if (!endRules && !custom) return;
    const event = newEvent();
    event.root = rootIndex;
    event.generation = c.generation[index];
    event.lineage = c.lineage[index];
    event.element = c.element[index];
    event.sourceIndex = index;
    event.sourceId = c.id[index];
    event.px = c.px[index]; event.py = c.py[index]; event.pz = c.pz[index];
    [event.dx, event.dy, event.dz] = safeNormal(c.vx[index], c.vy[index], c.vz[index]);
    const endTag = reason === EEndReason.Expired ? Tags.EndExpired : reason === EEndReason.Impact ? Tags.EndImpact : Tags.EndCapacity;
    event.tags = (c.tags[index] & KeepInherited) | tagBit(endTag);
    if (endRules) {
      event.type = EBuiltinEvent.ProjectileEnd;
      event.sequence = root.nextSequence++;
      this.pushEvent({ ...event });
    }
    if (custom) {
      event.type = endEvent;
      event.sequence = root.nextSequence++;
      this.pushEvent({ ...event });
    }
  }

  endPendingImpacts() {
    const c = this.carriers;
    for (let i = 0; i < c.num; ++i) {
      if ((c.flags[i] & (Projectiles.PendingImpact | Projectiles.Dead)) === Projectiles.PendingImpact) this.endProjectile(i, EEndReason.Impact);
    }
  }

  expireProjectiles() {
    const c = this.carriers;
    for (let i = 0; i < c.num; ++i) {
      if (!(c.flags[i] & Projectiles.Dead) && c.age[i] >= c.life[i]) this.endProjectile(i, EEndReason.Expired);
    }
  }

  compact() {
    const c = this.carriers;
    let write = 0;
    for (let read = 0; read < c.num; ++read) {
      if (c.flags[read] & Projectiles.Dead) continue;
      if (write !== read) c.moveSlot(read, write);
      ++write;
    }
    c.num = write;
  }

  tickSummons() {
    const t = this.targets;
    for (const summon of this.summons) {
      const root = this.roots[summon.root];
      if (this.clock >= summon.expire) { --root.live; summon.dead = true; if (this.summonEndHook) this.summonEndHook(summon); continue; }
      if (summon.storm) {
        const owner = this.owners[root.owner];
        summon.x = owner.px; summon.y = owner.py; summon.z = owner.pz;
      }
      let nearest = INDEX_NONE, distance = f(summon.range * summon.range);
      for (let i = 0; i < t.num; ++i) {
        if (!(t.health[i] > 0) || !this.isHostile(root.owner, i)) continue;
        const dx = f(t.px[i] - summon.x), dy = f(t.py[i] - summon.y), d2 = f(f(dx * dx) + f(dy * dy));
        if (d2 < distance || (d2 === distance && (nearest < 0 || t.externalId[i] < t.externalId[nearest]))) { nearest = i; distance = d2; }
      }
      // Web-only: target priorities, movement and attack range of minions (combat runtime).
      if (this.summonTargetHook) nearest = this.summonTargetHook(summon, nearest);
      if (nearest >= 0) [summon.dx, summon.dy] = safeNormal(f(t.px[nearest] - summon.x), f(t.py[nearest] - summon.y), 0);
      if (this.clock < summon.nextFire) continue;
      if (summon.hold) continue;
      summon.nextFire = f(this.clock + summon.interval);
      if (nearest < 0) continue;
      // Each volley starts a fresh delivery chain, under the same bounded cast root.
      const event = newEvent();
      Object.assign(event, { type: summon.event, root: summon.root, sequence: root.nextSequence++, px: summon.x, py: summon.y, pz: summon.z,
        dx: summon.dx, dy: summon.dy, dz: 0, amount: summon.power, damage: summon.power, tags: summon.tags,
        targetIndex: nearest, targetId: t.externalId[nearest] });
      if (summon.storm) { event.px = t.px[nearest]; event.py = t.py[nearest]; event.pz = t.pz[nearest]; }
      this.pushEvent(event);
      if (summon.storm && this.trace) this.trace('storm_target', { id: summon.id, kind: summon.kindName, x: event.px, y: event.py, target: event.targetId });
      if (this.trace) this.trace('summon_fire', { id: summon.id, x: summon.x, y: summon.y, target: event.targetId });
    }
    this.summons = this.summons.filter(summon => !summon.dead);
  }

  runSummon(action, context) {
    const storm = action.op === EOp.Storm;
    const duration = this.slotOr(action, ESlot.Duration, context, 0), interval = this.slotOr(action, ESlot.Interval, context, 0);
    const range = this.slotOr(action, ESlot.Radius, context, 0);
    if (![duration, interval, range].every(Number.isFinite) || duration <= 0 || interval <= 0 || range <= 0) return true;
    const owner = this.owners[context.root.owner], event = context.event;
    const kindName = context.plan.kindNames.names[action.kind];
    const own = this.summons.filter(s => this.roots[s.root].owner === context.root.owner && s.kindName.toLowerCase() === kindName.toLowerCase());
    let cap = clamp(Math.trunc(this.slotOr(action, ESlot.Cap, context, 1)), 1, 32);
    // Web-only: minion count / spirit limits (combat runtime). May veto the summon (0).
    if (this.summonCapHook) cap = this.summonCapHook(cap, kindName, context);
    if (cap <= 0) return true;
    const replaced = own.slice(0, Math.max(0, own.length - cap + 1)).find(s => s.expire > this.clock);
    const nextFire = replaced ? Math.max(this.clock, replaced.nextFire) : this.clock;
    while (own.length >= cap) { const old = own.shift(); old.dead = true; old.replaced = true; --this.roots[old.root].live; if (this.summonEndHook) this.summonEndHook(old); }
    this.summons = this.summons.filter(s => !s.dead);
    if (this.summons.length >= 128) { ++this.frameStats.CapacityDrops; return true; }
    const [dx, dy] = flatDirection(event.dx, event.dy, owner.aim);
    const summon = { id: this.nextSummonId++, root: context.rootIndex, kind: action.kind, kindName, event: action.event,
      x: action.origin === EOrigin.Owner ? owner.px : event.px, y: action.origin === EOrigin.Owner ? owner.py : event.py,
      z: action.origin === EOrigin.Owner ? owner.pz : event.pz, dx, dy, range: f(Math.min(1000, range)), interval: f(Math.max(0.05, interval)),
      expire: f(this.clock + Math.min(60, duration)), nextFire, power: event.amount,
      storm, equipment: { default: null }, tags: storm ? action.addTags : (event.tags & KeepInherited) | action.addTags };
    this.summons.push(summon); ++context.root.live;
    if (this.summonHook) this.summonHook(summon, context, replaced || null);
    if (this.trace) this.trace('summon', { id: summon.id, kind: kindName, x: summon.x, y: summon.y, expire: summon.expire });
    return true;
  }

  // ---------------------------------------------------------------- web-only host entries (combat runtime)

  /** Index of a target external id in this frame's targets, INDEX_NONE if absent. */
  targetIndexOf(externalId) {
    const t = this.targets;
    for (let i = 0; i < t.num; ++i) if (t.externalId[i] === (externalId >>> 0)) return i;
    return INDEX_NONE;
  }

  /** A root held open by the host (zones, counters, explosions): released with releaseHeldRoot. */
  openRoot(planIndex, owner, seed) {
    if (!this.plans[planIndex] || !this.owners[owner]) return INDEX_NONE;
    let index;
    if (this.freeRoots.length > 0) index = this.freeRoots.pop();
    else { index = this.roots.length; this.roots.push(null); }
    const plan = this.plans[planIndex];
    this.roots[index] = {
      plan: planIndex, owner, seed: BigInt.asUintN(64, BigInt(seed)), nextSequence: 1, live: 1, pending: 0, work: 0, active: true,
      chainCount: new Uint16Array(plan.rules.length), castState: new Map(), overflowHits: new Set(),
    };
    return index;
  }
  holdRoot(rootIndex) { const root = this.roots[rootIndex]; if (root && root.active) { ++root.live; return true; } return false; }
  releaseHeldRoot(rootIndex) { const root = this.roots[rootIndex]; if (root && root.active) --root.live; }

  /**
   * Host-resolved hit on one target (zones, counters, chains, explosions): same damage resolution as
   * rule damage. opts: {tags, eventType, generation, silent (no rule events), info}. Returns the result.
   */
  hostHit(rootIndex, targetExternalId, amount, element, x, y, opts = {}) {
    const root = this.roots[rootIndex];
    const target = this.targetIndexOf(targetExternalId);
    if (!root || !root.active || target === INDEX_NONE || !(amount > 0)) return null;
    const t = this.targets;
    if (t.health[target] <= 0 || !this.isHostile(root.owner, target)) return null;
    const base = newEvent();
    if (opts.base) Object.assign(base, opts.base);
    Object.assign(base, { root: rootIndex, generation: Math.min(opts.base ? opts.base.generation : (opts.generation ?? 1), MaxGeneration), element, px: f(x), py: f(y), pz: t.pz[target], tags: opts.tags ?? (opts.base ? opts.base.tags : 0n) });
    if (opts.base) { base.sourceIndex = INDEX_NONE; base.sourceId = InvalidId; }
    const sequence = root.nextSequence++;
    const result = this.resolveDamage(root, target, amount, element, sequence, { rootIndex, tags: base.tags, x, y, kind: 'host', ...(opts.info || {}) });
    if (result.missed || opts.silent) return result;
    this.pushHitEvents(root, rootIndex, base, target, result.applied, amount, result.critical, result.killed, opts.eventType ?? EBuiltinEvent.Hit);
    return result;
  }

  /** Host damage over time (poison, erosion, burning ground): no crit, no rule events, owner credited. */
  hostDot(owner, targetExternalId, amount, element, scale = 1) {
    const target = this.targetIndexOf(targetExternalId);
    if (target === INDEX_NONE || !(amount > 0)) return null;
    const t = this.targets;
    if (t.health[target] <= 0) return null;
    const effective = this.effectiveResistance(target, element, 0);
    const dealt = f(this.applyDamageTaken(target, Math.max(0, f(amount * f(1 - f(effective / 100))))) * scale);
    const health = t.health[target];
    const applied = Math.min(health, dealt);
    t.health[target] = f(health - dealt);
    const killed = t.health[target] <= 0;
    const o = this.owners[owner];
    const record = { TargetExternalId: targetExternalId >>> 0, OwnerExternalId: o ? o.externalId : InvalidId, Amount: applied, Element: element, bCritical: false, bKilled: killed };
    Object.defineProperty(record, 'bDot', { value: true });
    Object.defineProperty(record, 'Info', { value: { kind: 'dot', owner } });
    this.damageLog.push(record);
    ++this.frameStats.Hits;
    this.frameStats.Kills += killed ? 1 : 0;
    return { applied, killed };
  }

  releaseRoots() {
    for (let i = 0; i < this.roots.length; ++i) {
      const root = this.roots[i];
      if (root && root.active && root.live <= 0 && root.pending <= 0) {
        root.active = false;
        root.castState.clear();
        root.overflowHits.clear();
        this.freeRoots.push(i);
      }
    }
  }

  // ---------------------------------------------------------------- VM: events, conditions, actions

  pushEvent(event) {
    ++this.roots[event.root].pending;
    this.next.push(event);
  }

  drainWaves() {
    let wave = 0;
    while (this.current.length > 0 || this.next.length > 0) {
      if (this.current.length === 0) { const swap = this.current; this.current = this.next; this.next = swap; }
      if (wave >= this.config.MaxWaves || this.frameWork >= this.config.WorkPerFrame) {
        // Out of budget: keep causal order, finish next frame.
        for (const event of this.current) {
          if (this.deferred.length < this.config.MaxDeferredEvents) this.deferred.push(event);
          else { --this.roots[event.root].pending; ++this.frameStats.DroppedEvents; }
        }
        this.current = [];
        continue;
      }
      ++wave;
      ++this.frameStats.Waves;
      let index = 0;
      for (; index < this.current.length && this.frameWork < this.config.WorkPerFrame; ++index) {
        const event = this.current[index];
        this.processEvent(event);
        --this.roots[event.root].pending;
        ++this.frameStats.Events;
      }
      if (index < this.current.length) {
        // Frame budget reached mid-wave: unprocessed events keep their order for next frame.
        ++this.frameStats.BudgetStops;
        this.current = this.current.slice(index);
        continue;
      }
      this.current = [];
    }
  }

  processEvent(event) {
    const root = this.roots[event.root];
    const plan = this.plans[root.plan];
    if (!plan.hasRules(event.type)) return;
    const first = plan.eventRuleFirst[event.type];
    const last = first + plan.eventRuleCount[event.type];
    for (let ruleIndex = first; ruleIndex < last; ++ruleIndex) {
      const rule = plan.rules[ruleIndex];
      const tooDeep = rule.channel >= 0 ? channelDepth(event.lineage, rule.channel) >= rule.maxDepth : event.generation > rule.maxDepth;
      if (tooDeep) { ++this.frameStats.DepthBlocked; continue; }
      if ((event.tags & rule.requireAll) !== rule.requireAll || (event.tags & rule.forbid) !== 0n ||
        (rule.requireAny !== 0n && (event.tags & rule.requireAny) === 0n)) continue;
      if (root.chainCount[ruleIndex] >= rule.maxEvents) { ++this.frameStats.ChainBlocked; continue; }
      const context = { event, plan, root, rootIndex: event.root, channel: rule.channel, stored: event.stored, rule };
      if (!this.checkConditions(rule, context)) continue;
      ++root.chainCount[ruleIndex];
      if (this.trace) this.trace('rule', { event, rule, plan });
      this.runActions(rule.actionFirst, rule.actionCount, context, 0);
    }
  }

  checkConditions(rule, context) {
    for (let i = 0; i < rule.conditionCount; ++i) {
      const condition = context.plan.conditions[rule.conditionFirst + i];
      const value = this.eval(condition.value, context);
      let pass = true;
      switch (condition.kind) {
        case ECond.Generation: pass = context.event.generation <= value; break;
        case ECond.State: pass = compare(condition.compare, this.readState(condition.scope, condition.key, context), value); break;
        case ECond.Chance: pass = f(f(random01(context.root.seed, context.event.sequence, rule.actionFirst + 0x5EED)) * 100) < value; break;
        case ECond.Status: pass = compare(condition.compare, this.getStatus(context.event.targetId, condition.key), value); break;
        case ECond.EntityCount: {
          let count = 0;
          if (condition.entityKind === U16_MAX) count = this.owners[context.root.owner].liveProjectiles;
          else {
            const c = this.carriers;
            for (let k = 0; k < c.num; ++k) count += c.owner[k] === context.root.owner && !(c.flags[k] & Projectiles.Dead) && c.kind[k] === condition.entityKind ? 1 : 0;
          }
          pass = compare(condition.compare, count, value);
          break;
        }
      }
      if (!pass) return false;
    }
    return true;
  }

  runActions(first, count, context, depth) {
    for (let i = 0; i < count; ++i) if (!this.runAction(context.plan.actions[first + i], context, depth)) return false;
    return true;
  }

  runAction(action, context, depth) {
    // Per-cast hard cap: a single root can never monopolise the world.
    if (context.root.work >= this.config.RootWorkCap) { ++this.frameStats.BudgetStops; return false; }
    ++this.frameWork;
    ++context.root.work;
    ++this.frameStats.Actions;
    switch (action.op) {
      case EOp.Emit: return this.runEmit(action, context);
      case EOp.Copy: return this.runCopy(action, context);
      case EOp.DamageArea: return this.runDamageArea(action, context);
      case EOp.DamageTarget: return this.runDamageTarget(action, context);
      case EOp.Counter: case EOp.Accumulate: return this.runAccumulate(action, context, depth);
      case EOp.Consume: return this.runConsume(action, context, depth);
      case EOp.EmitEvent: {
        const child = this.makeChild(context, action.event, action.addTags);
        if (action.slots[ESlot.Amount].set) child.amount = this.eval(action.slots[ESlot.Amount], context);
        this.pushEvent(child);
        return true;
      }
      case EOp.Redirect: return this.runRedirect(action, context);
      case EOp.ApplyStatus: return this.runApplyStatus(action, context);
      case EOp.GrantTraits: return this.runGrantTraits(action, context);
      case EOp.Storm: case EOp.Summon: return this.runSummon(action, context);
      case EOp.Sacrifice: {
        const count = Math.min(32, Math.max(0, Math.floor(this.slotOr(action, ESlot.Count, context, 1))));
        return count > 0 && !!this.sacrificeHook?.({ owner: context.root.owner, count,
          kind: action.kind === U16_MAX ? '' : context.plan.kindNames.names[action.kind] || '' });
      }
    }
    return true;
  }

  eval(ref, context) {
    if (ref.count === 0) return ref.const;
    return evaluateExpr(context.plan.expr, ref.first, ref.count, instr => {
      switch (instr.op) {
        case EExprOp.EventAmount: return context.event.amount;
        case EExprOp.EventDamage: return context.event.damage;
        case EExprOp.EventStored: return context.stored;
        case EExprOp.EventGeneration: return context.event.generation;
        case EExprOp.EventSequence: return f(context.event.sequence);
        case EExprOp.State: return this.readState(instr.scope, instr.key, context);
        default: return 0;
      }
    });
  }

  slotOr(action, slot, context, fallback) {
    const ref = action.slots[slot];
    return ref.set ? this.eval(ref, context) : fallback;
  }

  stateSlot(scope, key, context) {
    switch (scope) {
      case EScope.Owner: return [this.ownerState, `${key}|o${context.root.owner}`];
      case EScope.Target: return context.event.targetId !== InvalidId ? [this.targetState, `${key}|t${context.event.targetId}`] : [null, ''];
      default: return [context.root.castState, key];
    }
  }

  readState(scope, key, context) {
    const [map, slot] = this.stateSlot(scope, key, context);
    return map && map.has(slot) ? map.get(slot) : 0;
  }

  writeState(scope, key, context, value) {
    const clean = Number.isFinite(value) ? Math.max(0, f(value)) : 0;
    const [map, slot] = this.stateSlot(scope, key, context);
    if (map) map.set(slot, clean);
  }

  resolveSource(event) {
    const c = this.carriers;
    const i = event.sourceIndex;
    return i >= 0 && i < c.num && c.id[i] === event.sourceId && !(c.flags[i] & Projectiles.Dead);
  }

  makeChild(context, type, addTags) {
    const child = { ...context.event };
    child.type = type;
    child.generation = Math.min(context.event.generation + 1, MaxGeneration);
    child.lineage = bumpChannel(context.event.lineage, context.channel);
    child.sequence = context.root.nextSequence++;
    child.tags = (context.event.tags & KeepInherited) | addTags;
    child.stored = context.stored;
    return child;
  }

  pushHitEvents(root, rootIndex, base, target, applied, requested, critical, killed, hitType) {
    const plan = this.plans[root.plan];
    const t = this.targets;
    const event = { ...base };
    event.root = rootIndex;
    event.targetIndex = target;
    event.targetId = t.externalId[target];
    event.amount = applied;
    event.damage = f(requested);
    if (critical) event.tags |= TAG_CRITICAL;
    if (plan.hasRules(hitType)) {
      event.type = hitType;
      event.sequence = root.nextSequence++;
      this.pushEvent({ ...event });
    }
    if (critical && plan.hasRules(EBuiltinEvent.Critical)) {
      event.type = EBuiltinEvent.Critical;
      event.sequence = root.nextSequence++;
      this.pushEvent({ ...event });
    }
    if (killed && plan.hasRules(EBuiltinEvent.Kill)) {
      event.type = EBuiltinEvent.Kill;
      event.sequence = root.nextSequence++;
      event.tags |= TAG_OWNER_KILL;
      event.px = t.px[target]; event.py = t.py[target]; event.pz = t.pz[target];
      this.pushEvent({ ...event });
    }
  }

  runEmit(action, context) {
    const event = context.event;
    const stats = context.plan.stats;
    const inherit = (action.flags & ActionFlag.Inherit) !== 0;
    // Inherit: the action field (or the stat default) is the base of the build's partition.
    const value = (stat, slot) => {
      const base = this.slotOr(action, slot, context, getStatInfo(stat).default);
      return inherit ? stats.from(stat, base) : base;
    };
    const count = clamp(roundToInt32(value(EStat.ProjectileCount, ESlot.Count)), 0, 512);
    // The host's existing sequential-emission affix may stagger this batch.
    // Geometry and stats are captured once; no skill-specific scheduling lives here.
    const interval = this.emitIntervalHook ? clamp(this.emitIntervalHook(context, action), 0, 1) : 0;
    const spread = value(EStat.ProjectileSpread, ESlot.Spread);
    const speed = value(EStat.ProjectileSpeed, ESlot.Speed);
    const life = value(EStat.ProjectileLifetime, ESlot.Lifetime);
    const radius = value(EStat.ProjectileRadius, ESlot.Radius);
    const damageValue = value(EStat.ProjectileDamage, ESlot.Damage);
    const pierce = roundToInt32(value(EStat.ProjectilePierce, ESlot.Pierce));
    const element = action.element >= 0 ? action.element : event.element;
    const owner = this.owners[context.root.owner];
    const t = this.targets;
    let ox = event.px, oy = event.py, oz = event.pz;
    if (action.origin === EOrigin.Owner) { ox = owner.px; oy = owner.py; oz = owner.pz; }
    else if (action.origin === EOrigin.Source && this.resolveSource(event)) {
      ox = this.carriers.px[event.sourceIndex]; oy = this.carriers.py[event.sourceIndex]; oz = this.carriers.pz[event.sourceIndex];
    } else if (action.origin === EOrigin.Target && event.targetIndex >= 0 && event.targetIndex < t.num && t.externalId[event.targetIndex] === event.targetId) {
      ox = t.px[event.targetIndex]; oy = t.py[event.targetIndex]; oz = t.pz[event.targetIndex];
    }
    const parabolic = (action.flags & ActionFlag.Parabolic) !== 0;
    const falling = (action.flags & ActionFlag.Falling) !== 0;
    const target = parabolic || falling ? context.root.targetPoint : null;
    const [fx, fy, fz] = target ? flatDirection(target.x - ox, target.y - oy, owner.aim) : flatDirection(event.dx, event.dy, owner.aim);
    const tagMask = (event.tags & KeepInherited) | action.addTags | TAG_PROJECTILE;
    const generation = Math.min(event.generation + 1, MaxGeneration);
    const lineage = bumpChannel(event.lineage, context.channel);
    const spawnRules = context.plan.hasRules(EBuiltinEvent.Spawn);
    const emissionContext = interval > 0 ? { ...context, event: { ...event } } : context;
    for (let index = 0; index < count; ++index) {
      let angle = 0;
      if (action.layout === ELayout.Radial) angle = f(f(360 * index) / count);
      else if (action.layout === ELayout.Fan && count > 1) angle = f(spread * f(f(index / (count - 1)) - 0.5));
      const [dx, dy, dz] = rotateAroundUp(fx, fy, fz, angle);
      let sx = ox, sy = oy, sz = oz, fall = null;
      if (falling) {
        const center = target || { x: ox + fx * Math.max(0, speed) * life, y: oy + fy * Math.max(0, speed) * life, z: 0 };
        const scatter = this.slotOr(action, ESlot.ScatterRadius, context, 0);
        const phase = random01(context.root.seed, event.sequence, action.kind + 0xF411 + index * 2) * Math.PI * 2;
        const radial = random01(context.root.seed, event.sequence, action.kind + 0xF412 + index * 2);
        const [offsetX, offsetY] = fallingOffset(index, count, scatter, phase, radial);
        fall = fallingLaunch({ x: center.x + offsetX, y: center.y + offsetY, groundZ: center.z ?? 0,
          height: this.slotOr(action, ESlot.SpawnHeight, context, 8), speed,
          gravity: this.slotOr(action, ESlot.Gravity, context, 24), radius });
        sx = fall.x; sy = fall.y; sz = fall.z;
      }
      const flight = fall || (parabolic ? parabolicLaunch({ x: ox, y: oy, z: oz, dx, dy, speed,
          baseSpeed: this.slotOr(action, ESlot.Speed, context, getStatInfo(EStat.ProjectileSpeed).default),
          lifetime: life, arcHeight: this.slotOr(action, ESlot.ArcHeight, context, 1), target, radius }) : null);
      const shot = { context: emissionContext, action, index, count, sx, sy, sz, dx, dy, dz, speed, life, radius, damageValue,
        element, tagMask, generation, lineage, pierce, inherit, stats, spawnRules, flight,
        trajectoryFlag: fall ? Projectiles.Falling : parabolic ? Projectiles.Parabolic : 0 };
      if (interval > 0 && index > 0) {
        if (this.emissions.length >= this.config.MaxProjectiles) { ++this.frameStats.CapacityDrops; break; }
        this.emissions.push({ at: f(this.clock + interval * index), shot });
        ++context.root.live;
      } else if (!this.launchEmission(shot)) break;
    }
    return true;
  }

  tickEmissions() {
    if (!this.emissions.length) return;
    const future = [];
    for (const job of this.emissions) {
      if (job.at > this.clock + 1e-6) { future.push(job); continue; }
      this.launchEmission(job.shot);
      --job.shot.context.root.live;
    }
    this.emissions = future;
  }

  launchEmission(shot) {
    const { context, action, index, count, sx, sy, sz, dx, dy, dz, speed, life, radius, damageValue,
      element, tagMask, generation, lineage, pierce, inherit, stats, spawnRules, flight, trajectoryFlag } = shot;
    const c = this.carriers;
    const spawned = this.spawnProjectile(context.root, context.rootIndex, sx, sy, sz, dx, dy, dz, speed, life, radius, damageValue, element, action.kind, tagMask, generation, lineage);
    if (spawned === INDEX_NONE) return false;
    if (flight) {
      c.vx[spawned] = f(flight.vx); c.vy[spawned] = f(flight.vy); c.vz[spawned] = f(flight.vz);
      c.gravity[spawned] = f(flight.gravity); c.life[spawned] = f(flight.duration);
      c.flags[spawned] |= trajectoryFlag;
    }
    c.pierce[spawned] = clamp(pierce, 0, 1000);
    c.endEvent[spawned] = action.endEvent;
    if (inherit) {
      c.ricochet[spawned] = Math.trunc(stats.get(EStat.ProjectileRicochetCount));
      c.reflect[spawned] = Math.trunc(stats.get(EStat.ProjectileReflectionCount));
      c.ret[spawned] = Math.trunc(stats.get(EStat.ProjectileReturnCount));
      c.refract[spawned] = Math.trunc(stats.get(EStat.ProjectileRefractionCount));
    } else {
      c.flags[spawned] |= Projectiles.Explicit;
    }
    if (this.spawnHook) this.spawnHook(spawned, context.rootIndex, { index, count, generation, emit: true, dx, dy, ox: sx, oy: sy });
    if (this.trace) this.trace('spawn', { index: spawned, id: c.id[spawned], kind: action.kind, plan: context.plan });
    if (spawnRules) {
      const spawn = this.makeChild(context, EBuiltinEvent.Spawn, action.addTags);
      spawn.sourceIndex = spawned;
      spawn.sourceId = c.id[spawned];
      spawn.px = sx; spawn.py = sy; spawn.pz = sz;
      spawn.dx = dx; spawn.dy = dy; spawn.dz = dz;
      this.pushEvent(spawn);
    }
    return true;
  }

  runCopy(action, context) {
    const event = context.event;
    if (!this.resolveSource(event)) return true;
    const c = this.carriers;
    const source = event.sourceIndex;
    const count = clamp(roundToInt32(this.slotOr(action, ESlot.Count, context, 1)), 0, 512);
    const spread = this.slotOr(action, ESlot.Spread, context, 30);
    const vx = c.vx[source], vy = c.vy[source], vz = c.vz[source];
    const [nx, ny, nz] = safeNormal(vx, vy, vz);
    const speed = vsize(vx, vy, vz);
    const inherit = (action.flags & ActionFlag.Inherit) !== 0;
    for (let index = 0; index < count; ++index) {
      const angle = count > 1 ? f(spread * f(f(index / (count - 1)) - 0.5)) : f(spread * 0.5);
      const tagMask = (c.tags[source] & KeepInherited) | action.addTags;
      const [dx, dy, dz] = rotateAroundUp(nx, ny, nz, angle);
      const spawned = this.spawnProjectile(context.root, context.rootIndex, event.px, event.py, event.pz, dx, dy, dz, speed,
        Math.max(f(0.05), f(c.life[source] - c.age[source])), c.radius[source], c.damage[source], c.element[source], c.kind[source], tagMask,
        Math.min(event.generation + 1, MaxGeneration), bumpChannel(event.lineage, context.channel));
      if (spawned === INDEX_NONE) break;
      c.copyHits(source, spawned);
      c.gravity[spawned] = c.gravity[source];
      c.flags[spawned] |= c.flags[source] & Projectiles.Ballistic;
      c.pierce[spawned] = c.pierce[source];
      if (inherit) {
        c.ricochet[spawned] = c.ricochet[source];
        c.reflect[spawned] = c.reflect[source];
        c.ret[spawned] = c.ret[source];
      } else {
        c.flags[spawned] |= Projectiles.Explicit;
      }
    }
    return true;
  }

  runDamageArea(action, context) {
    const event = context.event;
    const radius = context.plan.stats.from(EStat.AreaRadius, this.slotOr(action, ESlot.Radius, context, 0));
    const amount = this.slotOr(action, ESlot.Amount, context, 0);
    if (radius <= 0 || amount <= 0) return true;
    const element = action.element >= 0 ? action.element : event.element;
    const base = this.makeChild(context, action.event, action.addTags | TAG_AREA);
    // Area damage is not a projectile delivery: drop carrier identity and projectile fact.
    base.tags &= ~TAG_PROJECTILE & ((1n << 64n) - 1n);
    base.sourceIndex = INDEX_NONE;
    base.sourceId = InvalidId;
    base.element = element;
    // Web-only: skill areas become shaped / repeating zones (combat runtime). Unset: one circle now.
    if (this.areaHook && this.areaHook({ action, context, radius, amount, element, base, x: event.px, y: event.py, dx: event.dx, dy: event.dy })) return true;
    const victims = [];
    this.forEachTargetInRadius(event.px, event.py, radius, target => {
      if (this.isHostile(context.root.owner, target)) victims.push(target);
    });
    victims.sort((a, b) => a - b);
    if (this.trace) this.trace('area', { x: event.px, y: event.py, radius, amount, element, victims: victims.length, effect: context.plan.traitIds[context.rule.trait].split('~')[0] });
    for (const target of victims) {
      const sequence = context.root.nextSequence++;
      const result = this.resolveDamage(context.root, target, amount, element, sequence,
        { rootIndex: context.rootIndex, tags: base.tags, x: event.px, y: event.py, cx: event.px, cy: event.py, radius, kind: 'area' });
      if (result.missed) continue;
      this.pushHitEvents(context.root, context.rootIndex, base, target, result.applied, amount, result.critical, result.killed, action.event);
    }
    return true;
  }

  runDamageTarget(action, context) {
    const event = context.event;
    const t = this.targets;
    const target = event.targetIndex;
    if (!(target >= 0 && target < t.num) || t.externalId[target] !== event.targetId) return true;
    const amount = this.slotOr(action, ESlot.Amount, context, 0);
    const element = action.element >= 0 ? action.element : event.element;
    const base = this.makeChild(context, action.event, action.addTags);
    base.element = element;
    const sequence = context.root.nextSequence++;
    const result = this.resolveDamage(context.root, target, amount, element, sequence,
      { rootIndex: context.rootIndex, tags: base.tags, x: t.px[target], y: t.py[target], kind: 'target' });
    if (result.missed) return true;
    this.pushHitEvents(context.root, context.rootIndex, base, target, result.applied, amount, result.critical, result.killed, action.event);
    return true;
  }

  runAccumulate(action, context, depth) {
    const fallback = action.op === EOp.Counter ? 1 : 0;
    let stock = f(this.readState(action.scope, action.stateKey, context) + this.slotOr(action, ESlot.Value, context, fallback));
    if (action.slots[ESlot.Cap].set) stock = Math.min(stock, this.eval(action.slots[ESlot.Cap], context));
    const threshold = this.slotOr(action, ESlot.Threshold, context, 0);
    if (threshold <= 0 || stock < threshold) {
      this.writeState(action.scope, action.stateKey, context, stock);
      return true;
    }
    const fires = Math.min(floorToInt32(f(stock / threshold)), 64);
    this.writeState(action.scope, action.stateKey, context, f(stock - f(fires * threshold)));
    const saved = context.stored;
    for (let fire = 0; fire < fires; ++fire) {
      context.stored = threshold;
      if (!this.runActions(action.thenFirst, action.thenCount, context, depth + 1)) break;
    }
    context.stored = saved;
    return true;
  }

  runConsume(action, context, depth) {
    const stock = this.readState(action.scope, action.stateKey, context);
    const all = (action.flags & ActionFlag.ConsumeAll) !== 0;
    const need = all ? stock : this.slotOr(action, ESlot.Value, context, 0);
    // Insufficient stock stops the remaining actions of this list.
    if (need <= 0 || stock < need) return false;
    this.writeState(action.scope, action.stateKey, context, f(stock - need));
    const saved = context.stored;
    context.stored = need;
    this.runActions(action.thenFirst, action.thenCount, context, depth + 1);
    context.stored = saved;
    return true;
  }

  runRedirect(action, context) {
    const event = context.event;
    if (!this.resolveSource(event)) return true;
    const c = this.carriers;
    const t = this.targets;
    const index = event.sourceIndex;
    const speed = vsize(c.vx[index], c.vy[index], c.vz[index]);
    let direction = [0, 0, 0];
    let tag = 0;
    switch (action.mode) {
      case ERedirect.Ricochet: {
        if (c.ricochet[index] === 0) return true;
        const radius = this.slotOr(action, ESlot.Radius, context, context.plan.stats.get(EStat.ProjectileRicochetRadius));
        let target = this.nearestTarget(event.px, event.py, event.pz, radius, index, context.root, this.owners[context.root.owner].team);
        // Web-only: chains allowed to return to already hit enemies (combat runtime).
        if (target === INDEX_NONE && this.ricochetHook) target = this.ricochetHook(index, event, radius);
        if (target === INDEX_NONE) return true;
        direction = safeNormal(f(t.px[target] - event.px), f(t.py[target] - event.py), f(t.pz[target] - event.pz));
        --c.ricochet[index];
        tag = Tags.Ricochet;
        break;
      }
      case ERedirect.Reflect: {
        if (c.reflect[index] === 0) return true;
        const n = safeNormal(c.vx[index], c.vy[index], c.vz[index]);
        direction = [-n[0], -n[1], -n[2]];
        --c.reflect[index];
        tag = Tags.Reflect;
        break;
      }
      case ERedirect.Return: {
        if (c.ret[index] === 0) return true;
        const owner = this.owners[context.root.owner];
        direction = safeNormal(f(owner.px - event.px), f(owner.py - event.py), f(owner.pz - event.pz));
        --c.ret[index];
        tag = Tags.Return;
        break;
      }
    }
    if (nearlyZero(direction[0], direction[1], direction[2])) return true;
    // Same carrier continues: position at the contact, fresh lifetime, impact cancelled.
    c.px[index] = event.px; c.py[index] = event.py; c.pz[index] = event.pz;
    c.vx[index] = f(direction[0] * speed); c.vy[index] = f(direction[1] * speed); c.vz[index] = f(direction[2] * speed);
    c.age[index] = 0;
    c.flags[index] &= ~(Projectiles.PendingImpact | Projectiles.Ballistic);
    c.gravity[index] = 0;
    c.tags[index] |= tagBit(tag);
    if (this.redirectHook) this.redirectHook(index, action.mode);
    return true;
  }

  pruneStatuses() {
    for (const [slot, status] of this.statuses) if (status.expire <= this.clock) this.statuses.delete(slot);
  }

  runApplyStatus(action, context) {
    // origin "owner": the status lands on the caster itself; otherwise the event target.
    const targetId = action.origin === EOrigin.Owner ? this.owners[context.root.owner].statusId : context.event.targetId;
    if (targetId === InvalidId) return true;
    let value = this.slotOr(action, ESlot.Value, context, 0);
    if (action.slots[ESlot.Cap].set) value = Math.min(value, this.eval(action.slots[ESlot.Cap], context));
    const duration = this.slotOr(action, ESlot.Duration, context, 0);
    this.applyStatusKey(targetId, action.stateKey, value, duration, context.root.owner);
    return true;
  }

  // grant_traits: hand the traits to the host (this.onGrantTraits) to hold on the caster ("owner")
  // or on the event target for `duration` seconds. The world itself keeps no trait state.
  runGrantTraits(action, context) {
    const targetId = action.origin === EOrigin.Owner ? this.owners[context.root.owner].statusId : context.event.targetId;
    if (targetId === InvalidId || !action.grant) return true;
    const duration = f(this.slotOr(action, ESlot.Duration, context, 0));
    if (!(duration > 0)) return true;
    const request = { targetId, entries: action.grant.entries, key: action.grant.key, duration, owner: context.root.owner, self: action.origin === EOrigin.Owner };
    if (this.trace) this.trace('grant', request);
    if (this.onGrantTraits) this.onGrantTraits(request);
    return true;
  }

  /** Host entry (items, scripted effects): apply a timed status by key. Same stacking as rules. */
  applyStatusKey(targetId, key, value, duration, owner = INDEX_NONE) {
    targetId >>>= 0;
    if (targetId === InvalidId || !(value > 0) || !(duration > 0)) return false;
    // Web-only: ailment effect / duration / layers of the combat affixes. Unset: unchanged.
    if (this.statusHook) {
      const changed = this.statusHook(targetId, key, value, duration, owner);
      if (!changed) return false;
      ({ value, duration } = changed);
      if (!(value > 0) || !(duration > 0)) return false;
    }
    value = f(value);
    duration = f(duration);
    const slot = `${targetId}|${key}`;
    let status = this.statuses.get(slot);
    if (!status) {
      status = { targetId: InvalidId, key, hash: hashName(key), value: 0, expire: 0, stacks: 0, owner: INDEX_NONE, nextTick: 0 };
      this.statuses.set(slot, status);
    }
    const def = this.statusDefs.get(key);
    const live = status.targetId === targetId && status.expire > this.clock;
    const until = f(this.clock + duration);
    if (!live) {
      status.value = value;
      status.expire = until;
      status.stacks = 1;
      status.nextTick = def && def.tickInterval > 0 ? f(this.clock + def.tickInterval) : 0;
    } else {
      switch (def ? def.stacking : EStacking.Strongest) {
        case EStacking.Refresh:
          status.value = value;
          status.expire = until;
          break;
        case EStacking.Stack:
          status.stacks = Math.min(def.maxStacks, status.stacks + 1);
          status.value = Math.max(status.value, value);
          status.expire = Math.max(status.expire, until);
          break;
        default:
          // Same-name statuses do not stack: strongest magnitude, longest remaining duration.
          status.value = Math.max(status.value, value);
          status.expire = Math.max(status.expire, until);
          break;
      }
    }
    status.targetId = targetId;
    status.owner = owner;
    ++this.frameStats.StatusApplied;
    if (this.trace) this.trace('status', { targetId, key, value: this.magnitude(status), stacks: status.stacks, expire: status.expire });
    return true;
  }

  /** Trait ids granted by the live statuses on one id (definition order, duplicates dropped). */
  grantedTraits(statusId) {
    const out = [];
    if (statusId === InvalidId) return out;
    for (const def of this.statusDefs.values()) {
      if (!def.traits.length || !(this.getStatus(statusId, def.key) > 0)) continue;
      for (const id of def.traits) if (!out.some(o => o.toLowerCase() === id.toLowerCase())) out.push(id);
    }
    return out;
  }

  /** Ids that currently hold at least one trait-granting status. */
  idsWithGrantedTraits() {
    const ids = new Set();
    for (const status of this.statuses.values()) {
      const def = this.statusDefs.get(status.key);
      if (def && def.traits.length && status.targetId !== InvalidId && status.expire > this.clock) ids.add(status.targetId);
    }
    return ids;
  }
}

export { FLT_MAX };
