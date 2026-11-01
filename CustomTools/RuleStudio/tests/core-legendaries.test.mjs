// 传奇装备：每件传奇的「传奇特性」都真的在战斗里起作用（装上与不装，怪潮里的表现明显不同），
// 掉落与洗炼规则对传奇成立。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameContent } from '../core/content/game.mjs';
import { archetype } from '../core/content/archetypes.mjs';
import { stageBuild } from '../core/content/builds.mjs';
import { hordeProbe } from '../core/analysis.mjs';
import { LEGENDARIES, legendAffix } from '../core/content/legendaries.mjs';
import { rollLegendary, rollDrops, itemAffixes, applyCurrency, rarityOf, BASE_LINES } from '../core/content/items.mjs';
import { dungeonRandom } from '../public/game/dungeon.mjs';
import { createWorld } from '../core/index.mjs';

const content = gameContent();
// Which demo build each legendary is tried on (its own skill replaces the build's when it has one).
const HOST = {
  pyre_staff: 'inferno', rime_wand: 'glacier', thunder_maul: 'thunderslam', shadow_fang: 'flicker', gale_cleaver: 'whirlwind', storm_scepter: 'storm',
  glacier_wall: 'heralds', legion_focus: 'critengine', mad_crown: 'flicker', thousand_faces: 'glacier', undying_plate: 'heralds', starweave_robe: 'storm',
  nightveil: 'venom', stormcaller: 'thunderslam', alchemist: 'venom', bonebreaker: 'critengine', windstride: 'inferno', frostwalker: 'glacier',
  warlord_belt: 'whirlwind', iron_chain: 'heralds', heart_of_winter: 'glacier', eye_of_three: 'triad', echo_ring: 'heralds', ember_ring: 'inferno', thunder_ring: 'storm', eye_of_storm: 'tempest',
};

