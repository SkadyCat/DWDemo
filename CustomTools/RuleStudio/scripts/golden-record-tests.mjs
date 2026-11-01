// 把 tests/core-archetypes.test.mjs 的 16 条流派机制链录成金样场景：在 Node 的模块解析里把
// core/index.mjs 换成一个记录器，测试照常运行，记录器把它对世界的每次调用（生成单位、加技能、施放、
// 施加状态、步进……）写成 golden-runner 的操作列表。导出时再用同一个执行器重放，得到期望的事件流。
//
//   由 export-golden-traces.mjs 在单独的进程里调用：node scripts/golden-record-tests.mjs <输出目录>
//   网页版的属性注册表是全局的（registry.mjs 的 TABLE），测试包自定义的属性会和游戏内容冲突，所以录制和
//   重放都放在这个独立进程里，写出 archetype_NN.json。
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'export/golden'));

const real = pathToFileURL(path.join(root, 'core/index.mjs')).href;
const wrapper = 'data:text/javascript,' + encodeURIComponent(`
import * as core from ${JSON.stringify(real)};
export * from ${JSON.stringify(real)};
const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const packsOf = new WeakMap();
const rec = globalThis.__dwRecordings ??= [];
export function compileContent(...packs) { const c = core.compileContent(...packs); packsOf.set(c, packs.map(plain)); return c; }
export function createWorld(content, opts = {}) {
  const w = core.createWorld(content, opts);
  const r = { scenario: globalThis.__dwTest ?? 'unnamed', seed: opts.seed ?? 1, packs: packsOf.get(content), ops: [] };
  if (opts.eventBudget) r.eventBudget = opts.eventBudget;
  if (opts.maxDepth) r.maxDepth = opts.maxDepth;
  rec.push(r);
  const ref = a => (a ? 'a' + a.id : undefined);
  const pt = p => (p ? [p.x, p.y] : undefined);
  const watched = new Map(); // id → last known {x, y}
  const sync = () => {
    for (const [id, a] of watched) {
      const s = a.__last;
      if (s && (a.x !== s.x || a.y !== s.y)) { r.ops.push({ op: 'set', actor: 'a' + id, field: 'x', value: a.x }, { op: 'set', actor: 'a' + id, field: 'y', value: a.y }); }
    }
  };
  const snap = () => { for (const a of watched.values()) a.__last = { x: a.x, y: a.y }; };
  const skillRef = (a, sk) => {
    const i = a.skills.indexOf(sk);
    return i >= 0 ? { slot: i } : { skill: sk.def.id };
  };
  // Only the test's own calls are recorded; calls the engine makes from inside them (step → flush, triggers → cast…) are not.
  let depth = 0;
  const wrap = (real, record) => (...args) => {
    if (depth > 0) return real(...args);
    sync(); ++depth;
    try { const res = record(...args); return res; } finally { --depth; snap(); }
  };
  const spawnActor = w.spawnActor;
  w.spawnActor = wrap(spawnActor, o => {
    const opts = { ...o, mods: plain(o.mods), affixes: (o.affixes ?? []).map(a => (typeof a === 'string' ? a : a.id)) };
    if (o.owner) opts.owner = ref(o.owner);
    const op = { op: 'spawn', as: 'next', opts };
    r.ops.push(op);
    const a = spawnActor(o);
    op.as = ref(a);
    watched.set(a.id, a);
    return a;
  });
  const addSkill = w.addSkill;
  w.addSkill = wrap(addSkill, (a, id, o = {}) => { r.ops.push({ op: 'addSkill', actor: ref(a), skill: id, supports: o.supports ?? [], groups: o.groups ?? [], manual: !!o.manual }); return addSkill(a, id, o); });
  const cast = w.cast;
  w.cast = wrap(cast, (a, sk, o = {}) => {
    if (sk) r.ops.push({ op: 'castSlot', actor: ref(a), ...skillRef(a, sk), aim: pt(o.aim), origin: pt(o.origin), target: ref(o.target), triggered: !!o.triggered, remote: !!o.remote, depth: o.depth, mult: o.mult });
    return cast(a, sk, o);
  });
  const stopChannel = w.stopChannel;
  w.stopChannel = wrap(stopChannel, a => { r.ops.push({ op: 'stopChannel', actor: ref(a) }); return stopChannel(a); });
  for (const m of ['applyStatus', 'gain', 'step', 'flush']) {
    const fn = w[m].bind(w);
    w[m] = wrap(fn, (...args) => {
      if (m === 'applyStatus') { const [b, id, o = {}] = args; r.ops.push({ op: 'applyStatus', actor: ref(b), id, opts: { ...o, source: o.source && typeof o.source === 'object' ? ref(o.source) : undefined } }); }
      if (m === 'gain') { const [a, res, amount] = args; r.ops.push({ op: 'gain', actor: ref(a), res, amount }); }
      if (m === 'flush') r.ops.push({ op: 'flush' });
      if (m === 'step') { const last = r.ops[r.ops.length - 1]; if (last?.op === 'run' && last.dt === args[0]) last.steps++; else r.ops.push({ op: 'run', steps: 1, dt: args[0] }); }
      return fn(...args);
    });
  }
  return w;
}
`);
const testWrapper = 'data:text/javascript,' + encodeURIComponent(`
import real from 'node:test';
export * from 'node:test';
export default function test(name, fn) { return real(name, async (...a) => { globalThis.__dwTest = name; return fn(...a); }); }
`);

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (ctx.parentURL?.includes('/tests/') && spec === '../core/index.mjs') return { url: ${JSON.stringify(wrapper)}, shortCircuit: true };
  if (ctx.parentURL?.includes('/tests/') && spec === 'node:test') return { url: ${JSON.stringify(testWrapper)}, shortCircuit: true };
  return next(spec, ctx);
}`));

await import(pathToFileURL(path.join(root, 'tests/core-archetypes.test.mjs')).href);
// node:test runs the tests after the module body; wait for them, then save.
process.on('beforeExit', async () => {
  if (globalThis.__dwSaved) return;
  globalThis.__dwSaved = true;
  const { writeGolden } = await import('./golden-runner.mjs');
  const list = globalThis.__dwRecordings ?? [];
  fs.mkdirSync(outDir, { recursive: true });
  const index = list.map((r, i) => writeGolden(outDir, { ...r, scenario: 'archetype_' + String(i + 1).padStart(2, '0'), title: r.scenario }));
  // The parent reads this line (stdout also carries the test runner's TAP output).
  process.stdout.write('\n@@DW_ARCHETYPES@@' + JSON.stringify(index) + '\n');
});
