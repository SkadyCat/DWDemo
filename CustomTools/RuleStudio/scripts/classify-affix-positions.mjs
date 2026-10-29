// Fill the upper-layer prefix/suffix table; preserve authored assignments and reasons.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuleFiles, TOOL_ROOT } from './rule-files.mjs';
import { RuleLibrary } from '../engine/library.mjs';
import { AFFIX_POSITIONS, buildAffixPositionIndex } from '../public/affix-positions.mjs';

export function createAffixPositionCatalog(library, existing) {
  const index = buildAffixPositionIndex(library, existing);
  return { version: 1, traits: Object.fromEntries([...index.traits].sort(([a], [b]) => a.localeCompare(b))),
    affixes: Object.fromEntries([...index.affixes].filter(([id]) => !index.traits.has(id)).sort(([a], [b]) => a.localeCompare(b))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const library = new RuleLibrary(), loaded = library.load(readRuleFiles());
  if (!loaded.ok) throw new Error(loaded.error);
  const file = path.join(TOOL_ROOT, 'public/data/affix-positions.json');
  const catalog = createAffixPositionCatalog(library, JSON.parse(fs.readFileSync(file, 'utf8')));
  const lines = field => Object.entries(catalog[field]).map(([id, row]) => `    ${JSON.stringify(id)}: ${JSON.stringify(row)}`).join(',\n');
  fs.writeFileSync(file, `{\n  "version": 1,\n  "traits": {\n${lines('traits')}\n  },\n  "affixes": {\n${lines('affixes')}\n  }\n}\n`);
  for (const position of AFFIX_POSITIONS) console.log(`${position.name}: ${Object.values(catalog.traits).filter(row => row.position === position.id).length} 特性 + ${Object.values(catalog.affixes).filter(row => row.position === position.id).length} 复合词条`);
}
