// Screen-space labels anchored to actual ground loot. No inventory or combat mutations here.
import { lootStyle } from './prefabs/loot-style.js';

export class GroundLootOverlay {
  constructor(root, onPick, { onEnter = () => {}, onLeave = () => {} } = {}) {
    this.root = root; this.onPick = onPick; this.onEnter = onEnter; this.onLeave = onLeave;
    this.labels = new Map(); this.sizes = new WeakMap();
  }
  update(scene, drops, hero, selected = '', visible = true) {
    this.root.hidden = !visible;
    if (!visible) { this.onLeave(null, true); return; }
    const alive = new Set(), placed = [];
    const ordered = drops.filter(d => !d.claimed).sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y)).slice(0, 96);
    for (const drop of ordered) {
      const anchor = scene.lootAnchor(drop.key);
      if (!anchor) continue;
      const at = scene.project(anchor);
      if (!at) continue;
      alive.add(drop.key);
      let label = this.labels.get(drop.key);
      if (!label) {
        label = document.createElement('button'); label.type = 'button'; label.className = `b3-loot-label r-${drop.rarity}`;
        const style = lootStyle(drop);
        if (style.family) {
          label.classList.add('loot-special'); label.dataset.lootFamily = style.family;
          label.dataset.lootMark = style.mark; label.dataset.currencyGrade = drop.currencyGrade || '';
          label.style.setProperty('--loot-color', style.cssColor);
        }
        label.style.visibility = 'hidden';
        label.textContent = `${drop.tier ? 'T' + drop.tier + ' · ' : ''}${drop.name}${drop.item?.identified === false ? ' · 未鉴定' : ''}${drop.count > 1 ? ' ×' + drop.count : ''}`;
        label.setAttribute('aria-label', `拾取${drop.name}`);
        label.setAttribute('aria-haspopup', 'dialog');
        label.addEventListener('pointerenter', () => this.onEnter(drop, label));
        label.addEventListener('pointerleave', () => this.onLeave(drop.key));
        label.addEventListener('focus', () => this.onEnter(drop, label));
        label.addEventListener('blur', () => this.onLeave(drop.key));
        label.addEventListener('pointerdown', e => e.stopPropagation());
        label.addEventListener('click', e => { e.stopPropagation(); this.onPick(drop.key); });
        this.root.append(label); this.labels.set(drop.key, label);
      }
      // Text is fixed for this drop. Measure once, before labels may be hidden by packing.
      if (!this.sizes.has(label)) this.sizes.set(label, { width: label.offsetWidth, height: label.offsetHeight || 24 });
      const { width, height } = this.sizes.get(label);
      const anchorX = Math.max(4, Math.min(scene.width - width - 4, at.x - width / 2)), anchorY = Math.max(4, Math.min(scene.height - height - 4, at.y));
      let x = anchorX, y = anchorY, found = false;
      for (let n = 0; n < 100; n++) {
        const row = n % 20, col = Math.floor(n / 20);
        x = anchorX + Math.ceil(col / 2) * (col % 2 ? -1 : 1) * (width + 4);
        y = anchorY + Math.ceil(row / 2) * (row % 2 ? -1 : 1) * (height + 3);
        if (x < 4 || y < 4 || x + width > scene.width - 4 || y + height > scene.height - 4) continue;
        if (!placed.some(r => x < r.x + r.w + 3 && x + width + 3 > r.x && y < r.y + r.h + 3 && y + height + 3 > r.y)) { found = true; break; }
      }
      label.hidden = !found;
      if (!found) { this.onLeave(drop.key, true); continue; }
      placed.push({ x, y, w: width, h: height });
      label.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      label.style.visibility = 'visible';
      label.classList.toggle('picking', selected === drop.key);
    }
    for (const [key, label] of this.labels) if (!alive.has(key)) { this.onLeave(key, true); label.remove(); this.labels.delete(key); }
  }
  dispose() { this.onLeave(null, true); for (const label of this.labels.values()) label.remove(); this.labels.clear(); }
}
