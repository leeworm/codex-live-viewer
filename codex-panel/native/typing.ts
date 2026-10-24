import type {DisplayLine} from './presentation.js';
/** A bounded display frontier over received text. Never changes the execution feed. */
export class TypingReveal {
  private source='';
  private ends:number[]=[];
  private position=0;
  private last=0;
  private deadline=0;
  private readonly segments=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  get value():string {return this.source.slice(0,this.ends[Math.floor(this.position)-1]??0);}
  get pending():boolean {return this.position<this.ends.length;}
  target(source:string,now:number,options:{instant?:boolean;terminal?:boolean}={}):void {
    const revised=!source.startsWith(this.source),changed=source!==this.source,wasPending=this.pending;
    if(changed){
      this.source=source;
      this.ends=Array.from(this.segments.segment(source),part=>part.index+part.segment.length);
      if(!wasPending){this.last=now;this.deadline=now+(options.terminal?900:1200);}
    }
    if(options.instant||revised){this.position=this.ends.length;this.last=now;return;}
    if(options.terminal&&wasPending)this.deadline=Math.min(this.deadline,now+300);
  }
  advance(now:number):void {
    if(!this.pending){this.last=now;return;}
    if(now>=this.deadline){this.position=this.ends.length;this.last=now;return;}
    const elapsed=Math.max(0,now-this.last),left=this.ends.length-this.position;
    const rate=Math.max(140,left/Math.max(1,this.deadline-this.last)*1000);
    this.position=Math.min(this.ends.length,this.position+elapsed*rate/1000);this.last=now;
  }
}
export function revealLines(lines:DisplayLine[],length:number):DisplayLine[] {
  const result:DisplayLine[]=[];
  for(const line of lines){
    if(length<=0)break;
    result.push({...line,text:line.text.slice(0,length)});
    if(length<=line.text.length)break;
    length-=line.text.length+1;
  }
  return result;
}
