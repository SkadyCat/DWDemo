import { motionDefinition, motionClip, sampleMotion, MOTION_IDENTITY } from '../core/motion.js';
import { edgeMotionLayer, removeEdgeMotion } from './edge-motion.js';
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

const transform = f => `translate(${f.x}px, ${f.y}px) rotate(${f.rotation}deg) scale(${f.scaleX}, ${f.scaleY})`;
function currentFrame(layer) {
  const style = getComputedStyle(layer), matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
  const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
  return { x: matrix.e, y: matrix.f, scaleX, scaleY: (matrix.a * matrix.d - matrix.b * matrix.c) / scaleX, rotation: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI, opacity: Number(style.opacity) };
}
// Both players consume the same authored channels and easing. WAAPI owns the web timeline.
export function animateVisual(record, node, state, enabled, visible, assets = {}, size = {}) {
  const armed=node.motion?.enabled!==false;
  if(armed&&!record.motionArmed)record.motionDismissed=false;
  record.motionArmed=armed;
  if(node.motion?.dismissOnHover&&['hovered','pressed'].includes(state))record.motionDismissed=true;
  const asset = enabled && visible && !reducedMotion?.matches && !record.motionDismissed ? motionDefinition(node, assets) : null;
  const key = JSON.stringify([asset, state, asset?.target === 'edge' ? [node.motion?.tint, size.width, size.height] : null]);
  if (key === record.motionKey) return;
  const previous = record.motionState;
  record.motionKey = key; record.motionState = state;
  const clip = motionClip(asset, state, previous), edge = asset?.target === 'edge';
  const layers = edge ? [] : asset?.target === 'visual' ? [record.visual] : [record.visual, record.children];
  const starts = clip && record.motionAnimations?.length ? layers.map(currentFrame) : layers.map(() => ({ ...MOTION_IDENTITY }));
  stopVisual(record);
  if (!clip || typeof record.visual.animate !== 'function') return;
  if (edge) {
    const layer = edgeMotionLayer(record, asset, node, size);
    const offsets=new Set([0,1]);for(let i=1;i<clip.keyframes.length;i++){const a=clip.keyframes[i-1].t,b=clip.keyframes[i].t;for(let j=0;j<=32;j++)offsets.add(a+(b-a)*j/32);}
    record.motionAnimations = [layer.animate([...offsets].sort((a,b)=>a-b).map(offset=>{const frame=sampleMotion({...clip,loop:false},offset*clip.duration);return{offset,transform:`rotate(${frame.rotation}deg)`,opacity:frame.opacity};}),
      { duration: clip.duration, iterations: clip.loop ? Infinity : 1, easing: 'linear', fill: 'forwards' })];
    return;
  }
  record.motionAnimations = layers.map((layer, index) => {
    layer.style.transformBox = 'view-box'; layer.style.transformOrigin = `${(size.width || 0) / 2}px ${(size.height || 0) / 2}px`;
    layer.setAttribute('data-motion-layer', '');
    const offsets = new Set([0, 1]);
    for (let i = 1; i < clip.keyframes.length; i++) {
      const a = clip.keyframes[i - 1].t, b = clip.keyframes[i].t, count = clip.easing === 'linear' ? 1 : 32;
      for (let j = 0; j <= count; j++) offsets.add(a + (b - a) * j / count);
    }
    const frames = [...offsets].sort((a, b) => a - b).map(offset => {
      const frame = sampleMotion({ ...clip, loop: false }, offset * clip.duration, starts[index]);
      return { offset, transform: transform(frame), opacity: frame.opacity };
    });
    return layer.animate(frames, { duration: clip.duration, iterations: clip.loop ? Infinity : 1, easing: 'linear', fill: 'forwards' });
  });
}

export function stopVisual(record) {
  for (const animation of record.motionAnimations || []) animation.cancel();
  record.motionAnimations = [];
  removeEdgeMotion(record);
  for (const layer of [record.visual, record.children]) {
    layer.style.removeProperty('transform-box'); layer.style.removeProperty('transform-origin');
    layer.removeAttribute('data-motion-layer');
    if (!layer.getAttribute('style')) layer.removeAttribute('style');
  }
}
