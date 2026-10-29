// CLI and browser share the exact same read-only experiment runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuleFiles, RULES_DIR, PROJECT_ROOT } from './rule-files.mjs';
import { createHunterContext, runHunter, compareHunterGroup, hunterFingerprint, HUNTER_VERSION } from '../public/bdhunter/analyzer.mjs';

export function hunterMarkdown(report) {
  const percent = n => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  const values = (row, id) => row.comparison[id] ? percent(row.comparison[id].dpsPercent) : '—';
  const lines = [`# ${report.preset.name} 词缀优先级`, '', `生成时间：${report.generatedAt}。规则与预设指纹：\`${report.fingerprint}\`。`, '',
    `每组 ${report.settings.duration} 秒，种子 ${report.settings.seeds.join('、')}，共 ${report.totalRuns} 次模拟。`, '', '## 测试口径', '', ...report.methodology.map(s => `- ${s}`), '',
    '## 基准结果', '', '| 场景 | 总 DPS | 平均单体 DPS | 触发次数 | 存活秒数 | 最低魔力 |', '| --- | ---: | ---: | ---: | ---: | ---: |'];
  for (const scenario of report.settings.scenarios) {
    const s = report.baseline[scenario.id];
    lines.push(`| ${scenario.name} | ${s.dps.toFixed(1)} | ${s.perTargetDps.toFixed(1)} | ${s.counters.triggered.toFixed(1)} | ${s.aliveSeconds.toFixed(1)} | ${s.manaMin.toFixed(1)} |`);
  }
  lines.push('', '## 当前词缀移除实验', '', '负数表示移除后伤害下降；正数表示当前组合中移除反而提高伤害。防御词缀同时参考标准压力结果。', '',
    '| 分组 | 词缀 | 部位 | 单体变化 | 群体变化 | 高抗变化 | 压力存活变化 |', '| --- | --- | --- | ---: | ---: | ---: | ---: |');
  for (const row of report.removals) lines.push(`| ${row.group} | ${row.name} | ${row.slotName} | ${values(row, 'single')} | ${values(row, 'pack')} | ${values(row, 'resistant')} | ${(row.comparison.pressure?.aliveSeconds || 0).toFixed(1)}s |`);
  lines.push('', '## 同槽替换实验', '', `参照：${report.replacement.itemName}的「${report.replacement.name}」。每次只替换这一条，词缀总数不变，候选使用 T${report.settings.candidateTier} 合法中位值。`, '',
    '| 候选词缀 | 单体变化 | 群体变化 | 高抗变化 | 压力存活变化 |', '| --- | ---: | ---: | ---: | ---: |');
  for (const row of report.replacements) lines.push(`| ${row.name} | ${values(row, 'single')} | ${values(row, 'pack')} | ${values(row, 'resistant')} | ${(row.comparison.pressure?.aliveSeconds || 0).toFixed(1)}s |`);
  if (report.groups?.length) {
    lines.push('', '## 组合与依赖验证', '', '| 组合变化 | 单体变化 | 群体变化 | 高抗变化 | 单体触发次数 |', '| --- | ---: | ---: | ---: | ---: |');
    for (const row of report.groups) lines.push(`| ${row.name} | ${values(row, 'single')} | ${values(row, 'pack')} | ${values(row, 'resistant')} | ${row.measurements.single.counters.triggered.toFixed(1)} |`);
  }
  if (report.skipped.length) lines.push('', '## 跳过的候选', '', ...report.skipped.map(row => `- ${row.id}：${row.reason}`));
  lines.push('', '每一行只代表当前配置附近的变化，多个高收益词缀不能直接相加；需要重新组合并复测。各随机种子的结果和机制计数保存在同名 JSON 报告。', '');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    if (!process.argv[i].startsWith('--') || process.argv[i + 1] === undefined) throw new Error('参数格式：--name value');
    args.set(process.argv[i].slice(2), process.argv[i + 1]);
  }
  const id = args.get('preset') || 'synergy_rime_thunder';
  if (!/^[a-z0-9_]+$/.test(id)) throw new Error('预设 ID 无效');
  const preset = JSON.parse(fs.readFileSync(path.join(RULES_DIR, 'Presets', `${id}.json`), 'utf8'));
  const options = { presetId: id, duration: Number(args.get('seconds') || 30), seeds: (args.get('seeds') || '18,67,193').split(',').map(Number),
    pressure: Number(args.get('pressure') || 300), resistance: Number(args.get('resistance') || 20), highResistance: Number(args.get('high-resistance') || 60),
    ...(args.has('candidates') ? { candidateIds: args.get('candidates') === 'all' ? 'all' : args.get('candidates').split(',').filter(Boolean) } : {}),
    ...(args.has('replacement') ? { replacementKey: args.get('replacement') } : {}),
    input: { ...(args.has('cast-for') ? { castFor: Number(args.get('cast-for')) } : {}), ...(args.has('sacrifice-every') ? { sacrificeEvery: Number(args.get('sacrifice-every')) } : {}) },
    onProgress: progress => { if (progress.done % 36 === 0 || progress.phase === 'done') console.log(`${progress.done}/${progress.total} ${progress.phase} ${progress.name}`); },
  };
  const context = createHunterContext(readRuleFiles());
  if (args.has('reuse') && [...args.keys()].some(k => !['reuse', 'groups', 'preset', 'out'].includes(k))) throw new Error('复用基准报告时只允许指定 reuse、groups、preset 和 out');
  const report = args.has('reuse') ? JSON.parse(fs.readFileSync(path.resolve(args.get('reuse')), 'utf8')) : await runHunter(context, preset, options);
  if (report.version !== HUNTER_VERSION || report.fingerprint !== await hunterFingerprint(context.files, preset)) throw new Error('基准报告已过期，需要重新分析');
  report.preset.name = preset.authored?.name || preset.meta?.name || preset.name || report.preset.name;
  if (args.has('groups')) {
    const groups = JSON.parse(fs.readFileSync(path.resolve(args.get('groups')), 'utf8'));
    report.totalRuns -= (report.groups || []).reduce((n, g) => n + g.runs, 0); report.groups = [];
    for (const group of groups) {
      report.groups.push(await compareHunterGroup(context, preset, report, group));
      report.totalRuns += report.groups.at(-1).runs;
      console.log(`GROUP ${group.name}`);
    }
  }
  const output = path.resolve(args.get('out') || path.join(PROJECT_ROOT, 'Saved/BDHunter', id));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(`${output}.json`, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(`${output}.md`, hunterMarkdown(report));
  console.log(`REPORT ${output}.json\nREPORT ${output}.md`);
}
