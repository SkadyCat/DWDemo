// 洗炼台: identify owned equipment, then use the selected currency's reroll / append effect.
// Equipment slots restrict the random affix pool; omens further restrict it to one tag family.
import { createApp, computed, ref, watch } from '/vendor/vue.esm-browser.prod.js';
import { store, notify } from '/editors.mjs';
import { player, ownedCount, ensureStarted, identify, craft, discard } from '/player.mjs';
import { affixFamilies, omenFamily, equipmentTier, currencyCraft, craftTargetError, reforgeTargetGrade, REFORGE_GRADE_NAMES, EQUIPMENT_RARITY_NAMES, SLOTS } from '/engine/index.mjs';
import { equipmentCraftAffixPool } from '/equipment-crafting.mjs';
import { affixText } from '/affix-text.mjs';
import { iconSrc } from '/game-icons.mjs';

const TEMPLATE = /* html */ `
<div class="craft" v-if="store.library && store.collections">
  <aside class="craft-bag card">
    <h3>装备</h3>
    <p class="hint">掉落装备需先鉴定，鉴定时生成属性和词条数值。装备 T 阶是词条阶级上限。</p>
    <h4>待鉴定 <small>{{ templates.length }}</small></h4>
    <div class="craft-list">
      <div v-for="t in templates" :key="t.id" class="craft-row" :class="'r-' + t.rarity">
        <div class="tile" :class="'r-' + t.rarity"><img class="game-icon" :src="iconSrc('equipment', t)" alt="" draggable="false"></div>
        <div class="grow"><b>{{ t.name }}</b><span class="dim">{{ slotName(t.slot) }} · {{ rarityName(t.rarity) }} · ×{{ t.count }}</span></div>
        <button class="btn sm" @click="doIdentify(t.id)">鉴定</button>
      </div>
      <i class="dim" v-if="!templates.length">无（去商店买装备）</i>
    </div>
    <h4>已鉴定 <small>{{ instances.length }}</small></h4>
    <div class="craft-list">
      <div v-for="i in instances" :key="i.uid" class="craft-row pick" :class="['r-' + i.rarity, {on: i.uid === selectedUid}]" @click="selectedUid = i.uid">
        <div class="tile" :class="'r-' + i.rarity"><img class="game-icon" :src="iconSrc('equipment', i)" alt="" draggable="false"></div>
        <div class="grow"><b>T{{ equipmentTier(i) }} · {{ i.name }}</b><span class="dim">{{ slotName(i.slot) }} · {{ i.affixes.length }} 随机词条<template v-if="equippedSlot(i.uid)"> · 已装备</template></span></div>
      </div>
      <i class="dim" v-if="!instances.length">无</i>
    </div>
  </aside>

  <section class="craft-main card">
    <template v-if="item">
      <header class="craft-head" :class="'r-' + item.rarity">
        <div class="tile lg" :class="'r-' + item.rarity"><img class="game-icon" :src="iconSrc('equipment', item)" alt="" draggable="false"></div>
        <div class="grow">
          <h2>T{{ equipmentTier(item) }} · {{ item.name }}</h2>
          <span class="dim">{{ slotName(item.slot) }} · {{ rarityName(item.rarity) }} · 等级 {{ item.level }}<template v-if="item.skill"> · 授予 {{ skillName(item.skill) }}</template></span>
        </div>
        <button class="btn danger sm" @click="doDiscard">销毁</button>
      </header>
      <p class="craft-reforge-summary">已选定洗炼 {{ item.reforgeTargets?.length || 0 }}/3 条 · 依次使用下品、中品、上品灵石</p>
      <div class="affixes">
        <div v-for="(base, index) in item.bases || []" :key="'base:' + index" class="affix fixed">
          <div class="affix-head"><b>{{ effectText(base) }}</b><span class="pill">基础属性 · {{ index === 0 ? '底材固定' : '生成随机' }}</span></div>
        </div>
        <div v-if="item.legendary" class="affix fixed">
          <div class="affix-head"><b>{{ effectText(item.legendary) }}</b><span class="pill">固定传奇词条</span></div>
        </div>
        <div v-for="(a, i) in item.affixes" :key="i + a.id" class="affix" :class="{fresh: changed.has(i), 'can-reroll': canCraftAffix(i)}">
          <button type="button" class="affix-head craft-affix-target" :disabled="!canCraftAffix(i)" :title="targetError(i)" @click="doCraft(i)">
            <b>{{ effectText(a) }}</b>
            <span v-if="reforgeTargetGrade(item, i)" class="pill">{{ REFORGE_GRADE_NAMES[reforgeTargetGrade(item, i) - 1] }}</span>
            <span v-if="a.tier" class="pill">{{ a.tier }} 阶</span>
            <span v-for="f in famsOf(a)" :key="f" class="fam" :class="{hit: f === lastFamily}">{{ familyName(f) }}</span>
          </button>
        </div>
      </div>
      <footer class="craft-foot">
        <button v-if="isWholeCraft" class="btn primary" :disabled="!canCraft" @click="doCraft(null)">{{ isRemoving ? '随机移除 ' + operation.count + ' 条词缀' : isRolling ? '重新随机生成 ' + operation.count + ' 条词缀' : '随机增加 ' + operation.count + ' 条词条' }}</button>
        <span class="dim" v-if="!canCraft">{{ blocked }}</span>
        <span class="dim" v-else><template v-if="!isWholeCraft">点击闪烁词条，</template>消耗 1 {{ itemName(currencyId) }}<template v-if="omenId"> + 1 {{ itemName(omenId) }}</template><template v-if="isRemoving"> · 随机移除一条；保留基础属性和固有传奇</template><template v-else> · 词条 T1–T{{ equipmentTier(item) }} 等概率 · 池中 {{ pool.length }} 种词条</template></span>
      </footer>
      <div class="craft-log" v-if="log.length">
        <h4>记录</h4>
        <div v-for="(l, i) in log" :key="i" class="log-row"><span class="dim mono">{{ l.time }}</span> {{ l.text }}</div>
      </div>
    </template>
    <div class="empty" v-else>在左边鉴定或选择一件装备</div>
  </section>

  <aside class="craft-side card">
    <h3>通货</h3>
    <div class="craft-list">
      <label v-for="c in currencies" :key="c.id" class="craft-row pick" :class="{on: currencyId === c.id, none: !c.count}">
        <input type="radio" :value="c.id" v-model="currencyId">
        <div class="tile"><img class="game-icon" :src="iconSrc('item', c.id)" :data-currency-grade="c.grade" alt="" draggable="false"></div>
        <div class="grow"><b>{{ c.name }}</b><span class="dim">{{ c.description }}</span></div>
        <em class="mono">×{{ c.count }}</em>
      </label>
    </div>
    <h3>预兆 <small>可选</small></h3>
    <div class="craft-list">
      <label class="craft-row pick" :class="{on: !omenId}"><input type="radio" value="" v-model="omenId"><div class="grow"><b>不使用</b><span class="dim">{{ item ? '该部位可用' : '全部' }} {{ fullPool }} 种词条</span></div></label>
      <label v-for="o in omens" :key="o.id" class="craft-row pick" :class="{on: omenId === o.id, none: !o.count}">
        <input type="radio" :value="o.id" v-model="omenId">
        <div class="tile"><img class="game-icon" :src="iconSrc('item', o.id)" alt="" draggable="false"></div>
        <div class="grow"><b>{{ o.name }}</b><span class="dim">{{ familyName(o.family) }} · {{ o.poolSize }} 种词条</span></div>
        <em class="mono">×{{ o.count }}</em>
      </label>
    </div>
    <button class="btn sm" @click="grantTest">领取测试材料（通货 ×10、每种预兆 ×3、每件非普通装备 ×1）</button>
    <details class="fam-list">
      <summary>族与 tag</summary>
      <div v-for="f in families" :key="f.id" class="fam-block">
        <b>{{ f.name }}族</b> <span class="dim">{{ f.description }}</span>
        <div><span v-for="t in f.tags" :key="t" class="mini">{{ t }}</span></div>
      </div>
    </details>
  </aside>
</div>
<div class="ed-loading" v-else>{{ store.error || '加载洗炼台…' }}</div>`;

