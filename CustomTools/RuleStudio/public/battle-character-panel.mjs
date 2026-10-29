// Character-sheet presentation. The battle owns all equipment and stat values.
import { computed, ref, watch, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { characterBagCellCount } from '/uicreator/assets/rulestudio-hud/character-bag-grid.js';

export const BattleCharacterPanel = {
  props: { character: Object, equipment: Array, skill: Object, inventory: Array, inventoryCells: Array, inventoryTotal: Number, query: String, filter: String, selectedKey: String },
  emits: ['select', 'inspect', 'leave', 'context', 'release', 'update:query', 'update:filter', 'drag-start', 'drag-end', 'equip', 'unequip', 'place', 'drop-outside'],
  setup(props, { emit }) {
    const dragged = ref(null), dropSlot = ref(''), overBag = ref(false), dropCell = ref(-1);
    const dragPointer = ref({x:0,y:0});
    let pendingDrag, suppressClickUntil = 0;
    function selectItem(item) {
      if (!item || performance.now() < suppressClickUntil) return;
      emit('select', item.key);
    }
    function startDrag(item, fromSlot, event) {
      if (event.button !== 0 || !item || !['equipment', 'item'].includes(item.kind)) return;
      pendingDrag = {item,fromSlot,x:event.clientX,y:event.clientY,pointerId:event.pointerId};
    }
    function endDrag() {
      const active = !!dragged.value;
      dragged.value = null; dropSlot.value = ''; overBag.value = false; dropCell.value = -1;
      pendingDrag = null;
      if (active) emit('drag-end');
    }
    const accepts = slot => !!dragged.value && !dragged.value.item.unidentified && dragged.value.item.slot === slot.slot;
    function moveDrag(event) {
      const pending = pendingDrag;
      if (!pending || event.pointerId !== pending.pointerId) return;
      if (!(event.buttons & 1)) { endDrag(); return; }
      if (!dragged.value && Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>6) {
        dragged.value = {item:pending.item,fromSlot:pending.fromSlot}; emit('drag-start',pending.item);
      }
      if (!dragged.value) return;
      event.preventDefault(); dragPointer.value={x:event.clientX+12,y:event.clientY+12};
      const hit=document.elementFromPoint(event.clientX,event.clientY),cell=hit?.closest('[data-character-cell]'),gear=hit?.closest('[data-character-slot]');
      const index=cell?Number(cell.dataset.characterCell):-1;
      dropCell.value=cells.value.some(c=>c.index===index&&!c.item)?index:-1;
      const slot=props.equipment.find(s=>s.slot===gear?.dataset.characterSlot);
      dropSlot.value=slot&&accepts(slot)?slot.slot:'';
      overBag.value=!!pending.fromSlot&&!!hit?.closest('.b3-char-inventory');
    }
    function finishDrag(event) {
      if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return;
      if (!dragged.value) { pendingDrag=null; return; }
      event.preventDefault(); suppressClickUntil=performance.now()+100;
      const hit=document.elementFromPoint(event.clientX,event.clientY),cell=hit?.closest('[data-character-cell]'),gear=hit?.closest('[data-character-slot]');
      const slot=props.equipment.find(s=>s.slot===gear?.dataset.characterSlot);
      if (cell) { const target=cells.value.find(c=>c.index===Number(cell.dataset.characterCell)); if(target&&!target.item)dropInCell(target); }
      else if (slot&&accepts(slot))dropOnSlot(slot);
      else if (hit?.closest('.b3-char-inventory'))dropInInventory();
      else if (!hit?.closest('.b3-window-character'))emit('drop-outside',dragged.value.item,hit);
      endDrag();
    }
    function suppressDragClick(event) { if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();} }
    function overSlot(slot, event) {
      if (!accepts(slot)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; dropSlot.value = slot.slot;
    }
    function dropOnSlot(slot) {
      if (accepts(slot)) emit('equip', slot.slot, dragged.value.item.id);
      endDrag();
    }
    function overInventory(event) {
      if (!dragged.value?.fromSlot) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; overBag.value = true;
    }
    function dropInInventory() {
      if (dragged.value?.fromSlot) emit('unequip', dragged.value.fromSlot, dragged.value.item.id);
      endDrag();
    }
    function overCell(cell,event) {
      if (!dragged.value || cell.item) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; dropCell.value = cell.index;
    }
    function dropInCell(cell) {
      if (dragged.value && !cell.item) emit('place',dragged.value.item,cell.index,dragged.value.fromSlot);
      endDrag();
    }
    function searchEscape(event) {
      if (!props.query) return;
      event.preventDefault(); event.stopPropagation(); emit('update:query', '');
    }
    watch(() => [props.query, props.filter], endDrag);
    onMounted(()=>{window.addEventListener('pointermove',moveDrag,{passive:false});window.addEventListener('pointerup',finishDrag,true);window.addEventListener('pointercancel',endDrag);window.addEventListener('blur',endDrag);window.addEventListener('click',suppressDragClick,true);});
    onBeforeUnmount(()=>{endDrag();window.removeEventListener('pointermove',moveDrag);window.removeEventListener('pointerup',finishDrag,true);window.removeEventListener('pointercancel',endDrag);window.removeEventListener('blur',endDrag);window.removeEventListener('click',suppressDragClick,true);});
    const equippedCount = computed(() => props.equipment.filter(slot => slot.item).length);
    const cells = computed(() => props.inventoryCells || Array.from({length:characterBagCellCount(props.inventory.length)},(_,index)=>({index,item:props.inventory[index]||null})));
    const sources = computed(() => (props.character?.traits.groups || []).flatMap(group => {
      const bySource = new Map();
      for (const row of group.rows) {
        if (!bySource.has(row.from)) bySource.set(row.from, []);
        bySource.get(row.from).push(row);
      }
      return [...bySource].map(([name, rows]) => {
        const equipment = props.equipment.find(slot => slot.item && slot.name === name);
        return { key: group.key + ':' + name, name: name || group.name, kind: group.name, rows,
          icon: equipment?.icon || (group.key === 'skill' ? props.skill?.icon : ''), rarity: equipment?.rarity || '' };
      });
    }));
    const signed = value => value > 0 ? '+' + value : String(value);
    return { equippedCount, cells, sources, dragged, dragPointer, dropSlot, dropCell, overBag, accepts, selectItem, startDrag, endDrag, overSlot, dropOnSlot, overInventory, dropInInventory, overCell, dropInCell, searchEscape, signed };
  },
  template: /* html */ `<div v-if="character" class="b3-char-sheet" :class="{'drag-active': !!dragged}" aria-label="角色背包、装备、属性与特性">
    <section class="b3-char-column b3-char-inventory" :class="{'bag-drop-target': overBag}" aria-label="角色背包" @dragover="overInventory" @dragleave="overBag = false" @drop.prevent.stop="dropInInventory">
      <header class="b3-char-column-head"><div><small>物品与装备</small><h3>背包</h3></div><span>{{ inventory.length }} / {{ inventoryTotal }}</span></header>
      <div class="b3-char-bag-filters">
        <input type="search" :value="query" placeholder="名称 / 词条" aria-label="搜索角色背包" @input="$emit('update:query', $event.target.value)" @focus="$emit('release')" @keydown.esc="searchEscape">
        <select :value="filter" aria-label="角色背包物品筛选" @change="$emit('update:filter', $event.target.value)"><option value="all">全部物品</option><option value="equipment">全部装备</option><option v-for="slot in equipment" :key="slot.slot" :value="slot.slot">{{ slot.slotName }}</option></select>
      </div>
      <div class="b3-char-scroll b3-char-bag-scroll">
        <div class="b3-char-bag-grid" role="group" aria-label="角色背包物品">
          <div v-for="cell in cells" :key="cell.index" class="b3-char-bag-cell" :class="{'drop-target': dropCell === cell.index}" :data-character-cell="cell.index" @dragover.stop="overCell(cell,$event)" @dragleave="dropCell = -1" @drop.prevent.stop="dropInCell(cell)">
          <button v-for="item in cell.item ? [cell.item] : []" :key="item.key" type="button" class="b3-char-bag-item" :class="['r-' + item.rarity, {'inventory-new': item.isNew, equipped: item.equipped, selected: selectedKey === item.key, dragging: dragged?.item.key === item.key}]" :data-character-item="item.key" :data-item-kind="item.kind" :draggable="false" :aria-pressed="selectedKey === item.key" :aria-label="'背包：' + item.name + (item.unidentified ? '，未鉴定' : '')"
            @pointerdown.stop="startDrag(item, '', $event)" @dragstart.prevent @pointerenter="!dragged&&$emit('inspect', item, $event)" @pointerleave="$emit('leave', item.key)" @focus="$emit('inspect', item, $event)" @blur="$emit('leave', item.key)" @click="selectItem(item, $event)" @contextmenu.prevent.stop="$emit('context', item, $event)" @keydown.shift.f10.prevent.stop="$emit('context', item, $event)">
            <img class="game-icon" :src="item.icon" :data-currency-grade="item.currencyGrade" alt="" draggable="false"><small v-if="item.tier" class="b3-char-bag-tier">T{{ item.tier }}</small><span v-if="item.equipped" class="b3-char-bag-equipped">✓</span><em v-if="item.count > 1">{{ item.count }}</em><span v-if="item.unidentified" class="b3-char-bag-unidentified">未鉴定</span><span v-if="item.isNew" class="inventory-new-edge" aria-hidden="true"></span>
          </button>
          <span v-if="!cell.item" class="b3-char-bag-empty" aria-hidden="true"></span>
          </div>
        </div>
        <p v-if="!inventory.length" class="b3-char-empty">没有匹配的物品</p>
      </div>
      <footer class="b3-char-gear-help">拖至对应槽位穿戴 · 拖回背包卸下<br>拖到窗口外丢到地面 · Ctrl 固定详情</footer>
    </section>
    <section class="b3-char-column b3-char-equipment" aria-label="当前穿戴装备">
      <header class="b3-char-column-head"><div><small>当前穿戴</small><h3>装备</h3></div><span>{{ equippedCount }} / {{ equipment.length }}</span></header>
      <div class="b3-char-scroll b3-char-gear-list">
        <div v-for="slot in equipment" :key="slot.slot" class="b3-char-gear-drop" :class="{'empty-slot': !slot.item, 'drop-ready': accepts(slot), 'drop-target': dropSlot === slot.slot}" :data-character-slot="slot.slot" @dragover="overSlot(slot, $event)" @dragleave="dropSlot = ''" @drop.prevent.stop="dropOnSlot(slot)">
        <button type="button" class="b3-char-gear" :class="['r-' + slot.rarity, {empty: !slot.item, selected: slot.item && selectedKey === slot.item.key}]" :disabled="!slot.item" :draggable="false" :aria-pressed="!!slot.item && selectedKey === slot.item.key" :aria-label="slot.slotName + '：' + (slot.item ? slot.name + '，T' + slot.tier : '未装备')" @pointerdown.stop="startDrag(slot.item, slot.slot, $event)" @dragstart.prevent
          @pointerenter="!dragged&&$emit('inspect', slot.item, $event)" @pointerleave="$emit('leave', slot.item?.key)" @focus="$emit('inspect', slot.item, $event)" @blur="$emit('leave', slot.item?.key)" @click="selectItem(slot.item, $event)" @contextmenu.prevent.stop="$emit('context', slot.item, $event)">
          <span class="b3-char-gear-icon"><img v-if="slot.item" class="game-icon" :src="slot.icon" alt="" draggable="false"><svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4v6l-8 8-8-8V7l8-4Z" /></svg><small v-if="slot.item">T{{ slot.tier }}</small></span>
          <span class="b3-char-gear-info"><small>{{ slot.slotName }}<span v-if="slot.item"> · {{ slot.rarityName }}</span></small><b>{{ slot.item ? slot.name : '未装备' }}</b></span>
          <span v-if="slot.item" class="b3-char-gear-arrow" aria-hidden="true">›</span>
        </button>
        </div>
      </div>
      <footer class="b3-char-gear-help">悬停查看详情 · Ctrl 固定 · 右键操作</footer>
    </section>

    <section class="b3-char-column b3-char-attributes" aria-label="角色属性">
      <header class="b3-char-column-head"><div><small>实时数值</small><h3>属性</h3></div><span v-if="skill">{{ skill.name }}</span></header>
      <div class="b3-char-scroll">
        <h4 class="b3-char-section-head">基础伤害</h4>
        <dl class="b3-char-values b3-char-base-damage" aria-label="实时基础伤害"><div v-for="d in character.baseDamage" :key="d.element" :class="['e-' + d.element, {'is-zero': !d.amount}]" :title="d.sources || '尚未获得此类基础伤害'"><dt>{{ d.name }}</dt><dd>{{ signed(d.amount) }}</dd></div></dl>
        <template v-if="character.damagePoints.primary.length">
          <h4 class="b3-char-section-head">当前技能伤害</h4>
          <dl class="b3-char-values"><div v-for="d in character.damagePoints.primary" :key="d.key" :title="d.source + ' · ' + d.detail"><dt>{{ d.name }} · {{ d.detail }}</dt><dd>{{ d.amount === null ? '动态' : d.amount }}</dd></div></dl>
        </template>
        <h4 class="b3-char-section-head">基础属性</h4>
        <dl class="b3-char-values"><div v-for="a in character.attributes" :key="a.key" :title="a.note"><dt>{{ a.name }}</dt><dd>{{ a.value }}</dd></div></dl>
        <h4 class="b3-char-section-head">战斗能力</h4>
        <dl class="b3-char-values"><div v-for="c in character.combat" :key="c.key" :title="c.detail"><dt>{{ c.name }}</dt><dd :class="{up: c.delta > 1e-6, down: c.delta < -1e-6}">{{ c.value }}</dd></div></dl>
        <template v-if="character.damage.some(d => d.increased || d.more)">
          <h4 class="b3-char-section-head">伤害加成</h4>
          <dl class="b3-char-values"><div v-for="d in character.damage.filter(d => d.increased || d.more)" :key="d.element"><dt>{{ d.name }}</dt><dd><span v-if="d.increased">{{ d.increased > 0 ? '+' : '' }}{{ d.increased }}%</span><small v-if="d.more"> 额外 {{ d.more > 0 ? '+' : '' }}{{ d.more }}%</small></dd></div></dl>
        </template>
        <h4 class="b3-char-section-head">抗性</h4>
        <dl class="b3-char-values"><div v-for="r in character.resistances" :key="r.element" :title="'当前 ' + r.raw + '% · 上限 ' + r.cap + '%'"><dt>{{ r.name }}抗性</dt><dd>{{ r.value }}%</dd></div></dl>
        <h4 class="b3-char-section-head">生存能力</h4>
        <dl class="b3-char-values"><div v-for="row in character.survival" :key="row.name"><dt>{{ row.name }}</dt><dd>{{ row.value }}</dd></div></dl>
      </div>
    </section>

    <section class="b3-char-column b3-char-traits" aria-label="角色特性">
      <header class="b3-char-column-head"><div><small>技能、装备与天赋效果</small><h3>特性</h3></div><span>{{ character.traits.active }} 项生效</span></header>
      <div class="b3-char-scroll">
        <p v-if="!sources.length" class="b3-char-empty">当前没有特性</p>
        <section v-for="source in sources" :key="source.key" class="b3-char-source" :aria-label="source.name + '的特性'">
          <header :class="'r-' + source.rarity"><img v-if="source.icon" class="game-icon" :src="source.icon" alt="" draggable="false"><span v-else class="b3-char-source-mark" aria-hidden="true">◇</span><b>{{ source.name }}</b><small>{{ source.kind }} · {{ source.rows.length }}</small></header>
          <article v-for="(t, index) in source.rows" :key="t.id + ':' + index" class="b3-char-trait" :class="'is-' + t.state">
            <div><p>{{ t.name }}</p><em v-if="t.remaining !== null">{{ t.remaining.toFixed(1) }}s</em><small v-else-if="t.state !== 'on'" class="b3-char-trait-state">{{ t.state === 'merged' ? '已合并' : '未生效' }}</small></div>
            <p v-if="t.stitched" class="b3-char-stitched">缝合：{{ t.stitched }}</p>
            <p v-if="t.state !== 'on' && t.note" class="b3-char-trait-note">{{ t.note }}</p>
          </article>
        </section>
      </div>
    </section>
  </div><div v-else class="b3-char-loading">等待战斗数据…</div><teleport to="body"><img v-if="dragged" class="b3-char-drag-icon" :src="dragged.item.icon" :style="{left:dragPointer.x+'px',top:dragPointer.y+'px'}" alt="" aria-hidden="true" draggable="false"></teleport>`,
};
