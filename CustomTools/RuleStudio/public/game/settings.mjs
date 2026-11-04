// 设置：音频 / 画面 / 游戏 / 界面 / 按键。存在这台浏览器里（每个玩家自己的偏好，不进存档）。
const KEY = 'dw.settings.v1';

export const DEFAULTS = Object.freeze({
  // 音频
  master: 0.6, sfx: 1, ambience: 1, muteUnfocused: false,
  // 画面
  quality: 'high',          // low | medium | high：渲染精度、阴影、泛光一起切
  resScale: 1,              // 渲染分辨率（相对屏幕）
  shadows: true, bloom: 1, shake: 1, flashes: true,
  // 游戏
  damageNumbers: true, healthBars: 'all',   // all | elite | off
  lootFilter: 'default',                    // all | default（隐藏白装）| rare（只显示稀有以上）
  autoCurrency: true, minimap: true, minimapZoom: 1, cameraZoom: 1,
  // 界面
  uiScale: 1, showQuest: true, showTips: true,
});

export const QUALITY = {
  low: { resScale: 0.7, shadows: false, bloom: 0.4 },
  medium: { resScale: 0.85, shadows: true, bloom: 0.75 },
  high: { resScale: 1, shadows: true, bloom: 1 },
};

/** Key bindings shown in the settings (fixed for now). */
export const KEYBINDS = [
  ['移动', 'W A S D'], ['施法 / 攻击', '鼠标左键（按住连续）'], ['选择技能', '1 – 4'], ['传送回家 / 回到地图', 'T'],
  ['大地图', 'Tab（或点小地图）'], ['显示全部掉落', '按住 Alt'], ['钉住物品提示（洗炼）', 'Ctrl'],
  ['图集', 'M'], ['天赋', 'P'], ['角色', 'C'], ['背包', 'I'], ['任务', 'J'], ['洗炼', 'K'], ['流派', 'B'], ['传奇图鉴', 'L'], ['仓库', 'H'], ['设置', 'O / Esc'],
];

export function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* storage unavailable */ }
  const out = { ...DEFAULTS };
  if (raw && typeof raw === 'object') for (const k of Object.keys(DEFAULTS)) if (typeof raw[k] === typeof DEFAULTS[k]) out[k] = raw[k];
  // the old single volume setting
  if (!raw) { try { const v = parseFloat(localStorage.getItem('dw.volume')); if (Number.isFinite(v)) out.master = v; } catch { /* ignore */ } }
  return out;
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
