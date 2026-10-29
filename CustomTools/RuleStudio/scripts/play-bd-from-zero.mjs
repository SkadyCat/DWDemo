// Acquisition playthrough over the current catalogue; resume only a record of the same rules.
// Recipes are the player's crafting goals; every actual affix/value must be won by paid rolls.
import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, PROJECT_ROOT } from './rule-files.mjs';
import { checkRuleSet, createProgression, equipmentRandom, rollEquipmentDrop, awardBattleKill, progressionLoadout, availableSkills, skillSlots, craftEquipment, craftTargetError, rerollPool, omenFamily, listings } from '../engine/index.mjs';
import { TowerRun } from '../public/sim/dungeon-battle.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { TowerPilot, ruleFilesHash } from './test-tower.mjs';

const ROOT = path.join(PROJECT_ROOT, 'Saved/TowerTests'), DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value)), round = n => +n.toFixed(3);
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const destination = path.resolve(arg('--out', path.join(ROOT, 'from-zero-bd.json')));
const resumed = args.includes('--resume') && fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination)) : null;
const files = readRuleFiles(), check = checkRuleSet(files);
if (!check.ok) throw new Error(check.error);
if (resumed && resumed.rulesHash !== ruleFilesHash(files)) throw new Error('记录与当前规则不同，不能混用；不加 --resume 从当前目录重新开局');
const initial = createProgression(check.collections, check.library);
const opening = resumed || { seed: Number(arg('--seed', 20261023)), rulesHash: ruleFilesHash(files), initial, final: initial, events: [], runs: [] };
const state = clone(resumed?.final || opening.final), events = clone(resumed?.events || opening.events), runs = clone(resumed?.runs || opening.runs);
const random = equipmentRandom(opening.seed ^ 0x4c4f4f54), craftRandom = equipmentRandom(opening.seed ^ 0x43524146);
// Recover the two independent random streams by replaying only this fresh run's real history.
const drops = new Map(events.filter(e => e.event === 'drop').map(e => [e.item.uid, e.item]));
for (let kill = 1; kill <= state.stats.kills; kill++) {
  const item = rollEquipmentDrop(check.collections, check.library, { random, uid: `drop_${kill}` });
  const actual = drops.get(`drop_${kill}`);
  if (!!item !== !!actual || (item && JSON.stringify(item.affixes) !== JSON.stringify(actual.affixes))) throw new Error(`掉落随机流无法还原：击杀 ${kill}`);
}
for (const e of events.filter(e => e.event === 'craft')) {
  const replayState = { instances: { [e.before.uid]: clone(e.before) }, owned: { item: { [e.currency]: 1, ...(e.omen ? { [e.omen]: 1 } : {}) } }, loadout: { belt: [] } };
  const replay = craftEquipment(replayState, e.before.uid, { currencyId: e.currency, omenId: e.omen || '', index: e.index, random: craftRandom }, check.collections, check.library, check.tags);
  if (replay.error || JSON.stringify(replay.after) !== JSON.stringify(e.after)) throw new Error('洗炼随机流无法还原');
}

