// Acquisition and transactions only. This stream never reads or advances combat randomness.
import { rollEquipmentDrop, equipmentRandom, equipmentDocument, equipmentTier, fixedEquipmentAffix, normalizeEquipmentRarity } from './equipment.mjs';
import { listings, defaultCatalog, defaultPrice } from './shop.mjs';
import { PLAYER_GEAR_SLOTS } from './equipment-slots.mjs';
import { availableSkills, validSkillSlots } from './loadout.mjs';

export const MERCHANT_CHANCE = .35;
export const PICKUP_RADIUS = 200; // centimeters
const itemCategories = new Set(['consumable', 'currency', 'omen', 'material']);
const copy = value => JSON.parse(JSON.stringify(value));
const choose = (rows, random) => rows[Math.min(rows.length - 1, Math.floor(random() * rows.length))];

function equipmentLoot(item) {
  normalizeEquipmentRarity(item);
  return { kind: 'equipment', item, id: item.uid, name: item.name, rarity: item.rarity, tier: item.tier, count: 1 };
}
function itemLoot(doc, count = 1) {
  return { kind: 'item', id: doc.id, name: doc.name || doc.id, rarity: doc.rarity || 'common', category: doc.category, ...(doc.category === 'map' ? { tier: doc.tier } : {}), currencyGrade: doc.category === 'currency' ? doc.craft?.grade : undefined, description: doc.description || '', count };
}

/** Validates before mutation. Called with the original ground drop or merchant offer. */
export function grantLoot(state, loot) {
  if (loot.claimed) return '已领取';
  if (loot.kind === 'equipment') {
    if (loot.item) {
      if (!loot.item.uid || state.instances[loot.item.uid]) return '装备实例无效或已领取';
      state.instances[loot.item.uid] = normalizeEquipmentRarity(copy(loot.item));
    } else if (loot.templateId && loot.templateId === loot.id) {
      if (!Number.isSafeInteger(loot.count) || loot.count < 1) return '装备数量无效';
      const next = (state.owned.equipment[loot.id] || 0) + loot.count;
      if (!Number.isSafeInteger(next) || next > 9999) return '背包中的该装备已达上限';
      state.owned.equipment[loot.id] = next;
    } else return '装备实例无效或已领取';
    if (loot.origin === 'drop' && state.progression) state.progression.drops++;
  } else if (loot.kind === 'item') {
    if (!Number.isSafeInteger(loot.count) || loot.count < 1) return '物品数量无效';
    const next = (state.owned.item[loot.id] || 0) + loot.count;
    if (next > 9999) return '背包中的该物品已达上限';
    state.owned.item[loot.id] = next;
  } else return '未知掉落类型';
  loot.claimed = true;
  return '';
}

