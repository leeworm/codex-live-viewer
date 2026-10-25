import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parse} from 'smol-toml';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {AUTO_OPEN_INSTRUCTIONS,AUTO_OPEN_TOOL_DESCRIPTION} from './auto-open.mjs';

export const PANEL_RESOURCE_URI='ui://codex-live-viewer/panel.html';
export const MCP_APP_MIME='text/html;profile=mcp-app';

const SECRET_PATTERNS=[
 [/\bsk-(?:or-v1-|proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g,'[redacted]'],
 [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,'[redacted private key]'],
 [/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g,'[redacted]'],
 [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,'[redacted]'],
 [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,'[redacted]'],
 [/\bAIza[0-9A-Za-z_-]{35}\b/g,'[redacted]'],
 [/\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,'[redacted]'],
 [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,'[redacted]'],
 [/\b(Authorization:\s*(?:Basic|Bearer|Token))\s+[^\s"']+/gi,'$1 [redacted]'],
 [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,'Bearer [redacted]'],
 [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,'$1[redacted]@'],
 [/(\/mcp\/[a-z0-9-]+\/)[A-Za-z0-9_-]{20,}/g,'$1[redacted]']
];
function redact(value,cap=20000){
 let out=typeof value==='string'?value:'';
 for(const [pattern,replacement] of SECRET_PATTERNS)out=out.replace(pattern,replacement);
 return out.slice(-cap);
}
function encodeText(value){
 if(typeof value==='string')return value;
 if(value==null)return '';
 try{return JSON.stringify(value,null,2)??'';}catch{return '';}
}
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():undefined;
function extractPalette(raw){
 const v=isObject(raw)?raw:{},sem=isObject(v.semanticColors)?v.semanticColors:{},out={};
 for(const key of ['surface','ink','accent']){const c=validColor(v[key]);if(c)out[key]=c;}
 const added=validColor(sem.diffAdded),removed=validColor(sem.diffRemoved);
 if(added)out.added=added;if(removed)out.removed=removed;
 if(typeof v.contrast==='number'&&Number.isFinite(v.contrast))out.contrast=Math.max(0,Math.min(100,v.contrast));
 return out;
}
let cachedTheme={mode:'system'};
async function readLocalTheme(){
 const file=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'config.toml');
 try{
  const text=await fs.readFile(file,'utf8');
  if(text.length<=1_000_000){
   const parsed=parse(text),desktop=isObject(parsed?.desktop)?parsed.desktop:{};
   cachedTheme={
    mode:desktop.appearanceTheme==='dark'||desktop.appearanceTheme==='light'?desktop.appearanceTheme:'system',
    light:extractPalette(desktop.appearanceLightChromeTheme),
    dark:extractPalette(desktop.appearanceDarkChromeTheme)
   };
  }
 }catch{}
 return cachedTheme;
}

const localThreads=new Map();

function parseHookTool(toolName,toolInput){
 const rawName=typeof toolName==='string'?toolName.trim():'';
 if(!rawName)return null;
 const args=isObject(toolInput)?toolInput:{};
 if(rawName==='apply_patch'||/apply_patch/i.test(rawName)){
  const patchText=typeof toolInput==='string'?toolInput:typeof args.patch==='string'?args.patch:typeof args.command==='string'?args.command:encodeText(toolInput);
  const fileMatch=patchText.match(/\*\*\*\s+(Add|Update|Delete)\s+File:\s+([^\r\n]+)/);
  const kindMap={Add:'add',Update:'update',Delete:'delete'};
  return {
   tool:'patch',
   title:fileMatch?.[2]?.trim()||typeof args.path==='string'&&args.path||'파일 변경',
   input:patchText,
   changeKind:fileMatch?kindMap[fileMatch[1]]:undefined
  };
 }
 if(rawName==='Bash'||/^(?:exec|exec_command|bash|shell)$/i.test(rawName)){
  const cmd=typeof args.command==='string'?args.command:typeof args.cmd==='string'?args.cmd:typeof toolInput==='string'?toolInput:encodeText(toolInput);
  const heredocPatch=cmd.match(/apply_patch\s*<<-?['"]?[A-Za-z0-9_]+['"]?\r?\n([\s\S]*?\*\*\*\s+End Patch)/);
  if(heredocPatch){
   const patchBody=heredocPatch[1];
   const fileMatch=patchBody.match(/\*\*\*\s+(Add|Update|Delete)\s+File:\s+([^\r\n]+)/);
   const kindMap={Add:'add',Update:'update',Delete:'delete'};
   return {tool:'patch',title:fileMatch?.[2]?.trim()||'파일 변경',input:patchBody,changeKind:fileMatch?kindMap[fileMatch[1]]:undefined};
  }
  return {tool:'command',title:cmd.split(/\r?\n/)[0]||'명령',input:cmd};
 }
 const title=typeof args.path==='string'?args.path:typeof args.file_path==='string'?args.file_path:rawName;
 const input=typeof args.content==='string'?JSON.stringify({path:title,content:args.content}):typeof args.code==='string'?args.code:encodeText(toolInput);
 return {tool:rawName,title,input,changeKind:/write/i.test(rawName)?'add':undefined};
}

function recordLocalHook(threadId,turnId,callId,phase,toolName,toolInput,toolResponse){
 if(!threadId||!turnId||!callId)return;
 const parsed=parseHookTool(toolName,toolInput);
 let state=localThreads.get(threadId);
 if(!state){
  if(!parsed)return;
  state={hostId:'local',threadId,turnId,calls:[],plan:[],revision:0};
  localThreads.set(threadId,state);
 }
 if(state.turnId!==turnId){state.turnId=turnId;state.plan=[];}
 let call=state.calls.find(item=>item.id===callId&&item.turnId===turnId);
 if(!call){
  if(!parsed)return;
  call={
   id:callId,
   turnId,
   tool:parsed.tool,
   title:redact(parsed.title,500),
   input:redact(parsed.input),
   output:'',
   progress:'',
   status:parsed.tool==='patch'?'writing':'running',
   inputSource:'tool-input-ready',
   time:Date.now(),
   ...(parsed.changeKind?{changeKind:parsed.changeKind}:{})
  };
  state.calls.push(call);
  if(state.calls.length>40)state.calls=state.calls.slice(-40);
 }else if(parsed){
  call.tool=parsed.tool;
  call.title=redact(parsed.title,500);
  if(parsed.input)call.input=redact(parsed.input);
  if(parsed.changeKind)call.changeKind=parsed.changeKind;
 }
 if(phase==='after'){
  call.status='completed';
  if(toolResponse!=null){
   const resp=isObject(toolResponse)?toolResponse:null;
   const outText=typeof toolResponse==='string'?toolResponse:typeof resp?.output==='string'?resp.output:typeof resp?.stdout==='string'?resp.stdout:encodeText(toolResponse);
   if(outText)call.output=redact(outText);
   if(typeof resp?.exitCode==='number'){call.exitCode=resp.exitCode;if(resp.exitCode!==0)call.status='failed';}
  }
 }
 state.revision++;
}

async function resolveViewerState(requestedThreadId){
 const targetThread=requestedThreadId||'';
 if(!targetThread)throw Error('An exact host conversation is required.');
 try{
  const endpoint=new URL(process.env.CODEX_LIVE_VIEWER_HOOK_ENDPOINT??'');
  if(endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1'&&/^\/hook\/[a-f0-9]{64}$/.test(endpoint.pathname)){
   const stateUrl=new URL(endpoint.href);
   if(targetThread)stateUrl.searchParams.set('threadId',targetThread);
   const response=await fetch(stateUrl,{method:'GET',signal:AbortSignal.timeout(400)});
   if(response.ok){
    const remote=await response.json();
    if(remote.threadId!==targetThread||remote.snapshot?.threadId!==targetThread)throw Error('Viewer conversation ownership mismatch.');
    const resolvedThread=targetThread;
    return {
     threadId:resolvedThread,
     snapshot:remote.snapshot??localThreads.get(resolvedThread)??{hostId:'local',threadId:resolvedThread,turnId:null,calls:[],plan:[],revision:0},
     theme:remote.theme??await readLocalTheme()
    };
   }
  }
 }catch{}
 const local=localThreads.get(targetThread);
 const resolvedThread=local?.threadId||targetThread;
 return {
  threadId:resolvedThread,
  snapshot:local?{...local,calls:local.calls.map(c=>({...c})),plan:local.plan.map(p=>({...p}))}:{hostId:'local',threadId:resolvedThread,turnId:null,calls:[],plan:[],revision:0},
  theme:await readLocalTheme()
 };
}

async function loadPluginViewerDocument(){
 const baseDir=path.dirname(path.resolve(process.argv[1]??'.'));
 const candidates=[
  path.join(baseDir,'viewer.js'),
  path.join(baseDir,'..','..','viewer.js')
 ];
 let script='/* Live Viewer asset fallback */';
 for(const candidate of candidates){
  try{script=await fs.readFile(candidate,'utf8');break;}catch{}
 }
 const safeScript=script.replace(/<\/script/gi,'<\\/script');
 return '<!doctype html><html lang="ko" data-mcp-app="true"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live Viewer</title><style>html,body{margin:0;height:100%;color-scheme:light dark;background:var(--viewer-background,light-dark(#fff,#171717));font:12px system-ui}#viewer{height:100%;display:flex}#connection{position:fixed;bottom:4px;right:8px;z-index:2;background:var(--viewer-background,light-dark(#fff,#171717));color:#888}</style><div id="viewer" data-theme-sync="mcp-app"></div><div id="connection" hidden>연결 중</div><script>'+safeScript+'</script></html>';
}

const observeSchema={
 type:'object',
 properties:{
  phase:{enum:['before','after']},
  session_id:{type:'string'},
  turn_id:{type:'string'},
  tool_use_id:{type:'string'},
  tool_name:{type:'string'},
  tool_input:{},
  tool_response:{}
 },
 required:['phase','session_id','turn_id','tool_use_id'],
 additionalProperties:true
};

const panelSchema={
 type:'object',
 properties:{
  threadId:{type:'string'}
 },
 additionalProperties:false
};

const stateSchema={
 type:'object',
 properties:{
  threadId:{type:'string'},
  sinceRevision:{type:'number'}
 },
 additionalProperties:false
};

const server=new Server({name:'codex-live-viewer',version:'0.5.4'},{capabilities:{tools:{},resources:{}},instructions:AUTO_OPEN_INSTRUCTIONS});

server.setRequestHandler(ListResourcesRequestSchema,async()=>({
 resources:[
  {
   uri:PANEL_RESOURCE_URI,
   name:'Live Viewer',
   description:'Codex plugin panel for real-time code, diff, and command execution.',
   mimeType:MCP_APP_MIME
  }
 ]
}));

server.setRequestHandler(ReadResourceRequestSchema,async request=>{
 if(request.params.uri!==PANEL_RESOURCE_URI)throw Error('Unknown resource URI: '+request.params.uri);
 const html=await loadPluginViewerDocument();
 return {
  contents:[
   {
    uri:PANEL_RESOURCE_URI,
    mimeType:MCP_APP_MIME,
    text:html,
    _meta:{
     ui:{prefersBorder:false},
     'openai/ui':{
      preferredDisplayMode:'fullscreen',
      availableDisplayModes:['inline','fullscreen']
     }
    }
   }
  ]
 };
});

server.setRequestHandler(ListToolsRequestSchema,async()=>({
 tools:[
  {
   name:'observe',
   description:'Connect a reviewed lifecycle hook to its existing local viewer. Returns no model context.',
   inputSchema:observeSchema
  },
  {
   name:'live_viewer',
   title:'Live Viewer',
   description:AUTO_OPEN_TOOL_DESCRIPTION,
   inputSchema:panelSchema,
   annotations:{title:'Live Viewer',readOnlyHint:true},
   _meta:{
    ui:{resourceUri:PANEL_RESOURCE_URI},
    'openai/outputTemplate':PANEL_RESOURCE_URI,
    'openai/ui':{
     entrypoints:[{type:'thread'},{type:'global'}]
    },
    'openai/toolInvocation/invoking':'Live Viewer 여는 중…',
    'openai/toolInvocation/invoked':'Live Viewer 준비됨'
   }
  },
  {
   name:'live_viewer_state',
   title:'Live Viewer State',
   description:'Read the latest Live Viewer snapshot and theme settings for the active conversation.',
   inputSchema:stateSchema,
   annotations:{title:'Live Viewer State',readOnlyHint:true},
   _meta:{
    ui:{visibility:['app']}
   }
  }
 ]
}));

server.setRequestHandler(CallToolRequestSchema,async request=>{
 const input=request.params.arguments??{},meta=request.params._meta??{};
 if(request.params.name==='live_viewer'||request.params.name==='live_viewer_state'){
  const requestedThread=typeof meta.threadId==='string'?meta.threadId:'';
  if(!requestedThread||(typeof input.threadId==='string'&&input.threadId!==requestedThread))return {isError:true,content:[{type:'text',text:'Live Viewer requires the current conversation from the host.'}]};
  const state=await resolveViewerState(requestedThread);
  if(request.params.name==='live_viewer'){
   return {
    content:[{type:'text',text:'Live Viewer 플러그인 패널이 연결되었습니다.'}],
    structuredContent:state,
    _meta:{
     ui:{resourceUri:PANEL_RESOURCE_URI},
     'openai/outputTemplate':PANEL_RESOURCE_URI
    }
   };
  }
  return {
   content:[],
   structuredContent:state
  };
 }
 // The engine supplies this metadata. A template argument alone is not ownership proof.
 if(request.params.name!=='observe'||typeof meta.threadId!=='string'||meta.threadId!==input.session_id||!['before','after'].includes(input.phase))return {content:[]};
 recordLocalHook(meta.threadId,input.turn_id,input.tool_use_id,input.phase,input.tool_name,input.tool_input,input.tool_response);
 try{
  const endpoint=new URL(process.env.CODEX_LIVE_VIEWER_HOOK_ENDPOINT??'');
  if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||!/^\/hook\/[a-f0-9]{64}$/.test(endpoint.pathname))return {content:[]};
  await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:meta.threadId,turnId:input.turn_id,callId:input.tool_use_id,phase:input.phase}),signal:AbortSignal.timeout(350)});
 }catch{/* Observation never changes or blocks a tool permission decision. */}
 return {content:[]};
});

void server.connect(new StdioServerTransport()).catch(error=>{process.stderr.write('[live-viewer-hook] '+error.message+'\n');process.exitCode=1;});
