// 地面与刀光：冲击环、地面印记（焦痕、霜花、裂地、毒沼）、刀光弧。全部实例化或池化，着色器程序化生成图案。
const NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.), f.x), f.y); }
float fbm(vec2 p){ float f = 0., a = .5; for (int i = 0; i < 5; ++i) { f += vn(p) * a; p *= 2.03; a *= .5; } return f; }
`;

// ------------------------------------------------------------------ rings (ground shockwaves)
const RING_VERT = /* glsl */`
attribute vec4 iA; // x, z, radius, width
attribute vec4 iB; // r, g, b, alpha
attribute vec4 iC; // mode, seed, progress, height
varying vec2 vP; varying vec4 vCol; varying vec4 vC; varying float vW;
void main(){
  float R = iA.z + iA.w;
  vec3 p = vec3(iA.x + position.x * R, iC.w, iA.y + position.y * R);
  vP = position.xy * R; vCol = iB; vC = iC; vW = iA.w;
  vC.x = iC.x; vC.z = iA.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}`;
const RING_FRAG = /* glsl */`
${NOISE}
varying vec2 vP; varying vec4 vCol; varying vec4 vC; varying float vW;
void main(){
  float r = length(vP), a = atan(vP.y, vP.x), mode = vC.x, seed = vC.y, R = vC.z;
  float n = fbm(vec2(a * 3.1831 + seed, r * 2.5 - seed));
  float rr = r;
  if (mode > 2.5) rr += (vn(vec2(a * 24. + seed * 7., seed)) - .5) * vW * 1.6;          // electric: jagged edge
  float d = (rr - R) / max(vW, 1e-3);
  float band = exp(-d * d * 3.);
  float inner = smoothstep(-4., 0., d) * (1. - smoothstep(0., .6, d)) * .18;            // soft fill trailing inside the front
  float alpha;
  if (mode < .5) alpha = band + inner * .5;                                               // clean
  else if (mode < 1.5) alpha = band * (.45 + n * 1.2) + inner * n * 1.4;                  // fire: broken, smoky
  else if (mode < 2.5) { float spikes = pow(abs(sin(a * 18. + seed)), 18.); alpha = band * (.6 + spikes * 1.6) + inner * .4; } // frost
  else alpha = band * (.4 + pow(vn(vec2(a * 40., seed * 3.)), 4.) * 3.) ;                 // electric
  alpha *= vCol.a;
  if (alpha < .004) discard;
  gl_FragColor = vec4(vCol.rgb, alpha);
}`;

// ------------------------------------------------------------------ decals (marks left on the floor)
const DECAL_VERT = /* glsl */`
attribute vec4 iA; // x, z, radius, rot
attribute vec4 iB; // kind, seed, age01, alpha
varying vec2 vP; varying vec4 vB;
void main(){
  float c = cos(iA.w), s = sin(iA.w);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iA.z;
  vP = position.xy; vB = iB;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(iA.x + q.x, .015 + iB.y * .00001, iA.y + q.y, 1.);
}`;
const DECAL_FRAG = /* glsl */`
${NOISE}
varying vec2 vP; varying vec4 vB;
float voro(vec2 p, out float edge){ vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) { vec2 g = vec2(x, y), o = vec2(h21(i + g), h21(i + g + 17.)); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  edge = d2 - d1; return d1; }
void main(){
  float kind = vB.x, seed = vB.y, t = vB.z, fade = vB.w;
  float r = length(vP), a = atan(vP.y, vP.x);
  float n = fbm(vP * 3. + seed);
  float shape = 1. - smoothstep(.55, 1., r + (n - .5) * .55);
  vec3 col; float alpha; vec3 glow = vec3(0.);
  if (kind < .5) {                                   // scorch: soot with dying embers
    col = vec3(.05, .04, .035); alpha = shape * (.28 + n * .25);
    float ember = pow(max(0., fbm(vP * 7. + seed * 3.) - .6), 1.5) * 4. * shape * (1. - smoothstep(.2, .7, r));
    glow = vec3(3., .9, .15) * ember * max(0., 1. - t * 2.2);
  } else if (kind < 1.5) {                           // frost: pale crystalline flower
    float rays = pow(abs(cos(a * 6. + n * 2.)), 14.) * (1. - r);
    float e; voro(vP * 6. + seed, e);
    col = vec3(.6, .78, .95); alpha = shape * (.05 + rays * .28 + (1. - smoothstep(0., .06, e)) * .08);
    glow = vec3(.3, .9, 1.8) * rays * .3 * max(0., 1. - t * 2.5);
  } else if (kind < 2.5) {                           // cracked ground with molten seams (slams)
    float e; voro(vP * 4.5 + seed, e);
    float crack = 1. - smoothstep(0., .07 + r * .05, e);
    float lines = crack * (1. - smoothstep(.4, 1., r)) ;
    col = vec3(.06, .05, .04); alpha = max(shape * .2, lines * .7);
    glow = vec3(3.2, 1.3, .35) * lines * max(0., 1. - t * 1.6);
  } else if (kind < 3.5) {                           // poison pool: bubbling sheen
    col = vec3(.12, .35, .05); alpha = shape * (.45 + n * .3);
    glow = vec3(.5, 1.6, .25) * pow(max(0., fbm(vP * 5. - seed + t * 2.) - .5), 2.) * 3. * shape;
  } else {                                           // electric scorch: thin branching burns
    float e; voro(vP * 3. + seed, e);
    float br = (1. - smoothstep(0., .05, e)) * (1. - smoothstep(.2, .95, r));
    col = vec3(.04, .04, .06); alpha = max(shape * .2, br * .8);
    glow = vec3(1.2, 1.5, 3.5) * br * max(0., 1. - t * 3.);
  }
  alpha *= fade;
  if (alpha < .004) discard;
  gl_FragColor = vec4(col + glow, alpha);
}`;

// ------------------------------------------------------------------ slash arcs
const SLASH_VERT = /* glsl */`
uniform float r0, r1, span, start, lift;
varying vec2 vUv;
void main(){
  vUv = position.xy;                              // x: along the arc 0..1, y: inner→outer 0..1
  float th = start + position.x * span;
  float R = mix(r0, r1, position.y);
  vec3 p = vec3(cos(th) * R, lift + position.y * .05 + sin(position.x * 3.1416) * lift * .6, -sin(th) * R);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}`;
const SLASH_FRAG = /* glsl */`
${NOISE}
uniform vec3 color, core; uniform float progress, fade, seed;
varying vec2 vUv;
void main(){
  float s = vUv.x, y = vUv.y;
  float head = progress, tailLen = 1.1;
  float behind = head - s;
  if (behind < 0.) discard;
  float tail = 1. - smoothstep(0., tailLen, behind);
  float edge = pow(y, 1.8);
  float n = fbm(vec2(s * 9. - progress * 3. + seed, y * 3.));
  float body = tail * edge * (1. - smoothstep(.95, 1., y));
  body *= smoothstep(.2, .6, n + tail * .5);                       // dissolve the tail with noise
  float rim = exp(-pow((1. - y) * 9., 2.)) * tail;                 // hot cutting edge along the outside
  float flash = exp(-behind * 22.) * pow(y, 3.) * 1.3;
  float a = (body * .8 + rim * .9 + flash) * fade;
  if (a < .004) discard;
  vec3 c = mix(color, core, clamp(flash * .8 + rim * .6, 0., 1.));
  gl_FragColor = vec4(c, a);
}`;

export function createMeshFx(T) {
  const group = new T.Group(); group.name = 'MeshFx';

  // rings
  const RING_CAP = 90, DECAL_CAP = 64;
  const quad = () => { const g = new T.InstancedBufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 2, 1, 0, 3, 2]); return g; };
  const inst = (g, k, n, size) => { const a = new T.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(T.DynamicDrawUsage); g.setAttribute(k, a); return a; };
  const ringGeo = quad(), rA = inst(ringGeo, 'iA', RING_CAP, 4), rB = inst(ringGeo, 'iB', RING_CAP, 4), rC = inst(ringGeo, 'iC', RING_CAP, 4);
  const ringMat = new T.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  const ringMesh = new T.Mesh(ringGeo, ringMat); ringMesh.frustumCulled = false; ringMesh.renderOrder = 15; group.add(ringMesh);
  const rings = [];

  const decalGeo = quad(), dA = inst(decalGeo, 'iA', DECAL_CAP, 4), dB = inst(decalGeo, 'iB', DECAL_CAP, 4);
  const decalMat = new T.ShaderMaterial({ vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, transparent: true, depthWrite: false, blending: T.NormalBlending, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const decalMesh = new T.Mesh(decalGeo, decalMat); decalMesh.frustumCulled = false; decalMesh.renderOrder = 5; group.add(decalMesh);
  const decals = [];

  // slashes: a strip 48 × 1, mapped onto an arc in the vertex shader
  const strip = new T.PlaneGeometry(1, 1, 48, 1); strip.translate(.5, .5, 0);
  const slashes = [];
  function slashMesh() {
    const mat = new T.ShaderMaterial({ vertexShader: SLASH_VERT, fragmentShader: `${SLASH_FRAG}`, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { r0: { value: .5 }, r1: { value: 1.5 }, span: { value: 2 }, start: { value: 0 }, lift: { value: .6 }, color: { value: new T.Color() }, core: { value: new T.Color() }, progress: { value: 0 }, fade: { value: 1 }, seed: { value: 0 } } });
    const m = new T.Mesh(strip, mat); m.frustumCulled = false; m.renderOrder = 18; group.add(m);
    return { mesh: m, mat, active: false };
  }

  return {
    group,
    /** Expanding ground ring. mode: 0 clean · 1 fire · 2 frost · 3 electric. */
    ring({ x, z, from = .2, to = 2, width = .18, color = [2, 2, 2], alpha = 1, life = .5, mode = 0, height = .05, ease = 3 }) {
      if (rings.length >= RING_CAP) rings.shift();
      rings.push({ x, z, from, to, width, color, alpha, life, mode, height, ease, age: 0, seed: Math.random() * 50 });
    },
    /** A mark on the floor. kind: 0 scorch · 1 frost · 2 crack · 3 poison · 4 electric. */
    decal({ x, z, radius = 1, kind = 0, life = 5, alpha = 1 }) {
      // A burst on top of a fresh mark of the same kind refreshes it instead of stacking another layer.
      const near = decals.find(d => d.kind === kind && Math.hypot(d.x - x, d.z - z) < Math.max(d.radius, radius) * .7);
      if (near) { near.age = Math.min(near.age, near.life * .25); near.radius = Math.max(near.radius, radius); return; }
      if (decals.length >= DECAL_CAP) decals.shift();
      decals.push({ x, z, radius, kind, life, alpha, age: 0, seed: Math.random() * 40, rot: Math.random() * 6.28 });
    },
    /** Sweeping blade arc centred on (x,z), facing `angle` (radians, world XZ). */
    slash({ x, z, y = 0, angle = 0, span = 2.2, r0 = .4, r1 = 1.6, color = [1.5, 1.3, 1], core = [4, 3.6, 3], life = .28, lift = .7, dir = 1, tilt = 0 }) {
      let s = slashes.find(q => !q.active); if (!s) { if (slashes.length >= 32) return; s = slashMesh(); slashes.push(s); }
      Object.assign(s, { active: true, age: 0, life });
      const u = s.mat.uniforms;
      u.r0.value = r0; u.r1.value = r1; u.span.value = span * dir; u.start.value = -span * dir / 2; u.lift.value = lift; u.seed.value = Math.random() * 30;
      u.color.value.setRGB(...color); u.core.value.setRGB(...core);
      s.mesh.position.set(x, y, z); s.mesh.rotation.set(tilt, angle, 0); s.mesh.visible = true;
    },
    update(dt) {
      // rings
      let k = 0;
      for (let i = rings.length - 1; i >= 0; --i) { rings[i].age += dt; if (rings[i].age >= rings[i].life) rings.splice(i, 1); }
      for (const g of rings) {
        const t = g.age / g.life, e = 1 - Math.pow(1 - t, g.ease), R = g.from + (g.to - g.from) * e;
        // Many rings at once (a chain reaction) share the light instead of stacking into a haze.
        const a = g.alpha * Math.pow(1 - t, 1.4) * Math.min(1, t * 12) / (1 + rings.length / 18);
        rA.array.set([g.x, g.z, R, g.width * (1 + t * .8)], k * 4); rB.array.set([g.color[0], g.color[1], g.color[2], a], k * 4); rC.array.set([g.mode, g.seed, t, g.height], k * 4);
        ++k;
      }
      ringGeo.instanceCount = k; for (const a of [rA, rB, rC]) a.needsUpdate = true;
      // decals
      k = 0;
      for (let i = decals.length - 1; i >= 0; --i) { decals[i].age += dt; if (decals[i].age >= decals[i].life) decals.splice(i, 1); }
      for (const d of decals) {
        const t = d.age / d.life, fade = d.alpha * Math.min(1, d.age * 8) * (1 - Math.pow(t, 3));
        dA.array.set([d.x, d.z, d.radius * (.85 + Math.min(1, d.age * 6) * .15), d.rot], k * 4); dB.array.set([d.kind, d.seed, t, fade], k * 4);
        ++k;
      }
      decalGeo.instanceCount = k; for (const a of [dA, dB]) a.needsUpdate = true;
      // slashes
      for (const s of slashes) {
        if (!s.active) continue;
        s.age += dt;
        const t = s.age / s.life;
        if (t >= 1) { s.active = false; s.mesh.visible = false; continue; }
        s.mat.uniforms.progress.value = Math.min(1, t * 2.4) + Math.max(0, t - .42) * .8;
        s.mat.uniforms.fade.value = 1 - Math.pow(Math.max(0, t - .4) / .6, 1.3);
      }
    },
    clear() { rings.length = 0; decals.length = 0; for (const s of slashes) { s.active = false; s.mesh.visible = false; } },
    dispose() { ringGeo.dispose(); ringMat.dispose(); decalGeo.dispose(); decalMat.dispose(); strip.dispose(); for (const s of slashes) s.mat.dispose(); group.clear(); },
  };
}
