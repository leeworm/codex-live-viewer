import { spawn } from 'node:child_process';

const MAX_OBSERVED_LINE_BYTES = 2 * 1024 * 1024;

// Observation is deliberately independent of the byte streams. A malformed or
// oversized line can only affect observation, never the native stdio pipes.
function observeJsonLines(onMessage) {
  if (!onMessage) return null;

  let fragments = [];
  let length = 0;
  let discarding = false;

  return (chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;

    while (offset < bytes.length) {
      const newline = bytes.indexOf(0x0a, offset);
      const end = newline === -1 ? bytes.length : newline;
      const fragment = bytes.subarray(offset, end);

      if (!discarding) {
        if (length + fragment.length > MAX_OBSERVED_LINE_BYTES) {
          fragments = [];
          length = 0;
          discarding = true;
        } else if (fragment.length > 0) {
          fragments.push(fragment);
          length += fragment.length;
        }
      }

      if (newline !== -1) {
        if (!discarding && length > 0) {
          const line = Buffer.concat(fragments, length);
          const jsonBytes = line[line.length - 1] === 0x0d ? line.subarray(0, -1) : line;
          if (jsonBytes.length > 0) {
            try {
              const message = JSON.parse(jsonBytes.toString('utf8'));
              // Never await the observer or permit its rejection to reach stdio.
              Promise.resolve(onMessage(message)).catch(() => {});
            } catch {
              // Invalid JSON and synchronous observer failures are observational.
            }
          }
        }
        fragments = [];
        length = 0;
        discarding = false;
      }

      offset = end + 1;
    }
  };
}

/** Spawn one owned stock app-server and transparently tee its stdio. */
export function startStdioProxy({
  command,
  args,
  env,
  cwd,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  onServerMessage,
  onClientMessage
}) {
  const child = spawn(command, args, {
    env,
    cwd,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const clientObserver = observeJsonLines(onClientMessage);
  const serverObserver = observeJsonLines(onServerMessage);
  if (clientObserver) stdin.on('data', clientObserver);
  if (serverObserver) child.stdout.on('data', serverObserver);

  // A stock server may close stdin early. Avoid unhandled EPIPE on our pipe.
  child.stdin.on('error', () => {});

  // pipe() supplies ordinary Readable/Writable backpressure and exact bytes.
  // The destination output streams belong to the caller; do not end them.
  stdin.pipe(child.stdin);
  child.stdout.pipe(stdout, { end: false });
  child.stderr.pipe(stderr, { end: false });

  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      stdin.unpipe(child.stdin);
      child.stdout.unpipe(stdout);
      child.stderr.unpipe(stderr);
      if (clientObserver) stdin.off('data', clientObserver);
      if (serverObserver) child.stdout.off('data', serverObserver);
      resolve({ code, signal });
    });
  });

  return { child, completion };
}
