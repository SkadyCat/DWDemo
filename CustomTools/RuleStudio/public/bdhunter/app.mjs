import { hunterFingerprint, HUNTER_VERSION } from './analyzer.mjs';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = (n, digits = 0) => Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—';
const signed = (n, unit = '%') => `<span class="numeric ${Math.abs(n || 0) < .05 ? 'neutral' : n > 0 ? 'positive' : 'negative'}">${n > 0 ? '+' : ''}${number(n, 1)}${unit}</span>`;
let files = [], preset = null, report = null, worker = null, fingerprint = '', generation = 0, groups = [], profiles = {};
const settings = () => ({ presetId: $('preset').value, duration: Number($('duration').value), seeds: $('samples').value === '1' ? [18] : [18, 67, 193],
  resistance: Number($('resistance').value), highResistance: Number($('high-resistance').value), targets: Number($('targets').value),
  pressure: Number($('pressure').value), candidateTier: Number($('tier').value),
  ...($('reference').value ? { replacementKey: $('reference').value } : {}),
  input: $('input').value === 'opening' ? { castFor: 3 } : $('input').value === 'sacrifice' ? { castFor: 1, sacrificeEvery: 1 } : {},
});

function setBusy(busy) {
  document.querySelectorAll('.controls input,.controls select').forEach(control => { control.disabled = busy; });
  $('start').disabled = busy || !preset; $('cancel').disabled = !busy; $('preset').disabled = busy;
  $('progress').hidden = !busy; $('report').setAttribute('aria-busy', String(busy));
}
function cancel() {
  if ($('cancel').disabled) return;
  generation++; worker?.terminate(); worker = null; setBusy(false);
  $('status').textContent = report ? '分析已取消，下面仍显示上次完成的报告。' : '分析已取消。';
}
function updateFreshness() {
  if (!report) return;
  const fresh = report.version === HUNTER_VERSION && report.fingerprint === fingerprint;
  $('freshness').textContent = fresh ? '对应当前规则与预设' : '历史报告 · 请重新分析';
  $('freshness').classList.toggle('stale', !fresh);
}

function comparisonCells(row) {
  return ['single', 'pack', 'resistant'].map(id => `<td>${signed(row.comparison[id]?.dpsPercent)}</td>`).join('') +
    `<td>${signed(row.comparison.pressure?.aliveSeconds, 's')}</td><td>${signed(row.comparison.pressure?.lifeMinPoints, ' 个百分点')}</td>`;
}
function detail(row) {
  const s = row.measurements.single;
  return `<details><summary>查看计数与种子差异</summary><p>${escape(row.id)}${row.tier ? ` · T${row.tier}` : ''}<br>单体实际触发 ${number(s.counters.triggered, 1)} 次；消费冻结 ${number(s.counters.consumedFreeze, 1)} 次；消费感电 ${number(s.counters.consumedShock, 1)} 次。<br>单体变化在各随机种子下为 ${number(row.comparison.single.seedRange[0], 1)}% 到 ${number(row.comparison.single.seedRange[1], 1)}%。<br>最低魔力 ${number(s.manaMin, 1)}；最后三分之一时段 DPS ${number(s.tailDps, 1)}。</p></details>`;
}
function renderTables() {
  if (!report) return;
  const sort = $('sort').value;
  const rows = [...report.removals].sort((a, b) => a.order - b.order || a.comparison[sort].dpsPercent - b.comparison[sort].dpsPercent);
  $('removals').innerHTML = rows.map(row => `<tr><td><span class="tag ${['core', 'output', 'defense', '', 'low'][row.order]}">${escape(row.group)}</span></td><td class="affix-name">${escape(row.name)}<small>${escape(row.slotName)} · ${escape(row.itemName)}</small>${detail(row)}</td>${comparisonCells(row)}</tr>`).join('');
  $('replacements').innerHTML = [...report.replacements].sort((a, b) => b.comparison[sort].dpsPercent - a.comparison[sort].dpsPercent).map(row => `<tr><td class="affix-name">${escape(row.name)}${detail(row)}</td>${comparisonCells(row)}</tr>`).join('');
  $('groups-panel').hidden = !report.groups?.length;
  $('groups').innerHTML = (report.groups || []).map(row => `<tr><td class="affix-name">${escape(row.name)}${detail({ ...row, id: '组合对照' })}</td>${comparisonCells(row)}</tr>`).join('');
}

