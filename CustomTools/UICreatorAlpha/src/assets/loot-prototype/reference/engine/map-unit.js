// A map owns equipment and monsters, but never enters the combat target table.
import { Character } from './character.js';
import { readTraitText } from './reader.js';
import { resolvePawnEquipment, pawnEquipmentSources } from './pawn-equipment.js';
import { equipmentTier } from './equipment.js';

export const MAP_UNIT_ID = 0x50000000;
export const MAP_EQUIPMENT = 'map_core_equipment';

export class MapUnit {
  constructor(library, collections, { owner, equipment = { map: MAP_EQUIPMENT } } = {}) {
    this.id = MAP_UNIT_ID;
    this.name = '地图';
    this.invulnerable = true;
    this.owner = owner;
    this.library = library;
    this.collections = collections;
    this.setEquipment(equipment);
  }

  get tier() { return equipmentTier({ tier: this.equipment.map?.tier ?? 1 }); }

  setEquipment(equipment) {
    const resolved = resolvePawnEquipment(this.collections, equipment, 'map');
    const held = pawnEquipmentSources(this.library, resolved, (doc, slot) => slot);
    const character = new Character({ base: { life: 1, mana: 0, lifeRegen: 0 } });
    character.setSheet(held.sheetEntries);
    const modifiers = [];
    const lifeBase = character.stat('minion.life_base');
    const life = Math.max(0.01, 1 + character.stat('minion.life_increased') / 100) * character.stat('minion.life_more');
    const damage = Math.max(0, 1 + character.stat('minion.damage') / 100) * character.stat('minion.more');
    if (lifeBase) modifiers.push({ target: 'owner', stat: 'max_life', op: 'add', value: { param: 'life_base' } });
    if (life !== 1) modifiers.push({ target: 'owner', stat: 'max_life', op: 'multiply', value: { param: 'life' } });
    if (damage !== 1) modifiers.push({ target: 'owner', stat: 'damage_multiplier', op: 'multiply', value: { param: 'damage' } });
    // Source/plan caches key on params: inherited values must remain authored parameters.
    const { trait, error } = readTraitText(JSON.stringify({ id: '__map_summon', params: { life_base: lifeBase, life, damage }, modifiers }));
    if (error) throw new Error(error);
    Object.assign(this, { equipment: resolved, character, sources: held.sources, contributions: held.contributions,
      summonSources: modifiers.length ? [trait] : [] });
  }

  // Pack size scales the three normal waves; the single floor boss remains single.
  monsterCount(baseCount) {
    const multiplier = Math.max(0, 1 + this.character.stat('map.monster_packs') / 100);
    return Math.min(299, Math.max(0, Math.round((baseCount - 1) * multiplier))) + 1;
  }

  summon(monster) {
    monster.summonerId = this.id;
    monster.summonerOwner = this.owner;
  }
}
