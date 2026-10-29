import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuleSet, rerollPool, rollEquipment, rerollWithCurrency, omenFamily, equipmentRandom, affixFamilies, rollValue, checkTagIndex } from '../engine/index.mjs';
import { readRuleFiles } from '../scripts/rule-files.mjs';

const set = checkRuleSet(readRuleFiles());
const { library, tags, collections } = set;

test('rule set with tag families loads; every trait tag has a family', () => {
  assert.equal(set.ok, true, set.error);
  assert.ok(tags);
  assert.equal(checkTagIndex(tags), '');
  for (const [id] of tags.families) assert.ok(rerollPool(library, tags, id).length > 0, `${id} has an empty pool`);
});

test('omen items name exactly one family', () => {
  const omens = [...collections.item.values()].map(e => e.doc).filter(d => d.category === 'omen');
  assert.ok(omens.length >= 1);
  for (const doc of omens) assert.ok(omenFamily(tags, doc), doc.id);
  const bad = readRuleFiles().concat({ path: 'Items/omen_bad.json', text: JSON.stringify({ id: 'omen_bad', name: 'x', category: 'omen', rarity: 'magic', stack: 1, tags: ['元素族', '武斗族'], traits: [] }) });
  assert.match(checkRuleSet(bad).error, /恰好一个族/);
});

test('currency rerolls any affix; an omen restricts the pool to its family', () => {
  const random = equipmentRandom(11);
  const item = rollEquipment(collections.equipment.get('stormband').doc, library, { random, rarity: 'rare' });
  const free = rerollWithCurrency(item, library, tags, { random });
  assert.equal(free.affixes.length, item.affixes.length);
  assert.equal(free.uid, item.uid);
  for (const family of ['guard', 'elemental', 'ballistic']) {
    for (let n = 0; n < 20; ++n) {
      const next = rerollWithCurrency(item, library, tags, { family, random });
      for (const affix of next.affixes) assert.ok(affixFamilies(tags, affix).includes(family), `${affix.id} not in ${family}`);
      assert.equal(new Set(next.affixes.map(a => a.id)).size, next.affixes.length);
    }
  }
  const one = rerollWithCurrency(item, library, tags, { family: 'guard', index: 1, random });
  assert.deepEqual(one.affixes.filter((_, i) => i !== 1), item.affixes.filter((_, i) => i !== 1));
  assert.ok(affixFamilies(tags, one.affixes[1]).includes('guard'));
});

test('rolled values range 50%-200% of default; integers stay integers; chances cap at 100', () => {
  let seed = 0;
  const random = () => (seed = (seed + 0.137) % 1);
  for (let i = 0; i < 50; ++i) {
    const v = rollValue('amount', 10, random);
    assert.ok(v >= 5 && v <= 20 && Number.isInteger(v), String(v));
    assert.ok(rollValue('chance', 80, random) <= 100);
  }
  assert.equal(rollValue('amount', 0, random), 0);
});

test('family editor: moving a tag changes memberships and the real omen pool after reload', () => {
  const files = readRuleFiles();
  const file = files.find(f => f.path === 'Tags/families.json');
  const doc = JSON.parse(file.text);
  doc.families.push({ id: 'storm_test', name: '雷暴测试', description: 'test' });
  doc.tags.lightning.family = 'storm_test';
  const changed = files.map(f => f === file ? { ...f, text: JSON.stringify(doc) } : f);
  const next = checkRuleSet(changed);
  assert.equal(next.ok, true, next.error);
  for (const id of ['lightning_damage', 'death_lightning']) {
    assert.ok(next.tags.familiesOf(id).includes('storm_test'), id);
    assert.ok(!next.tags.familiesOf(id).includes('elemental'), id);
  }
  assert.ok(next.tags.familiesOf('death_lightning').includes('offense'));
  const pool = rerollPool(next.library, next.tags, 'storm_test');
  assert.ok(pool.some(a => a.id === 'death_lightning'));
  assert.ok(pool.some(a => a.id === 'shocking_hits'), 'compound affix uses the same family index');
  assert.ok(!rerollPool(next.library, next.tags, 'elemental').some(a => a.id === 'shocking_hits'));
  assert.equal(omenFamily(next.tags, { category: 'omen', tags: ['雷暴测试族'] }), 'storm_test');
});

test('family editor: explicit membership is additive; removing it preserves derived tags', () => {
  const files = readRuleFiles();
  const file = files.find(f => f.path === 'Tags/families.json');
  const doc = JSON.parse(file.text);
  const before = tags.familiesOf('death_lightning');
  doc.traits.death_lightning = [...(doc.traits.death_lightning || []), 'guard'];
  const saved = () => checkRuleSet(files.map(f => f === file ? { ...f, text: JSON.stringify(doc) } : f));
  const next = saved();
  assert.equal(next.ok, true, next.error);
  assert.deepEqual(new Set(next.tags.familiesOf('death_lightning')), new Set([...before, 'guard']));
  assert.ok(rerollPool(next.library, next.tags, 'guard').some(a => a.id === 'death_lightning'));
  doc.traits.death_lightning = doc.traits.death_lightning.filter(t => t !== 'guard');
  const removed = saved();
  assert.equal(removed.ok, true, removed.error);
  assert.deepEqual(removed.tags.familiesOf('death_lightning'), before);
  assert.ok(removed.tags.tagsOf('death_lightning').includes('lightning'));
  delete doc.tags.lightning;
  assert.match(saved().error, /lightning.*没有分配族/);
});
