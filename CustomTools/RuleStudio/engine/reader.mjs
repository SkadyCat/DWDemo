// Authoring-side program model (mirror of DWRuleProgram.h) and the JSON reader
// (mirror of DWRules/Private/DWRuleProgramReader.cpp). Unknown fields and unsupported
// operators are errors with the same paths/messages as the native reader.
import { EScope, ECompare, EModOp, EOp, ELayout, EOrigin, ERedirect, MaxActionDepth, parseElement, COMPARE_NAMES } from './types.mjs';

// ---- source model ----
export const Expr = Object.freeze({
  number: value => ({ kind: 'const', value: Number(value) }),
  param: name => ({ kind: 'param', name }),
  event: field => ({ kind: 'event', name: field }),
  stat: name => ({ kind: 'stat', name }),
  state: (name, scope = EScope.Owner, channel = '') => ({ kind: 'state', name, scope, channel }),
  arith: (kind, args) => ({ kind, args }),
});

export const newModifier = (stat, op = EModOp.Add, value = Expr.number(0)) => ({ stat, op, value });
export const newCondition = () => ({ op: '', tag: '', key: '', kind: '', channel: '', scope: EScope.Owner, compare: ECompare.Gte, value: Expr.number(0) });
export const newAction = (op = EOp.EmitEvent) => ({
  op, numbers: new Map(), kind: '', event: '', emitEvent: '', endEvent: '', key: '', channel: '',
  scope: EScope.Owner, layout: ELayout.Fan, origin: EOrigin.Event, mode: ERedirect.Ricochet, element: -1,
  inherit: true, consumeAll: false, trajectory: 'linear', offset: null, scatter: null, aim: 'event', targeting: 'nearest', tags: [], then: [],
  // grant_traits: {stitched:true} = the traits stitched into this trait where it is used
  // (collection entry "with"); otherwise a fixed list {entries:[{id, params}]}.
  grant: null,
});
export const newRule = () => ({ id: '', event: '', conditions: [], actions: [], maxDepth: 2, maxEvents: 0, channel: '' });
export const newTrait = (id = '') => ({ id, parentId: '', params: new Map(), modifiers: [], rules: [] });
export const newBuild = (activeId = '', traits = []) => ({ activeId, traits });

// ---- reader ----
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const listOf = v => (Array.isArray(v) ? v : []);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

class Reader {
  constructor() { this.error = ''; }

  fail(path, message) {
    if (!this.error) this.error = `${path}: ${message}`;
    return false;
  }

  closed(object, allowed, path) {
    for (const key of Object.keys(object)) if (!allowed.includes(key)) return this.fail(path, `unknown field ${key}`);
    return true;
  }

