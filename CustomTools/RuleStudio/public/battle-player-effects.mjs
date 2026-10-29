import { STATUS_STYLE } from './sim/battle.mjs';
import { iconSrc } from './game-icons.mjs';
import { EOp, EOrigin } from '../engine/types.mjs';
import { auraManaPercent } from '../engine/skill-types.mjs';

const symbol = id => '/assets/player-effects/' + id + '.svg';
const statusIcons = new Set(['chill', 'freeze', 'shock', 'ignite', 'bleed', 'slow', 'poison', 'erosion', 'stun']);
function skillSource(battle, planIndex) {
  const plans = battle.host.world.plans, plan = plans[planIndex];
  const skill = battle.skills?.find(s => s && (s.plan === planIndex || (plan?.activeId && plans[s.plan]?.activeId === plan.activeId)));
  return skill ? { icon: iconSrc('skill', skill), sourceName: skill.name, sourceKind: '技能' } : null;
}
// Resolve only an unambiguous action; never attribute enemy ailments to the selected player skill.
function actionSource(battle, predicate) {
  const candidates = (battle.skills || []).filter(s => s && battle.host.world.plans[s.plan]?.actions.some(predicate));
  return candidates.length === 1 ? skillSource(battle, candidates[0].plan) : null;
}

// Presentation cache only, keyed by the actual world so battle resets cannot leak timers.
const timelines = new WeakMap();
export function effectProgress(previous, effect) {
  if (!Number.isFinite(effect.remaining)) return { expiresAt: null, duration: 0, progress: 1 };
  const expiresAt = effect.expiresAt, changed = !previous || Math.abs(previous.expiresAt - expiresAt) > .001;
  const duration = effect.duration > 0 ? effect.duration : changed ? Math.max(.001, effect.remaining) : previous.duration;
  return { expiresAt, duration, progress: Math.max(0, Math.min(1, effect.remaining / duration)) };
}

