// In-game presentation over the existing preset catalogue and read-only guide model.
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { buildGuideFromLibrary } from '/build-guide/model.mjs';
import { groupBuildPresets } from '/build-preset-menu.mjs';
import { iconSrc } from '/game-icons.mjs';

export const BattleBuildGuide = {
  props: ['rows', 'library', 'collections', 'initialId', 'loading', 'error', 'ready'],
  emits: ['apply', 'close', 'retry'],
  setup(props) {
    const selectedId = ref(props.initialId || 'synergy_rime_thunder'), tab = ref('principle'), tier = ref(1);
    const stepId = ref('consume'), groupId = ref('core'), gearId = ref(''), detail = ref(null), detailElement = ref(null), catalogElement = ref(null);
    let previousFocus = null;
    const families = computed(() => groupBuildPresets(props.rows || []));
    const selected = computed(() => props.rows?.find(row => row.id === selectedId.value));
    const family = computed(() => families.value.find(row => row.rows.some(item => item.id === selectedId.value)));
    const guideState = computed(() => {
      if (selected.value?.id !== 'synergy_rime_thunder' || !props.library || !props.collections) return {};
      try { return { guide: buildGuideFromLibrary(props.library, props.collections, selected.value.loadout, tier.value) }; }
      catch (error) { return { error: error.message }; }
    });
    const guide = computed(() => guideState.value.guide);
    const step = computed(() => guide.value?.steps.find(row => row.id === stepId.value));
    const group = computed(() => guide.value?.groups.find(row => row.id === groupId.value));
    const gear = computed(() => guide.value?.equipment.find(row => row.uid === gearId.value) || guide.value?.equipment[0]);
    const legendarySelected = computed(() => gearId.value === guide.value?.legendary.id);
    const tabs = [{ id: 'principle', name: '构筑原理' }, { id: 'affixes', name: '词条追求' }, { id: 'equipment', name: '装备参考' }];
    watch(() => props.initialId, id => { if (id) selectedId.value = id; });
    watch(() => props.rows, rows => {
      if (rows?.length && !rows.some(row => row.id === selectedId.value)) selectedId.value = rows.find(row => row.id === 'synergy_rime_thunder')?.id || rows[0].id;
    }, { immediate: true });
    watch(selectedId, () => { tab.value = 'principle'; gearId.value = ''; detail.value = null; });
    const scrollSelected = () => nextTick(() => catalogElement.value?.querySelector('button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    watch([selectedId, () => props.rows], scrollSelected, { immediate: true });
    onMounted(() => window.addEventListener('resize', scrollSelected));
    onBeforeUnmount(() => window.removeEventListener('resize', scrollSelected));
    watch(tier, () => { detail.value = null; });
    async function inspect(row) {
      previousFocus = document.activeElement; detail.value = row;
      await nextTick(); detailElement.value?.focus({ preventScroll: true });
    }
    function closeDetail() { detail.value = null; nextTick(() => previousFocus?.isConnected && previousFocus.focus({ preventScroll: true })); }
    function showGroup(id) { groupId.value = id; tab.value = 'affixes'; }
    function showLegendary() { gearId.value = guide.value.legendary.id; tab.value = 'equipment'; }
    function tabKey(event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const at = tabs.findIndex(row => row.id === tab.value);
      tab.value = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (at + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3].id;
      nextTick(() => document.getElementById('b3-build-tab-' + tab.value)?.focus());
    }
    const skillIcon = row => iconSrc('skill', row?.loadout.skills.find(Boolean));
    return { selectedId, selected, families, family, guideState, guide, tab, tabs, tier, stepId, step, groupId, group, gearId, gear, legendarySelected, detail, detailElement, catalogElement, inspect, closeDetail, showGroup, showLegendary, tabKey, skillIcon };
  },
  template: /* html */ `<div class="b3-build-guide" @keydown.esc.stop.prevent="detail ? closeDetail() : $emit('close')">
    <div class="b3-build-layout">
      <nav ref="catalogElement" class="b3-build-catalog" aria-label="可用构筑"><div class="b3-build-catalog-head"><span>流派</span><small>{{ families.length }}</small></div><p v-if="loading" class="dim">加载构筑…</p><button v-for="item in families" :key="item.id" type="button" :class="{on: item.rows.some(row => row.id === selectedId)}" :aria-pressed="item.rows.some(row => row.id === selectedId)" @click="selectedId = item.rows[0].id"><img :src="skillIcon(item.rows[0])" alt="" draggable="false"/><span><b>{{ item.name }}</b><small>{{ item.rows.some(row => row.id === 'synergy_rime_thunder') ? '原理 · 词条指南' : item.rows.length > 1 ? item.rows.length + ' 档强度' : '参考配装' }}</small></span><i v-if="item.equipped">已用</i></button></nav>
      <div class="b3-build-main">
        <div v-if="error || guideState.error" class="b3-build-message" role="alert">{{ error || guideState.error }}<button class="btn sm" @click="$emit('retry')">重试</button></div>
        <div v-else-if="!selected" class="b3-build-message">{{ loading ? '正在读取构筑…' : '暂无可用构筑' }}</div>
        <template v-else>
          <header class="b3-build-hero"><img :src="skillIcon(selected)" alt="" draggable="false"/><div><small>构筑指南 <span v-if="selected.equipped">· 当前已应用</span></small><h3>{{ family?.name || selected.name }}</h3><p>{{ guide ? guide.description : selected.description }}</p><div v-if="guide" class="b3-build-tags"><span>冰霜</span><span class="lightning">闪电</span><span>异常消费</span><span>范围爆发</span></div></div><div v-if="guide" class="b3-build-skill-pair"><img :src="guide.skillIcon" alt="冰锥术"/><span>＋</span><img :src="guide.novaIcon" alt="雷霆新星"/></div></header>
          <div v-if="family.rows.length > 1" class="b3-build-grades"><button v-for="row in family.rows" :key="row.id" :class="{on: row.id === selectedId}" @click="selectedId = row.id">{{ row.gradeName || row.name }}</button></div>
          <div v-if="guide" class="b3-build-toolbar"><div role="tablist" aria-label="构筑内容" @keydown="tabKey"><button v-for="item in tabs" :key="item.id" :id="'b3-build-tab-' + item.id" role="tab" :aria-selected="tab === item.id" :aria-controls="'b3-build-panel-' + item.id" :tabindex="tab === item.id ? 0 : -1" :class="{on: tab === item.id}" @click="tab = item.id">{{ item.name }}</button></div><label>词条参考<select v-model.number="tier" aria-label="构筑词条参考阶级"><option :value="1">T1</option><option :value="5">T5</option><option :value="10">T10</option></select></label></div>
          <div class="b3-build-scroll">
            <template v-if="guide">
              <section v-show="tab === 'principle'" id="b3-build-panel-principle" role="tabpanel" aria-labelledby="b3-build-tab-principle">
                <div class="b3-build-section-head"><h4>冰锥启动，新星接续</h4><small>点击节点，查看这一环的条件</small></div>
                <div class="b3-build-chain"><button v-for="node in guide.steps" :key="node.id" :class="[node.color, {on: stepId === node.id}]" :aria-pressed="stepId === node.id" @click="stepId = node.id"><span><small>{{ node.number }}</small><img v-if="node.image" :src="node.image" alt=""/><b v-else class="b3-build-glyph">{{ node.id === 'consume' ? '❄' : 'ϟ' }}</b></span><strong>{{ node.title }}</strong><small>{{ node.subtitle }}</small></button></div>
                <article class="b3-build-step"><div><span>{{ step.number }}</span><h4>{{ step.heading }}</h4></div><p>{{ step.description }}</p><ul><li v-for="tip in step.tips" :key="tip">{{ tip }}</li></ul><div class="b3-build-related"><small>相关词条</small><button v-for="row in step.affixes" :key="row.id" @click="inspect(row)">{{ row.name }} <span>›</span></button></div></article>
                <div class="b3-build-overview"><section class="b3-build-paths"><h4>至少接通一条消费路径</h4><p><span>冻结</span>冰缓 / 冻结 <b>→</b> 后续命中移除冻结</p><p><span>感电</span>闪电命中 / 感电 <b>→</b> 后续闪电伤害消费</p><footer>异常消费 <b>→</b> 雷霆新星 <small>→ 再次施加感电 ↺</small></footer></section><button class="b3-build-core-item" @click="showLegendary"><small>可选核心传奇 · 戒指</small><div><img :src="guide.legendary.icon" alt=""/><b>{{ guide.legendary.name }}</b><span>›</span></div><p>{{ guide.legendary.fixedName }}</p></button></div>
                <div class="b3-build-section-head"><h4>接下来追求什么</h4><small>成型 → 提频 → 放大 → 续航</small></div><div class="b3-build-roadmap"><button v-for="item in guide.groups" :key="item.id" @click="showGroup(item.id)"><small>{{ item.number }}</small><b>{{ item.short }}</b><span>›</span></button></div>
                <details v-for="item in guide.questions" :key="item.title" class="b3-build-faq"><summary>{{ item.title }}</summary><p>{{ item.answer }}</p></details>
              </section>
              <section v-show="tab === 'affixes'" id="b3-build-panel-affixes" role="tabpanel" aria-labelledby="b3-build-tab-affixes">
                <div class="b3-build-groups"><button v-for="item in guide.groups" :key="item.id" :class="{on: groupId === item.id}" :aria-pressed="groupId === item.id" @click="groupId = item.id"><small>{{ item.number }}</small>{{ item.short }}</button></div><div class="b3-build-group-intro"><h4>{{ group.name }}</h4><p>{{ group.description }}</p></div>
                <div class="b3-build-affixes"><button v-for="(row, i) in group.rows" :key="row.id" @click="inspect(row)"><span class="b3-build-row-number">{{ i + 1 }}</span><div><b>{{ row.name }}</b><p>{{ row.reason }}</p><small>{{ row.prerequisite }}</small></div><em>{{ row.label }}</em><span>›</span></button></div><p class="b3-build-reference-note">T{{ tier }} 数值为当前阶级的中位参考。先保证联动与回蓝，再追求频率；防御词条仍需按实际受到的伤害补齐。</p>
              </section>
              <section v-show="tab === 'equipment'" id="b3-build-panel-equipment" role="tabpanel" aria-labelledby="b3-build-tab-equipment"><div class="b3-build-section-head"><h4>参考配装</h4><small>{{ guide.preset.count }} 件装备 · {{ guide.preset.affixes }} 条随机词条 · 预设实际数值</small></div><div class="b3-build-equipment"><div class="b3-build-gear-list"><button v-for="item in guide.equipment" :key="item.uid" :class="{on: !legendarySelected && gear?.uid === item.uid}" @click="gearId = item.uid"><img :src="item.icon" alt=""/><div><small>{{ item.slotName }} · 稀有 · T{{ item.tier }}</small><b>{{ item.name }}</b></div><span>›</span></button><small class="b3-build-optional">可选核心传奇</small><button class="legendary" :class="{on: legendarySelected}" @click="showLegendary"><img :src="guide.legendary.icon" alt=""/><div><small>戒指 · 传奇</small><b>{{ guide.legendary.name }}</b></div><span>›</span></button></div><article class="b3-build-gear-detail" :class="{legendary: legendarySelected}"><template v-if="legendarySelected"><header><img :src="guide.legendary.icon" alt=""/><div><small>固定传奇特性 · 戒指</small><h4>{{ guide.legendary.name }}</h4></div></header><p class="b3-build-fixed">{{ guide.legendary.fixedName }}</p><p>完整聚合「创建雷霆新星 + 感电」。所有装备阶级均固定 100% 概率，洗炼保留；另有五条正常随机词缀。</p><p>可替代普通的异常消费触发词条。施加、消费异常的能力需要另外获得，仍受触发冷却和魔力限制。</p><small>正常传奇掉落、商人、GM 商店可获得。现有五件稀有参考预设未包含这枚戒指。</small></template><template v-else-if="gear"><header><img :src="gear.icon" alt=""/><div><small>T{{ gear.tier }} · 稀有 · {{ gear.slotName }}</small><h4>{{ gear.name }}</h4></div></header><div v-for="row in gear.lines" :key="row.id" class="b3-build-gear-line"><b>{{ row.name }}</b><small v-if="row.tier">T{{ row.tier }}</small></div><p class="b3-build-reference-note">现有预设的真实装备词条。实际掉落、洗炼会重新随机，不要求装备同名。</p></template></article></div></section>
            </template>
            <section v-else class="b3-build-simple"><template v-if="selected.id.startsWith('royal_treasury_')"><h4>自叠层原理 · 全套 T1</h4><p>手动施放一次，只增加1层 → 自动兵器命中 → 命中／暴击／击杀／异常消费特性补层 → 层数提高出射频率 → 更多实际命中，继续补层。</p><p>每累计3次投射命中 +1层；投射物暴击、击杀、每次实际消耗异常分别 +1层。四条独立词条，移除哪条就失去对应路径；补层刷新5秒等待，上限40层。不是按时间白送层数，空场不叠层。</p></template><h4>当前参考配装 · T1</h4><p>{{ selected.description }}</p><div v-for="item in selected.equipment" :key="item.slot"><span>{{ item.slotName }}</span><b>{{ item.name }}</b><small>{{ item.equipped ? '已装备' : item.owned ? '已拥有' : '未拥有' }}</small></div><p class="dim">本轮先提供霜雷交响的原理与词条指南；此构筑保留现有配装预览。</p></section>
          </div>
          <footer class="b3-build-actions"><span>参考装备加入背包，保留原有物品。</span><button class="btn primary" :disabled="!ready" @click="$emit('apply', selected)">{{ selected.equipped ? '重新应用' : '一键应用' }}{{ selected.gradeName || selected.name }}</button></footer>
        </template>
      </div>
    </div>
    <section v-if="detail" ref="detailElement" class="b3-build-inspect" role="dialog" aria-modal="false" aria-label="词条详情" tabindex="-1"><header><small>词条详情 · T{{ tier }} 参考</small><button type="button" aria-label="关闭构筑词条详情" @click="closeDetail">×</button></header><h4>{{ detail.name }}</h4><p>{{ detail.text }}</p><template v-if="detail.reason"><b>为什么追求</b><p>{{ detail.reason }}</p><b>前置与搭配</b><p>{{ detail.prerequisite }}</p></template><small>本阶中位参考，实际掉落与洗炼有数值区间。</small></section>
  </div>`,
};
