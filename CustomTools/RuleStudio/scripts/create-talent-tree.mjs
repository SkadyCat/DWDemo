// Generates the 「六域星盘」 passive tree (Content/Rules/Talents/constellation.json).
// Design lives in the tables below; every node is ordinary existing affix lines,
// so the rule engine aggregates talents exactly like equipment.
//   node scripts/create-talent-tree.mjs          write the tree
//   node scripts/create-talent-tree.mjs --check  validate only
import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, PROJECT_ROOT } from './rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { validateTree } from '../public/talents/model.mjs';

const T = (id, params = {}) => ({ id, params, with: [] });
const small = (name, ...traits) => ({ name, traits });

// ------------------------------------------------------------------ design
const DOMAINS = [
  { id: 'frost', name: '寒霜之域', glyph: '霜', color: '#8fc7ff', category: 'attack', blurb: '冰缓、冻结与碎冰。控制战场，再一击粉碎。',
    gate: small('智力', T('attr_intelligence', { n: 10 })),
    smalls: [small('冰霜伤害', T('inc_frost', { n: 10 })), small('冰缓效果', T('chill_effect', { n: 10 })), small('冻结积累', T('freeze_buildup', { n: 10 })), small('智力', T('attr_intelligence', { n: 8 })), small('冰缓持续', T('chill_duration', { n: 12 }))],
    hub: { name: '霜寒刺骨', traits: [T('inc_frost', { n: 28 }), T('chill_vs_frost', { n: 20 })] },
    left: { notable: { name: '冰封千里', traits: [T('freeze_buildup', { n: 30 }), T('freeze_duration', { n: 30 })] },
      keystone: { name: '永冬之心', description: '冻结来得更快、持续更久。代价：放弃其他元素。', traits: [T('freeze_threshold', { n: 40 }), T('freeze_duration', { n: 50 }), T('chill_effect', { n: 30 }), T('more_fire', { n: -30 }), T('more_lightning', { n: -30 })] } },
    right: { notable: { name: '寒潮', traits: [T('frost_cooldown', { n: 25 }), T('inc_frost', { n: 15 })] },
      keystone: { name: '冰魄碎裂', description: '冻结的敌人在你面前不堪一击。代价：冰缓持续时间大幅缩短。', traits: [T('freeze_vs_crit', { n: 100 }), T('freeze_vs_crit_multi', { n: 60 }), T('shatter_damage', { n: 60 }), T('chill_duration', { n: -40 })] } },
    guard: { name: '凛冬护甲', traits: [T('frost_resistance', { resistance: 20 }), T('shield_increased', { n: 15 })] } },
  { id: 'storm', name: '雷霆之域', glyph: '雷', color: '#f2d36b', category: 'attack', blurb: '感电层数、闪电连锁与施法速度。越打越快。',
    gate: small('敏捷', T('attr_dexterity', { n: 10 })),
    smalls: [small('闪电伤害', T('inc_lightning', { n: 10 })), small('感电概率', T('shock_chance', { n: 6 })), small('感电效果', T('shock_effect', { n: 10 })), small('敏捷', T('attr_dexterity', { n: 8 })), small('闪电施法速度', T('lightning_cast_speed', { n: 4 }))],
    hub: { name: '雷霆万钧', traits: [T('inc_lightning', { n: 28 }), T('lightning_pen', { n: 8 })] },
    left: { notable: { name: '电弧', traits: [T('shock_arc', { n: 20 }), T('shock_vs_lightning', { n: 20 })] },
      keystone: { name: '过载', description: '感电可以叠到极高层数，每层都放大闪电伤害。代价：技能消耗的 30% 由气血支付。', traits: [T('shock_max_stacks', { n: 3 }), T('shock_effect', { n: 40 }), T('shock_per_layer', { n: 8 }), T('cost_from_life', { n: 30 })] } },
    right: { notable: { name: '疾雷', traits: [T('lightning_cast_speed', { n: 12 }), T('chain_count', { n: 1 })] },
      keystone: { name: '雷暴连锁', description: '闪电在敌群中反复跳跃，可以回到已命中的目标。代价：单次命中更弱。', traits: [T('chain_count', { n: 2 }), T('chain_rehit'), T('chain_decay', { n: 40 }), T('more_lightning', { n: -15 })] } },
    guard: { name: '静电屏障', traits: [T('lightning_resistance', { resistance: 20 }), T('evasion_increased', { n: 15 })] } },
  { id: 'flame', name: '烈焰之域', glyph: '焰', color: '#ff8a4c', category: 'attack', blurb: '点燃、燃烧爆炸，以及燃烧自己换取力量。',
    gate: small('力量', T('attr_strength', { n: 10 })),
    smalls: [small('火焰伤害', T('inc_fire', { n: 10 })), small('点燃概率', T('ignite_chance', { n: 6 })), small('点燃伤害', T('ignite_damage', { n: 10 })), small('力量', T('attr_strength', { n: 8 })), small('对燃烧敌人', T('burn_vs_fire', { n: 8 }))],
    hub: { name: '烈焰', traits: [T('inc_fire', { n: 28 }), T('fire_pen', { n: 8 })] },
    left: { notable: { name: '余烬', traits: [T('ignite_damage', { n: 25 }), T('ignite_duration', { n: 20 })] },
      keystone: { name: '燎原', description: '点燃可以叠层，并在敌人死亡时蔓延、爆炸。代价：最大气血降低 10%。', traits: [T('ignite_max_stacks', { n: 3 }), T('ignite_kill_spread'), T('burn_explode', { n: 30 }), T('burn_explode_damage', { n: 40 }), T('life_more', { n: -10 })] } },
    right: { notable: { name: '火葬', traits: [T('burn_explode', { n: 20 }), T('burn_explode_damage', { n: 30 })] },
      keystone: { name: '以血为薪', description: '气血化作火焰：获得基于最大气血的火焰伤害。代价：所有技能改为消耗气血。', traits: [T('life_added_fire', { n: 4 }), T('more_fire', { n: 15 }), T('cost_from_life', { n: 100 })] } },
    guard: { name: '熔心', traits: [T('fire_resistance', { resistance: 20 }), T('life_increased', { n: 8 })] } },
  { id: 'blight', name: '蚀毒之域', glyph: '蚀', color: '#9ad46b', category: 'attack', blurb: '中毒叠层、侵蚀与虚空。慢慢溶解一切。',
    gate: small('敏捷', T('attr_dexterity', { n: 10 })),
    smalls: [small('中毒伤害', T('poison_increased', { n: 12 })), small('中毒概率', T('poison_chance', { n: 6 })), small('虚空伤害', T('inc_void', { n: 10 })), small('敏捷', T('attr_dexterity', { n: 8 })), small('侵蚀概率', T('erosion_chance', { n: 6 }))],
    hub: { name: '腐毒', traits: [T('poison_increased', { n: 32 }), T('poison_duration', { n: 15 })] },
    left: { notable: { name: '瘴气', traits: [T('poison_kill_spread', { n: 30 }), T('poison_spread_damage', { n: 25 })] },
      keystone: { name: '瘟疫之主', description: '每次施毒多叠一层，层数上限大幅提高。代价：中毒持续时间缩短 30%。', traits: [T('poison_extra_layers', { n: 1 }), T('poison_max_stacks', { n: 10 }), T('poison_more', { n: 20 }), T('poison_duration', { n: -30 })] } },
    right: { notable: { name: '侵蚀', traits: [T('erosion_damage', { n: 25 }), T('erosion_max_stacks', { n: 2 })] },
      keystone: { name: '虚无吞噬', description: '虚空伤害额外提高，并随侵蚀层数增长。代价：闪避值额外降低 30%。', traits: [T('more_void', { n: 25 }), T('life_added_void', { n: 3 }), T('erosion_per_layer', { n: 5 }), T('evasion_more', { n: -30 })] } },
    guard: { name: '百毒不侵', traits: [T('poison_resistance', { resistance: 25 }), T('life_regen_percent', { n: 0.5 })] } },
  { id: 'iron', name: '铁血之域', glyph: '战', color: '#e06a5a', category: 'defense', blurb: '气血、护甲、格挡，以及越战越勇的狂怒。',
    gate: small('体质', T('attr_constitution', { n: 10 })),
    smalls: [small('基础气血', T('life_base', { n: 15 })), small('物理伤害', T('inc_physical', { n: 10 })), small('护甲', T('armour', { n: 60 })), small('力量', T('attr_strength', { n: 8 })), small('体质', T('attr_constitution', { n: 8 }))],
    hub: { name: '巨力', traits: [T('inc_physical', { n: 28 }), T('life_added_physical', { n: 1 })] },
    left: { notable: { name: '铁壁', traits: [T('armour', { n: 250 }), T('block_chance', { n: 6 })] },
      keystone: { name: '不灭之躯', description: '气血大幅提高并持续再生。代价：失去全部护盾，闪避值减半。', traits: [T('life_more', { n: 25 }), T('life_regen_percent', { n: 2 }), T('shield_more', { n: -100 }), T('evasion_more', { n: -50 })] } },
    right: { notable: { name: '鲜血之誓', traits: [T('leech_life_physical', { n: 1 }), T('life_on_kill', { n: 10 })] },
      keystone: { name: '狂战', description: '气血越低，伤害与攻速越高。代价：药剂恢复量减半。', traits: [T('low_life_damage', { n: 60 }), T('missing_life_damage', { per: 10, amount: 4 }), T('low_life_attack_speed', { n: 20 }), T('flask_life_amount', { n: -50 })] } },
    guard: { name: '坚韧', traits: [T('life_increased', { n: 10 }), T('life_regen_flat', { n: 5 })] } },
  { id: 'spirit', name: '灵契之域', glyph: '灵', color: '#b48cff', category: 'special', blurb: '召唤物的数量、生存与牺牲。',
    gate: small('智力', T('attr_intelligence', { n: 10 })),
    smalls: [small('召唤物伤害', T('minion_damage', { n: 12 })), small('召唤物气血', T('minion_life', { n: 10 })), small('召唤物攻速', T('minion_attack_speed', { n: 4 })), small('智力', T('attr_intelligence', { n: 8 })), small('召唤物施法速度', T('minion_cast_speed', { n: 4 }))],
    hub: { name: '军团', traits: [T('minion_damage', { n: 32 }), T('minion_attack_speed', { n: 10 })] },
    left: { notable: { name: '爆裂仆从', traits: [T('minion_death_explode'), T('minion_death_damage', { n: 20 })] },
      keystone: { name: '统御', description: '可以多控制一个召唤物。代价：你自身造成的伤害额外降低 15%。', traits: [T('minion_cap', { n: 1 }), T('minion_cap_same', { n: 1 }), T('minion_damage', { n: 20 }), T('more_elemental', { n: -15 }), T('more_physical', { n: -15 }), T('more_void', { n: -15 })] } },
    right: { notable: { name: '不朽仆从', traits: [T('minion_life', { n: 25 }), T('minion_regen_percent', { n: 1 })] },
      keystone: { name: '血契', description: '召唤物替你承伤，并把伤害偷取给你。代价：最大气血降低 10%。', traits: [T('minion_leech_you', { n: 2 }), T('minion_take_for_you', { n: 20 }), T('minion_life_more', { n: 30 }), T('life_more', { n: -10 })] } },
    guard: { name: '群体指挥', traits: [T('minion_area', { n: 20 }), T('minion_proj_count', { n: 1 })] } },
];

