// Atlas progression observes real battles; it never decides damage, drops or victory.
import { createAtlas, normalizeAtlas, selectAtlasNode, enterAtlasNode, completeAtlasNode, failAtlasNode, atlasBattleOptions } from './atlas-state.mjs';

export const ATLAS_STORAGE_KEY = 'dw-battle-atlas-v1';

export class AtlasSession {
  constructor(storage, { seed = Date.now() >>> 0, onStorageError = () => {} } = {}) {
    this.storage = storage;
    this.onStorageError = onStorageError;
    this.battle = null;
    this.nodeId = null;
    try {
      const saved = storage?.getItem(ATLAS_STORAGE_KEY);
      this.state = saved ? normalizeAtlas(JSON.parse(saved)) : createAtlas(seed);
    } catch {
      this.state = createAtlas(seed);
    }
    this.commit(this.state);
  }

  commit(state) {
    this.state = state;
    // Positions, terrain and links are regenerated from the seed, not copied
    // into storage every time a location is selected.
    const { version, seed, completedIds, attempts, selectedId, activeNodeId, currentNodeId, mapTiers } = state;
    try { this.storage?.setItem(ATLAS_STORAGE_KEY, JSON.stringify({ version, seed, completedIds, attempts, selectedId, activeNodeId, currentNodeId, mapTiers })); }
    catch (error) { this.onStorageError(error); }
    return state;
  }

  select(id) { return this.commit(selectAtlasNode(this.state, id)); }

  prepare(id, options = {}) {
    // Retrying must remain a proposal until admission and battle creation pass.
    const previous = options.restart && this.state.activeNodeId === id ? failAtlasNode(this.state, id) : this.state;
    const state = enterAtlasNode(previous, id, options);
    return { state, id, options: atlasBattleOptions(state, id) };
  }
  prepareCurrent() {
    this.detach();
    return this.prepare(this.state.currentNodeId, { revisit: true });
  }
  focusCurrent() { return this.select(this.state.currentNodeId); }

  bind(prepared, battle) {
    if (!battle || battle.floor !== prepared.options.floor) throw new Error('异界区域与实际战斗层级不一致');
    this.battle = battle;
    this.nodeId = prepared.id;
    return this.commit(prepared.state);
  }

  observe(battle) {
    if (!this.battle || battle !== this.battle || !this.state.activeNodeId) return null;
    if (battle.hero.dead || battle.phase === 'failed') {
      this.battle = null;
      this.commit(failAtlasNode(this.state, this.nodeId));
      return 'failed';
    }
    if (battle.phase === 'cleared') {
      this.battle = null;
      this.commit(completeAtlasNode(this.state, this.nodeId));
      return 'cleared';
    }
    return null;
  }

  detach() {
    if (this.state.activeNodeId) this.commit(failAtlasNode(this.state, this.state.activeNodeId));
    this.battle = null;
    this.nodeId = null;
    return this.state;
  }
}
