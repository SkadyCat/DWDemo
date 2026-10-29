import {UIRuntime} from '/uicreator/runtime/runtime.js';
import {createPlayerStunProject} from '/uicreator/assets/world-overlays/stun-crust.js';
import {ref,watch,onMounted,onBeforeUnmount} from '/vendor/vue.esm-browser.prod.js';
export function mountStunOverlay(container) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('player-stun-ui');svg.setAttribute('aria-hidden','true');svg.setAttribute('preserveAspectRatio','none');container.replaceChildren(svg);
  return new UIRuntime(svg,createPlayerStunProject(),{sound:false,motion:false});
}
export function updateStunOverlay(container, snapshot) {
  const maxLife = Number.isFinite(snapshot?.maxLife) ? Math.max(0,snapshot.maxLife) : 0;
  // The visible resource is current remaining stun resistance (80 / 80 at
  // full), not the accumulated damage to it (zero at full).
  const remaining = Number.isFinite(snapshot?.remaining) ? Math.max(0,snapshot.remaining) : 0;
  const fraction = maxLife > 0 ? Math.min(1,remaining/maxLife) : 0;
  container.hidden = !snapshot?.enabled || fraction <= 0;
  container.style.clipPath = `inset(0 ${100*(1-fraction)}% 0 0)`;
  container.setAttribute('aria-valuemax',maxLife);container.setAttribute('aria-valuenow',remaining);
  container.dataset.fraction=String(fraction);
}
export const BattleStunOverlay = {
  props: {snapshot:Object},
  setup(props) {
    const root=ref(null);let ui;
    onMounted(()=>{ui=mountStunOverlay(root.value);updateStunOverlay(root.value,props.snapshot);});
    watch(()=>props.snapshot,snapshot=>{if(root.value)updateStunOverlay(root.value,snapshot);});
    onBeforeUnmount(()=>ui?.destroy());
    return {root};
  },
  template:'<div ref="root" class="hb-crust" role="progressbar" aria-label="气血条晕眩" aria-valuemin="0" hidden></div>',
};
