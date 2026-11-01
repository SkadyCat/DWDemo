// Write the ten growth builds: skill traits, buff statuses, builds, common weapons and preview presets.
//   node scripts/create-growth-bds.mjs            write rule files (Traits, Statuses, Builds, Equipment)
//   node scripts/create-growth-bds.mjs --presets  also (re)author the preview presets (needs the files above)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { GROWTH_BDS, growthTrait, growthStatuses } from './growth-bds-data.mjs';

const RULES = path.join(TOOL_ROOT, '../../Content/Rules');
const write = (dir, id, doc) => fs.writeFileSync(path.join(RULES, dir, `${id}.json`), JSON.stringify(doc, null, 2) + '\n');

export function growthBuild(bd) {
  const traits = [bd.trait, ...(bd.extraTraits || []), ...(bd.selfArea ? ['area_at_self'] : [])];
  return { id: bd.id, name: bd.name, description: bd.description, active: bd.trait, traits };
}

export function growthWeapon(bd) {
  const w = bd.weapon;
  return { id: w.id, name: w.name, description: `绑定${bd.name}。词条按装备品质与 T 阶随机生成；传奇品质固定带有一条强化词条。`,
    slot: 'weapon', rarity: 'common', level: 1, tier: 1, tags: w.tags, skills: [bd.id], traits: [], legendary: w.legendary, bases: [w.base] };
}

/** The three one-click stages of every growth build: same gear, different kill progress. */
export const GROWTH_PRESET_STAGES = Object.freeze([
  { stage: 1, gradeName: 'Ⅰ · 起势', at: () => 0, note: '从零开始成长，体验叠层与爆发' },
  { stage: 2, gradeName: 'Ⅱ · 觉醒', at: t => t.awaken_at, note: '直接进入觉醒' },
  { stage: 3, gradeName: 'Ⅲ · 极境', at: t => t.ultimate_at, note: '直接进入极境，全部效果解锁' },
]);
export const growthPresetId = (bd, stage) => `growth_${bd.id}_${stage}`;

/** Preset index rows (BD 面板): one family per build, three stage rows. */
export function growthIndexRows(bd) {
  const params = growthTrait(bd).params;
  return GROWTH_PRESET_STAGES.map(({ stage, gradeName, at, note }, i) => ({
    id: growthPresetId(bd, stage), name: `${bd.name}·${gradeName.split(' · ')[1]}`, group: `growth_${bd.id}`, groupName: bd.name, grade: stage, gradeName,
    mechanism: `${note}${at(params) ? `（本层已击杀 ${at(params)}）` : ''}`,
    description: `${bd.description} ${i === 0 ? bd.stages.slice(0, 2).join('；') : bd.stages[i + 1]}。五件稀有装备 + 光环指环，仅使用现有词条。`,
  }));
}

