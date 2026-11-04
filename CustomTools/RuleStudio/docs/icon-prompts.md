# 图标清单与文生图提示词

由 `node scripts/icon-prompts.mjs` 从代码里的图标表生成（190 个）。改了图标表或新增技能后重新跑一遍即可。
批量跑图用同目录的 `icon-prompts.json`（每行：`file` 输出路径、`prompt`、`negative`）。

## 统一规格

- 尺寸 512 × 512 PNG，主体居中、四周留白约 10%，在 48 px 下也要认得出。
- **painted（技能、装备、通货、传奇、路石等）**：手绘暗黑奇幻风物件图标，深海军蓝底（#0b1224）向边缘压暗，金色轮廓光。底可以不透明。
- **emblem（功能栏、地图标记、增益、状态、空装备位）**：纯白剪影、纯黑底，无阴影无渐变。游戏里会把它当遮罩，用金色 / 稀有度 / 元素渐变上色（和现在一样），所以只要形状。
- 元素点缀色：火 #ff8a3d · 冰 #8fd8ff · 电 #ffe066 · 混沌 #c39bff · 物理 #d8c6a4；界面主色 金 #d8b46a / 亮金 #fbe7b0 / 深蓝 #060a18。
- 通用负面提示词：`text, letters, numbers, watermark, signature, border, frame, UI panel, multiple objects, character portrait, photo, 3d render, blurry, low contrast, cropped subject`

### 画风前缀（每条提示词都已经带上）

- painted：`hand-painted dark fantasy ARPG icon, a single centered subject, strong readable silhouette at 48 px, dramatic rim light, deep navy background (#0b1224) fading to black at the edges, subtle gold filigree accents, painterly texture with crisp edges, high contrast, square 1:1`
- emblem：`flat game UI emblem, one bold silhouette symbol, solid white on a pure black background, no shading, no gradient, clean vector edges, thick shapes readable at 32 px, centered with generous padding, square 1:1`

## 接入方式

把图放到 `public/assets/icons/<分类>/<id>.png`（分类和 id 见下表，JSON 里每条的 `file` 就是这个路径）。提示词是英文的，国内外的文生图工具都能直接用；传奇那一节的中文描述和题词可以一起给工具当参考。emblem 类可以直接替换现在的遮罩；painted 类要把对应图标从「遮罩上色」改为「直接贴图」，图到位后改一处 `icons.mjs` 就能切过去。


