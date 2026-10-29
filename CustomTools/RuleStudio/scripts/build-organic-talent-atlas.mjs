import fs from 'node:fs';
import { auditTalentLayout } from './audit-talent-layout.mjs';
const tree=JSON.parse(fs.readFileSync('../../Content/Rules/Talents/constellation.json','utf8'));
const TAU=Math.PI*2,key=(a,b)=>[a,b].sort().join(':'),norm=a=>(a%TAU+TAU)%TAU,delta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const noise=text=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return((h^(h>>>16))>>>0)/4294967295;};
const polar=(r,a)=>({x:Math.cos(a)*r,y:Math.sin(a)*r}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const round=p=>({x:Math.round(p.x*100)/100||0,y:Math.round(p.y*100)/100||0});
const radius=n=>n.kind==='legendary'?(n.sourceBuild?30:26):n.kind==='origin'?35:13.5;
const nodes=new Map(tree.nodes.map(n=>[n.id,{...n}]));
function pointDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}

// One hundred independent local clusters, rather than twenty hub-and-five-arm flowers.
const centers=Array.from({length:100},(_,i)=>{
 const p=polar(Math.sqrt(190*190+i*28000),i*2.399963229728653+noise('phase'+i)*.12);
 return{x:p.x*1.04+(noise('jx'+i)-.5)*35,y:p.y*.98+(noise('jy'+i)-.5)*35,radius:68+Math.round(noise('radius'+i)*18)};
});
for(const p of centers){
 const x=p.x,y=p.y;
 for(const[cx,cy,dx,dy,s]of[[-900,-700,-110,40,550],[900,-200,90,100,500],[500,900,-80,100,500],[-900,700,-40,-90,500]]){
  const w=Math.exp(-((x-cx)**2+(y-cy)**2)/(2*s*s));p.x+=dx*w;p.y+=dy*w;
 }
}
for(let pass=0;pass<900;pass++){
 let overlap=0;
 for(let i=0;i<100;i++){
  const a=centers[i];
  for(let j=i+1;j<100;j++){
   const b=centers[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),push=a.radius+b.radius+112-d;
   if(push>0){a.x-=dx/d*push*.5;a.y-=dy/d*push*.5;b.x+=dx/d*push*.5;b.y+=dy/d*push*.5;overlap=Math.max(overlap,push);}
  }
  const d=Math.hypot(a.x,a.y),push=a.radius+35+55-d;
  if(push>0){a.x+=a.x/d*push;a.y+=a.y/d*push;overlap=Math.max(overlap,push);}
 }
 if(overlap<.001)break;
}
function hilbert(x,y){
 let d=0;
 for(let s=16;s>0;s>>=1){const rx=(x&s)?1:0,ry=(y&s)?1:0;d+=s*s*((3*rx)^ry);if(!ry){if(rx){x=31-x;y=31-y;}[x,y]=[y,x];}}
 return d;
}
const minX=Math.min(...centers.map(p=>p.x)),maxX=Math.max(...centers.map(p=>p.x)),minY=Math.min(...centers.map(p=>p.y)),maxY=Math.max(...centers.map(p=>p.y));
centers.sort((a,b)=>hilbert(Math.round((a.x-minX)/(maxX-minX)*31),Math.round((a.y-minY)/(maxY-minY)*31))-hilbert(Math.round((b.x-minX)/(maxX-minX)*31),Math.round((b.y-minY)/(maxY-minY)*31)));
tree.sectors.forEach((s,i)=>s.legends.forEach((id,j)=>Object.assign(centers[i*5+j],{id,sector:s.id,index:j,neighbors:[]})));
const sites=[{x:0,y:0,id:tree.root,radius:0,root:true,neighbors:[]},...centers];
Object.assign(nodes.get(tree.root),{x:0,y:0});

