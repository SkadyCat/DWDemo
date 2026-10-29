// Read-only experiments over the real Battle runtime. This module never changes combat rules.
import { checkRuleSet, createTraitValueEntry, equipmentAffixPool, ensureEquipmentInherentTraits, readTraitText, newBuild, EOp } from '../../engine/index.mjs';
import { Battle } from '../sim/battle.mjs';
import { affixText } from '../affix-text.mjs';
import { sha256Text } from './digest.mjs';

export const HUNTER_VERSION = 2;
export const DEFAULT_CANDIDATES = Object.freeze([
  'shock_max_stacks', 'shock_extra_layers', 'shock_effect', 'shock_chance', 'shock_per_layer',
  'lightning_base', 'inc_lightning', 'more_lightning', 'more_elemental', 'lightning_pen',
  'trigger_repeat', 'trigger_extra', 'trigger_more', 'trigger_damage', 'trigger_cooldown_flat',
  'trigger_cooldown_recovery', 'trigger_charges', 'trigger_cost',
  'area_repeats', 'area_repeat_damage', 'area_more', 'area_damage', 'area_size', 'area_hit_mana',
  'frost_base', 'more_frost', 'frost_pen', 'freeze_duration', 'freeze_buildup', 'freeze_elite',
  'chill_effect', 'proj_count', 'proj_origins', 'proj_batch_cap', 'proj_pierce', 'proj_hit_life',
]);
const SLOT_NAMES = { weapon: '武器', offhand: '副手', helmet: '头盔', chest: '胸甲', gloves: '手套', boots: '鞋子', belt: '腰带', amulet: '项链', ring: '戒指' };
const ELEMENTS = ['fire', 'frost', 'lightning', 'physical', 'poison', 'void'];
const mean = a => a.reduce((s, n) => s + n, 0) / Math.max(1, a.length);
const ratio = (a, b) => Math.abs(b) > 1e-9 ? a / b : 0;
const delta = (a, b) => 100 * ratio(a - b, b);
const copy = value => structuredClone(value);
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
const traitIds = entries => entries.flatMap(t => [t.id, ...traitIds(t.with || [])]);

export function createHunterContext(files) {
  const checked = checkRuleSet(files);
  if (!checked.ok) throw new Error(checked.error);
  return { files, library: checked.library, collections: checked.collections, pool: equipmentAffixPool(checked.library) };
}

export async function hunterFingerprint(files, preset) {
  const source = JSON.stringify([HUNTER_VERSION, [...files].sort((a, b) => a.path.localeCompare(b.path, 'en')).map(f => [f.path, f.text]), preset]);
  return sha256Text(source);
}

export function prepareHunterPreset(context, preset) {
  const result = copy(preset);
  for (const [slot, uid] of Object.entries(result.equipment || {})) {
    const item = result.instances?.[uid];
    if (!item) throw new Error(`装备 ${slot} 没有实例词缀，当前分析器需要实例装备预设`);
    const base = context.collections.equipment.get(item.baseId)?.doc;
    if (!base) throw new Error(`装备底材不存在：${item.baseId}`);
    ensureEquipmentInherentTraits(item, base, context.library);
  }
  return result;
}

export function listHunterAffixes(preset, library) {
  return Object.entries(preset.equipment || {}).flatMap(([slot, uid]) => {
    const item = preset.instances?.[uid];
    return (item?.affixes || []).map((affix, index) => ({
      key: `${slot}:${index}`, uid, slot, slotName: SLOT_NAMES[slot] || slot, index,
      id: affix.id, name: affixText(affix, library), itemName: item.name,
      tier: affix.tier || null, traits: traitIds(affix.traits),
    }));
  });
}

export function removeHunterAffix(preset, entry) {
  const result = copy(preset);
  result.instances[entry.uid].affixes.splice(entry.index, 1);
  return result;
}

