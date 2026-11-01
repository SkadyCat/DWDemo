// 完整内容包：基础规则 + 技能/状态/召唤物 + 地图怪物。词条由 families.mjs 按需生成。
import { compileContent } from '../content.mjs';
import { BASE } from './base.mjs';
import { GAME_SKILLS } from './skills.mjs';
import { MAP_PACK } from './maps.mjs';

let cached = null;
export const gameContent = () => (cached ??= compileContent(BASE, GAME_SKILLS, MAP_PACK));
