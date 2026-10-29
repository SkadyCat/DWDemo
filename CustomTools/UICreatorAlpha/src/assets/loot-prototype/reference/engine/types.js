// Web interpreter of DWRulesCore — shared vocabulary.
// Mirror of Plugins/DWRules/Source/DWRulesCore/Public/DWRuleTypes.h. Units: meters, seconds.
// Numeric behaviour follows the native runtime: float32 storage and per-operation rounding (f()).

export const f = Math.fround;
export const FLT_MAX = 3.4028234663852886e38;
export const SMALL_NUMBER = f(1e-8);
export const KINDA_SMALL_NUMBER = f(1e-4);

export const NumElements = 6;
export const NumResistances = 4;
export const MaxChannels = 4;
export const MaxGeneration = 64;
export const MaxActionDepth = 12;
export const MaxExprStack = 32;
export const MaxTags = 64;
export const InvalidId = 0xFFFFFFFF;
export const U16_MAX = 0xFFFF;
export const INDEX_NONE = -1;

export const EElement = Object.freeze({ Fire: 0, Frost: 1, Lightning: 2, Physical: 3, Poison: 4, Void: 5, Cold: 1 });
export const ELEMENT_NAMES = Object.freeze(['fire', 'frost', 'lightning', 'physical', 'poison', 'void']);

// Target resistance arrays contain fire, frost, lightning and poison only.
export function resistanceIndex(element) {
  switch (element) {
    case EElement.Fire: return 0;
    case EElement.Frost: return 1;
    case EElement.Lightning: return 2;
    case EElement.Poison: return 3;
    default: return INDEX_NONE;
  }
}

export const EBuiltinEvent = Object.freeze({ Cast: 0, Spawn: 1, Hit: 2, Critical: 3, Kill: 4, ProjectileEnd: 5, Num: 6 });
export const BUILTIN_EVENT_NAMES = Object.freeze(['cast', 'spawn', 'hit', 'critical', 'kill', 'projectile_end']);

export const EOp = Object.freeze({ Emit: 0, Copy: 1, DamageArea: 2, DamageTarget: 3, Counter: 4, Accumulate: 5, Consume: 6, EmitEvent: 7, Redirect: 8, ApplyStatus: 9, GrantTraits: 10, Summon: 11, Storm: 12, Sacrifice: 13 });
export const OP_NAMES = Object.freeze(['emit', 'copy', 'damage_area', 'damage_target', 'counter', 'accumulate', 'consume', 'emit_event', 'redirect', 'apply_status', 'grant_traits', 'summon', 'storm', 'sacrifice']);
// Web-only actions live outside native Traits/: timed grants in Timed/, character actions in WebTraits/.
export const WEB_ONLY_OPS = Object.freeze(new Set([EOp.GrantTraits, EOp.Sacrifice]));
export const MaxStitchDepth = 3;
export const ECond = Object.freeze({ Generation: 0, State: 1, Chance: 2, EntityCount: 3, Status: 4 });
export const COND_NAMES = Object.freeze(['generation', 'state', 'chance', 'entity_count', 'status']);
export const ECompare = Object.freeze({ Eq: 0, Ne: 1, Gt: 2, Gte: 3, Lt: 4, Lte: 5 });
export const COMPARE_NAMES = Object.freeze(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);
export const EScope = Object.freeze({ Owner: 0, Target: 1, Cast: 2 });
export const SCOPE_NAMES = Object.freeze(['owner', 'target', 'cast']);
export const EModOp = Object.freeze({ Add: 0, Multiply: 1, Set: 2, IncreasedPercent: 3, ReducedPercent: 4, Min: 5, Max: 6 });
export const MODOP_NAMES = Object.freeze(['add', 'multiply', 'set', 'multiply_percent', 'reduce_percent', 'min', 'max']);
export const ELayout = Object.freeze({ Fan: 0, Radial: 1, Point: 2 });
export const LAYOUT_NAMES = Object.freeze(['fan', 'radial', 'point']);
export const EOrigin = Object.freeze({ Event: 0, Owner: 1, Source: 2, Target: 3 });
export const ORIGIN_NAMES = Object.freeze(['event', 'owner', 'source', 'target']);
export const ERedirect = Object.freeze({ Ricochet: 0, Reflect: 1, Return: 2 });
export const REDIRECT_NAMES = Object.freeze(['ricochet', 'reflect', 'return']);
export const EEndReason = Object.freeze({ Expired: 0, Impact: 1, Capacity: 2 });

