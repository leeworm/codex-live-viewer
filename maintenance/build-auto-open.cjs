const path = require('node:path');
const {execFileSync} = require('node:child_process');
const output = process.env.CODEX_BUILD_OUTPUT_DIR;
if (!output) throw Error('Run through codex_build_safety.py build.');
execFileSync(process.execPath, ['scripts/build.mjs', '--output', path.join(output, 'bundle')], {
  stdio: 'inherit', windowsHide: true
});
