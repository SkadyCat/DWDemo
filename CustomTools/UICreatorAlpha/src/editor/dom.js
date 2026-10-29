export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function bind(root, event, selector, callback) { root.addEventListener(event, e => { const target = e.target.closest(selector); if (target && root.contains(target)) callback(e, target); }); }
export function modal(title, body, footer = '') {
  $('#modal-content').innerHTML = `<div class="modal-header"><h2>${escapeHtml(title)}</h2><span class="badge">UICreator Alpha</span><button data-close aria-label="关闭">×</button></div><div class="modal-body">${body}</div><div class="modal-footer">${footer || '<button data-close class="quiet">关闭</button>'}</div>`;
  const dialog = $('#modal'); if (!dialog.open) dialog.showModal();
  dialog.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => dialog.close(); });
  return dialog;
}
let toastTimer;
export function toast(message, error = false) {
  const target = $('#toast'); target.textContent = message; target.classList.toggle('error', error); target.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { target.hidden = true; }, error ? 7000 : 3200);
}
export function field(label, value, key, type = 'text', extra = '') {
  return `<div class="field"><label>${escapeHtml(label)}</label><input type="${type}" data-field="${key}" value="${escapeHtml(value)}" ${extra}></div>`;
}
export function numberField(label, value, key, options = '') {
  return `<div class="number-field"><label>${escapeHtml(label)}</label><input aria-label="${escapeHtml(label)}" type="number" step="any" data-field="${key}" value="${Math.round(Number(value) * 100) / 100}" ${options}></div>`;
}
export function selectField(label, value, key, options) {
  return `<div class="field"><label>${escapeHtml(label)}</label><select data-field="${key}">${options.map(([id, name]) => `<option value="${escapeHtml(id)}" ${String(value) === String(id) ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></div>`;
}
export function section(title, content, hint = '') { return `<section class="property-section"><h3>${title}${hint ? `<small>${hint}</small>` : ''}</h3>${content}</section>`; }
export function pathPatch(path, value) {
  const keys = path.split('.'), patch = {}; let cursor = patch;
  keys.slice(0, -1).forEach(key => { cursor[key] = {}; cursor = cursor[key]; }); cursor[keys.at(-1)] = value; return patch;
}
