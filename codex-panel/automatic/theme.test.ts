import {describe,it,expect} from 'vitest';
import {createThemeReader} from './theme-config.mjs';
import {resolveAppTheme} from '../../src/shared/app-theme.js';
import {startViewerService} from './service.js';
const config='api_key = "never expose"\n[desktop]\nappearanceTheme = "dark"\n[desktop.appearanceDarkChromeTheme]\nsurface = "#111111"\nink = "#fcfcfc"\naccent = "#0169cc"\ncontrast = 50\n[desktop.appearanceDarkChromeTheme.semanticColors]\ndiffAdded = "#00a240"\ndiffRemoved = "#e02e2a"';
describe('Codex app theme source',()=>{
 it('reads only appearance colors and follows subsequent config changes',async()=>{
  let source=config;const read=createThemeReader({read:async()=>source});
  const first=await read();expect(first.mode).toBe('dark');
  expect(resolveAppTheme(first,false)).toMatchObject({mode:'dark',page:'#111111',ink:'#fcfcfc',accent:'#0169cc',added:'#00a240',removed:'#e02e2a'});
  expect(JSON.stringify(first)).not.toContain('never expose');
  source=config.replace('#111111','#223344');expect(resolveAppTheme(await read(),false).page).toBe('#223344');
  source='[incomplete';expect(resolveAppTheme(await read(),false).page).toBe('#223344');
 });
 it('respects app light/dark overrides rather than following the OS unconditionally',()=>{
  expect(resolveAppTheme({mode:'light'},true).mode).toBe('light');
  expect(resolveAppTheme({mode:'dark'},false).mode).toBe('dark');
  expect(resolveAppTheme({mode:'system'},true).mode).toBe('dark');
  expect(resolveAppTheme({mode:'system'},false).mode).toBe('light');
 });
 it('rejects CSS payloads and uses a bounded neutral fallback',async()=>{
  const read=createThemeReader({read:async()=>config.replace('#111111','red; background:url(https://evil.example)')});
  expect(resolveAppTheme(await read(),true).page).toBe('#181818');
  expect(JSON.stringify(await read())).not.toContain('evil.example');
  expect(resolveAppTheme({mode:'dark',dark:{surface:'url(https://evil.example)'}},true).page).toBe('#181818');
 });
 it('serves updated color-only settings through the same origin',async()=>{
  let source=config;const theme=createThemeReader({read:async()=>source});
  const service=await startViewerService({javascript:'',open:async()=>true,theme});
  try{
   const url='http://127.0.0.1:'+service.port+'/theme';
   const first=await(await fetch(url)).json();
   expect(resolveAppTheme(first,false).page).toBe('#111111');
   expect(JSON.stringify(first)).not.toContain('never expose');
   source=config.replace('#111111','#223344');const next=await(await fetch(url)).json();
   expect(resolveAppTheme(next,false).page).toBe('#223344');
   expect((await fetch(url,{headers:{Origin:'http://evil.example'}})).status).toBe(403);
  }finally{await service.close();}
 });
});
