import { describe, it, expect } from 'vitest';
import { NativeCodeFeed } from './feed.js';
const owner = { hostId: 'local', threadId: '11111111-1111-4111-8111-111111111111' };
const started = (id = 'cmd', turnId = 'turn-1') => ({ method: 'item/started', params: { threadId: owner.threadId, turnId, item: { id, type: 'commandExecution', command: 'node --version', status: 'inProgress' } } });
describe('native code feed', () => {
  it('opens on the first owned coding event before completion and retains live output', () => {
    let opens = 0; const feed = new NativeCodeFeed(owner, () => opens++);
    feed.accept('local', started());
    expect(opens).toBe(1); expect(feed.snapshot.calls[0]?.status).toBe('running');
    feed.accept('local', { method: 'item/commandExecution/outputDelta', params: { threadId: owner.threadId, turnId: 'turn-1', itemId: 'cmd', delta: 'v24.' } });
    expect(feed.snapshot.calls[0]?.output).toBe('v24.');
    feed.accept('local', { method: 'item/commandExecution/outputDelta', params: { threadId: owner.threadId, turnId: 'turn-1', itemId: 'cmd', delta: '19.0\n' } });
    expect(feed.snapshot.calls[0]?.output).toBe('v24.19.0\n'); expect(opens).toBe(1);
  });
  it('rejects foreign host, thread, stale turn and unknown item updates', () => {
    let opens = 0; const feed = new NativeCodeFeed(owner, () => opens++);
    feed.accept('remote', started());
    feed.accept('local', { ...started(), params: { ...started().params, threadId: '22222222-2222-4222-8222-222222222222' } });
    expect(opens).toBe(0); feed.accept('local', started());
    feed.accept('local', { method: 'item/commandExecution/outputDelta', params: { threadId: owner.threadId, turnId: 'old-turn', itemId: 'cmd', delta: 'foreign' } });
    feed.accept('local', { method: 'item/commandExecution/outputDelta', params: { threadId: owner.threadId, turnId: 'turn-1', itemId: 'missing', delta: 'foreign' } });
    expect(feed.snapshot.calls[0]?.output).toBe('');
  });
  it('does not reopen after a person closes the panel until the next turn', () => {
    let opens = 0; const feed = new NativeCodeFeed(owner, () => opens++);
    feed.accept('local', started()); feed.closedByPerson(); feed.accept('local', started('next'));
    expect(opens).toBe(1); feed.accept('local', started('new-turn', 'turn-2')); expect(opens).toBe(2);
  });
  it('opens on the stock patch generation stream before item/started, using call_id ownership', () => {
    let opens = 0; const feed = new NativeCodeFeed(owner, () => opens++);
    feed.accept('local', { method: 'item/fileChange/patchUpdated', params: { threadId: owner.threadId, turnId: 'turn-1', itemId: 'call-patch', changes: [{ path: 'a.ts', kind: { type: 'add' }, diff: 'const a = 1;\n' }] } });
    expect(opens).toBe(1); expect(feed.snapshot.calls[0]?.status).toBe('writing');
    expect(feed.snapshot.calls[0]?.inputSource).toBe('model-patch-stream'); expect(feed.snapshot.calls[0]?.input).toContain('const a = 1;');
    expect(feed.snapshot.calls[0]?.changeKind).toBe('add');
    feed.accept('local', { method: 'item/started', params: { threadId: owner.threadId, turnId: 'turn-1', item: { id: 'call-patch', type: 'fileChange', status: 'inProgress', changes: [{ path: 'a.ts', diff: 'const a = 1;\nconst b = 2;' }] } } });
    expect(feed.snapshot.calls.length).toBe(1); expect(feed.snapshot.calls[0]?.status).toBe('running');
    expect(feed.snapshot.calls[0]?.changeKind).toBe('add');
    feed.accept('local', started()); expect(feed.snapshot.calls.at(-1)?.inputSource).toBe('tool-input-ready');
  });
  it('tracks patches, plans, failure and turn interruption with exact ownership', () => {
    const feed = new NativeCodeFeed(owner, () => {});
    feed.accept('local', { method: 'item/started', params: { threadId: owner.threadId, turnId: 'turn-1', item: { type: 'fileChange', id: 'patch', changes: [{ path: 'src/a.ts', diff: '+const a = 1;' }], status: 'inProgress' } } });
    feed.accept('local', { method: 'item/fileChange/patchUpdated', params: { threadId: owner.threadId, turnId: 'turn-1', itemId: 'patch', changes: [{ path: 'src/a.ts', diff: '+const a = 2;' }] } });
    feed.accept('local', { method: 'turn/plan/updated', params: { threadId: owner.threadId, turnId: 'turn-1', plan: [{ step: '구현', status: 'inProgress' }] } });
    expect(feed.snapshot.calls[0]?.input).toContain('+const a = 2;'); expect(feed.snapshot.plan[0]?.step).toBe('구현');
    feed.accept('local', { method: 'turn/completed', params: { threadId: owner.threadId, turn: { id: 'turn-1', status: 'interrupted' } } });
    expect(feed.snapshot.calls[0]?.status).toBe('interrupted');
  });
  it('renders coding MCP and dynamic results through their real result fields', () => {
    const feed = new NativeCodeFeed(owner, () => {});
    feed.accept('local', { method: 'item/completed', params: { threadId: owner.threadId, turnId: 'turn-1', item: { id: 'mcp', type: 'mcpToolCall', tool: 'exec_command', arguments: { cmd: 'node --version' }, result: { content: [{ type: 'text', text: 'v24.19.0' }] }, status: 'completed' } } });
    expect(feed.snapshot.calls[0]?.output).toBe('v24.19.0');
    feed.accept('local', { method: 'item/completed', params: { threadId: owner.threadId, turnId: 'turn-1', item: { id: 'dynamic', type: 'dynamicToolCall', tool: 'codex_tool_call', arguments: { tool: 'codex_read', path: 'a.ts' }, contentItems: [{ type: 'inputText', text: 'const a = 1;' }], success: true } } });
    expect(feed.snapshot.calls[1]?.output).toBe('const a = 1;');
    expect(feed.snapshot.calls[1]?.tool).toBe('codex_read');
  });
  it('keeps bounded redacted snapshots without mutating native payloads', () => {
    const feed = new NativeCodeFeed(owner, () => {}); const event = started(); event.params.item.command = 'echo sk-' + 'A'.repeat(40);
    const before = JSON.stringify(event); feed.accept('local', event);
    expect(feed.snapshot.calls[0]?.input).not.toContain('A'.repeat(40)); expect(JSON.stringify(event)).toBe(before);
    for (let i = 0; i < 90; i++) feed.accept('local', started('cmd-' + i));
    expect(feed.snapshot.calls.length).toBeLessThanOrEqual(40);
  });
});
