/** Actual HTTP/SSE mixed-tool renderer proof; fixed events matching the repository demo. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const output=process.argv[2];
if(!output||!path.isAbsolute(output))throw Error('Fresh absolute output required');
if(!process.versions.electron){
 fs.mkdirSync(output);
 const {buildSync}=require('esbuild');
 buildSync({entryPoints:[path.join(__dirname,'service.ts')],outfile:path.join(output,'service.cjs'),bundle:true,format:'cjs',platform:'node',target:'node22'});
 buildSync({entryPoints:[path.join(__dirname,'browser.ts')],outfile:path.join(output,'viewer.js'),bundle:true,format:'iife',platform:'browser',target:'chrome130'});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(require('electron'),[__filename,output],{env,windowsHide:true,stdio:'inherit'});
 child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}else{
 const {app,BrowserWindow,nativeTheme}=require('electron');
 app.setPath('userData',path.join(output,'profile'));app.commandLine.appendSwitch('disable-renderer-backgrounding');
 const {startViewerService}=require(path.join(output,'service.cjs'));
 let win,service,opens=0,theme={mode:'system',dark:{surface:'#111111',ink:'#fcfcfc',accent:'#0169cc',added:'#00a240',removed:'#e02e2a',contrast:50},light:{surface:'#f3eadd',ink:'#27231c',accent:'#8430ac'}};const errors=[],captureUnavailable=[];
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,message)=>{if(!value)throw Error(message);};
 async function capture(name){try{fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG());}catch(error){captureUnavailable.push(String(error));}}
 const read=()=>win.webContents.executeJavaScript("(()=>{const host=document.querySelector('#viewer'),r=host?.shadowRoot,write=r?.querySelector('.call[data-kind=write]'),shell=r?.querySelector('.call[data-kind=shell]'),text=r?.querySelector('.code-text'),timeline=r?.querySelector('.timeline');return {owner:host?.dataset.owner,cards:r?.querySelectorAll('.call').length,hasSidebar:!!r?.querySelector('nav'),kinds:[...r?.querySelectorAll('.call')??[]].map(c=>c.dataset.kind),writing:write?.dataset.status,writeRows:write?.querySelectorAll('.code-line').length,writeFirst:write?.querySelector('.line-number')?.textContent,writeText:write?.querySelector('.cm-content')?.textContent,added:r?.querySelectorAll('[data-tone=add]').length,removed:r?.querySelectorAll('[data-tone=remove]').length,syntax:r?.querySelectorAll('.tok-keyword').length,shellTitle:shell?.querySelector('.call-title')?.textContent,shellOutput:shell?.querySelector('.output')?.textContent,plan:r?.querySelectorAll('.plan li').length,font:text?getComputedStyle(text).fontFamily:null,fontSize:text?getComputedStyle(text).fontSize:null,overflow:timeline?timeline.scrollWidth>timeline.clientWidth+1:null,following:r?.querySelector('.follow')?.getAttribute('aria-pressed')}})()");
 const emit=(method,params)=>service.accept({method,params:{threadId:'reference-thread',turnId:'reference-turn',...params}});
 const deadline=setTimeout(()=>{console.error('Reference UI timeout');app.exit(1);},30000);
 app.whenReady().then(async()=>{
  nativeTheme.themeSource='dark';
  win=new BrowserWindow({show:false,width:760,height:1050,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true}});
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  service=await startViewerService({theme:async()=>theme,javascript:fs.readFileSync(path.join(output,'viewer.js'),'utf8'),open:async owner=>{opens++;await win.loadURL(owner.url);return true;}});
  emit('item/completed',{item:{id:'read',type:'mcpToolCall',tool:'codex_read',arguments:{path:'src/autofill.ts'},status:'completed',result:{content:[{type:'text',text:'source loaded'}]}}});
  emit('item/fileChange/patchUpdated',{itemId:'edit',changes:[{path:'src/autofill.ts',kind:{type:'update'},diff:'@@ -36,3 +36,4 @@\n export function autofill() {\n-  const enabled = false;\n+  const enabled = true;\n+  const retries = 3;\n }'}]});
  emit('item/completed',{item:{id:'edit',type:'fileChange',changes:[{path:'src/autofill.ts',kind:{type:'update'},diff:'@@ -36,3 +36,4 @@\n export function autofill() {\n-  const enabled = false;\n+  const enabled = true;\n+  const retries = 3;\n }'}],status:'completed'}});
  emit('item/completed',{item:{id:'shell',type:'commandExecution',command:'"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command "npm test -- --run"',status:'completed',aggregatedOutput:'starting\ncollecting\nfills outer form (3ms)\nskips a hidden field (1ms)\n2 passing (41ms)',exitCode:0,durationMs:1200}});
  const source=Array.from({length:54},(_,i)=>i===48?"test('never logs a credential', () => {":i===49?"  const output = run();":i===50?"  assert.equal(output.visible, true);":i===51?"});":"export const line"+(i+1)+" = "+(i+1)+";").join('\n');
  emit('item/fileChange/patchUpdated',{itemId:'write',changes:[{path:'test/autofill.test.ts',kind:{type:'add'},diff:source}]});
  emit('turn/plan/updated',{plan:[{step:'입력 흐름 확인',status:'completed'},{step:'변경 사항 적용',status:'completed'},{step:'누락된 테스트 작성',status:'inProgress'},{step:'전체 테스트 실행',status:'pending'}]});
  let dark;
  for(let n=0;n<100;n++){dark=await read();if(dark.cards===4&&dark.plan===4&&dark.writeRows===12&&dark.writeFirst==='43')break;await delay(30);}
  assert(dark.cards===4&&!dark.hasSidebar,'Chronological cards missing');assert(dark.kinds.join(',')==='line,edit,shell,write','Tool-specific rendering lost');
  assert(dark.writeRows===12&&dark.writeFirst==='43','Streaming write does not show true tail12');
  assert(dark.added===2&&dark.removed===1,'Edit addition/deletion rows missing');assert(dark.syntax>0,'Syntax highlighting absent');
  assert(dark.shellTitle==='npm test -- --run'&&!dark.shellTitle.includes('pwsh'),'Shell launcher leaked into heading');
  assert(dark.shellOutput.split('\n').length===3,'Completed shell output not collapsed to last3');assert(dark.font.includes('Cascadia Code')&&parseFloat(dark.fontSize)>=14,'Readable font not applied');
  assert(!dark.overflow,'Panel horizontally overflows');
  const shellLayout=await win.webContents.executeJavaScript("(()=>{const c=document.querySelector('#viewer').shadowRoot.querySelector('.call[data-kind=shell]');c.querySelector('.small-button').click();const t=c.querySelector('.code-text');return {card:c.clientWidth,code:t.clientWidth,height:t.clientHeight}})()");
  assert(shellLayout.code>shellLayout.card*.6&&shellLayout.height<80,'Shell code collapsed into a vertical strip: '+JSON.stringify(shellLayout));
  await win.webContents.executeJavaScript("document.querySelector('#viewer').shadowRoot.querySelector('.call[data-kind=shell] .small-button').click()");
  await capture('dark.png');
  nativeTheme.themeSource='light';await delay(50);await capture('light.png');
  win.setContentSize(390,850);await delay(70);const narrow=await read();assert(!narrow.overflow,'Narrow view overflows');await capture('narrow.png');
  win.setContentSize(760,1050);nativeTheme.themeSource='dark';await delay(70);await capture('dark-final.png');
  emit('turn/completed',{turn:{id:'reference-turn',status:'completed'}});let completed;for(let n=0;n<70;n++){completed=await read();if(completed.writeRows===3)break;await delay(30);}
  assert(completed.writeRows===3,'Completed write did not collapse to first3');
  const typingRead=()=>win.webContents.executeJavaScript("(()=>{const h=document.querySelector('#viewer'),r=h.shadowRoot,c=[...r.querySelectorAll('.call')].find(c=>c.querySelector('.call-title')?.textContent==='typing-demo.ts');return {visibility:document.visibilityState,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,revision:h.dataset.renderer,revealing:c?.dataset.revealing,code:[...c?.querySelectorAll('.code-text')??[]].map(n=>n.textContent).join('\\n'),rows:c?.querySelectorAll('.code-line').length,caret:!!c?.querySelector('.typing-caret'),caretVisible:c?.querySelector('.typing-caret')?getComputedStyle(c.querySelector('.typing-caret')).display!=='none':false,phase:c?.querySelector('.call-phase')?.textContent,enabled:r.querySelector('.typing-toggle')?.getAttribute('aria-pressed'),overflow:r.querySelector('.bar').scrollWidth>r.querySelector('.bar').clientWidth+1}})()");
  const typeEmit=(method,params)=>service.accept({method,params:{threadId:'reference-thread',turnId:'typing-turn',...params}});
  const initialMotion=await typingRead();
  const topButtons=await win.webContents.executeJavaScript("document.querySelector('#viewer').shadowRoot.querySelectorAll('.bar button').length");assert(topButtons===0,'Top-right controls must be empty');
  const typedSource=Array.from({length:45},(_,i)=>'export const value'+i+' = "한글 code '+i+'";').join('\n');
  typeEmit('item/fileChange/patchUpdated',{itemId:'typing',changes:[{path:'typing-demo.ts',kind:{type:'add'},diff:typedSource}]});
  let partial;for(let n=0;n<35;n++){partial=await typingRead();if(partial.caret&&partial.code.length>0&&partial.rows<12)break;await delay(15);}
  assert(partial.revision==='app-theme-1'&&partial.caret&&partial.caretVisible&&partial.rows<12&&partial.code.length>0,'No progressive code and caret observed: '+JSON.stringify(partial));
  await capture('typing-partial.png');
  typeEmit('item/completed',{item:{id:'typing',type:'fileChange',changes:[{path:'typing-demo.ts',kind:{type:'add'},diff:typedSource}],status:'completed'}});
  let caughtUp;for(let n=0;n<60;n++){caughtUp=await typingRead();if(caughtUp.revealing==='false')break;await delay(25);}
  assert(caughtUp.rows===3&&!caughtUp.caret&&caughtUp.phase.startsWith('완료'),'Completion did not catch up and collapse');
  const expanded=await win.webContents.executeJavaScript("(()=>{const c=[...document.querySelector('#viewer').shadowRoot.querySelectorAll('.call')].find(c=>c.querySelector('.call-title')?.textContent==='typing-demo.ts');c.querySelector('.more').click();return {rows:c.querySelectorAll('.code-line').length,expanded:c.dataset.expanded}})()");
  assert(expanded.rows===45&&expanded.expanded==='true','More-lines button did not expand the actual source');await capture('more-expanded.png');
  const returnButton=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('#viewer').shadowRoot,t=r.querySelector('.timeline');t.scrollTop=0;t.dispatchEvent(new Event('scroll'));const b=r.querySelector('.return-latest'),v=r.querySelector('.viewer').getBoundingClientRect(),p=b.getBoundingClientRect();return {visible:!b.hidden,label:b.getAttribute('aria-label'),dots:b.querySelector('.jump-dots').textContent,center:Math.abs(p.x+p.width/2-v.x-v.width/2),x:p.x+p.width/2,y:p.y+p.height/2}})()");
  assert(returnButton.visible&&returnButton.label==='맨 아래로'&&returnButton.dots==='…'&&returnButton.center<1,'Bottom-center return control missing');
  win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(returnButton.x),y:Math.round(returnButton.y)});
  await delay(40);
  const hovered=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('#viewer').shadowRoot,b=r.querySelector('.return-latest');return {tip:getComputedStyle(b.querySelector('.jump-label')).opacity,arrow:getComputedStyle(b.querySelector('.jump-arrow')).display}})()");
  assert(hovered.tip==='1'&&hovered.arrow!=='none','Hover did not show the bottom-return hint');
  const returned=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('#viewer').shadowRoot;r.querySelector('.return-latest').click();const t=r.querySelector('.timeline');return {remaining:t.scrollHeight-t.scrollTop-t.clientHeight,hidden:r.querySelector('.return-latest').hidden}})()");
  assert(returned.remaining<28&&returned.hidden,'Return control did not resume following');
  win.setContentSize(390,850);await delay(50);const typingNarrow=await typingRead();assert(!typingNarrow.overflow,'Typing controls overflow at narrow width');
  typeEmit('item/completed',{item:{id:'structured-write',type:'mcpToolCall',tool:'codex_write',arguments:{path:'structured.ts',content:'export const visible = true;\nexport const count = 2;'},status:'completed'}});
  typeEmit('item/completed',{item:{id:'structured-edit',type:'mcpToolCall',tool:'codex_edit',arguments:{path:'replacement.ts',edits:[{oldText:'const old = 1;',newText:'const next = 2;'}]},status:'completed'}});
  await delay(50);
  const readStructured=()=>win.webContents.executeJavaScript("(()=>{const r=document.querySelector('#viewer').shadowRoot,a=[...r.querySelectorAll('.call')],w=a.find(c=>c.querySelector('.call-title')?.textContent==='structured.ts'),e=a.find(c=>c.querySelector('.call-title')?.textContent==='replacement.ts');return {write:w?.querySelector('.code-text')?.textContent,edit:e?.querySelector('.call-count')?.textContent,numbers:[...e?.querySelectorAll('.line-number')??[]].map(n=>n.textContent)}})()");
  let structured;for(let n=0;n<70;n++){structured=await readStructured();if(structured.write?.startsWith('export const')&&structured.edit==='[+1 -1]')break;await delay(25);}
  assert(structured.write?.startsWith('export const')&&structured.edit==='[+1 -1]'&&structured.numbers.every(n=>n===''),'Structured tool input was displayed as JSON or invented line numbers');
  const readTheme=()=>win.webContents.executeJavaScript("(()=>{const h=document.querySelector('#viewer'),s=getComputedStyle(h);return {mode:h.dataset.appTheme,page:s.getPropertyValue('--page').trim(),ink:s.getPropertyValue('--ink').trim(),accent:s.getPropertyValue('--accent').trim(),added:s.getPropertyValue('--green').trim(),systemDark:matchMedia('(prefers-color-scheme: dark)').matches}})()");
  theme.mode='light';let hostLight;for(let n=0;n<100;n++){hostLight=await readTheme();if(hostLight.mode==='light'&&hostLight.page==='#f3eadd')break;await delay(25);}
  assert(hostLight.page==='#f3eadd'&&hostLight.ink==='#27231c'&&hostLight.accent==='#8430ac'&&hostLight.systemDark,'App light theme did not override dark OS mode');await capture('app-theme-light.png');
  theme.mode='dark';let hostDark;for(let n=0;n<100;n++){hostDark=await readTheme();if(hostDark.mode==='dark'&&hostDark.page==='#111111')break;await delay(25);}
  assert(hostDark.page==='#111111'&&hostDark.ink==='#fcfcfc'&&hostDark.added==='#00a240','App dark colors were not refreshed');await capture('app-theme-dark.png');
  const result={passed:true,appTheme:{hostLight,hostDark},shellLayout,structured,controls:{topButtons,expanded,returnButton,hovered,returned},typing:{initialMotion,partial,caughtUp,typingNarrow},scope:'actual HTTP/SSE and renderer; fixed local tool events; not a service-model execution',opens,dark,narrow,completed,errors,captureUnavailable};
  assert(opens===1&&errors.length===0,'Unexpected duplicate open or JS error');
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:true,output,captureUnavailable,errors}));await service.close();win.destroy();clearTimeout(deadline);app.exit(0);
 }).catch(async error=>{console.error(error.stack);await service?.close();if(win&&!win.isDestroyed())win.destroy();clearTimeout(deadline);app.exit(1);});
}
