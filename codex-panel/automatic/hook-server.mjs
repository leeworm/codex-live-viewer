import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
const schema={type:'object',properties:{phase:{enum:['before','after']},session_id:{type:'string'},turn_id:{type:'string'},tool_use_id:{type:'string'}},required:['phase','session_id','turn_id','tool_use_id'],additionalProperties:false};
const server=new Server({name:'codex-live-viewer-hooks',version:'0.5.3'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'observe',description:'Connect a reviewed lifecycle hook to its existing local viewer. Returns no model context.',inputSchema:schema}]}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
 const input=request.params.arguments??{},meta=request.params._meta??{};
 // The engine supplies this metadata. A template argument alone is not ownership proof.
 if(request.params.name!=='observe'||typeof meta.threadId!=='string'||meta.threadId!==input.session_id||!['before','after'].includes(input.phase))return {content:[]};
 try{
  const endpoint=new URL(process.env.CODEX_LIVE_VIEWER_HOOK_ENDPOINT??'');
  if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||!/^\/hook\/[a-f0-9]{64}$/.test(endpoint.pathname))return {content:[]};
  await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:meta.threadId,turnId:input.turn_id,callId:input.tool_use_id,phase:input.phase}),signal:AbortSignal.timeout(350)});
 }catch{/* Observation never changes or blocks a tool permission decision. */}
 return {content:[]};
});
void server.connect(new StdioServerTransport()).catch(error=>{process.stderr.write('[live-viewer-hook] '+error.message+'\n');process.exitCode=1;});
