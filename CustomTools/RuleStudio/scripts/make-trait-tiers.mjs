// Generate initial upper-layer bands from existing trait defaults. No combat formulas change.
import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, RULES_DIR } from './rule-files.mjs';
import { RuleLibrary, buildTraitTierIndex, serializeTraitTierCatalog, TRAIT_TIERS_FILE } from '../engine/index.mjs';
const library = new RuleLibrary(), loaded = library.load(readRuleFiles());
if (!loaded.ok) throw new Error(loaded.error);
const result = buildTraitTierIndex(library);
if (result.error) throw new Error(result.error);
const destination = path.join(RULES_DIR, TRAIT_TIERS_FILE);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, serializeTraitTierCatalog(result.index));
console.log(`${result.index.size} numeric traits × 10 tiers -> ${destination}`);
