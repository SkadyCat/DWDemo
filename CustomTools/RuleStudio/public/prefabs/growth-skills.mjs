// Dedicated presentation for the growth builds (成长型 BD). Presentation only: every effect takes
// Three.js plus plain visual inputs (radius in metres, a style key, age in seconds).
//
// Look: thin luminous lines over soft additive glow, a bright white core fading into the skill's
// own colour, short life (.4–.9 s) and an ease-out so motion settles instead of popping.

const TAU = Math.PI * 2;
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const additive = (T, color, opacity = 1) => new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide });
const VERT = 'varying vec2 vUv;void main(){vUv=uv;vec4 p=vec4(position,1.);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p;}';
const groundPlane = T => { const g = new T.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; };
const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Skill palettes: [core, main, deep]. */
export const PALETTES = Object.freeze({
  cleave: [0xfff3dc, 0xffb04a, 0x9a3a10], flame: [0xffe6b0, 0xff6a24, 0x8a1a06], thunder: [0xf2f9ff, 0x6fb8ff, 0x1d3f9a],
  quake: [0xfff0d0, 0xe2a35a, 0x5a3418], blade: [0xffffff, 0xc9e4ff, 0x4f6f9a], bulwark: [0xfffbe8, 0xffd36a, 0x7a5414],
  reap: [0xf6ecff, 0xa874ff, 0x3a1470], meteor: [0xfff0c8, 0xff7a2a, 0x7a1c08], frost: [0xf4fdff, 0x8fe3ff, 0x2a6aa0],
  viper: [0xf4ffe0, 0x93ef4a, 0x1f5a12], storm: [0xf4f8ff, 0x8ab8ff, 0x2a3aa8], flicker: [0xffffff, 0x63f2e2, 0x0f6a78],
});
const palette = (T, key) => (PALETTES[key] || PALETTES.cleave).map(c => new T.Color(c));

