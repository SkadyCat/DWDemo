// Loadout battle: the Beta slice (Arena) driven by what the player owns. Skills are cast with the
// equipped equipment folded in (collections.aggregate); consumables grant their trait entries for
// their duration (RuleHost.grantTraits) or cast their skill; kills drop 灵石.
import { Arena, HERO_TARGET_ID, COMBAT_HEIGHT } from './arena.mjs';
import { aggregate, markEnabled } from '../../engine/collections.mjs';
import { skillSlots, equipmentSkillIds } from '../../engine/loadout.mjs';
import { statusKey, INDEX_NONE, ELEMENT_NAMES } from '../../engine/types.mjs';
import { sourceFromEntry, sourcesKey } from '../../engine/library.mjs';
import { computeSheet } from '../../engine/character.mjs';
import { equipmentDocument, equipmentRandom, ensureEquipmentInherentTraits } from '../../engine/equipment.mjs';
import { CombatRuntime } from '../../engine/combat/runtime.mjs';
import { createPawnEquipment, resolvePawnEquipment, pawnEquipmentSources } from '../../engine/pawn-equipment.mjs';
import { PLAYER_GEAR_SLOTS, PLAYER_FIXED_SLOTS } from '../../engine/equipment-slots.mjs';
import { enabledAuras, buildSkillType } from '../../engine/skill-types.mjs';
import { StunCrust } from './stun-crust.mjs';
import { SelfSkills } from './self-skills.mjs';

export const STATUS_STYLE = {
  chill: { color: '#5ab8f0', glyph: '缓' }, freeze: { color: '#d8f6ff', glyph: '冻' }, shock: { color: '#ffe14d', glyph: '电' },
  ignite: { color: '#ff7a2e', glyph: '燃' }, bleed: { color: '#e0334a', glyph: '血' }, slow: { color: '#9a8fd8', glyph: '慢' },
  poison: { color: '#7ee36b', glyph: '毒' }, erosion: { color: '#c38bff', glyph: '蚀' }, stun: { color: '#f7d046', glyph: '晕' },
  taunt: { color: '#ff9c48', glyph: '嘲' },
};
const BATTLE_DURATION = 3600;
const SKILL_POWER = 30;

export class Battle extends Arena {
  /** collections: {skill, equipment, item} maps (readCollections); instances: {uid: rolled equipment}. onKill(stones, monster) is called per kill. */
  constructor(ruleFiles, { collections, instances = {}, onKill = null, stunCrust = false, ...options } = {}) {
    super(ruleFiles, { maxMonsters: 120, spawnRate: 12, ...options });
    this.collections = collections || this.collections;
    this.instances = instances;
    this.onKill = onKill;
    this.flashLife = 1.1;
    this.areas = [];
    this.lightningStrikes = [];
    this.poisonBursts = [];
    this.drops = [];
    this.log = [];
    this.skills = skillSlots();
    this.selected = 0;
    this.earned = 0;
    this.rewardRandom = equipmentRandom((options.seed ?? 1) ^ 0x53544f4e);
    this.statusDefs = [...this.host.library.statuses.values()].map(s => ({ id: s.def.id, key: statusKey(s.def.id), name: s.displayName || s.def.id, category: s.category }));
    // Area pulses for rendering (damage_area: slashes, claws, shatter).
    this.host.world.trace = (kind, payload) => {
      if (kind === 'area' && payload.effect === 'poison_flask_burst' && this.poisonBursts.length < 64) this.poisonBursts.push({ x: payload.x * 100, y: payload.y * 100, radius: payload.radius * 100, age: 0 });
      if (kind === 'area' && this.areas.length < 200) this.areas.push({ x: payload.x * 100, y: payload.y * 100, radius: payload.radius * 100, element: ELEMENT_NAMES[payload.element] || 'physical', age: 0, shape: payload.shape, dir: payload.dir, length: (payload.length || 0) * 100 });
      if (kind === 'area' && payload.effect === 'death_lightning' && this.lightningStrikes.length < 64) {
        this.lightningStrikes.push({ x: payload.x * 100, y: payload.y * 100, radius: payload.radius * 100, age: 0 });
      }
    };
    // 战斗词条 (docs/combat-affix-table.md): runtime over the rule world's web-only hooks.
    this.combat = new CombatRuntime(this, { seed: options.seed || 7 }).install();
    this.dodgeCooldown = 0;
    if (stunCrust) this.stunCrust = new StunCrust(this);
    this.selfSkills = new SelfSkills(this);
  }

