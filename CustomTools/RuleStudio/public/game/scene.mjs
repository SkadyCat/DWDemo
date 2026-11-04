// 3D 画面：地牢、英雄、怪物（实例化）、掉落、特效；以及头顶血条与伤害数字的 DOM 叠加层。
import * as THREE from '../vendor/three.module.js';
import { assetUrl } from '../asset-url.mjs';
import { createDungeonFloor } from '../prefabs/dungeon-floor.mjs';
import { createDungeonPortal } from '../prefabs/dungeon-portal.mjs';
import { createHubProps } from '../prefabs/hub-props.mjs';
import { createLootMarkers } from '../prefabs/loot-markers.mjs';
import { createPost } from '../vfx/post.mjs';
import { createEffects } from './effects.mjs';
import { Characters } from './characters.mjs';
import { Treasury } from './treasury.mjs';
import { rarityOf, itemName, CURRENCIES, baseLinesOf } from '../../core/content/items.mjs';
import { waystoneName } from './waystones.mjs';
import { scarabName, scarabText } from './scarabs.mjs';

const M = 0.01;
const toV = (x, y, h = 0) => new THREE.Vector3(x * M, h, -y * M);
const sizeOf = m => m.boss ? 2.2 : m.kind === 'elite' ? 1.25 : 0.95;
// How each summoned minion looks (the glow and trails come from the effects layer).
const MINION_LOOK = {
  skeleton: { color: 0xe8e2cf, size: 0.85, wide: 0.8 }, flame_golem: { color: 0x7a2a10, size: 2.0, wide: 1.25 },
  spectral_archer: { color: 0x9fd8ff, size: 0.85, wide: 0.75, float: 0.15 }, spider: { color: 0x3f6b2a, size: 0.55, wide: 1.5, tall: 0.5 },
  frost_wisp: { color: 0xbff4ff, size: 0.5, wide: 0.9, tall: 0.7, float: 0.5, spin: 6 }, wolf: { color: 0x5a5470, size: 0.9, wide: 1.2, tall: 0.75 },
  blood_fiend: { color: 0x9a1418, size: 1.05 }, ballista: { color: 0x8a6a3a, size: 0.9, wide: 1.3, tall: 0.6 }, wraith: { color: 0x7b4bb8, size: 0.85, wide: 0.7, float: 0.35 },
};
const RARITY_KEY = { normal: 'common', magic: 'magic', rare: 'rare', exalted: 'legendary', legendary: 'unique' };

export class Scene3D {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.prepend(this.renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090c12);
    scene.fog = new THREE.Fog(0x090c12, 22, 58);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.zoom = 0.85;
    this.opts = { resScale: 1, shadows: true, bloom: 1, shake: 1, zoom: 1, flashes: true };
    this.hemi = new THREE.HemisphereLight(0xb8c8ff, 0x302418, 1.4); this.amb = new THREE.AmbientLight(0x404a60, 0.6); scene.add(this.hemi, this.amb);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.portal = createDungeonPortal(); scene.add(this.portal.group);

