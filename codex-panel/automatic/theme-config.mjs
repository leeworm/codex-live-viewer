import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parse} from 'smol-toml';
import {selectAppTheme} from '../../src/shared/app-theme.ts';
export function createThemeReader({file=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'config.toml'),read=()=>fs.readFile(file,'utf8')}={}){
 let last={mode:'system'};
 return async()=>{
  try{const text=await read();if(text.length>1_000_000)return last;last=selectAppTheme(parse(text));}catch{/* Atomic config rewrites may be temporarily unreadable. Keep the last valid colors. */}
  return last;
 };
}
