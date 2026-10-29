// Shared with the inventory context menu authoring source and purchase menus.
export const CONTEXT_MENU_COLORS={common:'#aab4c3',magic:'#5b9dff',rare:'#f7d046',legendary:'#ff8a3d',unique:'#c38bff'};
export const contextMenuColor=quality=>CONTEXT_MENU_COLORS[quality]||CONTEXT_MENU_COLORS.common;
export const contextMenuMix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*t+parseInt(b.slice(i,i+2),16)*(1-t)).toString(16).padStart(2,'0')).join('');
export function contextMenuFrame(quality,height=108){
 const color=contextMenuColor(quality);
 return `<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#172130"/><stop offset=".75" stop-color="#0d141f"/></linearGradient><linearGradient id="head"><stop stop-color="${color}" stop-opacity=".1"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><rect x=".5" y=".5" width="239" height="${height-1}" rx="9" fill="url(#bg)" stroke="${contextMenuMix(color,'#273246',.35)}" stroke-width="1"/><path d="M9 1h222q8 0 8 8v49H1V9q0-8 8-8" fill="url(#head)"/><path d="M1 58h238" stroke="#ffffff0b" stroke-width="1"/>`;
}
export const CONTEXT_MENU_ACTIONS={normal:['#00000000','#00000000'],hovered:['#243349b3','#42638680'],pressed:['#203047','#6f9ac2'],disabled:['#00000000','#00000000']};
export const CONTEXT_MENU_STONE='<defs><linearGradient id="stone" x2="1" y2="1"><stop stop-color="#b9ffe6"/><stop offset=".55" stop-color="#3ddc97"/><stop offset="1" stop-color="#157a5c"/></linearGradient></defs><path d="M7 1 13 7 7 13 1 7Z" fill="url(#stone)"/>';
