import {describe,it,expect} from 'vitest';
import {presentCall} from './presentation.js';
import type {NativeCall} from './feed.js';
const call=(patch:Partial<NativeCall>):NativeCall=>({id:'one',turnId:'turn',tool:'patch',title:'src/a.ts',input:'',output:'',progress:'',status:'writing',inputSource:'model-patch-stream',time:1,...patch});
describe('reference tool presentation',()=>{
 it('unwraps structured Write/Edit input into actual code without inventing source line numbers',()=>{
  const input=JSON.stringify({path:'src/a.ts',content:'const a = 1;\nconst b = 2;'});
  const write=call({tool:'codex_write',input});
  expect(presentCall(write,true).lines.map(line=>line.text)).toEqual(['const a = 1;','const b = 2;']);
  expect(write.input).toBe(input);
  const edit=call({tool:'codex_edit',input:JSON.stringify({path:'src/a.ts',edits:[{oldText:'const a = 1;',newText:'const a = 3;\nconst b = 4;'}]})});
  const shown=presentCall(edit,true);
  expect(shown).toMatchObject({kind:'edit',added:2,removed:1});
  expect(shown.lines.filter(line=>line.tone==='add').map(line=>line.text)).toEqual(['const a = 3;','const b = 4;']);
  expect(shown.lines.every(line=>line.number==='')).toBe(true);
  const literal=call({changeKind:'add',input:'{"content":"literal file content"}'});
  expect(presentCall(literal,true).lines[0]!.text).toBe(literal.input);
 });
 it('shows tail12 while writing, first3 when complete, full bounded source when expanded',()=>{
  const item=call({changeKind:'add',input:Array.from({length:54},(_,i)=>'const n'+(i+1)+' = '+i+';').join('\n')});
  const before=JSON.stringify(item),live=presentCall(item),done=presentCall({...item,status:'completed'}),all=presentCall(item,true);
  expect(live.kind).toBe('write');expect(live.lines).toHaveLength(12);expect(live.lines[0]!.number).toBe('43');
  expect(done.lines).toHaveLength(3);expect(done.more).toBe(51);expect(all.lines).toHaveLength(54);expect(JSON.stringify(item)).toBe(before);
 });
 it('retains real diff line numbers, additions and deletions',()=>{
  const shown=presentCall(call({input:'--- a/a.ts\n+++ b/a.ts\n@@ -36,3 +36,4 @@\n const a = 1;\n-old\n+next\n+extra\n end'}));
  expect(shown.added).toBe(2);expect(shown.removed).toBe(1);
  expect(shown.lines.find(line=>line.tone==='remove')).toMatchObject({number:'37',text:'old'});
  expect(shown.lines.find(line=>line.text==='extra')!.number).toBe('38');
 });
 it('uses the actual shell command heading and last3 output without mutating arguments',()=>{
  const item=call({tool:'command',status:'completed',input:'"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "npm test -- --run"',output:'first\nsecond\npass a\npass b\n2 passing'});
  const shown=presentCall(item);expect(shown.title).toBe('npm test -- --run');expect(shown.output).toBe('pass a\npass b\n2 passing');
  expect(item.input).toContain('pwsh.exe');expect(presentCall(item,true).output).toContain('first');
 });
 it('uses a compact Read row without exposing returned file contents until expanded',()=>{
  const item=call({tool:'codex_read',title:'src/a.ts',input:'{"path":"src/a.ts"}',output:'private source',status:'completed'});
  expect(presentCall(item)).toMatchObject({kind:'line',label:'Read',title:'src/a.ts',output:'',lines:[]});
  expect(presentCall(item,true).output).toBe('private source');
 });
});
