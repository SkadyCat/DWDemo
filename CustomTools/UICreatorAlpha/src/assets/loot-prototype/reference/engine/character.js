// Character sheet (web-only): attributes, life / shield / mana pools and everything that recovers,
// spends or protects them. Trait files under Content/Rules/Affixes carry "sheet" entries:
//   { "stat": "<path>", "value": <expr> }      contributes to a sheet stat (combine rule per stat)
//   { "trigger": "<name>" }                    stateful effect; reads the trait's own params
// expr: number | {"param": name} | {"add"|"sub"|"mul"|"div": [expr, expr, ...]}
// The rule world stays untouched: offense conditions become a synthetic "__character" trait that is
// merged into each cast (RuleHost.castBuild extraFor), defense runs host-side on the damage rows.
import { ELEMENT_NAMES } from './types.js';
import { readTraitText } from './reader.js';
import { elementStatId, EElementStat } from './stats.js';
import { COMBAT_STATS, COMBAT_TRIGGERS } from './combat-catalog.js';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Tunable base values of a character with no sheet traits. */
export const CHARACTER_BASE = Object.freeze({
  life: 400, lifeRegen: 3, mana: 100, manaRegen: 8, castCost: 2,
  rechargeDelay: 2, rechargeRate: 20, // seconds; % of max shield per second
  leechRate: 2, leechCap: 10, // % of max pool per second per instance; total per second
  lowLife: 35, lowShield: 35, recently: 4, // % / % / seconds
  overflowDecay: 20, // % of the overflow per second
  bypass: 10, // % of incoming damage that skips the shield
  stunFraction: 0.25, stunSeconds: 0.4,
  armourFactor: 5, armourCap: 90,
});

export const DAMAGE_ELEMENTS = Object.freeze(['physical', 'lightning', 'fire', 'frost', 'void', 'poison']);
export const ELEMENTAL = Object.freeze(new Set(['fire', 'frost', 'lightning', 'void']));
const ELEMENT_TAGS = { fire: ['fire'], frost: ['frost', 'cold'], lightning: ['lightning'], physical: ['physical'], void: ['void'], poison: ['poison'] };

// ---------------------------------------------------------------- stat catalog
const per = list => list.flatMap(p => DAMAGE_ELEMENTS.map(e => `${p}.${e}`));
const SUM_STATS = [
  'map.monster_packs',
  'attr.strength', 'attr.dexterity', 'attr.intelligence', 'attr.constitution', 'mana.base',
  ...per(['damage.flat', 'damage.increased', 'damage.from_shield', 'damage.from_life']), 'damage.increased.elemental', 'damage.per_shield', 'damage.per_life',
  'area.per_shield', 'area.per_life',
  'defense.block_chance', 'defense.evade_chance', 'defense.armour', 'defense.evasion',
  // shield
  'shield.base', 'shield.increased', 'shield.equipment_increased', 'shield.per_intelligence', 'shield.per_strength', 'shield.from_life_percent', 'shield.from_mana_percent',
  'shield.recharge_rate', 'shield.recharge_start', 'shield.recharge_delay_reduction', 'shield.recharge_on_damaged', 'shield.recharge_on_kill', 'shield.recharge_on_crit',
  'shield.regen_flat', 'shield.regen_percent', 'shield.regen_speed', 'shield.sustain_efficiency', 'shield.regen_still_percent', 'shield.regen_moving_percent', 'shield.regen_low_speed',
  'shield.on_hit', 'shield.on_crit', 'shield.on_kill', 'shield.on_kill_percent', 'shield.on_block', 'shield.on_block_percent', 'shield.on_evade',
  'shield.on_block_armour_percent', 'shield.on_hit_taken_evasion_percent', 'shield.from_life_regen_percent', 'shield.from_overflow_life_regen_percent',
  'recoup.shield.percent', 'recoup.shield.prevented_physical_percent',
  'shield.taken_physical_reduction', 'shield.taken_elemental_reduction', 'shield.taken_dot_reduction', 'shield.bypass_reduction',
  'threshold.stun_shield_percent', 'threshold.ailment_shield_percent',
  'shield.full.damage', 'shield.full.critical_chance', 'shield.full.move_speed', 'shield.any.damage_taken_reduction',
  'shield.recharging.cast_speed', 'shield.leeching.attack_speed', 'shield.missing.damage', 'shield.missing.regen_speed',
  'cost.shield_percent', 'cost.shield_reduction', 'cast.max_shield_cost_percent', 'cast.max_shield_cost_damage',
  'shield.overflow_percent', 'shield.overflow_decay_reduction', 'shield.overflow.damage',
  // life
  'life.base', 'life.increased', 'life.per_strength', 'life.per_constitution', 'life.equipment_increased',
  'life.regen_flat', 'life.regen_percent', 'life.regen_speed', 'life.regen_low_speed', 'life.regen_still_percent', 'life.regen_moving_percent',
  'life.regen_recent_hit_percent', 'life.regen_no_recent_hit_percent',
  'life.on_hit', 'life.on_crit', 'life.on_kill', 'life.on_kill_percent', 'life.on_block', 'life.on_evade', 'life.on_cast', 'life.from_mana_spent_percent',
  'recoup.life.all', 'recoup.life.physical', 'recoup.life.elemental', 'recoup.life.speed', 'life.deferred_percent',
  'flask.life.amount', 'flask.life.speed', 'flask.life.instant', 'heal.received', 'heal.received_low', 'heal.overflow_to_shield',
  'life.full.damage', 'life.full.critical_chance', 'life.full.move_speed', 'life.low.damage', 'life.low.attack_speed', 'life.low.cast_speed',
  'life.low.damage_taken_reduction', 'life.missing.damage', 'life.missing.leech_speed', 'life.low_threshold',
  'cost.life_percent', 'cost.life_reduction', 'cast.current_life_cost_percent', 'cast.current_life_cost_damage', 'cast.max_life_cost_percent', 'cast.max_life_cost_area',
  // leech (both pools)
  ...['shield', 'life'].flatMap(pool => ['all', 'physical', 'elemental', 'speed', 'cap', 'duration', 'instant', 'keep_full'].map(k => `leech.${pool}.${k}`)),
];
const MORE_STATS = [...DAMAGE_ELEMENTS.map(e => `damage.more.${e}`), 'shield.more', 'life.more'];
const MAX_STATS = ['shield.recharge_grace', 'recoup.shield.seconds', 'recoup.shield.prevented_physical_seconds', 'recoup.life.seconds', 'life.deferred_seconds'];
// Equipment-sourced bases are tracked per slot ("@equipment:<slot>") for 头盔/胸甲/手套和鞋子提供的护盾.
export const SHEET_STATS = Object.freeze(new Map([
  ...SUM_STATS.map(p => [p, 'sum']), ...MORE_STATS.map(p => [p, 'more']), ...MAX_STATS.map(p => [p, 'max']),
  ...[...COMBAT_STATS].filter(([p]) => !SUM_STATS.includes(p) && !MORE_STATS.includes(p) && !MAX_STATS.includes(p)),
]));

/** Stateful effects: required trait params; stitched = the stitched traits are the payload. */
export const SHEET_TRIGGERS = Object.freeze({
  empower_on_shield_spent: { params: ['per', 'bonus'] },
  empower_on_life_spent: { params: ['per', 'bonus'] },
  empower_from_overflow: { params: ['percent', 'bonus'] },
  cast_on_shield_restored: { params: ['per'], stitched: 'cast' },
  cast_on_life_restored: { params: ['per'], stitched: 'cast' },
  cast_on_shield_broken: { params: ['cooldown'], stitched: 'cast' },
  buff_on_full_shield: { params: ['duration'], stitched: 'grant' },
  buff_on_full_life: { params: ['duration', 'cooldown'], stitched: 'grant' },
  guard_on_low_life: { params: ['duration', 'reduction', 'cooldown'] },
  cheat_death_keep: { params: ['cooldown'] },
  cheat_death_heal: { params: ['percent', 'cooldown'] },
  flask_life: { params: ['amount', 'seconds'] },
  ...Object.fromEntries(Object.entries(COMBAT_TRIGGERS).filter(([name]) => !['cast_on_life_restored', 'cast_on_shield_restored'].includes(name))),
});

