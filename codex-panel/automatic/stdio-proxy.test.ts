import { describe, expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { startStdioProxy } from './stdio-proxy.mjs';

function collectingSink() {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    highWaterMark: 1,
    write(chunk: Buffer, _encoding, callback) {
      // Slow writes exercise the backpressure built into native .pipe().
      setImmediate(() => {
        chunks.push(Buffer.from(chunk));
        callback();
      });
    }
  });
  return { stream, bytes: () => Buffer.concat(chunks) };
}

const ECHO_STDOUT_AND_STDERR = 'process.stdin.pipe(process.stdout); process.stdin.pipe(process.stderr);';
const ECHO_STDOUT = 'process.stdin.pipe(process.stdout);';

describe('stock app-server stdio tee', () => {
  it('forwards byte-exact split UTF-8 frames to stdout and stderr with backpressure', async () => {
    const frame = Buffer.concat([
      Buffer.from('{"text":"한글 😀","id":1}\r\n'),
      Buffer.from([0x00, 0xff, 0x0a]), // Non-JSON bytes must still pass through exactly.
      Buffer.from('{"method":"next","id":2}\n')
    ]);
    const unicodeStart = frame.indexOf(Buffer.from('😀'));
    const chunks = [
      frame.subarray(0, unicodeStart + 1),
      frame.subarray(unicodeStart + 1, unicodeStart + 3),
      frame.subarray(unicodeStart + 3, frame.indexOf(0x0a) + 1),
      frame.subarray(frame.indexOf(0x0a) + 1)
    ];
    const stdout = collectingSink();
    const stderr = collectingSink();
    const clientMessages: unknown[] = [];
    const serverMessages: unknown[] = [];

    const { completion } = startStdioProxy({
      command: process.execPath,
      args: ['-e', ECHO_STDOUT_AND_STDERR],
      stdin: Readable.from(chunks),
      stdout: stdout.stream,
      stderr: stderr.stream,
      onClientMessage: message => { clientMessages.push(message); },
      onServerMessage: message => { serverMessages.push(message); }
    });

    expect(await completion).toEqual({ code: 0, signal: null });
    expect(stdout.bytes()).toEqual(frame);
    expect(stderr.bytes()).toEqual(frame);
    const expected = [{ text: '한글 😀', id: 1 }, { method: 'next', id: 2 }];
    expect(clientMessages).toEqual(expected);
    expect(serverMessages).toEqual(expected);
    expect(stdout.stream.writableEnded).toBe(false);
    expect(stderr.stream.writableEnded).toBe(false);
  });

  it('survives synchronous throws and asynchronous observer rejections', async () => {
    const frame = Buffer.from('{"id":1}\n{"id":2}\n');
    const stdout = collectingSink();
    const stderr = collectingSink();
    const seen: unknown[] = [];

    const { completion } = startStdioProxy({
      command: process.execPath,
      args: ['-e', ECHO_STDOUT_AND_STDERR],
      stdin: Readable.from([frame]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      onClientMessage: () => { throw Error('client observer failed'); },
      onServerMessage: async message => {
        seen.push(message);
        throw Error('server observer rejected');
      }
    });

    expect(await completion).toEqual({ code: 0, signal: null });
    expect(stdout.bytes()).toEqual(frame);
    expect(stderr.bytes()).toEqual(frame);
    expect(seen).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('drops an oversized observer line then recovers at the next newline without losing bytes', async () => {
    const huge = Buffer.from('x'.repeat(2 * 1024 * 1024 + 1));
    const next = Buffer.from('{"valid":true,"text":"복구"}\n');
    const frame = Buffer.concat([huge, Buffer.from('\n'), next]);
    const stdout = collectingSink();
    const stderr = collectingSink();
    const clientMessages: unknown[] = [];
    const serverMessages: unknown[] = [];

    const { completion } = startStdioProxy({
      command: process.execPath,
      args: ['-e', ECHO_STDOUT],
      stdin: Readable.from([
        frame.subarray(0, 900_000),
        frame.subarray(900_000, 2 * 1024 * 1024),
        frame.subarray(2 * 1024 * 1024)
      ]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      onClientMessage: message => { clientMessages.push(message); },
      onServerMessage: message => { serverMessages.push(message); }
    });

    expect(await completion).toEqual({ code: 0, signal: null });
    expect(stdout.bytes()).toEqual(frame);
    expect(stderr.bytes().length).toBe(0);
    expect(clientMessages).toEqual([{ valid: true, text: '복구' }]);
    expect(serverMessages).toEqual([{ valid: true, text: '복구' }]);
  });
});
