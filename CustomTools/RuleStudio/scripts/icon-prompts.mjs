// 图标清单 + 文生图提示词：把游戏里用到的每一个图标列出来（分类、id、中文名、用途、现在用的 game-icons 名），
// 每个配一条英文提示词（统一画风 + 这个图标画什么）。生成 design/icons/icon-prompts.md（给人看）和 design/icons/icon-prompts.json（批量跑图），出好的图也放在 design/icons/<分类>/<id>.png。
//   node scripts/icon-prompts.mjs
import { writeFileSync } from 'node:fs';
import * as I from '../public/game/icons.mjs';
import { STATUS_LOOK } from '../public/game/run.mjs';
import { NODE_KINDS } from '../public/game/atlas.mjs';
import { gameContent } from '../core/content/game.mjs';
import { CURRENCIES, ITEM_SKILLS, BASES, SLOT_NAMES } from '../core/content/items.mjs';
import { LEGENDARIES } from '../core/content/legendaries.mjs';

const content = gameContent();

// ---------------------------------------------------------------- style
// 两种画风：painted（技能、装备、通货、传奇：有体积的手绘物件）与 emblem（功能按钮、增益、状态、地图标记：单色金徽记，代码里还会再按主题上色）。
const STYLE = {
  painted: 'hand-painted dark fantasy ARPG icon, a single centered subject, strong readable silhouette at 48 px, dramatic rim light, deep navy background (#0b1224) fading to black at the edges, subtle gold filigree accents, painterly texture with crisp edges, high contrast, square 1:1',
  emblem: 'flat game UI emblem, one bold silhouette symbol, solid white on a pure black background, no shading, no gradient, clean vector edges, thick shapes readable at 32 px, centered with generous padding, square 1:1',
};
const NEGATIVE = 'text, letters, numbers, watermark, signature, border, frame, UI panel, multiple objects, character portrait, photo, 3d render, blurry, low contrast, cropped subject';
const EL = { fire: 'blazing orange-red fire (#ff8a3d)', cold: 'icy pale-blue frost (#8fd8ff)', lightning: 'crackling yellow lightning (#ffe066)', chaos: 'violet chaos energy (#c39bff)', physical: 'steel and bone tones (#d8c6a4)', phys: 'steel and bone tones (#d8c6a4)' };