// ------------------------------------------------------------------------------------------------
// 1. Crescent: a sweeping arc with a white-hot core, tapered tips and flying sparks.
const CRESCENT = {
  cleave: { span: 1.35, thick: .14, sparks: 26, rise: .2 },
  flame: { span: 1.9, thick: .16, sparks: 36, rise: .7 },
  whirl: { span: Math.PI, thick: .15, sparks: 40, rise: .6, spin: true, palette: 'flame' },
  thunder: { span: 1.15, thick: .1, sparks: 22, rise: .1, crackle: true },
  reap: { span: 2.5, thick: .19, sparks: 34, rise: 1.1 },
  flicker: { span: .42, thick: .06, sparks: 18, rise: .15, cross: true },
  bulwark: { span: 1.0, thick: .17, sparks: 18, rise: .1 },
};
export const crescent = {
  meta: Object.freeze({ id: 'gs-crescent', name: '弧光', category: '成长型 BD', duration: .62, styles: [['cleave', '怒焰劈斩'], ['flame', '烈焰余波'], ['whirl', '烈焰旋斩'], ['thunder', '雷击三连'], ['reap', '灵魂收割'], ['flicker', '闪现打击'], ['bulwark', '盾击']] }),
  createEffect(T) {
    const group = new T.Group(); group.name = 'gs-crescent';
    const uniforms = { clock: { value: 0 }, fade: { value: 1 }, span: { value: 1 }, thick: { value: .1 }, crackle: { value: 0 }, spin: { value: 0 },
      cCore: { value: new T.Color() }, cMain: { value: new T.Color() }, cDeep: { value: new T.Color() } };
    const material = new T.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, vertexShader: VERT,
      fragmentShader: `varying vec2 vUv;uniform float clock,fade,span,thick,crackle,spin;uniform vec3 cCore,cMain,cDeep;
      float h(float n){return fract(sin(n)*43758.5453);}
      void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
        float reveal=spin>.5?-3.1416+min(1.,clock*3.6)*6.2832:-span+min(1.,clock*6.)*2.*span;
        float u=clamp((a+span)/(2.*span),0.,1.);float inside=step(-span,a)*step(a,min(span,reveal));
        float taper=sin(u*3.1416);float band=thick*(.35+.65*taper);float rr=.78-.05*u;
        float d=abs(r-rr);float core=exp(-d*d/(band*band*.05));float glow=exp(-d/(band*1.4));
        float lead=exp(-abs(a-reveal)*7.)*step(a,reveal+.05);
        float streak=.75+.25*sin(r*90.+a*6.);
        float jag=1.;if(crackle>.5){float k=floor(a*18.+clock*40.);jag=.55+.9*step(.45,h(k))*exp(-abs(r-rr-(h(k+3.)-.5)*.08)*40.);}
        vec3 col=mix(cDeep,cMain,glow);col=mix(col,cCore,core);
        float alpha=(core*1.4+glow*.55*streak+lead*.9*glow)*inside*jag*taper;
        float inner=smoothstep(rr,rr*.55,r)*smoothstep(rr*.2,rr*.6,r)*.05*inside*taper;
        gl_FragColor=vec4(col*(1.6+lead),(alpha+inner)*fade);}` });
    const plane = groundPlane(T), arc = new T.Mesh(plane, material); arc.position.y = .9; group.add(arc);
    const twin = new T.Mesh(plane, material); twin.position.y = .95; twin.rotation.set(0, 0, 0); twin.visible = false; group.add(twin);
    const sparkMat = additive(T, 0xffffff), sparks = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), sparkMat, 40); sparks.frustumCulled = false; group.add(sparks);
    const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
    function update(age, data = {}) {
      const t = Math.max(0, age), style = CRESCENT[data.style] || CRESCENT.cleave, [core, main, deep] = palette(T, data.style);
      group.visible = t < crescent.meta.duration;
      const fade = Math.pow(Math.max(0, 1 - t / crescent.meta.duration), 1.4);
      Object.assign(uniforms.clock, { value: t }); uniforms.fade.value = fade; uniforms.span.value = style.spin ? Math.PI : style.span;
      uniforms.thick.value = style.thick; uniforms.crackle.value = style.crackle ? 1 : 0; uniforms.spin.value = style.spin ? 1 : 0;
      uniforms.cCore.value.copy(core); uniforms.cMain.value.copy(main); uniforms.cDeep.value.copy(deep);
      const radius = Math.max(.4, data.radius ?? 2), grow = .82 + .18 * easeOut(t * 5);
      arc.scale.set(radius * grow, 1, radius * grow); arc.rotation.y = style.spin ? t * 5 : 0;
      twin.visible = !!style.cross; arc.position.set(0, .9, 0);
      if (style.cross) {
        // X slash: two long, nearly straight strokes whose midpoints meet on the target.
        const k = radius * 2.4 * grow, mid = .78 * k;
        arc.scale.set(k, 1, k); twin.scale.set(k, 1, -k);
        for (const [mesh, angle] of [[arc, .8], [twin, -.8]]) { mesh.rotation.y = angle; mesh.position.set(-Math.cos(angle) * mid, .9, Math.sin(angle) * mid); }
      }
      sparkMat.color.copy(main).lerp(core, .4); sparkMat.opacity = fade;
      sparks.count = style.sparks;
      for (let i = 0; i < sparks.count; i++) {
        const u = hash(i + 1) * 2 - 1, a = style.spin ? hash(i + 7) * TAU : u * style.span, life = Math.min(1, t * (2.2 + hash(i + 3) * 2));
        const out = radius * (.78 + life * (.25 + hash(i + 5) * .35)), tangent = (hash(i + 9) - .5) * .6 * life;
        p.set(Math.cos(a) * out - Math.sin(a) * tangent, .9 + life * style.rise * (.5 + hash(i + 11)) - life * life * .5, -(Math.sin(a) * out + Math.cos(a) * tangent));
        e.set(t * 9 + i, a, i); q.setFromEuler(e); const size = .032 * (1 - life * .7) * (.6 + hash(i + 13));
        s.set(size, size * 2.4, size); m.compose(p, q, s); sparks.setMatrixAt(i, m);
      }
      sparks.instanceMatrix.needsUpdate = true;
    }
    let disposed = false;
    return { group, update, dispose() { if (disposed) return; disposed = true; plane.dispose(); material.dispose(); sparks.geometry.dispose(); sparkMat.dispose(); group.clear(); } };
  },
};

