import { clone, merge, uid, walk, createNode, OVERRIDE_FIELDS } from './model.js';
import { defaultAudio } from './audio.js';

// Expansion is derived data. Never write expanded IDs or children back to source.
// Override keys are stable template paths (template-id/nested-id/...), not names.
export function expandDocument(document) {
  const origins = new Map();
  let count = 0;
  const expand = (source, scope = '', context = null, templatePath = '', stack = []) => {
    if (++count > 20000) throw new Error('展开后节点超过 20000，请减少预制体实例数量');
    const node = { ...source, slot: clone(source.slot), style: clone(source.style), layout: clone(source.layout), brushes: { ...source.brushes }, motion: clone(source.motion || { preset: 'auto' }), audio: clone(source.audio || defaultAudio(source.type, source.binding)), action: clone(source.action || null), children: [] };
    node.id = scope ? `${scope}::${source.id}` : source.id;
    const relativePath = templatePath ? `${templatePath}/${source.id}` : source.id;
    if (context?.overrides?.[relativePath]) {
      // The override surface is intentional. Identity, hierarchy and prefab links are immutable.
      const patch = context.overrides[relativePath];
      for (const key of OVERRIDE_FIELDS) if (patch[key] !== undefined) merge(node, { [key]: patch[key] });
    }
    origins.set(node.id, context ? { instanceId: context.instanceId, prefabId: context.prefabId, path: relativePath, sourceId: source.id, inherited: true } : { sourceId: source.id, inherited: false });
    if (source.type === 'PrefabInstance') {
      const prefab = document.prefabs[source.prefabId];
      if (!prefab) throw new Error(`丢失预制体 ${source.prefabId}`);
      if (stack.includes(prefab.id)) throw new Error(`预制体循环引用: ${[...stack, prefab.id].join(' → ')}`);
      // A nested instance's own overrides apply first; outer instance overrides win.
      const nextOverrides = clone(source.overrides || {});
      if (context) {
        const prefix = `${relativePath}/`;
        for (const [path, patch] of Object.entries(context.overrides || {})) if (path.startsWith(prefix)) nextOverrides[path.slice(prefix.length)] = merge(nextOverrides[path.slice(prefix.length)] || {}, patch);
      }
      const root = expand(prefab.root, node.id, { instanceId: context?.instanceId || source.id, prefabId: prefab.id, overrides: nextOverrides }, '', [...stack, prefab.id]);
      // Overrides for nested template descendants use their full outer template path.
      if (context) {
        walk(root, expanded => {
          const origin = origins.get(expanded.id);
          const outerPath = `${relativePath}/${origin.path}`;
          const patch = context.overrides?.[outerPath];
          if (patch) for (const key of OVERRIDE_FIELDS) if (patch[key] !== undefined) merge(expanded, { [key]: patch[key] });
          origin.path = outerPath; origin.instanceId = context.instanceId;
        });
      }
      root.slot.horizontalAlignment = 'fill'; root.slot.verticalAlignment = 'fill'; root.slot.padding = { left: 0, top: 0, right: 0, bottom: 0 };
      node.children = [root];
    } else node.children = source.children.map(child => expand(child, scope, context, relativePath, stack));
    return node;
  };
  return { document: { ...document, root: expand(document.root) }, origins, count };
}

export function detachInstance(instance, document) {
  const temp = { ...document, root: instance };
  const expanded = expandDocument(temp).document.root;
  const root = expanded.children[0];
  walk(root, node => { node.id = uid(); if (node.type === 'PrefabInstance') { node.type = 'Overlay'; node.prefabId = ''; node.overrides = {}; } });
  root.slot = clone(instance.slot); root.name = instance.name; root.id = instance.id;
  return root;
}

export function createPrefabFromNode(document, node, width, height) {
  const prefabId = uid(), root = clone(node);
  // Template node IDs have their own durable identity across edits and overrides.
  walk(root, child => { child.id = uid(); });
  const prefab = { id: prefabId, name: node.name, width: Math.max(16, width), height: Math.max(16, height), root };
  const instance = createNode('PrefabInstance', { id: node.id, name: node.name, prefabId, slot: clone(node.slot), layout: { width, height } });
  document.prefabs[prefabId] = prefab;
  return instance;
}

export function applyInstanceOverrides(document, instance) {
  const prefab = document.prefabs[instance.prefabId];
  if (!prefab) throw new Error('预制体不存在');
  for (const [path, patch] of Object.entries(instance.overrides)) {
    const parts = path.split('/');
    let target = prefab.root, applied = false;
    if (parts[0] !== target.id) throw new Error(`覆盖路径已失效: ${path}`);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) { merge(target, patch); applied = true; break; }
      if (target.type === 'PrefabInstance') {
        // Applying to an outer prefab stores an override on its nested instance.
        // It must not rewrite the deepest shared prefab for unrelated interfaces.
        const nestedPath = parts.slice(i + 1).join('/');
        target.overrides[nestedPath] = merge(target.overrides[nestedPath] || {}, patch); applied = true; break;
      }
      target = target.children.find(child => child.id === parts[i + 1]);
      if (!target) break;
    }
    if (!applied) throw new Error(`覆盖路径已失效: ${path}`);
  }
  instance.overrides = {};
}
