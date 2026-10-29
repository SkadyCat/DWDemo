// 《战斗属性与技能特性词条总表》: every line is an affix, every stat is read by the runtime, and each
// system works in the 3D battle (Battle + engine/combat).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkRuleSet, parseCollection, Character, sourceFromEntry, validateSheet } from '../engine/index.mjs';
import { COMBAT_AFFIXES, COMBAT_STATS, COMBAT_TRIGGERS } from '../engine/combat-catalog.mjs';
import { readBaselineRuleFiles } from './rule-fixture.mjs';
import { TOOL_ROOT } from '../scripts/rule-files.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { HERO_TARGET_ID } from '../public/sim/arena.mjs';
import { E, KEYS, MINION_BASE } from '../engine/combat/common.mjs';

const files = readBaselineRuleFiles();
const check = checkRuleSet(files);
const L = check.library;

function battle(affixes, { skill = 'frost_lance', monsters = [], god = true, extra = [] } = {}) {
  const parsed = parseCollection('equipment', { id: 'test_gear', name: '测试装备', slot: 'weapon', rarity: 'unique', level: 1, skills: [skill || 'frost_lance'], traits: [...affixes, ...extra] });
  assert.ok(parsed.doc, parsed.error);
  const collections = { ...check.collections, equipment: new Map([...check.collections.equipment, ['test_gear', { doc: parsed.doc, path: 'Equipment/test_gear.json' }]]) };
  const b = new Battle(files, { collections, maxMonsters: 0, spawnRate: 0, god, seed: 5 });
  b.setLoadout({ skills: skill ? [skill] : [], equipment: { weapon: 'test_gear' } });
  assert.ok(!b.skills[0] || b.skills[0].plan >= 0, b.skills[0]?.error);
  b.spawnMonsters(monsters.length);
  b.monsters.forEach((m, i) => Object.assign(m, { x: 300, y: 0, health: 500, maxHealth: 500, speed: 0, cooldown: 999, elite: false, shield: 0, maxShield: 0, attackRange: 0, resistance: [0, 0, 0, 0] }, monsters[i]));
  b.rows = [];
  const step = b.host.stepFrame.bind(b.host);
  b.host.stepFrame = dt => { const rows = step(dt); b.rows.push(...rows); return rows; };
  b.traces = [];
  const trace = b.host.world.trace;
  b.host.world.trace = (kind, payload) => { if (kind === 'area') b.traces.push(payload); trace(kind, payload); };
  b.run = (frames, cast = true) => { b.hero.casting = cast; for (let i = 0; i < frames; ++i) b.step(1 / 60); b.hero.casting = false; return b; };
  return b;
}
const heroRows = b => b.rows.filter(r => r.OwnerExternalId === 1 && r.TargetExternalId !== HERO_TARGET_ID);
const char = (list, base = {}) => {
  const c = new Character({ base, seed: 3 });
  c.setSheet(list.map(([id, params]) => ({ source: sourceFromEntry(L, { id, params: params || {} }), label: id })));
  c.reset();
  return c;
};

