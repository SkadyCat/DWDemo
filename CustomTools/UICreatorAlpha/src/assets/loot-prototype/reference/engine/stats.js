// Mirror of DWRuleStats.h/.cpp: stat table and PoE-style partitions.
import { f, FLT_MAX, NumElements, ELEMENT_NAMES, resistanceIndex, clamp } from './types.js';

// Scalar stat table: [Id, path, default base, hard min, hard max] — same order as DW_RULE_SCALAR_STATS.
const SCALAR = [
  ['OwnerMaxLife', 'owner.max_life', 100, 1, 1.0e9],
  ['OwnerMaxMana', 'owner.max_mana', 100, 0, 1.0e9],
  ['OwnerCriticalChance', 'owner.critical_chance', 5, 0, 100],
  ['OwnerCriticalMultiplier', 'owner.critical_multiplier', 150, 100, 1.0e9],
  ['OwnerHitChanceBonus', 'owner.hit_chance_bonus', 0, -1.0e9, 1.0e9],
  ['OwnerManaCost', 'owner.mana_cost', 0, 0, 1.0e9],
  ['CastSpeedPercent', 'cast.speed_percent', 0, -90, 1.0e9],
  ['CastExtraCostPercent', 'cast.extra_cost_percent', 0, -100, 1.0e9],
  ['ProjectileCount', 'projectile.count', 1, 0, 512],
  ['ProjectileSpread', 'projectile.spread', 30, 0, 360],
  ['ProjectileSpeed', 'projectile.speed', 15, 0, 1000],
  ['ProjectileLifetime', 'projectile.lifetime', 1.2, 0.01, 60],
  ['ProjectileDamage', 'projectile.damage', 10, 0, 1.0e9],
  ['ProjectileRadius', 'projectile.radius', 0.2, 0.01, 50],
  ['ProjectileCapacity', 'projectile.capacity', 1200, 1, 65535],
  ['ProjectilePierce', 'projectile.pierce', 0, 0, 1000],
  ['ProjectileRicochetCount', 'projectile.ricochet_count', 0, 0, 1000],
  ['ProjectileRicochetRadius', 'projectile.ricochet_radius', 8, 0, 1000],
  ['ProjectileReflectionCount', 'projectile.reflection_count', 0, 0, 1000],
  ['ProjectileReturnCount', 'projectile.return_count', 0, 0, 1000],
  ['ProjectileRefractionCount', 'projectile.refraction_count', 0, 0, 64],
  ['ProjectileRefractionAngle', 'projectile.refraction_angle', 30, 0, 360],
  ['AreaRadius', 'area.radius', 0, 0, 1000],
  ['ExplosionRadius', 'explosion.radius', 0, 0, 1000],
  ['ExplosionDamagePercent', 'explosion.damage_percent', 0, -100, 1.0e9],
  ['OwnerDamageMultiplier', 'owner.damage_multiplier', 1, 0, 1.0e9],
];

export const EStat = Object.freeze(Object.fromEntries(SCALAR.map(([id], index) => [id, index])));
export const NumScalarStats = SCALAR.length;
export const EElementStat = Object.freeze({ DamageFlat: 0, DamagePercent: 1, Resistance: 2, MaxResistance: 3, Penetration: 4, Num: 5 });
const ELEMENT_STAT_NAMES = ['damage_flat', 'damage_percent', 'resistance', 'max_resistance', 'penetration'];
export const NumElementStats = 5;
export const NumStats = NumScalarStats + NumElements * NumElementStats;

export const elementStatId = (element, kind) => NumScalarStats + element * NumElementStats + kind;

