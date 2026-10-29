import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, PROJECT_ROOT } from './rule-files.mjs';
import { checkRuleSet, sourceFromEntry, Character } from '../engine/index.mjs';

const set = checkRuleSet(readRuleFiles());
if (!set.ok) throw new Error(set.error);
const elements = ['physical', 'fire', 'frost', 'lightning', 'poison', 'void'];
const ops = [];
for (let i = 0; i < 30; ++i) {
  ops.push({ op: 'tick', dt: 0.1, moving: i % 2 === 0 });
  ops.push({ op: 'hit', amount: 17 + (i % 4) * 11, element: elements[i % 6], dot: i % 7 === 0, critical: i % 3 === 0, kind: { attack: i % 2 === 0, spell: i % 2 !== 0, melee: i % 3 === 0, projectile: i % 3 !== 0, area: i % 4 === 0 } });
  ops.push({ op: 'dealt', amount: 90, element: elements[(i + 2) % 6], critical: i % 3 === 0, killed: i % 5 === 0, dot: i % 7 === 0 });
  ops.push({ op: 'cast', cost: 2, attack: i % 2 === 0, costScale: 1 });
  if (i % 6 === 0) ops.push({ op: 'item', id: 'flask_life' });
}
function snapshot(c) {
  const offense = c.offense(), block = c.blockChances({}), evade = c.evadeChances({});
  return { life: c.life, shield: c.shield, mana: c.mana, maxLife: c.maxLife, maxShield: c.maxShield, maxMana: c.maxMana,
    shieldCap: c.shieldCap, rechargeDelay: c.rechargeDelay, rechargeRate: c.rechargeRate, stunned: c.stunned, dead: c.dead ? 1 : 0,
    evasion: c.evasionValue(), armour: c.armourValue(), blockAttack: block.attack, blockSpell: block.spell, evadeAttack: evade.attack, evadeSpell: evade.spell,
    actionAttack: c.actionSpeed('attack'), actionSpell: c.actionSpeed('spell'), moveSpeed: c.moveSpeed(), critical: offense.critical, area: offense.area,
    ...Object.fromEntries(elements.flatMap(e => [['inc_' + e, offense.increased[e]], ['more_' + e, offense.more[e]], ['flat_' + e, offense.flat[e]]])),
    ...Object.fromEntries(Object.entries(c.totals).map(([k, v]) => ['total_' + k, v])),
    ...Object.fromEntries(Object.entries(c.flow).map(([k, v]) => ['flow_' + k, v])),
    events: c.combatEvents.length, pendingCasts: c.pendingCasts.length, pendingGrants: c.pendingGrants.length,
    triggers: c.triggers.map(t => ({ name: t.name, id: t.id, cooldown: t.cooldown, acc: t.acc })),
  };
}
const cases = [...set.library.traits.values()].map(t => ({ id: t.source.id, entries: [{ id: 'shield_base', params: { n: 200 } }, { id: t.source.id }] }));
for (const [id, equipment] of set.collections.equipment) cases.push({ id: 'equipment_' + id, entries: [{ id: 'shield_base', params: { n: 200 } }, ...equipment.doc.traits.map(t => ({ ...t, equipment: true, slot: equipment.doc.slot }))] });
cases.push({ id: 'all_equipment_slots', offhand: 'shield', entries: [...set.collections.equipment.values()].flatMap(e => e.doc.traits.map(t => ({ ...t, equipment: true, slot: e.doc.slot }))) });
for (const test of cases) {
  const clean = ({ id, params, with: stitched, duration }) => ({ id, ...(params && Object.keys(params).length ? { params } : {}), ...(duration > 0 ? { duration } : {}), ...(stitched?.length ? { with: stitched.map(clean) } : {}) });
  test.entries = test.entries.map(({ equipment, slot, ...e }) => ({ ...clean(e), ...(equipment ? { equipment, slot } : {}) }));
  const entries = test.entries.map(({ equipment = false, slot = '', ...e }) => ({ source: sourceFromEntry(set.library, e), equipment, slot }));
  const c = new Character({ seed: 5 }); c.offhand = test.offhand || ''; c.setSheet(entries);
  test.stats = Object.fromEntries(c.stats); c.life *= 0.6; c.shield *= 0.35; c.mana *= 0.7;
  test.expected = [snapshot(c)];
  for (const op of ops) {
    if (op.op === 'tick') c.tick(op.dt, { moving: op.moving });
    if (op.op === 'hit') c.takeHit(op);
    if (op.op === 'dealt') c.onDealt(op);
    if (op.op === 'cast') c.beforeCast(op.cost, { kind: op.attack ? 'attack' : 'spell', costScale: op.costScale });
    if (op.op === 'item') c.useItem([set.library.trait(op.id).source]);
    test.expected.push(snapshot(c));
  }
}
const file = path.join(PROJECT_ROOT, 'Saved/RulesMigration/character-parity.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ version: 1, seed: 5, ops, cases }));
console.log(`character parity: ${cases.length} cases × ${ops.length + 1} states -> ${file}`);
