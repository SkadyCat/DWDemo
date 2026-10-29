import { reactive, markRaw } from '/vendor/vue.esm-browser.prod.js';
import { validateTree, talentParts } from './model.mjs';
export const talentStore = reactive({ tree: null, error: '' });
export async function loadTalentTree() {
  try {
    const response = await fetch('/talent-data/constellation.json', { cache: 'no-store' });
    if (!response.ok) throw Error('无法加载星盘数据');
    const tree = await response.json(), error = validateTree(tree);
    if (error) throw Error(error);
    talentStore.tree = markRaw(tree); talentStore.error = '';
  } catch (error) { talentStore.error = error.message; }
}
export const currentTalentParts = state => talentParts(talentStore.tree, state);