  /**
   * 闪现打击 (sheet stat skill.flicker_range, metres): before the cast, blink next to an enemy in range,
   * preferring the aim direction and a different enemy than last time. Returns false when nobody is
   * reachable (the cast does not happen), true after a blink, undefined for ordinary skills.
   */
  beforeHeroCast() {
    const range = this.combat?.planSheetStat(this.hero.plan, 'skill.flicker_range') || 0;
    if (!(range > 0)) return undefined;
    const h = this.hero, reach = range * 100, aimAt = h.aimPoint || { x: h.x + h.aim.x * 300, y: h.y + h.aim.y * 300 };
    const alive = this.monsters.filter(m => m.health > 0 && !m.invulnerable && Math.hypot(m.x - h.x, m.y - h.y) <= reach);
    if (!alive.length) return false;
    const ranked = alive.sort((a, b) => Math.hypot(a.x - aimAt.x, a.y - aimAt.y) - Math.hypot(b.x - aimAt.x, b.y - aimAt.y));
    const from = { x: h.x, y: h.y };
    for (const target of ranked.length > 1 ? [...ranked.filter(m => m !== this.lastFlicker), this.lastFlicker].filter(Boolean) : ranked) {
      const dx = from.x - target.x, dy = from.y - target.y, d = Math.hypot(dx, dy) || 1, gap = Math.min(90, d);
      this.moveActor(h, target.x + dx / d * gap, target.y + dy / d * gap);
      if (Math.hypot(h.x - target.x, h.y - target.y) > 180) { h.x = from.x; h.y = from.y; continue; } // wall in the way
      const ax = target.x - h.x, ay = target.y - h.y, length = Math.hypot(ax, ay) || 1;
      h.aim = { x: ax / length, y: ay / length }; h.aimPoint = { x: target.x, y: target.y, z: 0 };
      this.lastFlicker = target;
      this.flickers = (this.flickers || 0) + 1;
      this.host.world.trace?.('blink', { x: from.x / 100, y: from.y / 100, tx: h.x / 100, ty: h.y / 100 });
      return true;
    }
    return false;
  }

  /** 闪避动作 (Shift): 3 m dash along the movement (or aim), 1 s cooldown. */
  dodge() {
    if (this.dodgeCooldown > 0 || this.hero.dead || (this.stunCrust && this.character.stunned > 0)) return false;
    const h = this.hero;
    const mx = h.move?.x || 0, my = h.move?.y || 0, len = Math.hypot(mx, my);
    const dx = len > 0 ? mx / len : h.aim.x, dy = len > 0 ? my / len : h.aim.y;
    this.moveActor(h, h.x + dx * 300, h.y + dy * 300);
    this.dodgeCooldown = 1;
    this.combat.dodge();
    return true;
  }

  // The Arena constructor calls recompile(); the battle compiles from the loadout instead.
  recompile() { return true; }

  part(kind, id) {
    const doc = kind === 'equipment' && this.instances[id] ? equipmentDocument(this.instances[id], this.collections) : this.collections?.[kind]?.get(id)?.doc;
    return doc ? { kind, doc, label: doc.name || doc.id } : null;
  }

