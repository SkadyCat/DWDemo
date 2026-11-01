// 天赋盘：六域星盘（流放之路式的有机布局，种子固定）。中心是起点和一圈防御，六个域各有一条主干、
// 若干小簇与通往外缘基石的路；相邻两域之间有桥，桥上挂着混搭用的基石。
//   小点：一条数值词条（较低阶）           大点：两条数值词条，带名字
//   特性点：一条形态 / 联动特性（就是装备基底上的特性，只是固定在盘上）
//   基石：一条核心特性（改写规则的关键词）
// 每个点的效果都是普通词条（affixLine），和装备上的完全一样地进入战斗。
import { family, affixLine } from './families.mjs';

export const TALENT_TIERS = Object.freeze({ small: 3, notable: 5, trait: 2, keystone: 1 });

const DOMAINS = [
  { id: 'fire', name: '焰域', hue: '#ff8a3d',
    small: ['dmg_fire', 'added_fire_spell', 'ailment_ignite', 'chance_ignite', 'pen_fire', 'res_fire', 'added_fire_attack'],
    notables: [['余烬之心', 'dmg_fire', 'ailment_ignite'], ['灼骨', 'pen_fire', 'chance_scorch'], ['焚野', 'dmg_area', 'dmg_fire']],
    traits: ['ignite_spread', 'kill_explode', 'explode_ignite', 'conv_phys_fire'], keystone: 'core_avatar_fire' },
  { id: 'cold', name: '霜域', hue: '#8fd8ff',
    small: ['dmg_cold', 'added_cold_spell', 'chance_freeze', 'effect_chill', 'pen_cold', 'res_cold', 'added_cold_attack'],
    notables: [['凛冬', 'dmg_cold', 'chance_freeze'], ['冰晶', 'crit_chance', 'chance_brittle'], ['寒铠', 'res_cold', 'life_inc']],
    traits: ['shatter_nova', 'frozen_bonus', 'conv_phys_cold', 'react_vaporize'], keystone: 'core_absolute_zero' },
  { id: 'lightning', name: '雷域', hue: '#ffe066',
    small: ['dmg_lightning', 'added_lightning_spell', 'chance_shock', 'effect_shock', 'pen_lightning', 'res_lightning', 'cast_speed'],
    notables: [['雷鸣', 'dmg_lightning', 'effect_shock'], ['疾电', 'cast_speed', 'crit_chance'], ['导体', 'chance_sap', 'dmg_elemental']],
    traits: ['shock_spread', 'kill_arc', 'chain_any', 'cast_on_shock'], keystone: 'core_storm_heart' },
  { id: 'blade', name: '刃域', hue: '#e0c8a0',
    small: ['dmg_physical', 'dmg_melee', 'added_physical_attack', 'attack_speed', 'chance_bleed', 'armour', 'crit_bonus'],
    notables: [['破军', 'dmg_melee', 'attack_speed'], ['血刃', 'ailment_bleed', 'chance_bleed'], ['铁壁', 'armour_inc', 'block']],
    traits: ['strike_targets', 'strike_splash', 'hit_fortify', 'bleed_explode'], keystone: 'core_resolute' },
  { id: 'venom', name: '毒域', hue: '#9fe07a',
    small: ['dmg_chaos', 'dmg_projectile', 'added_chaos_attack', 'chance_poison', 'ailment_poison', 'evasion', 'proj_speed'],
    notables: [['蛇蜕', 'evasion_inc', 'dmg_projectile'], ['毒心', 'ailment_poison', 'dot_inc'], ['穿杨', 'proj_speed', 'crit_bonus']],
    traits: ['proj_pierce', 'proj_chain', 'poison_spread', 'proliferate'], keystone: 'core_plague' },
  { id: 'wind', name: '风域', hue: '#c8b8ff',
    small: ['dmg_area', 'area_inc', 'duration', 'dmg_spell', 'dmg_minion', 'es', 'minion_life'],
    notables: [['风暴', 'dmg_area', 'area_inc'], ['魂契', 'minion_life', 'dmg_minion'], ['星辉', 'es_inc', 'cast_speed']],
    traits: ['zone_pull', 'area_cascade', 'kill_minion', 'zone_count'], keystone: 'core_maelstrom' },
];
// Keystones on the bridges between neighbouring domains (hybrid builds).
const BRIDGE_KEYSTONES = ['core_elemental_overload', 'core_resonance', 'core_endless_charges', 'core_gale', 'core_point_blank', 'core_spell_burst'];
const RING_SMALL = ['life', 'life_regen', 'res_all', 'life', 'mana_regen', 'avoid_ailment', 'life', 'reduced_hit', 'res_chaos', 'life', 'leech', 'move_speed'];
const RING_NOTABLES = [['坚韧', 'life', 'life_inc'], ['三相护符', 'res_all', 'res_chaos'], ['回春', 'life_regen', 'leech'], ['灵巧', 'move_speed', 'evasion'], ['不屈', 'reduced_hit', 'avoid_ailment'], ['魔泉', 'mana', 'mana_regen']];

