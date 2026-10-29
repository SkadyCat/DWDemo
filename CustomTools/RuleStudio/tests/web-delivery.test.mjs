import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { serveFile, respond, within } from '../scripts/web-delivery.mjs';
import { releaseHtml } from '../scripts/web-release.mjs';

function get(url, headers = {}, method = 'GET') {
  return new Promise((resolve,reject) => {
    const req = http.request(url,{headers,method},res => {
      const chunks=[]; res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    }); req.on('error',reject); req.end();
  });
}

test('HTTP delivery: compressed bytes, revalidation, live edits, immutable releases and HEAD', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-web-'));
  const file=path.join(dir,'app.mjs'), source='export const text='+JSON.stringify('战斗资源'.repeat(3000))+';';
  await fs.writeFile(file,source);
  const server=http.createServer((req,res)=>{
    const task=req.url==='/api' ? respond(req,res,200,{text:source}) : serveFile(req,res,file,{immutable:req.url==='/release'});
    task.catch(error=>res.destroy(error));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const compressed=await get(base+'/source',{'Accept-Encoding':'gzip'});
  assert.equal(compressed.headers['cache-control'],'no-cache');
  assert.equal(compressed.headers['content-encoding'],'gzip');
  assert.equal(gunzipSync(compressed.body).toString(),source);
  assert.ok(compressed.body.length<Buffer.byteLength(source)/10);
  const cached=await get(base+'/source',{'If-None-Match':compressed.headers.etag});
  assert.equal(cached.status,304);assert.equal(cached.body.length,0);
  await fs.writeFile(file,source+'\n// edited');
  const edited=await get(base+'/source',{'If-None-Match':compressed.headers.etag});
  assert.equal(edited.status,200);assert.ok(edited.body.toString().endsWith('// edited'));
  const release=await get(base+'/release',{'Accept-Encoding':'br, gzip'});
  assert.match(release.headers['cache-control'],/immutable/);
  assert.equal(brotliDecompressSync(release.body).toString(),source+'\n// edited');
  const head=await get(base+'/release',{'Accept-Encoding':'br'},'HEAD');
  assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),release.body.length);
  const identity=await get(base+'/source',{'Accept-Encoding':'br;q=0, gzip;q=0'});
  assert.equal(identity.headers['content-encoding'],undefined);
  const api=await get(base+'/api',{'Accept-Encoding':'gzip'});
  assert.equal(api.headers['cache-control'],'no-store');assert.equal(JSON.parse(gunzipSync(api.body)).text,source);
});

test('COS shell: versioned remote scripts and CSS, same-origin API retained',()=>{
  const html='<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css"><script type="module" src="/app.mjs"></script><a href="/api/rules">rules</a>';
  const out=releaseHtml(html,{id:'1234567890abcdef1234',styles:['/a.css','/b.css']},'https://assets.example.com/studio');
  assert.equal((out.match(/rel="stylesheet"/g)||[]).length,1);
  assert.match(out,/https:\/\/assets.example.com\/studio\/_release\/1234567890abcdef1234\/app.mjs/);
  assert.match(out,/globalThis.ruleStudioAssetBase=/);
  assert.ok(out.includes('href="/api/rules"'));
  assert.equal(within(path.resolve('site'),path.resolve('site-other','secret')),false);
  assert.equal(within(path.resolve('site'),path.resolve('site','assets','a.png')),true);
});