  /** loadout: {skills:[four ids/null], equipment:{slot:id}, belt:[ids]}. */
  setLoadout(loadout) {
    const lib = this.host.library;
    this.loadout = { skills: skillSlots(loadout.skills), equipment: loadout.equipment || {}, belt: loadout.belt || [], activeAuras: loadout.activeAuras || [], passives: loadout.passives || [] };
    if (loadout.instances) this.instances = loadout.instances;
    for (const item of Object.values(this.instances)) ensureEquipmentInherentTraits(item, this.collections?.equipment?.get(item.baseId)?.doc, lib);
    const normal = Object.entries(loadout.equipment || {}).filter(([slot]) => PLAYER_GEAR_SLOTS.some(row => row.id === slot)).map(([, id]) => this.part('equipment', id)).filter(Boolean);
    const fixed = PLAYER_FIXED_SLOTS.map(slot => this.hero.equipment[slot.id]).filter(Boolean).map(doc => ({ kind: 'equipment', doc, label: doc.name || doc.id }));
    this.equipment = [...fixed, ...normal];
    this.auraParts = enabledAuras(lib, this.loadout, this.collections, this.equipment);
    this.loadout.activeAuras = this.auraParts.map(part => part.doc.id);
    this.ruleParts = [...this.equipment, ...this.loadout.passives, ...this.auraParts];
    this.hero.equipment = createPawnEquipment(Object.fromEntries(this.equipment.map(part => [part.doc.slot, part.doc])), 'player');
    // 副手：盾牌（持盾）或带“武器 / 双持”标签的副手（双持）.
    const offhand = this.equipment.find(eq => eq.doc.slot === 'offhand');
    if (this.character) this.character.offhand = offhand ? ((offhand.doc.tags || []).some(t => /武器|双持|weapon/i.test(t)) ? 'weapon' : 'shield') : '';
    const slotOf = label => this.equipment.find(eq => eq.label === label)?.doc.slot || '';
    this.belt = (loadout.belt || []).map(id => this.part('item', id)).filter(Boolean);
    this.skills = skillSlots(loadout.skills).map(id => {
      if (!id || !lib.build(id) || buildSkillType(lib, id) !== 'active') return null;
      const granted = this.ruleParts.some(eq => equipmentSkillIds(eq.doc, this.collections).includes(id));
      if (this.collections.skill.get(id)?.grantedBy?.length && !granted) return null;
      const agg = aggregate(lib, id, this.ruleParts, Infinity);
      const compiled = agg.source ? this.host.compileSource(agg.source) : { plan: INDEX_NONE, error: agg.error };
      const plan = compiled.plan >= 0 ? this.host.plan(compiled.plan) : null;
      const contributions = markEnabled(agg.contributions || [], plan, lib);
      const enabled = new Set(plan?.traitIds || []);
      return {
        id, name: lib.buildDisplayName(id), plan: compiled.plan, error: compiled.error,
        contributions,
        sheetEntries: (agg.source?.traits || []).filter(source => enabled.has(source.id)).map(source => {
          const row = contributions.find(c => c.sourceId === source.id && c.status === 'on');
          return { source, equipment: row?.kind === 'equipment', label: row?.from || id, slot: row?.kind === 'equipment' ? slotOf(row.from) : '' };
        }),
        granted,
        castsPerSecond: 3 * Math.max(0.1, 1 + this.host.getPlanStat(compiled.plan, 'cast.speed_percent') / 100),
      };
    });
    // Permanent equipment entries also defend the hero (resistances).
    this.defense = pawnEquipmentSources(lib, this.hero.equipment).sources;
    this.defenseSheetEntries = this.defense.map(source => ({ source, equipment: true }));
    if (this.loadout.passives.length || this.auraParts.length) {
      const combined = aggregate(lib, null, this.ruleParts, Infinity);
      if (!combined.source) throw Error(combined.error);
      this.defense = combined.source.traits;
      this.defenseSheetEntries = this.defense.map(source => {
        const row = combined.contributions.find(c => c.sourceId === source.id && c.status === 'on');
        return { source, equipment: row?.kind === 'equipment', label: row?.from || '', slot: row?.kind === 'equipment' ? slotOf(row.from) : '' };
      });
    }
    this.select(this.selected);
  }

  setPlayerFixedEquipment(slot, item) {
    if (!PLAYER_FIXED_SLOTS.some(row => row.id === slot)) throw new Error(`不是玩家固定槽：${slot}`);
    this.hero.equipment = resolvePawnEquipment(this.collections, { ...this.hero.equipment, [slot]: item }, 'player');
    this.setLoadout(this.loadout || { skills: [] });
  }