export function mountCraft(el) {
  createApp({
    template: TEMPLATE,
    setup() {
      const selectedUid = ref('');
      const currencyId = ref('');
      const omenId = ref('');
      const lastFamily = ref('');
      const changed = ref(new Set());
      const log = ref([]);

      const items = () => [...(store.collections?.item?.values() || [])].map(e => e.doc).filter(Boolean);
      const itemName = id => store.collections?.item?.get(id)?.doc?.name || id;
      const skillName = id => store.collections?.skill?.get(id)?.doc?.name || id;
      const slotName = id => SLOTS.find(s => s.id === id)?.name || id;
      const rarityName = id => EQUIPMENT_RARITY_NAMES[id] || id;
      const familyName = id => store.tags?.familyName(id) || id;
      const famsOf = affix => (store.tags ? affixFamilies(store.tags, affix) : []);
      const effectText = affix => affixText(affix, store.library);

      watch(() => store.version, () => { if (store.collections) ensureStarted(store.catalog, store.collections, store.library); }, { immediate: true });

      const templates = computed(() => Object.entries(player.owned.equipment).filter(([, n]) => n > 0)
        .map(([id, count]) => ({ ...(store.collections?.equipment?.get(id)?.doc || {}), count }))
        .filter(d => d.id).map(d => ({ ...d, name: d.name || d.id }))
        .concat(Object.values(player.instances).filter(i => i.identified === false).map(i => ({ ...i, id: i.uid, count: 1 }))));
      const instances = computed(() => Object.values(player.instances).filter(i => i.identified !== false));
      const item = computed(() => player.instances[selectedUid.value] || null);
      const equippedSlot = uid => Object.entries(player.loadout.equipment).find(([, id]) => id === uid)?.[0] || '';

      const currencies = computed(() => { store.version; return items().filter(d => d.category === 'currency').map(d => ({ id: d.id, name: d.name || d.id, description: d.description, grade: d.craft?.grade, count: ownedCount('item', d.id) })).sort((a, b) => (a.grade ?? 4) - (b.grade ?? 4)); });
      const omens = computed(() => {
        store.version;
        return items().filter(d => d.category === 'omen').map(d => {
          const family = omenFamily(store.tags, d);
          return { id: d.id, name: d.name || d.id, family, count: ownedCount('item', d.id), poolSize: family ? equipmentCraftAffixPool(store.library, store.tags, item.value?.slot, family).length : 0 };
        });
      });
      watch(currencies, list => { if (!list.some(c => c.id === currencyId.value)) currencyId.value = list[0]?.id || ''; }, { immediate: true });

      const family = computed(() => omens.value.find(o => o.id === omenId.value)?.family || '');
      const operation = computed(() => currencyCraft(store.collections?.item?.get(currencyId.value)?.doc));
      const isAdding = computed(() => operation.value.op === 'add_affixes');
      const isRolling = computed(() => operation.value.op === 'roll_affixes');
      const isRemoving = computed(() => operation.value.op === 'remove_affixes');
      const isWholeCraft = computed(() => isAdding.value || isRolling.value || isRemoving.value);
      const currency = computed(() => store.collections?.item?.get(currencyId.value)?.doc);
      const targetError = index => craftTargetError(item.value, currency.value, index);
      const pool = computed(() => (store.library && store.tags ? equipmentCraftAffixPool(store.library, store.tags, item.value?.slot, family.value) : []));
      const fullPool = computed(() => (store.library && store.tags ? equipmentCraftAffixPool(store.library, store.tags, item.value?.slot).length : 0));
      const blocked = computed(() => {
        if (!store.tags) return '缺少 Tags/families.json';
        if (!currencyId.value) return '没有通货物品（类别 currency）';
        if (!ownedCount('item', currencyId.value)) return `${itemName(currencyId.value)}不足`;
        if (isRemoving.value) return omenId.value ? '移除词缀不能搭配预兆' : item.value ? targetError(null) : '';
        if (omenId.value && !ownedCount('item', omenId.value)) return `${itemName(omenId.value)}不足`;
        if (item.value && !pool.value.length) return '该部位与所选预兆没有可用词条';
        if (item.value && isWholeCraft.value) return targetError(null);
        if (item.value && !item.value.affixes.length) return '没有随机词条，请先使用陨星石';
        if (item.value && !item.value.affixes.some((_, index) => !targetError(index))) return targetError(0);
        return '';
      });
      const canCraft = computed(() => !!item.value && !blocked.value);
      const canCraftAffix = index => canCraft.value && operation.value.op === 'reroll' && !targetError(index);

      const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
      function doIdentify(id) {
        const result = identify(id, store.collections, store.library);
        if (result.error) return notify(result.error, true);
        selectedUid.value = result.item.uid;
        changed.value = new Set(result.item.affixes.map((_, i) => i));
        log.value.unshift({ time: stamp(), text: `鉴定 ${result.item.name}：${result.item.affixes.map(effectText).join('、') || '无随机词条'}` });
      }
      function doCraft(index) {
        const result = craft(selectedUid.value, { currencyId: currencyId.value, omenId: omenId.value, index }, store.collections, store.library, store.tags);
        if (result.error) return notify(result.error, true);
        lastFamily.value = result.family;
        changed.value = new Set(result.changed);
        const rows = result.operation === 'remove_affixes' ? result.removed : result.changed.map(i => result.after.affixes[i]);
        const scope = result.operation === 'remove_affixes' ? `移除 ${rows.length} 条词缀` : result.operation === 'roll_affixes' ? `重新随机生成 ${rows.length} 条词缀` : result.operation === 'add_affixes' ? `增加 ${rows.length} 条词条` : `洗炼第 ${index + 1} 条`;
        log.value.unshift({ time: stamp(), text: `${itemName(currencyId.value)}${result.family ? ` + ${familyName(result.family)}预兆` : ''} ${scope} → ${rows.map(effectText).join('、')}` });
        log.value.splice(30);
      }
      function doDiscard() {
        if (!item.value || !confirm(`销毁 ${item.value.name}？`)) return;
        discard(selectedUid.value);
        selectedUid.value = '';
      }
      function grantTest() {
        for (const c of currencies.value) player.owned.item[c.id] = (player.owned.item[c.id] || 0) + 10;
        for (const o of omens.value) player.owned.item[o.id] = (player.owned.item[o.id] || 0) + 3;
        for (const { doc } of store.collections.equipment.values()) if (doc && doc.rarity !== 'common') player.owned.equipment[doc.id] = (player.owned.equipment[doc.id] || 0) + 1;
        notify('已领取测试材料');
      }

      const families = computed(() => {
        if (!store.tags) return [];
        const doc = store.tags.doc;
        return doc.families.map(f => ({ ...f, tags: [...doc.tags.values()].filter(t => t.family === f.id).map(t => t.name) }));
      });

      return {
        store, player, selectedUid, currencyId, omenId, lastFamily, changed, log, templates, instances, item, currencies, omens, pool, fullPool,
        blocked, canCraft, canCraftAffix, targetError, operation, isAdding, isRolling, isRemoving, isWholeCraft, reforgeTargetGrade, REFORGE_GRADE_NAMES, families, itemName, skillName, slotName, rarityName, familyName, famsOf, effectText, equippedSlot,
        doIdentify, doCraft, doDiscard, grantTest, equipmentTier, iconSrc,
      };
    },
  }).mount(el);
}
