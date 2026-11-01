// 「更新」按钮：请求本地服务拉取最新提交，成功后刷新页面（服务端代码有变化时等新进程起来再刷新）。
let running = false;

async function waitForRestart(previousPid, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 600));
    try { const v = await (await fetch('/api/version', { cache: 'no-store' })).json(); if (v.pid !== previousPid) return true; } catch { /* restarting */ }
  }
  return false;
}

/** onStatus(text, kind) with kind 'info' | 'ok' | 'error'. Resolves to the server result. */
export async function runSelfUpdate(onStatus = () => {}) {
  if (running) return null;
  running = true;
  try {
    onStatus('正在拉取最新版本…', 'info');
    const before = await (await fetch('/api/version', { cache: 'no-store' })).json().catch(() => ({}));
    const response = await fetch('/api/update', { method: 'POST', cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `更新失败（${response.status}）`);
    if (result.status === 'uptodate') { onStatus(result.message, 'ok'); return result; }
    if (result.status !== 'updated') { onStatus(result.message, 'error'); return result; }
    onStatus(`${result.message}${result.commits?.[0] ? `最新：${result.commits[0].replace(/^\S+ /, '')}` : ''}，即将刷新…`, 'ok');
    if (result.restart) { onStatus('服务端已更新，正在重启…', 'info'); await waitForRestart(before.pid); }
    setTimeout(() => location.reload(), 900);
    return result;
  } catch (error) {
    onStatus(error.message || '更新失败', 'error');
    return null;
  } finally { running = false; }
}

// Sidebar button (RuleStudio editor view).
const button = document.getElementById('self-update');
if (button) {
  const label = button.querySelector('small');
  button.addEventListener('click', () => runSelfUpdate((text, kind) => {
    if (label) label.textContent = text;
    button.dataset.state = kind;
    button.title = text;
  }));
}
