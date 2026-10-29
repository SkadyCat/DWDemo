import {reloadStore,store} from '/editors.mjs';
import {mountBattle} from '/battle3d.mjs';
import {loadTalentTree} from '/talents/state.mjs';
import {player,ensureStarted} from '/player.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='5295')throw Error('QA requires an isolated loopback origin');
await reloadStore();await loadTalentTree();ensureStarted(store.catalog,store.collections,store.library);
// Test fixture wallet only; every purchase uses the unmodified production transaction.
if(!player.outpostMerchant)player.stones=20000;
const page=mountBattle(document.querySelector('#battle-root'));page.show();
