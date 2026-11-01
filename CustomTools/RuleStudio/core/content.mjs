// 内容包编译：属性、资源、状态、异常、技能、辅助、召唤物模板、词条——全部是纯数据，这里一次性校验并冻结。
import { defineStat, hasStat } from './registry.mjs';
import { compileMod } from './mods.mjs';
import { compileStatus } from './status.mjs';
import { compileSkill, compileSupport } from './skills.mjs';
import { compileRule } from './rules.mjs';

/**
 * pack: {
 *   stats:     [{ key, kind?, base?, min?, max? }]                  content-defined stats
 *   resources: [{ id, maxStat, decay?, decayDelay?, decayAfter? }]   meters such as rage
 *   statuses:  [status]          ailments:  [ailment]          skills: [skill]     supports: [support]
 *   minions:   [{ id, name, life, radius, mods, skills, brain, duration }]
 *   affixes:   [{ id, name, mods, rules, grants:{ skills:[{ skill, supports, groups }] } }]
 *   baseMods:  mods every actor starts with (game rules: chill on cold hits, base accuracy…)
 * }
 * Several packs can be merged: compileContent(base, archetypePack, generatedAffixes).
 */
export function compileContent(...packs) {
  const pack = { stats: [], resources: [], statuses: [], ailments: [], skills: [], supports: [], minions: [], affixes: [], baseMods: [] };
  for (const p of packs) for (const k of Object.keys(pack)) if (p[k]) pack[k].push(...p[k]);
  for (const s of pack.stats) defineStat(s.key, s);
  const uniq = (list, what) => { const m = new Map(); for (const x of list) { if (m.has(x.id)) throw new Error(`${what}重复：${x.id}`); m.set(x.id, x); } return m; };

  const resources = uniq(pack.resources.map(r => {
    if (!hasStat(r.maxStat)) throw new Error(`资源 ${r.id}: 上限属性未定义 ${r.maxStat}`);
    return Object.freeze({ ...r });
  }), '资源');
  const statuses = uniq(pack.statuses.map(compileStatus), '状态');
  const ailments = uniq(pack.ailments.map(a => {
    if (!statuses.has(a.status)) throw new Error(`异常 ${a.id}: 状态未定义 ${a.status}`);
    if (!hasStat(`chance.${a.id}`)) throw new Error(`异常 ${a.id}: 没有对应的 chance.${a.id} 属性`);
    return Object.freeze({ kind: 'soft', pct: 0, duration: 4, scale: 0.5, cap: 0.5, min: 0, ...a, from: Object.freeze([...a.from]) });
  }), '异常');
  const skills = uniq(pack.skills.map(compileSkill), '技能');
  const supports = uniq(pack.supports.map(compileSupport), '辅助');
  const minions = uniq(pack.minions.map(m => Object.freeze({ ...m, mods: (m.mods ?? []).map((x, i) => compileMod(x, `召唤物 ${m.id}.mods[${i}]`)) })), '召唤物');
  const affixes = uniq(pack.affixes.map(compileAffix), '词条');
  const baseMods = pack.baseMods.map((m, i) => compileMod(m, `baseMods[${i}]`));

  const content = { resources, statuses, ailments, skills, supports, minions, affixes, baseMods };
  // Cross references are checked after everything exists.
  const refs = [];
  for (const s of skills.values()) collectRefs(s.actions, refs, `技能 ${s.id}`), s.status && refs.push(['status', s.status, `技能 ${s.id}`]);
  for (const a of affixes.values()) {
    for (const r of a.rules) collectRefs(r.do, refs, `词条 ${a.id}`);
    for (const g of a.grants.skills) { refs.push(['skill', g.skill, `词条 ${a.id}`]); for (const s of g.supports) refs.push(['support', s, `词条 ${a.id}`]); }
  }
  for (const s of supports.values()) for (const r of s.rules) collectRefs(r.do, refs, `辅助 ${s.id}`);
  for (const m of minions.values()) { for (const id of m.skills ?? []) refs.push(['skill', id, `召唤物 ${m.id}`]); for (const id of m.affixes ?? []) if (!affixes.has(id)) throw new Error(`召唤物 ${m.id}: 词条不存在 ${id}`); }
  for (const st of statuses.values()) if (st.aura) refs.push(['status', st.aura.status, `状态 ${st.id}`]);
  const tables = { status: statuses, skill: skills, support: supports, minion: minions };
  for (const [kind, id, where] of refs) if (!tables[kind].has(id)) throw new Error(`${where}: 引用了不存在的${kind} ${id}`);
  return Object.freeze(content);
}

export function compileAffix(raw) {
  const where = `词条 ${raw?.id}`;
  if (!raw?.id) throw new Error('词条缺少 id');
  return Object.freeze({
    id: raw.id, name: raw.name ?? raw.id, tags: Object.freeze([...(raw.tags ?? [])]),
    mods: (raw.mods ?? []).map((m, i) => compileMod(m, `${where}.mods[${i}]`)),
    rules: (raw.rules ?? []).map((r, i) => compileRule({ id: `${raw.id}#${i}`, ...r }, `${where}.rules[${i}]`)),
    grants: Object.freeze({ skills: (raw.grants?.skills ?? []).map(g => Object.freeze({ skill: g.skill, supports: g.supports ?? [], groups: g.groups ?? [] })) }),
  });
}

const NESTED = ['onHit', 'onEnd', 'onPulse', 'onCast', 'actions', 'then', 'else'];
function collectRefs(actions, out, where) {
  for (const a of actions ?? []) {
    if (a.do === 'cast' && a.skill !== '$event') out.push(['skill', a.skill, where]);
    if ((a.do === 'status' || a.do === 'removeStatus') && a.status) out.push(['status', a.status, where]);
    if (a.do === 'consumeStatus') for (const s of [a.status].flat()) out.push(['status', s, where]);
    if (a.do === 'summon') out.push(['minion', a.minion, where]);
    for (const k of NESTED) if (a[k]) collectRefs(a[k], out, where);
  }
}