// Read-only HUD projection. The rules runtime owns stacks, expiry and decay.
export function playerEffects(battle) {
  if (!battle?.host || !battle.hero) return [];
  const host = battle.host, world = host.world, library = host.library;
  const target = battle.heroTargetId, owner = battle.hero.owner, rows = [];
  for (const { doc } of battle.auraParts || []) rows.push({ id: 'aura:' + doc.id, label: doc.name,
    kind: 'buff', color: '#a9a0ef', icon: iconSrc('skill', doc), sourceName: doc.name, sourceKind: '光环',
    stacks: 0, cap: 0, remaining: null, expiresAt: null, timer: '状态',
    description: `已启用 · 封印 ${auraManaPercent(library, doc.id, battle.collections)}% 总魔力\n${doc.description || ''}` });
  for (const status of battle.statusDefs || []) {
    const stacks = world.getStatusStacks(target, status.key);
    if (!(stacks > 0) || !(world.getStatus(target, status.key) > 0)) continue;
    const definition = library.status(status.id), live = world.statuses.get(`${target}|${status.key}`);
    const style = STATUS_STYLE[status.id] || { color: status.category === 'buff' ? '#64dfac' : '#d79bea' };
    const source = live?.owner === owner ? actionSource(battle, a => a.op === EOp.ApplyStatus && a.origin === EOrigin.Owner && a.stateKey === status.key) : null;
    const remaining = world.getStatusRemaining(target, status.key);
    rows.push({ id: 'status:' + status.id, label: status.name, kind: status.category, color: style.color,
      icon: symbol(statusIcons.has(status.id) ? status.id : 'buff'), sourceName: status.category === 'buff' ? '临时增益' : '异常状态', sourceKind: '状态', ...source,
      stacks, cap: definition?.def.maxStacks || 1, remaining, expiresAt: live?.expire ?? world.clock + remaining, timer: '剩余',
      description: [definition?.description, ...(definition?.def.traits || []).map(id => library.traitDisplayName(id))].filter(Boolean).join('\n') });
  }
  for (const entry of world.emitters?.entries.values() || []) {
    const level = world.ownerState.get(entry.key) ?? entry.level;
    if (entry.owner !== owner || !(level > 0)) continue;
    const root = world.roots[entry.root], plan = world.plans[root?.plan], source = skillSource(battle, root?.plan);
    const display = plan?.activeId && library.buildDisplayName(plan.activeId);
    const initialDecay = Math.abs(entry.decayAt - entry.lastInput - entry.duration) < .001;
    rows.push({ id: 'layers:' + entry.key, label: source?.sourceName || (display !== plan?.activeId && display) || '技能层数',
      kind: 'layers', color: '#e7c883', icon: symbol('buff'), sourceName: '技能维护效果', sourceKind: '技能', ...source,
      stacks: level, cap: entry.cap, remaining: Math.max(0, entry.decayAt - world.clock), expiresAt: entry.decayAt,
      duration: initialDecay ? entry.duration : entry.decayInterval, timer: '下次减层',
      description: '停止补充后逐层衰减，每 ' + entry.decayInterval + ' 秒减少一层。' });
  }
  const grants = new Map();
  for (const grant of host.activeGrants(target)) {
    const label = grant.label || '临时增益', live = host.grants.find(g => g.id === grant.id);
    const source = live?.key ? actionSource(battle, a => a.op === EOp.GrantTraits && a.grant?.key === live.key) : null;
    const row = grants.get(label) || { id: 'grant:' + label, label, kind: 'buff', color: '#64dfac',
      icon: symbol('buff'), sourceName: label, sourceKind: '临时增益', ...source,
      stacks: 0, cap: 0, remaining: 0, expiresAt: 0, timer: '剩余', traits: new Set() };
    row.remaining = Math.max(row.remaining, grant.remaining); row.expiresAt = world.clock + row.remaining;
    grant.traits.forEach(id => row.traits.add(library.traitDisplayName(id)));
    grants.set(label, row);
  }
  for (const row of grants.values()) { const { traits, ...view } = row; rows.push({ ...view, description: [...traits].join('\n') }); }
  const storms = new Map();
  for (const summon of world.summons || []) {
    if (!summon.storm || world.roots[summon.root]?.owner !== owner || summon.expire <= world.clock) continue;
    const source = skillSource(battle, world.roots[summon.root]?.plan), key = summon.kindName + ':' + (source?.icon || '');
    const row = storms.get(key) || { id: 'effect:' + key, label: library.traitDisplayName(summon.kindName),
      kind: 'buff', color: '#82bded', icon: symbol('shock'), sourceName: '持续效果', sourceKind: '效果', ...source,
      stacks: 0, cap: 0, remaining: 0, expiresAt: 0, timer: '剩余', description: '持续生效 · 自动索敌落雷' };
    row.remaining = Math.max(row.remaining, summon.expire - world.clock); row.expiresAt = world.clock + row.remaining; storms.set(key, row);
  }
  rows.push(...storms.values());
  if (battle.hero.stunned && !rows.some(row => row.id === 'status:stun' || row.id === 'status:freeze')) {
    const remaining = Number(battle.character?.stunned) || null;
    rows.push({ id: 'control:stun', label: '眩晕', kind: 'ailment', color: '#f7d046', icon: symbol('stun'),
      sourceName: '受击控制', sourceKind: '异常状态', stacks: 0, cap: 0, remaining, expiresAt: remaining === null ? null : world.clock + remaining,
      timer: '剩余', description: '当前无法行动。' });
  }
  const previous = timelines.get(world) || new Map(), current = new Map();
  for (const row of rows) { const time = effectProgress(previous.get(row.id), row); current.set(row.id, time); row.progress = time.progress; }
  timelines.set(world, current);
  return rows;
}

