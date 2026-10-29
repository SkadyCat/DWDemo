// Web battle adapter for the same self-skill sheet capabilities used by UE AS.
// The existing rule VM applies/expires the status and its carried traits.
import { computeSheet } from '../../engine/character.mjs';
export class SelfSkills {
  constructor(battle) {
    this.battle=battle;
    const r=battle.combat,w=battle.host.world;
    const motion=w.motionHook,immune=w.invulnerableHook,damage=r.heroDamage.bind(r),cooldown=r.cooldownFor.bind(r);
    w.motionHook=(index,dt)=>{
      const movement=motion?.(index,dt);
      this.motion(index);
      return movement;
    };
    w.invulnerableHook=id=>(id===battle.heroTargetId&&this.stat('defense.damage_immunity')>0)||!!immune?.(id);
    r.heroDamage=hit=>this.stat('defense.damage_immunity')>0?{taken:0,shieldLost:0,lifeLost:0}:damage(hit);
    r.cooldownFor=(plan=r.hero.plan)=>Math.max(cooldown(plan),r.planSheetStat(plan,'skill.independent_cooldown'));
  }
  stat(path) {
    const b=this.battle,w=b.host.world,key=w.clock+'|'+b.selected+'|'+w.grantedTraits(b.heroTargetId).join(',');
    if(key!==this.sheetKey){
      const base=b.skills?.[b.selected]?.sheetEntries||b.defenseSheetEntries||[];
      this.sheet=computeSheet([...base,...b.host.heldSources(b.heroTargetId).map(source=>({source}))]);this.sheetKey=key;
    }
    return b.character.dead?0:this.sheet.stats.get(path)||0;
  }
  motion(index) {
    if(this.stat('projectile.hostile_attraction')<=0)return;
    const b=this.battle,w=b.host.world,c=w.carriers,root=w.roots[c.root[index]],owner=root&&w.owners[root.owner],hero=w.owners[b.hero.owner];
    if(!owner||!hero||owner.team===hero.team)return;
    const dx=b.hero.x/100-c.px[index],dy=b.hero.y/100-c.py[index],length=Math.hypot(dx,dy),speed=Math.hypot(c.vx[index],c.vy[index]);
    if(length>1e-6&&speed>0){c.vx[index]=dx/length*speed;c.vy[index]=dy/length*speed;}
  }
}