// ------------------------------------------------------------------------------------------------
// 2. Nova: an expanding ring wave with a soft fill, a delayed echo ring and per-style particles.
const NOVA = {
  cleave: { motes: 'ember' }, flame: { motes: 'ember' }, thunder: { motes: 'spark', crackle: true }, storm: { motes: 'spark', crackle: true },
  quake: { motes: 'rock' }, bulwark: { motes: 'spark', hex: true }, reap: { motes: 'wisp', swirl: true }, meteor: { motes: 'ember' },
  frost: { motes: 'shard' }, viper: { motes: 'wisp' }, flicker: { motes: 'spark', swirl: true }, blade: { motes: 'spark' },
};
export const nova = {
  meta: Object.freeze({ id: 'gs-nova', name: '冲击波', category: '成长型 BD', duration: .9, styles: [['cleave', '狂暴冲击'], ['thunder', '落雷余波'], ['storm', '雷暴'], ['quake', '余震'], ['bulwark', '不动如山'], ['reap', '灵魂风暴'], ['meteor', '余烬爆炸'], ['frost', '冰封新星'], ['viper', '毒爆'], ['flicker', '残影爆发']] }),
  createEffect(T) {
    const group = new T.Group(); group.name = 'gs-nova';
    const uniforms = { clock: { value: 0 }, fade: { value: 1 }, front: { value: 0 }, crackle: { value: 0 }, hex: { value: 0 }, swirl: { value: 0 },
      cCore: { value: new T.Color() }, cMain: { value: new T.Color() }, cDeep: { value: new T.Color() } };
    const material = new T.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, vertexShader: VERT,
      fragmentShader: `varying vec2 vUv;uniform float clock,fade,front,crackle,hex,swirl;uniform vec3 cCore,cMain,cDeep;
      float h(float n){return fract(sin(n)*43758.5453);}
      void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);if(r>1.)discard;
        float d=r-front;float ring=exp(-d*d*900.);float glow=exp(-abs(d)*16.)*.8;
        float echo=exp(-pow(r-front*.72,2.)*500.)*.35;
        float fill=smoothstep(front,0.,r)*.18;
        if(swirl>.5){fill*=.6+.4*sin(a*5.+r*14.-clock*9.);}
        if(hex>.5){vec2 q=p*7.;q.x*=1.1547;q.y+=mod(floor(q.x),2.)*.5;vec2 f=abs(fract(q)-.5);float e=max(f.x*1.5+f.y,f.y*2.);fill+=smoothstep(.95,1.,e)*.35*smoothstep(front,front*.4,r);}
        float jag=1.;if(crackle>.5){float k=floor(a*24.+clock*30.);jag=.6+.8*step(.5,h(k));}
        vec3 col=mix(cDeep,cMain,glow+fill);col=mix(col,cCore,ring);
        gl_FragColor=vec4(col*1.7,(ring*1.3*jag+glow*.45+echo+fill)*fade);}` });
    const plane = groundPlane(T), disc = new T.Mesh(plane, material); disc.position.y = .06; group.add(disc);
    const flash = new T.Mesh(new T.SphereGeometry(1, 20, 12), additive(T, 0xffffff)); group.add(flash);
    const moteMat = additive(T, 0xffffff), motes = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), moteMat, 48); motes.frustumCulled = false; group.add(motes);
    const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
    function update(age, data = {}) {
      const t = Math.max(0, age), style = NOVA[data.style] || NOVA.cleave, [core, main, deep] = palette(T, data.style), radius = Math.max(.5, data.radius ?? 3);
      group.visible = t < nova.meta.duration;
      const fade = Math.pow(Math.max(0, 1 - t / nova.meta.duration), 1.2), front = .08 + .9 * easeOut(t * 2.6);
      uniforms.clock.value = t; uniforms.fade.value = fade; uniforms.front.value = front;
      uniforms.crackle.value = style.crackle ? 1 : 0; uniforms.hex.value = style.hex ? 1 : 0; uniforms.swirl.value = style.swirl ? 1 : 0;
      uniforms.cCore.value.copy(core); uniforms.cMain.value.copy(main); uniforms.cDeep.value.copy(deep);
      disc.scale.set(radius, 1, radius);
      const pop = Math.exp(-t * 15); flash.material.color.copy(main).lerp(core, .5); flash.material.opacity = pop * .3;
      flash.scale.setScalar(radius * (.18 + .25 * easeOut(t * 6))); flash.position.y = .4;
      moteMat.color.copy(main).lerp(style.motes === 'rock' ? deep : core, .3); moteMat.opacity = fade * (style.motes === 'rock' ? .7 : 1);
      const n = style.motes === 'rock' ? 22 : 40; motes.count = n;
      for (let i = 0; i < n; i++) {
        const a = hash(i + 1) * TAU, out = radius * front * (.75 + hash(i + 2) * .3), life = Math.min(1, t * 1.6);
        let y = .1, size = .06 * (.6 + hash(i + 3)), sy = 1;
        switch (style.motes) {
          case 'ember': y = .15 + life * (.8 + hash(i + 4) * 1.6); size *= 1 - life * .6; break;
          case 'wisp': y = .2 + life * (1.2 + hash(i + 4) * 2); size *= .55 * (1 - life * .5); sy = 2.6; break;
          case 'rock': y = Math.max(.04, life * 2.6 * (.4 + hash(i + 4)) - life * life * 3.6); size *= 1.25 * (1 - life * .5); break;
          case 'shard': y = .05; size = .09 * (.8 + hash(i + 4)) * Math.min(1, t * 8) * (1 - Math.max(0, t - .5) * 2); sy = 4; break;
          default: y = .3 + life * hash(i + 4) * 1.2; size *= .8;
        }
        const turn = style.swirl ? t * 2.5 : 0;
        p.set(Math.cos(a + turn) * out, y, -Math.sin(a + turn) * out);
        e.set(style.motes === 'shard' ? (hash(i) - .5) * .6 : t * 6 + i, a, style.motes === 'shard' ? -.5 : i); q.setFromEuler(e);
        s.set(Math.max(.001, size), Math.max(.001, size * sy), Math.max(.001, size)); m.compose(p, q, s); motes.setMatrixAt(i, m);
      }
      motes.instanceMatrix.needsUpdate = true;
    }
    let disposed = false;
    return { group, update, dispose() { if (disposed) return; disposed = true; plane.dispose(); material.dispose(); flash.geometry.dispose(); flash.material.dispose(); motes.geometry.dispose(); moteMat.dispose(); group.clear(); } };
  },
};

