export const meta = Object.freeze({ id: 'projectile-void-bolt', name: '虚空彗弹', category: '投射物', duration: 1.6, continuous: true });
export function createBatch(T, capacity = 4096) {
  const group = new T.Group(); group.name = meta.id;
  const coreMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const shellMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .22, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, wireframe: true });
  const trailMat = new T.ShaderMaterial({ transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, uniforms: { clock: { value: 0 } },
    vertexShader: 'varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;\n#ifdef USE_INSTANCING_COLOR\nvColor=instanceColor;\n#else\nvColor=vec3(.7,.16,1.);\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;varying vec3 vColor;uniform float clock;void main(){float w=pow(max(0.,1.-abs(vUv.y-.5)*2.),1.5);float pulse=.6+.4*sin(vUv.x*30.-clock*14.);gl_FragColor=vec4(vColor*2.,w*vUv.x*pulse*.5);}' });
  const core = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), coreMat, capacity), shell = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), shellMat, capacity), trail = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-.5, 0, 0), trailMat, capacity);
  for (const mesh of [core, shell, trail]) { mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); }
  const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), color = new T.Color(), white = new T.Color(0xffffff);
  function update(rows, time = 0) {
    let n = 0; trailMat.uniforms.clock.value = time;
    for (const row of rows) {
      if (n >= capacity) break;
      p.set(row.x, row.y ?? .6, row.z); const r = Math.max(.12, row.radius ?? .25), yaw = -Math.atan2(row.dz ?? 0, row.dx ?? 1);
      e.set(time * 4 + n, yaw, time * 3); q.setFromEuler(e); s.set(r * .75, r * .75, r * .75); m.compose(p, q, s); core.setMatrixAt(n, m);
      s.multiplyScalar(1.8); m.compose(p, q, s); shell.setMatrixAt(n, m);
      e.set(0, yaw, 0); q.setFromEuler(e); s.set(1.5 + r, 1, r * 1.7); m.compose(p, q, s); trail.setMatrixAt(n, m);
      color.setHex([0xff782e, 0x73dcff, 0x9ecbff, 0xe7ca9b, 0x85e934, 0xba74ff][row.element ?? 5] ?? 0xba74ff); shell.setColorAt(n, color); trail.setColorAt(n, color); color.lerp(white, .6); core.setColorAt(n, color); n++;
    }
    for (const mesh of [core, shell, trail]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; for (const mesh of [core, shell, trail]) { mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); }
  return { group, update, dispose };
}
export function createEffect(T) { const batch = createBatch(T, 1); return { ...batch, update(age) { batch.update([{ x: Math.sin(age * 2) * 1.6, y: .8, z: 0, dx: 13, dz: 0, radius: .3 }], age); } }; }