export function materializeHunterAffix(definition, library, tier = 10) {
  const materialize = t => {
    const source = library.trait(t.id)?.source;
    if (!source) throw new Error(`候选特性不存在：${t.id}`);
    return { ...createTraitValueEntry(library, t.id, { tier: source.params.size ? tier : null, random: () => .5 }), with: (t.with || []).map(materialize) };
  };
  const traits = definition.traits.map(materialize);
  const ranked = traits.some(t => t.tier || t.with.some(c => c.tier));
  return { id: definition.id, name: definition.name, ...(ranked ? { tier } : {}), traits };
}

export function canReplaceHunterAffix(preset, entry, replacement) {
  const item = preset.instances[entry.uid];
  if (replacement.id === entry.id) return false;
  const ids = new Set(traitIds(replacement.traits));
  return !item.affixes.some((a, i) => i !== entry.index && (a.id === replacement.id || traitIds(a.traits).some(id => ids.has(id))));
}

export function replaceHunterAffix(preset, entry, replacement) {
  if (!canReplaceHunterAffix(preset, entry, replacement)) throw new Error('同件装备存在重复或冲突词缀');
  const result = copy(preset);
  result.instances[entry.uid].affixes[entry.index] = copy(replacement);
  return result;
}

export function hunterScenarios({ resistance = 20, highResistance = 60, targets = 12, pressure = 300 } = {}) {
  for (const n of [resistance, highResistance]) if (!Number.isFinite(n) || n < 0 || n > 90) throw new Error('抗性需要在 0 到 90 之间');
  if (!Number.isInteger(targets) || targets < 2 || targets > 48) throw new Error('群体目标数需要在 2 到 48 之间');
  if (!Number.isFinite(pressure) || pressure <= 0 || pressure > 10000) throw new Error('标准压力伤害无效');
  return [
    { id: 'single', name: `单体 · ${resistance}% 抗性`, targets: 1, resistance },
    { id: 'pack', name: `${targets} 目标密集 · ${resistance}% 抗性`, targets, resistance },
    { id: 'resistant', name: `高抗单体 · ${highResistance}% 抗性`, targets: 1, resistance: highResistance },
    { id: 'pressure', name: `单体与标准压力 · 每秒 ${pressure} 原始伤害`, targets: 1, resistance, incoming: { amount: pressure, interval: 1 } },
  ];
}

