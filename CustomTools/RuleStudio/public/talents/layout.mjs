// Authored atlas geometry and travel connections. Trait payloads and node costs stay intact.
import { ATLAS } from './atlas-data.mjs';
const key=(a,b)=>[a,b].sort().join(':');
export function scatterConstellation(tree){
  const ids=new Set(tree.nodes.map(n=>n.id));
  if(ids.size!==Object.keys(ATLAS.positions).length||Object.keys(ATLAS.positions).some(id=>!ids.has(id)))throw Error('星盘节点与布局不一致，需要重新生成整体布局。');
  for(const n of tree.nodes){Object.assign(n,ATLAS.positions[n.id]);if(ATLAS.nodeSectors[n.id])n.sector=ATLAS.nodeSectors[n.id];}
  const nodes=new Map(tree.nodes.map(n=>[n.id,n]));
  for(const cluster of ATLAS.clusters)for(const id of cluster.members)nodes.get(id).orbit=cluster.id;
  for(const sector of tree.sectors){
    const members=tree.nodes.filter(n=>n.sector===sector.id);
    sector.x=Math.round(members.reduce((sum,n)=>sum+n.x,0)/members.length)||0;
    sector.y=Math.round(members.reduce((sum,n)=>sum+n.y,0)/members.length)||0;
    sector.angle=Math.atan2(sector.y,sector.x)*180/Math.PI;
  }
  const{positions,nodeSectors,edges,revision,...layout}=ATLAS;
  tree.edges=structuredClone(edges);
  tree.revision=revision;
  tree.layout=structuredClone(layout);
  return tree;
}
export function constellationEdgePolyline(a,b,orbitMap,routes){
  const route=routes?.get(key(a.id,b.id));
  return route?(route.from===a.id?route.points:[...route.points].reverse()):[a,b];
}
export function constellationEdgePath(a,b,orbitMap,routes){
  const route=routes?.get(key(a.id,b.id));
  if(route?.path)return route.path;
  return constellationEdgePolyline(a,b,orbitMap,routes).map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join('');
}