// ---------------------------------------------------------------- what each icon shows
const SKILL = {
  fireball: 'a roaring fireball with a comet tail', ice_nova: 'a burst ring of ice shards exploding outward from a frozen core', arc: 'a forking arc of lightning jumping between three points',
  spark: 'small erratic sparks of electricity bouncing like fireflies', frost_bolt: 'a sharp icicle bolt flying with a frosty trail', flame_wall: 'a wall of flames rising from the ground',
  heavy_strike: 'a massive warhammer slamming down with an impact shockwave', cleave: 'a wide crescent slash of an axe blade', cyclone: 'a spinning whirlwind of blades around a warrior silhouette',
  falling_thunder: 'a war hammer charged with lightning striking the ground', flicker_strike: 'a dagger strike leaving afterimages of teleport flashes', viper_knives: 'a fan of green poison-dripping throwing knives',
  summon_blades: 'a ring of floating ghostly swords', storm_totem_place: 'a carved stone totem crackling with lightning', glacial_burst: 'a wave of frost bursting from a shattered ice orb',
  tornado: 'a towering grey tornado tearing up debris', thunder_fall: 'a lightning bolt falling straight from a dark cloud', ice_spike_burst: 'ice spikes erupting from the ground in a cluster',
  flame_burst: 'a round explosion of fire', blade_ring: 'eight blades flying outward in a ring', ground_slam: 'a fist hitting the ground, cracks radiating out',
  storm_step: 'a lightning-wreathed footstep dash', frost_dash: 'a figure dashing forward leaving a trail of ice', phantom_step: 'a shadow afterimage left behind a dashing figure',
  star_step: 'a burst of star-shaped blades around a blink flash', void_leap: 'a purple void portal swallowing a leaping figure',
  aegis_nova: 'an energy shield exploding into a shockwave', shield_bash: 'a shield smashing forward with impact lines', aegis_shards: 'a shield shattering into three flying ice blades',
  raise_skeletons: 'skeletal hands rising from the ground', summon_golem: 'a molten lava golem head with glowing eyes', summon_archers: 'a ghostly skeletal archer drawing a bow',
  summon_spiders: 'a cluster of green venomous spiders hatching', summon_wisps: 'small glowing frost wisps orbiting', summon_wolves: 'a shadow wolf howling', blood_pact: 'a bleeding heart bound by a chain',
  soul_reap: 'a dark scythe harvesting a wisp of a soul',
  fire_trap: 'a spiked mine glowing with fire runes', frost_trap: 'a frozen rune trap with an ice crystal core', blade_trap: 'a spinning circular saw trap on the floor', snare_shot: 'an arrow with a steel bear trap at the tip',
  turret_trap: 'a small wooden ballista unfolding from a trap', shock_trap: 'a rune plate crackling with an electric crescent',
  gate_of_treasures: 'a golden swirling portal with a sword blade emerging from its centre', treasure_shot: 'an ornate golden spear flying out of a gold ripple', treasure_fall: 'a jeweled sword plunging down from the sky into the ground',
  sundering_star: 'a red-gold beam of light splitting the sky', fuse_bolt: 'a lit bomb fuse sparking', fuse_blast: 'a chain of explosions going off one after another', sow_seed: 'a thorny sapling sprouting from a glowing seed',
  thorn_volley: 'a volley of thorns shot from a twisted branch', thorn_ring: 'a ring of thorny vines bursting outward', singularity: 'a black hole pulling debris into a violet spiral', collapse: 'a black hole collapsing into a violet shockwave',
  dominion_lash: 'a barbed whip cracking with violet energy', call_storm: 'a dark storm cloud with lightning', cloud_bolt: 'lightning striking down from a small cloud', cloud_arc: 'lightning arcing between clouds',
  rime_lance: 'a long spear of ice', echo_nova: 'a frost ring expanding around a ghostly echo of a mage',
  frost_trail: 'a trail of frost footprints', step_arc: 'a small spark trailing a footstep', void_rift: 'a tear in space with violet void inside', shield_shatter: 'a cracked shield releasing a cold blast', shield_pulse: 'a full shield emitting an electric pulse',
};
const BASE = {
  war_staff: 'a tall war staff topped with a glowing crystal', wand: 'a slender crystal wand', maul: 'a heavy two-handed maul', dagger: 'a curved dagger',
  tower_shield: 'a large tower shield with a gold rim', focus: 'a crystal orb floating above a small claw stand', quiver: 'a leather quiver full of arrows',
  iron_helm: 'a heavy iron knight helm', silk_hood: 'a silk mage hood with embroidered runes', leather_cap: 'a leather rogue cap',
  plate: 'a full plate chest armor', robe: 'an embroidered sorcerer robe', leather: 'a studded leather vest',
  gauntlets: 'armored steel gauntlets', silk_gloves: 'silk spellcaster gloves with rune stitching', wraps: 'cloth fist wraps',
  greaves: 'iron armored boots', slippers: 'soft silk boots', treads: 'leather traveller boots',
  heavy_belt: 'a thick plated belt with a big buckle', chain_belt: 'a belt made of linked chains',
  jade_amulet: 'a jade amulet on a gold chain', onyx_amulet: 'a black onyx pendant',
  ruby_ring: 'a gold ring with a ruby', sapphire_ring: 'a silver ring with a sapphire', topaz_ring: 'a gold ring with a yellow topaz',
};
const CUR = {
  augment: 'a small cluster of glowing blue crystals', chaos: 'a swirling chaos orb with violet and gold', upgrade: 'a luminous spirit stone with an upward arrow rune', annul: 'a dull grey stone with a crack and a cancel rune',
  seal: 'a talisman paper seal with a red stamp', temper: 'a tempering stone glowing on an anvil', essence_form: 'a blue-white crystal essence vial with a swirl rune', essence_link: 'a green crystal essence linked by a chain motif',
  essence_core: 'a radiant gold-white diamond essence like a small sun', skill_gem: 'a faceted multicolor skill gem',
};
const PANEL = { atlas: 'a rolled treasure map', talents: 'a branching skill tree', char: 'a standing hero figure', bag: 'a backpack', quest: 'a quill and ink pot', craft: 'an anvil', bd: 'an unfurled scroll', codex: 'a laurel crown', vault: 'a locked treasure chest', settings: 'a cog wheel' };
const FAMILY = { ember: 'a campfire', frost: 'an ice cube crystal', storm: 'a lightning storm cloud', blight: 'a poison bottle', ruin: 'a ruined dungeon gate' };
const LAYER = { form: 'a magic swirl', link: 'two orbits linked together', core: 'a radiant sun' };
const BUFF = { power: 'sparkling power orb', frenzy: 'a flaming claw', endurance: 'a shield with a check mark', burst: 'a spell burst', rage: 'a skull with crossed bones',
  onslaught: 'a running figure', fortify: 'a reflecting shield', thunder_ready: 'a lightning helix', superconduct: 'electric sparks' };