export function simulateHunter(context, preset, { scenario, duration = 30, seed = 18, input = {} }) {
  if (!scenario || !Number.isFinite(duration) || duration < 1 || duration > 120) throw new Error('模拟参数无效');
  const b = new Battle(context.files, { collections: context.collections, maxMonsters: 0, spawnRate: 0, god: false, seed });
  b.setLoadout(copy(preset));
  const sacrificeSlot = b.skills.findIndex(skill => skill && b.host.plan(skill.plan)?.actions.some(action => action?.op === EOp.Sacrifice));
  if (input.sacrificeEvery > 0 && sacrificeSlot < 0) throw new Error('请先通过装备词条授予并装配献祭主动技能');
  if (b.hero.plan < 0) throw new Error(b.hero.error || '主技能无法编译');
  b.spawnMonsters(scenario.targets);
  const columns = Math.min(3, scenario.targets), rows = Math.ceil(scenario.targets / columns);
  b.monsters.forEach((m, i) => Object.assign(m, {
    x: 500 + i % columns * 80, y: (Math.floor(i / columns) - (rows - 1) / 2) * 90,
    health: 1e9, maxHealth: 1e9, speed: 0, cooldown: 9999, attackRange: 0,
    shield: 0, maxShield: 0, resistance: Array(4).fill(scenario.resistance),
  }));
  b.setAim(550, 0);
  // Pressure is authored with the existing damage action, so it traverses BOTH
  // rule-world resistance and the normal character mitigation / resource path.
  const incomingElements = scenario.incoming?.elements || ['physical', 'fire', 'frost', 'lightning', 'poison'];
  const pressurePlans = {};
  if (scenario.incoming) for (const element of new Set(incomingElements)) {
    const id = `bd_hunter_pressure_${element}`;
    const read = readTraitText(JSON.stringify({ id, params: { amount: scenario.incoming.amount },
      modifiers: [{ target: 'owner', stat: 'critical_chance', op: 'set', value: 0 }],
      rules: [{ id, event: 'cast', actions: [{ op: 'damage_area', radius: 1, amount: { param: 'amount' },
        element, tags: [element, element === 'physical' ? 'melee' : 'spell'] }] }] }));
    if (!read.trait) throw new Error(read.error);
    const compiled = b.host.compileSource(newBuild(id, [read.trait]));
    if (compiled.plan < 0) throw new Error(compiled.error);
    pressurePlans[element] = compiled.plan;
  }
  const counters = { freezes: 0, consumedFreeze: 0, consumedShock: 0, detonations: 0, triggered: 0 };
  const triggeredSkills = {}, elements = {}, victims = new Set();
  let manaMin = b.character.mana, lifeMin = 1, incomingTaken = 0, damageLastThird = 0;
  let peakQueue = 0, peakProjectiles = 0, incomingCount = 0, sacrificeAt = 0;
  const heroDamage = b.combat.heroDamage.bind(b.combat);
  b.combat.heroDamage = request => { const result = heroDamage(request); incomingTaken += result.taken || 0; return result; };
  const register = b.combat.register.bind(b.combat);
  b.combat.register = (index, data) => {
    if (data.kind === 'trigger') {
      counters.triggered++;
      const plan = b.host.plan(b.host.world.roots[index].plan);
      const active = plan.traitIds.find(id => context.library.trait(id)?.source.rules.some(r => r.event === 'cast')) || 'unknown';
      triggeredSkills[active] = (triggeredSkills[active] || 0) + 1;
    }
    return register(index, data);
  };
  const ailments = b.combat.ailments;
  for (const [method, counter] of [['removeFreeze', 'consumedFreeze'], ['consumeShock', 'consumedShock'], ['detonateNow', 'detonations']]) {
    const original = ailments[method].bind(ailments);
    ailments[method] = (...args) => {
      const present = method === 'removeFreeze' ? b.combat.status(args[0], 'freeze') > 0 : method === 'consumeShock' ? ailments.shockLayers(args[0]) > 0 : true;
      if (present) counters[counter]++;
      return original(...args);
    };
  }
  const ailment = b.combat.triggers.ailment.bind(b.combat.triggers);
  b.combat.triggers.ailment = (type, ...args) => { if (type === 'freeze') counters.freezes++; return ailment(type, ...args); };
  b.onDamageDealt = row => {
    victims.add(row.TargetExternalId);
    const el = ELEMENTS[row.Element] || String(row.Element);
    elements[el] = (elements[el] || 0) + row.Amount;
    if (b.elapsed >= duration * 2 / 3) damageLastThird += row.Amount;
  };
  const frames = Math.round(duration * 60), hitEvery = scenario.incoming ? Math.round(scenario.incoming.interval * 60) : 0;
  for (let frame = 0; frame < frames; frame++) {
    const opening = frame / 60 < (input.castFor ?? duration);
    const sacrifice = !opening && input.sacrificeEvery > 0 && b.elapsed >= sacrificeAt;
    const slot = sacrifice ? sacrificeSlot : 0;
    if (b.selected !== slot) b.select(slot);
    b.hero.casting = opening || sacrifice;
    const castsBefore = b.hero.casts;
    if (hitEvery && frame > 0 && frame % hitEvery === 0) {
      const element = incomingElements[incomingCount++ % incomingElements.length];
      b.host.castBuild(pressurePlans[element], b.monsterOwner, { x: b.hero.x, y: b.hero.y, z: 60 }, { x: 1, y: 0, z: 0 });
    }
    b.step(1 / 60);
    if (sacrifice && b.hero.casts > castsBefore) sacrificeAt = b.elapsed + input.sacrificeEvery;
    manaMin = Math.min(manaMin, b.character.mana);
    lifeMin = Math.min(lifeMin, b.character.life / Math.max(1, b.character.maxLife));
    peakQueue = Math.max(peakQueue, b.combat.triggers.queue.length + b.host.world.deferred.length);
    peakProjectiles = Math.max(peakProjectiles, b.host.world.carriers.num);
    if (b.hero.dead) break;
  }
  return {
    seed, damage: b.damageDealt, dps: b.damageDealt / duration,
    perTargetDps: b.damageDealt / duration / Math.max(1, victims.size), hitTargets: victims.size,
    tailDps: damageLastThird / (duration / 3), casts: b.hero.casts,
    aliveSeconds: Math.min(duration, b.elapsed), survived: !b.hero.dead,
    manaMin, manaEnd: b.character.mana, maxMana: b.character.maxMana, lifeMin,
    maxLife: b.character.maxLife, incomingTaken, counters, triggeredSkills, elements, peakQueue, peakProjectiles,
  };
}

