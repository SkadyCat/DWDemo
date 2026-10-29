import { createHunterContext, runHunter, compareHunterGroup } from './analyzer.mjs';

self.onmessage = async ({ data }) => {
  try {
    const context = createHunterContext(data.files);
    const report = await runHunter(context, data.preset, { ...data.options, onProgress: progress => self.postMessage({ type: 'progress', progress }) });
    report.groups = [];
    const total = report.totalRuns + (data.groups || []).length * report.settings.scenarios.length * report.settings.seeds.length;
    for (const group of data.groups || []) report.groups.push(await compareHunterGroup(context, data.preset, report, group, () => {
      report.totalRuns++; self.postMessage({ type: 'progress', progress: { phase: 'group', name: group.name, done: report.totalRuns, total } });
    }));
    self.postMessage({ type: 'result', report });
  } catch (error) { self.postMessage({ type: 'error', error: error.message }); }
};
