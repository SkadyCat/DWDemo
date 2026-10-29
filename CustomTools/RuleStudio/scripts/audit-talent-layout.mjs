import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULES_DIR } from './rule-files.mjs';
import { constellationEdgePolyline } from '../public/talents/layout.mjs';

const radius=n=>n.kind==='origin'?35:n.kind==='legendary'?(n.sourceBuild?30:26):13.5;
const pointDistance=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a,b,c,d){
  return cross(a,b,c)*cross(a,b,d)<-.001&&cross(c,d,a)*cross(c,d,b)<-.001;
}

export function auditTalentLayout(tree){
  const nodes=new Map(tree.nodes.map(n=>[n.id,n])),orbitMap=new Map(tree.layout.orbits.map(o=>[o.id,o]));
  const routes=new Map(Object.entries(tree.layout.edgeRoutes||{}));
  const edges=tree.edges.map(([a,b])=>({ids:[a,b],points:constellationEdgePolyline(nodes.get(a),nodes.get(b),orbitMap,routes)}));
  const segments=[],cells=new Map(),crossings=new Set(),obstructions=new Set(),overlaps=[];
  const cellSize=64;
  edges.forEach((edge,e)=>{
    for(let i=1;i<edge.points.length;i++){
      const a=edge.points[i-1],b=edge.points[i];
      if(Math.hypot(a.x-b.x,a.y-b.y)<.01)continue;
      const segment={a,b,e},index=segments.length;segments.push(segment);
      for(let x=Math.floor(Math.min(a.x,b.x)/cellSize);x<=Math.floor(Math.max(a.x,b.x)/cellSize);x++)
        for(let y=Math.floor(Math.min(a.y,b.y)/cellSize);y<=Math.floor(Math.max(a.y,b.y)/cellSize);y++){
          const k=x+','+y;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(index);
        }
    }
  });
  const checked=new Set();
  for(const indices of cells.values())for(let i=0;i<indices.length;i++)for(let j=i+1;j<indices.length;j++){
    const ai=indices[i],bi=indices[j],k=ai<bi?ai+':'+bi:bi+':'+ai;
    if(checked.has(k))continue;checked.add(k);
    const a=segments[ai],b=segments[bi];if(a.e===b.e)continue;
    const ea=edges[a.e],eb=edges[b.e];if(ea.ids.some(id=>eb.ids.includes(id)))continue;
    if(intersects(a.a,a.b,b.a,b.b))crossings.add([a.e,b.e].sort((a,b)=>a-b).map(i=>edges[i].ids.join(' / ')).join(' × '));
  }
  for(const node of tree.nodes){
    const indices=new Set(),r=radius(node);
    for(let x=Math.floor((node.x-r)/cellSize);x<=Math.floor((node.x+r)/cellSize);x++)
      for(let y=Math.floor((node.y-r)/cellSize);y<=Math.floor((node.y+r)/cellSize);y++)for(const i of cells.get(x+','+y)||[])indices.add(i);
    for(const i of indices){
      const segment=segments[i],edge=edges[segment.e];if(edge.ids.includes(node.id))continue;
      if(pointDistance(node,segment.a,segment.b)<r+.8)obstructions.add(node.id+' ← '+edge.ids.join(' / '));
    }
  }
  for(let i=0;i<tree.nodes.length;i++)for(let j=i+1;j<tree.nodes.length;j++){
    const a=tree.nodes[i],b=tree.nodes[j],gap=Math.hypot(a.x-b.x,a.y-b.y)-radius(a)-radius(b);
    if(gap<0)overlaps.push({a:a.id,b:b.id,gap});
  }
  return{crossings:[...crossings],obstructions:[...obstructions],overlaps,segments:segments.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const tree=JSON.parse(fs.readFileSync(path.join(RULES_DIR,'Talents/constellation.json'),'utf8'));
  const result=auditTalentLayout(tree);
  console.log(JSON.stringify({layout:tree.layout.id,counts:Object.fromEntries(['crossings','obstructions','overlaps'].map(k=>[k,result[k].length])),...result},null,2));
  if(result.crossings.length||result.obstructions.length||result.overlaps.length)process.exitCode=1;
}