  bindHeroDefense() {
    const host = this.host;
    const sources = [...(this.defense || [])];
    if (sources.length) host.baseDefense.set(HERO_TARGET_ID, sources); else host.baseDefense.delete(HERO_TARGET_ID);
    host.appliedDefense.delete(HERO_TARGET_ID);
    host.bindDefense(HERO_TARGET_ID, sources);
  }

  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.skills.length) return;
    this.selected = index;
    const skill = this.skills[index];
    if (!skill) {
      this.hero.plan = INDEX_NONE;
      this.hero.skill = '';
      this.hero.error = '';
      this.hero.castsPerSecond = 0;
      this.bindHeroDefense();
      this.character?.setSheet(this.defenseSheetEntries || []);
      this.syncHeroPools?.();
      return;
    }
    this.hero.plan = skill.plan;
    this.hero.error = skill.error || '';
    this.hero.castsPerSecond = skill.castsPerSecond;
    this.hero.power = SKILL_POWER;
    this.hero.skill = skill.id;
    this.bindHeroDefense();
    this.character?.setSheet(skill.sheetEntries);
    this.syncHeroPools?.();
  }

  /** Use a consumable: timed entries become timed traits on the hero; a skill item casts its skill once. */
  useItem(id) {
    const part = this.part('item', id);
    if (!part || this.hero.dead) return false;
    const lib = this.host.library;
    const label = part.label;
    const timed = new Map();
    const untimed = [];
    // 药剂 entries (flask_life) start recovering now instead of being held as traits.
    const isFlask = entry => computeSheet([{ source: lib.trait(entry.id).source }]).triggers.some(t => t.name === 'flask_life');
    const flasks = part.doc.traits.filter(entry => lib.trait(entry.id) && isFlask(entry));
    if (flasks.length) this.character.useItem(flasks.map(entry => sourceFromEntry(lib, entry)));
    for (const entry of part.doc.traits) {
      if (!lib.trait(entry.id) || flasks.includes(entry)) continue;
      if (entry.duration > 0) {
        if (!timed.has(entry.duration)) timed.set(entry.duration, []);
        timed.get(entry.duration).push({ id: entry.id, params: entry.params, with: entry.with });
      } else untimed.push({ id: entry.id, params: entry.params, with: entry.with });
    }
    for (const [duration, entries] of timed) this.host.grantTraits(HERO_TARGET_ID, entries, duration, label);
    if (part.doc.skill && lib.build(part.doc.skill)) {
      const agg = aggregate(lib, part.doc.skill, [...this.ruleParts, part], Infinity);
      const compiled = agg.source ? this.host.compileSource(agg.source) : null;
      if (compiled && compiled.plan !== INDEX_NONE) {
        const h = this.hero;
        this.host.castBuild(compiled.plan, h.owner, { x: h.x + h.aim.x * 60, y: h.y + h.aim.y * 60, z: COMBAT_HEIGHT }, { x: h.aim.x, y: h.aim.y, z: 0 }, SKILL_POWER);
      }
    } else if (untimed.length) {
      this.host.grantTraits(HERO_TARGET_ID, untimed, BATTLE_DURATION, label);
    }
    this.log.unshift({ t: this.elapsed, text: `使用 ${label}` });
    this.log.length = Math.min(this.log.length, 20);
    return true;
  }

  // Character sheet = selected skill's enabled equipment traits + traits the hero holds right now
  // (timed item entries, triggered buffs). Recomputed only when that set changes.
  refreshSheet() {
    if (!this.character) return;
    const lib = this.host.library;
    const base = this.skills?.[this.selected]?.sheetEntries || this.defenseSheetEntries || [];
    const held = this.host.heldSources(HERO_TARGET_ID).filter(s => s.sheet).map(source => ({ source, equipment: false, label: lib.traitDisplayName(source.id.split('~')[0]) }));
    const entries = [...base.filter(e => e.source?.sheet), ...held];
    this.character.setSheet(entries, `${this.selected}|${sourcesKey(entries.map(e => e.source))}|${entries.map(e => (e.equipment ? 1 : 0)).join('')}`);
  }

  onMonsterCast(monster, skill) {
    if (this.elapsed - (this.lastMonsterLogAt ?? -Infinity) < 0.5) return;
    this.lastMonsterLogAt = this.elapsed;
    this.log.unshift({ t: this.elapsed, text: `${monster.name} 释放 ${skill.name}` });
    this.log.length = Math.min(this.log.length, 20);
  }

  /** Active timed effects on the hero grouped by source: [{label, traits, remaining}]. */
  buffs() {
    const groups = new Map();
    for (const s of this.statusDefs) if (s.category === 'buff' && this.host.getStatus(this.heroTargetId, s.id) > 0) {
      groups.set(`status:${s.id}`, { label: s.name, traits: (this.host.library.status(s.id)?.def.traits || []).map(id => this.host.library.traitDisplayName(id)), remaining: this.host.getStatusRemaining(this.heroTargetId, s.id) });
    }
    for (const g of this.host.activeGrants(HERO_TARGET_ID)) {
      const cur = groups.get(g.label) || { label: g.label, traits: [], remaining: 0 };
      for (const t of g.traits) if (!cur.traits.includes(t)) cur.traits.push(t);
      cur.remaining = Math.max(cur.remaining, g.remaining);
      groups.set(g.label, cur);
    }
    for (const storm of this.host.world.summons.filter(s => s.storm && this.host.world.roots[s.root].owner === this.hero.owner)) {
      groups.set(storm.kindName, { label: this.host.library.traitDisplayName(storm.kindName), traits: ['自动索敌 · 持续落雷'], remaining: Math.max(0, storm.expire - this.host.world.clock) });
    }
    return [...groups.values()];
  }

  /** Live statuses on a monster for the overlay: [{id, name, glyph, color, stacks, remaining, value}]. */
  monsterStatuses(m) {
    const w = this.host.world;
    const out = [];
    for (const s of this.statusDefs) {
      const value = w.getStatus(m.id, s.key);
      if (!(value > 0)) continue;
      const style = STATUS_STYLE[s.id] || { color: s.category === 'buff' ? '#3ddc97' : '#c38bff', glyph: s.name.charAt(0) };
      out.push({ id: s.id, name: s.name, glyph: style.glyph, color: style.color, value, stacks: w.getStatusStacks(m.id, s.key), remaining: w.getStatusRemaining(m.id, s.key) });
    }
    return out;
  }

  tickMonsters(dt) {
    for (const m of this.monsters) {
      if (m.health > 0) continue;
      const level = m.equipment?.tower?.traits.find(t => t.id === 'monster_tower_level')?.params.level ?? 1;
      const stones = level === 1 ? 5 + Math.floor(this.rewardRandom() * 6) : Math.max(1, Math.round(2 + m.maxHealth / 40));
      this.earned += stones;
      this.drops.push({ x: m.x, y: m.y, stones, age: 0 });
      if (this.onKill) this.onKill(stones, m);
    }
    super.tickMonsters(dt);
  }

  respawn() {
    super.respawn();
    this.stunCrust?.reset();
    this.bindHeroDefense();
    this.refreshSheet();
    this.character.reset();
    this.syncHeroPools();
  }

  step(dt) {
    this.dodgeCooldown = Math.max(0, (this.dodgeCooldown || 0) - dt);
    this.refreshSheet();
    this.stunCrust?.tick(Math.min(Math.max(0, dt), 0.05));
    const before = this.hero.health + (this.hero.shield || 0);
    super.step(dt);
    const lost = before - this.hero.health - (this.hero.shield || 0);
    if (lost > 0.01 && !this.hero.god) this.flashes.push({ x: this.hero.x, y: this.hero.y, amount: lost, critical: false, element: 3, age: 0, hero: true });
    const step = Math.min(dt, 0.05);
    for (const a of this.areas) a.age += step;
    this.areas = this.areas.filter(a => a.age < 0.45);
    for (const strike of this.lightningStrikes) strike.age += step;
    this.lightningStrikes = this.lightningStrikes.filter(strike => strike.age < 0.8);
    for (const burst of this.poisonBursts) burst.age += step;
    this.poisonBursts = this.poisonBursts.filter(burst => burst.age < 0.75);
    for (const d of this.drops) d.age += step;
    this.drops = this.drops.filter(d => d.age < 1.2);
  }
}
