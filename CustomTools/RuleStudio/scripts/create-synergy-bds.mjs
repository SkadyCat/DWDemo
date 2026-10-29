import { minimumTierPreset } from '../public/build-preset-tier.mjs';
// Authoring only: saved equipment entries compose ordinary traits and mounted skills.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, createTraitValueEntry, validateTraitValueEntry, equipmentAffixPool } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';

export const SYNERGY_BDS = [
  { id: 'synergy_rime_thunder', name: '霜雷交响', skill: 'frost_lance', weapon: 'frostthorn_staff',
    description: '持续施放冰锥：多重与穿透增加命中，冰缓冻结后消费冻结触发雷霆新星；新星消耗感电强化雷伤，再次施加感电接续。需要命中敌人，空场停止；没有足够命中时继续手动施法。' },
  { id: 'synergy_plague_tide', name: '瘟疫回潮', skill: 'poison_flask', weapon: 'venomglass_flask', revision: 2,
    description: '朝鼠标位置投毒瓶：额外毒层使中毒达到引爆门槛，消耗中毒触发下一轮毒瓶；剩余毒伤转成范围爆发，传播与毒池覆盖周围。命中后可松开施法；无目标、目标死亡或断毒时需要重新投瓶。' },
  { id: 'synergy_sacrifice_thunder', name: '献祭雷铸', skill: 'iron_guard', skills: ['iron_guard', 'sacrifice'], weapon: 'iron_guard_sigil', revision: 2,
    description: '技能1召唤铁卫，等它接敌后按2切换献祭，再用左键/空格施放：恢复气血、把剩余气血转成护盾，在献祭位置释放雷霆新星并补召铁卫。献祭由装备词条授予，控制上限2只。持续施放献祭可继续循环，受正常施法消耗与冷却约束；自然死亡或到期不算献祭。' },
];
const BASES = [ ['weapon', null, '法器'], ['helmet', 'cinder_guard_helmet', '冠'],
  ['chest', 'cinder_guard_chest', '衣'], ['gloves', 'bloodthirst_gauntlets', '手套'], ['boots', 'warden_boots', '靴'] ];

