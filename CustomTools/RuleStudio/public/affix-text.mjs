// Player-facing text only. Rolled values override defaults; the rule sources stay unchanged.
const number = value => String(+Number(value).toFixed(6));
const selectors = new Set(['source', 'element', 'status']);
const templates = {
  chill_consume_burst: '命中时消耗冰缓，触发冰霜爆破：冰霜伤害 {damage}，半径 {radius}米',
  shock_consume_strike: '命中时消耗全部感电，触发闪电击中：闪电伤害 {damage}，半径 {radius}米',
  freeze_consume_shards: '命中时消耗冻结，产生破冰碎片：冰霜伤害 {damage}，半径 {radius}米',
  treasury_hit_stock: '每累计命中{hits}次，宝库层数 +{amount}',
  treasury_critical_stock: '投射物暴击时，宝库层数 +{amount}',
  treasury_kill_stock: '击杀敌人时，宝库层数 +{amount}',
  treasury_consumed_stock: '消耗目标异常状态时，宝库层数 +{amount}',
  treasury_stock: '宝库每次收纳 {amount}层，层数上限 {cap}层',
  lightning_damage: '闪电伤害 +{amount}', fire_damage: '火焰伤害 +{amount}',
  physical_damage: '物理伤害 +{amount}', poison_damage: '毒素伤害 +{amount}',
  frost_damage: '冰霜伤害 +{amount}', void_damage: '虚空伤害 +{amount}',
  fire_resistance: '火焰抗性 +{resistance}%', frost_resistance: '冰霜抗性 +{resistance}%',
  lightning_resistance: '闪电抗性 +{resistance}%', poison_resistance: '毒素抗性 +{resistance}%',
  multiple_projectiles: '投射物数量 +{count}，扩散 +{spread}，伤害×{damage_multiplier}',
  pierce: '投射物穿透 +{count}次', ricochet: '投射物弹射 +{count}次',
  projectile_return: '投射物回归 +{count}次', projectile_reflect: '投射物反射 +{count}次',
  chill: '冰缓：减速{slow}%，持续{duration}秒', hobble: '缓速{amount}%，持续{duration}秒',
  shock: '感电：受到伤害 +{amount}%，持续{duration}秒',
  ignite: '点燃：每秒造成命中伤害的{ratio%}%，持续{duration}秒',
  bleed: '{chance}%概率流血，每秒造成命中伤害的{ratio%}%，持续{duration}秒',
  brittle: '冰冷命中冰缓敌人，追加{ratio%}%冰冷伤害',
  freeze: '冰缓强度达到{chill}%时，{chance}%概率冻结{duration}秒',
  shatter: '击败冰缓敌人触发碎裂：冰霜伤害{amount}，半径{radius}米',
  cold_mastery: '冰霜伤害 +{damage_percent}%，暴击率 +{critical_chance}%，施法速度 +{cast_speed}%',
  death_lightning: '死亡闪电：伤害{amount}，半径{impact_radius}米，每{interval}秒落雷，持续{duration}秒，索敌{radius}米',
  poison_flask_burst: '辅助毒瓶，使其碰撞或达到飞行距离后触发破裂；基础毒素伤害 +{damage}，基础爆炸半径 +{radius}米',
  poison_flask_poison: '辅助毒瓶，使其范围命中时触发中毒；基础中毒持续时间 +{duration}秒',
  sentinel_fire_nova: '辅助哨卫，使其每次攻击时触发火焰新星；基础火焰伤害 +{amount}，基础半径 +{radius}米',
  sentinel_ice_lance: '辅助哨卫，使其每次攻击时触发冰锥；基础冰霜伤害 +{damage}，基础弹速 +{speed}米/s，基础飞行时间 +{lifetime}秒，基础碰撞半径 +{projectile_radius}米。技能威力更高时取技能威力',
  sentinel_lightning: '辅助哨卫，使其每次攻击时触发落雷；基础闪电伤害 +{amount}',
  spirit_claw: '辅助灵仆，使其每次攻击时触发利爪；基础物理伤害 +{damage}。技能威力更高时取技能威力',
  minion_merge: '同类召唤物合并，每次合并气血与伤害 +{n}%',
  minion_sacrifice_empower: '牺牲召唤物后，下一次技能伤害 +{n}%',
  poison_no_damage: '中毒不再造成伤害，每层使受到的命中伤害 +{n}%',
  proj_return_secondary: '投射物返回途中，释放{n}枚次级投射物',
  flask_life: '{seconds}秒内恢复气血 +{amount}',
  guard_on_low_life: '首次进入低血时，受到伤害 -{reduction}%，持续{duration}秒，冷却{cooldown}秒',
  empower_from_overflow: '消耗溢出护盾的{percent}%，下一次技能伤害 +{bonus}%',
  empower_on_life_spent: '每累计消耗{per}点气血，下一次技能伤害 +{bonus}%',
  empower_on_shield_spent: '每累计消耗{per}点护盾，下一次技能伤害 +{bonus}%',
  poison_layers_empower: '每累计施加{per}层中毒，下一次技能伤害 +{n}%',
};

