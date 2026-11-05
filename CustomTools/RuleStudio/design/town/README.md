# 夜阙城建筑提示词（主题 TWN）

给 GPT 出图、Meshy 生成 3D 用。格式和 DWCore `Design/level_assets_lowpoly/README.md` 的资产库一致：同样的风格后缀 A / B、三视图模板、命名规范、交付打包和 manifest.csv。可以直接并进那份资产库，作为一个新主题。

这批模型替换游戏里夜阙城现在用代码拼出来的房子和摆设（`public/prefabs/hub-props.mjs`）。到了的模型换上，没到的继续用现在的。

## 主题说明

王都底下的地下城：八百来号人，九座城逃来的都有。半木结构的民房、石板街、集市摊位，中间一口发光的灯井照亮整座城。穹顶是鎏金的，裂了缝。整体是暖的：奶油色灰泥、深色木梁、陶红和石板蓝的屋顶、旧金色的装饰，灯和窗户是暖橙色。冷色只出现在观星阁的窗户和暗河的水里。

游戏是 45° 俯视的动作 RPG 镜头，**屋顶和正面最常被看见**：屋顶轮廓要好认，门窗都放在正面（朝 -Y），背面可以简单。

**主题材质行 `[MATERIAL]`：**

```
warm cream plaster walls with dark oak half-timber beams, weathered sandstone and grey cobblestone, slate-blue and terracotta roof tiles, tarnished gold trim, warm lantern-orange glowing windows, cozy underground-town palette of warm browns, cream and muted gold
```

概念图提示词 = `[主体描述], [主题材质], [风格后缀 A]`；三视图提示词用资产库「三视图模板」一节的模板（标准或扁平），`[OBJECT]` 换成主体描述。下面的 `town-prompts.json` 里已经把每个资产的两条提示词拼好了。

## 尺寸

格子是 2 m，和地牢一致。建筑比资产库的「大型件」大，按占地格数给尺寸（宽 × 深 × 高，米）；出图时只要比例对，最终尺寸由 Claude 后处理统一。门朝 -Y（正面），轴心在底面中心。

## 建筑（大件）

| ID | 名称 | 变体 | 三视图 | 尺寸 w×d×h (m) | 用在哪儿 | 主体描述 `[OBJECT]` |
| --- | --- | --- | --- | --- | --- | --- |
| TWN-STR-01 | 金殿 | A | 标准 | 26 × 8 × 8 | 城北金殿，地图仪在它台阶前 | a long gilded palace hall with a broad marble stair across the whole front, eleven white marble columns with gold capitals holding a deep porch, a steep gabled roof covered in gold tiles, tall shut bronze double doors with three gold bands in the middle, warm light from narrow tall windows, wide and low silhouette |
| TWN-STR-02 | 灯井 | A | 标准 | 6 × 6 × 5 | 城中央灯井广场，全城的光源 | a round stone well about six meters across with a thick low rim, four tall dark oak posts around it holding a gilded iron ring high above the shaft, a big brass lantern hanging from the ring, pale golden starlight glowing up from inside the shaft |
| TWN-STR-03 | 半盏灯酒馆 | A | 标准 | 14 × 10 × 8 | 城西酒馆，卡罗、玛蒂、格雷在这儿 | a two-storey half-timbered tavern, cream plaster between dark beams, a wide covered porch with two long tables and benches in front, a wrought-iron sign arm holding a lantern broken in half, many warm-lit windows, a tall stone chimney, slightly crooked friendly silhouette |
| TWN-STR-04 | 铁匠铺 | A | 标准 | 12 × 8 × 6 | 城东铁匠巷，赛琳的铺子 | an open-fronted blacksmith workshop: thick stone back and side walls, a short lean-to roof only over the back half, a large brick furnace with a glowing orange mouth against the back wall and a tall square chimney, an anvil on a stump in the open front, a wooden quench trough with water, tools hanging on the wall |
| TWN-STR-05 | 观星阁 | A | 标准 | 10 × 10 × 12 | 城西北观星阁，伊芙的星图在里面 | a tall slender octagonal stone tower with three carved stone bands, a steep slate-blue conical roof, a long brass telescope poking out through a slot near the top, a small wooden balcony with a crow perch, windows glowing pale blue, an arched wooden door at the base |
| TWN-STR-06 | 库房 | A | 标准 | 12 × 12 × 5 | 城东北库房，仓库宝箱、维克、托格 | a squat heavy stone warehouse, almost windowless, horizontal darker stone bands around the walls, a flat parapet roof, a huge iron-studded oak door crossed by three gold bands with a big round gold lock in the middle, a stone bench beside the door |
| TWN-STR-07 | 营地之门 | A | 标准 | 10 × 6 × 8 | 城南出口，通往地面的营地之门 | a massive arched gateway carved straight into a rough cavern rock wall, a worn stone stair climbing up and out of sight through the arch, iron brackets with two burning torches, old banners hanging on both sides, a stone guard post with a small roof next to the arch |

