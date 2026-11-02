// 正式模型和动画：低多边形主角 / 怪物（DWEngine Tools/LowPoly 生成）+ 从 UE 导出并重定向的动画包（DWCore WebExport）。
//   主角：运动匹配（anim/mm3c.mjs，UCleanMotionAnimInstance 的移植）。位置由规则内核给，朝向以 ≤720°/s 转向瞄准；
//         施法播上半身「火球」蒙太奇，挨重击播受击，死亡播全身死亡并停在最后一帧。
//   人形怪（哥布林、骷髅、邪教徒、蘑菇人、魔像、骑士、小恶魔、食人魔）：同一包动画，待机 / 跑步按速度混合，
//         施法时叠上半身动作，死后播死亡动画再沉进地里。
//   狼、蜘蛛、蝙蝠、史莱姆：骨架不同，用程序化动作。
// 只有离主角最近的 MODEL_CAP 只怪用模型（每只一次绘制调用），更远的仍是实例化的胶囊体。
import * as THREE from '../vendor/three.module.js';
import { assetUrl } from '../asset-url.mjs';
import { loadCharacter, instantiate, characterMaterial } from './anim/glb.mjs';
import { loadPack, CleanMotion } from './anim/mm3c.mjs';

const M = 0.01, TAU = Math.PI * 2;
const MODEL_CAP = 64, MODEL_RANGE = 24, CORPSE_TIME = 1.7, SINK_TIME = 0.7;
const HERO_SKINS = ['Wizard', 'Pyromancer', 'Frost', 'Druid', 'Warlock', 'Alchemist'];
export const MONSTERS = ['goblin', 'skeleton', 'cultist', 'mushroom', 'golem', 'knight', 'imp', 'ogre', 'wolf', 'spider', 'bat', 'slime',
  'centipede', 'manta', 'hand', 'stonering', 'rockcluster', 'ghost', 'sporeball', 'stump'];
const HUMANOID = new Set(['goblin', 'skeleton', 'cultist', 'mushroom', 'golem', 'knight', 'imp', 'ogre']);
const ELEMENT_TINT = { fire: 0xff9a6a, cold: 0x9ad8ff, lightning: 0xfff08a, chaos: 0xb6ff8a, physical: 0xffffff };
// Which model a monster gets: by role (boss / elite / ranged / melee) and its damage element.
const PICK = {
  boss: { fire: ['golem'], cold: ['knight'], lightning: ['knight'], chaos: ['ogre'], physical: ['ogre'] },
  elite: { fire: ['imp', 'golem'], cold: ['skeleton', 'knight', 'stonering'], lightning: ['knight', 'stonering'], chaos: ['mushroom', 'ogre', 'stump'], physical: ['ogre', 'knight', 'stump'] },
  ranged: { fire: ['imp', 'cultist', 'manta'], cold: ['cultist', 'rockcluster'], lightning: ['bat', 'cultist', 'stonering', 'manta'], chaos: ['cultist', 'mushroom', 'ghost'], physical: ['cultist', 'rockcluster'] },
  melee: { fire: ['goblin', 'imp', 'centipede'], cold: ['skeleton', 'wolf', 'hand'], lightning: ['knight', 'goblin', 'hand'], chaos: ['spider', 'slime', 'mushroom', 'centipede', 'sporeball'],
    physical: ['goblin', 'wolf', 'skeleton', 'hand', 'centipede'] },
};
// On-screen height in metres for a normal-sized monster of each kind (elites and bosses scale from here).
const HEIGHT = { goblin: 1.1, skeleton: 1.25, cultist: 1.25, mushroom: 1.05, golem: 1.4, knight: 1.3, imp: 1.0, ogre: 1.5, wolf: 0.8, spider: 0.6, bat: 1.15, slime: 0.55,
  centipede: 0.22, manta: 1.0, hand: 0.75, stonering: 1.4, rockcluster: 1.3, ghost: 0.32, sporeball: 0.85, stump: 1.1 };
