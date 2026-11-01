// In-battle tracker for the growth builds (成长型 BD). Read-only: the rules runtime owns the
// counters (owner state of the skill trait) and the buff statuses; this only projects them.
import { computed } from '/vendor/vue.esm-browser.prod.js';
import { GROWTH_STAGES } from './growth-stages.mjs';
import { banner, chime } from './feedback.mjs';
import { iconSrc } from '../game-icons.mjs';

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
const seen = new WeakMap(); // battle -> { skillId: stage }, so banners fire once per floor

const growthOf = (world, owner, trait) => world.ownerState.get(`affix:${trait}:growth|o${owner}`.toLowerCase()) || 0;

/** Tracker view for the selected skill (or the first equipped growth skill). Null when none. */
export function growthView(battle) {
  if (!battle?.host || !battle.hero) return null;
  const skills = (battle.skills || []).filter(s => s && GROWTH_STAGES[s.id]);
  if (!skills.length) return null;
  const selected = battle.skills[battle.selected];
  const skill = GROWTH_STAGES[selected?.id] ? selected : skills[0];
  const row = GROWTH_STAGES[skill.id], world = battle.host.world, target = battle.heroTargetId;
  const kills = growthOf(world, battle.hero.owner, row.trait);
  const stage = kills >= row.ultimate ? 2 : kills >= row.awaken ? 1 : 0;
  const memory = seen.get(battle) || {};
  seen.set(battle, memory);
  if (memory[skill.id] !== undefined && stage > memory[skill.id]) {
    banner(stage === 2 ? 'legendary' : 'chapter', `${row.name} · ${stage === 2 ? '极境' : '觉醒'}`, row.stages[stage + 1]);
    chime(stage === 2 ? 'legendary' : 'level');
  }
  memory[skill.id] = stage;
  const surgeLeft = world.getStatus(target, `status:${row.surge.id}`) > 0 ? world.getStatusRemaining(target, `status:${row.surge.id}`) : 0;
  return {
    id: skill.id, name: row.name, icon: iconSrc('skill', skill.id), kills, cap: row.cap, awaken: row.awaken, ultimate: row.ultimate, stage,
    charge: { name: row.charge.name, stacks: world.getStatusStacks(target, `status:${row.charge.id}`), max: row.charge.max },
    surge: { name: row.surge.name, left: surgeLeft },
    stages: [
      { roman: ROMAN[0], name: '起势', at: 0, text: `${row.stages[0]}；${row.stages[1]}` },
      { roman: ROMAN[1], name: '觉醒', at: row.awaken, text: row.stages[2].replace(/^[^：]*：/, '') },
      { roman: ROMAN[2], name: '极境', at: row.ultimate, text: row.stages[3].replace(/^[^：]*：/, '') },
    ],
  };
}

export const GrowthTracker = {
  props: ['view'],
  setup(props) {
    const pct = computed(() => props.view ? Math.min(100, 100 * props.view.kills / Math.max(1, props.view.cap)) : 0);
    const mark = at => props.view ? `${Math.min(100, 100 * at / Math.max(1, props.view.cap))}%` : '0%';
    return { pct, mark };
  },
  template: /* html */ `<section v-if="view" class="gt b3-card" :class="['gt-stage-' + view.stage, {surging: view.surge.left > 0}]" aria-label="技能成长" @pointerdown.stop>
    <header><img :src="view.icon" alt=""><div><b>{{ view.name }}</b><small>本层成长 · 击杀 {{ view.kills }} / {{ view.cap }}</small></div><span class="gt-roman" :title="view.stages[view.stage].name">{{ view.stages[view.stage].roman }}</span></header>
    <div class="gt-bar" role="progressbar" :aria-valuenow="view.kills" aria-valuemin="0" :aria-valuemax="view.cap"><i :style="{width: pct + '%'}"></i>
      <span class="gt-tick" :style="{left: mark(view.awaken)}" title="觉醒"></span></div>
    <ol class="gt-stages"><li v-for="(s, i) in view.stages" :key="i" :class="{on: view.stage >= i}"><em>{{ s.roman }}</em><span><b>{{ s.name }}<small v-if="s.at"> {{ s.at }} 杀</small></b>{{ s.text }}</span></li></ol>
    <footer><span class="gt-charge" :title="view.charge.name">{{ view.charge.name }} <b class="mono">{{ view.charge.stacks }}</b>/{{ view.charge.max }}</span>
      <span class="gt-surge" v-if="view.surge.left > 0">{{ view.surge.name }} <b class="mono">{{ view.surge.left.toFixed(1) }}s</b></span></footer>
  </section>`,
};
