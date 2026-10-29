import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, validateTraitValueEntry } from '../engine/index.mjs';
import { createBuildGuide, buildGuideFromLibrary } from '../public/build-guide/model.mjs';

const files = readRuleFiles();
const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/synergy_rime_thunder.json', import.meta.url), 'utf8'));

test('构筑图鉴：所有追求词条存在，参考数值遵守当前阶级，预设装备数值保持原样', () => {
  const checked = checkRuleSet(files); assert.ok(checked.ok, checked.error);
  const before = JSON.stringify(preset), texts = [];
  for (const tier of [1, 5, 10]) {
    const guide = createBuildGuide(files, preset, tier);
    assert.deepEqual(buildGuideFromLibrary(checked.library, checked.collections, preset, tier), guide, 'HUD复用已加载规则与离线读取结果一致');
    const walk = entry => { assert.equal(validateTraitValueEntry(checked.library, entry), ''); entry.with.forEach(walk); };
    for (const row of [...guide.groups.flatMap(group => group.rows), ...guide.steps.flatMap(step => step.affixes)]) {
      assert.ok(row.name); assert.doesNotMatch(row.name, /\bn\b|undefined/); row.traits.forEach(walk);
    }
    assert.equal(guide.legendary.fixedName, '消耗目标异常状态时，有100%概率触发雷霆新星');
    for (const item of guide.equipment) assert.deepEqual(item.affixes, preset.instances[item.uid].affixes);
    assert.equal(guide.preset.count, 5); assert.equal(guide.preset.affixes, 30);
    texts.push(guide.groups[1].rows[0].name);
  }
  assert.notEqual(texts[0], texts[2]);
  assert.equal(JSON.stringify(preset), before);
});

test('构筑图鉴：缺失词条、缺失装备与不支持的参考阶级会报错，避免展示虚构构筑', () => {
  assert.throws(() => createBuildGuide(files, preset, 3), /参考阶级/);
  const without = files.filter(file => file.path !== 'Affixes/trigger_repeat.json');
  assert.throws(() => createBuildGuide(without, preset), /trigger_repeat|不存在/);
  const bad = structuredClone(preset); bad.instances[bad.equipment.weapon].baseId = 'missing_base';
  assert.throws(() => createBuildGuide(files, bad), /参考装备不存在/);
});
