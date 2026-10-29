// Shared character-backpack geometry: occupied cells and default empty sockets.
export const CHARACTER_BAG_GRID = {columns:4,rows:9,cell:52,gap:6};
export function characterBagCellCount(items,columns=CHARACTER_BAG_GRID.columns){
 return Math.max(CHARACTER_BAG_GRID.columns*CHARACTER_BAG_GRID.rows,Math.ceil(items/columns)*columns);
}
