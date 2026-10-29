import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, createProgression, rollEquipmentAffix, equipmentAffixPool, equipmentRandom,
  validateTraitValueEntry } from '../engine/index.mjs';
import { createSynergyPresets, SYNERGY_BDS } from '../scripts/create-synergy-bds.mjs';
import { TRIGGER_SKILL_AFFIXES } from '../engine/trigger-skill-affixes.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { Battle } from '../public/sim/battle.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const { library, collections } = check;
const published = id => JSON.parse(fs.readFileSync(new URL(`../../../Content/Rules/Presets/${id}.json`, import.meta.url), 'utf8'));
const without = (preset, ids) => {
  const clone = structuredClone(preset);
  for (const item of Object.values(clone.instances)) item.affixes = item.affixes.filter(a => !ids.includes(a.id));
  return clone;
};

function arena(preset, { enemies = 6, health = 1e8, seed = 18 } = {}) {
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god: false, seed });
  b.setLoadout(preset); assert.ok(b.hero.plan >= 0, b.hero.error);
  b.spawnMonsters(enemies);
  b.monsters.forEach((m, i) => Object.assign(m, { x: 500 + i % 3 * 80, y: (Math.floor(i / 3) - .5) * 90,
    health, maxHealth: health, speed: 0, cooldown: 9999, shield: 0, maxShield: 0, attackRange: 0, resistance: [0, 0, 0, 0] }));
  b.setAim(550, 0);
  const stats = { triggered: 0, nova: 0, guards: 0, flasks: 0, freezes: 0, consumedFreeze: 0, consumedShock: 0,
    detonations: 0, lastTrigger: 0, maxProjectiles: 0, maxQueue: 0, minMana: b.character.mana };
  const register = b.combat.register.bind(b.combat);
  b.combat.register = (index, data) => {
    if (data.kind === 'trigger') {
      stats.triggered++; stats.lastTrigger = b.elapsed;
      const traits = b.host.plan(b.host.world.roots[index].plan).traitIds;
      if (traits.includes('create_lightning_nova')) stats.nova++;
      if (traits.includes('summon_iron_guard')) stats.guards++;
    }
    return register(index, data);
  };
  const trace = b.host.world.trace;
  b.host.world.trace = (type, data) => { trace?.(type, data); if (type === 'spawn' && data.plan.kindNames.names[data.kind] === 'poison_flask') stats.flasks++; };
  const ailment = b.combat.triggers.ailment.bind(b.combat.triggers);
  b.combat.triggers.ailment = (type, ...args) => { if (type === 'freeze') stats.freezes++; return ailment(type, ...args); };
  for (const [method, stat] of [['removeFreeze', 'consumedFreeze'], ['consumeShock', 'consumedShock'], ['detonateNow', 'detonations']]) {
    const original = b.combat.ailments[method].bind(b.combat.ailments);
    b.combat.ailments[method] = (...args) => { stats[stat]++; return original(...args); };
  }
  const tick = (seconds, casting = false) => {
    b.hero.casting = casting;
    for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
      b.step(1 / 60);
      stats.maxProjectiles = Math.max(stats.maxProjectiles, b.host.world.carriers.num);
      stats.maxQueue = Math.max(stats.maxQueue, b.combat.triggers.queue.length);
      stats.minMana = Math.min(stats.minMana, b.character.mana);
    }
    b.hero.casting = false;
  };
  return { b, stats, tick };
}

test('联动BD：三种复合词条进入正常掉落/洗炼池，完整技能载荷按同一T阶生成', () => {
  const pool = equipmentAffixPool(library);
  for (const recipe of TRIGGER_SKILL_AFFIXES) {
    const definition = pool.find(a => a.id === recipe.id); assert.ok(definition, recipe.id);
    for (const maxTier of [1, 5, 10]) {
      const rolled = rollEquipmentAffix(definition, equipmentRandom(maxTier), library, maxTier);
      const walk = trait => { assert.equal(validateTraitValueEntry(library, trait), '');
        if (trait.tier) assert.equal(trait.tier, rolled.tier);
        trait.with.forEach(walk); };
      rolled.traits.forEach(walk);
      const payload = new Set(rolled.traits[0].with.map(t => t.id));
      recipe.skills.forEach(id => collections.skill.get(id).doc.traits.forEach(t => assert.ok(payload.has(t.id))));
      assert.ok(rolled.tier >= 1 && rolled.tier <= maxTier);
    }
  }
});

