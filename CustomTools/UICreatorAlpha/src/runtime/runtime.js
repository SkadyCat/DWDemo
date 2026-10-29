import { expandDocument } from '../core/prefabs.js';
import { computeLayout } from '../core/layout.js';
import { SvgRenderer, measureText } from '../render/svg-renderer.js';
import { clone, merge, indexTree, createNode, validateDocument, walk } from '../core/model.js';
import { UiAudioPlayer } from './audio.js';
import { builtinSounds } from '../assets/ui-sounds.js';

// Embeddable event-driven runtime. No editor UI, polling timer or animation loop.
export class UIRuntime extends EventTarget {
  constructor(svg, project, { prefabId = null, width, height, motion = true, sound = true, audioPlayer = null } = {}) {
    super(); this.svg = svg; this.project = { ...project, sounds: { ...builtinSounds(), ...project.sounds } }; this.prefabId = prefabId; this.width = width; this.height = height;
    this.ownsAudio = !audioPlayer; this.audioPlayer = sound ? audioPlayer || new UiAudioPlayer({ onPlay: detail => this.dispatchEvent(new CustomEvent('sound', { detail })), onError: error => this.dispatchEvent(new CustomEvent('sounderror', { detail: error.message })) }) : null;
    this.states = new Map(); this.patches = new Map(); this.mounts = new Map(); this.renderer = new SvgRenderer(svg); this.events = new AbortController();
    this.motion = motion;
    const options = { signal: this.events.signal };
    svg.addEventListener('pointerdown', () => { void this.audioPlayer?.unlock(); }, options);
    svg.addEventListener('keydown', () => { void this.audioPlayer?.unlock(); }, options);
    svg.addEventListener('pointerdown',e=>{
      const id=e.target.closest?.('[data-scrollbar]')?.getAttribute('data-scrollbar'),entry=this.layout?.entries.get(id);if(!entry||e.button!==0)return;
      const extent=Math.max(entry.height,...entry.paintChildren.map(key=>{const child=this.layout.entries.get(key);return child.y+child.height+(entry.node.layout.scrollOffset||0);}));
      const rect=svg.getBoundingClientRect(),scale=rect.height/this.layout.height*(entry.globalHeight/entry.height);
      this.scrolling={id,start:e.clientY,offset:entry.node.layout.scrollOffset||0,ratio:(extent-entry.height)/Math.max(1,entry.height-Math.max(24,entry.height*entry.height/extent))/scale,max:extent-entry.height};e.preventDefault();e.stopImmediatePropagation();
    },options);
    window.addEventListener('pointermove',e=>{const s=this.scrolling;if(s)this.set(s.id,{layout:{scrollOffset:Math.max(0,Math.min(s.max,s.offset+(e.clientY-s.start)*s.ratio))}});},options);
    window.addEventListener('pointerup',()=>{this.scrolling=null;},options);
    const button = target => target.closest?.('[data-node-type="Button"]')?.getAttribute('data-node-id');
    const state = (event, value) => { const id = button(event.target); if (id && this.layout.entries.get(id)?.node.interactable !== false) { const previous = this.states.get(id) || 'normal'; this.states.set(id, value); this.paint(); if (previous !== value) void this.playSound(id, value); } };
    svg.addEventListener('pointerover', e => { const a = button(e.target), b = button(e.relatedTarget || {}); if (a && a !== b) state(e, 'hovered'); }, options);
    svg.addEventListener('pointerout', e => { const a = button(e.target), b = button(e.relatedTarget || {}); if (a && a !== b) { this.states.delete(a); this.paint(); void this.playSound(a, 'unhovered'); } }, options);
    svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; state(e, 'pressed'); this.pressedId = button(e.target); }, options);
    window.addEventListener('pointerup', e => {
      const id = this.pressedId; if (!id) return; this.pressedId = null;
      const same = button(e.target) === id; this.states.set(id, same ? 'hovered' : 'normal'); this.paint();
      void this.playSound(id, 'released');
      if (same && this.layout.entries.get(id)?.node.interactable !== false) { void this.playSound(id, 'clicked'); this.dispatchEvent(new CustomEvent('activate', { detail: { id, node: this.layout.entries.get(id).node } })); }
    }, options);
    svg.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key) && button(e.target)) { e.preventDefault(); if (!e.repeat) { this.keyPressedId = button(e.target); state(e, 'pressed'); } } }, options);
    svg.addEventListener('keyup', e => {
      const id = button(e.target);
      if (id && id === this.keyPressedId && ['Enter', ' '].includes(e.key) && this.layout.entries.get(id)?.node.interactable !== false) {
        this.keyPressedId = null; e.preventDefault(); state(e, 'hovered'); void this.playSound(id, 'released'); void this.playSound(id, 'clicked'); this.dispatchEvent(new CustomEvent('activate', { detail: { id, node: this.layout.entries.get(id).node } }));
      }
    }, options);
    window.addEventListener('blur', () => { this.pressedId = this.keyPressedId = null; this.states.clear(); this.paint(); }, options);
    svg.addEventListener('pointercancel', () => { this.pressedId = this.keyPressedId = null; this.states.clear(); this.paint(); }, options);
    svg.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) return;
      const id = e.target.closest?.('[data-node-type="ScrollBox"]')?.getAttribute('data-node-id'), node = this.nodes.get(id);
      if (node) {
        const entry = this.layout.entries.get(id), content = Math.max(0, ...entry.paintChildren.map(key => { const child = this.layout.entries.get(key); return child.y + child.height + node.layout.scrollOffset; }));
        e.preventDefault(); this.set(id, { layout: { scrollOffset: Math.max(0, Math.min(Math.max(0, content - entry.height), node.layout.scrollOffset + e.deltaY)) } });
      }
    }, { ...options, passive: false });
    this.render();
  }
  paint() {
    if (!this.expanded) return;
    this.renderer.render(this.expanded.document, this.layout, { states: this.states, motion: this.motion });
    const visible = new Map([...this.layout.entries].map(([id, e]) => [id, { visible: e.visible, node: e.node }]));
    if (this.previousVisibility) {
      for (const [id, current] of visible) if (current.visible && !this.previousVisibility.get(id)?.visible) void this.audioPlayer?.play(current.node, 'opened', this.project.sounds);
      for (const [id, previous] of this.previousVisibility) if (previous.visible && !visible.get(id)?.visible) void this.audioPlayer?.play(previous.node, 'closed', this.project.sounds);
    }
    this.previousVisibility = visible; this.dispatchEvent(new Event('paint'));
  }
  playSound(id, event) { const entry = this.layout?.entries.get(id); if (!entry || (!entry.visible && event !== 'closed')) return Promise.resolve(false); return this.audioPlayer?.play(entry.node, event, this.project.sounds) || Promise.resolve(false); }
  render(width = this.width, height = this.height) {
    this.width = width; this.height = height;
    let source = this.project;
    if (this.prefabId) {
      const prefab = this.project.prefabs[this.prefabId]; if (!prefab) throw new Error(`Missing prefab ${this.prefabId}`);
      source = { ...source, root: prefab.root, viewport: { width: prefab.width, height: prefab.height, background: 'transparent' } };
    }
    const expanded = expandDocument(source); this.expanded = expanded;
    // Runtime lists expand the same prefab format as authored instances. Their nodes belong
    // only to this view; neither the persisted scene nor the shared prefab is rewritten.
    for (const [id, holder] of this.mounts) {
      const target = indexTree(expanded.document.root).nodes.get(id); if (!target) continue;
      const fragment = expandDocument({ ...this.project, root: holder }); target.children = fragment.document.root.children;
      for (const [key, origin] of fragment.origins) if (key !== holder.id) expanded.origins.set(key, origin);
    }
    const nodes = indexTree(expanded.document.root).nodes; this.nodes = nodes;
    for (const [id, patch] of this.patches) if (nodes.has(id)) merge(nodes.get(id), patch);
    this.layout = computeLayout(expanded.document, { width, height, measureText });
    this.paint();
  }
  set(id, patch) {
    this.setMany([[id, patch]]);
  }
  setMany(updates) {
    const allowed = ['name', 'text', 'style', 'layout', 'slot', 'visibility', 'value', 'interactable', 'brushes', 'svgAsset', 'motion', 'audio'];
    const prepared = [...updates].map(([id, patch]) => {
      if (!this.nodes.has(id)) throw new Error(`Unknown runtime node ${id}`);
      const safe = {}; for (const key of allowed) if (patch[key] !== undefined) safe[key] = clone(patch[key]);
      return [id, safe];
    });
    for (const [id, safe] of prepared) this.patches.set(id, merge(this.patches.get(id) || {}, safe));
    if (prepared.length) this.render();
  }
  setChildren(id, children) {
    const target = this.nodes.get(id);
    if (!target || !['CanvasPanel', 'Overlay', 'HorizontalBox', 'VerticalBox', 'ScrollBox'].includes(target.type)) throw new Error('Runtime list requires a panel');
    const holder = createNode('CanvasPanel', { children: clone(children) });
    const errors = validateDocument({ ...this.project, root: holder }); if (errors.length) throw new Error(errors[0]);
    const fragment = expandDocument({ ...this.project, root: holder }), previousIds = new Set();
    for (const child of target.children) walk(child, n => previousIds.add(n.id));
    for (const node of indexTree(fragment.document.root).nodes.values()) if (node.id !== holder.id && this.nodes.has(node.id) && !previousIds.has(node.id)) throw new Error(`Runtime node collision: ${node.id}`);
    for (const key of previousIds) { this.patches.delete(key); this.states.delete(key); }
    this.mounts.set(id, holder); this.render();
    for (const key of this.patches.keys()) if (!this.nodes.has(key)) this.patches.delete(key);
    for (const key of this.states.keys()) if (!this.nodes.has(key)) this.states.delete(key);
  }
  setText(id, text) { this.set(id, { text: String(text) }); }
  setValue(id, value) { this.set(id, { value: Math.max(0, Math.min(1, Number(value) || 0)) }); }
  destroy() { this.events.abort(); if (this.ownsAudio) this.audioPlayer?.destroy(); for (const record of this.renderer.groups.values()) for (const animation of record.motionAnimations || []) animation.cancel(); this.states.clear(); this.patches.clear(); this.mounts.clear(); this.previousVisibility = null; }
}