function evalExpr(expr, params) {
  if (typeof expr === 'number') return expr;
  if (!isObject(expr)) return NaN;
  if (typeof expr.param === 'string') {
    const key = [...params.keys()].find(k => k.toLowerCase() === expr.param.toLowerCase());
    return key === undefined ? NaN : Number(params.get(key));
  }
  for (const op of ['add', 'sub', 'mul', 'div']) {
    if (!Array.isArray(expr[op]) || expr[op].length < 2) continue;
    const values = expr[op].map(e => evalExpr(e, params));
    if (op === 'add') return values.reduce((a, b) => a + b);
    if (op === 'sub') return values.reduce((a, b) => a - b);
    if (op === 'mul') return values.reduce((a, b) => a * b);
    return values.reduce((a, b) => (b === 0 ? 0 : a / b));
  }
  return NaN;
}

/** Structural check of trait.sheet against the catalog. Returns '' or an error. */
export function validateSheet(trait) {
  for (let i = 0; i < (trait.sheet || []).length; ++i) {
    const entry = trait.sheet[i];
    const path = `${trait.id}.sheet[${i}]`;
    const keys = Object.keys(entry);
    if (entry.grant_skill !== undefined) {
      if (keys.length !== 1 || typeof entry.grant_skill !== 'string' || !/^[a-z0-9_]+$/.test(entry.grant_skill))
        return `${path}: grant_skill needs one skill id`;
      continue;
    }
    if (entry.trigger !== undefined) {
      if (keys.some(k => k !== 'trigger')) return `${path}: trigger entries only have "trigger"`;
      const spec = SHEET_TRIGGERS[entry.trigger];
      if (!spec) return `${path}: unknown trigger ${entry.trigger}`;
      for (const p of spec.params) if (![...trait.params.keys()].some(k => k.toLowerCase() === p)) return `${path}: trigger ${entry.trigger} needs param ${p}`;
      continue;
    }
    if (keys.some(k => k !== 'stat' && k !== 'value')) return `${path}: unknown field ${keys.find(k => k !== 'stat' && k !== 'value')}`;
    if (!SHEET_STATS.has(entry.stat)) return `${path}: unknown sheet stat ${entry.stat}`;
    if (!Number.isFinite(evalExpr(entry.value, trait.params))) return `${path}: value must be a number or an expression over params`;
  }
  return '';
}

export const hasSheet = trait => !!trait?.sheet?.length;
const triggerSpecs = trait => (trait.sheet || []).filter(e => e.trigger).map(e => SHEET_TRIGGERS[e.trigger]).filter(Boolean);
/** 'cast' | 'grant' | '' — what a sheet trait does with traits stitched into it. */
export const sheetStitchRole = trait => triggerSpecs(trait).find(s => s.stitched)?.stitched || '';

const GROUPS = [['attr.', '属性'], ['defense.', '防御'], ['mana.', '属性'], ['damage.', '伤害'], ['area.', '伤害']];
/** UI group of a sheet trait: 属性 / 伤害 / 护盾 / 气血 / 防御. */
export function sheetGroup(trait) {
  const keys = (trait.sheet || []).map(e => e.stat || e.trigger || '');
  if (keys.some(k => /shield|overflow|threshold/.test(k))) return '护盾';
  if (keys.some(k => /life|heal|flask|cheat_death/.test(k))) return '气血';
  for (const [prefix, name] of GROUPS) if (keys.some(k => k.startsWith(prefix))) return name;
  return '其他';
}

/**
 * entries: [{source, equipment}] — trait sources (params already merged) that the character holds.
 * Flat life/shield from equipment is tracked apart ("装备提供的…+n%"). Returns {stats: Map, triggers}.
 */
export function computeSheet(entries) {
  const stats = new Map();
  const triggers = [];
  for (const { source, equipment = false, label = '', slot = '' } of entries) {
    if (!source?.sheet) continue;
    for (const entry of source.sheet) {
      if (entry.trigger) {
        const spec = SHEET_TRIGGERS[entry.trigger];
        if (!spec) continue;
        const params = Object.fromEntries(spec.params.map(p => [p, evalExpr({ param: p }, source.params)]));
        triggers.push({ name: entry.trigger, params, stitched: source.stitched || [], label: label || source.id, id: source.id });
        continue;
      }
      const combine = SHEET_STATS.get(entry.stat);
      if (!combine) continue;
      const value = evalExpr(entry.value, source.params);
      if (!Number.isFinite(value)) continue;
      const local = equipment && ['life.base', 'shield.base', 'defense.evasion'].includes(entry.stat);
      const key = local ? (entry.stat === 'shield.base' && slot ? `shield.base@equipment:${slot}` : `${entry.stat}@equipment`) : entry.stat;
      const prev = stats.get(key);
      if (combine === 'more') stats.set(key, (prev ?? 1) * (1 + value / 100));
      else if (combine === 'max') stats.set(key, Math.max(prev ?? 0, value));
      else stats.set(key, (prev ?? 0) + value);
    }
  }
  return { stats, triggers };
}

function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- runtime
export class Character {
  constructor({ base = {}, seed = 9, random = null } = {}) {
    this.base = { ...CHARACTER_BASE, ...base };
    this.random = random || makeRandom(seed);
    this.stats = new Map();
    this.triggers = [];
    this.sheetKey = '';
    this.derive();
    this.reset();
  }

  stat(path) {
    const v = this.stats.get(path);
    const base = v ?? (SHEET_STATS.get(path) === 'more' ? 1 : 0);
    // Timed buffs (闪避/格挡后的增益 …) and runtime auras (附近召唤物减伤 …) add to plain sums.
    const buff = this.buffStats?.get(path);
    const aura = this.aura?.get(path);
    return base + (buff || 0) + (aura || 0);
  }

  /** Σ trigger params by trigger name (all instances). */
  triggersNamed(name) { return this.triggers.filter(t => t.name === name); }

  /** Timed buff on a sheet stat: {stat, value, duration, key} — same key refreshes instead of stacking. */
  addBuff(stat, value, duration, key = stat) {
    if (!(duration > 0) || !value) return;
    const live = this.buffs.find(b => b.key === key);
    if (live) { live.value = Math.max(live.value, value); live.left = Math.max(live.left, duration); } else this.buffs.push({ stat, value, left: duration, key });
    this.rebuildBuffs();
  }

  rebuildBuffs() {
    this.buffStats = new Map();
    for (const b of this.buffs) this.buffStats.set(b.stat, (this.buffStats.get(b.stat) || 0) + b.value);
  }

  /** Event for the combat runtime (triggers, counters): {type, ...}. */
  emit(type, data = {}) { if (this.combatEvents.length < 400) this.combatEvents.push({ type, ...data }); }

  /** entries: [{source, equipment, label}]; key: cache key (skip when unchanged). Keeps current pools (clamped). */
  setSheet(entries, key = null) {
    if (key !== null && key === this.sheetKey) return false;
    this.sheetKey = key ?? '';
    const { stats, triggers } = computeSheet(entries);
    const old = new Map(this.triggers.map(t => [`${t.id}|${t.name}`, t]));
    this.stats = stats;
    // Trigger state (cooldowns, accumulators) survives a re-sheet when the same trait is still held.
    this.triggers = triggers.map(t => ({ cooldown: 0, acc: 0, ...(old.get(`${t.id}|${t.name}`) || {}), ...t }));
    const wasFull = this.life >= this.maxLife - 1e-6;
    this.derive();
    if (wasFull && this.fresh) { this.life = this.maxLife; this.shield = this.maxShield; this.mana = this.maxMana; }
    this.life = Math.min(this.life, this.maxLife);
    this.shield = Math.min(this.shield, this.shieldCap);
    this.mana = Math.min(this.mana, this.maxMana);
    return true;
  }

