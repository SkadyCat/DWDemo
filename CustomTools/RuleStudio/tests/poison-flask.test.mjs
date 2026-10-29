import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, RuleHost, newBuild, readTraitText, EEndReason, createTraitValueEntry, validateTraitValueEntry } from '../engine/index.mjs';
import * as THREE from '../public/vendor/three.module.js';
import { createFlaskProjectiles, createPoisonBurst } from '../public/prefabs/poison-flask.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { characterPanel } from '../public/battle-panels.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const near = (a, b) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
const dt = 1 / 60;
function fixture({ extras = [], burst = true, poison = true, at = [[300, 0], [340, 100], [300, 420]] } = {}) {
  const ownFiles = files.map(file => {
    if (file.path === 'Equipment/venomglass_flask.json' && extras.length) {
      const doc = JSON.parse(file.text); doc.rarity = 'unique'; doc.traits.push(...extras); return { ...file, text: JSON.stringify(doc) };
    }
    if (file.path !== 'Builds/poison_flask.json') return file;
    const doc = JSON.parse(file.text);
    doc.traits = ['throw_poison_flask', ...(burst ? ['poison_flask_burst'] : []), ...(poison ? ['poison_flask_poison'] : []), 'flask_no_crit'];
    return { ...file, text: JSON.stringify(doc) };
  });
  ownFiles.push({ path: 'Traits/flask_no_crit.json', text: JSON.stringify({ id: 'flask_no_crit', modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] }) });
  const own = checkRuleSet(ownFiles); assert.ok(own.ok, own.error);
  const b = new Battle(ownFiles, { collections: own.collections, maxMonsters: 0, spawnRate: 0, seed: 3 });
  b.setLoadout({ skills: ['poison_flask'], equipment: { weapon: 'venomglass_flask' } });
  b.spawnMonsters(at.length);
  b.monsters.forEach((m, i) => Object.assign(m, { x: at[i][0], y: at[i][1], speed: 0, health: 10000, maxHealth: 10000, lastHealth: 10000, maxShield: 0, shield: 0, cooldown: 999, attackRange: 0, resistance: [0, 0, 0, 0] }));
  const rows = [], events = [];
  const step = b.host.stepFrame.bind(b.host), trace = b.host.world.trace;
  b.host.stepFrame = delta => { const out = step(delta); rows.push(...out); return out; };
  b.host.world.trace = (kind, payload) => { events.push({ ...payload, kind }); trace(kind, payload); };
  b.step(dt);
  const origin = { x: 60, y: 0, z: 60 }, aim = { x: 1, y: 0, z: 0 };
  const cast = (target = [300, 0]) => b.host.castBuild(b.hero.plan, b.hero.owner, origin, aim, b.hero.power || 0, plan => {
    const extra = b.combat.planSource(plan); return extra ? [extra] : [];
  }, { x: target[0], y: target[1], z: 0 });
  const tick = frames => { for (let i = 0; i < frames; i++) b.step(dt); };
  return { b, rows, events, cast, tick };
}

test('毒瓶: three independent components retain their weapon binding and allow existing support traits', () => {
  const build = check.collections.skill.get('poison_flask').doc;
  assert.equal(build.active, 'throw_poison_flask');
  assert.deepEqual(build.traits.slice(0, 3).map(entry => entry.id), ['throw_poison_flask', 'poison_flask_burst', 'poison_flask_poison']);
  for (const entry of build.traits.slice(3)) assert.ok(check.library.trait(entry.id).source.rules.every(rule => rule.event !== 'cast'), 'extra entries support the poison flask rather than add another skill entry');
  assert.deepEqual(check.collections.equipment.get('venomglass_flask').doc.skills, ['poison_flask']);
  for (const id of ['throw_poison_flask', 'poison_flask_burst', 'poison_flask_poison']) for (let tier = 1; tier <= 10; tier++) {
    assert.equal(validateTraitValueEntry(check.library, createTraitValueEntry(check.library, id, { tier, random: () => .5 })), '');
  }
  const { b } = fixture(); const family = b.combat.skillFamily();
  assert.ok(family.projectile && family.area && family.poison);
  const points = characterPanel(b).damagePoints;
  assert.ok(points.primary.some(row => row.amount === 8 && row.element === 'poison'));
  assert.ok(points.added.some(row => row.amount === 18 && row.detail.includes('撞击')));
  assert.ok(points.added.some(row => row.amount === 18 && row.detail.includes('飞行结束')));
});

