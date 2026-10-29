// Node helpers: read the Beta rule library from Content/Rules (the same files UE loads).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_ROOT = path.resolve(TOOL_ROOT, '..', '..');
export const RULES_DIR = path.join(PROJECT_ROOT, 'Content', 'Rules');

export function readRuleFiles(dir = RULES_DIR) {
  const files = [];
  const walk = (folder, prefix) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => { const x = a.name.toUpperCase(), y = b.name.toUpperCase(); return x < y ? -1 : x > y ? 1 : 0; })) {
      const full = path.join(folder, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.name.toLowerCase().endsWith('.json')) files.push({ path: rel, text: fs.readFileSync(full, 'utf8') });
    }
  };
  for (const sub of RULE_DIRS) if (fs.existsSync(path.join(dir, sub))) walk(path.join(dir, sub), sub);
  return files;
}

// Website rule directories. Timed/Affixes/WebTraits/WebBuilds are not native UE inputs.
// Presets remain a separate acquisition catalogue.
export const RULE_DIRS = ['Traits', 'Timed', 'Affixes', 'WebTraits', 'Builds', 'WebBuilds', 'Statuses', 'WebStatuses', 'Equipment', 'Items', 'Shop', 'Monsters', 'Tags', 'Values'];