const STATUS = {
  ignited: 'a flame', poisoned: 'a poison drop', bleeding: 'a blood drop', shocked: 'a lightning bolt', chilled: 'a snowflake', frozen: 'an ice block', electrocuted: 'a star of electricity (stunned)',
  brittle: 'a cracked crystal', sapped: 'a drained battery-like rune', scorched: 'a scorched mark', superconduct: 'a frost and lightning intertwined', enraged: 'a roaring angry face', alerted: 'an exclamation mark eye',
  frostbite: 'a frost bitten claw', onslaught: 'speed lines', fortify: 'a raised shield', thunder_ready: 'a charging thunder', primed: 'a lit fuse', chained: 'golden chains', overgrown: 'a growing leaf',
};
const NODE = { boss: 'a crowned skull', vault: 'a locked chest', corrupt: 'an evil crescent moon', trial: 'crossed swords' };
const MISC = [
  ['waystone', '路石', '地图装置里的路石、掉落', 'stone-tablet', 'an engraved stone tablet glowing with a map rune', 'painted'],
  ['town_portal', '传送回家', '左下角传送按钮、家里回到地图的传送门', 'magic-portal', 'a blue swirling town portal', 'painted'],
  ['stash_chest', '仓库', '家里的仓库宝箱', 'locked-chest', 'an ornate gold-trimmed treasure chest', 'painted'],
];

// ---------------------------------------------------------------- the list
const rows = [];
const add = (cat, id, name, use, now, subject, style, extra = '') => rows.push({ cat, id, name, use, now, file: `design/icons/${cat}/${id}.png`, style,
  prompt: `${STYLE[style]}. Subject: ${subject}${extra ? ', ' + extra : ''}.`, negative: NEGATIVE });

const skillEl = id => { const d = content.skills.get(id)?.damage ?? {}; let best = null, v = -1; for (const [k, x] of Object.entries(d)) if (typeof x === 'number' && x > v) { v = x; best = k; } return best; };
for (const [id, now] of Object.entries(I.GAME_ICONS.skill)) {
  const el = skillEl(id), active = ITEM_SKILLS.includes(id);
  add('skill', id, content.skills.get(id)?.name ?? id, active ? '技能栏、技能提示（主动技能）' : '触发技能（提示、图鉴里出现）', now, SKILL[id] ?? id, 'painted', el ? `colour accent ${EL[el]}` : '');
}
for (const [id, now] of Object.entries(I.GAME_ICONS.base)) {
  const b = Object.values(BASES).flat().find(x => x.id === id);
  add('base', id, b?.name ?? id, '背包格、装备位、物品提示（同一基底的所有装备）', now, BASE[id] ?? id, 'painted');
}
for (const [id, now] of Object.entries(I.GAME_ICONS.slot)) if (id !== 'ring2') add('slot', id, SLOT_NAMES[id] ?? id, '角色面板上空着的装备位（会画成半透明的灰色）', now, BASE[{ weapon: 'war_staff', offhand: 'tower_shield', helmet: 'iron_helm', chest: 'plate', gloves: 'gauntlets', boots: 'treads', belt: 'chain_belt', amulet: 'onyx_amulet', ring1: 'ruby_ring' }[id]], 'emblem');
for (const [id, now] of Object.entries(I.GAME_ICONS.currency)) add('currency', id, CURRENCIES[id].name, `背包、通货页、洗炼：${CURRENCIES[id].desc}`, now, CUR[id], 'painted');
for (const L of LEGENDARIES) add('legendary', L.id, L.name, `传奇物品（现在用基底图标 ${I.GAME_ICONS.base[L.base]}）：${L.legend.text}　「${L.flavor}」`, I.GAME_ICONS.base[L.base], `${BASE[L.base]}, a unique legendary version named "${L.id.replace(/_/g, ' ')}", ornate and one of a kind`, 'painted', `glowing with ${EL[L.theme] ?? EL.physical}, amber legendary aura`);
for (const [id, now] of Object.entries(I.GAME_ICONS.panel)) add('panel', id, { atlas: '地图', talents: '天赋', char: '角色', bag: '背包', quest: '任务', craft: '洗炼', bd: '流派', codex: '传奇图鉴', vault: '仓库', settings: '设置' }[id], '右侧功能栏按钮', now, PANEL[id], 'emblem');
for (const [id, now] of Object.entries(I.GAME_ICONS.family)) add('family', id, { ember: '余烬', frost: '霜原', storm: '雷暴', blight: '腐沼', ruin: '遗迹' }[id] ?? id, '地图类型（图集节点、地图信息）', now, FAMILY[id], 'emblem');
for (const [id, k] of Object.entries(NODE_KINDS)) if (k.icon) add('node', id, k.name, `图集特殊节点：${k.text}`, k.icon, NODE[id] ?? k.icon, 'emblem');
for (const [id, now] of Object.entries(I.GAME_ICONS.layer)) add('layer', id, { form: '形态', link: '联动', core: '核心' }[id], '装备特性的三层（提示里的小标）', now, LAYER[id], 'emblem');
for (const [id, now] of Object.entries(I.GAME_ICONS.buff)) add('buff', id, { power: '能量球', frenzy: '狂怒球', endurance: '耐力球', burst: '迸发', rage: '杀意', onslaught: '猛攻', fortify: '护体', thunder_ready: '雷霆蓄势', superconduct: '超导' }[id] ?? id, '左下角资源 / 增益', now, BUFF[id], 'emblem');
for (const [id, look] of Object.entries(STATUS_LOOK)) add('status', id, look.glyph, '怪物头顶的状态小标（现在是一个汉字）', '（文字）', STATUS[id] ?? id, 'emblem');
for (const [id, name, use, now, subject, style] of MISC) add('misc', id, name, use, now, subject, style);