export function createSynergyPresets(library, collections) {
  const definitions = new Map(equipmentAffixPool(library).map(row => [row.id, row]));
  const entry = (id, tier = 10) => {
    const source = library.trait(id)?.source;
    if (!source) throw new Error(`未知特性 ${id}`);
    return createTraitValueEntry(library, id, { tier: source.params.size ? tier : null, random: () => tier === 1 ? 0 : .999999 });
  };
  const affix = (id, { tier = 10 } = {}) => {
    const definition = definitions.get(id);
    if (!definition) throw new Error(`不可洗出的词条 ${id}`);
    const materialize = t => ({ ...entry(t.id, tier), with: (t.with || []).map(materialize) });
    const traits = definition.traits.map(materialize);
    const ranked = traits.some(t => t.tier || t.with.some(c => c.tier));
    return { id, name: definition.name, ...(ranked ? { tier } : {}), traits };
  };
  const sharedDefense = ['life_base', 'life_increased', 'life_regen_percent', 'armour',
    'fire_resistance', 'frost_resistance', 'lightning_resistance', 'poison_resistance'];
  const builds = {
    synergy_rime_thunder: () => [
      affix('freezing_hits'), affix('freeze_consume'),
      affix('consume_lightning_nova'),
      affix('shock_consume'), affix('shock_chance'), affix('shock_extra_layers'),
      affix('proj_count'), affix('proj_pierce'), affix('proj_layout_converge'), affix('proj_hit_life'),
      affix('frost_base'), affix('lightning_base'), affix('lightning_pen'), affix('trigger_more'),
      affix('trigger_cooldown_recovery'), affix('trigger_charges'), affix('trigger_cost'),
      affix('area_repeats'), affix('area_size'), affix('area_hit_mana'), affix('cold_mastery'), affix('chill_effect'),
      ...sharedDefense.map(id => affix(id)),
    ],
    synergy_plague_tide: () => [
      affix('poison_threshold_detonate', { tier: 1 }), affix('poison_extra_layers'), affix('poison_extra_on_poisoned'),
      affix('consume_poison_flask'), affix('trigger_cost'), affix('trigger_cooldown_recovery'),
      affix('poison_detonate_damage'), affix('poison_detonate_ratio'), affix('poison_detonate_area'), affix('poison_detonate_cooldown'),
      affix('poison_duration'), affix('poison_more'), affix('poison_kill_spread'), affix('trigger_repeat'),
      affix('poison_pool'), affix('trigger_cost'), affix('trigger_store_event'), affix('trigger_at_event'),
      affix('proj_count'), affix('proj_batch_cap'), affix('area_size'), affix('area_hit_life'),
      ...sharedDefense.map(id => affix(id)),
    ],
    synergy_sacrifice_thunder: () => [
      affix('sacrifice_thunder_guard'), affix('trigger_mount', { tier: 1 }),
      affix('trigger_at_event'), affix('trigger_order_sequence'), affix('trigger_cost'), affix('trigger_cooldown_recovery'),
      affix('control_unit_cap', { tier: 1 }), affix('minion_cap_same', { tier: 1 }), affix('minion_life'),
      affix('minion_sacrifice_life'), affix('minion_sacrifice_shield'), affix('shield_base'), affix('shield_from_life'),
      affix('shield_overflow'), affix('shield_overflow_damage'), affix('shield_added_lightning'),
      affix('lightning_pen'), affix('trigger_more'), affix('area_repeats'), affix('area_size'), affix('minion_damage'), affix('grant_sacrifice'),
      ...sharedDefense.map(id => affix(id)),
    ],
  };
  return SYNERGY_BDS.map(config => {
    const lines = builds[config.id]();
    if (lines.length !== 30) throw new Error(`${config.name} 应有30条词条，实际${lines.length}`);
    const groups = BASES.map(() => []);
    for (const line of lines) {
      const slot = groups.find(g => g.length < 6 && !g.some(a => a.id === line.id));
      if (!slot) throw new Error(`无法放置 ${line.id}`);
      slot.push(line);
    }
    const preset = { skills: [...(config.skills || [config.skill]), ...Array(4 - (config.skills?.length || 1)).fill(null)], equipment: {}, instances: {}, belt: [],
      authored: { source: 'generated-trait-composition', family: 'synergy', name: config.name, revision: config.revision || 1 } };
    groups.forEach((affixes, index) => {
      const [slot, fixedBase, suffix] = BASES[index], baseId = fixedBase || config.weapon;
      const base = collections.equipment.get(baseId)?.doc;
      if (!base || base.slot !== slot) throw new Error(`无效底材 ${baseId}`);
      const check = trait => {
        const error = validateTraitValueEntry(library, trait);
        if (error) throw new Error(error);
        trait.with.forEach(check);
      };
      affixes.forEach(a => a.traits.forEach(check));
      const uid = `${config.id}_v${config.revision || 1}_${slot}`;
      preset.equipment[slot] = uid;
      preset.instances[uid] = { uid, baseId, name: `${config.name}·${suffix}`, slot, level: base.level,
        rarity: 'rare', tier: 10, skill: base.skills[0] || '', affixes, legendary: null };
    });
    const probe = { owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
    const applied = applyBuildPreset(probe, preset, collections, library);
    if (applied.error) throw new Error(`${config.name}：${applied.error}`);
    return { config, preset: minimumTierPreset(preset, library) };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = checkRuleSet(readRuleFiles());
  if (!check.ok) throw new Error(check.error);
  const generated = createSynergyPresets(check.library, check.collections);
  const dir = path.join(TOOL_ROOT, '../../Content/Rules/Presets'), indexPath = path.join(dir, 'index.json');
  const ids = new Set(SYNERGY_BDS.map(row => row.id));
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')).filter(row => !ids.has(row.id));
  for (const { config, preset } of generated) {
    fs.writeFileSync(path.join(dir, `${config.id}.json`), JSON.stringify(preset, null, 2) + '\n');
    index.push({ id: config.id, name: config.name, description: `${config.description} 五件稀有T1、30条可洗词条；生成的体验装备。` });
    console.log(`${config.name}: ${config.id}`);
  }
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
}
