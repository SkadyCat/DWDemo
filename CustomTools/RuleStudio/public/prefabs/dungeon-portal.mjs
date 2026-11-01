// 传送阵：首领倒下后出现在它倒下的地方。地面上是旋转的符文法阵，中间立着一道
// 漩涡传送门、一束光柱；英雄走进去（或点它）就打开图集。只是画面，交互在 run.mjs。
import * as THREE from '/vendor/three.module.js';

const SWIRL_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
// Upright gate: an elliptical vortex, bright rim, dark-ish heart that pulls inward.
const SWIRL_FRAG = /* glsl */`
uniform float time, open; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 p = (vUv - .5) * vec2(2., 2.);
  float r = length(p), a = atan(p.y, p.x);
  if (r > 1.) discard;
  float spiral = noise(vec2(a * 2.2 + r * 5. - time * 2.4, r * 3. - time * 1.1)) * .6 + noise(vec2(a * 5. - r * 9. + time * 3.1, r * 6.)) * .4;
  float bands = smoothstep(.35, .9, spiral);
  float rim = smoothstep(.72, .96, r) * (1. - smoothstep(.96, 1., r));
  float heart = 1. - smoothstep(0., .55, r);
  vec3 teal = vec3(.3, 2.2, 1.9), gold = vec3(3., 2.2, .9), deep = vec3(.01, .16, .2);
  vec3 c = mix(deep, teal, bands * (.55 + r * .9)) + gold * rim * 2. + vec3(.5, 2.3, 2.1) * heart * .8 * (.7 + .3 * sin(time * 3.));
  float alpha = min(1., .8 + bands * .3 + rim) * smoothstep(1., .9, r) * open;
  gl_FragColor = vec4(c * open, alpha);
}`;
// Light column: soft vertical beam, brightest at the ground, streaks rising.
const BEAM_FRAG = /* glsl */`
uniform float time, open; varying vec2 vUv;
void main(){
  float side = sin(vUv.x * 3.14159);
  float streak = .6 + .4 * sin(vUv.x * 40. + time * 2.) * sin(vUv.y * 6. - time * 4.);
  float a = pow(side, 3.) * pow(1. - vUv.y, 1.6) * streak * .55 * open;
  gl_FragColor = vec4(vec3(.35, 1.4, 1.3) * a, a);
}`;

export function createDungeonPortal() {
  const group = new THREE.Group(), rings = [];
  const material = new THREE.MeshBasicMaterial({ color: 0x73e4d3, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  for (const [inner, outer, y] of [[1.1, 1.2, .04], [1.45, 1.5, .045], [.88, .94, .05]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), material.clone()); ring.rotation.x = -Math.PI / 2; ring.position.y = y; group.add(ring); rings.push(ring);
  }
  // ground glow disc
  const glowMat = new THREE.ShaderMaterial({ uniforms: { open: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: SWIRL_VERT, fragmentShader: 'uniform float open; varying vec2 vUv; void main(){ float r = length(vUv - .5) * 2.; float a = (1. - smoothstep(0., 1., r)) * .7 * open; gl_FragColor = vec4(vec3(.2, .9, .85) * a, a); }' });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), glowMat); glow.rotation.x = -Math.PI / 2; glow.position.y = .03; group.add(glow);
  const runes = new THREE.Group();
  for (let i = 0; i < 8; i++) { const stone = new THREE.Mesh(new THREE.OctahedronGeometry(.12), material.clone()); stone.position.set(Math.cos(i * Math.PI / 4) * 1.32, .18, Math.sin(i * Math.PI / 4) * 1.32); runes.add(stone); }
  group.add(runes);
  // the gate itself: faces the camera (the camera looks from +z, above)
  const gateMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, open: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, vertexShader: SWIRL_VERT, fragmentShader: SWIRL_FRAG });
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.5), gateMat); gate.position.y = 1.35; group.add(gate);
  const beamMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, open: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, vertexShader: SWIRL_VERT, fragmentShader: BEAM_FRAG });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.15, 6, 32, 1, true), beamMat); beam.position.y = 3; group.add(beam);
  const light = new THREE.PointLight(0x6ff0e0, 0, 7, 2); light.position.y = 1.4; group.add(light);
  group.visible = false;
  let shownAt = null;

  return {
    group,
    update(portal, time) {
      group.visible = !!portal;
      if (!portal) { shownAt = null; return; }
      if (shownAt === null) shownAt = time;
      const open = Math.min(1, (time - shownAt) / .9), ease = 1 - Math.pow(1 - open, 3);
      group.position.set(portal.x * .01, 0, -portal.y * .01);
      runes.rotation.y = time * .25; runes.position.y = .07 + Math.sin(time * 2) * .05;
      for (const [i, ring] of rings.entries()) { ring.material.opacity = (.5 + Math.sin(time * 2 + i) * .2) * ease; ring.rotation.z = time * (i % 2 ? -.3 : .2); }
      gate.scale.set(ease, .2 + .8 * ease, 1);
      for (const m of [gateMat, beamMat]) { m.uniforms.time.value = time; m.uniforms.open.value = ease; }
      glowMat.uniforms.open.value = ease;
      light.intensity = (2.4 + Math.sin(time * 3) * .4) * ease;
    },
    dispose() { group.removeFromParent(); group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); material.dispose(); },
  };
}