    const hero = this.hero = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.75, 6, 14), new THREE.MeshStandardMaterial({ color: 0xf2bf33, roughness: 0.45, metalness: 0.3 }));
    body.position.y = 0.7; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe2a8, roughness: 0.6 }));
    head.position.set(0, 1.45, 0); head.castShadow = true;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a3f }));
    staff.position.set(0.38, 0.85, 0.15);
    const focus = this.heroFocus = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0x8fdcff }));
    focus.position.set(0.38, 1.65, 0.15);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 40), new THREE.MeshBasicMaterial({ color: 0x33e6ff, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    hero.add(body, head, staff, focus, ring); scene.add(hero);
    this.heroParts = [body, head, staff, focus];
    // The real low-poly models and animation; until they load (or if they fail) the capsules stand in.
    this.chars = new Characters(scene);
    this.treasury = new Treasury(scene);
    this.aimArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 12), new THREE.MeshBasicMaterial({ color: 0x33e6ff, transparent: true, opacity: 0.85 }));
    scene.add(this.aimArrow);

    const CAP = 512;
    this.monsterBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.34, 0.45, 4, 12), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 }), CAP);
    this.monsterBody.castShadow = true;
    const visorGeo = new THREE.BoxGeometry(0.34, 0.07, 0.06); visorGeo.translate(0, 0.22, 0.31);
    this.monsterVisor = new THREE.InstancedMesh(visorGeo, new THREE.MeshBasicMaterial({ color: 0xffb070 }), CAP);
    const hornGeo = new THREE.ConeGeometry(0.08, 0.28, 6); hornGeo.translate(0, 0.62, 0);
    this.monsterHorn = new THREE.InstancedMesh(hornGeo, new THREE.MeshStandardMaterial({ color: 0x2a1a1a, roughness: 0.6 }), CAP);
    for (const mesh of [this.monsterBody, this.monsterVisor, this.monsterHorn]) { mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); }
    this.monsterBody.setColorAt(0, new THREE.Color());
    // Minions (skeletons, golems, wolves…): one instanced body, coloured and sized by template.
    this.minionBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.4, 4, 10), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.15, emissive: 0x111111 }), 256);
    this.minionBody.count = 0; this.minionBody.frustumCulled = false; this.minionBody.castShadow = true; this.minionBody.setColorAt(0, new THREE.Color()); scene.add(this.minionBody);

    this.effects = createEffects(THREE, scene);
    this.loot = createLootMarkers(THREE); scene.add(this.loot.group);
    this.post = createPost(THREE, this.renderer);
    this.camBase = new THREE.Vector3();
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), e: new THREE.Euler() };
    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }
  pick(px, py) {
    const ndc = new THREE.Vector2(px / this.width * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit) ? { x: hit.x / M, y: -hit.z / M } : null;
  }
  project(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) return null;
    return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height };
  }

  update(run, time) {
    const { m, q, s, p, c, e } = this.tmp, hero = run.hero, hp = toV(hero.x, hero.y);
    if (this.layout !== run.dungeon) {
      this.floor?.dispose();
      this.layout = run.dungeon;
      this.floor = createDungeonFloor(run.dungeon); this.scene.add(this.floor.group);
      this.hubProps?.dispose(); this.hubProps = run.hub ? createHubProps(run) : null;
      if (this.hubProps) this.scene.add(this.hubProps.group);
      this.camBase.set(hp.x, 15.5 * this.zoom * (run.hub ? 1.2 : 1), hp.z + 10.5 * this.zoom * (run.hub ? 1.2 : 1));
      this.loot.reset();
    }
    const offset = new THREE.Vector3(0, 15.5, 10.5).multiplyScalar(this.zoom * (run.hub ? 1.2 : 1));   // the town wants a wider view
    this.camBase.lerp(new THREE.Vector3(hp.x, 0, hp.z).add(offset), 0.12);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camBase.clone().sub(offset));
    if (this.fxState) this.camera.position.addScaledVector(this.fxState.shake, this.opts.shake);
    this.sun.position.set(hp.x + 10, 22, hp.z + 6); this.sun.target.position.set(hp.x, 0, hp.z);
    // home: when 诺娅 turns the lamp down for the night, the town goes dim and warm (lamps and windows keep glowing)
    const night = run.hub ? run.town?.night ?? 0 : 0;
    this.sun.intensity = 2.2 * (1 - 0.6 * night); this.hemi.intensity = 1.4 * (1 - 0.5 * night); this.amb.intensity = 0.6 * (1 - 0.3 * night);

    this.portal.update(run.portal ? { x: run.portal.x, y: run.portal.y, radius: 90, active: true } : null, time);
    this.hubProps?.update(time, run.hero, run.town?.night ?? 0);
    const dt = this.lastRun === run ? run.elapsed - this.lastElapsed : 0;
    this.lastRun = run; this.lastElapsed = run.elapsed;
    const ch = this.chars.update(run, dt);
    this.treasury.update(run, time);
    for (const part of this.heroParts) part.visible = !ch.hero;
    this.hero.visible = hero.alive;
    this.hero.position.copy(hp);
    this.hero.rotation.y = Math.atan2(hero.aim.x, -hero.aim.y);
    this.heroFocus.rotation.y = time * 3;
    this.aimArrow.visible = hero.alive;
    this.aimArrow.position.set(hp.x + hero.aim.x * 1.1, 0.12, hp.z - hero.aim.y * 1.1);
    this.aimArrow.lookAt(hp.x + hero.aim.x * 3, 0.12, hp.z - hero.aim.y * 3);
    this.aimArrow.rotateX(Math.PI / 2);

    let n = 0;
    for (const mon of run.monsters) {
      if (n >= 512) break;
      if (ch.shown.has(mon.id)) continue;
      const size = sizeOf(mon), frozen = mon.hasStatus('frozen');
      const bob = frozen ? 0 : Math.abs(Math.sin(time * 9 + mon.id)) * 0.06, pulse = 1 + mon.hitFlash * 0.25;
      p.set(mon.x * M, (0.57 + bob) * size, -mon.y * M);
      e.set(0, Math.atan2(mon.facing.x, -mon.facing.y), 0); q.setFromEuler(e);
      s.set(size * pulse, size * (2 - pulse), size * pulse);
      m.compose(p, q, s);
      this.monsterBody.setMatrixAt(n, m); this.monsterVisor.setMatrixAt(n, m); this.monsterHorn.setMatrixAt(n, m);
      if (mon.hitFlash > 0.6) c.set(0xffffff); else if (frozen) c.set(0xc8f2ff); else c.set(run.monsterColor(mon));
      if (mon.kind === 'elite') c.lerp(new THREE.Color(0xffd75e), 0.25);
      this.monsterBody.setColorAt(n, c);
      ++n;
    }
    for (const mesh of [this.monsterBody, this.monsterVisor, this.monsterHorn]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    let k = 0;
    for (const mn of run.minions) {
      const look = MINION_LOOK[mn.template]; if (!look || k >= 256 || ch.shown.has(mn.id)) continue;
      const sz = look.size, bob = Math.abs(Math.sin(time * 8 + mn.id)) * 0.05 * sz;
      p.set(mn.x * M, (0.5 + bob) * sz + (look.float ?? 0), -mn.y * M);
      e.set(0, time * (look.spin ?? 0) + mn.id, 0); q.setFromEuler(e); s.set(sz * (look.wide ?? 1), sz * (look.tall ?? 1), sz * (look.wide ?? 1));
      m.compose(p, q, s); this.minionBody.setMatrixAt(k, m); this.minionBody.setColorAt(k, c.set(look.color)); ++k;
    }
    this.minionBody.count = k; this.minionBody.instanceMatrix.needsUpdate = true; if (this.minionBody.instanceColor) this.minionBody.instanceColor.needsUpdate = true;
    if (this.monsterBody.instanceColor) this.monsterBody.instanceColor.needsUpdate = true;

    this.camera.updateMatrixWorld();
    this.fxState = this.effects.update(run, this.camera);
    this.loot.update(run.loot.map(l => {
      const d = l.drop, item = d.type === 'item';
      if (d.type === 'waystone' || d.type === 'scarab') return { key: l.key, x: l.x * M, z: -l.y * M, sourceX: l.sourceX * M, sourceZ: -l.sourceY * M, kind: 'item', category: 'omen' };
      return { key: l.key, x: l.x * M, z: -l.y * M, sourceX: l.sourceX * M, sourceZ: -l.sourceY * M, kind: 'item',
        rarity: item ? RARITY_KEY[rarityOf(d.item).id] : undefined, category: item ? 'equipment' : 'currency', currencyGrade: item ? undefined : (d.id.startsWith('essence') ? 3 : d.id === 'chaos' || d.id === 'seal' ? 2 : 1) };
    }), run.elapsed, []);
    this.post.render(this.scene, this.camera, this.fxState ? { ...this.fxState, bloom: (this.fxState.bloom ?? .7) * this.opts.bloom, flash: this.opts.flashes ? this.fxState.flash : 0, aberration: this.opts.flashes ? this.fxState.aberration : 0 } : this.fxState);
  }

  lootAnchor(key) { return this.loot.anchor(key); }

  /** Settings: render scale, shadows, bloom, camera shake, camera distance. */
  applySettings(o) {
    this.opts = { ...this.opts, ...o };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.opts.resScale);
    if (this.renderer.shadowMap.enabled !== this.opts.shadows) { this.renderer.shadowMap.enabled = this.opts.shadows; this.sun.castShadow = this.opts.shadows; this.scene.traverse(m => { if (m.material) m.material.needsUpdate = true; }); }
    this.zoom = 0.85 * this.opts.zoom;
    this.resize?.();
  }
  dispose() { this.chars.dispose(); this.portal.dispose(); this.floor?.dispose(); this.effects.dispose(); this.loot.dispose(); this.post.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}

