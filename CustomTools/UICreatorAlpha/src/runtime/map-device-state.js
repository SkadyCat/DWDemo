// UI reservations only: placing an item never changes inventory or applies rewards.
export const deviceRole = item => item?.mapDeviceRole === 'modifier' ? 'modifier' : item?.category === 'map' ? 'map' : '';
export const deviceSlotRole = slot => slot === 'map' ? 'map' : /^modifier-[0-4]$/.test(slot) ? 'modifier' : '';
export class MapDeviceState {
  constructor(items = [], slots = {}) { this.slots = { ...slots }; this.filter = 'all'; this.page = 0; this.update(items); }
  update(items) {
    this.items = items.filter(i => i && (i.key || i.id) && Number.isInteger(i.count) && i.count > 0).map(i=>({...i,key:i.key||i.id}));
    const used = new Map();
    for (const [slot,key] of Object.entries(this.slots)) {
      const item = this.items.find(i=>i.key===key), n=(used.get(key)||0)+1;
      if (!item || !deviceSlotRole(slot) || deviceRole(item)!==deviceSlotRole(slot) || n>item.count) delete this.slots[slot];
      else used.set(key,n);
    }
  }
  available(key) { const item=this.items.find(i=>i.key===key);return Math.max(0,(item?.count||0)-Object.values(this.slots).filter(v=>v===key).length); }
  get bag() { return this.items.map(item=>({...item,count:this.available(item.key)})).filter(i=>i.count>0&&(this.filter==='all'||deviceRole(i)===this.filter)); }
  get mapItems() { return this.items.filter(deviceRole).map(item=>({...item,reserved:item.count-this.available(item.key)})); }
  item(slot) { return this.items.find(i=>i.key===this.slots[slot]); }
  place(key, slot, from = '') {
    const item=this.items.find(i=>i.key===key), role=deviceSlotRole(slot);
    if (!item || !role || deviceRole(item)!==role) return false;
    if (from && this.slots[from]!==key || !from && this.available(key)<1) return false;
    if (from===slot) return true;
    const previous=this.slots[slot];
    if (from) { if(previous)this.slots[from]=previous;else delete this.slots[from]; }
    this.slots[slot]=key;return true;
  }
  remove(slot) { if(!this.slots[slot])return false;delete this.slots[slot];return true; }
}
