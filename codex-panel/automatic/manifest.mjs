import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function writeManifest(output){
 const source=import.meta.dirname,root=path.resolve(source,'..','..');
 const names=['app-tools.mjs','auto-open.mjs','browser.ts','build.mjs','hook-server.mjs','launch.ps1','enable-auto.ps1','installed-runtime.mjs','manifest.mjs','README.md','runtime.mjs','service.ts','theme-config.mjs','shim.cs','stdio-proxy.mjs'];
 const inputs=[];
 for(const file of [...names.map(name=>'codex-panel/automatic/'+name),'maintenance/configure-transport.cjs','codex-panel/native/feed.ts','codex-panel/native/view.ts','codex-panel/native/view-styles.ts','codex-panel/native/presentation.ts','codex-panel/native/typing.ts','codex-panel/native/theme.ts','src/shared/app-theme.ts','codex-panel/native/reference-NOTICE.txt','src/shared/redaction.ts'])inputs.push({path:file,sha256:sha(await fs.readFile(path.join(root,file)))});
 const files=[];
 async function scan(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(entry.name==='BUILD.json'||entry.name==='VERIFIED.json'||entry.name.startsWith('runtime-config'))continue;const absolute=path.join(directory,entry.name);if(entry.isDirectory())await scan(absolute);else files.push({path:path.relative(output,absolute).replaceAll(path.sep,'/'),sha256:sha(await fs.readFile(absolute))});}}
 await scan(output);
 const manifest={version:'0.5.4',rendererRevision:'codex-return-1',builtAt:new Date().toISOString(),inputs,files,appBinaryPatched:false,userConfigurationModified:false,activation:'user-level plugin and stream connection after Enable-Auto; next ordinary Codex launch',stream:'existing local app-server stdio and plugin lifecycle hooks, no extra model run',panel:'Codex MCP App plugin panel (ui://codex-live-viewer/panel.html) with thread and global entrypoints',futureCompatibility:'latest package resolved at launch; supports MCP App plugin panel and lifecycle hooks'};
 await fs.writeFile(path.join(output,'BUILD.json'),JSON.stringify(manifest,null,2));return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const at=process.argv.indexOf('--output');if(at<0)throw Error('--output required');const result=await writeManifest(path.resolve(process.argv[at+1]));console.log(JSON.stringify({version:result.version,inputs:result.inputs.length,files:result.files.length}));}
