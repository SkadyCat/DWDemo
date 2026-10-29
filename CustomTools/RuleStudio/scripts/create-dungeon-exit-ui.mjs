import fs from 'node:fs/promises';
import {createDocument,createNode,validateDocument} from '../../UICreatorAlpha/src/core/model.js';
const id='opus-dungeon-exit',url=`http://127.0.0.1:5190/api/projects/${id}`;
const previous=await fetch(url);
let project;
if(previous.ok){const record=await previous.json();project=record.document||record.project||record;}
else{
  if(previous.status!==404)throw Error(`UICreator: ${previous.status}`);
  project=createDocument('Studio3D · 地牢传送阵');project.id=id;project.viewport={width:230,height:64,background:'transparent'};
  project.motions={};
  const slot=(left,top,right,bottom)=>({offsets:{left,top,right,bottom}});
  project.root=createNode('CanvasPanel',{id:'portal-root',name:'传送阵标签',layout:{width:230,height:64},children:[
    createNode('Button',{id:'portal-open',name:'传送阵 · 打开世界地图',slot:slot(2,2,226,60),style:{fill:'#0c2029ed',stroke:'#72d9c7',strokeWidth:1,radius:8},action:{type:'ui',op:'world-map'},children:[createNode('CanvasPanel',{id:'portal-content',layout:{width:226,height:60},children:[
      createNode('TextBlock',{id:'portal-title',text:'◇  传送阵',slot:slot(12,7,202,23),style:{fontSize:15,color:'#c9f1df',textAlign:'center'}}),
      createNode('TextBlock',{id:'portal-note',text:'点击打开世界地图',slot:slot(10,33,206,17),style:{fontSize:10,color:'#87b9bb',textAlign:'center'}})
    ]})]})
  ]});
  const errors=validateDocument(project);if(errors.length)throw Error(errors.join('\n'));
  const saved=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'"0"'},body:JSON.stringify(project)});
  if(!saved.ok)throw Error(await saved.text());const record=await saved.json();project=record.document||record.project||project;
}
await fs.writeFile(new URL('../public/ui/dungeon-exit.uialpha.json',import.meta.url),JSON.stringify(project,null,2));
console.log(JSON.stringify({project:id,validated:true}));