function aggregateSamples(samples) {
  const result = { samples };
  for (const key of ['damage', 'dps', 'perTargetDps', 'hitTargets', 'tailDps', 'casts', 'aliveSeconds', 'manaMin', 'manaEnd', 'maxMana', 'lifeMin', 'maxLife', 'incomingTaken']) result[key] = mean(samples.map(s => s[key]));
  result.survivors = samples.filter(s => s.survived).length;
  result.dpsRange = [Math.min(...samples.map(s => s.dps)), Math.max(...samples.map(s => s.dps))];
  for (const group of ['counters', 'triggeredSkills', 'elements']) {
    const keys = new Set(samples.flatMap(s => Object.keys(s[group])));
    result[group] = Object.fromEntries([...keys].map(key => [key, mean(samples.map(s => s[group][key] || 0))]));
  }
  result.peakQueue = Math.max(...samples.map(s => s.peakQueue));
  result.peakProjectiles = Math.max(...samples.map(s => s.peakProjectiles));
  return result;
}

function compareScenarios(variant, baseline) {
  return Object.fromEntries(Object.keys(baseline).map(id => {
    const a = variant[id], b = baseline[id];
    const paired = a.samples.map((s, i) => delta(s.dps, b.samples[i].dps));
    return [id, { dpsPercent: delta(a.dps, b.dps), seedRange: [Math.min(...paired), Math.max(...paired)],
      triggerPercent: delta(a.counters.triggered, b.counters.triggered),
      aliveSeconds: a.aliveSeconds - b.aliveSeconds, lifeMinPoints: 100 * (a.lifeMin - b.lifeMin),
      incomingTakenPercent: delta(a.incomingTaken, b.incomingTaken), manaMin: a.manaMin - b.manaMin }];
  }));
}

export function classifyHunterRemoval(comparison, baseline) {
  const ids = ['single', 'pack', 'resistant'].filter(id => comparison[id]);
  const loss = Math.max(0, ...ids.map(id => -comparison[id].dpsPercent));
  const broken = ids.some(id => baseline[id].counters.triggered > 0 && comparison[id].triggerPercent <= -90);
  const pressure = comparison.pressure;
  if (broken) return { group: '核心触发', order: 0, loss };
  if (loss >= 10) return { group: '输出优先', order: 1, loss };
  if (pressure && (pressure.aliveSeconds < -.2 || pressure.lifeMinPoints < -3 || pressure.incomingTakenPercent > 3)) return { group: '防御续航', order: 2, loss };
  if (loss >= 2) return { group: '有效提升', order: 3, loss };
  return { group: '当前收益低', order: 4, loss };
}

