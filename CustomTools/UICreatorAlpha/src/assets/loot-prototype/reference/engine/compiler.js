// Mirror of DWRuleCompiler.cpp + DWRulePlan.h: composes a build (parent closure), folds
// parameters/stats into constants, pre-aggregates modifiers and flattens rule trees into
// an immutable plan with the same layout as FDWCompiledPlan.
import {
  f, FLT_MAX, EBuiltinEvent, BUILTIN_EVENT_NAMES, BUILTIN_TAG_NAMES, Tags, MaxTags, MaxChannels, MaxExprStack, MaxActionDepth,
  ECond, ECompare, EOp, U16_MAX, tagBit, hashName, statusKey, clamp,
} from './types.js';
import { StatBlock, findStat } from './stats.js';

export const EExprOp = Object.freeze({ Const: 0, EventAmount: 1, EventDamage: 2, EventStored: 3, EventGeneration: 4, EventSequence: 5, State: 6, Mul: 7, Add: 8, Div: 9, Min: 10, Max: 11, Pow: 12 });
export const EXPR_OP_NAMES = Object.freeze(['const', 'event.amount', 'event.damage', 'event.stored_value', 'event.generation', 'event.sequence', 'state', 'mul', 'add', 'div', 'min', 'max', 'pow']);

export const ESlot = Object.freeze({ Count: 0, Spread: 1, Speed: 2, Lifetime: 3, Damage: 4, Radius: 5, Amount: 6, Value: 7, Cap: 8, Threshold: 9, Pierce: 10, Duration: 11, Interval: 12, ArcHeight: 13, SpawnHeight: 14, ScatterRadius: 15, Gravity: 16, Num: 17 });
export const SLOT_NAMES = Object.freeze(['count', 'spread', 'speed', 'lifetime', 'damage', 'radius', 'amount', 'value', 'cap', 'threshold', 'pierce', 'duration', 'interval', 'arc_height', 'spawn_height', 'scatter_radius', 'gravity']);
export const findSlot = field => SLOT_NAMES.indexOf(String(field).toLowerCase());

export const ActionFlag = Object.freeze({ Inherit: 1, ConsumeAll: 2, Parabolic: 4, Falling: 8 });

const newExprRef = () => ({ const: 0, first: 0, count: 0, set: false });

// FName semantics: case-insensitive identity, first spelling kept for display.
class NameList {
  constructor(initial = []) { this.names = []; this.index = new Map(); for (const n of initial) this.add(n); }
  find(name) { const i = this.index.get(String(name).toLowerCase()); return i === undefined ? -1 : i; }
  add(name) { const i = this.names.length; this.names.push(name); this.index.set(String(name).toLowerCase(), i); return i; }
  get length() { return this.names.length; }
}

// Stack evaluator shared by compile-time folding and the VM. Leaf resolves non-arithmetic ops.
export function evaluateExpr(code, first, count, leaf) {
  const stack = new Float32Array(MaxExprStack);
  let top = 0;
  for (let index = first; index < first + count; ++index) {
    const instr = code[index];
    switch (instr.op) {
      case EExprOp.Const: stack[top++] = instr.value; break;
      case EExprOp.Mul: case EExprOp.Add: case EExprOp.Div: case EExprOp.Min: case EExprOp.Max: case EExprOp.Pow: {
        const base = top - instr.arity;
        let result = stack[base];
        for (let arg = 1; arg < instr.arity; ++arg) {
          const v = stack[base + arg];
          switch (instr.op) {
            case EExprOp.Mul: result = f(result * v); break;
            case EExprOp.Add: result = f(result + v); break;
            case EExprOp.Div: result = v !== 0 ? f(result / v) : 0; break;
            case EExprOp.Min: result = Math.min(result, v); break;
            case EExprOp.Pow: {
              const power = f(result ** v);
              result = Number.isNaN(power) ? 0 : clamp(power, -FLT_MAX, FLT_MAX);
              break;
            }
            default: result = Math.max(result, v); break;
          }
        }
        top = base;
        stack[top++] = result;
        break;
      }
      default: stack[top++] = leaf(instr); break;
    }
  }
  return top > 0 ? stack[top - 1] : 0;
}