test('毒瓶: impact bursts exactly once, damages neighbors, applies layered poison and deals real DoT', () => {
  const { b, rows, events, cast, tick } = fixture();
  cast(); tick(30);
  const [direct, neighbor, outside] = b.monsters;
  const bursts = events.filter(row => row.kind === 'area' && row.effect === 'poison_flask_burst');
  assert.equal(bursts.length, 1); near(bursts[0].radius, 2.4);
  assert.ok(rows.filter(row => !row.bDot && row.TargetExternalId === direct.id).some(row => row.Amount === 8));
  assert.ok(rows.some(row => !row.bDot && row.TargetExternalId === neighbor.id && row.Amount === 18));
  assert.equal(rows.some(row => row.TargetExternalId === outside.id), false);
  assert.equal(b.combat.ailments.layers(direct.id, 'poison'), 1);
  assert.equal(b.combat.ailments.layers(neighbor.id, 'poison'), 1);
  tick(120);
  assert.ok(rows.some(row => row.bDot && row.Element === 4 && row.TargetExternalId === neighbor.id));
  assert.equal(b.combat.ailments.layers(neighbor.id, 'poison'), 0);
  assert.equal(b.poisonBursts.length, 0, 'presentation expires with no persistent damaging pool');
  assert.equal(events.filter(row => row.kind === 'area' && row.effect === 'poison_flask_burst').length, 1);
});

test('毒瓶: expiry lands at the selected point, multi adds real bottles and area size enlarges the splash', () => {
  const base = fixture({ at: [[720, 150]] }); base.cast([720, 0]); base.tick(45);
  const burst = base.events.find(row => row.kind === 'area' && row.effect === 'poison_flask_burst');
  assert.ok(burst); assert.ok(burst.x > 6.9 && burst.x < 7.5); near(burst.y, 0);
  assert.ok(base.rows.some(row => !row.bDot && row.Amount === 18));
  const grown = fixture({ extras: ['multiple_projectiles', 'area_size'], at: [[300, 0]] });
  grown.cast(); grown.tick(45);
  assert.equal(grown.events.filter(row => row.kind === 'spawn').length, 5);
  const splashes = grown.events.filter(row => row.kind === 'area' && row.effect === 'poison_flask_burst');
  assert.equal(splashes.length, 5); assert.ok(splashes.every(row => row.radius > 2.4));
});

test('毒瓶: removing burst or poison modules removes only their corresponding behavior', () => {
  const noBurst = fixture({ burst: false }); noBurst.cast(); noBurst.tick(90);
  assert.equal(noBurst.events.some(row => row.kind === 'area'), false);
  assert.ok(noBurst.rows.some(row => row.Amount === 8)); assert.equal(noBurst.rows.some(row => row.bDot), false);
  const noPoison = fixture({ poison: false }); noPoison.cast(); noPoison.tick(150);
  assert.ok(noPoison.rows.some(row => row.Amount === 18)); assert.equal(noPoison.rows.some(row => row.bDot), false);
});

test('毒瓶: existing poison damage and duration affixes modify the same layered poison runtime', () => {
  const base = fixture(), stronger = fixture({ extras: ['poison_increased', 'poison_duration'] });
  base.cast(); stronger.cast(); base.tick(40); stronger.tick(40);
  const a = base.b.combat.ailments.poison.get(base.b.monsters[1].id).layers[0];
  const z = stronger.b.combat.ailments.poison.get(stronger.b.monsters[1].id).layers[0];
  near(z.dps / a.dps, 1.3); near(z.total / z.dps, 2.6); near(a.total / a.dps, 2);
});

