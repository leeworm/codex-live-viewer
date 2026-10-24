import type {NativeCall} from './feed.js';
export type DisplayLine={text:string;number:string;tone:'normal'|'add'|'remove'|'hunk';sign:string};
export type PresentedCall={kind:'write'|'edit'|'shell'|'line';label:string;title:string;lines:DisplayLine[];output:string;earlier:number;more:number;total:number;added:number;removed:number;expandable:boolean};
const clean=(value:string)=>value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r\n?/g,'\n');
const linesOf=(value:string)=>{const lines=clean(value).split('\n');if(lines.length>1&&lines.at(-1)==='')lines.pop();return value===''?[]:lines;};
const pending=(call:NativeCall)=>call.status==='writing'||call.status==='running';
export function commandBody(input:string):string {
  let value=clean(input).trim();
  if(/(?:pwsh|powershell)(?:\.exe)?["']?\s/i.test(value)){
    const match=value.match(/\s-(?:Command|c)\s+([\s\S]+)$/i);
    if(match){value=match[1]!.trim();if((value[0]==='"'&&value.at(-1)==='"')||(value[0]==="'"&&value.at(-1)==="'"))value=value.slice(1,-1);}
  }
  return value;
}
function diffLines(input:string):DisplayLine[] {
  let old=0,next=0;
  const rows:DisplayLine[]=[];
  for(const raw of linesOf(input)){
    if(/^(?:diff --git |index |--- |\+\+\+ |\\ No newline)/.test(raw))continue;
    const hunk=raw.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if(raw.startsWith('@@ ')&&!hunk){old=next=0;rows.push({text:raw,number:'',tone:'hunk',sign:''});continue;}
    if(hunk){old=Number(hunk[1]);next=Number(hunk[2]);rows.push({text:raw,number:'',tone:'hunk',sign:''});continue;}
    if(raw.startsWith('+'))rows.push({text:raw.slice(1),number:next?String(next++):'',tone:'add',sign:'+'});
    else if(raw.startsWith('-'))rows.push({text:raw.slice(1),number:old?String(old++):'',tone:'remove',sign:'-'});
    else{rows.push({text:raw.startsWith(' ')?raw.slice(1):raw,number:next?String(next++):'',tone:'normal',sign:''});if(old)old++;}
  }
  return rows;
}
/** Display windows follow the reference mod; never rewrites or fabricates feed events. */
export function presentCall(call:NativeCall,expanded=false):PresentedCall {
  const tool=call.tool.toLowerCase();
  let kind:PresentedCall['kind'],label:string;
  if(call.changeKind==='add'||/(?:^|[_.])write(?:$|[_.])/.test(tool)){kind='write';label='Write';}
  else if(tool==='patch'||/apply_patch|(?:^|[_.])edit(?:$|[_.])/.test(tool)){kind='edit';label='Edit';}
  else if(tool==='command'||/(?:^|[_.])(exec|exec_command|bash|shell)(?:$|[_.])/.test(tool)){kind='shell';label='$';}
  else{kind='line';label=/grep/.test(tool)?'Grep':/glob/.test(tool)?'Glob':/read/.test(tool)?'Read':call.tool;}
  let title=call.title,body=clean(call.input),rows:DisplayLine[]=[],earlier=0,more=0,added=0,removed=0;
  let output=clean(call.output),expandable=false,total=0;
  if((kind==='write'&&/(?:^|[_.])write(?:$|[_.])/.test(tool))||(kind==='edit'&&/(?:^|[_.])edit(?:$|[_.])/.test(tool))){
    try{
      const args=JSON.parse(call.input);
      if(args&&typeof args==='object'&&!Array.isArray(args)){
        if(kind==='write'&&typeof args.content==='string')body=clean(args.content);
        if(kind==='edit'&&Array.isArray(args.edits)&&args.edits.length&&args.edits.every((edit:unknown)=>edit&&typeof edit==='object'&&typeof (edit as Record<string,unknown>).oldText==='string'&&typeof (edit as Record<string,unknown>).newText==='string')){
          body=args.edits.map((edit:{oldText:string;newText:string},index:number)=>'@@ replacement '+(index+1)+' @@\n'+linesOf(edit.oldText).map(line=>'-'+line).join('\n')+'\n'+linesOf(edit.newText).map(line=>'+'+line).join('\n')).join('\n');
        }
      }
    }catch{/* Partial/unstructured input remains available as received. */}
  }
  if(kind==='shell'){
    body=commandBody(body);title=linesOf(body).find(line=>line.trim())?.trim()??'명령';
    const input=linesOf(body),result=linesOf(output),limit=expanded?result.length:pending(call)?12:3;
    output=result.slice(Math.max(0,result.length-limit)).join('\n');
    const shown=expanded?input:input.length>1&&pending(call)?input.slice(0,3):[];
    rows=shown.map((text,index)=>({text,number:'',tone:'normal',sign:index===0?'$':''}));
    total=input.length;more=shown.length?input.length-shown.length:0;expandable=input.length>1||result.length>limit;
  }else if(kind==='edit'){
    rows=diffLines(body);total=rows.length;added=rows.filter(row=>row.tone==='add').length;removed=rows.filter(row=>row.tone==='remove').length;
    if(!expanded&&rows.length>24){if(pending(call)){earlier=rows.length-24;rows=rows.slice(-24);}else{more=rows.length-24;rows=rows.slice(0,24);}}
    expandable=total>24||output.length>0;
  }else if(kind==='write'){
    let input=linesOf(body);
    if(/^(?:diff --git |--- |\+\+\+ |@@ )/m.test(body))input=diffLines(body).filter(row=>row.tone==='add'||row.tone==='normal').map(row=>row.text);
    else if(input.length&&input.every(line=>line.startsWith('+')||line===''))input=input.map(line=>line.startsWith('+')?line.slice(1):line);
    total=input.length;const start=expanded||!pending(call)?0:Math.max(0,total-12),end=expanded||pending(call)?total:Math.min(3,total);
    earlier=start;more=total-end;rows=input.slice(start,end).map((text,index)=>({text,number:String(start+index+1),tone:'normal',sign:''}));expandable=earlier>0||more>0;
  }else{
    total=linesOf(body).length;expandable=!!body||!!output;
    rows=expanded?linesOf(body).map((text,index)=>({text,number:String(index+1),tone:'normal',sign:''})):[];
    if(!expanded)output='';
    if(title===call.tool||!title)title=body.replace(/\s+/g,' ').slice(0,160);
  }
  return {kind,label,title,lines:rows,output,earlier,more,total,added,removed,expandable};
}