function build() {
  const nodes = [], links = [];
  const add = (n) => { n.id = nodes.length; nodes.push(n); return n.id; };
  const link = (a, b) => { if (a !== b && !links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.push([a, b]); };
  const P = (r, a) => ({ x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) });
  const lineOf = (fid, kind) => ({ id: fid, tier: Math.min(family(fid).levels, TALENT_TIERS[kind]) });

  const start = add({ kind: 'start', name: '起点', domain: null, lines: [], ...P(0, 0) });
  // Inner ring: 18 nodes, a notable between every two domains; each domain's entrance links to the start.
  const RING = 18, ringIds = [];
  const domAngle = d => -Math.PI / 2 + d * Math.PI / 3;
  for (let i = 0; i < RING; ++i) {
    const a = -Math.PI / 2 + i / RING * Math.PI * 2;
    if (i % 3 === 0) ringIds.push(add({ kind: 'small', domain: null, lines: [lineOf(RING_SMALL[(i / 3 * 2) % RING_SMALL.length], 'small')], ...P(190, a), entrance: i / 3 }));
    else if (i % 3 === 2) { const [name, f1, f2] = RING_NOTABLES[(i - 2) / 3]; ringIds.push(add({ kind: 'notable', name, domain: null, lines: [lineOf(f1, 'notable'), lineOf(f2, 'notable')], ...P(190, a) })); }
    else ringIds.push(add({ kind: 'small', domain: null, lines: [lineOf(RING_SMALL[(i * 5) % RING_SMALL.length], 'small')], ...P(190, a) }));
  }
  for (let i = 0; i < RING; ++i) link(ringIds[i], ringIds[(i + 1) % RING]);
  for (let d = 0; d < 6; ++d) link(start, ringIds[d * 3]);

  const spines = [];
  DOMAINS.forEach((D, d) => {
    const th = domAngle(d);
    let si = 0;
    const small = () => lineOf(D.small[si++ % D.small.length], 'small');
    // Spine: ten steps outward with a gentle sway, three of them special (a trait, a notable, a trait).
    const spine = [];
    for (let k = 0; k < 10; ++k) {
      const r = 270 + k * 72, a = th + Math.sin(k * 1.1 + d) * 0.05;
      let node;
      if (k === 2) node = { kind: 'trait', lines: [lineOf(D.traits[0], 'trait')] };
      else if (k === 5) { const [name, f1, f2] = D.notables[0]; node = { kind: 'notable', name, lines: [lineOf(f1, 'notable'), lineOf(f2, 'notable')] }; }
      else if (k === 8) node = { kind: 'trait', lines: [lineOf(D.traits[1], 'trait')] };
      else node = { kind: 'small', lines: [small()] };
      spine.push(add({ ...node, domain: D.id, ...P(r, a) }));
      if (k) link(spine[k - 1], spine[k]);
    }
    link(ringIds[d * 3], spine[0]);
    const key = add({ kind: 'keystone', domain: D.id, lines: [lineOf(D.keystone, 'keystone')], ...P(270 + 10 * 72 + 40, th) });
    link(spine[9], key);
    // Clusters: a loop of five small nodes around a special one, hanging off the spine.
    const specials = [{ kind: 'notable', n: D.notables[1] }, { kind: 'trait', f: D.traits[2] }, { kind: 'notable', n: D.notables[2] }, { kind: 'trait', f: D.traits[3] }];
    const anchors = [1, 3, 6, 7];
    specials.forEach((sp, c) => {
      const side = c % 2 ? 1 : -1, k = anchors[c], r = 270 + k * 72 + 30, a = th + side * (0.26 + (r < 500 ? 0.12 : 0));
      const ctr = P(r, a);
      const centre = add({ ...(sp.kind === 'notable' ? { kind: 'notable', name: sp.n[0], lines: [lineOf(sp.n[1], 'notable'), lineOf(sp.n[2], 'notable')] } : { kind: 'trait', lines: [lineOf(sp.f, 'trait')] }), domain: D.id, ...ctr });
      const ring = [];
      for (let j = 0; j < 5; ++j) {
        const b = Math.atan2(ctr.y, ctr.x) + Math.PI + side * 0.3 + j / 5 * Math.PI * 2;
        ring.push(add({ kind: 'small', domain: D.id, lines: [small()], x: Math.round(ctr.x + Math.cos(b) * 62), y: Math.round(ctr.y + Math.sin(b) * 62) }));
      }
      for (let j = 0; j < 5; ++j) link(ring[j], ring[(j + 1) % 5]);
      link(centre, ring[2]); link(centre, ring[3]);
      // The loop node nearest the spine joins it.
      let best = ring[0], bd = Infinity;
      for (const id of ring) { const n = nodes[id], s = nodes[spine[k]], dd = (n.x - s.x) ** 2 + (n.y - s.y) ** 2; if (dd < bd) { bd = dd; best = id; } }
      link(best, spine[k]);
    });
    spines.push(spine);
  });
  // Bridges between neighbouring domains, with a hybrid keystone hanging outward from the middle.
  for (let d = 0; d < 6; ++d) {
    const e = (d + 1) % 6, a = nodes[spines[d][4]], b = nodes[spines[e][4]];
    const mid = domAngle(d) + Math.PI / 6, r = Math.hypot(a.x, a.y) + 40;
    const D = DOMAINS[d], E = DOMAINS[e], ids = [];
    for (let k = 0; k < 3; ++k) {
      const t = (k + 1) / 4, ang = domAngle(d) + (Math.PI / 3) * t;
      const f = k === 1 ? null : (k === 0 ? D : E).small[(k + d) % 7];
      ids.push(add(k === 1 ? { kind: 'notable', name: `${D.name[0]}${E.name[0]}交汇`, domain: null, lines: [lineOf(D.small[0], 'notable'), lineOf(E.small[0], 'notable')], ...P(r + 30, ang) }
        : { kind: 'small', domain: null, lines: [lineOf(f, 'small')], ...P(r, ang) }));
    }
    link(spines[d][4], ids[0]); link(ids[0], ids[1]); link(ids[1], ids[2]); link(ids[2], spines[e][4]);
    const kk = add({ kind: 'keystone', domain: null, lines: [lineOf(BRIDGE_KEYSTONES[d], 'keystone')], ...P(r + 190, mid) });
    const step = add({ kind: 'small', domain: null, lines: [lineOf(D.small[2], 'small')], ...P(r + 110, mid) });
    link(ids[1], step); link(step, kk);
  }
  const adj = nodes.map(() => []);
  for (const [a, b] of links) { adj[a].push(b); adj[b].push(a); }
  return { nodes, links, adj, start, domains: DOMAINS.map((D, d) => ({ id: D.id, name: D.name, hue: D.hue, angle: domAngle(d) })) };
}

