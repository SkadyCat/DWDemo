// 编辑器改动层：data/overrides.json 里存着编辑器对内容的修改，内容模块在冻结数据之前把它叠上去。
//   { "<分类>": { "<id>": { 要改的字段… } } }   顶层字段整体替换；表里没有的 id 视为新增条目。
// 浏览器从 GET /api/overrides 读取（服务没开这个接口时当作没有改动）；
// Node 里默认不读（测试和报告跑的是原始数据），设 DW_OVERRIDES=1 才读。
// 每个分类的原始数据另存一份（BASELINE），编辑器用它显示「已修改」并支持还原。

const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

async function load() {
  try {
    if (inBrowser) {
      const r = await fetch('/api/overrides', { cache: 'no-store' });
      return r.ok ? await r.json() : {};
    }
    if (typeof process === 'undefined' || !process.env?.DW_OVERRIDES) return {};
    const fs = await import('node:fs');
    const file = new URL('../../data/overrides.json', import.meta.url);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  } catch { return {}; }
}

export const OVERRIDES = await load();
const BASELINE = new Map();          // category -> Map(id -> JSON-safe copy of the original entry)

/** A JSON-safe deep copy (functions and other non-data drop out). */
export const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function remember(cat, id, entry) {
  if (!BASELINE.has(cat)) BASELINE.set(cat, new Map());
  BASELINE.get(cat).set(id, plain(entry));
}
const patchOf = (cat, id) => OVERRIDES[cat]?.[id] ?? null;

/** A list of `{ id, … }` entries: edited entries are merged, new ids appended. */
export function patchList(cat, list) {
  for (const e of list) remember(cat, e.id, e);
  const out = list.map(e => { const p = patchOf(cat, e.id); return p ? { ...e, ...p, id: e.id } : e; });
  const known = new Set(list.map(e => e.id));
  for (const [id, p] of Object.entries(OVERRIDES[cat] ?? {})) if (!known.has(id) && p && !p._base) out.push({ ...p, id });
  return out;
}

/** An object keyed by id. */
export function patchMap(cat, obj) {
  for (const [id, e] of Object.entries(obj)) remember(cat, id, e);
  const out = {};
  for (const [id, e] of Object.entries(obj)) { const p = patchOf(cat, id); out[id] = p ? { ...e, ...p } : e; }
  for (const [id, p] of Object.entries(OVERRIDES[cat] ?? {})) if (!(id in out) && p) out[id] = { ...p };
  return out;
}

/** A single definition (affix families are declared one call at a time and carry code). */
export function patchOne(cat, def) {
  remember(cat, def.id, def);
  const p = patchOf(cat, def.id);
  return p ? { ...def, ...p, id: def.id } : def;
}

/** For the editor: every category and its original entries. */
export const baseline = () => Object.fromEntries([...BASELINE].map(([cat, m]) => [cat, Object.fromEntries(m)]));
