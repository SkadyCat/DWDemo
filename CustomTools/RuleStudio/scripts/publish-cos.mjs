// Upload only an immutable web release. Credentials never enter the HTML, manifest or logs.
import fs from 'node:fs/promises';
import path from 'node:path';
import COS from 'cos-nodejs-sdk-v5';
import { TOOL_ROOT } from './rule-files.mjs';
import { WEB_ROOT, currentRelease } from './web-release.mjs';
import { encoders } from './web-delivery.mjs';

async function main() {
  const manifest=currentRelease();
  if(!manifest)throw Error('先运行 npm run build:web，且构建后不能修改源文件');
  const root=path.join(WEB_ROOT,'releases',manifest.id), files=[];
  async function walk(folder,prefix='') {
    for(const entry of await fs.readdir(folder,{withFileTypes:true})) {
      const file=path.join(folder,entry.name), name=prefix+entry.name;
      if(entry.isDirectory())await walk(file,name+'/');
      else if(!/\.(gz|br)$/.test(name))files.push({file,name});
    }
  }
  await walk(root);
  const configPath=path.join(TOOL_ROOT,'deploy','cos.local.json');
  let config={};try{config=JSON.parse(await fs.readFile(configPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(process.argv.includes('--dry-run')) {
    let raw=0,wire=0;
    for(const {file,name} of files){const bytes=await fs.readFile(file);raw+=bytes.length;wire+=/\.(mjs|css)$/.test(name)?(await encoders.gzip(bytes)).length:bytes.length;}
    console.log(JSON.stringify({dryRun:true,releaseId:manifest.id,files:files.length,rawBytes:raw,uploadBytes:wire,configReady:!!(config.bucket&&config.region&&config.baseUrl),credentialsPresent:!!(process.env.COS_SECRET_ID&&process.env.COS_SECRET_KEY)},null,2));
    return;
  }
  if(!/^[a-z0-9-]+-\d+$/.test(config.bucket||'')||! /^[a-z]{2}-[a-z0-9-]+$/.test(config.region||''))throw Error('在 deploy/cos.local.json 填写 bucket、region、baseUrl 和 origins；参见 cos.example.json');
  const base=new URL(config.baseUrl);
  if(base.protocol!=='https:'||base.search||base.hash||base.username||base.password)throw Error('baseUrl 必须是无凭据的 HTTPS 资源域名');
  if(!config.origins?.length)throw Error('origins 必须列出实际 RuleStudio 网站来源，用于验证跨域');
  if(!process.env.COS_SECRET_ID||!process.env.COS_SECRET_KEY)throw Error('缺少 COS_SECRET_ID / COS_SECRET_KEY 环境变量；不要把密钥写入项目文件');
  const cos=new COS({SecretId:process.env.COS_SECRET_ID,SecretKey:process.env.COS_SECRET_KEY,SecurityToken:process.env.COS_SECURITY_TOKEN});
  const prefix=decodeURIComponent(base.pathname).replace(/^\/|\/$/g,'');
  const remoteRoot=[prefix,'_release',manifest.id].filter(Boolean).join('/');
  const mime={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg'};
  let cursor=0,completed=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(cursor<files.length){
      const {file,name}=files[cursor++];let body=await fs.readFile(file);
      const compressed=/\.(mjs|css)$/.test(name);if(compressed)body=await encoders.gzip(body);
      await new Promise((resolve,reject)=>cos.putObject({Bucket:config.bucket,Region:config.region,Key:`${remoteRoot}/${name}`,Body:body,ContentLength:body.length,
        ContentType:mime[path.extname(name)]||'application/octet-stream',ContentEncoding:compressed?'gzip':undefined,CacheControl:'public, max-age=31536000, immutable'},(error,result)=>error?reject(Error(`COS 上传失败 ${name}: ${error.code||error.statusCode||'unknown'}`)):resolve(result)));
      if(++completed%50===0)console.log(`COS ${completed}/${files.length}`);
    }
  }));
  const checks=files.filter(f=>/\.(mjs|css)$/.test(f.name));
  for(const prefix of ['assets/icons/','audio/assets/','prefabs/']){const entry=files.find(f=>f.name.startsWith(prefix));if(entry)checks.push(entry);}
  for(const origin of config.origins)for(const {name} of checks){
    const response=await fetch(`${base.href.replace(/\/$/,'')}/_release/${manifest.id}/${name}`,{headers:{Origin:origin},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`公开资源校验失败 ${name}: HTTP ${response.status}；尚未切换 COS`);
    const allowed=response.headers.get('access-control-allow-origin');
    if(allowed!=='*'&&allowed!==origin)throw Error(`资源缺少允许 ${origin} 的 CORS: ${name}；尚未切换 COS`);
    if(/\.mjs$/.test(name)&&!/javascript/.test(response.headers.get('content-type')||''))throw Error(`脚本 MIME 错误: ${name}；尚未切换 COS`);
    // Also exercises decompression, rather than accepting successful headers alone.
    await response.arrayBuffer();
  }
  if(currentRelease()?.id!==manifest.id)throw Error('上传期间源文件变化；保留已上传版本，尚未切换 COS，请重新构建发布');
  await fs.writeFile(configPath,JSON.stringify({...config,enabled:true,releaseId:manifest.id},null,2)+'\n');
  console.log(`COS 已验证并启用：${base.href.replace(/\/$/,'')}/_release/${manifest.id}/`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