export class FloorRewards {
  constructor(collections, library, catalog, { seed = 1, floor = 1, visit = 1, maxTier = 1, mapTier = 1, bossMapDropChance = 0, merchantChance = MERCHANT_CHANCE, equipmentChance = .3, itemChance = .3, createEquipment } = {}) {
    if (!Number.isInteger(mapTier) || mapTier < 1 || mapTier > 16) throw new Error('地图掉落等阶必须是 T1–T16');
    this.collections = collections; this.library = library; this.catalog = catalog || defaultCatalog();
    seed = (seed + Math.imul(visit, 0x45d9f3b)) >>> 0;
    this.floor = floor; this.seed = seed; this.merchantChance = merchantChance;
    this.maxTier = equipmentTier({ tier: maxTier });
    this.mapTier = mapTier; this.bossMapDropChance = bossMapDropChance;
    this.createEquipment = createEquipment;
    this.equipmentChance = equipmentChance; this.itemChance = itemChance;
    this.random = equipmentRandom(seed ^ 0x4c4f4f54);
    this.merchantRandom = equipmentRandom(seed ^ 0x4d455243);
    this.mapRandom = equipmentRandom(seed ^ 0x4d415053);
    this.nextMapId = 1;
    this.ground = []; this.nextId = 1; this.completed = false; this.merchant = null;
    this.itemPool = [...collections.item.values()].map(e => e.doc).filter(doc => doc && itemCategories.has(doc.category));
  }
  get remaining() { return this.ground.filter(drop => !drop.claimed); }
  #uid(prefix) { return `${prefix}_${this.seed >>> 0}_${this.floor}_${this.nextId++}`; }
  /** Move owned copies to this floor without rolling, paying rewards or advancing RNG. */
  dropInventory(state, { kind, id, count = 1 }, hero) {
    if (!hero || hero.dead) return { error: '倒下时无法丢出物品' };
    if (!Number.isFinite(hero.x) || !Number.isFinite(hero.y)) return { error: '地面位置无效' };
    if (!Number.isSafeInteger(count) || count < 1) return { error: '物品数量无效' };
    if (!['equipment', 'item'].includes(kind)) return { error: '此类型不能丢到地面' };
    const instance = kind === 'equipment' ? state.instances[id] : null;
    const doc = instance || this.collections[kind]?.get(id)?.doc;
    if (!doc) return { error: '物品不存在' };
    if (kind === 'equipment' && !PLAYER_GEAR_SLOTS.some(slot => slot.id === doc.slot)) return { error: '固定装备不能丢到地面' };
    const owned = instance ? 1 : state.owned[kind][id] || 0;
    if (!Number.isSafeInteger(owned) || count > owned || (instance && instance.uid !== id)) return { error: '背包中的物品数量不足' };
    const remaining = owned - count;
    const equipment = { ...state.loadout.equipment }, instances = { ...state.instances };
    if (instance) delete instances[id];
    if (kind === 'equipment' && !remaining) for (const [slot, equipped] of Object.entries(equipment)) if (equipped === id) delete equipment[slot];
    const skills = validSkillSlots(state.loadout.skills, availableSkills(state.owned.skill, equipment, this.collections, instances));
    const loot = instance ? equipmentLoot(copy(instance)) : kind === 'item' ? itemLoot(doc, count)
      : { kind, id, templateId: id, name: doc.name || id, rarity: doc.rarity, tier: doc.tier, count };
    const key = this.#uid('ground'), angle = this.nextId * 2.3999632297;
    const drop = { ...loot, key, origin: 'inventory', sourceX: hero.x, sourceY: hero.y,
      x: hero.x + Math.cos(angle) * 80, y: hero.y + Math.sin(angle) * 80, claimed: false };
    if (instance) delete state.instances[id];
    else if (remaining) state.owned[kind][id] = remaining;
    else delete state.owned[kind][id];
    state.loadout.equipment = equipment;
    state.loadout.skills = skills;
    if (kind === 'item' && !remaining) state.loadout.belt = state.loadout.belt.map(value => value === id ? null : value);
    this.ground.push(drop);
    return { drop };
  }
  onKill(monster) {
    const out = [], random = this.random;
    const item = rollEquipmentDrop(this.collections, this.library, { random, maxTier: this.maxTier, chance: monster.boss ? 1 : this.equipmentChance, uid: this.#uid('drop'), createEquipment: this.createEquipment });
    if (item) out.push(equipmentLoot(item));
    if (this.itemPool.length && random() < (monster.boss ? 1 : this.itemChance)) {
      const doc = choose(this.itemPool, random);
      out.push(itemLoot(doc, ['currency', 'material'].includes(doc.category) ? 1 + Math.floor(random() * 2) : 1));
    }
    for (const [i, loot] of out.entries()) {
      const key = this.#uid('ground'), angle = this.nextId * 2.3999632297, distance = 65 + i * 22;
      this.ground.push({ ...loot, key, origin: 'drop', sourceX: monster.x, sourceY: monster.y,
        x: monster.x + Math.cos(angle) * distance, y: monster.y + Math.sin(angle) * distance, claimed: false });
    }
    // Map equipment supplies the chance. Keep this stream and its IDs independent of ordinary loot.
    const chance = Math.min(1, Math.max(0, this.bossMapDropChance));
    if (monster.boss && chance > 0) {
      const doc = this.collections.item.get(`map_t${String(this.mapTier).padStart(2, '0')}_common`)?.doc;
      if (doc?.category === 'map' && doc.tier === this.mapTier && this.mapRandom() < chance) {
        const loot = itemLoot(doc), id = this.nextMapId++, angle = id * 2.3999632297;
        this.ground.push({ ...loot, key: `map_ground_${this.seed}_${this.floor}_${id}`, origin: 'drop',
          sourceX: monster.x, sourceY: monster.y,
          x: monster.x + Math.cos(angle) * 110, y: monster.y + Math.sin(angle) * 110, claimed: false });
        out.push(loot);
      }
    }
    return out;
  }
  pickup(key, state, hero) {
    const drop = this.ground.find(d => d.key === key);
    if (!drop || drop.claimed) return { error: '掉落已拾取或不存在' };
    if (hero.dead) return { error: '倒下时无法拾取' };
    if (Math.hypot(drop.x - hero.x, drop.y - hero.y) > PICKUP_RADIUS) return { error: '请先靠近掉落' };
    const error = grantLoot(state, drop);
    return error ? { error } : { drop };
  }
  complete() {
    if (this.completed) return this.merchant;
    this.completed = true;
    const random = this.merchantRandom;
    if (random() >= this.merchantChance) return null;
    const all = listings(this.collections, this.catalog), stock = [];
    const equipment = all.filter(l => l.kind === 'equipment' && fixedEquipmentAffix(l.doc, this.library)), items = all.filter(l => l.kind === 'item' && itemCategories.has(l.doc.category));
    const available = [...equipment];
    for (let i = 0; i < 2 && equipment.length; i++) {
      if (!available.length) available.push(...equipment);
      const listing = available.splice(Math.floor(random() * available.length), 1)[0];
      // The instance is rolled once and remains identical through inspection and purchase.
      const pool = { equipment: new Map([[listing.id, { doc: listing.doc }]]) };
      const item = rollEquipmentDrop(pool, this.library, { chance: 1, random, rarity: 'legendary', maxTier: this.maxTier, uid: this.#uid('merchant'), identified: true, createEquipment: this.createEquipment });
      // Price the rolled tier, rather than the template's authored level or catalog price.
      const price = item.tier === 1 ? 20 + Math.floor(random() * 31)
        : listing.custom ? listing.price : defaultPrice('equipment', equipmentDocument(item, this.collections));
      stock.push({ ...equipmentLoot(item), key: this.#uid('offer'), origin: 'merchant', price, claimed: false });
    }
    for (let i = 0; i < 4 && items.length; i++) {
      const listing = items.splice(Math.floor(random() * items.length), 1)[0];
      stock.push({ ...itemLoot(listing.doc), key: this.#uid('offer'), origin: 'merchant', price: listing.price, claimed: false });
    }
    this.merchant = stock.length ? { name: '流浪商人', stock } : null;
    return this.merchant;
  }
  buy(key, state) {
    if (!this.completed || !this.merchant) return { error: '当前没有商人' };
    const offer = this.merchant.stock.find(o => o.key === key);
    if (!offer || offer.claimed) return { error: '货品已售出或不存在' };
    if (!Number.isSafeInteger(offer.price) || offer.price < 0) return { error: '价格无效' };
    if (state.stones < offer.price) return { error: `灵石不足（还差 ${offer.price - state.stones}）` };
    const error = grantLoot(state, offer);
    if (error) return { error };
    state.stones -= offer.price; state.stats.spent += offer.price;
    return { offer };
  }
}