const TABLE = (() => {
  const table = SCALAR.map(([, name, def, min, max]) => ({ name, default: f(def), min: f(min), max: f(max) }));
  for (let element = 0; element < NumElements; ++element) {
    for (let kind = 0; kind < NumElementStats; ++kind) {
      const supported = resistanceIndex(element) !== -1 || kind === EElementStat.DamageFlat || kind === EElementStat.DamagePercent;
      table.push({
        // Keep dense slots, but expose only the four real resistance types.
        name: supported ? `element.${ELEMENT_NAMES[element]}.${ELEMENT_STAT_NAMES[kind]}` : '',
        default: kind === EElementStat.MaxResistance ? f(75) : 0,
        min: kind === EElementStat.DamagePercent ? f(-100) : kind === EElementStat.Resistance ? f(-1.0e9) : 0,
        max: kind === EElementStat.MaxResistance ? f(100) : f(1.0e9),
      });
    }
  }
  return Object.freeze(table.map(Object.freeze));
})();

const BY_NAME = new Map(TABLE.map((info, index) => [info.name.toLowerCase(), index]).filter(([name]) => name));

export const getStatInfo = stat => TABLE[stat];
export const statCount = () => TABLE.length;

// "element.cold.*" remains an alias of "element.frost.*". Returns -1 when unknown.
export function findStat(path) {
  let canonical = String(path).toLowerCase();
  if (canonical.startsWith('element.cold.')) canonical = 'element.frost.' + canonical.slice('element.cold.'.length);
  return BY_NAME.has(canonical) ? BY_NAME.get(canonical) : -1;
}

// (set or base + Σadd) * max(0, 1 + (Σinc - Σred)/100) * Πmore, then bounds.
export class StatBlock {
  constructor() {
    this.add = new Float32Array(NumStats);
    this.increased = new Float32Array(NumStats);
    this.more = new Float32Array(NumStats).fill(1);
    this.setValue = new Float32Array(NumStats);
    this.lower = new Float32Array(NumStats).fill(-FLT_MAX);
    this.upper = new Float32Array(NumStats).fill(FLT_MAX);
    this.isSet = new Uint8Array(NumStats);
    this.modified = new Uint8Array(NumStats);
    this.resolved = new Float32Array(NumStats);
    for (let i = 0; i < NumStats; ++i) this.resolved[i] = TABLE[i].default;
  }

  apply(stat, op, value) {
    value = f(value);
    this.modified[stat] = 1;
    switch (op) {
      case 0: this.add[stat] = f(this.add[stat] + value); break; // Add
      case 1: this.more[stat] = f(this.more[stat] * value); break; // Multiply
      case 2: this.isSet[stat] = 1; this.setValue[stat] = value; break; // Set
      case 3: this.increased[stat] = f(this.increased[stat] + value); break; // IncreasedPercent
      case 4: this.increased[stat] = f(this.increased[stat] - value); break; // ReducedPercent
      case 5: this.lower[stat] = Math.max(this.lower[stat], value); break; // Min
      case 6: this.upper[stat] = Math.min(this.upper[stat], value); break; // Max
    }
  }

  finalize() {
    for (let i = 0; i < NumStats; ++i) this.resolved[i] = this.from(i, TABLE[i].default);
  }

  get(stat) {
    return this.resolved[stat];
  }

  isModified(stat) {
    return this.modified[stat] === 1;
  }

  // Evaluates the partition against an arbitrary base (e.g. an action's own field).
  from(stat, base) {
    const info = TABLE[stat];
    const start = this.isSet[stat] ? this.setValue[stat] : f(base);
    const scale = Math.max(0, f(1 + f(this.increased[stat] / 100)));
    const value = f(f(f(start + this.add[stat]) * scale) * this.more[stat]);
    const lower = Math.max(info.min, this.lower[stat]);
    const upper = Math.min(info.max, this.upper[stat]);
    return clamp(value, lower, Math.max(lower, upper));
  }

  // Human-readable breakdown for tools (not part of the runtime contract).
  describe(stat) {
    return {
      name: TABLE[stat].name, value: this.resolved[stat], default: TABLE[stat].default,
      add: this.add[stat], increased: this.increased[stat], more: this.more[stat],
      set: this.isSet[stat] ? this.setValue[stat] : null,
      lower: this.lower[stat] === -FLT_MAX ? null : this.lower[stat],
      upper: this.upper[stat] === FLT_MAX ? null : this.upper[stat],
    };
  }
}
