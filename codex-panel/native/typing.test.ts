import {describe,it,expect} from 'vitest';
import {TypingReveal, revealLines} from './typing.js';

describe('received-code typing',()=>{
  it('reveals received text progressively and continues appended deltas without replay',()=>{
    const typing=new TypingReveal();
    typing.target('const value = 1;',0);
    expect(typing.value).toBe('');
    typing.advance(40);
    const first=typing.value;
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(16);
    typing.target('const value = 1;\nreturn value;',40);
    expect(typing.value).toBe(first);
    typing.advance(80);
    expect(typing.value.startsWith(first)).toBe(true);
    expect('const value = 1;\nreturn value;'.startsWith(typing.value)).toBe(true);
    typing.advance(1300);
    expect(typing.value).toBe('const value = 1;\nreturn value;');
    expect(typing.pending).toBe(false);
  });
  it('bounds a large backlog and accelerates at the real completion boundary',()=>{
    const typing=new TypingReveal(),source='x'.repeat(20000);
    typing.target(source,0);typing.advance(100);
    expect(typing.pending).toBe(true);
    typing.target(source,100,{terminal:true});typing.advance(401);
    expect(typing.value).toBe(source);
    const normal=new TypingReveal();normal.target(source,0);normal.advance(1201);
    expect(normal.value).toBe(source);
  });
  it('immediately replaces revised/redacted content and respects instant display',()=>{
    const typing=new TypingReveal();
    typing.target('private value',0);typing.advance(50);
    typing.target('[REDACTED]',50);
    expect(typing.value).toBe('[REDACTED]');
    typing.target('[REDACTED]\nnew',60,{instant:true});
    expect(typing.pending).toBe(false);
    expect(typing.value).toBe('[REDACTED]\nnew');
  });
  it('never splits a surrogate or combining grapheme',()=>{
    const typing=new TypingReveal(),source='가e\u0301\u{1F680}나'.repeat(20);
    typing.target(source,0);
    const boundaries=new Set(['',...Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(source),s=>source.slice(0,s.index+s.segment.length))]);
    for(let now=0;now<500;now+=7){typing.advance(now);expect(boundaries.has(typing.value)).toBe(true);}
  });
  it('preserves real diff metadata and exposes no text beyond the reveal frontier',()=>{
    const lines=[{text:'const a = 1;',number:'7',tone:'remove' as const,sign:'-'},{text:'const a = 2;',number:'7',tone:'add' as const,sign:'+'}];
    expect(revealLines(lines,16)).toEqual([lines[0],{...lines[1],text:'con'}]);
    expect(lines[1]!.text).toBe('const a = 2;');
  });
});