export const TALENT_TREE = build();

/** Display text of a node's effects. */
export const talentLines = node => node.lines.map(l => affixLine(l.id, l.tier).name);
export const talentName = node => node.name ?? (node.kind === 'keystone' || node.kind === 'trait' ? affixLine(node.lines[0].id, node.lines[0].tier).name.split(/[：:]/)[0] : affixLine(node.lines[0].id, node.lines[0].tier).name);

/** Compiled affixes for a set of allocated node ids (the start node gives nothing). */
export function talentAffixes(allocated) {
  const out = [];
  for (const id of allocated) { const n = TALENT_TREE.nodes[id]; if (n) for (const l of n.lines) out.push(affixLine(l.id, l.tier)); }
  return out;
}

/** A node can be taken when it touches the start or an allocated node. */
export function canAllocate(allocated, id) {
  const set = allocated instanceof Set ? allocated : new Set(allocated);
  if (set.has(id) || id === TALENT_TREE.start) return false;
  return TALENT_TREE.adj[id].some(n => n === TALENT_TREE.start || set.has(n));
}

/** A node can be given back when everything else stays connected to the start. */
export function canRefund(allocated, id) {
  const set = new Set(allocated); if (!set.has(id)) return false;
  set.delete(id);
  const seen = new Set([TALENT_TREE.start]), queue = [TALENT_TREE.start];
  while (queue.length) for (const n of TALENT_TREE.adj[queue.shift()]) if (set.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  return [...set].every(n => seen.has(n));
}

/** Talent points: one per cleared atlas node, two for boss citadels. */
export const talentPoints = (doneNodes) => doneNodes.reduce((s, n) => s + (n.kind === 'boss' ? 2 : n.id === 0 ? 0 : 1), 0);

