import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, RuleWorld, compileBuild, readTraitText, statusKey, EElement,
  equipmentAffixPool, createTraitValueEntry, validateTraitValueEntry, rollEquipmentAffix,
  equipmentRandom, createProgression, progressionLoadout } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), checked = checkRuleSet(files);
assert.ok(checked.ok, checked.error);
const { library, collections } = checked;
const noCrit = readTraitText(JSON.stringify({ id: 'splash_test_no_crit', modifiers: [
  { target: 'owner', stat: 'critical_chance', op: 'set', value: 0 },
] })).trait;
const near = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);

function run({ ids = ['create_ice_lance', 'splash'], params = {}, extra = [],
  targets = [[3, 0], [3, 1.2], [3, 4], [3, -1, 0]], health = 1000, frames = 90 } = {}) {
  const source = library.buildSource('', ids).source;
  assert.ok(source);
  source.traits = source.traits.map(t => params[t.id]
    ? { ...t, params: new Map([...t.params, ...Object.entries(params[t.id])]) } : t);
  source.traits.push(noCrit, ...extra);
  const compiled = compileBuild(source); assert.ok(compiled.plan, compiled.error);
  const world = new RuleWorld(); world.setStatusDefs(library.statusDefs());
  const plan = world.addPlan(compiled.plan), owner = world.addOwner(1, 0), events = [], rows = [];
  let peakProjectiles = 0;
  targets.forEach(([x, y, team = 1, hp = health], i) => world.targets.add(x, y, 0, .2, hp, team, 100 + i));
  world.trace = (kind, data) => events.push({ kind, ...data });
  world.cast(plan, owner, 0, 0, 0, 1, 0, 0, 17);
  for (let i = 0; i < frames; ++i) {
    world.step(1 / 60); peakProjectiles = Math.max(peakProjectiles, world.carriers.num);
    rows.push(...world.damageLog); world.damageLog.length = 0;
  }
  return { world, rows, events, peakProjectiles, areas: events.filter(e => e.kind === 'area' && e.effect === 'splash') };
}

test('溅射：同元素范围伤害包含主目标，范围外及友方不受伤', () => {
  const { rows, areas, world } = run();
  assert.equal(areas.length, 1); near(areas[0].radius, 2); near(areas[0].amount, 8);
  assert.deepEqual(rows.map(r => [r.TargetExternalId, r.Amount, r.Element]), [
    [100, 16, EElement.Frost], [100, 8, EElement.Frost], [101, 8, EElement.Frost],
  ]);
  assert.equal(world.activeRoots(), 0, 'completed splash does not hold a cast root');
});

test('溅射：未聚合溅射、只有溅射或只有范围命中时均不触发', () => {
  for (const ids of [['create_ice_lance'], ['splash']])
    assert.equal(run({ ids }).areas.length, 0, ids.join('+'));
  const area = run({ ids: ['create_flame_burst', 'splash'], targets: [[1, 0]] });
  assert.ok(area.rows.length > 0, 'the negative case must actually hit an enemy');
  assert.equal(area.areas.length, 0);
});

test('溅射：继承六种投射物元素，按请求伤害而非目标实际扣血计算', () => {
  for (const [element, tag] of Object.entries(EElement).filter(([key]) => key !== 'Cold')) {
    const name = element.toLowerCase();
    const projectile = readTraitText(JSON.stringify({ id: 'splash_test_emit', rules: [
      { id: 'cast', event: 'cast', actions: [{ op: 'emit', kind: 'test', element: name,
        tags: name === 'frost' ? ['frost', 'cold'] : [name], damage: 20, speed: 12, lifetime: 1 }] },
    ] })).trait;
    const { rows, areas } = run({ ids: ['splash'], extra: [projectile], targets: [[3, 0, 1, 1], [3, 1.2]] });
    assert.equal(areas.length, 1); near(areas[0].amount, 10);
    assert.ok(rows.some(r => r.TargetExternalId === 101 && r.Amount === 10 && r.Element === tag), name);
  }
});

test('溅射：多重五枚 × 穿透三次命中，各命中只产生一次溅射', () => {
  const targets = [-25, -12.5, 0, 12.5, 25].flatMap(angle => [4, 6, 8].map(distance =>
    [Math.cos(angle * Math.PI / 180) * distance, Math.sin(angle * Math.PI / 180) * distance]));
  const { rows, areas, peakProjectiles } = run({ ids: ['create_ice_lance', 'multiple_projectiles', 'pierce', 'splash'], targets, health: 100000 });
  assert.equal(peakProjectiles, 5);
  const direct = rows.filter(r => r.Amount === 12);
  assert.equal(direct.length, 15); assert.equal(areas.length, direct.length);
  assert.ok(areas.every(e => Math.abs(e.amount - 6) < .001));
});

