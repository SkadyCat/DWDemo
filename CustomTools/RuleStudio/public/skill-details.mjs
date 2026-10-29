// Read-only skill projection. Uses the same compiled plan, sheet and hit arithmetic as combat.
import { EStatusEffect, EBuiltinEvent, ELEMENT_NAMES } from '../engine/types.mjs';
import { EStat } from '../engine/stats.mjs';
import { offenseSource } from '../engine/character.mjs';
import { rawHitDamage, applyDeliveryDamage } from '../engine/combat/damage-values.mjs';
import { damagePoints, heldTraits } from './battle-panels.mjs';
import { auraManaPercent, buildSkillType } from '../engine/skill-types.mjs';
import { traitText } from './affix-text.mjs';

const round = n => +n.toFixed(1);
const newMod = () => ({ flat: 0, increased: 0, more: 1, crit: 0, critScale: 1, critMulti: 0 });

// Auras live in the belt, not battle.skills. Read their authored effects even while off.
export function auraDetails(battle, id) {
  const library = battle?.host?.library, doc = battle?.collections?.skill?.get(id)?.doc;
  if (!doc || buildSkillType(library, id) !== 'aura' || !battle.loadout?.belt?.includes('aura:' + id)) return null;
  const enabled = !!battle.auraParts?.some(part => part.doc.id === id);
  const reservation = auraManaPercent(library, id, battle.collections);
  const sources = (battle.equipment || []).filter(part => part.doc.skills?.includes(id)).map(part => part.label);
  return { id, name: doc.name || id, kind: 'aura', enabled, reservation,
    description: (doc.description || '').replaceAll('Q/E/F/G', 'Q/E/T/G'),
    traits: doc.traits.map(entry => ({ id: entry.id, name: traitText(entry, library) })),
    stats: [{ name: '当前状态', value: enabled ? '已启用' : '未启用' },
      { name: '魔力封印', value: `${reservation}% 总魔力` },
      ...(sources.length ? [{ name: '授予装备', value: [...new Set(sources)].join('、') }] : [])] };
}

function skillView(battle, index, held) {
  const view = Object.create(battle);
  view.selected = index; view.hero = { ...battle.hero, plan: battle.skills[index].plan };
  // setSheet replaces its maps, trigger rows and derived scalars. No shared live state is written.
  if (index !== battle.selected) {
    view.character = Object.assign(Object.create(Object.getPrototypeOf(battle.character)), battle.character);
    view.character.setSheet([...battle.skills[index].sheetEntries, ...held.filter(source => source.sheet).map(source => ({ source }))]);
  }
  if (battle.combat) { view.combat = Object.create(battle.combat); view.combat.arena = view; }
  return view;
}

// Defensive sheet rows are not skill modifiers. Family-specific rows only appear on matching skills.
function affectsSkill(source, family, elements) {
  if (!source) return false;
  if (!source.sheet?.length) return source.rules.length > 0 || source.modifiers.some(m => {
    if (m.stat.startsWith('projectile.')) return !!family.projectile;
    if (/^(area|explosion)\./.test(m.stat)) return !!family.area;
    const element = /^element\.(\w+)\.damage/.exec(m.stat)?.[1];
    return element ? elements.has(element) : /^(cast\.|owner\.(critical|damage|mana_cost))/.test(m.stat);
  });
  return source.sheet.some(row => {
    const path = row.stat || '';
    if (row.trigger) {
      if (/^minion_|^summon_/.test(row.trigger)) return !!family.summon;
      if (/^proj_/.test(row.trigger)) return !!family.projectile;
      if (/^area_/.test(row.trigger)) return !!family.area;
      return !/^flask_|^recoup_|^evade_|^block_/.test(row.trigger);
    }
    if (family.summon) return /^minion\.|^summon\.|^cost\.|^cast\./.test(path);
    if (path.startsWith('proj.')) return !!family.projectile;
    if (path.startsWith('area.')) return !!family.area;
    if (path.startsWith('minion.')) return false;
    if (/^damage\.(flat|from_life|from_shield)\./.test(path)) return true;
    const element = /^damage\.(?:increased|more|pen)\.(\w+)$/.exec(path)?.[1];
    if (element) return element === 'elemental' ? ['fire', 'frost', 'lightning'].some(e => elements.has(e)) : elements.has(element);
    const familyName = /^(fire|frost|lightning|void|poison|burn|ignite|chill|freeze|shock|erosion|bleed)\./.exec(path)?.[1];
    if (familyName) return elements.has(({ burn: 'fire', ignite: 'fire', chill: 'frost', freeze: 'frost', shock: 'lightning', erosion: 'void', bleed: 'physical' })[familyName] || familyName);
    return /^damage\.|^trigger\.|^cast\.|^cost\.|^leech\.|^buff\.(damage|cast_speed|attack_speed)|^(life|shield)\..*(damage|critical|cast_speed|attack_speed|on_hit|on_crit|on_kill|on_cast)/.test(path);
  });
}

