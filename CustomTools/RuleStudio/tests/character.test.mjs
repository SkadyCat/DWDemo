// 角色词条 (Content/Rules/Affixes): attributes, damage, shield, life, and projectile return / reflect.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRuleSet, Character, computeSheet, simulateCharacter, offenseSource, sourceFromEntry, compileBuild, aggregate, readTraitText, validateSheet,
  parseCollection, describeTrait,
} from '../engine/index.mjs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { runCombat } from '../public/combat.mjs';
import { RuleHost } from '../engine/library.mjs';

const files = readRuleFiles();
const check = checkRuleSet(files);
const L = check.library;
const src = (id, params = {}, extra = {}) => sourceFromEntry(L, { id, params, with: extra.with || [] });
const char = (list, base = {}) => {
  const c = new Character({ base, seed: 3 });
  c.setSheet(list.map(([id, params, equipment, w]) => ({ source: src(id, params, { with: w }), equipment: !!equipment, label: id })));
  c.reset();
  return c;
};
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('词条: every affix loads, is web-only, validates and appears in the picker', () => {
  assert.ok(check.ok, check.error);
  const affixes = [...L.traits.values()].filter(t => /^Affixes\//.test(t.path));
  assert.ok(affixes.length >= 160, `${affixes.length} affixes`);
  for (const t of affixes) {
    assert.ok(t.webOnly && t.source.sheet?.length, t.source.id);
    assert.equal(validateSheet(t.source), '');
    assert.ok(t.displayName.length > 0);
  }
  assert.equal(describeTrait(L.trait('shield_base')).kind, 'affix');
  assert.match(validateSheet(readTraitText('{"id":"x","sheet":[{"stat":"nope","value":1}]}').trait), /unknown sheet stat/);
  assert.match(validateSheet(readTraitText('{"id":"x","sheet":[{"trigger":"cheat_death_keep"}]}').trait), /needs param cooldown/);
  assert.match(new (L.constructor)().load([...files, { path: 'Traits/x.json', text: '{"id":"x","sheet":[{"stat":"life.base","value":1}]}' }]).error, /Affixes/);
  assert.match(parseCollection('skill', { id: 's', active: 'create_ice_lance', traits: ['create_ice_lance', 'life_base'] }).error ?? '', /^$/);
});

test('词条: 属性 / 气血 / 护盾上限的换算', () => {
  const c = char([
    ['attr_strength', { n: 20 }], ['attr_intelligence', { n: 30 }], ['attr_constitution', { n: 10 }],
    ['life_base', { n: 100 }, true], ['life_from_equipment', { n: 50 }], ['life_per_strength', { per: 2, amount: 1 }], ['life_per_constitution', { per: 1, amount: 2 }],
    ['life_increased', { n: 10 }], ['life_more', { n: 10 }],
    ['shield_base', { n: 100 }, true], ['shield_from_equipment', { n: 20 }], ['shield_per_intelligence', { per: 5, amount: 2 }], ['shield_per_strength', { per: 5, amount: 1 }],
    ['shield_from_life', { n: 10 }], ['shield_from_mana', { n: 20 }], ['shield_increased', { n: 50 }], ['shield_more', { n: 10 }],
  ]);
  // life: (400 + 100*1.5 + 20*0.5 + 10*2) * 1.1 * 1.1
  near(c.maxLife, (400 + 150 + 10 + 20) * 1.1 * 1.1, 1e-3);
  // shield: (120 + 30*0.4 + 20*0.2 + life*10% + 100*20%) * 1.5 * 1.1
  near(c.maxShield, (120 + 12 + 4 + c.maxLife * 0.1 + 20) * 1.5 * 1.1, 1e-3);
  assert.equal(c.attributes.strength, 20);
  assert.equal(c.life, c.maxLife);
  assert.equal(c.shield, c.maxShield);
});

test('词条: 护盾吸收、绕过、承伤、回充延迟/打断/保护、溢出', () => {
  const c = char([['shield_base', { n: 100 }], ['shield_bypass', { n: 100 }], ['shield_taken_physical', { n: 50 }]]);
  c.takeHit({ amount: 40, element: 'physical' });
  near(c.shield, 80); near(c.life, 400);
  c.takeHit({ amount: 40, element: 'fire' });
  near(c.shield, 40);
  const b = char([['shield_base', { n: 100 }]]);
  b.takeHit({ amount: 50, element: 'fire' });
  near(b.life, 395); near(b.shield, 55); // 10% bypasses
  // recharge: 2s delay; -0.5s reduction → starts at 1.5s; rate 20%/s of 100
  const r = char([['shield_base', { n: 100 }], ['shield_recharge_delay', { n: 0.5 }], ['shield_bypass', { n: 100 }]]);
  r.takeHit({ amount: 60, element: 'fire' });
  for (let i = 0; i < 14; ++i) r.tick(0.1);
  near(r.shield, 40); assert.equal(r.recharging, false);
  r.tick(0.1); r.tick(0.1);
  assert.ok(r.recharging && r.shield > 40);
  r.takeHit({ amount: 1, element: 'fire' });
  assert.equal(r.recharging, false, 'damage interrupts recharge');
  const g = char([['shield_base', { n: 100 }], ['shield_recharge_grace', { n: 1 }], ['shield_recharge_on_damaged', { n: 100 }], ['shield_bypass', { n: 100 }]]);
  g.takeHit({ amount: 50, element: 'fire' });
  assert.ok(g.recharging, '100% chance to start right away');
  g.tick(0.1); g.takeHit({ amount: 1, element: 'fire' });
  assert.ok(g.recharging, 'grace window keeps it running');
  // overflow: recharge stops at max, on-kill recovery can overflow then decays
  const o = char([['shield_base', { n: 100 }], ['shield_overflow', { n: 50 }], ['shield_on_kill', { n: 40 }], ['shield_overflow_damage', { n: 15 }]]);
  o.onDealt({ amount: 10, element: 'fire', killed: true });
  near(o.shield, 140); near(o.offense().increased.fire, 15);
  for (let i = 0; i < 10; ++i) o.tick(0.1);
  assert.ok(o.shield < 140 && o.shield > 100);
});

test('词条: 再生、偷取（速度/上限/持续/立即/满时保留）、伤害回收、延迟扣血', () => {
  const still = char([['life_regen_still', { n: 2 }], ['life_regen_flat', { n: 0 }]], { lifeRegen: 0 });
  still.life = 100;
  still.tick(1, { moving: false }); near(still.life, 108);
  still.tick(1, { moving: true }); near(still.life, 108);
  const leech = char([['leech_life_all', { n: 10 }], ['leech_life_instant', { n: 50 }]], { lifeRegen: 0 });
  leech.life = 100;
  leech.onDealt({ amount: 100, element: 'fire' });
  near(leech.life, 105); // 50% of 10 instantly
  leech.tick(0.5); near(leech.life, 109, 1e-3); // 2%/s of 400 = 8/s, 4 in 0.5s
  leech.tick(1); near(leech.life, 110, 1e-3);
  const full = char([['leech_life_all', { n: 10 }]], { lifeRegen: 0 });
  full.onDealt({ amount: 100, element: 'fire' });
  full.tick(0.1); assert.equal(full.leech.life.length, 0, 'leech ends at full life');
  const keep = char([['leech_life_all', { n: 10 }], ['leech_life_keep_full', {}]], { lifeRegen: 0 });
  keep.onDealt({ amount: 100, element: 'fire' }); keep.tick(0.1);
  assert.equal(keep.leech.life.length, 1);
  const recoup = char([['life_recoup', { percent: 50, seconds: 2 }]], { lifeRegen: 0 });
  recoup.takeHit({ amount: 100, element: 'physical' });
  near(recoup.life, 300);
  for (let i = 0; i < 20; ++i) recoup.tick(0.1);
  near(recoup.life, 350, 1e-3);
  const defer = char([['life_loss_deferred', { percent: 50, seconds: 2 }]], { lifeRegen: 0 });
  defer.takeHit({ amount: 100, element: 'physical' });
  near(defer.life, 350);
  for (let i = 0; i < 20; ++i) defer.tick(0.1);
  near(defer.life, 300, 1e-3);
});

test('词条: 格挡/闪避恢复、护甲阻止的物理伤害回收为护盾、治疗、溢出治疗转护盾、药剂', () => {
  const block = char([['block_chance', { n: 75 }], ['life_on_block', { n: 20 }], ['shield_base', { n: 100 }], ['shield_on_block_percent', { n: 10 }],
    ['armour', { n: 100 }], ['shield_on_block_armour', { n: 10 }], ['shield_recoup_prevented_physical', { percent: 100, seconds: 1 }]]);
  block.life = 300; block.shield = 0;
  let blocked = 0;
  for (let i = 0; i < 40; ++i) blocked += block.takeHit({ amount: 10, element: 'fire' }).blocked ? 1 : 0;
  assert.ok(blocked > 20 && block.totals.blocked === blocked);
  const heal = char([['heal_received', { n: 100 }], ['heal_overflow_to_shield', { n: 50 }], ['shield_base', { n: 100 }]]);
  heal.life = 390; heal.shield = 0;
  heal.recover('life', 10);
  near(heal.life, 400); near(heal.shield, 5); // 20 healed, 10 overflow → 5 shield
  const flask = char([['flask_life_amount', { n: 100 }], ['flask_life_instant', { n: 50 }]], { lifeRegen: 0 });
  flask.life = 100;
  flask.useItem([src('flask_life', { amount: 100, seconds: 2 })]);
  near(flask.life, 200);
  for (let i = 0; i < 20; ++i) flask.tick(0.1);
  near(flask.life, 300, 1e-3);
});

test('词条: 条件伤害、消耗与强化、免死、低血减伤、触发器', () => {
  const c = char([['full_life_damage', { n: 20 }], ['low_life_damage', { n: 50 }], ['missing_life_damage', { per: 10, amount: 3 }], ['inc_elemental', { n: 10 }],
    ['more_fire', { n: 10 }], ['flat_fire', { n: 7 }], ['life_added_fire', { n: 1 }]]);
  near(c.offense().increased.fire, 30); near(c.offense().increased.physical, 20);
  near(c.offense().more.fire, 1.1); near(c.offense().flat.fire, 11);
  c.life = 100; // 75% missing → +22.5, low life +50
  near(c.offense().increased.fire, 10 + 50 + 22.5);
  const cost = char([['cost_from_life', { n: 100 }], ['cost_life_reduction', { n: 50 }], ['cast_consume_current_life', { percent: 10, damage: 20 }], ['empower_on_life_spent', { per: 30, bonus: 50 }]]);
  const first = cost.beforeCast(10);
  assert.ok(first.ok); near(cost.life, (400 - 5) * 0.9); near(first.damageMore, 20);
  const second = cost.beforeCast(10);
  near(second.damageMore, 70, 1e-6); // empowered by 44.5 life spent on the first cast
  const poor = char([], { mana: 1, castCost: 5 });
  assert.equal(poor.beforeCast().ok, false);
  const save = char([['cheat_death_heal', { percent: 30, cooldown: 10 }], ['cheat_death_keep', { cooldown: 5 }], ['guard_on_low_life', { duration: 2, reduction: 50, cooldown: 9 }]]);
  save.takeHit({ amount: 1000, element: 'physical' });
  near(save.life, 120); assert.equal(save.dead, false);
  save.takeHit({ amount: 1000, element: 'physical' });
  near(save.life, 1);
  save.tick(0.1);
  assert.ok(save.guard.left > 0);
  save.takeHit({ amount: 1000, element: 'physical' });
  assert.equal(save.dead, true);
  const fire = char([['cast_on_shield_restored', { per: 50 }, false, ['create_ice_lance']], ['shield_base', { n: 100 }], ['buff_on_full_shield', { duration: 3 }, false, ['fire_damage']]]);
  fire.shield = 0; fire.wasFullShield = false;
  fire.recover('shield', 100);
  assert.equal(fire.pendingCasts.length, 2);
  fire.tick(0.01);
  assert.equal(fire.pendingGrants.length, 1);
  assert.equal(fire.pendingGrants[0].sources[0].id, 'fire_damage');
});

test('词条: 角色伤害合成为施法特性，在规则世界里生效', () => {
  const base = aggregate(L, 'frost_lance', []).source;
  const plan = compileBuild(base).plan;
  const c = char([['inc_frost', { n: 100 }], ['more_frost', { n: 50 }], ['flat_fire', { n: 9 }], ['full_life_crit', { n: 20 }]]);
  const trait = offenseSource(c.offense(), plan.stats);
  const merged = compileBuild({ ...base, traits: [...base.traits, trait] }).plan;
  const pct = s => merged.stats.get(s);
  const { findStat } = { findStat: path => [...Array(200).keys()].find(i => merged.stats.describe(i)?.name === path) };
  near(pct(findStat('element.frost.damage_percent')), (1 + 1) * 1.5 * 100 - 100, 0.11);
  const opts = { library: L, statusDefs: L.statusDefs(), layout: 'lane', count: 6, health: 1e6, casts: 2, castInterval: 30, frames: 200, seed: 2 };
  const plain = runCombat([], { ...opts, source: base });
  const boosted = runCombat([], { ...opts, source: { ...base, traits: [...base.traits, trait] } });
  assert.ok(boosted.rows.some(r => r.element === 'fire'));
  assert.ok(boosted.total.damage > plain.total.damage * 2);
});

test('词条: 无规则世界的角色推演（编辑器预览）', () => {
  const tank = simulateCharacter([{ source: src('shield_base', { n: 300 }) }, { source: src('shield_recharge_rate', { n: 100 }) }], { seconds: 20 });
  const glass = simulateCharacter([], { seconds: 20 });
  assert.ok(glass.diedAt !== null && (tank.diedAt === null || tank.diedAt > glass.diedAt + 3), `${tank.diedAt} vs ${glass.diedAt}`);
  const calm = simulateCharacter([{ source: src('shield_base', { n: 300 }) }], { seconds: 10, incoming: { every: 3, amount: 60 } });
  assert.ok(calm.totals.shieldRecovered > 0, 'recharge between hits');
  assert.ok(computeSheet([{ source: src('life_base') }]).stats.get('life.base') === 60);
});

test('投射物回归 / 反射: 折返后命中路上新出现的敌人，不重复命中同一敌人', () => {
  // Target A straight ahead; after the first hit, enemy B steps between the hero and A.
  const run = extra => {
    const host = new RuleHost();
    host.loadRuleLibrary(files);
    const { plan } = host.compileTraits('create_ice_lance', ['create_ice_lance', ...extra]);
    const owner = host.registerOwner(1, 0);
    host.updateOwner(owner, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    host.castBuild(plan, owner, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const hits = { a: 0, b: 0 };
    for (let frame = 0; frame < 240; ++frame) {
      host.beginTargets();
      host.addTarget({ x: 600, y: 0, z: 0 }, 45, 1e6, 1, 101);
      if (hits.a > 0) host.addTarget({ x: 250, y: 0, z: 0 }, 45, 1e6, 1, 102);
      for (const row of host.stepFrame(1 / 60)) { if (row.TargetExternalId === 101) ++hits.a; if (row.TargetExternalId === 102) ++hits.b; }
    }
    return hits;
  };
  assert.deepEqual(run([]), { a: 1, b: 0 });
  assert.deepEqual(run(['projectile_return']), { a: 1, b: 1 }, 'return flies back through B');
  assert.deepEqual(run(['projectile_reflect']), { a: 1, b: 1 }, 'reflect flies back through B');
});