import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {writeManifest} from './manifest.mjs';
const at=process.argv.indexOf('--output');
if(at<0 || !path.isAbsolute(process.argv[at+1]))throw Error('Use --output <new absolute folder>');
const output=process.argv[at+1];await fs.mkdir(output);
await build({entryPoints:[path.join(import.meta.dirname,'runtime.mjs')],outfile:path.join(output,'runtime.mjs'),bundle:true,format:'esm',platform:'node',target:'node22',banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"}});
await build({entryPoints:[path.join(import.meta.dirname,'browser.ts')],outfile:path.join(output,'viewer.js'),bundle:true,format:'iife',platform:'browser',target:'chrome130',minify:true});
const csc=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
execFileSync(csc,['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+path.join(output,'codex-live-viewer.exe'),path.join(import.meta.dirname,'shim.cs')],{encoding:'utf8',windowsHide:true});
for(const file of ['launch.ps1','enable-auto.ps1'])await fs.copyFile(path.join(import.meta.dirname,file),path.join(output,file));
await fs.writeFile(path.join(output,'Enable-Auto.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0enable-auto.ps1"\r\n');
await fs.writeFile(path.join(output,'Disable-Auto.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0enable-auto.ps1" -Disable\r\n');
await fs.writeFile(path.join(output,'Run-Codex-Live-Viewer.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"\r\n');

const plugin=path.join(output,'plugins','codex-live-viewer');
await fs.mkdir(path.join(plugin,'.codex-plugin'),{recursive:true});await fs.mkdir(path.join(plugin,'hooks'));
await build({entryPoints:[path.join(import.meta.dirname,'hook-server.mjs')],outfile:path.join(plugin,'hook-server.cjs'),bundle:true,format:'cjs',platform:'node',target:'node22'});
const presentation={displayName:'Live code',shortDescription:'Automatic code and execution view',longDescription:'Shows the existing local Codex execution in its owning chat.',capabilities:['Read']};
await fs.writeFile(path.join(plugin,'plugin.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',name:'codex-live-viewer',version:'0.5.1',description:'Automatic live code view',extensions:{'com.openai':{interface:presentation,hooks:'./hooks/hooks.json'}}},null,2));
await fs.writeFile(path.join(plugin,'.codex-plugin','plugin.json'),JSON.stringify({name:'codex-live-viewer',version:'0.5.1',description:'Automatic live code view',interface:presentation,hooks:'./hooks/hooks.json',mcpServers:'./mcp.json'},null,2));
await fs.writeFile(path.join(plugin,'mcp.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{'codex-live-viewer':{type:'stdio',command:'node',args:['${PLUGIN_ROOT}/hook-server.cjs'],env_vars:['CODEX_LIVE_VIEWER_HOOK_ENDPOINT']}}},null,2));
const hook=(phase)=>[{matcher:'^(apply_patch|Write|Edit|Bash|exec_command)$',hooks:[{type:'mcp_tool',server:'codex-live-viewer',tool:'observe',timeout:1,input:{phase,session_id:'${session_id}',turn_id:'${turn_id}',tool_use_id:'${tool_use_id}'}}]}];
await fs.writeFile(path.join(plugin,'hooks','hooks.json'),JSON.stringify({hooks:{PreToolUse:hook('before'),PostToolUse:hook('after')}},null,2));
const marketplace={name:'doho-code-viewer',interface:{displayName:'Local Code Viewer'},plugins:[{name:'codex-live-viewer',source:{source:'local',path:'./plugins/codex-live-viewer'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]};
await fs.writeFile(path.join(output,'marketplace.json'),JSON.stringify(marketplace,null,2));
await fs.mkdir(path.join(output,'.agents','plugins'),{recursive:true});await fs.writeFile(path.join(output,'.agents','plugins','marketplace.json'),JSON.stringify(marketplace,null,2));

await fs.copyFile(path.join(import.meta.dirname,'README.md'),path.join(output,'README.md'));
for(const file of ['LICENSE','THIRD-PARTY-NOTICES.txt']){const from=path.join(import.meta.dirname,'..','..',file);try{await fs.copyFile(from,path.join(plugin,file));}catch(error){if(error.code!=='ENOENT')throw error;}}
await fs.copyFile(path.join(import.meta.dirname,'..','native','reference-NOTICE.txt'),path.join(output,'reference-NOTICE.txt'));
await fs.copyFile(path.join(import.meta.dirname,'..','native','reference-NOTICE.txt'),path.join(plugin,'reference-NOTICE.txt'));
await writeManifest(output);
console.log(JSON.stringify({output,appBinaryPatched:false,requiresNormalFreshLaunch:true,plugin}));
