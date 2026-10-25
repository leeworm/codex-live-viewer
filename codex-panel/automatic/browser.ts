import {applyAppTheme,followAppTheme} from '../native/theme.js';
import {mountNativeView} from '../native/view.js';
import type {NativeSnapshot} from '../native/feed.js';
import type {AppThemeSettings} from '../../src/shared/app-theme.js';

document.title='Live Viewer';
const viewerElement=document.querySelector<HTMLElement>('#viewer')!;
const status=document.querySelector<HTMLElement>('#connection')!;
let snapshot:NativeSnapshot={hostId:'local',threadId:'',turnId:null,calls:[],plan:[],revision:0};
const listeners=new Set<(value:NativeSnapshot)=>void>();
const feed={
 get snapshot(){return snapshot;},
 subscribe(fn:(value:NativeSnapshot)=>void){listeners.add(fn);fn(snapshot);return()=>{listeners.delete(fn);};}
};
const isHttpStream=(location.protocol==='http:'||location.protocol==='https:')&&/^\/v\/[a-f0-9]{32}$/.test(location.pathname);
if(!isHttpStream)viewerElement.dataset.themeSync='mcp-app';
const disposeTheme=followAppTheme(viewerElement);
const dispose=mountNativeView(viewerElement,feed);

function publishSnapshot(next:NativeSnapshot):void{
 if(!next||typeof next!=='object'||!Array.isArray(next.calls))return;
 if(next.threadId&&snapshot.threadId&&next.threadId!==snapshot.threadId&&snapshot.calls.length>0)return;
 snapshot=next;
 for(const listener of listeners)listener(snapshot);
}

if(isHttpStream){
 const storageKey='live-viewer:'+location.pathname;
 let token=location.hash.slice(1);
 try{
  if(!token)token=sessionStorage.getItem(storageKey)||'';
  if(token)sessionStorage.setItem(storageKey,token);
  history.replaceState(null,'',location.pathname);
 }catch{}
 const events=new EventSource(location.pathname+'/events?key='+encodeURIComponent(token));
 events.onopen=()=>{status.hidden=true;};
 events.onmessage=event=>{
  try{
   const value=JSON.parse(event.data) as NativeSnapshot;
   if(!value.threadId||(snapshot.threadId&&value.threadId!==snapshot.threadId))return;
   publishSnapshot(value);
  }catch{
   status.textContent='스트림을 읽을 수 없습니다.';
   status.hidden=false;
  }
 };
 events.onerror=()=>{
  status.textContent='연결이 끊겼습니다. 다시 연결하는 중';
  status.hidden=false;
 };
 window.addEventListener('pagehide',()=>{events.close();disposeTheme();dispose();});
}else{
 status.hidden=true;
 let activeThreadId='';
 let nextRequestId=1;
 let pollTimer:ReturnType<typeof setTimeout>|undefined;
 let polling=false;
 let disposedApp=false;
 const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(reason?:unknown)=>void;timer:ReturnType<typeof setTimeout>}>();

 function acceptPayload(raw:unknown):void{
  if(!raw||typeof raw!=='object')return;
  const record=raw as Record<string,unknown>;
  const content=(record.structuredContent&&typeof record.structuredContent==='object'?record.structuredContent:record) as Record<string,unknown>;
  if(typeof content.threadId==='string'&&content.threadId)activeThreadId=content.threadId;
  if(content.theme&&typeof content.theme==='object')applyAppTheme(viewerElement,content.theme as Partial<AppThemeSettings>);
  const candidate=(content.snapshot&&typeof content.snapshot==='object'?content.snapshot:Array.isArray(content.calls)?content:null) as NativeSnapshot|null;
  if(candidate){
   if(candidate.threadId)activeThreadId=candidate.threadId;
   publishSnapshot(candidate);
  }
  status.hidden=true;
 }

 function requestHost(method:string,params:Record<string,unknown>,timeoutMs=3500):Promise<unknown>{
  if(window.parent===window)return Promise.resolve(null);
  const id=nextRequestId++;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP App request timed out'));},timeoutMs);
   pending.set(id,{resolve,reject,timer});
   window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*');
  });
 }

 const onMessage=(event:MessageEvent)=>{
  if(event.source!==window.parent)return;
  const message=event.data as Record<string,unknown>|null;
  if(!message||message.jsonrpc!=='2.0')return;
  if(typeof message.id==='number'&&pending.has(message.id)){
   const entry=pending.get(message.id)!;
   pending.delete(message.id);
   clearTimeout(entry.timer);
   if(message.error)entry.reject(message.error);
   else entry.resolve(message.result);
   return;
  }
  const method=typeof message.method==='string'?message.method:'';
  const params=(message.params&&typeof message.params==='object'?message.params:{}) as Record<string,unknown>;
  if(method==='ui/notifications/tool-result'){
   acceptPayload(params);
  }else if(method==='ui/notifications/tool-input'){
   const args=(params.arguments&&typeof params.arguments==='object'?params.arguments:params) as Record<string,unknown>;
   if(typeof args.threadId==='string'&&args.threadId)activeThreadId=args.threadId;
  }else if(method==='ui/notifications/host-context-changed'){
   if(params.theme&&typeof params.theme==='object')applyAppTheme(viewerElement,params.theme as Partial<AppThemeSettings>);
  }
 };
 window.addEventListener('message',onMessage);

 const globalOpenai=(window as unknown as {openai?:{toolOutput?:unknown;toolInput?:{threadId?:string}}}).openai;
 if(globalOpenai?.toolInput?.threadId)activeThreadId=globalOpenai.toolInput.threadId;
 if(globalOpenai?.toolOutput)acceptPayload(globalOpenai.toolOutput);

 async function pollState():Promise<void>{
  if(disposedApp)return;
  if(pollTimer!==undefined){clearTimeout(pollTimer);pollTimer=undefined;}
  if(document.hidden){return;}
  if(!polling){
   polling=true;
   try{
    const result=await requestHost('tools/call',{
     name:'live_viewer_state',
     arguments:{
      ...(activeThreadId||snapshot.threadId?{threadId:activeThreadId||snapshot.threadId}:{}),
      sinceRevision:snapshot.revision
     }
    },2500);
    if(result)acceptPayload(result);
   }catch{/* Host bridge polling is best-effort while idle. */}
   finally{polling=false;}
  }
  if(!disposedApp&&!document.hidden)pollTimer=setTimeout(()=>{void pollState();},200);
 }

 void requestHost('ui/initialize',{
  protocolVersion:'2026-01-26',
  appInfo:{name:'codex-live-viewer',version:'0.5.4'},
  appCapabilities:{}
 },3500).then(initResult=>{
  if(initResult&&typeof initResult==='object'){
   const hostContext=(initResult as Record<string,unknown>).hostContext as Record<string,unknown>|undefined;
   if(hostContext&&typeof hostContext.threadId==='string')activeThreadId=hostContext.threadId;
  }
  if(window.parent!==window){
   window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');
  }
 }).catch(()=>{}).finally(()=>{
  void pollState();
 });

 const onVisibility=()=>{
  if(document.hidden){if(pollTimer!==undefined){clearTimeout(pollTimer);pollTimer=undefined;}}
  else void pollState();
 };
 document.addEventListener('visibilitychange',onVisibility);
 window.addEventListener('pagehide',()=>{
  disposedApp=true;
  if(pollTimer!==undefined)clearTimeout(pollTimer);
  for(const entry of pending.values())clearTimeout(entry.timer);
  pending.clear();
  window.removeEventListener('message',onMessage);
  document.removeEventListener('visibilitychange',onVisibility);
  disposeTheme();
  dispose();
 });
}