// ------------------------------------------------------------------------------------------------
// 3. Quake: glowing radial fractures racing outward, a dust ring and tumbling stones.
export const quake = {
  meta: Object.freeze({ id: 'gs-quake', name: '成长·地裂', category: '成长型 BD', duration: .95 }),
  createEffect(T) {
    const group = new T.Group(); group.name = 'gs-quake';
    const uniforms = { clock: { value: 0 }, fade: { value: 1 }, seed: { value: 0 }, cCore: { value: new T.Color() }, cMain: { value: new T.Color() }, cDeep: { value: new T.Color() } };
    const material = new T.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, vertexShader: VERT,
      fragmentShader: `varying vec2 vUv;uniform float clock,fade,seed;uniform vec3 cCore,cMain,cDeep;
      float h(float n){return fract(sin(n+seed)*43758.5453);}
      void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);if(r>1.)discard;
        float reach=min(1.,clock*4.);float best=1.;
        for(int i=0;i<9;i++){float fi=float(i);float ang=fi*.698+h(fi)*.5;float bend=(h(fi+9.)-.5)*1.3*r+.07*sin(r*23.+fi*3.);
          float da=abs(mod(a-ang-bend+3.1416,6.2832)-3.1416)*r;float len=.55+h(fi+3.)*.45;
          best=min(best,da+step(min(len,reach),r));}
        float crack=exp(-best*170.)*smoothstep(.02,.12,r)*(1.-r*.5);float heat=exp(-best*30.)*.28*smoothstep(.0,.1,r);
        float pit=smoothstep(.35,.0,r)*.25;
        vec3 col=mix(cDeep,cMain,heat*2.);col=mix(col,cCore,crack);
        gl_FragColor=vec4(col*1.8,(crack*1.4+heat+pit)*fade);}` });
    const plane = groundPlane(T), disc = new T.Mesh(plane, material); disc.position.y = .05; group.add(disc);
    const dust = nova.createEffect(T); group.add(dust.group);
    function update(age, data = {}) {
      const t = Math.max(0, age), [core, main, deep] = palette(T, 'quake'), radius = Math.max(.5, data.radius ?? 3);
      group.visible = t < quake.meta.duration;
      uniforms.clock.value = t; uniforms.fade.value = Math.pow(Math.max(0, 1 - t / quake.meta.duration), 1.1); uniforms.seed.value = data.seed ?? 0;
      uniforms.cCore.value.copy(core); uniforms.cMain.value.copy(main); uniforms.cDeep.value.copy(deep);
      disc.scale.set(radius * 1.15, 1, radius * 1.15);
      dust.update(t * 1.1, { style: 'quake', radius });
    }
    let disposed = false;
    return { group, update, dispose() { if (disposed) return; disposed = true; plane.dispose(); material.dispose(); dust.dispose(); group.clear(); } };
  },
};