// Bowyer-Watson triangulation supplies planar candidate corridors.
const ps=[...sites,{x:-100000,y:-100000},{x:100000,y:-100000},{x:0,y:100000}];
function triangle(a,b,c){
 const p=ps[a],q=ps[b],r=ps[c],d=2*(p.x*(q.y-r.y)+q.x*(r.y-p.y)+r.x*(p.y-q.y));
 if(Math.abs(d)<1e-9)return null;
 const pp=p.x*p.x+p.y*p.y,qq=q.x*q.x+q.y*q.y,rr=r.x*r.x+r.y*r.y;
 const x=(pp*(q.y-r.y)+qq*(r.y-p.y)+rr*(p.y-q.y))/d,y=(pp*(r.x-q.x)+qq*(p.x-r.x)+rr*(q.x-p.x))/d;
 return{vertices:[a,b,c],x,y,r2:(p.x-x)**2+(p.y-y)**2};
}
let triangles=[triangle(sites.length,sites.length+1,sites.length+2)];
for(let i=0;i<sites.length;i++){
 const bad=new Set(),boundary=new Map();
 triangles.forEach((t,j)=>{if((ps[i].x-t.x)**2+(ps[i].y-t.y)**2<t.r2+1e-7){bad.add(j);for(let k=0;k<3;k++){const a=t.vertices[k],b=t.vertices[(k+1)%3],e=key(a,b);if(boundary.has(e))boundary.delete(e);else boundary.set(e,[a,b]);}}});
 triangles=triangles.filter((_,j)=>!bad.has(j));
 for(const[a,b]of boundary.values()){const t=triangle(a,b,i);if(t)triangles.push(t);}
}
triangles=triangles.filter(t=>t.vertices.every(i=>i<sites.length));
const candidateMap=new Map();
for(const t of triangles)for(let i=0;i<3;i++){
 const a=t.vertices[i],b=t.vertices[(i+1)%3],k=key(a,b);
 if(candidateMap.has(k))continue;
 const p=sites[a],q=sites[b];
 // Keep unrelated circular clusters and their icon margins out of the corridor.
 if(sites.some((s,j)=>j!==a&&j!==b&&pointDistance(s,p,q)<(s.root?60:s.radius+58)))continue;
 const middle={x:(p.x+q.x)/2,y:(p.y+q.y)/2},length=distance(p,q);
 const gabriel=!sites.some((s,j)=>j!==a&&j!==b&&distance(s,middle)<length/2-1e-6);
 candidateMap.set(k,{a,b,length,gabriel,outer:Math.hypot(p.x,p.y)>1250&&Math.hypot(q.x,q.y)>1250});
}
const candidates=[...candidateMap.values()].sort((a,b)=>a.length-b.length),parent=sites.map((_,i)=>i);
const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
const selected=[],chosen=new Set();
function connect(e){selected.push(e);chosen.add(key(e.a,e.b));sites[e.a].neighbors.push(e.b);sites[e.b].neighbors.push(e.a);}
for(const e of candidates)if(find(e.a)!==find(e.b)){parent[find(e.a)]=find(e.b);connect(e);}
if(selected.length!==100)throw Error('星图的可用平面通道未完全连通。');
const extras=candidates.filter(e=>!chosen.has(key(e.a,e.b))&&e.gabriel).sort((a,b)=>(a.length+(a.outer?250:0))-(b.length+(b.outer?250:0)));
for(const e of extras){
 if(selected.length>=155)break;
 if(sites[e.a].neighbors.length>=(sites[e.a].root?3:4)||sites[e.b].neighbors.length>=(sites[e.b].root?3:4))continue;
 connect(e);
}

