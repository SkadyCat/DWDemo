export const meta = Object.freeze({ id: 'summon-spirit', name: '灵仆', category: '召唤物', continuous: true, duration: 3 });
export function createEffect(T) {
  const group = new T.Group(); group.name = meta.id;
  const coreMat = new T.MeshBasicMaterial({ color: 0xcbf8ff, toneMapped: false });
  const glowMat = new T.MeshBasicMaterial({ color: 0x669aff, transparent: true, opacity: .15, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, side: T.DoubleSide });
  const core = new T.Mesh(new T.IcosahedronGeometry(.19, 1), coreMat), shell = new T.Mesh(new T.SphereGeometry(.36, 18, 12), glowMat);
  const ribbonMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { clock: { value: 0 } }, vertexShader: 'varying vec2 vUv;uniform float clock;void main(){vUv=uv;vec3 p=position;p.x+=sin(p.y*8.+clock*4.)*.09;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}', fragmentShader: 'varying vec2 vUv;void main(){float a=pow(max(0.,1.-abs(vUv.x-.5)*2.),2.)*sin(vUv.y*3.14159);gl_FragColor=vec4(.3,.8,2.,a*.55);}' });
  const ribbon = new T.Mesh(new T.PlaneGeometry(.5, 1.1, 2, 16), ribbonMat); ribbon.position.y = -.5;
  const orbit = new T.Mesh(new T.TorusGeometry(.45, .012, 5, 48), glowMat); orbit.rotation.x = .7;
  const eyes = new T.Mesh(new T.BoxGeometry(.2, .035, .035), coreMat); eyes.position.set(0, .025, .2);
  const body = new T.Group(); body.add(core, shell, ribbon, orbit, eyes); group.add(body);
  function update(age, data = {}) {
    group.visible = data.visible !== false; body.position.y = .95 + Math.sin(age * 3) * .12;
    core.rotation.set(age, age * 1.4, 0); shell.scale.set(1, 1.2 + Math.sin(age * 4) * .1, 1);
    orbit.rotation.z = age; ribbon.rotation.y = age * .6; ribbonMat.uniforms.clock.value = age;
    const flash = Math.max(0, 1 - (data.shotAge ?? 1) / .18); glowMat.opacity = .15 + flash * .25;
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; const g = new Set(), m = new Set(); group.traverse(o => { if (o.geometry) g.add(o.geometry); if (o.material) m.add(o.material); }); g.forEach(o => o.dispose()); m.forEach(o => o.dispose()); group.clear(); }
  update(0); return { group, update, dispose };
}
