import fs from 'node:fs/promises';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
/** Use the installed bundled MCP server. No private pipe protocol or renderer internals. */
export function createAppPanelOpener({serverPath, nodePath=process.execPath, env=process.env, timeoutMs=8000, onStatus=()=>{}}) {
  let client,transport,connecting,closed=false;
  const status=(value)=>{try{onStatus(value);}catch{}};
  async function connect(){
    if(closed)throw Error('Panel connection closed');
    if(client)return client;
    if(connecting)return connecting;
    connecting=(async()=>{
      if(!env.CODEX_APP_TOOLS_PIPE_PATH)throw Error('Codex app tool connection is unavailable');
      await fs.access(serverPath);
      transport=new StdioClientTransport({command:nodePath,args:[serverPath],env:{...env},stderr:'pipe'});
      const candidate=new Client({name:'codex-live-viewer-observer',version:'0.5.1'},{capabilities:{}});
      let timer;
      try{
        await Promise.race([candidate.connect(transport),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Panel connection timed out')),timeoutMs);})]);
        const registry=await candidate.listTools({}, {timeout:timeoutMs});
        if(!registry.tools.some(tool=>tool.name==='open_in_codex'))throw Error('Installed app does not expose open_in_codex');
        if(closed)throw Error('Panel connection closed');
        transport.stderr?.resume();client=candidate;status({phase:'connected'});return client;
      }catch(error){await candidate.close().catch(()=>{});transport=undefined;throw error;}finally{clearTimeout(timer);}
    })().finally(()=>{connecting=undefined;});return connecting;
  }
  return {
    async open({threadId,url,turnId}){
      if(!/^[a-zA-Z0-9_-]{1,160}$/.test(threadId))return false;
      let target;try{target=new URL(url);}catch{return false;}
      if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!/^\/v\/[a-f0-9]{32}$/.test(target.pathname)||!/^#[a-zA-Z0-9_-]{43}$/.test(target.hash))return false;
      try{
        const connected=await connect();
        const result=await connected.callTool({name:'open_in_codex',arguments:{target:{type:'browser',url},placement:'right'},_meta:{threadId,...(turnId?{turnId}:{} )}},undefined,{timeout:timeoutMs});
        if(result.isError)throw Error('Native panel rejected opening');
        // Accepted may mean queued for a hidden owning chat. HTTP/SSE arrival is separate display evidence.
        status({phase:'accepted',threadId});return true;
      }catch(error){status({phase:'unavailable',threadId,message:error.message});return false;}
    },
    async close(){closed=true;await client?.close().catch(()=>{});await transport?.close().catch(()=>{});client=undefined;}
  };
}
export function bundledAppTools(resources){return path.join(resources,'plugins','openai-bundled','plugins','codex-app-tools','server.mjs');}