export class CompiledPlan {
  constructor() {
    this.hash = 0n;
    this.stats = new StatBlock();
    this.rules = [];
    this.conditions = [];
    this.actions = [];
    this.expr = [];
    // Rules are sorted by event; per event id: [first, first + count).
    this.eventRuleFirst = [];
    this.eventRuleCount = [];
    this.eventNames = new NameList(BUILTIN_EVENT_NAMES);
    this.tagNames = new NameList(BUILTIN_TAG_NAMES);
    this.kindNames = new NameList();
    this.channelNames = new NameList();
    this.traitIds = [];
  }
  hasRules(event) { return event < this.eventRuleCount.length && this.eventRuleCount[event] > 0; }
  findEvent(name) { return this.eventNames.find(name); }
  findKind(name) { return this.kindNames.find(name); }
}

class Compiler {
  constructor(plan, options) {
    this.plan = plan;
    this.options = options;
    this.trait = null;
    this.traitIndex = 0;
    this.error = '';
  }

  fail(message) {
    if (!this.error) this.error = this.trait ? `${this.trait.id}: ${message}` : message;
    return false;
  }

  eventId(name) { const i = this.plan.eventNames.find(name); return i >= 0 ? i : this.plan.eventNames.add(name); }
  kindId(name) { const i = this.plan.kindNames.find(name); return i >= 0 ? i : this.plan.kindNames.add(name); }

  tagBitFor(name, out) {
    let found = this.plan.tagNames.find(name);
    if (found < 0) {
      if (this.plan.tagNames.length >= MaxTags) return this.fail('more than 64 distinct tags in one build');
      found = this.plan.tagNames.add(name);
    }
    out.bit = tagBit(found);
    return true;
  }

  tagMask(names, out) {
    for (const name of names) {
      const bit = {};
      if (!this.tagBitFor(name, bit)) return false;
      out.mask |= bit.bit;
    }
    return true;
  }

  channelId(name, out) {
    out.channel = -1;
    if (!name) return true;
    let found = this.plan.channelNames.find(name);
    if (found < 0) {
      if (this.plan.channelNames.length >= MaxChannels) return this.fail('more than 4 chain channels in one build');
      found = this.plan.channelNames.add(name);
    }
    out.channel = found;
    return true;
  }

  // Without a channel, state is isolated per trait; a channel shares it across traits.
  stateKey(key, channel) {
    const space = channel ? `channel:${channel}` : `affix:${this.trait.id}`;
    return `${space}:${key}`.toLowerCase();
  }

  emitExpr(source, out, ctx) {
    const instr = { op: EExprOp.Const, arity: 0, scope: 0, value: 0, key: '' };
    switch (source.kind) {
      case 'const':
        instr.value = f(source.value);
        break;
      case 'param': {
        const value = findParam(this.trait.params, source.name);
        if (value === undefined) return this.fail(`unbound parameter ${source.name}`);
        instr.value = f(value);
        break;
      }
      case 'stat': {
        const stat = findStat(source.name);
        if (stat < 0) return this.fail(`unknown stat ${source.name}`);
        // Modifiers are aggregated before rules compile, so stat reads fold to constants.
        instr.value = this.plan.stats.get(stat);
        break;
      }
      case 'event': {
        ctx.isConst = false;
        const field = String(source.name).toLowerCase();
        if (field === 'amount') instr.op = EExprOp.EventAmount;
        else if (field === 'damage') instr.op = EExprOp.EventDamage;
        else if (field === 'stored_value') instr.op = EExprOp.EventStored;
        else if (field === 'generation') instr.op = EExprOp.EventGeneration;
        else if (field === 'sequence') instr.op = EExprOp.EventSequence;
        else return this.fail(`unsupported event value ${field}`);
        break;
      }
      case 'state':
        ctx.isConst = false;
        instr.op = EExprOp.State;
        instr.scope = source.scope;
        instr.key = this.stateKey(source.name, source.channel);
        break;
      default: {
        if (source.args.length === 0 || source.args.length > 255) return this.fail('arithmetic expression needs 1..255 terms');
        if (source.kind === 'pow' && source.args.length !== 2) return this.fail('pow expression needs exactly 2 terms');
        for (const arg of source.args) if (!this.emitExpr(arg, out, ctx)) return false;
        ctx.depth -= source.args.length;
        instr.arity = source.args.length;
        instr.op = { mul: EExprOp.Mul, add: EExprOp.Add, div: EExprOp.Div, min: EExprOp.Min, pow: EExprOp.Pow }[source.kind] ?? EExprOp.Max;
        break;
      }
    }
    out.push(instr);
    ctx.maxDepth = Math.max(ctx.maxDepth, ++ctx.depth);
    return true;
  }

