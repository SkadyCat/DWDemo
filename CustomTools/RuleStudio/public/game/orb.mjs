// 血魔球：画布绘制的液体球——两层错相的波面、流动的光雾、上升的气泡、受伤后缓慢回落的残影、
// 玻璃的内阴影与高光，外面一圈能量护盾（玉色）与鎏金球框（SVG）。低血时球框呼吸泛红。
import { ref, computed, watch, onMounted, onBeforeUnmount } from '../vendor/vue.esm-browser.prod.js';

const THEMES = {
  life: { top: '#ff6a52', mid: '#b5121f', low: '#3e0207', glow: 'rgba(255, 90, 70, .55)', mist: 'rgba(255, 170, 140, .22)', surf: 'rgba(255, 210, 190, .75)', ghost: 'rgba(255, 236, 220, .16)', bubble: 'rgba(255, 200, 180, .5)' },
  mana: { top: '#7cc4ff', mid: '#1f46c4', low: '#070f45', glow: 'rgba(90, 150, 255, .5)', mist: 'rgba(170, 210, 255, .22)', surf: 'rgba(210, 236, 255, .8)', ghost: 'rgba(220, 238, 255, .15)', bubble: 'rgba(200, 228, 255, .55)' },
};

export const LiquidOrb = {
  props: { kind: { type: String, default: 'life' }, value: Number, max: Number, es: { type: Number, default: 0 }, esMax: { type: Number, default: 0 }, label: String, side: { type: String, default: 'left' } },
  setup(props) {
    const el = ref(null);
    const frac = computed(() => Math.max(0, Math.min(1, props.value / Math.max(1, props.max))));
    const esFrac = computed(() => props.esMax > 0 ? Math.max(0, Math.min(1, props.es / props.esMax)) : 0);
    const low = computed(() => props.kind === 'life' && frac.value < 0.3);
    let raf = 0, shown = 1, ghost = 1, ghostHold = 0, lastTarget = 1, last = 0, bubbles = [];
    const T = () => THEMES[props.kind] ?? THEMES.life;

    function draw(now) {
      const c = el.value; if (!c) return;
      const t = now / 1000, rdt = last ? Math.min(0.25, t - last) : 0, dt = Math.min(0.05, rdt); last = t;
      const dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth;
      if (c.width !== Math.round(W * dpr)) { c.width = c.height = Math.round(W * dpr); }
      const ctx = c.getContext('2d'), S = c.width, cx = S / 2, cy = S / 2, R = S * 0.42, th = T();
      // The level eases toward the target; a damage "ghost" waits a moment, then drains.
      const target = frac.value;
      shown += (target - shown) * Math.min(1, rdt * 10);
      if (target < ghost - 0.002) {
        // A fresh hit restarts the short pause; after it the ghost drains toward the real level.
        if (target < lastTarget - 0.002) ghostHold = 0.45;
        ghostHold -= rdt;
        if (ghostHold <= 0) ghost += (target - ghost) * Math.min(1, rdt * 4);
      } else { ghost = target; ghostHold = 0; }
      lastTarget = target;
      ctx.clearRect(0, 0, S, S);

      // energy shield ring (outside the glass)
      if (props.esMax > 0) {
        ctx.save(); ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(127, 224, 200, .15)'; ctx.lineWidth = S * 0.028;
        ctx.beginPath(); ctx.arc(cx, cy, R + S * 0.045, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#7fe0c8'; ctx.shadowColor = '#7fe0c8'; ctx.shadowBlur = S * 0.05;
        ctx.beginPath(); ctx.arc(cx, cy, R + S * 0.045, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * esFrac.value); ctx.stroke();
        ctx.restore();
      }

      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      // empty glass: deep, slightly tinted
      const bg = ctx.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R);
      bg.addColorStop(0, '#0c1222'); bg.addColorStop(1, '#010206');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);

      const surface = (lvl, amp, phase) => {
        const y0 = cy + R - 2 * R * lvl;
        ctx.beginPath(); ctx.moveTo(cx - R - 2, S);
        for (let x = -R - 2; x <= R + 2; x += S / 60) {
          const y = y0 + Math.sin(x / R * 3.2 + t * 2.1 + phase) * amp + Math.sin(x / R * 5.7 - t * 1.4 + phase * 2) * amp * 0.45;
          ctx.lineTo(cx + x, y);
        }
        ctx.lineTo(cx + R + 2, S); ctx.closePath();
      };
      const amp = R * 0.035 * (shown > 0.02 && shown < 0.98 ? 1 : 0.3);
      // damage ghost: a pale band between the old and the new level
      if (ghost > shown + 0.003) { surface(ghost, amp, 0.6); ctx.fillStyle = th.ghost; ctx.fill(); }
      // back wave (darker), then the main liquid
      surface(shown, amp * 1.1, 2.2); ctx.fillStyle = th.low; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      surface(shown, amp, 0);
      const lg = ctx.createLinearGradient(0, cy - R, 0, cy + R);
      lg.addColorStop(0, th.top); lg.addColorStop(0.5, th.mid); lg.addColorStop(1, th.low);
      ctx.fillStyle = lg; ctx.fill();
      // inside the liquid: drifting light mist and rising bubbles
      ctx.save(); ctx.clip();
      for (let i = 0; i < 3; ++i) {
        const mx = cx + Math.sin(t * (0.35 + i * 0.17) + i * 2) * R * 0.45, my = cy + R * 0.25 + Math.cos(t * (0.27 + i * 0.11) + i) * R * 0.35;
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, R * (0.45 + i * 0.12));
        mg.addColorStop(0, th.mist); mg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = mg; ctx.fillRect(0, 0, S, S);
      }
      if (bubbles.length < 14 && Math.random() < dt * 9) bubbles.push({ x: (Math.random() * 1.4 - 0.7) * R, y: R, r: (0.012 + Math.random() * 0.025) * S, v: (0.25 + Math.random() * 0.4) * R, w: Math.random() * 6 });
      ctx.fillStyle = th.bubble;
      for (const b of bubbles) {
        b.y -= b.v * dt;
        ctx.beginPath(); ctx.arc(cx + b.x + Math.sin(t * 3 + b.w) * R * 0.03, cy + b.y, b.r, 0, Math.PI * 2); ctx.fill();
      }
      bubbles = bubbles.filter(b => cy + b.y > cy + R - 2 * R * shown + amp * 2);
      ctx.restore();
      // the bright surface line
      if (shown > 0.01 && shown < 0.995) {
        const y0 = cy + R - 2 * R * shown;
        ctx.beginPath();
        for (let x = -R; x <= R; x += S / 60) { const y = y0 + Math.sin(x / R * 3.2 + t * 2.1) * amp + Math.sin(x / R * 5.7 - t * 1.4) * amp * 0.45; x === -R ? ctx.moveTo(cx + x, y) : ctx.lineTo(cx + x, y); }
        ctx.strokeStyle = th.surf; ctx.lineWidth = S * 0.008; ctx.shadowColor = th.surf; ctx.shadowBlur = S * 0.03; ctx.stroke(); ctx.shadowBlur = 0;
      }
      // glass: rim shading, a soft specular and a small hot spot
      const rim = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
      rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.85, 'rgba(0,0,0,.35)'); rim.addColorStop(1, 'rgba(0,0,0,.75)');
      ctx.fillStyle = rim; ctx.fillRect(0, 0, S, S);
      const sp = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.45, 0, cx - R * 0.32, cy - R * 0.45, R * 0.6);
      sp.addColorStop(0, 'rgba(255,255,255,.26)'); sp.addColorStop(0.5, 'rgba(255,255,255,.04)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sp; ctx.beginPath(); ctx.ellipse(cx - R * 0.2, cy - R * 0.48, R * 0.5, R * 0.26, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(cx - R * 0.42, cy - R * 0.52, R * 0.07, R * 0.045, -0.6, 0, Math.PI * 2); ctx.fill();
      const br = ctx.createLinearGradient(0, cy + R * 0.55, 0, cy + R);
      br.addColorStop(0, 'rgba(255,255,255,0)'); br.addColorStop(1, 'rgba(255,255,255,.12)');
      ctx.fillStyle = br; ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.82, R * 0.62, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      raf = requestAnimationFrame(draw);
    }
    onMounted(() => { shown = ghost = lastTarget = frac.value; raf = requestAnimationFrame(draw); });
    onBeforeUnmount(() => cancelAnimationFrame(raf));
    watch(() => props.kind, () => { bubbles = []; });
    return { el, frac, esFrac, low };
  },
  template: /* html */ `
  <div class="lorb" :class="['k-' + kind, 's-' + side, { low }]">
    <svg class="lorb-frame" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient :id="'gf-' + kind" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset=".35" stop-color="#d8b46a"/><stop offset=".7" stop-color="#7a5a26"/><stop offset="1" stop-color="#e8c880"/></linearGradient>
        <radialGradient :id="'gem-' + kind" cx=".35" cy=".3"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" :stop-color="kind === 'life' ? '#ff6a52' : '#7cc4ff'"/><stop offset="1" :stop-color="kind === 'life' ? '#5a0610' : '#0a1a5a'"/></radialGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill="none" :stroke="'url(#gf-' + kind + ')'" stroke-width="3"/>
      <circle cx="100" cy="100" r="86" fill="none" stroke="#0a0f1e" stroke-width="5"/>
      <circle cx="100" cy="100" r="84" fill="none" :stroke="'url(#gf-' + kind + ')'" stroke-width="1.2" opacity=".8"/>
      <g :stroke="'url(#gf-' + kind + ')'" stroke-width="1.4" opacity=".75">
        <line v-for="a in 24" :key="a" x1="100" y1="5" x2="100" :y2="a % 6 === 0 ? 13 : 10" :transform="'rotate(' + a * 15 + ' 100 100)'"/>
      </g>
      <path d="M100 0 L108 12 L100 24 L92 12 Z" :fill="'url(#gf-' + kind + ')'"/>
      <circle cx="100" cy="12" r="5" :fill="'url(#gem-' + kind + ')'"/>
      <path :d="side === 'left' ? 'M188 100 C200 92 212 92 226 100 C212 108 200 108 188 100 Z' : 'M12 100 C0 92 -12 92 -26 100 C-12 108 0 108 12 100 Z'" :fill="'url(#gf-' + kind + ')'" opacity=".85"/>
    </svg>
    <canvas ref="el" class="lorb-canvas"></canvas>
    <div class="lorb-text"><small>{{ label }}</small><b>{{ Math.round(value) }}</b><em>/ {{ Math.round(max) }}</em><i v-if="esMax > 0">护盾 {{ Math.round(es) }}</i></div>
  </div>`,
};