test('联动BD：体验装备合法、可复现，一键应用与反复切换保留原有物品和通货', () => {
  const save = createProgression(collections, library); save.stones = 345; save.owned.item.chaos_orb = 7;
  const starter = structuredClone(save.instances.starter_weapon);
  const index = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/index.json', import.meta.url), 'utf8'));
  for (const { config, preset } of createSynergyPresets(library, collections)) {
    assert.deepEqual(preset, published(config.id)); assert.equal(index.filter(r => r.id === config.id).length, 1);
    for (const item of Object.values(preset.instances)) {
      assert.equal(item.rarity, 'rare'); assert.equal(item.tier, 10); assert.equal(item.affixes.length, 6);
      assert.equal(new Set(item.affixes.map(a => a.id)).size, 6);
    }
    for (let i = 0; i < 2; i++) assert.equal(applyBuildPreset(save, preset, collections, library).error, '');
    assert.deepEqual(save.loadout.skills, preset.skills);
  }
  assert.equal(Object.keys(save.instances).length, 16); assert.equal(save.stones, 345);
  assert.equal(save.owned.item.chaos_orb, 7); assert.deepEqual(save.instances.starter_weapon, starter);
});

test('霜雷交响：实际冻结、消费冻结、触发新星并消费感电；拔掉消费词条会切断新星', t => {
  const preset = published('synergy_rime_thunder'), full = arena(preset);
  full.tick(20, true);
  assert.ok(full.stats.freezes > 10, JSON.stringify(full.stats));
  assert.ok(full.stats.consumedFreeze > 10 && full.stats.nova > 10 && full.stats.consumedShock > 10, JSON.stringify(full.stats));
  const cut = arena(without(preset, ['freeze_consume', 'shock_consume'])); cut.tick(20, true);
  assert.ok(cut.stats.freezes > 0); assert.equal(cut.stats.nova, 0);
  assert.ok(full.b.damageDealt > cut.b.damageDealt);
  assert.equal(full.b.hero.god, false); assert.equal(full.b.character.dead, false);
  t.diagnostic(JSON.stringify({ build: '霜雷交响', seconds: 20, ...full.stats }));
});

test('瘟疫回潮：起手后松开施法仍持续引爆并生成毒瓶，移除层数引爆后不再续发', t => {
  const preset = published('synergy_plague_tide'), full = arena(preset);
  full.tick(3, true); const casts = full.b.hero.casts, damage = full.b.damageDealt;
  full.tick(297);
  assert.ok(full.stats.detonations > 10 && full.stats.triggered > 10 && full.stats.flasks > 10, JSON.stringify(full.stats));
  assert.ok(full.stats.lastTrigger > full.b.elapsed - 3, JSON.stringify(full.stats));
  assert.equal(full.b.hero.casts, casts); assert.ok(full.b.damageDealt > damage);
  assert.ok(full.stats.minMana >= 90, 'the two ordinary cost-reduction lines sustain the loop without resource injection');
  const cut = arena(without(preset, ['poison_threshold_detonate'])); cut.tick(3, true); cut.tick(25);
  assert.equal(cut.stats.detonations, 0); assert.equal(cut.stats.triggered, 0);
  assert.ok(full.b.damageDealt > cut.b.damageDealt);
  for (const id of ['trigger_repeat']) {
    const broken = arena(without(preset, [id])); broken.tick(3, true); broken.tick(25);
    assert.ok(broken.stats.lastTrigger < broken.b.elapsed - 5, `${id}: ${JSON.stringify(broken.stats)}`);
  }
  t.diagnostic(JSON.stringify({ build: '瘟疫回潮', seconds: 300, manualSeconds: 3, ...full.stats }));
});

