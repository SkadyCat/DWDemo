// Author classification metadata without modifying a trait, roll pool or combat program.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, readRuleFiles } from './rule-files.mjs';
import { RuleLibrary } from '../engine/library.mjs';
import { AFFIX_CATEGORY_FILE, AFFIX_CATEGORIES, buildAffixCategoryIndex } from '../engine/affix-categories.mjs';

export function createAffixCategoryCatalog(library, existing) {
  const index = buildAffixCategoryIndex(library, existing);
  return { version: 1, traits: Object.fromEntries([...index.traits].sort(([a], [b]) => a.localeCompare(b))),
    affixes: Object.fromEntries([...index.affixes].filter(([id]) => !index.traits.has(id)).sort(([a], [b]) => a.localeCompare(b))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const library = new RuleLibrary(), loaded = library.load(readRuleFiles());
  if (!loaded.ok) throw new Error(loaded.error);
  const file = path.join(RULES_DIR, AFFIX_CATEGORY_FILE);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  const catalog = createAffixCategoryCatalog(library, existing);
  const lines = field => Object.entries(catalog[field]).map(([id, entry]) => `    ${JSON.stringify(id)}: ${JSON.stringify(entry)}`).join(',\n');
  fs.writeFileSync(file, `{\n  "version": 1,\n  "traits": {\n${lines('traits')}\n  },\n  "affixes": {\n${lines('affixes')}\n  }\n}\n`);
  for (const category of AFFIX_CATEGORIES) console.log(`${category.name}: ${Object.values(catalog.traits).filter(row => row.category === category.id).length} 特性 + ${Object.values(catalog.affixes).filter(row => row.category === category.id).length} 复合词条`);
}
