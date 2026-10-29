import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, TOOL_ROOT } from './rule-files.mjs';
export const WEB_ROOT = path.join(PROJECT_ROOT, 'Saved', 'RuleStudioWeb');

export function cosBase(releaseId) {
  const config = path.join(TOOL_ROOT, 'deploy', 'cos.local.json');
  const saved = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config)) : {};
  const value = process.env.RULESTUDIO_COS_BASE_URL || (saved.enabled && saved.releaseId === releaseId ? saved.baseUrl : '') || '';
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) throw Error('COS baseUrl 必须是无凭据的 HTTPS 资源域名，可带目录前缀');
  return url.href.replace(/\/$/, '');
}

export function currentRelease() {
  if (process.env.RULESTUDIO_WEB_SOURCE === '1') return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(WEB_ROOT, 'current.json')));
    if (!/^[a-f0-9]{20}$/.test(manifest.id)) return null;
    // A changed authoring source must immediately fall back to source mode, never an old bundle.
    for (const input of manifest.inputs) {
      const stat = fs.statSync(input.path);
      if (stat.size !== input.size || stat.mtimeMs !== input.mtimeMs) return null;
    }
    return manifest;
  } catch { return null; }
}

export function releaseHtml(html, manifest, base = '') {
  const root = `${base}/_release/${manifest.id}`;
  const css = new Set(manifest.styles);
  let inserted = false;
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (tag, href) => {
    if (!css.has(href)) return tag;
    if (inserted) return '';
    inserted = true;
    return `<link rel="stylesheet" href="${root}/app.css">`;
  });
  const config = JSON.stringify(root).replace(/</g, '\\u003c');
  return html.replace('<script type="module" src="/app.mjs"></script>',
    `<script>globalThis.ruleStudioAssetBase=${config};</script>\n<script type="module" crossorigin="anonymous" src="${root}/app.mjs"></script>`);
}