const edges=[],edgeRoutes={},clusters=[],orbits=[];
function put(from,to,points,path){
 const pp=points.map(round);pp[0]=round(nodes.get(from));pp[pp.length-1]=round(nodes.get(to));
 edges.push([from,to]);edgeRoutes[key(from,to)]={from,to,points:pp,path};
}
function circularPoints(c,r,start,span,count){return Array.from({length:count+1},(_,i)=>{const p=polar(r,start+span*i/count);return{x:c.x+p.x,y:c.y+p.y};});}
function combination(n,k,start=0,prefix=[],out=[]){if(!k)out.push(prefix);else for(let i=start;i<=n-k;i++)combination(n,k-1,i+1,[...prefix,i],out);return out;}
function localCurve(site,port,heading){
 const start=Math.atan2(port.y-site.y,port.x-site.x),change=delta(start,heading);
 return Array.from({length:21},(_,i)=>{const t=i/20,p=polar(site.radius+44*Math.sin(t*Math.PI/2),start+change*t*t);return{x:site.x+p.x,y:site.y+p.y};});
}
for(let si=1;si<sites.length;si++){
 const site=sites[si],headings=site.neighbors.map(other=>({other,angle:norm(Math.atan2(sites[other].y-site.y,sites[other].x-site.x))})).sort((a,b)=>a.angle-b.angle);
 let gap=-1,legendAngle=0;
 headings.forEach((h,i)=>{const next=headings[(i+1)%headings.length].angle+(i===headings.length-1?TAU:0),d=next-h.angle;if(d>gap){gap=d;legendAngle=h.angle+d/2;}});
 const closed=noise(site.id+'closed')>.35,span=closed?TAU*7/8:(300+noise(site.id+'opening')*25)*Math.PI/180;
 const ids=[...Array.from({length:7},(_,j)=>`${site.sector}_arm_${site.index+1}_${j+1}`),site.id];
 let best;
 for(const turn of[0,5,-5,10,-10,15,-15]){
  const rotation=legendAngle-span+turn*Math.PI/180;
  const members=ids.map((id,j)=>{const p=polar(site.radius,rotation+span*j/7);return{...nodes.get(id),x:site.x+p.x,y:site.y+p.y,angle:norm(rotation+span*j/7)};});
  const ports=members.slice(0,7).sort((a,b)=>a.angle-b.angle);
  for(const subset of combination(7,headings.length))for(let shift=0;shift<headings.length;shift++){
   let score=0,valid=true;const assigned=[];
   for(let j=0;j<headings.length;j++){
    const port=ports[subset[(j+shift)%headings.length]],h=headings[j],d=delta(port.angle,h.angle);
    if(Math.abs(d)>Math.PI*.56){valid=false;break;}
    const points=localCurve(site,port,h.angle);
    for(let k=1;k<points.length&&valid;k++)if(members.some(n=>n.id!==port.id&&pointDistance(n,points[k-1],points[k])<radius(n)+3))valid=false;
    if(!valid)break;
    score+=d*d;assigned.push({other:h.other,port:port.id,points});
   }
   if(valid&&(!best||score<best.score))best={score,members,assigned,rotation};
  }
 }
 if(!best)throw Error('星簇端口无法避开图标：'+site.id);
 best.members.forEach(n=>Object.assign(nodes.get(n.id),round(n),{orbit:site.id}));
 site.ports=new Map(best.assigned.map(a=>[a.other,a]));
 for(let j=0;j<(closed?8:7);j++){
  const from=ids[j],to=ids[(j+1)%8],start=best.rotation+span*j/7;
  const sweep=j===7?TAU-span:span/7,points=circularPoints(site,site.radius,start,sweep,16),a=round(nodes.get(from)),b=round(nodes.get(to));
  put(from,to,points,`M${a.x} ${a.y}A${site.radius} ${site.radius} 0 0 1 ${b.x} ${b.y}`);
 }
 clusters.push({id:site.id,sector:site.sector,index:site.index,members:ids});
 orbits.push({id:site.id,sector:site.sector,index:site.index,...round(site),radius:site.radius,start:best.rotation*180/Math.PI,span:closed?360:span*180/Math.PI,closed,members:ids});
}