// Bridges sit between neighbouring domains (index i joins domain i and i+1).
const BRIDGES = [
  { id: 'barrage', name: '弹幕', smalls: [small('投射物伤害', T('proj_damage', { n: 8 })), small('投射物速度', T('proj_speed', { n: 10 })), small('穿透概率', T('proj_pierce_chance', { n: 10 }))], notable: { name: '弹幕', traits: [T('proj_count', { n: 1 }), T('proj_damage', { n: 10 })] } },
  { id: 'elements', name: '元素调和', smalls: [small('元素伤害', T('inc_elemental', { n: 6 })), small('火焰抗性', T('fire_resistance', { resistance: 6 })), small('闪电抗性', T('lightning_resistance', { resistance: 6 }))], notable: { name: '元素调和', traits: [T('inc_elemental', { n: 15 }), T('fire_resistance', { resistance: 8 }), T('frost_resistance', { resistance: 8 }), T('lightning_resistance', { resistance: 8 })] } },
  { id: 'domain', name: '法域', smalls: [small('范围伤害', T('area_damage', { n: 8 })), small('范围面积', T('area_size', { n: 8 })), small('范围伤害', T('area_damage', { n: 8 }))], notable: { name: '法域', traits: [T('area_size', { n: 20 }), T('area_damage', { n: 15 })] } },
  { id: 'thirst', name: '嗜血', smalls: [small('气血再生', T('life_regen_flat', { n: 3 })), small('击杀回血', T('life_on_kill', { n: 4 })), small('命中回血', T('life_on_hit', { n: 1 }))], notable: { name: '嗜血', traits: [T('leech_life_all', { n: 1 }), T('leech_life_speed', { n: 30 })] } },
  { id: 'shadow', name: '迅影', smalls: [small('闪避值', T('evasion_increased', { n: 10 })), small('基础闪避', T('evasion', { n: 50 })), small('闪避回血', T('life_on_evade', { n: 5 }))], notable: { name: '迅影', traits: [T('evasion_increased', { n: 25 }), T('life_on_evade', { n: 15 })] } },
  { id: 'aegis', name: '灵能护盾', smalls: [small('护盾上限', T('shield_increased', { n: 8 })), small('基础护盾', T('shield_base', { n: 20 })), small('护盾回充', T('shield_recharge_rate', { n: 10 }))], notable: { name: '灵能护盾', traits: [T('shield_increased', { n: 25 }), T('shield_recharge_rate', { n: 25 })] } },
];
const RING = [small('基础气血', T('life_base', { n: 12 })), small('魔力上限', T('mana_base', { n: 10 })), small('基础护盾', T('shield_base', { n: 15 }))];

