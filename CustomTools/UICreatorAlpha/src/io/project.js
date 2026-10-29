export async function listProjects() {
  const response = await fetch('/api/projects'); if (!response.ok) throw new Error('读取工程列表失败'); return (await response.json()).projects;
}
export async function loadProject(id) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`); if (!response.ok) throw new Error('读取工程失败'); return response.json();
}
export async function saveProject(document, revision) {
  const response = await fetch(`/api/projects/${encodeURIComponent(document.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` }, body: JSON.stringify(document) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '保存失败'); return result;
}
export function download(name, body, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([body], { type })), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
