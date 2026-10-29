import { minimumTierPreset } from '../public/build-preset-tier.mjs';
// Generates equipment collections only. All behavior comes from existing rule-library traits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, createTraitValueEntry, validateTraitValueEntry, equipmentAffixPool } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';

export const AUTOCAST_BDS = [
  { id: 'autocast_return', name: '飞返连焰', skill: 'frost_lance', startup: 1,
    description: '每层手动施放一次冰锥启动。命中回归、达到最大距离返回都能续发冰锥，并同时释放烈焰爆发；空场可继续循环。' },
  { id: 'autocast_mana_restored', name: '回蓝自燃', skill: 'flame_burst', startup: 2, revision: 3,
    description: '每层连续手动施放两次烈焰爆发启动。累计恢复 3 点魔力触发烈焰爆发，每次消耗 3 点魔力，自然回蓝维持循环。每次范围额外重复 6 次，缩短重复间隔，三条基础火焰点伤在每次命中上生效，并有 60 点火抗穿透。保留气血再生、护甲和四抗；空场可维持。' },
  { id: 'autocast_mana_refund', name: '耗蓝连焰', skill: 'flame_burst', startup: 1,
    description: '每层手动施放一次烈焰爆发启动。累计消耗 2 点魔力后触发烈焰爆发并额外重复两次；两条返还词条保证消耗返还，消耗累计仍保留，空场可继续循环。' },
  { id: 'autocast_shield', name: '溢盾施法', skill: 'flame_burst', startup: 0,
    description: '装备后自动积累溢出护盾。溢出盾自然衰减，再生补回，每累计实际恢复 75 点护盾触发烈焰爆发；无需手动启动，也无需敌人。' },
  { id: 'autocast_summon', name: '召唤连焰', skill: 'sentinel', startup: 1,
    description: '每层手动召唤一次哨卫启动。每次召唤物生成都会同时续召哨卫和释放烈焰爆发；空场可继续。场上哨卫仍受原有数量上限和攻击节奏约束。' },
  { id: 'autocast_interval', name: '定时焰爆', skill: 'flame_burst', startup: 0,
    description: '每隔 2 秒自动释放一次烈焰爆发。装备后即可生效，无需手动启动或命中敌人。' },
  { id: 'autocast_still', name: '静止焰爆', skill: 'flame_burst', startup: 0,
    description: '保持静止时，每满 1 秒自动释放一次烈焰爆发。移动会打断静止计时，重新站定后继续。' },
  { id: 'autocast_moving', name: '行走焰爆', skill: 'flame_burst', startup: 0, moving: true,
    description: '使用 WASD 持续移动，每满 1 秒自动释放一次烈焰爆发。停止移动会停止这一条自动施法。' },
  { id: 'autocast_poison', name: '施毒连焰', skill: 'flame_burst', startup: 1, needsTarget: true,
    description: '每层或断链后，手动命中敌人启动。命中施加中毒，中毒触发下一次烈焰爆发，再次命中施毒续上；无需自身中毒。没有可命中目标时断链，重新命中启动。' },
  { id: 'autocast_shock', name: '感电连焰', skill: 'flame_burst', startup: 1, needsTarget: true,
    description: '每层或断链后，手动命中敌人启动。现有“闪电感电”复合词条负责起手，之后烈焰爆发附加闪电并施加感电，继续触发烈焰爆发。没有可命中目标时断链。' },
];

const plainWeapon = { frost_lance: 'frostthorn_staff', flame_burst: 'emberheart_staff', sentinel: 'sentinel_scepter' };
const bases = [['weapon', null, '法器'], ['helmet', 'cinder_guard_helmet', '护生冠'], ['chest', 'cinder_guard_chest', '续生衣'],
  ['gloves', 'bloodthirst_gauntlets', '回流护手'], ['boots', 'warden_boots', '稳生靴']];
// Shared combat support; no timer, secondary trigger, cost, speed or probability is hidden here.
const support = ['life_base', 'life_increased', 'life_more', 'life_regen_percent', 'life_regen_speed', 'life_regen_flat', 'life_on_hit',
  'armour', 'fire_resistance', 'frost_resistance', 'lightning_resistance', 'poison_resistance', 'hit_next_reduce',
  'trigger_damage', 'trigger_more', 'trigger_seek', 'area_size', 'area_size_more', 'area_damage', 'area_more', 'area_hit_life',
  'life_base', 'life_increased', 'trigger_damage', 'life_regen_percent', 'armour'];
// Keep the mana loop's cost unchanged: zero-cost casts or mana refunds can stop
// actual restoration at full mana. Area repeats add hits without extra trigger costs.
const manaRestoredSupport = [
  ...Array(3).fill('area_repeats'), ...Array(2).fill('area_repeat_interval'), 'area_delay',
  ...Array(3).fill('fire_base'), ...Array(2).fill('trigger_more'), ...Array(2).fill('area_more'),
  'trigger_damage', 'inc_fire', 'fire_pen', 'fire_pen',
  'life_base', 'life_increased', 'life_regen_percent', 'armour',
  'fire_resistance', 'frost_resistance', 'lightning_resistance', 'poison_resistance',
];

