// Isolated presentation prefab. The adapter owns world position; this only animates wind.
export const meta = Object.freeze({ id: 'whirlwind', name: '游走旋风', category: '投射物', duration: 8, continuous: true });
const tints = { 0: [0xff6b25, 0xffd27a], 1: [0x368edb, 0xa7f3ff], 2: [0x7650df, 0xd4b1ff], 4: [0x388e20, 0xb5ff54] };
export function createEffect(T, options = {}) {
  const group = new T.Group(); group.name = meta.id;
  const uniforms = { clock: { value: 0 }, fade: { value: 1 }, baseTint: { value: new T.Color() }, brightTint: { value: new T.Color() } };
  const windMaterial = new T.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
    side: T.DoubleSide, blending: T.AdditiveBlending,
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float clock,fade;uniform vec3 baseTint,brightTint;
      void main(){float h=vUv.y,a=vUv.x*6.2831853;
        float spiral=pow(max(0.,sin(a*3.-h*24.+clock*9.)),10.);
        float mist=.12+.12*sin(a*7.+h*31.-clock*5.);
        float edge=smoothstep(0.,.12,h)*(1.-smoothstep(.72,1.,h));
        float breaks=.45+.55*pow(.5+.5*sin(a*5.+h*14.+clock*3.),2.);
        gl_FragColor=vec4(mix(baseTint,brightTint,spiral)*1.5,(spiral*.65+mist)*edge*breaks*fade);}` });
  const funnelGeometry = new T.CylinderGeometry(1, .12, 3.4, 40, 16, true);
  const funnel = new T.Mesh(funnelGeometry, windMaterial); funnel.position.y = 1.8; group.add(funnel);
  const dustMaterial = new T.MeshBasicMaterial({ color: 0xa2d5de, transparent: true, opacity: .5,
    depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
  const dustGeometry = new T.OctahedronGeometry(1);
  const dust = new T.InstancedMesh(dustGeometry, dustMaterial, 32); dust.frustumCulled = false; group.add(dust);
  const matrix = new T.Matrix4(), position = new T.Vector3(), scale = new T.Vector3(), rotation = new T.Quaternion();
  let lastTint = undefined;
  function update(age, data = {}) {
    const t = Math.max(0, age), radius = Math.max(.01, data.radius ?? options.radius ?? 1.4);
    const persistent = data.persistent ?? options.persistent ?? true;
    group.visible = persistent || t < meta.duration;
    const tint = data.groundTint ?? options.groundTint ?? null;
    if (tint !== lastTint) {
      lastTint = tint; group.userData.groundTint = tint;
      if (tints[tint]) { uniforms.baseTint.value.setHex(tints[tint][0]); uniforms.brightTint.value.setHex(tints[tint][1]); dustMaterial.color.setHex(tints[tint][1]); }
      else { uniforms.baseTint.value.setRGB(.23, .48, .57); uniforms.brightTint.value.setRGB(.7, .93, 1); dustMaterial.color.setHex(0xa2d5de); }
    }
    // Fade follows a live zone's remaining time when supplied, independent of damage ticks.
    uniforms.fade.value = Math.min(1, t * 6, data.life == null ? 1 : Math.max(0, (data.life - (t - (data.delay || 0))) * 4));
    uniforms.clock.value = t; funnel.scale.set(radius, 1, radius);
    dustMaterial.opacity = .6 * uniforms.fade.value;
    for (let i = 0; i < 32; i++) {
      const h = (i / 32 + t * .32) % 1, a = i * 2.399963 + t * (7 - h * 2), r = radius * (.14 + h * .78);
      position.set(Math.cos(a) * r, .1 + h * 3.25, Math.sin(a) * r);
      const size = (.025 + (i % 4) * .009) * (1 - h * .7); scale.set(size, size * .5, size * 2.8);
      rotation.setFromAxisAngle(T.Object3D.DEFAULT_UP, -a); matrix.compose(position, rotation, scale); dust.setMatrixAt(i, matrix);
    }
    dust.instanceMatrix.needsUpdate = true;
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; funnelGeometry.dispose(); windMaterial.dispose(); dustGeometry.dispose(); dustMaterial.dispose(); group.clear(); }
  update(0); return { group, update, dispose };
}
