// 度量与条件：词条里所有「当……时」「每……」都用同一套小语法描述，命中时求值。
//
// A measure reads one number from the live battle:
//   {res:'power'}            current amount of a resource (charges, meters, counters) on `of`
//   {status:'shock'}         stacks of a status            {statusTag:'ailment'}  distinct statuses with a tag
//   {stat:'armour'}          a stat value (uses the context's tags)
//   {pct:'life'|'mana'|'es'} pool fill in percent           {missing:'life'} missing percent   {pool:'life'} maximum
//   {var:'n'}                a local variable of the running action list
//   {div:[a, b]}             a / b, where a and b are numbers or measures (with optional mul/add)
//   {nearby:'enemy', radius} actors around `of`              {since:'kill'} seconds since `of` last did it
//   {moving:true}            1 while `of` moves              {tag:'fire'} 1 when the hit/skill carries the tag
//   {event:'amount'}         a field of the event that fired the rule
//   {const:n}
// `of` is 'self' (default), 'target' or 'owner'.
// A condition is a measure plus a comparator (gte/gt/lte/lt/eq; none means "> 0"),
// or {all:[...]}, {any:[...]}, {not:cond}.
// A scaling ("per") is a measure plus {step, max}: factor = min(floor(value / step), max).

const MEASURE_KEYS = ['res', 'status', 'statusTag', 'stat', 'pct', 'missing', 'pool', 'nearby', 'since', 'moving', 'tag', 'event', 'var', 'div', 'const'];
const COMPARATORS = ['gte', 'gt', 'lte', 'lt', 'eq'];
const OF = new Set(['self', 'target', 'owner']);

function subject(ctx, of = 'self') {
  if (of === 'self') return ctx.self;
  if (of === 'target') return ctx.target;
  return ctx.self && ctx.world ? ctx.world.rootOwner(ctx.self) : null;
}

export function measure(spec, ctx) {
  const who = subject(ctx, spec.of);
  if ('const' in spec) return spec.const;
  if ('div' in spec) { const b = evalNum(spec.div[1], ctx); return b ? evalNum(spec.div[0], ctx) / b : 0; }
  if ('var' in spec) return ctx.vars?.[spec.var] ?? 0;
  if ('tag' in spec) return ctx.tags?.has(spec.tag) ? 1 : 0;
  if ('event' in spec) return Number(ctx.event?.[spec.event]) || 0;
  if (!who) return 0;
  if ('res' in spec) return who.resource(spec.res);
  if ('status' in spec) return who.statusStacks(spec.status);
  if ('statusTag' in spec) return who.statusTagCount(spec.statusTag);
  if ('stat' in spec) return ctx.world.stat(who, spec.stat, ctx.tags, ctx);
  if ('pct' in spec) return who.poolPct(spec.pct);
  if ('missing' in spec) return 100 - who.poolPct(spec.missing);
  if ('pool' in spec) return who.max[spec.pool] ?? 0;
  if ('nearby' in spec) return ctx.world.countNearby(who, spec.nearby, spec.radius ?? 300);
  if ('since' in spec) { const t = who.lastEvent.get(spec.since); return t === undefined ? 1e9 : ctx.world.time - t; }
  if ('moving' in spec) return who.moving ? 1 : 0;
  return 0;
}

/** A number from a literal or a measure, with optional {mul, add}. */
export function evalNum(spec, ctx) {
  if (typeof spec === 'number') return spec;
  return measure(spec, ctx) * (spec.mul ?? 1) + (spec.add ?? 0);
}

export function test(cond, ctx) {
  if (!cond) return true;
  if (cond.all) { for (const c of cond.all) if (!test(c, ctx)) return false; return true; }
  if (cond.any) { for (const c of cond.any) if (test(c, ctx)) return true; return false; }
  if (cond.not) return !test(cond.not, ctx);
  const v = measure(cond, ctx);
  if ('gte' in cond) return v >= cond.gte;
  if ('gt' in cond) return v > cond.gt;
  if ('lte' in cond) return v <= cond.lte;
  if ('lt' in cond) return v < cond.lt;
  if ('eq' in cond) return v === cond.eq;
  return v > 0;
}

export function scale(per, ctx) {
  if (!per) return 1;
  const v = measure(per, ctx), step = per.step || 1;
  const n = Math.floor(v / step);
  return per.max === undefined ? n : Math.min(n, per.max);
}

/** Validate shape at compile time so content mistakes fail loudly, not silently at runtime. */
export function checkMeasure(spec, where) {
  if (!spec || typeof spec !== 'object') throw new Error(`${where}: 度量必须是对象`);
  const keys = MEASURE_KEYS.filter(k => k in spec);
  if (keys.length !== 1) throw new Error(`${where}: 度量需要且只能有一个来源（${MEASURE_KEYS.join('/')}），实际 ${JSON.stringify(spec)}`);
  if (spec.of !== undefined && !OF.has(spec.of)) throw new Error(`${where}: of 只能是 self/target/owner`);
}

export function checkCondition(cond, where) {
  if (cond === undefined || cond === null) return;
  if (cond.all || cond.any) { const list = cond.all || cond.any; if (!Array.isArray(list) || !list.length) throw new Error(`${where}: all/any 需要非空数组`); list.forEach((c, i) => checkCondition(c, `${where}[${i}]`)); return; }
  if (cond.not) return checkCondition(cond.not, `${where}.not`);
  checkMeasure(cond, where);
  if (COMPARATORS.filter(k => k in cond).length > 1) throw new Error(`${where}: 只能有一个比较符`);
}

export function checkScaling(per, where) {
  if (per === undefined || per === null) return;
  checkMeasure(per, where);
  if (per.step !== undefined && !(per.step > 0)) throw new Error(`${where}: step 必须为正`);
}
