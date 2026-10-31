import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {currentRelease} from './web-release.mjs';
import {createRequire} from 'node:module';
const esbuildAvailable=()=>{try{createRequire(import.meta.url).resolve('esbuild');return true;}catch{return false;}};

const execute=promisify(execFile);
async function buildRelease(){
  await execute(process.execPath,[fileURLToPath(new URL('./build-web.mjs',import.meta.url))],{
    windowsHide:true,timeout:30000,maxBuffer:1024*1024,
  });
}

// Concurrent page loads share a single asynchronous build. Source edits still take
// effect immediately, without making every browser load the entire module graph.
export function createReleaseLoader({read=currentRelease,build=buildRelease,source=()=>process.env.RULESTUDIO_WEB_SOURCE==='1',canBuild=build===buildRelease?esbuildAvailable:()=>true}={}){
  let pending,sourceFallback=false;
  return async function loadRelease(){
    if(source()||sourceFallback)return null;
    const fresh=read();if(fresh)return fresh;
    // Without the optional build toolchain (npm run setup) the site still runs from source.
    if(!canBuild()){sourceFallback=true;console.warn('RuleStudio：未安装 esbuild，使用源码模式运行（运行 npm run setup 可启用压缩资源）');return null;}
    if(!pending)pending=(async()=>{
      // An editor may save another input while the first build is in flight.
      for(let attempt=0;attempt<2;attempt++){
        await build();const result=read();if(result)return result;
      }
      throw Error('前端源码仍在更新，请稍后重试');
    })().finally(()=>{pending=undefined;});
    return pending;
  };
}
export const loadWebRelease=createReleaseLoader();
