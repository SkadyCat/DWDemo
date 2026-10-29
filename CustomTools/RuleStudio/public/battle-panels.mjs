// Read-only views of the existing player save and battle runtime.
import { EStatusEffect, EBuiltinEvent, EOp, ELEMENT_NAMES, Tags, tagBit } from '../engine/types.mjs';
import { EStat, findStat, getStatInfo } from '../engine/stats.mjs';
import { ESlot, EExprOp, ActionFlag, evaluateExpr } from '../engine/compiler.mjs';
import { describeTrait } from '../engine/collections.mjs';
import { HERO_TARGET_ID } from './sim/arena.mjs';
import { equipmentTier, equipmentRarity } from '../engine/equipment.mjs';
import { affixText, traitText } from './affix-text.mjs';

export function mapEquipmentPanel(battle) {
  if (!battle.map) return null;
  const map = battle.map;
  return { name: map.name, tier: battle.mapTier ?? map.tier, invulnerable: map.invulnerable,
    lineages: monsterLineagePanel(battle),
    equipment: Object.entries(map.equipment).filter(([, item]) => item).map(([slot, item]) => ({
      slot, id: item.id, name: item.name || item.id, tier: equipmentTier(item),
      affixes: map.contributions.filter(row => row.from === slot).map(row => ({
        id: row.sourceId, text: traitText({ id: row.traitId, params: row.params }, battle.host.library),
        active: row.status === 'on', note: row.note,
      })),
    })),
  };
}

/** Eligible map lineages plus any live overrides; counts only actors still alive. */
export function monsterLineagePanel(battle) {
  const groups = new Map();
  const add = (item, monsterName = '') => {
    const doc = typeof item === 'string' ? battle.collections?.equipment?.get(item)?.doc : item;
    const key = doc ? JSON.stringify([doc.id, doc.traits]) : 'none';
    if (!groups.has(key)) groups.set(key, { key, id: doc?.id || '', name: doc?.name || '未配置谱系',
      description: doc?.description || '', monsters: [], count: 0, bosses: 0,
      affixes: (doc?.traits || []).map(entry => traitText(entry, battle.host.library)) });
    const row = groups.get(key);
    if (monsterName && !row.monsters.includes(monsterName)) row.monsters.push(monsterName);
    return row;
  };
  for (const type of battle.monsterTypes || []) add(type.equipment?.lineage, type.name);
  for (const monster of battle.monsters || []) if (monster.health > 0) {
    const row = add(monster.equipment?.lineage, monster.type?.name || monster.name);
    row.count++; if (monster.boss) row.bosses++;
  }
  return [...groups.values()];
}

export const BAG_COLUMNS = 12;
export const BAG_ROWS = 6;
export const BAG_PAGE_SIZE = BAG_COLUMNS * BAG_ROWS;

export class ItemInspector {
  constructor() { this.close(); this.x = 12; this.y = 12; }
  enter(key, rect, width, height) {
    this.hovered = key;
    if (this.pinned) return;
    this.key = key;
    const cardWidth = Math.min(360, width - 24);
    this.x = Math.max(12, Math.min(width - cardWidth - 12, rect.right + cardWidth + 12 <= width ? rect.right + 10 : rect.left - cardWidth - 10));
    this.y = Math.max(12, Math.min(rect.top, height - Math.min(560, height - 24) - 12));
  }
  leave(key) {
    if (this.hovered === key) this.hovered = '';
    if (!this.pinned && this.key === key) this.key = '';
  }
  pin() { if (this.key) this.pinned = true; }
  closeHover() { if (!this.pinned) this.close(); }
  close() { this.key = ''; this.hovered = ''; this.pinned = false; }
}

