import { walk } from '../core/model.js';
import { SAMPLE_SKILLS, SAMPLE_ITEMS } from '../assets/rulestudio-hud/definition.js';
import { skillChoiceInstance, skillPickerHeight } from '../assets/rulestudio-hud/skill-picker.js';
import { BattleSuiteController } from './battle-suite.js';
import { SUITE } from '../assets/rulestudio-hud/suite-pages.js';
import { MAP_CORE_CATALOG } from '../assets/rulestudio-hud/map-core-selector.js';
import { projectMapCores, decorateMapCores } from './map-core-selector.js';

// UI-only state. RuleStudio's battle engine can replace this model through the same projection.
// Slot selection, picker visibility and loadout membership are deliberately separate values.
export class BattleHudState {
  constructor(config = {}) {
    this.catalog = structuredClone(config.skills || SAMPLE_SKILLS);
    this.interfaceIds = new Set((config.interfaceCatalog || []).map(page => page.id));
    this.available = new Set(config.availableSkills ?? this.catalog.map(s => s.id));
    const seen = new Set();
    this.skills = Array.from({ length: 4 }, (_, i) => { const id = (config.loadout || ['flame_burst'])[i]; if (!this.choices.some(s => s.id === id) || seen.has(id)) return null; seen.add(id); return id; });
    this.selected = Number.isInteger(config.selected) && config.selected >= 0 && config.selected < 4 ? config.selected : 0;
    this.picker = -1; this.panel = ''; this.mapTab = 'equipment'; this.bd = false; this.phase = 'waves';
    this.mapCores = structuredClone(config.mapCores || MAP_CORE_CATALOG);
    this.mapCoreId = this.mapCores.some(core => core.id === config.mapCore) ? config.mapCore : this.mapCores[0]?.id;
    this.mapPicker = false;
    this.belt = [null, null, null, null]; this.beltCount = 12; this.bagSelection = -1;
    this.hunterEnabled = true; this.hunterAffixes = new Set(); this.hunterCurrencies = new Set();
    this.settings = { loot: true, 'time-limit': false, god: true, 'auto-cast': false }; this.paused = false;
    this.suiteVersion = config.suiteVersion;
    this.atlasEntry = config.combatLayout?.atlasEntry || 'atlas';
    this.beltKeys = config.combatLayout ? ['Q', 'E', 'T', 'G'] : ['Q', 'E', 'F', 'G'];
    this.message = '点击技能槽装配 · 1–4 切换当前槽 · B 背包 · C 属性 · Esc 关闭面板';
  }
  get choices() { return this.catalog.filter(s => this.available.has(s.id)); }
  get mapCore() { return this.mapCores.find(core => core.id === this.mapCoreId); }
  setAvailability(ids) {
    this.available = new Set(ids); this.skills = this.skills.map(id => this.choices.some(s => s.id === id) ? id : null);
  }
  choiceRows() {
    return this.choices.map(skill => {
      const assigned = this.skills.indexOf(skill.id), current = assigned >= 0 && assigned === this.picker;
      return { ...skill, current, assigned, caption: (skill.granted ? '装备授予' : '已拥有') + (assigned < 0 ? '' : current ? ' · 当前槽位' : ` · 从槽 ${assigned + 1} 移入`) };
    });
  }
  select(slot, picker = false) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 4) return false;
    this.selected = slot;
    this.mapPicker = false;
    this.picker = picker && this.picker !== slot ? slot : -1;
    this.panel = '';
    this.message = `当前技能槽 ${slot + 1}：${this.choices.find(s => s.id === this.skills[slot])?.name || '空槽'}${this.picker >= 0 ? ' · 装配列表已打开' : ''}`;
    return true;
  }
  assign(id) {
    if (this.picker < 0 || id && !this.choices.some(s => s.id === id) || !id && !this.skills[this.picker]) return false;
    const slot = this.picker;
    this.skills = this.skills.map(value => value === id ? null : value); this.skills[slot] = id || null;
    this.selected = slot; this.picker = -1; this.message = id ? `已装配 ${this.choices.find(s => s.id === id).name} 到 ${slot + 1} 号槽` : `已清空 ${slot + 1} 号槽`;
    return true;
  }
  close() {
    const wasOpen = this.picker >= 0 || !!this.panel || this.mapPicker; this.picker = -1; this.panel = ''; this.mapPicker = false;
    if (wasOpen) this.message = `当前技能槽 ${this.selected + 1}：${this.choices.find(s => s.id === this.skills[this.selected])?.name || '空槽'}`;
    return wasOpen;
  }
  open(kind) {
    this.mapPicker = false;
    if (kind === 'skills') return this.select(this.selected, true);
    if (kind === 'bd') { this.bd = !this.bd; this.panel = ''; return true; }
    if (kind === 'map' || kind === 'lineage') { this.mapTab = kind === 'map' ? 'equipment' : 'lineage'; this.panel = ''; return true; }
    const panel = kind === 'equipment' || kind === 'belt' && !this.suiteVersion ? 'loadout' : kind;
    if (!this.interfaceIds.has(panel) && !['inventory', 'character', 'loadout', 'hunter', 'settings', 'shop', 'craft', 'tooltip', 'completion', 'death', ...Object.keys(SUITE)].includes(panel)) return false;
    this.panel = this.panel === panel ? '' : panel; this.picker = -1; return true;
  }
  activate(action) {
    if (!action) return false;
    const { type, value } = action;
    if (type === 'map-core') {
      if (action.op === 'open') { this.mapPicker = !this.mapPicker; this.mapTab = 'equipment'; this.picker = -1; this.panel = ''; return true; }
      if (action.op === 'close') { this.mapPicker = false; return true; }
      if (action.op === 'equip' && this.mapCores.some(core => core.id === value)) {
        this.mapCoreId = value; this.mapPicker = false; this.message = `已装配 ${this.mapCore.name} · 怪物群 +${this.mapCore.packs}%`; return true;
      }
      return false;
    }
    if (type === 'ability') return this.select(value, true);
    if (type === 'assign') return this.assign(value);
    if (type === 'function') return this.open(value);
    if (type === 'close') return this.close();
    if (type === 'map-tab') { this.mapTab = value; if (value !== 'equipment') this.mapPicker = false; return true; }
    if (type === 'bd') { this.bd = !this.bd; return true; }
    if (type === 'build') { this.message = '构筑卡片预览：战斗数据可通过 presentation 接口接入'; return true; }
    if (type === 'bag-select') { this.bagSelection = value; return true; }
    if (type === 'item-detail') { this.panel = 'tooltip'; return true; }
    if (type === 'sort') { this.message = '背包预览按装备、物品、通货排列'; return true; }
    if (type === 'bag-page') return false;
    if (type === 'hunter-toggle') { this.hunterEnabled = !this.hunterEnabled; return true; }
    if (type === 'hunter-affix' || type === 'hunter-currency') { const set = type === 'hunter-affix' ? this.hunterAffixes : this.hunterCurrencies; if (set.has(value)) set.delete(value); else set.add(value); return true; }
    if (type === 'setting') { if (Object.hasOwn(this.settings, value)) this.settings[value] = !this.settings[value]; else this.message = '当前为可编辑的战场设置预览'; return true; }
    if (type === 'pause') { this.paused = !this.paused; return true; }
    if (type === 'equip-belt') { this.belt[0] = 'health-potion'; this.message = '气血药剂已配入 Q 槽'; return true; }
    if (type === 'belt') {
      if (!this.belt[value] || this.beltCount <= 0) { this.message = `${this.beltKeys[value]} 槽为空，未使用消耗品`; return true; }
      this.beltCount--; this.message = `使用气血药剂 · 剩余 ${this.beltCount}`; return true;
    }
    if (type === 'restart') { this.close(); this.paused = false; this.message = '预览已重置 · 仍保留当前技能配置'; return true; }
    return false;
  }
  key(code) {
    if (/^Digit[1-4]$/.test(code)) return this.select(Number(code.slice(5)) - 1);
    if (code === 'Escape') return this.close();
    if (code === 'KeyB' || code === 'KeyC') return this.open(code === 'KeyB' ? 'inventory' : 'character');
    const belt = this.beltKeys.findIndex(key => code === `Key${key}`); if (belt >= 0) return this.activate({ type: 'belt', value: belt });
    if (code === 'KeyR' && this.panel === 'death') return this.activate({ type: 'restart' });
    if (code === 'KeyM') return this.open(this.atlasEntry);
    return false;
  }
}

