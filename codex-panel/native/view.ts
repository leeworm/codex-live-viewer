import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { css as cssLanguage } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { StreamLanguage } from '@codemirror/language';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import type { Parser } from '@lezer/common';
import type { NativeCodeFeed, NativeCall, CallStatus } from './feed.js';
import { presentCall, type DisplayLine } from './presentation.js';
import { TypingReveal, revealLines } from './typing.js';
import { nativeViewCss } from './view-styles.js';

const labels: Record<CallStatus,string>={writing:'작성 중',running:'실행 중',completed:'완료',failed:'실패',interrupted:'중단'};
const parsers={js:javascript({typescript:true,jsx:true}).language.parser,py:python().language.parser,json:json().language.parser,css:cssLanguage().language.parser,html:html().language.parser,powershell:StreamLanguage.define(powerShell).parser,shell:StreamLanguage.define(shell).parser};
function parserFor(call:NativeCall):Parser|null {
  const name=call.title.toLowerCase();
  if(call.tool==='command'||/(exec|shell|bash)/i.test(call.tool))return /powershell|pwsh/i.test(call.input)?parsers.powershell:parsers.shell;
  if(/\.(tsx?|jsx?|mjs|cjs)$/.test(name))return parsers.js;
  if(/\.py$/.test(name))return parsers.py;
  if(/\.json$/.test(name))return parsers.json;
  if(/\.css$/.test(name))return parsers.css;
  if(/\.html?$/.test(name))return parsers.html;
  if(/\.ps1$/.test(name))return parsers.powershell;
  if(/\.(sh|bash)$/.test(name))return parsers.shell;
  return null;
}
function node<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text?:string):HTMLElementTagNameMap[K] {
  const value=document.createElement(tag);value.className=className;if(text!==undefined)value.textContent=text;return value;
}
function colorCode(element:HTMLElement,source:string,parser:Parser|null):void {
  if(!parser||!source){element.textContent=source;return;}
  try {
    let from=0;const fragment=document.createDocumentFragment();
    highlightTree(parser.parse(source),classHighlighter,(start,end,classes)=>{
      if(start>from)fragment.append(document.createTextNode(source.slice(from,start)));
      const token=node('span',classes,source.slice(start,end));fragment.append(token);from=end;
    });
    if(from<source.length)fragment.append(document.createTextNode(source.slice(from)));element.replaceChildren(fragment);
  }catch{element.textContent=source;}
}
function lineNode(line:DisplayLine,parser:Parser|null):HTMLElement {
  const row=node('div','code-line');row.dataset.tone=line.tone;
  const number=node('span','line-number',line.number),sign=node('span','line-sign',line.sign),code=node('code','code-text');
  colorCode(code,line.text,line.tone==='hunk'?null:parser);row.append(number,sign,code);return row;
}
type Card={element:HTMLElement;heading:HTMLElement;title:HTMLElement;label:HTMLElement;count:HTMLElement;phase:HTMLElement;code:HTMLElement;output:HTMLElement;progress:HTMLElement;earlier:HTMLElement;more:HTMLElement;expand:HTMLButtonElement;call:NativeCall|null;expanded:boolean;typing:TypingReveal;rows:DisplayLine[];paint:string;holdUntil:number};
/** Chronological received-tool renderer. Animation affects display only. */
export function mountNativeView(element:HTMLElement,feed:Pick<NativeCodeFeed,'snapshot'|'subscribe'>):()=>void {
  const shadow=element.shadowRoot??element.attachShadow({mode:'open'});shadow.replaceChildren();
  const style=node('style');style.textContent=nativeViewCss;
  const viewer=node('section','viewer');viewer.setAttribute('aria-label','Live Viewer');
  const bar=node('header','bar'),dot=node('span','connection-dot'),heading=node('span','heading','Live Viewer'),phase=node('span','phase');
  bar.append(dot,heading,phase);
  const jump=node('button','return-latest');jump.type='button';jump.setAttribute('aria-label','맨 아래로');jump.dataset.visible='false';jump.setAttribute('aria-hidden','true');jump.tabIndex=-1;
  const dots=node('span','jump-dots');dots.setAttribute('aria-hidden','true');
  for(let i=0;i<3;i++)dots.append(node('span','jump-dot'));
  const svgNamespace='http://www.w3.org/2000/svg',arrow=document.createElementNS(svgNamespace,'svg'),arrowPath=document.createElementNS(svgNamespace,'path');
  arrow.classList.add('jump-arrow');arrow.setAttribute('viewBox','0 0 20 20');arrow.setAttribute('width','20');arrow.setAttribute('height','20');arrow.setAttribute('aria-hidden','true');arrow.setAttribute('focusable','false');
  arrowPath.setAttribute('d','M10 3.333V16.491M4.167 10.833 10 16.491 15.833 10.833');arrowPath.setAttribute('fill','none');arrowPath.setAttribute('stroke','currentColor');arrowPath.setAttribute('stroke-width','1.333');arrowPath.setAttribute('stroke-linecap','round');arrowPath.setAttribute('stroke-linejoin','round');arrow.append(arrowPath);
  jump.append(dots,arrow);
  const timeline=node('main','timeline');timeline.setAttribute('aria-label','작업 흐름');timeline.setAttribute('role','log');timeline.setAttribute('aria-live','off');
  const empty=node('p','empty','코드 작업을 기다리는 중'),history=node('div','history');
  const planWrap=node('section','plan-wrap'),planTitle=node('div','plan-title','TODO'),planCount=node('span','plan-count'),plan=node('ol','plan');
  plan.setAttribute('aria-label','작업 진행');planTitle.append(planCount);planWrap.append(planTitle,plan);planWrap.hidden=true;
  const footer=node('footer','footer'),source=node('div','source');footer.append(source);
  timeline.append(empty,history,planWrap);viewer.append(bar,timeline,footer,jump);shadow.append(style,viewer);
  let snapshot=feed.snapshot,following=true,disposed=false,scheduled=false,lastTurn:string|null=null,hydrating=true,frame:ReturnType<typeof setTimeout>|undefined;
  const cards=new Map<string,Card>(),expanded=new Set<string>();let cardSequence=0;
  const key=(call:NativeCall)=>call.turnId+':'+call.id;
  function updateFollow(){const visible=!following&&snapshot.calls.length>0&&timeline.scrollHeight-timeline.scrollTop-timeline.clientHeight>=28;jump.dataset.visible=String(visible);jump.setAttribute('aria-hidden',String(!visible));jump.tabIndex=visible?0:-1;}
  function makeCard(id:string):Card {
    const article=node('article','call');article.dataset.callKey=id;
    const head=node('header','call-head'),mark=node('span','state-mark'),label=node('strong','call-label'),title=node('span','call-title'),count=node('span','call-count');
    head.append(mark,label,title,count);
    const tools=node('div','call-tools'),callPhase=node('span','call-phase');
    const toggle=node('button','small-button','펼치기'),copy=node('button','small-button','복사');toggle.type=copy.type='button';toggle.setAttribute('aria-expanded','false');
    tools.append(callPhase,toggle,copy);
    const earlier=node('button','overflow earlier'),code=node('div','cm-content source-code'),more=node('button','overflow more'),progress=node('div','progress'),output=node('pre','output');
    earlier.type=more.type='button';code.id='live-code-source-'+(++cardSequence);for(const control of [earlier,more,toggle])control.setAttribute('aria-controls',code.id);
    output.setAttribute('aria-label','실행 출력');article.append(head,tools,earlier,code,more,progress,output);
    const card:Card={element:article,heading:head,title,label,count,phase:callPhase,code,output,progress,earlier,more,expand:toggle,call:null,expanded:false,typing:new TypingReveal(),rows:[],paint:'',holdUntil:0};
    const toggleExpanded=()=>{const opening=!expanded.has(id);if(opening){expanded.add(id);following=false;}else expanded.delete(id);card.call=null;render();};
    toggle.addEventListener('click',toggleExpanded);earlier.addEventListener('click',toggleExpanded);more.addEventListener('click',toggleExpanded);
    const toggleLine=()=>{if(article.dataset.kind==='line')toggleExpanded();};
    head.addEventListener('click',toggleLine);head.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleLine();}});
    copy.addEventListener('click',()=>{if(card.call)void navigator.clipboard.writeText(card.call.input).catch(()=>{});});
    return card;
  }
  function unchanged(card:Card,call:NativeCall,full:boolean):boolean {
    const old=card.call;return !!old&&card.expanded===full&&old.input===call.input&&old.output===call.output&&old.progress===call.progress&&old.title===call.title&&old.tool===call.tool&&old.status===call.status&&old.durationMs===call.durationMs&&old.exitCode===call.exitCode&&old.changeKind===call.changeKind;
  }
  function updateCard(card:Card,call:NativeCall,full:boolean) {
    const now=performance.now(),same=unchanged(card,call,full),shown=presentCall(call,full),parser=parserFor(call);
    const code=shown.kind==='write'||shown.kind==='edit',terminal=call.status!=='writing'&&call.status!=='running';
    const instant=document.hidden||full||!code||(hydrating&&terminal)||call.status==='failed'||call.status==='interrupted';
    if(!same){
      card.rows=presentCall(call,true).lines;
      card.typing.target(card.rows.map(row=>row.text).join('\n'),now,{instant,terminal});
    }else if(instant)card.typing.target(card.rows.map(row=>row.text).join('\n'),now,{instant:true});
    card.typing.advance(now);
    if(card.typing.pending)card.holdUntil=now+500;
    if(instant)card.holdUntil=0;
    const revealing=code&&(card.typing.pending||card.holdUntil>now);
    if(revealing){
      const rows=revealLines(card.rows,card.typing.value.length),limit=shown.kind==='write'?12:24;
      shown.lines=rows.slice(-limit);shown.earlier=Math.max(0,rows.length-limit);shown.more=0;
    }
    const caret=code&&!instant&&(card.typing.pending||call.status==='writing');
    const paint=JSON.stringify([shown.lines,caret]);
    if(same&&paint===card.paint&&card.element.dataset.revealing===String(revealing))return;
    card.paint=paint;card.call={...call};card.expanded=full;card.element.dataset.kind=shown.kind;card.element.dataset.status=call.status;
    card.element.dataset.revealing=String(revealing);
    card.element.dataset.expanded=String(full);card.heading.tabIndex=shown.kind==='line'?0:-1;card.heading.setAttribute('role',shown.kind==='line'?'button':'group');card.heading.setAttribute('aria-expanded',String(full));
    card.label.textContent=shown.label+(shown.kind==='shell'||shown.kind==='line'?'':':');card.title.textContent=shown.title;card.title.title=shown.title;
    card.count.textContent=shown.kind==='edit'?'[+'+shown.added+' -'+shown.removed+']':shown.kind==='write'?(call.changeKind==='add'?'새 파일 · ':'')+shown.total+'줄':'';
    card.phase.textContent=labels[call.status]+(card.typing.pending?' · 표시 중':'')+(call.durationMs!==undefined?' · '+(call.durationMs/1000).toFixed(1)+'s':'')+(call.exitCode!==undefined?' · exit '+call.exitCode:'');
    card.expand.hidden=!shown.expandable&&!full;card.expand.textContent=full?'접기':'펼치기';card.expand.setAttribute('aria-expanded',String(full));
    card.earlier.hidden=shown.earlier===0;card.earlier.textContent='… 앞 '+shown.earlier+'줄';
    card.more.hidden=shown.more===0;card.more.textContent='… '+shown.more+'줄 더 보기';
    card.earlier.setAttribute('aria-expanded',String(full));card.more.setAttribute('aria-expanded',String(full));
    card.code.hidden=shown.kind==='line'&&!full;
    card.code.replaceChildren(...shown.lines.map(line=>lineNode(line,parser)));
    if(caret){const last=card.code.querySelector('.code-line:last-child .code-text');last?.append(node('span','typing-caret'));}
    card.progress.hidden=!call.progress;card.progress.textContent=call.progress;
    card.output.hidden=!shown.output;card.output.textContent=shown.output;
  }
  function render() {
    scheduled=false;if(disposed)return;
    if(snapshot.turnId!==lastTurn){lastTurn=snapshot.turnId;following=true;}
    const alive=new Set(snapshot.calls.map(key));for(const [id,card] of cards)if(!alive.has(id)){card.element.remove();cards.delete(id);expanded.delete(id);}
    snapshot.calls.forEach((call,index)=>{
      const id=key(call);let card=cards.get(id);if(!card){card=makeCard(id);cards.set(id,card);}
      updateCard(card,call,expanded.has(id));if(history.children[index]!==card.element)history.insertBefore(card.element,history.children[index]??null);
    });
    const latest=snapshot.calls.at(-1),active=snapshot.calls.filter(call=>call.turnId===snapshot.turnId&&(call.status==='running'||call.status==='writing'));
    phase.textContent=active.length?labels[active.at(-1)!.status]+(active.length>1?' · '+active.length:''):latest?labels[latest.status]:'대기';
    empty.hidden=snapshot.calls.length>0;
    source.textContent=latest?(latest.inputSource==='model-patch-stream'?'실시간 패치':'실행 입력')+' · '+snapshot.calls.length+'개 작업':'';
    planWrap.hidden=snapshot.plan.length===0;planCount.textContent=' · '+snapshot.plan.filter(step=>step.status==='completed').length+'/'+snapshot.plan.length;
    plan.replaceChildren(...snapshot.plan.map(step=>{const li=node('li');li.dataset.status=step.status;li.append(node('span','todo-mark'),document.createTextNode(step.step));return li;}));
    element.dataset.owner=snapshot.hostId+':'+snapshot.threadId;element.dataset.callCount=String(snapshot.calls.length);element.dataset.revision=String(snapshot.revision);
    element.dataset.renderer='codex-return-1';
    updateFollow();if(following)timeline.scrollTop=timeline.scrollHeight;
    if(snapshot.threadId)hydrating=false;
    if(frame!==undefined){clearTimeout(frame);frame=undefined;}
    if(!document.hidden&&[...cards.values()].some(card=>card.typing.pending||card.holdUntil>performance.now()))frame=setTimeout(render,33);
  }
  const dispose=feed.subscribe(value=>{snapshot=value;if(!scheduled){scheduled=true;queueMicrotask(render);}});
  jump.addEventListener('click',()=>{following=true;timeline.scrollTop=timeline.scrollHeight;updateFollow();});
  timeline.addEventListener('wheel',event=>{if(event.deltaY<0){following=false;updateFollow();}},{passive:true});
  timeline.addEventListener('scroll',()=>{following=timeline.scrollHeight-timeline.scrollTop-timeline.clientHeight<28;updateFollow();},{passive:true});
  const refreshMotion=()=>{for(const card of cards.values())card.call=null;render();};
  document.addEventListener('visibilitychange',refreshMotion);
  render();
  return()=>{disposed=true;dispose();if(frame!==undefined)clearTimeout(frame);document.removeEventListener('visibilitychange',refreshMotion);cards.clear();shadow.replaceChildren();};
}
