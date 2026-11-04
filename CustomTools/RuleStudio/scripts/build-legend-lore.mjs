import fs from 'node:fs';
import { LEGENDARIES } from '../core/content/legendaries.mjs';
const md = fs.readFileSync('design/novel/传奇.md', 'utf8').split(/^## /m).slice(1), out = {};
for (const sec of md) {
  const lines = sec.trim().split('\n'), name = lines[0].trim(), L = LEGENDARIES.find(l => l.name === name);
  if (!L) { console.log('unknown', name); continue; }
  const body = lines.slice(1).join('\n').trim().split(/\n\s*\n/).map(s => s.replace(/\n/g, '').trim()).filter(Boolean);
  const [owner, city] = body[0].split(' · ');
  out[L.id] = { owner: owner.trim(), city: city.trim(), lore: body.slice(1).join('\n').replace(/\n?---$/, '').trim() };
}
const js = '// 由 design/novel/传奇.md 生成：每件传奇的主人、来自哪座城、来历（传奇图鉴里点「来历」显示）。改正文请改 md 再重新生成。\nexport const LEGEND_LORE = ' + JSON.stringify(out, null, 1) + ';\n';
fs.writeFileSync('public/game/legend-lore.mjs', js); console.log(Object.keys(out).length);
