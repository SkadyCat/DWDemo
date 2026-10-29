import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaselineRuleFiles as readRuleFiles } from './rule-fixture.mjs';
import { checkRuleSet, emptyMonster, emptyMonsterSkill, parseMonster, validateMonster, serializeMonster, readMonsters } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';

function fixture(skills = [emptyMonsterSkill('test_monster_bolt')], props = {}) {
  const files = [...readRuleFiles(), { path: 'Builds/test_monster_bolt.json', text: JSON.stringify({ id: 'test_monster_bolt', active: 'monster_bolt', traits: ['monster_bolt'] }) }];
  const check = checkRuleSet(files); assert.ok(check.ok, check.error);
  const doc = { ...emptyMonster('test_caster'), name: '测试怪物', speed: 0, skills, ...props };
  const battle = new Battle(files, { collections: check.collections, monsterTypes: [doc], maxMonsters: 0, spawnRate: 0 });
  battle.setLoadout({ skills: [] });
  battle.spawnMonsters(1);
  const m = battle.monsters[0]; Object.assign(m, { x: -400, y: 0, cooldown: 0 });
  return { files, check, doc, battle, m };
}
const step = (battle, frames) => { for (let i = 0; i < frames; i++) battle.step(1 / 60); };

test('怪物: authored configs round-trip, validate skill references and reject invalid saves', () => {
  const files = readRuleFiles(), check = checkRuleSet(files);
  assert.ok(check.ok, check.error); assert.ok(check.monsters.size >= 3);
  for (const entry of check.monsters.values()) {
    assert.deepEqual(parseMonster(serializeMonster(entry.doc)).doc, entry.doc);
    assert.equal(validateMonster(entry.doc, check.library), '');
  }
  const doc = { ...emptyMonster('test'), name: '测试', skills: [emptyMonsterSkill()] };
  const { minFloor, ...withoutFloor } = doc;
  assert.equal(parseMonster(withoutFloor).doc.minFloor, 1);
  assert.equal(parseMonster({ ...doc, minFloor: 11 }).doc.minFloor, 11);
  for (const value of [0, -1, 1.5, Infinity, null, '11']) assert.match(parseMonster({ ...doc, minFloor: value }).error, /开始出现层数/);
  assert.match(parseMonster({ ...doc, health: -1 }).error, /生命/);
  assert.match(parseMonster({ ...doc, unknown: true }).error, /未知/);
  assert.match(parseMonster({ ...doc, skills: [{ ...doc.skills[0], cooldown: 0 }] }).error, /冷却/);
  assert.match(validateMonster({ ...doc, skills: [emptyMonsterSkill('deleted_skill')] }, check.library), /未知技能/);
  assert.match(readMonsters([{ path: 'Monsters/wrong.json', text: serializeMonster(doc) }], check.library).get('test').error, /文件名/);
  const missing = files.filter(f => !/^builds[\\/]monster_claw\.json$/i.test(f.path));
  assert.equal(checkRuleSet(missing).ok, false, 'a referenced skill cannot disappear from the whole rule set');
});

test('怪物: casting uses range and independent cooldown, projectiles hurt the hero and spare allies', () => {
  const { battle, m } = fixture([{ ...emptyMonsterSkill('test_monster_bolt'), range: 300, cooldown: 2, power: 9 }]);
  step(battle, 30);
  assert.equal(m.casts, 0, 'no cast outside configured range');
  assert.equal(battle.hero.health, battle.hero.maxHealth);
  m.x = -250;
  battle.spawnMonsters(1);
  const ally = battle.monsters[1]; Object.assign(ally, { x: -100, y: 0, cooldown: 99 });
  step(battle, 40);
  assert.equal(m.casts, 1);
  assert.ok(battle.damageTaken > 0, 'the configured skill creates actual enemy damage');
  assert.ok(battle.hero.health < battle.hero.maxHealth);
  assert.equal(ally.health, ally.maxHealth, 'enemy projectiles do not damage another monster');
  assert.equal(m.health, m.maxHealth);
  step(battle, 60); assert.equal(m.casts, 1, 'cooldown prevents repeated casts');
  step(battle, 30); assert.equal(m.casts, 2);
});

test('怪物: first ready in-range skill wins; freeze pauses casts and their cooldowns', () => {
  const { battle, m } = fixture([
    { ...emptyMonsterSkill('monster_strike'), range: 200, cooldown: 2 },
    { ...emptyMonsterSkill('monster_claw'), range: 200, cooldown: 1 },
  ]);
  m.x = -100;
  const seen = []; battle.onMonsterCast = (_, skill) => seen.push(skill.id);
  step(battle, 1); assert.deepEqual(seen, ['monster_strike']);
  step(battle, 25); assert.deepEqual(seen, ['monster_strike', 'monster_claw']);
  battle.host.applyStatus(m.id, 'freeze', 1, 1);
  const cooldowns = [...m.skillCooldowns], casts = m.casts;
  step(battle, 30);
  assert.equal(m.casts, casts); assert.deepEqual(m.skillCooldowns, cooldowns);
  step(battle, 100);
  assert.ok(m.casts > casts, 'casting resumes when freeze expires');
});

test('怪物: stop distance, weight / enabled settings and per-monster status ownership', () => {
  const { files, check, doc } = fixture([], { stopDistance: 200, speed: 300, health: 123 });
  const battle = new Battle(files, { collections: check.collections, monsterTypes: [doc, { ...doc, id: 'disabled', enabled: false }, { ...doc, id: 'zero', weight: 0 }], maxMonsters: 0, spawnRate: 0 });
  battle.setLoadout({ skills: [] }); battle.spawnMonsters(20);
  // 精英（约 8%）：气血 ×3，并带有护盾。
  assert.ok(battle.monsters.every(m => m.type.id === doc.id && m.health === (m.elite ? 369 : 123) && m.speed === 300));
  assert.ok(battle.monsters.filter(m => m.elite).every(m => m.shield > 0 && m.name.startsWith('精英')));
  const m = battle.monsters.find(x => !x.elite); battle.monsters = [m]; Object.assign(m, { x: -210, y: 0 });
  step(battle, 30);
  assert.ok(Math.abs(m.x) <= 200 && Math.abs(m.x) >= 190, 'monster stops at configured distance');
  assert.equal(battle.host.world.owners[m.owner].statusId, m.id);
  assert.notEqual(battle.host.world.owners[m.owner].statusId, HERO_TARGET_ID);
  const off = new Battle(files, { collections: check.collections, monsterTypes: [{ ...doc, enabled: false }] });
  step(off, 120); assert.equal(off.monsters.length, 0, 'no fallback monsters when every type is disabled');
});
