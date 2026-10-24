import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
const run=promisify(execFile);
/** Resolve the current installed engine at invocation, without changing shared config. */
export async function resolveInstalledRuntime(directory,{execute=run}={}){
 const powershell=path.join(process.env.WINDIR??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 // Windows PowerShell must not import PowerShell 7 modules inherited from a tool shell.
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='psmodulepath'));
 env.PSModulePath=[path.join(process.env.USERPROFILE??'', 'Documents','WindowsPowerShell','Modules'),path.join(process.env.ProgramFiles??'C:\\Program Files','WindowsPowerShell','Modules'),path.join(process.env.WINDIR??'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules')].join(path.delimiter);
 const {stdout}=await execute(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(directory,'launch.ps1'),'-ResolveOnly'],{encoding:'utf8',env,windowsHide:true,timeout:20000,maxBuffer:65536});
 const value=JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
 for(const key of ['cli','resources','node'])if(typeof value[key]!=='string'||!path.isAbsolute(value[key]))throw Error('Installed runtime resolution failed: '+key);
 if(!/^[a-f0-9]{64}$/i.test(value.cliSha256??''))throw Error('Installed CLI digest is missing');
 await Promise.all([fs.access(value.cli),fs.access(value.node),fs.access(path.join(value.resources,'codex.exe'))]);
 return value;
}
