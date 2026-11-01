import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import * as engine from '../engine/index.mjs';
import { VENOM_STAGES, createVenomPreset, venomIndexRows } from '../scripts/create-venom-bd.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), check = engine.checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections } = check;
const read = id => JSON.parse(fs.readFileSync(new URL(`../../../Content/Rules/Presets/${id}.json`, import.meta.url), 'utf8'));

test('万毒飞刃：技能本身只是扇形毒刃，形态全部来自装备词条', () => {
  const skill = library.trait('create_viper_knives').source;
  assert.equal(skill.rules.length, 1, 'only the cast rule; no baked growth');
  assert.deepEqual(library.build('viper_knives').traits, ['create_viper_knives']);
});

test('万毒飞刃：五个阶段可复现，后一阶段保留前一阶段全部词条并提高 T 阶，每阶只新增少量关键词条', () => {
  const index = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url), 'utf8'));
  assert.deepEqual(index.filter(r => r.group === 'venom_blades'), venomIndexRows(library));
  let previous = new Set(), lastTier = 0;
  for (const s of VENOM_STAGES) {
    const preset = read(`venom_blades_${s.stage}`);
    assert.deepEqual(preset, createVenomPreset(s.stage, library, collections, { ...engine, applyBuildPreset }));
    const ids = new Set(Object.values(preset.instances).flatMap(i => i.affixes.map(a => a.id)));
    for (const id of previous) assert.ok(ids.has(id), `${s.stage} keeps ${id}`);
    assert.ok(preset.authored.newLines.length >= 1 && preset.authored.newLines.length <= 4);
    assert.ok(s.tier > lastTier); lastTier = s.tier; previous = ids;
    for (const item of Object.values(preset.instances)) { assert.equal(item.tier, s.tier); assert.ok(item.affixes.length <= 6); }
    const save = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
    assert.equal(applyBuildPreset(save, preset, collections, library).error, '');
    assert.equal(Object.values(save.instances)[0].tier, s.tier, 'stage presets keep their tier');
  }
});

// Same monsters for every stage: each stage must clear clearly faster than the one before.
function clearRate(n, seconds = 12) {
  const preset = n ? read(`venom_blades_${n}`) : { skills: ['viper_knives', null, null, null], equipment: { weapon: 'viperfang_knives' }, belt: [] };
  const save = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
  applyBuildPreset(save, preset, collections, library);
  const battle = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: true, seed: 3 });
  battle.setLoadout({ ...save.loadout, instances: save.instances });
  let seed = 9, peak = 0; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  battle.hero.casting = true;
  for (let i = 0; i < seconds * 60; ++i) {
    const alive = battle.monsters.filter(m => m.health > 0);
    if (alive.length < 16) { const cx = 500 + rnd() * 500, cy = (rnd() - .5) * 700; battle.spawnMonsters(8);
      for (const m of battle.monsters) if (m.health > 0 && !m.p) Object.assign(m, { x: cx + (rnd() - .5) * 300, y: cy + (rnd() - .5) * 300, health: 400, maxHealth: 400, speed: 0, cooldown: 1e9, shield: 0, maxShield: 0, attackRange: 0, p: 1 }); }
    const t = alive.sort((a, b) => Math.hypot(a.x - battle.hero.x, a.y - battle.hero.y) - Math.hypot(b.x - battle.hero.x, b.y - battle.hero.y))[0];
    if (t) battle.setAim(t.x, t.y);
    battle.step(1 / 60); peak = Math.max(peak, battle.report?.Projectiles || 0);
  }
  return { kills: battle.kills, peak };
}

test('万毒飞刃实战：每多一阶清怪明显更快，飞刀形态越来越密', () => {
  const rows = [0, 1, 2, 3, 4, 5].map(n => clearRate(n));
  for (let i = 1; i < rows.length; ++i) assert.ok(rows[i].kills >= rows[i - 1].kills * 1.4, `stage ${i}: ${JSON.stringify(rows)}`);
  assert.ok(rows[5].peak >= rows[0].peak * 4, JSON.stringify(rows));
});
