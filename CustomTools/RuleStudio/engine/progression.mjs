// Player-side acquisition only. Combat, damage and trait aggregation keep their existing rules.
import { rollEquipment, rollEquipmentDrop, equipmentRandom } from './equipment.mjs';
import { skillSlots, availableSkills, validSkillSlots } from './loadout.mjs';
import { cleanBelt, auraId } from './skill-types.mjs';

/** A separate fresh journey: one common T1 weapon, its one bound skill, no money/materials. */
export function createProgression(collections, library, { weaponId = 'frostthorn_staff', uid = 'starter_weapon' } = {}) {
  const template = collections.equipment.get(weaponId)?.doc;
  if (template?.slot !== 'weapon' || !template.skills?.[0]) throw new Error('初始装备必须是现有的绑定技能武器');
  const item = rollEquipment(template, library, { rarity: 'common', tier: 1, uid, random: equipmentRandom(1) });
  return {
    stones: 0, owned: { skill: {}, equipment: {}, item: {} }, instances: { [uid]: item },
    loadout: { skills: skillSlots([item.skill]), equipment: { weapon: uid }, belt: [] },
    stats: { kills: 0, earned: 0, spent: 0, battles: 0 }, initialized: true,
    progression: { weaponId, drops: 0 },
  };
}

/** Currency and kill accounting; ground items are claimed separately in the tower. */
export function recordBattleKill(state, stones) {
  if (stones > 0) { state.stones += stones; state.stats.earned += stones; }
  state.stats.kills++;
}

/** Called once by the actual combat kill callback; loot uses an independent random stream. */
export function awardBattleKill(state, stones, collections, library, { random = Math.random, uid, createEquipment } = {}) {
  recordBattleKill(state, stones);
  const item = rollEquipmentDrop(collections, library, { random, uid, createEquipment });
  if (item) {
    state.instances[item.uid] = item;
    if (state.progression) state.progression.drops++;
  }
  return item;
}

/** Include equipped instances only; unrelated loot cannot recompile or modify the hero. */
export function progressionLoadout(state, collections) {
  const equipment = Object.fromEntries(Object.entries(state.loadout.equipment).filter(([, id]) => state.instances[id] ? state.instances[id].identified !== false : state.owned.equipment[id] > 0));
  const instances = Object.fromEntries(Object.values(equipment).filter(id => state.instances[id]).map(id => [id, state.instances[id]]));
  const choices = availableSkills(state.owned.skill, equipment, collections, instances);
  const belt = cleanBelt(state.loadout.belt, binding => auraId(binding) ? choices.some(s => s.id === auraId(binding)) : state.owned.item[binding] > 0);
  return {
    skills: validSkillSlots(state.loadout.skills, choices),
    equipment, instances: JSON.parse(JSON.stringify(instances)), belt,
    ...(state.loadout.activeAuras ? { activeAuras: state.loadout.activeAuras.filter(id => belt.includes(`aura:${id}`)) } : {}),
  };
}
