import {walk} from '../../core/model.js';

export function merchantCardBrushes(legendary=false,selected=false){
  const prefix=`merchant-card-${legendary?'gold':'jade'}-`;
  const active=prefix+(selected?'selected':'normal');
  return {normal:active,hovered:active,pressed:active,disabled:prefix+'disabled'};
}

// Selection is authored artwork, separate from mouse hover and keyboard focus.
export function updateMerchantSelection(project){
  const before=JSON.stringify([project.root,project.assets,project.presentation]);
  for(const tone of ['jade','gold'])for(const state of ['normal','hovered','pressed','disabled','selected','selected-hovered']){
    const selected=state.startsWith('selected'),lit=selected||state==='hovered',disabled=state==='disabled';
    const edge=disabled?'#39434b':tone==='gold'?(lit?'#e7bb70':'#6b5739'):(lit?'#8adac7':'#3b5967');
    const top=disabled?'#161e26':tone==='gold'?(lit?'#34332d':'#20272c'):(lit?'#23404a':'#172b36');
    const bottom=state==='pressed'?'#0d1720':disabled?'#101820':'#0e1a25';
    const id=`merchant-card-${tone}-${state}`;
    project.assets[id]={id,name:`商人商品 · ${tone==='gold'?'暖金':'青玉'} · ${state}`,viewBox:[0,0,280,106],scaleMode:'stretch',source:`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="106" viewBox="0 0 280 106" fill="none" stroke="none">
<defs><linearGradient id="body" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="light"><stop stop-color="${edge}" stop-opacity="0"/><stop offset=".42" stop-color="${edge}" stop-opacity="${selected?'.55':'.12'}"/><stop offset="1" stop-color="${edge}" stop-opacity="0"/></linearGradient><radialGradient id="aura"><stop stop-color="${edge}" stop-opacity="${selected?'.13':'.025'}"/><stop offset="1" stop-color="${edge}" stop-opacity="0"/></radialGradient></defs>
<rect x=".75" y=".75" width="278.5" height="104.5" rx="8" fill="url(#body)" stroke="${edge}" stroke-opacity="${selected?'.95':'.6'}" stroke-width="${selected?'1.5':'1'}"/>
<rect x="3" y="3" width="274" height="100" rx="6" stroke="#e3f4ee" stroke-opacity="${selected?'.1':'.025'}"/>
<ellipse cx="43" cy="47" rx="94" ry="47" fill="url(#aura)"/>
<path d="M15 2.5h248" stroke="url(#light)"/>
<rect x="11.5" y="14.5" width="63" height="63" rx="4" stroke="${edge}" stroke-opacity="${selected?'.85':'.18'}"/>
${selected?`<path d="M5.5 20V12a6.5 6.5 0 0 1 6.5-6.5h8m240 0h8a6.5 6.5 0 0 1 6.5 6.5v8M5.5 86v8a6.5 6.5 0 0 0 6.5 6.5h8m240 0h8a6.5 6.5 0 0 0 6.5-6.5v-8" stroke="${edge}" stroke-width="1.2"/><path d="m263 8 7 7-7 7-7-7Z" fill="${edge}" fill-opacity=".15" stroke="${edge}" stroke-width=".7"/><path d="m260 15 2 2 4-4" stroke="${edge}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`:''}
</svg>`};
  }
  walk(project.root,node=>{
    const match=/^stock-(\d+)$/.exec(node.id);
    if(match){node.style={...node.style,fill:'transparent',stroke:'transparent',strokeWidth:0};node.brushes=merchantCardBrushes(Number(match[1])>=3);node.motion={preset:'none',assetId:''};}
    if(node.id==='shop-message')node.text='左键选中 · 右键打开购买菜单';
    if(/^stock-\d+-buy$/.test(node.id))node.text=node.text.replace(/\s*·\s*(?:右键)?购买/,'');
  });
  project.presentation={...project.presentation,merchantInput:{primary:'select',secondary:'purchase-menu',confirm:'purchase-confirm'}};
  return before!==JSON.stringify([project.root,project.assets,project.presentation]);
}
