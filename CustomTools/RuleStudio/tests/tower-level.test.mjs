import test from 'node:test';
import { TOWER_LIFE, TOWER_DAMAGE } from './rule-fixture.mjs';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import {
  checkRuleSet, emptyMonster, emptyMonsterSkill, parseMonster, validateMonster, serializeMonster,
  sourceFromEntry, newBuild, compileBuild, readTraitText, EStat, RuleWorld, equipmentAffixPool,
  monsterTowerEquipment, createPawnEquipment, pawnEquipmentSources, listings, rollEquipmentDrop,
} from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { DungeonBattle } from '../public/sim/dungeon-battle.mjs';

const files = readBaselineRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const tower = level => ({ id: 'monster_tower_level', params: { level } });
const calm = readTraitText(JSON.stringify({ id: 'test_no_crit', modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] })).trait;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(1e-5, Math.abs(expected) * 2e-6), `${actual} != ${expected}`);
const mustCompile = source => { const result = compileBuild(source); assert.ok(result.plan, result.error); return result.plan; };

test('塔层装备: tower slot validates gear, rejects the removed direct-trait path and stays outside player rolls', () => {
  const doc = { ...emptyMonster('tower_beast'), name: '测试怪物', skills: [emptyMonsterSkill()] };
  assert.equal(validateMonster(doc, check.library, check.collections), '');
  assert.deepEqual(parseMonster(serializeMonster(doc)).doc, doc);
  assert.match(validateMonster({ ...doc, traits: [tower(4)] }, check.library, check.collections), /必须来自塔地图属性槽装备/);
  assert.match(validateMonster({ ...doc, equipment: { tower: 'deleted_equipment' } }, check.library, check.collections), /装备或槽位无效/);
  assert.match(validateMonster({ ...doc, traits: ['missing_trait'] }, check.library), /未知怪物特性/);
  assert.match(parseMonster({ ...doc, traits: [tower(1), tower(2)] }).error, /重复/);
  assert.match(parseMonster({ ...doc, traits: [{ id: 'monster_tower_level', params: { level: Infinity } }] }).error, /有限数字/);
  assert.equal(equipmentAffixPool(check.library).some(entry => entry.id === 'monster_tower_level'), false);
  assert.equal(listings(check.collections, check.catalog).some(entry => entry.id === 'monster_tower_equipment'), false);
  assert.equal(rollEquipmentDrop({ equipment: new Map([['monster_tower_equipment', check.collections.equipment.get('monster_tower_equipment')]]) }, check.library, { chance: 1, random: () => 0 }), null);
});

test('塔层级: authored powers fold into ordinary stat partitions and saturate at existing engine limits', () => {
  for (const level of [1, 2, 5, 20, 1000]) {
    const source = sourceFromEntry(check.library, tower(level));
    const plan = mustCompile(newBuild(source.id, [source]));
    near(plan.stats.from(EStat.OwnerMaxLife, 80), Math.min(1e9, 80 * TOWER_LIFE ** (level - 1)));
    near(plan.stats.get(EStat.OwnerDamageMultiplier), Math.min(1e9, TOWER_DAMAGE ** (level - 1)));
  }
  for (const args of [[], [2], [2, 3, 4]]) {
    const source = readTraitText(JSON.stringify({ id: 'bad_power', modifiers: [{ target: 'owner', stat: 'max_life', op: 'multiply', value: { pow: args } }] })).trait;
    assert.match(compileBuild(newBuild(source.id, [source])).error, /pow.*2|1\.\.255/);
  }
  // Also exercise the runtime expression VM, beyond constant modifier folding.
  const source = readTraitText(JSON.stringify({ id: 'live_power', rules: [{ id: 'hit', event: 'cast', actions: [{ op: 'damage_area', radius: 2, amount: { pow: [{ event: 'amount' }, 2] }, element: 'physical' }] }] })).trait;
  const world = new RuleWorld(), plan = world.addPlan(mustCompile(newBuild(source.id, [source, calm])));
  const owner = world.addOwner(1, 1); world.targets.add(1, 0, 0, .4, 1000, 0, 100);
  world.step(1 / 60); // Build the target grid before the immediate area cast.
  world.cast(plan, owner, 0, 0, 0, 1, 0, 0, 7n, 7); world.step(1 / 60);
  near(world.damageLog[0].Amount, 49);
});