  derive() {
    const s = p => this.stat(p);
    const B = this.base;
    this.attributes = { strength: s('attr.strength'), dexterity: s('attr.dexterity'), intelligence: s('attr.intelligence'), constitution: s('attr.constitution') };
    const { strength, intelligence, constitution, dexterity } = this.attributes;
    this.maxMana = Math.max(0, B.mana + s('mana.base'));
    const lifeBase = B.life + s('life.base') + s('life.base@equipment') * (1 + s('life.equipment_increased') / 100)
      + strength * s('life.per_strength') + constitution * s('life.per_constitution');
    this.maxLife = Math.max(1, lifeBase * Math.max(0, 1 + s('life.increased') / 100) * s('life.more'));
    // Evasion (闪避值): base + equipment base, % (incl. conditions, see evasion()), independent multiplier.
    this.evasionBase = s('defense.evasion') + s('defense.evasion@equipment') * (1 + s('evasion.equipment_increased') / 100) + dexterity * s('evasion.per_dexterity');
    // Shield from equipment: per slot "@equipment:<slot>" with the slot's own increase (头盔/胸甲/手套和鞋子).
    let equipmentShield = s('shield.base@equipment');
    for (const [key, value] of this.stats) {
      const slot = /^shield\.base@equipment:(\w+)$/.exec(key)?.[1];
      if (!slot) continue;
      const local = slot === 'helmet' ? s('shield.slot_increased.helmet') : slot === 'chest' ? s('shield.slot_increased.chest')
        : slot === 'gloves' || slot === 'boots' ? s('shield.slot_increased.hands_feet') : 0;
      equipmentShield += value * (1 + local / 100);
    }
    const shieldBase = s('shield.base') + equipmentShield * (1 + s('shield.equipment_increased') / 100)
      + intelligence * s('shield.per_intelligence') + strength * s('shield.per_strength')
      + this.maxLife * s('shield.from_life_percent') / 100 + this.maxMana * s('shield.from_mana_percent') / 100
      + this.evasionValue(false) * s('evasion.shield_per');
    const spellBlockShield = this.blockChances(null).spell * s('block.shield_per_spell');
    this.maxShield = Math.max(0, shieldBase * Math.max(0, 1 + (s('shield.increased') + spellBlockShield) / 100) * s('shield.more'));
    this.shieldCap = this.maxShield * (1 + Math.max(0, s('shield.overflow_percent')) / 100);
    this.lowLifeThreshold = clamp(B.lowLife + s('life.low_threshold'), 1, 99);
    this.rechargeDelay = Math.max(0, B.rechargeDelay / Math.max(0.1, 1 + s('shield.recharge_start') / 100) - s('shield.recharge_delay_reduction'));
    this.rechargeRate = this.maxShield * B.rechargeRate / 100 * Math.max(0, 1 + s('shield.recharge_rate') / 100);
    this.stunThreshold = this.maxLife + this.maxShield * s('threshold.stun_shield_percent') / 100;
    this.ailmentThreshold = this.maxLife + this.maxShield * s('threshold.ailment_shield_percent') / 100;
    const chances = this.blockChances(null);
    this.blockChance = chances.attack;
    this.evadeChance = this.evadeChances(null).attack;
  }

  // ---- 闪避 / 格挡 (section 5, 6). Conditions are read live: moving, life, shield, recent hits.
  /** Final evasion value. live=false ignores conditional increases (used while deriving the sheet). */
  evasionValue(live = true) {
    const s = p => this.stat(p);
    let increased = s('evasion.increased');
    if (live && this.life !== undefined) {
      increased += this.moving ? s('evasion.moving') : s('evasion.still');
      if (this.isFullLife) increased += s('evasion.full_life');
      if (this.isLowLife) increased += s('evasion.low_life');
      if (this.isFullShield) increased += s('evasion.full_shield');
      increased += this.recentlyHit ? s('evasion.recently_hit') : s('evasion.not_recently_hit');
    }
    const value = Math.max(0, (this.evasionBase || 0) * Math.max(0, 1 + increased / 100) * s('evasion.more'));
    // 闪避值的 n% 转化为护甲.
    return value * (1 - clamp(s('evasion.to_armour'), 0, 100) / 100);
  }

  armourValue() {
    const s = p => this.stat(p);
    const fromEvasion = this.evasionValue() * clamp(s('evasion.to_armour'), 0, 100) / Math.max(1e-9, 100 - clamp(s('evasion.to_armour'), 0, 99.99));
    return Math.max(0, (s('defense.armour') + fromEvasion) * (1 + s('buff.armour') / 100));
  }

  /** {attack, spell, cap} evade chances for a hit kind ({melee, projectile}) — percent. */
  evadeChances(kind) {
    const s = p => this.stat(p);
    const cap = clamp(75 + s('evade.cap'), 0, 95);
    const ev = this.evasionValue(kind !== null);
    const fromValue = ev > 0 ? ev / (ev + 600) * 100 : 0;
    let attack = fromValue + s('defense.evade_chance') + (this.evadeFail || 0);
    if (kind?.melee) attack += s('evade.melee');
    if (kind?.projectile) attack += s('evade.projectile');
    const spell = s('evade.spell') + (s('evade.spell') > 0 ? this.evadeFail || 0 : 0);
    return { attack: clamp(attack, 0, cap), spell: clamp(spell, 0, cap), cap };
  }

  /** {attack, spell, overflow} block chances — percent. Off-hand: this.offhand = 'shield' | 'weapon' | ''. */
  blockChances(kind) {
    const s = p => this.stat(p);
    const live = kind !== null && this.life !== undefined;
    let attack = s('defense.block_chance');
    let both = 0;
    if (this.offhand === 'shield') attack += 15 + s('block.shield_item') + s('block.with_shield');
    if (this.offhand === 'weapon') attack += s('block.dual_wield');
    if (live) {
      both += this.moving ? s('block.moving') : s('block.still');
      if (this.isLowLife) both += s('block.low_life');
      if (this.recentlyHit) both += s('block.recently_hit');
    }
    const attackCap = clamp(75 + s('block.attack_cap'), 0, 95);
    const spellCap = clamp(75 + s('block.spell_cap'), 0, 95);
    const rawAttack = attack + both;
    const spell = s('block.spell') + both + attack * s('block.attack_to_spell') / 100;
    return { attack: clamp(rawAttack, 0, attackCap), spell: clamp(spell, 0, spellCap), overflow: Math.max(0, rawAttack - attackCap) };
  }

  reset() {
    this.fresh = true;
    this.life = this.maxLife;
    this.shield = this.maxShield;
    this.mana = this.maxMana;
    this.dead = false;
    this.sinceDamaged = Infinity;
    this.recharging = false;
    this.grace = 0;
    this.leech = { life: [], shield: [] };
    this.recoups = [];
    this.deferred = [];
    this.flasks = [];
    this.guard = { left: 0, reduction: 0 };
    this.stunned = 0;
    this.pendingEmpower = 0;
    this.wasFullShield = this.maxShield > 0;
    this.wasLow = false;
    this.lowSinceFull = false;
    this.moving = false;
    this.pendingCasts = [];
    this.pendingGrants = [];
    this.events = [];
    // Combat affixes (sections 5, 6, 15): timed buffs, next-skill modifiers, counters, charges.
    this.buffs = [];
    this.buffStats = new Map();
    this.combatEvents = [];
    this.evadeFail = 0;
    this.sinceHit = Infinity;
    this.afterHitReduction = 0;
    this.next = { attackMore: 0, attackCrit: 0, cost: 0 };
    this.counterBank = 0;
    this.charges = 0;
    this.selfPoison = [];
    this.flow = { lifeRestored: 0, shieldRestored: 0, manaRestored: 0, manaSpent: 0, lifeSpent: 0, shieldSpent: 0, lifeLost: 0, hitTaken: 0 };
    this.totals = { lifeRecovered: 0, shieldRecovered: 0, lifeLost: 0, shieldLost: 0, prevented: 0, blocked: 0, evaded: 0, stuns: 0, cheatedDeath: 0, triggers: 0, manaRecovered: 0 };
    for (const t of this.triggers || []) { t.cooldown = 0; t.acc = 0; }
  }

