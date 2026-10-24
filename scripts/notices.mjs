import fs from 'node:fs/promises';
import path from 'node:path';
export async function writeDependencyNotices(root){
 const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
 const sections=['Third-party notices\n\nProject-source attribution: see LICENSE and codex-panel/native/reference-NOTICE.txt.\n\nInstalled production dependencies (including transitive dependencies):'];
 for(const [location,entry] of Object.entries(lock.packages)){
  if(!location||entry.dev)continue;
  const base=path.resolve(root,location);
  if(!base.startsWith(path.resolve(root,'node_modules')+path.sep))throw Error('Unexpected dependency path');
  const pkg=JSON.parse(await fs.readFile(path.join(base,'package.json'),'utf8'));
  const files=(await fs.readdir(base)).filter(name=>/^(?:license|licence|copying|notice)(?:[.-]|$)/i.test(name));
  const texts=[];
  for(const file of files){const at=path.join(base,file);if((await fs.stat(at)).isFile())texts.push(file+'\n'+await fs.readFile(at,'utf8'));}
  if(!texts.length)throw Error('Dependency license material missing: '+location);
  sections.push('\n\n---\n'+pkg.name+'@'+pkg.version+' ('+pkg.license+')\n'+texts.join('\n\n'));
 }
 const output=(sections.join('\n')+'\n').replace(/[ \t]+$/gm,'');
 await fs.writeFile(path.join(root,'THIRD-PARTY-NOTICES.txt'),output);
}
