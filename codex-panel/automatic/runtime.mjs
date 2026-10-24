import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startStdioProxy} from './stdio-proxy.mjs';
import {createAppPanelOpener,bundledAppTools} from './app-tools.mjs';
import {startViewerService} from './service.ts';
import {createThemeReader} from './theme-config.mjs';
import {resolveInstalledRuntime} from './installed-runtime.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
let config=JSON.parse((await fs.readFile(path.join(directory,'runtime-config.json'),'utf8')).replace(/^\uFEFF/,''));
if(config.autoResolve===true)config={...config,...await resolveInstalledRuntime(directory)};
if(!path.isAbsolute(config.cli)||path.resolve(config.cli)===path.resolve(process.env.CODEX_CLI_PATH??''))throw Error('Invalid stock CLI path');
let service,opener;
const env={...process.env};
// The shim is never exposed to model tools or nested CLI invocations.
delete env.CODEX_CLI_PATH;env.CODEX_APP_RUNTIME_CLI_PATH=config.cli;
const log=value=>{if(value.phase==='unavailable')process.stderr.write('[live-viewer] '+value.message+'\n');};
if(args.includes('app-server')){
 try{
  opener=createAppPanelOpener({serverPath:bundledAppTools(config.resources),nodePath:config.node,env,onStatus:log});
  service=await startViewerService({theme:createThemeReader(),javascript:()=>fs.readFile(path.join(directory,'viewer.js'),'utf8'),open:owner=>opener.open(owner)});
  env.CODEX_LIVE_VIEWER_HOOK_ENDPOINT=service.hookEndpoint;
 }catch(error){process.stderr.write('[live-viewer] '+error.message+'\n');}
}
const childArgs=args.includes('app-server')?['-c','features.apply_patch_streaming_events=true',...args]:args;
const proxy=startStdioProxy({command:config.cli,args:childArgs,env,onServerMessage:message=>service?.accept(message)});
// Only the child created here is owned. Never search for or stop other Codex processes.
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>proxy.child.kill(signal));
try{const result=await proxy.completion;process.exitCode=result.code??1;}
catch(error){process.stderr.write('[live-viewer] '+error.message+'\n');process.exitCode=1;}
finally{await service?.close();await opener?.close();}
