import {describe,it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import {startViewerService} from './service.js';
describe('reviewed MCP hook ownership and plugin UI server',()=>{
 it('exposes MCP App plugin panel resource, entrypoints, state sync, and strict executor ownership',async()=>{
  const service=await startViewerService({javascript:'/* plugin-fixture */'});
  service.accept({method:'item/fileChange/patchUpdated',params:{threadId:'thread-A',turnId:'turn-A',itemId:'call-A',changes:[{path:'fixture.ts',diff:'+const x=1'}]}});
  const env=Object.fromEntries(Object.entries(process.env).filter((item):item is [string,string]=>typeof item[1]==='string'));
  env.CODEX_LIVE_VIEWER_HOOK_ENDPOINT=service.hookEndpoint;
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(import.meta.dirname,'hook-server.mjs')],env,stderr:'pipe'});
  const client=new Client({name:'owned-hook-test',version:'1.0.0'},{capabilities:{}});
  try{
   await client.connect(transport);
   expect(client.getInstructions()).toContain('automatically call live_viewer with {}');
   const tools=(await client.listTools()).tools;
   expect(tools.map(value=>value.name)).toEqual(['observe','live_viewer','live_viewer_state']);
   const panelTool=tools.find(value=>value.name==='live_viewer') as {name:string;_meta?:{ui?:{resourceUri?:string};'openai/ui'?:{entrypoints?:{type:string}[]}}}|undefined;
   expect(panelTool?._meta?.ui?.resourceUri).toBe('ui://codex-live-viewer/panel.html');
   expect(tools.find(value=>value.name==='live_viewer')?.description).toContain('before writing or editing code');
   expect(panelTool?._meta?.['openai/ui']?.entrypoints).toEqual([{type:'thread'},{type:'global'}]);

   const resources=(await client.listResources()).resources;
   expect(resources).toEqual([expect.objectContaining({uri:'ui://codex-live-viewer/panel.html',mimeType:'text/html;profile=mcp-app'})]);
   const readRes=await client.readResource({uri:'ui://codex-live-viewer/panel.html'});
   expect(readRes.contents[0]?.mimeType).toBe('text/html;profile=mcp-app');
   expect((readRes.contents[0] as {text?:string})?.text).toContain('data-mcp-app="true"');

   const args={phase:'before',session_id:'thread-A',turn_id:'turn-A',tool_use_id:'call-A'};
   await client.callTool({name:'observe',arguments:args,_meta:{threadId:'thread-B'}});
   expect(service.hookReceipts).toHaveLength(0);
   await client.callTool({name:'observe',arguments:args});
   expect(service.hookReceipts).toHaveLength(0);
   const result=await client.callTool({name:'observe',arguments:args,_meta:{threadId:'thread-A'}});
   expect(result.content).toEqual([]);expect(service.hookReceipts).toEqual([{threadId:'thread-A',turnId:'turn-A',callId:'call-A',phase:'before'}]);
   await client.callTool({name:'observe',arguments:{...args,turn_id:'wrong-turn'},_meta:{threadId:'thread-A'}});
   await client.callTool({name:'observe',arguments:{...args,tool_use_id:'unknown-call'},_meta:{threadId:'thread-A'}});
   expect(service.hookReceipts).toHaveLength(1);

   const panelState=await client.callTool({name:'live_viewer',arguments:{},_meta:{threadId:'thread-A'}});
   const structured=panelState.structuredContent as {threadId:string;snapshot:{calls:{id:string;input:string}[]}};
   expect(structured.threadId).toBe('thread-A');
   expect(structured.snapshot.calls[0]?.id).toBe('call-A');
   expect(structured.snapshot.calls[0]?.input).toContain('+const x=1');
  }finally{await client.close();await transport.close();await service.close();}
 });
 it('rejects missing or conflicting host ownership and never falls back to another conversation',async()=>{
  const env=Object.fromEntries(Object.entries(process.env).filter((item):item is [string,string]=>typeof item[1]==='string'));
  env.CODEX_LIVE_VIEWER_HOOK_ENDPOINT='';
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(import.meta.dirname,'hook-server.mjs')],env,stderr:'pipe'});
  const client=new Client({name:'local-owner-test',version:'1.0.0'},{capabilities:{}});
  try{
   await client.connect(transport);
   await client.callTool({name:'observe',arguments:{phase:'before',session_id:'owner-A',turn_id:'turn-A',tool_use_id:'call-A',tool_name:'exec_command',tool_input:{cmd:'echo owned'}},_meta:{threadId:'owner-A'}});
   for(const request of [
    {name:'live_viewer_state',arguments:{}},
    {name:'live_viewer',arguments:{threadId:'owner-A'}},
    {name:'live_viewer_state',arguments:{threadId:'owner-A'},_meta:{threadId:'owner-B'}}
   ])expect((await client.callTool(request)).isError).toBe(true);
   const own=await client.callTool({name:'live_viewer_state',arguments:{},_meta:{threadId:'owner-A'}});
   expect((own.structuredContent as {snapshot:{calls:unknown[]}}).snapshot.calls).toHaveLength(1);
   const other=await client.callTool({name:'live_viewer_state',arguments:{},_meta:{threadId:'owner-B'}});
   expect((other.structuredContent as {snapshot:{calls:unknown[]}}).snapshot.calls).toHaveLength(0);
  }finally{await client.close();await transport.close();}
 });
});
