// Standalone presentation: Three.js is injected. No gameplay or site imports.
export const meta = Object.freeze({ id: 'element-explosion', name: '元素爆炸', category: '爆炸', duration: .9, elements: ['fire', 'frost', 'lightning', 'physical', 'poison', 'void'] });
const COLORS = [0xff6a19, 0x76dfff, 0xa7caff, 0xe8bd83, 0x84fa44, 0xab69ff];
export function createEffect(T, options = {}) {
  const group = new T.Group(); group.name = meta.id;
  const mat = (color, opacity = 1) => new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const haloMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { color: { value: new T.Color() }, age: { value: 0 }, mode: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv; uniform vec3 color; uniform float age,mode;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
        float edge=.24+min(1.,age*3.5)*.7;float bands=pow(max(0.,1.-abs(r-edge)*19.),2.);
        float rays=pow(max(0.,sin(a*17.+sin(a*7.)*2.-age*5.)),10.);
        float noise=hash(floor(p*38.+age*5.));
        float smoke=pow(max(0.,1.-r),2.)*(.4+noise*.6);
        float alpha=bands*.6+smoke;
        if(mode<.5)alpha=bands*(.7+rays)+smoke*(1.5+sin(a*11.+r*28.-age*12.)*.6);
        else if(mode<1.5){float crystal=pow(max(0.,cos(a*6.)),30.);alpha=bands*.6+crystal*(1.-r)*2.+pow(max(0.,cos(a*12.+r*16.)),25.)*.3;}
        else if(mode<2.5){float bolt=exp(-abs(r-edge-sin(a*21.+floor(age*30.))*.045)*95.);alpha=bolt*1.8+pow(max(0.,cos(a*12.+sin(r*24.))),50.)*(1.-r);}
        else if(mode<3.5)alpha=bands*.8+smoke*(.7+noise*.7);
        else if(mode<4.5)alpha=bands*.4+smoke*.5+pow(max(0.,sin(r*35.+sin(a*7.)*2.-age*9.)),10.)*(1.-r)*.5;
        else {float swirl=pow(max(0.,sin(a*5.+r*24.+age*11.)),14.);alpha=swirl*max(0.,1.-r)*1.3+exp(-abs(r-(.75-age*.5))*65.);}
        alpha*=exp(-age*3.4);
        gl_FragColor=vec4(color*2.,alpha*(1.-smoothstep(.88,1.02,r))); }` });
  const disc = new T.Mesh(new T.PlaneGeometry(2, 2), haloMat); disc.rotation.x = -Math.PI / 2; disc.position.y = .06; group.add(disc);
  const coreMat = mat(0xffffff), core = new T.Mesh(new T.IcosahedronGeometry(.28, 2), coreMat); core.position.y = .18; group.add(core);
  const ringMat = mat(0xffffff), ring = new T.Mesh(new T.TorusGeometry(1, .012, 4, 80), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = .08; group.add(ring);
  const debrisMat = mat(0xffffff), debris = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), debrisMat, 36); debris.frustumCulled = false; group.add(debris);
  const crystalMat = new T.MeshStandardMaterial({ color: 0x66c8ef, emissive: 0x12658c, emissiveIntensity: .6, metalness: .3, roughness: .18, transparent: true, opacity: .9 });
  const plumeMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { age: { value: 0 }, fade: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float age,fade;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}void main(){vec2 p=vUv*2.-1.;float turbulence=n(vUv*vec2(5.,8.)-vec2(0.,age*9.));float width=(1.-vUv.y)*.8+.05;float flame=1.-smoothstep(width*.4,width,abs(p.x+sin(p.y*5.-age*18.)*.12));flame*=1.-smoothstep(.15,1.,p.y+(turbulence-.5)*.6);flame*=smoothstep(-1.,-.7,p.y);vec3 color=mix(vec3(3.,1.6,.12),vec3(1.8,.09,.005),vUv.y);gl_FragColor=vec4(color,flame*fade*.6);}` });
  const plumes = new T.InstancedMesh(new T.PlaneGeometry(2, 2), plumeMat, 24); plumes.frustumCulled = false; plumes.count = 0; group.add(plumes);
  const vaporMat = mat(0x7dff44, .2), vapor = new T.InstancedMesh(new T.SphereGeometry(1, 12, 8), vaporMat, 16); vapor.frustumCulled = false; vapor.count = 0; group.add(vapor);
  const darkMat = new T.MeshBasicMaterial({ color: 0x030009, transparent: true, depthWrite: false, toneMapped: false });
  const darkCore = new T.Mesh(new T.SphereGeometry(.33, 24, 16), darkMat); darkCore.position.y = .32; group.add(darkCore);
  const arcMat = mat(0xe4f7ff), arcs = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 5), arcMat, 48); arcs.frustumCulled = false; arcs.count = 0; group.add(arcs);
  const positions = new Float32Array(84 * 3), sparkGeo = new T.BufferGeometry(); sparkGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
  const sparkMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { color: { value: new T.Color() }, fade: { value: 1 } }, vertexShader: 'void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(45./max(1.,-p.z),1.,13.);gl_Position=projectionMatrix*p;}',
    fragmentShader: 'uniform vec3 color;uniform float fade;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(color*2.5,pow(max(0.,1.-r),2.)*fade);}' });
  const sparks = new T.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; group.add(sparks);
  const matrix = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(), e = new T.Euler();
  const rand = i => { const v = Math.sin(i * 127.1 + 19.3) * 43758.5453; return v - Math.floor(v); };
  function update(age, data = {}) {
    const t = Math.max(0, age), el = typeof (data.element ?? options.element) === 'number' ? (data.element ?? options.element) : meta.elements.indexOf(data.element ?? options.element ?? 'fire');
    const element = el < 0 ? 0 : el, color = COLORS[element] ?? COLORS[0], life = data.duration ?? options.duration ?? meta.duration;
    group.visible = t < life;
    haloMat.uniforms.age.value = t; haloMat.uniforms.mode.value = element; haloMat.uniforms.color.value.setHex(color);
    ringMat.color.setHex(color).multiplyScalar(1.8); debrisMat.color.setHex(color).multiplyScalar(1.4); sparkMat.uniforms.color.value.setHex(color);
    coreMat.opacity = Math.exp(-t * 15); core.scale.setScalar(.4 + t * 4); coreMat.color.setHex(element === 5 ? 0x140022 : 0xfffbef);
    const expand = element === 5 ? Math.max(.05, 1 - t * .9) : Math.min(1, .16 + t * 2.6);
    ring.scale.setScalar(expand); ringMat.opacity = Math.exp(-t * 5); ring.rotation.z = t;
    darkCore.visible = element === 5; darkCore.scale.setScalar(Math.max(.01, 1 - t / life)); darkMat.opacity = Math.min(1, (life - t) * 4);
    plumes.count = element === 0 ? 24 : 0; plumeMat.uniforms.age.value = t; plumeMat.uniforms.fade.value = Math.pow(Math.max(0, 1 - t / life), 1.5);
    for (let i = 0; i < plumes.count; i++) {
      const a = Math.floor(i / 2) * 2.399963, reach = Math.min(.68, t * 2.4) * (.3 + rand(i >> 1) * .7), height = (.25 + rand((i >> 1) + 8) * .6) * Math.sin(Math.min(1, t / life) * Math.PI) + .12;
      p.set(Math.cos(a) * reach, height * .7, Math.sin(a) * reach); e.set(0, a + i % 2 * Math.PI / 2, Math.sin(a) * .2); q.setFromEuler(e); s.set(.16 + t * .1, height, 1); matrix.compose(p, q, s); plumes.setMatrixAt(i, matrix);
    } plumes.instanceMatrix.needsUpdate = true;
    vapor.count = element === 4 ? 16 : element === 3 ? 12 : 0; vaporMat.color.setHex(element === 4 ? 0x73dc2c : 0x987b55); vaporMat.opacity = Math.max(0, 1 - t / life) * .15;
    for (let i = 0; i < vapor.count; i++) {
      const a = i * 2.399963, reach = t * (.6 + rand(i) * .6); p.set(Math.cos(a) * reach, .12 + t * (element === 4 ? .5 : .14), Math.sin(a) * reach); q.identity(); s.setScalar((.07 + t * .45) * (.7 + rand(i + 5) * .5)); matrix.compose(p, q, s); vapor.setMatrixAt(i, matrix);
    } vapor.instanceMatrix.needsUpdate = true;
    arcs.count = element === 2 ? 48 : 0; arcMat.opacity = Math.exp(-t * 5);
    const up = new T.Vector3(0, 1, 0), aa = new T.Vector3(), bb = new T.Vector3(), direction = new T.Vector3();
    for (let i = 0; i < arcs.count; i++) {
      const ray = Math.floor(i / 4), j = i % 4, angle = ray * 2.399963, tick = Math.floor(t * 30), reach = Math.min(1, .25 + t * 3);
      const endpoint = (v, k) => { const r = k / 4 * reach, a = angle + Math.sin(k * 17 + ray * 11 + tick) * .12; v.set(Math.cos(a) * r, .08 + Math.sin(k * 2 + ray) * .035, Math.sin(a) * r); };
      endpoint(aa, j); endpoint(bb, j + 1); p.copy(aa).add(bb).multiplyScalar(.5); direction.copy(bb).sub(aa); const len = Math.max(.001, direction.length()); q.setFromUnitVectors(up, direction.normalize()); s.set(.009, len, .009); matrix.compose(p, q, s); arcs.setMatrixAt(i, matrix);
    } arcs.instanceMatrix.needsUpdate = true;
    debris.material = element === 1 ? crystalMat : debrisMat;
    debrisMat.opacity = Math.max(0, 1 - t / life); crystalMat.opacity = .9 * Math.max(0, 1 - Math.max(0, t - .35) / .55);
    for (let i = 0; i < 36; i++) {
      const a = i * 2.399963, speed = .4 + rand(i) * .8, reach = element === 5 ? (1 - Math.min(1, t / life)) * speed : element === 1 ? Math.min(1, t * 5) * speed * .72 : t * speed;
      p.set(Math.cos(a) * reach, Math.max(.025, t * (1 + rand(i + 40) * 2) - t * t * 2.5), Math.sin(a) * reach);
      e.set(t * 4 + i, a, t * 3); q.setFromEuler(e);
      const size = (element === 1 ? .07 + rand(i + 80) * .08 : .018 + rand(i + 80) * .055) * (1 - Math.min(1, t / life));
      if (element === 1) { p.y = .07 + size * 2; e.set(Math.cos(a) * .5, a, Math.sin(a) * .5); q.setFromEuler(e); }
      s.set(size, size * (element === 1 ? 4.2 : element === 4 ? 1 : 1.8), size); matrix.compose(p, q, s); debris.setMatrixAt(i, matrix);
    }
    debris.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 84; i++) {
      const a = i * 2.39996, reach = (element === 5 ? Math.max(0, .95 - t) : t) * (.3 + rand(i + 130) * 1.6);
      positions[i * 3] = Math.cos(a) * reach; positions[i * 3 + 2] = Math.sin(a) * reach;
      positions[i * 3 + 1] = Math.max(.03, t * (.5 + rand(i + 250) * 3) - t * t * 2);
    }
    sparkGeo.attributes.position.needsUpdate = true; sparkMat.uniforms.fade.value = Math.exp(-t * 3);
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; const geometries = new Set(), materials = new Set([debrisMat, crystalMat]); group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.clear(); }
  update(0); return { group, update, dispose };
}
