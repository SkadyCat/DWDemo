// Icon plan for the 「六域星盘」 talents: one motif per icon key, packed nine to a
// 3×3 transparent atlas, with the exact Image Gen prompt for each sheet.
//   node scripts/talent-icons.mjs          write imagegen-plan.json + docs/talent-icons.md
//   node scripts/talent-icons.mjs --status list which sheets are present
// The talent page loads every sheet that exists and falls back to plain nodes otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_ROOT, RULES_DIR } from './rule-files.mjs';
import { TALENT_CONTENT } from './create-talent-tree.mjs';

export const ICON_DIR = path.join(TOOL_ROOT, 'public', 'talents', 'icons', 'six-domains');
const PUBLIC_DIR = '/talents/icons/six-domains';

// One short, concrete motif per icon. Colours follow the shared palette in the header.
const MOTIFS = {
  // Keystones
  'ks-frost-1': 'a frozen heart-shaped crystal of ice blue locked inside a thick frost ring',
  'ks-frost-2': 'an ice blue crystal shattering into three sharp shards',
  'ks-storm-1': 'a golden lightning bolt bursting out of a cracked crimson blood drop',
  'ks-storm-2': 'a golden lightning bolt zigzagging through three linked rings',
  'ks-flame-1': 'a wide orange wildfire spreading over three small flames in a row',
  'ks-flame-2': 'a crimson blood drop burning with a tall orange flame on top',
  'ks-blight-1': 'a jade green poison flask with three stacked drops rising above it',
  'ks-blight-2': 'a violet void spiral swallowing a jagged jade crack',
  'ks-iron-1': 'a crimson heart standing behind a thick iron shield',
  'ks-iron-2': 'two crossed iron axes over a cracked crimson heart',
  'ks-spirit-1': 'a teal crown floating above three small teal spirit wisps',
  'ks-spirit-2': 'a teal spirit wisp chained to a crimson blood drop',
  // Notables · frost
  'nt-frost-1': 'an ice blue spike piercing a snowflake',
  'nt-frost-2': 'a broad ice block with a frozen spiral inside',
  'nt-frost-3': 'an ice blue wave curling over itself',
  'nt-frost-4': 'a blue silver shield coated with ice blue frost',
  'nt-frost-5': 'an ice blue gauntlet palm with frost crystals on the fingertips',
  // Notables · storm
  'nt-storm-1': 'a heavy golden lightning bolt striking straight down',
  'nt-storm-2': 'a golden arc of lightning jumping between two small orbs',
  'nt-storm-3': 'a golden lightning bolt shaped like a swept wing',
  'nt-storm-4': 'a blue silver shield crackling with one golden spark',
  'nt-storm-5': 'a golden storm spiral with a bright eye in the centre',
  // Notables · flame
  'nt-flame-1': 'one tall broad orange flame',
  'nt-flame-2': 'three glowing orange embers resting on a dark coal',
  'nt-flame-3': 'an orange flame bursting out of a cracked urn',
  'nt-flame-4': 'a molten orange core inside a crimson heart',
  'nt-flame-5': 'an orange flame wrapped around a short sword blade',
  // Notables · blight
  'nt-blight-1': 'a jade green drop dripping from a dagger tip',
  'nt-blight-2': 'a jade green toxic cloud with two round bubbles',
  'nt-blight-3': 'a violet crack eating into a round stone disc',
  'nt-blight-4': 'a jade green shield turning away a falling poison drop',
  'nt-blight-5': 'a narrow-necked jade green vial with one drop at its lip',
  // Notables · iron
  'nt-iron-1': 'a heavy iron war hammer',
  'nt-iron-2': 'a tall iron tower shield',
  'nt-iron-3': 'a crimson blood drop sealed inside a golden ring',
  'nt-iron-4': 'a crimson heart bound with two iron bands',
  'nt-iron-5': 'an iron war horn blowing two crimson sound waves',
  // Notables · spirit
  'nt-spirit-1': 'three teal spectral swords arranged in a fan',
  'nt-spirit-2': 'a teal spirit wisp bursting into an orange explosion',
  'nt-spirit-3': 'a teal spirit wisp inside a blue silver ring',
  'nt-spirit-4': 'a teal banner on a tall staff',
  'nt-spirit-5': 'two teal wisps linked by a thin chain',
  // Notables · bridges and core
  'nt-barrage-1': 'three golden arrows spread in a fan',
  'nt-barrage-2': 'one golden arrow piercing through two thin discs',
  'nt-elements-1': 'three small orbs, orange, ice blue and gold, in a triangle',
  'nt-elements-2': 'a spear tip passing through a three-coloured orb',
  'nt-domain-1': 'a large golden rune circle',
  'nt-domain-2': 'three concentric golden ripples spreading outward',
  'nt-thirst-1': 'a crimson fang dripping one blood drop',
  'nt-thirst-2': 'a green sprout growing out of a crimson heart',
  'nt-shadow-1': 'a silver winged boot',
  'nt-shadow-2': 'two overlapping faded silver footprints',
  'nt-aegis-1': 'a round blue silver energy shield',
  'nt-aegis-2': 'a blue silver shield with an upward curved arrow',
  'nt-core-1': 'a crimson heart with a golden band across it',
  'nt-core-2': 'a blue mana crystal resting on a blue silver shield',
  // Small talents (shared by name)
  'sm-冰霜伤害': 'a single ice blue shard', 'sm-冰缓效果': 'an ice blue snowflake above a downward chevron', 'sm-冻结积累': 'an ice cube half filled with blue frost',
  'sm-冰缓持续': 'an ice blue hourglass', 'sm-冰霜抗性': 'a small shield with an ice blue snowflake',
  'sm-闪电伤害': 'a single golden lightning bolt', 'sm-感电概率': 'one golden spark', 'sm-感电效果': 'a golden bolt inside a ring',
  'sm-闪电施法速度': 'a golden bolt with two motion streaks', 'sm-闪电抗性': 'a small shield with a golden bolt',
  'sm-火焰伤害': 'a single orange flame', 'sm-点燃概率': 'one orange spark', 'sm-点燃伤害': 'an orange flame with a bright hot core',
  'sm-对燃烧敌人': 'an orange flame over a simple target ring', 'sm-火焰抗性': 'a small shield with an orange flame',
  'sm-中毒伤害': 'a single jade green drop', 'sm-中毒概率': 'one jade green bubble', 'sm-虚空伤害': 'a small violet orb',
  'sm-侵蚀概率': 'a short violet crack', 'sm-毒素抗性': 'a small shield with a jade drop',
  'sm-基础气血': 'a small crimson heart', 'sm-物理伤害': 'a short iron sword', 'sm-护甲': 'an iron breastplate',
  'sm-气血上限': 'a large crimson heart', 'sm-格挡率': 'a round iron buckler',
  'sm-召唤物伤害': 'a single teal spectral sword', 'sm-召唤物气血': 'a teal wisp with a crimson core', 'sm-召唤物攻速': 'a teal wisp with two motion streaks',
  'sm-召唤物施法速度': 'a teal wisp inside a small rune ring', 'sm-召唤物抗性': 'a small shield with a teal wisp',
  'sm-投射物伤害': 'a single golden arrowhead', 'sm-投射物速度': 'a golden arrow with speed streaks', 'sm-穿透概率': 'a golden arrow through a thin disc',
  'sm-元素伤害': 'a small three-coloured orb',
  'sm-范围伤害': 'a golden circular burst', 'sm-范围面积': 'a widening golden ring', 'sm-次级范围伤害': 'two overlapping golden rings',
  'sm-气血再生': 'a crimson drop with a small green leaf', 'sm-击杀回血': 'a crimson drop above a broken blade', 'sm-命中回血': 'a crimson drop on a sword tip',
  'sm-闪避值': 'a silver feather', 'sm-基础闪避': 'a silver cloak swirl', 'sm-闪避回血': 'a silver feather with a crimson drop',
  'sm-护盾上限': 'a blue silver shield', 'sm-基础护盾': 'a blue silver hexagonal plate', 'sm-护盾回充': 'a blue silver shield with a circular arrow',
  'sm-魔力上限': 'a blue mana crystal',
};
// The four attributes already have individual transparent PNGs from the previous set.
export const ATTRIBUTE_ICONS = { 'attr-strength': '/talents/icons/strength.png', 'attr-dexterity': '/talents/icons/dexterity.png', 'attr-intelligence': '/talents/icons/intelligence.png', 'attr-constitution': '/talents/icons/constitution.png' };