// Summons that have a proper model (the rest stay glowing capsules).
const MINION_MODEL = { skeleton: ['skeleton', 1.05], wolf: ['wolf', 0.85], spider: ['spider', 0.45], flame_golem: ['golem', 2.2], blood_fiend: ['imp', 1.2], wraith: ['cultist', 1.1], spectral_archer: ['skeleton', 1.1] };
const MINION_TINT = { wraith: 0xc9a0ff, spectral_archer: 0x9fe4ff, flame_golem: 0xffb080 };

const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; };
const role = m => m.boss ? 'boss' : m.kind === 'elite' ? 'elite' : (m.keepDistance ?? 0) > 0 ? 'ranged' : 'melee';
export function monsterKind(m) {
  const force = globalThis.__dwMonsterKind?.(m);   // debug: preview a model from the console
  if (force && MONSTERS.includes(force)) return force;
  const list = PICK[role(m)][m.element] ?? PICK[role(m)].physical; return list[hash(m.id) % list.length];
}
/** The hero's look follows the main skill: fire → pyromancer, cold → frost mage, summons → druid, traps → alchemist… */
export function heroSkinFor(hero) {
  const sk = hero.skills?.find(s => s.manual && !s.def.reserve) ?? hero.skills?.[0], t = sk?.def.tags ?? [];
  if (t.includes('trap')) return 'Alchemist';
  if (t.includes('minion') || t.includes('totem')) return 'Druid';
  if (t.includes('fire')) return 'Pyromancer';
  if (t.includes('cold')) return 'Frost';
  if (t.includes('chaos')) return 'Warlock';
  return 'Wizard';
}
const yawOf = (x, y) => Math.atan2(x, -y);     // game direction → three.js yaw (forward = (sin, cos))
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const UPPER = ['spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05', 'neck_01', 'neck_02', 'head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'];
const UPPER_W = { spine_01: 0.5, spine_02: 0.8 };

export class Characters {
  constructor(scene) {
    this.scene = scene; this.ready = false; this.tpl = {}; this.pool = new Map(); this.live = new Map(); this.corpses = [];
    this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion(); this.e = new THREE.Euler(); this.axis = new THREE.Vector3();
    this.qa = new Float32Array(25 * 4); this.pa = new Float32Array(3); this.qb = new Float32Array(25 * 4); this.pb = new Float32Array(3);
    this.dead = new Set(); this.events = [];
    this.loading = this.load().catch(err => { console.warn('[角色模型] 没加载成功，继续用胶囊体：', err); });
  }

  async load() {
    const base = '/assets/characters/';
    const [pack, ...tpls] = await Promise.all([
      loadPack(assetUrl('/assets/anim/hero_anim.bin')),
      ...HERO_SKINS.map(n => loadCharacter(assetUrl(`${base}heroes/LP_${n}.glb`))),
      ...MONSTERS.map(k => loadCharacter(assetUrl(`${base}monsters/LP_${k[0].toUpperCase() + k.slice(1)}.glb`))),
    ]);
    this.pack = pack;
    HERO_SKINS.forEach((n, i) => { this.tpl['hero:' + n] = tpls[i]; });
    MONSTERS.forEach((k, i) => { this.tpl[k] = tpls[HERO_SKINS.length + i]; });
    // Clips the monsters reuse: an idle loop, the steadiest forward run loop, a cast and a death.
    const run = pack.dbs.PSD_Run.filter(c => c.loop).map(c => ({ c, v: Math.hypot(c.r[(c.n - 1) * 3] - c.r[0], c.r[(c.n - 1) * 3 + 1] - c.r[1]) / c.len, turn: Math.abs(c.r[(c.n - 1) * 3 + 2] - c.r[2]) }))
      .sort((a, b) => a.turn - b.turn || b.v - a.v)[0];
    this.clips = { idle: pack.byName.Set_Mage_Idle_IP ?? pack.dbs.PSD_Idle[0], run: run.c, runSpeed: run.v || 4, cast: pack.byName.Set_Mage_Fireball_L_IP, death: pack.byName.Set_Mage_Death_IP };
    this.ready = true;
  }