export function inventoryEntries(player, collections) {
  const result = [];
  const equipment = new Set(Object.values(player.loadout.equipment));
  const skills = new Set([...player.loadout.skills.filter(Boolean), ...(player.loadout.belt || []).filter(id => id?.startsWith('aura:')).map(id => id.slice(5))]);
  const push = (kind, id, count, doc, extra = {}) => {
    if (!(count > 0)) return;
    result.push({ key: `${kind}:${id}`, id, kind, count, name: doc?.name || id, baseId: doc?.baseId || '', slot: doc?.slot || '', skill: doc?.skill || '',
      description: doc?.description || '', rarity: kind === 'equipment' ? equipmentRarity(doc) : doc?.rarity || (kind === 'skill' ? 'skill' : ''),
      traits: doc?.identified === false ? [] : doc?.traits || [],
      category: doc?.category || '', currencyGrade: doc?.craft?.grade, maxStack: kind === 'item' ? doc?.stack || 9999 : kind === 'skill' ? 1 : 9999,
      unidentified: kind === 'equipment' && (!doc?.uid || doc.identified === false),
      equipped: kind === 'equipment' ? equipment.has(id) : kind === 'skill' ? skills.has(id) : player.loadout.belt.includes(id),
      ...extra });
  };
  for (const [id, count] of Object.entries(player.owned.equipment)) push('equipment', id, count, collections?.equipment?.get(id)?.doc);
  for (const item of Object.values(player.instances)) push('equipment', item.uid, 1, item, { instance: true, tier: equipmentTier(item), affixCount: item.affixes.length, affixes: item.affixes, legendary: item.legendary, extraLegendary: item.extraLegendary, slot: item.slot });
  for (const [id, count] of Object.entries(player.owned.item)) push('item', id, count, collections?.item?.get(id)?.doc);
  for (const [id, owned] of Object.entries(player.owned.skill)) if (owned) push('skill', id, 1, collections?.skill?.get(id)?.doc);
  return result;
}

export function filterInventoryEntries(entries, query, library) {
  const text = String(query || '').trim().toLocaleLowerCase();
  if (!text) return entries;
  return entries.filter(item => [item.name, item.description,
    ...(item.traits || []).map(trait => traitText(trait, library)),
    ...(item.legendary ? [affixText(item.legendary, library)] : []),
    ...(item.extraLegendary || []).map(affix => affixText(affix, library)),
    ...(item.affixes || []).map(affix => affixText(affix, library)),
  ].filter(Boolean).join('\n').toLocaleLowerCase().includes(text));
}

export function inventoryPage(entries, requestedPage = 0) {
  const pages = Math.max(1, Math.ceil(entries.length / BAG_PAGE_SIZE));
  const page = Math.min(pages - 1, Math.max(0, Math.trunc(requestedPage) || 0));
  return { page, pages, cells: Array.from({ length: BAG_PAGE_SIZE }, (_, i) => entries[page * BAG_PAGE_SIZE + i] || null) };
}

const ATTRIBUTES = [['strength', '力量', '气血、护盾（按词条）'], ['dexterity', '敏捷', ''], ['intelligence', '智力', '护盾（按词条）'], ['constitution', '体质', '气血（按词条）']];
const ELEMENT_LABELS = { physical: '物理', fire: '火焰', frost: '冰霜', lightning: '闪电', poison: '毒素', void: '虚空' };
const RESISTANCES = ['fire', 'frost', 'lightning', 'poison'];
const GROUP_ORDER = ['skill', 'equipment', 'talent', 'item', 'timed', 'status'];
const GROUP_NAMES = { skill: '技能', equipment: '装备', talent: '天赋', item: '物品', timed: '持续效果', status: '状态赋予' };
const round = (v, step = 0.1) => +(Math.round(v / step) * step).toFixed(8);
const signed = v => `${v > 0 ? '+' : ''}${round(v)}`;

/**
 * Player status panel. Everything is read from the running battle: the selected skill's plan with the
 * traits the hero holds right now, the character sheet and host-side status effects — the same values
 * the battle uses to move, cast and resolve hits.
 */
