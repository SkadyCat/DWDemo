// 金样场景执行器：一个场景 = 内容包 + 种子 + 一串操作（生成单位、改字段、施放、直接命中、步进……）。
// 网页版用它跑出事件流写进金样文件；UE 版 DWRulesCore 有一模一样的执行器（DWGolden.cpp），
// 用同样的场景跑出事件流逐个比对。操作清单改动时两边一起改。
//
// scenario: { scenario, seed, eventBudget?, maxDepth?, dungeon?:{seed, floor}, packs:[pack...], ops:[op...] }
//   dungeon: the world gets the grid terrain of generateDungeon(seed, floor) (walls, sliding, flow fields).
// op:
//   {op:'spawn', as, opts}                     world.spawnActor(opts)；opts.affixes 用词条 id
//   {op:'spawnFromTemplate', as, id, opts}     opts.owner 是单位名
//   {op:'set', actor, field, value}            直接写单位字段（life/mana/es/x/y/vx/vy/brain/aggro/keepDistance/kite/closeIn/busyUntil）
//   {op:'fill', actor, pools}                  把 pools 回满（每步后回满英雄用）
//   {op:'refreshPools', actor, fill}
//   {op:'applyStatus', actor, id, opts}        opts.source 是单位名
//   {op:'gain', actor, res, amount}
//   {op:'cast', actor, skill, aim:[x,y], target}
//   {op:'addSkill', actor, skill, supports, groups, manual}       world.addSkill
//   {op:'castSlot', actor, slot | skill, aim, origin, target, triggered, remote, depth, mult}   world.cast(actor, actor.skills[slot] | skillFor(skill), …)
//   {op:'stopChannel', actor}
//   {op:'hit', spec}                           damage.hit；spec.source/target 是单位名，spec.tags 是数组
//   {op:'probe', actor, stat, base?, tags?, target?}  记录一次属性求值（$probe）
//   {op:'flush'}                               处理队列里的事件
//   {op:'run', steps, dt, each:[op...]}        步进 steps 次，每步之后执行 each
//   {op:'snapshot'}                            记录全部单位的状态（$snapshot）
import { compileContent, createWorld, hit } from '../core/index.mjs';
import { generateDungeon } from '../public/game/dungeon.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROUND = v => v;