const HEADER = kind => `Use case: stylized-concept. Asset type: production game UI icon atlas. Draw exactly a 3 by 3 regular grid on one square canvas with 9 separate dark-fantasy ${kind} talent icons. Transparent background with real alpha. No visible grid lines, no dividers, no tiles, no frames, no lettering, no labels, no numbers, no watermark. Every cell occupies exactly one third of canvas width and height; centers at 1/6, 3/6 and 5/6 of canvas. Each icon stays fully inside its own cell and fills about 64% of cell width or height, leaving generous transparent gutters. Never move an icon into another cell and never merge cells. Preserve the full square canvas even when some cells are empty.
Style: very simple hand-painted game emblems, bold clear silhouettes, only two or three large forms per icon, broad flat color facets, subtle bevel on one edge. Readable at 32 pixels. Reduce detail strongly: no tiny decorations, no complex scene, no characters, no lighting effects, no particles, no outer glow, no backdrop or cast shadows. Use warm gold accents with orange for fire, ice blue for frost, gold for lightning, jade for poison, crimson for life, teal for summons, blue silver for shields and violet for void. Consistent visual weight and edge treatment across the nine icons. Each motif below is a separate icon; do not draw these descriptions as text.`;
const KIND_WORD = { ks: 'keystone', nt: 'notable', sm: 'minor passive' };

