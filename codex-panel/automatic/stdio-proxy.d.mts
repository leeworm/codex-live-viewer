import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

export interface StdioProxyOptions {
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  stdin?: Readable;
  stdout?: Writable;
  stderr?: Writable;
  onServerMessage?: (message: unknown) => void | Promise<void>;
  onClientMessage?: (message: unknown) => void | Promise<void>;
}

export interface StdioProxyHandle {
  child: ChildProcessWithoutNullStreams;
  completion: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

export function startStdioProxy(options: StdioProxyOptions): StdioProxyHandle;
