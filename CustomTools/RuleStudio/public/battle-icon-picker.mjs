import { ref, computed, onBeforeUnmount } from '/vendor/vue.esm-browser.prod.js';

// Presentation only. The battle controller supplies the actually owned choices.
export const BattleIconPicker = {
  props: { id: String, label: String, choices: Array, current: String, mode: String },
  emits: ['choose', 'close', 'release', 'shortcut'],
  setup(props, { emit }) {
    const hovered = ref(null), position = ref({}), root = ref(null);
    const columns = computed(() => 5);
    const placeholders = computed(() => props.choices.length ? (5 - props.choices.length % 5) % 5 : 5);
    function hide() { hovered.value = null; }
    function hold() { emit('release'); }
    function leave() { hide(); }
    function show(choice, event) {
      hold(); hovered.value = choice;
      const rect = event.currentTarget.getBoundingClientRect(), palette = root.value.getBoundingClientRect(), width = Math.min(264, innerWidth - 24);
      position.value = { left: Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)) + 'px', bottom: innerHeight - palette.top + 8 + 'px', maxHeight: Math.max(80, palette.top - 20) + 'px' };
    }
    function key(event) {
      event.stopPropagation();
      if (event.code === 'Escape') { event.preventDefault(); emit('close'); return; }
      const buttons = [...root.value.querySelectorAll('[data-picker-choice]')], index = buttons.indexOf(event.target);
      const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns.value, ArrowUp: -columns.value }[event.code];
      if (index >= 0 && offset !== undefined) { event.preventDefault(); buttons[(index + offset + buttons.length) % buttons.length]?.focus(); }
      else if (index >= 0 && ['Home', 'End'].includes(event.code)) { event.preventDefault(); buttons[event.code === 'Home' ? 0 : buttons.length - 1]?.focus(); }
      else emit('shortcut', event);
    }
    onBeforeUnmount(hide);
    return { root, hovered, position, columns, placeholders, show, hide, hold, leave, key };
  },
  template: /* html */ `<section ref="root" :id="id" class="b3-skill-picker b3-icon-picker" role="dialog" :aria-label="label" :style="{'--picker-columns':columns}" @pointerenter="$emit('release')" @pointerdown.stop @pointermove.stop @wheel.stop @keydown="key">
    <div class="b3-picker-tools">
      <button type="button" class="b3-picker-tool" :disabled="!current" aria-label="清空此槽" @click="$emit('choose',null)" @pointerenter="show({name:'清空此槽',description:current?'移除此槽的配置，技能和物品会保留。':'当前槽位为空。'},$event)" @pointerleave="leave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 14 9-9 7 7-7 7H9Zm5 5-5-5m6-6 7 7M14 19h7"/></svg></button>
      <button type="button" class="b3-picker-tool" aria-label="关闭选择" @click="$emit('close')" @pointerenter="show({name:'关闭选择',description:'Esc 返回战斗'},$event)" @pointerleave="leave"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>
    <div class="b3-picker-icon-grid">
      <button v-for="choice in choices" :key="choice.binding" type="button" data-picker-choice :data-skill-choice="mode==='skill'?'':undefined" :data-belt-choice="mode==='belt'?'':undefined" :data-belt-binding="mode==='belt'?choice.binding:undefined" :aria-label="'装配'+choice.name" :aria-pressed="current===choice.binding" :aria-describedby="hovered?.binding===choice.binding?id+'-tip':undefined" @click="$emit('choose',choice.binding)" @pointerenter="show(choice,$event)" @pointerleave="leave">
        <img :src="choice.icon" alt="" draggable="false"><svg v-if="current===choice.binding" class="b3-picker-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>
      </button>
      <div v-for="index in placeholders" :key="'empty-'+index" class="b3-picker-placeholder" aria-hidden="true"></div>
      <p v-if="!choices.length" class="b3-picker-empty">暂无可用{{mode==='skill'?'技能':'光环或药剂'}}</p>
    </div>
    <Teleport to="body"><section v-if="hovered" :id="id+'-tip'" class="b3-picker-hover" role="tooltip" :style="position">
      <header><img v-if="hovered.icon" :src="hovered.icon" alt=""><div><b>{{hovered.name}}</b><small v-if="hovered.category">{{hovered.category}}</small></div></header>
      <p v-if="hovered.description">{{hovered.description}}</p>
      <dl v-if="hovered.notes?.length"><div v-for="row in hovered.notes" :key="row.label"><dt>{{row.label}}</dt><dd>{{row.value}}</dd></div></dl>
      <footer v-if="hovered.binding">{{current===hovered.binding?'已装配到当前槽':'点击图标装配'}}</footer>
    </section></Teleport>
  </section>`,
};