export function characterPanel(battle) {
  const hero = battle.hero, character = battle.character;
  const points = damagePoints(battle);
  return {
    rows: character.panel(),
    attributes: ATTRIBUTES.map(([key, name, note]) => ({ key, name, note, value: round(character.attributes[key] || 0) })),
    combat: combatStats(battle),
    damage: damageBonuses(battle),
    damagePoints: points,
    baseDamage: Object.entries(ELEMENT_LABELS).map(([element, name]) => {
      const rows = points.added.filter(row => row.base && row.element === element);
      return { element, name: `基础${name}伤害`, amount: round(rows.reduce((total, row) => total + row.amount, 0)), sources: rows.map(row => row.source).join('、') };
    }),
    resistances: resistances(battle),
    survival: character.panel().filter(row => !row.name.startsWith('力量')),
    traits: heldTraits(battle),
    statuses: battle.monsterStatuses({ id: characterTargetId(battle) }),
    flags: [
      [hero.dead, '已倒下'], [hero.god, '无敌'], [hero.stunned, '晕眩'],
      [hero.recharging, '护盾回充'], [hero.noResource, '资源不足'],
      [character.isLowLife, '低血'], [character.guard.left > 0, `减伤 ${character.guard.reduction}%`],
      [character.leech.life.length > 0, '气血偷取中'], [character.leechingShield, '护盾偷取中'],
    ].filter(([enabled]) => enabled).map(([, label]) => label),
    damageDealt: battle.damageDealt, damageTaken: battle.damageTaken,
    casts: hero.casts,
  };
}

// Plan the next cast would use (base plan + traits the hero holds now); null without a skill.
function livePlan(battle) {
  const host = battle.host, hero = battle.hero;
  if (!(hero.plan >= 0)) return null;
  const index = host.planWithSources(hero.plan, host.heldSources(characterTargetId(battle)));
  return host.plan(index >= 0 ? index : hero.plan);
}

const planStat = (plan, path) => {
  const stat = findStat(path);
  return plan && stat >= 0 ? plan.stats.get(stat) : stat >= 0 ? getStatInfo(stat).default : 0;
};

function combatStats(battle) {
  const hero = battle.hero, character = battle.character, host = battle.host;
  const id = characterTargetId(battle);
  const pace = battle.statusPace ? battle.statusPace(id) : { move: 1, action: 1 };
  const plan = livePlan(battle);
  const actionBonus = character.actionSpeed();
  const moveBonus = character.moveSpeed();
  // Same formulas as Arena.tickHero.
  const casts = hero.plan >= 0 ? (hero.castsPerSecond || 0) * pace.action * Math.max(0.1, 1 + actionBonus / 100) : 0;
  const base = hero.baseCastsPerSecond || 3;
  const move = (hero.speed || 0) * pace.move * Math.max(0.1, 1 + moveBonus / 100) / 100;
  const crit = Math.max(0, Math.min(100, planStat(plan, 'owner.critical_chance') + host.getStatusEffect(id, EStatusEffect.CriticalChance).value + character.offense().critical));
  const critMulti = planStat(plan, 'owner.critical_multiplier');
  const dealt = host.getStatusEffect(id, EStatusEffect.DamageDealt).value;
  const taken = host.getStatusEffect(id, EStatusEffect.DamageTaken).value;
  const out = [
    { key: 'cast', name: '攻速', value: hero.plan >= 0 ? `${round(casts, 0.01)} 次/秒` : '—', detail: hero.plan >= 0 ? `基础 ${base} 次/秒 · ${signed((casts / base - 1) * 100)}%` : '未选择技能', delta: hero.plan >= 0 ? casts / base - 1 : 0 },
    { key: 'move', name: '移速', value: `${round(move, 0.01)} m/s`, detail: `基础 ${round((hero.speed || 0) / 100, 0.01)} m/s · ${signed((pace.move * Math.max(0.1, 1 + moveBonus / 100) - 1) * 100)}%`, delta: pace.move * Math.max(0.1, 1 + moveBonus / 100) - 1 },
    { key: 'crit', name: '暴击率', value: `${round(crit)}%`, detail: `基础 ${getStatInfo(findStat('owner.critical_chance')).default}%`, delta: crit - getStatInfo(findStat('owner.critical_chance')).default },
    { key: 'critx', name: '暴击伤害', value: `${round(critMulti)}%`, detail: `基础 ${getStatInfo(findStat('owner.critical_multiplier')).default}%`, delta: critMulti - getStatInfo(findStat('owner.critical_multiplier')).default },
  ];
  const minions = battle.combat?.minions;
  if (minions) out.push({ key: 'controlUnits', name: '控制单位', value: `${minions.alive().length} / ${minions.controlCap()}`, detail: '所有受控召唤物共用名额，雷暴效果不占用', delta: minions.controlCap() - 1 });
  if (plan) {
    const count = planStat(plan, 'projectile.count');
    if (count !== 1) out.push({ key: 'count', name: '投射物', value: `${round(count, 1)} 枚`, detail: '每次发射', delta: count - 1 });
    const pierce = planStat(plan, 'projectile.pierce');
    if (pierce) out.push({ key: 'pierce', name: '穿透', value: `${round(pierce, 1)} 次`, detail: '每枚投射物', delta: pierce });
    const area = planStat(plan, 'area.radius');
    if (area) out.push({ key: 'area', name: '范围', value: `${signed(area)} m`, detail: '范围伤害半径', delta: area });
  }
  if (dealt) out.push({ key: 'dealt', name: '造成伤害', value: `${signed(dealt)}%`, detail: '来自状态', delta: dealt });
  if (taken) out.push({ key: 'taken', name: '承受伤害', value: `${signed(taken)}%`, detail: '来自状态', delta: -taken });
  return out;
}

