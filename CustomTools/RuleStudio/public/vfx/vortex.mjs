// 龙卷风的本体：一个按高度张开的漏斗网格，两层（外层慢而柔、内层快而亮），着色器里
// 是沿螺旋方向拉长的风纹、边缘更亮（像有体积）、上下两头淡出；脚下一圈旋转的尘卷，
// 顶上一片缓慢打转的云盖。全部加色混合、不写深度，多个叠在一起也不会发黑。
const NOISE = /* glsl */`
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; ++i) { s += vn(p) * a; p = p * 2.03 + 17.1; a *= .5; } return s; }`;

const FUNNEL_VERT = /* glsl */`
uniform float time, seed, sway;
varying vec2 vUv; varying float vRim;
void main(){
  vUv = uv;
  vec3 p = position;
  float u = uv.y;
  // the column bends and wanders, more at the top
  p.x += sin(time * 2.1 + seed + u * 2.4) * sway * u * u;
  p.z += cos(time * 1.7 + seed * 1.3 + u * 1.9) * sway * .7 * u * u;
  vec4 wp = modelMatrix * vec4(p, 1.);
  vec3 n = normalize(mat3(modelMatrix) * normal), v = normalize(cameraPosition - wp.xyz);
  vRim = 1. - abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FUNNEL_FRAG = /* glsl */`
uniform float time, seed, spin, twist, strength; uniform vec3 colA, colB;
varying vec2 vUv; varying float vRim;
${NOISE}
void main(){
  float a = vUv.x * 6.2832, u = vUv.y;
  // wind bands spiral up the funnel
  vec2 q = vec2(vUv.x * 7. + u * twist - time * spin, u * 3.2 - time * .9 + seed);
  float bands = fbm(q * vec2(1., 1.)) ;
  float streak = smoothstep(.42, .8, bands) + smoothstep(.62, .95, fbm(q * vec2(2.3, 4.) + 5.3)) * .6;
  float ends = smoothstep(0., .12, u) * (1. - smoothstep(.78, 1., u));
  float body = (.32 + streak * 1.2) * (.45 + vRim * vRim * 1.6) * ends;
  vec3 c = mix(colA, colB, clamp(streak * .8 + vRim * .3, 0., 1.));
  float alpha = body * strength;
  if (alpha < .003) discard;
  gl_FragColor = vec4(c * alpha, alpha);
}`;
const DISC_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
// Ground dust swirl / cloud cap: spiral arms of noise, soft round edge.
const DISC_FRAG = /* glsl */`
uniform float time, seed, spin, strength, hole; uniform vec3 col;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = (vUv - .5) * 2.; float r = length(p); if (r > 1.) discard;
  float a = atan(p.y, p.x);
  float arms = fbm(vec2(a * 2.5 + r * 6. - time * spin + seed, r * 4. - time * .6));
  float swirl = smoothstep(.38, .82, arms);
  float shape = smoothstep(1., .55, r) * smoothstep(hole, hole + .25, r);
  float alpha = (swirl * .9 + .12) * shape * strength;
  if (alpha < .003) discard;
  gl_FragColor = vec4(col * alpha, alpha);
}`;

function funnelGeometry(T) {
  // radius grows with height: narrow foot, wide mouth
  const pts = [];
  for (let i = 0; i <= 28; ++i) { const u = i / 28; pts.push(new T.Vector2(.16 + .95 * Math.pow(u, 1.45), u)); }
  const g = new T.LatheGeometry(pts, 56);
  return g;
}

export function createVortexPool(T, parent) {
  const geo = funnelGeometry(T), disc = new T.PlaneGeometry(1, 1);
  const pool = [];
  const make = () => {
    const group = new T.Group();
    const shell = (spin, twist, strength) => new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, seed: { value: 0 }, sway: { value: .3 }, spin: { value: spin }, twist: { value: twist }, strength: { value: strength }, colA: { value: new T.Color() }, colB: { value: new T.Color() } },
      vertexShader: FUNNEL_VERT, fragmentShader: FUNNEL_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false,
    });
    const outer = new T.Mesh(geo, shell(1.6, 3.5, .5)), inner = new T.Mesh(geo, shell(3.2, 5.5, .75));
    inner.scale.set(.58, .96, .58);
    const discMat = (spin, strength, hole) => new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, seed: { value: 0 }, spin: { value: spin }, strength: { value: strength }, hole: { value: hole }, col: { value: new T.Color() } },
      vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
    });
    const foot = new T.Mesh(disc, discMat(3, .55, .08)); foot.rotation.x = -Math.PI / 2; foot.position.y = .04;
    const cap = new T.Mesh(disc, discMat(1.2, .35, .3)); cap.rotation.x = -Math.PI / 2;
    for (const m of [outer, inner, foot, cap]) { m.frustumCulled = false; group.add(m); }
    parent.add(group);
    return { group, outer, inner, foot, cap };
  };
  let used = 0;
  return {
    begin() { used = 0; },
    /** One vortex this frame. R: funnel radius at the mouth, H: height, colors: [foot, body, core] HDR rgb. */
    add({ x, z, R, H, seed, time, fade = 1, body, core, dust }) {
      if (used >= 16) return;
      const v = pool[used] ?? (pool[used] = make()); used++;
      v.group.visible = true; v.group.position.set(x, 0, z);
      v.outer.scale.set(R, H, R); v.inner.scale.set(R * .58, H * .96, R * .58);
      for (const [m, k] of [[v.outer, 1], [v.inner, 1]]) {
        const u = m.material.uniforms;
        u.time.value = time; u.seed.value = seed; u.sway.value = R * .18;
        u.colA.value.setRGB(...body); u.colB.value.setRGB(...core);
        u.strength.value = (m === v.inner ? 1.1 : .8) * fade * k;
      }
      v.foot.scale.set(R * 2.4, R * 2.4, 1);
      v.cap.scale.set(R * 2.8, R * 2.8, 1); v.cap.position.y = H * .86;
      for (const [m, c, s] of [[v.foot, dust, .9], [v.cap, body, .55]]) {
        const u = m.material.uniforms; u.time.value = time; u.seed.value = seed; u.col.value.setRGB(...c); u.strength.value = s * fade;
      }
    },
    end() { for (let i = used; i < pool.length; ++i) pool[i].group.visible = false; },
    dispose() { for (const v of pool) { v.group.removeFromParent(); for (const m of [v.outer, v.inner, v.foot, v.cap]) m.material.dispose(); } geo.dispose(); disc.dispose(); },
  };
}