## 民居

| ID | 名称 | 变体 | 三视图 | 尺寸 w×d×h (m) | 用在哪儿 | 主体描述 `[OBJECT]` |
| --- | --- | --- | --- | --- | --- | --- |
| TWN-STR-10 | 小民房 | A | 标准 | 6 × 6 × 5 | 街边民房，最常用 | a small one-storey half-timbered cottage, cream plaster walls with dark beams, a steep terracotta tile gable roof, a stone chimney, a wooden front door with a little lantern, two small warm-lit windows with flower boxes |
| TWN-STR-10 | 小民房 | B | 标准 | 6 × 6 × 5 | 同上，换个样子 | a small one-storey cottage with pale ochre plaster and dark beams, a slate-blue tile roof, a lean-to woodshed on one side, a wooden door with a horseshoe above it, warm-lit windows |
| TWN-STR-10 | 小民房 | C | 标准 | 6 × 6 × 5 | 同上，旧一点 | a small old cottage with patched grey-cream plaster and dark beams, a mossy roof with a few missing tiles, a crooked chimney, a canvas awning over the door, warm-lit windows |
| TWN-STR-11 | 长条民房 | A | 标准 | 6 × 4 × 4.5 | 码头、金殿大道两边 | a narrow low row house, half-timbered cream plaster, a long gable roof with two small dormer windows, two doors side by side, a bench under the front window |
| TWN-STR-12 | 二层民房 | A | 标准 | 8 × 6 × 7 | 码头边、城北 | a two-storey half-timbered townhouse whose upper floor sticks out over the street on wooden brackets, a steep terracotta roof, a small wooden balcony with drying cloth, warm-lit windows on both floors, a shop sign over the door |
| TWN-STR-13 | 小作坊 | A | 标准 | 6 × 6 × 4 | 铁匠巷尽头 | a small stone workshop with a wide open double door, a slate roof, barrels and planks stacked outside, a workbench visible inside the doorway |
| TWN-STR-14 | 棚屋 | A | 标准 | 4 × 4 × 3 | 城西南棚户区 | a small refugee shack built from mismatched scrap planks, a sloping lean-to roof of boards with a patched cloth tarp, a ragged curtain for a door, a tin chimney pipe |
| TWN-STR-14 | 棚屋 | B | 标准 | 4 × 4 × 3 | 同上 | a small shack made of old crate boards and a broken cart wheel, a roof of rusty iron sheets weighed down with stones, a small lit window, a bucket by the door |
| TWN-STR-14 | 棚屋 | C | 标准 | 4 × 4 × 3 | 同上 | a tiny lean-to shelter against a low stone wall, a slanted plank roof covered with a faded red cloth, a stack of firewood, a stool and a cooking pot outside |

## 码头

| ID | 名称 | 变体 | 三视图 | 尺寸 w×d×h (m) | 用在哪儿 | 主体描述 `[OBJECT]` |
| --- | --- | --- | --- | --- | --- | --- |
| TWN-STR-20 | 栈桥 | A | 扁平 | 4 × 8 × 1 | 暗河码头 | a simple wooden pier: thick planks on round wooden posts, mooring bollards with rope coiled around them, a lantern post at the far end |
| TWN-PRP-20 | 小船 | A | 标准 | 3 × 1.2 × 0.8 | 码头停着的船 | a small flat-bottomed wooden rowboat with two oars resting inside, a coil of rope and a small lantern at the bow |