export function createGrowthPreset(bd, library, collections, deps, stage = 1) {
  const { createTraitValueEntry, equipmentRandom, validateTraitValueEntry, minimumTierPreset, applyBuildPreset } = deps;
  const random = equipmentRandom(20261031 + bd.id.length);
  const entry = id => createTraitValueEntry(library, id, { tier: library.trait(id)?.source.params.size ? 10 : null, random });
  const affix = id => {
    if (!library.trait(id)) throw new Error(`${bd.id}: 未知词条 ${id}`);
    const trait = entry(id); trait.with = [];
    const error = validateTraitValueEntry(library, trait);
    if (error) throw new Error(`${bd.id}/${id}: ${error}`);
    return { id, name: library.traitDisplayName(id), ...(trait.tier ? { tier: trait.tier } : {}), traits: [trait] };
  };
  const bases = { weapon: bd.weapon.id, helmet: 'cinder_guard_helmet', chest: 'cinder_guard_chest', gloves: 'bloodthirst_gauntlets', boots: 'warden_boots', ring: bd.aura };
  const names = { weapon: bd.weapon.name, helmet: '战盔', chest: '胸甲', gloves: '护手', boots: '战靴', ring: '光环指环' };
  const preset = { skills: [bd.id, null, null, null], equipment: {}, instances: {}, belt: [],
    authored: { source: 'generated-existing-traits', family: 'growth', name: `${bd.name}·成长`, revision: 1 } };
  for (const [slot, baseId] of Object.entries(bases)) {
    const base = collections.equipment.get(baseId)?.doc;
    if (!base || base.slot !== slot) throw new Error(`${bd.id}: 底材无效 ${baseId}`);
    const uid = `growth_${bd.id}_${slot}`;
    preset.equipment[slot] = uid;
    const affixes = slot === 'ring' ? [] : bd.gear[slot].map(affix);
    preset.instances[uid] = { uid, baseId, name: `${bd.name}·${names[slot]}`, slot, level: base.level,
      rarity: slot === 'ring' ? 'common' : 'rare', tier: 10, skill: base.skills?.[0] || '', affixes, legendary: null };
  }
  const result = applyBuildPreset({ owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} }, preset, collections, library);
  if (result.error) throw new Error(`${bd.id}: ${result.error}`);
  const out = minimumTierPreset(preset, library);
  // Applying a later stage also sets this floor's kill progress (read by battle3d applyBd).
  const step = GROWTH_PRESET_STAGES[(stage || 1) - 1];
  out.growth = { skill: bd.id, stage: step.stage, kills: step.at(growthTrait(bd).params) };
  return out;
}

/** Presentation table for the in-battle growth tracker (public/progression/growth.mjs). */
export function growthStageTable() {
  return Object.fromEntries(GROWTH_BDS.map(bd => {
    const t = growthTrait(bd).params, st = bd.statuses;
    return [bd.id, { name: bd.name, trait: bd.trait, melee: bd.melee, cap: t.growth_cap, awaken: t.awaken_at, ultimate: t.ultimate_at,
      charge: { id: `${bd.id}_charge`, name: st.charge[0], max: st.charge[2] }, surge: { id: `${bd.id}_surge`, name: st.surge[0] },
      stages: bd.stages }];
  }));
}

function writeRules() {
  fs.writeFileSync(path.join(TOOL_ROOT, 'public/progression/growth-stages.mjs'),
    '// Generated by scripts/create-growth-bds.mjs — do not edit by hand.\nexport const GROWTH_STAGES = ' + JSON.stringify(growthStageTable(), null, 2) + ';\n');
  for (const bd of GROWTH_BDS) {
    write(bd.web ? 'WebTraits' : 'Traits', bd.trait, growthTrait(bd));
    for (const s of growthStatuses(bd)) write('Statuses', s.id, s);
    write(bd.web ? 'WebBuilds' : 'Builds', bd.id, growthBuild(bd));
    write('Equipment', bd.weapon.id, growthWeapon(bd));
  }
}

async function writePresets() {
  const engine = await import('../engine/index.mjs');
  const { minimumTierPreset } = await import('../public/build-preset-tier.mjs');
  const { applyBuildPreset } = await import('../public/build-presets.mjs');
  const check = engine.checkRuleSet(readRuleFiles());
  if (!check.ok) throw new Error(check.error);
  const deps = { ...engine, minimumTierPreset, applyBuildPreset };
  const indexFile = path.join(RULES, 'Presets/index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')).filter(row => !/^growth/.test(row.group || ''));
  for (const file of fs.readdirSync(path.join(RULES, 'Presets'))) if (/^growth_.*\.json$/.test(file)) fs.rmSync(path.join(RULES, 'Presets', file));
  for (const bd of GROWTH_BDS) {
    for (const { stage } of GROWTH_PRESET_STAGES) write('Presets', growthPresetId(bd, stage), createGrowthPreset(bd, check.library, check.collections, deps, stage));
    index.push(...growthIndexRows(bd));
  }
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeRules();
  if (process.argv.includes('--presets')) await writePresets();
  console.log(`成长型 BD：${GROWTH_BDS.length} 套${process.argv.includes('--presets') ? '（含预设）' : ''}`);
}