const recipe = {
  weapon: ['multiple_projectiles', 'cold_mastery', 'life_added_fire', 'life_base', 'hit_next_reduce', 'more_elemental'],
  helmet: ['hit_next_reduce', 'life_base', 'life_increased', 'life_more', 'fire_resistance', 'more_elemental'],
  chest: ['hit_next_reduce', 'life_base', 'life_increased', 'life_more', 'frost_resistance', 'life_added_void'],
  gloves: ['life_base', 'life_more', 'leech_life_elemental', 'leech_life_instant', 'life_on_hit', 'flat_frost'],
  boots: ['hit_next_reduce', 'cold_mastery', 'life_base', 'life_increased', 'lightning_resistance', 'flat_void'],
  belt: ['life_base', 'life_more', 'life_added_fire', 'life_added_void', 'life_on_hit', 'proj_layout_converge'],
  offhand: ['life_base', 'life_more', 'life_increased', 'fire_resistance', 'frost_resistance', 'lightning_resistance'],
  amulet: ['multiple_projectiles', 'cold_mastery', 'pierce', 'ricochet', 'projectile_return', 'proj_hit_mana'],
  ring: ['life_added_fire', 'life_added_void', 'more_elemental', 'more_fire', 'more_void', 'frost_pen'],
};
const slots = Object.keys(recipe), shop = listings(check.collections, check.catalog);
const currency = shop.find(l => l.id === 'chaos_orb'), omens = shop.filter(l => l.doc.category === 'omen');
const currencies = shop.filter(l => l.doc.category === 'currency' && l.doc.craft?.op === 'reroll');
const pools = new Map(omens.map(o => { const family = omenFamily(check.tags, o.doc); return [family, new Set(rerollPool(check.library, check.tags, family).map(a => a.id))]; }));
const fullPool = new Set(rerollPool(check.library, check.tags).map(a => a.id));
const desiredFamily = id => omens.filter(o => pools.get(omenFamily(check.tags, o.doc))?.has(id)).sort((a, b) => pools.get(omenFamily(check.tags, a.doc)).size - pools.get(omenFamily(check.tags, b.doc)).size)[0];
for (const id of Object.values(recipe).flat()) if (!check.library.trait(id) || !fullPool.has(id)) throw new Error(`目标词条必须来自现有可洗池：${id}`);
const bases = clone(resumed?.bases || {});
let evaluation = null;
const bound = () => skillSlots(['frost_lance', ...availableSkills(state.owned.skill, state.loadout.equipment, check.collections, state.instances).map(s => s.id).filter(id => id !== 'frost_lance')]);
const idsOf = item => [...(item?.legendary ? [item.legendary] : []), ...(item?.affixes || [])].flatMap(a => a.traits.map(t => t.id));
const recipeHits = item => idsOf(item).filter(id => recipe[item.slot].includes(id));
const baseScore = item => recipeHits(item).length * 28 + item.affixes.length * 5 + item.tier * 2 + (item.rarity === 'legendary' ? 3 : 0);
const eligible = item => item.affixes.length && (item.slot !== 'weapon' || item.skill === 'frost_lance');
const emit = e => { events.push(e); if (['attempt', 'milestone'].includes(e.event)) console.log(JSON.stringify(e)); };

function metrics(loadout = progressionLoadout(state, check.collections)) {
  evaluation ||= new Battle(files, { collections: check.collections, seed: 18, maxMonsters: 0, spawnRate: 0 });
  evaluation.setLoadout(loadout);
  const b = evaluation, c = b.character, off = c.offense();
  return { life: round(c.maxLife), shield: round(c.maxShield), afterHitReduction: Math.min(90, c.stat('defense.after_hit_reduction')),
    armour: round(c.armourValue()), fireAdded: round(off.flat.fire), voidAdded: round(off.flat.void), frostAdded: round(off.flat.frost),
    projectiles: b.host.getPlanStat(b.hero.plan, 'projectile.count'), castsPerSecond: round(b.hero.castsPerSecond),
    lifeOnHit: c.stat('life.on_hit'), manaOnProjectileHit: c.stat('proj.hit_mana'), elementalLeech: c.stat('leech.life.elemental'), instantLeech: c.stat('leech.life.instant'),
    intendedAffixes: slots.reduce((sum, slot) => sum + recipeHits(state.instances[state.loadout.equipment[slot]]).length, 0) };
}
function chooseGear(attempt) {
  for (const slot of slots) {
    const previous = bases[slot], candidates = Object.values(state.instances).filter(i => i.slot === slot && eligible(i)).sort((a, b) => baseScore(b) - baseScore(a));
    const crafting = [...candidates].sort((a, b) => (b.affixes.length + !!b.legendary) - (a.affixes.length + !!a.legendary) || baseScore(b) - baseScore(a));
    if (crafting.length) bases[slot] = crafting[0].uid;
    // Common offhand still supplies the existing shield block; an amulet can bind a support skill.
    const fallback = Object.values(state.instances).filter(i => i.slot === slot).sort((a, b) => b.tier - a.tier)[0];
    const chosen = candidates[0]?.uid || fallback?.uid;
    if (chosen && chosen !== state.loadout.equipment[slot]) {
      const before = state.loadout.equipment[slot] || null; state.loadout.equipment[slot] = chosen;
      emit({ event: 'equip', attempt, before, item: clone(state.instances[chosen]), craftingBaseChanged: previous !== bases[slot] });
    }
  }
  state.loadout.skills = bound();
}