export function traitText(trait, library) {
  const entry = typeof trait === 'string' ? { id: trait } : trait;
  const definition = library?.trait(entry.id), source = definition?.source;
  const params = new Map([...source?.params || []].map(([key, value]) => [key.toLowerCase(), value]));
  for (const [key, value] of Object.entries(entry.params || {})) params.set(key.toLowerCase(), value);
  let text = templates[entry.id.toLowerCase()] || definition?.displayName || library?.traitDisplayName(entry.id) || entry.id;
  text = text.replace(/\{([a-z_]+)(%)?\}/gi, (token, key, percent) => params.has(key.toLowerCase()) ? number(params.get(key.toLowerCase()) * (percent ? 100 : 1)) : token);
  // Catalog names use positional "n" placeholders; authored parameter order defines their values.
  const values = [...params].filter(([key, value]) => !selectors.has(key) && Number.isFinite(value)).map(([, value]) => value);
  let index = 0;
  text = text.replace(/(?<![a-z])n(?![a-z])/gi, () => values.length ? number(values[Math.min(index++, values.length - 1)]) : '—');
  if (params.has('source')) {
    const names = { '-2': '元素', '-1': '命中', 0: '火焰', 1: '冰霜', 2: '闪电', 3: '物理', 4: '毒素', 5: '虚空' };
    text = text.replace('指定来源', names[params.get('source')] || '指定来源');
  }
  const mounted = (entry.with || []).filter(t => library?.trait(typeof t === 'string' ? t : t.id)?.source.rules.some(r => r.event === 'cast'));
  if (mounted.length) text = text.replace(/挂载技能/g, mounted.map(t => library.traitDisplayName(typeof t === 'string' ? t : t.id)).join('、'));
  return text
    .replace(/\+\s*-/g, '-').replace(/-\s*-/g, '+')
    .replace(/个百分点/g, '%')
    .replace(/(\d+(?:\.\d+)?)\s*秒/g, '$1s')
    .replace(/([+-]\s*\d+(?:\.\d+)?)\s*(?:个|次|枚|点|层)(?=$|[，。；、,;.])/g, '$1')
    .replace(/([+-])\s+(?=\d)/g, '$1');
}

export function affixText(affix, library) {
  const traits = affix.traits || [];
  return traits.length ? traits.map(trait => traitText(trait, library)).join('；') : affix.name || affix.id || '';
}

// Keep compact authored names, resolving numeric placeholders from the concrete instance.
export function affixName(affix, library) {
  const numericName = name => /(?<![a-z])n(?![a-z])|\{[a-z_]+%?\}/i.test(name);
  if (typeof affix === 'string') return affixName({ id: affix }, library);
  const entries = affix.traits || (affix.id ? [affix] : []);
  const name = affix.name || (affix.id ? library?.traitDisplayName(affix.id) || affix.id : '');
  if (numericName(name) && entries.length) return entries.map(entry => traitText(entry, library)).join('；');
  if (affix.name) return affix.name;
  if (affix.id) return library?.traitDisplayName(affix.id) || affix.id;
  return (affix.traits || []).map(trait => {
    const entry = typeof trait === 'string' ? { id: trait } : trait;
    const name = entry.name || library?.traitDisplayName(entry.id) || entry.id;
    return numericName(name) ? traitText(entry, library) : name;
  }).join(' · ');
}
