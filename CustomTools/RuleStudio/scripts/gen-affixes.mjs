// node scripts/gen-affixes.mjs — writes Content/Rules/Affixes/<id>.json for every line of
// docs/combat-affix-table.md (engine/combat-catalog.mjs). Existing affixes keep their params and
// sheet entries; only name/description follow the table text. Idempotent.
import fs from 'node:fs';
import path from 'node:path';
import { RULES_DIR } from './rule-files.mjs';
import { COMBAT_AFFIXES } from '../engine/combat-catalog.mjs';

const dir = path.join(RULES_DIR, 'Affixes');
const describe = (text, note) => `角色词条：${text}${note ? `。${note}` : ''}`;
const json = value => JSON.stringify(value, null, 2)
  // keep small objects on one line like the hand-written files
  .replace(/"div": \[\s*\{\s*"param": "(\w+)"\s*\},\s*\{\s*"param": "(\w+)"\s*\}\s*\]/g, '"div": [{ "param": "$1" }, { "param": "$2" }]')
  .replace(/"value": \{\s*("div": \[[^\]]*\])\s*\}/g, '"value": { $1 }')
  .replace(/\{\n\s+"(stat|trigger)": ([^\n]+?)(,\n\s+"value": ([^\n]+))?\n\s+\}/g, (m, k, a, _b, v) => `{ "${k}": ${a}${v !== undefined ? `, "value": ${v}` : ''} }`)
  .replace(/"params": \{\n([^}]*?)\n\s+\}/g, (m, body) => `"params": { ${body.trim().split(/,\n\s*/).join(', ')} }`)
  .replace(/"value": \{\n\s+"(param)": ("[^"]+")\n\s+\}/g, '"value": { "$1": $2 }');

let written = 0, renamed = 0;
for (const [text, id, spec, note] of COMBAT_AFFIXES) {
  if (spec.existing) {
    const file = path.join(dir, `${spec.existing}.json`);
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const next = { ...doc, name: text, description: describe(text, note) };
    if (JSON.stringify(next) !== JSON.stringify(doc)) { fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`); ++renamed; }
    continue;
  }
  const doc = { id, name: text, description: describe(text, note), params: spec.params, sheet: spec.sheet };
  const file = path.join(dir, `${id}.json`);
  const text2 = `${json(doc)}\n`;
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text2) { fs.writeFileSync(file, text2); ++written; }
}
console.log(`affixes: ${written} written, ${renamed} renamed`);