  /** Listen to the run's events (casts, heavy hits, deaths) — call when a new run starts. */
  bind(run) {
    if (this.run === run) return;
    this.detach?.();
    this.run = run; this.dead.clear(); this.events.length = 0;
    for (const [, v] of this.live) this.release(v);
    this.live.clear(); for (const c of this.corpses) this.release(c); this.corpses.length = 0;
    if (this.hero) { this.hero.mm.action = null; this.hero.dead = false; this.hero.placed = false; }
    const fn = e => {
      if (e.type === 'death' && e.source?.team === 1) this.dead.add(e.source.id);
      else if (e.type === 'death' && e.source?.owner) this.dead.add(e.source.id);
      else if (e.source === run.hero && e.type === 'cast' && !(e.tags ?? []).includes('triggered') && !e.skill?.def.reserve) this.events.push(['cast', e.skill]);
      else if (e.type === 'struck' && e.source === run.hero && e.amount > run.hero.max.life * 0.06) this.events.push(['hurt']);
    };
    run.world.listeners.push(fn);
    this.detach = () => { const i = run.world.listeners.indexOf(fn); if (i >= 0) run.world.listeners.splice(i, 1); };
  }

  // ------------------------------------------------------------------ hero
  makeHero(skin) {
    if (this.hero) { this.hero.inst.root.removeFromParent(); }
    const tpl = this.tpl['hero:' + skin], inst = instantiate(tpl, characterMaterial(tpl));
    const pelvisH = inst.rest.pelvis.y;
    const mm = new CleanMotion(this.pack, { scale: pelvisH / 0.959, pelvisH });
    this.scene.add(inst.root);
    this.hero = { skin, inst, mm, pelvisH, scale: pelvisH / 0.959, anim: this.pack.bones.map(n => inst.bones[n]), yaw: 0, last: null, dead: false, lastCast: -9, lastHurt: -9 };
  }

