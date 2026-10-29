import { computed, ref, reactive, nextTick, onMounted, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';
import { EQUIPMENT_RARITY_NAMES } from '/engine/equipment.mjs';
import { iconSrc } from '/game-icons.mjs';

export const BattleEquipmentMenu = {
  props: ['item', 'x', 'y', 'price', 'error', 'canSplit', 'canDrop'],
  emits: ['close', 'equip', 'sell', 'identify', 'split', 'drop-ground'],
  template: /* html */ `<teleport to="body">
    <section ref="menu" class="b3-equipment-menu" :class="'r-' + item.rarity" :style="position" role="menu" :aria-label="item.name + '操作菜单'" @pointerdown.stop @contextmenu.prevent @keydown.stop="key">
      <header class="b3-menu-head">
        <img class="b3-menu-icon game-icon" :src="iconSrc(item.kind, item)" alt="" draggable="false">
        <div><b class="b3-menu-name">{{ item.name }}</b><span class="b3-menu-meta">{{ metadata }}</span></div>
      </header>
      <button v-if="item.kind === 'equipment' && item.unidentified" class="b3-menu-equip" type="button" role="menuitem" @click="$emit('identify')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM19 3v4m-2-2h4"/></svg><span>鉴定</span>
      </button>
      <button v-else-if="item.kind === 'equipment'" class="b3-menu-equip" type="button" role="menuitem" @click="$emit('equip')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v16h-6M3 12h12"/><path :d="item.equipped ? 'm7 8-4 4 4 4' : 'm11 8 4 4-4 4'"/></svg><span>{{ item.equipped ? '卸下' : '装备' }}</span>
      </button>
      <button v-if="item.kind === 'equipment'" class="b3-menu-sell" type="button" role="menuitem" :disabled="!!error" :title="error || ''" @click="$emit('sell')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v5c0 1.7 2.7 3 6 3m0-5v5m6-7v2m-9 4v3c0 1.7 2.7 3 6 3"/><ellipse cx="16" cy="13" rx="5" ry="2.5"/><path d="M11 13v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-5"/></svg><span>出售</span>
        <span v-if="!error" class="b3-menu-price"><i class="stone-ico" aria-hidden="true"></i><b>+{{ price }}</b><small>灵石</small></span>
      </button>
      <button v-if="canSplit" type="button" role="menuitem" @click="$emit('split')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V11M12 11 5 4M12 11l7-7M5 10V4h6M19 10V4h-6"/></svg><span>拆分</span><small>×{{ item.count }}</small></button>
      <button v-if="item.kind === 'equipment' || item.kind === 'item'" type="button" role="menuitem" :disabled="!canDrop" @click="$emit('drop-ground')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg><span>丢到地面</span><small v-if="item.count > 1">×{{ item.count }}</small></button>
    </section>
  </teleport>`,
  setup(props, { emit }) {
    const menu = ref(null), position = reactive({ left: '0px', top: '0px', visibility: 'hidden' });
    const metadata = computed(() => [EQUIPMENT_RARITY_NAMES[props.item.rarity], props.item.tier ? 'T' + props.item.tier : '', props.item.unidentified ? '未鉴定' : props.item.equipped ? '已装备' : ''].filter(Boolean).join(' · '));
    const outside = event => { if (!menu.value?.contains(event.target)) emit('close', false); };
    const dismiss = () => emit('close', false);
    function key(event) {
      if (event.key === 'Escape') { event.preventDefault(); emit('close', true); }
      else if (event.key === 'Tab') emit('close', false);
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menu.value.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }
    onMounted(async () => {
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('resize', dismiss);
      window.addEventListener('scroll', dismiss, true);
      await nextTick();
      if (!menu.value) return;
      const rect = menu.value.getBoundingClientRect();
      position.left = Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8)) + 'px';
      position.top = Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8)) + 'px';
      position.visibility = 'visible';
      await nextTick();
      menu.value?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    });
    onBeforeUnmount(() => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    });
    return { menu, position, key, metadata, iconSrc };
  },
};
