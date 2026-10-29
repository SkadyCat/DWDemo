// Read-only HUD projection. Unit ownership, caps and lifecycle remain in the
// existing battle runtime; this module only reads their current values.
import { iconSrc } from './game-icons.mjs';

export function summonUnitPanel(battle) {
  const minions = battle?.combat?.minions;
  if (!minions) return { count: 0, cap: null, units: [] };
  const host = battle.host, library = host.library, clock = host.world.clock;
  const builds = [...library.builds.values()];
  const units = minions.alive().map(state => {
    const planIndex = state.planIndex ?? host.world.roots[state.summon.root]?.plan;
    const activeId = host.planSources.get(planIndex)?.activeId;
    const build = builds.find(build => build.activeId === activeId);
    const name = (build?.displayName || (activeId && library.traitDisplayName(activeId)) || state.kind).replace(/^召唤/, '');
    const remaining = state.summon.expire - clock;
    return {
      id: state.id, name, skill: build?.id || state.kind,
      life: state.life, maxLife: state.maxLife, shield: state.shield, maxShield: state.maxShield,
      lifePercent: Math.max(0, Math.min(100, 100 * state.life / Math.max(1, state.maxLife))),
      shieldPercent: Math.max(0, Math.min(100, 100 * state.shield / Math.max(1, state.maxShield))),
      remaining: Number.isFinite(remaining) ? Math.max(0, remaining).toFixed(1) : null,
      temporary: state.temp, empowered: state.empowered,
    };
  });
  return { count: units.length, cap: minions.controlCap(), units };
}

export const BattleSummonUnits = {
  props: { state: { type: Object, required: true } },
  emits: ['release'],
  setup() { return { iconSrc }; },
  template: /* html */ `<section class="b3-summon-units b3-card" aria-label="召唤单位列表" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.stop @keydown.stop>
    <header><b>召唤单位</b><span class="mono" aria-label="召唤数量与控制上限">{{ state.count }} / {{ state.cap ?? '—' }}</span></header>
    <p v-if="!state.units.length" class="b3-summon-empty">暂无召唤单位</p>
    <ul v-else aria-label="当前存活召唤单位" tabindex="0">
      <li v-for="unit in state.units" :key="unit.id" :data-summon-unit="unit.id">
        <img :src="iconSrc('skill', unit.skill)" alt="" draggable="false">
        <div class="b3-summon-info">
          <div class="b3-summon-name"><b :title="unit.name">{{ unit.name }}</b><small v-if="unit.empowered">强化</small><small v-else-if="unit.temporary">临时</small><time v-if="unit.remaining !== null">{{ unit.remaining }}s</time></div>
          <div class="b3-summon-vitals"><span>气血</span><span class="mono">{{ Math.max(0, Math.ceil(unit.life)) }} / {{ Math.round(unit.maxLife) }}</span></div>
          <div class="b3-summon-bar" role="progressbar" :aria-label="unit.name + '气血'" :aria-valuemin="0" :aria-valuemax="unit.maxLife" :aria-valuenow="Math.max(0, unit.life)"><i :style="{width: unit.lifePercent + '%'}"></i></div>
          <template v-if="unit.maxShield > 0"><div class="b3-summon-vitals shield"><span>护盾</span><span class="mono">{{ Math.max(0, Math.ceil(unit.shield)) }} / {{ Math.round(unit.maxShield) }}</span></div><div class="b3-summon-bar shield" role="progressbar" :aria-label="unit.name + '护盾'" :aria-valuemin="0" :aria-valuemax="unit.maxShield" :aria-valuenow="Math.max(0, unit.shield)"><i :style="{width: unit.shieldPercent + '%'}"></i></div></template>
        </div>
      </li>
    </ul>
  </section>`,
};