// ---------------------------------------------------------------- write
const CAT = { skill: '技能', base: '装备基底', slot: '空装备位', currency: '通货', legendary: '传奇（可选，现在借用基底图标）', panel: '功能栏', family: '地图类型', node: '图集特殊节点', layer: '特性层', buff: '资源与增益', status: '状态标记', misc: '其它' };
const esc = s => String(s).replace(/\|/g, '\\|');
let md = `# 图标清单与文生图提示词

由 \`node scripts/icon-prompts.mjs\` 从代码里的图标表生成（${rows.length} 个）。改了图标表或新增技能后重新跑一遍即可。
批量跑图用同目录的 \`icon-prompts.json\`（每行：\`file\` 输出路径、\`prompt\`、\`negative\`）。

## 统一规格

- 尺寸 512 × 512 PNG，主体居中、四周留白约 10%，在 48 px 下也要认得出。
- **painted（技能、装备、通货、传奇、路石等）**：手绘暗黑奇幻风物件图标，深海军蓝底（#0b1224）向边缘压暗，金色轮廓光。底可以不透明。
- **emblem（功能栏、地图标记、增益、状态、空装备位）**：纯白剪影、纯黑底，无阴影无渐变。游戏里会把它当遮罩，用金色 / 稀有度 / 元素渐变上色（和现在一样），所以只要形状。
- 元素点缀色：火 #ff8a3d · 冰 #8fd8ff · 电 #ffe066 · 混沌 #c39bff · 物理 #d8c6a4；界面主色 金 #d8b46a / 亮金 #fbe7b0 / 深蓝 #060a18。
- 通用负面提示词：\`${NEGATIVE}\`

### 画风前缀（每条提示词都已经带上）

- painted：\`${STYLE.painted}\`
- emblem：\`${STYLE.emblem}\`

## 接入方式

出好的图先放在这个文件夹：\`design/icons/<分类>/<id>.png\`（分类和 id 见下表，JSON 里每条的 \`file\` 就是这个路径）。提示词是英文的，国内外的文生图工具都能直接用；传奇那一节的中文描述和题词可以一起给工具当参考。emblem 类可以直接替换现在的遮罩；painted 类要把对应图标从「遮罩上色」改为「直接贴图」，图到位后改一处 \`icons.mjs\` 就能切过去。

`;
for (const cat of Object.keys(CAT)) {
  const list = rows.filter(r => r.cat === cat); if (!list.length) continue;
  md += `\n## ${CAT[cat]}（${list.length}）\n\n| id | 名称 | 用在哪里 | 现在的图标 | 提示词（画什么） |\n|---|---|---|---|---|\n`;
  for (const r of list) md += `| \`${r.id}\` | ${esc(r.name)} | ${esc(r.use)} | ${esc(r.now)} | ${esc(r.prompt.slice(STYLE[r.style].length + 11))} |\n`;
}
writeFileSync(new URL('../design/icons/icon-prompts.md', import.meta.url), md);
writeFileSync(new URL('../design/icons/icon-prompts.json', import.meta.url), JSON.stringify({ style: STYLE, negative: NEGATIVE, size: [512, 512], icons: rows }, null, 1));
console.log(`${rows.length} icons → design/icons/icon-prompts.md, design/icons/icon-prompts.json`);