## 技能（65）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `fireball` | 火球 | 技能栏、技能提示（主动技能） | fireball | a roaring fireball with a comet tail, colour accent blazing orange-red fire (#ff8a3d). |
| `ice_nova` | 冰霜新星 | 技能栏、技能提示（主动技能） | snowflake-1 | a burst ring of ice shards exploding outward from a frozen core, colour accent icy pale-blue frost (#8fd8ff). |
| `arc` | 电弧 | 技能栏、技能提示（主动技能） | lightning-arc | a forking arc of lightning jumping between three points, colour accent crackling yellow lightning (#ffe066). |
| `spark` | 电花 | 技能栏、技能提示（主动技能） | spark-spirit | small erratic sparks of electricity bouncing like fireflies, colour accent crackling yellow lightning (#ffe066). |
| `frost_bolt` | 寒冰弹 | 技能栏、技能提示（主动技能） | ice-bolt | a sharp icicle bolt flying with a frosty trail, colour accent icy pale-blue frost (#8fd8ff). |
| `flame_wall` | 火墙 | 技能栏、技能提示（主动技能） | flame | a wall of flames rising from the ground, colour accent blazing orange-red fire (#ff8a3d). |
| `heavy_strike` | 重击 | 技能栏、技能提示（主动技能） | hammer-drop | a massive warhammer slamming down with an impact shockwave, colour accent steel and bone tones (#d8c6a4). |
| `cleave` | 劈砍 | 技能栏、技能提示（主动技能） | crossed-swords | a wide crescent slash of an axe blade, colour accent steel and bone tones (#d8c6a4). |
| `cyclone` | 旋风斩 | 技能栏、技能提示（主动技能） | whirlwind | a spinning whirlwind of blades around a warrior silhouette, colour accent steel and bone tones (#d8c6a4). |
| `falling_thunder` | 崩雷鸣 | 技能栏、技能提示（主动技能） | thor-hammer | a war hammer charged with lightning striking the ground, colour accent steel and bone tones (#d8c6a4). |
| `flicker_strike` | 闪现打击 | 技能栏、技能提示（主动技能） | teleport | a dagger strike leaving afterimages of teleport flashes, colour accent steel and bone tones (#d8c6a4). |
| `viper_knives` | 蝰蛇飞刃 | 技能栏、技能提示（主动技能） | thrown-daggers | a fan of green poison-dripping throwing knives, colour accent steel and bone tones (#d8c6a4). |
| `summon_blades` | 灵刃召唤 | 技能栏、技能提示（主动技能） | spinning-sword | a ring of floating ghostly swords. |
| `storm_totem_place` | 风暴图腾 | 技能栏、技能提示（主动技能） | stone-tower | a carved stone totem crackling with lightning. |
| `glacial_burst` | 寒潮 | 触发技能（提示、图鉴里出现） | frozen-orb | a wave of frost bursting from a shattered ice orb, colour accent icy pale-blue frost (#8fd8ff). |
| `tornado` | 龙卷风 | 技能栏、技能提示（主动技能） | tornado | a towering grey tornado tearing up debris, colour accent steel and bone tones (#d8c6a4). |
| `thunder_fall` | 落雷 | 触发技能（提示、图鉴里出现） | lightning-branches | a lightning bolt falling straight from a dark cloud, colour accent crackling yellow lightning (#ffe066). |
| `ice_spike_burst` | 冰刺爆发 | 触发技能（提示、图鉴里出现） | ice-spear | ice spikes erupting from the ground in a cluster, colour accent icy pale-blue frost (#8fd8ff). |
| `flame_burst` | 炎爆 | 触发技能（提示、图鉴里出现） | fluffy-flame | a round explosion of fire, colour accent blazing orange-red fire (#ff8a3d). |
| `blade_ring` | 刀锋环 | 触发技能（提示、图鉴里出现） | spinning-blades | eight blades flying outward in a ring, colour accent steel and bone tones (#d8c6a4). |
| `ground_slam` | 落地冲击 | 触发技能（提示、图鉴里出现） | heavy-fall | a fist hitting the ground, cracks radiating out, colour accent steel and bone tones (#d8c6a4). |
| `storm_step` | 雷闪步 | 技能栏、技能提示（主动技能） | lightning-trio | a lightning-wreathed footstep dash, colour accent crackling yellow lightning (#ffe066). |
| `frost_dash` | 霜刃突进 | 技能栏、技能提示（主动技能） | ice-spear | a figure dashing forward leaving a trail of ice, colour accent icy pale-blue frost (#8fd8ff). |
| `phantom_step` | 残影步 | 技能栏、技能提示（主动技能） | shadow-follower | a shadow afterimage left behind a dashing figure, colour accent blazing orange-red fire (#ff8a3d). |
| `star_step` | 星刃瞬步 | 技能栏、技能提示（主动技能） | star-swirl | a burst of star-shaped blades around a blink flash, colour accent steel and bone tones (#d8c6a4). |
| `void_leap` | 虚空跃迁 | 技能栏、技能提示（主动技能） | portal | a purple void portal swallowing a leaping figure, colour accent violet chaos energy (#c39bff). |
| `aegis_nova` | 盾爆 | 技能栏、技能提示（主动技能） | shield-impact | an energy shield exploding into a shockwave, colour accent steel and bone tones (#d8c6a4). |
| `shield_bash` | 盾击 | 技能栏、技能提示（主动技能） | shield-bash | a shield smashing forward with impact lines, colour accent steel and bone tones (#d8c6a4). |
| `aegis_shards` | 盾刃弹幕 | 技能栏、技能提示（主动技能） | shield-reflect | a shield shattering into three flying ice blades, colour accent icy pale-blue frost (#8fd8ff). |
| `raise_skeletons` | 骸骨召唤 | 技能栏、技能提示（主动技能） | raise-skeleton | skeletal hands rising from the ground. |
| `summon_golem` | 熔火魔像 | 技能栏、技能提示（主动技能） | golem-head | a molten lava golem head with glowing eyes. |
| `summon_archers` | 幽魂射手 | 技能栏、技能提示（主动技能） | bowman | a ghostly skeletal archer drawing a bow. |
| `summon_spiders` | 蛛巢 | 技能栏、技能提示（主动技能） | spider-alt | a cluster of green venomous spiders hatching. |
| `summon_wisps` | 霜灵 | 技能栏、技能提示（主动技能） | ice-spell-cast | small glowing frost wisps orbiting. |
| `fire_trap` | 爆燃陷阱 | 技能栏、技能提示（主动技能） | land-mine | a spiked mine glowing with fire runes, colour accent blazing orange-red fire (#ff8a3d). |
| `frost_trap` | 霜冻陷阱 | 技能栏、技能提示（主动技能） | frozen-orb | a frozen rune trap with an ice crystal core, colour accent icy pale-blue frost (#8fd8ff). |
| `blade_trap` | 刃轮陷阱 | 技能栏、技能提示（主动技能） | circular-saw | a spinning circular saw trap on the floor, colour accent steel and bone tones (#d8c6a4). |
| `snare_shot` | 捕兽箭 | 技能栏、技能提示（主动技能） | wolf-trap | an arrow with a steel bear trap at the tip, colour accent steel and bone tones (#d8c6a4). |
| `turret_trap` | 机关陷阱 | 技能栏、技能提示（主动技能） | ballista | a small wooden ballista unfolding from a trap, colour accent steel and bone tones (#d8c6a4). |
| `shock_trap` | 电击陷阱 | 技能栏、技能提示（主动技能） | electrical-crescent | a rune plate crackling with an electric crescent, colour accent crackling yellow lightning (#ffe066). |
| `gate_of_treasures` | 宝库之门 | 技能栏、技能提示（主动技能） | portal | a golden swirling portal with a sword blade emerging from its centre, colour accent steel and bone tones (#d8c6a4). |
| `treasure_shot` | 宝具 | 触发技能（提示、图鉴里出现） | thrown-spear | an ornate golden spear flying out of a gold ripple, colour accent steel and bone tones (#d8c6a4). |
| `treasure_fall` | 天降宝具 | 触发技能（提示、图鉴里出现） | sword-in-stone | a jeweled sword plunging down from the sky into the ground, colour accent steel and bone tones (#d8c6a4). |
| `sundering_star` | 开天之光 | 触发技能（提示、图鉴里出现） | sun-spear | a red-gold beam of light splitting the sky, colour accent steel and bone tones (#d8c6a4). |
| `fuse_bolt` | 引信弹 | 技能栏、技能提示（主动技能） | unlit-bomb | a lit bomb fuse sparking, colour accent blazing orange-red fire (#ff8a3d). |
| `sow_seed` | 播种 | 技能栏、技能提示（主动技能） | sprout | a thorny sapling sprouting from a glowing seed. |
| `singularity` | 引力奇点 | 技能栏、技能提示（主动技能） | vortex | a black hole pulling debris into a violet spiral, colour accent violet chaos energy (#c39bff). |
| `dominion_lash` | 统御之鞭 | 技能栏、技能提示（主动技能） | whip | a barbed whip cracking with violet energy, colour accent steel and bone tones (#d8c6a4). |
| `call_storm` | 唤云 | 技能栏、技能提示（主动技能） | lightning-storm | a dark storm cloud with lightning. |
| `rime_lance` | 霜矛 | 技能栏、技能提示（主动技能） | ice-spear | a long spear of ice, colour accent icy pale-blue frost (#8fd8ff). |
| `fuse_blast` | 引爆 | 触发技能（提示、图鉴里出现） | explosion-rays | a chain of explosions going off one after another, colour accent blazing orange-red fire (#ff8a3d). |
| `thorn_volley` | 荆棘 | 触发技能（提示、图鉴里出现） | thorn-helix | a volley of thorns shot from a twisted branch, colour accent steel and bone tones (#d8c6a4). |
| `thorn_ring` | 荆刺 | 触发技能（提示、图鉴里出现） | thorny-vine | a ring of thorny vines bursting outward, colour accent steel and bone tones (#d8c6a4). |
| `collapse` | 坍缩 | 触发技能（提示、图鉴里出现） | black-hole-bolas | a black hole collapsing into a violet shockwave, colour accent violet chaos energy (#c39bff). |
| `cloud_bolt` | 云雷 | 触发技能（提示、图鉴里出现） | lightning-branches | lightning striking down from a small cloud, colour accent crackling yellow lightning (#ffe066). |
| `cloud_arc` | 云间电弧 | 触发技能（提示、图鉴里出现） | lightning-arc | lightning arcing between clouds, colour accent crackling yellow lightning (#ffe066). |
| `echo_nova` | 回声寒环 | 触发技能（提示、图鉴里出现） | ice-spell-cast | a frost ring expanding around a ghostly echo of a mage, colour accent icy pale-blue frost (#8fd8ff). |
| `summon_wolves` | 狼群 | 技能栏、技能提示（主动技能） | wolf-howl | a shadow wolf howling. |
| `blood_pact` | 血契 | 技能栏、技能提示（主动技能） | bleeding-heart | a bleeding heart bound by a chain. |
| `soul_reap` | 收魂 | 技能栏、技能提示（主动技能） | scythe | a dark scythe harvesting a wisp of a soul, colour accent steel and bone tones (#d8c6a4). |
| `frost_trail` | 冰痕 | 触发技能（提示、图鉴里出现） | ice-spell-cast | a trail of frost footprints, colour accent icy pale-blue frost (#8fd8ff). |
| `step_arc` | 迹电 | 触发技能（提示、图鉴里出现） | lightning-arc | a small spark trailing a footstep, colour accent crackling yellow lightning (#ffe066). |
| `void_rift` | 虚空裂隙 | 触发技能（提示、图鉴里出现） | vortex | a tear in space with violet void inside, colour accent violet chaos energy (#c39bff). |
| `shield_shatter` | 碎盾寒潮 | 触发技能（提示、图鉴里出现） | shield-disabled | a cracked shield releasing a cold blast. |
| `shield_pulse` | 满盾电涌 | 触发技能（提示、图鉴里出现） | electric | a full shield emitting an electric pulse. |

## 装备基底（26）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `war_staff` | 战杖 | 背包格、装备位、物品提示（同一基底的所有装备） | wizard-staff | a tall war staff topped with a glowing crystal. |
| `wand` | 法杖 | 背包格、装备位、物品提示（同一基底的所有装备） | crystal-wand | a slender crystal wand. |
| `maul` | 重锤 | 背包格、装备位、物品提示（同一基底的所有装备） | flat-hammer | a heavy two-handed maul. |
| `dagger` | 匕首 | 背包格、装备位、物品提示（同一基底的所有装备） | plain-dagger | a curved dagger. |
| `tower_shield` | 塔盾 | 背包格、装备位、物品提示（同一基底的所有装备） | round-shield | a large tower shield with a gold rim. |
| `focus` | 法器 | 背包格、装备位、物品提示（同一基底的所有装备） | crystal-ball | a crystal orb floating above a small claw stand. |
| `quiver` | 箭袋 | 背包格、装备位、物品提示（同一基底的所有装备） | thrown-daggers | a leather quiver full of arrows. |
| `iron_helm` | 铁盔 | 背包格、装备位、物品提示（同一基底的所有装备） | barbute | a heavy iron knight helm. |
| `silk_hood` | 丝帽 | 背包格、装备位、物品提示（同一基底的所有装备） | hood | a silk mage hood with embroidered runes. |
| `leather_cap` | 皮帽 | 背包格、装备位、物品提示（同一基底的所有装备） | light-helm | a leather rogue cap. |
| `plate` | 板甲 | 背包格、装备位、物品提示（同一基底的所有装备） | chest-armor | a full plate chest armor. |
| `robe` | 法袍 | 背包格、装备位、物品提示（同一基底的所有装备） | robe | an embroidered sorcerer robe. |
| `leather` | 皮衣 | 背包格、装备位、物品提示（同一基底的所有装备） | leather-vest | a studded leather vest. |
| `gauntlets` | 铁手 | 背包格、装备位、物品提示（同一基底的所有装备） | mailed-fist | armored steel gauntlets. |
| `silk_gloves` | 丝手 | 背包格、装备位、物品提示（同一基底的所有装备） | gloves | silk spellcaster gloves with rune stitching. |
| `wraps` | 缠手 | 背包格、装备位、物品提示（同一基底的所有装备） | fist | cloth fist wraps. |
| `greaves` | 铁靴 | 背包格、装备位、物品提示（同一基底的所有装备） | leg-armor | iron armored boots. |
| `slippers` | 丝靴 | 背包格、装备位、物品提示（同一基底的所有装备） | boots | soft silk boots. |
| `treads` | 皮靴 | 背包格、装备位、物品提示（同一基底的所有装备） | leather-boot | leather traveller boots. |
| `heavy_belt` | 重带 | 背包格、装备位、物品提示（同一基底的所有装备） | belt-armor | a thick plated belt with a big buckle. |
| `chain_belt` | 链带 | 背包格、装备位、物品提示（同一基底的所有装备） | belt | a belt made of linked chains. |
| `jade_amulet` | 玉坠 | 背包格、装备位、物品提示（同一基底的所有装备） | gem-necklace | a jade amulet on a gold chain. |
| `onyx_amulet` | 玛瑙坠 | 背包格、装备位、物品提示（同一基底的所有装备） | gem-pendant | a black onyx pendant. |
| `ruby_ring` | 红玉戒 | 背包格、装备位、物品提示（同一基底的所有装备） | ring | a gold ring with a ruby. |
| `sapphire_ring` | 蓝玉戒 | 背包格、装备位、物品提示（同一基底的所有装备） | diamond-ring | a silver ring with a sapphire. |
| `topaz_ring` | 黄玉戒 | 背包格、装备位、物品提示（同一基底的所有装备） | ring-mould | a gold ring with a yellow topaz. |

## 空装备位（9）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `weapon` | 武器 | 角色面板上空着的装备位（会画成半透明的灰色） | wizard-staff | a tall war staff topped with a glowing crystal. |
| `offhand` | 副手 | 角色面板上空着的装备位（会画成半透明的灰色） | round-shield | a large tower shield with a gold rim. |
| `helmet` | 头盔 | 角色面板上空着的装备位（会画成半透明的灰色） | barbute | a heavy iron knight helm. |
| `chest` | 胸甲 | 角色面板上空着的装备位（会画成半透明的灰色） | chest-armor | a full plate chest armor. |
| `gloves` | 手套 | 角色面板上空着的装备位（会画成半透明的灰色） | gloves | armored steel gauntlets. |
| `boots` | 鞋子 | 角色面板上空着的装备位（会画成半透明的灰色） | leather-boot | leather traveller boots. |
| `belt` | 腰带 | 角色面板上空着的装备位（会画成半透明的灰色） | belt | a belt made of linked chains. |
| `amulet` | 项链 | 角色面板上空着的装备位（会画成半透明的灰色） | gem-pendant | a black onyx pendant. |
| `ring1` | 戒指 | 角色面板上空着的装备位（会画成半透明的灰色） | ring | a gold ring with a ruby. |

## 通货（10）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `augment` | 魔晶 | 背包、通货页、洗炼：添加一条随机词条（不足 6 条时） | crystal-cluster | a small cluster of glowing blue crystals. |
| `chaos` | 混沌石 | 背包、通货页、洗炼：重洗全部随机词条（未封印的），条数不变 | vortex | a swirling chaos orb with violet and gold. |
| `upgrade` | 灵石 | 背包、通货页、洗炼：随机一条随机词条 T 阶 +1 | upgrade | a luminous spirit stone with an upward arrow rune. |
| `annul` | 无效石 | 背包、通货页、洗炼：随机移除一条未封印的随机词条 | broken-shield | a dull grey stone with a crack and a cancel rune. |
| `seal` | 封印符 | 背包、通货页、洗炼：封印选中的词条或特性：重洗不会动它 | rune-stone | a talisman paper seal with a red stamp. |
| `temper` | 淬火石 | 背包、通货页、洗炼：选中的特性 T 阶 +1（不超过本件上限） | anvil-impact | a tempering stone glowing on an anvil. |
| `essence_form` | 形态精华 | 背包、通货页、洗炼：把选中的特性重铸为随机形态特性 | fire-gem | a blue-white crystal essence vial with a swirl rune. |
| `essence_link` | 联动精华 | 背包、通货页、洗炼：把选中的特性重铸为随机联动特性（物品 T3+） | emerald | a green crystal essence linked by a chain motif. |
| `essence_core` | 核心精华 | 背包、通货页、洗炼：把选中的特性重铸为随机核心特性（物品 T6+） | diamond-hard | a radiant gold-white diamond essence like a small sun. |
| `skill_gem` | 技能石 | 背包、通货页、洗炼：重铸装备上的主动技能（同底材技能池） | gems | a faceted multicolor skill gem. |

## 传奇（可选，现在借用基底图标）（26）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `pyre_staff` | 焚城之杖 | 传奇物品（现在用基底图标 wizard-staff）：火球命中时 30% 几率从命中处再射出一发火球（每秒最多 6 次）　「城墙烧塌的那一夜，火焰学会了自己找路。」 | wizard-staff | a tall war staff topped with a glowing crystal, a unique legendary version named "pyre staff", ornate and one of a kind, glowing with blazing orange-red fire (#ff8a3d), amber legendary aura. |
| `rime_wand` | 霜语 | 传奇物品（现在用基底图标 crystal-wand）：寒冰弹穿透所有敌人，命中必定冰冻，冰冻时间翻倍　「它说的每一个字，都会在空气里结霜。」 | crystal-wand | a slender crystal wand, a unique legendary version named "rime wand", ornate and one of a kind, glowing with icy pale-blue frost (#8fd8ff), amber legendary aura. |
| `thunder_maul` | 雷鸣之锤 | 传奇物品（现在用基底图标 flat-hammer）：每 2 秒获得 1 个能量球；能量球上限 +2；崩雷鸣的闪电感电　「锤落之处，天空记得回响。」 | flat-hammer | a heavy two-handed maul, a unique legendary version named "thunder maul", ornate and one of a kind, glowing with crackling yellow lightning (#ffe066), amber legendary aura. |
| `shadow_fang` | 影牙 | 传奇物品（现在用基底图标 plain-dagger）：位移技能没有冷却；每次闪现落地召唤一把灵刃（最多 8 把）　「你看见它的时候，它已经在你身后了。」 | plain-dagger | a curved dagger, a unique legendary version named "shadow fang", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `gale_cleaver` | 狂岚 | 传奇物品（现在用基底图标 flat-hammer）：引导时每 0.5 秒向四周掷出一圈 8 道刀锋　「风暴的中心最安静，安静得只剩刀声。」 | flat-hammer | a heavy two-handed maul, a unique legendary version named "gale cleaver", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `storm_scepter` | 天穹权杖 | 传奇物品（现在用基底图标 wizard-staff）：电弧连锁 +5 次，每次连锁 +1 次分叉　「握住它，就是握住一整片雷雨。」 | wizard-staff | a tall war staff topped with a glowing crystal, a unique legendary version named "storm scepter", ornate and one of a kind, glowing with crackling yellow lightning (#ffe066), amber legendary aura. |
| `eye_of_storm` | 风暴之眼 | 传奇物品（现在用基底图标 wizard-staff）：龙卷风 +1 道；龙卷风命中时 20% 几率在命中处分裂出一道新的龙卷风（每秒最多 3 次）　「风暴的中心最安静——直到它决定换个地方。」 | wizard-staff | a tall war staff topped with a glowing crystal, a unique legendary version named "eye of storm", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `glacier_wall` | 冰川之壁 | 传奇物品（现在用基底图标 round-shield）：+12% 格挡几率；格挡时在身边掀起寒潮（冷却 0.4 秒）　「万年不化的冰，挡得住一切，也冻得住一切。」 | round-shield | a large tower shield with a gold rim, a unique legendary version named "glacier wall", ornate and one of a kind, glowing with icy pale-blue frost (#8fd8ff), amber legendary aura. |
| `legion_focus` | 万象 | 传奇物品（现在用基底图标 crystal-ball）：召唤物上限 +4；召唤物死亡时爆炸，造成其最大生命 120% 的物理伤害　「一即是万，万归于一。」 | crystal-ball | a crystal orb floating above a small claw stand, a unique legendary version named "legion focus", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `mad_crown` | 狂王之冠 | 传奇物品（现在用基底图标 barbute）：狂怒球上限 +3；击杀时获得狂怒球；每个狂怒球使范围扩大 6%　「王冠越重，杀意越轻。」 | barbute | a heavy iron knight helm, a unique legendary version named "mad crown", ornate and one of a kind, glowing with blazing orange-red fire (#ff8a3d), amber legendary aura. |
| `thousand_faces` | 千面 | 传奇物品（现在用基底图标 hood）：法术额外重复 1 次；施法速度降低 15%（更多）　「每一张脸都在念同一句咒。」 | hood | a silk mage hood with embroidered runes, a unique legendary version named "thousand faces", ornate and one of a kind, glowing with icy pale-blue frost (#8fd8ff), amber legendary aura. |
| `undying_plate` | 不灭之铠 | 传奇物品（现在用基底图标 chest-armor）：生命低于 40% 时被击中，获得护体与猛攻并回复 25% 生命（冷却 8 秒）　「它被打穿过一百次，每一次都自己合上了。」 | chest-armor | a full plate chest armor, a unique legendary version named "undying plate", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `starweave_robe` | 星辰法袍 | 传奇物品（现在用基底图标 robe）：能量护盾提高 60%；能量护盾全满时法术伤害提高 30%（更多）　「把夜空穿在身上的人，不怕任何一颗星落下。」 | robe | an embroidered sorcerer robe, a unique legendary version named "starweave robe", ornate and one of a kind, glowing with icy pale-blue frost (#8fd8ff), amber legendary aura. |
| `nightveil` | 夜幕 | 传奇物品（现在用基底图标 leather-vest）：闪避提高 80%；闪避攻击时向攻击者掷出蝰蛇飞刃　「黑暗不躲闪。是你看不见它。」 | leather-vest | a studded leather vest, a unique legendary version named "nightveil", ornate and one of a kind, glowing with violet chaos energy (#c39bff), amber legendary aura. |
| `stormcaller` | 引雷之手 | 传奇物品（现在用基底图标 mailed-fist）：攻击命中感电敌人时在其头顶落雷（冷却 0.25 秒）　「举起手，雷就落下。」 | mailed-fist | armored steel gauntlets, a unique legendary version named "stormcaller", ornate and one of a kind, glowing with crackling yellow lightning (#ffe066), amber legendary aura. |
| `alchemist` | 炼金之手 | 传奇物品（现在用基底图标 gloves）：中毒敌人死亡时，全部毒层以双倍强度扩散到 3 个附近敌人　「毒不会消失，只会换个主人，变得更浓。」 | gloves | silk spellcaster gloves with rune stitching, a unique legendary version named "alchemist", ornate and one of a kind, glowing with violet chaos energy (#c39bff), amber legendary aura. |
| `bonebreaker` | 碎骨 | 传奇物品（现在用基底图标 fist）：打击技能额外命中 3 个敌人，并溅射周围 160 范围　「一拳下去，碎的从来不止一个。」 | fist | cloth fist wraps, a unique legendary version named "bonebreaker", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `windstride` | 疾风之靴 | 传奇物品（现在用基底图标 leather-boot）：移动速度提高 30%；每移动 4 米向最近的敌人施放你的主技能　「跑起来，剩下的交给风。」 | leather-boot | leather traveller boots, a unique legendary version named "windstride", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `frostwalker` | 霜行者 | 传奇物品（现在用基底图标 boots）：每移动 1.5 米在脚下掀起寒潮　「她走过的地方，春天要晚来一个月。」 | boots | soft silk boots, a unique legendary version named "frostwalker", ornate and one of a kind, glowing with icy pale-blue frost (#8fd8ff), amber legendary aura. |
| `warlord_belt` | 战神腰带 | 传奇物品（现在用基底图标 belt-armor）：击杀获得 3 点杀意（最多 30，脱战消退）；每点杀意使伤害提高 2%（更多）　「杀得越多，手越稳。」 | belt-armor | a thick plated belt with a big buckle, a unique legendary version named "warlord belt", ornate and one of a kind, glowing with blazing orange-red fire (#ff8a3d), amber legendary aura. |
| `iron_chain` | 铁链 | 传奇物品（现在用基底图标 belt）：被击中时获得耐力球；每个耐力球使护甲提高 25%，受到伤害降低 3%　「锁住的不是身体，是退路。」 | belt | a belt made of linked chains, a unique legendary version named "iron chain", ornate and one of a kind, glowing with steel and bone tones (#d8c6a4), amber legendary aura. |
| `heart_of_winter` | 永冬之心 | 传奇物品（现在用基底图标 gem-pendant）：击碎冰冻的敌人时在原地掀起寒潮，寒潮必定冰冻（首领只冻一瞬）　「「冬天从不进攻。它只是等，等你的心跳慢下来。」」 | gem-pendant | a black onyx pendant, a unique legendary version named "heart of winter", ornate and one of a kind, glowing with icy pale-blue frost (#8fd8ff), amber legendary aura. |
| `eye_of_three` | 三相之眼 | 传奇物品（现在用基底图标 gem-necklace）：你施加的任何元素异常同时附带感电与冰缓　「一只眼看见火，一只看见冰，第三只看见雷。」 | gem-necklace | a jade amulet on a gold chain, a unique legendary version named "eye of three", ornate and one of a kind, glowing with crackling yellow lightning (#ffe066), amber legendary aura. |
| `echo_ring` | 回响之戒 | 传奇物品（现在用基底图标 diamond-ring）：击杀时 20% 几率从尸体重放你的主技能（每秒最多 5 次）　「每一声倒地，都是下一声的开始。」 | diamond-ring | a silver ring with a sapphire, a unique legendary version named "echo ring", ornate and one of a kind, glowing with icy pale-blue frost (#8fd8ff), amber legendary aura. |
| `ember_ring` | 余烬之戒 | 传奇物品（现在用基底图标 ring）：你的爆炸范围扩大 40% 并必定点燃　「火不会熄，只会睡着。」 | ring | a gold ring with a ruby, a unique legendary version named "ember ring", ornate and one of a kind, glowing with blazing orange-red fire (#ff8a3d), amber legendary aura. |
| `thunder_ring` | 雷环 | 传奇物品（现在用基底图标 ring-mould）：感电效果提高 50%；感电敌人死亡时向附近放出 3 道电弧（每秒最多 4 次）　「雷声从一个死人传到下一个。」 | ring-mould | a gold ring with a yellow topaz, a unique legendary version named "thunder ring", ornate and one of a kind, glowing with crackling yellow lightning (#ffe066), amber legendary aura. |

## 功能栏（10）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `quest` | 任务 | 右侧功能栏按钮 | quill-ink | a quill and ink pot. |
| `atlas` | 地图 | 右侧功能栏按钮 | treasure-map | a rolled treasure map. |
| `talents` | 天赋 | 右侧功能栏按钮 | skills | a branching skill tree. |
| `char` | 角色 | 右侧功能栏按钮 | person | a standing hero figure. |
| `bag` | 背包 | 右侧功能栏按钮 | knapsack | a backpack. |
| `craft` | 洗炼 | 右侧功能栏按钮 | anvil | an anvil. |
| `bd` | 流派 | 右侧功能栏按钮 | scroll-unfurled | an unfurled scroll. |
| `codex` | 传奇图鉴 | 右侧功能栏按钮 | laurel-crown | a laurel crown. |
| `vault` | 仓库 | 右侧功能栏按钮 | locked-chest | a locked treasure chest. |
| `settings` | 设置 | 右侧功能栏按钮 | cog | a cog wheel. |

## 地图类型（5）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `ember` | 余烬 | 地图类型（图集节点、地图信息） | campfire | a campfire. |
| `frost` | 霜原 | 地图类型（图集节点、地图信息） | ice-cube | an ice cube crystal. |
| `storm` | 雷暴 | 地图类型（图集节点、地图信息） | lightning-storm | a lightning storm cloud. |
| `blight` | 腐沼 | 地图类型（图集节点、地图信息） | poison-bottle | a poison bottle. |
| `ruin` | 遗迹 | 地图类型（图集节点、地图信息） | dungeon-gate | a ruined dungeon gate. |

## 图集特殊节点（4）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `boss` | 首领要塞 | 图集特殊节点：首领更强（生命 +50%），传奇几率 ×2.5，物品数量 +50%。 | crowned-skull | a crowned skull. |
| `vault` | 宝库 | 图集特殊节点：怪少一些，物品数量 ×2，传奇几率 ×3。 | locked-chest | a locked chest. |
| `corrupt` | 腐化 | 图集特殊节点：怪物生命 +35%、伤害 +30%；物品数量 +60%，传奇几率 ×2。 | evil-moon | an evil crescent moon. |
| `trial` | 试炼 | 图集特殊节点：怪群规模 ×1.8，精英更多。清屏的地方。 | crossed-swords | crossed swords. |

## 特性层（3）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `form` | 形态 | 装备特性的三层（提示里的小标） | magic-swirl | a magic swirl. |
| `link` | 联动 | 装备特性的三层（提示里的小标） | orbit | two orbits linked together. |
| `core` | 核心 | 装备特性的三层（提示里的小标） | sun | a radiant sun. |

## 资源与增益（9）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `power` | 能量球 | 左下角资源 / 增益 | sparkles | sparkling power orb. |
| `frenzy` | 狂怒球 | 左下角资源 / 增益 | flaming-claw | a flaming claw. |
| `endurance` | 耐力球 | 左下角资源 / 增益 | checked-shield | a shield with a check mark. |
| `burst` | 迸发 | 左下角资源 / 增益 | bolt-spell-cast | a spell burst. |
| `rage` | 杀意 | 左下角资源 / 增益 | skull-crossed-bones | a skull with crossed bones. |
| `onslaught` | 猛攻 | 左下角资源 / 增益 | run | a running figure. |
| `fortify` | 护体 | 左下角资源 / 增益 | shield-reflect | a reflecting shield. |
| `thunder_ready` | 雷霆蓄势 | 左下角资源 / 增益 | lightning-helix | a lightning helix. |
| `superconduct` | 超导 | 左下角资源 / 增益 | electric | electric sparks. |

## 状态标记（20）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `ignited` | 燃 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a flame. |
| `poisoned` | 毒 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a poison drop. |
| `bleeding` | 血 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a blood drop. |
| `shocked` | 电 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a lightning bolt. |
| `chilled` | 缓 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a snowflake. |
| `frozen` | 冻 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | an ice block. |
| `electrocuted` | 击 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a star of electricity (stunned). |
| `brittle` | 脆 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a cracked crystal. |
| `sapped` | 疲 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a drained battery-like rune. |
| `scorched` | 灼 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a scorched mark. |
| `superconduct` | 导 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a frost and lightning intertwined. |
| `enraged` | 狂 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a roaring angry face. |
| `alerted` | 警 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | an exclamation mark eye. |
| `frostbite` | 冻 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a frost bitten claw. |
| `onslaught` | 猛 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | speed lines. |
| `fortify` | 护 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a raised shield. |
| `thunder_ready` | 雷 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a charging thunder. |
| `primed` | 引 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a lit fuse. |
| `chained` | 锁 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | golden chains. |
| `overgrown` | 长 | 怪物头顶的状态小标（现在是一个汉字） | （文字） | a growing leaf. |

## 其它（3）

| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |
|---|---|---|---|---|
| `waystone` | 路石 | 地图装置里的路石、掉落 | stone-tablet | an engraved stone tablet glowing with a map rune. |
| `town_portal` | 传送回家 | 左下角传送按钮、家里回到地图的传送门 | magic-portal | a blue swirling town portal. |
| `stash_chest` | 仓库 | 家里的仓库宝箱 | locked-chest | an ornate gold-trimmed treasure chest. |