const travel=tree.nodes.filter(n=>n.kind==='attribute'&&!/_arm_/.test(n.id)).map(n=>n.id);
if(travel.length!==199)throw Error('过渡节点数量不是 199。');
selected.forEach(e=>e.points=1);
for(let remaining=199-selected.length;remaining>0;remaining--){
 const e=[...selected].sort((a,b)=>(b.length-sites[b.a].radius-sites[b.b].radius)/(b.points+1)-(a.length-sites[a.a].radius-sites[a.b].radius)/(a.points+1))[0];
 e.points++;
}
function smoothPath(points){
 const pp=points.filter((_,i)=>i%2===0||i===points.length-1),num=n=>Math.round(n*100)/100;
 let path=`M${pp[0].x} ${pp[0].y}`;
 if(pp.length===2)return path+`L${pp[1].x} ${pp[1].y}`;
 for(let i=1;i<pp.length;i++){
  const a=pp[i-1],b=pp[i],prev=pp[Math.max(0,i-2)],next=pp[Math.min(pp.length-1,i+1)];
  const length=distance(a,b),before=distance(prev,b)||1,after=distance(a,next)||1,handle=length/3;
  path+=`C${num(a.x+(b.x-prev.x)/before*handle)} ${num(a.y+(b.y-prev.y)/before*handle)} ${num(b.x-(next.x-a.x)/after*handle)} ${num(b.y-(next.y-a.y)/after*handle)} ${b.x} ${b.y}`;
 }
 return path;
}
let cursor=0;
for(const e of selected){
 const a=sites[e.a],b=sites[e.b],direction=Math.atan2(b.y-a.y,b.x-a.x);
 const pa=a.root?{port:tree.root,points:[{x:0,y:0},polar(52,direction)]}:a.ports.get(e.b);
 const pb=b.root?{port:tree.root,points:[{x:0,y:0},polar(52,direction+Math.PI)]}:b.ports.get(e.a);
 const start=pa.points.at(-1),end=pb.points.at(-1),ids=travel.slice(cursor,cursor+e.points);cursor+=e.points;
 ids.forEach((id,i)=>{
  const p=round({x:start.x+(end.x-start.x)*(i+1)/(e.points+1),y:start.y+(end.y-start.y)*(i+1)/(e.points+1)});
  const nearest=a.root?b:b.root?a:distance(p,a)<distance(p,b)?a:b;
  Object.assign(nodes.get(id),p,{sector:nearest.sector});
 });
 const all=[pa.port,...ids,pb.port];
 for(let i=0;i<all.length-1;i++){
  const points=[nodes.get(all[i])];
  if(i===0)points.push(...pa.points.slice(1));
  if(i===all.length-2)points.push(...[...pb.points].reverse().slice(0,-1));
  points.push(nodes.get(all[i+1]));
  const pp=points.map(round);put(all[i],all[i+1],pp,smoothPath(pp));
 }
}
const positions=Object.fromEntries([...nodes].map(([id,n])=>[id,round(n)]));
const all=[...Object.values(positions),...Object.values(edgeRoutes).flatMap(r=>r.points)];
const bounds={minX:Math.floor(Math.min(...all.map(p=>p.x))-100),maxX:Math.ceil(Math.max(...all.map(p=>p.x))+100),minY:Math.floor(Math.min(...all.map(p=>p.y))-100),maxY:Math.ceil(Math.max(...all.map(p=>p.y))+100)};
const nodeSectors=Object.fromEntries([...nodes.values()].filter(n=>n.sector).map(n=>[n.id,n.sector]));
const result={id:'organic-network-v5',revision:3,positions,nodeSectors,edges,edgeRoutes,clusters,orbits,bounds,backboneLinks:selected.length};
const audit=auditTalentLayout({...tree,nodes:[...nodes.values()],edges,layout:result});
if(audit.crossings.length||audit.obstructions.length||audit.overlaps.length)throw Error('星盘布局未通过交叉、图标遮挡或节点间距检查。');
fs.writeFileSync('public/talents/atlas-data.mjs','// Authored planar talent atlas. Regenerate with node scripts/build-organic-talent-atlas.mjs.\nexport const ATLAS = '+JSON.stringify(result)+';\n');
console.log(JSON.stringify({nodes:nodes.size,legendary:clusters.length,edges:edges.length,backboneLinks:selected.length,closedClusters:orbits.filter(o=>o.closed).length,bounds}));