  static string(object, field) {
    const v = object[field];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  readScope(text, out, path) {
    text = text.toLowerCase();
    if (!text || text === 'owner') { out.scope = EScope.Owner; return true; }
    if (text === 'target') { out.scope = EScope.Target; return true; }
    if (text === 'cast') { out.scope = EScope.Cast; return true; }
    return this.fail(path, 'scope must be owner/target/cast');
  }

  readCompare(text, out, path) {
    const index = COMPARE_NAMES.indexOf(text.toLowerCase());
    if (index >= 0) { out.compare = index; return true; }
    return this.fail(path, 'compare must be eq/ne/gt/gte/lt/lte');
  }

  expr(value, path) {
    if (value === undefined) { this.fail(path, 'missing value'); return null; }
    if (typeof value === 'number') return Expr.number(value);
    if (!isObject(value)) { this.fail(path, 'expected number or expression'); return null; }
    for (const op of ['mul', 'add', 'div', 'min', 'max', 'pow', 'random', 'random_int']) {
      if (!has(value, op)) continue;
      const args = [];
      const list = listOf(value[op]);
      for (let i = 0; i < list.length; ++i) {
        const term = this.expr(list[i], `${path}.${op}[${i}]`);
        if (!term) return null;
        args.push(term);
      }
      return Expr.arith(op, args);
    }
    if (has(value, 'param')) return Expr.param(Reader.string(value, 'param'));
    if (has(value, 'event')) return Expr.event(Reader.string(value, 'event'));
    if (has(value, 'stat')) return Expr.stat(Reader.string(value, 'stat'));
    if (has(value, 'state')) {
      const out = Expr.state(Reader.string(value, 'state'), EScope.Owner, Reader.string(value, 'channel'));
      return this.readScope(Reader.string(value, 'scope'), out, path) ? out : null;
    }
    this.fail(path, 'unknown expression');
    return null;
  }

  readModifier(object, path) {
    if (!this.closed(object, ['target', 'stat', 'op', 'value', 'element', 'scope', 'filter'], path)) return null;
    const target = Reader.string(object, 'target');
    const isElement = target.toLowerCase() === 'element';
    const stat = Reader.string(object, 'stat');
    const out = newModifier(isElement ? `element.${Reader.string(object, 'element')}.${stat}` : `${target}.${stat}`);
    const op = Reader.string(object, 'op').toLowerCase();
    const ops = { add: EModOp.Add, multiply: EModOp.Multiply, set: EModOp.Set, multiply_percent: EModOp.IncreasedPercent, reduce_percent: EModOp.ReducedPercent, min: EModOp.Min, max: EModOp.Max };
    if (!has(ops, op)) { this.fail(path, `unknown modifier op ${op}`); return null; }
    out.op = ops[op];
    if (typeof object.value === 'string') { this.fail(path, 'enumerated modifiers (layout/emission_mode) are not supported yet'); return null; }
    out.value = this.expr(object.value, path + '.value');
    return out.value ? out : null;
  }

  readCondition(object, path) {
    if (!this.closed(object, ['op', 'tag', 'key', 'kind', 'channel', 'scope', 'compare', 'value', 'max', 'probability'], path)) return null;
    const out = newCondition();
    out.op = Reader.string(object, 'op').toLowerCase();
    out.tag = Reader.string(object, 'tag');
    out.key = Reader.string(object, 'key');
    out.kind = Reader.string(object, 'kind');
    out.channel = Reader.string(object, 'channel');
    if (!this.readScope(Reader.string(object, 'scope'), out, path)) return null;
    if (has(object, 'compare') && !this.readCompare(Reader.string(object, 'compare'), out, path)) return null;
    for (const field of ['value', 'max', 'probability']) {
      if (has(object, field)) {
        out.value = this.expr(object[field], `${path}.${field}`);
        return out.value ? out : null;
      }
    }
    return out;
  }

  readOp(text, out, path) {
    const ops = { emit: EOp.Emit, copy: EOp.Copy, damage_area: EOp.DamageArea, damage_target: EOp.DamageTarget, counter: EOp.Counter,
      accumulate: EOp.Accumulate, consume: EOp.Consume, emit_event: EOp.EmitEvent, redirect: EOp.Redirect, apply_status: EOp.ApplyStatus,
      grant_traits: EOp.GrantTraits, summon: EOp.Summon, storm: EOp.Storm, sacrifice: EOp.Sacrifice,
      consume_status: EOp.ConsumeStatus, repeat_skill: EOp.RepeatSkill, maintain_emitter: EOp.MaintainEmitter, spawn_monster: EOp.SpawnMonster, multiply_damage: EOp.MultiplyDamage };
    if (has(ops, text.toLowerCase())) { out.op = ops[text.toLowerCase()]; return true; }
    return this.fail(path, `operator ${text} is not implemented in the native runtime yet`);
  }

  // "traits": "stitched" | [ "id" | {"id", "params":{name:number}} ]
  readGrant(value, path) {
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'stitched') return { stitched: true, entries: [] };
      this.fail(path, 'traits must be "stitched" or a list of trait ids');
      return null;
    }
    if (!Array.isArray(value) || value.length === 0) { this.fail(path, 'grant_traits needs traits'); return null; }
    const entries = [];
    for (let i = 0; i < value.length; ++i) {
      const item = value[i];
      if (typeof item === 'string' && item) { entries.push({ id: item, params: {} }); continue; }
      if (!isObject(item) || typeof item.id !== 'string' || !item.id) { this.fail(`${path}[${i}]`, 'expected trait id or {id, params}'); return null; }
      if (!this.closed(item, ['id', 'params'], `${path}[${i}]`)) return null;
      const params = {};
      for (const [key, number] of Object.entries(isObject(item.params) ? item.params : {})) {
        if (typeof number !== 'number' || !Number.isFinite(number)) { this.fail(`${path}[${i}].params.${key}`, 'expected number'); return null; }
        params[key] = number;
      }
      entries.push({ id: item.id, params });
    }
    return { stitched: false, entries };
  }

  readAction(object, path, depth) {
    if (depth > MaxActionDepth) { this.fail(path, 'nesting exceeds 12'); return null; }
    const grant = Reader.string(object, 'op').toLowerCase() === 'grant_traits';
    if (!this.closed(object, ['op', 'count', 'spread', 'speed', 'lifetime', 'damage', 'radius', 'amount', 'cap', 'threshold', 'pierce', 'duration', 'interval', 'value', 'trajectory', 'arc_height', 'invulnerable',
      'kind', 'event', 'emitEvent', 'endEvent', 'key', 'channel', 'scope', 'layout', 'origin', 'offset', 'scatter', 'aim', 'targeting', 'decay_interval', 'rate', 'mode', 'inheritance', 'element', 'tags', 'then', ...(grant ? ['traits'] : [])], path)) return null;
    const out = newAction();
    if (!this.readOp(Reader.string(object, 'op'), out, path)) return null;
    if (grant) {
      out.grant = this.readGrant(object.traits, path + '.traits');
      if (!out.grant) return null;
    }
    if (has(object, 'invulnerable')) {
      if (out.op !== EOp.SpawnMonster || typeof object.invulnerable !== 'boolean') { this.fail(path + '.invulnerable', 'spawn_monster invulnerable must be boolean'); return null; }
      out.invulnerable = object.invulnerable;
    }
    const trajectory = Reader.string(object, 'trajectory').toLowerCase() || 'linear';
    if (!['linear', 'parabolic'].includes(trajectory)) { this.fail(path + '.trajectory', 'expected linear or parabolic'); return null; }
    if ((has(object, 'trajectory') || has(object, 'arc_height')) && out.op !== EOp.Emit) { this.fail(path, 'trajectory / arc_height only apply to emit'); return null; }
    if (has(object, 'arc_height') && trajectory !== 'parabolic') { this.fail(path, 'arc_height requires parabolic trajectory'); return null; }
    out.trajectory = trajectory;
    if (has(object, 'aim')) {
      const aim = Reader.string(object, 'aim').toLowerCase();
      if (out.op !== EOp.Emit || !['event', 'target'].includes(aim)) { this.fail(path + '.aim', 'emit aim must be event or target'); return null; }
      out.aim = aim;
    }
    if (has(object, 'targeting')) {
      const targeting = Reader.string(object, 'targeting').toLowerCase();
      if (out.op !== EOp.MaintainEmitter || !['nearest', 'random', 'aim'].includes(targeting)) { this.fail(path + '.targeting', 'maintain_emitter targeting must be nearest/random/aim'); return null; }
      out.targeting = targeting;
    }
    if (has(object, 'decay_interval')) {
      if (out.op !== EOp.MaintainEmitter) { this.fail(path + '.decay_interval', 'only applies to maintain_emitter'); return null; }
      const decay = this.expr(object.decay_interval, path + '.decay_interval'); if (!decay) return null;
      out.numbers.set('decay_interval', decay);
    }
    if (has(object, 'rate')) {
      if (out.op !== EOp.MaintainEmitter || has(object, 'interval')) { this.fail(path + '.rate', 'maintain_emitter rate and interval are mutually exclusive'); return null; }
      const rate = this.expr(object.rate, path + '.rate'); if (!rate) return null;
      out.numbers.set('rate', rate);
    }
    for (const field of ['offset', 'scatter']) if (has(object, field)) {
      if (out.op !== EOp.Emit || !isObject(object[field])) { this.fail(path + '.' + field, `emit ${field} must be an object`); return null; }
      if (field === 'scatter' && has(object[field], 'shape')) {
        if (!this.closed(object[field], ['shape', 'radius', 'distribution'], path + '.' + field)) return null;
        if (object[field].shape !== 'hemisphere' || !has(object[field], 'radius')) { this.fail(path + '.' + field, 'hemisphere scatter requires shape hemisphere and radius'); return null; }
        const radius = this.expr(object[field].radius, path + '.' + field + '.radius'); if (!radius) return null;
        if (has(object[field], 'distribution') && !['even', 'random'].includes(object[field].distribution)) { this.fail(path + '.' + field + '.distribution', 'must be even or random'); return null; }
        out[field] = { shape: 'hemisphere', radius, ...(has(object[field], 'distribution') ? { distribution: object[field].distribution } : {}) }; continue;
      }
      if (!this.closed(object[field], ['forward', 'left', 'up'], path + '.' + field)) return null;
      out[field] = {};
      for (const axis of ['forward', 'left', 'up']) {
        if (!has(object[field], axis)) continue;
        const value = this.expr(object[field][axis], `${path}.${field}.${axis}`);
        if (!value) return null;
        out[field][axis] = value;
      }
    }
    for (const field of ['count', 'spread', 'speed', 'lifetime', 'damage', 'radius', 'amount', 'cap', 'threshold', 'pierce', 'duration', 'interval', 'arc_height']) {
      if (!has(object, field)) continue;
      const number = this.expr(object[field], `${path}.${field}`);
      if (!number) return null;
      out.numbers.set(field, number);
    }
    if (has(object, 'value')) {
      if (typeof object.value === 'string' && object.value.toLowerCase() === 'all') out.consumeAll = true;
      else {
        const number = this.expr(object.value, path + '.value');
        if (!number) return null;
        out.numbers.set('value', number);
      }
    }
    out.kind = Reader.string(object, 'kind');
    out.event = Reader.string(object, 'event');
    out.emitEvent = Reader.string(object, 'emitEvent');
    out.endEvent = Reader.string(object, 'endEvent');
    out.key = Reader.string(object, 'key');
    out.channel = Reader.string(object, 'channel');
    if (!this.readScope(Reader.string(object, 'scope'), out, path)) return null;
    const layout = Reader.string(object, 'layout').toLowerCase();
    out.layout = layout === 'radial' ? ELayout.Radial : layout === 'point' ? ELayout.Point : ELayout.Fan;
    const origin = Reader.string(object, 'origin').toLowerCase();
    out.origin = origin === 'owner' ? EOrigin.Owner : origin === 'source' ? EOrigin.Source : origin === 'target' ? EOrigin.Target : EOrigin.Event;
    const mode = Reader.string(object, 'mode').toLowerCase();
    if (out.op === EOp.MaintainEmitter && mode) {
      if (!['maintain', 'feed'].includes(mode)) { this.fail(path + '.mode', 'maintain_emitter mode must be maintain/feed'); return null; }
      out.mode = mode === 'feed' ? 1 : 0;
    }
    if (out.op === EOp.Redirect) {
      if (mode === 'ricochet') out.mode = ERedirect.Ricochet;
      else if (mode === 'reflect') out.mode = ERedirect.Reflect;
      else if (mode === 'return') out.mode = ERedirect.Return;
      else { this.fail(path, `redirect mode ${mode} is not implemented yet`); return null; }
    }
    out.inherit = Reader.string(object, 'inheritance').toLowerCase() !== 'explicit';
    const element = Reader.string(object, 'element');
    if (element) {
      const parsed = parseElement(element);
      if (parsed < 0) { this.fail(path, `unknown element ${element}`); return null; }
      out.element = parsed;
    }
    for (const tag of listOf(object.tags)) out.tags.push(String(tag));
    if (has(object, 'then')) return this.readActions(object.then, out.then, path + '.then', depth + 1) ? out : null;
    return out;
  }

  readActions(list, out, path, depth) {
    const items = listOf(list);
    for (let i = 0; i < items.length; ++i) {
      const itemPath = `${path}[${i}]`;
      if (!isObject(items[i])) return this.fail(itemPath, 'expected action object');
      const item = this.readAction(items[i], itemPath, depth);
      if (!item) return false;
      out.push(item);
    }
    return true;
  }

  readRule(object, path) {
    if (!this.closed(object, ['id', 'event', 'conditions', 'actions', 'chain'], path)) return null;
    const out = newRule();
    out.id = Reader.string(object, 'id');
    out.event = Reader.string(object, 'event');
    if (isObject(object.chain)) {
      // TryGetNumberField: only numeric JSON values are taken.
      if (typeof object.chain.maxDepth === 'number') out.maxDepth = Math.trunc(object.chain.maxDepth);
      if (typeof object.chain.maxEvents === 'number') out.maxEvents = Math.trunc(object.chain.maxEvents);
      out.channel = Reader.string(object.chain, 'channel');
    }
    const conditions = listOf(object.conditions);
    for (let i = 0; i < conditions.length; ++i) {
      const condPath = `${path}.conditions[${i}]`;
      if (!isObject(conditions[i])) { this.fail(condPath, 'expected condition object'); return null; }
      const condition = this.readCondition(conditions[i], condPath);
      if (!condition) return null;
      out.conditions.push(condition);
    }
    if (!has(object, 'actions')) { this.fail(path, 'rule needs actions'); return null; }
    return this.readActions(object.actions, out.actions, path + '.actions', 0) ? out : null;
  }

  readProgram(root, trait) {
    const modifiers = listOf(root.modifiers);
    for (let i = 0; i < modifiers.length; ++i) {
      const path = `${trait.id}.modifiers[${i}]`;
      if (!isObject(modifiers[i])) return this.fail(path, 'expected modifier object');
      const modifier = this.readModifier(modifiers[i], path);
      if (!modifier) return false;
      trait.modifiers.push(modifier);
    }
    const rules = listOf(root.rules);
    for (let i = 0; i < rules.length; ++i) {
      const path = `${trait.id}.rules[${i}]`;
      if (!isObject(rules[i])) return this.fail(path, 'expected rule object');
      const rule = this.readRule(rules[i], path);
      if (!rule) return false;
      trait.rules.push(rule);
    }
    return true;
  }
}

