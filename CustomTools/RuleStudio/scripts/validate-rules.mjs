// A fresh module graph per save keeps long-running servers on the current reader/compiler.
import { parentPort, workerData } from 'node:worker_threads';
import { checkRuleSet, referencesTo } from '../engine/index.mjs';

const check = checkRuleSet(workerData.files);
const users = workerData.skill && check.collections
  ? referencesTo(check.collections, workerData.skill).filter(ref => ref.as === 'skill') : [];
for (const entry of check.monsters?.values() || []) {
  if (entry.doc?.skills.some(s => s.id === workerData.skill)) users.push({ name: entry.doc.name });
}
parentPort.postMessage({ ok: check.ok, error: check.error, users });