function chooseReplacement(removals, preset, definitions, duration) {
  return [...removals].sort((a, b) => {
    const risk = row => Math.max(row.loss, -(row.comparison.pressure?.lifeMinPoints || 0),
      row.comparison.pressure?.incomingTakenPercent || 0, -100 * (row.comparison.pressure?.aliveSeconds || 0) / duration);
    const coverage = row => definitions.filter(definition => canReplaceHunterAffix(preset, row, definition)).length;
    return risk(a) - risk(b) || coverage(b) - coverage(a) || a.key.localeCompare(b.key);
  })[0];
}

export async function runHunter(context, presetInput, options = {}) {
  const preset = prepareHunterPreset(context, presetInput);
  const duration = options.duration ?? 30, seeds = options.seeds ?? [18, 67, 193];
  if (!Number.isFinite(duration) || duration < 1 || duration > 120 || !seeds.length || seeds.length > 8 || seeds.some(n => !Number.isSafeInteger(n))) throw new Error('时长或随机种子无效');
  if (options.candidateTier !== undefined && (!Number.isInteger(options.candidateTier) || options.candidateTier < 1 || options.candidateTier > 10)) throw new Error('候选阶级无效');
  if (Object.values(options.input || {}).some(n => !Number.isFinite(n) || n < 0)) throw new Error('操作参数需要非负有限数值');
  const scenarios = options.scenarios || hunterScenarios(options);
  if (!scenarios.length || new Set(scenarios.map(s => s.id)).size !== scenarios.length) throw new Error('场景配置无效');
  const affixes = listHunterAffixes(preset, context.library);
  if (!affixes.length) throw new Error('没有可分析的实例随机词缀');
  const pool = new Map(context.pool.map(a => [a.id, a]));
  const candidateIds = options.candidateIds === 'all' ? [...pool.keys()] : options.candidateIds ?? DEFAULT_CANDIDATES.filter(id => pool.has(id));
  const unknown = candidateIds.filter(id => !pool.has(id));
  if (unknown.length) throw new Error(`候选不在正常词缀池：${unknown.join('、')}`);
  let done = 0, total = (1 + affixes.length + candidateIds.length) * scenarios.length * seeds.length;
  const progress = (phase, name) => options.onProgress?.({ phase, name, done, total });
  const simulate = async (loadout, phase, name) => {
    const result = {};
    for (const scenario of scenarios) {
      const samples = [];
      for (const seed of seeds) {
        if (options.isCancelled?.()) throw new Error('分析已取消');
        samples.push(simulateHunter(context, loadout, { scenario, duration, seed, input: options.input }));
        done++; progress(phase, `${name} · ${scenario.name}`);
        await nextTask();
      }
      result[scenario.id] = aggregateSamples(samples);
    }
    return result;
  };
  const fingerprint = await hunterFingerprint(context.files, presetInput);
  progress('baseline', '基准配置');
  const baseline = await simulate(preset, 'baseline', '基准配置');
  const removals = [];
  for (const affix of affixes) {
    const measurements = await simulate(removeHunterAffix(preset, affix), 'remove', affix.name);
    const comparison = compareScenarios(measurements, baseline);
    removals.push({ ...affix, measurements, comparison, ...classifyHunterRemoval(comparison, baseline) });
  }
  removals.sort((a, b) => a.order - b.order || b.loss - a.loss || a.key.localeCompare(b.key));
  const replacement = options.replacementKey ? removals.find(row => row.key === options.replacementKey) : chooseReplacement(removals, preset, candidateIds.map(id => pool.get(id)), duration);
  if (!replacement) throw new Error('替换参照词缀不存在');
  const item = preset.instances[replacement.uid], tier = Math.min(options.candidateTier ?? 10, item.tier || 10);
  if (!Number.isInteger(tier) || tier < 1 || tier > 10) throw new Error('候选阶级无效');
  const skipped = [], candidates = [];
  for (const id of [...new Set(candidateIds)]) {
    const affix = materializeHunterAffix(pool.get(id), context.library, tier);
    if (!canReplaceHunterAffix(preset, replacement, affix)) { skipped.push({ id, reason: '同件装备重复或特性冲突，或与参照相同' }); continue; }
    candidates.push(affix);
  }
  total = done + candidates.length * scenarios.length * seeds.length;
  const replacements = [];
  for (const affix of candidates) {
    const measurements = await simulate(replaceHunterAffix(preset, replacement, affix), 'replace', affixText(affix, context.library));
    const comparison = compareScenarios(measurements, baseline);
    replacements.push({ id: affix.id, name: affixText(affix, context.library), tier: affix.tier || null, affix,
      measurements, comparison, score: Math.max(...['single', 'pack', 'resistant'].filter(id => comparison[id]).map(id => comparison[id].dpsPercent)) });
  }
  replacements.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  progress('done', '完成');
  return {
    version: HUNTER_VERSION, fingerprint, generatedAt: new Date().toISOString(),
    preset: { name: presetInput.authored?.name || presetInput.meta?.name || presetInput.name || 'BD', id: options.presetId || '', skills: preset.skills },
    settings: { duration, seeds, scenarios, candidateTier: tier, input: options.input || {}, candidateIds: [...candidateIds] },
    methodology: ['真实 Battle 运行时，正常生命与魔力，不开启无敌', '固定高生命静止目标，不触发击杀收益；这不是爬塔通关结果', 'DPS = 实际伤害 / 完整时长；平均单体 DPS 再除以实际受击目标数', '移除实验是诊断；替换实验维持相同词缀数量，候选取合法阶级中位值', '候选为列明的有限清单；每项只测试一次替换，未声称全局最优', '标准压力由外部固定节奏输入，不受敌方冻结和减速影响'],
    baseline, removals, replacement: { key: replacement.key, id: replacement.id, name: replacement.name, slotName: replacement.slotName, itemName: replacement.itemName },
    replacements, skipped, totalRuns: done,
  };
}

