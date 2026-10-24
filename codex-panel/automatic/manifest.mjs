import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function writeManifest(output){
 const source=import.meta.dirname,root=path.resolve(source,'..','..');
 const names=['app-tools.mjs','browser.ts','build.mjs','hook-server.mjs','launch.ps1','enable-auto.ps1','installed-runtime.mjs','manifest.mjs','README.md','runtime.mjs','service.ts','shim.cs','stdio-proxy.mjs'];
 const inputs=[];
 for(const file of [...names.map(name=>'codex-panel/automatic/'+name),'codex-panel/native/feed.ts','codex-panel/native/view.ts','codex-panel/native/view-styles.ts','codex-panel/native/presentation.ts','codex-panel/native/typing.ts','codex-panel/native/reference-NOTICE.txt','src/shared/redaction.ts'])inputs.push({path:file,sha256:sha(await fs.readFile(path.join(root,file)))});
 const files=[];
 async function scan(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(entry.name==='BUILD.json'||entry.name==='VERIFIED.json'||entry.name.startsWith('runtime-config'))continue;const absolute=path.join(directory,entry.name);if(entry.isDirectory())await scan(absolute);else files.push({path:path.relative(output,absolute).replaceAll(path.sep,'/'),sha256:sha(await fs.readFile(absolute))});}}
 await scan(output);
 const manifest={version:'0.5.1',rendererRevision:'reference-typing-1',builtAt:new Date().toISOString(),inputs,files,appBinaryPatched:false,userConfigurationModified:false,activation:'user-level automatic connection after Enable-Auto; next ordinary Codex launch',stream:'existing local app-server stdio, no extra model run',panel:'built-in native browser panel via bundled codex_app.open_in_codex',futureCompatibility:'latest package resolved at launch; requires CLI override and native tool contract to remain available'};
 await fs.writeFile(path.join(output,'BUILD.json'),JSON.stringify(manifest,null,2));return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const at=process.argv.indexOf('--output');if(at<0)throw Error('--output required');const result=await writeManifest(path.resolve(process.argv[at+1]));console.log(JSON.stringify({version:result.version,inputs:result.inputs.length,files:result.files.length}));}
