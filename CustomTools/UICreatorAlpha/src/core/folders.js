import { uid } from './model.js';

export function folderPath(project, id) {
  const parts = [], seen = new Set();
  while (id && project.folders?.[id] && !seen.has(id)) { seen.add(id); const f = project.folders[id]; parts.unshift(f.name); id = f.parentId; }
  return parts.join(' / ');
}
export function folderOptions(project, kind, excluded = null) {
  const descendants = new Set(excluded ? [excluded] : []);
  let changed = true;
  while (changed) { changed = false; for (const f of Object.values(project.folders || {})) if (descendants.has(f.parentId) && !descendants.has(f.id)) { descendants.add(f.id); changed = true; } }
  return [['', '根目录'], ...Object.values(project.folders || {}).filter(f => f.kind === kind && !descendants.has(f.id)).map(f => [f.id, folderPath(project, f.id)]).sort((a, b) => a[1].localeCompare(b[1]))];
}
export function createFolder(project, name, kind, parentId = '') {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100 || /[\\/]/.test(trimmed)) throw new Error('文件夹名为 1–100 字符，不能包含路径分隔符');
  project.folders ||= {};
  if (Object.values(project.folders).some(f => f.kind === kind && f.parentId === parentId && f.name === trimmed)) throw new Error('此位置已有同名文件夹');
  const folder = { id: uid(), name: trimmed, kind, parentId }; project.folders[folder.id] = folder; return folder;
}
export function deleteEmptyFolder(project, id) {
  if (Object.values(project.folders || {}).some(f => f.parentId === id) || [...Object.values(project.assets), ...Object.values(project.prefabs), ...Object.values(project.motions || {}), ...Object.values(project.sounds || {})].some(a => a.folderId === id)) throw new Error('文件夹非空，请先移动其中的资源和子文件夹');
  delete project.folders[id];
}