/** Health bars, ailment badges and floating damage numbers as DOM over the canvas. */
export class Overlay {
  constructor(root) {
    this.root = root; this.bars = []; this.floats = []; this.heroBar = this.makeBar('hero');
    this.labels = new Map();            // loot key -> { el, w, h }
    this.labelLayer = document.createElement('div'); this.labelLayer.className = 'lt-layer'; root.appendChild(this.labelLayer);
    this.showAll = false;               // hold Alt: also show plain (white) items
    this.opts = { damageNumbers: true, healthBars: 'all', lootFilter: 'default' };
  }
  /**
   * PoE-style ground labels: one name plate per drop, coloured by rarity, following the drop on screen.
   * Plates never overlap — a crowded pile stacks upward and a thin thread ties each plate to its drop.
   */
  updateLoot(scene, run, keepOut = null) {
    const rows = [];
    for (const l of run.loot) {
      if (!scene.lootAnchor(l.key)) continue;                       // still in the air
      const d = l.drop, item = d.type === 'item';
      const stone = d.type === 'waystone', scarab = d.type === 'scarab';
      const rid = item ? rarityOf(d.item).id : stone ? 'waystone' : scarab ? 'scarab' : 'currency';
      const bl = item ? baseLinesOf(d.item) : 0;
      if (!this.showAll && item && ((this.opts.lootFilter !== 'all' && rid === 'normal' && bl < 3) || (this.opts.lootFilter === 'rare' && rid === 'magic' && bl < 3))) continue;
      const at = scene.project(toV(l.x, l.y, 0.42));
      if (!at || at.x < -80 || at.y < -40 || at.x > scene.width + 80 || at.y > scene.height + 40) continue;
      let lab = this.labels.get(l.key);
      if (!lab) {
        const el = document.createElement('div');
        // Base lines 1–3: two and three get their own plate (pips, glow; three adds a light beam and a shimmer).
        const grade = item ? ` b${bl}` : stone ? ' w-' + d.stone.rarity : scarab ? ' g2' : d.id.startsWith('essence') ? ' g3' : d.id === 'chaos' || d.id === 'seal' ? ' g2' : '';
        el.className = `lt r-${rid}${grade}`; el.dataset.key = l.key;
        el.innerHTML = `${item && bl > 1 ? `<i class="pips">${'◆'.repeat(bl)}</i>` : ''}<span>${item ? itemName(d.item) : stone ? waystoneName(d.stone) : scarab ? scarabName(d.id) : CURRENCIES[d.id].name}</span>`;
        if (!item && !stone) el.title = scarab ? scarabText(d.id) : CURRENCIES[d.id].desc;
        this.labelLayer.appendChild(el);
        lab = { el, w: el.offsetWidth, h: el.offsetHeight };
        this.labels.set(l.key, lab);
      }
      rows.push({ key: l.key, lab, x: at.x, y: at.y, target: run.walkTo === l.key });
    }
    // Stack: nearest to the bottom of the screen first, each plate moves up until it is free.
    rows.sort((a, b) => b.y - a.y);
    const placed = keepOut ? [keepOut] : [];      // the portal plate stays put; loot plates stack around it
    for (const r of rows) {
      const w = r.lab.w, h = r.lab.h, x = r.x - w / 2;
      let y = r.y - h;
      for (let guard = 0; guard < 40; ++guard) {
        const hit = placed.find(p => x < p.x + p.w + 2 && x + w + 2 > p.x && y < p.y + p.h + 1 && y + h + 1 > p.y);
        if (!hit) break;
        y = hit.y - h - 1;
      }
      placed.push({ x, y, w, h });
      const el = r.lab.el;
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      el.style.setProperty('--thread', `${Math.max(0, r.y - (y + h)).toFixed(0)}px`);
      el.classList.toggle('target', r.target);
      el.style.display = '';
    }
    const live = new Set(rows.map(r => r.key)), exists = new Set(run.loot.map(l => l.key));
    for (const [key, lab] of this.labels) {
      if (!exists.has(key)) { lab.el.remove(); this.labels.delete(key); }
      else if (!live.has(key)) lab.el.style.display = 'none';
    }
  }
  clearLoot() { for (const lab of this.labels.values()) lab.el.remove(); this.labels.clear(); this.portalEl?.remove(); this.portalEl = null; for (const el of this.stationEls?.values() ?? []) el.remove(); this.stationEls?.clear(); }
  makeBar(kind = '') {
    const el = document.createElement('div');
    el.className = `hb${kind ? ' hb-' + kind : ''}`;
    el.innerHTML = '<div class="hb-st"></div><div class="hb-es"><i></i></div><div class="hb-bar"><i></i><b></b></div><div class="hb-name"></div>';
    this.root.appendChild(el);
    return { el, st: el.querySelector('.hb-st'), es: el.querySelector('.hb-es'), esFill: el.querySelector('.hb-es i'), fill: el.querySelector('.hb-bar i'), lag: el.querySelector('.hb-bar b'), name: el.querySelector('.hb-name'), key: '', lagPct: 100 };
  }
  setBar(bar, at, actor, statuses, label) {
    if (!at) { bar.el.style.display = 'none'; return; }
    bar.el.style.display = '';
    bar.el.style.transform = `translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0)`;
    const pct = Math.max(0, Math.min(100, 100 * actor.life / Math.max(1, actor.max.life)));
    bar.fill.style.width = `${pct}%`;
    bar.lagPct = Math.max(pct, bar.lagPct - 1.2);
    bar.lag.style.width = `${bar.lagPct}%`;
    const hasEs = actor.max.es > 0;
    bar.es.style.display = hasEs ? '' : 'none';
    if (hasEs) bar.esFill.style.width = `${100 * actor.es / actor.max.es}%`;
    const key = statuses.map(s => `${s.id}${s.stacks}${Math.ceil(s.remaining)}`).join('|');
    if (key !== bar.key) {
      bar.key = key;
      bar.st.innerHTML = statuses.map(s => `<span style="--c:${s.color}" title="${s.name}"><i class="st-ic" style="--i:url(${assetUrl(`/assets/icons/status/${s.id}.png`)})"></i>${s.stacks > 1 ? `<sub>${s.stacks}</sub>` : ''}</span>`).join('');
    }
    if (label !== undefined && bar.name.textContent !== label) bar.name.textContent = label;
  }
  update(scene, run) {
    const hero = run.hero;
    this.setBar(this.heroBar, hero.alive ? scene.project(toV(hero.x, hero.y, 2.05)) : null, hero, run.statuses(hero), '');
    let used = 0;
    const hb = this.opts.healthBars;
    const list = hb === 'off' ? [] : run.monsters.filter(mn => (hb !== 'elite' || mn.kind !== 'monster') && Math.hypot(mn.x - hero.x, mn.y - hero.y) < 1600).slice(0, 120);
    for (const mon of list) {
      const at = scene.project(toV(mon.x, mon.y, 1.45 * sizeOf(mon) + 0.35));
      if (!at) continue;
      if (used >= this.bars.length) this.bars.push(this.makeBar());
      const bar = this.bars[used++];
      bar.el.classList.toggle('hb-elite', mon.kind === 'elite'); bar.el.classList.toggle('hb-boss', !!mon.boss);
      const casting = run.elapsed - mon.lastCastAt < 0.65;
      const spotted = run.elapsed - (mon.spottedAt ?? -9) < 0.8;   // just noticed you
      this.setBar(bar, at, mon, run.statuses(mon), casting ? mon.lastSkill : spotted ? '!' : mon.kind === 'monster' ? '' : mon.name);
    }
    for (let i = used; i < this.bars.length; ++i) this.bars[i].el.style.display = 'none';
    let f = 0;
    for (const [i, fl] of (this.opts.damageNumbers ? run.flashes : []).entries()) {
      const at = scene.project(toV(fl.x + ((i * 37) % 9 - 4) * 6, fl.y, 1.9 + fl.age * 1.6));
      if (!at || f >= 240) continue;
      if (f >= this.floats.length) { const el = document.createElement('div'); el.className = 'ft'; this.root.appendChild(el); this.floats.push({ el, text: '', cls: '' }); }
      const ft = this.floats[f++], text = fl.hero ? `-${Math.max(1, Math.round(fl.amount))}` : `${Math.max(1, Math.round(fl.amount))}${fl.critical ? '!' : ''}`;
      const cls = fl.hero ? 'ft hurt' : `ft damage${fl.critical ? ' crit' : ''}`;
      ft.el.style.display = '';
      if (ft.text !== text) { ft.text = text; ft.el.textContent = text; }
      if (ft.cls !== cls) { ft.cls = cls; ft.el.className = cls; }
      const pop = fl.age < 0.12 ? 0.6 + fl.age / 0.12 * 0.6 : 1.2 - Math.min(0.2, fl.age - 0.12);
      ft.el.style.transform = `translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      ft.el.style.opacity = Math.max(0, 1 - Math.max(0, fl.age - 0.6) / 0.5).toFixed(2);
    }
    for (let i = f; i < this.floats.length; ++i) this.floats[i].el.style.display = 'none';
    this.updateLoot(scene, run, this.updatePortal(scene, run));
    this.updateStations(scene, run);
    this.updateSpeech(scene, run);
  }
  /** Home: a name plate over every NPC and the stash (click it to walk there and talk). */
  updateStations(scene, run) {
    this.stationEls ??= new Map();
    const list = run.hub ? run.stations.filter(st => st.id !== 'device') : [];
    for (const [id, el] of this.stationEls) if (!list.some(st => st.id === id)) { el.remove(); this.stationEls.delete(id); }
    for (const st of list) {
      let el = this.stationEls.get(st.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'lt lt-station lt-' + st.kind; el.dataset.station = st.id;
        el.innerHTML = `<span>${st.name}</span><small>${st.title}</small>`;
        this.labelLayer.appendChild(el); this.stationEls.set(st.id, el);
      }
      const at = scene.project(toV(st.x, st.y, st.kind === 'npc' ? 2.25 : 1.6));
      if (!at) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.classList.toggle('target', run.walkTo?.station === st);
      el.classList.toggle('has-quest', !!run.questMarks?.has(st.id));
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.transform = `translate3d(${(at.x - w / 2).toFixed(1)}px,${(at.y - h).toFixed(1)}px,0)`;
    }
  }
  /** Home: speech bubbles over townsfolk who are saying something. */
  updateSpeech(scene, run) {
    this.sayEls ??= new Map();
    const town = run.hub ? run.town : null, live = new Set();
    if (town) for (const a of town.agents) {
      if (!a.say) continue;
      live.add(a.id);
      let el = this.sayEls.get(a.id);
      if (!el || el.dataset.text !== a.say.text) {
        if (!el) { el = document.createElement('div'); el.className = 'lt lt-say'; this.labelLayer.appendChild(el); this.sayEls.set(a.id, el); }
        el.dataset.text = a.say.text; el.innerHTML = '';
        if (a.name) { const b = document.createElement('b'); b.textContent = a.name; el.appendChild(b); }
        el.appendChild(document.createTextNode(a.say.text));
      }
      const at = scene.project(toV(a.x, a.y, (a.kid ? 1.25 : 1.85) + 0.25));
      if (!at) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.opacity = Math.min(1, (a.say.until - town.time) * 2).toFixed(2);
      el.style.transform = `translate3d(${(at.x - el.offsetWidth / 2).toFixed(1)}px,${(at.y - el.offsetHeight).toFixed(1)}px,0)`;
    }
    for (const [id, el] of this.sayEls) if (!live.has(id)) { el.remove(); this.sayEls.delete(id); }
    // 「！」 over the people who have a quest for you
    this.markEls ??= new Map();
    const marked = new Set();
    if (town && run.questMarks) for (const a of town.agents) {
      if (!run.questMarks.has(a.id) || a.say) continue;
      const at = scene.project(toV(a.x, a.y, (a.kid ? 1.25 : 1.85) + 0.2)); if (!at) continue;
      marked.add(a.id);
      let el = this.markEls.get(a.id);
      if (!el) { el = document.createElement('div'); el.className = 'lt lt-mark'; el.textContent = '！'; this.labelLayer.appendChild(el); this.markEls.set(a.id, el); }
      el.style.transform = `translate3d(${(at.x - el.offsetWidth / 2).toFixed(1)}px,${(at.y - el.offsetHeight).toFixed(1)}px,0)`;
    }
    for (const [id, el] of this.markEls) if (!marked.has(id)) { el.remove(); this.markEls.delete(id); }
  }
  /** A clickable name plate over the boss portal. */
  updatePortal(scene, run) {
    const at = run.portal ? scene.project(toV(run.portal.x, run.portal.y, 3.1)) : null;
    if (!at) { if (this.portalEl) this.portalEl.style.display = 'none'; return null; }
    if (!this.portalEl) {
      const el = this.portalEl = document.createElement('div');
      el.className = 'lt lt-portal';
      this.labelLayer.appendChild(el);
    }
    const el = this.portalEl, text = (run.portal.label ?? '传送阵') + (run.portal.sub ?? '点我走过去 · 打开图集');
    if (el.dataset.text !== text) { el.dataset.text = text; el.innerHTML = `<span>${run.portal.label ?? '传送阵'}</span><small>${run.portal.sub ?? '点我走过去 · 打开图集'}</small>`; }
    el.style.display = '';
    el.classList.toggle('target', run.walkTo === 'portal');
    const w = el.offsetWidth, h = el.offsetHeight, x = at.x - w / 2, y = at.y - h;
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    return { x, y, w, h };
  }
}
