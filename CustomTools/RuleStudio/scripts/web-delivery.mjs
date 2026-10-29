import fs from 'node:fs/promises';
import path from 'node:path';
import { gzip, brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
const brotli = promisify(brotliCompress);
export const encoders = { gzip: promisify(gzip), br: bytes => brotli(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}) };
const MIME = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ogg':'audio/ogg', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.woff2':'font/woff2' };

function encodingFor(req) {
  const accepted = new Map(String(req.headers['accept-encoding'] || '').split(',').map(part => {
    const [name, ...params] = part.trim().split(';');
    return [name, Number(params.find(p => p.trim().startsWith('q='))?.trim().slice(2) ?? 1)];
  }));
  return ['br','gzip'].find(name => (accepted.get(name) ?? accepted.get('*') ?? 0) > 0);
}

export async function respond(req, res, code, body, { type = MIME['.json'], cache = 'no-store', etag, variants } = {}) {
  const headers = { 'Content-Type':type, 'Cache-Control':cache, Vary:'Accept-Encoding' };
  if (etag) {
    headers.ETag = etag;
    if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag)) {
      res.writeHead(304, headers); res.end(); return;
    }
  }
  let bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const encoding = bytes.length >= 1024 && /javascript|json|text\/|svg/.test(type) && encodingFor(req);
  if (encoding) {
    // Static responses share their compressed form; mutable API replies are never cached.
    bytes = variants ? await (variants[encoding] ||= encoders[encoding](bytes)) : await encoders[encoding](bytes);
    headers['Content-Encoding'] = encoding;
  }
  headers['Content-Length'] = bytes.length;
  res.writeHead(code, headers); res.end(req.method === 'HEAD' ? undefined : bytes);
}

const files = new Map();
export async function serveFile(req, res, file, { immutable = false, body } = {}) {
  const stat = await fs.stat(file);
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  let entry = files.get(file);
  if (!entry || entry.etag !== etag) {
    entry = { etag, bytes:await fs.readFile(file), variants:{} };
    if (immutable) for (const encoding of ['gzip','br']) {
      try { entry.variants[encoding] = await fs.readFile(file + (encoding === 'gzip' ? '.gz' : '.br')); } catch {}
    }
    if (files.size >= 128) files.delete(files.keys().next().value);
    files.set(file, entry);
  }
  return respond(req, res, 200, body ?? entry.bytes, { type:MIME[path.extname(file)] || 'application/octet-stream',
    cache:body !== undefined ? 'no-store' : immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    etag:body !== undefined ? undefined : etag, variants:body !== undefined ? undefined : entry.variants });
}

export function within(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
