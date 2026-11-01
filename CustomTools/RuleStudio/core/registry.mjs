// 属性注册表：新引擎里所有属性都必须在这里登记，词条引用未知属性会在编译时报错。
//
// Naming: dotted keys. Families with a wildcard segment (`res.*`, `conv.*.*`) are expanded from the
// type lists below, so `res.fire`, `conv.physical.cold` and `chance.ignite` are all real stats.
// Every stat has a default base, a clamp and a combine mode:
//   number — (Σbase) × (1 + Σinc/100) × Π(1 + more/100), then clamped
//   flag   — on when any flag mod is active (value > 0)

export const DAMAGE_TYPES = Object.freeze(['physical', 'fire', 'cold', 'lightning', 'chaos']);
export const ELEMENTS = Object.freeze(['fire', 'cold', 'lightning']);
export const RESISTS = Object.freeze(['fire', 'cold', 'lightning', 'chaos']);
/** Damage-over-time ailments and the hit type that can inflict them by default. */
export const DOT_AILMENTS = Object.freeze({ ignite: 'fire', poison: 'chaos', bleed: 'physical' });
/** Non-damaging ailments: magnitude scales with hit size relative to the target's pool. */
export const SOFT_AILMENTS = Object.freeze({ shock: 'lightning', chill: 'cold', freeze: 'cold', electrocute: 'lightning', brittle: 'cold', sap: 'lightning', scorch: 'fire' });
export const AILMENTS = Object.freeze([...Object.keys(DOT_AILMENTS), ...Object.keys(SOFT_AILMENTS)]);
export const CHARGES = Object.freeze(['power', 'frenzy', 'endurance']);
/** Conversion order: damage only converts "down" this list (PoE rule), so loops are impossible. */
export const CONVERSION_ORDER = Object.freeze(['physical', 'lightning', 'cold', 'fire', 'chaos']);

const N = (base = 0, min = -1e9, max = 1e9) => ({ kind: 'number', base, min, max });
const F = () => ({ kind: 'flag', base: 0, min: 0, max: 1 });

const STATIC = {
  // Pools and recovery
  'life': N(0, 1), 'mana': N(0, 0), 'es': N(0, 0),
  'life.regen': N(), 'mana.regen': N(), 'es.rechargeRate': N(20, 0), 'es.rechargeDelay': N(2, 0.1),
  'life.onHit': N(), 'life.onKill': N(), 'mana.onKill': N(), 'leech.life': N(0, 0, 100), 'leech.mana': N(0, 0, 100), 'leech.max': N(10, 0, 100),
  'reserve': N(0, 0, 100), 'reserveEfficiency': N(0, -100, 1e9),
  // Defence
  'armour': N(0, 0), 'evasion': N(0, 0), 'accuracy': N(0, 0), 'block': N(0, 0, 75), 'block.max': N(75, 0, 90),
  'damageTaken': N(), 'damageTaken.hit': N(), 'damageTaken.dot': N(),
  'avoid.ailment': N(0, 0, 100), 'stunThreshold': N(0, 0),
  'chaosBypassEs': F(), 'cannotBeCrit': F(), 'mindOverMatter': N(0, 0, 100),
  // Offence (generic: filtered by tags on the modifier)
  'damage': N(), 'effectiveness': N(100, 0),
  'crit.chance': N(0, 0, 100), 'crit.taken': N(0, 0, 100), 'crit.bonus': N(100, 0), 'lucky.crit': F(),
  // speed / area / duration / moveSpeed / proj.speed are percentages (base 100): use op inc/more on them.
  'speed': N(100, 5), 'attackTime': N(0.8, 0.05), 'cooldown': N(0, 0), 'cooldownRecovery': N(0, -90), 'cost': N(0, 0),
  'area': N(100, 1), 'duration': N(100, 0), 'moveSpeed': N(100, 0), 'moveBase': N(400, 0),
  'proj.count': N(1, 1, 64), 'proj.speed': N(100, 1), 'proj.pierce': N(0, 0, 999), 'proj.chain': N(0, 0, 999),
  'proj.fork': N(0, 0, 8), 'proj.split': N(0, 0, 16), 'proj.return': N(0, 0, 8), 'proj.spread': N(30, 0, 360), 'proj.lifetime': N(1.2, 0.05),
  'repeat': N(0, 0, 16), 'strike.targets': N(1, 1, 32), 'echo': N(0, 0, 8),
  'minion.limit': N(0, 0, 200), 'totem.limit': N(1, 0, 32),
  'hitsCanTrigger': F(), 'overkillSpread': N(0, 0, 100), 'consumeKeep': N(0, 0, 100),
  // Ailment damage scales only with these (tag them: ['ignite'], ['poison'], ['dot']...), so generic hit
  // damage never double-dips into damage over time.
  'ailmentDamage': N(100, 0), 'dotDamage': N(100, 0),
  // Effect of statuses the actor applies (tag with the status id, e.g. ['herald_ice']).
  'buffEffect': N(100, 0),
  'knockback': N(0, 0), 'cannotAct': F(), 'cannotMove': F(),
};

const FAMILIES = [
  ['res', RESISTS, () => N(0, -200, 1e9)],
  ['res.max', RESISTS, () => N(75, 0, 90)],
  ['pen', RESISTS, () => N()],
  ['exposure', RESISTS, () => N(0, 0, 1e9)],
  ['added', DAMAGE_TYPES, () => N(0, 0)],
  ['dot', DAMAGE_TYPES, () => N(0, 0)],
  ['chance', AILMENTS, () => N(0, 0, 100)],
  ['effect', AILMENTS, () => N(100, 0)],
  ['ailmentDuration', AILMENTS, () => N(100, 0)],
  ['ailmentStacks', AILMENTS, () => N(1, 1, 999)],
  ['charge.max', CHARGES, () => N(3, 0, 50)],
  ['charge.duration', CHARGES, () => N(10, 0.1)],
];

const TABLE = new Map(Object.entries(STATIC));
for (const [prefix, list, make] of FAMILIES) for (const k of list) TABLE.set(`${prefix}.${k}`, make());
for (const a of CONVERSION_ORDER) for (const b of CONVERSION_ORDER) if (a !== b) {
  if (CONVERSION_ORDER.indexOf(b) > CONVERSION_ORDER.indexOf(a)) TABLE.set(`conv.${a}.${b}`, N(0, 0, 100));
  TABLE.set(`extra.${a}.${b}`, N(0, 0));
}

/** Content may register its own stats (a skill's own knob, a meter's capacity...) before compiling. */
export function defineStat(key, def = {}) {
  if (!/^[a-zA-Z][\w]*(\.[\w]+)*$/.test(key)) throw new Error(`属性名不合法：${key}`);
  const kind = def.kind === 'flag' ? F() : N(def.base ?? 0, def.min ?? -1e9, def.max ?? 1e9);
  const prev = TABLE.get(key);
  if (prev && (prev.kind !== kind.kind || prev.base !== kind.base || prev.min !== kind.min || prev.max !== kind.max)) throw new Error(`属性重复定义且不一致：${key}`);
  TABLE.set(key, Object.freeze(kind));
  return key;
}

export const statDef = key => TABLE.get(key);
export const hasStat = key => TABLE.has(key);
export const allStats = () => [...TABLE.keys()];