// ------------------------------------------------------------------ geometry
const nodes = [], edges = [], rad = d => d * Math.PI / 180;
const at = (angle, r) => ({ x: Math.round(r * Math.cos(rad(angle))), y: Math.round(r * Math.sin(rad(angle))) });
const offset = (p, angle, r) => ({ x: Math.round(p.x + r * Math.cos(rad(angle))), y: Math.round(p.y + r * Math.sin(rad(angle))) });
function add(id, kind, sector, def, p, extra = {}) {
  nodes.push({ id, kind, sector, name: def.name, cost: kind === 'origin' ? 0 : 1, x: p.x, y: p.y, traits: def.traits || [], ...(def.description ? { description: def.description } : {}), ...extra });
  return id;
}
const link = (a, b) => edges.push([a, b]);
const cycle = (pool, i) => pool[i % pool.length];

/** A wheel: six small nodes around a centre notable. Index 0 faces inward (entry), 3 faces outward. */
function wheel(prefix, sector, center, facing, notable, pool, seed, R = 88) {
  const ring = [];
  for (let k = 0; k < 6; k++) ring.push(add(`${prefix}_r${k}`, 'small', sector, cycle(pool, seed + k), offset(center, facing + 180 - 60 * k, R)));
  for (let k = 0; k < 6; k++) link(ring[k], ring[(k + 1) % 6]);
  const hub = add(`${prefix}_n`, 'notable', sector, notable, center);
  link(hub, ring[3]);
  return { ring, hub, entry: ring[0], out: ring[3], left: ring[4], right: ring[2] };
}

