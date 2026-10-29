import { clone, indexTree, merge, validateDocument } from './model.js';
import { materializeMotionAssets } from './motion.js';
import { materializeSounds } from '../assets/ui-sounds.js';

export class EditorStore extends EventTarget {
  constructor(document) {
    super(); this.document = materializeSounds(materializeMotionAssets(document)); this.selected = document.root.id;
    this.undoStack = []; this.redoStack = []; this.gesture = null; this.generation = 0;
    this.editingPrefabId = null; this.reindex();
  }
  get editRoot() { return this.editingPrefabId ? this.document.prefabs[this.editingPrefabId].root : this.document.root; }
  get viewDocument() {
    const prefab = this.document.prefabs[this.editingPrefabId];
    const screen = this.document.interfaceCatalog?.find(p=>p.prefabId===prefab?.id && !['normal','boss','skills'].includes(p.id));
    return prefab ? { ...this.document, root: prefab.root, viewport: { width: prefab.width, height: prefab.height, background: '#101925' }, presentation: { ...this.document.presentation, interfaceId: screen?.id || '' } } : this.document;
  }
  reindex() { Object.assign(this, indexTree(this.editRoot)); }
  editPrefab(id = null) { this.editingPrefabId = id; this.reindex(); this.selected = this.editRoot.id; this.emit('context'); }
  emit(kind, detail = {}) { this.dispatchEvent(new CustomEvent('change', { detail: { kind, ...detail } })); }
  select(id) { if (this.nodes.has(id)) { this.selected = id; this.emit('selection'); } }
  snapshot() { return { document: clone(this.document), selected: this.selected, editingPrefabId: this.editingPrefabId }; }
  restore(snapshot) { this.document = clone(snapshot.document); this.selected = snapshot.selected; this.editingPrefabId = snapshot.editingPrefabId; this.reindex(); this.generation++; }
  transaction(label, action) {
    const before = this.snapshot();
    try { action(this.document); materializeSounds(this.document); this.reindex(); const errors = validateDocument(this.document); if (errors.length) throw new Error(errors[0]); }
    catch (error) { this.restore(before); throw error; }
    this.undoStack.push({ label, ...before }); if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack.length = 0; this.generation++; this.emit('document', { label });
  }
  patch(id, patch, label = '修改属性') { this.transaction(label, () => merge(this.nodes.get(id), patch)); }
  beginGesture(label) { if (!this.gesture) this.gesture = { label, ...this.snapshot() }; }
  preview(action) { action(this.document); this.reindex(); this.emit('preview'); }
  endGesture(cancel = false) {
    if (!this.gesture) return;
    const before = this.gesture; this.gesture = null;
    if (cancel) { this.restore(before); this.emit('document'); return; }
    if (JSON.stringify(before.document) === JSON.stringify(this.document)) return;
    this.undoStack.push(before); if (this.undoStack.length > 80) this.undoStack.shift(); this.redoStack.length = 0; this.generation++; this.emit('document', { label: before.label });
  }
  undo() {
    const before = this.undoStack.pop(); if (!before) return;
    this.redoStack.push({ label: before.label, ...this.snapshot() }); this.restore(before); this.emit('document');
  }
  redo() {
    const after = this.redoStack.pop(); if (!after) return;
    this.undoStack.push({ label: after.label, ...this.snapshot() }); this.restore(after); this.emit('document');
  }
  replace(document) {
    materializeSounds(document);
    materializeMotionAssets(document);
    const errors = validateDocument(document); if (errors.length) throw new Error(errors.slice(0, 4).join('\n'));
    this.document = document; this.editingPrefabId = null; this.selected = document.root.id; this.undoStack = []; this.redoStack = [];
    this.reindex(); this.generation++; this.emit('replace');
  }
}
