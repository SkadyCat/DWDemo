// Generates the 「六域星盘」 passive tree (Content/Rules/Talents/constellation.json).
// Content lives in the tables below; every node is ordinary existing affix lines,
// so the rule engine aggregates talents exactly like equipment.
// Layout is grown organically (Path of Exile style): node groups of different
// shapes are scattered by Poisson sampling, joined by a planar road network of
// attribute travel nodes, and group-internal links follow circular orbits.
//   node scripts/create-talent-tree.mjs [--seed N] [--check]
import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, PROJECT_ROOT } from './rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { validateTree } from '../public/talents/model.mjs';

const T = (id, params = {}) => ({ id, params, with: [] });
const S = (name, ...traits) => ({ name, traits });
const N = (name, ...traits) => ({ name, traits });
const K = (name, description, ...traits) => ({ name, description, traits });

// ------------------------------------------------------------------ content
const ATTR = {
  strength: S('力量', T('attr_strength', { n: 10 })), dexterity: S('敏捷', T('attr_dexterity', { n: 10 })),
  intelligence: S('智力', T('attr_intelligence', { n: 10 })), constitution: S('体质', T('attr_constitution', { n: 10 })),
};
const DOMAINS = [
  { id: 'frost', name: '寒霜之域', glyph: '霜', color: '#8fc7ff', category: 'attack', attr: 'intelligence', blurb: '冰缓、冻结与碎冰。控制战场，再一击粉碎。',
    smalls: [S('冰霜伤害', T('inc_frost', { n: 10 })), S('冰缓效果', T('chill_effect', { n: 10 })), S('冻结积累', T('freeze_buildup', { n: 10 })), S('冰缓持续', T('chill_duration', { n: 12 })), S('冰霜抗性', T('frost_resistance', { resistance: 8 }))],
    notables: [N('霜寒刺骨', T('inc_frost', { n: 28 }), T('chill_vs_frost', { n: 20 })), N('冰封千里', T('freeze_buildup', { n: 30 }), T('freeze_duration', { n: 30 })), N('寒潮', T('frost_cooldown', { n: 25 }), T('inc_frost', { n: 15 })),
      N('凛冬护甲', T('frost_resistance', { resistance: 20 }), T('shield_increased', { n: 15 })), N('冰川之触', T('chill_effect', { n: 25 }), T('chill_cap', { n: 10 }))],
    keystones: [K('永冬之心', '冻结来得更快、持续更久。代价：放弃其他元素。', T('freeze_threshold', { n: 40 }), T('freeze_duration', { n: 50 }), T('chill_effect', { n: 30 }), T('more_fire', { n: -30 }), T('more_lightning', { n: -30 })),
      K('冰魄碎裂', '冻结的敌人在你面前不堪一击。代价：冰缓持续时间大幅缩短。', T('freeze_vs_crit', { n: 100 }), T('freeze_vs_crit_multi', { n: 60 }), T('shatter_damage', { n: 60 }), T('chill_duration', { n: -40 }))] },
  { id: 'storm', name: '雷霆之域', glyph: '雷', color: '#f2d36b', category: 'attack', attr: 'dexterity', blurb: '感电层数、闪电连锁与施法速度。越打越快。',
    smalls: [S('闪电伤害', T('inc_lightning', { n: 10 })), S('感电概率', T('shock_chance', { n: 6 })), S('感电效果', T('shock_effect', { n: 10 })), S('闪电施法速度', T('lightning_cast_speed', { n: 4 })), S('闪电抗性', T('lightning_resistance', { resistance: 8 }))],
    notables: [N('雷霆万钧', T('inc_lightning', { n: 28 }), T('lightning_pen', { n: 8 })), N('电弧', T('shock_arc', { n: 20 }), T('shock_vs_lightning', { n: 20 })), N('疾雷', T('lightning_cast_speed', { n: 12 }), T('chain_count', { n: 1 })),
      N('静电屏障', T('lightning_resistance', { resistance: 20 }), T('evasion_increased', { n: 15 })), N('风暴之眼', T('shock_duration', { n: 30 }), T('shock_chance', { n: 15 }))],
    keystones: [K('过载', '感电可以叠到极高层数，每层都放大闪电伤害。代价：技能消耗的 30% 由气血支付。', T('shock_max_stacks', { n: 3 }), T('shock_effect', { n: 40 }), T('shock_per_layer', { n: 8 }), T('cost_from_life', { n: 30 })),
      K('雷暴连锁', '闪电在敌群中反复跳跃，可以回到已命中的目标。代价：单次命中更弱。', T('chain_count', { n: 2 }), T('chain_rehit'), T('chain_decay', { n: 40 }), T('more_lightning', { n: -15 }))] },
  { id: 'flame', name: '烈焰之域', glyph: '焰', color: '#ff8a4c', category: 'attack', attr: 'strength', blurb: '点燃、燃烧爆炸，以及燃烧自己换取力量。',
    smalls: [S('火焰伤害', T('inc_fire', { n: 10 })), S('点燃概率', T('ignite_chance', { n: 6 })), S('点燃伤害', T('ignite_damage', { n: 10 })), S('对燃烧敌人', T('burn_vs_fire', { n: 8 })), S('火焰抗性', T('fire_resistance', { resistance: 8 }))],
    notables: [N('烈焰', T('inc_fire', { n: 28 }), T('fire_pen', { n: 8 })), N('余烬', T('ignite_damage', { n: 25 }), T('ignite_duration', { n: 20 })), N('火葬', T('burn_explode', { n: 20 }), T('burn_explode_damage', { n: 30 })),
      N('熔心', T('fire_resistance', { resistance: 20 }), T('life_increased', { n: 8 })), N('焚身', T('burn_vs_hit', { n: 20 }), T('ignite_chance', { n: 15 }))],
    keystones: [K('燎原', '点燃可以叠层，并在敌人死亡时蔓延、爆炸。代价：最大气血降低 10%。', T('ignite_max_stacks', { n: 3 }), T('ignite_kill_spread'), T('burn_explode', { n: 30 }), T('burn_explode_damage', { n: 40 }), T('life_more', { n: -10 })),
      K('以血为薪', '气血化作火焰：获得基于最大气血的火焰伤害。代价：所有技能改为消耗气血。', T('life_added_fire', { n: 4 }), T('more_fire', { n: 15 }), T('cost_from_life', { n: 100 }))] },
  { id: 'blight', name: '蚀毒之域', glyph: '蚀', color: '#9ad46b', category: 'attack', attr: 'dexterity', blurb: '中毒叠层、侵蚀与虚空。慢慢溶解一切。',
    smalls: [S('中毒伤害', T('poison_increased', { n: 12 })), S('中毒概率', T('poison_chance', { n: 6 })), S('虚空伤害', T('inc_void', { n: 10 })), S('侵蚀概率', T('erosion_chance', { n: 6 })), S('毒素抗性', T('poison_resistance', { resistance: 8 }))],
    notables: [N('腐毒', T('poison_increased', { n: 32 }), T('poison_duration', { n: 15 })), N('瘴气', T('poison_kill_spread', { n: 30 }), T('poison_spread_damage', { n: 25 })), N('侵蚀', T('erosion_damage', { n: 25 }), T('erosion_max_stacks', { n: 2 })),
      N('百毒不侵', T('poison_resistance', { resistance: 25 }), T('life_regen_percent', { n: 0.5 })), N('致命剂量', T('poison_chance', { n: 20 }), T('poison_duration', { n: 20 }))],
    keystones: [K('瘟疫之主', '每次施毒多叠一层，层数上限大幅提高。代价：中毒持续时间缩短 30%。', T('poison_extra_layers', { n: 1 }), T('poison_max_stacks', { n: 10 }), T('poison_more', { n: 20 }), T('poison_duration', { n: -30 })),
      K('虚无吞噬', '虚空伤害额外提高，并随侵蚀层数增长。代价：闪避值额外降低 30%。', T('more_void', { n: 25 }), T('life_added_void', { n: 3 }), T('erosion_per_layer', { n: 5 }), T('evasion_more', { n: -30 }))] },
  { id: 'iron', name: '铁血之域', glyph: '战', color: '#e06a5a', category: 'defense', attr: 'strength', blurb: '气血、护甲、格挡，以及越战越勇的狂怒。',
    smalls: [S('基础气血', T('life_base', { n: 15 })), S('物理伤害', T('inc_physical', { n: 10 })), S('护甲', T('armour', { n: 60 })), S('气血上限', T('life_increased', { n: 4 })), S('格挡率', T('block_chance', { n: 2 }))],
    notables: [N('巨力', T('inc_physical', { n: 28 }), T('life_added_physical', { n: 1 })), N('铁壁', T('armour', { n: 250 }), T('block_chance', { n: 6 })), N('鲜血之誓', T('leech_life_physical', { n: 1 }), T('life_on_kill', { n: 10 })),
      N('坚韧', T('life_increased', { n: 10 }), T('life_regen_flat', { n: 5 })), N('战吼', T('life_on_hit', { n: 3 }), T('inc_physical', { n: 15 }))],
    keystones: [K('不灭之躯', '气血大幅提高并持续再生。代价：失去全部护盾，闪避值减半。', T('life_more', { n: 25 }), T('life_regen_percent', { n: 2 }), T('shield_more', { n: -100 }), T('evasion_more', { n: -50 })),
      K('狂战', '气血越低，伤害与攻速越高。代价：药剂恢复量减半。', T('low_life_damage', { n: 60 }), T('missing_life_damage', { per: 10, amount: 4 }), T('low_life_attack_speed', { n: 20 }), T('flask_life_amount', { n: -50 }))] },
  { id: 'spirit', name: '灵契之域', glyph: '灵', color: '#b48cff', category: 'special', attr: 'intelligence', blurb: '召唤物的数量、生存与牺牲。',
    smalls: [S('召唤物伤害', T('minion_damage', { n: 12 })), S('召唤物气血', T('minion_life', { n: 10 })), S('召唤物攻速', T('minion_attack_speed', { n: 4 })), S('召唤物施法速度', T('minion_cast_speed', { n: 4 })), S('召唤物抗性', T('minion_resistance', { n: 8 }))],
    notables: [N('军团', T('minion_damage', { n: 32 }), T('minion_attack_speed', { n: 10 })), N('爆裂仆从', T('minion_death_explode'), T('minion_death_damage', { n: 20 })), N('不朽仆从', T('minion_life', { n: 25 }), T('minion_regen_percent', { n: 1 })),
      N('群体指挥', T('minion_area', { n: 20 }), T('minion_proj_count', { n: 1 })), N('灵魂纽带', T('minion_life', { n: 15 }), T('minion_resistance', { n: 20 }))],
    keystones: [K('统御', '可以多控制一个召唤物。代价：你自身造成的伤害额外降低 15%。', T('minion_cap', { n: 1 }), T('minion_cap_same', { n: 1 }), T('minion_damage', { n: 20 }), T('more_elemental', { n: -15 }), T('more_physical', { n: -15 }), T('more_void', { n: -15 })),
      K('血契', '召唤物替你承伤，并把伤害偷取给你。代价：最大气血降低 10%。', T('minion_leech_you', { n: 2 }), T('minion_take_for_you', { n: 20 }), T('minion_life_more', { n: 30 }), T('life_more', { n: -10 }))] },
];
// Themes between neighbouring domains (index i sits between domain i and i+1).
const BRIDGES = [
  { id: 'barrage', name: '弹幕', attr: 'dexterity', smalls: [S('投射物伤害', T('proj_damage', { n: 8 })), S('投射物速度', T('proj_speed', { n: 10 })), S('穿透概率', T('proj_pierce_chance', { n: 10 }))],
    notables: [N('弹幕', T('proj_count', { n: 1 }), T('proj_damage', { n: 10 })), N('穿心', T('proj_pierce', { n: 1 }), T('proj_damage', { n: 15 }))] },
  { id: 'elements', name: '元素调和', attr: 'constitution', smalls: [S('元素伤害', T('inc_elemental', { n: 6 })), S('火焰抗性', T('fire_resistance', { resistance: 6 })), S('闪电抗性', T('lightning_resistance', { resistance: 6 }))],
    notables: [N('元素调和', T('inc_elemental', { n: 15 }), T('fire_resistance', { resistance: 8 }), T('frost_resistance', { resistance: 8 }), T('lightning_resistance', { resistance: 8 })), N('元素穿透', T('fire_pen', { n: 6 }), T('frost_pen', { n: 6 }), T('lightning_pen', { n: 6 }))] },
  { id: 'domain', name: '法域', attr: 'strength', smalls: [S('范围伤害', T('area_damage', { n: 8 })), S('范围面积', T('area_size', { n: 8 })), S('次级范围伤害', T('area_secondary_damage', { n: 10 }))],
    notables: [N('法域', T('area_size', { n: 20 }), T('area_damage', { n: 15 })), N('余波', T('area_secondary_damage', { n: 25 }), T('area_damage', { n: 10 }))] },
  { id: 'thirst', name: '嗜血', attr: 'constitution', smalls: [S('气血再生', T('life_regen_flat', { n: 3 })), S('击杀回血', T('life_on_kill', { n: 4 })), S('命中回血', T('life_on_hit', { n: 1 }))],
    notables: [N('嗜血', T('leech_life_all', { n: 1 }), T('leech_life_speed', { n: 30 })), N('生生不息', T('life_regen_percent', { n: 1 }), T('life_regen_speed', { n: 30 }))] },
  { id: 'shadow', name: '迅影', attr: 'dexterity', smalls: [S('闪避值', T('evasion_increased', { n: 10 })), S('基础闪避', T('evasion', { n: 50 })), S('闪避回血', T('life_on_evade', { n: 5 }))],
    notables: [N('迅影', T('evasion_increased', { n: 25 }), T('life_on_evade', { n: 15 })), N('幻步', T('evasion_moving', { n: 40 }), T('full_life_move', { n: 10 }))] },
  { id: 'aegis', name: '灵能护盾', attr: 'intelligence', smalls: [S('护盾上限', T('shield_increased', { n: 8 })), S('基础护盾', T('shield_base', { n: 20 })), S('护盾回充', T('shield_recharge_rate', { n: 10 }))],
    notables: [N('灵能护盾', T('shield_increased', { n: 25 }), T('shield_recharge_rate', { n: 25 })), N('护盾充能', T('shield_recharge_start', { n: 30 }), T('shield_regen_percent', { n: 1 }))] },
];
const CORE = { id: 'core', name: '根基', attr: 'constitution', smalls: [S('基础气血', T('life_base', { n: 12 })), S('魔力上限', T('mana_base', { n: 10 })), S('基础护盾', T('shield_base', { n: 15 }))],
  notables: [N('体魄', T('life_increased', { n: 10 }), T('life_base', { n: 20 })), N('心智', T('mana_base', { n: 30 }), T('shield_base', { n: 30 }))] };

