// The battle inspector uses the same owned instances and crafting transaction as the crafting page.
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { store, notify } from '/editors.mjs';
import { player, ownedCount, craft, identify } from '/player.mjs';
import { equipmentTier, equipmentRarity, currencyCraft, craftTargetError, reforgeTargetGrade, REFORGE_GRADE_NAMES, EQUIPMENT_RARITY_NAMES, SLOTS, omenFamily } from '/engine/index.mjs';
import { equipmentCraftAffixPool } from '/equipment-crafting.mjs';
import { affixText, affixName } from '/affix-text.mjs';
import { iconSrc } from '/game-icons.mjs';
import { BattleAffixBook } from '/battle-affix-book.mjs';

export const BattleItemPanel = {
  components: { BattleAffixBook },
  props: ['item', 'pinned', 'position', 'inventory', 'readOnly'],
  emits: ['close', 'equip', 'identified'],
  template: /* html */ `<teleport to="body">
    <section ref="panel" class="b3-item-panel card" :class="['r-' + rarityId, {pinned}]" :style="panelPosition" :role="pinned ? 'dialog' : 'tooltip'" :aria-label="item.name + '物品详情'" @pointerdown.stop>
      <header class="b3-item-head">
        <img class="game-icon b3-item-icon" :src="iconSrc(item.kind, detail || item)" :data-currency-grade="detail?.craft?.grade || item.currencyGrade" alt="" draggable="false">
        <div><h3>{{ item.tier ? 'T' + item.tier + ' · ' : '' }}{{ item.name }}</h3><span class="dim">{{ rarity }}<template v-if="slot"> · {{ slot }}</template> · 数量 {{ item.count }}</span></div>
        <button v-if="pinned" class="btn ghost sm" @click="$emit('close')" aria-label="关闭物品详情">×</button>
      </header>
      <div class="b3-item-pin"><span>{{ pinned ? '已固定 · 点击空白处或 × 关闭' : 'Ctrl 固定 · 移出物品关闭' }}</span></div>
      <div class="b3-item-content" @scroll="scrollAffix(); scrollMaterial()">
        <p v-if="item.description" class="dim">{{ item.description }}</p>
        <p v-if="detail?.skill">绑定技能：{{ store.library.buildDisplayName(detail.skill) }}</p>
        <template v-if="unidentified">
          <p class="b3-item-unidentified">未鉴定</p>
          <p class="dim">鉴定后生成基础属性、词条和具体数值。</p>
          <button v-if="pinned && canManage" class="btn sm" @click="identifyItem">鉴定装备</button>
        </template>
        <template v-else-if="item.instance && detail">
          <div v-if="detail.bases?.length" class="b3-item-bases">
            <div v-for="(base, index) in detail.bases" :key="'base:' + index" class="b3-item-affix fixed"><span v-if="!hasAffixDetails(base)" class="b3-affix-text">{{ effectName(base) }}</span><button v-else type="button" class="b3-affix-text b3-affix-name" @pointerenter="showAffix('base', index, $event)" @pointerleave="leaveAffix" @click="showAffix('base', index, $event, true)" aria-haspopup="dialog" :aria-expanded="selectedKey === 'base:' + index">{{ effectName(base) }}</button></div>
          </div>
          <p v-if="pinned && canManage" class="dim">已选定洗炼 {{ detail.reforgeTargets?.length || 0 }}/3 条</p>
          <p v-if="hasRerollTarget" class="b3-affix-craft-hint" role="status">点击闪烁词条，用{{ activeCurrency.name }}选定或洗炼</p>
          <div v-if="detail.legendary" class="b3-item-affix fixed"><span v-if="!hasAffixDetails(detail.legendary)" class="b3-affix-text">{{ effectName(detail.legendary) }}</span><button v-else type="button" class="b3-affix-text b3-affix-name" @pointerenter="showAffix('legendary', 0, $event)" @pointerleave="leaveAffix" @click="showAffix('legendary', 0, $event, true)" aria-haspopup="dialog" :aria-expanded="selectedKey === 'legendary:0'">{{ effectName(detail.legendary) }}</button><small v-if="pinned">固定</small></div>
          <div v-for="(extra, index) in detail.extraLegendary || []" :key="'extra-legendary:' + index" class="b3-item-affix fixed"><span class="b3-affix-text">{{ effectName(extra) }}</span><small v-if="pinned">固定</small></div>
          <div v-for="(affix, index) in detail.affixes" :key="index" class="b3-item-affix random" :class="{fresh: changed.has(index), 'can-reroll': canRerollAffix(index)}" :data-reforge-grade="reforgeTargetGrade(detail, index) || undefined">
            <span v-if="!hasAffixDetails(affix) && !canRerollAffix(index)" class="b3-affix-text b3-affix-roll"><span>{{ effectName(affix) }}</span><small v-if="reforgeLabel(index)" class="b3-affix-reforge" :title="REFORGE_GRADE_NAMES[reforgeTargetGrade(detail, index) - 1]">{{ reforgeLabel(index) }}</small><small v-if="pinned && affix.tier">T{{ affix.tier }}</small></span><button v-else type="button" class="b3-affix-text b3-affix-name b3-affix-roll" :class="{'no-description': !hasAffixDetails(affix)}" @pointerenter="showAffix('affix', index, $event)" @pointerleave="leaveAffix" @click="clickAffix(index, $event)" :aria-label="canRerollAffix(index) ? '洗炼第 ' + (index + 1) + ' 条词条：' + effectName(affix) : undefined" :aria-haspopup="canRerollAffix(index) ? undefined : 'dialog'" :aria-expanded="canRerollAffix(index) ? undefined : selectedKey === 'affix:' + index"><span>{{ effectName(affix) }}</span><small v-if="reforgeLabel(index)" class="b3-affix-reforge" :title="REFORGE_GRADE_NAMES[reforgeTargetGrade(detail, index) - 1]">{{ reforgeLabel(index) }}</small><small v-if="pinned && affix.tier">T{{ affix.tier }}</small></button>
          </div>
          <div v-if="pinned && canManage" class="b3-item-craft">
            <div class="b3-craft-materials" role="group" aria-label="持有的通货">
              <div class="b3-material-head"><b>通货</b><span>{{ activeCurrency ? activeCurrency.name + ' · 已激活' : '点击图标激活' }}</span></div>
              <div class="b3-material-icons" v-if="currencies.length">
                <button v-for="currency in currencies" :key="currency.id" type="button" class="b3-material-icon" :class="{active: currencyId === currency.id}" :aria-pressed="currencyId === currency.id" :aria-label="'通货：' + currency.name + '，持有 ' + currency.count" :aria-describedby="hoveredMaterial === 'currency:' + currency.id ? 'battle-material-tooltip' : undefined" @pointerenter="showMaterial('currency', currency.id, $event)" @pointerleave="leaveMaterial" @focus="showMaterial('currency', currency.id, $event)" @blur="leaveMaterial" @click="currencyId = currencyId === currency.id ? '' : currency.id">
                  <img class="game-icon" :src="iconSrc('item', currency.id)" :data-currency-grade="currency.craft?.grade" alt="" draggable="false"><span v-if="currency.craft?.grade" class="b3-material-grade" aria-hidden="true">{{ ['下', '中', '上'][currency.craft.grade - 1] }}</span><span class="b3-material-count">{{ currency.count }}</span><span v-if="currencyId === currency.id" class="b3-material-active" aria-hidden="true">✓</span>
                </button>
              </div>
              <p v-else class="dim">暂无持有的通货</p>
            </div>
            <div class="b3-craft-materials" role="group" aria-label="持有的预兆">
              <div class="b3-material-head"><b>预兆</b><span>{{ activeOmen ? activeOmen.name + ' · 已激活' : '可选 · 点击图标激活' }}</span></div>
              <div class="b3-material-icons" v-if="omens.length">
                <button v-for="omen in omens" :key="omen.id" type="button" class="b3-material-icon" :class="{active: omenId === omen.id}" :aria-pressed="omenId === omen.id" :aria-label="'预兆：' + omen.name + '，持有 ' + omen.count" :aria-describedby="hoveredMaterial === 'omen:' + omen.id ? 'battle-material-tooltip' : undefined" @pointerenter="showMaterial('omen', omen.id, $event)" @pointerleave="leaveMaterial" @focus="showMaterial('omen', omen.id, $event)" @blur="leaveMaterial" @click="omenId = omenId === omen.id ? '' : omen.id">
                  <img class="game-icon" :src="iconSrc('item', omen.id)" alt="" draggable="false"><span class="b3-material-count">{{ omen.count }}</span><span v-if="omenId === omen.id" class="b3-material-active" aria-hidden="true">✓</span>
                </button>
              </div>
              <p v-else class="dim">暂无持有的预兆</p>
            </div>
            <p class="dim" v-if="activeCurrency">每次消耗 1 个{{ activeCurrency.name }}<template v-if="activeOmen">和 1 个{{ activeOmen.name }}</template>，<template v-if="isRolling">重新随机生成 {{ operation.count }} 条词缀，并清除洗炼选定记录；保留基础属性及固定传奇词条。</template><template v-else-if="isAdding">保留原词条并随机增加 {{ operation.count }} 条。</template><template v-else-if="isRemoving">随机移除 {{ operation.count }} 条随机词缀，保留基础属性和固有传奇；不搭配预兆。移除绑定词条时，该条及后续品级的洗炼绑定重置。</template><template v-else>首次选定后，该条只用对应品级灵石洗炼；每件装备最多选定3条。</template><template v-if="!isRemoving">词条 T1–T{{ equipmentTier(detail) }}。</template></p>
            <button v-if="isWholeCraft" class="btn primary" :disabled="!!blocked" @click="reroll(null)">{{ isRemoving ? '随机移除 ' + operation.count + ' 条词缀' : isRolling ? '重新随机生成 ' + operation.count + ' 条词缀' : '随机增加 ' + operation.count + ' 条词条' }}</button>
            <span class="dim" v-if="blocked">{{ blocked }}</span>
          </div>
        </template>
        <template v-else>
          <div v-for="(base, index) in detail?.bases || []" :key="'base:' + base.id" class="b3-item-affix fixed"><span v-if="!hasAffixDetails(base)" class="b3-affix-text">{{ effectName(base) }}</span><button v-else type="button" class="b3-affix-text b3-affix-name" @pointerenter="showAffix('base', index, $event)" @pointerleave="leaveAffix" @click="showAffix('base', index, $event, true)" aria-haspopup="dialog" :aria-expanded="selectedKey === 'base:' + index">{{ effectName(base) }}</button><small>固定基础</small></div>
          <p v-if="detail?.bases?.length" class="dim">第二条基础属性在鉴定生成时随机；基础属性不占品质词条数量。</p>
          <div v-for="(trait, index) in detail?.traits || []" :key="index" class="b3-item-affix"><span v-if="!hasAffixDetails({traits:[trait]})" class="b3-affix-text">{{ effectName({traits:[trait]}) }}</span><button v-else type="button" class="b3-affix-text b3-affix-name" @pointerenter="showAffix('trait', index, $event)" @pointerleave="leaveAffix" @click="showAffix('trait', index, $event, true)" aria-haspopup="dialog" :aria-expanded="selectedKey === 'trait:' + index">{{ effectName({traits:[trait]}) }}</button></div>
          <template v-if="item.kind === 'equipment' && pinned && canManage"><p class="dim">按现有鉴定规则生成装备实例后可加工词条。</p><button class="btn sm" @click="identifyItem">鉴定为装备实例</button></template>
        </template>
        <p class="b3-item-feedback" v-if="message" role="status">{{ message }}</p>
      </div>
      <footer v-if="item.ground"><span class="dim">点击掉落名称，靠近后拾取</span></footer>
      <footer v-else-if="readOnly && item.kind === 'equipment' && pinned"><span class="dim">取回背包后可装备或加工</span></footer>
      <footer v-else-if="item.kind === 'equipment' && pinned && canManage && !unidentified"><button class="btn sm" @click="$emit('equip', detail?.slot || item.slot, item.id)">{{ item.equipped ? '卸下' : '装备' }}</button></footer>
    </section>
    <aside v-if="selectedAffix" ref="affixPanel" class="b3-affix-description card" :class="{pinned: affixPinned}" :style="affixPosition" :role="affixPinned ? 'dialog' : 'tooltip'" :aria-label="effectName(selectedAffix) + '词条说明'" @pointerdown.stop @keydown.stop>
      <header><b>{{ effectName(selectedAffix) }}</b><button v-if="affixPinned" type="button" class="btn ghost sm" aria-label="关闭词条说明" @click="closeAffix(true)">×</button></header>
      <p>{{ effectText(selectedAffix) }}</p>
      <footer>{{ affixPinned ? '已固定 · Esc 关闭' : selectedKey.startsWith('affix:') && canRerollAffix(Number(selectedKey.split(':')[1])) ? '点击词条洗炼' : '点击词条固定' }}</footer>
    </aside>
    <aside v-if="materialInfo" id="battle-material-tooltip" ref="materialPanel" class="b3-material-tooltip" :class="{pinned: materialPinned}" :style="materialPosition" :role="materialPinned ? 'dialog' : 'tooltip'" :aria-label="materialInfo.name + '说明'" @pointerdown.stop @keydown.stop>
      <header><img class="game-icon" :src="iconSrc('item', materialInfo.id)" alt="" draggable="false"><div><b>{{ materialInfo.name }}</b><span>{{ materialInfo.kind }}<i>·</i>持有 {{ materialInfo.count }}</span></div><button v-if="materialPinned" type="button" class="btn ghost sm" :aria-label="'关闭' + materialInfo.kind + '说明'" @click="closeMaterial(true)">×</button></header>
      <p v-if="materialInfo.description">{{ materialInfo.description }}</p>
      <footer :class="{active: materialInfo.active}"><span aria-hidden="true">{{ materialInfo.active ? '✓' : '◇' }}</span><div>{{ materialInfo.active ? '已激活 · 再次点击取消' : '点击图标激活' }}<small>{{ materialPinned ? '已固定 · 点击右上角 × 关闭' : 'Ctrl 固定说明' }}</small></div><button v-if="materialPinned && materialInfo.category === 'omen'" type="button" class="b3-affix-book-button" aria-label="查看可刷词缀" aria-haspopup="dialog" :aria-expanded="affixBookOpen" @click="openAffixBook($event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15M6 8h3m-3 4h3m6-4h3m-3 4h3"/></svg></button></footer>
    </aside>
    <BattleAffixBook v-if="affixBookOpen && materialInfo?.category === 'omen'" ref="affixBookView" :omen="materialInfo" :slot="detail?.slot" :tier="equipmentTier(detail)" :anchor="materialPanel" :owner-position="materialPosition" @close="closeAffixBook(true)" />
  </teleport>`,
  setup(props, { emit }) {
    const currencyId = ref(''), omenId = ref(''), changed = ref(new Set()), message = ref('');
    const panel = ref(null), affixPanel = ref(null), selectedKey = ref(''), affixPinned = ref(false), affixPosition = ref({});
    const panelPosition = ref({ visibility: 'hidden' });
    let panelObserver = null;
    const hoveredMaterial = ref(''), materialPinned = ref(false), materialPanel = ref(null), materialPosition = ref({ visibility: 'hidden' });
    const affixBookOpen = ref(false), affixBookView = ref(null);
    let affixBookButton = null;
    let selectedButton = null;
    let materialButton = null;
    const canManage = computed(() => !props.item.ground && !props.readOnly);
    const detail = computed(() => props.item.ground ? props.item.detail : props.item.instance ? (props.inventory || player).instances[props.item.id] : store.collections?.[props.item.kind]?.get(props.item.id)?.doc);
    const unidentified = computed(() => props.item.kind === 'equipment' && (!props.item.instance || detail.value?.identified === false));
    const rarityId = computed(() => props.item.kind === 'equipment' && detail.value ? equipmentRarity(detail.value) : props.item.rarity);
    const rarity = computed(() => EQUIPMENT_RARITY_NAMES[rarityId.value] || rarityId.value);
    const slot = computed(() => SLOTS.find(slot => slot.id === detail.value?.slot)?.name || '');
    const choices = category => [...(store.collections?.item?.values() || [])].map(entry => entry.doc).filter(doc => doc?.category === category).map(doc => ({ ...doc, count: ownedCount('item', doc.id) })).filter(doc => doc.count > 0);
    const currencies = computed(() => choices('currency').sort((a, b) => (a.craft?.grade ?? 4) - (b.craft?.grade ?? 4))), omens = computed(() => choices('omen'));
    const activeCurrency = computed(() => currencies.value.find(currency => currency.id === currencyId.value));
    const activeOmen = computed(() => omens.value.find(omen => omen.id === omenId.value));
    const craftPool = computed(() => store.library ? equipmentCraftAffixPool(store.library, store.tags, detail.value?.slot, omenFamily(store.tags, activeOmen.value)) : []);
    const operation = computed(() => currencyCraft(activeCurrency.value));
    const isAdding = computed(() => operation.value.op === 'add_affixes');
    const isRolling = computed(() => operation.value.op === 'roll_affixes');
    const isRemoving = computed(() => operation.value.op === 'remove_affixes');
    const isWholeCraft = computed(() => isAdding.value || isRolling.value || isRemoving.value);
    watch(currencies, list => { if (currencyId.value && !list.some(currency => currency.id === currencyId.value)) currencyId.value = ''; });
    watch(omens, list => { if (omenId.value && !list.some(omen => omen.id === omenId.value)) omenId.value = ''; });
    watch(() => props.item.id, () => { changed.value = new Set(); message.value = ''; closeAffix(); closeMaterial(); });
    const materialInfo = computed(() => {
      const [kind, id] = hoveredMaterial.value.split(':');
      const material = (kind === 'currency' ? currencies.value : omens.value).find(item => item.id === id);
      return material ? { ...material, kind: kind === 'currency' ? '通货' : '预兆', active: (kind === 'currency' ? currencyId.value : omenId.value) === id } : null;
    });
    function affixAt(kind, index) {
      if (!detail.value) return null;
      const value = kind === 'legendary' ? detail.value.legendary : detail.value[kind === 'base' ? 'bases' : kind === 'trait' ? 'traits' : 'affixes']?.[+index];
      if (!value) return null;
      return kind === 'trait' || (kind === 'base' && !props.item.instance) ? { traits: [value] } : value;
    }
    const selectedAffix = computed(() => {
      if (!selectedKey.value) return null;
      const [kind, index] = selectedKey.value.split(':');
      const affix = affixAt(kind, index);
      return affix && hasAffixDetails(affix) ? affix : null;
    });
    const blocked = computed(() => {
      if (props.item.ground) return '拾取后可洗炼';
      if (props.readOnly) return '取回背包后可洗炼';
      if (unidentified.value) return '请先鉴定装备';
      if (!props.pinned) return '按 Ctrl 固定后洗炼';
      if (!activeCurrency.value) return currencies.value.length ? '请选择并激活通货' : '没有持有的通货';
      if (!['reroll', 'add_affixes', 'roll_affixes', 'remove_affixes'].includes(operation.value.op)) return '通货不支持装备加工';
      if (isRemoving.value) return omenId.value ? '移除词缀不能搭配预兆' : craftTargetError(detail.value, activeCurrency.value, null);
      if (omenId.value && !activeOmen.value) return '预兆不足';
      if (!craftPool.value.length) return '该部位与所选预兆没有可用词条';
      if (isWholeCraft.value) return craftTargetError(detail.value, activeCurrency.value, null);
      if (!detail.value?.affixes?.length) return '没有随机词条，请先使用陨星石';
      if (!detail.value.affixes.some((_, i) => !craftTargetError(detail.value, activeCurrency.value, i))) return craftTargetError(detail.value, activeCurrency.value, 0);
      return '';
    });
    const canRerollAffix = index => !blocked.value && operation.value.op === 'reroll' && !craftTargetError(detail.value, activeCurrency.value, index);
    const hasRerollTarget = computed(() => !!detail.value?.affixes?.some((_, i) => canRerollAffix(i)));
    const reforgeLabel = index => REFORGE_GRADE_NAMES[reforgeTargetGrade(detail.value, index) - 1]?.replace('灵石', '') || '';
    const effectText = affix => affix.traits?.length ? affixText(affix, store.library) : affix.description || affixText(affix, store.library);
    const effectName = affix => affixName(affix, store.library);
    const hasAffixDetails = affix => !!affix && !!effectText(affix) && effectText(affix) !== effectName(affix);
    async function placePanel() {
      await nextTick();
      if (!panel.value) return;
      const margin = 12, width = panel.value.offsetWidth, height = panel.value.offsetHeight;
      // Measure the full content before scaling; no content is clipped or put in a scroll area.
      const scale = Math.min(1, Math.max(1, window.innerHeight - margin * 2) / height);
      const clamp = (value, size, limit) => Math.max(margin, Math.min(parseFloat(value) || margin, limit - size * scale - margin));
      panelPosition.value = {
        left: clamp(props.position?.left, width, window.innerWidth) + 'px',
        top: clamp(props.position?.top, height, window.innerHeight) + 'px',
        transform: `scale(${scale})`, visibility: 'visible',
      };
      await nextTick();
      placeAffix(); placeMaterial();
    }
    async function placeMaterial() {
      await nextTick();
      if (!materialInfo.value || !panel.value || !materialPanel.value || !materialButton?.isConnected) return;
      const owner = panel.value.getBoundingClientRect(), anchor = materialButton.getBoundingClientRect(), popup = materialPanel.value.getBoundingClientRect();
      const margin = 12, gap = 10;
      let left, top = anchor.top;
      if (owner.right + gap + popup.width <= window.innerWidth - margin) left = owner.right + gap;
      else if (owner.left - gap - popup.width >= margin) left = owner.left - gap - popup.width;
      else {
        left = Math.max(margin, Math.min(anchor.left, window.innerWidth - popup.width - margin));
        top = anchor.top >= popup.height + gap + margin ? anchor.top - popup.height - gap : anchor.bottom + gap;
      }
      materialPosition.value = { left: left + 'px', top: Math.max(margin, Math.min(top, window.innerHeight - popup.height - margin)) + 'px', visibility: 'visible' };
    }
    function showMaterial(kind, id, event) {
      materialButton = event.currentTarget;
      // Pinning keeps the description open; hovering another material still updates its contents.
      if (!materialPinned.value) materialPosition.value = { visibility: 'hidden' };
      if (kind !== 'omen') closeAffixBook();
      hoveredMaterial.value = kind + ':' + id;
      placeMaterial();
    }
    function leaveMaterial() { if (!materialPinned.value) closeMaterial(); }
    function scrollMaterial() { if (materialPinned.value) placeMaterial(); else closeMaterial(); }
    function closeMaterial(restoreFocus = false) {
      closeAffixBook();
      hoveredMaterial.value = ''; materialPinned.value = false; materialButton = null;
      if (restoreFocus === true) panel.value?.querySelector('[aria-label="关闭物品详情"]')?.focus({ preventScroll: true });
    }
    function openAffixBook(event) {
      if (materialInfo.value?.category !== 'omen') return;
      affixBookButton = event.currentTarget; affixBookOpen.value = true;
    }
    function closeAffixBook(restoreFocus = false) {
      const button = affixBookButton; affixBookOpen.value = false; affixBookButton = null;
      if (restoreFocus === true) nextTick(() => { if (button?.isConnected) button.focus({ preventScroll: true }); });
    }
    async function placeAffix() {
      await nextTick();
      if (!selectedAffix.value || !panel.value || !affixPanel.value || !selectedButton?.isConnected) return;
      const owner = panel.value.getBoundingClientRect(), row = selectedButton.getBoundingClientRect(), popup = affixPanel.value.getBoundingClientRect();
      affixPosition.value = {
        left: Math.max(12, owner.left - popup.width - 10) + 'px',
        top: Math.max(12, Math.min(row.top, window.innerHeight - popup.height - 12)) + 'px',
      };
    }
    function showAffix(kind, index, event, pin = false) {
      if (!hasAffixDetails(affixAt(kind, index))) return;
      if (affixPinned.value && !pin) return;
      selectedButton = event.currentTarget; selectedKey.value = kind + ':' + index;
      affixPinned.value = pin;
      placeAffix();
    }
    function leaveAffix() { if (!affixPinned.value) closeAffix(); }
    function scrollAffix() { if (affixPinned.value) placeAffix(); else closeAffix(); }
    function closeAffix(restoreFocus = false) {
      const button = selectedButton; selectedKey.value = ''; affixPinned.value = false; selectedButton = null;
      if (restoreFocus === true && button?.isConnected) button.focus({ preventScroll: true });
    }
    function descriptionKeydown(event) {
      if (['ControlLeft', 'ControlRight'].includes(event.code) && !event.repeat && materialInfo.value) {
        event.preventDefault(); event.stopImmediatePropagation();
        materialPinned.value = true; placeMaterial(); return;
      }
      if (event.code === 'Escape' && materialPinned.value) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (event.code !== 'Escape' || !selectedKey.value) return;
      event.preventDefault(); event.stopImmediatePropagation(); closeAffix(affixPinned.value);
    }
    function closeOutside(event) {
      if (!props.pinned || event.button !== 0) return;
      const target = event.target;
      // These descriptions are teleported beside the owner; they still belong to this inspector.
      if ([panel.value, affixPanel.value, materialPanel.value, affixBookView.value?.$el].some(node => node?.contains?.(target))) return;
      emit('close');
    }
    watch(selectedAffix, () => { if (selectedAffix.value) placeAffix(); else if (selectedKey.value) closeAffix(); });
    watch(() => props.position, placePanel, { deep: true });
    watch(materialInfo, value => { if (value) placeMaterial(); else closeMaterial(); });
    onMounted(() => {
      panelObserver = new ResizeObserver(placePanel);
      panelObserver.observe(panel.value);
      window.addEventListener('resize', placePanel);
      placePanel();
    });
    onMounted(() => { window.addEventListener('keydown', descriptionKeydown, true); document.addEventListener('pointerdown', closeOutside, true); });
    onBeforeUnmount(() => { panelObserver?.disconnect(); window.removeEventListener('resize', placePanel); });
    onBeforeUnmount(() => { window.removeEventListener('keydown', descriptionKeydown, true); document.removeEventListener('pointerdown', closeOutside, true); });
    function clickAffix(index, event) {
      if (!canRerollAffix(index)) return showAffix('affix', index, event, true);
      closeAffix();
      reroll(index);
    }
    function reroll(index) {
      if (blocked.value) return;
      const currency = activeCurrency.value, omen = activeOmen.value;
      const result = craft(props.item.id, { currencyId: currency.id, omenId: omen?.id || '', index }, store.collections, store.library, store.tags);
      if (result.error) { message.value = result.error; return notify(result.error, true); }
      changed.value = new Set(result.changed);
      const effect = result.operation === 'remove_affixes' ? `已随机移除 ${result.removed.length} 条词缀` : result.operation === 'roll_affixes' ? `已重新随机生成 ${result.changed.length} 条词缀` : result.operation === 'add_affixes' ? `已随机增加 ${result.changed.length} 条词条` : `第 ${index + 1} 条词条已洗炼`;
      message.value = `${effect}，消耗 1 ${currency.name}${omen ? '和 1 个' + omen.name : ''}`;
    }
    function identifyItem() {
      if (!props.pinned || !canManage.value) return;
      const result = identify(props.item.id, store.collections, store.library, props.item.key);
      if (result.error) return notify(result.error, true);
      emit('identified', result.item.uid);
    }
    return { store, canManage, detail, unidentified, rarityId, rarity, slot, currencyId, omenId, currencies, omens, activeCurrency, activeOmen, craftPool, operation, isAdding, isRolling, isRemoving, isWholeCraft, blocked, canRerollAffix, hasRerollTarget, reforgeLabel, reforgeTargetGrade, REFORGE_GRADE_NAMES, changed, message, materialInfo, hoveredMaterial, materialPinned, materialPanel, materialPosition, showMaterial, leaveMaterial, scrollMaterial, closeMaterial, affixBookOpen, affixBookView, openAffixBook, closeAffixBook, effectText, effectName, hasAffixDetails, selectedKey, selectedAffix, affixPinned, panel, panelPosition, affixPanel, affixPosition, showAffix, clickAffix, leaveAffix, scrollAffix, closeAffix, equipmentTier, reroll, identifyItem, iconSrc };
  },
};