  updateHero(run, dt) {
    const hero = run.hero, skin = heroSkinFor(hero);
    if (!this.hero || this.hero.skin !== skin) this.makeHero(skin);
    const H = this.hero, mm = H.mm, x = hero.x * M, z = -hero.y * M;
    const want = yawOf(hero.aim.x, hero.aim.y);
    if (!H.placed) { H.yaw = want; mm.teleport(x, z, want); H.last = { x, z }; H.placed = true; }
    // Blinks and portals: snap instead of sprinting across the room.
    if (Math.hypot(x - H.last.x, z - H.last.z) > 2.5) { mm.teleport(x, z, H.yaw); H.last = { x, z }; }
    const vx = (x - H.last.x) / dt, vz = (z - H.last.z) / dt; H.last = { x, z };
    H.yaw += Math.max(-4 * Math.PI * dt, Math.min(4 * Math.PI * dt, wrap(want - H.yaw)));
    for (const [kind, sk] of this.events) {
      if (!hero.alive) break;
      if (kind === 'cast') {
        // One cast animation per real cast; quick repeats keep the current swing going instead of restarting it.
        const gap = run.elapsed - H.lastCast; H.lastCast = run.elapsed;
        const active = mm.action && mm.action.upper && mm.actionProgress() < 0.45;
        if (!active) mm.playAction('Set_Mage_Fireball_L_RM', Math.max(1.4, Math.min(3, 1.1 / Math.max(0.15, gap))), true);
      } else if (kind === 'hurt' && run.elapsed - H.lastHurt > 0.8 && !mm.isActionActive()) { H.lastHurt = run.elapsed; mm.playAction('Set_Mage_Hurt_IP', 1.5, true); }
    }
    this.events.length = 0;
    if (!hero.alive && !H.dead) { H.dead = true; mm.playAction('Set_Mage_Death_IP', 1, false, { hold: true }); }
    const speed = hero.alive ? Math.hypot(vx, vz) : 0, maxSpeed = Math.max(3, run.world.stat(hero, 'moveSpeed') / 100 * 4);
    mm.update(dt, { x, z, yaw: H.yaw, vx: hero.alive ? vx : 0, vz: hero.alive ? vz : 0, ix: hero.alive ? vx : 0, iz: hero.alive ? vz : 0, maxSpeed: Math.max(maxSpeed, speed) });
    const q = mm.outQ, p = mm.outP;
    for (const b of H.inst.list) b.quaternion.identity();
    H.anim.forEach((b, i) => { if (b) b.quaternion.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]); });
    H.inst.bones.pelvis.position.set(p[0] * H.pelvisH, p[1] * H.pelvisH, p[2] * H.pelvisH);
    H.inst.root.position.set(mm.vis.x, 0, mm.vis.z); H.inst.root.rotation.y = mm.vis.yaw;
    H.inst.root.visible = true;
  }

  // ------------------------------------------------------------------ monsters / summons
  take(kind, tint) {
    const free = this.pool.get(kind);
    let v = free?.pop();
    if (!v) {
      const tpl = this.tpl[kind], inst = instantiate(tpl, characterMaterial(tpl));
      v = { kind, tpl, inst, pelvisH: inst.rest.pelvis?.y ?? 0.5, anim: HUMANOID.has(kind) ? this.pack.bones.map(n => inst.bones[n]) : null };
      this.scene.add(inst.root);
    }
    v.inst.root.visible = true; v.inst.root.rotation.set(0, 0, 0); v.t = 0; v.speed = 0; v.cast = -9; v.phase = Math.random() * 4; v.last = null;
    v.inst.mesh.material.color.set(tint ?? 0xffffff); v.inst.mesh.material.emissive.set(0x000000);
    return v;
  }
  release(v) { v.inst.root.visible = false; let l = this.pool.get(v.kind); if (!l) this.pool.set(v.kind, l = []); l.push(v); }

  /** Pose a humanoid from the pack: idle/run blended by speed, an upper-body cast on top, or the death clip. */
  poseHumanoid(v, dt, { speed, cast, death }) {
    const P = this.pack, C = this.clips, s = v.pelvisH / 0.959;
    const k = Math.min(1, speed / 1.2);
    v.t += dt; v.phase += dt * Math.max(0.6, speed / (C.runSpeed * s));
    const qa = this.qa, pa = this.pa, qb = this.qb, pb = this.pb;
    if (death !== undefined) { P.pose(C.death, death, qa, pa); }
    else {
      P.pose(C.idle, v.t, qa, pa);
      if (k > 0) { P.pose(C.run, v.phase, qb, pb); this.mix(qa, pa, qb, pb, k, null); }
      if (cast >= 0 && cast < C.cast.len / 2) {
        P.pose(C.cast, cast * 2, qb, pb);
        const w = Math.min(1, cast * 10, (C.cast.len / 2 - cast) * 6);
        this.mix(qa, pa, qb, pb, w, UPPER);
      }
    }
    for (const b of v.inst.list) b.quaternion.identity();
    v.anim.forEach((b, i) => { if (b) b.quaternion.set(qa[i * 4], qa[i * 4 + 1], qa[i * 4 + 2], qa[i * 4 + 3]); });
    v.inst.bones.pelvis.position.set(pa[0] * v.pelvisH, pa[1] * v.pelvisH, pa[2] * v.pelvisH);
  }
  mix(qa, pa, qb, pb, w, only) {
    const P = this.pack, A = this.q, B = this.q2;
    const idx = only ? only.map(n => [P.bi[n], UPPER_W[n] ?? 1]) : P.bones.map((n, i) => [i, 1]);
    for (const [i, ww] of idx) {
      A.fromArray(qa, i * 4); B.fromArray(qb, i * 4); A.slerp(B, w * ww); A.toArray(qa, i * 4);
    }
    if (!only) for (let c = 0; c < 3; ++c) pa[c] += (pb[c] - pa[c]) * w;
  }

  /** Non-humanoids (wolves, spiders, bats, slimes and the second batch): hand-made cycles. */
  poseCreature(v, dt, { speed, cast, death }) {
    const B = v.inst.bones, e = this.e, q = this.q;
    v.t += dt; v.phase += dt * (2 + speed * 3.2);
    const ph = v.phase, k = Math.min(1, speed / 1.2), rot = (n, x, y, z) => { const b = B[n]; if (b) b.quaternion.setFromEuler(e.set(x, y, z, 'YXZ')); };
    for (const b of v.inst.list) b.quaternion.identity();
    if (v.kind === 'wolf') {
      const s = Math.sin(ph), c = Math.cos(ph);
      for (const [side, sg] of [['l', 1], ['r', -1]]) {
        rot('thigh_' + side, -0.55 * k * s * sg, 0, 0); rot('calf_' + side, 0.25 * k * Math.max(0, c * sg), 0, 0);
        rot('upperarm_' + side, 0.55 * k * s * sg, 0, 0); rot('lowerarm_' + side, -0.3 * k * Math.max(0, -c * sg), 0, 0);
      }
      rot('spine_01', 0.05 * k * Math.sin(ph * 2), 0, 0); rot('neck_01', cast >= 0 && cast < 0.4 ? -0.35 : 0.04 * Math.sin(v.t * 2), 0, 0);
      rot('jaw', cast >= 0 && cast < 0.4 ? 0.5 : 0.05, 0, 0); rot('tail_01', 0.2, 0.35 * Math.sin(v.t * 6), 0); rot('tail_02', 0, 0.3 * Math.sin(v.t * 6 - 1), 0);
      B.pelvis.position.y = v.inst.rest.pelvis.y + 0.02 * k * Math.abs(Math.sin(ph));
    } else if (v.kind === 'spider') {
      for (let leg = 1; leg <= 4; ++leg) for (const [side, sg] of [['l', 1], ['r', -1]]) {
        const p = ph + leg * Math.PI / 2 + (sg > 0 ? 0 : Math.PI), lift = Math.max(0, Math.sin(p));
        rot(`leg_${leg}_01_${side}`, 0, 0.35 * (k + 0.15) * Math.cos(p), -sg * 0.35 * lift * (k + 0.2));
      }
      rot('abdomen', 0.08 * Math.sin(v.t * 3), 0, 0); rot('head', cast >= 0 && cast < 0.4 ? -0.3 : 0, 0, 0);
      B.body.position.y = v.inst.rest.body.y + 0.015 * Math.sin(ph * 2);
    } else if (v.kind === 'bat') {
      const f = Math.sin(v.t * 14 + v.phase);
      for (const [side, sg] of [['l', 1], ['r', -1]]) { rot('wing_01_' + side, 0, 0, sg * 0.75 * f); rot('wing_02_' + side, 0, 0, sg * 0.35 * f); rot('wing_03_' + side, 0, 0, sg * 0.25 * f); }
      rot('body', 0.25 * k + (cast >= 0 && cast < 0.4 ? -0.4 : 0), 0, 0);
      B.body.position.y = v.inst.rest.body.y + 0.08 * Math.sin(v.t * 4 + v.phase);
    } else if (v.kind === 'slime') {
      const sq = 0.12 * Math.sin(v.t * (4 + speed * 3)) + (cast >= 0 && cast < 0.4 ? 0.2 * Math.sin(cast / 0.4 * Math.PI) : 0);
      B.top.position.y = v.inst.rest.top.y * (1 + sq); B.body.scale.set(1 - sq * 0.4, 1 + sq, 1 - sq * 0.4);
    } else if (v.kind === 'centipede') {
      // a travelling wave down the body; the head swings against it
      const wave = 0.22 + 0.12 * k, bite = cast >= 0 && cast < 0.35;
      rot('head', bite ? -0.25 : 0, -wave * 0.6 * Math.sin(ph * 1.6), 0);
      for (let i = 1; i <= 10; ++i) rot('seg_' + String(i).padStart(2, '0'), 0, wave * Math.sin(ph * 1.6 - i * 0.75), 0);
    } else if (v.kind === 'manta') {
      const f = Math.sin(v.t * (3.2 + speed) + v.phase);
      for (const [side, sg] of [['l', 1], ['r', -1]]) { rot('wing_01_' + side, 0, 0, sg * 0.42 * f); rot('wing_02_' + side, 0, 0, sg * 0.4 * Math.sin(v.t * (3.2 + speed) + v.phase - 0.7)); }
      for (let i = 1; i <= 3; ++i) rot('tail_0' + i, 0.05 * Math.sin(v.t * 2 - i), 0.2 * Math.sin(v.t * 2.4 - i * 0.8), 0);
      rot('body', cast >= 0 && cast < 0.4 ? -0.35 : -0.08 * k, 0, 0);
      B.body.position.y = v.inst.rest.body.y + 0.06 * Math.sin(v.t * 3.2 + v.phase - 1.2);
    } else if (v.kind === 'hand') {
      // creeps on its fingertips: one finger lifts and reaches forward at a time
      const order = [1, 3, 2, 4];
      order.forEach((n, j) => {
        const lift = Math.max(0, Math.sin(ph * 1.4 - j * Math.PI / 2)) * (0.25 + 0.5 * k);
        rot(`finger_${n}_01`, -0.55 * lift, 0, 0); rot(`finger_${n}_02`, 0.35 * lift, 0, 0);
      });
      const tl = Math.max(0, Math.sin(ph * 1.4 + Math.PI)) * (0.2 + 0.4 * k);
      rot('thumb_01', 0, 0, 0.4 * tl); rot('thumb_02', 0.3 * tl, 0, 0);
      const slap = cast >= 0 && cast < 0.4 ? Math.sin(cast / 0.4 * Math.PI) : 0;
      rot('palm', -0.35 * slap + 0.04 * Math.sin(ph * 2.8), 0, 0.05 * Math.sin(ph * 1.4)); rot('wrist', 0.1 * Math.sin(v.t * 2), 0, 0);
      B.palm.position.y = v.inst.rest.palm.y + 0.012 * Math.abs(Math.sin(ph * 2.8)) + 0.05 * slap;
    } else if (v.kind === 'stonering' || v.kind === 'rockcluster') {
      // floating stones turn round a crystal that spins and bobs; casting flares the ring outward
      const flare = cast >= 0 && cast < 0.5 ? Math.sin(cast / 0.5 * Math.PI) : 0;
      B.core.position.y = v.inst.rest.core.y + 0.05 * Math.sin(v.t * 2.2 + v.phase);
      rot('core', 0, v.t * 2.4, 0);
      if (v.kind === 'stonering') {
        rot('ring', 0, 0.25 * Math.sin(v.t * 0.7), v.t * (0.9 + flare * 6));
        rot('shards', 0, -v.t * 0.8, 0);
        B.ring.scale.setScalar(1 + 0.15 * flare); B.shards.scale.setScalar(1 + 0.25 * flare);
      } else {
        rot('orbit', 0, 0.3 * Math.sin(v.t * 0.5), v.t * (0.6 + flare * 4));
        for (let i = 1; i <= 5; ++i) { const b = B['rock_' + i]; if (!b) continue; b.position.copy(v.inst.rest['rock_' + i]).multiplyScalar(1 + 0.25 * flare); b.position.y += 0.035 * Math.sin(v.t * 2.6 + i * 1.7); rot('rock_' + i, v.t * 0.7 + i, v.t * 0.5, 0); }
      }
    } else if (v.kind === 'ghost') {
      for (let i = 1; i <= 7; ++i) rot('body_0' + i, 0.06 * Math.sin(v.t * 3 - i * 0.9), (0.16 + 0.1 * k) * Math.sin(ph * 1.5 - i * 0.85), 0);
      B.body_01.position.y = v.inst.rest.body_01.y + 0.03 * Math.sin(v.t * 2.5) + (cast >= 0 && cast < 0.4 ? 0.12 * Math.sin(cast / 0.4 * Math.PI) : 0);
    } else if (v.kind === 'sporeball') {
      // breathes, rolls a little, tendrils grope the floor; casting puffs it up
      const puff = cast >= 0 && cast < 0.45 ? Math.sin(cast / 0.45 * Math.PI) : 0, br = 1 + 0.05 * Math.sin(v.t * 2.6) + 0.18 * puff;
      B.body.scale.set(br, 1 + (br - 1) * 0.7, br); rot('body', 0.25 * k * Math.sin(ph), v.t * 0.4, 0.1 * Math.sin(v.t * 1.3));
      for (let i = 1; i <= 6; ++i) { rot(`tendril_${i}_01`, 0.25 * Math.sin(ph * 1.5 + i * 1.1), 0, 0.15 * Math.sin(v.t * 2 + i)); rot(`tendril_${i}_02`, 0.3 * Math.sin(ph * 1.5 + i * 1.1 - 0.8), 0, 0); }
    } else if (v.kind === 'stump') {
      // walks on its roots: opposite roots lift in turn, the trunk rocks over the planted ones
      for (let i = 1; i <= 8; ++i) {
        const a = B[`root_${i}_01`], d = v.inst.rest[`root_${i}_02`]; if (!a || !d) continue;
        const lift = Math.max(0, Math.sin(ph * 1.2 + (i % 2) * Math.PI)) * (0.12 + 0.35 * k);
        const ax = this.axis.set(d.z, 0, -d.x).normalize();
        a.quaternion.setFromAxisAngle(ax, -lift);
        const b = B[`root_${i}_02`]; if (b) b.quaternion.setFromAxisAngle(ax, lift * 0.6);
      }
      const slam = cast >= 0 && cast < 0.45 ? Math.sin(cast / 0.45 * Math.PI) : 0;
      rot('trunk', -0.3 * slam + 0.06 * k * Math.sin(ph * 2.4), 0, 0.08 * Math.sin(ph * 1.2)); rot('top', 0.04 * Math.sin(v.t * 1.7), 0, 0);
      B.trunk.position.y = v.inst.rest.trunk.y + 0.02 * Math.abs(Math.sin(ph * 1.2)) + 0.05 * slam;
    }
    if (death !== undefined) {
      // fall over sideways
      const u = Math.min(1, death / 0.45);
      v.inst.mesh.parent.rotation.z = (v.kind === 'bat' ? 1.3 : 1.45) * u * u;
    }
  }

  place(v, a, dt, { scale, tint, frozen, flash, elapsed }) {
    const x = a.x * M, z = -a.y * M;
    if (!v.last) v.last = { x, z };
    const sp = Math.hypot(x - v.last.x, z - v.last.z) / Math.max(1e-3, dt); v.last = { x, z };
    v.speed += (Math.min(8, sp) - v.speed) * Math.min(1, dt * 8);
    const f = a.facing ?? a.aim; if (f && (f.x || f.y)) v.yaw = yawOf(f.x, f.y);
    else if (sp > 0.1) v.yaw = Math.atan2(x - (v.px ?? x), z - (v.pz ?? z));
    v.px = x; v.pz = z;
    v.inst.root.position.set(x, 0, z); v.inst.root.rotation.y = v.yaw ?? 0; v.inst.root.scale.setScalar(scale);
    const mat = v.inst.mesh.material;
    mat.color.set(tint);
    mat.emissive.setRGB(flash ? 0.55 : frozen ? 0.1 : 0, flash ? 0.5 : frozen ? 0.35 : 0, flash ? 0.45 : frozen ? 0.55 : 0);
    const cast = elapsed - (a.lastCastAt ?? -9);
    const pose = { speed: v.speed / Math.max(0.3, scale), cast: frozen ? -1 : cast };
    if (frozen) return;   // frozen monsters hold still
    (v.anim ? this.poseHumanoid : this.poseCreature).call(this, v, dt, pose);
  }

  /** Per frame. Returns the ids drawn as models (the caller skips their capsules). */
  update(run, dt) {
    const shown = new Set();
    if (!this.ready || !run) return { hero: false, shown };
    this.bind(run);
    if (dt <= 0) { return { hero: !!this.hero, shown: new Set(this.live.keys()) }; }
    dt = Math.min(dt, 0.1);
    this.updateHero(run, dt);
    const hero = run.hero, elapsed = run.elapsed;
    // nearest monsters and modelled summons get models
    const wanted = [];
    for (const m of run.monsters) { const d = Math.hypot(m.x - hero.x, m.y - hero.y) * M; if (d < MODEL_RANGE) wanted.push([d, m, null]); }
    for (const m of run.minions) { const mm = MINION_MODEL[m.template]; if (mm) wanted.push([Math.hypot(m.x - hero.x, m.y - hero.y) * M * 0.5, m, mm]); }
    wanted.sort((a, b) => a[0] - b[0]);
    const keep = new Set();
    for (const [, m, mm] of wanted.slice(0, MODEL_CAP)) {
      keep.add(m.id);
      let v = this.live.get(m.id);
      const kind = mm ? mm[0] : monsterKind(m);
      if (!v) { v = this.take(kind); this.live.set(m.id, v); }
      const size = mm ? mm[1] : m.boss ? 2.2 / 0.95 : m.kind === 'elite' ? 1.25 / 0.95 : 1;
      // a light wash of the damage element (elites a touch of gold); see-through bodies keep their own colour
      const wash = new THREE.Color(0xffffff).lerp(new THREE.Color(ELEMENT_TINT[m.element] ?? 0xffffff), v.tpl.transparent ? 0 : 0.45);
      if (m.kind === 'elite' && !m.boss) wash.lerp(new THREE.Color(0xffd75e), 0.3);
      const tint = mm ? (MINION_TINT[m.template] ?? 0xd8fff4) : wash.getHex();
      this.place(v, m, dt, { scale: (HEIGHT[kind] ?? v.tpl.height * 1.15) * size / v.tpl.height, tint, frozen: m.hasStatus?.('frozen'), flash: (m.hitFlash ?? 0) > 0.6, elapsed });
      shown.add(m.id);
    }
    // the rest: dead ones fall and sink, the others go back to the pool
    for (const [id, v] of this.live) {
      if (keep.has(id)) continue;
      this.live.delete(id);
      if (this.dead.has(id) && this.corpses.length < 40) { v.death = 0; this.corpses.push(v); } else this.release(v);
    }
    this.dead.clear();
    this.corpses = this.corpses.filter(v => {
      v.death += dt;
      if (v.death > CORPSE_TIME + SINK_TIME) { v.inst.mesh.parent.rotation.z = 0; v.inst.root.position.y = 0; this.release(v); return false; }
      v.inst.mesh.material.emissive.setRGB(0, 0, 0);
      (v.anim ? this.poseHumanoid : this.poseCreature).call(this, v, dt, { speed: 0, cast: -1, death: v.death });
      if (v.death > CORPSE_TIME) v.inst.root.position.y = -(v.death - CORPSE_TIME) / SINK_TIME * 0.9 * v.inst.root.scale.y;
      return true;
    });
    return { hero: true, shown };
  }

  dispose() {
    this.detach?.();
    const all = [...this.live.values(), ...this.corpses, ...[...this.pool.values()].flat()];
    for (const v of all) { v.inst.root.removeFromParent(); v.inst.mesh.material.dispose(); v.inst.mesh.skeleton.dispose(); }
    if (this.hero) { this.hero.inst.root.removeFromParent(); this.hero.inst.mesh.material.dispose(); }
    for (const t of Object.values(this.tpl)) t.geometry.dispose();
  }
}
