// 3D tower: generated dungeon floors over the existing aggregated loadout combat. Monsters carry
// health bars with ailment badges, damage floats over targets, the hero fights with owned skills,
// equipment and consumables; kills drop 灵石 into the player's wallet.
import * as THREE from '/vendor/three.module.js';
import { createApp, reactive, computed, watch, ref, nextTick, onMounted, onBeforeUnmount, markRaw } from '/vendor/vue.esm-browser.prod.js';
import { store, notify } from '/editors.mjs';
import { player, owns, ownsEquipment, ownedCount, identify, consume, recordKill, startProgression, ensureStarted, skillChoices, setSkillSlot, toggleBelt, equip, SKILL_SLOTS, BELT_SLOTS, SLOTS } from '/player.mjs';
import { STATUS_STYLE } from '/sim/battle.mjs';
import { auraBinding, auraId, buildSkillType, cleanBelt, auraManaPercent } from '/engine/skill-types.mjs';
import { toggleAura } from '/player.mjs';
import { isInventoryNew, seeInventoryItem } from '/inventory-notices.mjs';
import { TowerRun, MAX_TOWER_FLOOR, validateFloor } from '/sim/dungeon-battle.mjs';
import { createBattleEffects } from '/vfx/battle-effects.mjs';
import { createTwistedEyes } from '/prefabs/monster-twisted-eye.mjs';
import { createGlowRenderer } from '/vfx/glow-renderer.mjs';
import { inventoryEntries, filterInventoryEntries, inventoryPage, characterPanel, mapEquipmentPanel, ItemInspector } from '/battle-panels.mjs';
import { BattleItemPanel } from '/battle-item-panel.mjs';
import { BattleCompletion } from '/battle-completion.mjs';
import { AtlasMap } from '/atlas-map.mjs';
import { AtlasSession } from '/atlas-session.mjs';
import { travelAtlas } from '/atlas-travel.mjs';
import { createBattleAudio } from '/audio/battle-audio.mjs';
import { BattleFunctions } from '/battle-functions.mjs';
import { BattleWindow } from '/battle-window.mjs';
import { QuestTracker, QuestJournal } from '/quests/panel.mjs';
import { questRows, observeQuestBattle, claimQuestWeapon } from '/quests/model.mjs';
import { ensureJourney, levelPart, recordKill as recordJourneyKill, recordFloorClear, bump, xpProgress, talentBudget, syncTalentBudget, KillStreak, levelBonusRows } from '/progression/journey.mjs';
import { ensureChain, observeChain, chainRows, trackedQuest as chainTracked, claimChainQuest, prepareChoices, rewardLabel, CHAPTERS, QUEST_CHAIN } from '/progression/quest-chain.mjs';
import { tutorialView, skipTutorial, dismissTip } from '/progression/tutorial.mjs';
import { feedback, banner, toast, setStreak, chime, configureChimes } from '/progression/feedback.mjs';
import { JourneyXpBar, ChainTracker, CoachMark, FeedbackLayer, ChainJournal } from '/progression/hud.mjs';
import { onGameEvent } from '/progression/events.mjs';
import { CraftBench } from '/progression/craft-bench.mjs';
import { BattleCharacterPanel } from '/battle-character-panel.mjs';
import { BattleBuildGuide } from '/battle-build-guide.mjs';
import { BattleSkillTooltip } from '/battle-skill-tooltip.mjs';
import { BattleAuraState } from '/battle-aura-state.mjs';
import { BattleDungeonMap } from '/battle-dungeon-map.mjs';
import { BattleIconPicker } from '/battle-icon-picker.mjs';
import { resolveTouchAim } from '/battle-touch-aim.mjs';
import { skillDetails, auraDetails } from '/skill-details.mjs';
import { BattleLootHunter } from '/battle-loot-hunter.mjs';
import { BattlePlayerEffects, playerEffects } from '/battle-player-effects.mjs';
import { BattleDps } from '/battle-dps.mjs';
import { BattleSummonUnits, summonUnitPanel } from '/battle-summon-units.mjs';
import { BattleMapCores } from '/battle-map-cores.mjs';
import { BattleMapEvents } from '/battle-map-events.mjs';
import { BattleTraitEquipment } from '/battle-trait-equipment.mjs';
import { dropTraitEquipment } from '/trait-equipment.mjs';
import {eventLocked} from '/map-events-model.mjs';
import { mapCoreChoices, selectedMapCore, configureMapCore } from '/map-core-selection.mjs';
import { AverageTargetDps } from '/sim/damage-meter.mjs';
import { equipmentAffixPool } from '/engine/equipment.mjs';
import { emptyHunter, normalizeHunter, hunterAllows, hunterCurrencyPool } from '/engine/loot-hunter.mjs';
import { GroundLootOverlay } from '/ground-loot.mjs';
import { PICKUP_RADIUS } from '/engine/floor-rewards.mjs';
import { createLootMarkers } from '/prefabs/loot-markers.mjs';
import { createDungeonFloor } from '/prefabs/dungeon-floor.mjs';
import { createDungeonPortal } from '/prefabs/dungeon-portal.mjs';
import { BattleExitPortal } from '/battle-exit-portal.mjs';
import { BattleOutpostMerchant } from '/battle-outpost-merchant.mjs';
import { mountStunOverlay, updateStunOverlay, BattleStunOverlay } from '/battle-stun-overlay.mjs';
import { createDungeonMerchant } from '/prefabs/dungeon-merchant.mjs';
import { createDungeonMapEvents } from '/prefabs/dungeon-map-events.mjs';
import { BattleMapEventTag } from '/battle-map-event-tag.mjs';
import { applyBuildPreset } from '/build-presets.mjs';
import { minimumTierPreset } from '/build-preset-tier.mjs';
import { currentTalentParts } from '/talents/state.mjs';
import { TalentConstellation } from '/talents/page.mjs';
import { groupBuildPresets } from '/build-preset-menu.mjs';
import { affixText } from '/affix-text.mjs';
import { iconSrc } from '/game-icons.mjs';
import { BattleEquipmentMenu } from '/battle-equipment-menu.mjs';
import { BattleStackSplit } from '/battle-stack-split.mjs';
import { INVENTORY_PAGE_SIZE, canSplitStack, reconcileInventoryLayout, inventoryGrid, characterInventoryGrid, moveInventoryStack, splitInventoryStack, organizeInventory, reducePlacedStack } from '/inventory-layout.mjs';
import { partitionInventory } from '/inventory-compartments.mjs';
import { sellOwnedEquipment } from '/player.mjs';
import { equipmentSaleQuote } from '/engine/equipment-trade.mjs';
import { skillSlots, validSkillSlots, equipmentTier, EQUIPMENT_RARITY_NAMES, PLAYER_GEAR_SLOTS, PLAYER_FIXED_SLOTS } from '/engine/index.mjs';

const ELEMENT_CSS = ['#ff9d5c', '#a6e6ff', '#ffe680', '#f0f0f0', '#a8ff8c', '#d4a0ff'];
const BELT_KEYS = ['Q', 'E', 'T', 'G'];
const M = 0.01; // cm -> m
const toV = (x, y, h = 0) => new THREE.Vector3(x * M, h, -y * M);

// ------------------------------------------------------------------ scene