  // ---- conditions
  get recentlyHit() { return this.sinceHit < this.base.recently; }
  get isFullLife() { return this.life >= this.maxLife - 1e-6; }
  get isLowLife() { return this.life <= this.maxLife * this.lowLifeThreshold / 100; }
  get isFullShield() { return this.maxShield > 0 && this.shield >= this.maxShield - 1e-6; }
  get isLowShield() { return this.maxShield > 0 && this.shield <= this.maxShield * this.base.lowShield / 100; }
  get missingLifePercent() { return clamp((1 - this.life / this.maxLife) * 100, 0, 100); }
  get missingShieldPercent() { return this.maxShield > 0 ? clamp((1 - this.shield / this.maxShield) * 100, 0, 100) : 0; }
  get overflow() { return Math.max(0, this.shield - this.maxShield); }
  get recentlyDamaged() { return this.sinceDamaged < this.base.recently; }
  get leechingShield() { return this.leech.shield.length > 0; }

  log(text) {
    this.events.unshift(text);
    if (this.events.length > 30) this.events.length = 30;
  }

  chance(percent) { return percent > 0 && this.random() * 100 < percent; }

  // ---- recovery (every source goes through here)
  recover(pool, amount, { overflow = true } = {}) {
    if (this.dead || !(amount > 0)) return 0;
    if (pool === 'mana') {
      const gained = Math.min(Math.max(0, this.maxMana - this.mana), amount);
      this.mana += gained;
      this.flow.manaRestored += gained;
      this.totals.manaRecovered += gained;
      return gained;
    }
    if (pool === 'life') {
      const scaled = amount * Math.max(0, 1 + (this.stat('heal.received') + (this.isLowLife ? this.stat('heal.received_low') : 0)) / 100);
      const wasFull = this.isFullLife;
      const gained = Math.min(Math.max(0, this.maxLife - this.life), scaled);
      this.life += gained;
      this.totals.lifeRecovered += gained;
      this.flow.lifeRestored += gained;
      if (!wasFull && this.isFullLife) this.emit('life_full');
      const excess = scaled - gained;
      if (excess > 0 && this.stat('heal.overflow_to_shield') > 0) this.recover('shield', excess * this.stat('heal.overflow_to_shield') / 100);
      if (!this.isLowLife && this.isFullLife && this.lowSinceFull) this.onFullLifeFromLow();
      this.accumulateRestored('cast_on_life_restored', gained);
      return gained;
    }
    const cap = overflow ? this.shieldCap : this.maxShield;
    const gained = Math.min(Math.max(0, cap - this.shield), amount);
    this.shield += gained;
    this.totals.shieldRecovered += gained;
    this.flow.shieldRestored += gained;
    this.accumulateRestored('cast_on_shield_restored', gained);
    return gained;
  }

  accumulateRestored(name, gained) {
    if (!(gained > 0)) return;
    for (const t of this.triggers) {
      if (t.name !== name || !(t.params.per > 0)) continue;
      t.acc += gained;
      while (t.acc >= t.params.per) { t.acc -= t.params.per; this.fire(t, 'cast'); }
    }
  }

  fire(trigger, kind) {
    ++this.totals.triggers;
    if (kind === 'cast' && trigger.stitched.length) this.pendingCasts.push({ sources: trigger.stitched, label: trigger.label });
    if (kind === 'grant' && trigger.stitched.length) this.pendingGrants.push({ sources: trigger.stitched, duration: trigger.params.duration, label: trigger.label });
    this.log(`${trigger.label} 触发`);
  }

  startRecharge() {
    if (this.maxShield <= 0 || this.shield >= this.maxShield) return;
    if (!this.recharging) this.emit('recharge_start');
    this.recharging = true;
    this.grace = this.stat('shield.recharge_grace');
    this.sinceDamaged = Math.max(this.sinceDamaged, this.rechargeDelay);
  }

  onFullLifeFromLow() {
    this.lowSinceFull = false;
    for (const t of this.triggers) {
      if (t.name !== 'buff_on_full_life' || t.cooldown > 0) continue;
      t.cooldown = t.params.cooldown;
      this.fire(t, 'grant');
    }
  }

  // ---- per frame
  tick(dt, { moving = false } = {}) {
    if (this.dead) return;
    this.fresh = false;
    this.moving = moving;
    const s = p => this.stat(p);
    const B = this.base;
    this.sinceDamaged += dt;
    this.sinceHit += dt;
    this.stunned = Math.max(0, this.stunned - dt);
    this.guard.left = Math.max(0, this.guard.left - dt);
    for (const t of this.triggers) t.cooldown = Math.max(0, t.cooldown - dt);
    if (this.buffs.length) {
      for (const b of this.buffs) b.left -= dt;
      const before = this.buffs.length;
      this.buffs = this.buffs.filter(b => b.left > 0);
      if (this.buffs.length !== before) this.rebuildBuffs();
    }
    // 自身中毒 (poison.self): each layer costs 1% max life per second for 2 s.
    if (this.selfPoison.length) {
      for (const p of this.selfPoison) p.left -= dt;
      this.selfPoison = this.selfPoison.filter(p => p.left > 0);
      if (this.selfPoison.length) this.loseLife(Math.min(this.life - 1, this.maxLife * 0.01 * this.selfPoison.length * dt));
    }

    // mana
    this.recover('mana', B.manaRegen * dt);

    // life regeneration (and its shield side effects)
    const lifePct = s('life.regen_percent') + (moving ? s('life.regen_moving_percent') : s('life.regen_still_percent'))
      + (this.recentlyDamaged ? s('life.regen_recent_hit_percent') : s('life.regen_no_recent_hit_percent')) + this.selfPoison.length * 0.5;
    const lifeRegen = (B.lifeRegen + s('life.regen_flat') + this.maxLife * lifePct / 100)
      * Math.max(0, 1 + (s('life.regen_speed') + (this.isLowLife ? s('life.regen_low_speed') : 0)) / 100) * dt;
    if (lifeRegen > 0) {
      const wasFull = this.isFullLife;
      const gained = this.recover('life', lifeRegen);
      if (s('shield.from_life_regen_percent') > 0) this.recover('shield', lifeRegen * s('shield.from_life_regen_percent') / 100);
      const spill = wasFull ? lifeRegen : Math.max(0, lifeRegen - gained);
      if (spill > 0 && s('shield.from_overflow_life_regen_percent') > 0) this.recover('shield', spill * s('shield.from_overflow_life_regen_percent') / 100);
    }

    // shield regeneration
    if (this.maxShield > 0) {
      const pct = s('shield.regen_percent') + (moving ? s('shield.regen_moving_percent') : s('shield.regen_still_percent'));
      const speed = s('shield.regen_speed') + (this.isLowShield ? s('shield.regen_low_speed') : 0) + this.missingShieldPercent * s('shield.missing.regen_speed');
      const regen = (s('shield.regen_flat') + this.maxShield * pct / 100) * Math.max(0, 1 + speed / 100) * Math.max(0, 1 + s('shield.sustain_efficiency') / 100) * dt;
      this.recover('shield', regen);
      // recharge: starts after the delay without damage; does not overflow
      if (!this.recharging && this.sinceDamaged >= this.rechargeDelay && this.shield < this.maxShield) this.startRecharge();
      if (this.recharging) {
        this.grace = Math.max(0, this.grace - dt);
        this.recover('shield', this.rechargeRate * dt, { overflow: false });
        if (this.shield >= this.maxShield) this.recharging = false;
      }
      // overflow decay
      if (this.shield > this.maxShield) {
        const decay = (this.shield - this.maxShield) * B.overflowDecay / 100 * Math.max(0, 1 - s('shield.overflow_decay_reduction') / 100) * dt;
        this.shield = Math.max(this.maxShield, this.shield - decay);
      }
    }

    this.tickLeech('life', dt);
    this.tickLeech('shield', dt);

    // recoup / flasks / deferred life loss (linear over their duration)
    for (const r of this.recoups) { const take = Math.min(r.left, r.rate * dt); r.left -= take; this.recover(r.pool, take); }
    this.recoups = this.recoups.filter(r => r.left > 1e-6);
    for (const r of this.flasks) { const take = Math.min(r.left, r.rate * dt); r.left -= take; this.recover('life', take); }
    this.flasks = this.flasks.filter(r => r.left > 1e-6);
    for (const r of this.deferred) { const take = Math.min(r.left, r.rate * dt); r.left -= take; this.loseLife(take); }
    this.deferred = this.deferred.filter(r => r.left > 1e-6);

    // state transitions
    const low = this.isLowLife;
    if (low) this.lowSinceFull = true;
    if (low && !this.wasLow) {
      this.emit('enter_low');
      for (const t of this.triggers) {
        if (t.name !== 'guard_on_low_life' || t.cooldown > 0) continue;
        t.cooldown = t.params.cooldown;
        this.guard = { left: t.params.duration, reduction: t.params.reduction };
        ++this.totals.triggers;
        this.log(`${t.label}：${t.params.duration}s 减伤 ${t.params.reduction}%`);
      }
    }
    this.wasLow = low;
    const full = this.isFullShield;
    if (full && !this.wasFullShield) {
      this.emit('shield_full');
      for (const t of this.triggers) if (t.name === 'buff_on_full_shield') this.fire(t, 'grant');
    }
    this.wasFullShield = full;
  }