test('塔层级: projectile and secondary hits receive the same independent multiplier', () => {
  function measure(level) {
    const source = check.library.namedBuildSource('frost_lance', ['fire_damage']).source;
    source.traits.push(...pawnEquipmentSources(check.library, { tower: monsterTowerEquipment(check.collections, level) }).sources, calm);
    const world = new RuleWorld(), plan = world.addPlan(mustCompile(source)), owner = world.addOwner(1, 1);
    world.targets.add(3, 0, 0, .4, 1e6, 0, 100);
    world.cast(plan, owner, 0, 0, 0, 1, 0, 0, 7n);
    const rows = [];
    for (let i = 0; i < 90; i++) { world.step(1 / 60); rows.push(...world.damageLog); world.damageLog = []; }
    return rows;
  }
  const base = measure(1), grown = measure(5);
  assert.ok(base.length >= 2, 'primary and secondary hits both happened'); assert.equal(grown.length, base.length);
  base.forEach((row, i) => near(grown[i].Amount, row.Amount * TOWER_DAMAGE ** 4));
});

test('塔层装备: actual claw damage follows gear, unequipping removes growth without changing other pawns', () => {
  const doc = { ...emptyMonster('tower_beast'), name: '测试怪物', health: 80, speed: 0, traits: ['test_no_crit'], skills: [{ ...emptyMonsterSkill(), range: 200 }] };
  const ownFiles = [...files, { path: 'Traits/test_no_crit.json', text: JSON.stringify({ id: calm.id, modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] }) }];
  const battle = new Battle(ownFiles, { collections: check.collections, monsterTypes: [doc], maxMonsters: 0, spawnRate: 0, seed: 3 });
  battle.setLoadout({ skills: [] }); battle.spawnMonsters(2);
  const [m, other] = battle.monsters, heroLife = battle.hero.maxHealth;
  battle.setMonsterEquipment(m, 'tower', monsterTowerEquipment(check.collections, 5));
  near(m.maxHealth, m.baseMaxHealth * TOWER_LIFE ** 4); near(other.maxHealth, other.baseMaxHealth);
  Object.assign(m, { x: battle.hero.x - 100, y: battle.hero.y, cooldown: 99 });
  other.cooldown = 99; battle.step(1 / 60); m.cooldown = 0;
  const hits = []; battle.host.world.trace = (kind, row) => { if (kind === 'damage') hits.push(row); };
  battle.step(1 / 60);
  assert.equal(m.casts, 1); assert.equal(hits.length, 1);
  near(hits[0].raw, 7 * TOWER_DAMAGE ** 4); assert.ok(battle.damageTaken > 0);
  assert.equal(battle.hero.maxHealth, heroLife);
  // Reapplication replaces one affix, preserves damage already taken, and starts from base attributes.
  assert.deepEqual(Object.keys(battle.hero.equipment), ['tower', 'character']);
  assert.notEqual(m.equipment.tower, other.equipment.tower);
  assert.equal(m.traits.some(entry => entry.id === 'monster_tower_level'), false);
  m.health /= 2; battle.setMonsterEquipment(m, 'tower', m.equipment.tower); near(m.health, m.maxHealth / 2);
  battle.setMonsterEquipment(m, 'tower', monsterTowerEquipment(check.collections, 2)); near(m.maxHealth, m.baseMaxHealth * TOWER_LIFE); near(m.health, m.baseMaxHealth * TOWER_LIFE / 2);
  battle.setMonsterEquipment(m, 'tower', null); near(m.maxHealth, m.baseMaxHealth); near(m.health, m.baseMaxHealth / 2);
  assert.throws(() => battle.setMonsterTraits(m, [tower(9)]), /必须来自塔地图属性槽装备/);
  m.health = m.maxHealth; m.cooldown = 0; m.skillCooldowns = [0]; hits.length = 0;
  battle.step(1 / 60); near(hits[0].raw, 7);
});

