import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { validateTraitValueEntry } from '../engine/index.mjs';
import { createHunterContext, prepareHunterPreset, listHunterAffixes, removeHunterAffix,
  materializeHunterAffix, canReplaceHunterAffix, replaceHunterAffix, hunterScenarios,
  simulateHunter, runHunter, hunterFingerprint, compareHunterGroup } from '../public/bdhunter/analyzer.mjs';
import { sha256Bytes } from '../public/bdhunter/digest.mjs';

const files = readRuleFiles();
const context = createHunterContext(files);
const original = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/synergy_rime_thunder.json', import.meta.url), 'utf8'));
const fixture = () => prepareHunterPreset(context, original);
const scenario = hunterScenarios()[0];
const entry = (preset, id) => listHunterAffixes(preset, context.library).find(a => a.id === id);

test('BD Hunter：普通 HTTP 指纹回退与标准 SHA256 一致', () => {
  for (const input of ['', 'abc', '霜雷交响'.repeat(1000)]) assert.equal(sha256Bytes(new TextEncoder().encode(input)), createHash('sha256').update(input).digest('hex'));
});

test('BD Hunter：对照不修改预设，基础属性保持不变，替换保持词缀数量和合法十阶', () => {
  const before = JSON.stringify(original), preset = fixture(), ref = entry(preset, 'poison_resistance');
  const removed = removeHunterAffix(preset, ref);
  assert.equal(removed.instances[ref.uid].affixes.length, 5);
  assert.deepEqual(removed.instances[ref.uid].bases, preset.instances[ref.uid].bases);
  for (const tier of [1, 5, 10]) {
    const candidate = materializeHunterAffix(context.pool.find(a => a.id === 'more_lightning'), context.library, tier);
    candidate.traits.forEach(t => assert.equal(validateTraitValueEntry(context.library, t), ''));
    const replaced = replaceHunterAffix(preset, ref, candidate);
    assert.equal(replaced.instances[ref.uid].affixes.length, 6);
    assert.equal(replaced.instances[ref.uid].affixes[ref.index].tier, tier);
    assert.deepEqual(replaced.instances[ref.uid].bases, preset.instances[ref.uid].bases);
  }
  const duplicate = materializeHunterAffix(context.pool.find(a => a.id === 'armour'), context.library, 10);
  assert.equal(canReplaceHunterAffix(preset, ref, duplicate), false);
  assert.throws(() => replaceHunterAffix(preset, ref, duplicate), /重复|冲突/);
  assert.equal(JSON.stringify(original), before);
});

test('BD Hunter：真实冻结消费触发新星，拔除全部消费来源后断链，同种子结果可复现', () => {
  const preset = fixture(), options = { scenario, duration: 5, seed: 18 };
  const baseline = simulateHunter(context, preset, options);
  assert.ok(baseline.counters.consumedFreeze > 0);
  assert.ok(baseline.triggeredSkills.create_lightning_nova > 0);
  assert.deepEqual(simulateHunter(context, preset, options), baseline);
  let cut = removeHunterAffix(preset, entry(preset, 'freeze_consume'));
  cut = removeHunterAffix(cut, entry(cut, 'shock_consume'));
  const result = simulateHunter(context, cut, options);
  assert.ok(result.counters.freezes > 0);
  assert.equal(result.counters.triggered, 0);
  assert.ok(result.dps < baseline.dps);
});

test('BD Hunter：木桩抗性不虚增输出，操作停止与压力死亡使用真实资源和完整时长分母', () => {
  const preset = fixture(), options = { scenario, duration: 4, seed: 18 };
  const baseline = simulateHunter(context, preset, options);
  const removed = simulateHunter(context, removeHunterAffix(preset, entry(preset, 'poison_resistance')), options);
  assert.equal(baseline.dps, removed.dps);
  assert.equal(simulateHunter(context, preset, { ...options, input: { castFor: 0 } }).damage, 0);
  const dead = simulateHunter(context, preset, { ...options, scenario: hunterScenarios({ pressure: 10000 })[3] });
  assert.equal(dead.survived, false);
  assert.ok(dead.aliveSeconds < options.duration);
  assert.equal(dead.dps, dead.damage / options.duration);
  assert.ok(dead.manaMin >= 0);
  const firePressure = { ...scenario, incoming: { amount: 300, interval: 1, elements: ['fire'] } };
  const protectedHero = simulateHunter(context, preset, { ...options, scenario: firePressure });
  const unprotectedHero = simulateHunter(context, removeHunterAffix(preset, entry(preset, 'fire_resistance')), { ...options, scenario: firePressure });
  assert.ok(unprotectedHero.incomingTaken > protectedHero.incomingTaken, '压力必须经过规则世界抗性，不能绕过装备防御');
});

test('BD Hunter：完整报告带机制计数和来源指纹，参数错误在模拟前拒绝', async () => {
  const preset = fixture(), before = JSON.stringify(preset), progress = [];
  const report = await runHunter(context, preset, { duration: 2, seeds: [18], scenarios: [scenario],
    replacementKey: entry(preset, 'poison_resistance').key, candidateIds: ['more_lightning'],
    onProgress: p => progress.push(p), presetId: 'synergy_rime_thunder' });
  assert.equal(report.removals.length, 30);
  assert.equal(report.preset.name, '霜雷交响');
  assert.equal(report.replacements.length, 1);
  assert.equal(report.totalRuns, 32);
  assert.equal(progress.at(-1).done, progress.at(-1).total);
  assert.equal(JSON.stringify(preset), before);
  const cut = await compareHunterGroup(context, preset, report, { name: '双消费关闭', remove: ['freeze_consume', 'shock_consume'] });
  assert.equal(cut.measurements.single.counters.triggered, 0);
  assert.equal(cut.runs, 1);
  assert.equal(report.fingerprint, await hunterFingerprint(files, preset));
  const altered = structuredClone(preset); altered.instances[Object.keys(altered.instances)[0]].name += 'changed';
  assert.notEqual(report.fingerprint, await hunterFingerprint(files, altered));
  await assert.rejects(runHunter(context, preset, { candidateTier: 11 }), /阶级/);
  await assert.rejects(runHunter(context, preset, { candidateIds: ['nonexistent_affix'] }), /正常词缀池/);
  await assert.rejects(runHunter(context, preset, { isCancelled: () => true, candidateIds: [] }), /取消/);
});
