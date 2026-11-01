// 特效实验室：一块地面、几只木桩、一排按钮，逐个播放特效配方；「自动」轮播全部。
import * as THREE from '../vendor/three.module.js';
import { createFx } from './fx.mjs';
import { createPost } from './post.mjs';

export function mountLab(host, bar) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x090c12); scene.fog = new THREE.Fog(0x090c12, 22, 58);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 200);
  scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x302418, 1.2), new THREE.AmbientLight(0x404a60, .5));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6); sun.position.set(8, 20, 6); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x2c3644, roughness: .9, metalness: .05 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(40, 20, 0x3a4658, 0x2a3442); grid.position.y = .005; scene.add(grid);
  const dummies = [];
  for (const [x, z] of [[3, -1], [4.5, 1], [3.5, 2.5], [5.5, -2], [6, .5]]) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .45, 4, 12), new THREE.MeshStandardMaterial({ color: 0x7a2018, roughness: .55 }));
    m.position.set(x, .57, z); scene.add(m); dummies.push(m);
  }
  const hero = new THREE.Mesh(new THREE.CapsuleGeometry(.3, .75, 6, 14), new THREE.MeshStandardMaterial({ color: 0xf2bf33, roughness: .45, metalness: .3 }));
  hero.position.set(-1.5, .7, 0); scene.add(hero);
  const fx = createFx(THREE, scene), post = createPost(THREE, renderer), R = fx.recipes;
  const P = (x, z, y = 0) => [x, y, z];
  const shots = [];   // simulated projectiles for the lab
  let pid = 1;
  const shoot = (kind, element, n = 1, speed = 9) => { for (let i = 0; i < n; ++i) { const a = (i - (n - 1) / 2) * .12; shots.push({ id: pid++, kind, element, x: -1.2, y: .8, z: 0, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, life: 1.1, radius: .2 }); } };
  const DEMOS = {
    火球: () => shoot('fireball', 'fire', 3),
    寒冰弹: () => shoot('frost_bolt', 'cold', 3, 12),
    电花: () => shoot('spark', 'lightning', 5, 10),
    雷球: () => shoot('thunder_bolt', 'lightning', 2, 14),
    飞刃: () => shoot('viper_knife', 'chaos', 3, 14),
    敌方弹: () => shoot('mob_bolt', 'physical', 2, 7),
    火焰爆炸: () => R.explosion(P(4.5, 0), 1.6, 'fire'),
    巨型爆炸: () => R.explosion(P(4.5, 0), 2.8, 'fire', { big: true }),
    冰霜新星: () => R.nova(P(-1.5, 0), 2.6, 'cold'),
    冰爆: () => R.explosion(P(4.5, 0), 1.6, 'cold'),
    超载: () => { R.explosion(P(4.5, 0), 1.8, 'lightning', { big: true }); R.explosion(P(4.5, 0), 1.2, 'fire', { ground: false }); },
    毒爆: () => R.explosion(P(4.5, 0), 1.6, 'chaos'),
    落雷: () => { R.thunder(P(4, 0), 1.2); setTimeout(() => R.thunder(P(5, 1.5), 1), 120); setTimeout(() => R.thunder(P(3.5, -1.5), 1), 240); },
    连锁闪电: () => { const pts = [[-1.2, .9, 0], ...dummies.map(d => [d.position.x, .9, d.position.z])]; pts.slice(1).forEach((p, i) => setTimeout(() => R.chain(pts[i], p), i * 60)); },
    劈砍: () => R.slash(P(-1.5, 0), 0, 2, 'physical', { span: 2.2 }),
    重击: () => { R.slash(P(-1.5, 0), 0, 1.9, 'physical', { heavy: true, span: 1.6 }); R.impact([0, .6, 0], 'physical', { crit: true, dir: [1, 0, 0] }); },
    旋风斩: () => { for (let i = 0; i < 6; ++i) setTimeout(() => R.whirl(P(-1.5, 0), 1.8), i * 200); },
    崩地: () => R.slam(P(-1.5, 0), 0, 2.4, 'physical'),
    雷鸣崩地: () => R.slam(P(-1.5, 0), 0, 2.4, 'lightning'),
    碎冰: () => dummies.forEach((d, i) => setTimeout(() => R.shatter([d.position.x, 0, d.position.z]), i * 90)),
    闪现: () => R.blink(P(-1.5, 0), P(4, 2)),
    首领预警: () => { R.telegraph(P(4, 0), 1.8, 1.2); setTimeout(() => R.explosion(P(4, 0), 1.8, 'hostile', { big: true }), 1200); },
    击杀: () => dummies.forEach((d, i) => setTimeout(() => R.death([d.position.x, 0, d.position.z], ['fire', 'cold', 'lightning', 'chaos', 'physical'][i]), i * 80)),
    首领死亡: () => R.death(P(4.5, 0), 'fire', 2.2, { boss: true }),
    召唤: () => R.summon(P(0, 1.5), 'lightning'),
  };
  const statusDemo = { on: false };
  const zoneDemo = { on: false };
  const add = (name, fn) => { const b = document.createElement('button'); b.textContent = name; b.onclick = () => fn(b); bar.appendChild(b); return b; };
  for (const [name, fn] of Object.entries(DEMOS)) add(name, fn);
  add('火墙', b => { zoneDemo.on = !zoneDemo.on; b.classList.toggle('on', zoneDemo.on); });
  add('状态', b => { statusDemo.on = !statusDemo.on; b.classList.toggle('on', statusDemo.on); });
  let auto = null;
  add('自动轮播', b => { if (auto) { clearInterval(auto); auto = null; b.classList.remove('on'); return; } b.classList.add('on'); const list = Object.values(DEMOS); let i = 0; auto = setInterval(() => list[i++ % list.length](), 1300); });
  const STATUSES = ['ignited', 'shocked', 'chilled', 'frozen', 'poisoned'];

  function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  camera.position.set(1.5, 9.5, 8.2); camera.lookAt(1.5, 0, 0);
  const base = camera.position.clone();
  let last = performance.now(), manual = false;
  function frame(now, fixed = 0, draw = true) {
    const dt = fixed || Math.min(.05, (now - last) / 1000); last = now;
    if (manual && !fixed) return;
    // move lab projectiles; burst at the dummies' line
    for (const s of shots) { s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt; if (s.life <= 0 || s.x > 4.2) { s.dead = true; R.impact([s.x, .7, s.z], s.kind === 'mob_bolt' ? 'hostile' : s.element, { scale: 1.2, dir: [1, 0, 0] }); if (s.kind === 'fireball') R.explosion([s.x, 0, s.z], .9, 'fire'); } }
    for (let i = shots.length - 1; i >= 0; --i) if (shots[i].dead) shots.splice(i, 1);
    fx.projectiles(shots.map(s => ({ ...s, vy: 0, hostile: s.kind === 'mob_bolt' })), dt);
    if (zoneDemo.on) fx.zones([{ x: 3, z: 0, radius: 1.4, kind: 'flame_wall', element: 'fire' }]);
    if (statusDemo.on) fx.statuses(dummies.map((d, i) => ({ x: d.position.x, z: d.position.z, size: 1, status: STATUSES[i % STATUSES.length], stacks: 1 })));
    camera.position.copy(base); camera.lookAt(1.5, 0, 0); camera.updateMatrixWorld();
    const st = fx.update(dt, camera);
    camera.position.add(st.shake);
    if (draw) post.render(scene, camera, st);
    if (!fixed) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  /** Tests: stop the clock and step it exactly (frames at 60 Hz, drawing only the last). */
  const advance = sec => { manual = true; const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; ++i) frame(performance.now(), 1 / 60, i === n - 1); };
  globalThis.__lab = { fx, DEMOS, statusDemo, zoneDemo, advance, manual: () => { manual = true; } };
}