test('塔层级: fired projectiles retain the compiled affix after their monster dies', () => {
  const doc = { ...emptyMonster('tower_caster'), name: '测试法师', speed: 0, skills: [{ ...emptyMonsterSkill('monster_bolt'), range: 600, cooldown: 99 }] };
  const battle = new Battle(files, { collections: check.collections, monsterTypes: [doc], maxMonsters: 0, spawnRate: 0 });
  battle.setLoadout({ skills: [] }); battle.spawnMonsters(1);
  const m = battle.monsters[0]; battle.setMonsterEquipment(m, 'tower', monsterTowerEquipment(check.collections, 5));
  Object.assign(m, { x: battle.hero.x - 400, y: battle.hero.y, cooldown: 0 });
  const hits = []; battle.host.world.trace = (kind, row) => { if (kind === 'damage') hits.push(row); };
  battle.step(1 / 60); assert.equal(m.casts, 1); assert.equal(hits.length, 0);
  m.health = 0;
  for (let i = 0; i < 90; i++) battle.step(1 / 60);
  assert.equal(battle.monsters.length, 0); assert.ok(hits.length > 0);
  const factor = hits[0].bCritical ? 1.5 : 1;
  near(hits[0].raw, doc.skills[0].power * TOWER_DAMAGE ** 4 * factor);
});

test('Pawn 固定槽: hero, monster and summon own independent slots; empty monster gear has no floor fallback', () => {
  const first = createPawnEquipment(), second = createPawnEquipment();
  first.tower = { id: 'local_item' }; assert.equal(second.tower, null);
  const doc = { ...emptyMonster('empty_slot'), name: '空槽怪物', equipment: { tower: null }, skills: [] };
  const battle = new DungeonBattle(files, { collections: check.collections, monsterTypes: [doc], floor: 5, seed: 18 });
  battle.setLoadout({ skills: ['sentinel'] }); battle.hero.casting = true;
  for (let i = 0; i < 24; i++) battle.step(1 / 60);
  assert.deepEqual(Object.keys(battle.hero.equipment), ['tower', 'character']);
  for (const m of battle.monsters) {
    assert.deepEqual(Object.keys(m.equipment), ['lineage', 'rarity', 'tower']); assert.equal(m.equipment.tower, null); near(m.maxHealth, m.baseMaxHealth);
    assert.equal(m.equipmentSources.length, 0);
  }
  const summon = battle.host.world.summons.find(s => !s.dead); assert.ok(summon);
  const state = battle.combat.minions.states.get(summon.id); assert.ok(state);
  assert.deepEqual(summon.equipment, { default: null });
  assert.equal(state.equipment, summon.equipment);
  assert.notEqual(summon.equipment, battle.hero.equipment);
  assert.notEqual(battle.monsters[0].equipment, battle.monsters[1].equipment);
});

