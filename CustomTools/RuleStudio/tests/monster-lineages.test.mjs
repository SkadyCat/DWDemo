import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, validateTraitValueEntry, statusKey, MONSTER_RARITY_EQUIPMENT, ERedirect, EElement } from '../engine/index.mjs';
import { DungeonBattle, TowerRun } from '../public/sim/dungeon-battle.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const ids = ['glacial_deluge', 'thunder_saturated', 'abyssal_return', 'ember_apocalypse', 'bloodfeast_tyrant', 'prism_cataclysm'];
const startingIds = ['claw_beast', 'frost_caster', 'void_caster'];
const allIds = [...startingIds, ...ids];

function preview(id, { equipped = true, floor = 1 } = {}) {
  const doc = JSON.parse(JSON.stringify(check.monsters.get(id).doc));
  doc.equipment.rarity = MONSTER_RARITY_EQUIPMENT.common;
  // Explicit single-monster preview keeps isolated comparisons at the chosen floor.
  const b = new DungeonBattle(files, { collections: check.collections, monsterTypes: [doc], monsterPreview: true, floor, seed: 18 });
  b.setLoadout({ skills: [] }); b.step(1 / 60);
  const m = b.monsters[0];
  if (!equipped) b.setMonsterEquipment(m, 'lineage', null);
  b.monsters = [m];
  return { b, m };
}

// Use the live dungeon's real normalized skill, equipment and per-cast sheet path, with a durable
// hostile dummy instead of a player that dies before the volley finishes. No new combat formulas.
function measure(id, { equipped = true, floor = 1, pack = false } = {}) {
  const { b, m } = preview(id, { equipped, floor });
  const host = b.host, origin = { x: 0, y: 0, z: 60 }, aim = { x: 1, y: 0, z: 0 }, skill = m.type.skills[0];
  const tick = () => {
    host.beginTargets(); host.addTarget({ x: 150, y: 0, z: 60 }, 45, 1e9, 0, 999);
    if (pack) {
      host.addTarget({ x: 300, y: 80, z: 60 }, 45, 1e9, 0, 998);
      host.addTarget({ x: 450, y: -80, z: 60 }, 45, 1e9, 0, 997);
    }
    return host.stepFrame(1 / 60);
  };
  tick(); host.updateOwner(m.owner, origin, aim);
  const shots = [], hits = [], redirects = [];
  const redirectHook = host.world.redirectHook;
  host.world.redirectHook = (index, mode) => { redirects.push({ index, mode }); redirectHook?.(index, mode); };
  host.world.trace = (kind, row) => {
    if (kind === 'spawn') {
      const c = host.world.carriers, i = row.index;
      shots.push({ pierce: c.pierce[i], ricochet: c.ricochet[i], returns: c.ret[i], damage: c.damage[i] });
    }
    if (kind === 'damage' && row.TargetExternalId === 999) hits.push(row);
  };
  host.castBuild(skill.plan, m.owner, origin, aim, skill.power, plan => b.monsterCastSources(m, plan, skill.plan));
  for (let frame = 0; frame < 90; frame++) tick();
  return {
    b, m, shots, hits, redirects,
    primary: hits.find(row => !row.bDot),
    // Remove ordinary random criticals when comparing the same source's actual damage.
    hitDamage: hits.filter(row => !row.bDot).reduce((sum, row) => sum + row.raw / (row.bCritical ? 1.5 : 1), 0),
    statuses: Object.fromEntries(['chill', 'shock', 'ignite', 'freeze'].map(id => [id, host.world.getStatus(999, statusKey(id))])),
  };
}

test('谱系基础词条: all nine wear valid existing rolls; starting lineages stay T1 and advanced stay T10', () => {
  assert.equal(check.monsters.size, 9);
  for (const id of allIds) {
    const monster = check.monsters.get(id).doc, gear = check.collections.equipment.get(monster.equipment.lineage).doc;
    const starting = startingIds.includes(id), tier = starting ? 1 : 10;
    assert.equal(monster.enabled, true); assert.ok(monster.weight > 0);
    assert.equal(monster.minFloor, starting ? 1 : 11);
    assert.equal(gear.slot, 'lineage'); assert.equal(gear.tier, tier);
    assert.ok(gear.traits.length >= (starting ? 3 : 9));
    assert.equal(new Set(gear.traits.map(entry => entry.id)).size, gear.traits.length);
    for (const entry of gear.traits) {
      assert.ok(check.library.trait(entry.id), entry.id);
      assert.equal(entry.tier, tier);
      assert.equal(validateTraitValueEntry(check.library, entry), '', `${id}: ${entry.id}`);
    }
  }
});

