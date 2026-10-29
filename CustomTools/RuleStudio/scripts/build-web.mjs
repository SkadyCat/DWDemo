// One versioned release, identical on localhost and COS. No rule/API snapshots.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build, transform } from 'esbuild';
import { TOOL_ROOT } from './rule-files.mjs';
import { WEB_ROOT } from './web-release.mjs';
import { encoders } from './web-delivery.mjs';

const publicRoot = path.join(TOOL_ROOT, 'public');
const inputs = new Set();
const output = new Map();
const html = await fs.readFile(path.join(publicRoot, 'index.html'), 'utf8');
inputs.add(path.join(publicRoot, 'index.html'));
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
const css = [];
for (const url of styles) {
  const file = path.join(publicRoot, url); inputs.add(file);
  css.push((await fs.readFile(file,'utf8'))
    .replace(/url\((['"]?)\/(assets\/[^)'"\s]+)\1\)/g, 'url("./$2")')
    .replace(/\[src="(\/assets\/[^"\]]+)"\]/g, '[src$="$1"]'));
}
output.set('app.css', Buffer.from((await transform(css.join('\n'), { loader:'css', minify:true })).code));
const result = await build({
  absWorkingDir:TOOL_ROOT, entryPoints:['public/app.mjs'], bundle:true, minify:true,
  format:'esm', splitting:true, platform:'browser', target:'es2022', outdir:'bundles',
  entryNames:'app', chunkNames:'chunks/[name]-[hash]', outExtension:{'.js':'.mjs'},
  metafile:true, write:false, legalComments:'eof',
  plugins:[{ name:'studio-root-imports', setup(builder) {
    builder.onResolve({ filter:/^\// }, args => ({ path:args.path.startsWith('/uicreator/')
      ? path.resolve(TOOL_ROOT, '../UICreatorAlpha/src', args.path.slice('/uicreator/'.length))
      : path.resolve(TOOL_ROOT, args.path.startsWith('/engine/') || args.path.startsWith('/parity/') ? '.' : 'public', args.path.slice(1)) }));
  } }],
});
for (const input of Object.keys(result.metafile.inputs)) inputs.add(path.resolve(TOOL_ROOT,input));
for (const file of result.outputFiles) output.set(path.relative(path.join(TOOL_ROOT,'bundles'),file.path).replaceAll('\\','/'), file.contents);

async function assets(folder, prefix) {
  for (const entry of await fs.readdir(folder,{withFileTypes:true})) {
    if (entry.name === 'source') continue; // Original authoring sheets are not runtime resources.
    const file = path.join(folder,entry.name), key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await assets(file,key);
    else { inputs.add(file); output.set(key,await fs.readFile(file)); }
  }
}
await assets(path.join(publicRoot,'assets'),'assets');
await assets(path.join(publicRoot,'audio/assets'),'audio/assets');
await assets(path.join(publicRoot,'prefabs/royal-treasury/assets'),'prefabs/royal-treasury/assets');
const hash = createHash('sha256');
for (const [name,bytes] of [...output].sort(([a],[b])=>a.localeCompare(b))) hash.update(name).update('\0').update(bytes);
const id = hash.digest('hex').slice(0,20), releaseDir = path.join(WEB_ROOT,'releases',id);
for (const [name,bytes] of output) {
  const file = path.join(releaseDir,name); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,bytes);
  if (/\.(mjs|css)$/.test(name)) {
    await Promise.all(Object.entries(encoders).map(async ([encoding,encode])=>fs.writeFile(file+(encoding==='gzip'?'.gz':'.br'),await encode(bytes))));
  }
}
const manifest = { id, createdAt:new Date().toISOString(), styles, inputs:[],
  stats:{ modules:Object.keys(result.metafile.inputs).length, sourceBytes:Object.values(result.metafile.inputs).reduce((n,m)=>n+m.bytes,0), scriptBytes:result.outputFiles.reduce((n,f)=>n+f.contents.length,0), files:output.size } };
for (const file of [...inputs].sort()) { const stat=await fs.stat(file); manifest.inputs.push({path:file,size:stat.size,mtimeMs:stat.mtimeMs}); }
await fs.mkdir(WEB_ROOT,{recursive:true});
await fs.writeFile(path.join(WEB_ROOT,'current.json.tmp'),JSON.stringify(manifest,null,2));
await fs.rename(path.join(WEB_ROOT,'current.json.tmp'),path.join(WEB_ROOT,'current.json'));
console.log(JSON.stringify({id,releaseDir,...manifest.stats},null,2));