test('怪物装备: existing life and fire flat affixes affect real attacks through collection aggregation', () => {
  const ownFiles = files.map(file => {
    if (file.path !== 'Equipment/monster_tower_equipment.json') return file;
    const doc = JSON.parse(file.text); doc.traits.push('life_base', { id: 'flat_fire', params: { n: 8 } });
    return { ...file, text: JSON.stringify(doc) };
  });
  ownFiles.push({ path: 'Traits/test_no_crit.json', text: JSON.stringify({ id: calm.id, modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] }) });
  const own = checkRuleSet(ownFiles); assert.ok(own.ok, own.error);
  const doc = { ...emptyMonster('equipment_beast'), name: '装备测试怪物', health: 80, speed: 0, traits: [calm.id], skills: [{ ...emptyMonsterSkill(), range: 200, cooldown: 99 }] };
  const battle = new Battle(ownFiles, { collections: own.collections, monsterTypes: [doc], maxMonsters: 0, spawnRate: 0, seed: 3 });
  battle.setLoadout({ skills: [] }); battle.spawnMonsters(1);
  const m = battle.monsters[0]; battle.setMonsterEquipment(m, 'tower', monsterTowerEquipment(own.collections, 3));
  near(m.maxHealth, (m.baseMaxHealth + 60) * TOWER_LIFE ** 2);
  Object.assign(m, { x: battle.hero.x - 100, y: battle.hero.y, cooldown: 99 });
  battle.step(1 / 60); m.cooldown = 0;
  const hits = []; battle.host.world.trace = (kind, row) => { if (kind === 'damage') hits.push(row); };
  battle.step(1 / 60); assert.equal(hits.length, 2, 'one claw hit plus one equipment fire hit');
  near(hits[0].raw, 7 * TOWER_DAMAGE ** 2); near(hits[1].raw, 8 * TOWER_DAMAGE ** 2);
  assert.ok(m.equipmentContributions.some(row => row.traitId === 'flat_fire' && row.kind === 'equipment'));
  // Same flat parameters on two skills must retain their different authored hit events in plan caches.
  const clawType = m.type;
  const strike = battle.host.compileNamedBuild('monster_strike'); assert.ok(strike.plan >= 0, strike.error);
  m.type = { ...m.type, skills: [{ ...m.type.skills[0], id: 'monster_strike', plan: strike.plan, power: 10 }] };
  m.cooldown = 0; m.skillCooldowns = [0]; hits.length = 0; battle.step(1 / 60);
  assert.equal(hits.length, 2); near(hits[0].raw, 10 * TOWER_DAMAGE ** 2); near(hits[1].raw, 8 * TOWER_DAMAGE ** 2);
  m.type = clawType;
  const gear = m.equipment.tower, maxLife = m.maxHealth;
  assert.throws(() => battle.setMonsterEquipment(m, 'tower', 'missing_gear'), /装备或槽位无效/);
  assert.equal(m.equipment.tower, gear); near(m.maxHealth, maxLife);
  battle.setMonsterEquipment(m, 'tower', null); near(m.maxHealth, m.baseMaxHealth);
  m.cooldown = 0; m.skillCooldowns = [0]; hits.length = 0; battle.step(1 / 60);
  assert.equal(hits.length, 1); near(hits[0].raw, 7);
});

test('塔层装备: all dungeon monsters and Boss receive independent gear; changing its trait changes growth', () => {
  const edited = files.map(file => {
    if (file.path !== 'Traits/monster_tower_level.json') return file;
    const doc = JSON.parse(file.text); doc.params.life_growth = 3; doc.params.damage_growth = 1.4;
    return { ...file, text: JSON.stringify(doc) };
  });
  for (const ruleFiles of [files, edited]) {
    const c = checkRuleSet(ruleFiles); assert.ok(c.ok, c.error);
    const battle = new DungeonBattle(ruleFiles, { collections: c.collections, monsterTypes: [...c.monsters.values()].map(e => e.doc), floor: 3, seed: 18, god: true });
    const actors = [];
    battle.step(1 / 60);
    actors.push(...battle.monsters);
    for (const m of actors) {
      const growth = ruleFiles === files ? TOWER_LIFE : 3;
      near(m.maxHealth, m.baseMaxHealth * growth ** 2);
      assert.equal(m.traits.filter(t => t.id === 'monster_tower_level').length, 0);
      assert.equal(m.equipment.tower.id, 'monster_tower_equipment');
      assert.equal(m.equipment.tower.traits.find(t => t.id === 'monster_tower_level').params.level, 3);
      near(battle.host.plan(m.traitPlan).stats.get(EStat.OwnerDamageMultiplier), (ruleFiles === files ? TOWER_DAMAGE : 1.4) ** 2);
      if (m.elite) near(m.maxShield, m.maxHealth * .25);
    }
    assert.ok(battle.boss);
    assert.equal(new Set(actors.map(m => m.equipment.tower)).size, actors.length);
  }
  const ownFiles = files.map(file => {
    if (file.path !== 'Equipment/monster_tower_equipment.json') return file;
    const doc = JSON.parse(file.text); doc.traits[0].params = { level: 99, life_growth: 4, damage_growth: 2 };
    return { ...file, text: JSON.stringify(doc) };
  });
  const own = checkRuleSet(ownFiles); assert.ok(own.ok, own.error);
  const battle = new DungeonBattle(ownFiles, { collections: own.collections, monsterTypes: [...own.monsters.values()].map(e => e.doc), floor: 3, seed: 18 });
  battle.step(1 / 60);
  for (const m of battle.monsters) {
    near(m.maxHealth, m.baseMaxHealth * 16);
    near(battle.host.plan(m.traitPlan).stats.get(EStat.OwnerDamageMultiplier), 4);
    assert.equal(m.equipment.tower.traits[0].params.level, 3, 'floor updates only its equipment level and preserves equipment growth overrides');
  }
});

