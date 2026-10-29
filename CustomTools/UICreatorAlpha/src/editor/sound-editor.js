import { $, modal, escapeHtml as esc, selectField, toast } from './dom.js';
import { uid, walk } from '../core/model.js';
import { soundAsset, validateSoundAsset } from '../core/audio.js';
import { folderOptions } from '../core/folders.js';

export async function importSounds(app, files) {
  try {
    const assets = [];
    for (const file of files) { if (file.size > 1024 * 1024) throw new Error(`${file.name} 超过 1 MB`); assets.push(soundAsset(uid(), file.name.replace(/\.wav$/i, ''), new Uint8Array(await file.arrayBuffer()), { folderId: app.library.currentFolder.sounds || '' })); }
    if (!assets.length) return;
    app.store.transaction('导入 WAV 音效', doc => { doc.sounds ||= {}; for (const asset of assets) doc.sounds[asset.id] = asset; });
    app.notify(`已导入 ${assets.length} 个音效；WAV 会随工程保存及导入 UE`);
  } catch (error) { toast(error.message, true); }
}
export function showSoundEditor(app, id) {
  const original = app.store.document.sounds?.[id]; if (!original) return;
  const draft = structuredClone(original);
  modal('UI 音效资产', `<p class="modal-description">控件与预制体通过稳定 ID 共享这份音效。替换 WAV 后所有引用同步更新。</p><div class="field"><label>名称</label><input id="sound-name" value="${esc(draft.name)}"></div>${selectField('文件夹', draft.folderId || '', '_sound-folder', folderOptions(app.store.document, 'sound'))}<div class="sound-preview"><strong>♪ ${esc(draft.name)}</strong><span id="sound-meta">${Math.round(draft.duration * 1000)} ms · ${draft.sampleRate} Hz · ${draft.channels === 1 ? '单声道' : '双声道'}</span><button id="sound-preview" class="primary">试听</button><button id="sound-stop" class="quiet">停止</button></div><div class="field"><label>音量</label><input aria-label="资产音量" id="sound-volume" type="number" min="0" max="1" step="0.05" value="${draft.volume}"></div><div class="field"><label>音高倍率</label><input aria-label="资产音高" id="sound-pitch" type="number" min="0.25" max="4" step="0.05" value="${draft.pitch}"></div><div class="field"><label>最短间隔 ms</label><input aria-label="防连响间隔" id="sound-cooldown" type="number" min="0" max="5000" value="${draft.cooldown}"></div><div class="field"><label>替换资源</label><input id="sound-replace" aria-label="替换 WAV" type="file" accept=".wav,audio/wav"></div><p class="property-hint">支持 16 位 PCM WAV，单/双声道，8–96 kHz，最长 10 秒、最大 1 MB。浏览器需先点击一次才能播放悬停音。音效只在交互预览中触发。</p><p id="sound-preview-status" role="status">点击试听，检查音量与音高。</p>`, '<button id="sound-delete" class="quiet">删除未引用音效</button><button id="sound-copy" class="quiet">另存副本</button><button data-close class="quiet">取消</button><button id="sound-save" class="primary">保存音效</button>');
  const read = () => { draft.name = $('#sound-name').value.trim(); draft.folderId = $('[data-field="_sound-folder"]').value; draft.volume = Number($('#sound-volume').value); draft.pitch = Number($('#sound-pitch').value); draft.cooldown = Number($('#sound-cooldown').value); const errors = validateSoundAsset(draft); if (errors.length) throw new Error(errors[0]); };
  $('#sound-preview').onclick = async () => {
    try { read(); const ready = await app.audioPlayer.unlock(); if (!ready) throw new Error('请先开启顶部音效开关'); const played = await app.audioPlayer.play({ type: 'Button', audio: { enabled: true, volume: 1, pitch: 1, events: { preview: id } } }, 'preview', { [id]: draft }); $('#sound-preview-status').textContent = played ? `正在试听：${draft.name} · 音量 ${Math.round(draft.volume * 100)}% · 音高 ${draft.pitch}` : '请稍后再次试听'; $('#sound-preview-status').dataset.played = String(played); } catch (error) { toast(error.message, true); }
  };
  $('#sound-stop').onclick = () => app.audioPlayer.stop();
  $('#sound-replace').onchange = async e => { try { const file = e.target.files[0]; if (!file) return; const updated = soundAsset(id, draft.name, new Uint8Array(await file.arrayBuffer())); for (const key of ['source', 'duration', 'sampleRate', 'channels', 'bytes']) draft[key] = updated[key]; $('#sound-meta').textContent = `${Math.round(draft.duration * 1000)} ms · ${draft.sampleRate} Hz · ${draft.channels} 声道`; } catch (error) { toast(error.message, true); } };
  const save = copy => { try { read(); if (copy) { draft.id = uid(); draft.name += ' 副本'; } app.store.transaction('保存 UI 音效', doc => { doc.sounds[draft.id] = structuredClone(draft); }); $('#modal').close(); app.notify('音效资产已保存'); } catch (error) { toast(error.message, true); } };
  $('#sound-save').onclick = () => save(false); $('#sound-copy').onclick = () => save(true);
  $('#sound-delete').onclick = () => { let refs = 0; const find = root => walk(root, n => { if (Object.values(n.audio?.events || {}).includes(id) || Object.values(n.overrides || {}).some(p => Object.values(p.audio?.events || {}).includes(id))) refs++; }); find(app.store.document.root); Object.values(app.store.document.prefabs).forEach(p => find(p.root)); if (refs) return toast(`音效被 ${refs} 处引用，请先解除绑定`, true); app.store.transaction('删除音效', doc => { delete doc.sounds[id]; }); $('#modal').close(); };
}
