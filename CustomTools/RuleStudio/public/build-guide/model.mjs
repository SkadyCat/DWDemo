import { checkRuleSet, equipmentAffixPool, createTraitValueEntry, traitTierProfile } from '../../engine/index.mjs';
import { affixName, affixText, traitText } from '../affix-text.mjs';
import { iconSrc } from '../game-icons.mjs';
import { RIME_THUNDER_GUIDE } from './content.mjs';

export function createBuildGuide(files, preset, tier = 10) {
  if (![1, 5, 10].includes(tier)) throw new Error('参考阶级需要 T1、T5 或 T10');
  const checked = checkRuleSet(files);
  if (!checked.ok) throw new Error(checked.error);
  return buildGuideFromLibrary(checked.library, checked.collections, preset, tier);
}

/** HUD callers reuse the loaded library; opening a guide never recompiles combat rules. */
export function buildGuideFromLibrary(library, collections, preset, tier = 10) {
  if (![1, 5, 10].includes(tier)) throw new Error('参考阶级需要 T1、T5 或 T10');
  const content = RIME_THUNDER_GUIDE;
  const pool = new Map(equipmentAffixPool(library).map(row => [row.id, row]));
  const value = entry => {
    const source = library.trait(entry.id)?.source;
    if (!source) throw new Error(`构筑引用的词条不存在：${entry.id}`);
    return { ...createTraitValueEntry(library, entry.id, { tier: source.params.size ? tier : null, random: () => .5 }), with: (entry.with || []).map(value) };
  };
  const resolve = id => {
    const definition = pool.get(id);
    if (!definition) throw new Error(`构筑引用的随机词条不存在：${id}`);
    const affix = { ...definition, traits: definition.traits.map(value) };
    const ranges = affix.traits.flatMap(function walk(entry) {
      const profile = traitTierProfile(library, entry.id);
      return [...Object.entries(profile?.params || {}).map(([name, spec]) => ({ name, trait: library.traitDisplayName(entry.id), min: spec.tiers[tier - 1][0], max: spec.tiers[tier - 1][1] })), ...entry.with.flatMap(walk)];
    });
    return { id, name: affixName(affix, library), text: affixText(affix, library), traits: affix.traits, ranges };
  };
  const names = { weapon: '武器', helmet: '头盔', chest: '胸甲', gloves: '手套', boots: '鞋子', ring: '戒指', amulet: '项链' };
  const equipment = Object.entries(preset.equipment).map(([slot, uid]) => {
    const item = preset.instances?.[uid];
    if (!item || !collections.equipment.has(item.baseId)) throw new Error(`参考装备不存在：${uid}`);
    return { ...item, slotName: names[slot] || slot, icon: iconSrc('equipment', item),
      lines: (item.affixes || []).map(affix => ({ id: affix.id, name: affixName(affix, library), tier: affix.tier, text: affixText(affix, library) })) };
  });
  const legendary = collections.equipment.get(content.legendary)?.doc;
  if (!legendary) throw new Error('核心传奇装备不存在');
  const fixed = { ...legendary.legendary, params: Object.fromEntries(library.trait(legendary.legendary.id).source.params) };
  for (const id of [content.skill, content.nova]) if (!collections.skill.has(id)) throw new Error(`技能不存在：${id}`);
  return { ...content, tier,
    skillIcon: iconSrc('skill', content.skill), novaIcon: iconSrc('skill', content.nova),
    steps: content.steps.map(step => ({ ...step, image: step.icon ? iconSrc('skill', step.icon) : '', affixes: step.affixes.map(resolve) })),
    groups: content.groups.map(group => ({ ...group, rows: group.rows.map(row => ({ ...resolve(row.id), ...row })) })),
    equipment,
    legendary: { id: legendary.id, name: legendary.name, icon: iconSrc('equipment', legendary), slotName: names[legendary.slot], fixedName: traitText(fixed, library) },
    preset: { name: preset.authored?.name || content.name, count: equipment.length, affixes: equipment.reduce((sum, item) => sum + item.lines.length, 0) },
  };
}