test('地牢伤害: normal 10, rare 20 and Boss 30 aggregate into actual melee / projectile hits before tower growth', () => {
  const ownFiles = [...files, { path: 'Traits/test_no_crit.json', text: JSON.stringify({ id: calm.id, modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }] }) }];
  for (const id of ['monster_claw', 'monster_strike', 'monster_bolt', 'frost_lance', 'monster_nova']) for (const floor of [1, 4]) {
    const doc = { ...emptyMonster('test_damage'), name: '伤害测试怪物', speed: 0, traits: [calm.id], skills: [{ ...emptyMonsterSkill(id), range: 1000, cooldown: 99 }] };
    const battle = new DungeonBattle(ownFiles, { collections: check.collections, monsterTypes: [doc], monsterCount: 300, floor, seed: 18 });
    battle.setLoadout({ skills: [] }); battle.step(1 / 60);
    const normal = battle.monsters.find(m => !m.elite), rare = battle.monsters.find(m => m.elite);
    assert.ok(normal && rare);
    const boss = battle.boss; assert.ok(boss);
    for (const [monster, base] of [[normal, 10], [rare, 20], [boss, 30]]) {
      assert.equal(monster.baseDamage, base);
      const skill = monster.type.skills.find(skill => skill.id === id);
      assert.equal(skill.power, base);
      // A controlled live cast uses the monster's compiled skill and aggregated traits.
      const host = battle.host; host.world.sweepObstacle = null;
      const origin = { x: 0, y: 0, z: 60 }, aim = { x: 1, y: 0, z: 0 };
      host.beginTargets(); host.addTarget({ x: 100, y: 0, z: 60 }, 45, 1e6, 0, 999);
      host.stepFrame(1 / 60);
      host.updateOwner(monster.owner, origin, aim);
      const hits = [];
      host.world.trace = (kind, row) => { if (kind === 'damage' && row.TargetExternalId === 999) hits.push(row); };
      host.castBuild(skill.plan, monster.owner, origin, aim, skill.power, () => monster.traitSources);
      for (let i = 0; i < 90 && hits.length === 0; i++) host.stepFrame(1 / 60);
      assert.ok(hits.length, `${id}, floor ${floor}, base ${base} must deal real damage`);
      near(hits[0].raw, base * (id === 'monster_nova' ? .6 : 1) * TOWER_DAMAGE ** (floor - 1));
    }
    const shared = battle.host.library.namedBuildSource(id).source;
    const original = shared.traits.find(trait => trait.id === shared.activeId);
    if (id === 'monster_claw') assert.equal(original.params.get('damage'), 7);
    if (id === 'frost_lance') assert.equal(original.params.get('damage'), 16);
  }
});
