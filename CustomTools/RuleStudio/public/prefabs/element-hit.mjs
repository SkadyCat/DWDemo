export const meta = Object.freeze({ id: 'element-hit', name: '元素命中', category: '命中', duration: .4, elements: ['fire', 'frost', 'lightning', 'physical', 'poison', 'void'] });
export function createEffect(T, options = {}) {
  const group = new T.Group(); group.name = meta.id;
  const material = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const shards = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), material, 18); shards.frustumCulled = false; group.add(shards);
  const haloMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { color: { value: new T.Color() }, fade: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform vec3 color;uniform float fade;void main(){float r=length(vUv-.5)*2.;float glow=pow(max(0.,1.-r),3.);gl_FragColor=vec4(color*3.,glow*fade);}' });
  const halo = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), haloMat); halo.rotation.x = -Math.PI / 2; halo.position.y = .08; group.add(halo);
  const m = new T.Matrix4(), p = new T.Vector3(), s = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler();
  function update(age, data = {}) {
    const t = Math.max(0, age), life = meta.duration, el = data.element ?? options.element ?? 1;
    const idx = typeof el === 'number' ? el : meta.elements.indexOf(el), color = [0xff7c30, 0xa3efff, 0xc9e9ff, 0xffd9a3, 0x99f252, 0xc18aff][idx] ?? 0xffffff;
    group.visible = t < life; material.color.setHex(color).multiplyScalar(2); material.opacity = (1 - Math.min(1, t / life));
    haloMat.uniforms.color.value.setHex(color); haloMat.uniforms.fade.value = Math.exp(-t * 13); halo.scale.setScalar(.2 + t * 3.5);
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399963, reach = t * (1.2 + (i % 5) * .24);
      p.set(Math.cos(a) * reach, .15 + Math.sin(i * 13) ** 2 * t * 2.4 - t * t * 2, Math.sin(a) * reach);
      e.set(i + t * 4, a, a); q.setFromEuler(e); const size = .025 * Math.max(0, 1 - t / life);
      s.set(size, size * (idx === 1 ? 3.5 : 1.8), size); m.compose(p, q, s); shards.setMatrixAt(i, m);
    } shards.instanceMatrix.needsUpdate = true;
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; shards.geometry.dispose(); halo.geometry.dispose(); material.dispose(); haloMat.dispose(); group.clear(); }
  update(0); return { group, update, dispose };
}