  tickLeech(pool, dt) {
    const list = this.leech[pool];
    if (!list.length) return;
    const max = pool === 'life' ? this.maxLife : this.maxShield;
    const full = pool === 'life' ? this.isFullLife : this.shield >= this.maxShield;
    if (full && !(this.stat(`leech.${pool}.keep_full`) > 0)) { list.length = 0; return; }
    let budget = max * this.base.leechCap / 100 * Math.max(0, 1 + this.stat(`leech.${pool}.cap`) / 100) * dt;
    for (const inst of list) {
      if (budget <= 0) break;
      const take = Math.min(inst.left, inst.rate * dt, budget);
      inst.left -= take;
      budget -= take;
      this.recover(pool, take, { overflow: false });
    }
    this.leech[pool] = list.filter(i => i.left > 1e-6);
  }

  addLeech(pool, amount) {
    if (!(amount > 0)) return;
    const max = pool === 'life' ? this.maxLife : this.maxShield;
    if (!(max > 0)) return;
    const instant = amount * clamp(this.stat(`leech.${pool}.instant`), 0, 100) / 100;
    if (instant > 0) this.recover(pool, instant, { overflow: false });
    const speed = this.stat(`leech.${pool}.speed`) + (pool === 'life' ? this.missingLifePercent * this.stat('life.missing.leech_speed') : 0);
    const rate = max * this.base.leechRate / 100 * Math.max(0.01, 1 + speed / 100);
    // 偷取持续时间 +n%: the instance keeps recovering n% longer at the same rate.
    const left = (amount - instant) * Math.max(0, 1 + this.stat(`leech.${pool}.duration`) / 100);
    if (left > 0 && this.leech[pool].length < 200) this.leech[pool].push({ left, rate });
  }

  addRecoup(pool, amount, seconds) {
    if (!(amount > 0) || !(seconds > 0)) return;
    if (pool === 'life') seconds /= Math.max(0.1, 1 + this.stat('recoup.life.speed') / 100);
    if (this.recoups.length < 300) this.recoups.push({ pool, left: amount, rate: amount / seconds });
  }

  loseLife(amount) {
    if (this.dead || !(amount > 0)) return;
    this.life -= amount;
    this.totals.lifeLost += amount;
    this.flow.lifeLost += amount;
    if (this.life <= 0) this.onLethal();
  }

  onLethal() {
    const heal = this.triggers.find(t => t.name === 'cheat_death_heal' && t.cooldown <= 0);
    const keep = this.triggers.find(t => t.name === 'cheat_death_keep' && t.cooldown <= 0);
    const t = heal || keep;
    if (t) {
      t.cooldown = t.params.cooldown;
      this.life = heal ? Math.max(1, this.maxLife * t.params.percent / 100) : 1;
      this.deferred = [];
      ++this.totals.cheatedDeath;
      this.log(`${t.label}：免死`);
      this.emit('lethal');
      return;
    }
    this.life = 0;
    this.dead = true;
    this.log('死亡');
  }