## 街边道具

| ID | 名称 | 变体 | 三视图 | 尺寸 w×d×h (m) | 用在哪儿 | 主体描述 `[OBJECT]` |
| --- | --- | --- | --- | --- | --- | --- |
| TWN-PRP-01 | 面包摊 | A | 标准 | 2 × 1.4 × 2.2 | 集市街：罗莎的绿面包 | a market stall with a wooden counter and a striped red canvas awning on four poles, round loaves of slightly green bread stacked on the counter, a basket of rolls |
| TWN-PRP-02 | 腌菜摊 | A | 标准 | 2 × 1.4 × 2.2 | 集市街 | a market stall with a blue canvas awning, rows of glass jars of pickles and a big wooden barrel of brine next to the counter |
| TWN-PRP-03 | 旧衣摊 | A | 标准 | 2 × 1.4 × 2.2 | 集市街 | a market stall with a mustard-yellow awning, folded old clothes in piles on the counter and patched coats hanging from a rail at the side |
| TWN-PRP-04 | 药草摊 | A | 标准 | 2 × 1.4 × 2.2 | 集市街 | a market stall with a green awning, bundles of dried herbs hanging from the awning frame, small clay pots and mushrooms on the counter |
| TWN-PRP-05 | 修鞋摊 | A | 标准 | 2 × 1.4 × 2.2 | 集市街：欧文的修鞋摊 | a cobbler stall with a purple awning, a low stool and a shoemaker last, pairs of mended boots lined up on the counter, a small child-size red shoe set apart at one end |
| TWN-PRP-06 | 杂货摊 | A | 标准 | 2 × 1.4 × 2.2 | 集市街：拾荒队捡回来的东西 | a market stall with an orange awning, odd scavenged junk on the counter: a pot without a bottom, rusty keys, a cracked lantern, a broken clock |
| TWN-PRP-07 | 长椅 | A | 标准 | 1.8 × 0.5 × 0.9 | 广场 | a simple wooden park bench with a backrest and black iron legs |
| TWN-PRP-08 | 布告板 | A | 标准 | 2 × 0.4 × 2.2 | 广场：失踪的人、配给 | a wooden notice board on two posts under a tiny shingle roof, covered with many pinned paper notes and a few drawings of faces |
| TWN-PRP-09 | 祈愿龛 | A | 标准 | 2.4 × 1.2 × 1.6 | 广场北侧：回声会 | a small stepped stone shrine with a marble block on top, many melted candles on the steps, small offerings left on it: a toy horse, a ribbon, a shoe, a cup |
| TWN-PRP-10 | 路灯 | A | 标准 | 0.8 × 0.4 × 2.8 | 街道两边 | a tall black wrought-iron street lamp post with a curled arm and a hanging glass lantern glowing warm orange |
| TWN-PRP-11 | 木箱木桶堆 | A | 标准 | 1.6 × 1 × 1.2 | 房前屋后 | a small cluster of two wooden crates and a barrel, one crate stacked on another, a sack leaning on them |
| TWN-PRP-12 | 晾衣绳 | A | 标准 | 4 × 0.3 × 2 | 棚户区 | two wooden poles with a rope between them, colorful patched clothes and sheets hanging from the rope |
| TWN-PRP-13 | 手推车 | A | 标准 | 2 × 1 × 1 | 集市街、码头 | a two-wheeled wooden handcart loaded with sacks and a crate, its handles resting on the ground |
| TWN-PRP-14 | 水槽 | A | 标准 | 1.6 × 0.6 × 0.6 | 铁匠巷 | a long wooden water trough with iron bands, filled with water, a ladle hanging on the side |
| TWN-PRP-15 | 酒馆外桌 | A | 标准 | 1.6 × 1.6 × 0.8 | 酒馆门口 | a rough wooden table with two benches, a few tankards and a candle on the table |
| TWN-PRP-16 | 九城旗 | A | 标准 | 0.6 × 0.3 × 3 | 集市街两头、灯井广场 | a tall wooden pole with a long hanging cloth banner, the banner shows a simple emblem of a star over a city wall, frayed bottom edge |
| TWN-PRP-17 | 发光苔藓花坛 | A | 标准 | 1.4 × 1.4 × 0.6 | 广场四角、金殿大道 | a low round stone planter filled with soft glowing teal moss and a few small pale mushrooms |
| TWN-PRP-18 | 地图仪 | A | 标准 | 3 × 3 × 2.4 | 金殿台阶前，放路石开图 | a brass armillary map device on a round stone plinth: several nested brass rings tilted at different angles around a small floating crystal, engraved star map on the plinth top, a slot for a stone tablet in front |
| TWN-PRP-19 | NPC 站台 | A | 扁平 | 1.4 × 1.4 × 0.15 | 五位 NPC 脚下 | a low round stone dais with a thin gold ring inlaid near the edge |

