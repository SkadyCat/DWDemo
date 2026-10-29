// Input assistance only: casts still use Battle.setAim and the unchanged rule runtime.
export function resolveTouchAim(battle, touch, { targetId = null, visible = () => true } = {}) {
  if (!touch.casting) return { targetId: null, point: null, casting: false };
  if (!touch.autoAim) return { targetId: null, point: null, casting: true };
  const hero = battle.hero, world = battle.host?.world;
  const heroTeam = world?.owners?.[hero.owner]?.team;
  function eligible(monster) {
    if (!(monster.health > 0) || monster.dead || !Number.isFinite(monster.x) || !Number.isFinite(monster.y) || !visible(monster)) return false;
    const index = world?.targetIndexOf?.(monster.id);
    if (index >= 0 && (world.targets.team[index] === 0 || world.targets.team[index] === heroTeam)) return false;
    return !battle.dungeon || battle.dungeon.sweep(hero.x, hero.y, monster.x, monster.y) < 0;
  }
  let target = battle.monsters.find(monster => monster.id === targetId && eligible(monster));
  if (!target) {
    let distance = Infinity;
    for (const monster of battle.monsters) {
      if (!eligible(monster)) continue;
      const next = (monster.x - hero.x) ** 2 + (monster.y - hero.y) ** 2;
      if (!target || next < distance || next === distance && monster.id < target.id) { target = monster; distance = next; }
    }
  }
  return { targetId: target?.id ?? null, point: target ? { x: target.x, y: target.y } : null, casting: !!target };
}
