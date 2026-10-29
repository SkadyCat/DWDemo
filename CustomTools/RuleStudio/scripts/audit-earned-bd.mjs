import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readRuleFiles, PROJECT_ROOT, TOOL_ROOT } from './rule-files.mjs';
import { checkRuleSet, equipmentRandom, rollEquipmentDrop, craftEquipment, listings } from '../engine/index.mjs';
const root = path.join(PROJECT_ROOT, 'Saved/TowerTests');
const text = fs.readFileSync(path.join(root, 'from-zero-bd.json'), 'utf8'), report = JSON.parse(text);
const check = checkRuleSet(readRuleFiles()); assert.ok(check.ok, check.error);
const random = equipmentRandom(report.seed ^ 0x4c4f4f54), crafting = equipmentRandom(report.seed ^ 0x43524146);
const expected = new Map(), inventory = structuredClone(report.initial.instances);
assert.equal(report.initial.stones, 0); assert.deepEqual(report.initial.owned, { skill: {}, equipment: {}, item: {} });
assert.equal(Object.keys(inventory).length, 1); assert.equal(inventory.starter_weapon.affixes.length, 0);
for (let kill = 1; kill <= report.final.stats.kills; kill++) {
  const item = rollEquipmentDrop(check.collections, check.library, { random, uid: `drop_${kill}` });
  if (item) expected.set(item.uid, item);
}
const shop = new Map(listings(check.collections, check.catalog).map(l => [l.id, l]));
let spent = 0, drops = 0, crafts = 0;
for (const event of report.events) {
  if (event.event === 'drop') {
    const item = expected.get(event.item.uid); assert.ok(item, event.item.uid);
    for (const key of Object.keys(event.item)) assert.deepEqual(event.item[key], item[key], `${item.uid}.${key}`);
    assert.ok(!inventory[item.uid]); inventory[item.uid] = item; drops++;
  }
  if (event.event === 'craft') {
    assert.deepEqual(event.before, inventory[event.before.uid], '洗炼前必须等于之前实际持有的装备');
    const replay = { instances: { [event.before.uid]: structuredClone(event.before) }, owned: { item: { [event.currency]: 1, ...(event.omen ? { [event.omen]: 1 } : {}) } }, loadout: { belt: [] } };
    const result = craftEquipment(replay, event.before.uid, { currencyId: event.currency, omenId: event.omen || '', index: event.index, random: crafting }, check.collections, check.library, check.tags);
    assert.ifError(result.error || null); const after = result.after;
    assert.deepEqual(after, event.after, '洗炼后必须等于顺序随机流的实际结果');
    assert.equal(event.cost, shop.get(event.currency).price + (event.omen ? shop.get(event.omen).price : 0));
    inventory[after.uid] = after; spent += event.cost; crafts++;
  }
  if (event.event === 'equip') assert.deepEqual(event.item.affixes, inventory[event.item.uid].affixes, '只能装备当时实际持有的数值');
}
assert.deepEqual(inventory, report.final.instances);
assert.equal(drops, expected.size); assert.equal(drops, report.final.progression.drops);
assert.equal(spent, report.final.stats.spent); assert.equal(report.final.stones, report.final.stats.earned - spent);
assert.equal(report.final.stats.kills, report.runs.reduce((sum, run) => sum + run.kills, 0));
const preset = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, '../../Content/Rules/Presets/frost_progression.json')));
for (const [slot, uid] of Object.entries(preset.equipment)) {
  assert.deepEqual({ ...preset.instances[uid], uid: report.final.loadout.equipment[slot] }, report.final.instances[report.final.loadout.equipment[slot]]);
}
assert.equal(preset.provenance.reportSha256, createHash('sha256').update(text).digest('hex'));
const result = { ok: true, seed: report.seed, attempts: report.runs.length, kills: report.final.stats.kills, drops, crafts, earned: report.final.stats.earned, spent,
  stones: report.final.stones, ownedInstances: Object.keys(inventory).length, presetExactCopy: true, sequentialLootAndCraftReplay: true };
fs.writeFileSync(path.join(root, 'from-zero-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