add('origin', 'origin', '', { name: '启明' }, { x: 0, y: 0 });
const DOMAIN_ANGLE = i => -90 + 60 * i;
// Inner ring: 24 nodes; every fourth is a domain gate linked to the origin.
const ring = [];
for (let k = 0; k < 24; k++) {
  const angle = -90 + 15 * k, domain = DOMAINS[k / 4];
  ring.push(add(domain ? `${domain.id}_gate` : `ring_${k}`, 'small', domain?.id || 'core', domain ? domain.gate : cycle(RING, k), at(angle, 250)));
}
for (let k = 0; k < 24; k++) link(ring[k], ring[(k + 1) % 24]);
for (let i = 0; i < 6; i++) link('origin', ring[i * 4]);

const branchTips = [];
DOMAINS.forEach((d, i) => {
  const θ = DOMAIN_ANGLE(i);
  let prev = `${d.id}_gate`, seed = 0;
  for (let s = 0; s < 4; s++) { const id = add(`${d.id}_s${s}`, 'small', d.id, cycle(d.smalls, seed++), at(θ, 330 + 70 * s)); link(prev, id); prev = id; }
  const hub = wheel(`${d.id}_a`, d.id, at(θ, 690), θ, d.hub, d.smalls, seed); seed += 6;
  link(prev, hub.entry);
  const tips = {};
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const angle = θ + 14 * sign, branch = d[side], start = sign < 0 ? hub.left : hub.right;
    let p = start;
    for (let s = 0; s < 3; s++) { const id = add(`${d.id}_${side}_s${s}`, 'small', d.id, cycle(d.smalls, seed++), at(angle, 840 + 70 * s)); link(p, id); p = id; if (s === 1) tips[side] = id; }
    const w = wheel(`${d.id}_${side}`, d.id, at(angle, 1125), angle, branch.notable, d.smalls, seed, 78); seed += 6;
    link(p, w.entry); p = w.out;
    for (let s = 0; s < 3; s++) { const id = add(`${d.id}_${side}_t${s}`, 'small', d.id, cycle(d.smalls, seed++), at(angle, 1280 + 70 * s)); link(p, id); p = id; }
    link(p, add(`${d.id}_${side}_k`, 'keystone', d.id, branch.keystone, at(angle, 1560)));
  }
  let p = hub.out;
  for (let s = 0; s < 2; s++) { const id = add(`${d.id}_mid_s${s}`, 'small', d.id, cycle(d.smalls, seed++), at(θ, 870 + 70 * s)); link(p, id); p = id; }
  const guard = wheel(`${d.id}_mid`, d.id, at(θ, 1090), θ, d.guard, d.smalls, seed, 72);
  link(p, guard.entry);
  branchTips.push(tips);
});
BRIDGES.forEach((b, i) => {
  const θ = DOMAIN_ANGLE(i) + 30, from = branchTips[i].right, to = branchTips[(i + 1) % 6].left;
  const center = at(θ, 960), l = add(`${b.id}_l`, 'small', b.id, b.smalls[0], at(θ - 9, 930)), r = add(`${b.id}_r`, 'small', b.id, b.smalls[0], at(θ + 9, 930));
  const ringIds = [0, 1, 2, 3].map(k => add(`${b.id}_w${k}`, 'small', b.id, b.smalls[[1, 2, 1, 2][k]], offset(center, θ + 180 - 90 * k, 46)));
  for (let k = 0; k < 4; k++) link(ringIds[k], ringIds[(k + 1) % 4]);
  link(add(`${b.id}_n`, 'notable', b.id, b.notable, offset(center, θ, 120)), ringIds[2]);
  link(from, l); link(l, ringIds[3]); link(ringIds[1], r); link(r, to);
});