  compileExpr(source, ref) {
    const code = [];
    const ctx = { isConst: true, depth: 0, maxDepth: 0 };
    if (!this.emitExpr(source, code, ctx)) return false;
    if (ctx.maxDepth > MaxExprStack) return this.fail('expression too deep');
    ref.set = true;
    if (ctx.isConst) {
      ref.const = evaluateExpr(code, 0, code.length, () => 0);
      ref.count = 0;
      return true;
    }
    ref.first = this.plan.expr.length;
    ref.count = code.length;
    this.plan.expr.push(...code);
    return true;
  }

  compileConstant(source, out) {
    const ref = newExprRef();
    if (!this.compileExpr(source, ref)) return false;
    if (ref.count !== 0) return this.fail('modifier values must be constant (dynamic modifiers are not supported yet)');
    out.value = ref.const;
    return true;
  }

  compileModifiers() {
    for (const modifier of this.trait.modifiers) {
      const stat = findStat(modifier.stat);
      if (stat < 0) return this.fail(`unknown modifier stat ${modifier.stat}`);
      const out = {};
      if (!this.compileConstant(modifier.value, out)) return false;
      this.plan.stats.apply(stat, modifier.op, out.value);
    }
    return true;
  }

  compileCondition(source, rule) {
    const op = source.op;
    if (op === 'tag') {
      const bit = {};
      if (!this.tagBitFor(source.tag, bit)) return false;
      rule.requireAll |= bit.bit;
      return true;
    }
    const def = { kind: ECond.Generation, compare: source.compare, scope: source.scope, entityKind: 0, key: '', value: newExprRef() };
    if (op === 'generation') {
      def.kind = ECond.Generation;
      def.compare = ECompare.Lte;
    } else if (op === 'state') {
      def.kind = ECond.State;
      def.key = this.stateKey(source.key, source.channel);
    } else if (op === 'chance') {
      def.kind = ECond.Chance;
    } else if (op === 'status') {
      if (!source.key) return this.fail('status condition needs key');
      def.kind = ECond.Status;
      def.key = statusKey(source.key);
      // Bare {op=status,key=chill} means "has the status".
      if (source.value.kind === 'const' && source.value.value === 0 && source.compare === ECompare.Gte) def.compare = ECompare.Gt;
    } else if (op === 'entity_count') {
      def.kind = ECond.EntityCount;
      def.entityKind = source.kind ? this.kindId(source.kind) : U16_MAX;
    } else {
      return this.fail(`unsupported condition ${op}`);
    }
    if (!this.compileExpr(source.value, def.value)) return false;
    this.plan.conditions.push(def);
    ++rule.conditionCount;
    return true;
  }

  require(source, fields) {
    for (const field of fields) if (!source.numbers.has(field)) return this.fail(`action missing ${field}`);
    return true;
  }

  validateAction(source) {
    switch (source.op) {
      case EOp.Emit: return source.kind ? true : this.fail('emit needs kind');
      case EOp.DamageArea: return this.require(source, ['radius', 'amount']);
      case EOp.DamageTarget: return this.require(source, ['amount']);
      case EOp.Counter: case EOp.Accumulate:
        return source.key ? this.require(source, ['value']) : this.fail('state action needs key');
      case EOp.Consume:
        if (!source.key) return this.fail('consume needs key');
        return source.consumeAll ? true : this.require(source, ['value']);
      case EOp.EmitEvent: return source.event ? true : this.fail('emit_event needs event');
      case EOp.ApplyStatus: return source.key ? this.require(source, ['value', 'duration']) : this.fail('apply_status needs key');
      case EOp.Storm: case EOp.Summon:
        return source.kind && source.event ? this.require(source, ['duration', 'interval', 'radius']) : this.fail('summon needs kind and event');
      case EOp.GrantTraits: return source.grant ? this.require(source, ['duration']) : this.fail('grant_traits needs traits');
      default: return true;
    }
  }

