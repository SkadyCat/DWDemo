import * as THREE from '/vendor/three.module.js';
export function createDungeonPortal(){
  const group=new THREE.Group(),rings=[];
  const material=new THREE.MeshBasicMaterial({color:0x73e4d3,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  for(const [inner,outer,y] of [[1.1,1.2,.04],[1.45,1.5,.045],[.88,.94,.05]]){
    const ring=new THREE.Mesh(new THREE.RingGeometry(inner,outer,64),material.clone());ring.rotation.x=-Math.PI/2;ring.position.y=y;group.add(ring);rings.push(ring);
  }
  const runes=new THREE.Group();
  for(let i=0;i<8;i++){const stone=new THREE.Mesh(new THREE.OctahedronGeometry(.12),material.clone());stone.position.set(Math.cos(i*Math.PI/4)*1.32,.18,Math.sin(i*Math.PI/4)*1.32);runes.add(stone);}
  group.add(runes);group.visible=false;
  return{group,update(portal,time){group.visible=!!portal;if(!portal)return;group.position.set(portal.x*.01,0,-portal.y*.01);runes.rotation.y=time*.15;runes.position.y=.07+Math.sin(time*2)*.05;for(const [i,ring]of rings.entries())ring.material.opacity=.5+Math.sin(time*2+i)*.2;},dispose(){group.removeFromParent();group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});material.dispose();}};
}