/** Explicit multi-affix checks reveal redundant paths and conditional upgrades. */
export async function compareHunterGroup(context, presetInput, report, group, onSample = null) {
  if (report.version !== HUNTER_VERSION || report.fingerprint !== await hunterFingerprint(context.files, presetInput)) throw new Error('组合对照的基准报告与当前来源不匹配');
  let preset = prepareHunterPreset(context, presetInput);
  for (const id of group.remove || []) {
    const matches = listHunterAffixes(preset, context.library).filter(row => row.id === id);
    if (!matches.length) throw new Error(`组合对照缺少词缀：${id}`);
    for (const item of Object.values(preset.instances)) item.affixes = item.affixes.filter(a => a.id !== id);
  }
  const pool = new Map(context.pool.map(a => [a.id, a]));
  for (const swap of group.swap || []) {
    const row = listHunterAffixes(preset, context.library).find(a => a.id === swap.from);
    if (!row || !pool.has(swap.to)) throw new Error(`组合替换不存在：${swap.from} → ${swap.to}`);
    const tier = Math.min(report.settings.candidateTier, preset.instances[row.uid].tier || 10);
    preset = replaceHunterAffix(preset, row, materializeHunterAffix(pool.get(swap.to), context.library, tier));
  }
  const measurements = {};
  for (const scenario of report.settings.scenarios) {
    const samples = [];
    for (const seed of report.settings.seeds) {
      samples.push(simulateHunter(context, preset, { scenario, duration: report.settings.duration, seed, input: report.settings.input }));
      onSample?.(); await nextTask();
    }
    measurements[scenario.id] = aggregateSamples(samples);
  }
  return { ...copy(group), measurements, comparison: compareScenarios(measurements, report.baseline),
    runs: report.settings.scenarios.length * report.settings.seeds.length };
}
