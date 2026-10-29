// node parity/compare.mjs [--ue Saved/RuleParity/ue.json]
// Runs scenarios.json through the web interpreter, writes Saved/RuleParity/web.json and
// compares it with the UE output event-by-event.
import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, PROJECT_ROOT, TOOL_ROOT } from '../scripts/rule-files.mjs';
import { runAll } from './driver.mjs';

const argUe = process.argv.indexOf('--ue');
const uePath = argUe > 0 ? process.argv[argUe + 1] : path.join(PROJECT_ROOT, 'Saved', 'RuleParity', 'ue.json');
const outDir = path.join(PROJECT_ROOT, 'Saved', 'RuleParity');
const scenarios = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'parity', 'scenarios.json'), 'utf8')).scenarios;

const started = performance.now();
const web = runAll(readRuleFiles(), scenarios);
const elapsed = performance.now() - started;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'web.json'), JSON.stringify(web));
console.log(`web: ${web.scenarios.length} scenarios in ${elapsed.toFixed(0)} ms -> ${path.join(outDir, 'web.json')}`);

if (!fs.existsSync(uePath)) {
  console.log(`no UE output at ${uePath}; run the DWB.Rules.WebParity automation test first`);
  process.exit(2);
}
const ue = JSON.parse(fs.readFileSync(uePath, 'utf8'));
const relClose = (a, b, tolerance = 1e-5) => a === b || Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
let failures = 0;
const report = [];
for (const w of web.scenarios) {
  const u = ue.scenarios.find(s => s.id === w.id);
  const issues = [];
  if (!u) { report.push({ id: w.id, ok: false, issues: ['missing in UE output'] }); ++failures; continue; }
  for (const [key, hash] of Object.entries(w.planHashes)) if (u.planHashes[key] !== hash) issues.push(`plan ${key} hash ${hash} != ${u.planHashes[key]}`);
  const rows = Math.max(w.damage.length, u.damage.length);
  let exactAmounts = 0, maxAmountError = 0, firstRowDiff = null;
  for (let i = 0; i < rows; ++i) {
    const a = w.damage[i], b = u.damage[i];
    if (!a || !b) { firstRowDiff ??= { row: i, web: a, ue: b }; break; }
    const same = a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && relClose(a[3], b[3], 1e-4);
    if (!same) { firstRowDiff ??= { row: i, web: a, ue: b }; break; }
    // UE prints %.9g, which round-trips float32 exactly: compare as float32 values.
    if (Math.fround(a[3]) === Math.fround(b[3])) ++exactAmounts;
    maxAmountError = Math.max(maxAmountError, Math.abs(Math.fround(a[3]) - Math.fround(b[3])));
  }
  if (w.damage.length !== u.damage.length) issues.push(`damage rows ${w.damage.length} != ${u.damage.length}`);
  if (firstRowDiff) issues.push(`first damage divergence at row ${firstRowDiff.row}: web=${JSON.stringify(firstRowDiff.web)} ue=${JSON.stringify(firstRowDiff.ue)}`);
  let frameDiff = null;
  for (let i = 0; i < Math.max(w.frames.length, u.frames.length) && !frameDiff; ++i) {
    const a = w.frames[i], b = u.frames[i];
    if (!a || !b) { frameDiff = { frame: i }; break; }
    const field = a.findIndex((value, k) => value !== b[k]);
    if (field >= 0) frameDiff = { frame: i, field: w.statFields[field], web: a[field], ue: b[field] };
  }
  if (frameDiff) issues.push(`first frame-stat divergence: ${JSON.stringify(frameDiff)}`);
  for (const [name, list] of Object.entries(w.statuses)) {
    const other = u.statuses[name] || [];
    if (list.length !== other.length || list.some(([id, v], i) => other[i][0] !== id || !relClose(v, other[i][1], 1e-4))) issues.push(`status ${name} differs (${list.length} vs ${other.length})`);
  }
  if (w.activeRoots !== u.activeRoots) issues.push(`activeRoots ${w.activeRoots} != ${u.activeRoots}`);
  const hashSame = w.stateHash === u.stateHash;
  if (issues.length) ++failures;
  const totals = s => s.damage.reduce((acc, row) => ({ dmg: acc.dmg + row[3], kills: acc.kills + row[6], crits: acc.crits + row[5] }), { dmg: 0, kills: 0, crits: 0 });
  const tw = totals(w), tu = totals(u);
  report.push({
    id: w.id, ok: issues.length === 0, rows: w.damage.length, exactAmounts, maxAmountError, stateHashEqual: hashSame,
    web: { damage: +tw.dmg.toFixed(3), kills: tw.kills, crits: tw.crits }, ue: { damage: +tu.dmg.toFixed(3), kills: tu.kills, crits: tu.crits }, issues,
  });
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
for (const r of report) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}: rows=${r.rows ?? '-'} exact=${r.exactAmounts ?? '-'} maxErr=${r.maxAmountError ?? '-'} stateHash=${r.stateHashEqual ? 'equal' : 'differs'} web=${JSON.stringify(r.web)} ue=${JSON.stringify(r.ue)}`);
  for (const issue of r.issues) console.log(`   - ${issue}`);
}
console.log(failures ? `${failures} scenario(s) differ` : 'all scenarios match');
process.exit(failures ? 1 : 0);