// ------------------------------------------------------------------ checks
function crossing(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  if ([a, b].some(p => p === c || p === d)) return false;
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function audit() {
  const byId = new Map(nodes.map(n => [n.id, n])), problems = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], gap = Math.hypot(a.x - b.x, a.y - b.y);
    if (gap < 34) problems.push(`节点过近 ${a.id} / ${b.id} (${gap.toFixed(0)})`);
  }
  const segs = edges.map(([a, b]) => [byId.get(a), byId.get(b)]);
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (crossing(...segs[i], ...segs[j])) problems.push(`连线交叉 ${edges[i].join('-')} × ${edges[j].join('-')}`);
  return problems;
}

const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), pad = 140;
const tree = {
  schema: 2, id: 'six-domains', revision: 1, name: '六域星盘', defaultBudget: 120, root: 'origin',
  attributes: [
    { id: 'strength', name: '力量', glyph: '力', color: '#dc8d82', value: 0, traits: [T('attr_strength', { n: 1 })] },
    { id: 'dexterity', name: '敏捷', glyph: '敏', color: '#8dc69f', value: 0, traits: [T('attr_dexterity', { n: 1 })] },
    { id: 'intelligence', name: '智力', glyph: '智', color: '#8bbcdf', value: 0, traits: [T('attr_intelligence', { n: 1 })] },
    { id: 'constitution', name: '体质', glyph: '体', color: '#d4ba7e', value: 0, traits: [T('attr_constitution', { n: 1 })] },
  ],
  sectors: [
    { id: 'core', name: '根基', color: '#cbb98a', category: 'defense', description: '围绕启明的根基环：气血、魔力与护盾。' },
    ...DOMAINS.map((d, i) => ({ id: d.id, name: d.name, glyph: d.glyph, color: d.color, category: d.category, description: d.blurb, angle: DOMAIN_ANGLE(i) })),
    ...BRIDGES.map((b, i) => ({ id: b.id, name: b.name, color: '#a7b4c8', category: 'special', description: `连接${DOMAINS[i].name}与${DOMAINS[(i + 1) % 6].name}`, angle: DOMAIN_ANGLE(i) + 30 })),
  ],
  nodes, edges,
  layout: { bounds: { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad } },
};

const problems = audit();
const check = checkRuleSet(readRuleFiles()); if (!check.ok) throw Error(check.error);
const error = validateTree(tree, check.library);
if (error) problems.push(`星盘校验：${error}`);
const counts = nodes.reduce((m, n) => ({ ...m, [n.kind]: (m[n.kind] || 0) + 1 }), {});
console.log(`节点 ${nodes.length}（${Object.entries(counts).map(([k, v]) => k + ' ' + v).join('，')}），连线 ${edges.length}`);
if (problems.length) { console.error(problems.slice(0, 30).join('\n')); process.exit(1); }
if (!process.argv.includes('--check')) {
  const text = JSON.stringify(tree, null, 1) + '\n';
  for (const dir of ['Rules', 'RulesTower']) fs.writeFileSync(path.join(PROJECT_ROOT, 'Content', dir, 'Talents', 'constellation.json'), text);
  console.log('已写入 Content/Rules/Talents/constellation.json 与 RulesTower 副本');
}
