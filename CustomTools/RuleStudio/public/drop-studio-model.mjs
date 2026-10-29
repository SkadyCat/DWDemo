// Design-tool analytics only. This module never drives combat, acquisition RNG or saved profiles.
export const POOLS = ['currency', 'omen', 'consumable'];
export function mapPoolEntries(snapshot, mapId, category = 'all') {
  const map = snapshot.maps.find(map => map.id === mapId);
  if (!map) throw Error('未知地图掉落池');
  const byId = new Map(snapshot.entries.map(entry => [entry.id, entry]));
  return [...map.equipmentIds, ...map.itemIds].map(id => {
    const entry = byId.get(id);
    if (!entry) throw Error('掉落池缺少物品定义：' + id);
    return entry;
  }).filter(entry => category === 'all' || (category === 'equipment' ? entry.kind === 'equipment' : entry.kind === 'item' && entry.category === category));
}
const mean = range => (range[0] + range[1]) / 2;
const sum = values => values.reduce((a, b) => a + b, 0);
export function normalized(weights) {
  const total = sum(weights);
  if (!(total > 0) || weights.some(w => !Number.isFinite(w) || w < 0)) throw Error('掉落权重必须非负且总和大于零');
  return weights.map(w => w / total);
}
export function equipmentSlots(data, mode, monster) {
  if (mode === 'draft') return data.draft.equipment[monster];
  return [{id: 'base', chance: monster === 'boss' ? data.current.bossEquipmentChance : data.current.equipmentChance,
    count: [1, 1], qualityWeights: data.current.qualityWeights}];
}
export function poolEntries(data, mode, monster, pool) {
  const items = data.items.filter(i => i.pool === pool);
  if (mode === 'current') {
    const p = monster === 'boss' ? data.current.bossItemChance : data.current.itemChance;
    return {chance: p * items.length / data.items.length, count: pool === 'currency' ? data.current.currencyCount : [1, 1],
      entries: items.map(item => ({...item, weight: 1, conditional: 1 / items.length, combined: 1 / data.items.length,
        expected: p / data.items.length * mean(pool === 'currency' ? data.current.currencyCount : [1, 1])}))};
  }
  const config = data.draft.pools[pool], weights = config.weights[monster], fractions = normalized(weights);
  return {chance: config.chance[monster], count: config.count[monster], entries: items.map((item, i) => ({...item,
    weight: weights[i], conditional: fractions[i], combined: fractions[i], expected: config.chance[monster] * fractions[i] * mean(config.count[monster])}))};
}
export function sourceStats(data, mode, monster) {
  const slots = equipmentSlots(data, mode, monster), quality = [0, 0, 0, 0], ordinaryQuality = [0, 0, 0, 0];
  for (const slot of slots) normalized(slot.qualityWeights).forEach((v, i) => {
    const expected = slot.chance * mean(slot.count) * v;
    quality[i] += expected; if (!slot.directed) ordinaryQuality[i] += expected;
  });
  const pools = Object.fromEntries(POOLS.map(id => {const p = poolEntries(data, mode, monster, id); return [id, {...p, expected: sum(p.entries.map(e => e.expected))}];}));
  return {equipment: sum(quality), ordinaryEquipment: sum(ordinaryQuality), quality, ordinaryQuality, pools,
    directed: sum(slots.filter(s => s.directed).map(s => s.chance * mean(s.count))),
    maps: mode === 'draft' && monster === 'boss' ? data.draft.mapReward.bossCount : 0};
}
export function expectedLoot(data, mode = 'draft', scenarioId = 'standard') {
  const scenario = data.scenarios.find(s => s.id === scenarioId); if (!scenario) throw Error('未知怪物样本');
  const result = {equipment: 0, quality: [0, 0, 0, 0], currency: 0, omen: 0, consumable: 0, directed: 0, maps: 0, monsters: 0};
  for (const monster of data.monsters) {
    const count = scenario.counts[monster.id] || 0, stats = sourceStats(data, mode, monster.id);
    result.monsters += count; result.equipment += count * stats.equipment; result.directed += count * stats.directed; result.maps += count * stats.maps;
    stats.quality.forEach((v, i) => result.quality[i] += count * v);
    for (const pool of POOLS) result[pool] += count * stats.pools[pool].expected;
  }
  return result;
}
export function tierDistribution(mapTier, mode = 'draft') {
  if (!Number.isInteger(mapTier) || mapTier < 1 || mapTier > 16) throw Error('地图 T 必须在 1–16');
  const cap = Math.min(10, mapTier);
  return Array.from({length: 10}, (_, i) => {
    const tier = i + 1;
    const probability = mode === 'current' ? (tier <= cap ? 1 / cap : 0)
      : cap === 1 ? Number(tier === 1) : cap === 2 ? (tier === 2 ? .75 : tier === 1 ? .25 : 0)
      : tier === cap ? .6 : tier === cap - 1 ? .3 : tier === cap - 2 ? .1 : 0;
    return {tier, probability};
  });
}
export function validateDesign(data) {
  if (data.status !== 'design-draft') throw Error('本工具仅接受未发布设计草案');
  for (const monster of data.monsters) {
    for (const slot of equipmentSlots(data, 'draft', monster.id)) {
      if (slot.chance < 0 || slot.chance > 1 || slot.qualityWeights.length !== 4) throw Error('装备抽取项无效');
      normalized(slot.qualityWeights);
    }
    for (const pool of POOLS) {
      const config = data.draft.pools[pool], n = data.items.filter(i => i.pool === pool).length;
      if (config.weights[monster.id].length !== n || config.chance[monster.id] < 0 || config.chance[monster.id] > 1) throw Error('物品池配置无效');
      normalized(config.weights[monster.id]);
      const [min, max] = config.count[monster.id]; if (min < 1 || max < min) throw Error('堆叠范围无效');
    }
  }
  return data;
}
const csvCell = value => '"' + String(typeof value === 'number' ? Number(value.toPrecision(12)) : value ?? '').replaceAll('"', '""') + '"';
export function designCsv(data) {
  const rows = [['配置状态', '怪物来源', '池', '抽取项', '条目ID', '名称', '子池触发或边际概率', '数量下限', '数量上限', '条目权重', '池内占比', '每击杀预期个数', '说明']];
  for (const mode of ['current', 'draft']) for (const monster of data.monsters) {
    const label = mode === 'draft' ? data.draft.label : data.current.label;
    for (const slot of equipmentSlots(data, mode, monster.id)) normalized(slot.qualityWeights).forEach((fraction, i) => rows.push([
      label, monster.name, slot.directed ? 'Boss额外定向装备' : '装备', slot.id, data.qualities[i].id, data.qualities[i].name,
      slot.chance, ...slot.count, slot.qualityWeights[i], fraction, slot.chance * mean(slot.count) * fraction, '品质条件分布；不改变词缀生成规则']));
    for (const pool of POOLS) {
      const stats = poolEntries(data, mode, monster.id, pool);
      for (const entry of stats.entries) rows.push([label, monster.name, data.draft.pools[pool].name, 'base', entry.id, entry.name,
        stats.chance, ...stats.count, entry.weight, entry.conditional, entry.expected,
        mode === 'current' ? '20条目共用一次抽取；概率为本子类的边际概率，各子类互斥' : '与其他奖励池独立抽取']);
    }
    if (mode === 'draft' && monster.id === 'boss') rows.push([label, monster.name, '地图续航', 'base', 'map_reward', '地图', 1, 1, 1, 1, 1, data.draft.mapReward.bossCount, data.draft.mapReward.note]);
  }
  for (const boss of data.draft.bossPools) for (const id of boss.equipmentIds) rows.push([
    data.draft.label, boss.name, 'Boss定向模板展开', 'directed', id, boss.family, .15, 1, 1, 1,
    1 / boss.equipmentIds.length, .15 / boss.equipmentIds.length,
    `仅击杀对应首领；现有定向项的模板展开，不是新增抽取。首领最早楼层 ${boss.minFloor}，不是地图T。保留全局途径。`
  ]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
