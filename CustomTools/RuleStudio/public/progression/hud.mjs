// HUD widgets for character growth, the quest chain, the new-player coach and
// reward feedback. Presentation only: every mutation goes through the host
// callbacks so the battle page keeps a single owner of the save.
import { computed } from '/vendor/vue.esm-browser.prod.js';
import { feedback } from './feedback.mjs';
import { CHAPTERS, rewardLabel } from './quest-chain.mjs';
import { levelBonusRows } from './journey.mjs';
import { INNATE_ATTRIBUTES } from './config.mjs';
import { affixText } from '../affix-text.mjs';
import { iconSrc } from '../game-icons.mjs';
import { EQUIPMENT_RARITY_NAMES } from '../../engine/equipment.mjs';
const hasChoice = q => q?.rewards?.some(r => r.kind === 'choice');

const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));

/** Level badge and experience bar above the skill bar. */
export const JourneyXpBar = {
  props: ['level', 'xp', 'need', 'ratio', 'talentPoints'], emits: ['talents'],
  setup(props) { return { fmt, pct: computed(() => Math.max(0, Math.min(100, (props.ratio || 0) * 100))) }; },
  template: /* html */ `<div class="jx" role="group" aria-label="角色等级与经验" @pointerdown.stop>
    <div class="jx-level" :title="'角色等级 ' + level"><small>Lv</small><b>{{ level }}</b></div>
    <div class="jx-bar" role="progressbar" aria-label="经验" :aria-valuenow="Math.round(xp)" aria-valuemin="0" :aria-valuemax="Number.isFinite(need) ? need : 0">
      <i :style="{width: pct + '%'}"></i><span class="jx-ticks" aria-hidden="true"></span>
      <em class="mono">{{ Number.isFinite(need) ? fmt(xp) + ' / ' + fmt(need) : '已满级' }}</em>
    </div>
    <button v-if="talentPoints > 0" type="button" class="jx-talent" @click="$emit('talents')" :aria-label="'有 ' + talentPoints + ' 个未分配天赋点，打开星盘'">+{{ talentPoints }} 天赋点 <kbd>P</kbd></button>
  </div>`,
};

/** Left-side tracker for the current story quest. */
export const ChainTracker = {
  props: ['quest', 'chapter', 'collections'], emits: ['open', 'claim', 'release'],
  setup(props) {
    const pct = computed(() => props.quest ? Math.min(100, 100 * props.quest.progress.current / Math.max(1, props.quest.progress.target)) : 0);
    return { pct, rewardLabel, hasChoice };
  },
  template: /* html */ `<section class="qc-tracker b3-card" aria-label="任务追踪" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop>
    <header><button type="button" class="qc-open" @click="$emit('open')" aria-label="打开任务日志"><span class="qc-glyph" aria-hidden="true">◆</span><small>{{ chapter?.name || '任务' }}</small><kbd>J</kbd></button></header>
    <template v-if="quest">
      <h3 :class="{done: quest.stage === 'done'}">{{ quest.name }}</h3>
      <p class="qc-objective">{{ quest.text }}</p>
      <div class="qc-progress" role="progressbar" :aria-valuenow="quest.progress.current" aria-valuemin="0" :aria-valuemax="quest.progress.target"><i :style="{width: pct + '%'}"></i><span class="mono">{{ quest.progress.current }} / {{ quest.progress.target }}</span></div>
      <p v-if="quest.stage !== 'done'" class="qc-hint">{{ quest.hint }}</p>
      <div class="qc-rewards"><span v-for="(r, i) in quest.rewards" :key="i" :class="'qr-' + r.kind">{{ rewardLabel(r, collections) }}</span></div>
      <button v-if="quest.stage === 'done'" type="button" class="qc-claim" @click="hasChoice(quest) ? $emit('open') : $emit('claim', quest.id)">{{ hasChoice(quest) ? '选择奖励' : '领取奖励' }}</button>
    </template>
    <p v-else class="qc-hint">全部主线任务已完成。继续挑战更高层，追求更强的构筑。</p>
  </section>`,
};