  /**
   * Incoming damage row: {amount, element (name), dot, kind:{attack, spell, melee, projectile, area}, critical, attacker}.
   * Order: evade → block (partial) → armour → reductions → shield → life. Returns what happened;
   * evade / block / counters are also emitted as combat events for the runtime.
   */
  takeHit({ amount, element, dot = false, kind = null, critical = false, attacker = null }) {
    if (this.dead || !(amount > 0)) return { taken: 0 };
    const s = p => this.stat(p);
    const hit = !dot;
    const physical = element === 'physical';
    const elemental = ELEMENTAL.has(element);
    const spell = !!kind?.spell;
    let prevented = 0;
    let blocked = false;
    if (hit) {
      const evade = this.evadeChances(kind || {});
      if (this.chance(spell ? evade.spell : evade.attack)) {
        ++this.totals.evaded;
        this.evadeFail = 0;
        this.recover('life', s('life.on_evade'));
        this.recover('shield', s('shield.on_evade'));
        this.recover('mana', s('mana.on_evade'));
        this.onEvaded();
        this.emit('evade', { attacker });
        return { taken: 0, evaded: true };
      }
      if (!spell || s('evade.spell') > 0) for (const t of this.triggersNamed('evade_fail_bonus')) this.evadeFail = Math.min(evade.cap, this.evadeFail + t.params.n);
      const block = this.blockChances(kind || {});
      if (this.chance(spell ? block.spell : block.attack)) {
        blocked = true;
        ++this.totals.blocked;
        // Partial block: 70% (+ 格挡伤害减免) of the hit is stopped; crit extra and per-element parts can be reduced further.
        let taken = amount * (1 - clamp(70 + s('block.reduction'), 0, 100) / 100);
        if (critical) taken -= (taken - taken / 1.5) * clamp(s('block.taken_crit'), 0, 100) / 100;
        taken *= Math.max(0, 1 - (physical ? s('block.taken_physical') : elemental ? s('block.taken_elemental') : 0) / 100);
        const stopped = amount - taken;
        if (physical) this.preventedPhysical(stopped);
        this.recover('life', s('life.on_block') + this.maxLife * s('life.on_block_percent') / 100);
        this.recover('shield', s('shield.on_block') + this.maxShield * s('shield.on_block_percent') / 100 + this.armourValue() * s('shield.on_block_armour_percent') / 100);
        this.recover('mana', s('mana.on_block'));
        this.counterBank += stopped * s('block.to_counter') / 100;
        for (const t of this.triggersNamed('block_recoup_life')) this.addRecoup('life', stopped * t.params.n / 100, t.params.seconds);
        this.onBlocked();
        const stagger = 0.25 * Math.max(0, 1 - s('block.stagger') / 100) / Math.max(0.1, 1 + s('block.recovery') / 100);
        this.stunned = Math.max(this.stunned, stagger);
        this.emit('block', { attacker, stopped, overflow: block.overflow });
        amount = taken;
        if (!(amount > 0)) return { taken: 0, blocked: true };
      }
      this.recover('shield', this.evasionValue() * s('shield.on_hit_taken_evasion_percent') / 100);
      const armour = this.armourValue();
      if (physical && armour > 0) {
        const reduction = Math.min(this.base.armourCap / 100, armour / (armour + this.base.armourFactor * amount));
        prevented = amount * reduction;
        amount -= prevented;
        this.preventedPhysical(prevented);
      }
      // 被命中后，下一次命中的伤害 -n%
      if (this.afterHitReduction > 0) amount *= 1 - this.afterHitReduction / 100;
      this.afterHitReduction = clamp(s('defense.after_hit_reduction'), 0, 90);
      this.sinceHit = 0;
    }
    const reduction = (this.shield > 0 ? s('shield.any.damage_taken_reduction') : 0) + (this.isLowLife ? s('life.low.damage_taken_reduction') : 0)
      + (this.guard.left > 0 ? this.guard.reduction : 0) + s('buff.damage_taken_reduction');
    amount *= Math.max(0, 1 - clamp(reduction, -100, 100) / 100);

    // recharge interruption (grace window); the chance to restart it is rolled after the shield took the hit
    this.sinceDamaged = 0;
    if (this.recharging && this.grace <= 0) this.recharging = false;

    // shield absorbs first; part of the damage bypasses it (绕过护盾的伤害比例 -n 个百分点)
    const bypass = clamp(this.base.bypass - s('shield.bypass_reduction'), 0, 100) / 100;
    let toShield = amount * (1 - bypass);
    let toLife = amount * bypass;
    const hadShield = this.shield > 0;
    let shieldLost = 0;
    if (hadShield) {
      const taken = (dot ? s('shield.taken_dot_reduction') : 0) + (physical ? s('shield.taken_physical_reduction') : elemental ? s('shield.taken_elemental_reduction') : 0);
      const factor = Math.max(0.01, 1 - clamp(taken, 0, 99) / 100);
      const cost = toShield * factor;
      if (cost <= this.shield) { this.shield -= cost; shieldLost = cost; toShield = 0; } else {
        shieldLost = this.shield;
        toShield -= this.shield / factor;
        this.shield = 0;
      }
      this.totals.shieldLost += shieldLost;
    }
    toLife += toShield;
    if (hadShield && this.shield <= 0) {
      this.emit('shield_broken', { attacker });
      for (const t of this.triggers) {
        if (t.name !== 'cast_on_shield_broken' || t.cooldown > 0) continue;
        t.cooldown = t.params.cooldown;
        this.fire(t, 'cast');
      }
    }
    const deferredPct = clamp(s('life.deferred_percent'), 0, 100);
    const deferredSeconds = s('life.deferred_seconds');
    const later = deferredSeconds > 0 ? toLife * deferredPct / 100 : 0;
    if (later > 0) this.deferred.push({ left: later, rate: later / deferredSeconds });
    this.loseLife(toLife - later);
    if (!this.dead && this.chance(s('shield.recharge_on_damaged'))) this.startRecharge();

    // recoup: shield and life from hits (持续伤害不计入)
    const takenTotal = amount;
    if (hit) {
      this.addRecoup('shield', takenTotal * s('recoup.shield.percent') / 100, s('recoup.shield.seconds'));
      const pct = s('recoup.life.all') + (physical ? s('recoup.life.physical') : 0) + (elemental ? s('recoup.life.elemental') : 0);
      this.addRecoup('life', takenTotal * pct / 100, s('recoup.life.seconds'));
      if (amount >= this.stunThreshold * this.base.stunFraction && !this.dead) { this.stunned = this.base.stunSeconds; ++this.totals.stuns; }
      this.flow.hitTaken += takenTotal;
      this.emit('hit_taken', { attacker, critical, amount: takenTotal, blocked });
    }
    return { taken: takenTotal, shieldLost, lifeLost: toLife, prevented, blocked };
  }

  /** 闪避成功后的增益与“下一次”效果 (section 5.3). */
  onEvaded() {
    for (const t of this.triggersNamed('evade_buff_move')) this.addBuff('buff.move_speed', t.params.n, t.params.duration, 'evade_move');
    for (const t of this.triggersNamed('evade_buff_attack')) this.addBuff('buff.attack_speed', t.params.n, t.params.duration, 'evade_attack');
    for (const t of this.triggersNamed('evade_buff_cast')) this.addBuff('buff.cast_speed', t.params.n, t.params.duration, 'evade_cast');
    for (const t of this.triggersNamed('evade_next_attack_more')) this.next.attackMore = Math.max(this.next.attackMore, t.params.n);
    for (const t of this.triggersNamed('evade_next_attack_crit')) this.next.attackCrit = Math.max(this.next.attackCrit, t.params.n);
    for (const t of this.triggersNamed('evade_next_cost')) this.next.cost = Math.max(this.next.cost, t.params.n);
  }

  /** 格挡成功后的增益与“下一次”效果 (section 6.4). */
  onBlocked() {
    for (const t of this.triggersNamed('block_buff_damage')) this.addBuff('buff.damage', t.params.n, t.params.duration, 'block_damage');
    for (const t of this.triggersNamed('block_buff_armour')) this.addBuff('buff.armour', t.params.n, t.params.duration, 'block_armour');
    for (const t of this.triggersNamed('block_next_attack_more')) this.next.attackMore = Math.max(this.next.attackMore, t.params.n);
    for (const t of this.triggersNamed('block_next_cost')) this.next.cost = Math.max(this.next.cost, t.params.n);
  }

  preventedPhysical(amount) {
    this.totals.prevented += amount;
    this.addRecoup('shield', amount * this.stat('recoup.shield.prevented_physical_percent') / 100, this.stat('recoup.shield.prevented_physical_seconds'));
  }

  /** Multiplier for ailment magnitudes landing on this character (ailment threshold above max life). */
  get ailmentScale() { return clamp(this.maxLife / Math.max(1, this.ailmentThreshold), 0, 1); }

  /** Damage dealt by this character: {amount, element (name), critical, killed, dot}. */
  onDealt({ amount, element, critical = false, killed = false, dot = false }) {
    if (this.dead) return;
    const s = p => this.stat(p);
    if (!dot) {
      this.recover('life', s('life.on_hit'));
      this.recover('shield', s('shield.on_hit'));
      const physical = element === 'physical';
      const elemental = ELEMENTAL.has(element);
      for (const pool of ['life', 'shield']) {
        const pct = s(`leech.${pool}.all`) + (physical ? s(`leech.${pool}.physical`) : 0) + (elemental ? s(`leech.${pool}.elemental`) : 0);
        if (pct > 0) this.addLeech(pool, amount * pct / 100);
      }
    }
    if (critical) {
      this.recover('life', s('life.on_crit'));
      this.recover('shield', s('shield.on_crit'));
      if (this.chance(s('shield.recharge_on_crit'))) this.startRecharge();
    }
    if (killed) {
      this.recover('life', s('life.on_kill') + this.maxLife * s('life.on_kill_percent') / 100);
      this.recover('shield', s('shield.on_kill') + this.maxShield * s('shield.on_kill_percent') / 100);
      if (this.chance(s('shield.recharge_on_kill'))) this.startRecharge();
    }
  }