function render(result) {
  report = result; $('empty').hidden = true; $('report').hidden = false; $('export').disabled = false;
  $('report-name').textContent = `${report.preset.name} · 分析报告`;
  $('report-meta').textContent = `${report.settings.duration} 秒 × ${report.settings.seeds.length} 个种子 · ${report.totalRuns} 次对照模拟 · ${new Date(report.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
  updateFreshness();
  const selectedReference = $('reference').value;
  $('reference').innerHTML = '<option value="">自动选择</option>' + report.removals.map(row => `<option value="${escape(row.key)}">${escape(row.slotName)} · ${escape(row.name)}</option>`).join('');
  if (report.removals.some(row => row.key === selectedReference)) $('reference').value = selectedReference;
  $('metrics').innerHTML = report.settings.scenarios.map(scenario => {
    const s = report.baseline[scenario.id];
    return `<article class="metric"><span>${escape(scenario.name)}</span><strong>${number(s.dps)}</strong><small>总 DPS · 平均单体 ${number(s.perTargetDps)}</small><small>存活 ${number(s.aliveSeconds, 1)}s · 最低生命 ${number(100 * s.lifeMin, 1)}%</small><small>最低魔力 ${number(s.manaMin, 1)} / ${number(s.maxMana)}</small></article>`;
  }).join('');
  $('replacement-note').textContent = `参照：${report.replacement.itemName}的「${report.replacement.name}」。维持词缀总数，候选取 T${report.settings.candidateTier} 合法中位值。`;
  $('candidate-count').textContent = `${report.replacements.length} 项完成 · ${report.skipped.length} 项冲突或重复`;
  $('skipped').textContent = report.skipped.length ? `跳过：${report.skipped.map(row => row.id).join('、')}。候选范围及跳过原因完整保存在导出报告中。` : '本次为所列候选的逐项替换，未遍历全部可能组合。';
  const total = Object.values(report.baseline.single.elements).reduce((sum, n) => sum + n, 0);
  const names = { frost: '冰霜', lightning: '闪电', fire: '火焰', physical: '物理', poison: '毒素', void: '虚空' };
  $('elements').innerHTML = Object.entries(report.baseline.single.elements).sort((a, b) => b[1] - a[1]).map(([id, value]) => `<div class="element-row"><span>${escape(names[id] || id)}</span><div class="element-bar"><i style="width:${total ? 100 * value / total : 0}%"></i></div><span>${number(total ? 100 * value / total : 0, 1)}%</span></div>`).join('');
  $('chain').innerHTML = Object.entries(report.baseline.single.triggeredSkills).map(([id, n]) => {
    const source = files.find(f => f.path === `Traits/${id}.json` || f.path === `Affixes/${id}.json` || f.path === `WebTraits/${id}.json`);
    const name = source ? JSON.parse(source.text).name || id : id;
    return `<div>${escape(name)} · ${number(n, 1)} 次触发</div>`;
  }).join('');
  $('mechanics').innerHTML = report.settings.scenarios.map(s => {
    const m = report.baseline[s.id];
    return `<tr><td>${escape(s.name)}</td><td>${number(m.casts, 1)}</td><td>${number(m.counters.freezes, 1)}</td><td>${number(m.counters.consumedFreeze, 1)}</td><td>${number(m.counters.consumedShock, 1)}</td><td>${number(m.counters.triggered, 1)}</td></tr>`;
  }).join('');
  $('methodology').innerHTML = report.methodology.map(text => `<li>${escape(text)}</li>`).join('');
  $('fingerprint').textContent = `规则与预设指纹 ${report.fingerprint} · 峰值队列 ${Math.max(...Object.values(report.baseline).map(s => s.peakQueue))}`;
  renderTables();
}

async function loadPreset() {
  const own = ++generation; preset = null; report = null; $('start').disabled = true; $('export').disabled = true;
  $('report').hidden = true; $('empty').hidden = false; $('error').hidden = true;
  $('reference').innerHTML = '<option value="">自动选择</option>';
  $('status').textContent = '读取当前预设…';
  const id = $('preset').value;
  const response = await fetch(`/presets/${encodeURIComponent(id)}.json`);
  if (!response.ok) throw new Error('预设读取失败');
  const loaded = await response.json();
  if (own !== generation) return;
  preset = loaded;
  if (!Object.keys(preset.instances || {}).length) { preset = null; throw new Error('该预设没有实例随机词缀，当前版本请选择含实例装备的 BD。'); }
  fingerprint = await hunterFingerprint(files, preset);
  const profile = profiles[id] ? await fetch(`/bdhunter/profiles/${encodeURIComponent(profiles[id])}`) : null;
  groups = profile?.ok ? await profile.json() : [];
  if (own !== generation) return;
  const cached = await fetch(`/bdhunter/reports/${encodeURIComponent(id)}.json`);
  if (cached.ok) {
    const saved = await cached.json();
    if (own !== generation) return;
    render(saved); $('status').textContent = saved.fingerprint === fingerprint ? '已载入与当前规则匹配的完整报告，可调整参数重新分析。' : '规则或预设已变化，下面是历史报告，请重新分析。';
  } else $('status').textContent = '准备完成。开始分析后会逐条移除词缀，再做同槽替换对照。';
  $('start').disabled = false;
}
function showError(error) { $('error').textContent = error.message || String(error); $('error').hidden = false; setBusy(false); }

$('start').onclick = async () => {
  const own = ++generation;
  $('error').hidden = true; $('progress').value = 0; $('progress-label').textContent = '';
  setBusy(true); $('status').textContent = '刷新当前规则与预设…';
  try {
    const [rules, source] = await Promise.all([fetch('/api/rules'), fetch(`/presets/${encodeURIComponent($('preset').value)}.json`)]);
    if (!rules.ok || !source.ok) throw new Error('当前规则或预设读取失败');
    files = (await rules.json()).files; preset = await source.json();
    fingerprint = await hunterFingerprint(files, preset); updateFreshness();
    if (own !== generation) return;
  worker = new Worker('/bdhunter/worker.mjs', { type: 'module' }); setBusy(true); $('status').textContent = '建立基准，准备对照实验…';
  worker.onmessage = ({ data }) => {
    if (own !== generation) return;
    if (data.type === 'progress') {
      $('status').textContent = `${({ baseline: '基准', remove: '移除', replace: '替换', group: '组合对照', done: '完成' })[data.progress.phase]} · ${data.progress.name}`;
      $('progress').max = data.progress.total; $('progress').value = data.progress.done;
      $('progress-label').textContent = `${data.progress.done} / ${data.progress.total}`;
    } else if (data.type === 'result') {
      worker.terminate(); worker = null; setBusy(false); render(data.report); $('status').textContent = '分析完成。所有词缀与存档保持原状。';
    } else if (data.type === 'error') { worker.terminate(); worker = null; showError(new Error(data.error)); }
  };
  worker.onerror = event => { worker?.terminate(); worker = null; showError(new Error(event.message || '分析线程出错')); };
  worker.postMessage({ files, preset, groups, options: settings() });
  } catch (error) { showError(error); }
};
$('cancel').onclick = cancel;
$('sort').onchange = renderTables;
$('preset').onchange = () => loadPreset().catch(showError);
$('export').onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `bdhunter-${report.preset.id || 'report'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
for (const id of ['duration', 'samples', 'resistance', 'high-resistance', 'targets', 'pressure', 'tier', 'input', 'reference']) $(id).addEventListener('change', () => {
  if (report && !worker) $('status').textContent = '参数已修改；下面仍是上次完成的报告，点击开始分析更新。';
});

try {
  const [rulesResponse, indexResponse, profileResponse] = await Promise.all([fetch('/api/rules'), fetch('/presets/index.json'), fetch('/bdhunter/profiles/index.json')]);
  if (!rulesResponse.ok || !indexResponse.ok) throw new Error('规则库或预设目录读取失败');
  files = (await rulesResponse.json()).files;
  profiles = profileResponse.ok ? await profileResponse.json() : {};
  const entries = await indexResponse.json();
  $('preset').innerHTML = entries.map(entry => `<option value="${escape(entry.id)}">${escape(entry.name)}</option>`).join('');
  if (entries.some(e => e.id === 'synergy_rime_thunder')) $('preset').value = 'synergy_rime_thunder';
  await loadPreset();
} catch (error) { preset = null; showError(error); }