/** Bottom-centre coach bubble. */
export const CoachMark = {
  props: ['guide', 'tip', 'index', 'total'], emits: ['skip', 'dismiss', 'release'],
  template: /* html */ `<div class="coach-root">
    <div class="coach-tipwrap" @pointerenter="$emit('release')" @pointerdown.stop><transition name="coach"><section v-if="tip" :key="'tip-' + tip.id" class="coach coach-tip" role="status" aria-live="polite">
      <span class="coach-mark" aria-hidden="true">!</span>
      <div><b>{{ tip.title }}</b><p>{{ tip.text }}</p><div class="coach-keys"><kbd v-for="k in tip.keys" :key="k">{{ k }}</kbd></div></div>
      <button type="button" class="coach-x" aria-label="知道了" @click="$emit('dismiss', tip.id)">知道了</button>
    </section></transition></div>
    <div class="coach-wrap" @pointerenter="$emit('release')" @pointerdown.stop><transition name="coach"><section v-if="guide" :key="'guide-' + guide.id" class="coach coach-guide" role="status" aria-live="polite">
      <span class="coach-step mono">{{ index + 1 }}/{{ total }}</span>
      <div><b>新手引导 · {{ guide.title }}</b><p>{{ guide.text }}</p><div class="coach-keys"><kbd v-for="k in guide.keys" :key="k">{{ k }}</kbd></div></div>
      <button type="button" class="coach-x" aria-label="跳过新手引导" @click="$emit('skip')">跳过引导</button>
    </section></transition></div>
  </div>`,
};

/** Banners, toasts, kill streak and level-up flash. */
export const FeedbackLayer = {
  setup() {
    const streakVisible = computed(() => feedback.streak >= 3);
    return { feedback, streakVisible };
  },
  template: /* html */ `<div class="fb-layer" aria-live="polite">
    <div class="fb-flash" v-if="feedback.flash" :key="feedback.flash" aria-hidden="true"></div>
    <div class="fb-banners"><transition-group name="fb-banner"><div v-for="b in feedback.banners" :key="b.id" class="fb-banner" :class="'fb-' + b.kind"><b>{{ b.title }}</b><span v-if="b.sub">{{ b.sub }}</span></div></transition-group></div>
    <div class="fb-toasts"><transition-group name="fb-toast"><article v-for="t in feedback.toasts" :key="t.id" class="fb-toast" :class="'fb-' + t.kind"><b>{{ t.title }}</b><p v-for="(line, i) in t.lines" :key="i">{{ line }}</p></article></transition-group></div>
    <div class="fb-streak" v-if="streakVisible" :key="'s' + feedback.streak"><b class="mono">{{ feedback.streak }}</b><span>连杀</span><small v-if="feedback.streakBonus > 0">经验 +{{ Math.round(feedback.streakBonus * 100) }}%</small></div>
  </div>`,
};

