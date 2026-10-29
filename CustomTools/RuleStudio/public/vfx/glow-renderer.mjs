// Small VFX-only glow pass. Leaves the normal scene/camera/materials intact.
export function createGlowRenderer(T, renderer) {
  const a = new T.WebGLRenderTarget(1, 1), b = new T.WebGLRenderTarget(1, 1);
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new T.Scene();
  const material = new T.ShaderMaterial({ depthTest: false, depthWrite: false, transparent: false,
    uniforms: { image: { value: null }, stepSize: { value: new T.Vector2() } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform sampler2D image;uniform vec2 stepSize;void main(){vec4 c=texture2D(image,vUv)*.227027;c+=(texture2D(image,vUv+stepSize*1.384615)+texture2D(image,vUv-stepSize*1.384615))*.316216;c+=(texture2D(image,vUv+stepSize*3.230769)+texture2D(image,vUv-stepSize*3.230769))*.070270;gl_FragColor=vec4(c.rgb*.92,1.);}' });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), material); scene.add(quad);
  const size = new T.Vector2();
  let width = 0, height = 0, disposed = false;
  function render(world, view, effectGroup) {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.ceil(size.x / 3)), h = Math.max(1, Math.ceil(size.y / 3));
    if (w !== width || h !== height) { width = w; height = h; a.setSize(w, h); b.setSize(w, h); }
    effectGroup.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) o.layers.enable(1); });
    const background = world.background, layers = view.layers.mask, clear = renderer.autoClear, shadow = renderer.shadowMap.autoUpdate, target = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new T.Color()), clearAlpha = renderer.getClearAlpha();
    try {
      world.background = null; view.layers.set(1); renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0, 0); renderer.autoClear = true; renderer.setRenderTarget(a); renderer.render(world, view);
      material.uniforms.image.value = a.texture; material.uniforms.stepSize.value.set(1 / w, 0); renderer.setRenderTarget(b); renderer.render(scene, camera);
      world.background = background; view.layers.mask = layers; renderer.shadowMap.autoUpdate = shadow; renderer.setClearColor(clearColor, clearAlpha); renderer.setRenderTarget(target); renderer.render(world, view);
      renderer.autoClear = false; material.uniforms.image.value = b.texture; material.uniforms.stepSize.value.set(0, 1 / h);
      material.transparent = true; material.blending = T.AdditiveBlending; renderer.render(scene, camera);
      material.transparent = false; material.blending = T.NormalBlending;
    } finally {
      world.background = background; view.layers.mask = layers; renderer.shadowMap.autoUpdate = shadow;
      renderer.autoClear = clear; renderer.setClearColor(clearColor, clearAlpha); renderer.setRenderTarget(target);
    }
  }
  function dispose() { if (disposed) return; disposed = true; a.dispose(); b.dispose(); material.dispose(); quad.geometry.dispose(); }
  return { render, dispose };
}