export function iconPlan(tree) {
  const seen = new Map();
  for (const n of tree.nodes) if (n.icon && !n.icon.startsWith('attr-') && !seen.has(n.icon)) seen.set(n.icon, n);
  const order = k => ({ ks: 0, nt: 1, sm: 2 })[k.slice(0, 2)];
  const keys = [...seen.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'zh'));
  const missing = keys.filter(k => !MOTIFS[k]);
  if (missing.length) throw Error('缺少图标描述：' + missing.join('、'));
  const sheets = [];
  // Keep each sheet to one kind so keystones, notables and minors keep their own visual weight.
  for (const prefix of ['ks', 'nt', 'sm']) {
    const group = keys.filter(k => k.startsWith(prefix));
    for (let i = 0; i < group.length; i += 9) {
      const id = `${prefix}-${String(sheets.filter(s => s.id.startsWith(prefix)).length + 1).padStart(2, '0')}`;
      const entries = group.slice(i, i + 9).map((key, at) => ({ key, name: seen.get(key).name, kind: seen.get(key).kind, sector: seen.get(key).sector, row: Math.floor(at / 3), column: at % 3, motif: MOTIFS[key] }));
      const lines = entries.map(e => `Row ${e.row + 1}, column ${e.column + 1}: ${e.motif}.`);
      const empty = Array.from({ length: 9 - entries.length }, (_, j) => entries.length + j).map(at => `Row ${Math.floor(at / 3) + 1}, column ${at % 3 + 1}: leave this cell completely empty and transparent.`);
      sheets.push({ id, file: `${id}.png`, entries, prompt: [HEADER(KIND_WORD[prefix]), ...lines, ...empty].join('\n') });
    }
  }
  return { generator: 'Built-in image_gen', tree: tree.id, revision: tree.revision, transparentBackground: true, grid: { rows: 3, columns: 3 }, folder: PUBLIC_DIR, count: keys.length, attributes: ATTRIBUTE_ICONS, sheets };
}