export class BattleHudController {
  constructor(runtime, { onStatus = () => {}, onRender = () => {}, keyboard = true, session = null } = {}) {
    this.runtime = runtime; this.state = session?.hud || new BattleHudState({...runtime.project.presentation, interfaceCatalog:runtime.project.interfaceCatalog}); this.onStatus = onStatus; this.onRender = onRender;
    this.events = new AbortController(); this.applied = new Map(); this.listPrefix = `choice_${crypto.randomUUID().replaceAll('-', '')}`;
    this.suite = runtime.project.presentation?.suiteVersion ? new BattleSuiteController(this) : null;
    if(this.suite && session?.suite)this.suite.state=session.suite;
    if(this.suite?.standalone==='craft')this.suite.state.act('craft-select',this.suite.state.craftItem);
    if(this.suite?.standalone==='split' && this.suite.state.item?.count<=1)this.suite.state.selected='stone-low';
    if(this.suite?.standalone==='unidentified'){this.suite.state.select('gear-7');this.suite.state.item.unidentified=true;}
    runtime.addEventListener('paint', () => this.decorate(), { signal: this.events.signal });
    runtime.addEventListener('activate', e => {
      const before=this.state.picker,action=e.detail.node.action;let changed;
      if(this.suite?.standalone&&action?.type==='function'){this.suite.navigate(action.value);changed=true;}
      else if(this.suite?.standalone&&action?.type==='ability'){this.state.select(action.value);this.suite.navigate('skills');changed=true;}
      else if(this.suite&&action?.type==='build'){this.suite.navigate('builds');changed=true;}
      else changed=action?.type==='battle-ui'?this.suite?.activate(action,e.detail.node):this.state.activate(action);
      if(changed){this.refresh();this.focusPicker(before);}
    }, { signal: this.events.signal });
    window.addEventListener('pointerdown', e => {
      if (this.state.mapPicker) {
        const insideMap = [...runtime.nodes.values()].filter(n => n.binding === 'map-core-equipped' || n.binding === 'map-core-picker').some(n => runtime.renderer.groups.get(n.id)?.group.contains(e.target));
        if (!insideMap) { this.state.mapPicker = false; this.refresh(); }
      }
      if (this.state.picker < 0) return;
      const inside = [...runtime.nodes.values()].filter(n => n.binding === 'ability' || n.binding === 'picker').some(n => runtime.renderer.groups.get(n.id)?.group.contains(e.target));
      if (!inside) { this.state.close(); this.refresh(); }
    }, { capture: true, signal: this.events.signal });
    if (keyboard) window.addEventListener('keydown', e => {
      if(this.suite?.inspector.handleKey(e))return;
      if(this.suite?.inspector.contains(e.target))return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
      const before = this.state.picker;
      if(this.suite&&(this.suite.standalone==='atlas'||this.state.panel==='atlas')&&['KeyF','Equal','NumpadAdd','Minus','NumpadSubtract'].includes(e.code)){e.preventDefault();e.stopPropagation();this.suite.state.act(e.code==='KeyF'?'atlas-center':'atlas-zoom',['Minus','NumpadSubtract'].includes(e.code)?-1:1);this.refresh();return;}
      if(this.suite?.standalone&&['KeyB','KeyC','KeyM'].includes(e.code)){e.preventDefault();e.stopPropagation();this.suite.navigate({KeyB:'inventory',KeyC:'character',KeyM:'atlas'}[e.code]);return;}
      if(this.suite?.standalone&&['death','timeout'].includes(this.suite.standalone)&&e.code==='KeyR'){e.preventDefault();e.stopPropagation();this.suite.activate({op:'challenge'});this.refresh();return;}
      if(e.code === 'Escape' && this.suite?.state.overlays.length){ e.preventDefault(); e.stopPropagation(); this.suite.state.overlays.pop(); this.refresh(); return; }
      if(e.code==='Escape' && this.suite?.standalone){e.preventDefault();e.stopPropagation();this.suite.navigate('normal');return;}
      if (this.state.key(e.code)) { e.preventDefault(); e.stopPropagation(); this.refresh(); this.focusPicker(before); }
    }, { capture: true, signal: this.events.signal });
    this.refresh();
  }
  refresh() {
    this.suite?.prepare();
    const runtime = this.runtime, s = this.state, updates = new Map();
    const signature = JSON.stringify(s.choices);
    if (signature !== this.listSignature) {
      for (const list of [...runtime.nodes.values()].filter(n => n.binding === 'picker-list')) runtime.setChildren(list.id, s.choices.map((skill, i) => skillChoiceInstance(skill, i, `${this.listPrefix}_${i}`)));
      this.listSignature = signature; this.applied.clear();
    }
    const patch = (node, value) => { if (node) updates.set(node.id, { ...(updates.get(node.id) || {}), ...value }); };
    const roles = new Map(); for (const node of runtime.nodes.values()) if (node.binding) { const list = roles.get(node.binding) || []; list.push(node); roles.set(node.binding, list); }
    const role = (name, value) => { for (const node of roles.get(name) || []) patch(node, value); };
    const visible = (name, value) => role(name, { visibility: value ? 'visible' : 'collapsed' });
    this.suite?.project(roles,patch);
    projectMapCores(runtime, s, role, patch);
    for (const node of roles.get('ability') || []) {
      const slot = node.action?.value, skill = s.choices.find(c => c.id === s.skills[slot]);
      const family = skill ? 'skill-filled' : 'skill-empty';
      patch(node, { brushes: Object.fromEntries(['normal', 'hovered', 'pressed', 'disabled'].map(k => [k, `hud-svg-${family}-${k}`])) });
      walk(node, child => {
        if (child.id.endsWith('hud-ability-name')) patch(child, { text: skill?.name || '空槽' });
        if (child.id.endsWith('hud-ability-flame')) patch(child, { visibility: skill ? 'visible' : 'collapsed', svgAsset: skill?.icon || 'hud-svg-flame-glyph', style: { clip: skill?.iconMode === 'tile', radius: skill?.iconMode === 'tile' ? 11.5 : 0 }, slot: { offsets: skill?.iconMode === 'tile' ? { left: 1, top: 1, right: 72, bottom: 72 } : { left: 21, top: 9, right: 32, bottom: 34 } } });
        if (child.id.endsWith('hud-ability-key') || child.id.endsWith('hud-ability-name') || child.id.endsWith('hud-ability-equipped')) patch(child, { ...(child.id.endsWith('hud-ability-name') ? { text: skill?.name || '空槽' } : child.id.endsWith('hud-ability-equipped') ? { visibility: skill?.granted ? 'visible' : 'collapsed' } : {}), slot: { zOrder: 20 }, style: { fill: skill?.iconMode === 'tile' ? '#060a11b8' : 'transparent', radius: 3 } });
        if (child.id.endsWith('hud-ability-plus')) patch(child, { visibility: skill ? 'collapsed' : 'visible' });
        if (child.id.endsWith('hud-ability-equipped')) patch(child, { visibility: skill?.granted ? 'visible' : 'collapsed' });
        if (child.id.endsWith('hud-ability-selected')) patch(child, { visibility: slot === s.selected ? 'visible' : 'collapsed', svgAsset: skill ? 'rs-svg-selection-filled' : 'hud-svg-selection' });
      });
      const group = runtime.renderer.groups.get(node.id)?.group;
      group?.setAttribute('aria-pressed', String(slot === s.selected)); group?.setAttribute('aria-expanded', String(s.picker === slot)); group?.setAttribute('aria-haspopup', 'dialog'); group?.setAttribute('aria-label', `主动技能 ${slot + 1}：${skill?.name || '空槽'}`);
    }
    visible('picker', s.picker >= 0); role('picker-slot', { text: `槽位 ${s.picker + 1}` });
    role('picker', { visibility: s.picker >= 0 ? 'visible' : 'collapsed', slot: { offsets: { bottom: skillPickerHeight(s.choices.length) } } });
    visible('picker-empty', !s.choices.length);
    const rows = s.choiceRows();
    for (const n of roles.get('skill-choice') || []) {
      const row = rows.find(r => r.id === n.action.value); if (!row) continue;
      patch(n, { brushes: { normal: `rs-svg-choice-${row.current ? 'selected' : 'normal'}` } });
      walk(n, child => {
        if (child.binding === 'choice-name') patch(child, { text: row.name });
        if (child.binding === 'choice-source') patch(child, { text: row.caption });
        if (child.binding === 'choice-icon') patch(child, { svgAsset: row.icon });
        if (child.binding === 'choice-equipped') patch(child, { visibility: row.current ? 'visible' : 'collapsed' });
      });
    }
    for (const n of roles.get('picker-clear') || []) {
      const enabled = s.picker >= 0 && !!s.skills[s.picker]; patch(n, { interactable: enabled });
      patch(n.children[0], { style: { color: enabled ? '#bcc9da' : '#536279' } });
    }
    visible('modal-layer', !!s.panel);
    visible('boss', s.phase === 'boss');
    for (const kind of ['inventory', 'character', 'loadout', 'hunter', 'settings', 'shop', 'craft', 'tooltip', 'completion', 'death']) visible(`window-${kind}`, s.panel === kind);
    visible('map-equipment', s.mapTab === 'equipment'); visible('map-lineage', s.mapTab === 'lineage');
    for (const tab of ['equipment', 'lineage']) role(`tab-${tab}`, { brushes: { normal: `rs-svg-${tab === s.mapTab ? 'tab' : 'button-normal'}` } });
    visible('bd-content', s.bd); role('bd-box', { layout: { height: s.bd ? 366 : 34 } });
    for (const node of roles.get('bd-box') || []) walk(node, child => { if (child.id.endsWith('rs-builds-bg')) patch(child, { slot: { offsets: { bottom: s.bd ? 366 : 34 } } }); });
    for (let i = 0; i < 4; i++) {
      const skill = s.choices.find(c => c.id === s.skills[i]);
      for (const n of roles.get(`loadout-${i}`) || []) patch(n.children[0], { text: `${i + 1}     ${skill?.name || '空槽'}    ▾` });
      for (const n of roles.get(`belt-${i}`) || []) {
        // Empty belt slots never claim an item was consumed. The Q preview label is separate text.
        walk(n, child => { if (child.id.endsWith('hud-quick-key')) patch(child, { text: `${s.beltKeys[i]}${s.belt[i] ? ' · ' + s.beltCount : ''}`, style: { fontSize: s.belt[i] ? 8 : 10 } }); });
      }
    }
    role('hunter-enabled', { brushes: { normal: `rs-svg-${s.hunterEnabled ? 'tab' : 'button-normal'}` } });
    for (const n of roles.get('hunter-enabled') || []) patch(n.children[0], { text: `${s.hunterEnabled ? '✓' : '□'} 启用过滤                ${s.hunterEnabled ? '已开启' : '已关闭'}` });
    for (let i = 0; i < 8; i++) role(`hunter-affix-${i}`, { brushes: { normal: `rs-svg-${s.hunterAffixes.has(i) ? 'tab' : 'button-normal'}` } });
    for (let i = 0; i < 4; i++) role(`hunter-currency-${i}`, { brushes: { normal: `rs-svg-${s.hunterCurrencies.has(i) ? 'tab' : 'button-normal'}` } });
    role('bag-detail', { text: s.bagSelection < 0 ? '选择物品以查看详情' : `${SAMPLE_ITEMS[s.bagSelection]}   ${s.bagSelection < 2 ? 'T1 · 装备' : '×12'}` });
    for (let i = 0; i < 8; i++) role(`bag-cell-${i}`, { brushes: { normal: `rs-svg-${s.bagSelection === i ? 'cell-selected' : 'cell'}` } });
    for (const [key, value] of Object.entries(s.settings)) for (const node of roles.get(`setting-${key}`) || []) patch(node.children[0], { text: `${value ? '✓' : '□'}  ${{ loot: '显示地面掉落', 'time-limit': '30 秒限时', god: '无敌', 'auto-cast': '自动施法' }[key]}` });
    for (const node of roles.get('pause') || []) patch(node.children[0], { text: s.paused ? '继续' : '暂停' });
    if (s.panel === 'tooltip' && s.bagSelection >= 0) { role('tooltip-title', { text: SAMPLE_ITEMS[s.bagSelection] }); role('tooltip-kind', { text: s.bagSelection < 2 ? '装备 · T1' : '物品 · 通货' }); role('tooltip-description', { text: '物品卡片、名称、图标和属性均为独立 SVG 控件。可接入角色背包数据。' }); }
    for (const [id, value] of [...updates]) {
      const serialized = JSON.stringify(value); if (this.applied.get(id) === serialized) updates.delete(id); else this.applied.set(id, serialized);
    }
    runtime.setMany(updates);
    if (this.audioSelected !== undefined && this.audioSelected !== s.selected) { const target = [...runtime.nodes.values()].find(n => n.binding === 'ability' && n.action?.value === s.selected); if (target) void runtime.playSound(target.id, 'selected'); }
    this.audioSelected = s.selected;
    this.decorate();
    this.onStatus(s.message); this.onRender();
  }
  decorate() {
    const { runtime, state: s } = this;
    decorateMapCores(runtime, s);
    for (const n of runtime.nodes.values()) {
      const group = runtime.renderer.groups.get(n.id)?.group; if (!group) continue;
      if (n.binding === 'ability') {
        const slot = n.action.value, skill = s.choices.find(c => c.id === s.skills[slot]);
        group.setAttribute('aria-pressed', String(slot === s.selected)); group.setAttribute('aria-expanded', String(slot === s.picker)); group.setAttribute('aria-haspopup', 'dialog'); group.setAttribute('aria-label', `主动技能 ${slot + 1}：${skill?.name || '空槽'}`);
      } else if (n.binding === 'skill-choice') group.setAttribute('aria-pressed', String(s.picker >= 0 && s.skills[s.picker] === n.action.value));
      else if (n.binding === 'picker') { group.setAttribute('role', 'dialog'); group.setAttribute('aria-label', `装配主动技能：槽位 ${s.picker + 1}`); }
    }
  }
  focusPicker(before) {
    const { runtime, state: s } = this;
    let target;
    if (s.picker >= 0 && before !== s.picker) target = [...runtime.nodes.values()].find(n => n.binding === 'skill-choice') || [...runtime.nodes.values()].find(n => n.id.endsWith('rs-picker-close'));
    else if (before >= 0 && s.picker < 0) target = [...runtime.nodes.values()].find(n => n.binding === 'ability' && n.action.value === s.selected);
    if (target) runtime.renderer.groups.get(target.id)?.group.focus({ preventScroll: true });
  }
  destroy() { this.suite?.destroy(); this.events.abort(); }
}

export function attachPresentation(runtime, options) {
  return runtime.project.presentation?.controller === 'rulestudio-battle-hud' ? new BattleHudController(runtime, options) : null;
}