// ------------------------------------------------------------------------------------------------
// 4. Meteor: a burning stone falls on a slant, then a crater flash with a fire nova.
export const meteor = {
  meta: Object.freeze({ id: 'gs-meteor', name: '成长·陨星', category: '成长型 BD', duration: 1.15 }),
  createEffect(T) {
    const group = new T.Group(); group.name = 'gs-meteor';
    const FALL = .3;
    const rock = new T.Mesh(new T.IcosahedronGeometry(1, 1), new T.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })); group.add(rock);
    const halo = new T.Mesh(new T.SphereGeometry(1, 16, 12), additive(T, 0xff6a24, .22)); group.add(halo);
    const tailMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { fade: { value: 1 } }, vertexShader: VERT,
      fragmentShader: 'varying vec2 vUv;uniform float fade;void main(){float k=1.-vUv.y;vec3 c=mix(vec3(1.,.3,.05),vec3(1.,.92,.65),pow(k,3.));gl_FragColor=vec4(c*1.6,pow(k,1.8)*.45*fade);}' });
    const tail = new T.Mesh(new T.ConeGeometry(1, 1, 14, 1, true).translate(0, .5, 0), tailMat); group.add(tail);
    const impact = nova.createEffect(T); group.add(impact.group);
    const crack = quake.createEffect(T); group.add(crack.group);
    const from = new T.Vector3(), at = new T.Vector3(), dir = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    function update(age, data = {}) {
      const t = Math.max(0, age), radius = Math.max(.6, data.radius ?? 3);
      group.visible = t < meteor.meta.duration;
      from.set(-radius * 1.2, 5.5, radius * .5); at.set(0, .3, 0);
      const k = Math.min(1, t / FALL), falling = t < FALL;
      rock.visible = halo.visible = tail.visible = falling;
      if (falling) {
        const pos = from.clone().lerp(at, Math.pow(k, 1.6));
        const size = .14 + radius * .045;
        rock.position.copy(pos); rock.scale.setScalar(size); rock.rotation.set(t * 9, t * 7, 0);
        halo.position.copy(pos); halo.scale.setScalar(size * 1.7);
        dir.copy(from).sub(at).normalize(); tail.position.copy(pos); tail.quaternion.setFromUnitVectors(up, dir);
        tail.scale.set(size * 1.1, 2.6 + k * 1.5, size * 1.1); tailMat.uniforms.fade.value = 1;
      }
      impact.group.visible = crack.group.visible = !falling;
      if (!falling) { impact.update(t - FALL, { style: 'meteor', radius: radius * 1.1 }); crack.update(t - FALL, { radius: radius * .8, seed: 3 }); }
    }
    let disposed = false;
    return { group, update, dispose() { if (disposed) return; disposed = true; for (const o of [rock, halo, tail]) { o.geometry.dispose(); o.material.dispose(); } impact.dispose(); crack.dispose(); group.clear(); } };
  },
};

// ------------------------------------------------------------------------------------------------
// 5. Blink: a razor streak from the departure point to the target with three fading afterimages.
export const blink = {
  meta: Object.freeze({ id: 'gs-blink', name: '成长·闪现残影', category: '成长型 BD', duration: .55 }),
  createEffect(T) {
    const group = new T.Group(); group.name = 'gs-blink';
    const uniforms = { clock: { value: 0 }, fade: { value: 1 } };
    const material = new T.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, vertexShader: VERT,
      fragmentShader: `varying vec2 vUv;uniform float clock,fade;void main(){float y=abs(vUv.y-.5)*2.;
        float head=smoothstep(0.,1.,vUv.x);float w=.15+.85*head;float core=exp(-y*y/(w*w*.01));float glow=exp(-y/(w*.45));
        float wipe=smoothstep(clock*3.2-.25,clock*3.2,vUv.x);
        vec3 c=mix(vec3(.06,.42,.48),vec3(.39,.95,.89),glow);c=mix(c,vec3(1.),core);
        gl_FragColor=vec4(c*1.8,(core*1.2+glow*.5)*head*wipe*fade);}` });
    const ribbon = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(.5, 0, 0), material); ribbon.position.y = .95; group.add(ribbon);
    const moteMat = additive(T, 0x9ff8ee), motes = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), moteMat, 24); motes.frustumCulled = false; group.add(motes);
    const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
    function update(age, data = {}) {
      const t = Math.max(0, age), length = Math.max(.5, data.length ?? 4);
      group.visible = t < blink.meta.duration;
      const fade = Math.pow(Math.max(0, 1 - t / blink.meta.duration), 1.3);
      uniforms.clock.value = t; uniforms.fade.value = fade;
      ribbon.scale.set(length, 1, 1.6);
      moteMat.opacity = fade;
      for (let i = 0; i < 24; i++) {
        const u = hash(i + 1), drift = t * (.6 + hash(i + 2));
        p.set(length * u, .95 + (hash(i + 3) - .5) * .5 + drift * .6, (hash(i + 4) - .5) * .6 + (hash(i + 5) - .5) * drift);
        q.identity(); const size = .03 * (1 - t / blink.meta.duration) * (.5 + hash(i + 6)); s.set(size, size * 2.2, size); m.compose(p, q, s); motes.setMatrixAt(i, m);
      }
      motes.instanceMatrix.needsUpdate = true;
    }
    let disposed = false;
    return { group, update, dispose() { if (disposed) return; disposed = true; ribbon.geometry.dispose(); material.dispose(); motes.geometry.dispose(); moteMat.dispose(); group.clear(); } };
  },
};