// ------------------------------------------------------------------ random
const seedArg = process.argv.indexOf('--seed');
let SEED = seedArg > 0 ? +process.argv[seedArg + 1] : 7;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ geometry helpers
const deg = d => d * Math.PI / 180;
const pt = (x, y) => ({ x: Math.round(x), y: Math.round(y) });
const polar = (c, a, r) => pt(c.x + r * Math.cos(a), c.y + r * Math.sin(a));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p, a, b) { const l = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l)) : 0; return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y)); }
function crossing(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  if ([a, b].some(p => (p.x === c.x && p.y === c.y) || (p.x === d.x && p.y === d.y))) return false;
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function build(seed) {
  const random = rng(seed), pick = list => list[Math.floor(random() * list.length)];
  const nodes = [], edges = [], arcs = {}, byId = new Map();
  const add = (id, kind, sector, def, p) => { const n = { id, kind, sector, name: def.name, cost: kind === 'origin' ? 0 : 1, x: p.x, y: p.y, traits: def.traits || [], ...(def.description ? { description: def.description } : {}) }; nodes.push(n); byId.set(id, n); return n; };
  const link = (a, b, orbit) => { edges.push([a.id, b.id]); if (orbit) arcs[[a.id, b.id].sort().join(':')] = { cx: orbit.x, cy: orbit.y, r: orbit.r }; };

  // Anchors: six domains, six themes between them, and the root core.
  const anchors = [
    ...DOMAINS.map((d, i) => ({ theme: d, at: polar({ x: 0, y: 0 }, deg(-90 + 60 * i), 1150), weight: 1 })),
    ...BRIDGES.map((b, i) => ({ theme: b, at: polar({ x: 0, y: 0 }, deg(-60 + 60 * i), 1500), weight: 1.35 })),
  ];
  // 1) Poisson-scattered group centres inside a soft disc.
  const centres = [], R0 = 520, R1 = 2350, minGap = 255;
  for (let tries = 0; tries < 9000 && centres.length < 120; tries++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(R0 * R0 + random() * (R1 * R1 - R0 * R0));
    const p = polar({ x: 0, y: 0 }, a, r);
    if (centres.every(c => dist(c, p) >= minGap)) centres.push(p);
  }
  const themeOf = p => {
    if (Math.hypot(p.x, p.y) < 640) return CORE;
    let best = null, score = Infinity;
    for (const a of anchors) { const s = dist(a.at, p) * a.weight + random() * 160; if (s < score) { score = s; best = a.theme; } }
    return best;
  };
  const groups = centres.map((c, i) => ({ id: `g${i}`, c, theme: themeOf(c), kind: 'stat', nodes: [], ports: [], radius: 60 }));

  // 2) Choose group shapes. Two keystones per domain at its far, well-separated groups.
  for (const d of DOMAINS) {
    const mine = groups.filter(g => g.theme === d).sort((a, b) => Math.hypot(b.c.x, b.c.y) - Math.hypot(a.c.x, a.c.y));
    const chosen = [];
    for (const g of mine) { if (chosen.length < 2 && chosen.every(o => dist(o.c, g.c) > 700)) chosen.push(g); }
    if (chosen.length < 2) throw Error(`${d.name} 没有足够的外围位置放置基石`);
    chosen.forEach((g, i) => { g.kind = 'keystone'; g.keystone = d.keystones[i]; });
  }
  for (const theme of [...DOMAINS, ...BRIDGES, CORE]) {
    const pool = groups.filter(g => g.theme === theme && g.kind !== 'keystone').sort((a, b) => Math.hypot(a.c.x, a.c.y) - Math.hypot(b.c.x, b.c.y));
    theme.notables.forEach((notable, i) => {
      // Spread notables across the region: every other group, nearest first.
      const g = pool[Math.min(pool.length - 1, Math.floor(i * pool.length / theme.notables.length))];
      if (!g || g.notable) return;
      g.notable = notable; g.kind = pick(['wheel', 'wheel', 'arc', 'cluster']);
    });
  }
  for (const g of groups) if (g.kind === 'stat') g.kind = pick(['travel', 'stat', 'stat', 'pair']);

  // 3) Realise each group on circular orbits.
  let serial = 0;
  const smallOf = (theme, k) => theme.smalls[k % theme.smalls.length];
  for (const g of groups) {
    const t = g.theme, sector = t.id, face = Math.atan2(g.c.y, g.c.x), id = s => `${sector}_${g.id}_${s}`;
    const start = random() * 6;
    if (g.kind === 'wheel') {
      const R = 74 + random() * 16, count = 5 + Math.floor(random() * 2), ring = [];
      for (let k = 0; k < count; k++) ring.push(add(id(`w${k}`), 'small', sector, smallOf(t, k + serial), polar(g.c, face + Math.PI + k * 2 * Math.PI / count, R)));
      for (let k = 0; k < count; k++) link(ring[k], ring[(k + 1) % count], { x: g.c.x, y: g.c.y, r: R });
      const hub = add(id('n'), 'notable', sector, g.notable, g.c); link(hub, ring[Math.floor(count / 2)]);
      g.nodes = [...ring, hub]; g.ports = ring; g.radius = R + 24;
    } else if (g.kind === 'arc') {
      const R = 105 + random() * 25, span = deg(110 + random() * 50), count = 4, base = face + Math.PI / 2 * (random() < .5 ? 1 : -1) - span / 2, orbit = { x: g.c.x, y: g.c.y, r: R };
      const arc = [];
      for (let k = 0; k < count; k++) arc.push(add(k === count - 1 ? id('n') : id(`a${k}`), k === count - 1 ? 'notable' : 'small', sector, k === count - 1 ? g.notable : smallOf(t, k + serial), polar(g.c, base + span * k / (count - 1), R)));
      for (let k = 1; k < count; k++) link(arc[k - 1], arc[k], orbit);
      g.nodes = arc; g.ports = [arc[0], arc[1], arc[2]]; g.radius = R + 30;
    } else if (g.kind === 'cluster') {
      const hub = add(id('n'), 'notable', sector, g.notable, g.c), around = [];
      for (let k = 0; k < 3; k++) { const n = add(id(`c${k}`), 'small', sector, smallOf(t, k + serial), polar(g.c, start + k * 2 * Math.PI / 3, 70)); link(hub, n); around.push(n); }
      g.nodes = [hub, ...around]; g.ports = around; g.radius = 90;
    } else if (g.kind === 'keystone') {
      const R = 95, orbit = { x: g.c.x, y: g.c.y, r: R }, inward = face + Math.PI, lead = [];
      for (let k = 0; k < 3; k++) lead.push(add(id(`l${k}`), 'small', sector, smallOf(t, k + serial), polar(g.c, inward + deg(-60 + 60 * k), R)));
      link(lead[0], lead[1], orbit); link(lead[1], lead[2], orbit);
      const key = add(id('k'), 'keystone', sector, g.keystone, polar(g.c, face, 22)); link(lead[2], key);
      g.nodes = [...lead, key]; g.ports = lead; g.radius = R + 30;
    } else if (g.kind === 'stat') {
      const R = 62 + random() * 14, count = 3 + Math.floor(random() * 2), ring = [], orbit = { x: g.c.x, y: g.c.y, r: R };
      for (let k = 0; k < count; k++) ring.push(add(id(`s${k}`), 'small', sector, smallOf(t, k + serial), polar(g.c, start + k * 2 * Math.PI / count, R)));
      for (let k = 1; k < count; k++) link(ring[k - 1], ring[k], orbit);
      g.nodes = ring; g.ports = ring; g.radius = R + 22;
    } else if (g.kind === 'pair') {
      const a = add(id('p0'), 'small', sector, smallOf(t, serial), polar(g.c, start, 40)), b = add(id('p1'), 'small', sector, smallOf(t, serial + 1), polar(g.c, start + Math.PI, 40));
      link(a, b); g.nodes = [a, b]; g.ports = [a, b]; g.radius = 60;
    } else {
      const n = add(id('t'), 'small', sector, ATTR[t.attr], g.c); g.nodes = [n]; g.ports = [n]; g.radius = 30;
    }
    serial += 2;
  }

  // 4) The start: origin and a small ring, treated as one more group.
  const origin = add('origin', 'origin', '', { name: '启明' }, pt(0, 0)), startRing = [];
  for (let k = 0; k < 6; k++) startRing.push(add(`core_start_${k}`, 'small', 'core', ATTR[['intelligence', 'dexterity', 'strength', 'dexterity', 'strength', 'intelligence'][k]], polar({ x: 0, y: 0 }, deg(-60 + 60 * k), 190)));
  for (let k = 0; k < 6; k++) { link(startRing[k], startRing[(k + 1) % 6], { x: 0, y: 0, r: 190 }); link(origin, startRing[k]); }
  const startGroup = { id: 'start', c: pt(0, 0), theme: CORE, kind: 'start', nodes: [origin, ...startRing], ports: startRing, radius: 215 };
  const all = [startGroup, ...groups];

  // 5) Roads: greedy planar graph over nearby groups, avoiding other groups' discs.
  const candidates = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j], d = dist(a.c, b.c);
    if (d > 520 + (a === startGroup || b === startGroup ? 200 : 0)) continue;
    if (all.some(o => o !== a && o !== b && segDist(o.c, a.c, b.c) < o.radius + 24)) continue;
    candidates.push({ a, b, d });
  }
  candidates.sort((x, y) => x.d - y.d);
  const roads = [];
  for (const c of candidates) if (roads.every(r => !crossing(r.a.c, r.b.c, c.a.c, c.b.c))) roads.push(c);
  // Minimum spanning tree over the planar roads, plus extra loops for multiple routes.
  const parent = new Map(all.map(g => [g, g])), find = g => parent.get(g) === g ? g : (parent.set(g, find(parent.get(g))), parent.get(g));
  const keep = [];
  const keystoneLike = g => g.kind === 'keystone';
  for (const r of roads) {
    if (keystoneLike(r.a) || keystoneLike(r.b)) continue;
    if (find(r.a) !== find(r.b)) { parent.set(find(r.a), find(r.b)); keep.push(r); }
  }
  for (const r of roads) if (!keep.includes(r) && !keystoneLike(r.a) && !keystoneLike(r.b) && random() < 0.42) keep.push(r);
  if (!keep.filter(r => r.a === startGroup || r.b === startGroup).length) throw Error('起点没有道路');
  // Keystones hang off exactly one road: the shortest to a non-keystone group.
  for (const g of groups.filter(keystoneLike)) {
    const r = roads.filter(r => (r.a === g || r.b === g) && !keystoneLike(r.a === g ? r.b : r.a)).sort((x, y) => x.d - y.d)[0];
    if (!r) throw Error('基石无法连接');
    keep.push(r);
  }
  // All groups must be reachable.
  const roots = new Set(groups.filter(g => !keystoneLike(g)).map(find));
  if (roots.size > 1 || find(startGroup) !== [...roots][0]) throw Error('道路网络不连通');

  // 6) Lay each road between the nearest ports, with attribute travel nodes on long ones.
  let roadSerial = 0;
  for (const r of keep) {
    // Nearest port pair whose road stays clear of both groups' own nodes and orbits.
    const inner = [...r.a.nodes, ...r.b.nodes], innerEdges = edges.filter(([x, y]) => inner.some(n => n.id === x) && inner.some(n => n.id === y)).map(([x, y]) => [byId.get(x), byId.get(y)]);
    let best = null, fallback = null;
    for (const p of r.a.ports) for (const q of r.b.ports) {
      const d = dist(p, q), clear = inner.every(n => n === p || n === q || segDist(n, p, q) >= 34) && innerEdges.every(([x, y]) => !crossing(x, y, p, q));
      if (clear && (!best || d < best.d)) best = { p, q, d };
      if (!fallback || d < fallback.d) fallback = { p, q, d };
    }
    best ||= fallback;
    const steps = Math.max(0, Math.round(best.d / 105) - 1), theme = random() < .5 ? r.a.theme : r.b.theme;
    let prev = best.p;
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1), wobble = (random() - .5) * 26;
      const nx = -(best.q.y - best.p.y) / best.d, ny = (best.q.x - best.p.x) / best.d;
      const n = add(`road${roadSerial++}`, 'small', theme.id, s === Math.ceil(steps / 2) && random() < .55 ? ATTR[theme.attr] : smallOf(theme, s + roadSerial), pt(best.p.x + (best.q.x - best.p.x) * t + nx * wobble, best.p.y + (best.q.y - best.p.y) * t + ny * wobble));
      link(prev, n); prev = n;
    }
    link(prev, best.q);
  }
  return { nodes, edges, arcs, groups };
}

