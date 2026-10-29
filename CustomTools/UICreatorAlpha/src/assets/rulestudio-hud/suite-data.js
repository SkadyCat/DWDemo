// Preview fixtures mirror the source components' contracts. No game save is read or changed.
export const GEAR = [['weapon','武器'],['offhand','副手'],['helmet','头盔'],['chest','胸甲'],['gloves','手套'],['boots','鞋子'],['belt','腰带'],['amulet','护符'],['ring','戒指']];
const equipment = [
 ['霜棘法杖','weapon','normal','staff'],['苔岩长靴','boots','rare','boots'],['熔铸护手','gloves','rare','gloves'],['余烬回响·鸣焰冠·IV阶','helmet','legendary','helmet'],
 ['燎原攻守·同焰坠','amulet','rare','amulet'],['余烬护手','gloves','rare','gloves'],['毒瓶','weapon','rare','poison'],['鸣焰冠','helmet','legendary','helmet'],
 ['苍翠束带','belt','rare','belt'],['余烬战靴','boots','legendary','fire-boots'],['青石战靴','boots','rare','boots'],['焰心护符','amulet','rare','amulet'],
 ['燃魂面甲','helmet','rare','fire-helmet'],['回旋斩','weapon','normal','sword'],['裂地之刃','weapon','rare','axe'],['黑铁胫甲','boots','normal','iron-boots'],
 ['虚空之握','gloves','legendary','void'],['炽焰护符','amulet','rare','amulet'],['燎原·续火带','belt','rare','fire-belt'],['火行者','boots','legendary','fire-boots'],['烈焰爆发','weapon','rare','flame']
];
export const ITEMS = equipment.map(([name, slot, rarity, icon], i) => ({ id: `gear-${i}`, name, slot, rarity, icon, kind: 'equipment', tier: 1, count: 1, equipped: [0,3,11,18].includes(i), unidentified: false, description: ({weapon:'基础冰霜伤害 +4',boots:'移动速度 +4%',gloves:'攻击速度 +5%',helmet:'基础护盾 +30',belt:'基础气血 +75',amulet:'施法速度 +8%'})[slot]||'基础护盾 +30', affixes: ['范围技能重复次数 +1','范围技能重复间隔 -16%','基础火焰伤害 +4','触发所需累计资源量 -11%','基础中毒伤害 +3点/秒','命中时恢复护盾 +1'].slice(0,rarity==='normal'?0:rarity==='rare'&&i!==18?4:6) }));
export const MATERIALS = [
 {id:'stone-low',name:'下品灵石',icon:'stone-green',count:5,description:'首次选定一条随机词条；之后使用对应品级灵石洗炼。每件装备最多选定 3 条。'},
 {id:'meteor',name:'陨星石',icon:'stone-gold',count:6,description:'重新随机生成 4 条词缀，保留基础属性与固定传奇词条。'},
 {id:'stone-high',name:'上品灵石',icon:'stone-purple',count:3,description:'选定并洗炼高品级随机词条。'},
 {id:'stone-mid',name:'中品灵石',icon:'stone-blue',count:0,description:'选定并洗炼中品级随机词条。'},
 {id:'omen-fire',name:'元素预兆',icon:'omen-fire',count:0,description:'加工时，将新增或洗炼的词条限制在元素词缀族。'},
 {id:'omen-ice',name:'异常预兆',icon:'original-omen_affliction',count:2,description:'加工时，将新增或洗炼的词条限制在异常词缀族。'}
];
const material = id => ({...MATERIALS.find(m=>m.id===id),kind:'item',rarity:'normal',tier:0});
const omen = (id,name,count=1,rarity='rare') => ({id,name,count,kind:'item',rarity,tier:0,icon:`original-${id}`,description:`${name} · 加工时限制词缀族。`});
// Same 32 occupied cells and row-major order as the supplied 6×12 inventory reference.
export const BAG_ITEMS = [
 ITEMS[0],{...material('omen-ice'),rarity:'unique'},ITEMS[1],ITEMS[2],omen('omen_proc','触发预兆',2,'normal'),ITEMS[3],material('meteor'),material('stone-low'),ITEMS[4],ITEMS[5],ITEMS[6],omen('omen_barrier','护盾预兆',1,'magic'),
 ITEMS[7],ITEMS[8],omen('omen_mind','心法预兆',1,'unique'),omen('omen_martial','武斗预兆',3),ITEMS[9],ITEMS[10],omen('omen_ballistic','投射预兆',1,'normal'),ITEMS[11],{id:'potion',name:'狂怒药剂',kind:'item',rarity:'rare',icon:'original-berserk_draught',count:1,description:'短时间提高攻击与施法速度。'},ITEMS[12],ITEMS[13],ITEMS[14],
 ITEMS[15],ITEMS[16],omen('omen_offense','攻势预兆',2),material('stone-high'),ITEMS[17],ITEMS[18],ITEMS[19],ITEMS[20]
];
export const BAG_GEOMETRY = {width:650,height:448,gridX:12,gridY:98,gridWidth:624,gridHeight:312,columns:12,rows:6,gap:4,cellWidth:580/12,cellHeight:292/6};
export const STAT_SECTIONS = [
 ['基础伤害',[['基础物理伤害','0'],['基础火焰伤害','+4','#ffa858'],['基础冰霜伤害','+4','#80d3ff'],['基础闪电伤害','0'],['基础毒素伤害','0'],['基础虚空伤害','0']]],
 ['当前技能伤害',[['冰霜 · 每枚投射物','30']]],
 ['基础属性',[['力量','0'],['敏捷','0'],['智力','0'],['体质','0']]],
 ['战斗能力',[['攻速','3 次/秒'],['移速','6.2 m/s'],['暴击率','5%'],['暴击伤害','150%'],['冷却恢复','100%'],['施法速度','100%']]],
 ['伤害加成',[['火焰伤害','+12%'],['冰霜伤害','+8%'],['范围伤害','+16%'],['召唤物伤害','0%']]],
 ['抗性',[['物理抗性','0%'],['火焰抗性','0%'],['冰霜抗性','0%'],['闪电抗性','0%'],['毒素抗性','0%'],['虚空抗性','0%']]],
 ['生存能力',[['气血上限','1075'],['护盾上限','107'],['魔力上限','100'],['气血回复','0 / 秒'],['护盾回复','1 / 命中']]]
];
export const TRAIT_SOURCES = [
 {name:'冰锥术',icon:'ice',kind:'技能',rows:[['创建冰锥：伤害 16'],['冰缓：减速30%，持续2s','merged'],['参数族「速度变化」覆盖','note']]},
 {name:'霜棘法杖',icon:'staff',kind:'装备',rows:[['基础冰霜伤害 +4'],['召唤物死亡爆炸造成其最大气血10%的伤害']]},
 {name:ITEMS[3].name,icon:'helmet',kind:'装备',rows:[['基础护盾 +30'],...ITEMS[3].affixes.map(v=>[v]),['施法时获得余烬，持续 4 秒'],['冰缓持续时间 +12%'],['范围伤害 +16%']]},
 {name:'燎原·续火带',icon:'fire-belt',kind:'装备',rows:[['基础气血 +75'],['火焰伤害 +12%'],['范围技能命中附加燃烧'],['击杀时恢复气血 +4']]},
 {name:'燎原攻守·同焰坠',icon:'amulet',kind:'装备',rows:[['施法速度 +8%'],['护盾回复 +1'],['元素伤害 +6%']]},
 {name:'角色与地图',icon:'shield',kind:'固定',rows:[['角色基础属性'],['地图怪物群 +0%'],['护盾破碎时触发冰环','off'],['未满足条件：气血低于30%','note']]}
];
export const AFFIXES = ['暴击施加的点燃伤害 +n%','暴击施加的感电效果 +n%','暴击施加的中毒伤害 +n%','暴击时恢复护盾 +n 点','暴击时恢复气血 +n 点','冰缓持续时间 +n%','召唤物伤害 +n%','火焰伤害 +n%','冰霜伤害 +n%','闪电伤害 +n%','范围技能重复次数 +n','范围技能重复间隔 -n%','基础气血 +n','基础护盾 +n','基础火焰伤害 +n','基础冰霜伤害 +n','命中时恢复护盾 +n','投射物数量 +n','施法速度 +n%','移动速度 +n%','力量 +n','敏捷 +n','智力 +n','体质 +n','召唤物气血 +n%','召唤物攻速 +n%','技能持续时间 +n%','点燃持续时间 +n%','火焰穿透 +n%','冰霜穿透 +n%','范围半径 +n%','基础虚空伤害 +n'];
export const REGIONS = [
 {id:'0:0',name:'苔痕遗迹',floor:1,biome:'遗迹',status:'已通关',x:390,y:410},
 {id:'1:0',name:'雾隐幽林',floor:2,biome:'幽林',status:'可以探索',x:590,y:300},
 {id:'0:1',name:'寒霜边境',floor:2,biome:'冻原',status:'可以探索',x:310,y:190},
 {id:'-1:0',name:'静默海岸',floor:2,biome:'海岸',status:'挑战失败',x:165,y:425},
 {id:'1:1',name:'碎岩群山',floor:3,biome:'群山',status:'尚未连通',x:685,y:125},
 {id:'2:0',name:'熔火之地',floor:3,biome:'熔火',status:'尚未连通',x:810,y:465},
 {id:'0:2',name:'暮色湿地',floor:3,biome:'湿地',status:'尚未连通',x:430,y:60}
];