// ------------------------------------------------------------------------------------------------
// Projectile batches: rows of {x,y,z,dx,dz,radius,age,visualSeed} in metres.
function projectileBatch(meta, build) {
  return {
    meta,
    createBatch(T, capacity = 1024) { return build(T, capacity); },
    createEffect(T) { const b = build(T, 1); return { ...b, update(age) { b.update([{ x: Math.sin(age) * 1.6, y: .8, z: 0, dx: 8, dz: 0, radius: .5, age, visualSeed: 3 }], age); } }; },
  };
}
const instanced = (T, geometry, material, capacity) => { const mesh = new T.InstancedMesh(geometry, material, capacity); mesh.count = 0; mesh.frustumCulled = false; return mesh; };

export const ballLightning = projectileBatch(Object.freeze({ id: 'projectile-ball-lightning', name: '球状闪电', category: '投射物', continuous: true, duration: 2 }), (T, capacity) => {
  const group = new T.Group();
  const core = instanced(T, new T.SphereGeometry(1, 18, 12), new T.MeshBasicMaterial({ color: 0xf2f8ff, toneMapped: false }), capacity);
  const halo = instanced(T, new T.SphereGeometry(1, 18, 12), additive(T, 0x5f9cff, .28), capacity);
  const arcs = instanced(T, new T.CylinderGeometry(1, 1, 1, 4), additive(T, 0xb9dcff, .9), capacity * 6);
  group.add(core, halo, arcs);
  const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), up = new T.Vector3(0, 1, 0), d = new T.Vector3();
  function update(rows, time = 0) {
    let n = 0, k = 0;
    for (const row of rows) {
      if (n >= capacity) break;
      const r = Math.max(.25, row.radius ?? .6), seed = row.visualSeed ?? n, pulse = 1 + .12 * Math.sin(time * 31 + seed);
      p.set(row.x, row.y ?? .9, row.z); q.identity();
      s.setScalar(r * .32 * pulse); m.compose(p, q, s); core.setMatrixAt(n, m);
      s.setScalar(r * .85 * pulse); m.compose(p, q, s); halo.setMatrixAt(n, m);
      const tick = Math.floor(time * 24 + seed);
      for (let i = 0; i < 6 && k < capacity * 6; i++, k++) {
        const th = hash(tick * 7 + i + seed) * TAU, ph = hash(tick * 13 + i) * Math.PI - Math.PI / 2, len = r * (.7 + hash(tick + i * 3) * .6);
        a.copy(p); b.set(p.x + Math.cos(th) * Math.cos(ph) * len, p.y + Math.sin(ph) * len, p.z + Math.sin(th) * Math.cos(ph) * len);
        d.copy(b).sub(a); const l = d.length(); q.setFromUnitVectors(up, d.normalize()); s.set(.018, l, .018);
        m.compose(a.add(b).multiplyScalar(.5), q, s); arcs.setMatrixAt(k, m);
      }
      n++;
    }
    core.count = halo.count = n; arcs.count = k;
    for (const mesh of [core, halo, arcs]) mesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update, dispose() { for (const mesh of [core, halo, arcs]) { mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); } };
});