// ------------------------------------------------------------------ audit
function audit(nodes, edges) {
  const byId = new Map(nodes.map(n => [n.id, n])), problems = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const gap = dist(nodes[i], nodes[j]);
    if (gap < 36) problems.push(`节点过近 ${nodes[i].id} / ${nodes[j].id} (${gap.toFixed(0)})`);
  }
  if (problems.length > 3) return problems;
  const segs = edges.map(([a, b]) => [byId.get(a), byId.get(b)]);
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (crossing(...segs[i], ...segs[j])) problems.push(`连线交叉 ${edges[i].join('-')} × ${edges[j].join('-')}`);
  for (const [a, b] of segs) for (const n of nodes) if (n !== a && n !== b && segDist(n, a, b) < 16) problems.push(`连线穿过节点 ${a.id}-${b.id} / ${n.id}`);
  return problems;
}

const check = checkRuleSet(readRuleFiles()); if (!check.ok) throw Error(check.error);
let result, problems = [], attempt = 0;
for (; attempt < 400; attempt++, SEED++) {
  try { result = build(SEED); } catch (error) { problems = [error.message]; continue; }
  problems = audit(result.nodes, result.edges);
  if (!problems.length) break;
}
if (problems.length) { console.error(`第 ${attempt} 次尝试仍未通过：\n` + problems.slice(0, 20).join('\n')); process.exit(1); }
const { nodes, edges, arcs } = result;
const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), pad = 160;
const regions = [...DOMAINS, ...BRIDGES, CORE].map(theme => {
  const own = nodes.filter(n => n.sector === theme.id);
  return { id: theme.id, x: Math.round(own.reduce((s, n) => s + n.x, 0) / own.length), y: Math.round(own.reduce((s, n) => s + n.y, 0) / own.length) };
});
const tree = {
  schema: 2, id: 'six-domains', revision: 2, name: '六域星盘', defaultBudget: 120, root: 'origin',
  attributes: [
    { id: 'strength', name: '力量', glyph: '力', color: '#dc8d82', value: 0, traits: [T('attr_strength', { n: 1 })] },
    { id: 'dexterity', name: '敏捷', glyph: '敏', color: '#8dc69f', value: 0, traits: [T('attr_dexterity', { n: 1 })] },
    { id: 'intelligence', name: '智力', glyph: '智', color: '#8bbcdf', value: 0, traits: [T('attr_intelligence', { n: 1 })] },
    { id: 'constitution', name: '体质', glyph: '体', color: '#d4ba7e', value: 0, traits: [T('attr_constitution', { n: 1 })] },
  ],
  sectors: [
    { id: 'core', name: '根基', color: '#cbb98a', category: 'defense', description: '启明周围：气血、魔力与护盾。' },
    ...DOMAINS.map(d => ({ id: d.id, name: d.name, glyph: d.glyph, color: d.color, category: d.category, description: d.blurb, domain: true })),
    ...BRIDGES.map((b, i) => ({ id: b.id, name: b.name, color: '#a7b4c8', category: 'special', description: `介于${DOMAINS[i].name}与${DOMAINS[(i + 1) % 6].name}之间` })),
  ].map(s => ({ ...s, ...(regions.find(r => r.id === s.id) ? { center: regions.find(r => r.id === s.id) } : {}) })),
  nodes, edges,
  layout: { seed: SEED, arcs, bounds: { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad } },
};
const error = validateTree(tree, check.library);
if (error) { console.error('星盘校验：' + error); process.exit(1); }
const counts = nodes.reduce((m, n) => ({ ...m, [n.kind]: (m[n.kind] || 0) + 1 }), {});
console.log(`种子 ${SEED}（第 ${attempt + 1} 次尝试）：节点 ${nodes.length}（${Object.entries(counts).map(([k, v]) => k + ' ' + v).join('，')}），连线 ${edges.length}，弧线 ${Object.keys(arcs).length}`);
if (!process.argv.includes('--check')) {
  const text = JSON.stringify(tree, null, 1) + '\n';
  for (const dir of ['Rules', 'RulesTower']) fs.writeFileSync(path.join(PROJECT_ROOT, 'Content', dir, 'Talents', 'constellation.json'), text);
  console.log('已写入 Content/Rules/Talents/constellation.json 与 RulesTower 副本');
}