## 地面

| ID | 名称 | 变体 | 三视图 | 尺寸 w×d×h (m) | 用在哪儿 | 主体描述 `[OBJECT]` |
| --- | --- | --- | --- | --- | --- | --- |
| TWN-FLR-01 | 石板路 | A | 扁平 | 2 × 2 × 0.2 | 大部分街道 | square flat street tile of rounded grey-brown cobblestones of mixed sizes, tight joints, a few worn smooth stones |
| TWN-FLR-02 | 广场石板 | A | 扁平 | 2 × 2 × 0.2 | 灯井广场 | square flat plaza tile of large pale sandstone flagstones with a thin tarnished gold inlay line along one edge |
| TWN-FLR-03 | 金殿大理石 | A | 扁平 | 2 × 2 × 0.2 | 金殿前、金殿大道 | square flat floor tile of polished cream marble slabs with fine gold seams |
| TWN-FLR-04 | 码头木板 | A | 扁平 | 2 × 2 × 0.2 | 码头 | square flat tile of weathered wooden planks with iron nails and a gap between two boards |
| TWN-FLR-05 | 泥地 | A | 扁平 | 2 × 2 × 0.2 | 棚户区 | square flat tile of packed brown dirt with scattered pebbles, a puddle and some straw |

## 洞壁（城的边界）

| ID | 名称 | 变体 | 三视图 | 尺寸 w×d×h (m) | 用在哪儿 | 主体描述 `[OBJECT]` |
| --- | --- | --- | --- | --- | --- | --- |
| TWN-WAL-01 | 洞壁直段 | A | 标准 | 2 × 0.6 × 3.2 | 城的四周 | straight rough cavern rock wall segment, chunky faceted brown-grey rock, a timber support beam bolted across it, small glowing moss at the foot |
| TWN-WAL-02 | 洞壁转角 | A | 标准 | 2 × 2 × 3.2 | 城的四角 | L-shaped cavern rock wall corner piece, chunky faceted rock with a few hanging roots |
| TWN-WAL-03 | 鎏金残壁 | A | 标准 | 2 × 0.6 × 3.2 | 金殿两边 | straight cavern rock wall segment with a broken piece of gilded carved palace wall fused into it, gold leaf flaking off |

## 场景概念图（只出概念图，不做三视图）

用来定整座城的风格和气氛，Claude 按它调颜色和摆放。