function damageBonuses(battle) {
  const plan = livePlan(battle);
  const off = battle.character.offense();
  return Object.keys(ELEMENT_LABELS).map(element => {
    const increased = planStat(plan, `element.${element}.damage_percent`) + (off.increased[element] || 0);
    const flat = planStat(plan, `element.${element}.damage_flat`) + (off.flat[element] || 0);
    const more = off.more[element] ?? 1;
    return { element, name: ELEMENT_LABELS[element], increased: round(increased), flat: round(flat), more: round((more - 1) * 100) };
  }).filter(row => row.increased || row.flat || row.more);
}

// Read compiled actions, including aggregated parameter overrides. These are base points before
// elemental increases, critical hits, target defenses and other conditional combat modifiers.
export function damagePoints(battle, plan = livePlan(battle), withSheet = true) {
  const primary = [], added = [];
  const label = element => ELEMENT_LABELS[element] || element;
  if (plan) for (const rule of plan.rules) {
    const casting = rule.event === EBuiltinEvent.Cast;
    const ending = rule.event === EBuiltinEvent.ProjectileEnd;
    if (!casting && !ending && rule.event !== EBuiltinEvent.Hit) continue;
    for (let i = 0; i < rule.actionCount; i++) {
      const action = plan.actions[rule.actionFirst + i];
      const projectile = action.op === EOp.Emit;
      if (!projectile && action.op !== EOp.DamageArea && action.op !== EOp.DamageTarget) continue;
      if (!casting && projectile) continue;
      const ref = action.slots[projectile ? ESlot.Damage : ESlot.Amount];
      const code = plan.expr.slice(ref.first, ref.first + ref.count);
      const dynamic = code.some(instruction => instruction.op === EExprOp.State ||
        (instruction.op !== EExprOp.Const && instruction.op < EExprOp.Mul &&
          !(casting && [EExprOp.EventAmount, EExprOp.EventGeneration].includes(instruction.op))));
      let amount = dynamic ? null : !ref.set ? getStatInfo(EStat.ProjectileDamage).default :
        ref.count ? evaluateExpr(plan.expr, ref.first, ref.count, instruction => instruction.op === EExprOp.EventAmount ? battle.hero.power || 0 : 0) : ref.const;
      if (amount !== null && projectile && (action.flags & ActionFlag.Inherit)) amount = plan.stats.from(EStat.ProjectileDamage, amount);
      const element = ELEMENT_NAMES[action.element], sourceId = plan.traitIds[rule.trait];
      if (!element || amount !== null && amount <= 0) continue;
      (casting ? primary : added).push({ key: `${rule.id}:${i}`, element, name: label(element), amount: amount === null ? null : round(amount),
        baseAmount: amount, projectile, area: action.op === EOp.DamageArea, event: rule.event,
        conditional: !!(rule.conditionCount || rule.requireAll || rule.requireAny || rule.forbid),
        base: !casting && !ending && action.op === EOp.DamageTarget && !dynamic && !rule.conditionCount && !rule.requireAll && !rule.requireAny && !rule.forbid,
        sourceId, source: sourceId.startsWith('__character') ? '基础点伤' : battle.host.library.traitDisplayName(sourceId),
        detail: [casting ? projectile ? '每枚投射物' : '每次施法' : ending ?
          rule.requireAll & tagBit(Tags.EndImpact) ? '投射物撞击时' : rule.requireAll & tagBit(Tags.EndExpired) ? '投射物飞行结束时' : '投射物结束触发' : '命中追加',
          rule.conditionCount || rule.requireAll || rule.requireAny || rule.forbid ? '条件触发' : '', dynamic ? '随事件变化' : ''].filter(Boolean).join(' · ') });
    }
  }
  const off = withSheet ? battle.character.offense() : null;
  if (withSheet) for (const element of Object.keys(ELEMENT_LABELS)) {
    const flat = off.flat[element] || 0, sameElement = planStat(plan, `element.${element}.damage_flat`);
    if (flat) added.push({ key: `character:${element}`, element, name: label(element), amount: round(flat), base: true, source: '角色点伤聚合', detail: '命中追加' });
    if (sameElement) added.push({ key: `plan:${element}`, element, name: label(element), amount: round(sameElement), base: true, source: '技能属性聚合', detail: '每次同元素伤害附加' });
  }
  return { primary, added };
}

