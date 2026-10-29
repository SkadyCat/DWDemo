// Equipment currency transactions shared by the crafting page and battle item inspector.
// This is collection / inventory logic, independent of the combat rule engine and browser state.
import { addEquipmentAffixes, rollEquipmentAffixes } from './equipment.js';
import { omenFamily, rerollPool, rerollWithCurrency } from './tags.js';
import { isFixedEquipmentSlot } from './equipment-slots.js';

export const REFORGE_GRADE_NAMES = Object.freeze(['下品灵石', '中品灵石', '上品灵石']);
export const currencyCraft = doc => doc?.craft || { op: 'reroll', grade: 1 };
export const reforgeTargetGrade = (item, index) => Array.isArray(item?.reforgeTargets) ? item.reforgeTargets.indexOf(index) + 1 : 0;

/** One eligibility check for both crafting UIs and the spending transaction. */
export function craftTargetError(item, currency, index) {
  if (!item || item.identified === false) return '请先鉴定装备';
  if (!Array.isArray(item.affixes)) return '装备实例无效';
  if (isFixedEquipmentSlot(item.slot)) return '固定装备槽不能加工词条';
  const op = currencyCraft(currency);
  if (['roll_affixes', 'add_affixes'].includes(op.op)) {
    if (index !== null) return '该通货作用于整件装备，请使用随机词缀按钮';
    return Number.isSafeInteger(op.count) && op.count > 0 ? '' : '随机词缀数量无效';
  }
  if (op.op !== 'reroll') return '未知装备加工效果';
  if (!item.affixes.length) return '没有随机词条，请先使用陨星石';
  if (!Number.isInteger(index) || index < 0 || index >= item.affixes.length) return '请选择要洗炼的随机词条';
  const grade = op.grade ?? 1, targets = item.reforgeTargets || [];
  if (!Number.isInteger(grade) || grade < 1 || grade > REFORGE_GRADE_NAMES.length) return '灵石品级无效';
  if (!Array.isArray(targets) || targets.length > REFORGE_GRADE_NAMES.length || new Set(targets).size !== targets.length
    || targets.some(i => !Number.isInteger(i) || i < 0 || i >= item.affixes.length)) return '装备洗炼记录无效';
  const bound = targets.indexOf(index);
  if (bound >= 0) return bound + 1 === grade ? '' : `该词条需使用${REFORGE_GRADE_NAMES[bound]}`;
  if (targets.length >= REFORGE_GRADE_NAMES.length) return '这件装备已选定3条洗炼词条';
  if (grade <= targets.length) return `${REFORGE_GRADE_NAMES[grade - 1]}已绑定其他词条`;
  if (grade !== targets.length + 1) return `请先用${REFORGE_GRADE_NAMES[targets.length]}选定第${targets.length + 1}条洗炼词条`;
  return '';
}

export function craftEquipment(state, uid, { currencyId, omenId = '', index = null, random = Math.random, pool }, collections, library, tags) {
  const item = state.instances[uid], currency = collections?.item?.get(currencyId)?.doc;
  if (!item || item.identified === false) return { error: '请先鉴定装备' };
  if (currency?.category !== 'currency') return { error: '请选择通货' };
  if (!(state.owned.item[currencyId] > 0)) return { error: '通货不足' };
  const operation = currencyCraft(currency);
  const targetError = craftTargetError(item, currency, index);
  if (targetError) return { error: targetError };
  let family = '';
  if (omenId) {
    if (!tags) return { error: '没有 tag 族定义（Content/Rules/Tags/families.json）' };
    family = omenFamily(tags, collections.item.get(omenId)?.doc);
    if (!family) return { error: '预兆无效：需要恰好一个族 tag' };
    if (!(state.owned.item[omenId] > 0)) return { error: '预兆不足' };
  }
  let after;
  try {
    const options = { count: operation.count, random, pool: pool ?? rerollPool(library, tags, family) };
    if (operation.op === 'roll_affixes') after = rollEquipmentAffixes(item, library, options);
    else if (operation.op === 'add_affixes') after = addEquipmentAffixes(item, library, options);
    else {
      after = rerollWithCurrency(item, library, tags, { family, index, random, pool: options.pool });
      after.reforgeTargets = [...(item.reforgeTargets || [])];
      if (!after.reforgeTargets.includes(index)) after.reforgeTargets.push(index);
    }
  } catch (error) { return { error: error.message }; }
  // Generate everything before spending. A failed roll leaves equipment and materials intact.
  for (const id of [currencyId, ...(omenId ? [omenId] : [])]) {
    state.owned.item[id]--;
    if (state.owned.item[id] <= 0) {
      delete state.owned.item[id];
      if (state.loadout?.belt) state.loadout.belt = state.loadout.belt.filter(value => value !== id);
    }
  }
  state.instances[uid] = after;
  const changed = operation.op === 'add_affixes'
    ? after.affixes.map((_, i) => i).slice(item.affixes.length)
    : operation.op === 'roll_affixes' ? after.affixes.map((_, i) => i) : [index];
  return { before: item, after, family, operation: operation.op, changed };
}