export const BattlePlayerEffects = {
  props: { effects: { type: Array, default: () => [] } }, emits: ['release'],
  data: () => ({ hovered: null, tooltipPosition: {}, tooltipAnchor: null }),
  computed: { activeEffect() { return this.effects.find(effect => effect.id === this.hovered); } },
  watch: { effects() { if (this.hovered && !this.activeEffect) this.hide(); else if (this.activeEffect) this.$nextTick(this.positionTooltip); } },
  mounted() { window.addEventListener('resize', this.hide); window.addEventListener('scroll', this.hide, true); },
  beforeUnmount() { window.removeEventListener('resize', this.hide); window.removeEventListener('scroll', this.hide, true); },
  methods: {
    seconds: value => Number.isFinite(value) ? (Math.ceil(Math.max(0, value) * 10) / 10).toFixed(1) + 's' : '持续中',
    show(effect, event) { this.hovered = effect.id; this.tooltipAnchor = event.currentTarget; this.$emit('release'); this.$nextTick(this.positionTooltip); },
    hide() { this.hovered = null; this.tooltipAnchor = null; },
    positionTooltip() {
      const tip = this.$refs.tooltip, anchor = this.tooltipAnchor;
      if (!tip || !anchor?.isConnected) return;
      const a = anchor.getBoundingClientRect(), t = tip.getBoundingClientRect();
      const left = Math.max(12, Math.min(a.left, window.innerWidth - t.width - 12));
      const top = a.bottom + 10 + t.height <= window.innerHeight - 12 ? a.bottom + 10 : Math.max(12, a.top - t.height - 10);
      this.tooltipPosition = { left: left + 'px', top: top + 'px', '--effect-color': this.activeEffect?.color };
    },
  },
  template: `<section v-if="effects.length" class="b3-player-effects" aria-label="玩家临时状态" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.stop>
    <ul role="list"><li v-for="effect in effects" :key="effect.id" :data-player-effect="effect.id" :class="'b3-effect-' + effect.kind" :style="{'--effect-color': effect.color}">
      <button type="button" class="b3-effect-icon" :class="{hovered: hovered === effect.id}" :aria-label="effect.label + (effect.stacks > 0 ? ' · ' + effect.stacks + '层' : '')" :aria-describedby="hovered === effect.id ? 'player-effect-tooltip' : undefined"
        @pointerenter="show(effect, $event)" @pointerleave="hide" @focus="show(effect, $event)" @blur="hide" @click.stop @keydown.stop>
        <img :src="effect.icon" alt="" draggable="false">
        <svg class="b3-effect-countdown" viewBox="0 0 48 48" aria-hidden="true"><rect class="track" x="2" y="2" width="44" height="44" rx="7"/><path class="remaining" d="M24 2H39A7 7 0 0 1 46 9V39A7 7 0 0 1 39 46H9A7 7 0 0 1 2 39V9A7 7 0 0 1 9 2Z" pathLength="100" stroke-dasharray="100" :stroke-dashoffset="100 * (1 - effect.progress)"/></svg>
        <strong v-if="effect.stacks > 0" class="b3-effect-stack">{{ effect.stacks }}</strong>
      </button>
    </li></ul>
    <Teleport to="body"><aside v-if="activeEffect" id="player-effect-tooltip" ref="tooltip" role="tooltip" class="b3-effect-tooltip" :style="tooltipPosition">
      <header><img :src="activeEffect.icon" alt=""><div><b>{{ activeEffect.label }}</b><small>{{ activeEffect.sourceKind }} · {{ activeEffect.sourceName }}</small></div></header>
      <dl><div v-if="activeEffect.stacks > 0"><dt>当前层数</dt><dd>{{ activeEffect.stacks }}<small v-if="activeEffect.cap > 1"> / {{ activeEffect.cap }}</small></dd></div><div><dt>{{ activeEffect.timer }}</dt><dd>{{ seconds(activeEffect.remaining) }}</dd></div></dl>
      <p v-if="activeEffect.description">{{ activeEffect.description }}</p>
    </aside></Teleport>
  </section>`,
};