  /** Item use: flask_life triggers on the used item's traits start a life flask. */
  useItem(sources) {
    const s = p => this.stat(p);
    for (const source of sources) {
      for (const t of computeSheet([{ source }]).triggers) {
        if (t.name !== 'flask_life' || !(t.params.amount > 0)) continue;
        const total = t.params.amount * Math.max(0, 1 + s('flask.life.amount') / 100);
        const instant = total * clamp(s('flask.life.instant'), 0, 100) / 100;
        this.recover('life', instant);
        const seconds = Math.max(0.05, t.params.seconds / Math.max(0.1, 1 + s('flask.life.speed') / 100));
        if (total - instant > 0) this.flasks.push({ left: total - instant, rate: (total - instant) / seconds });
        this.log(`药剂：${Math.round(total)} 气血 / ${seconds.toFixed(1)}s`);
        this.emit('flask', { amount: total });
      }
    }
  }

  /**
   * Before a cast: pays the cost (mana / shield / life shares and the "消耗…" affixes) and returns
   * {ok, damageMore, areaIncreased, critBonus}; ok=false when the character cannot pay (no cast).
   * opts.kind 'attack' | 'spell' (下一次攻击…), opts.costScale: skill cost multiplier from combat affixes.
   */
  beforeCast(baseCost = this.base.castCost, opts = {}) {
    if (this.dead || this.stunned > 0) return { ok: false, reason: this.dead ? 'dead' : 'stunned' };
    const s = p => this.stat(p);
    baseCost *= Math.max(0, opts.costScale ?? 1) * Math.max(0, 1 - this.next.cost / 100);
    const shieldShare = clamp(s('cost.shield_percent'), 0, 100);
    const lifeShare = clamp(s('cost.life_percent'), 0, 100 - shieldShare);
    const shieldCost = baseCost * shieldShare / 100 * Math.max(0, 1 - s('cost.shield_reduction') / 100);
    const lifeCost = baseCost * lifeShare / 100 * Math.max(0, 1 - s('cost.life_reduction') / 100);
    const manaCost = baseCost * (100 - shieldShare - lifeShare) / 100;
    if (this.mana < manaCost - 1e-9 || this.shield < shieldCost - 1e-9 || this.life <= lifeCost) return { ok: false, reason: 'cost' };
    this.next.cost = 0;
    this.mana -= manaCost;
    this.shield -= shieldCost;
    this.life -= lifeCost;
    let spentShield = shieldCost;
    let spentLife = lifeCost;
    let damageMore = this.pendingEmpower;
    this.pendingEmpower = 0;
    let areaIncreased = 0;
    let critBonus = 0;
    if (opts.kind === 'attack') {
      damageMore += this.next.attackMore;
      critBonus += this.next.attackCrit;
      this.next.attackMore = 0;
      this.next.attackCrit = 0;
    }
    // 充能: one is spent per cast for +10% damage.
    if (this.charges > 0) { --this.charges; damageMore += 10; this.emit('charge_spent'); }
    const maxShieldCost = this.maxShield * s('cast.max_shield_cost_percent') / 100;
    if (maxShieldCost > 0 && this.shield >= maxShieldCost) { this.shield -= maxShieldCost; spentShield += maxShieldCost; damageMore += s('cast.max_shield_cost_damage'); }
    const currentLifeCost = this.life * s('cast.current_life_cost_percent') / 100;
    if (currentLifeCost > 0 && this.life - currentLifeCost >= 1) { this.life -= currentLifeCost; spentLife += currentLifeCost; damageMore += s('cast.current_life_cost_damage'); }
    const maxLifeCost = this.maxLife * s('cast.max_life_cost_percent') / 100;
    if (maxLifeCost > 0 && this.life - maxLifeCost >= 1) { this.life -= maxLifeCost; spentLife += maxLifeCost; areaIncreased += s('cast.max_life_cost_area'); }
    this.totals.shieldLost += spentShield;
    this.totals.lifeLost += spentLife;
    this.flow.manaSpent += manaCost;
    this.flow.lifeSpent += spentLife;
    this.flow.shieldSpent += spentShield;
    if (manaCost > 0) this.recover('life', manaCost * s('life.from_mana_spent_percent') / 100);
    this.recover('life', s('life.on_cast'));
    for (const t of this.triggers) {
      const spent = t.name === 'empower_on_shield_spent' ? spentShield : t.name === 'empower_on_life_spent' ? spentLife : 0;
      if (spent > 0 && t.params.per > 0) {
        t.acc += spent;
        while (t.acc >= t.params.per) { t.acc -= t.params.per; this.pendingEmpower += t.params.bonus; ++this.totals.triggers; }
      }
      if (t.name === 'empower_from_overflow' && this.overflow > 0) {
        this.shield -= this.overflow * clamp(t.params.percent, 0, 100) / 100;
        this.pendingEmpower += t.params.bonus;
        ++this.totals.triggers;
      }
    }
    return { ok: true, damageMore, areaIncreased, critBonus, manaCost, shieldCost: spentShield, lifeCost: spentLife };
  }

  /** Conditional offense right now (+ this cast's extras): increased/more per element, crit, flat on-hit, area. */
  offense({ damageMore = 0, areaIncreased = 0, critBonus = 0 } = {}) {
    const s = p => this.stat(p);
    let generic = this.missingShieldPercent * s('shield.missing.damage') + this.missingLifePercent * s('life.missing.damage')
      + this.maxShield * s('damage.per_shield') + this.maxLife * s('damage.per_life')
      + s('buff.damage') + this.blockChances({}).attack * s('block.damage_per_attack') + this.selfPoison.length * 4;
    if (this.isFullShield) generic += s('shield.full.damage');
    if (this.isFullLife) generic += s('life.full.damage');
    if (this.isLowLife) generic += s('life.low.damage');
    if (this.overflow > 0) generic += s('shield.overflow.damage');
    const out = { increased: {}, more: {}, flat: {}, critical: 0, area: areaIncreased + this.maxShield * s('area.per_shield') + this.maxLife * s('area.per_life') };
    for (const e of DAMAGE_ELEMENTS) {
      out.increased[e] = generic + s(`damage.increased.${e}`) + (ELEMENTAL.has(e) ? s('damage.increased.elemental') : 0);
      // 元素伤害额外提高 applies to fire / frost / lightning (void is true damage, not an element).
      out.more[e] = s(`damage.more.${e}`) * (1 + damageMore / 100) * (['fire', 'frost', 'lightning'].includes(e) ? s('damage.more.elemental') : 1);
      out.flat[e] = s(`damage.flat.${e}`) + this.maxShield * s(`damage.from_shield.${e}`) / 100 + this.maxLife * s(`damage.from_life.${e}`) / 100;
    }
    out.critical = (this.isFullShield ? s('shield.full.critical_chance') : 0) + (this.isFullLife ? s('life.full.critical_chance') : 0)
      + this.evasionValue() * s('evasion.crit_per') + critBonus;
    return out;
  }

  /** % added to the action rate right now. kind: 'attack' (近战) or 'spell'. */
  actionSpeed(kind = 'spell') {
    const s = p => this.stat(p);
    const attack = kind === 'attack';
    return (this.recharging ? s('shield.recharging.cast_speed') * (attack ? 0 : 1) : 0) + (this.leechingShield && attack ? s('shield.leeching.attack_speed') : 0)
      + (this.isLowLife ? (attack ? s('life.low.attack_speed') : s('life.low.cast_speed')) : 0)
      + (attack ? s('buff.attack_speed') + this.evasionValue() * s('evasion.attack_speed_per') : s('buff.cast_speed'));
  }

  /** % added to movement speed right now. */
  moveSpeed() {
    return (this.isFullShield ? this.stat('shield.full.move_speed') : 0) + (this.isFullLife ? this.stat('life.full.move_speed') : 0) + this.stat('buff.move_speed');
  }