test('谱系基础词条: life and flat damage affect actual monsters and casts, and unequipping removes them', () => {
  for (const id of allIds) {
    const base = measure(id, { equipped: false }), grown = measure(id);
    assert.ok(grown.m.maxHealth > base.m.maxHealth, `${id}: real life pool increases`);
    assert.ok(grown.hitDamage > base.hitDamage, `${id}: actual hit damage increases`);
    const flat = grown.m.equipmentCharacter.offense().flat;
    assert.ok(Object.values(flat).some(amount => amount > 0), `${id}: existing flat damage is aggregated`);
    if (id === 'prism_cataclysm') assert.ok(Object.values(flat).every(amount => amount === 16));
    grown.b.setMonsterEquipment(grown.m, 'lineage', null);
    assert.equal(grown.m.maxHealth, base.m.maxHealth, `${id}: unequip life`);
    assert.equal(grown.m.maxShield, base.m.maxShield, `${id}: unequip shield`);
    assert.ok(Object.values(grown.m.equipmentCharacter.offense().flat).every(amount => amount === 0));
  }
});

function receiveHit(id, element, equipped = true) {
  const { b, m } = preview(id, { equipped });
  m.speed = 0; m.cooldown = 999; m.skillCooldowns.fill(999);
  const before = m.health + m.shield;
  b.combat.hit(m.id, 40, element);
  b.step(1 / 60);
  return { loss: before - m.health - m.shield, health: m.health, maxHealth: m.maxHealth, shield: m.shield, maxShield: m.maxShield };
}

test('谱系基础词条: elemental resistances reduce real incoming damage and disappear on unequip', () => {
  for (const [id, element] of [['frost_caster', EElement.Frost], ['glacial_deluge', EElement.Frost], ['thunder_saturated', EElement.Lightning], ['ember_apocalypse', EElement.Fire], ['bloodfeast_tyrant', EElement.Poison]]) {
    const naked = receiveHit(id, element, false), equipped = receiveHit(id, element);
    assert.ok(naked.loss > 0 && equipped.loss > 0, `${id}: damage actually delivered`);
    assert.ok(equipped.loss < naked.loss, `${id}: ${equipped.loss} < ${naked.loss}`);
  }
});

test('谱系基础词条: shield affixes absorb real hits before life', () => {
  for (const id of ['void_caster', 'glacial_deluge', 'thunder_saturated', 'abyssal_return', 'prism_cataclysm']) {
    const hit = receiveHit(id, EElement.Physical);
    assert.ok(hit.maxShield > 0 && hit.shield < hit.maxShield, `${id}: shield absorbs damage`);
    if (hit.maxShield >= 40) assert.equal(hit.health, hit.maxHealth, `${id}: life remains full`);
    else assert.ok(hit.health < hit.maxHealth, `${id}: damage beyond shield reaches life`);
  }
});

test('灾厄谱系: four projectile lineages really fire nine shots with pierce; all six deal more actual damage', () => {
  for (const id of ids) {
    const base = measure(id, { equipped: false }), grown = measure(id);
    assert.ok(base.primary && grown.primary, `${id}: actual damage must happen`);
    assert.ok(grown.hitDamage > base.hitDamage * 1.5, `${id}: ${grown.hitDamage} must exceed ${base.hitDamage}`);
    if (grown.m.type.skills[0].id === 'frost_lance') {
      assert.equal(base.shots.length, 1); assert.equal(grown.shots.length, 9);
      assert.ok(grown.shots.every(shot => shot.pierce >= 4));
    }
    if (id === 'abyssal_return') assert.ok(grown.shots.every(shot => shot.returns >= 2));
    if (id === 'thunder_saturated') assert.ok(grown.shots.every(shot => shot.ricochet >= 4));
    console.log(JSON.stringify({ lineage: grown.m.name, shots: grown.shots.length, health: grown.m.maxHealth, actualHitDamage: +grown.hitDamage.toFixed(2), withoutLineage: +base.hitDamage.toFixed(2) }));
  }
});

test('灾厄谱系: chill / shock / ignite and six damage elements are delivered to a hostile target', () => {
  const frost = measure('glacial_deluge'), thunder = measure('thunder_saturated'), prism = measure('prism_cataclysm');
  assert.equal(frost.statuses.chill, 60);
  assert.equal(thunder.statuses.shock, 40);
  assert.equal(prism.statuses.chill, 60); assert.equal(prism.statuses.shock, 40); assert.ok(prism.statuses.ignite > 0);
  assert.deepEqual([...new Set(prism.hits.map(row => row.Element))].sort(), [0, 1, 2, 3, 4, 5]);
});

