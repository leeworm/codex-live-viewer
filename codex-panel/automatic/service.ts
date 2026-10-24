import http from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {NativeCodeFeed} from '../native/feed.js';
import type {NativeSnapshot} from '../native/feed.js';
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const same = (a: string, b: string) => {const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length && timingSafeEqual(left,right);};
const html = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live code</title><style>html,body{margin:0;height:100%;color-scheme:light dark;background:light-dark(#fff,#171717);font:12px system-ui}#viewer{height:100%;display:flex}#connection{position:fixed;bottom:4px;right:8px;z-index:2;background:light-dark(#fff,#171717);color:#888}</style><div id="viewer"></div><div id="connection">연결 중</div><script src="/viewer.js"></script></html>';
type Entry = {key:string;path:string;feed:NativeCodeFeed;clients:Set<http.ServerResponse>;touched:number};
/** Read-only loopback viewer. Every thread has its own non-enumerable capability. */
export async function startViewerService(options: {javascript:string|(()=>Promise<string>); open:(owner:{threadId:string;url:string;turnId:string|null})=>Promise<boolean>; maxThreads?:number}) {
  const entries = new Map<string,Entry>(), paths = new Map<string,Entry>();
  const hookPath='/hook/'+randomBytes(32).toString('hex');
  const hooks:{threadId:string;turnId:string;callId:string;phase:string}[]=[];
  const connections = new Set<import('node:net').Socket>();
  const count = Math.max(1,Math.min(options.maxThreads??32,64));
  let port = 0;
  const server = http.createServer(async (req,res) => {
    const host = req.headers.host;
    if (host !== '127.0.0.1:'+port || (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:'+port)) {res.writeHead(403);res.end();return;}
    const url = new URL(req.url??'/', 'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    if(url.pathname===hookPath && req.method==='POST'){
      try{
        let body='';for await(const chunk of req){body+=chunk.toString('utf8');if(body.length>8192){res.writeHead(413);res.end();return;}}
        const value=JSON.parse(body);
        const entry=typeof value.threadId==='string'?entries.get(value.threadId):undefined;
        if(!entry || entry.feed.snapshot.turnId!==value.turnId || !id(value.callId) || !entry.feed.snapshot.calls.some(call=>call.id===value.callId && call.turnId===value.turnId) || !['before','after'].includes(value.phase)){res.writeHead(409);res.end();return;}
        hooks.push({threadId:value.threadId,turnId:value.turnId,callId:value.callId,phase:value.phase});if(hooks.length>128)hooks.shift();
        res.writeHead(204);res.end();return;
      }catch{res.writeHead(400);res.end();return;}
    }
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/viewer.js'){
      try{const javascript=typeof options.javascript==='function'?await options.javascript():options.javascript;res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(javascript);}
      catch{res.writeHead(503);res.end('Viewer asset unavailable');}return;
    }
    const keyPath = url.pathname.replace(/\/events$/,'');
    const entry = paths.get(keyPath);
    if(!entry){res.writeHead(404);res.end();return;}
    entry.touched=Date.now();
    if(url.pathname.endsWith('/events')){
      if(!same(url.searchParams.get('key')??'',entry.key)){res.writeHead(403);res.end();return;}
      if(entry.clients.size>=4){res.writeHead(429);res.end();return;}
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive'});
      entry.clients.add(res);res.on('close',()=>entry.clients.delete(res));
      res.write('data: '+JSON.stringify(entry.feed.snapshot)+'\n\n');return;
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'");
    res.end(html);
  });
  server.on('connection',socket=>{connections.add(socket);socket.on('close',()=>connections.delete(socket));});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  port=(server.address() as import('node:net').AddressInfo).port;
  function get(threadId:string):Entry {
    let entry=entries.get(threadId);if(entry)return entry;
    if(entries.size>=count){
      const candidate=[...entries.entries()].filter(([,v])=>v.clients.size===0 && !v.feed.snapshot.calls.some(c=>c.status==='running'||c.status==='writing')).sort((a,b)=>a[1].touched-b[1].touched)[0];
      if(!candidate)throw Error('Viewer thread capacity reached');
      entries.delete(candidate[0]);paths.delete(candidate[1].path);
    }
    const key=randomBytes(32).toString('base64url'),viewPath='/v/'+randomBytes(16).toString('hex');
    const feed=new NativeCodeFeed({hostId:'local',threadId}, snapshot=>(entries.get(threadId)?.clients.size??0)>0 ? true : options.open({threadId,url:'http://127.0.0.1:'+port+viewPath+'#'+key,turnId:snapshot.turnId}));
    entry={key,path:viewPath,feed,clients:new Set(),touched:Date.now()};
    entries.set(threadId,entry);paths.set(viewPath,entry);
    const current=entry;
    feed.subscribe(snapshot=>{const bytes='data: '+JSON.stringify(snapshot)+'\n\n';for(const client of current.clients){if(client.writableLength>1_000_000){client.destroy();continue;}client.write(bytes);}});
    return entry;
  }
  const heartbeat=setInterval(()=>{for(const entry of entries.values())for(const client of entry.clients){if(client.writableLength>1_000_000)client.destroy();else client.write(': keepalive\n\n');}},15000);heartbeat.unref();
  return {
    port,
    hookEndpoint:'http://127.0.0.1:'+port+hookPath,
    get hookReceipts(){return hooks.map(value=>({...value}));},
    accept(notification:unknown):boolean {
      if(!notification||typeof notification!=='object')return false;
      const event=notification as {id?:unknown;method?:unknown;params?:{threadId?:unknown}};
      if(event.id!=null || typeof event.method!=='string' || !/^(turn\/(started|completed|plan\/updated)|item\/(started|completed|fileChange\/(patchUpdated|outputDelta)|commandExecution\/outputDelta|mcpToolCall\/progress))$/.test(event.method) || !id(event.params?.threadId))return false;
      try {const entry=get(event.params.threadId);entry.touched=Date.now();return entry.feed.accept('local',event);}catch{return false;}
    },
    connections(threadId:string):number{return entries.get(threadId)?.clients.size??0;},
    snapshot(threadId:string):NativeSnapshot|undefined{return entries.get(threadId)?.feed.snapshot;},
    async close(){clearInterval(heartbeat);for(const socket of connections)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));entries.clear();paths.clear();}
  };
}