  compileAction(source, index, depth) {
    if (!this.validateAction(source)) return false;
    const def = {
      op: source.op, layout: source.layout, origin: source.origin, scope: source.scope, mode: source.mode, element: source.element,
      flags: (source.inherit ? ActionFlag.Inherit : 0) | (source.consumeAll ? ActionFlag.ConsumeAll : 0) | (source.trajectory === 'parabolic' ? ActionFlag.Parabolic : 0) | (source.trajectory === 'falling' ? ActionFlag.Falling : 0),
      event: 0, endEvent: 0, kind: 0, thenFirst: 0, thenCount: 0, addTags: 0n, stateKey: '',
      slots: Array.from({ length: ESlot.Num }, newExprRef),
    };
    if (source.kind) def.kind = this.kindId(source.kind);
    else if (source.op === EOp.Sacrifice) def.kind = U16_MAX;
    if (source.event) def.event = this.eventId(source.event);
    else if (source.emitEvent) def.event = this.eventId(source.emitEvent);
    else def.event = EBuiltinEvent.Hit;
    def.endEvent = source.endEvent ? this.eventId(source.endEvent) : U16_MAX;
    if (source.key) def.stateKey = source.op === EOp.ApplyStatus ? statusKey(source.key) : this.stateKey(source.key, source.channel);
    if (source.op === EOp.GrantTraits) {
      // Stitched: the trait sources bound to this trait instance (collections "with"); resolved by the host.
      const entries = source.grant.stitched
        ? (this.trait.stitched || []).map(stitchedSource => ({ source: stitchedSource }))
        : source.grant.entries.map(entry => ({ id: entry.id, params: { ...entry.params } }));
      const text = entries.map(entry => (entry.source ? sourceText(entry.source) : `${entry.id}${Object.entries(entry.params).map(([k, v]) => `|${k}=${formatG9(v)}`).join('')}`)).join(',');
      // Same wrapper + same contents = one grant per holder (re-trigger refreshes the duration).
      def.grant = { entries, key: `${this.trait.id.split('~')[0]}(${text})`.toLowerCase() };
    }
    const mask = { mask: 0n };
    if (!this.tagMask(source.tags, mask)) return false;
    def.addTags = mask.mask;
    for (const [field, expr] of source.numbers) {
      const slot = findSlot(field);
      if (slot < 0) return this.fail(`unknown numeric field ${field}`);
      if (!this.compileExpr(expr, def.slots[slot])) return false;
    }
    this.plan.actions[index] = def;
    if (source.then.length > 0) {
      const first = {};
      if (!this.compileActionList(source.then, depth + 1, first)) return false;
      this.plan.actions[index].thenFirst = first.value;
      this.plan.actions[index].thenCount = source.then.length;
    }
    return true;
  }

  // Siblings are contiguous; children are appended after their parent list.
  compileActionList(list, depth, outFirst) {
    if (depth > MaxActionDepth) return this.fail('action nesting exceeds 12');
    outFirst.value = this.plan.actions.length;
    if (outFirst.value + list.length > U16_MAX) return this.fail('too many actions');
    for (let i = 0; i < list.length; ++i) this.plan.actions.push(null);
    for (let i = 0; i < list.length; ++i) if (!this.compileAction(list[i], outFirst.value + i, depth)) return false;
    return true;
  }

  compileRule(source, outRules) {
    if (!source.event) return this.fail(`rule ${source.id} has no event`);
    const rule = {
      id: source.id, event: this.eventId(source.event), maxDepth: clamp(source.maxDepth, 0, 32), channel: -1,
      maxEvents: clamp(source.maxEvents > 0 ? source.maxEvents : this.options.defaultMaxEvents, 1, 16384), trait: this.traitIndex,
      requireAll: 0n, requireAny: 0n, forbid: 0n, conditionFirst: this.plan.conditions.length, conditionCount: 0, actionFirst: 0, actionCount: 0,
    };
    const channel = {};
    if (!this.channelId(source.channel, channel)) return false;
    rule.channel = channel.channel;
    for (const condition of source.conditions) if (!this.compileCondition(condition, rule)) return false;
    const first = {};
    if (!this.compileActionList(source.actions, 0, first)) return false;
    rule.actionFirst = first.value;
    rule.actionCount = source.actions.length;
    outRules.push(rule);
    return true;
  }
}

function findParam(params, name) {
  if (params.has(name)) return params.get(name);
  const lower = String(name).toLowerCase();
  for (const [key, value] of params) if (key.toLowerCase() === lower) return value;
  return undefined;
}

