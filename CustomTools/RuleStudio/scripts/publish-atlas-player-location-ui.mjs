import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { atlasPlayerLocationDocument } from '../../UICreatorAlpha/src/assets/rulestudio-hud/atlas-player-location.js';
import { validateDocument } from '../../UICreatorAlpha/src/core/model.js';

const document = atlasPlayerLocationDocument(), errors = validateDocument(document);
if (errors.length) throw Error(errors.join('\n'));
const url = `http://127.0.0.1:5190/api/projects/${document.id}`;
const response = await fetch(url); let revision = 0, previous;
if (response.ok) { previous = await response.json(); revision = previous.revision; }
else if (response.status !== 404) throw Error(`UICreator ${response.status}`);
if (!previous || !isDeepStrictEqual(previous.document, document)) {
  const saved = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` }, body: JSON.stringify(document) });
  if (!saved.ok) throw Error(await saved.text());
  revision = (await saved.json()).revision;
}
const checked = await (await fetch(url)).json();
if (checked.revision !== revision || !isDeepStrictEqual(checked.document, document)) throw Error('UICreator 保存回读不一致');
const folder = new URL('../../UICreatorAlpha/Screen/AtlasPlayerLocation/', import.meta.url);
await fs.mkdir(folder, { recursive: true });
await fs.writeFile(new URL('player-location.uialpha.json', folder), JSON.stringify(document, null, 2));
await fs.writeFile(new URL('../public/ui/atlas-player-location.uialpha.json', import.meta.url), JSON.stringify(document));
console.log(JSON.stringify({ project: document.id, revision, savedAndReloaded: true, errors }));