// Built-in tag bits. Author tags are interned after NumBuiltin per plan.
export const Tags = Object.freeze({
  Manual: 0, Root: 1, Direct: 2, FirstHit: 3, Critical: 4, OwnerHit: 5, OwnerKill: 6, Projectile: 7, Area: 8,
  Refraction: 9, Ricochet: 10, Reflect: 11, Return: 12, EndExpired: 13, EndImpact: 14, EndCapacity: 15, NumBuiltin: 16,
});
export const BUILTIN_TAG_NAMES = Object.freeze(['manual', 'root', 'direct', 'first_hit', 'critical', 'owner_hit', 'owner_kill',
  'projectile', 'area', 'refraction', 'ricochet', 'reflect', 'return', 'end_expired', 'end_impact', 'end_capacity']);

export const tagBit = index => 1n << BigInt(index);

// Delivery facts and end reasons describe one event; derived carriers never inherit them.
export const NonInheritedTags = [Tags.Manual, Tags.Root, Tags.Direct, Tags.FirstHit, Tags.Critical, Tags.OwnerHit, Tags.OwnerKill,
  Tags.EndExpired, Tags.EndImpact, Tags.EndCapacity].reduce((mask, tag) => mask | tagBit(tag), 0n);
export const KeepInherited = ~NonInheritedTags & ((1n << 64n) - 1n);

export function parseElement(text) {
  const lower = String(text).toLowerCase();
  if (lower === 'cold') return EElement.Frost;
  const index = ELEMENT_NAMES.indexOf(lower);
  return index;
}

export function compare(op, a, b) {
  switch (op) {
    case ECompare.Eq: return a === b;
    case ECompare.Ne: return a !== b;
    case ECompare.Gt: return a > b;
    case ECompare.Gte: return a >= b;
    case ECompare.Lt: return a < b;
    default: return a <= b;
  }
}

const MASK64 = (1n << 64n) - 1n;

// FNV-1a over lower-cased UTF-16 units, as HashName in DWRuleStats.cpp.
export function hashName(text) {
  let hash = 1469598103934665603n;
  for (const char of String(text).toLowerCase()) {
    for (let i = 0; i < char.length; ++i) {
      hash ^= BigInt(char.charCodeAt(i));
      hash = (hash * 1099511628211n) & MASK64;
    }
  }
  return hash;
}

