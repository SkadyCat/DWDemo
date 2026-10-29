// Repository-wide preview policy. Equipment drops and player saves are not migrated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { minimumTierPreset } from '../public/build-preset-tier.mjs';

const principles = {
  self_poison_flasks: '毒瓶命中施毒并使自身中毒，自毒损血累计触发挂载毒瓶；依靠持续命中和恢复接续，需要敌人。',
  myriad_swords: '多重、额外发射位置、穿透与返回通过真实投射规则聚合，手动施放启动。',
  summon_myriad_swords: '召唤哨卫，控制名额和同类上限允许多座并存；多重、发射点、汇聚与追踪通过召唤物投射规则聚合。',
  autocast_return: '手动冰锥启动；真实投射物返回触发挂载冰锥与烈焰爆发，命中返回和达到最大距离返回都可接续。',
  autocast_mana_refund: '手动烈焰爆发启动，实际魔力消耗累计触发额外烈焰爆发；触发返还、恢复与资源门槛决定是否接续。',
  autocast_shield: '溢出护盾衰减后由护盾再生补回，实际恢复量累计触发挂载烈焰爆发，不依赖敌人。',
  autocast_summon: '手动召唤启动，实际召唤物生成事件触发续召与烈焰爆发；受控制上限、冷却与资源约束。',
  autocast_interval: '既有间隔触发特性自动释放挂载烈焰爆发，遵守触发资源与冷却。',
  autocast_still: '保持静止累计触发烈焰爆发，移动打断静止计时；遵守资源与冷却。',
  autocast_moving: '持续移动累计触发烈焰爆发，停止移动不再产生该触发；遵守资源与冷却。',
  autocast_poison: '手动命中启动；实际施毒事件触发烈焰爆发，再由命中施毒接续。无目标或断毒时需重新启动。',
  autocast_shock: '手动命中启动；闪电附魔施加感电，感电事件触发烈焰爆发，再由附魔接续。无目标时停止。',
  synergy_rime_thunder: '冰锥施加冰缓和冻结，消费冻结或感电触发雷霆新星；新星再施加感电。依靠多重、穿透与资源恢复接续。',
  synergy_plague_tide: '朝目标投毒瓶，累积毒层后引爆；真实异常消费触发下一轮毒瓶，传播与毒池扩大覆盖。无目标或断毒需重新投瓶。',
  synergy_sacrifice_thunder: '先召唤铁卫，再使用装备授予的献祭技能；实际献祭事件触发新星与补召，资源和名额正常结算。',
  whirlwind_swarm: '一次手动旋风启动；真实投射物进入镜像地面时被复制，退出再进入才可重触发。第二槽回响使下一技能额外执行一次。',
  whirlwind_grounds: '旋风真实命中产生四种异常地面；进入镜像地面复制，接触异常地面染色。第二槽回响使下一技能额外执行一次。',
};
export function normalizeBuildPresets() {
  const checked = checkRuleSet(readRuleFiles()); if (!checked.ok) throw Error(checked.error);
  const folder = path.join(RULES_DIR, 'Presets'), indexPath = path.join(folder, 'index.json'), rows = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  let count = 0;
  for (const row of rows) {
    const file = path.join(folder, row.id + '.json');
    const preset = minimumTierPreset(JSON.parse(fs.readFileSync(file, 'utf8')), checked.library);
    fs.writeFileSync(file, JSON.stringify(preset, null, 2) + '\n');
    row.name = row.name.replace('T10', 'T1');
    if (principles[row.id]) row.description = principles[row.id] + ' 全套最低T1体验配装，强度来自词条组合。';
    else row.description = row.description.replaceAll('T10', 'T1');
    ++count;
  }
  fs.writeFileSync(indexPath, JSON.stringify(rows, null, 2) + '\n');
  return count;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`${normalizeBuildPresets()}套预制BD已统一为T1；原玩家物品未改。`);
