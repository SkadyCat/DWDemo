export const MOTION_PRESETS = ['auto', 'subtle', 'lively', 'breathe', 'none'];
export const MOTION_EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'backOut'];
export const MOTION_CHANNELS = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];
export const MOTION_IDENTITY = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
export const motionFrame = (t, values = {}) => ({ t, ...MOTION_IDENTITY, ...values });
export function createEdgeMotionAsset(id = 'motion-edge-orbit', name = '提示 · 边缘流光') {
  return { id, name, version: 1, folderId: '', target: 'edge', edge: { width: 1.5, radius: 9, color: '#ffffff' },
    bindings: { normal: 'orbit', hovered: 'off', pressed: 'off', disabled: 'off' }, clips: {
      orbit: { duration: 2600, loop: true, fromCurrent: false, easing: 'linear', keyframes: [motionFrame(0), motionFrame(1, { rotation: 360 })] },
      off: { duration: 1, loop: false, fromCurrent: false, easing: 'linear', keyframes: [motionFrame(0, { opacity: 0 }), motionFrame(1, { opacity: 0 })] },
    } };
}
export function createMotionAsset(id, name = '新动效') {
  return { id, name, version: 1, folderId: '', target: 'content', bindings: { normal: 'rest', hovered: 'hover', pressed: 'press', 'pressed>hovered': 'release' }, clips: {
    rest: { duration: 190, loop: false, fromCurrent: true, easing: 'easeOut', keyframes: [motionFrame(0), motionFrame(1)] },
    hover: { duration: 160, loop: false, fromCurrent: true, easing: 'easeOut', keyframes: [motionFrame(0), motionFrame(1, { y: -3, scaleX: 1.045, scaleY: 1.045 })] },
    press: { duration: 70, loop: false, fromCurrent: true, easing: 'easeOut', keyframes: [motionFrame(0), motionFrame(1, { y: 1, scaleX: .94, scaleY: .94 })] },
    release: { duration: 240, loop: false, fromCurrent: true, easing: 'backOut', keyframes: [motionFrame(0), motionFrame(1, { y: -3, scaleX: 1.045, scaleY: 1.045 })] },
  } };
}
export function builtinMotions() {
  const lively = createMotionAsset('motion-lively', '灵动 · 抬起与回弹'), subtle = createMotionAsset('motion-subtle', '轻量 · 按钮反馈');
  for (const key of ['hover', 'release']) Object.assign(subtle.clips[key].keyframes[1], { y: -1, scaleX: 1.018, scaleY: 1.018 });
  Object.assign(subtle.clips.press.keyframes[1], { scaleX: .98, scaleY: .98 });
  const breathe = { id: 'motion-breathe', name: '辉光 · 呼吸', version: 1, folderId: '', target: 'visual', bindings: { normal: 'pulse' }, clips: { pulse: { duration: 1900, loop: true, fromCurrent: false, easing: 'easeInOut', keyframes: [motionFrame(0), motionFrame(.5, { scaleX: 1.025, scaleY: 1.025, opacity: .68 }), motionFrame(1)] } } };
  return Object.fromEntries([lively, subtle, breathe, createEdgeMotionAsset()].map(asset => [asset.id, asset]));
}
const defaults = builtinMotions();
// Legacy presets are resolved only at the authoring/export boundary. Both players consume clips.
export function motionAssetId(node) {
  if (node.motion?.preset === 'none') return '';
  if (node.motion?.assetId) return node.motion.assetId;
  const spec = motionSpec(node.interactable === false ? { ...node, interactable: true } : node);
  return !spec ? '' : spec.kind === 'breathe' ? 'motion-breathe' : spec.hoverScale > 1.02 ? 'motion-lively' : 'motion-subtle';
}
export function motionDefinition(node, assets = {}) { const id = motionAssetId(node); return node.motion?.enabled === false ? null : id ? assets[id] || defaults[id] || null : null; }
export function materializeMotionAssets(project) {
  project.motions ||= {};
  const visit = node => {
    const id = motionAssetId(node); if (id) { if (defaults[id]) project.motions[id] ||= structuredClone(defaults[id]); node.motion = { ...node.motion, preset: 'auto', assetId: id }; }
    for (const patch of Object.values(node.overrides || {})) if (patch.motion && ['subtle', 'lively', 'breathe'].includes(patch.motion.preset) && !patch.motion.assetId) { patch.motion.assetId = `motion-${patch.motion.preset}`; patch.motion.preset = 'auto'; project.motions[patch.motion.assetId] ||= structuredClone(defaults[patch.motion.assetId]); }
    for (const child of node.children || []) visit(child);
  };
  visit(project.root); for (const prefab of Object.values(project.prefabs || {})) visit(prefab.root);
  return project;
}
export function motionClip(asset, state = 'normal', previous = '') { const name = asset?.bindings?.[`${previous}>${state}`] || asset?.bindings?.[state]; return asset?.clips?.[name] || null; }
export function easeMotion(t, easing) {
  if (t === 0 || t === 1) return t;
  if (easing === 'easeIn') return t ** 3;
  if (easing === 'easeOut') return 1 - (1 - t) ** 3;
  if (easing === 'easeInOut') return .5 - .5 * Math.cos(Math.PI * t);
  if (easing === 'backOut') { const p = t - 1; return 1 + 2.3 * p ** 3 + 1.3 * p ** 2; }
  return t;
}
export function sampleMotion(clip, elapsed, start = null) {
  const progress = clip.loop ? ((elapsed / clip.duration) % 1 + 1) % 1 : Math.max(0, Math.min(1, elapsed / clip.duration));
  const frames = clip.keyframes;
  let i = frames.findIndex((f, index) => index && f.t >= progress); if (i < 1) i = frames.length - 1;
  const a = i === 1 && clip.fromCurrent && start ? { ...frames[0], ...start } : frames[i - 1], b = frames[i];
  const t = easeMotion(Math.max(0, Math.min(1, (progress - a.t) / (b.t - a.t))), clip.easing);
  return Object.fromEntries(MOTION_CHANNELS.map(key => [key, a[key] + (b[key] - a[key]) * t]));
}
export function validateMotionAsset(asset, id = asset?.id) {
  const errors = [], fail = text => errors.push(`动效 ${asset?.name || id}: ${text}`);
  if (!asset || asset.id !== id || !/^[a-zA-Z0-9_-]{1,160}$/.test(id || '') || asset.version !== 1 || typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > 240) return ['动效资产身份或版本无效'];
  if (!['visual', 'content', 'edge'].includes(asset.target)) fail('目标图层无效');
  if (asset.target === 'edge' && (!asset.edge || !Number.isFinite(asset.edge.width) || asset.edge.width <= 0 || asset.edge.width > 16 || !Number.isFinite(asset.edge.radius) || asset.edge.radius < 0 || asset.edge.radius > 256 || !/^#[0-9a-f]{6}$/i.test(asset.edge.color || ''))) fail('边缘参数无效：宽度 0–16、圆角 0–256、颜色 #RRGGBB');
  if (!asset.clips || typeof asset.clips !== 'object' || Array.isArray(asset.clips) || !Object.keys(asset.clips).length || Object.keys(asset.clips).length > 32) return [...errors, '动效需要 1–32 个片段'];
  for (const [name, clip] of Object.entries(asset.clips)) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name) || !clip || !Number.isFinite(clip.duration) || clip.duration < 1 || clip.duration > 600000 || !MOTION_EASINGS.includes(clip.easing) || typeof clip.loop !== 'boolean' || typeof clip.fromCurrent !== 'boolean') { fail(`片段 ${name} 参数无效`); continue; }
    if (!Array.isArray(clip.keyframes) || clip.keyframes.length < 2 || clip.keyframes.length > 64) { fail(`片段 ${name} 需要 2–64 个关键帧`); continue; }
    let last = -1;
    for (const frame of clip.keyframes) {
      if (!frame || !Number.isFinite(frame.t) || frame.t <= last || frame.t < 0 || frame.t > 1 || !MOTION_CHANNELS.every(key => Number.isFinite(frame[key])) || frame.scaleX <= 0 || frame.scaleY <= 0 || frame.opacity < 0 || frame.opacity > 1) fail(`片段 ${name} 关键帧无效`);
      last = frame?.t;
    }
    if (clip.keyframes[0]?.t !== 0 || clip.keyframes.at(-1)?.t !== 1) fail(`片段 ${name} 必须从 0 到 1`);
  }
  if (!asset.bindings || typeof asset.bindings !== 'object' || Array.isArray(asset.bindings)) fail('缺少事件绑定');
  else for (const [event, name] of Object.entries(asset.bindings)) if (!/^[a-zA-Z0-9_>\-]{1,100}$/.test(event) || !Object.hasOwn(asset.clips, name)) fail(`事件 ${event} 引用了缺失片段`);
  return errors;
}

export function motionSpec(node) {
  const preset = node.motion?.preset || 'auto';
  if (preset === 'none' || (node.type === 'Button' && node.interactable === false)) return null;
  if (preset === 'breathe' || (preset === 'auto' && node.id?.endsWith('hud-ability-selected'))) {
    return { kind: 'breathe', duration: 1900, minOpacity: .68, maxScale: 1.025 };
  }
  if (node.type !== 'Button') return null;
  const lively = preset === 'lively' || (preset === 'auto' && (['ability', 'consumable'].includes(node.binding) || /hud-(ability|quick)-button$/.test(node.id)));
  return { kind: 'button', hoverScale: lively ? 1.045 : 1.018, hoverLift: lively ? -3 : -1, pressScale: lively ? .94 : .98, enter: 160, leave: 190, press: 70, release: 240 };
}

export function motionTarget(spec, state) {
  if (state === 'pressed') return { transform: `translateY(1px) scale(${spec.pressScale})` };
  if (state === 'hovered') return { transform: `translateY(${spec.hoverLift}px) scale(${spec.hoverScale})` };
  return { transform: 'translateY(0px) scale(1)' };
}
