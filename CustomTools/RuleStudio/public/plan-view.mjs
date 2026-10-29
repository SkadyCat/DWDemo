// Decodes a compiled plan (engine/compiler.mjs CompiledPlan) for display. Read-only.
import {
  OP_NAMES, COND_NAMES, COMPARE_NAMES, SCOPE_NAMES, LAYOUT_NAMES, ORIGIN_NAMES, REDIRECT_NAMES, ELEMENT_NAMES, U16_MAX,
  EXPR_OP_NAMES, SLOT_NAMES, ActionFlag, EOp, EExprOp, statCount, getStatInfo,
} from '../engine/index.mjs';

const fmt = v => (Number.isInteger(v) ? String(v) : Number(v.toPrecision(6)).toString());

export function tagNames(plan, mask) {
  const out = [];
  for (let i = 0; i < plan.tagNames.length; ++i) if (mask & (1n << BigInt(i))) out.push(plan.tagNames.names[i]);
  return out;
}

export function exprText(plan, ref) {
  if (!ref.set) return null;
  if (ref.count === 0) return fmt(ref.const);
  const stack = [];
  for (let i = ref.first; i < ref.first + ref.count; ++i) {
    const instr = plan.expr[i];
    if (instr.op === EExprOp.Const) stack.push(fmt(instr.value));
    else if (instr.op >= EExprOp.Mul) {
      const args = stack.splice(stack.length - instr.arity, instr.arity);
      stack.push(`${EXPR_OP_NAMES[instr.op]}(${args.join(', ')})`);
    } else if (instr.op === EExprOp.State) stack.push(`state[${SCOPE_NAMES[instr.scope]}:${instr.key}]`);
    else stack.push(EXPR_OP_NAMES[instr.op]);
  }
  return stack.join(' ');
}

export function describeAction(plan, index) {
  const a = plan.actions[index];
  const fields = {};
  a.slots.forEach((ref, slot) => { const text = exprText(plan, ref); if (text !== null) fields[SLOT_NAMES[slot]] = text; });
  const out = { op: OP_NAMES[a.op], fields };
  if (a.op === EOp.Emit || a.op === EOp.Copy) {
    out.kind = plan.kindNames.names[a.kind];
    out.layout = LAYOUT_NAMES[a.layout];
    out.inherit = (a.flags & ActionFlag.Inherit) !== 0;
  }
  if ([EOp.Emit, EOp.DamageArea, EOp.DamageTarget].includes(a.op)) out.element = a.element >= 0 ? ELEMENT_NAMES[a.element] : 'event';
  if (a.op === EOp.Emit) {
    out.origin = ORIGIN_NAMES[a.origin];
    if (a.aim) out.aim = a.aim;
    if (a.flags & ActionFlag.Parabolic) out.trajectory = 'parabolic';
    if (a.offset) out.offset = Object.fromEntries(Object.entries(a.offset).map(([axis, ref]) => [axis, exprText(plan, ref)]));
    if (a.scatter) out.scatter = Object.fromEntries(Object.entries(a.scatter).map(([axis, ref]) => [axis, ['shape', 'distribution'].includes(axis) ? ref : exprText(plan, ref)]));
  }
  if (a.op === EOp.MaintainEmitter) { out.mode = a.mode === 1 ? 'feed' : 'maintain'; if (a.mode !== 1) { out.event = plan.eventNames.names[a.event]; out.targeting = a.targeting; out.decayInterval = exprText(plan, a.decayInterval); if (a.rate) out.rate = exprText(plan, a.rate); } }
  if (a.op === EOp.Summon) { out.kind = plan.kindNames.names[a.kind]; out.event = plan.eventNames.names[a.event]; out.origin = ORIGIN_NAMES[a.origin]; }
  if (a.op === EOp.SpawnMonster) { out.kind = plan.kindNames.names[a.kind]; out.origin = ORIGIN_NAMES[a.origin]; out.invulnerable = !!a.invulnerable; }
  if ([EOp.DamageArea, EOp.DamageTarget, EOp.EmitEvent].includes(a.op)) out.event = plan.eventNames.names[a.event];
  if (a.op === EOp.Redirect) out.mode = REDIRECT_NAMES[a.mode];
  if (a.op === EOp.GrantTraits) {
    out.origin = ORIGIN_NAMES[a.origin] === 'owner' ? 'owner' : 'target';
    out.traits = (a.grant?.entries || []).map(e => (e.source ? e.source.id : e.id));
  }
  if (a.stateKey) out.key = a.stateKey;
  if ([EOp.Counter, EOp.Accumulate, EOp.Consume, EOp.MaintainEmitter].includes(a.op)) out.scope = SCOPE_NAMES[a.scope];
  if (a.endEvent !== U16_MAX) out.endEvent = plan.eventNames.names[a.endEvent];
  if (a.addTags) out.tags = tagNames(plan, a.addTags);
  if (a.thenCount) out.then = Array.from({ length: a.thenCount }, (_, i) => describeAction(plan, a.thenFirst + i));
  return out;
}

export function describePlan(plan) {
  const stats = [];
  for (let i = 0; i < statCount(); ++i) if (plan.stats.isModified(i) && getStatInfo(i).name) stats.push(plan.stats.describe(i));
  const events = [];
  for (let e = 0; e < plan.eventNames.length; ++e) {
    if (!plan.eventRuleCount[e]) continue;
    const rules = [];
    for (let r = plan.eventRuleFirst[e]; r < plan.eventRuleFirst[e] + plan.eventRuleCount[e]; ++r) {
      const rule = plan.rules[r];
      const conditions = [];
      for (const tag of tagNames(plan, rule.requireAll)) conditions.push(`tag ${tag}`);
      for (let c = rule.conditionFirst; c < rule.conditionFirst + rule.conditionCount; ++c) {
        const cond = plan.conditions[c];
        conditions.push(`${COND_NAMES[cond.kind]}${cond.key ? ` ${cond.key}` : ''} ${COMPARE_NAMES[cond.compare]} ${exprText(plan, cond.value)}`);
      }
      rules.push({
        trait: plan.traitIds[rule.trait], id: rule.id, maxDepth: rule.maxDepth, maxEvents: rule.maxEvents,
        channel: rule.channel >= 0 ? plan.channelNames.names[rule.channel] : null, conditions,
        actions: Array.from({ length: rule.actionCount }, (_, i) => describeAction(plan, rule.actionFirst + i)),
      });
    }
    events.push({ event: plan.eventNames.names[e], rules });
  }
  return {
    hash: plan.hash.toString(16).padStart(16, '0'), traits: [...plan.traitIds], stats, events,
    counts: { rules: plan.rules.length, actions: plan.actions.length, conditions: plan.conditions.length, expr: plan.expr.length, tags: plan.tagNames.length, kinds: plan.kindNames.length },
  };
}
