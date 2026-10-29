// Incoming projectile interception and a real cubic Bezier return, independent of skill IDs/VFX.
import { INDEX_NONE, EEndReason, ELEMENT_NAMES, KeepInherited, tagBit, hashName } from '../types.mjs';
import { readTraitText, newBuild } from '../reader.mjs';
import { sourcesKey, withHeld } from '../library.mjs';
import { offenseSource } from '../character.mjs';

export function bezierPoint(points, t) {
  const u=1-t, weights=[u*u*u,3*u*u*t,3*u*t*t,t*t*t];
  return Object.fromEntries(['x','y','z'].map(axis=>[axis,points.reduce((v,p,i)=>v+(p[axis]||0)*weights[i],0)]));
}

export class ProjectileCapture {
  constructor(R) { this.R=R; this.plans=new Map(); this.captured=0; }
  intercept(index,target,contact) {
    const R=this.R,w=R.world,c=w.carriers,old=w.roots[c.root[index]];
    if(w.targets.externalId[target]!==R.arena.heroTargetId||R.isHeroRoot(old))return false;
    const traits=R.t('projectile_capture');
    if(!traits.length)return false;
    const spec=traits.reduce((a,b)=>a.params.chance>=b.params.chance?a:b);
    if(!R.chance(spec.params.chance))return false;
    const plan=w.plans[old.plan],attacker=R.monsterOfOwner(old.owner),owner=w.owners[old.owner];
    const length=Math.hypot(c.vx[index],c.vy[index])||1,dx=c.vx[index]/length,dy=c.vy[index]/length;
    const back=w.config.FixedStep*(1-contact.time),sweep=contact.sweep;
    const origin=sweep?{x:sweep.sx+sweep.dx*contact.time,y:sweep.sy+sweep.dy*contact.time,z:sweep.sz+sweep.dz*contact.time}
      :{x:c.px[index]-c.vx[index]*back,y:c.py[index]-c.vy[index]*back,z:c.pz[index]-c.vz[index]*back};
    const to={x:attacker?attacker.x/100:owner.px,y:attacker?attacker.y/100:owner.py,z:owner.pz};
    const tags=plan.tagNames.names.filter((name,i)=>name!=='summon'&&((c.tags[index]&KeepInherited)&tagBit(i))!==0n);
    if(!tags.includes(ELEMENT_NAMES[c.element[index]]))tags.push(ELEMENT_NAMES[c.element[index]]);
    const shape={kind:plan.kindNames.names[c.kind[index]]||'captured_bolt',element:ELEMENT_NAMES[c.element[index]],tags,
      speed:Math.round(length*1000)/1000,lifetime:Math.round(c.life[index]*1000)/1000,radius:Math.round(c.radius[index]*1000)/1000,damage:{event:'amount'}};
    const parent=R.host.planSources.get(R.heroPlan());
    const supports=(R.hero.plan>=0 ? parent?.traits||[] : R.arena.defense||[]).filter(src=>src.id!==parent?.activeId)
      .map(src=>src.rules.some(rule=>rule.event==='cast') ? {...src,rules:src.rules.filter(rule=>rule.event!=='cast')} : src);
    const key=JSON.stringify(shape)+'|'+sourcesKey(supports);
    let base=this.plans.get(key);
    if(base===undefined){
      // The native plan hash identifies traits by id/params. Different incoming shapes need distinct ids.
      const active=readTraitText(JSON.stringify({id:`__captured_${hashName(JSON.stringify(shape)).toString(16)}`,rules:[{id:'return',event:'cast',actions:[{op:'emit',...shape}]}]}));
      if(active.error)throw Error(active.error);
      const compiled=R.host.compileSource(newBuild(active.trait.id,withHeld([active.trait],supports)));
      if(compiled.error)throw Error(compiled.error);
      if(this.plans.size>=256)this.plans.delete(this.plans.keys().next().value);
      this.plans.set(key,base=compiled.plan);
    }
    const captured={origin,to,dx,dy,power:c.damage[index],bend:Math.max(.1,spec.params.bend)};
    const root=R.host.castBuild(base,R.hero.owner,{x:origin.x*100,y:origin.y*100,z:origin.z*100},{x:dx,y:dy,z:0},captured.power,
      p=>[offenseSource(R.c.offense(),p.stats),R.planSource(p,{projectileOnly:true})].filter(Boolean),null,{manual:false});
    if(root===INDEX_NONE)return false;
    R.register(root,{kind:'cast',manual:false,capture:captured});
    R.projectiles.onCast(root,w.roots[root].plan);
    w.endProjectile(index,EEndReason.Capacity,true);
    ++this.captured;
    w.trace?.('projectile_captured',{x:origin.x,y:origin.y,owner:R.hero.owner,sourceOwner:old.owner});
    return true;
  }
  initialize(index,state) {
    const c=this.R.world.carriers,spec=this.R.rootInfo(c.root[index])?.capture;
    if(!spec)return;
    const speed=Math.hypot(c.vx[index],c.vy[index])||1,dx=c.vx[index]/speed,dy=c.vy[index]/speed;
    const start={x:c.px[index],y:c.py[index],z:c.pz[index]},end={...spec.to},side=state.side||1;
    const points=[start,{x:start.x+dx*spec.bend,y:start.y+dy*spec.bend,z:start.z},
      {x:end.x-dy*spec.bend*side,y:end.y+dx*spec.bend*side,z:end.z},end];
    let distance=0,last=start;
    for(let i=1;i<=24;i++){const p=bezierPoint(points,i/24);distance+=Math.hypot(p.x-last.x,p.y-last.y,p.z-last.z);last=p;}
    state.captureCurve={points,distance:Math.max(.01,distance),travel:0};
  }
  motion(index,state,dt) {
    const c=this.R.world.carriers,curve=state.captureCurve;
    let speed=state.speed0;
    if(this.R.s('proj.accel'))speed*=1+this.R.s('proj.accel')/100*state.age;
    if(this.R.s('proj.decel'))speed=Math.max(state.speed0*.2,speed*(1-.4*state.age));
    curve.travel+=speed*dt;
    const point=bezierPoint(curve.points,Math.min(1,curve.travel/curve.distance));
    const dx=point.x-c.px[index],dy=point.y-c.py[index],n=Math.hypot(dx,dy)||1;
    c.vx[index]=dx/n*speed;c.vy[index]=dy/n*speed;
    state.distance+=Math.hypot(dx,dy);
    if(curve.travel>=curve.distance)state.captureCurve=null;
    return {position:point};
  }
}
