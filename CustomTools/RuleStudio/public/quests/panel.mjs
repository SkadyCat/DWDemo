import { iconSrc } from '../game-icons.mjs';
import { affixText } from '../affix-text.mjs';
import { EQUIPMENT_RARITY_NAMES } from '../../engine/equipment.mjs';

export {QuestTracker} from './tracker.mjs';

export const QuestJournal = {
  props: ['quests', 'collections', 'library', 'floor', 'phase'], emits: ['claim', 'challenge', 'continue'],
  setup(props) {
    const skillName = item => props.collections?.skill.get(item.skill)?.doc.name || '无绑定技能';
    const lines = item => [...(item.bases || []), ...(item.legendary ? [item.legendary] : []), ...(item.affixes || [])];
    return { iconSrc, affixText, rarityName: EQUIPMENT_RARITY_NAMES, skillName, lines };
  },
  template: /* html */ `<div class="quest-journal">
    <article v-for="quest in quests" :key="quest.id" class="quest-entry" :data-quest="quest.id">
      <header class="quest-entry-header"><span class="quest-scroll" aria-hidden="true">Ⅰ</span><div><small>高塔启程 · 第一个任务</small><h3>{{ quest.name }}</h3></div><span class="quest-state" :class="quest.stage">{{ {active:'进行中', reward:'待领取', claimed:'已完成'}[quest.stage] }}</span></header>
      <template v-if="quest.stage === 'active'">
        <div class="quest-intro"><img :src="iconSrc('skill', 'frost_lance')" alt="" draggable="false"><div><h4>{{ quest.objective }}</h4><p>{{ quest.description }}</p></div><b class="mono">0 / 1</b></div>
        <ol class="quest-steps"><li><b>移动与施法</b><span>WASD 移动，鼠标瞄准，左键施放当前技能。</span></li><li><b>探索随机地牢</b><span>穿过相连的房间和走廊，寻找地牢守卫。</span></li><li><b>击败第一层守卫</b><span>守卫倒下后完成任务，领取武器奖励。</span></li></ol>
        <div class="quest-reward-note"><span aria-hidden="true">✧</span><div><b>任务奖励</b><p>随机出现三把武器，从中选择一把。</p></div></div>
        <button v-if="floor !== 1 || phase === 'failed'" type="button" class="btn primary quest-start" @click="$emit('challenge')">{{ phase === 'failed' && floor === 1 ? '重新挑战第一层' : '前往第一层' }}</button>
        <button v-else type="button" class="btn primary quest-start" @click="$emit('continue')">继续挑战</button>
      </template>
      <template v-else-if="quest.stage === 'reward'">
        <div class="quest-reward-title"><h4>第一层已通关</h4><p>选择一把武器，放入背包。</p><small>装备武器后可使用它绑定的技能</small></div>
        <div class="quest-weapons" aria-label="任务奖励：三把武器选一把">
          <article v-for="(item, index) in quest.choices" :key="item.uid" class="quest-weapon" :class="'r-' + item.rarity" :data-reward-uid="item.uid">
            <div class="quest-weapon-top"><span>候选 {{ index + 1 }}</span><b>{{ rarityName[item.rarity] }} · T{{ item.tier }}</b></div>
            <img class="quest-weapon-icon" :src="iconSrc('equipment', item)" alt="" draggable="false"><h4>{{ item.name }}</h4>
            <div class="quest-weapon-skill"><img :src="iconSrc('skill', item.skill)" alt="" draggable="false"><span>绑定技能<b>{{ skillName(item) }}</b></span></div>
            <div class="quest-weapon-affixes"><p v-for="(line,i) in lines(item)" :key="i" :class="{fixed: line === item.legendary || (item.bases || []).includes(line)}">{{ affixText(line, library) }}</p><p v-if="!lines(item).length" class="dim">无附加词条</p></div>
            <button type="button" class="btn quest-claim" :aria-label="'选择' + item.name" @click="$emit('claim', quest.id, item.uid)">选择这把武器</button>
          </article>
        </div>
        <p class="quest-choice-hint">只能领取一把，领取后其余选项消失。</p>
      </template>
      <div v-else class="quest-finished"><span aria-hidden="true">✓</span><h4>初次试炼完成</h4><p>已领取「{{ quest.claimedName }}」</p><small>武器已放入背包，可在装备配置中更换。</small></div>
    </article>
  </div>`,
};
