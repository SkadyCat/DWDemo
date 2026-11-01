// 后期：整幅画面先画进 HDR（半浮点、4× MSAA）缓冲，然后
//   泛光（阈值 → 6 级降采样 / 升采样的柔和光晕）
//   冲击波折射（最多 12 个屏幕空间涟漪）
//   色差（大爆炸时一闪）· 暗角 · ACES 色调映射 · sRGB
// 一次合成到屏幕。只读场景，不改材质。
const FULL_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

const PREFILTER = /* glsl */`
uniform sampler2D src; uniform float threshold, knee; varying vec2 vUv;
void main(){
  vec3 c = texture2D(src, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  if (!(br < 60000.) || !(br >= 0.)) { gl_FragColor = vec4(0.); return; } // NaN / Inf never reaches the blur
  float soft = clamp(br - threshold + knee, 0., 2. * knee); soft = soft * soft / (4. * knee + 1e-4);
  float w = max(soft, br - threshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.);
}`;
// 13-tap downsample (CoD: AW), keeps fireflies under control.
const DOWN = /* glsl */`
uniform sampler2D src; uniform vec2 texel; varying vec2 vUv;
void main(){
  vec2 t = texel;
  vec3 a = texture2D(src, vUv + t * vec2(-2, 2)).rgb, b = texture2D(src, vUv + t * vec2(0, 2)).rgb, c = texture2D(src, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture2D(src, vUv + t * vec2(-2, 0)).rgb, e = texture2D(src, vUv).rgb, f = texture2D(src, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture2D(src, vUv + t * vec2(-2, -2)).rgb, h = texture2D(src, vUv + t * vec2(0, -2)).rgb, i = texture2D(src, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture2D(src, vUv + t * vec2(-1, 1)).rgb, k = texture2D(src, vUv + t * vec2(1, 1)).rgb, l = texture2D(src, vUv + t * vec2(-1, -1)).rgb, m = texture2D(src, vUv + t * vec2(1, -1)).rgb;
  vec3 o = e * .125 + (a + c + g + i) * .03125 + (b + d + f + h) * .0625 + (j + k + l + m) * .125;
  gl_FragColor = vec4(o, 1.);
}`;
// 9-tap tent upsample, added onto the next larger level.
const UP = /* glsl */`
uniform sampler2D src; uniform vec2 texel; uniform float radius; varying vec2 vUv;
void main(){
  vec2 t = texel * radius;
  vec3 s = texture2D(src, vUv + t * vec2(-1, 1)).rgb + texture2D(src, vUv + t * vec2(0, 1)).rgb * 2. + texture2D(src, vUv + t * vec2(1, 1)).rgb
         + texture2D(src, vUv + t * vec2(-1, 0)).rgb * 2. + texture2D(src, vUv).rgb * 4. + texture2D(src, vUv + t * vec2(1, 0)).rgb * 2.
         + texture2D(src, vUv + t * vec2(-1, -1)).rgb + texture2D(src, vUv + t * vec2(0, -1)).rgb * 2. + texture2D(src, vUv + t * vec2(1, -1)).rgb;
  gl_FragColor = vec4(s / 16., 1.);
}`;
const COMPOSITE = /* glsl */`
#define RIPPLES 12
uniform sampler2D scene, bloom; uniform float bloomStrength, aberration, vignette, exposure, flash; uniform vec3 flashColor;
uniform vec4 ripples[RIPPLES]; uniform float aspect; varying vec2 vUv;
void main(){
  vec2 uv = vUv, off = vec2(0.);
  for (int i = 0; i < RIPPLES; ++i) {
    vec4 r = ripples[i]; if (r.w <= 0.) continue;
    vec2 d = uv - r.xy; d.x *= aspect; float dist = length(d);
    float band = (dist - r.z) / .045; float w = exp(-band * band);
    off += (dist > 1e-4 ? d / dist : vec2(0.)) * w * r.w * vec2(1. / aspect, 1.);
  }
  uv -= off;
  vec2 ca = (uv - .5) * aberration;
  vec3 c = vec3(texture2D(scene, uv + ca).r, texture2D(scene, uv).g, texture2D(scene, uv - ca).b);
  vec3 bl = texture2D(bloom, uv).rgb; if (!(dot(bl, vec3(1.)) < 1e5)) bl = vec3(0.);
  if (!(dot(c, vec3(1.)) < 1e5)) c = vec3(0.);
  c += bl * bloomStrength;
  c += flashColor * flash;
  c *= exposure;
  vec2 v = vUv - .5; c *= 1. - dot(v, v) * vignette;
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createPost(T, renderer) {
  const LEVELS = 6;
  const opts = { type: T.HalfFloatType, depthBuffer: true, colorSpace: T.LinearSRGBColorSpace };
  // Retina screens already have 4× the pixels: 2× MSAA is enough there.
  const sceneRT = new T.WebGLRenderTarget(1, 1, { ...opts, samples: renderer.getPixelRatio() > 1.2 ? 2 : 4 });
  const pre = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false });
  const downs = Array.from({ length: LEVELS }, () => new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false }));
  const ups = Array.from({ length: LEVELS - 1 }, () => new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false }));
  for (const rt of [pre, ...downs, ...ups]) { rt.texture.minFilter = rt.texture.magFilter = T.LinearFilter; }
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new T.Mesh(new T.PlaneGeometry(2, 2)), fsScene = new T.Scene(); fsScene.add(quad);
  const mat = (frag, uniforms, extra = {}) => new T.ShaderMaterial({ vertexShader: FULL_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
  const preMat = mat(PREFILTER, { src: { value: null }, threshold: { value: 1.15 }, knee: { value: .5 } });
  const downMat = mat(DOWN, { src: { value: null }, texel: { value: new T.Vector2() } });
  const upMat = mat(UP, { src: { value: null }, texel: { value: new T.Vector2() }, radius: { value: 1 } });
  const addMat = mat('uniform sampler2D src; uniform float k; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(src, vUv).rgb * k, 1.); }', { src: { value: null }, k: { value: 1 } },
    { transparent: true, blending: T.AdditiveBlending });
  const ripples = Array.from({ length: 12 }, () => new T.Vector4());
  const compMat = mat(COMPOSITE, {
    scene: { value: sceneRT.texture }, bloom: { value: null }, bloomStrength: { value: .7 }, aberration: { value: 0 }, vignette: { value: 1.1 }, exposure: { value: 1 },
    flash: { value: 0 }, flashColor: { value: new T.Color(1, .8, .6) }, ripples: { value: ripples }, aspect: { value: 1 },
  });
  compMat.toneMapped = true;
  const size = new T.Vector2();
  let w = 0, h = 0;
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(fsScene, camera); };

  function resize() {
    renderer.getDrawingBufferSize(size);
    if (size.x === w && size.y === h) return;
    w = size.x; h = size.y;
    sceneRT.setSize(w, h);
    let lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    pre.setSize(lw, lh);
    for (let i = 0; i < LEVELS; ++i) { lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); downs[i].setSize(lw, lh); if (i < LEVELS - 1) ups[i].setSize(lw, lh); }
    compMat.uniforms.aspect.value = w / Math.max(1, h);
  }

  /**
   * fx: { ripples:[{x,y (0..1 screen uv, y up), radius (uv), strength}], aberration, flash, flashColor, bloom }
   */
  function render(scene, cam, fx = {}) {
    resize();
    const prev = renderer.getRenderTarget(), tm = renderer.toneMapping;
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, cam);
    // bloom chain
    preMat.uniforms.src.value = sceneRT.texture; pass(preMat, pre);
    let src = pre;
    for (let i = 0; i < LEVELS; ++i) { downMat.uniforms.src.value = src.texture; downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height); pass(downMat, downs[i]); src = downs[i]; }
    // upsample: ups[i] = tent(prev level) + downs[i]
    let low = downs[LEVELS - 1];
    for (let i = LEVELS - 2; i >= 0; --i) {
      upMat.uniforms.src.value = low.texture; upMat.uniforms.texel.value.set(1 / low.width, 1 / low.height); pass(upMat, ups[i]);
      renderer.autoClear = false; addMat.uniforms.src.value = downs[i].texture; addMat.uniforms.k.value = 1; pass(addMat, ups[i]); renderer.autoClear = true;
      low = ups[i];
    }
    // composite
    const u = compMat.uniforms;
    u.bloom.value = ups[0].texture; u.bloomStrength.value = fx.bloom ?? .7; u.aberration.value = fx.aberration ?? 0; u.flash.value = fx.flash ?? 0;
    if (fx.flashColor) u.flashColor.value.setRGB(...fx.flashColor);
    const list = fx.ripples ?? [];
    for (let i = 0; i < ripples.length; ++i) { const r = list[i]; if (r) ripples[i].set(r.x, r.y, r.radius, r.strength); else ripples[i].set(0, 0, 0, 0); }
    renderer.toneMapping = tm;
    pass(compMat, prev);
  }
  function dispose() { for (const rt of [sceneRT, pre, ...downs, ...ups]) rt.dispose(); for (const m of [preMat, downMat, upMat, addMat, compMat]) m.dispose(); quad.geometry.dispose(); }
  return { render, dispose, get size() { return { w, h }; } };
}