/** Canonical event record shared with the C++ runner. Actors are ids, tags are sorted and unique. */
export function canon(e, step) {
  const r = { s: step, type: e.type, t: e.time };
  const id = a => (a ? a.id : 0);
  if (e.source !== undefined) r.src = id(e.source);
  if (e.target !== undefined) r.tgt = id(e.target);
  if (e.root !== undefined) r.root = id(e.root);
  if (e.skill) r.skill = e.skill.def.id;
  r.depth = e.depth ?? 0;
  if (e.capped) r.capped = true;
  if (e.tags) r.tags = [...new Set(e.tags)].sort();
  for (const k of ['amount', 'x', 'y', 'value', 'stacks', 'radius', 'delay', 'overkill', 'angle', 'fromX', 'fromY', 'dt', 'carrier'])
    if (typeof e[k] === 'number') r[k] = ROUND(e[k]);
  for (const k of ['key', 'kind', 'fx', 'shape', 'dot']) if (typeof e[k] === 'string') r[k] = e[k];
  if (e.crit !== undefined) r.crit = !!e.crit;
  if (e.unsummoned) r.unsummoned = true;
  if (e.kept) r.kept = true;
  if (e.byType) r.byType = Object.fromEntries(Object.entries(e.byType).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return r;
}

function actorState(a) {
  return { id: a.id, alive: a.alive, life: a.life, mana: a.mana, es: a.es, x: a.x, y: a.y,
    statuses: a.statuses.map(s => `${s.def.id}:${s.stacks}`).sort() };
}

export function runScenario(sc, { onEvent } = {}) {
  const content = compileContent(...sc.packs);
  const world = createWorld(content, { seed: sc.seed ?? 1, ...(sc.eventBudget ? { eventBudget: sc.eventBudget } : {}), ...(sc.maxDepth ? { maxDepth: sc.maxDepth } : {}), terrain: sc.dungeon ? generateDungeon(sc.dungeon.seed, sc.dungeon.floor ?? 1) : null });
  const names = new Map();
  const everyone = new Map(); // id → actor, including removed ones (final state)
  const spawn = world.spawn.bind(world);
  world.spawn = o => { const a = spawn(o); everyone.set(a.id, a); return a; };
  const ref = n => { if (n === undefined || n === null) return null; const a = names.get(n); if (!a) throw new Error(`场景 ${sc.scenario}: 未知单位 ${n}`); return a; };
  const events = [];
  let step = 0;
  const record = r => { events.push(r); onEvent?.(r); };
  world.listeners.push(e => record(canon(e, step)));

  const exec = op => {
    switch (op.op) {
      case 'spawn': { const a = world.spawnActor(op.opts ?? {}); names.set(op.as, a); return; }
      case 'spawnFromTemplate': { const o = { ...(op.opts ?? {}) }; if (o.owner !== undefined) o.owner = ref(o.owner); const a = world.spawnFromTemplate(op.id, o); names.set(op.as, a); return; }
      case 'set': ref(op.actor)[op.field] = op.value; return;
      case 'fill': { const a = ref(op.actor); for (const p of op.pools) a[p] = a.max[p]; return; }
      case 'refreshPools': world.refreshPools(ref(op.actor), !!op.fill); return;
      case 'applyStatus': { const o = { ...(op.opts ?? {}) }; if (o.source !== undefined) o.source = ref(o.source); world.applyStatus(ref(op.actor), op.id, o); return; }
      case 'gain': world.gain(ref(op.actor), op.res, op.amount ?? 1); return;
      case 'cast': {
        const a = ref(op.actor), sk = world.skillFor(a, op.skill), t = ref(op.target);
        world.cast(a, sk, { aim: op.aim ? { x: op.aim[0], y: op.aim[1] } : undefined, target: t });
        return;
      }
      case 'addSkill': world.addSkill(ref(op.actor), op.skill, { supports: op.supports ?? [], groups: op.groups ?? [], manual: !!op.manual }); return;
      case 'castSlot': {
        const a = ref(op.actor), sk = op.slot !== undefined ? a.skills[op.slot] : world.skillFor(a, op.skill);
        const o = { target: ref(op.target), triggered: !!op.triggered, remote: !!op.remote };
        if (op.aim) o.aim = { x: op.aim[0], y: op.aim[1] };
        if (op.origin) o.origin = { x: op.origin[0], y: op.origin[1] };
        if (op.depth !== undefined) o.depth = op.depth;
        if (op.mult !== undefined) o.mult = op.mult;
        world.cast(a, sk, o);
        return;
      }
      case 'stopChannel': world.stopChannel(ref(op.actor)); return;
      case 'hit': {
        const s = op.spec;
        const r = hit(world, { ...s, source: ref(s.source), target: ref(s.target), tags: new Set(s.tags ?? []) });
        const out = { s: step, type: '$hit', landed: r.landed };
        if (r.landed) { out.crit = r.crit; out.amount = r.amount; out.byType = Object.fromEntries(Object.entries(r.byType).sort(([a], [b]) => (a < b ? -1 : 1))); } else out.reason = r.reason;
        record(out);
        return;
      }
      case 'probe': {
        const a = ref(op.actor), tags = new Set(op.tags ?? []);
        const ctx = op.target !== undefined ? { world, self: a, target: ref(op.target), tags } : null;
        const v = op.base !== undefined ? world.scaled(a, op.stat, op.base, tags, ctx) : world.stat(a, op.stat, tags, ctx);
        record({ s: step, type: '$probe', stat: op.stat, value: v });
        return;
      }
      case 'flush': world.flush(); return;
      case 'snapshot': record({ s: step, type: '$snapshot', actors: [...everyone.values()].sort((a, b) => a.id - b.id).map(actorState) }); return;
      case 'run':
        for (let i = 0; i < op.steps; ++i) { ++step; world.step(op.dt); for (const e of op.each ?? []) exec(e); }
        return;
      default: throw new Error(`场景 ${sc.scenario}: 未知操作 ${op.op}`);
    }
  };
  for (const op of sc.ops) exec(op);
  const final = { time: world.time, actors: [...everyone.values()].sort((a, b) => a.id - b.id).map(actorState), stats: { ...world.stats } };
  return { events, final, world };
}

/** Run a scenario and write its golden file (one event per line). Returns { file, events, bytes }. */
export function writeGolden(outDir, sc) {
  const { events, final } = runScenario(sc);
  const file = `${sc.scenario}.json`;
  const text = '{"scenario":' + JSON.stringify(sc.scenario) + (sc.title ? ',"title":' + JSON.stringify(sc.title) : '') + ',"seed":' + sc.seed +
    (sc.eventBudget ? ',"eventBudget":' + sc.eventBudget : '') + (sc.maxDepth ? ',"maxDepth":' + sc.maxDepth : '') +
    (sc.dungeon ? ',"dungeon":' + JSON.stringify(sc.dungeon) : '') +
    ',\n"packs":' + JSON.stringify(sc.packs) + ',\n"ops":' + JSON.stringify(sc.ops) +
    ',\n"events":[\n' + events.map(e => JSON.stringify(e)).join(',\n') + '\n],\n"final":' + JSON.stringify(final) + '}\n';
  fs.writeFileSync(path.join(outDir, file), text);
  return { scenario: sc.scenario, file, events: events.length, bytes: text.length };
}
