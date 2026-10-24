import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(root,'artifacts');await fs.mkdir(base,{recursive:true});
const output=path.join(base,'renderer-'+Date.now());
execFileSync(process.execPath,[path.join(root,'codex-panel','automatic','verify-reference-ui.cjs'),output],{cwd:root,stdio:'inherit',windowsHide:true});