// Same as RuleWorld.effectiveResistance for the hero (base 0, defense plan partitions, max cap).
function resistances(battle) {
  const world = battle.host.world;
  const index = world.targetDefensePlans.get(HERO_ID);
  const stats = index !== undefined ? world.plans[index].stats : null;
  return RESISTANCES.map(element => {
    const stat = findStat(`element.${element}.resistance`), capStat = findStat(`element.${element}.max_resistance`);
    const cap = stats ? stats.get(capStat) : getStatInfo(capStat).default;
    const raw = stats ? stats.from(stat, 0) : 0;
    return { element, name: ELEMENT_LABELS[element], value: round(Math.min(raw, cap)), raw: round(raw), cap: round(cap) };
  });
}

/**
 * Every trait the hero has right now, grouped by where it comes from:
 * selected skill (+ equipment folded into it), timed grants (consumables, triggered buffs)
 * and traits granted by live statuses. Names resolve the actual source parameters into player-facing text.
 */
export function heldTraits(battle) {
  const lib = battle.host.library;
  const rows = [];
  const labels = { damage: '伤害', amount: '数值', duration: '持续', cooldown: '冷却', interval: '间隔', range: '索敌范围',
    radius: '半径', impact_radius: '落雷半径', count: '数量', cap: '数量上限', speed: '速度', lifetime: '飞行时间',
    projectile_radius: '碰撞半径', arc_height: '弧高', spread: '扩散', chance: '概率', slow: '减速', ratio: '比例',
    damage_ratio: '伤害比例', damage_multiplier: '伤害倍率', resistance: '抗性', chill: '冰缓强度', level: '等级',
    life_growth: '气血成长', damage_growth: '伤害成长', critical_chance: '暴击率', damage_percent: '伤害加成', cast_speed: '施法速度' };
  const label = (id, params = {}, withEntries = []) => {
    const text = traitText({ id, params, with: withEntries }, lib);
    if (text !== lib.traitDisplayName(id)) return text;
    const values = new Map([...(lib.trait(id)?.source.params || []), ...Object.entries(params)].map(([key, value]) => [key.toLowerCase(), value]));
    const details = [...values].filter(([, value]) => Number.isFinite(value)).map(([key, value]) => {
      const seconds = ['duration', 'cooldown', 'interval', 'lifetime'].includes(key);
      const percent = ['chance', 'slow', 'resistance', 'chill', 'critical_chance', 'damage_percent', 'cast_speed'].includes(key);
      const ratio = ['ratio', 'damage_ratio'].includes(key);
      const meters = ['radius', 'impact_radius', 'range', 'projectile_radius', 'arc_height'].includes(key);
      const multiplier = ['damage_multiplier', 'life_growth', 'damage_growth'].includes(key);
      const number = +Number(value * (ratio ? 100 : 1)).toFixed(6);
      return `${labels[key] || '数值'} ${multiplier ? '×' : ''}${number}${seconds ? 's' : percent || ratio ? '%' : meters ? '米' : key === 'speed' ? '米/s' : key === 'spread' ? '°' : ''}`;
    });
    return details.length ? `${text}：${details.join('，')}` : text;
  };
  const push = (id, extra, params = {}, withEntries = []) => {
    const entry = lib.trait(id);
    const info = entry ? describeTrait(entry) : null;
    rows.push({
      id, name: label(id, params, withEntries), description: entry?.description || '', kind: info?.kind || 'missing',
      state: 'on', note: '', remaining: null, stitched: '', ...extra,
    });
  };
  const stitchText = list => (list || []).map(s => {
    const text = label(s.id, s.params, s.with);
    return s.with?.length ? `${text}（${stitchText(s.with)}）` : text;
  }).join('、');
  const skill = battle.skills?.[battle.selected];
  if (skill) {
    for (const c of skill.contributions || []) {
      if (c.status === 'expired') continue;
      push(c.traitId, {
        group: GROUP_NAMES[c.kind] ? c.kind : 'equipment', from: c.from, state: c.status, note: c.note,
        stitched: stitchText(c.stitched), overridden: !!c.overridden,
      }, c.params, c.stitched);
    }
  } else {
    for (const eq of battle.ruleParts || battle.equipment || []) {
      for (const entry of [...(eq.doc.bases || []), ...eq.doc.traits]) {
        if (entry.duration > 0) continue;
        push(entry.id, { group: eq.kind === 'talent' ? 'talent' : 'equipment', from: eq.label, stitched: stitchText(entry.with), note: '未选择技能：只有防御类效果生效' }, entry.params, entry.with);
      }
    }
  }
  const sourceEntry = source => ({ id: source.id.split('~')[0], params: Object.fromEntries(source.params), with: (source.stitched || []).map(sourceEntry) });
  for (const g of battle.host.activeGrants(HERO_ID)) {
    const sources = battle.host.grants.find(grant => grant.id === g.id)?.sources || [];
    for (const [index, id] of g.traits.entries()) {
      const entry = sources[index] ? sourceEntry(sources[index]) : { id };
      push(id, { group: 'timed', from: g.label || '持续效果', remaining: g.remaining, stitched: stitchText(entry.with) }, entry.params, entry.with);
    }
  }
  const world = battle.host.world;
  for (const def of world.statusDefs.values()) {
    if (!def.traits.length || !(world.getStatus(HERO_ID, def.key) > 0)) continue;
    const name = battle.statusDefs?.find(s => s.key === def.key)?.name || def.id;
    for (const id of def.traits) push(id, { group: 'status', from: name, remaining: world.getStatusRemaining(HERO_ID, def.key) });
  }
  const groups = GROUP_ORDER.map(key => ({ key, name: GROUP_NAMES[key], rows: rows.filter(r => r.group === key) })).filter(g => g.rows.length);
  return { groups, total: rows.length, active: rows.filter(r => r.state === 'on').length };
}

const HERO_ID = HERO_TARGET_ID;

function characterTargetId(battle) {
  return battle.host.world.owners[battle.hero.owner].statusId;
}