test('灾厄谱系: ricochet and return change real carrier directions after contact', () => {
  const thunder = measure('thunder_saturated', { pack: true }), abyss = measure('abyssal_return');
  assert.ok(thunder.redirects.some(row => row.mode === ERedirect.Ricochet));
  assert.ok(abyss.redirects.some(row => row.mode === ERedirect.Return));
});

test('灾厄谱系: life-to-damage lineages grow with actual tower life instead of a separate hidden bonus', () => {
  for (const id of ['abyssal_return', 'ember_apocalypse', 'bloodfeast_tyrant']) {
    const first = measure(id), fourth = measure(id, { floor: 4 });
    assert.ok(Math.abs(fourth.m.maxHealth / first.m.maxHealth - 8) < 1e-5);
    assert.ok(fourth.hitDamage / first.hitDamage > 1.2 ** 3 * 1.5, `${id}: life conversion adds damage beyond the ordinary tower multiplier`);
    fourth.b.setMonsterEquipment(fourth.m, 'lineage', null);
    const naked = measure(id, { equipped: false, floor: 4 });
    assert.ok(Math.abs(fourth.m.maxHealth - naked.m.maxHealth) < 1e-5);
  }
});

test('灾厄谱系: floors 1–10 only spawn the original three lineages in all waves and Boss', () => {
  const mild = ['claw_beast', 'frost_caster', 'void_caster'];
  const monsterTypes = [...check.monsters.values()].map(entry => entry.doc);
  for (let floor = 1; floor <= 10; floor++) {
    const b = new DungeonBattle(files, { collections: check.collections, monsterTypes, floor, monsterCount: 300, seed: floor * 18 });
    assert.deepEqual(b.monsterTypes.map(doc => doc.id).sort(), [...mild].sort());
    b.setLoadout({ skills: [] }); b.step(1 / 60);
    const seen = new Set();
    for (let wave = 0; wave < 3; wave++) {
      for (const m of b.monsters) {
        assert.ok(mild.includes(m.type.id), `floor ${floor}: ${m.type.id}`);
        seen.add(m.type.id); m.health = 0;
      }
      b.step(1 / 60);
    }
    assert.equal(b.spawned, 300);
    assert.equal(b.phase, 'boss');
    assert.ok(mild.includes(b.boss.type.id));
    assert.deepEqual([...seen].sort(), [...mild].sort());
  }
});

test('灾厄谱系: floor 11 normal mixed encounters really spawn all six advanced lineages', () => {
  const b = new DungeonBattle(files, { collections: check.collections, monsterTypes: [...check.monsters.values()].map(entry => entry.doc), floor: 11, monsterCount: 300, seed: 18 });
  assert.equal(b.monsterTypes.length, 9);
  b.setLoadout({ skills: [] }); b.step(1 / 60);
  const seen = new Set();
  for (let wave = 0; wave < 3; wave++) {
    for (const m of b.monsters) { seen.add(m.equipment.lineage?.id); m.health = 0; }
    b.step(1 / 60);
  }
  for (const id of ids) assert.ok(seen.has(`monster_lineage_${id}`), id);
});

test('灾厄谱系: advancing from floor 10 to 11 rebuilds the eligible pool from all authored types', () => {
  const tower = new TowerRun(files, { collections: check.collections, monsterTypes: [...check.monsters.values()].map(entry => entry.doc), seed: 18 });
  tower.floor = 10; tower.startFloor();
  assert.equal(tower.battle.monsterTypes.length, 3);
  tower.battle.phase = 'cleared';
  assert.equal(tower.advance(), true);
  assert.equal(tower.floor, 11);
  assert.equal(tower.battle.monsterTypes.length, 9);
  tower.battle.step(1 / 60);
  assert.ok(tower.battle.monsters.some(m => ids.includes(m.type.id)));
});

test('灾厄谱系: an ineligible pool cannot fall back to generic monsters; explicit preview still casts', () => {
  const doc = check.monsters.get('glacial_deluge').doc;
  const options = { collections: check.collections, monsterTypes: [doc], floor: 10 };
  assert.throws(() => new DungeonBattle(files, options), /第 10 层没有可刷新的怪物配置/);
  assert.throws(() => new DungeonBattle(files, { ...options, monsterTypes: [] }), /没有可刷新的怪物配置/);
  assert.throws(() => new DungeonBattle(files, { ...options, monsterTypes: [{ ...doc, enabled: false }], monsterPreview: true }), /没有可刷新的怪物配置/);
  const preview = measure('glacial_deluge');
  assert.equal(preview.b.floor, 1);
  assert.equal(preview.shots.length, 9);
  assert.ok(preview.primary);
});