test('溅射：次级伤害不递归、不追加命中火伤，也不隐式复制冰缓', () => {
  const { rows, areas, world } = run({ ids: ['create_ice_lance', 'chill', 'fire_damage', 'splash'] });
  assert.equal(areas.length, 1);
  assert.equal(rows.filter(r => r.Element === EElement.Fire).length, 1);
  assert.equal(rows.some(r => r.Element === EElement.Fire && r.TargetExternalId === 101), false);
  assert.ok(world.getStatus(100, statusKey('chill')) > 0);
  assert.equal(world.getStatus(101, statusKey('chill')), 0);
});

test('溅射：参数覆盖与现有范围修饰生效，零倍率不造成溅射伤害', () => {
  const area = readTraitText(JSON.stringify({ id: 'splash_test_area', modifiers: [
    { target: 'area', stat: 'radius', op: 'multiply', value: 2 },
  ] })).trait;
  const changed = run({ params: { splash: { radius: 3, ratio: .25 } }, extra: [area] });
  near(changed.areas[0].radius, 6); near(changed.areas[0].amount, 4);
  assert.ok(changed.rows.some(r => r.TargetExternalId === 102 && r.Amount === 4));
  assert.equal(run({ params: { splash: { ratio: 0 } } }).areas.length, 0);
});

test('溅射：进入投射族洗炼池，十阶参数遵守装备 T 阶', () => {
  const affix = equipmentAffixPool(library).find(a => a.id === 'splash'); assert.ok(affix);
  assert.ok(checked.tags.familiesOf('splash').includes('ballistic'));
  for (let tier = 1; tier <= 10; ++tier) {
    const entry = createTraitValueEntry(library, 'splash', { tier, random: () => .5 });
    assert.equal(validateTraitValueEntry(library, entry), '');
    const rolled = rollEquipmentAffix(affix, equipmentRandom(700 + tier), library, tier);
    assert.ok(rolled.tier >= 1 && rolled.tier <= tier);
  }
});

test('溅射：真实 3D 战斗通过装备聚合生效，卸装后消失，范围词条可放大溅射', () => {
  const state = createProgression(collections, library);
  const template = collections.equipment.get('frostthorn_staff').doc;
  const item = { uid: 'splash_test_weapon', baseId: template.id, name: template.name, slot: 'weapon',
    rarity: 'rare', tier: 10, level: 1, skill: 'frost_lance', legendary: null,
    affixes: [{ id: 'splash', name: '溅射', traits: [{ id: 'splash', params: { radius: 2, ratio: .5 }, with: [] }] }],
  };
  state.instances[item.uid] = item; state.loadout.equipment.weapon = item.uid;
  const battle = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, seed: 7 });
  const areas = [], trace = battle.host.world.trace;
  battle.host.world.trace = (kind, data) => { if (kind === 'area' && data.effect === 'splash') areas.push(data); trace(kind, data); };
  battle.setLoadout(progressionLoadout(state, collections));
  battle.spawnMonsters(2);
  battle.monsters.forEach((m, i) => Object.assign(m, { x: 300, y: i * 120, speed: 0,
    health: 10000, maxHealth: 10000, lastHealth: 10000, shield: 0, maxShield: 0, cooldown: 999, attackRange: 0, resistance: [0, 0, 0, 0] }));
  const cast = () => { battle.step(1 / 60); battle.host.castBuild(battle.hero.plan, battle.hero.owner,
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }); for (let n = 0; n < 60; ++n) battle.step(1 / 60); };
  cast(); assert.equal(areas.length, 1); near(areas[0].radius, 2);
  assert.ok(battle.monsters[1].health < 10000, 'neighbor takes actual combat damage');
  item.affixes.push({ id: 'area_size', name: '范围面积', traits: [{ id: 'area_size', params: { n: 100 }, with: [] }] });
  battle.setLoadout(progressionLoadout(state, collections)); cast();
  near(areas[1].radius, Math.sqrt(2) * 2);
  delete state.loadout.equipment.weapon;
  battle.setLoadout(progressionLoadout(state, collections));
  assert.equal(battle.host.world.plans[battle.hero.plan]?.traitIds.includes('splash') || false, false);
});