function markdown(plan) {
  const out = [];
  out.push('# 六域星盘图标：提示词与使用办法', '', `共 ${plan.count} 个图标，分为 ${plan.sheets.length} 张 3×3 透明图集：基石 ${plan.sheets.filter(s => s.id.startsWith('ks')).length} 张、核心 ${plan.sheets.filter(s => s.id.startsWith('nt')).length} 张、小天赋 ${plan.sheets.filter(s => s.id.startsWith('sm')).length} 张。4 个属性图标沿用现有的 \`public/talents/icons/strength.png\` 等文件。`, '',
    '本文件由 `node scripts/talent-icons.mjs` 生成，请勿手改；画面描述在脚本的 `MOTIFS` 表里。', '',
    '## 使用办法', '',
    '1. **生成：** 每张图集一次生成。把下面对应的提示词整段交给图像生成工具（与原传奇图标相同，使用内置 Image Gen），要求输出带透明通道的正方形 PNG，建议 1024 像素以上。',
    `2. **命名：** 按图集编号保存为 \`CustomTools/RuleStudio/public${PUBLIC_DIR}/<编号>.png\`，例如 \`ks-01.png\`。`,
    '3. **查看：** 刷新游戏后按 P 打开天赋盘。已放入的图集会自动显示在对应节点上；还没生成的节点保持原来的圆点外观。可以一张一张地补。',
    '4. **检查：** 运行 `node scripts/talent-icons.mjs --status`，列出哪些图集已到位。',
    '5. **单张重画：** 某个图标不满意时，复制它所在图集的整段提示词重新生成整张，替换同名文件即可。不要单独裁剪或移动格子，界面按「行、列」定位。',
    '6. **改设计后：** 新增或改名了天赋，就在 `scripts/talent-icons.mjs` 的 `MOTIFS` 里补一条描述，再运行脚本，图集划分和提示词会自动更新。注意已生成的图集可能需要重画，因为格子位置会移动；脚本输出的 `imagegen-plan.json` 记录了每个格子对应哪个图标。', '',
    '图标编号的规则：',
    '- `ks-领域-序号`：基石',
    '- `nt-主题-序号`：核心',
    '- `sm-名称`：同名小天赋共用一个图标',
    '- `attr-属性`：属性', '',
    '编号由天赋内容决定，与布局种子无关，所以换布局不用重画图标。', '');
  for (const sheet of plan.sheets) {
    out.push(`## ${sheet.id}.png`, '', '| 位置 | 编号 | 天赋 | 画面 |', '| --- | --- | --- | --- |');
    for (const e of sheet.entries) out.push(`| ${e.row + 1} 行 ${e.column + 1} 列 | \`${e.key}\` | ${e.name} | ${e.motif} |`);
    out.push('', '提示词：', '', '```text', sheet.prompt, '```', '');
  }
  return out.join('\n');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const tree = JSON.parse(fs.readFileSync(path.join(RULES_DIR, 'Talents', 'constellation.json'), 'utf8'));
  const plan = iconPlan(tree);
  if (process.argv.includes('--status')) {
    for (const s of plan.sheets) console.log(`${fs.existsSync(path.join(ICON_DIR, s.file)) ? '✓' : '·'} ${s.file}  ${s.entries.map(e => e.name).join('、')}`);
  } else {
    fs.mkdirSync(ICON_DIR, { recursive: true });
    fs.writeFileSync(path.join(ICON_DIR, 'imagegen-plan.json'), JSON.stringify(plan, null, 1) + '\n');
    fs.writeFileSync(path.join(TOOL_ROOT, 'docs', 'talent-icons.md'), markdown(plan));
    console.log(`已写入 ${plan.sheets.length} 张图集计划（${plan.count} 个图标）：public${PUBLIC_DIR}/imagegen-plan.json 与 docs/talent-icons.md`);
  }
}
