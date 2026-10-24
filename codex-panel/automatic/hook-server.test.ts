import {describe,it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import {startViewerService} from './service.js';
describe('reviewed MCP hook ownership',()=>{
 it('accepts only actual executor metadata and existing thread/turn/call',async()=>{
  const service=await startViewerService({javascript:'',open:async()=>true});
  service.accept({method:'item/fileChange/patchUpdated',params:{threadId:'thread-A',turnId:'turn-A',itemId:'call-A',changes:[{path:'fixture.ts',diff:'+const x=1'}]}});
  const env=Object.fromEntries(Object.entries(process.env).filter((item):item is [string,string]=>typeof item[1]==='string'));
  env.CODEX_LIVE_VIEWER_HOOK_ENDPOINT=service.hookEndpoint;
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(import.meta.dirname,'hook-server.mjs')],env,stderr:'pipe'});
  const client=new Client({name:'owned-hook-test',version:'1.0.0'},{capabilities:{}});
  try{
   await client.connect(transport);
   expect((await client.listTools()).tools.map(value=>value.name)).toEqual(['observe']);
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
  }finally{await client.close();await transport.close();await service.close();}
 });
});