| ID | 名称 | 描述 |
| --- | --- | --- |
| TWN-SCN-01 | 夜阙城全景 | an underground town built inside a vast cavern under a ruined palace: a gilded hall at the far end, a glowing round lamp well in the central square, half-timbered houses along cobbled streets, a market street with colored awnings, a shanty corner and a small river dock, the cavern ceiling is a cracked gilded dome with dark grey mist seeping through the cracks, warm lantern light everywhere, high 3/4 top-down view like an action RPG |
| TWN-SCN-02 | 灯井广场 | a busy town square around a big round glowing lamp well, benches, a notice board covered in notes, a small candle shrine, townsfolk standing in line for water, warm golden light, high 3/4 top-down view |
| TWN-SCN-03 | 集市街 | a narrow cobbled market street lined with small stalls under colorful awnings, bread, pickles, herbs and old clothes for sale, half-timbered houses behind, banners overhead, high 3/4 top-down view |
| TWN-SCN-04 | 棚户区 | a cramped shanty corner of an underground town, scrap-plank shacks, washing lines with patched clothes, a shared outdoor cooking stove with a pot, children playing, high 3/4 top-down view |
| TWN-SCN-05 | 暗河码头 | a small dock on a dark underground river, a wooden pier with rowboats, row houses along the bank, lanterns reflected in black water, high 3/4 top-down view |

## 优先级

一次做不完就按这个顺序：

1. **金殿、灯井、地图仪、小民房 A/B/C**：一进城就看见，换上效果最明显。
2. **半盏灯酒馆、铁匠铺、观星阁、库房**：五位 NPC 的地方。
3. **集市摊位 6 个、棚屋 A/B/C、路灯、长椅、布告板、祈愿龛**。
4. 其余道具、码头、地面砖、洞壁。

## 交付

按资产库的打包规则：一个资产一个文件夹，放概念图、三视图、裁切后的单视图和 GLB，外加 `manifest.csv`（`id, name, category, variant, grid_w, grid_d, grid_h, glb_file, notes`）。放到这里：

```
CustomTools/RuleStudio/design/town/TWN/
  TWN_STR_hall_A/
    TWN_STR_hall_A_concept.png
    TWN_STR_hall_A_sheet.png
    TWN_STR_hall_A_front.png  _side.png  _back.png
    TWN_STR_hall_A.glb
  manifest.csv
```

Meshy 参数照资产库「Meshy 生成与交付」一节。建筑面数可以放宽到 3000 到 6000（后处理会减面）；发光的窗户、灯、灯井的光不用追求，后处理换成发光材质。提交以后告诉我，我来做后处理：统一尺寸、轴心、配色，然后接进夜阙城。

## 本批交付记录（2026-11-05）

45 件资产已生成带内嵌贴图的 GLB；5 张 SCN 场景图继续用作场景参考。模型使用 Meshy 7.1 多图生成、三角面 Remesh 和 2K PBR，全部完成 Blender 独立导入、贴图解码、渲染及多方向视觉复核。

- `TWN/manifest.csv`：45 件交付清单及后处理备注。`grid_w / grid_d / grid_h` 按本文尺寸表填写，单位为米；场景格子仍为 2 米。
- `TWN/mesh-manifest.json`：任务 ID、实际参数、输入/模型 SHA256、面数、独立导入结果和逐件视觉复核记录。
- `TWN/mesh-overview.png`：45 个实际 GLB 的独立渲染总览。
- 每件的 `_sheet-source.png` 保留内置 image_gen 原始三视图；`_sheet.png` 为 1536×1024 标准排版。需要时沿真实白色间隔裁切，以同一个等比系数重排，原始几何内容保留。
- 每件的 `_generation.json` 保存本件生成和复核记录；`_mesh-front/right/back/left.png` 是实际模型的方向预览。

灯井、库房、衣摊、栈桥、大理石地砖和九城旗的首版缺件或轮廓错误已重生成并复审，纠正时增加原概念图作为第四张输入。共 51 次生成，实际消耗 1530 积分。尺寸、轴心、主题配色、最终减面、接缝及夜阙城接入继续按本文的后处理流程完成；剩余小细节差异列在清单备注中。

批次脚本是 `scripts/meshy-town.py`。本机队列记录位于 `work/meshy-town/`，保留它可复用原任务继续下载；提交结果未知时会停止自动重发。凭据通过 `MESHY_API_KEY` 或 `--key-file` 读取，兼容现有含 `api_key` 的本机 Meshy 配置。下载会核对响应长度和 GLB 结构后再替换目标文件。