export function skillDetails(battle, index) {
  const skill = battle?.skills?.[index];
  if (!skill) return null;
  if (skill.error || !(skill.plan >= 0)) return { id: skill.id, name: skill.name, error: skill.error || '技能尚未编译', hits: [], traits: [], conditional: [], stats: [] };
  const host = battle.host, targetId = host.world.owners[battle.hero.owner].statusId, held = host.heldSources(targetId);
  const view = skillView(battle, index, held), character = view.character, combat = view.combat;
  const live = host.plan(host.planWithSources(skill.plan, held));
  const family = combat?.skillFamily(skill.plan) || {};
  const extra = family.summon ? [] : [offenseSource(character.offense(), live.stats), combat?.planSource(live)].filter(Boolean);
  const plan = host.plan(host.planWithSources(skill.plan, [...held, ...extra]));
  const points = damagePoints(view, plan, false), dealt = host.getStatusEffect(targetId, EStatusEffect.DamageDealt).value;
  const raw = (part, delivery) => {
    if (part.amount === null) return null;
    const mod = applyDeliveryDamage(newMod(), path => character.stat(path), delivery);
    return rawHitDamage(plan.stats, part.baseAmount, ELEMENT_NAMES.indexOf(part.element), mod, 1, dealt);
  };
  const hits = points.primary.filter(row => !row.conditional).map(primary => {
    const delivery = { projectile: primary.projectile, area: primary.area }, elements = new Map();
    for (const part of [primary, ...points.added.filter(row => row.base)]) {
      const amount = raw(part, delivery); if (amount === null) continue;
      const row = elements.get(part.element) || { element: part.element, name: part.name, amount: 0 };
      row.amount += amount; elements.set(part.element, row);
    }
    return { key: primary.key, label: primary.detail.split(' · ')[0], element: primary.element,
      amount: primary.amount === null ? null : round([...elements.values()].reduce((sum, row) => sum + row.amount, 0)),
      elements: [...elements.values()].map(row => ({ ...row, amount: round(row.amount) })) };
  });
  const elements = new Set([...points.primary, ...points.added].map(row => row.element));
  for (const element of ['fire', 'frost', 'lightning', 'void', 'poison']) if (family[element]) elements.add(element);
  const priority = row => row.group === 'skill' ? 0 : host.library.trait(row.id)?.source.sheet?.some(entry => /^(damage|proj|area|minion)\./.test(entry.stat || '')) ? 1 : 2;
  const traits = heldTraits(view).groups.flatMap(group => group.rows).filter(row => row.state === 'on' && affectsSkill(host.library.trait(row.id)?.source, family, elements)).sort((a, b) => priority(a) - priority(b));
  const conditional = [...points.primary.filter(row => row.conditional), ...points.added.filter(row => !row.base)].map(row => ({ ...row,
    current: row.amount === null ? null : round(raw(row, { projectile: row.projectile || row.event === EBuiltinEvent.Hit && family.projectile && !row.area, area: row.area })) }));
  const kind = combat?.skillKind(skill.plan) || 'spell';
  const pace = battle.statusPace?.(targetId)?.action ?? 1;
  const speed = skill.castsPerSecond * pace * Math.max(.1, 1 + (character.actionSpeed(kind) + (combat?.castSpeed(skill.plan) || 0)) / 100);
  const stats = [{ name: kind === 'attack' ? '攻击速度' : '施法速度', value: `${+speed.toFixed(2)} 次/秒` }];
  if (family.projectile) stats.push({ name: '投射物数量', value: `${plan.stats.get(EStat.ProjectileCount)} 枚` });
  const cooldown = combat?.cooldownFor(skill.plan) || 0;
  if (cooldown) stats.push({ name: '冷却', value: `${+cooldown.toFixed(2)}s` });
  return { id: skill.id, name: skill.name, error: '', summon: !!family.summon, hits, traits, conditional, stats };
}