export function createAutocastPresets(library, collections) {
  const entry = (id, tier = 10) => {
    const source = library.trait(id)?.source;
    if (!source) throw new Error(`未知特性：${id}`);
    return createTraitValueEntry(library, id, { tier: source.params.size ? tier : null, random: () => tier === 1 ? 0 : .999999 });
  };
  const affix = (id, tier = 10, mounted = []) => {
    const trait = entry(id, tier);
    trait.with = mounted.map(child => entry(child, tier));
    return { id, name: library.traitDisplayName(id), ...(trait.tier ? { tier: trait.tier } : {}), traits: [trait] };
  };
  const resource = () => Array.from({ length: 3 }, () => affix('trigger_resource_reduction'));
  const free = () => [affix('trigger_cost'), affix('trigger_cost')];
  const chance = n => Array.from({ length: n }, () => affix('trigger_chance'));
  const flame = ['create_flame_burst'];
  const cores = {
    autocast_return: () => [affix('trig_return', 10, ['create_ice_lance', 'create_flame_burst', 'projectile_return']),
      affix('trigger_mount', 1), affix('proj_return_at_max'), affix('proj_return_pierce'), ...chance(2), affix('trigger_cooldown_flat'), ...free()],
    autocast_mana_restored: () => [affix('trig_mana_restored', 1, flame), affix('trigger_cooldown_flat'), ...resource()],
    autocast_mana_refund: () => [affix('trig_mana_spent', 1, flame), affix('trigger_repeat'), affix('trigger_refund'), affix('trigger_refund'), ...resource()],
    autocast_shield: () => [affix('trig_shield_restored', 1, flame), affix('shield_base'), affix('shield_increased'), affix('shield_overflow'),
      affix('shield_regen_percent'), affix('shield_regen_speed'), affix('shield_regen_flat'), affix('trigger_cost')],
    autocast_summon: () => [affix('trig_summon_spawn', 10, ['summon_sentinel', 'sentinel_ice_lance', 'create_flame_burst']),
      affix('trigger_mount', 1), affix('trigger_cooldown_flat'), ...free()],
    autocast_interval: () => [affix('trig_interval', 1, flame), affix('trigger_cost')],
    autocast_still: () => [affix('trig_still', 1, flame), affix('trigger_cost')],
    autocast_moving: () => [affix('trig_moving', 1, flame), affix('trigger_cost')],
    autocast_poison: () => [affix('trig_poison', 10, flame), affix('poison_chance'), affix('poison_chance'),
      ...chance(3), affix('trigger_cooldown_flat'), ...free()],
    autocast_shock: () => {
      const definition = equipmentAffixPool(library).find(a => a.id === 'shocking_hits');
      if (!definition) throw new Error('缺少现有闪电感电复合词条');
      const compound = { ...structuredClone(definition), tier: 10, traits: definition.traits.map(t => entry(t.id)) };
      return [affix('trig_shock', 10, ['create_flame_burst', 'lightning_damage', 'shock']), compound,
        ...chance(3), affix('trigger_cooldown_flat'), ...free()];
    },
  };
  return AUTOCAST_BDS.map(config => {
    const groups = bases.map(() => []);
    const place = affix => {
      const group = groups.find(g => g.length < 6 && !g.some(other => other.id === affix.id));
      if (!group) throw new Error(`${config.name} 的词条无法分配到五件装备`);
      group.push(affix);
    };
    [affix('trigger_store_event'), ...cores[config.id]()].forEach(place);
    const filler = config.id === 'autocast_mana_restored' ? manaRestoredSupport : support;
    let next = 0;
    while (groups.some(g => g.length < 6)) {
      if (next >= 300) throw new Error(`${config.name} 缺少可分配的辅助词条`);
      const candidate = affix(filler[next++ % filler.length]);
      if (groups.some(g => g.length < 6 && !g.some(a => a.id === candidate.id))) place(candidate);
    }
    const preset = { skills: [config.skill, null, null, null], equipment: {}, instances: {}, belt: [],
      authored: { source: 'generated-existing-traits', family: 'autocast', name: config.name, startupCasts: config.startup, moving: !!config.moving, needsTarget: !!config.needsTarget,
        ...(config.revision ? { revision: config.revision } : {}) } };
    const validate = (trait, tier) => {
      const error = validateTraitValueEntry(library, trait);
      if (error || (trait.tier && trait.tier !== tier)) throw new Error(error || '复合词条数值阶级不一致');
      trait.with.forEach(child => validate(child, tier));
    };
    groups.forEach((affixes, i) => {
      const [slot, fixedBase, suffix] = bases[i], baseId = fixedBase || plainWeapon[config.skill];
      const base = collections.equipment.get(baseId)?.doc;
      if (!base || base.slot !== slot) throw new Error(`无效底材：${baseId}`);
      const uid = `${config.id}${config.revision ? `_v${config.revision}` : ''}_${slot}`;
      affixes.forEach(a => a.traits.forEach(t => validate(t, a.tier)));
      preset.equipment[slot] = uid;
      preset.instances[uid] = { uid, baseId, name: `${config.name}·${suffix}`, slot, level: base.level, rarity: 'rare', tier: 10,
        skill: base.skills[0] || '', affixes, legendary: null };
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
  const generated = createAutocastPresets(check.library, check.collections);
  const directory = path.join(TOOL_ROOT, '../../Content/Rules/Presets'), indexFile = path.join(directory, 'index.json');
  const ownedIds = new Set(AUTOCAST_BDS.map(c => c.id));
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')).filter(c => !ownedIds.has(c.id));
  const hasEmbersFamily = index.some(c => c.group === 'embers_echo');
  for (const { config, preset } of generated) {
    fs.writeFileSync(path.join(directory, `${config.id}.json`), JSON.stringify(preset, null, 2) + '\n');
    // The old rare mana preset remains a reproducible reference, while its public
    // menu entry is owned by the five-grade legendary family generator.
    if (config.id !== 'autocast_mana_restored' || !hasEmbersFamily)
      index.push({ id: config.id, name: config.name, description: `${config.description} 五件稀有 T1、30 条现有词条；生成的体验配装。` });
    console.log(`${config.name}: ${config.id}`);
  }
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
}

