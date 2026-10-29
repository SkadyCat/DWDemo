import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, progressionLoadout } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { AverageTargetDps } from '../public/sim/damage-meter.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/autocast_mana_restored.json', import.meta.url), 'utf8'));

function measure(doc = preset, { targets = 1, resistance = 0, seconds = 20 } = {}) {
  const save = createProgression(check.collections, check.library);
  assert.equal(applyBuildPreset(save, doc, check.collections, check.library).error, '');
  const meter = new AverageTargetDps();
  let rows = 0, zones = 0;
  const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: false, seed: 18,
    onDamageDealt: row => { meter.record(row.TargetExternalId, row.Amount); rows++; if (row.Info?.zone !== undefined) zones++; } });
  b.setLoadout(progressionLoadout(save, check.collections));
  b.spawnMonsters(targets);
  for (let i = 0; i < b.monsters.length; i++) Object.assign(b.monsters[i], { x: 600, y: i * 20, health: 1e9, maxHealth: 1e9,
    speed: 0, cooldown: 9999, shield: 0, maxShield: 0, attackRange: 0, resistance: Array(4).fill(resistance) });
  b.setAim(600, 0);
  b.hero.casting = true;
  for (let i = 0; i < 1200 && b.hero.casts < 2; i++) b.step(1 / 60);
  b.hero.casting = false;
  assert.equal(b.hero.casts, 2);
  for (let i = 0; i < 300; i++) { meter.advance(1 / 60); b.step(1 / 60); }
  rows = 0; zones = 0;
  let sum = 0, minimum = Infinity;
  for (let i = 0; i < seconds * 60; i++) {
    meter.advance(1 / 60); b.step(1 / 60);
    sum += meter.value; minimum = Math.min(minimum, meter.value);
  }
  return { average: sum / (seconds * 60), minimum, damageRowsPerSecond: rows / seconds,
    areaHitsPerSecond: zones / seconds, mana: b.character.mana, life: b.hero.health,
    casts: b.hero.casts, god: b.hero.god, baseFire: b.character.stat('damage.flat.fire') };
}

test('回蓝自燃：应用新版五件，已有旧装备与洗炼结果保留，重复应用不重复发放', () => {
  const save = createProgression(check.collections, check.library);
  const old = {};
  for (const item of Object.values(preset.instances)) {
    const uid = item.uid.replace(/_v\d+_/, '_');
    old[uid] = { ...structuredClone(item), uid, reforgeTargets: [1] };
    save.instances[uid] = structuredClone(old[uid]);
    save.loadout.equipment[item.slot] = uid;
  }
  const count = Object.keys(save.instances).length;
  for (let i = 0; i < 2; i++) assert.equal(applyBuildPreset(save, preset, check.collections, check.library).error, '');
  assert.deepEqual(save.loadout.equipment, preset.equipment);
  for (const [uid, item] of Object.entries(old)) assert.deepEqual(save.instances[uid], item);
  assert.equal(Object.keys(save.instances).length, count + 5);
});

test('回蓝自燃：只手动启动两次，单体与三目标均值在75火抗下持续超过4000秒伤', () => {
  for (const targets of [1, 3]) {
    const result = measure(preset, { targets, resistance: 75 });
    assert.ok(result.average >= 4000, JSON.stringify({ targets, ...result }));
    assert.ok(result.minimum >= 4000, JSON.stringify({ targets, ...result }));
    assert.ok(result.mana > 90); assert.ok(result.life > 0);
    assert.equal(result.casts, 2); assert.equal(result.god, false);
    console.log(`回蓝自燃 ${targets}目标/75抗：${JSON.stringify(result)}`);
  }
});

test('回蓝自燃：范围重复提供高频命中，去掉点伤后自动输出确实下降', () => {
  const full = measure();
  const withoutFlat = structuredClone(preset), withoutRepeats = structuredClone(preset);
  for (const item of Object.values(withoutFlat.instances)) item.affixes = item.affixes.filter(a => a.id !== 'fire_base');
  for (const item of Object.values(withoutRepeats.instances)) item.affixes = item.affixes.filter(a => a.id !== 'area_repeats');
  const noFlat = measure(withoutFlat), noRepeats = measure(withoutRepeats);
  assert.ok(full.areaHitsPerSecond >= 15, JSON.stringify(full));
  assert.ok(full.average > noFlat.average * 1.5, JSON.stringify({ full, noFlat }));
  assert.ok(full.areaHitsPerSecond > noRepeats.areaHitsPerSecond * 5, JSON.stringify({ full, noRepeats }));
});