function purchase(listing) {
  if (state.stones < listing.price) return false;
  state.stones -= listing.price; state.stats.spent += listing.price;
  state.owned.item[listing.id] = (state.owned.item[listing.id] || 0) + 1;
  return true;
}
function craft(attempt, limit = 120) {
  let count = 0;
  while (count < limit && state.stones >= currency.price) {
    const globalIds = Object.values(state.loadout.equipment).flatMap(uid => idsOf(state.instances[uid]));
    const m = metrics();
    const jobs = [];
    for (const slot of slots) {
      const item = state.instances[bases[slot]]; if (!item) continue;
      const held = idsOf(item), targets = recipe[slot];
      const weak = item.affixes.map((a, index) => ({ a, index })).filter(({ a }) => !a.traits.some(t => targets.includes(t.id)));
      const selected = weak.map(w => ({ ...w, currency: currencies.find(c => !craftTargetError(item, c.doc, w.index)) })).find(w => w.currency);
      if (!selected) continue;
      for (const wanted of targets.filter(id => !held.includes(id))) {
        const omen = desiredFamily(wanted), family = omen ? omenFamily(check.tags, omen.doc) : '';
        if (state.stones < selected.currency.price + (omen?.price || 0)) continue;
        let importance = 100;
        if (['multiple_projectiles', 'cold_mastery'].includes(wanted) && !globalIds.includes(wanted)) importance = 500;
        if (wanted === 'hit_next_reduce' && m.afterHitReduction < 70) importance = 280;
        if (['life_base', 'life_more', 'life_increased'].includes(wanted) && m.life < 900) importance = 350;
        if (['life_added_fire', 'life_added_void'].includes(wanted) && m.life >= 700) importance = 240;
        if (['leech_life_elemental', 'life_on_hit'].includes(wanted) && !m.elementalLeech && !m.lifeOnHit) importance = 300;
        jobs.push({ item, index: selected.index, currency: selected.currency, wanted, omen, family, priority: importance / Math.sqrt(family ? pools.get(family).size : fullPool.size) });
      }
    }
    jobs.sort((a, b) => b.priority - a.priority);
    const job = jobs[0]; if (!job) break;
    const before = clone(job.item);
    if (!purchase(job.currency) || (job.omen && !purchase(job.omen))) throw new Error('洗炼消费未能支付');
    const result = craftEquipment(state, job.item.uid, { currencyId: job.currency.id, omenId: job.omen?.id || '', index: job.index, random: craftRandom }, check.collections, check.library, check.tags);
    if (result.error) throw new Error(result.error);
    emit({ event: 'craft', attempt, index: job.index, wanted: job.wanted, cost: job.currency.price + (job.omen?.price || 0), currency: job.currency.id, omen: job.omen?.id || null, before, after: clone(result.after), stones: state.stones });
    count++;
  }
  if (count) console.log(JSON.stringify({ event: 'craft-batch', attempt, count, stones: state.stones, metrics: metrics() }));
  return count;
}

