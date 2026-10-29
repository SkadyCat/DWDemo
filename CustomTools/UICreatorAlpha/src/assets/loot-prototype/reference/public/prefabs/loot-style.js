// Shared label / mesh appearance. Plain drop metadata only; no rule or inventory dependencies.
const style = (family, color, mark, beamHeight, beamWidth = 1) => Object.freeze({ family, color, cssColor: '#' + color.toString(16).padStart(6, '0'), mark, beamHeight, beamWidth });
const currency = Object.freeze({
  1: style('currency', 0xd8c9a0, 'Ⅰ', 1.05),
  2: style('currency', 0x81e2d3, 'Ⅱ', 1.45, 1.15),
  3: style('currency', 0xf4b4cf, 'Ⅲ', 1.95, 1.35),
});
const specialCurrency = style('currency', 0xf2c178, '◆', 1.6, 1.2);
const omen = style('omen', 0xc5b7f4, '✧', 1.65, 1.15);
const rarities = Object.freeze(Object.fromEntries(Object.entries({ common: 0xb5bfcf, magic: 0x7daeff, rare: 0xffd263, legendary: 0xff9b4c, unique: 0xc890ff })
  .map(([rarity, color]) => [rarity, style('', color, '', ['rare', 'legendary', 'unique'].includes(rarity) ? 1.5 : .6)])));

export function lootStyle(drop) {
  if (drop.kind === 'item' && drop.category === 'currency') return currency[drop.currencyGrade] || specialCurrency;
  if (drop.kind === 'item' && drop.category === 'omen') return omen;
  return rarities[drop.rarity] || rarities.common;
}
