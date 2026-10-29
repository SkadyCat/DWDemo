import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readRuleFiles, PROJECT_ROOT } from './rule-files.mjs';
import { checkRuleSet, traitTierProfile, rollEquipment, rerollWithCurrency, equipmentRandom, equipmentAffixPool, listings } from '../engine/index.mjs';

const folder = path.join(PROJECT_ROOT, 'Saved/RulesMigration');
if (process.argv.includes('--compare')) {
  const expected = JSON.parse(fs.readFileSync(path.join(folder, 'economy-parity.json'))).expected;
  const actual = JSON.parse(fs.readFileSync(path.join(folder, 'economy-native.json')));
  const compare = (e, a, at = '') => {
    if (typeof e === 'number') { assert.ok(typeof a === 'number' && Number.isFinite(a) && Math.abs(e - a) <= Math.max(1e-8, Math.abs(e) * 1e-9), `${at}: ${e} != ${a}`); return; }
    if (Array.isArray(e)) { assert.ok(Array.isArray(a), at); assert.equal(a.length, e.length, `${at}.length`); e.forEach((v, i) => compare(v, a[i], `${at}[${i}]`)); return; }
    if (e && typeof e === 'object') { assert.ok(a && typeof a === 'object', at); for (const key of Object.keys(e)) compare(e[key], a[key], `${at}.${key}`); return; }
    assert.equal(a, e, at);
  };
  compare(expected, actual, 'economy');
  console.log(`economy parity: ${Object.keys(expected.profiles).length} value profiles, ${Object.keys(expected.tags).length} trait tag sets, ${expected.rolls.length} equipment rolls/rerolls match`);
} else {
  const check = checkRuleSet(readRuleFiles()); if (!check.ok) throw new Error(check.error);
  const L = check.library;
  const profiles = Object.fromEntries([...L.traits.keys()].filter(id => traitTierProfile(L, id)).map(id => [id, traitTierProfile(L, id)]));
  const tags = Object.fromEntries([...L.traits.keys()].map(id => [id, { tags: check.tags.tagsOf(id), families: check.tags.familiesOf(id) }]));
  const cleanEntry = e => ({ id: e.id, params: e.params || {}, with: (e.with || []).map(cleanEntry), tier: e.tier || 0, duration: e.duration || 0 });
  const cleanAffix = a => ({ id: a.id, name: a.name, tier: a.tier || 0, traits: a.traits.map(cleanEntry) });
  const cleanItem = item => ({ uid: item.uid, baseId: item.baseId, name: item.name, slot: item.slot, level: item.level, tier: item.tier, rarity: item.rarity, skill: item.skill || '', bases: (item.bases || []).map(cleanAffix), affixes: item.affixes.map(cleanAffix), legendary: item.legendary ? cleanAffix(item.legendary) : null });
  const inputs = [], rolls = [];
  let index = 0;
  for (const [, { doc }] of check.collections.equipment) if (!['lineage','rarity','tower','character','default'].includes(doc.slot)) for (const rarity of ['common', 'magic', 'rare', 'legendary']) {
    const seed = 100 + index, uid = `native_test_${index++}`;
    const tier = 1 + index % 10;
    const item = rollEquipment(doc, L, { rarity, tier, random: equipmentRandom(seed), uid });
    const input = { template: doc.id, rarity, tier, seed, uid, rerollSeed: seed + 1, family: '' };
    const result = { item: cleanItem(item), rerolled: null };
    if (item.affixes.length) result.rerolled = cleanItem(rerollWithCurrency(item, L, check.tags, { random: equipmentRandom(input.rerollSeed) }));
    inputs.push(input); rolls.push(result);
  }
  for (const family of check.tags.doc.families) {
    const seed = 400 + index, uid = `native_test_${index++}`, doc = check.collections.equipment.values().next().value.doc;
    const tier = 1 + index % 10;
    const item = rollEquipment(doc, L, { rarity: 'rare', tier, random: equipmentRandom(seed), uid });
    inputs.push({ template: doc.id, rarity: 'rare', tier, seed, uid, rerollSeed: seed + 1, family: family.id });
    rolls.push({ item: cleanItem(item), rerolled: cleanItem(rerollWithCurrency(item, L, check.tags, { family: family.id, random: equipmentRandom(seed + 1) })) });
  }
  const shop = listings(check.collections, check.catalog).map(({ key, kind, id, name, description, rarity, price, custom }) => ({ key, kind, id, name, description, rarity, price, custom }));
  const expected = { profiles, tags, pool: equipmentAffixPool(L).map(a => a.id), rolls, shop };
  fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, 'economy-parity.json'), JSON.stringify({ version: 1, inputs, expected }));
  console.log(`economy fixture: ${rolls.length} rolls/rerolls, ${Object.keys(profiles).length} value profiles`);
}