function readiness() {
  const gear = slots.map(slot => state.instances[state.loadout.equipment[slot]]);
  const complete = gear.every(item => item && item.affixes.length + (item.legendary ? 1 : 0) === 6 && item.affixes.every(a => a.traits.some(t => recipe[item.slot].includes(t.id))));
  return { complete, targetLines: gear.reduce((sum, item) => sum + recipeHits(item).length, 0), sixLineItems: gear.filter(i => i && i.affixes.length + !!i.legendary === 6).length, metrics: metrics() };
}
function save(status = 'playing') {
  fs.writeFileSync(destination, JSON.stringify({ schema: 2, rulesHash: ruleFilesHash(files), seed: opening.seed, conditions: { ...opening.conditions, startingSave: 'fresh opening only', crafting: 'paid single-affix rolls; existing traits, families and prices; no refunds or value edits' },
    initial: opening.initial, initialMeasurement: opening.initialMeasurement, recipe, bases, status, readiness: readiness(), events, runs, final: state }, null, 2) + '\n');
}

const pilot = new TowerPilot({ mode: 'kite' }), maxAttempts = +arg('--attempts', (resumed?.runs.length || 0) + 40), maxFloors = +arg('--max-floors', 20);
chooseGear(runs.length + 1);
for (let attempt = runs.length + 1; attempt <= maxAttempts; attempt++) {
  craft(attempt); chooseGear(attempt);
  const start = { stones: state.stones, kills: state.stats.kills, drops: state.progression.drops, loadout: clone(state.loadout), metrics: metrics() };
  const tower = new TowerRun(files, { collections: check.collections, monsterTypes: [...check.monsters.values()].map(e => e.doc), seed: opening.seed + attempt - 1, god: false, autoCast: false, monsterCount: 20, timeLimitEnabled: true,
    onKill: (stones, monster) => {
      const item = awardBattleKill(state, stones, check.collections, check.library, { random, uid: `drop_${state.stats.kills + 1}` });
      if (item) emit({ event: 'drop', attempt, floor: tower.floor, time: round(tower.battle.elapsed), boss: !!monster.boss, item: clone(item) });
    } });
  tower.setLoadout(progressionLoadout(state, check.collections)); state.stats.battles++;
  const floors = [];
  while (tower.floor <= maxFloors) {
    const b = tower.battle; pilot.update(b); tower.step(DT);
    if (['cleared', 'failed'].includes(b.phase)) {
      floors.push({ floor: b.floor, result: b.failureReason || 'cleared', seconds: round(b.elapsed), killed: b.kills, spawned: b.spawned, wavesCompleted: b.wavesCompleted, bossKilled: b.boss?.health <= 0,
        bossLife: b.boss ? round(b.boss.health) : null, bossMaxLife: b.boss ? round(b.boss.maxHealth) : null, life: round(b.character.life), maxLife: round(b.character.maxLife), damage: round(b.damageDealt), incoming: round(b.damageTaken) });
      if (b.phase === 'failed') break;
      chooseGear(attempt); craft(attempt, 70); chooseGear(attempt); tower.setLoadout(progressionLoadout(state, check.collections));
      const ready = readiness();
      console.log(JSON.stringify({ event: 'floor', attempt, floor: b.floor, seconds: round(b.elapsed), gold: state.stones, ready }));
      save();
      if (!tower.advance()) throw new Error('无法进入下一层');
    }
  }
  const run = { attempt, seed: opening.seed + attempt - 1, start, cleared: floors.filter(f => f.result === 'cleared').length, failedFloor: tower.floor,
    result: tower.battle.failureReason || 'limit', kills: state.stats.kills - start.kills, drops: state.progression.drops - start.drops, stones: state.stones, floors };
  runs.push(run); emit({ event: 'attempt', attempt, cleared: run.cleared, result: run.result, failedFloor: run.failedFloor, kills: run.kills, drops: run.drops, stones: run.stones, ready: readiness() });
  save(readiness().complete ? 'assembled' : 'playing');
  if (readiness().complete) { emit({ event: 'milestone', text: '九个部位均为六词条实战装备，随机词条全部符合本次构筑目标', attempt }); save('assembled'); break; }
  evaluation = null;
}
console.log(`REPORT ${destination}`);