export function mix64(x) {
  x = (x + 0x9E3779B97F4A7C15n) & MASK64;
  x = ((x ^ (x >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK64;
  x = ((x ^ (x >> 27n)) * 0x94D049BB133111EBn) & MASK64;
  return x ^ (x >> 31n);
}

// Order-independent randomness: a value depends only on (seed, sequence, salt).
export function random01(seed, sequence, salt) {
  const bits = mix64(BigInt.asUintN(64, seed) ^ mix64(BigInt(sequence) ^ mix64(BigInt(salt))));
  return Number(bits >> 40n) * (1 / 16777216);
}

// Statuses are global by name (not per trait). Keys are lower-cased like HashName input.
export const statusKey = name => `status:${String(name).toLowerCase()}`;
// Native key of a status (StatusKey in DWRuleTypes.h); also the deterministic sort key of status definitions.
export const statusHash = name => hashName(statusKey(name));

// Status definitions (Content/Rules/Statuses): what the runtime does with a live status magnitude.
// Engine-side: damage_taken / damage_dealt / critical_chance / damage_over_time. Host-side: move_speed / action_speed / control.
export const EStatusEffect = Object.freeze({ DamageTaken: 0, DamageDealt: 1, CriticalChance: 2, DamageOverTime: 3, MoveSpeed: 4, ActionSpeed: 5, Control: 6, Num: 7 });
export const STATUS_EFFECT_NAMES = Object.freeze(['damage_taken', 'damage_dealt', 'critical_chance', 'damage_over_time', 'move_speed', 'action_speed', 'control']);
export const EStacking = Object.freeze({ Strongest: 0, Refresh: 1, Stack: 2 });
export const STACKING_NAMES = Object.freeze(['strongest', 'refresh', 'stack']);
export const EControl = Object.freeze({ None: 0, Freeze: 1, Stun: 2 });
export const CONTROL_NAMES = Object.freeze(['none', 'freeze', 'stun']);
export const STATUS_CATEGORIES = Object.freeze(['ailment', 'debuff', 'buff']);
export const MaxStatusStacks = 100;
export const MinTickInterval = 0.05;
export const MaxTicksPerSubstep = 8;

// ---- float32 math helpers matching FMath / TVector<float> on Windows (SSE) ----

export const roundToInt32 = value => Math.floor(f(value + 0.5));
export const floorToInt32 = value => Math.floor(value);
export const clamp = (x, lo, hi) => (x < lo ? lo : x < hi ? x : hi);

const PI_F = f(3.1415926535897932);
const HALF_PI_F = f(1.57079632679);
const TWO_PI_F = f(6.28318530717);
const INV_PI_F = f(0.31830988618);
const DEG_TO_RAD = f(PI_F / f(180));

// FMath::SinCos float path (11/10-degree minimax polynomials).
export function sinCos(value) {
  value = f(value);
  let quotient = f(f(INV_PI_F * f(0.5)) * value);
  quotient = value >= 0 ? f(Math.trunc(f(quotient + 0.5))) : f(Math.trunc(f(quotient - 0.5)));
  let y = f(value - f(TWO_PI_F * quotient));
  let sign;
  if (y > HALF_PI_F) { y = f(PI_F - y); sign = -1; }
  else if (y < -HALF_PI_F) { y = f(-PI_F - y); sign = -1; }
  else sign = 1;
  const y2 = f(y * y);
  // Horner in float32: ((c0*y2 + c1)*y2 + c2)... each op rounded.
  const horner = coefficients => coefficients.slice(1).reduce((acc, c) => f(f(acc * y2) + f(c)), f(coefficients[0]));
  const sin = f(horner([-2.3889859e-08, 2.7525562e-06, -0.00019840874, 0.0083333310, -0.16666667, 1]) * y);
  const p = horner([-2.6051615e-07, 2.4760495e-05, -0.0013888378, 0.041666638, -0.5, 1]);
  return [sin, f(sign * p)];
}

export const vsizeSquared = (x, y, z) => f(f(f(x * x) + f(y * y)) + f(z * z));
export const vsize = (x, y, z) => f(Math.sqrt(vsizeSquared(x, y, z)));
export const vdot = (ax, ay, az, bx, by, bz) => f(f(f(ax * bx) + f(ay * by)) + f(az * bz));
export const nearlyZero = (x, y, z, tolerance = KINDA_SMALL_NUMBER) => Math.abs(x) <= tolerance && Math.abs(y) <= tolerance && Math.abs(z) <= tolerance;

// TVector::GetSafeNormal: returns [x, y, z].
export function safeNormal(x, y, z) {
  const sum = vsizeSquared(x, y, z);
  if (sum === 1) return [x, y, z];
  if (sum < SMALL_NUMBER) return [0, 0, 0];
  const scale = f(1 / f(Math.sqrt(sum)));
  return [f(x * scale), f(y * scale), f(z * scale)];
}

// TVector::RotateAngleAxis(AngleDeg, UpVector).
export function rotateAroundUp(x, y, z, angleDeg) {
  const [s, c] = sinCos(f(f(angleDeg) * DEG_TO_RAD));
  const omc = f(1 - c);
  const zero = f(omc * 0);
  return [
    f(f(f(f(zero + c) * x) + f(f(zero - s) * y)) + f(f(zero + 0) * z)),
    f(f(f(f(zero + s) * x) + f(f(zero + c) * y)) + f(f(zero - 0) * z)),
    f(f(f(f(zero - 0) * x) + f(f(zero + 0) * y)) + f(f(omc + c) * z)),
  ];
}