class Scene3D {
  constructor(host, rendering = {}) {
    
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, rendering.maxPixelRatio || 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.prepend(this.renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090c12);
    scene.fog = new THREE.Fog(0x090c12, 22, 58);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.zoom = 0.8;
    scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x302418, 1.4));
    scene.add(new THREE.AmbientLight(0x404a60, 0.6));
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(rendering.shadowSize || 2048, rendering.shadowSize || 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.floorVisual = null;
    this.floorLayout = null;
    this.exitPortal = createDungeonPortal(); scene.add(this.exitPortal.group);
    this.outpostMerchant = createDungeonMerchant(); scene.add(this.outpostMerchant.group);
    this.mapEventObjects = createDungeonMapEvents(); scene.add(this.mapEventObjects.group);

    // Hero
    const hero = this.hero = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.75, 6, 14), new THREE.MeshStandardMaterial({ color: 0xf2bf33, roughness: 0.45, metalness: 0.3 }));
    body.position.y = 0.7;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe2a8, roughness: 0.6 }));
    head.position.set(0, 1.45, 0);
    head.castShadow = true;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a3f }));
    staff.position.set(0.38, 0.85, 0.15);
    const focus = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0x8fdcff }));
    focus.position.set(0.38, 1.65, 0.15);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 40), new THREE.MeshBasicMaterial({ color: 0x33e6ff, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    hero.add(body, head, staff, focus, ring);
    scene.add(hero);
    this.heroFocus = focus;
    this.aimArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 12), new THREE.MeshBasicMaterial({ color: 0x33e6ff, transparent: true, opacity: 0.85 }));
    this.aimArrow.rotation.x = Math.PI / 2;
    scene.add(this.aimArrow);
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.position.y = 0.03;
    scene.add(this.cursor);

    // Monsters: body + glowing visor, one instance each.
    const CAP = 512;
    this.monsterBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.34, 0.45, 4, 12), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 }), CAP);
    this.monsterBody.castShadow = true;
    const visorGeo = new THREE.BoxGeometry(0.34, 0.07, 0.06);
    visorGeo.translate(0, 0.22, 0.31);
    this.monsterVisor = new THREE.InstancedMesh(visorGeo, new THREE.MeshBasicMaterial({ color: 0xffb070 }), CAP);
    const hornGeo = new THREE.ConeGeometry(0.08, 0.28, 6);
    hornGeo.translate(0, 0.62, 0);
    this.monsterHorn = new THREE.InstancedMesh(hornGeo, new THREE.MeshStandardMaterial({ color: 0x2a1a1a, roughness: 0.6 }), CAP);
    for (const mesh of [this.monsterBody, this.monsterVisor, this.monsterHorn]) { mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); }
    this.monsterBody.setColorAt(0, new THREE.Color());

    // Presentation is isolated from the rule engine and shares the preview prefabs.
    this.eyes = createTwistedEyes(THREE); scene.add(this.eyes.group);
    this.effects = createBattleEffects(THREE, scene);
    this.lootMarkers = createLootMarkers(THREE); scene.add(this.lootMarkers.group);
    this.glow = createGlowRenderer(THREE, this.renderer);

    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), e: new THREE.Euler() };
    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || 800, h = this.host.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
  }

  /** Screen pixel -> world cm on the ground. */
  pick(px, py) {
    const ndc = new THREE.Vector2(px / this.width * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit) ? { x: hit.x / M, y: -hit.z / M, v: hit } : null;
  }

  /** World point -> screen pixel (null when behind the camera / off screen). */
  project(v) {
    const p = new THREE.Vector3(v.x, v.y, v.z).project(this.camera);
    if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) return null;
    return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height };
  }

  lootAnchor(key) { return this.lootMarkers.anchor(key); }

  update(battle, time, paused = false, visibleLoot = null, showLootBursts = true) {
    if (battle !== this.lastBattle) {
      this.lastBattle = battle; this.finishedAt = null; this.lootTail = 0; this.lastLootWall = time; this.lootMarkers.reset();
    }
    if (['cleared', 'failed'].includes(battle.phase)) this.finishedAt ??= time;
    this.tailTime = this.finishedAt === null ? 0 : time - this.finishedAt;
    if (this.finishedAt !== null && !paused) this.lootTail += Math.max(0, Math.min(.05, time - this.lastLootWall));
    this.lastLootWall = time;
    const { m, q, s, p, c, e } = this.tmp;
    const hero = battle.hero;
    this.exitPortal.update(battle.exitPortal, paused ? this.portalTime || time : (this.portalTime = time));
    this.outpostMerchant.update(battle.outpostMerchant);
    this.mapEventObjects.update(battle.mapEvents, paused ? this.eventTime || time : (this.eventTime = time));
    const hp = toV(hero.x, hero.y);
    if (this.floorLayout !== battle.dungeon) {
      this.floorVisual?.dispose();
      this.floorLayout = battle.dungeon;
      this.floorVisual = createDungeonFloor(battle.dungeon);
      this.scene.add(this.floorVisual.group);
      this.camera.position.set(hp.x, 15.5 * this.zoom, hp.z + 10.5 * this.zoom);
    }
    // Camera follows the hero from an ARPG angle.
    const target = new THREE.Vector3(hp.x, 0, hp.z);
    const offset = new THREE.Vector3(0, 15.5, 10.5).multiplyScalar(this.zoom);
    this.camera.position.lerp(target.clone().add(offset), 0.12);
    this.camera.lookAt(this.camera.position.clone().sub(offset));
    this.sun.position.set(hp.x + 10, 22, hp.z + 6);
    this.sun.target.position.set(hp.x, 0, hp.z);

    this.hero.visible = !hero.dead;
    this.hero.position.copy(hp);
    this.hero.rotation.y = Math.atan2(hero.aim.x, -hero.aim.y);
    this.heroFocus.rotation.y = time * 3;
    this.aimArrow.visible = !hero.dead;
    this.aimArrow.position.set(hp.x + hero.aim.x * 1.1, 0.12, hp.z - hero.aim.y * 1.1);
    this.aimArrow.lookAt(hp.x + hero.aim.x * 3, 0.12, hp.z - hero.aim.y * 3);
    this.aimArrow.rotateX(Math.PI / 2);

    // Monsters
    let n = 0;
    for (const mon of battle.monsters) {
      if (mon.type?.id === 'twisted_eye') continue;
      if (n >= this.monsterBody.instanceMatrix.count) break;
      const size = (mon.boss ? 2.2 : (0.85 + 0.45 * Math.min(1, mon.maxHealth / 300))) * (mon.type?.scale ?? 1);
      const bob = mon.frozen ? 0 : Math.abs(Math.sin(time * 9 + mon.id)) * 0.06;
      const pulse = 1 + mon.hitFlash * 2.5;
      p.set(mon.x * M, (0.57 + bob) * size, -mon.y * M);
      e.set(0, Math.atan2(mon.facing.x, -mon.facing.y), 0);
      q.setFromEuler(e);
      s.set(size * pulse, size * (2 - pulse), size * pulse);
      m.compose(p, q, s);
      this.monsterBody.setMatrixAt(n, m);
      this.monsterVisor.setMatrixAt(n, m);
      this.monsterHorn.setMatrixAt(n, m);
      if (mon.hitFlash > 0) c.set(0xffffff);
      else if (mon.frozen) c.set(0xc8f2ff);
      else if (mon.statusColor) c.set(mon.statusColor).lerp(new THREE.Color(mon.color || 0x7a2018), 0.35);
      else c.set(mon.color || 0x7a2018);
      this.monsterBody.setColorAt(n, c);
      ++n;
    }
    for (const mesh of [this.monsterBody, this.monsterVisor, this.monsterHorn]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    if (this.monsterBody.instanceColor) this.monsterBody.instanceColor.needsUpdate = true;

    this.eyes.update(battle.monsters, time, hero);
    this.effects.update(battle, time);
    this.lootMarkers.update((visibleLoot ?? battle.rewards?.remaining ?? []).map(d => ({ key: d.key, x: d.x * M, z: -d.y * M,
      sourceX: (d.sourceX ?? d.x) * M, sourceZ: -(d.sourceY ?? d.y) * M, kind: d.kind, rarity: d.rarity, category: d.category, currencyGrade: d.currencyGrade })), battle.elapsed + this.lootTail,
      showLootBursts ? battle.drops.map(d => ({ x: d.x * M, z: -d.y * M, stones: d.stones, age: d.age + this.lootTail })) : []);
    this.glow.render(this.scene, this.camera, this.effects.group);
  }

  dispose() {
    this.exitPortal.dispose();
    this.outpostMerchant.dispose();
    this.mapEventObjects.dispose();
    this.eyes.dispose();
    this.floorVisual?.dispose();
    this.effects.dispose();
    this.lootMarkers.dispose();
    this.glow.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ------------------------------------------------------------------ overlay (health bars, floats)

class Overlay {
  constructor(root) {
    this.root = root;
    this.bars = [];
    this.floats = [];
    this.pops = [];
    this.heroBar = this.makeBar('hero');
  }

  /** Short-lived world text that the battle does not own (experience, level up). */
  pop(x, y, text, cls, life = 1.3) {
    this.pops.push({ x, y, text, cls, born: performance.now(), life });
    if (this.pops.length > 80) this.pops.shift();
  }

  makeBar(kind = '') {
    const el = document.createElement('div');
    el.className = `hb${kind ? ' hb-' + kind : ''}`;
    el.innerHTML = '<div class="hb-st"></div>'
      + (kind === 'hero' ? '<div class="hb-shield" role="progressbar" aria-label="角色头顶护盾" aria-valuemin="0" hidden><i></i></div>' : '')
      + '<div class="hb-bar"><i></i><b></b>'
      + (kind === 'hero' ? '<div class="hb-crust" role="progressbar" aria-label="玩家晕眩" aria-valuemin="0" hidden></div>' : '')
      + '</div><div class="hb-name"></div>';
    this.root.appendChild(el);
    if (kind === 'hero') mountStunOverlay(el.querySelector('.hb-crust'));
    return { el, st: el.firstChild, fill: el.querySelector('.hb-bar i'), lag: el.querySelector('.hb-bar b'),
      shield: el.querySelector('.hb-shield'), shieldFill: el.querySelector('.hb-shield i'), crust: el.querySelector('.hb-crust'), name: el.querySelector('.hb-name'), key: '', lagPct: 100 };
  }

  makeFloat() {
    const el = document.createElement('div');
    el.className = 'ft';
    this.root.appendChild(el);
    return { el, text: '' };
  }

  setBar(bar, at, pct, statuses) {
    if (!at) { bar.el.style.display = 'none'; return; }
    bar.el.style.display = '';
    bar.el.style.transform = `translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0)`;
    bar.fill.style.width = `${pct}%`;
    bar.lagPct = Math.max(pct, bar.lagPct - 1.2);
    if (pct > bar.lagPct) bar.lagPct = pct;
    bar.lag.style.width = `${bar.lagPct}%`;
    const key = statuses.map(s => `${s.id}${s.stacks}${Math.ceil(s.remaining)}`).join('|');
    if (key !== bar.key) {
      bar.key = key;
      bar.st.innerHTML = statuses.map(s => `<span style="--c:${s.color}" title="${s.name}">${s.glyph}${s.stacks > 1 ? `<sub>${s.stacks}</sub>` : ''}<em>${Math.ceil(s.remaining)}</em></span>`).join('');
    }
  }

  update(scene, battle) {
    const hero = battle.hero;
    this.setBar(this.heroBar, hero.dead ? null : scene.project(toV(hero.x, hero.y, 2.05)),
      Math.max(0, Math.min(100, 100 * hero.health / Math.max(1, hero.maxHealth))), battle.monsterStatuses({ id: battle.heroTargetId }));
    const hasShield = hero.maxShield > 0;
    const crust = battle.stunCrust?.snapshot();
    updateStunOverlay(this.heroBar.crust, crust);
    this.heroBar.el.classList.toggle('has-shield', hasShield);
    this.heroBar.shield.hidden = !hasShield;
    if (hasShield) {
      const shield = Math.max(0, Math.min(hero.maxShield, hero.shield));
      this.heroBar.shieldFill.style.width = `${100 * shield / hero.maxShield}%`;
      this.heroBar.shield.setAttribute('aria-valuemax', hero.maxShield);
      this.heroBar.shield.setAttribute('aria-valuenow', shield);
    }
    let used = 0;
    // Nearest monsters first so the bar budget goes to what matters.
    const list = battle.monsters.length > 160 ? [...battle.monsters].sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y)).slice(0, 160) : battle.monsters;
    for (const mon of list) {
      const size = mon.boss ? 2.2 : 0.85 + 0.45 * Math.min(1, mon.maxHealth / 300);
      const at = scene.project(toV(mon.x, mon.y, 1.45 * size + 0.35));
      if (!at) continue;
      if (used >= this.bars.length) this.bars.push(this.makeBar());
      const bar = this.bars[used++];
      this.setBar(bar, at, Math.max(0, 100 * mon.health / mon.maxHealth), battle.monsterStatuses(mon));
      const casting = battle.elapsed - mon.lastCastAt < 0.65;
      const label = casting ? mon.lastSkill : mon.name;
      if (bar.name.textContent !== label) bar.name.textContent = label;
      bar.name.classList.toggle('casting', casting);
    }
    for (let i = used; i < this.bars.length; ++i) this.bars[i].el.style.display = 'none';

    // Floating numbers: total damage per monster (crits big), damage taken on the hero, 灵石 drops.
    let f = 0;
    const show = (x, y, h, text, cls, life) => {
      const at = scene.project(toV(x, y, h));
      if (!at || f >= 360) return;
      if (f >= this.floats.length) this.floats.push(this.makeFloat());
      const ft = this.floats[f++];
      ft.el.style.display = '';
      if (ft.text !== text) { ft.text = text; ft.el.textContent = text; }
      if (ft.cls !== cls) { ft.cls = cls; ft.el.className = `ft ${cls}`; }
      const pop = life < 0.12 ? 0.6 + life / 0.12 * 0.6 : 1.2 - Math.min(0.2, (life - 0.12));
      ft.el.style.transform = `translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      ft.el.style.opacity = Math.max(0, 1 - Math.max(0, life - 0.6) / 0.5).toFixed(2);
    };
    battle.flashes.forEach((fl, i) => {
      const jitter = ((i * 37) % 9 - 4) * 6;
      const text = fl.hero ? `-${Math.max(1, Math.round(fl.amount))}` : `${Math.max(1, Math.round(fl.amount))}${fl.critical ? '!' : ''}`;
      const cls = fl.hero ? 'hurt' : `damage${fl.critical ? ' crit' : ''}`;
      show(fl.x + jitter, fl.y, 1.9 + (fl.age + scene.tailTime) * 1.6, text, cls, fl.age + scene.tailTime);
    });
    for (const d of battle.drops) show(d.x, d.y, 1.4 + (d.age + scene.tailTime) * 1.2, `+${d.stones} 灵石`, 'stone', d.age + scene.tailTime);
    const now = performance.now();
    this.pops = this.pops.filter(p => (now - p.born) / 1000 < p.life);
    for (const p of this.pops) { const age = (now - p.born) / 1000; show(p.x, p.y, (p.cls === 'levelup' ? 2.8 : 2.2) + age * 1.1, p.text, p.cls, age); }
    for (let i = f; i < this.floats.length; ++i) this.floats[i].el.style.display = 'none';
  }
}

// ------------------------------------------------------------------ Vue page

const TEMPLATE = /* html */ `
<div class="b3">
  <div class="b3-stage" ref="stage" tabindex="0" @contextmenu.prevent @dragover="overGround" @drop="dropOnGround">
    <AtlasMap v-if="atlasOpen" :state="atlasState" :current-node-id="atlasState.currentNodeId" :active-node-id="atlasState.activeNodeId" :current-events="hud.dungeon?.events" :paused="true" :device-items="mapDeviceItems" :device-slots="player.mapDeviceSlots || {}" @device-change="player.mapDeviceSlots=$event" @challenge="challengeAtlas" @select="selectAtlas" @close="closeAtlas" />
    <div class="b3-overlay" ref="overlay"></div>
    <div class="b3-ground-loot" ref="lootRoot" aria-label="地面掉落"></div>
    <div class="b3-top">
      <div class="b3-card b3-stats mono">
        <span>击杀 <b>{{ hud.kills }}</b></span><span>怪物 <b>{{ hud.monsters }}</b></span><span>投射物 <b>{{ hud.projectiles }}</b></span><span>{{ hud.time }}</span><span>{{ hud.fps }} FPS</span>
      </div>
      <BattleDps :stats="dpsHud" />
      <BattlePlayerEffects :effects="hud.effects" @release="releaseBattleInput" />
    </div>
    <div id="top_left" class="b3-top-left" aria-label="战斗左上区域">
      <section class="b3-health-hud b3-card" aria-label="玩家资源">
        <div><span>气血</span><b class="mono">{{ Math.max(0, Math.min(Math.round(hud.maxHealth), Math.ceil(hud.health))) }} <small>/ {{ Math.round(hud.maxHealth) }}</small></b></div>
        <div class="b3-hp b3-life" role="progressbar" aria-label="气血" :aria-valuemin="0" :aria-valuemax="Math.max(1, hud.maxHealth)" :aria-valuenow="Math.max(0, Math.min(hud.maxHealth, hud.health))"><i :style="{width: Math.max(0, Math.min(100, 100 * hud.health / Math.max(1, hud.maxHealth))) + '%'}"></i><BattleStunOverlay :snapshot="hud.stun" /></div>
        <div class="b3-hud-resource shield">
          <div><span>护盾{{ hud.recharging ? ' · 回充中' : '' }}</span><b class="mono">{{ Math.max(0, Math.ceil(hud.shield)) }} <small>/ {{ Math.round(hud.maxShield) }}</small></b></div>
          <div class="b3-hp b3-shield" role="progressbar" aria-label="护盾" :aria-valuemin="0" :aria-valuemax="Math.max(1, hud.maxShield)" :aria-valuenow="Math.max(0, hud.shield)"><i :style="{width: Math.max(0, Math.min(100, 100 * hud.shield / Math.max(1, hud.maxShield))) + '%'}"></i></div>
        </div>
        <div class="b3-hud-resource mana">
          <div><span>魔力 <small v-if="hud.reservedMana > 0" class="b3-seal-label">封印 {{ +hud.manaReservationPercent.toFixed(1) }}%</small></span><b class="mono">{{ Math.max(0, Math.floor(hud.mana)) }} <small>/ {{ Math.round(hud.maxMana) }}</small></b></div>
          <div class="b3-hp b3-mana" role="progressbar" aria-label="魔力" :title="'可用上限 ' + Math.round(hud.manaCap) + '；封印 ' + Math.round(hud.reservedMana)" :aria-valuemin="0" :aria-valuemax="Math.max(1, hud.manaCap)" :aria-valuenow="Math.max(0, Math.min(hud.manaCap, hud.mana))" :aria-valuetext="'当前魔力 ' + Math.floor(hud.mana) + '，可用上限 ' + Math.round(hud.manaCap) + '，封印 ' + Math.round(hud.reservedMana)"><i :style="{width: Math.max(0, Math.min(100, 100 * hud.mana / Math.max(1, hud.maxMana))) + '%'}"></i><span v-if="hud.reservedMana > 0" class="b3-mana-seal" :style="{width: hud.manaReservationPercent + '%'}" aria-hidden="true"></span></div>
        </div>
      </section>
      <div class="b3-floor-objective" v-if="hud.dungeon"><b>第 {{ hud.dungeon.floor }} 层</b><span>{{ dungeonObjective }}</span></div>
      <ChainTracker :quest="journeyHud.quest" :chapter="journeyHud.chapter" :collections="store.collections" @open="openHUDFunction('quests')" @claim="claimChain" @release="releaseBattleInput" />
      <div class="b3-boss-health" v-if="hud.dungeon?.bossMax > 0 && hud.dungeon.phase === 'boss'">
        <div><b>第 {{ hud.dungeon.floor }} 层守卫</b><span>{{ Math.ceil(hud.dungeon.bossHealth) }} / {{ hud.dungeon.bossMax }}</span></div>
        <i :style="{width: (100 * hud.dungeon.bossHealth / hud.dungeon.bossMax) + '%'}"></i>
      </div>
      <BattleSummonUnits :state="hud.summonUnits" @release="releaseBattleInput" />

      <div class="b3-audio-controls" aria-label="音效控制" @pointerenter="releaseBattleInput" @pointerdown.stop @pointermove.stop @keydown.stop>
        <button type="button" :aria-label="audioSettings.muted ? '开启音效' : '静音音效'" :aria-pressed="audioSettings.muted" :title="audioSettings.muted ? '开启音效' : '静音音效'" @click="toggleAudio">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path v-if="audioSettings.muted" d="m16 9 6 6m0-6-6 6"/><path v-else d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>
        </button>
        <label>音效<input type="range" min="0" max="1" step="0.01" v-model.number="audioSettings.volume" @input="configureAudio" aria-label="战斗音效音量"></label><output>{{ Math.round(audioSettings.volume * 100) }}%</output>
      </div>
    </div>
    <BattleFunctions :hidden="playMode ? ['trait-equipment', 'bd', 'shop'] : []" :ready="ready" :map-ready="!!hud.map" :active="activeHUDFunction" :hunter-active="hunter.enabled && (hunter.targets.length > 0 || hunter.currencies.length > 0)" @release="releaseBattleInput" @activate="openHUDFunction" />
    <BattleMapEvents ref="mapEventUI" :run-key="eventRunKey" :tier="hud.map?.tier || 1" :menu="eventMenuOpen" @menu-close="eventMenuOpen=false" @open="openMapEvent" @close="closeMapEvent" @changed="mapEventChanged" @status="mapEventStatus" />
    <BattleMapEventTag v-for="event in mapEventTags" :key="event.id" :info="event" @activate="activateMapStation" @release="releaseBattleInput" />
      <section v-if="bdExpanded" class="b3-bd-panel b3-card" :class="{expanded: bdExpanded}" aria-label="可用 BD" @pointerenter="releaseBattleInput" @pointerdown.stop @pointermove.stop @wheel.stop @keydown.stop>
        <header><button type="button" class="b3-bd-toggle" :aria-expanded="bdExpanded" aria-controls="available-bd-list" @click="bdExpanded = !bdExpanded"><b>可用 BD</b><small>{{ bdFamilies.length }}</small><span aria-hidden="true">{{ bdExpanded ? '×' : '▾' }}</span></button></header>
        <div id="available-bd-list" class="b3-bd-scroll" v-show="bdExpanded">
          <p class="b3-bd-empty" v-if="bdLoading">加载 BD…</p>
          <div class="b3-bd-empty" v-else-if="bdError" role="status">{{ bdError }}<button type="button" class="btn sm" @click="loadBds">重试</button></div>
          <p class="b3-bd-empty" v-else-if="!bdRows.length">暂无可用 BD</p>
          <template v-else>
          <ul v-if="!selectedBdFamily" class="b3-bd-list b3-bd-families">
            <li v-for="family in bdFamilies" :key="family.id">
              <button type="button" class="b3-bd-entry b3-bd-family" :class="{on: family.equipped}" :aria-label="'选择' + family.name + '流派'" @click="selectedBdFamilyId = family.id; openedBd = ''">
                <span class="b3-bd-icon">{{ family.name.charAt(0) }}</span>
                <span class="b3-bd-name"><b>{{ family.name }}</b><small>{{ family.rows.length === 1 ? '默认配装' : family.rows.length + ' 档强度' }}</small></span>
                <span class="b3-bd-state">{{ family.equipped ? '已应用 · ' : '' }}›</span>
              </button>
            </li>
          </ul>
          <div v-else>
          <div class="b3-bd-subhead"><button type="button" aria-label="返回BD流派列表" @click="selectedBdFamilyId = ''; openedBd = ''">‹ 返回</button><b>{{ selectedBdFamily.name }}</b></div>
          <ul class="b3-bd-list">
            <li v-for="bd in selectedBdFamily.rows" :key="bd.id">
              <div class="b3-bd-row">
                <button type="button" class="b3-bd-entry" :class="{on: bd.equipped}" :disabled="!ready" :aria-label="'一键应用' + bd.name + ' BD'" @click="applyBd(bd)">
                  <span class="b3-bd-icon">{{ bd.name.charAt(0) }}</span>
                  <span class="b3-bd-name"><b>{{ bd.gradeName || bd.name }}</b><small>{{ bd.mechanism || bd.skillName }}</small></span>
                  <span class="b3-bd-state" :class="{complete: bd.equipped}">{{ bd.equipped ? '已应用' : '一键应用' }}</span>
                </button>
                <button v-if="bd.id === 'synergy_rime_thunder'" type="button" class="b3-bd-arrow" aria-label="查看霜雷交响构筑指南" @click="openBuildGuide(bd.id)">▤</button>
                <button v-else type="button" class="b3-bd-arrow" :aria-label="bd.name + ' BD 配装详情'" :aria-expanded="openedBd === bd.id" @click="openedBd = openedBd === bd.id ? '' : bd.id">{{ openedBd === bd.id ? '−' : '+' }}</button>
              </div>
              <div class="b3-bd-detail" v-if="openedBd === bd.id">
                <p>{{ bd.description }}</p>
                <p v-if="bd.loadout.provenance">来源记录：{{ bd.loadout.provenance.attempts }} 轮 · {{ bd.loadout.provenance.kills }} 次击杀 · {{ bd.loadout.provenance.crafts }} 次付费洗炼。此按钮预览记录中的装备。</p>
                <ul>
                  <li v-for="eq in bd.equipment" :key="eq.slot"><span>{{ eq.slotName }} · {{ eq.name }}</span><small :class="{owned: eq.owned}">{{ eq.equipped ? '已装备' : eq.owned ? '已拥有' : '未拥有' }}</small></li>
                </ul>
              </div>
            </li>
          </ul>
          </div>
          </template>
        </div>
        <button type="button" class="b3-bd-guide-launch" @click="openBuildGuide()">构筑原理与词条追求 <span>▤ ›</span></button>
      </section>
    <BattleLootHunter v-if="hunter.visible" :hunter="hunter" :pool="hunterPool" :currencies="hunterCurrencies" :shown="hunterShown" :total="hud.lootCount || 0" @release="releaseBattleInput" @close="hunter.visible = false" @enable="hunter.enabled = $event" @target="setHunterTarget" @currency="setHunterCurrency" @clear="hunter.targets = []" @clear-currencies="hunter.currencies = []" />
    <div class="b3-top-right" aria-label="战斗右上区域">

    <BattleDungeonMap v-if="floorMap && hud.dungeon" :layout="floorMap" :state="hud.dungeon" @release="releaseBattleInput" @open="openHUDFunction('dungeon-map')" />
    <section v-if="hud.map" class="b3-map-equipment" aria-label="地图信息">
      <header><b>【{{ hud.map.name }}】</b><small>T{{ hud.map.tier }}<template v-if="hud.map.invulnerable"> · 无敌</template></small></header>
      <div class="b3-map-tabs" role="tablist" aria-label="地图信息分类">
        <button type="button" role="tab" id="map-equipment-tab" aria-controls="map-equipment-content" :aria-selected="mapPanelTab === 'equipment'" @click="mapPanelTab = 'equipment'">装备词条</button>
        <button type="button" role="tab" id="map-lineage-tab" aria-controls="map-lineage-content" :aria-selected="mapPanelTab === 'lineage'" @click="mapPanelTab = 'lineage'">谱系信息 <small>{{ hud.map.lineages.length }}</small></button>
      </div>
      <div v-show="mapPanelTab === 'equipment'" id="map-equipment-content" class="b3-map-affixes" role="tabpanel" aria-labelledby="map-equipment-tab">
        <BattleMapCores :map="hud.map" :choices="availableMapCores" @choose="chooseMapCore" @release="releaseBattleInput" />
      </div>
      <div v-show="mapPanelTab === 'lineage'" id="map-lineage-content" class="b3-map-affixes b3-map-lineages" role="tabpanel" aria-labelledby="map-lineage-tab">
        <details v-for="lineage in hud.map.lineages" :key="lineage.key">
          <summary :title="lineage.monsters.join('、')"><b>{{ lineage.name }}</b><span>存活 {{ lineage.count }}</span></summary>
          <p v-if="lineage.description">{{ lineage.description }}</p>
          <p v-if="lineage.bosses">含首领 {{ lineage.bosses }} 只</p>
          <ul v-if="lineage.affixes.length"><li v-for="(text, i) in lineage.affixes" :key="i">{{ text }}</li></ul>
          <p v-else>无额外谱系词条</p>
        </details>
        <p v-if="!hud.map.lineages.length">本层尚无谱系信息</p>
      </div>
    </section>
    </div>
    <BattleOutpostMerchant v-if="battleHasOutpost" :info="outpostInfo" :open="outpostOpen" :world-seed="atlasState.seed" @open="openOutpost" @close="closeOutpost" @release="releaseBattleInput" @purchased="syncHud" />
    <BattleExitPortal :info="exitPortalInfo" @activate="useExitPortal" @release="releaseBattleInput" />
    <BattleCompletion v-if="hud.dungeon?.phase === 'cleared'" :floor="hud.dungeon.floor" :max-floor="MAX_TOWER_FLOOR" :merchant="hud.merchant" :wallet="player.stones" :unclaimed="hud.lootCount" :library="store.library" :atlas="true" :portal="true" :summary="runSummary" @explore="useExitPortal" @challenge="nextFloor" @buy="buyMerchant" @release="releaseBattleInput" />
    <JourneyXpBar v-if="ready" :level="journeyHud.level" :xp="journeyHud.xp" :need="journeyHud.need" :ratio="journeyHud.ratio" :talent-points="journeyHud.unspent" @talents="openHUDFunction('talents')" />
    <CoachMark v-if="ready && !openedPanel && !atlasOpen" :guide="coach.guide" :tip="coach.tip" :index="coach.index" :total="coach.total" @skip="skipCoach" @dismiss="dismissCoachTip" @release="releaseBattleInput" />
    <FeedbackLayer />
    <div class="b3-bottom">
      <div class="b3-slots b3-skill-slots">
        <button v-for="(s, i) in hud.skills" :key="i" type="button" class="slot skill" :class="{on: i === hud.selected, empty: !s, bad: s?.error}" @pointerenter="showSkillDetails(i, $event)" @pointerleave="leaveSkillDetails" @focus="showSkillDetails(i, $event)" @blur="leaveSkillDetails" @click="toggleSkillPicker(i)" @keydown.enter.stop @keydown.space.stop :aria-label="'主动技能 ' + (i + 1) + '：' + (s?.name || '空槽')" :aria-describedby="skillDetailSlot === i && skillDetail ? 'battle-skill-tooltip' : undefined" :aria-pressed="i === hud.selected" aria-haspopup="dialog" :aria-expanded="skillPickerSlot === i" :aria-controls="skillPickerSlot === i ? 'active-skill-picker' : undefined" :title="s ? undefined : '点击装配技能'">
          <kbd>{{ i + 1 }}</kbd><img v-if="s" class="game-icon" :src="iconSrc('skill', s.id)" alt="" draggable="false"><b v-else>+</b><span>{{ s?.name || '空槽' }}{{ s?.cooldown ? ' ' + Math.ceil(s.cooldown) + 's' : '' }}</span><i v-if="s?.granted">装备</i>
        </button>
        <BattleIconPicker v-if="skillPickerSlot >= 0" id="active-skill-picker" :label="'装配技能 · 槽位 '+(skillPickerSlot+1)" mode="skill" :choices="activePickerChoices" :current="player.loadout.skills[skillPickerSlot]" @choose="chooseSkill" @close="closeSkillPicker(skillPickerSlot)" @release="releaseBattleInput" @shortcut="skillPickerKey" />
      </div>
      <div class="b3-slots belt b3-belt-slots">
        <button v-for="(id, i) in beltSlots" :key="i" type="button" class="slot item" :class="{empty: !id, 'aura-enabled': auraId(id) && hud.activeAuras.includes(auraId(id)), none: id && !auraId(id) && !ownedCount('item', id)}" :title="auraId(id) ? undefined : '点击配置 ' + BELT_KEYS[i] + (id ? '；按 ' + BELT_KEYS[i] + ' 使用消耗品' : '')" :aria-label="'快捷槽 ' + BELT_KEYS[i] + '：' + (id ? (auraId(id) ? docOf('skill', auraId(id))?.name + (hud.activeAuras.includes(auraId(id)) ? ' · 已启用' : ' · 未启用') : itemName(id)) : '空槽')" :aria-describedby="auraDetailSlot === i && skillDetail ? 'battle-skill-tooltip' : undefined" aria-haspopup="dialog" :aria-expanded="beltPickSlot === i" :aria-controls="beltPickSlot === i ? 'belt-skill-picker' : undefined" @pointerenter="showAuraDetails(i, $event)" @pointerleave="leaveSkillDetails" @focus="showAuraDetails(i, $event)" @blur="leaveSkillDetails" @click="openBeltPicker(i)" @contextmenu.prevent.stop="openBeltPicker(i)" @keydown.enter.stop @keydown.space.stop>
          <kbd>{{ BELT_KEYS[i] }}</kbd>
          <template v-if="id"><img class="game-icon" :src="iconSrc(auraId(id) ? 'skill' : 'item', auraId(id) || id)" alt="" draggable="false"><BattleAuraState v-if="auraId(id) && hud.activeAuras.includes(auraId(id))" /><span>{{ auraId(id) ? docOf('skill', auraId(id))?.name : itemName(id) }}</span><em>{{ auraId(id) ? (hud.activeAuras.includes(auraId(id)) ? '启用' : '关闭') : '×' + ownedCount('item', id) }}</em></template>
          <template v-else><b>+</b><span>空槽</span></template>
        </button>
        <BattleIconPicker v-if="beltPickSlot >= 0" id="belt-skill-picker" :label="'光环与药剂 · '+BELT_KEYS[beltPickSlot]" mode="belt" :choices="beltPickerChoices" :current="player.loadout.belt[beltPickSlot]" @choose="chooseBelt" @close="closeBeltPicker(beltPickSlot)" @release="releaseBattleInput" @shortcut="beltPickerKey" />
      </div>
    </div>
    <div class="b3-dead" v-if="hud.dead || hud.dungeon?.phase === 'failed'"><b>止步第 {{ hud.dungeon?.floor }} 层</b><span v-if="hud.dungeon?.failureReason === 'timeout'">超时失败：30 秒内未击败地牢首领</span><span>按 R 重新爬塔</span><button type="button" class="btn sm" @click="restart">重新爬塔</button></div>
    <div class="b3-help">WASD 移动 · 鼠标瞄准 · 左键/空格施法 · 1–4 技能 · Q E T G 消耗品／光环开关 · Shift 闪避 · 点击掉落拾取 · Z 显示掉落</div>
    <div class="b3-loading" v-if="!ready && !atlasOpen">{{ store.error || '准备战场…' }}</div>
  </div>

  <BattleTraitEquipment v-if="openedPanel === 'trait-equipment'" @close="closeHUDPanel" @drop="spawnTraitEquipment" />
  <BattleSkillTooltip v-if="skillDetail && skillPickerSlot < 0 && beltPickSlot < 0 && !openedPanel" :detail="skillDetail" :position="skillDetailPosition" :icon="iconSrc('skill', skillDetail.id)" @hold="holdSkillDetails" @leave="leaveSkillDetails" />
  <BattleDungeonMap v-if="openedPanel === 'dungeon-map' && floorMap && hud.dungeon" expanded :layout="floorMap" :state="hud.dungeon" @release="releaseBattleInput" @close="closeHUDPanel" />
  <BattleWindow v-if="openedPanel === 'craft'" title="工匠台" kind="craft" @close="closeHUDPanel">
    <CraftBench :entries="craftEntries" :selected="inspector.pinned ? inspector.key : ''" :collections="store.collections" :counts="player.owned.item" @select="craftSelect" />
  </BattleWindow>
  <BattleWindow v-if="openedPanel === 'quests'" title="任务日志" kind="quests" @close="closeHUDPanel">
    <div class="qc-legacy" v-if="quests[0] && quests[0].stage === 'reward'"><QuestJournal :quests="quests" :collections="store.collections" :library="store.library" :floor="hud.dungeon?.floor" :phase="hud.dungeon?.phase" @claim="claimTaskReward" @challenge="challengeQuestFloor" @continue="closeHUDPanel" /></div>
    <ChainJournal :rows="journeyHud.rows" :collections="store.collections" :library="store.library" :journey="player.journey" :talent-points="journeyHud.unspent" @claim="claimChain" />
  </BattleWindow>
  <BattleWindow v-if="openedPanel === 'talents'" title="天赋星盘" kind="talents" @close="closeHUDPanel">
    <TalentConstellation :in-battle="true" :runtime-attributes="hud.character?.attributes || []" @changed="releaseBattleInput" />
  </BattleWindow>
  <BattleWindow v-if="openedPanel === 'builds'" title="构筑图鉴" kind="builds" @close="closeHUDPanel">
    <BattleBuildGuide :rows="bdRows" :library="store.library" :collections="store.collections" :initial-id="buildGuideId" :loading="bdLoading" :error="bdError" :ready="ready" @apply="applyBd" @close="closeHUDPanel" @retry="loadBds" />
  </BattleWindow>
  <BattleWindow v-if="openedPanel === 'inventory'" title="背包" kind="inventory" @close="closeHUDPanel" @ground-dragover="overGround" @ground-drop="dropOnGround">
    <div class="b3-inventory-compartments">
    <section class="b3-inventory card" aria-label="普通背包">
      <h3 class="b3-bag-section-title">普通背包</h3>
      <header class="b3-panel-head">
        <span class="b3-bag-wallet" aria-label="灵石余额"><i class="stone-ico" aria-hidden="true"></i><b>{{ player.stones }}</b><small>灵石</small></span>
        <span class="b3-bag-capacity">6 × 12</span>
        <span class="b3-inventory-count" aria-live="polite">{{ bagQuery.trim() ? filteredBagEntries.length + ' / ' : '' }}{{ ordinaryBagEntries.length }} 项</span>
        <div class="b3-bag-search">
          <input ref="bagSearch" v-model="bagQuery" type="search" aria-label="搜索背包" placeholder="搜索名称 / 词条" autocomplete="off" @focus="releaseBattleInput" @keydown.esc.stop.prevent="bagQuery ? bagQuery = '' : closeHUDPanel()">
          <button v-if="bagQuery" type="button" aria-label="清空背包搜索" @click="clearBagSearch">×</button>
        </div>
        <button type="button" class="btn sm b3-bag-sort" aria-label="整理全部背包" title="整理所有分页，合并同类堆叠并按类别排列" @click="sortBag">整理</button>
        <nav class="b3-bag-pages" aria-label="背包翻页">
          <button type="button" :disabled="bag.page === 0" @click="bagPage = bag.page - 1" @dragenter.prevent="hoverBagPage(-1)" @dragover.prevent @dragleave="cancelBagPageHover" aria-label="背包上一页">‹</button>
          <span class="mono">{{ bag.page + 1 }} / {{ bag.pages }}</span>
          <button type="button" :disabled="bag.page + 1 >= bag.pages" @click="bagPage = bag.page + 1" @dragenter.prevent="hoverBagPage(1)" @dragover.prevent @dragleave="cancelBagPageHover" aria-label="背包下一页">›</button>
        </nav>
      </header>
      <div class="b3-bag-grid" role="group" aria-label="背包格子，6 行 12 列">
        <button v-for="(item, i) in bag.cells" :key="i" type="button" class="b3-bag-cell" :class="[item ? 'r-' + item.rarity : 'empty', {'inventory-new': isInventoryNew(player, item), selected: item && selectedBagKey === item.key, dragging: item && draggedKey === item.key, 'drop-target': dropSlot === bag.page * INVENTORY_PAGE_SIZE + i}]"
          :tabindex="item ? 0 : -1" :data-stack-key="item?.key" :data-item-kind="item?.kind" :data-bag-slot="bag.page * INVENTORY_PAGE_SIZE + i" :draggable="!!item && !bagQuery.trim()" :aria-label="item ? item.name + '，数量 ' + item.count : '空格 ' + (bag.page * INVENTORY_PAGE_SIZE + i + 1)" :aria-pressed="!!item && selectedBagKey === item.key" @click="item && selectInventoryItem(item.key)" @contextmenu.prevent.stop="openEquipmentMenu(item, $event)" @keydown.shift.f10.prevent.stop="openEquipmentMenu(item, $event)" @pointerdown="beginPointerBagDrag(item, $event)" @dragstart.stop="startBagDrag(item, $event)" @dragend="endBagDrag" @dragover.prevent="hoverBagCell(i)" @dragleave="dropSlot = -1" @drop.prevent.stop="dropBagItem(i)" @pointerenter="inspectItem(item, $event)" @pointerleave="inspector.leave(item?.key)" @focus="inspectItem(item, $event)" @blur="inspector.leave(item?.key)">
          <template v-if="item"><img class="game-icon" :src="iconSrc(item.kind, item)" :data-currency-grade="item.currencyGrade" alt="" draggable="false"><small class="b3-bag-kind">{{ bagKind(item) }}<template v-if="item.tier"> T{{ item.tier }}</template></small><span class="b3-bag-equipped" v-if="item.unidentified">未鉴定</span><span class="b3-bag-equipped" v-else-if="item.equipped">已配</span><em v-if="item.count > 1">{{ item.count }}</em><span v-if="isInventoryNew(player, item)" class="inventory-new-edge" aria-hidden="true"></span></template>
        </button>
        <p v-if="bagQuery.trim() && !filteredBagEntries.length" class="b3-bag-empty" role="status">没有匹配的物品</p>
      </div>
      <footer class="b3-bag-detail" :title="selectedBagItem ? bagTitle(selectedBagItem) : ''">
        <template v-if="selectedBagItem"><b>{{ selectedBagItem.tier ? 'T' + selectedBagItem.tier + ' · ' : '' }}{{ selectedBagItem.name }}</b><span>×{{ selectedBagItem.count }}</span><span v-if="selectedBagItem.unidentified">未鉴定</span><span v-else-if="selectedBagItem.instance">{{ selectedBagItem.affixCount }} 条随机词条</span><span v-else>{{ selectedBagItem.description }}</span><button v-if="selectedBagItem.instance && !selectedBagItem.unidentified" class="btn sm" @click="toggleBagEquipment(selectedBagItem)">{{ selectedBagItem.equipped ? '卸下' : '装备' }}</button><button v-if="selectedBagItem.kind === 'equipment'" class="btn sm" @click="inspectItem(selectedBagItem, $event, true)">{{ selectedBagItem.unidentified ? '鉴定' : '洗炼' }}</button></template>
        <span v-else>{{ bagQuery.trim() ? '清空搜索后可拖拽 · 右键丢到地面 / 拆分' : '拖拽摆放 / 合并 · 拖到窗口外丢到地面 · 右键操作' }}</span>
      </footer>
    </section>
    <section class="b3-equipped-backpack" aria-label="装备背包">
      <header><h3 class="b3-bag-section-title">装备背包</h3><span>{{ equippedBagEntries.length }} / 9</span></header>
      <p>当前穿戴 · 卸下后返回普通背包</p>
      <div class="b3-equipped-bag-grid" role="group" aria-label="已穿戴装备格子">
        <div v-for="gear in characterEquipment" :key="gear.slot" class="b3-equipped-bag-slot">
          <span>{{ gear.slotName }}</span>
          <button type="button" class="b3-bag-cell" :class="[gear.item ? 'r-' + gear.item.rarity : 'empty', {selected: gear.item && selectedBagKey === gear.item.key, dragging: gear.item && draggedKey === gear.item.key}]"
            :data-equipped-slot="gear.slot" :data-stack-key="gear.item?.key" data-item-kind="equipment" :draggable="!!gear.item"
            :aria-label="gear.slotName + '：' + (gear.item?.name || '未装备')" :aria-pressed="!!gear.item && selectedBagKey === gear.item.key" @click="gear.item && selectInventoryItem(gear.item.key)"
            @contextmenu.prevent.stop="openEquipmentMenu(gear.item, $event)" @keydown.shift.f10.prevent.stop="openEquipmentMenu(gear.item, $event)"
            @pointerenter="inspectItem(gear.item, $event)" @pointerleave="inspector.leave(gear.item?.key)" @focus="inspectItem(gear.item, $event)" @blur="inspector.leave(gear.item?.key)"
            @pointerdown="beginPointerBagDrag(gear.item, $event)" @dragstart.stop="startBagDrag(gear.item, $event)" @dragend="endBagDrag" @dragover.prevent @drop.prevent.stop="dropEquippedBagItem(gear.slot)">
            <template v-if="gear.item"><img class="game-icon" :src="gear.icon" alt="" draggable="false"><small class="b3-bag-kind">T{{ gear.item.tier }}</small><span class="b3-bag-equipped">已配</span></template>
          </button>
        </div>
      </div>
      <p class="b3-equipped-bag-help">右键操作 · 拖至槽位装备<br>拖回普通背包卸下</p>
    </section>
    </div>
  </BattleWindow>
  <BattleWindow v-if="openedPanel === 'character'" title="角色" kind="character" @close="closeHUDPanel" @ground-dragover="overGround" @ground-drop="dropOnGround">
    <BattleCharacterPanel :character="hud.character" :equipment="characterEquipment" :skill="characterSkill" :inventory="characterInventory" :inventory-cells="characterCells" :inventory-total="ordinaryBagEntries.length" :selected-key="selectedBagKey" v-model:query="characterBagQuery" v-model:filter="characterBagFilter" @select="selectInventoryItem" @inspect="inspectItem" @leave="inspector.leave($event)" @context="openEquipmentMenu" @release="releaseBattleInput" @drag-start="startCharacterDrag" @drag-end="endBagDrag" @equip="equipCharacterItem" @unequip="unequipCharacterItem" @place="placeCharacterItem" @drop-outside="dropCharacterOutside" />
  </BattleWindow>

  <BattleWindow v-if="openedPanel === 'loadout'" title="配装与战场" kind="loadout" @close="closeHUDPanel">
  <aside class="b3-side card">
    <div class="block-head"><span class="dim">技能、装备与战场设置</span><a class="btn sm" href="#" @click.prevent="goShop">商店</a></div>
    <div class="b3-controls" aria-label="装备成长开局">
      <button type="button" class="btn sm" @click="beginProgression">初始武器开局</button>
      <template v-if="player.progression"><small class="dim" v-if="player.progression.preview">{{ player.progression.preview }} · 实战构筑预览</small><small class="dim" v-else>单武器成长 · 击杀 {{ player.stats.kills }} · 装备掉落 {{ player.progression.drops }}</small></template>
    </div>
    <h4>主动技能 <small>{{ equippedSkills.length }} / {{ SKILL_SLOTS }}</small></h4>
    <div class="active-skill-grid" aria-label="主动技能配置">
      <label v-for="(_, i) in hud.skills" :key="i" class="active-skill-slot" :class="{on: i === hud.selected, filled: player.loadout.skills[i]}">
        <span class="skill-slot-number">{{ i + 1 }}</span>
        <select :aria-label="'主动技能槽 ' + (i + 1)" :value="player.loadout.skills[i] || ''" @change="setSkill(i, $event.target.value, $event)">
          <option value="">空槽</option>
          <option v-for="s in availableSkillChoices" :key="s.id" :value="s.id">{{ skillChoiceName(s, i) }}</option>
        </select>
      </label>
    </div>
    <p class="skill-hint">每槽可独立配置或留空，按 1–4 切换。选择已配置的技能会将它移到当前槽。</p>
    <h4>固定装备 <small>2 槽</small></h4>
    <div class="equip-grid fixed-equipment">
      <div v-for="slot in hud.fixedEquipment" :key="slot.id" class="equip-slot"><span>{{ slot.name }}</span><b>{{ slot.itemName || '空槽' }}</b><small>{{ slot.traits || '无额外特性' }}</small></div>
    </div>
    <h4>装备</h4>
    <div class="equip-grid">
      <label v-for="slot in PLAYER_GEAR_SLOTS" :key="slot.id" class="equip-slot" :class="{on: player.loadout.equipment[slot.id]}" @contextmenu.prevent.stop="openEquippedMenu(player.loadout.equipment[slot.id], $event)" @pointerenter="inspectEquipment(player.loadout.equipment[slot.id], $event)" @pointerleave="inspector.leave('equipment:' + player.loadout.equipment[slot.id])">
        <span>{{ slot.name }}</span>
        <select :value="player.loadout.equipment[slot.id] || ''" @change="setEquip(slot.id, $event.target.value)">
          <option value="">—</option>
          <option v-for="e in ownedEquipment(slot.id)" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </label>
    </div>
    <h4>光环与消耗品 <small>Q E T G · {{ player.loadout.belt.filter(Boolean).length }} / {{ BELT_SLOTS }}</small></h4>
    <div class="pick-list">
      <p class="dim" v-if="!auraChoices.length">装备提供光环的非武器装备后，可在此装配。</p>
      <button v-for="it in auraChoices" :key="it.id" type="button" class="pick-row" :class="{on: player.loadout.belt.includes(auraBinding(it.id))}" @click="toggleBelt(auraBinding(it.id))">
        <span class="tile"><img class="game-icon" :src="iconSrc('skill', it.id)" alt="" draggable="false"></span><b>{{ it.name }}<small class="dim"> · 封印 {{ it.reservation }}% 魔力</small></b><em>{{ player.loadout.belt.includes(auraBinding(it.id)) ? '已装配 · 点击卸下' : '光环 · 点击装配' }}</em>
      </button>
      <div v-for="it in ownedItems" :key="it.id" class="pick-row" :class="['r-' + it.rarity, {on: player.loadout.belt.includes(it.id)}]" @click="toggleBelt(it.id)">
        <span class="tile" :class="'r-' + it.rarity"><img class="game-icon" :src="iconSrc('item', it.id)" alt="" draggable="false"></span><b>{{ it.name }}</b><em>×{{ ownedCount('item', it.id) }}</em>
      </div>
      <p class="dim" v-if="!ownedItems.length">背包里没有消耗品</p>
    </div>
    <h4>爬塔</h4>
    <div class="b3-controls b3-battle-settings" aria-label="战场设置">
      <p class="b3-tower-description">探索随机房间与走廊，击败首领即可通关，默认不限时。点击首领留下的传送阵，打开世界地图并选择高亮区域继续冒险。</p>
      <div class="b3-floor-select"><span>当前区域 · 第 {{ hud.dungeon?.floor }} 层</span><button type="button" class="btn sm" @click="openAtlas">查看世界地图</button></div>
      <label class="check"><input type="checkbox" v-model="showLoot"> 显示地面掉落（{{ hud.lootCount }}）</label>
      <small class="dim" v-if="pickupTarget">正在靠近掉落，WASD 可取消。</small>
      <label class="field"><span>怪物类型</span><select v-model="opts.monsterType" @change="restart" aria-label="战场怪物类型"><option value="all">按层数与权重混合生成</option><option v-for="m in monsterChoices" :key="m.id" :value="m.id" :disabled="!m.enabled || m.weight <= 0">{{ m.name }}{{ !m.enabled || m.weight <= 0 ? '（已停用）' : '（单种试战）' }}</option></select><small class="dim" v-if="opts.monsterType !== 'all'">单种试战忽略出现层数；正常爬塔请选择混合生成。</small></label>
      <label class="field"><span>每层总数（含首领，20–300）</span><input type="number" min="20" max="300" step="1" v-model.number="opts.monsterCount" aria-label="每层怪物总数"><small class="dim">重新爬塔后生效</small></label>
      <label class="check"><input type="checkbox" v-model="opts.timeLimitEnabled"> 30 秒限时</label>
      <label class="check"><input type="checkbox" v-model="opts.god"> 无敌</label>
      <label class="check"><input type="checkbox" v-model="opts.autoCast"> 自动施法</label>
      <div class="row gap"><button class="btn sm" @click="paused = !paused">{{ paused ? '继续' : '暂停' }}</button><button class="btn sm" @click="restart">重新爬塔</button></div>
      <div class="b3-audio-settings" aria-label="音效设置">
        <label class="check"><input type="checkbox" v-model="audioSettings.muted" @change="configureAudio"> 静音音效</label>
        <label class="field"><span>音效音量</span><input type="range" min="0" max="1" step="0.01" v-model.number="audioSettings.volume" @input="configureAudio" aria-label="音效音量"><output>{{ Math.round(audioSettings.volume * 100) }}%</output></label>
        <button type="button" class="btn sm" @click="previewAudio" :disabled="audioSettings.muted || audioSettings.volume === 0">试听音效</button>
      </div>
    </div>
    <h4>效果说明</h4>
    <div class="legend">
      <span v-for="(st, id) in STATUS_STYLE" :key="id" :style="{'--c': st.color}"><i>{{ st.glyph }}</i>{{ statusName(id) }}</span>
    </div>
    <div class="b3-log" v-if="hud.log.length"><div v-for="(l, i) in hud.log" :key="i"><span class="mono dim">{{ l.t.toFixed(1) }}s</span> {{ l.text }}</div></div>
  </aside>
  </BattleWindow>
  <BattleItemPanel v-if="inspectedItem" :item="inspectedItem" :pinned="inspector.pinned" :position="inspectorPosition" @close="inspector.close()" @equip="setEquip" @identified="identifiedItem" />
  <BattleEquipmentMenu v-if="menuItem" :key="equipmentMenu.serial" :item="menuItem" :x="equipmentMenu.x" :y="equipmentMenu.y" :price="saleQuote.price" :error="saleQuote.error" :can-split="canSplitStack(menuItem)" :can-drop="ready && !hud.dead" @close="closeEquipmentMenu" @equip="equipMenuItem" @identify="identifyMenuItem" @sell="sellMenuItem" @split="openStackSplit" @drop-ground="dropMenuItem" />
  <BattleStackSplit v-if="splitItem" :item="splitItem" @close="closeStackSplit" @split="confirmStackSplit" />
</div>`;

export function mountBattle(el, { input = null, rendering = {}, initialPaused = false } = {}) {
  let api = { show() {}, hide() {} };
  const app = createApp({
    components: { CraftBench, JourneyXpBar, ChainTracker, CoachMark, FeedbackLayer, ChainJournal, BattleMapEventTag, BattleStunOverlay, BattleTraitEquipment, BattleOutpostMerchant, BattleExitPortal, BattleMapEvents, QuestTracker, QuestJournal, TalentConstellation, AtlasMap, BattleItemPanel, BattleCompletion, BattleFunctions, BattleEquipmentMenu, BattleStackSplit, BattleWindow, BattleCharacterPanel, BattleBuildGuide, BattleSkillTooltip, BattleAuraState, BattleDungeonMap, BattleIconPicker, BattleLootHunter, BattlePlayerEffects, BattleDps, BattleSummonUnits, BattleMapCores },
    template: TEMPLATE,
    setup() {
      const stage = ref(null);
      const overlay = ref(null);
      const lootRoot = ref(null), showLoot = ref(true), pickupTarget = ref(''), groundItem = ref(null);
      let savedHunter = emptyHunter();
      try { savedHunter = normalizeHunter(JSON.parse(localStorage.getItem('dw-loot-hunter-v1') || 'null')); } catch {}
      const hunter = reactive(savedHunter), hunterShown = ref(0);
      const hunterPool = computed(() => { store.version; return store.library ? equipmentAffixPool(store.library) : []; });
      const hunterCurrencies = computed(() => { store.version; return hunterCurrencyPool(store.collections); });
      function setHunterTarget(id, enabled) {
        if (!hunterPool.value.some(affix => affix.id === id)) return;
        hunter.targets = enabled ? [...new Set([...hunter.targets, id])] : hunter.targets.filter(value => value !== id);
      }
      function setHunterCurrency(id, enabled) {
        if (!hunterCurrencies.value.some(currency => currency.id === id)) return;
        hunter.currencies = enabled ? [...new Set([...hunter.currencies, id])] : hunter.currencies.filter(value => value !== id);
      }
      watch(hunter, () => { pickupTarget.value = ''; try { localStorage.setItem('dw-loot-hunter-v1', JSON.stringify(hunter)); } catch {} }, { deep: true });
      watch([hunterPool, hunterCurrencies], ([pool, currencies]) => {
        if (!store.library || !store.collections) return;
        const next = normalizeHunter(hunter, new Set(pool.map(affix => affix.id)), new Set(currencies.map(currency => currency.id)));
        if (JSON.stringify(next.targets) !== JSON.stringify(hunter.targets)) hunter.targets = next.targets;
        if (JSON.stringify(next.currencies) !== JSON.stringify(hunter.currencies)) hunter.currencies = next.currencies;
      });
      const ready = ref(false);
      const paused = ref(initialPaused || ['map-events','quests'].includes(new URLSearchParams(location.search).get('prototype')));
      let orientationPaused = false, orientationResumePaused = false;
      const eventRunKey=ref(0),eventOpen=ref(false),eventMenuOpen=ref(false);let eventResumePaused=false;
      function openMapEvent(){eventResumePaused=paused.value;eventOpen.value=true;paused.value=true;releaseBattleInput();}
      function closeMapEvent(){eventOpen.value=false;paused.value=eventResumePaused;releaseBattleInput();}
      function mapEventChanged(){syncHud();}
      const mapEventUI=ref(null),mapEventTags=ref([]);
      function activateMapStation(id){
        const event=battle?.mapEvents?.find(event=>event.id===id&&event.kind!=='shop');
        if(!event||battle.hero.dead||battle.phase==='failed')return;
        releaseBattleInput();pickupTarget.value='';portalTarget.value=false;
        void mapEventUI.value?.open(event.kind);
      }
      function mapEventStatus(states){
        for(const event of battle?.mapEvents||[]){const state=states.find(value=>value.kind===event.kind);if(state)event.completed=state.completed;}
        syncHud();
      }
      const audio = createBattleAudio();
      const audioSettings = reactive(audio.settings);
      let audioPreloaded = false;
      async function armAudio() {
        const ready = await audio.unlock();
        if (ready && !audioPreloaded && !audio.settings.muted) { audioPreloaded = true; void audio.preload(); }
        return ready;
      }
      function configureAudio() { audio.configure(audioSettings); Object.assign(audioSettings, audio.settings); }
      function toggleAudio() { audioSettings.muted = !audioSettings.muted; configureAudio(); if (!audioSettings.muted) void previewAudio(); }
      async function previewAudio() { if (await armAudio() && active && !document.hidden) await audio.play('ui_confirm'); }
      const inAudioScope = event => el.contains(event.target) || !!event.target.closest?.('.b3-window-atlas');
      const unlockAudio = event => { if (active && inAudioScope(event)) void armAudio(); };
      const clickAudio = event => {
        if (!active || !inAudioScope(event) || event.target.closest('.b3-audio-controls, .b3-audio-settings')) return;
        const button = event.target.closest('button, [role="button"]');
        if (button && !button.disabled) void armAudio().then(ok => { if (ok && active && !document.hidden) void audio.play('ui_click'); });
      };
      const audioVisibility = () => {
        if (document.hidden || !active) { audio.suspend(); audio.reset(); }
        else audio.update(battle, { paused: paused.value || atlasOpen.value });
      };
      let atlasStorage; try { atlasStorage = window.localStorage; } catch {}
      let atlasStorageWarning = false;
      const atlasSession = new AtlasSession(atlasStorage, { onStorageError() {
        if (!atlasStorageWarning) notify('异界探索暂时无法保存；当前页面仍可继续探索', true);
        atlasStorageWarning = true;
      } });
      const atlasState = ref(markRaw(atlasSession.state)), atlasOpen = ref(false), atlasAttemptId = ref(null);
      const atlasCurrentNode = computed(() => atlasState.value.nodes.find(n => n.id === atlasAttemptId.value));
      let atlasResumePaused = false, atlasShown = false;
      const syncAtlas = () => { atlasState.value = markRaw(atlasSession.state); atlasAttemptId.value = atlasSession.nodeId; };
      function openAtlas() {
        closeOutpost();
        bdExpanded.value = false;
        if (atlasOpen.value) return;
        portalTarget.value = false;
        atlasSession.focusCurrent(); syncAtlas();
        releaseBattleInput(); closeSkillDetails(); closeSkillPicker(); closeHUDPanel(); inspector.close();
        atlasResumePaused = paused.value; paused.value = true; atlasOpen.value = true;
        audio.suspend();
      }
      function closeAtlas() {
        if (!atlasOpen.value) return;
        // After refresh there is no live dungeon to return to. The starter
        // region is a free route to the merchant, never a free paid dungeon.
        if (!battle) { challengeAtlas('0:0', true); return; }
        atlasOpen.value = false; paused.value = atlasResumePaused; releaseBattleInput();
        if (active && !document.hidden) audio.update(battle, { paused: paused.value });
        nextTick(() => stage.value?.focus({ preventScroll: true }));
      }
      function selectAtlas(id) {
        try { atlasSession.select(id); syncAtlas(); } catch (error) { notify(error.message, true); }
      }
      function detachAtlas() { atlasSession.detach(); syncAtlas(); }
      function challengeAtlas(id, retry = false) {
        if (!retry && atlasState.value.activeNodeId === id && atlasSession.battle === battle) { closeAtlas(); return; }
        try {
          let candidate;
          const { prepared, ticket } = travelAtlas(atlasSession, player, store.collections, id, prepared => {
            candidate = createAtlasRun(prepared, battle?.phase === 'cleared' && !battle.hero.dead);
            return candidate.battle;
          }, { retry: retry || id === '0:0' });
          installAtlasRun(candidate, prepared);
          if (ticket && !ticket.free) bump(player, 'mapsEntered');
          closeAtlas(); paused.value = false; stage.value?.focus({ preventScroll: true });
          notify(`进入 ${atlasCurrentNode.value.name} · 第 ${prepared.options.floor} 层`);
        } catch (error) { notify(error.message, true); }
      }
      const dps = new AverageTargetDps(), dpsHud = reactive({ amount: '0', targets: 0 });
      const dpsFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
      let nextDpsHud = 0;
      const recordDps = row => { coachCtx.damageDealt = 1; dps.record(row.TargetExternalId, row.Amount); };
      function resetDps() { dps.reset(); dpsHud.amount = '0'; dpsHud.targets = 0; nextDpsHud = 0; }
      const bagPage = ref(0);
      const bagQuery = ref(''), bagSearch = ref(null);
      const characterBagQuery = ref(''), characterBagFilter = ref('all');
      const selectedBagKey = ref('');
      const draggedKey = ref(''), dropSlot = ref(-1), splitKey = ref('');
      let bagPageTimer = null;
      const equipmentMenu = ref(null);
      let menuSerial = 0, menuAnchor = null;
      const skillPickerSlot = ref(-1);
      const beltPickSlot = ref(-1);
      const skillDetailSlot = ref(-1), auraDetailSlot = ref(-1), skillDetail = ref(null), skillDetailPosition = ref({});
      let skillDetailTimer = null;
      function holdSkillDetails() { clearTimeout(skillDetailTimer); skillDetailTimer = null; releaseBattleInput(); }
      function closeSkillDetails() { clearTimeout(skillDetailTimer); skillDetailTimer = null; skillDetailSlot.value = -1; auraDetailSlot.value = -1; skillDetail.value = null; }
      function leaveSkillDetails() {
        clearTimeout(skillDetailTimer);
        skillDetailTimer = setTimeout(() => {
          if (!document.querySelector('.slot[aria-describedby="battle-skill-tooltip"]:is(:hover, :focus-visible), #battle-skill-tooltip:hover')) closeSkillDetails();
        }, 150);
      }
      function showSkillDetails(index, event) {
        if (!battle?.skills[index] || skillPickerSlot.value >= 0 || beltPickSlot.value >= 0 || openedPanel.value) { closeSkillDetails(); return; }
        closeSkillDetails(); holdSkillDetails(); skillDetailSlot.value = index;
        positionSkillDetails(event);
        skillDetail.value = skillDetails(battle, index);
      }
      function positionSkillDetails(event) {
        const rect = event.currentTarget.getBoundingClientRect(), width = Math.min(370, innerWidth - 24);
        skillDetailPosition.value = { left: Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)) + 'px',
          bottom: innerHeight - rect.top + 10 + 'px', maxHeight: Math.max(100, rect.top - 22) + 'px' };
      }
      function showAuraDetails(index, event) {
        const detail = auraDetails(battle, auraId(player.loadout.belt[index]));
        if (!detail || skillPickerSlot.value >= 0 || beltPickSlot.value >= 0 || openedPanel.value) { closeSkillDetails(); return; }
        closeSkillDetails(); holdSkillDetails(); auraDetailSlot.value = index;
        positionSkillDetails(event); skillDetail.value = detail;
      }
      const inspector = reactive(new ItemInspector());
      const openedPanel = ref(''), panelSection = ref('');
      const quests = computed(() => questRows(player));
      const trackedQuest = computed(() => quests.value.find(quest => quest.stage !== 'claimed'));
      const activeHUDFunction = computed(() => atlasOpen.value ? 'atlas' : eventMenuOpen.value ? 'events' : bdExpanded.value ? 'bd' : beltPickSlot.value >= 0 ? 'belt' : openedPanel.value === 'inventory' ? 'inventory'
        : openedPanel.value === 'trait-equipment' ? 'trait-equipment' : openedPanel.value === 'character' ? 'character' : openedPanel.value === 'quests' ? 'quests' : openedPanel.value === 'dungeon-map' ? 'dungeon-map' : openedPanel.value === 'talents' ? 'talents' : openedPanel.value === 'craft' ? 'craft' : openedPanel.value === 'builds' ? 'bd' : openedPanel.value === 'loadout' ? panelSection.value : hunter.visible ? 'hunter' : '');
      let panelResumePaused = false;
      watch(openedPanel, (value, previous) => {
        const pauses = panel => ['talents', 'quests', 'dungeon-map', 'trait-equipment', 'craft'].includes(panel);
        if(pauses(value) && !pauses(previous)) {panelResumePaused=paused.value;paused.value=true;releaseBattleInput();}
        else if(pauses(previous) && !pauses(value)) {paused.value=panelResumePaused;releaseBattleInput();}
      }, {flush:'sync'});
      const buildGuideId = ref('synergy_rime_thunder');
      const mapPanelTab = ref('equipment');
      let mapStorage; try { mapStorage = window.localStorage; } catch {}
      let mapCoreId = '';
      const availableMapCores = computed(() => { store.version; return mapCoreChoices(store.collections, store.library); });
      function chooseMapCore(id) {
        releaseBattleInput();
        try { mapCoreId = configureMapCore(tower, id, mapStorage); syncHud(); }
        catch (error) { notify(error.message, true); }
      }
      const floorMap = ref(null);
      const bdEntries = ref([]), bdLoading = ref(false), bdError = ref(''), openedBd = ref('');
      const bdExpanded = ref(false);
      const selectedBdFamilyId = ref('');
      const opts = reactive({ god: false, autoCast: false, monsterType: 'all', monsterCount: 20, floor: 1, timeLimitEnabled: false });
      const hud = reactive({ activeAuras: [], health: 0, maxHealth: 0, shield: 0, maxShield: 0, mana: 0, maxMana: 0, manaCap: 0, reservedMana: 0, manaReservationPercent: 0, recharging: false, stunned: false, noResource: false, buffs: [], effects: [], earned: 0, kills: 0, monsters: 0, projectiles: 0, time: '0:00', fps: 0, skills: skillSlots(), selected: 0, dead: false, log: [], character: null, summonUnits: summonUnitPanel(null) });
      const keys = new Set();
      const mouse = { x: 0, y: 0, down: false, inside: false, pending: null };
      const battleHasOutpost=ref(false),outpostOpen=ref(false),outpostInfo=reactive({visible:false,x:0,y:0});let outpostResumePaused=false;
      function openOutpost(){
        if(outpostOpen.value||!battle?.outpostMerchant||battle.hero.dead||battle.phase==='failed')return;
        closeAtlas();releaseBattleInput();closeHUDPanel();closeSkillDetails();closeSkillPicker();inspector.close();
        outpostResumePaused=paused.value;paused.value=true;outpostOpen.value=true;audio.suspend();
      }
      function closeOutpost(){if(!outpostOpen.value)return;outpostOpen.value=false;paused.value=outpostResumePaused;releaseBattleInput();nextTick(()=>stage.value?.focus({preventScroll:true}));}
      const portalTarget = ref(false), exitPortalInfo = reactive({ visible: false, x: 0, y: 0, near: false, approaching: false });
      let touchTargetId = null;
      let tower = null, battle = null, scene = null, view = null, lootView = null, raf = 0, active = false, last = 0, fps = 60, hudTick = 0;
      const dungeonObjective = computed(() => {
        const d = hud.dungeon;
        if (!d) return '';
        if (d.phase === 'cleared') return '首领已击败 · 点击传送阵前往世界地图';
        if (d.phase === 'failed') return d.failureReason === 'timeout' ? '超时失败' : '本次挑战结束';
        const clock = d.timeLimitEnabled ? `${Math.ceil(d.remainingTime)}s` : '不限时';
        if (d.phase === 'boss') return `击败本层首领 · ${clock}`;
        return `探索随机地牢 · 击败首领 · ${clock}`;
      });

      const lib = () => store.library;
      const docOf = (kind, id) => store.collections?.[kind]?.get(id)?.doc;
      const itemName = id => docOf('item', id)?.name || id;
      const statusName = id => lib()?.statusDisplayName(id) || id;
      const bdRows = computed(() => {
        store.version;
        return bdEntries.value.map(entry => {
          const skill = entry.loadout.skills?.find(Boolean);
          const equipment = Object.entries(entry.loadout.equipment || {}).map(([slot, id]) => ({
            slot, slotName: SLOTS.find(s => s.id === slot)?.name || slot,
            name: entry.loadout.instances?.[id] ? `T${entry.loadout.instances[id].tier} · ${entry.loadout.instances[id].name}` : docOf('equipment', id)?.name || id,
            owned: ownsEquipment(id), equipped: ownsEquipment(id) && player.loadout.equipment[slot] === id,
          }));
          const equipped = equipment.every(eq => eq.equipped) && player.loadout.skills.includes(skill);
          return { ...entry, skillName: lib()?.buildDisplayName(skill) || skill, equipment, equipped };
        });
      });
      const bdFamilies = computed(() => groupBuildPresets(bdRows.value));
      const selectedBdFamily = computed(() => bdFamilies.value.find(group => group.id === selectedBdFamilyId.value) || null);
      async function loadBds() {
        if (bdLoading.value) return;
        bdLoading.value = true; bdError.value = '';
        try {
          const response = await fetch('/presets/index.json', { cache: 'no-store' });
          if (!response.ok) throw new Error('BD 列表加载失败');
          const index = await response.json();
          if (!Array.isArray(index)) throw new Error('BD 列表格式错误');
          const entries = await Promise.all(index.map(async entry => {
            if (!/^[a-z0-9_]+$/.test(entry.id) || typeof entry.name !== 'string') throw new Error('BD 列表格式错误');
            const response = await fetch(`/presets/${entry.id}.json`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`${entry.name}配装加载失败`);
            const loadout = minimumTierPreset(await response.json(), store.library);
            if (!Array.isArray(loadout.skills) || !loadout.equipment || typeof loadout.equipment !== 'object') throw new Error(`${entry.name}配装格式错误`);
            return { ...entry, loadout };
          }));
          bdEntries.value = entries;
        } catch (error) { bdError.value = error.message || 'BD 列表加载失败'; }
        finally { bdLoading.value = false; }
      }
      function releaseBattleInput() { keys.clear(); mouse.down = false; mouse.inside = false; mouse.pending = null; touchTargetId = null; input?.reset(); }
      function applyBd(bd) {
        releaseBattleInput();
        const result = applyBuildPreset(player, bd.loadout, store.collections, store.library);
        if (result.error) { notify(result.error, true); return; }
        resetDps();
        if (bd.loadout.provenance && player.progression) player.progression.preview = bd.name;
        if (tower) { tower.setLoadout(ownedLoadout()); selectSkill(result.selected); syncHud(); }
        notify(`已应用「${bd.name}」BD`);
      }
      const rawBagEntries = computed(() => { store.version; return inventoryEntries(player, store.collections); });
      const mapDeviceItems = computed(() => rawBagEntries.value.map(item=>({...item,tier:item.tier || store.collections.item?.get(item.id)?.doc?.tier || 0,iconSrc:iconSrc(item.kind,item)})));
      const compartments = computed(() => partitionInventory(rawBagEntries.value));
      const ordinaryRawEntries = computed(() => compartments.value.ordinary);
      const equippedBagEntries = computed(() => compartments.value.equipped);
      const bagView = computed(() => reconcileInventoryLayout(player.bagLayout, ordinaryRawEntries.value));
      const ordinaryBagEntries = computed(() => bagView.value.entries);
      const bagEntries = computed(() => [...ordinaryBagEntries.value, ...equippedBagEntries.value]);
      const characterInventory = computed(() => {
        const filter = characterBagFilter.value;
        const entries = ordinaryBagEntries.value.filter(item => filter === 'all' || item.kind === 'equipment' && (filter === 'equipment' || item.slot === filter));
        return filterInventoryEntries(entries, characterBagQuery.value, lib()).map(item => ({ ...item, icon: iconSrc(item.kind, item), isNew: isInventoryNew(player, item) }));
      });
      const characterCells = computed(() => characterInventoryGrid(bagView.value, characterInventory.value));
      const characterEquipment = computed(() => PLAYER_GEAR_SLOTS.map(slot => {
        const id = player.loadout.equipment[slot.id];
        const item = equippedBagEntries.value.find(entry => entry.kind === 'equipment' && entry.id === id);
        const doc = player.instances[id] || docOf('equipment', id);
        return { slot: slot.id, slotName: slot.name, item, name: item?.name || '',
          tier: item ? equipmentTier(doc || item) : 0, rarity: item?.rarity || '',
          rarityName: EQUIPMENT_RARITY_NAMES[item?.rarity] || '', icon: item ? iconSrc('equipment', doc || item) : '' };
      }));
      const characterSkill = computed(() => {
        const skill = hud.skills[hud.selected];
        return skill ? { ...skill, icon: iconSrc('skill', skill.id) } : null;
      });
      watch(() => bagView.value.layout, layout => { if (JSON.stringify(player.bagLayout) !== JSON.stringify(layout)) player.bagLayout = layout; }, { immediate: true });
      const filteredBagEntries = computed(() => filterInventoryEntries(ordinaryBagEntries.value, bagQuery.value, lib()));
      const bag = computed(() => bagQuery.value.trim() ? inventoryPage(filteredBagEntries.value, bagPage.value) : inventoryGrid(bagView.value, bagPage.value));
      const selectedBagItem = computed(() => bagEntries.value.find(item => item.key === selectedBagKey.value));
      const menuItem = computed(() => bagEntries.value.find(item => item.key === equipmentMenu.value?.key));
      const saleQuote = computed(() => menuItem.value?.kind === 'equipment' ? equipmentSaleQuote(player, menuItem.value.id, store.collections, store.catalog) : {});
      const splitItem = computed(() => bagEntries.value.find(item => item.key === splitKey.value));
      watch(splitItem, item => { if (!canSplitStack(item)) splitKey.value = ''; });
      watch(menuItem, item => { if (!item) closeEquipmentMenu(); });
      watch(bagQuery, () => { bagPage.value = 0; endBagDrag(); });
      function clearBagSearch() { bagQuery.value = ''; bagSearch.value?.focus(); }
      function cancelBagPageHover() { if (bagPageTimer !== null) clearTimeout(bagPageTimer); bagPageTimer = null; }
      let pointerBagDrag = null;
      function endBagDrag() { pointerBagDrag = null; draggedKey.value = ''; dropSlot.value = -1; cancelBagPageHover(); }
      function beginPointerBagDrag(item, event) {
        
        if (event.button !== 0 || !item || bagQuery.value.trim() && !item.equippedEntry) return;
        pointerBagDrag = { key:item.key, x:event.clientX, y:event.clientY, active:false };
      }
      function movePointerBagDrag(event) {
        const pending=pointerBagDrag;if(!pending)return;
        
        if(!(event.buttons&1)){pointerBagDrag=null;return;}
        if(!pending.active&&Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>6){pending.active=true;releaseBattleInput();closeEquipmentMenu();inspector.closeHover();draggedKey.value=pending.key;}
        if(pending.active){event.preventDefault();const hit=document.elementFromPoint(event.clientX,event.clientY),target=hit?.closest('[data-bag-slot]');dropSlot.value=target?Number(target.dataset.bagSlot):-1;const page=hit?.closest('.b3-bag-pages button')?.getAttribute('aria-label');if(page==='背包上一页'||page==='背包下一页')hoverBagPage(page==='背包上一页'?-1:1);else cancelBagPageHover();}
      }
      function finishPointerBagDrag(event) {
        const pending=pointerBagDrag;pointerBagDrag=null;if(!pending?.active)return;
        
        const hit=document.elementFromPoint(event.clientX,event.clientY),target=hit?.closest('[data-equipped-slot],[data-bag-slot]');
        if(target?.dataset.equippedSlot)dropEquippedBagItem(target.dataset.equippedSlot);
        else if(target?.dataset.bagSlot!==undefined)dropBagItem(Number(target.dataset.bagSlot)%INVENTORY_PAGE_SIZE);
        else if(hit&&groundDragTarget({target:hit}))dropInventoryItem(pending.key);
        endBagDrag();
      }
      function startBagDrag(item, event) {
        
        // Gear uses pointer drags across both bags. Native HTML drag capture
        // can swallow the release before an equipment slot receives a drop.
        if(item?.kind==='equipment'){event.preventDefault();return;}
        pointerBagDrag=null;
        if (!item || bagQuery.value.trim() && !item.equippedEntry) { event.preventDefault(); return; }
        releaseBattleInput(); closeEquipmentMenu(); inspector.closeHover();
        draggedKey.value = item.key;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-rulestudio-stack', item.key);
      }
      function startCharacterDrag(item) {
        releaseBattleInput(); closeEquipmentMenu(); inspector.closeHover(); draggedKey.value = item.key;
      }
      function groundDragTarget(event) {
        return !!draggedKey.value && (event.target === stage.value || event.target.tagName === 'CANVAS'
          || event.target.classList.contains('b3-window-layer'));
      }
      function overGround(event) {
        if (!groundDragTarget(event)) return;
        const item = bagEntries.value.find(item => item.key === draggedKey.value);
        if (!battle?.rewards || battle.hero.dead || !['equipment', 'item'].includes(item?.kind)) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      }
      function dropOnGround(event) {
        if (!groundDragTarget(event)) return;
        event.preventDefault(); event.stopPropagation();
        dropInventoryItem(draggedKey.value);
        endBagDrag();
      }
      function dropInventoryItem(key) {
        const item = bagEntries.value.find(item => item.key === key);
        if(item&&eventLocked(player,item.id))return notify('装备已被地图祭坛锁定',true);
        if (!item || !battle?.rewards) return;
        releaseBattleInput();
        const layout = reducePlacedStack(bagView.value.layout, key, item.count);
        const result = battle.rewards.dropInventory(player, { kind: item.kind, id: item.id, count: item.count }, battle.hero);
        if (result.error) return notify(result.error, true);
        if(item.equippedEntry&&player.loadout.equipment[item.slot]===item.id)setEquip(item.slot,'');
        player.bagLayout = layout;
        if (inspector.key === key) inspector.close();
        if (selectedBagKey.value === key) selectedBagKey.value = '';
        showLoot.value = true;
        syncHud();
        notify(`已丢到地面：${result.drop.name}${item.count > 1 ? ' ×' + item.count : ''}`);
      }
      function dropMenuItem() {
        const key = menuItem.value?.key;
        closeEquipmentMenu();
        if (key) dropInventoryItem(key);
      }
      function equipCharacterItem(slot, id) {
        const item = bagEntries.value.find(item => item.kind === 'equipment' && item.id === id);
        if (!item || !ownsEquipment(id)) return;
        if (item.unidentified) return notify('请先鉴定装备', true);
        if (item.slot !== slot || !PLAYER_GEAR_SLOTS.some(entry => entry.id === slot)) return;
        if (player.loadout.equipment[slot] !== id) setEquip(slot, id);
      }
      function unequipCharacterItem(slot, id) {
        if (player.loadout.equipment[slot] === id && PLAYER_GEAR_SLOTS.some(entry => entry.id === slot)) setEquip(slot, '');
      }
      function hoverBagCell(index) {
        cancelBagPageHover();
        if (draggedKey.value && !bagQuery.value.trim()) dropSlot.value = bag.value.page * INVENTORY_PAGE_SIZE + index;
      }
      function dropBagItem(index) {
        
        if (!draggedKey.value || bagQuery.value.trim()) return;
        placeInventoryItem(draggedKey.value,bag.value.page * INVENTORY_PAGE_SIZE + index);
      }
      function placeCharacterItem(item,index) {
        if (!characterCells.value.some(cell => cell.index === index && !cell.item)) return;
        placeInventoryItem(item.key,index,characterCells.value.at(-1).index+1);
      }
      function dropCharacterOutside(item,target) {
        if(target&&groundDragTarget({target}))dropInventoryItem(item.key);
      }
      function placeInventoryItem(sourceKey,targetIndex,minimumCapacity=0) {
        const item = bagEntries.value.find(entry => entry.key === sourceKey);
        if (!item) { endBagDrag(); return; }
        let key = sourceKey;
        if (item?.equippedEntry) {
          if (eventLocked(player,item.id)) { endBagDrag(); return notify('装备已被地图祭坛锁定',true); }
          if (!setEquip(item.slot, '')) { endBagDrag(); return; }
          const view = reconcileInventoryLayout(player.bagLayout, ordinaryRawEntries.value);
          player.bagLayout = view.layout;
          const returned = view.entries.find(entry => entry.id === item.id && entry.kind === 'equipment');
          if (!returned) { endBagDrag(); return; }
          key = returned.key;
          if (returned.count > 1) {
            const split = splitInventoryStack(player.bagLayout, ordinaryRawEntries.value, key, 1);
            if (split.error) { endBagDrag(); return notify(split.error,true); }
            player.bagLayout = split.layout; key = split.key;
          }
        }
        const result = moveInventoryStack(player.bagLayout, ordinaryRawEntries.value, key, targetIndex,{minimumCapacity});
        endBagDrag();
        if (result.error) return notify(result.error, true);
        player.bagLayout = result.layout;
      }
      function dropEquippedBagItem(slot) {
        const item = bagEntries.value.find(entry => entry.key === draggedKey.value);
        endBagDrag();
        if (item?.kind === 'equipment' && item.slot === slot) equipCharacterItem(slot,item.id);
      }
      function hoverBagPage(direction) {
        cancelBagPageHover();
        if (!draggedKey.value || bagQuery.value.trim()) return;
        const page = bag.value.page + direction;
        if (page < 0 || page >= bag.value.pages) return;
        bagPageTimer = setTimeout(() => { bagPage.value = page; dropSlot.value = -1; bagPageTimer = null; }, 450);
      }
      function sortBag() {
        releaseBattleInput(); endBagDrag(); closeEquipmentMenu(); inspector.closeHover();
        player.bagLayout = organizeInventory(player.bagLayout, ordinaryRawEntries.value).layout;
        bagPage.value = 0;
        notify('已整理全部背包');
      }
      function closeStackSplit() {
        splitKey.value = '';
        nextTick(() => { if (menuAnchor?.isConnected) menuAnchor.focus({ preventScroll: true }); });
      }
      function openStackSplit() {
        const item = menuItem.value;
        closeEquipmentMenu(); inspector.closeHover(); releaseBattleInput();
        if (canSplitStack(item)) splitKey.value = item.key;
      }
      function confirmStackSplit(amount) {
        const result = splitInventoryStack(player.bagLayout, ordinaryRawEntries.value, splitKey.value, amount);
        if (result.error) return notify(result.error, true);
        player.bagLayout = result.layout;
        splitKey.value = '';
        selectedBagKey.value = result.key;
        bagPage.value = bagQuery.value.trim() ? 0 : Math.floor(result.slotIndex / INVENTORY_PAGE_SIZE);
        nextTick(() => {
          const button = [...document.querySelectorAll('.b3-bag-cell')].find(button => button.dataset.stackKey === result.key);
          button?.focus({ preventScroll: true });
        });
      }
      const inspectedItem = computed(() => groundItem.value?.key === inspector.key ? groundItem.value : bagEntries.value.find(item => item.key === inspector.key));
      const inspectorPosition = computed(() => ({ left: inspector.x + 'px', top: inspector.y + 'px' }));
      function inspectGroundDrop(drop, label) {
        if (equipmentMenu.value || drop.claimed) return;
        const key = 'ground:' + drop.key;
        inspector.enter(key, label.getBoundingClientRect(), window.innerWidth, window.innerHeight);
        if (inspector.key !== key) return;
        const detail = drop.item || docOf(drop.kind, drop.id);
        groundItem.value = { key, id: drop.id, kind: drop.kind, name: drop.name, rarity: drop.rarity,
          count: drop.count, tier: drop.tier, description: drop.description || '', instance: !!drop.item,
          ground: true, detail: detail ? markRaw(detail) : null };
      }
      function leaveGroundDrop(key, removed = false) {
        const itemKey = key === null ? groundItem.value?.key : 'ground:' + key;
        if (removed && inspector.key === itemKey) inspector.close();
        else inspector.leave(itemKey);
        if (groundItem.value?.key !== inspector.key) groundItem.value = null;
      }
      function inspectItem(item, event, pin = false) {
        seeInventoryItem(player, item);
        if (!item || equipmentMenu.value || draggedKey.value || splitKey.value) return;
        if (pin) inspector.close();
        inspector.enter(item.key, event.currentTarget.getBoundingClientRect(), window.innerWidth, window.innerHeight);
        if (pin || event.ctrlKey) { inspector.pin(); releaseBattleInput(); }
      }
      function selectInventoryItem(key) {
        if (key) selectedBagKey.value = selectedBagKey.value === key ? '' : key;
      }
      function identifiedItem(uid) { inspector.key = selectedBagKey.value = 'equipment:' + uid; }
      function closeEquipmentMenu(restoreFocus = false) {
        equipmentMenu.value = null;
        if (restoreFocus) nextTick(() => { if (menuAnchor?.isConnected) menuAnchor.focus({ preventScroll: true }); });
      }
      function openEquipmentMenu(item, event) {
        if (!['equipment', 'item'].includes(item?.kind)) { closeEquipmentMenu(); return; }
        releaseBattleInput(); closeSkillPicker(); inspector.closeHover();
        selectedBagKey.value = item.key;
        menuAnchor = event.currentTarget;
        const rect = menuAnchor.getBoundingClientRect();
        equipmentMenu.value = { key: item.key, serial: ++menuSerial, x: event.clientX || rect.left, y: event.clientY || rect.bottom };
      }
      function openEquippedMenu(id, event) { openEquipmentMenu(bagEntries.value.find(item => item.kind === 'equipment' && item.id === id), event); }
      function identifyMenuItem() {
        const item = menuItem.value; closeEquipmentMenu();
        if (!item) return;
        const result = identify(item.id, store.collections, store.library, item.key);
        if (result.error) return notify(result.error, true);
        notify(`已鉴定 ${result.item.name}`);
      }
      function equipMenuItem() {
        const item = menuItem.value;
        closeEquipmentMenu(true);
        toggleBagEquipment(item);
      }
      function toggleBagEquipment(item) {
        if (!item || !ownsEquipment(item.id)) return;
        if (item.equipped) setEquip(item.slot, '');
        else if (player.loadout.equipment[item.slot] !== item.id) setEquip(item.slot,item.id);
      }
      function sellMenuItem() {
        const item = menuItem.value;
        closeEquipmentMenu();
        if (!item) return;
        const result = sellOwnedEquipment(item.id, store.collections, store.catalog, item.key);
        if (result.error) { notify(result.error, true); return; }
        if(item.equippedEntry&&player.loadout.equipment[item.slot]===item.id)setEquip(item.slot,'');
        inspector.closeHover();
        if (!bagEntries.value.some(entry => entry.key === item.key)) selectedBagKey.value = '';
        ensureStarted(store.catalog, store.collections, store.library);
        syncHud();
        notify(`已出售「${result.name}」（+${result.price} 灵石）`);
      }
      function inspectEquipment(id, event) { inspectItem(bagEntries.value.find(item => item.kind === 'equipment' && item.id === id), event); }
      watch(inspectedItem, item => { if (!item) inspector.close(); });
      const bagKind = item => ({ equipment: '装', skill: '技', item: '物' }[item.kind]);
      const bagTitle = item => [item.name, `数量 ${item.count}`, item.equipped ? '已配置' : '', ...(item.affixes || []).map(a => affixText(a, lib())), item.description].filter(Boolean).join('\n');
      const allSkillChoices = computed(() => { store.version; return skillChoices(store.collections).filter(s => lib()?.build(s.id)); });
      const availableSkillChoices = computed(() => allSkillChoices.value.filter(s => buildSkillType(lib(), s.id) === 'active'));
      const auraChoices = computed(() => allSkillChoices.value.filter(s => buildSkillType(lib(), s.id) === 'aura').map(s => ({ ...s, reservation: auraManaPercent(lib(), s.id, store.collections) })));
      const skillChoiceName = (skill, slot) => {
        const assigned = player.loadout.skills.indexOf(skill.id);
        return skill.name + (skill.granted ? ' · 装备授予' : '') + (assigned >= 0 && assigned !== slot ? `（从槽 ${assigned + 1} 移入）` : '');
      };
      const equippedSkills = computed(() => hud.skills.filter(Boolean));
      const monsterChoices = computed(() => [...store.monsters.values()].filter(e => e.doc && !e.error).map(e => e.doc));
      const ownedEquipment = slot => [
        ...Object.keys(player.owned.equipment).map(id => docOf('equipment', id)).filter(d => d && d.slot === slot).map(d => ({ id: d.id, name: d.name || d.id })),
        ...Object.values(player.instances).filter(i => i.slot === slot && i.identified !== false).map(i => ({ id: i.uid, name: `T${equipmentTier(i)} · ${i.name}（${i.affixes.length} 随机词条）` })),
      ];
      const ownedItems = computed(() => { store.version; return Object.keys(player.owned.item).filter(id => ownedCount('item', id) > 0).map(id => docOf('item', id)).filter(d => d?.category === 'consumable').map(d => ({ id: d.id, name: d.name || d.id, rarity: d.rarity })); });
      const beltSlots = computed(() => Array.from({ length: BELT_SLOTS }, (_, i) => player.loadout.belt[i] || null));
      const beltChoices = computed(() => [
        ...auraChoices.value.map(choice => ({ ...choice, binding: auraBinding(choice.id), kind: 'skill', note: `${docOf('skill', choice.id)?.description?.split('。')[0] || '光环'} · 封印 ${choice.reservation}% 魔力` })),
        ...ownedItems.value.map(choice => ({ ...choice, binding: choice.id, kind: 'item', note: `消耗品 · 持有 ${ownedCount('item', choice.id)}` })),
      ]);

      function pickerChoice(choice, slot, belt = false) {
        const binding = choice.binding || choice.id, kind = choice.kind || 'skill';
        const aura = belt && !!auraId(binding), doc = docOf(kind, choice.id);
        const assigned = (belt ? player.loadout.belt : player.loadout.skills).indexOf(binding);
        const notes = [{ label: kind === 'item' ? '持有' : '来源', value: kind === 'item' ? '×' + ownedCount('item', choice.id) : choice.granted ? '装备授予' : '已拥有' }];
        if (aura) {
          notes.push({ label: '魔力封印', value: choice.reservation + '%' });
          notes.push({ label: '状态', value: player.loadout.activeAuras?.includes(choice.id) ? '已启用' : '未启用' });
        }
        if (assigned >= 0) notes.push({ label: '装配', value: assigned === slot ? '当前槽位' : '从槽 ' + (belt ? BELT_KEYS[assigned] : assigned + 1) + ' 移入' });
        return { ...choice, binding, icon: iconSrc(kind, choice.id), category: kind === 'item' ? (doc?.tags?.includes('药剂') ? '药剂' : '消耗品') : aura ? '光环' : '主动技能', description: (doc?.description || '').replaceAll('Q/E/F/G','Q/E/T/G'), notes };
      }
      const activePickerChoices = computed(() => availableSkillChoices.value.map(choice => pickerChoice(choice, skillPickerSlot.value)));
      const beltPickerChoices = computed(() => beltChoices.value.map(choice => pickerChoice(choice, beltPickSlot.value, true)));

      // Only owned content reaches the battle.
      const ownedLoadout = () => ({
        passives: [...(levelPart(player.journey?.level ?? 1) ? [levelPart(player.journey.level)] : []), ...currentTalentParts(player.talents).parts],
        skills: validSkillSlots(player.loadout.skills, availableSkillChoices.value),
        equipment: Object.fromEntries(Object.entries(player.loadout.equipment).filter(([, id]) => ownsEquipment(id))),
        belt: cleanBelt(player.loadout.belt, id => auraId(id) ? auraChoices.value.some(s => s.id === auraId(id)) : owns('item', id) && docOf('item', id)?.category === 'consumable'),
        activeAuras: player.loadout.activeAuras || [],
        instances: JSON.parse(JSON.stringify(Object.fromEntries(Object.values(player.loadout.equipment).filter(id => player.instances[id]).map(id => [id, player.instances[id]])))),
      });

      function createAtlasRun(prepared, carryPools = false) {
        if (!store.library || !store.collections) throw new Error('规则尚未加载');
        const atlasOptions = prepared.options;
        const monsterCount = Math.max(20, Math.min(300, Math.trunc(Number(opts.monsterCount) || 20)));
        if (!mapCoreId || !store.collections.equipment.get(mapCoreId)?.doc) mapCoreId = selectedMapCore(mapStorage, store.collections);
        const candidate = markRaw(new TowerRun(store.files, {
          collections: store.collections, instances: JSON.parse(JSON.stringify(player.instances)), god: opts.god, autoCast: opts.autoCast, seed: atlasOptions.seed,
          floor: atlasOptions.floor, mapTier: atlasOptions.mapTier, regionId: prepared.id, timeLimitEnabled: opts.timeLimitEnabled,
          rewards: { catalog: store.catalog, visit: prepared.state.attempts[prepared.id] },
          monsterTypes: monsterChoices.value.filter(m => opts.monsterType === 'all' || m.id === opts.monsterType), monsterCount,
          monsterPreview: opts.monsterType !== 'all', stunCrust: true, mapEquipment: { map: mapCoreId },
          onKill: onMonsterKill, onDamageDealt: recordDps,
        }));
        candidate.setLoadout(ownedLoadout());
        if (carryPools) {
          const previous = battle.character, current = candidate.battle.character;
          current.life = Math.min(current.maxLife, previous.life);
          current.shield = Math.min(current.shieldCap, previous.shield);
          current.mana = Math.min(current.manaCap, previous.mana);
          candidate.battle.syncHeroPools(); candidate.battle.select(battle.selected);
        }
        return candidate;
      }
      function installAtlasRun(candidate, prepared) {
        closeOutpost();
        eventRunKey.value++;
        closeSkillDetails();
        splitKey.value = ''; endBagDrag();
        closeEquipmentMenu();
        closeSkillPicker();
        leaveGroundDrop(null, true);
        releaseBattleInput();
        opts.floor = prepared.options.floor;
        portalTarget.value = false; exitPortalInfo.visible = false;
        pickupTarget.value = '';
        opts.monsterCount = Math.max(20, Math.min(300, Math.trunc(Number(opts.monsterCount) || 20)));
        resetDps();
        tower = candidate;
        battle = tower.battle;
        syncAtlas();
        audio.bind(battle);
        floorMap.value = markRaw(battle.dungeon);
        syncSkills();
        syncHud();
        player.stats.battles += 1;
        ready.value = true;
        
        return true;
      }
      function build() {
        if (!store.library || !store.collections) return;
        ensureStarted(store.catalog, store.collections, store.library);
        // Loading the page must not create a fresh paid dungeon for free or
        // silently charge another ticket. Let the player choose admission.
        if (atlasSession.state.currentNodeId !== '0:0') {
          if (!battle) openAtlas();
          return;
        }
        const prepared = atlasSession.prepareCurrent(), candidate = createAtlasRun(prepared);
        atlasSession.bind(prepared, candidate.battle);
        return installAtlasRun(candidate, prepared);
      }
      function restart() {
        challengeAtlas(atlasSession.state.currentNodeId, true);
      }
      function challengeFloor() {
        try { validateFloor(opts.floor); } catch (error) { notify(error.message, true); return; }
        detachAtlas();
        if (battle?.phase === 'cleared') nextFloor(opts.floor); else restart();
      }
      function beginProgression() {
        releaseBattleInput();
        detachAtlas();
        startProgression(store.collections, store.library);
        opts.god = false; opts.autoCast = false; opts.floor = 1;
        selectedBagKey.value = ''; bagPage.value = 0;
        challengeAtlas('0:0', true);
        notify('普通 T1 霜棘法杖开局 · 存档已重置');
      }
      function nextFloor(floor = opts.floor) {
        openAtlas();
      }
      function useExitPortal() {
        const portal = battle?.exitPortal;
        if (!portal || battle.phase !== 'cleared' || battle.hero.dead) return;
        releaseBattleInput(); pickupTarget.value = '';
        if (Math.hypot(battle.hero.x - portal.x, battle.hero.y - portal.y) > portal.radius + 80) { portalTarget.value = true; return; }
        portalTarget.value = false;
        if (atlasSession.observe(battle)) syncAtlas();
        openAtlas();
      }
      function pickLoot(key) {
        if (!battle?.rewards || battle.hero.dead) return;
        const drop = battle.rewards.ground.find(d => d.key === key && !d.claimed);
        if (!drop) return;
        releaseBattleInput(); pickupTarget.value = key;
        stage.value?.focus();
        if (Math.hypot(drop.x - battle.hero.x, drop.y - battle.hero.y) <= PICKUP_RADIUS) claimPickup();
      }
      function spawnTraitEquipment(id) {
        const result = dropTraitEquipment(id, battle, store.collections, store.library);
        if (result.error) return notify(result.error, true);
        releaseBattleInput(); showLoot.value = true;
        closeHUDPanel(); syncHud();
        notify(`已丢到地面：${result.drop.name}`);
        nextTick(() => stage.value?.focus({ preventScroll: true }));
      }
      function claimPickup() {
        const result = battle.rewards.pickup(pickupTarget.value, player, battle.hero);
        if (result.error) { pickupTarget.value = ''; notify(result.error, true); return; }
        pickupTarget.value = '';
        void audio.play(result.drop.kind === 'equipment' ? 'equip_pickup' : 'pickup');
        onPickup(result.drop);
        notify(`已拾取 ${result.drop.name}${result.drop.count > 1 ? ' ×' + result.drop.count : ''}`);
        syncHud();
      }
      function buyMerchant(key) {
        if (battle?.phase !== 'cleared' || !battle.rewards) return;
        const result = battle.rewards.buy(key, player);
        if (result.error) return notify(result.error, true);
        void audio.play('ui_confirm');
        notify(`已购买 ${result.offer.name}`); syncHud();
      }

      function ensureScene() {
        if (scene || !stage.value) return;
        scene = new Scene3D(stage.value, rendering);
        view = new Overlay(overlay.value);
        lootView = new GroundLootOverlay(lootRoot.value, pickLoot, { onEnter: inspectGroundDrop, onLeave: leaveGroundDrop });
      }

      function syncSkills() {
        if (!battle) return;
        hud.skills = battle.skills.map(s => s && ({ id: s.id, name: s.name, granted: s.granted, error: s.error }));
        hud.selected = battle.selected;
      }
      function selectSkill(i) { if (battle) { battle.select(i); syncSkills(); } }
      function closeSkillPicker(focusSlot = -1) {
        skillPickerSlot.value = -1;
        closeBeltPicker();
        if (focusSlot >= 0) nextTick(() => stage.value?.querySelectorAll('.slot.skill')[focusSlot]?.focus({ preventScroll: true }));
      }
      function toggleSkillPicker(slot) {
        closeBeltPicker();
        closeSkillDetails();
        const closing = skillPickerSlot.value === slot;
        releaseBattleInput(); selectSkill(slot);
        if (closing) { closeSkillPicker(slot); return; }
        skillPickerSlot.value = slot;
        nextTick(() => {
          const picker = stage.value?.querySelector('#active-skill-picker');
          (picker?.querySelector('[data-skill-choice]') || picker?.querySelector('button'))?.focus({ preventScroll: true });
        });
      }
      function chooseSkill(id) {
        const slot = skillPickerSlot.value;
        if (slot >= 0 && setSkill(slot, id)) closeSkillPicker(slot);
      }
      function skillPickerKey(event) {
        event.stopPropagation();
        if (event.code === 'Escape') { event.preventDefault(); closeSkillPicker(skillPickerSlot.value); }
        else if (/^Digit[1-4]$/.test(event.code)) { event.preventDefault(); closeSkillPicker(); selectSkill(+event.code.slice(5) - 1); }
      }
      function setSkill(slot, id, event) {
        const error = setSkillSlot(slot, id, store.collections, lib());
        if (error) { notify(error, true); if (event) event.target.value = player.loadout.skills[slot] || ''; return false; }
        if (battle) { tower.setLoadout(ownedLoadout()); selectSkill(slot); }
        closeSkillPicker();
        return true;
      }
      function useBelt(i) {
        const id = player.loadout.belt[i];
        if (auraId(id)) {
          if (!battle || battle.hero.dead || battle.phase === 'failed') return;
          if (toggleAura(auraId(id), store.collections, lib())) { tower.setLoadout(ownedLoadout()); syncHud(); }
          else notify('无法开启：光环封印总量不能超过100%魔力', true);
          return;
        }
        if (!battle || !id || docOf('item', id)?.category !== 'consumable' || battle.hero.dead || battle.phase === 'failed' || !ownedCount('item', id)) return;
        if (consume(id) && battle.useItem(id)) { void audio.play('consume'); bump(player, 'potions'); }
      }
      function closeBeltPicker(focusSlot = -1) {
        beltPickSlot.value = -1;
        if (focusSlot >= 0) nextTick(() => stage.value?.querySelectorAll('.b3-belt-slots > .slot')[focusSlot]?.focus({ preventScroll: true }));
      }
      function openBeltPicker(slot) {
        const closing = beltPickSlot.value === slot;
        closeSkillDetails(); closeSkillPicker(); closeHUDPanel(); closeEquipmentMenu(); inspector.closeHover(); releaseBattleInput();
        if (closing) { closeBeltPicker(slot); return; }
        beltPickSlot.value = slot;
        nextTick(() => {
          const picker = stage.value?.querySelector('#belt-skill-picker');
          (picker?.querySelector('[data-belt-choice]') || picker?.querySelector('button'))?.focus({ preventScroll: true });
        });
      }
      function chooseBelt(binding) {
        const slot = beltPickSlot.value;
        if (slot < 0 || (binding && !beltChoices.value.some(choice => choice.binding === binding))) return;
        const current = player.loadout.belt[slot];
        if (binding && binding !== current) toggleBelt(binding, slot);
        else if (!binding && current) toggleBelt(current, slot);
        closeBeltPicker(slot);
      }
      function beltPickerKey(event) {
        event.stopPropagation();
        if (event.code === 'Escape') { event.preventDefault(); closeBeltPicker(beltPickSlot.value); }
        else if (/^Digit[1-4]$/.test(event.code)) { event.preventDefault(); closeBeltPicker(); selectSkill(+event.code.slice(5) - 1); }
        else {
          const slot = { KeyQ: 0, KeyE: 1, KeyT: 2, KeyG: 3 }[event.code];
          if (slot !== undefined && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); closeBeltPicker(slot); useBelt(slot); }
        }
      }
      function setEquip(slot, id) {
        if (eventLocked(player,id) || eventLocked(player,player.loadout.equipment[slot])) { notify('装备已被地图祭坛锁定',true); return false; }
        if (id) { const error = equip(slot, id); if (error) { notify(error, true); return false; } } else delete player.loadout.equipment[slot];
        ensureStarted(store.catalog, store.collections, store.library);
        return true;
      }
      function goShop() { document.querySelector('[data-tab=shop]')?.click(); }
      function goCraft() { document.querySelector('[data-tab=craft]')?.click(); }
      function closeHUDPanel() {
        closeBeltPicker();
        eventMenuOpen.value = false;
        bdExpanded.value = false;
        openedPanel.value = ''; splitKey.value = ''; endBagDrag(); releaseBattleInput(); inspector.closeHover(); closeEquipmentMenu();
      }
      function claimTaskReward(id, uid) {
        const result = claimQuestWeapon(player, id, uid);
        if (result.error) { notify(result.error, true); return; }
        notify(`已领取「${result.item.name}」，武器已放入背包`);
      }
      function challengeQuestFloor() {
        closeHUDPanel(); closeAtlas(); releaseBattleInput(); opts.floor = 1;
        if (battle?.phase === 'cleared') nextFloor(1); else restart();
      }
      let questError = '';
      function observeQuests(completedBattle = battle) {
        if (!completedBattle || !store.library || !store.collections) return;
        const result = observeQuestBattle(player, completedBattle, store.collections, store.library);
        if (result.error) {
          if (questError !== result.error) notify(result.error, true);
          questError = result.error;
        } else if (result.changed) {
          questError = '';
          notify('初入高塔已完成，请选择一把武器');
        }
      }
      function openBuildGuide(id = 'synergy_rime_thunder') {
        if (!bdEntries.value.length) void loadBds();
        bdExpanded.value = false;
        closeAtlas(); releaseBattleInput(); closeSkillDetails(); closeSkillPicker(); closeEquipmentMenu(); inspector.close();
        splitKey.value = ''; endBagDrag();
        buildGuideId.value = id; openedPanel.value = 'builds';
        nextTick(() => document.querySelector('.b3-window-builds')?.focus({ preventScroll: true }));
      }
      function openHUDFunction(id) {
        if (id === 'events') { const wasOpen=eventMenuOpen.value; closeHUDPanel(); closeAtlas(); releaseBattleInput(); eventMenuOpen.value=!wasOpen; return; }
        eventMenuOpen.value = false;
        if (id === 'belt') { openBeltPicker(beltPickSlot.value >= 0 ? beltPickSlot.value : 0); return; }
        closeSkillDetails();
        splitKey.value = ''; endBagDrag(); releaseBattleInput(); closeSkillPicker(); closeEquipmentMenu(); inspector.closeHover();
        if (id === 'bd') { const wasOpen = bdExpanded.value; closeHUDPanel(); bdExpanded.value = !wasOpen; if (bdExpanded.value && !bdEntries.value.length) void loadBds(); return; }
        bdExpanded.value = false;
        if (id === 'atlas') { openAtlas(); return; }
        if (id === 'restart') { closeHUDPanel(); restart(); return; }
        if (id === 'hunter') { hunter.visible = !hunter.visible; return; }
        if (id === 'shop') { goShop(); return; }
        if (id === 'craft') { if (activeHUDFunction.value === 'craft') { closeHUDPanel(); inspector.close(); return; } closeAtlas(); openedPanel.value = 'craft'; return; }
        if (activeHUDFunction.value === id) { closeHUDPanel(); return; }

        if (id === 'inventory') {
          openedPanel.value = 'inventory'; nextTick(() => bagSearch.value?.focus({ preventScroll: true })); return;
        }
        if (id === 'character') { openedPanel.value = 'character'; return; }
        if (id === 'trait-equipment') { closeAtlas(); openedPanel.value = 'trait-equipment'; return; }
        if (id === 'dungeon-map') { if (floorMap.value) { closeAtlas(); inspector.close(); openedPanel.value = 'dungeon-map'; } return; }
        if (id === 'quests') { closeAtlas(); openedPanel.value = 'quests'; return; }
        if (id === 'talents') { closeAtlas(); openedPanel.value = 'talents'; return; }
        if (['equipment', 'settings'].includes(id)) {
          openedPanel.value = 'loadout'; panelSection.value = id;
          nextTick(() => {
            const selector = { equipment: '.equip-grid:not(.fixed-equipment)', settings: '.b3-battle-settings' }[id];
            const target = document.querySelector('.b3-window-loadout ' + selector);
            target?.scrollIntoView({ block: 'nearest' }); target?.querySelector('select, input, button')?.focus({ preventScroll: true });
          }); return;
        }
        closeHUDPanel();
        if (id === 'skills') toggleSkillPicker(hud.selected >= 0 ? hud.selected : 0);
        if (id === 'map' || id === 'lineage') mapPanelTab.value = id === 'map' ? 'equipment' : 'lineage';
      }

      // ---------------------------------------------------------------- journey: level, quest chain, coach, feedback
      const journeyHud = reactive({ level: 1, xp: 0, need: 1, ratio: 0, unspent: 0, quest: null, chapter: null, rows: [] });
      const coach = reactive({ guide: null, tip: null, index: 0, total: 0 });
      const runSummary = ref(null);
      const streak = new KillStreak();
      const coachCtx = { moved: 0, damageDealt: 0, lastX: null, lastY: null };
      let journeyBattle = null;
      const countedClears = new WeakSet(), countedDeaths = new WeakSet(), runStats = new WeakMap();
      const runOf = b => { if (!b) return null; let r = runStats.get(b); if (!r) { r = { kills: 0, xp: 0, levels: 0, first: '' }; runStats.set(b, r); } return r; };
      const unsubscribers = [
        onGameEvent('equip', () => { bump(player, 'equips'); }),
        onGameEvent('craft', () => { bump(player, 'crafts'); }),
        onGameEvent('identify', () => { bump(player, 'identifies'); }),
        onGameEvent('sell', () => { bump(player, 'sold'); }),
      ];
      function announceLevels(result, at) {
        if (!result?.levels?.length) return;
        const level = result.to, rows = levelBonusRows(level).filter(r => r.perLevel > 0);
        banner('level', `等级提升 · ${level}`, `气血 +${rows[0].perLevel * result.levels.length} · 伤害 +${rows[3].perLevel * result.levels.length}% · 天赋点 +${2 * result.levels.length}`);
        chime('level');
        if (at && view) view.pop(at.x, at.y, `LEVEL UP!`, 'levelup', 1.8);
        // Full restore on level up: a small, unambiguous reward.
        nextTick(() => { if (!battle?.character || battle.hero.dead) return; const c = battle.character; c.life = c.maxLife; c.mana = c.manaCap ?? c.maxMana; battle.syncHeroPools?.(); });
        const r = battle && runOf(battle); if (r) r.levels += result.levels.length;
      }
      function onMonsterKill(stones, monster) {
        recordKill(stones);
        const b = battle; if (!b) return;
        const count = streak.hit(b.elapsed || 0), bonus = streak.bonus(count);
        if (count >= 3) { setStreak(count, bonus); if (count % 10 === 0) chime('streak'); }
        if (count > (player.journey?.counters?.bestStreak || 0)) player.journey.counters.bestStreak = count;
        const result = recordJourneyKill(player, monster, b.floor || 1, bonus);
        const r = runOf(b); r.kills++; r.xp += result.gained;
        if (view && monster && result.gained) view.pop(monster.x, monster.y, `+${result.gained} 经验`, 'xp', 1.1);
        announceLevels(result, b.hero);
      }
      function onPickup(drop) {
        bump(player, 'pickups');
        if (drop.kind === 'equipment') {
          bump(player, 'equipmentPickups');
          if (['rare', 'legendary'].includes(drop.rarity)) { bump(player, 'rarePickups'); }
          if (drop.rarity === 'legendary') { banner('legendary', `传奇 · ${drop.name}`, `T${drop.tier || 1} 传奇装备`); chime('legendary'); }
          else if (drop.rarity === 'rare') chime('rare');
        }
      }
      // A drop hitting the floor is announced once; legendary loot gets a banner before pickup.
      const announcedDrops = new Set();
      function announceGround(b) {
        for (const drop of b.rewards?.ground || []) {
          if (drop.claimed || announcedDrops.has(drop.key)) continue;
          announcedDrops.add(drop.key);
          if (drop.kind === 'equipment' && drop.rarity === 'legendary') { toast('loot', '传奇掉落！', [drop.name + ' · 在地面上发光']); chime('legendary'); }
        }
      }
      function claimChain(id, choiceUid = '') {
        if (!store.collections || !store.library) return;
        const result = claimChainQuest(player, id, store.collections, store.library, { choiceUid });
        if (result.error) { notify(result.error, true); return; }
        chime('claim');
        toast('quest', `已领取：${result.quest.name}`, result.granted.map(g => rewardLabel(g, store.collections)));
        announceLevels(result.xp, battle?.hero);
        const chapterRows = QUEST_CHAIN.filter(q => q.chapter === result.quest.chapter);
        if (chapterRows.every(q => player.questChain.entries[q.id]?.stage === 'claimed')) {
          const chapter = CHAPTERS.find(c => c.id === result.quest.chapter); banner('chapter', `${chapter.name.split('·')[0].trim()} 完成`, chapter.name.split('·')[1]?.trim() || '');
        }
        syncJourneyHud();
      }
      const playMode = document.documentElement.classList.contains('play-mode');
      const craftEntries = computed(() => bagEntries.value.filter(e => e.kind === 'equipment').map(e => ({ ...e, detail: player.instances[e.id] || null })));
      function craftSelect(key) {
        const rect = document.querySelector('.b3-window-craft')?.getBoundingClientRect();
        inspector.close(); inspector.key = key; inspector.pinned = true;
        const stageBox = document.querySelector('.b3-window-craft .cb-stage')?.getBoundingClientRect();
        inspector.x = stageBox ? Math.max(12, Math.min(window.innerWidth - 372, stageBox.left + (stageBox.width - 360) / 2)) : rect ? rect.right - 390 : 24;
        inspector.y = stageBox ? stageBox.top : rect ? rect.top + 56 : 24;
        releaseBattleInput();
      }
      function skipCoach() { skipTutorial(player, true); coach.guide = null; notify('已跳过新手引导，可在任务日志查看任务提示'); }
      function dismissCoachTip(id) { dismissTip(player, id); coach.tip = null; }
      function syncJourneyHud() {
        const j = ensureJourney(player), x = xpProgress(j);
        const quest = chainTracked(player);
        Object.assign(journeyHud, { level: x.level, xp: x.xp, need: x.need, ratio: x.ratio,
          unspent: Math.max(0, talentBudget(player) - (player.talents?.allocated?.length || 0)),
          quest, chapter: quest ? CHAPTERS.find(c => c.id === quest.chapter) : null, rows: chainRows(player) });
      }
      function observeJourney() {
        if (!store.collections) return;
        ensureJourney(player); ensureChain(player);
        const sync = syncTalentBudget(player);
        if (sync.refunded) toast('quest', '天赋点已返还', ['天赋点改为随等级获得，之前的规划已重置。']);
        const b = battle;
        if (b && b !== journeyBattle) { journeyBattle = b; streak.reset(); setStreak(0, 0); coachCtx.lastX = null; }
        if (b) {
          announceGround(b);
          const h = b.hero;
          if (coachCtx.lastX !== null && !h.dead) coachCtx.moved += Math.hypot(h.x - coachCtx.lastX, h.y - coachCtx.lastY) / 100;
          coachCtx.lastX = h.x; coachCtx.lastY = h.y;
          if (b.kills > 0) coachCtx.damageDealt = 1;
          if (b.phase === 'cleared' && !h.dead && !countedClears.has(b)) {
            countedClears.add(b);
            const r = runOf(b), clear = recordFloorClear(player, b.floor);
            if (clear.first) {
              r.xp += clear.xp.gained;
              r.first = clear.rewards.length ? `奖励 ${clear.xp.gained} 经验与 ${store.collections.item.get(clear.rewards[0].id)?.doc?.name || '下一层地图'}` : `奖励 ${clear.xp.gained} 经验`;
              toast('first', `首次通关第 ${b.floor} 层`, [`+${clear.xp.gained} 经验`, ...clear.rewards.map(g => rewardLabel(g, store.collections) + ' 已放入背包')]);
              announceLevels(clear.xp, h);
            }
            banner('floor', `第 ${b.floor} 层 · 通关`, '守卫已倒下 · 拾取战利品后进入传送阵');
            const secs = Math.floor(b.elapsed || 0);
            runSummary.value = { kills: r.kills, xp: r.xp, levels: r.levels, first: r.first, time: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` };
          }
          if ((h.dead || b.phase === 'failed') && !countedDeaths.has(b)) { countedDeaths.add(b); if (h.dead) bump(player, 'deaths'); streak.reset(); }
          if (b.phase !== 'cleared' && runSummary.value && !countedClears.has(b)) runSummary.value = null;
          if (feedback.streak && !streak.active(b.elapsed || 0)) setStreak(0, 0);
        }
        for (const id of observeChain(player)) {
          const q = QUEST_CHAIN.find(row => row.id === id);
          toast('quest', `任务完成：${q.name}`, [q.rewards.some(r => r.kind === 'choice') ? '有三选一奖励：点击左侧任务卡「选择奖励」，或按 J' : '点击左侧任务卡「领取奖励」，或按 J']); chime('quest');
        }
        for (const q of QUEST_CHAIN) if (player.questChain.entries[q.id]?.stage === 'done' && q.rewards.some(r => r.kind === 'choice') && !player.questChain.entries[q.id].choices?.length) {
          try { prepareChoices(player, q.id, store.collections, store.library); } catch (error) { console.warn('任务奖励生成失败', error); }
        }
        syncJourneyHud();
        const j = player.journey, unspent = journeyHud.unspent;
        const tv = tutorialView(player, {
          moved: coachCtx.moved, damageDealt: coachCtx.damageDealt, kills: j.counters.kills, pickups: j.counters.pickups,
          groundLoot: b?.rewards?.remaining?.length || 0, floorsCleared: j.counters.floorsCleared, equips: j.counters.equips, mapsEntered: j.counters.mapsEntered,
          firstWeaponReady: player.quests?.entries?.first_floor?.stage === 'reward', firstWeaponClaimed: player.quests?.entries?.first_floor?.stage === 'claimed',
          unspentTalents: unspent, level: j.level, lifeRatio: b && !b.hero.dead ? b.hero.health / Math.max(1, b.hero.maxHealth) : 1,
          hasPotion: (player.loadout.belt || []).some(id => id && !auraId(id) && ownedCount('item', id) > 0), potions: j.counters.potions,
          claimableQuests: journeyHud.rows.filter(r => r.stage === 'done').length, crafts: j.counters.crafts,
          hasCurrency: ['chaos_orb', 'spirit_stone_mid', 'spirit_stone_high', 'quad_affix_orb'].some(id => ownedCount('item', id) > 0),
        });
        coach.guide = tv.guide; coach.tip = tv.tip; coach.index = tv.index; coach.total = tv.total;
      }
      watch(() => [audioSettings.volume, audioSettings.muted], ([volume, muted]) => configureChimes({ volume, muted }), { immediate: true });
      // Test hook for automated play-throughs; only with ?debug=1.
      if (new URLSearchParams(location.search).get('debug') === '1') window.__dw = { get battle() { return battle; }, get tower() { return tower; }, player, journeyHud, coach, feedback, claimChain, observeJourney, opts, openAtlas, challengeAtlas, pickLoot, openHUDFunction, claimTaskReward, setEquip, useExitPortal, get atlas() { return atlasState.value; } };
      onBeforeUnmount(() => unsubscribers.forEach(off => off()));

      function syncHud() {
        battleHasOutpost.value=!!battle?.outpostMerchant;
        if (!battle) return;
        observeQuests();
        observeJourney();
        if (atlasSession.observe(battle)) syncAtlas();
        if (skillDetailSlot.value >= 0) skillDetail.value = skillDetails(battle, skillDetailSlot.value);
        if (auraDetailSlot.value >= 0) skillDetail.value = auraDetails(battle, auraId(player.loadout.belt[auraDetailSlot.value]));
        const activeAuras = battle.auraParts?.map(part => part.doc.id) || [];
        if (activeAuras.join('|') !== hud.activeAuras.join('|')) hud.activeAuras = activeAuras;
        const h = battle.hero, secs = Math.floor(battle.elapsed);
        Object.assign(hud, {
          stun: battle.stunCrust?.snapshot(),
          lootCount: battle.rewards?.remaining.length || 0,
          merchant: battle.rewards?.merchant ? { ...battle.rewards.merchant, stock: battle.rewards.merchant.stock.map(o => ({ ...o, item: o.item ? markRaw(o.item) : null })) } : null,
          health: h.health, maxHealth: h.maxHealth, shield: h.shield, maxShield: h.maxShield, mana: h.mana, maxMana: h.maxMana,
          manaCap: h.manaCap, reservedMana: h.reservedMana, manaReservationPercent: h.manaReservationPercent,
          recharging: !!h.recharging, stunned: !!h.stunned, noResource: !!h.noResource, buffs: battle.buffs(), effects: playerEffects(battle), earned: battle.earned, kills: battle.kills, monsters: battle.monsters.length,
          projectiles: battle.report.Projectiles, maintained: [...battle.host.world.emitters.entries.values()].filter(e => e.owner === h.owner).map(e => ({ key: e.key, level: e.level, cap: e.cap })), time: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, fps: Math.round(fps),
          skills: battle.skills.map(s => s && ({ id: s.id, name: s.name, granted: s.granted, error: s.error, cooldown: Math.max(0, (battle.combat.cooldowns.get(s.id) || 0) - battle.combat.time) })), selected: battle.selected, dead: h.dead, log: battle.log.slice(0, 6),
          character: characterPanel(battle),
          summonUnits: summonUnitPanel(battle),
          map: mapEquipmentPanel(battle),
          fixedEquipment: PLAYER_FIXED_SLOTS.map(slot => ({ id: slot.id, name: slot.name, itemName: h.equipment[slot.id]?.name || '', traits: (h.equipment[slot.id]?.traits || []).map(entry => lib().traitDisplayName(entry.id)).join('、') })),
          dungeon: { floor: battle.floor, phase: battle.phase, failureReason: battle.failureReason, timeLimitEnabled: battle.timeLimitEnabled, remainingTime: battle.timeLimitEnabled ? battle.timeRemaining : null,
            wave: battle.wave, wavesCompleted: battle.wavesCompleted, completionMode: battle.completionMode, visitedRooms: battle.roomStates.filter(r => r.visited).length, totalRooms: battle.roomStates.length,
            remaining: battle.monsters.filter(m => m.health > 0).length, rooms: battle.roomStates,
            heroX: (h.x + battle.dungeon.half) / battle.dungeon.tile, heroY: (h.y + battle.dungeon.half) / battle.dungeon.tile,
            heroHeading: Math.atan2(h.aim?.x ?? 0, h.aim?.y ?? 1) * 180 / Math.PI,
            bossPoint: battle.boss ? {x: (battle.boss.x + battle.dungeon.half) / battle.dungeon.tile, y: battle.dungeon.size - (battle.boss.y + battle.dungeon.half) / battle.dungeon.tile} : null,
            portal: battle.exitPortal ? {x: battle.exitPortal.x, y: battle.exitPortal.y} : null,
            events: (battle.mapEvents || []).map(event => ({...event})),
            bossHealth: Math.max(0, battle.boss?.health || 0), bossMax: battle.boss?.maxHealth || 0, nextIn: battle.nextIn },
        });
      }

      function frame(now) {
        
        raf = requestAnimationFrame(frame);
        if (!active || !battle || !scene) { last = now; return; }
        if (atlasOpen.value || eventOpen.value || outpostOpen.value) { last = now; return; }
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
        last = now;
        fps = fps * 0.92 + (1 / Math.max(dt, 1e-3)) * 0.08;
        const h = battle.hero;
        const touch = input?.read() || {};
        h.move = { x: Math.max(-1, Math.min(1, (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (touch.move?.x || 0))), y: Math.max(-1, Math.min(1, (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + (touch.move?.y || 0))) };
        if (h.move.x || h.move.y || h.dead) { pickupTarget.value = ''; portalTarget.value = false; }
        if (portalTarget.value && battle.exitPortal && !paused.value) {
          if (Math.hypot(h.x - battle.exitPortal.x, h.y - battle.exitPortal.y) <= battle.exitPortal.radius + 80) useExitPortal();
          else h.move = battle.directionTo(h, battle.exitPortal);
        }
        if (pickupTarget.value && !paused.value) {
          const drop = battle.rewards?.ground.find(d => d.key === pickupTarget.value && !d.claimed);
          if (!drop) pickupTarget.value = '';
          else {
            const dx = drop.x - h.x, dy = drop.y - h.y, distance = Math.hypot(dx, dy);
            if (distance <= PICKUP_RADIUS) claimPickup();
            else h.move = battle.pickupDirection(drop);
          }
        }
        const assisted = resolveTouchAim(battle, touch, { targetId: touchTargetId, visible: monster => {
          const p = scene.project(toV(monster.x, monster.y, 0));
          return p && p.x >= 0 && p.x <= scene.width && p.y >= 0 && p.y <= scene.height;
        } });
        touchTargetId = assisted.targetId;
        const heroScreen = touch.aim ? scene.project(toV(h.x, h.y, 0)) : null;
        const touchAim = assisted.point ? { ...assisted.point, v: toV(assisted.point.x, assisted.point.y, 0) }
          : heroScreen && scene.pick(heroScreen.x + touch.aim.x * 180, heroScreen.y - touch.aim.y * 180);
        const aim = touchAim || mouse.pending || (mouse.inside ? scene.pick(mouse.x, mouse.y) : null);
        if (aim) {
          scene.cursor.visible = true;
          scene.cursor.position.set(aim.v.x, 0.03, aim.v.z);
          if (!h.autoCast) battle.setAim(aim.x, aim.y);
        } else scene.cursor.visible = false;
        h.casting = assisted.casting || mouse.down || !!mouse.pending || keys.has('Space');
        const castsBefore = h.casts;
        if (!paused.value) {
          dps.advance(dt);
          const previousBattle = battle;
          if (tower.step(dt)) { eventRunKey.value++; resetDps(); battle = tower.battle; audio.bind(battle); floorMap.value = markRaw(battle.dungeon); syncSkills(); syncHud(); }
          observeQuests(previousBattle);
        }
        audio.update(battle, { paused: paused.value || document.hidden });
        if (now >= nextDpsHud) {
          dpsHud.amount = dpsFormat.format(dps.value);
          dpsHud.targets = dps.targets;
          nextDpsHud = now + 100;
        }
        if (h.casts > castsBefore || h.dead) mouse.pending = null;
        // The Hunter only filters once the player has picked something to hunt; otherwise everything shows.
        const hunting = hunter.enabled && (hunter.targets.length > 0 || hunter.currencies.length > 0);
        const visibleLoot = (battle.rewards?.ground || []).filter(drop => !drop.claimed && (['inventory','catalogue'].includes(drop.origin) || !hunting || hunterAllows(drop, hunter)));
        hunterShown.value = visibleLoot.length;
        scene.update(battle, now / 1000, paused.value, showLoot.value ? visibleLoot : [], showLoot.value && !hunting);
        mapEventTags.value=(!h.dead&&!openedPanel.value&&!atlasOpen.value&&!eventOpen.value)
          ? (battle.mapEvents||[]).filter(event=>event.kind!=='shop').flatMap(event=>{
            const point=scene.project(toV(event.x,event.y,2.7));
            return point&&point.x>60&&point.x<scene.width-60&&point.y>64&&point.y<scene.height-32
              ? [{id:event.id,name:event.name,completed:event.completed,x:point.x,y:point.y}]:[];
          }):[];
        const station=battle.outpostMerchant,stationScreen=station&&scene.project(toV(station.x,station.y,3));
        outpostInfo.visible=!!stationScreen&&!h.dead&&!openedPanel.value&&!atlasOpen.value&&!eventOpen.value;
        if(stationScreen)Object.assign(outpostInfo,{x:Math.max(120,Math.min(scene.width-120,stationScreen.x)),y:Math.max(72,stationScreen.y)});
        const portal = battle.exitPortal, portalScreen = portal && scene.project(toV(portal.x, portal.y, .8));
        exitPortalInfo.visible = !!portalScreen && !h.dead && !openedPanel.value;
        if (portalScreen) Object.assign(exitPortalInfo, { x: Math.max(120, Math.min(scene.width - 120, portalScreen.x)), y: Math.max(72, portalScreen.y), near: Math.hypot(h.x - portal.x, h.y - portal.y) <= portal.radius + 80, approaching: portalTarget.value });
        view.update(scene, battle);
        lootView.update(scene, visibleLoot, h, pickupTarget.value, showLoot.value);
        if (++hudTick % 6 === 0) syncHud();
      }

      const onKey = (e, down) => {
        if (!active) return;
        if (!down) { keys.delete(e.code); return; }
        if(eventOpen.value||outpostOpen.value)return;
        if (atlasOpen.value) {
          releaseBattleInput();
          if(e.code==='KeyP'&&!e.repeat&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {e.preventDefault();closeAtlas();openHUDFunction('talents');return;}
          if(e.code==='KeyJ'&&!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {e.preventDefault();closeAtlas();openHUDFunction('quests');return;}
          if ((e.code === 'Escape' || e.code === 'KeyM') && !e.repeat) { e.preventDefault(); closeAtlas(); }
          return;
        }
        if (e.code === 'Escape' && bdExpanded.value) { e.preventDefault(); bdExpanded.value = false; return; }
        if (splitKey.value) { if (e.code === 'Escape') closeStackSplit(); return; }
        if (equipmentMenu.value) { if (e.code === 'Escape') closeEquipmentMenu(true); return; }
        if (e.code === 'Escape' && beltPickSlot.value >= 0) { e.preventDefault(); closeBeltPicker(beltPickSlot.value); return; }
        if (e.code === 'Escape' && skillPickerSlot.value >= 0) { e.preventDefault(); closeSkillPicker(skillPickerSlot.value); return; }
        if (e.code === 'Escape' && skillDetail.value) { e.preventDefault(); closeSkillDetails(); return; }
        if (e.code === 'Escape' && inspector.key) { e.preventDefault(); inspector.closeHover(); return; }
        if (e.code === 'Escape' && openedPanel.value) { e.preventDefault(); closeHUDPanel(); return; }
        if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && inspector.key && !e.repeat) {
          e.preventDefault(); inspector.pin(); releaseBattleInput(); return;
        }
        if (e.ctrlKey || e.target.closest('.b3-item-panel, .b3-material-tooltip, .b3-affix-description')) return;
        if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable) return;
        if(e.code==='KeyP'&&!e.repeat&&!e.altKey&&!e.metaKey) {e.preventDefault();openHUDFunction('talents');return;}
        if(e.code==='KeyJ'&&!e.repeat&&!e.altKey&&!e.metaKey) {e.preventDefault();openHUDFunction('quests');return;}
        if (e.code === 'KeyM' && !e.repeat && !e.altKey && !e.metaKey) { e.preventDefault(); openAtlas(); return; }
        if (!e.repeat && !e.altKey && !e.metaKey && ['KeyB', 'KeyC'].includes(e.code)) {
          e.preventDefault(); openHUDFunction(e.code === 'KeyB' ? 'inventory' : 'character'); return;
        }
        if (openedPanel.value || e.target.closest('.b3-window')) return;
        if (e.code === 'Tab' && !e.repeat && !e.shiftKey && !e.altKey && !e.metaKey && (e.target === stage.value || e.target === document.body)) { e.preventDefault(); openHUDFunction('dungeon-map'); return; }
        keys.add(e.code);
        if (/^Digit[1-4]$/.test(e.code)) { closeSkillPicker(); selectSkill(+e.code.slice(5) - 1); }
        const belt = { KeyQ: 0, KeyE: 1, KeyT: 2, KeyG: 3 }[e.code];
        if (belt !== undefined && !e.repeat) { e.preventDefault(); useBelt(belt); }
        if (e.code === 'KeyR' && (battle?.hero.dead || battle?.phase === 'failed')) restart();
        if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && battle && !e.repeat && battle.dodge()) void audio.play('dodge');
        if (e.code === 'Space') e.preventDefault();
        if (e.code === 'KeyZ' && !e.repeat) showLoot.value = !showLoot.value;
      };
      const keydown = e => onKey(e, true), keyup = e => onKey(e, false);
      const dismissSkillPicker = e => {
        if (skillPickerSlot.value >= 0 && !e.target.closest('.b3-skill-slots')) closeSkillPicker();
        else if (beltPickSlot.value >= 0 && !e.target.closest('.b3-belt-slots')) closeBeltPicker();
      };
      const resize = () => {
        closeSkillDetails();
        scene?.resize();
        inspector.x = Math.max(12, Math.min(inspector.x, window.innerWidth - Math.min(360, window.innerWidth - 24) - 12));
        inspector.y = Math.max(12, Math.min(inspector.y, window.innerHeight - Math.min(560, window.innerHeight - 24) - 12));
      };

      onMounted(() => {
        // The atlas shares the backpack's body portal, outside this mount element.
        document.addEventListener('pointerdown', unlockAudio, true);
        document.addEventListener('keydown', unlockAudio, true);
        document.addEventListener('click', clickAudio, true);
        document.addEventListener('visibilitychange', audioVisibility);
        const s = stage.value;
        s.addEventListener('pointermove', e => { if (atlasOpen.value) return; const r = s.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.inside = true; });
        s.addEventListener('pointerleave', () => { mouse.inside = false; });
        s.addEventListener('pointerdown', e => {
          if (atlasOpen.value) return;
          if ((skillPickerSlot.value >= 0 && !e.target.closest('.b3-skill-slots')) || (beltPickSlot.value >= 0 && !e.target.closest('.b3-belt-slots'))) { closeSkillPicker(); releaseBattleInput(); return; }
          if (e.button !== 0 || e.target.closest('.slot, button, .b3-outpost-tag, .b3-exit-portal, .b3-minimap, .b3-map-equipment, [data-touch-control]')) return;
          pickupTarget.value = '';
          const r = s.getBoundingClientRect();
          mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.inside = true;
          mouse.pending = scene?.pick(mouse.x, mouse.y) || null;
          if (battle?.outpostMerchant && mouse.pending && Math.hypot(mouse.pending.x-battle.outpostMerchant.x,mouse.pending.y-battle.outpostMerchant.y)<=battle.outpostMerchant.radius) { openOutpost(); return; }
          if (battle?.exitPortal && mouse.pending && Math.hypot(mouse.pending.x - battle.exitPortal.x, mouse.pending.y - battle.exitPortal.y) <= battle.exitPortal.radius) { useExitPortal(); return; }
          const stationEvent=mouse.pending&&battle?.mapEvents?.find(event=>event.kind!=='shop'&&Math.hypot(mouse.pending.x-event.x,mouse.pending.y-event.y)<=130);
          if(stationEvent){activateMapStation(stationEvent.id);return;}
          mouse.down = true; s.focus();
        });
        window.addEventListener('pointerup', () => { mouse.down = false; });
        window.addEventListener('pointermove',movePointerBagDrag,{passive:false});window.addEventListener('pointerup',finishPointerBagDrag);
        s.addEventListener('wheel', e => { if (atlasOpen.value) return; if (scene) { scene.zoom = Math.max(0.55, Math.min(1.8, scene.zoom * (e.deltaY > 0 ? 1.08 : 0.92))); e.preventDefault(); } }, { passive: false });
        window.addEventListener('keydown', keydown);
        window.addEventListener('pointerdown', dismissSkillPicker);
        window.addEventListener('keyup', keyup);
        window.addEventListener('resize', resize);
        raf = requestAnimationFrame(frame);
      });
      onBeforeUnmount(() => { window.removeEventListener('pointermove',movePointerBagDrag);window.removeEventListener('pointerup',finishPointerBagDrag);closeSkillDetails(); cancelBagPageHover(); cancelAnimationFrame(raf); document.removeEventListener('pointerdown', unlockAudio, true); document.removeEventListener('keydown', unlockAudio, true); document.removeEventListener('click', clickAudio, true); document.removeEventListener('visibilitychange', audioVisibility); audio.dispose(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('pointerdown', dismissSkillPicker); window.removeEventListener('resize', resize); lootView?.dispose(); scene?.dispose(); });

      watch(() => store.version, () => { if (active || battle) build(); });
      watch(() => JSON.stringify(ownedLoadout()), () => { if (battle) { tower.setLoadout(ownedLoadout()); battle.refreshSheet(); syncSkills(); syncHud(); } });
      watch(() => opts.god, v => { if (battle) { battle.hero.god = v; tower.options.god = v; } });
      watch(() => opts.autoCast, v => { if (battle) { battle.hero.autoCast = v; tower.options.autoCast = v; } });
      watch(() => opts.timeLimitEnabled, v => { tower?.setTimeLimitEnabled(v); syncHud(); });
      watch(paused, () => { if (active && !document.hidden) audio.update(battle, { paused: paused.value || atlasOpen.value }); else audio.suspend(); });

      api = {
        show() {
          active = true;
          ensureScene();
          requestAnimationFrame(() => { scene?.resize(); if (!atlasOpen.value && !openedPanel.value) stage.value?.focus(); });
          if (!battle) build();
          if (!atlasShown) { atlasShown = true; if (!battle || !trackedQuest.value) openAtlas(); }
          audio.update(battle, { paused: paused.value || atlasOpen.value || document.hidden });
        },
        hide() { closeOutpost(); active = false; audio.suspend(); audio.reset(); closeAtlas(); closeSkillDetails(); closeHUDPanel(); closeSkillPicker(); inspector.close(); },
        previewMonster(id) { detachAtlas(); opts.monsterType = id; paused.value = false; build(); },
        openBuildGuide,
        control(action, value) {
          if (action === 'release') { releaseBattleInput(); return; }
          if (!active) return;
          if (action === 'orientation') {
            if (value && !orientationPaused) { orientationResumePaused = paused.value; orientationPaused = true; paused.value = true; releaseBattleInput(); }
            else if (!value && orientationPaused) { orientationPaused = false; paused.value = orientationResumePaused; }
            return;
          }
          if (action === 'resume') { paused.value = false; return; }
          if (action === 'panel') { openHUDFunction(value); return; }
          if (action === 'close') { closeHUDPanel(); closeAtlas(); closeSkillPicker(); return; }
          if (openedPanel.value || atlasOpen.value || eventOpen.value || outpostOpen.value || paused.value) return;
          if (action === 'skill') { closeSkillPicker(); selectSkill(value); }
          if (action === 'belt') useBelt(value);
          if (action === 'dodge' && battle?.dodge()) void audio.play('dodge');
        },
        get controlsBlocked() { return !active || !!openedPanel.value || atlasOpen.value || eventOpen.value || outpostOpen.value || paused.value || !!battle?.hero.dead; },
        openTalents() { if(!active)api.show();if(openedPanel.value!=='talents')openHUDFunction('talents'); },
        get battle() { return battle; },
      };

      return {
        eventRunKey,eventMenuOpen,openMapEvent,closeMapEvent,mapEventChanged,mapEventStatus,mapEventUI,mapEventTags,activateMapStation,
        quests, trackedQuest, claimTaskReward, challengeQuestFloor, journeyHud, coach, runSummary, claimChain, skipCoach, dismissCoachTip, craftEntries, craftSelect, playMode,
        audioSettings, configureAudio, toggleAudio, previewAudio,
        outpostInfo,outpostOpen,battleHasOutpost,openOutpost,closeOutpost,syncHud,atlasState, atlasOpen, mapDeviceItems, atlasAttemptId, atlasCurrentNode, openAtlas, closeAtlas, selectAtlas, challengeAtlas, exitPortalInfo, useExitPortal,
        skillDetailSlot, auraDetailSlot, skillDetail, skillDetailPosition, showSkillDetails, showAuraDetails, leaveSkillDetails, holdSkillDetails,
        stage, overlay, lootRoot, showLoot, pickupTarget, hunter, hunterPool, hunterCurrencies, hunterShown, setHunterTarget, setHunterCurrency, ready, paused, opts, hud, dpsHud, player, store, availableSkillChoices, activePickerChoices, beltPickerChoices, skillChoiceName, equippedSkills, monsterChoices, ownedItems, ownedEquipment, beltSlots, characterEquipment, characterSkill, characterInventory, characterCells, placeCharacterItem, dropCharacterOutside, characterBagQuery, characterBagFilter, startCharacterDrag, equipCharacterItem, unequipCharacterItem,
        bagPage, bag, bagEntries, beginPointerBagDrag, toggleBagEquipment, ordinaryBagEntries, equippedBagEntries, dropEquippedBagItem, bagQuery, bagSearch, filteredBagEntries, clearBagSearch, selectedBagKey, selectedBagItem, bagKind, bagTitle, mapPanelTab, availableMapCores, chooseMapCore, floorMap, dungeonObjective, skillPickerSlot, openedPanel, activeHUDFunction, closeHUDPanel, spawnTraitEquipment,
        INVENTORY_PAGE_SIZE, canSplitStack, draggedKey, dropSlot, startBagDrag, endBagDrag, hoverBagCell, dropBagItem, hoverBagPage, cancelBagPageHover, sortBag, splitItem, openStackSplit, closeStackSplit, confirmStackSplit,
        inspector, inspectedItem, inspectorPosition, inspectItem, inspectEquipment, identifiedItem, isInventoryNew, selectInventoryItem,
        equipmentMenu, menuItem, saleQuote, openEquipmentMenu, openEquippedMenu, closeEquipmentMenu, equipMenuItem, identifyMenuItem, sellMenuItem, overGround, dropOnGround, dropMenuItem,
        bdRows, bdFamilies, selectedBdFamilyId, selectedBdFamily, bdLoading, bdError, openedBd, bdExpanded, loadBds, releaseBattleInput, applyBd, buildGuideId, openBuildGuide,
        SLOTS, PLAYER_GEAR_SLOTS, SKILL_SLOTS, BELT_SLOTS, BELT_KEYS, STATUS_STYLE, ownedCount, itemName, statusName, iconSrc,
        selectSkill, setSkill, toggleSkillPicker, closeSkillPicker, chooseSkill, skillPickerKey, useBelt, toggleBelt, openBeltPicker, closeBeltPicker, chooseBelt, beltPickerKey, beltPickSlot, beltChoices, auraChoices, auraId, auraBinding, docOf, setEquip, restart, nextFloor, challengeFloor, buyMerchant, MAX_TOWER_FLOOR, goShop, goCraft, beginProgression, openHUDFunction,
      };
    },
  });
  app.mount(el);
  return { show: () => api.show(), hide: () => api.hide(), previewMonster: id => api.previewMonster(id), openBuildGuide: id => api.openBuildGuide(id), openTalents:()=>api.openTalents(), control:(action,value)=>api.control(action,value), get controlsBlocked(){return api.controlsBlocked;}, get battle() { return api.battle; } };
}