test('词条总表: every line of the table is an affix (name = table text) and validates', () => {
  assert.ok(check.ok, check.error);
  const md = fs.readFileSync(path.join(TOOL_ROOT, 'docs', 'combat-affix-table.md'), 'utf8').split(/\r?\n/);
  let code = false;
  const lines = new Set();
  for (const l of md) { if (/^```/.test(l)) code = !code; else if (code && l.trim()) lines.add(l.trim()); }
  assert.equal(lines.size, 815);
  const names = new Map([...L.traits.values()].filter(t => /^Affixes\//.test(t.path)).map(t => [t.displayName, t]));
  const missing = [...lines].filter(l => !names.has(l));
  assert.deepEqual(missing, []);
  for (const line of lines) assert.equal(validateSheet(names.get(line).source), '', line);
});

test('词条总表: every stat and trigger of the catalog is read by the character or the combat runtime', () => {
  const dir = path.join(TOOL_ROOT, 'engine');
  const src = [path.join(dir, 'character.mjs'), ...fs.readdirSync(path.join(dir, 'combat')).map(f => path.join(dir, 'combat', f))].map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const dynamic = [/^damage\.pen\./, /^minion\.flat\./, /^damage\.(flat|increased|more)\./];
  assert.deepEqual([...COMBAT_STATS.keys()].filter(p => !src.includes(`'${p}'`) && !dynamic.some(r => r.test(p))), []);
  assert.deepEqual(Object.keys(COMBAT_TRIGGERS).filter(n => !src.includes(`'${n}'`) && !src.includes(`${n}:`)), []);
  assert.equal(new Set(COMBAT_AFFIXES.map(e => e[0])).size, COMBAT_AFFIXES.length, 'one catalog entry per line');
});

test('召唤物替换: 新实例先初始化上限，生命转移不能产生 NaN', () => {
  const b = battle([{ id: 'minion_replace_transfer', params: { n: 30 } }], { skill: 'sentinel', monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(300);
  const live = b.combat.minions.alive();
  assert.ok(live.length > 0);
  for (const st of live) {
    assert.ok(Number.isFinite(st.life) && st.life > 0);
    assert.ok(Number.isFinite(st.maxLife) && st.maxLife > 0);
    assert.ok(Number.isFinite(st.shield) && Number.isFinite(st.maxShield));
  }
});

test('基础伤害: 火焰增伤、元素额外提高、获得额外伤害、物理转化', () => {
  const c = char([['inc_fire', { n: 25 }], ['more_elemental', { n: 20 }], ['more_fire', { n: 10 }]]);
  const off = c.offense();
  assert.equal(off.increased.fire, 25);
  assert.ok(Math.abs(off.more.fire - 1.32) < 1e-9 && off.more.void === 1);
  const b = battle([{ id: 'extra_as_fire', params: { n: 50, source: -1 } }], { monsters: [{}] }).run(60);
  const frost = heroRows(b).filter(r => r.Element === E.frost), fire = heroRows(b).filter(r => r.Element === E.fire);
  assert.ok(frost.length > 0 && fire.length > 0, 'extra fire damage follows the frost hits');
  assert.ok(Math.abs(fire[0].Amount - frost[0].Amount * 0.5) < 1, 'n% of the hit');
  const conv = battle([{ id: 'frost_convert_physical', params: { n: 100, source: 3, element: 1 } }], { skill: 'player_slash', monsters: [{ x: 120 }] }).run(60);
  assert.ok(heroRows(conv).some(r => r.Element === E.frost) && heroRows(conv).filter(r => r.Element === E.physical).every(r => r.Amount < 0.01));
});

test('闪避: 闪避值换算、法术闪避、条件闪避、成功闪避后的增益与反击', () => {
  const c = char([['evasion', { n: 600 }]]);
  assert.ok(Math.abs(c.evadeChances({}).attack - 50) < 1e-6);
  assert.equal(c.evadeChances({ spell: true }).spell, 0);
  const moving = char([['evasion', { n: 600 }], ['evasion_moving', { n: 100 }]]);
  moving.moving = true;
  assert.ok(moving.evadeChances({}).attack > 60);
  const spell = char([['evade_spell', { n: 30 }], ['evade_cap', { n: 10 }], ['evade_chance', { n: 90 }]]);
  assert.equal(spell.evadeChances({}).attack, 85, 'cap 75 + 10');
  assert.equal(spell.evadeChances({ spell: true }).spell, 30);
  const buff = char([['evade_chance', { n: 75 }], ['evade_buff_move', { n: 20, duration: 3 }], ['evade_next_attack_more', { n: 40 }], ['evade_mana', { n: 5 }]]);
  buff.mana = 50;
  let evaded = 0;
  for (let i = 0; i < 20 && !evaded; ++i) evaded += buff.takeHit({ amount: 10, element: 'physical', kind: { attack: true } }).evaded ? 1 : 0;
  assert.equal(evaded, 1);
  assert.equal(buff.moveSpeed(), 20);
  assert.equal(buff.mana, 55);
  assert.equal(buff.beforeCast(2, { kind: 'attack' }).damageMore, 40);
  const fail = char([['evade_fail_bonus', { n: 5 }], ['evasion', { n: 1 }]]);
  for (let i = 0; i < 3; ++i) fail.takeHit({ amount: 1, element: 'fire', kind: { attack: true } });
  assert.ok(fail.evadeFail >= 10);
  // 反击: the attacker takes a counter hit.
  const b = battle([{ id: 'evade_chance', params: { n: 75 } }, { id: 'evade_counter', params: { chance: 100 } }], { skill: null, god: false, monsters: [{ x: 100, attackRange: 200, cooldown: 0, health: 9999, maxHealth: 9999 }] });
  b.run(300, false);
  assert.ok(b.rows.some(r => r.Info?.strike === 'counter'), 'counter hit on the attacker');
});

test('格挡: 部分格挡、减免、硬直、攻击转法术格挡、反射与眩晕攻击者', () => {
  const c = char([['block_chance', { n: 95 }], ['block_attack_cap', { n: 20 }]]);
  let result;
  for (let i = 0; i < 20 && !result?.blocked; ++i) result = c.takeHit({ amount: 100, element: 'fire', kind: { attack: true } });
  assert.ok(result.blocked && Math.abs(result.taken - 30) < 1e-6, 'block stops 70%');
  assert.ok(c.stunned > 0, 'block stagger');
  const strong = char([['block_chance', { n: 95 }], ['block_attack_cap', { n: 20 }], ['block_reduction', { n: 20 }], ['block_stagger', { n: 100 }]]);
  for (let i = 0; i < 20 && !result?.blocked; ++i) result = strong.takeHit({ amount: 100, element: 'fire', kind: { attack: true } });
  result = null;
  for (let i = 0; i < 20 && !result?.blocked; ++i) result = strong.takeHit({ amount: 100, element: 'fire', kind: { attack: true } });
  assert.ok(Math.abs(result.taken - 10) < 1e-6 && strong.stunned === 0);
  const share = char([['block_chance', { n: 40 }], ['block_attack_to_spell', { n: 50 }], ['block_spell', { n: 5 }]]);
  assert.equal(share.blockChances({}).spell, 25);
  share.offhand = 'shield';
  assert.equal(share.blockChances({}).attack, 55, '盾牌提供 15');
  const b = battle([{ id: 'block_chance', params: { n: 75 } }, { id: 'block_reflect_fire', params: { n: 30 } }, { id: 'block_stun', params: { n: 100 } }], { skill: null, god: false, monsters: [{ x: 100, attackRange: 200, cooldown: 0, health: 9999, maxHealth: 9999 }] });
  let attackerStunned = false;
  for (let i = 0; i < 240; ++i) {
    b.step(1 / 60);
    attackerStunned ||= b.host.world.statuses.has(`${b.monsters[0].id}|${KEYS.stun}`);
  }
  assert.ok(b.rows.some(r => r.Info?.strike === 'reflect' && r.Element === E.fire));
  assert.ok(attackerStunned, 'attacker receives the one-second stun during combat');
});

test('范围技能: 落点、重复、环形 / 直线形状、额外区域、持续跟随区域', () => {
  const base = battle([], { skill: 'flame_burst', monsters: [{ x: 600, y: 0 }] }).run(60);
  assert.ok(base.traces.some(t => t.effect === 'create_flame_burst'));
  assert.ok(heroRows(base).some(r => r.Element === E.fire), 'lands on the enemy at the cast range');
  const rep = battle([{ id: 'area_repeats', params: { n: 2 } }], { skill: 'flame_burst', monsters: [{ x: 600 }] }).run(21).run(110, false);
  assert.equal(rep.traces.filter(t => t.effect === 'create_flame_burst').length, 3, 'first pass + 2 repeats');
  const ring = battle([{ id: 'area_to_ring' }, { id: 'area_at_self' }], { skill: 'flame_burst', monsters: [{ x: 0, y: 0 }, { x: 180, y: 0 }] }).run(25).run(30, false);
  const hitIds = new Set(heroRows(ring).map(r => r.TargetExternalId));
  assert.ok(hitIds.has(ring.monsters[1].id) && !hitIds.has(ring.monsters[0].id), 'ring skips the centre');
  const line = battle([], { skill: 'earth_wave', monsters: [{ x: 500, y: 0 }, { x: 200, y: 300 }] }).run(25);
  const lineHits = new Set(heroRows(line).map(r => r.TargetExternalId));
  assert.ok(lineHits.has(line.monsters[0].id) && !lineHits.has(line.monsters[1].id), 'line hits ahead only');
  const extra = battle([{ id: 'area_extra_zones', params: { n: 3 } }], { skill: 'flame_burst', monsters: [{ x: 600 }] }).run(25).run(30, false);
  assert.equal(extra.traces.filter(t => t.effect === 'create_flame_burst').length, 4);
  const follow = battle([{ id: 'area_follow_self' }], { skill: 'flame_burst', monsters: [{ x: 50, y: 0 }] }).run(25).run(150, false);
  assert.ok(heroRows(follow).filter(r => r.Element === E.fire).length >= 3, 'persistent zone ticks');
});

test('毒: 层数独立计时与跳伤、层数上限、引爆、击杀传播', () => {
  const b = battle([{ id: 'poison_chance', params: { n: 100 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(90);
  const id = b.monsters[0].id;
  assert.ok(b.combat.ailments.layers(id, 'poison') > 1);
  assert.ok(b.rows.some(r => r.bDot && r.Element === E.poison && r.TargetExternalId === id), 'poison ticks');
  assert.equal(b.host.world.getStatusStacks(id, KEYS.poison), b.combat.ailments.layers(id, 'poison'), 'mirrored on the status');
  const capped = battle([{ id: 'poison_chance', params: { n: 100 } }, { id: 'poison_extra_layers', params: { n: 20 } }, { id: 'poison_max_stacks', params: { n: 5 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(40);
  assert.equal(capped.combat.ailments.layers(capped.monsters[0].id, 'poison'), 15);
  const det = battle([{ id: 'poison_chance', params: { n: 100 } }, { id: 'poison_threshold_detonate', params: { stacks: 4 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }, { x: 350, health: 1e6, maxHealth: 1e6 }] }).run(120);
  assert.ok(det.rows.some(r => r.Info?.strike === 'poison_detonate'), 'detonation');
  const spread = battle([{ id: 'poison_chance', params: { n: 100 } }, { id: 'poison_death_copy', params: { n: 3 } }], { monsters: [{ health: 60, maxHealth: 60 }, { x: 420, y: 0, health: 1e6, maxHealth: 1e6 }] }).run(120);
  assert.ok(spread.combat.ailments.layers(spread.monsters.find(m => m.health > 1000)?.id ?? -1, 'poison') > 0 || spread.rows.some(r => r.bDot && r.TargetExternalId !== spread.monsters[0]?.id), 'layers copied to the neighbour');
});

test('闪电: 感电叠层 / 额外层数、闪电连锁、感电击杀传播', () => {
  const b = battle([{ id: 'shock_chance', params: { n: 100 } }, { id: 'shock_max_stacks', params: { n: 2 } }, { id: 'shock_extra_layers', params: { n: 2 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(40);
  const id = b.monsters[0].id;
  assert.equal(b.combat.ailments.shockLayers(id), 3);
  assert.equal(b.host.world.getStatusStacks(id, KEYS.shock), 3);
  const chain = battle([{ id: 'chain_count', params: { n: 2 } }], { extra: ['lightning_damage'], monsters: [{ health: 1e6, maxHealth: 1e6 }, { x: 500, y: 100, health: 1e6, maxHealth: 1e6 }, { x: 700, y: 200, health: 1e6, maxHealth: 1e6 }] }).run(60);
  const chained = new Set(chain.rows.filter(r => r.Info?.strike === 'chain').map(r => r.TargetExternalId));
  assert.ok(chained.size >= 2, 'chains reach the other enemies');
});

test('冰霜: 冻结积累、冻结持续、残留冰缓、碎冰爆炸', () => {
  const b = battle([{ id: 'freeze_buildup', params: { n: 400 } }, { id: 'freeze_residual', params: { n: 3 } }, { id: 'shatter_on_kill' }], { monsters: [{ health: 100, maxHealth: 100 }, { x: 360, y: 60, health: 1e6, maxHealth: 1e6 }] });
  b.run(30);
  const id = b.monsters[0]?.id;
  assert.ok(b.rows.some(r => r.Info?.strike === 'shatter') || (id && b.host.world.getStatus(id, KEYS.freeze) > 0) || b.combat.ailments.frozen.size > 0, 'frozen by build-up');
  b.run(200);
  assert.ok(b.rows.some(r => r.Info?.strike === 'shatter'), 'frozen kill shatters');
});

test('火焰: 点燃叠层、点燃伤害提高、燃烧地面', () => {
  const b = battle([{ id: 'ignite_chance', params: { n: 100 } }, { id: 'ignite_max_stacks', params: { n: 3 } }, { id: 'ignite_damage', params: { n: 100 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(150);
  const id = b.monsters[0].id;
  assert.equal(b.combat.ailments.ignite.get(id).length, 4);
  assert.ok(b.rows.some(r => r.bDot && r.Element === E.fire), 'ignite ticks through the rule world');
  const ground = battle([{ id: 'ignite_chance', params: { n: 100 } }, { id: 'burn_ground', params: { seconds: 3 } }], { monsters: [{ health: 100, maxHealth: 100 }] }).run(150);
  assert.ok(ground.combat.ailments.fields.some(f => f.type === 'burn') || ground.rows.some(r => r.bDot && r.Element === E.fire && r.TargetExternalId !== ground.monsters[0]?.id));
});

test('虚空: 侵蚀层数、对满血增伤、终结普通敌人、坍缩', () => {
  const b = battle([{ id: 'erosion_chance', params: { n: 100 } }, { id: 'erosion_collapse', params: { stacks: 3 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(120);
  assert.ok(b.rows.some(r => r.bDot && r.Element === E.void), 'erosion ticks');
  assert.ok(b.rows.some(r => r.Info?.strike === 'void_collapse'), 'collapse at the threshold');
  const ex = battle([{ id: 'void_execute', params: { n: 60 } }], { extra: [{ id: 'void_damage', params: { amount: 5 } }], monsters: [{ health: 120, maxHealth: 120 }] }).run(60);
  assert.ok(ex.rows.some(r => r.bKilled && r.Element === E.void && r.Info?.executed), 'executed below 60%');
});

test('投射物: 数量、连续发射、分裂、连锁、到达最大距离后返回', () => {
  const count = battle([{ id: 'proj_count', params: { n: 2 } }, { id: 'proj_volleys', params: { n: 1 } }], { monsters: [] });
  let spawned = 0;
  const hook = count.host.world.spawnHook;
  count.host.world.spawnHook = (...a) => { ++spawned; return hook(...a); };
  count.run(21).run(20, false);
  assert.equal(spawned, 6, '3 projectiles × 2 volleys');
  const split = battle([{ id: 'proj_split_on_hit' }], { monsters: [{ health: 1e6, maxHealth: 1e6 }, { x: 700, y: 100, health: 1e6, maxHealth: 1e6 }] }).run(60);
  assert.ok(heroRows(split).length > 1);
  const chain = battle([{ id: 'proj_chain', params: { n: 2 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }, { x: 600, y: 200, health: 1e6, maxHealth: 1e6 }] }).run(60);
  assert.ok(new Set(heroRows(chain).map(r => r.TargetExternalId)).size === 2, 'chains to the second enemy');
  const back = battle([{ id: 'proj_return_at_max' }, { id: 'proj_recall_mana', params: { n: 5 } }], { monsters: [] });
  back.hero.god = false;
  back.character.mana = 10;
  back.run(21).run(200, false);
  assert.ok(back.combat.projectiles.recalled >= 1, 'projectile came back');
});

test('召唤物: 气血与承伤、数量上限、每次召唤数量、牺牲', () => {
  const b = battle(['grant_sacrifice', { id: 'control_unit_cap', params: { n: 1 } }, { id: 'minion_per_cast', params: { n: 1 } }, { id: 'minion_life_base', params: { n: 100 } }, { id: 'minion_sacrifice_life', params: { n: 10 } }], { skill: 'spirit_servant', monsters: [] }).run(21, true);
  const alive = b.combat.minions.alive();
  assert.equal(alive.length, 2, '1 + 1 per cast');
  assert.ok(Math.abs(alive[0].maxLife - 250) < 1e-6);
  const st = alive[0];
  b.combat.minions.takeDamage(st, { amount: 100, element: E.fire });
  assert.ok(st.life < 250 && st.life > 100);
  b.character.life = 100;
  b.run(1, false);
  b.setLoadout({ ...b.loadout, skills: ['spirit_servant', 'sacrifice'] });
  b.select(1); b.run(60, true);
  assert.ok(b.character.life > 100, 'sacrifice heals');
  assert.equal(b.combat.minions.alive().length, 1);
  // Monsters can attack minions: minions are targets on the hero's team.
  b.run(2, false);
  assert.ok([...b.host.world.targets.externalId].some(id => id >= MINION_BASE));
});

test('触发: 命中触发挂载技能、每隔 n 秒、冷却与储存次数', () => {
  const b = battle([{ id: 'trig_hit', params: { chance: 100 }, with: ['create_flame_burst'] }], { monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(150);
  assert.ok(b.combat.triggers.fired > 0);
  assert.ok(b.traces.some(t => t.effect === 'create_flame_burst'), 'mounted skill cast');
  const timer = battle([{ id: 'trig_interval', params: { seconds: 1 }, with: ['create_flame_burst'] }], { monsters: [{ x: 200, health: 1e6, maxHealth: 1e6 }] }).run(130, false);
  assert.equal(timer.combat.triggers.fired, 2);
  const limited = battle([{ id: 'trig_hit', params: { chance: 100 }, with: ['create_flame_burst'] }, { id: 'trigger_cooldown_recovery', params: { n: -90 } }], { monsters: [{ health: 1e6, maxHealth: 1e6 }] }).run(150);
  assert.ok(limited.combat.triggers.fired < b.combat.triggers.fired, 'cooldown limits the trigger');
});