function parse(text) {
  try {
    const value = JSON.parse(String(text).replace(/^\uFEFF/, ''));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** {"modifiers":[...],"rules":[...]} into an existing trait (id/params already set). Returns {ok, error}. */
export function readProgramText(json, trait) {
  const root = parse(json);
  if (!root) return { ok: false, error: `${trait.id}: program is not valid JSON` };
  const reader = new Reader();
  if (!reader.closed(root, ['modifiers', 'rules'], trait.id) || !reader.readProgram(root, trait)) return { ok: false, error: reader.error };
  return { ok: true, error: '' };
}

/** Whole trait file. Returns {trait, displayName, description, error}. */
export function readTraitText(json) {
  const root = parse(json);
  if (!root) return { trait: null, error: 'trait file is not valid JSON' };
  const reader = new Reader();
  if (!reader.closed(root, ['id', 'parent', 'name', 'description', 'params', 'modifiers', 'rules', 'sheet'], 'trait')) return { trait: null, error: reader.error };
  const trait = newTrait(Reader.string(root, 'id'));
  if (!trait.id) return { trait: null, error: 'trait needs id' };
  trait.parentId = Reader.string(root, 'parent');
  if (isObject(root.params)) {
    for (const [key, value] of Object.entries(root.params)) {
      if (typeof value !== 'number') return { trait: null, error: `${trait.id}.params.${key} must be a number` };
      trait.params.set(key, value);
    }
  }
  // "sheet": character-sheet entries (web-only, engine/character.mjs validates them). Kept raw here.
  if (has(root, 'sheet')) {
    if (!Array.isArray(root.sheet) || root.sheet.some(entry => !isObject(entry))) return { trait: null, error: `${trait.id}.sheet must be a list of objects` };
    trait.sheet = root.sheet;
  }
  if (!reader.readProgram(root, trait)) return { trait: null, error: reader.error };
  return { trait, displayName: Reader.string(root, 'name'), description: Reader.string(root, 'description'), error: '' };
}

/** Skill file {"id","name","active","traits":[ids]}. Returns {build, error}. */
export function readBuildText(json) {
  const root = parse(json);
  if (!root) return { build: null, error: 'build file is not valid JSON' };
  const reader = new Reader();
  if (!reader.closed(root, ['id', 'name', 'description', 'active', 'traits'], 'build')) return { build: null, error: reader.error };
  const build = { id: Reader.string(root, 'id'), displayName: Reader.string(root, 'name'), description: Reader.string(root, 'description'), activeId: '', traits: [] };
  for (const id of listOf(root.traits)) build.traits.push(String(id));
  build.activeId = Reader.string(root, 'active');
  if (!build.activeId && build.traits.length > 0) build.activeId = build.traits[0];
  if (!build.id || !build.activeId) return { build: null, error: 'build needs id and at least one trait' };
  return { build, error: '' };
}