test('毒瓶表现: pooled bottle transforms are finite, splash expires and resources can be disposed', () => {
  const flask = createFlaskProjectiles(THREE, 2);
  flask.update(Array.from({ length: 3 }, () => ({ x: 1, y: 1.7, z: 2, vx: 12, vy: 0, radius: .16, age: .2, lifetime: .55 })));
  for (const mesh of flask.group.children) { assert.equal(mesh.count, 2); assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite)); near(mesh.instanceMatrix.array[13], 1.7); }
  flask.update([]); assert.ok(flask.group.children.every(mesh => mesh.count === 0));
  const burst = createPoisonBurst(THREE); burst.update(.2); assert.equal(burst.group.visible, true);
  burst.update(.8); assert.equal(burst.group.visible, false);
  flask.dispose(); burst.dispose(); assert.equal(flask.group.children.length, 0); assert.equal(burst.group.children.length, 0);
});

test('毒瓶: manual cast uses the chosen mouse point, including a close click, without following later aim or movement', () => {
  for (const target of [[900, 450], [20, 0]]) {
    const { b, events, tick } = fixture({ at: [] });
    tick(60); b.setAim(...target); b.hero.casting = true;
    tick(1); b.hero.casting = false; assert.equal(b.hero.casts, 1);
    b.setAim(-1000, 800); b.hero.move = { x: -1, y: 0 };
    tick(50);
    const bursts = events.filter(row => row.kind === 'area' && row.effect === 'poison_flask_burst');
    assert.equal(bursts.length, 1); near(bursts[0].x, target[0] / 100); near(bursts[0].y, target[1] / 100);
  }
});

test('毒瓶: unrelated projectiles cannot create flask explosions and a splash does not re-trigger generic on-hit traits', () => {
  const own = fixture({ extras: ['fire_damage'] }); own.cast(); own.tick(45);
  const direct = own.b.monsters[0], neighbor = own.b.monsters[1];
  assert.ok(own.rows.some(row => row.Element === 0 && row.TargetExternalId === direct.id));
  assert.equal(own.rows.some(row => row.Element === 0 && row.TargetExternalId === neighbor.id), false);
  const h = new RuleHost(); assert.ok(h.loadRuleLibrary(files).ok);
  const thrower = readTraitText(JSON.stringify({ id: 'other_thrower', rules: [{ id: 'cast', event: 'cast', actions: [{ op: 'emit', kind: 'other', element: 'poison', damage: 1, lifetime: .1 }] }] })).trait;
  const source = check.library.namedBuildSource('poison_flask').source;
  const compiled = h.compileSource(newBuild(source.activeId, [...source.traits.filter(t => t.id !== source.activeId), { ...thrower, id: source.activeId }]));
  assert.ok(compiled.plan >= 0, compiled.error);
  const owner = h.registerOwner(1, 0), areas = [];
  h.world.trace = (kind, row) => { if (kind === 'area') areas.push(row); };
  h.castBuild(compiled.plan, owner, { x: 0, y: 0, z: 60 }, { x: 1, y: 0, z: 0 });
  for (let i = 0; i < 30; i++) h.stepFrame(dt);
  assert.equal(areas.length, 0);
  const flask = h.compileNamedBuild('poison_flask');
  h.castBuild(flask.plan, owner, { x: 0, y: 0, z: 60 }, { x: 1, y: 0, z: 0 }); h.stepFrame(dt);
  h.world.endProjectile(0, EEndReason.Capacity); h.stepFrame(dt);
  assert.equal(areas.length, 0, 'capacity cleanup does not manufacture a splash');
});