const knifeLike = (meta, { color, glow, length, width, spin }) => projectileBatch(meta, (T, capacity) => {
  const group = new T.Group();
  // Spinning blades are a flat crescent; thrown knives a slim double-edged spike.
  const shape = () => spin ? new T.TorusGeometry(1, .09, 3, 20, Math.PI * 1.15).rotateX(Math.PI / 2) : new T.OctahedronGeometry(1, 0);
  const blade = instanced(T, shape(), new T.MeshBasicMaterial({ color, toneMapped: false }), capacity);
  const aura = instanced(T, shape(), additive(T, glow, .22), capacity);
  const trailMat = new T.ShaderMaterial({ transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, uniforms: { tint: { value: new T.Color(glow) } }, vertexShader: VERT,
    fragmentShader: 'varying vec2 vUv;uniform vec3 tint;void main(){float w=pow(max(0.,1.-abs(vUv.y-.5)*2.),2.);gl_FragColor=vec4(tint*1.8,w*pow(vUv.x,2.)*.55);}' });
  const trail = instanced(T, new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-.5, 0, 0), trailMat, capacity);
  group.add(trail, aura, blade);
  const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
  function update(rows, time = 0) {
    let n = 0;
    for (const row of rows) {
      if (n >= capacity) break;
      const yaw = -Math.atan2(row.dz ?? 0, row.dx ?? 1), r = Math.max(.2, row.radius ?? .3);
      p.set(row.x, row.y ?? .9, row.z);
      if (spin) { e.set(.18, time * 13 + (row.visualSeed ?? n), 0, 'YXZ'); q.setFromEuler(e); s.set(r * length * .5, r * .5, r * length * .5); }
      else { e.set(0, yaw, Math.PI / 4, 'YXZ'); q.setFromEuler(e); s.set(r * length, r * width, r * width); }
      m.compose(p, q, s); blade.setMatrixAt(n, m);
      s.multiplyScalar(spin ? 1.08 : 1.9); m.compose(p, q, s); aura.setMatrixAt(n, m);
      e.set(0, yaw, 0); q.setFromEuler(e); s.set(1.1 + r * 2, 1, r * .9); m.compose(p, q, s); trail.setMatrixAt(n, m);
      n++;
    }
    for (const mesh of [blade, aura, trail]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
  }
  return { group, update, dispose() { for (const mesh of [blade, aura, trail]) { mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); } };
});
export const viperKnife = knifeLike(Object.freeze({ id: 'projectile-viper-knife', name: '蝰蛇飞刃', category: '投射物', continuous: true, duration: 1 }), { color: 0xeaffd2, glow: 0x7ee83c, length: 2.2, width: .2 });
export const danceBlade = knifeLike(Object.freeze({ id: 'projectile-dance-blade', name: '刃舞飞刃', category: '投射物', continuous: true, duration: 2 }), { color: 0xf4f9ff, glow: 0x9cc8ff, length: 2.2, width: .6, spin: true });

/** Fissure: stone spikes breaking out of the ground along the path, over a hot crack. */
export const fissure = projectileBatch(Object.freeze({ id: 'projectile-fissure', name: '地裂', category: '投射物', continuous: true, duration: 1 }), (T, capacity) => {
  const group = new T.Group(), SPIKES = 3;
  const stone = instanced(T, new T.ConeGeometry(1, 1, 5).translate(0, .5, 0), new T.MeshStandardMaterial({ color: 0x6e5238, roughness: .9, flatShading: true }), capacity * SPIKES);
  const ember = instanced(T, new T.ConeGeometry(1, 1, 5).translate(0, .5, 0), additive(T, 0xff9a3c, .35), capacity * SPIKES);
  const crackMat = new T.ShaderMaterial({ transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, vertexShader: VERT,
    fragmentShader: 'varying vec2 vUv;void main(){float y=abs(vUv.y-.5)*2.;float zig=abs(y-.25*sin(vUv.x*40.));float w=exp(-zig*zig*60.);gl_FragColor=vec4(vec3(1.,.55,.18)*2.,w*pow(vUv.x,1.4)*.8);}' });
  const crack = instanced(T, new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-.5, 0, 0), crackMat, capacity);
  group.add(crack, stone, ember);
  const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
  function update(rows, time = 0) {
    let n = 0, k = 0;
    for (const row of rows) {
      if (n >= capacity) break;
      const yaw = -Math.atan2(row.dz ?? 0, row.dx ?? 1), r = Math.max(.3, row.radius ?? .6), seed = row.visualSeed ?? n, fx = Math.cos(yaw), fz = -Math.sin(yaw);
      for (let i = 0; i < SPIKES; i++, k++) {
        const back = i * r * .55, side = (hash(seed + i * 3) - .5) * r * .7, grow = Math.max(0, 1 - i * .3);
        p.set(row.x - fx * back - fz * side, 0, row.z - fz * back + fx * side);
        e.set((hash(seed + i) - .5) * .5, hash(seed + i * 7) * TAU, (hash(seed + i * 5) - .5) * .5); q.setFromEuler(e);
        s.set(r * .32 * grow, r * (1.1 + hash(seed + i * 11)) * grow, r * .32 * grow); m.compose(p, q, s); stone.setMatrixAt(k, m);
        s.multiplyScalar(1.15); m.compose(p, q, s); ember.setMatrixAt(k, m);
      }
      e.set(0, yaw, 0); q.setFromEuler(e); p.set(row.x, .03, row.z); s.set(2.6 + r * 2, 1, r * .55); m.compose(p, q, s); crack.setMatrixAt(n, m);
      n++;
    }
    crack.count = n; stone.count = ember.count = k;
    for (const mesh of [crack, stone, ember]) mesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update, dispose() { for (const mesh of [crack, stone, ember]) { mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); } };
});

