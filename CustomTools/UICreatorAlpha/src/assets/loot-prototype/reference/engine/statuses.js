// Status definition files (Content/Rules/Statuses/<id>.json). Mirror of
// FDWRuleProgramReader::ReadStatusText; same closed fields and error messages.
//   { "id", "name", "description", "category": ailment|debuff|buff,
//     "stacking": strongest|refresh|stack, "maxStacks", "cap",
//     "effects": [ { "type", "scale", "element", "interval", "control" } ],
//     "traits": [ids] }   traits the holder has while the status is live (timed buffs, debuffs,
//                         temporary states). Casts of the holder and its defenses include them.
import {
  f, EStatusEffect, STATUS_EFFECT_NAMES, EStacking, STACKING_NAMES, EControl, CONTROL_NAMES, STATUS_CATEGORIES,
  MaxStatusStacks, MinTickInterval, parseElement, statusKey, statusHash,
} from './types.js';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const STATUS_FIELDS = ['id', 'name', 'description', 'category', 'stacking', 'maxStacks', 'cap', 'effects', 'traits'];
const EFFECT_FIELDS = ['type', 'scale', 'element', 'interval', 'control'];

export function newStatusDef(id = '') {
  return {
    id, key: statusKey(id), hash: statusHash(id), stacking: EStacking.Strongest, maxStacks: 1, cap: 0,
    effects: [], traits: [], tickInterval: 0, tickElement: -1, control: EControl.None,
  };
}

const str = (object, field) => (typeof object[field] === 'string' ? object[field] : typeof object[field] === 'number' ? String(object[field]) : '');

/** Returns {def, displayName, description, category, error}. */
export function readStatusText(json) {
  let root;
  try { root = JSON.parse(String(json).replace(/^\uFEFF/, '')); } catch { root = null; }
  if (!isObject(root)) return { def: null, error: 'status file is not valid JSON' };
  const fail = error => ({ def: null, error });
  for (const key of Object.keys(root)) if (!STATUS_FIELDS.includes(key)) return fail(`status: unknown field ${key}`);
  const id = str(root, 'id');
  if (!id) return fail('status needs id');
  const def = newStatusDef(id);
  const category = (str(root, 'category') || 'debuff').toLowerCase();
  if (!STATUS_CATEGORIES.includes(category)) return fail(`${id}: category must be ailment/debuff/buff`);
  const stacking = (str(root, 'stacking') || 'strongest').toLowerCase();
  if (!STACKING_NAMES.includes(stacking)) return fail(`${id}: stacking must be strongest/refresh/stack`);
  def.stacking = STACKING_NAMES.indexOf(stacking);
  if (has(root, 'maxStacks')) {
    const n = root.maxStacks;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MaxStatusStacks) return fail(`${id}: maxStacks must be an integer 1-${MaxStatusStacks}`);
    def.maxStacks = n;
  }
  if (has(root, 'cap')) {
    if (typeof root.cap !== 'number' || !(root.cap >= 0) || !Number.isFinite(root.cap)) return fail(`${id}: cap must be a number >= 0`);
    def.cap = f(root.cap);
  }
  if (has(root, 'effects') && !Array.isArray(root.effects)) return fail(`${id}: effects must be a list`);
  const effects = root.effects || [];
  for (let i = 0; i < effects.length; ++i) {
    const path = `${id}.effects[${i}]`;
    const e = effects[i];
    if (!isObject(e)) return fail(`${path}: expected effect object`);
    for (const key of Object.keys(e)) if (!EFFECT_FIELDS.includes(key)) return fail(`${path}: unknown field ${key}`);
    const type = STATUS_EFFECT_NAMES.indexOf(str(e, 'type').toLowerCase());
    if (type < 0) return fail(`${path}: unknown effect type ${str(e, 'type')}`);
    const effect = { type, scale: 1, element: -1, interval: 0, control: EControl.None };
    if (has(e, 'scale')) {
      if (typeof e.scale !== 'number' || !Number.isFinite(e.scale)) return fail(`${path}: scale must be a number`);
      effect.scale = f(e.scale);
    }
    if (type === EStatusEffect.DamageOverTime) {
      if (def.tickInterval > 0) return fail(`${path}: only one damage_over_time effect per status`);
      const element = parseElement(str(e, 'element'));
      if (element < 0) return fail(`${path}: damage_over_time needs a valid element`);
      let interval = 0.5;
      if (has(e, 'interval')) {
        if (typeof e.interval !== 'number' || !(e.interval >= MinTickInterval) || !Number.isFinite(e.interval)) return fail(`${path}: interval must be >= ${MinTickInterval}`);
        interval = e.interval;
      }
      effect.element = element;
      effect.interval = f(interval);
      def.tickInterval = effect.interval;
      def.tickElement = element;
    } else if (has(e, 'element') || has(e, 'interval')) {
      return fail(`${path}: element/interval only apply to damage_over_time`);
    }
    if (type === EStatusEffect.Control) {
      const control = CONTROL_NAMES.indexOf(str(e, 'control').toLowerCase());
      if (control <= 0) return fail(`${path}: control must be freeze/stun`);
      effect.control = control;
      def.control = Math.max(def.control, control);
    } else if (has(e, 'control')) {
      return fail(`${path}: control only applies to type control`);
    }
    def.effects.push(effect);
  }
  if (has(root, 'traits')) {
    if (!Array.isArray(root.traits) || root.traits.some(t => typeof t !== 'string' || !t)) return fail(`${id}: traits must be a list of trait ids`);
    def.traits = [...new Set(root.traits)];
  }
  return { def, displayName: str(root, 'name'), description: str(root, 'description'), category, error: '' };
}

/** Stable order shared with the native runtime: ascending native key. */
export const sortStatusDefs = defs => [...defs].sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
