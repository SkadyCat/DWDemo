import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Immutable content files + one atomically replaced project pointer.
// SVGs are real assets on disk; project manifests contain references, never copies.
export class ProjectRepository {
  constructor(directory) { this.directory = directory; }
  root(id) { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid project ID'); return path.join(this.directory, id); }
  async pointer(id) {
    try { return JSON.parse(await fs.readFile(path.join(this.root(id), 'project.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async content(root, relative) {
    // On-disk manifests are data. Resolve only files inside this project.
    if (typeof relative !== 'string') throw new Error('Invalid content reference');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('Content path escapes project');
    return fs.readFile(file, 'utf8');
  }
  async read(id) {
    const pointer = await this.pointer(id); if (!pointer) return null;
    const root = this.root(id), manifest = JSON.parse(await this.content(root, pointer.manifest));
    const document = { ...manifest.document, root: JSON.parse(await this.content(root, manifest.sceneFile)), assets: {}, prefabs: {} };
    await Promise.all(Object.entries(manifest.assets).map(async ([id, meta]) => {
      const { sourceFile, ...asset } = meta; document.assets[id] = { ...asset, source: await this.content(root, sourceFile) };
    }));
    await Promise.all(Object.entries(manifest.prefabs).map(async ([id, file]) => { document.prefabs[id] = JSON.parse(await this.content(root, file)); }));
    return { revision: pointer.revision, updatedAt: pointer.updatedAt, document };
  }
  async list() {
    await fs.mkdir(this.directory, { recursive: true });
    const directories = (await fs.readdir(this.directory, { withFileTypes: true })).filter(e => e.isDirectory() && /^[\w-]+$/.test(e.name));
    const projects = (await Promise.all(directories.map(e => this.pointer(e.name)))).filter(Boolean);
    return projects.map(p => ({ id: p.id, name: p.name, revision: p.revision, updatedAt: p.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async putContent(root, prefix, body, extension) {
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const relative = `${prefix}/${hash}.${extension}`, file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { await fs.writeFile(file, body, { encoding: 'utf8', flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return relative;
  }
  async write(document, previousRevision = 0) {
    const root = this.root(document.id), revision = previousRevision + 1, updatedAt = new Date().toISOString();
    const { root: scene, assets, prefabs, ...metadata } = document;
    const manifest = { format: 'uialpha-project-bundle/v1', document: metadata, sceneFile: await this.putContent(root, 'scenes', JSON.stringify(scene), 'scene.json'), assets: {}, prefabs: {} };
    for (const [id, asset] of Object.entries(assets)) {
      const { source, ...assetMetadata } = asset;
      const sourceFile = await this.putContent(root, `assets/${id}`, source, 'svg'); manifest.assets[id] = { ...assetMetadata, sourceFile };
    }
    for (const [id, prefab] of Object.entries(prefabs)) manifest.prefabs[id] = await this.putContent(root, `prefabs/${id}`, JSON.stringify(prefab), 'prefab.json');
    const manifestFile = await this.putContent(root, 'revisions', JSON.stringify(manifest), 'manifest.json');
    const pointer = { id: document.id, name: document.name, revision, updatedAt, manifest: manifestFile };
    const target = path.join(root, 'project.json'), temporary = path.join(root, `${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temporary, JSON.stringify(pointer, null, 2), 'utf8'); await fs.rename(temporary, target);
    return { revision, updatedAt };
  }
}
