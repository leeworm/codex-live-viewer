import {describe,it,expect} from 'vitest';
import {startViewerService,buildPluginViewerDocument} from './service.js';
const patch=(threadId:string,turnId='turn-A',diff='+const live = 1;')=>({method:'item/fileChange/patchUpdated',params:{threadId,turnId,itemId:'patch-A',changes:[{path:'live.ts',diff}]}});
describe('automatic viewer ownership and transport',()=>{
 it('opens on first partial patch in its owning chat and isolates capability streams',async()=>{
  const opens:{threadId:string;url:string}[]=[];
  const service=await startViewerService({javascript:'/* fixture */',open:async owner=>{opens.push(owner);return true;}});
  try{
   expect(service.accept(patch('thread-A'))).toBe(true);
   await Promise.resolve();
   expect(opens).toHaveLength(1);expect(opens[0]!.threadId).toBe('thread-A');
   service.accept(patch('thread-A','turn-A','+const live = 123;'));
   service.accept(patch('thread-B'));
   await Promise.resolve();
   expect(opens).toHaveLength(2);
   const a=new URL(opens[0]!.url),b=new URL(opens[1]!.url);
   expect((await fetch(a.href)).status).toBe(200);
   expect((await fetch(a.origin+a.pathname+'/events?key='+b.hash.slice(1))).status).toBe(403);
   expect((await fetch(a.origin+a.pathname+'/events?key='+encodeURIComponent('가'.repeat(43)))).status).toBe(403);
   const controller=new AbortController();
   const response=await fetch(a.origin+a.pathname+'/events?key='+a.hash.slice(1),{signal:controller.signal});
   const first=await response.body!.getReader().read();controller.abort();
   const value=JSON.parse(new TextDecoder().decode(first.value).split('data: ')[1]!.split('\n')[0]!);
   expect(value.threadId).toBe('thread-A');expect(value.calls[0].input).toContain('123');
   expect(value.calls.some((c:{turnId:string})=>c.turnId!=='turn-A')).toBe(false);
   expect((await fetch(a.origin+'/v/unknown')).status).toBe(404);
   expect((await fetch(a.href,{headers:{Origin:'http://evil.example'}})).status).toBe(403);
   expect(service.accept({...patch('thread-A'),id:1})).toBe(false);
   expect(service.accept(patch('../wrong'))).toBe(false);
  }finally{await service.close();}
 });
 it('keeps one mounted panel across turns and refreshes UI assets without restarting the engine',async()=>{
  const opens:{url:string}[]=[];let asset='/* first */';
  const service=await startViewerService({javascript:async()=>asset,open:async owner=>{opens.push(owner);return true;}});
  const controller=new AbortController();
  try{
   service.accept(patch('thread-A'));await Promise.resolve();
   const url=new URL(opens[0]!.url);
   const response=await fetch(url.origin+url.pathname+'/events?key='+url.hash.slice(1),{signal:controller.signal});
   await response.body!.getReader().read();
   service.accept({method:'turn/completed',params:{threadId:'thread-A',turn:{id:'turn-A',status:'completed'}}});
   service.accept(patch('thread-A','turn-B'));await Promise.resolve();
   expect(opens).toHaveLength(1);expect(service.snapshot('thread-A')!.turnId).toBe('turn-B');
   expect(await (await fetch(url.origin+'/viewer.js')).text()).toBe('/* first */');
   asset='/* updated */';expect(await (await fetch(url.origin+'/viewer.js')).text()).toBe('/* updated */');
   expect(service.snapshot('thread-A')!.calls).toHaveLength(2);
  }finally{controller.abort();await service.close();}
 });
 it('redacts keys before browser output and never reopens a completed turn',async()=>{
  let opened=0;const service=await startViewerService({javascript:'',open:async()=>{opened++;return true;}});
  const fixtureKey='sk-proj-'+'x'.repeat(32);
  try{service.accept(patch('thread-A','turn-A','+api_key = "'+fixtureKey+'"'));await Promise.resolve();
   expect(service.snapshot('thread-A')!.calls[0]!.input).not.toContain(fixtureKey);
   service.accept({method:'turn/completed',params:{threadId:'thread-A',turn:{id:'turn-A',status:'completed'}}});
   expect(service.accept(patch('thread-A'))).toBe(false);expect(opened).toBe(1);
  }finally{await service.close();}
 });
 it('supports plugin mode without opening a browser tab and serves state via capability hookEndpoint',async()=>{
  const service=await startViewerService({javascript:'console.log("</script>");',theme:async()=>({mode:'dark'})});
  try{
   expect(service.accept(patch('thread-plugin','turn-P','+export const ok = true;'))).toBe(true);
   const res=await fetch(service.hookEndpoint+'?threadId=thread-plugin');
   expect(res.status).toBe(200);
   const state=await res.json() as {threadId:string;snapshot:{calls:{input:string}[]};theme:{mode:string}};
   expect(state.threadId).toBe('thread-plugin');
   expect(state.snapshot.calls[0]?.input).toContain('+export const ok = true;');
   expect(state.theme.mode).toBe('dark');
   const doc=buildPluginViewerDocument('console.log("</script>");');
   expect(doc).toContain('data-mcp-app="true"');
   expect(doc).toContain('<\\/script>');
  }finally{await service.close();}
 });
});