/** The quest window: chapters, every quest and its rewards. */
export const ChainJournal = {
  props: ['rows', 'collections', 'library', 'journey', 'talentPoints'], emits: ['claim'],
  setup(props) {
    const chapters = computed(() => CHAPTERS.map(ch => ({ ...ch, rows: (props.rows || []).filter(r => r.chapter === ch.id) }))
      .map(ch => ({ ...ch, done: ch.rows.every(r => r.stage === 'claimed'), open: ch.rows.some(r => r.stage !== 'locked') })));
    const bonuses = computed(() => levelBonusRows(props.journey?.level || 1).filter(r => r.value > 0));
    const stageName = { locked: '未解锁', active: '进行中', done: '可领取', claimed: '已完成' };
    const lines = item => [...(item.bases || []), ...(item.legendary ? [item.legendary] : []), ...(item.affixes || [])];
    const skillName = item => item.skill ? props.collections?.skill?.get(item.skill)?.doc?.name || item.skill : '';
    const claimable = computed(() => (props.rows || []).filter(q => q.stage === 'done' && hasChoice(q) && q.choices?.length));
    return { chapters, rewardLabel, stageName, bonuses, fmt, innate: INNATE_ATTRIBUTES, hasChoice, lines, skillName, claimable, affixText, iconSrc, rarityName: EQUIPMENT_RARITY_NAMES };
  },
  template: /* html */ `<div class="qc-journal">
    <aside class="qc-journey" v-if="journey">
      <div class="qc-big-level"><small>角色等级</small><b>{{ journey.level }}</b></div>
      <dl><div><dt>累计经验</dt><dd class="mono">{{ fmt(journey.totalXp) }}</dd></div><div><dt>最高通关</dt><dd>第 {{ journey.maxFloor || 0 }} 层</dd></div>
        <div><dt>击杀</dt><dd class="mono">{{ journey.counters.kills }}</dd></div><div><dt>击败守卫</dt><dd class="mono">{{ journey.counters.bossKills }}</dd></div>
        <div><dt>未分配天赋点</dt><dd class="mono">{{ talentPoints }}</dd></div></dl>
      <h4>等级加成</h4>
      <ul class="qc-bonus"><li v-for="b in bonuses" :key="b.id"><span>{{ b.label }}</span><b>+{{ b.value }}</b></li><li v-if="!bonuses.length" class="dim">升级后获得属性加成</li></ul>
      <h4>天生属性</h4>
      <ul class="qc-bonus innate"><li v-for="a in innate" :key="a.id"><span>{{ a.label }}</span></li></ul>
    </aside>
    <div class="qc-chapters">
      <section v-for="q in claimable" :key="'choice-' + q.id" class="qc-choice">
        <header><small>任务奖励 · {{ q.name }}</small><h3>选择一件，决定你的流派方向</h3><p>只能领取一件，其余选项消失。领取后放入背包。</p></header>
        <div class="qc-choice-grid">
          <article v-for="item in q.choices" :key="item.uid" class="qc-choice-card" :class="'r-' + item.rarity">
            <div class="qc-choice-top"><img :src="iconSrc('equipment', item)" alt="" draggable="false"><div><b>{{ item.name }}</b><small>{{ rarityName[item.rarity] }} · T{{ item.tier }}</small></div></div>
            <p v-if="skillName(item)" class="qc-choice-skill">授予技能 · <b>{{ skillName(item) }}</b></p>
            <ul><li v-for="(line, i) in lines(item)" :key="i" :class="{fixed: line === item.legendary || (item.bases || []).includes(line)}">{{ affixText(line, library) }}</li><li v-if="!lines(item).length" class="dim">无附加词条</li></ul>
            <button type="button" class="qc-claim" @click="$emit('claim', q.id, item.uid)">选择这件</button>
          </article>
        </div>
      </section>
      <section v-for="ch in chapters" :key="ch.id" class="qc-chapter" :class="{locked: !ch.open, done: ch.done}">
        <header><h3>{{ ch.name }}</h3><span>{{ ch.done ? '已完成' : ch.open ? '进行中' : '未解锁' }}</span></header>
        <p class="qc-blurb">{{ ch.blurb }}</p>
        <ol v-if="ch.open">
          <li v-for="q in ch.rows" :key="q.id" class="qc-row" :class="'s-' + q.stage">
            <div class="qc-row-main"><b>{{ q.stage === 'locked' ? '？？？' : q.name }}</b><span>{{ q.stage === 'locked' ? '完成前一个任务后解锁' : q.text }}</span>
              <div v-if="q.stage === 'active'" class="qc-progress sm"><i :style="{width: (100 * q.progress.current / Math.max(1, q.progress.target)) + '%'}"></i><span class="mono">{{ q.progress.current }} / {{ q.progress.target }}</span></div>
              <small v-if="q.stage === 'active'" class="qc-hint">{{ q.hint }}</small>
              <div class="qc-rewards" v-if="q.stage !== 'locked'"><span v-for="(r, i) in q.rewards" :key="i" :class="'qr-' + r.kind">{{ rewardLabel(r, collections) }}</span></div>
            </div>
            <button v-if="q.stage === 'done' && !hasChoice(q)" type="button" class="qc-claim" @click="$emit('claim', q.id)">领取</button>
            <em v-else-if="q.stage === 'done'" class="qc-stage" style="color:#ecd086">在上方选择奖励</em>
            <em v-else class="qc-stage">{{ stageName[q.stage] }}</em>
          </li>
        </ol>
      </section>
    </div>
  </div>`,
};