  /** Rows for a character panel (UI). */
  panel() {
    const s = p => this.stat(p);
    const rows = [
      ['最大气血', this.maxLife], ['最大护盾', this.maxShield], ['最大魔力', this.maxMana],
      ['力量 / 敏捷 / 智力 / 体质', `${this.attributes.strength} / ${this.attributes.dexterity} / ${this.attributes.intelligence} / ${this.attributes.constitution}`],
      ['护盾回充', this.maxShield > 0 ? `${this.rechargeDelay.toFixed(2)}s 后 ${this.rechargeRate.toFixed(1)}/s` : '—'],
      ['低血阈值', `${this.lowLifeThreshold}%`],
      ['晕眩门槛', this.stunThreshold], ['异常门槛', this.ailmentThreshold],
    ];
    if (this.shieldCap > this.maxShield) rows.push(['护盾溢出上限', this.shieldCap]);
    const evade = this.evadeChances({}), block = this.blockChances({});
    if (block.attack || block.spell) rows.push(['格挡率 攻击 / 法术', `${Math.round(block.attack * 10) / 10}% / ${Math.round(block.spell * 10) / 10}%`]);
    if (evade.attack || evade.spell) rows.push(['闪避率 攻击 / 法术', `${Math.round(evade.attack * 10) / 10}% / ${Math.round(evade.spell * 10) / 10}%`]);
    if (this.armourValue()) rows.push(['护甲', this.armourValue()]);
    if (this.evasionValue()) rows.push(['闪避值', this.evasionValue()]);
    if (this.charges) rows.push(['充能', this.charges]);
    const leech = ['life', 'shield'].map(p => s(`leech.${p}.all`) + s(`leech.${p}.physical`) + s(`leech.${p}.elemental`));
    if (leech[0]) rows.push(['气血偷取', `${leech[0]}%`]);
    if (leech[1]) rows.push(['护盾偷取', `${leech[1]}%`]);
    return rows.map(([name, value]) => ({ name, value: typeof value === 'number' ? Math.round(value * 10) / 10 : value }));
  }
}

// ---------------------------------------------------------------- offense -> synthetic trait
const round = (v, step = 0.1) => Math.round(v / step) * step;
const traitCache = new Map();

/**
 * Synthetic "__character" trait for one cast. baseStats: StatBlock of the plan it is merged into
 * (element damage_percent is pinned so increased adds to it and more multiplies the total).
 * Returns null when there is nothing to add.
 */
export function offenseSource(off, baseStats, hitEvents = ['hit']) {
  const params = {};
  const modifiers = [];
  const rules = [];
  for (const e of DAMAGE_ELEMENTS) {
    const element = ELEMENT_NAMES.indexOf(e);
    const inc = off.increased[e] || 0;
    const more = off.more[e] ?? 1;
    if (Math.abs(inc) > 1e-6 || Math.abs(more - 1) > 1e-6) {
      const current = baseStats.get(elementStatId(element, EElementStat.DamagePercent));
      const target = round(((1 + (current + inc) / 100) * more - 1) * 100);
      if (Math.abs(target - current) > 1e-6) {
        params[`pin_${e}`] = Math.max(-100, target);
        for (const op of ['min', 'max']) modifiers.push({ target: 'element', element: e, stat: 'damage_percent', op, value: { param: `pin_${e}` } });
      }
    }
    const flat = round(off.flat[e] || 0);
    if (flat > 0) {
      params[`flat_${e}`] = flat;
      for (const [i, event] of hitEvents.entries()) rules.push({ id: `character_${e}_on_hit${i ? `_${i}` : ''}`, event, actions: [{ op: 'damage_target', element: e, tags: ELEMENT_TAGS[e], emitEvent: `character_${e}_hit`, amount: { param: `flat_${e}` } }] });
    }
  }
  if (Math.abs(off.critical) > 1e-6) {
    params.critical = round(off.critical);
    modifiers.push({ target: 'owner', stat: 'critical_chance', op: 'add', value: { param: 'critical' } });
  }
  if (Math.abs(off.area) > 1e-6) {
    params.area = round(off.area);
    modifiers.push({ target: 'area', stat: 'radius', op: 'multiply_percent', value: { param: 'area' } });
    modifiers.push({ target: 'explosion', stat: 'radius', op: 'multiply_percent', value: { param: 'area' } });
  }
  if (!modifiers.length && !rules.length) return null;
  const key = JSON.stringify([params, hitEvents]);
  if (traitCache.has(key)) return traitCache.get(key);
  const id = hitEvents.length === 1 && hitEvents[0] === 'hit' ? '__character' : `__character_${hitEvents.join('_')}`;
  const { trait, error } = readTraitText(JSON.stringify({ id, params, modifiers, rules }));
  if (!trait) throw new Error(`character offense trait: ${error}`);
  if (traitCache.size > 2000) traitCache.clear();
  traitCache.set(key, trait);
  return trait;
}

// ---------------------------------------------------------------- headless scenario (editor preview, tests)
/**
 * Fixed fight without the rule world: incoming hits on a cadence, outgoing casts with hits/kills.
 * opts: {seconds, incoming:{every, amount, elements}, casts:{perSecond, hits, amount, critChance, killEvery}, moving}
 */
export function simulateCharacter(entries, opts = {}) {
  const { seconds = 20, dt = 0.05 } = opts;
  const incoming = { every: 0.5, amount: 40, elements: ['physical', 'fire', 'frost', 'lightning'], dotPerSecond: 0, ...(opts.incoming || {}) };
  const casts = { perSecond: 2, hits: 2, amount: 30, critChance: 20, killEvery: 1.5, ...(opts.casts || {}) };
  const ch = new Character({ seed: opts.seed || 5 });
  ch.setSheet(entries);
  ch.reset();
  const samples = [];
  let nextHit = incoming.every, nextCast = 0, nextKill = casts.killEvery, hitIndex = 0, castsDone = 0, castsFailed = 0, offenseSum = 0;
  let diedAt = null;
  for (let t = 0; t <= seconds + 1e-9; t += dt) {
    ch.tick(dt, { moving: !!opts.moving });
    if (incoming.dotPerSecond > 0) ch.takeHit({ amount: incoming.dotPerSecond * dt, element: 'fire', dot: true });
    if (t >= nextHit) {
      nextHit += incoming.every;
      ch.takeHit({ amount: incoming.amount, element: incoming.elements[hitIndex++ % incoming.elements.length] });
    }
    const rate = casts.perSecond * Math.max(0.1, 1 + ch.actionSpeed() / 100);
    if (t >= nextCast && casts.perSecond > 0) {
      nextCast += 1 / rate;
      const pay = ch.beforeCast();
      if (pay.ok) {
        ++castsDone;
        const off = ch.offense(pay);
        const factor = (1 + off.increased.frost / 100) * off.more.frost;
        offenseSum += factor;
        for (let i = 0; i < casts.hits; ++i) {
          const critical = ch.random() * 100 < casts.critChance + off.critical;
          const amount = (casts.amount + off.flat.frost) * factor * (critical ? 1.5 : 1);
          const killed = t >= nextKill;
          if (killed) nextKill += casts.killEvery;
          ch.onDealt({ amount, element: 'frost', critical, killed });
        }
      } else ++castsFailed;
    }
    if (ch.dead && diedAt === null) diedAt = t;
    if (samples.length === 0 || t - samples[samples.length - 1].t >= 0.25 - 1e-9) {
      samples.push({ t: Math.round(t * 100) / 100, life: ch.life, shield: ch.shield, mana: ch.mana });
    }
    if (ch.dead) break;
  }
  return {
    samples, diedAt, castsDone, castsFailed, averageDamageFactor: castsDone ? offenseSum / castsDone : 1,
    maxLife: ch.maxLife, maxShield: ch.maxShield, shieldCap: ch.shieldCap, maxMana: ch.maxMana,
    totals: ch.totals, pendingCasts: ch.pendingCasts.length, pendingGrants: ch.pendingGrants.length, panel: ch.panel(), events: ch.events.slice(0, 10),
  };
}
