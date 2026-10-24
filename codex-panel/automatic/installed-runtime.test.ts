import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveInstalledRuntime} from './installed-runtime.mjs';
describe('automatic installed runtime resolution',()=>{
 it('uses the current package at each invocation and leaves config untouched',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cos-viewer-resolve-'));
  try{
   const a=path.join(base,'app-A'),b=path.join(base,'app-B');await fs.mkdir(a);await fs.mkdir(b);
   await fs.writeFile(path.join(a,'codex.exe'),'first');await fs.writeFile(path.join(b,'codex.exe'),'second');
   const config=path.join(base,'runtime-config.json');await fs.writeFile(config,'unchanged');
   let calls=0;
   const execute=async(_command:unknown,args:unknown,options:unknown)=>{expect(args).toContain('-ResolveOnly');expect(options).toMatchObject({windowsHide:true});const resources=++calls===1?a:b;return {stdout:JSON.stringify({resources,cli:path.join(resources,'codex.exe'),node:process.execPath,packageVersion:String(calls),cliSha256:'a'.repeat(64)})};};
   const first=await resolveInstalledRuntime(base,{execute});const next=await resolveInstalledRuntime(base,{execute});
   expect(first.cli).not.toBe(next.cli);expect(next.packageVersion).toBe('2');expect(calls).toBe(2);
   expect(await fs.readFile(config,'utf8')).toBe('unchanged');
  }finally{if(!path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(base).startsWith('cos-viewer-resolve-'))throw Error('Unexpected temporary directory');await fs.rm(base,{recursive:true});}
 });
 it('rejects an incomplete resolution instead of using a stale runtime',async()=>{
  await expect(resolveInstalledRuntime('unused',{execute:async()=>({stdout:JSON.stringify({cli:'relative.exe',resources:'relative',node:process.execPath})})})).rejects.toThrow('resolution failed');
  await expect(resolveInstalledRuntime('unused',{execute:async()=>({stdout:JSON.stringify({cli:process.execPath,resources:path.dirname(process.execPath),node:process.execPath,cliSha256:'bad'})})})).rejects.toThrow('digest');
 });
});