const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

function composeTraits(build) {
  const byId = new Map();
  for (const trait of build.traits) {
    const key = String(trait.id).toLowerCase();
    if (!trait.id || byId.has(key)) return { error: `missing or duplicate trait id ${trait.id}` };
    byId.set(key, trait);
  }
  if (!byId.has(String(build.activeId).toLowerCase())) return { error: `active ${build.activeId} is not part of the build` };
  // Fixed point: a source is enabled only while its parent is enabled.
  const enabled = new Set([String(build.activeId).toLowerCase()]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const trait of build.traits) {
      const parentOk = !trait.parentId || enabled.has(String(trait.parentId).toLowerCase());
      if (parentOk && !enabled.has(String(trait.id).toLowerCase())) { enabled.add(String(trait.id).toLowerCase()); changed = true; }
    }
  }
  return { traits: build.traits.filter(trait => enabled.has(String(trait.id).toLowerCase())) };
}

// printf("%.9g") for the build hash text.
export function formatG9(value) {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  const [mantissa, exponentText] = value.toExponential(8).split('e');
  const exponent = Number(exponentText);
  const strip = text => (text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text);
  if (exponent < -4 || exponent >= 9) return `${strip(mantissa)}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
  return strip(value.toFixed(Math.max(0, 8 - exponent)));
}

// id|param=value...|with(...) of one trait source; "with" only when traits are stitched into it.
function sourceText(trait) {
  const keys = [...trait.params.keys()].sort((a, b) => {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  let text = trait.id;
  for (const key of keys) text += `|${key}=${formatG9(trait.params.get(key))}`;
  const trajectories = (actions, path) => actions.forEach((action, index) => {
    if (action.trajectory === 'parabolic') text += `|parabolic:${path}.${index}:${JSON.stringify(action.numbers.get('arc_height'))}`;
    if (action.trajectory === 'falling') text += `|falling:${path}.${index}:${['spawn_height', 'scatter_radius', 'gravity'].map(key => JSON.stringify(action.numbers.get(key))).join(':')}`;
    trajectories(action.then || [], `${path}.${index}`);
  });
  trait.rules.forEach((rule, index) => trajectories(rule.actions, index));
  if (trait.stitched?.length) text += `|with(${trait.stitched.map(sourceText).join(',')})`;
  return text;
}

function hashBuild(traits) {
  let text = '';
  for (const trait of traits) {
    text += sourceText(trait);
    text += `|m${trait.modifiers.length}|r${trait.rules.length};`;
  }
  return hashName(text);
}

/** FDWRuleCompiler::Compile. Returns {plan, error}. */
export function compileBuild(build, options = {}) {
  const opts = { defaultMaxEvents: 16384, ...options };
  const composed = composeTraits(build);
  if (composed.error) return { plan: null, error: composed.error };
  const traits = composed.traits;
  const plan = new CompiledPlan();
  plan.hash = hashBuild(traits);
  const compiler = new Compiler(plan, opts);

  // Pass 1: every modifier from every enabled source, then resolve stats once.
  for (let index = 0; index < traits.length; ++index) {
    compiler.trait = traits[index];
    compiler.traitIndex = index;
    plan.traitIds.push(traits[index].id);
    if (!compiler.compileModifiers()) return { plan: null, error: compiler.error };
  }
  plan.stats.finalize();

  // Pass 2: rules; stat reads fold against the finalized block.
  const unsorted = [];
  for (let index = 0; index < traits.length; ++index) {
    compiler.trait = traits[index];
    compiler.traitIndex = index;
    for (const rule of traits[index].rules) if (!compiler.compileRule(rule, unsorted)) return { plan: null, error: compiler.error };
  }
  if (unsorted.length > U16_MAX) return { plan: null, error: 'too many rules' };
  // Array.prototype.sort is stable (StableSort).
  plan.rules = unsorted.sort((a, b) => a.event - b.event);
  plan.eventRuleFirst = new Array(plan.eventNames.length).fill(0);
  plan.eventRuleCount = new Array(plan.eventNames.length).fill(0);
  for (let index = plan.rules.length - 1; index >= 0; --index) {
    const event = plan.rules[index].event;
    plan.eventRuleFirst[event] = index;
    ++plan.eventRuleCount[event];
  }
  return { plan, error: '' };
}

export { sameName, Tags };