test('瘟疫回潮：真实T10触发毒瓶在消费位置附近撞击或落地，不再向外飞26.4米', () => {
  const { b, tick } = arena(published('synergy_plague_tide'));
  const w = b.host.world, starts = new Map(), landings = [];
  const trace = w.trace, end = w.endHook;
  w.trace = (type, data) => {
    trace?.(type, data);
    if (type !== 'spawn' || data.plan.kindNames.names[data.kind] !== 'poison_flask') return;
    const c = w.carriers, root = w.roots[c.root[data.index]];
    if (!b.combat.rootInfo(c.root[data.index])?.triggered) return;
    assert.ok(root.targetPoint, 'mounted poison flasks require an explicit landing point');
    starts.set(c.id[data.index], { x: c.px[data.index], y: c.py[data.index], target: { ...root.targetPoint } });
  };
  w.endHook = (index, reason) => {
    const c = w.carriers, start = starts.get(c.id[index]);
    if (start) landings.push({ travel: Math.hypot(c.px[index] - start.x, c.py[index] - start.y),
      error: Math.hypot(c.px[index] - start.target.x, c.py[index] - start.target.y) });
    return end(index, reason);
  };
  tick(3, true); tick(20);
  assert.ok(landings.length > 30);
  // Crowd separation can move the enemy after the event snapshot; an initial
  // overlap may end at contact before reaching the selected enemy's center.
  assert.ok(landings.every(hit => hit.travel < 1 && hit.error < .8), JSON.stringify(landings.slice(0, 10)));
});

test('献祭雷铸：词条授予献祭主动技能，正常施法消费召唤物并回复、触发新星及补召', t => {
  const { b, stats, tick } = arena(published('synergy_sacrifice_thunder'));
  b.select(1); tick(.4, true);
  assert.equal(b.combat.minions.sacrificed, 0); assert.equal(stats.triggered, 0);
  tick(1); b.select(0);
  const emptyCasts = b.hero.casts;
  tick(.4, true); assert.equal(b.hero.casts, emptyCasts + 1); assert.equal(b.combat.minions.alive().length, 1);
  const casts = b.hero.casts;
  tick(1); b.select(1);
  for (let cycle = 0; cycle < 8; cycle++) {
    b.character.life = b.character.maxLife / 2; b.character.shield = 0;
    tick(.05, true); tick(1);
    assert.ok(b.character.life > b.character.maxLife / 2); assert.ok(b.character.shield > 0);
    assert.ok(b.combat.minions.alive().length >= 1); assert.ok(b.combat.minions.alive().length <= 2);
  }
  assert.equal(b.combat.minions.sacrificed, 8);
  assert.equal(stats.nova, 8); assert.equal(stats.guards, 8); assert.equal(b.hero.casts, casts + 8);
  assert.ok(b.damageDealt > 0);
  const triggers = stats.triggered; tick(3); assert.equal(stats.triggered, triggers, 'waiting does not impersonate active casting');
  const cut = arena(without(published('synergy_sacrifice_thunder'), ['trigger_mount']));
  cut.tick(.4, true); cut.tick(1); cut.b.select(1); cut.tick(1, true);
  assert.equal(cut.stats.nova, 1); assert.equal(cut.stats.guards, 0);
  assert.equal(cut.b.combat.minions.alive().length, 0, 'without a second mount, the nova cannot silently resummon');
  t.diagnostic(JSON.stringify({ build: '献祭雷铸', sacrifices: 8, ...stats }));
});

test('联动BD：无敌人不制造命中或异常消费；密集场景队列有界且数值有限', () => {
  for (const config of SYNERGY_BDS.slice(0, 2)) {
    const empty = arena(published(config.id), { enemies: 0 }); empty.tick(3, true); empty.tick(5);
    assert.equal(empty.stats.triggered, 0); assert.equal(empty.b.damageDealt, 0);
    const dense = arena(published(config.id), { enemies: 48 }); dense.tick(15, true);
    assert.ok(dense.stats.maxQueue < 100, JSON.stringify(dense.stats));
    assert.ok(dense.stats.maxProjectiles < 2048, JSON.stringify(dense.stats));
    assert.ok(Number.isFinite(dense.b.damageDealt) && dense.b.damageDealt > 0);
    assert.ok(dense.stats.minMana >= 0); assert.equal(dense.b.character.dead, false);
  }
});