// ------------------------------------------------------------------------------------------------
// Hero aura: a fine ring at the feet with one pip per charge stack; during the surge, the ring
// brightens, turns, and thin light ribbons climb around the hero.
export const heroAura = {
  meta: Object.freeze({ id: 'gs-hero-aura', name: '成长·蓄势光环', category: '成长型 BD', continuous: true, duration: 2 }),
  createBatch(T) {
    const group = new T.Group(); group.name = 'gs-hero-aura';
    const uniforms = { clock: { value: 0 }, stacks: { value: 0 }, max: { value: 10 }, surge: { value: 0 }, stage: { value: 0 }, cCore: { value: new T.Color() }, cMain: { value: new T.Color() } };
    const material = new T.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, vertexShader: VERT,
      fragmentShader: `varying vec2 vUv;uniform float clock,stacks,max,surge,stage;uniform vec3 cCore,cMain;
      void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x)+clock*(.3+surge*2.);if(r>1.)discard;
        float ring=exp(-pow(r-.86,2.)*2600.)*(.35+.65*surge+.15*stage);
        float slot=6.2832/max;float idx=floor(mod(a+3.1416,6.2832)/slot);float u=fract(mod(a+3.1416,6.2832)/slot);
        float pip=exp(-pow(r-.74,2.)*1800.)*smoothstep(.5,.2,abs(u-.5))*step(idx,stacks-.5);
        float halo=exp(-pow(r-.8,2.)*90.)*surge*(.5+.5*sin(clock*6.));
        vec3 col=mix(cMain,cCore,pip+ring*.5);
        gl_FragColor=vec4(col*1.6,ring+pip*1.2+halo*.4);}` });
    const disc = new T.Mesh(groundPlane(T), material); disc.position.y = .04; group.add(disc);
    const ribbonMat = additive(T, 0xffffff, .5), ribbons = new T.InstancedMesh(new T.PlaneGeometry(.05, 1), ribbonMat, 12); ribbons.frustumCulled = false; group.add(ribbons);
    const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
    group.visible = false;
    function update(row, time = 0) {
      group.visible = !!row;
      if (!row) return;
      const [core, main] = palette(T, row.style);
      group.position.set(row.x, 0, row.z);
      uniforms.clock.value = time; uniforms.stacks.value = row.stacks; uniforms.max.value = Math.max(1, row.max);
      uniforms.surge.value = row.surge ? 1 : 0; uniforms.stage.value = row.stage || 0; uniforms.cCore.value.copy(core); uniforms.cMain.value.copy(main);
      disc.scale.set(1.15, 1, 1.15);
      ribbonMat.color.copy(main).lerp(core, .3);
      ribbons.count = row.surge ? 12 : 0;
      for (let i = 0; i < ribbons.count; i++) {
        const a = i / 12 * TAU + time * 1.4, u = (time * .9 + hash(i)) % 1;
        p.set(Math.cos(a) * .95, .2 + u * 2.1, -Math.sin(a) * .95); e.set(0, -a + Math.PI / 2, 0); q.setFromEuler(e);
        s.set(1, .5 + hash(i + 5) * .7, 1).multiplyScalar(Math.sin(u * Math.PI)); m.compose(p, q, s); ribbons.setMatrixAt(i, m);
      }
      ribbons.instanceMatrix.needsUpdate = true; ribbonMat.opacity = .55;
    }
    return { group, update, dispose() { disc.geometry.dispose(); material.dispose(); ribbons.geometry.dispose(); ribbonMat.dispose(); group.clear(); } };
  },
  createEffect(T) { const b = heroAura.createBatch(T); return { ...b, update(age) { b.update({ x: 0, z: 0, style: 'reap', stacks: Math.floor(age * 4) % 11, max: 10, surge: age % 4 > 2, stage: 1 }, age); } }; },
};

export const GROWTH_PREFABS = [crescent, nova, quake, meteor, blink, ballLightning, viperKnife, danceBlade, fissure, heroAura];