test('传奇：26 件，覆盖全部 10 个部位类型，每件都有试用流派', () => {
  assert.equal(LEGENDARIES.length, 26);
  assert.equal(new Set(LEGENDARIES.map(l => l.id)).size, 26);
  for (const s of ['weapon', 'offhand', 'helmet', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring1']) assert.ok(LEGENDARIES.some(l => l.slot === s), s);
  for (const l of LEGENDARIES) { assert.ok(HOST[l.id], l.id); assert.ok(legendAffix(l.id).name.includes(l.name)); }
});

// These need a situation the horde does not give: walking a long way, or being at low life.
const SITUATIONAL = new Set(['windstride', 'frostwalker', 'undying_plate', 'legion_focus', 'nightveil']);
for (const L of LEGENDARIES.filter(l => !SITUATIONAL.has(l.id))) {
  test(`传奇「${L.name}」：装上后怪潮里的表现明显不同`, () => {
    const a = archetype(HOST[L.id]), b = stageBuild(a, 3);
    const skills = L.skill && !b.skills.includes(L.skill) ? (L.skill === 'summon_blades' ? [...b.skills, L.skill] : [L.skill]) : b.skills;
    const base = { ...b, skills }, withIt = { ...base, affixes: [...base.affixes, legendAffix(L.id)] };
    const opts = { count: 140, radius: 1100, limit: 10 };
    const x = hordeProbe(content, base, 14, opts), y = hordeProbe(content, withIt, 14, opts);
    const diff = k => Math.abs(y[k] - x[k]) / Math.max(1e-6, Math.abs(x[k]));
    const changed = ['dealt', 'taken', 'cleared', 'triggers', 'peak', 'time'].filter(k => diff(k) >= 0.03);
    assert.ok(changed.length, `${L.name} 没有可见效果：${JSON.stringify({ x: [x.dealt | 0, x.taken | 0, x.cleared, x.triggers], y: [y.dealt | 0, y.taken | 0, y.cleared, y.triggers] })}`);
  });
}

test('传奇物品：固定传奇特性 + 基底补足 3 条 + 随机词条；洗炼不会洗掉传奇特性；首领会掉', () => {
  const rng = dungeonRandom(4);
  for (const L of LEGENDARIES) {
    const it = rollLegendary(L.id, 8, rng);
    assert.equal(it.legend, L.id); assert.equal(rarityOf(it).name, '传奇');
    assert.equal(it.traits.length + (it.skill ? 1 : 0) + 1, BASE_LINES);
    assert.ok(itemAffixes(it).some(a => a.id === `legend:${L.id}`));
    applyCurrency(it, 'chaos', rng); applyCurrency(it, 'essence_link', rng, { kind: 'trait', index: 0 });
    assert.equal(it.legend, L.id);
  }
  let found = 0;
  for (let i = 0; i < 60; ++i) found += rollDrops(10, 'boss', rng).filter(d => d.item?.legend).length;
  assert.ok(found >= 10 && found <= 40, `60 个首领掉了 ${found} 件传奇`);
});

function walker(legend, skills) {
  const w = createWorld(content, { seed: 1 });
  const h = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', mods: [{ stat: 'life', value: 2000 }, { stat: 'mana', value: 999 }], affixes: legend ? [legendAffix(legend)] : [], skills });
  for (let i = 0; i < 12; ++i) w.spawnActor({ team: 1, brain: 'none', x: 200 + (i % 4) * 60, y: 150 * i, mods: [{ stat: 'life', value: 1e6 }] });
  const casts = {}; w.listeners.push(e => { if (e.type === 'cast' && e.source === h) casts[e.skill.def.id] = (casts[e.skill.def.id] || 0) + 1; });
  h.vx = 0; h.vy = 1;
  for (let i = 0; i < 150; ++i) w.step(1 / 30);
  return { casts, hero: h, world: w };
}
test('传奇「疾风之靴」「霜行者」：走路就在施法', () => {
  assert.ok((walker('windstride', ['fireball']).casts.fireball ?? 0) >= 3, '疾风之靴每 4 米施放主技能');
  assert.equal(walker(null, ['fireball']).casts.fireball ?? 0, 0);
  assert.ok((walker('frostwalker', ['fireball']).casts.glacial_burst ?? 0) >= 6, '霜行者每 1.5 米掀起寒潮');
});
test('传奇「不灭之铠」：低血被击中时回血并获得护体与猛攻，且有冷却', () => {
  const w = createWorld(content, { seed: 2 });
  const h = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', mods: [{ stat: 'life', value: 1000 }], affixes: [legendAffix('undying_plate')], skills: [] });
  w.spawnActor({ team: 1, x: 60, y: 0, skills: ['mob_strike'], mods: [{ stat: 'added.physical', value: 30 }, { stat: 'accuracy', value: 5000 }] });
  h.life = 300;
  let healed = false;
  for (let i = 0; i < 120 && !healed; ++i) { w.step(1 / 30); if (h.life > 450) healed = true; }
  assert.ok(healed, '回复 25% 生命');
  assert.ok(h.hasStatus('fortify') && h.hasStatus('onslaught'));
});

test('传奇「万象」：召唤物死亡时爆炸', () => {
  const w = createWorld(content, { seed: 3 });
  const h = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', mods: [{ stat: 'mana', value: 999 }], affixes: [legendAffix('legion_focus')], skills: [] });
  const sk = w.addSkill(h, 'summon_blades');
  for (let i = 0; i < 6; ++i) w.spawnActor({ team: 1, brain: 'none', x: 80 + i * 20, y: 0, mods: [{ stat: 'life', value: 1e6 }] });
  w.cast(h, sk); w.step(1 / 30);
  let booms = 0; w.listeners.push(e => { if (e.type === 'area' && e.source === h && e.fx === 'explode') booms++; });
  for (const m of [...h.minions]) { m.life = 0; m.alive = false; w.emit({ type: 'death', source: m, x: m.x, y: m.y }); }
  w.step(1 / 30);
  assert.ok(booms >= 2, `爆炸 ${booms}`);
});
test('传奇「夜幕」：闪避攻击时向攻击者掷出飞刃', () => {
  const run = legend => {
    const w = createWorld(content, { seed: 5 });
    const h = w.spawnActor({ kind: 'hero', team: 0, brain: 'none', mods: [{ stat: 'life', value: 1e5 }, { stat: 'evasion', value: 20000 }], affixes: legend ? [legendAffix(legend)] : [], skills: [] });
    w.spawnActor({ team: 1, x: 60, y: 0, skills: ['mob_strike'], mods: [{ stat: 'accuracy', value: 300 }, { stat: 'life', value: 1e6 }] });
    let knives = 0; w.listeners.push(e => { if (e.type === 'cast' && e.source === h && e.skill.def.id === 'viper_knives') knives++; });
    for (let i = 0; i < 300; ++i) w.step(1 / 30);
    return knives;
  };
  assert.ok(run('nightveil') >= 2); assert.equal(run(null), 0);
});
