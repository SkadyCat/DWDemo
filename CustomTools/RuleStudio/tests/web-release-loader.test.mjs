import test from 'node:test';
import assert from 'node:assert/strict';
import {createReleaseLoader} from '../scripts/web-release-loader.mjs';

test('fresh bundles and explicit source mode do not trigger a build',async()=>{
  const manifest={id:'fresh'};let builds=0;
  const load=createReleaseLoader({read:()=>manifest,build:async()=>{builds++;},source:()=>false});
  assert.equal(await load(),manifest);assert.equal(builds,0);
  const source=createReleaseLoader({read:()=>null,build:async()=>{builds++;},source:()=>true});
  assert.equal(await source(),null);assert.equal(builds,0);
});

test('stale concurrent page loads wait for one rebuild and receive the new bundle',async()=>{
  let manifest=null,finish,builds=0;
  const gate=new Promise(resolve=>{finish=resolve;});
  const load=createReleaseLoader({read:()=>manifest,source:()=>false,build:async()=>{builds++;await gate;manifest={id:'new'};}});
  const first=load(),second=load();assert.equal(builds,1);
  finish();assert.deepEqual(await Promise.all([first,second]),[manifest={id:'new'},manifest]);
  assert.equal(builds,1);assert.equal(await load(),manifest);
});

test('an edit during compilation retries once; failed builds can be retried by a later page load',async()=>{
  let attempts=0;
  const manifest={id:'latest'};
  const load=createReleaseLoader({source:()=>false,read:()=>attempts>=2?manifest:null,build:async()=>{attempts++;}});
  assert.equal(await load(),manifest);assert.equal(attempts,2);
  let failing=true,current=null;
  const retry=createReleaseLoader({source:()=>false,read:()=>current,build:async()=>{if(failing)throw Error('compile failed');current=manifest;}});
  await assert.rejects(retry(),/compile failed/);failing=false;
  assert.equal(await retry(),manifest);
});
