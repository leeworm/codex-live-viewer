import { redactSecretText } from '../../src/shared/redaction.js';
export type Owner = { hostId: string; threadId: string };
export type CallStatus = 'writing' | 'running' | 'completed' | 'failed' | 'interrupted';
export type NativeCall = { id: string; turnId: string; tool: string; title: string; input: string; output: string; progress: string; status: CallStatus; inputSource: 'model-patch-stream' | 'tool-input-ready'; time: number; durationMs?: number; exitCode?: number; changeKind?: 'add' | 'update' | 'delete' };
export type NativeSnapshot = Owner & { turnId: string | null; calls: NativeCall[]; plan: { step: string; status: string }[]; revision: number };
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const shown = (value: string, cap = 20000): string => redactSecretText(value).slice(-cap);
const encode = (value: unknown): string => { try { return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''; } catch { return ''; } };
const phase = (value: unknown): CallStatus => value === 'failed' || value === 'declined' ? 'failed' : value === 'interrupted' || value === 'cancelled' ? 'interrupted' : value === 'completed' ? 'completed' : 'running';
function changeText(value: unknown): string {
  return Array.isArray(value) ? value.map(item => { const change = object(item); return change ? (value.length > 1 ? '// ' + text(change.path) + '\n' : '') + text(change.diff) : ''; }).filter(Boolean).join('\n\n') : '';
}
function changeKind(value: unknown): NativeCall['changeKind'] { const kind=object(value)?.type ?? value; return kind==='add'||kind==='update'||kind==='delete'?kind:undefined; }
function inputOf(item: RecordValue): { tool: string; title: string; input: string; changeKind?: NativeCall['changeKind'] } | null {
  if (item.type === 'commandExecution') return { tool: 'command', title: text(item.command).split(/\r?\n/)[0] || '명령', input: text(item.command) };
  if (item.type === 'fileChange') return { tool: 'patch', title: text(object(Array.isArray(item.changes) ? item.changes[0] : null)?.path) || '파일 변경', input: changeText(item.changes), changeKind: changeKind(object(Array.isArray(item.changes) ? item.changes[0] : null)?.kind) };
  if (item.type !== 'mcpToolCall' && item.type !== 'dynamicToolCall') return null;
  const tool = text(item.tool), args = object(item.arguments);
  const routed = tool === 'codex_tool_call' ? text(args?.tool) || text(args?.tool_name) || text(args?.name) : tool;
  if (!/(?:^|[_.])(exec|exec_command|apply_patch|write|edit|read|bash|shell|grep|glob)(?:$|[_.])/i.test(routed)) return null;
  return { tool: routed, title: text(args?.path) || text(args?.file_path) || tool, input: text(args?.code) || text(args?.cmd) || text(args?.command) || text(args?.patch) || encode(item.arguments) };
}
/** Native notifications only: no filesystem polling, model calls, or user chat picker. */
export class NativeCodeFeed {
  private calls: NativeCall[] = [];
  private plan: NativeSnapshot['plan'] = [];
  private turnId: string | null = null;
  private revision = 0;
  private opened = false;
  private opening = false;
  private closedTurn: string | null = null;
  private readonly retired = new Set<string>();
  private readonly listeners = new Set<(snapshot: NativeSnapshot) => void>();
  constructor(readonly owner: Owner, private readonly open: (snapshot: NativeSnapshot) => unknown) {}
  get snapshot(): NativeSnapshot { return { ...this.owner, turnId: this.turnId, calls: this.calls.map(call => ({ ...call })), plan: this.plan.map(step => ({ ...step })), revision: this.revision }; }
  subscribe(listener: (snapshot: NativeSnapshot) => void): () => void { this.listeners.add(listener); listener(this.snapshot); return () => { this.listeners.delete(listener); }; }
  closedByPerson(): void { this.closedTurn = this.turnId; this.opened = false; }
  private turn(id: string): boolean {
    if (!id || this.retired.has(id)) return false;
    if (this.turnId === id) return true;
    if (this.turnId) this.retired.add(this.turnId);
    while (this.retired.size > 64) this.retired.delete(this.retired.values().next().value!);
    this.turnId = id; this.plan = []; this.opened = false; return true;
  }
  canReveal(turnId: string | null): boolean { return !!turnId && turnId === this.turnId && this.closedTurn !== turnId; }
  reveal(): void {
    if (this.opened || this.opening || !this.calls.some(call => call.turnId === this.turnId) || !this.canReveal(this.turnId)) return;
    const snapshot = this.snapshot; this.opening = true;
    try {
      const result = this.open(snapshot);
      if (result instanceof Promise) void result.then(ok => { if (snapshot.turnId === this.turnId) this.opened = ok && this.canReveal(snapshot.turnId); }).catch(() => {}).finally(() => { this.opening = false; });
      else { this.opened = result !== false; this.opening = false; }
    } catch { this.opening = false; }
  }
  private changed(open = false): void {
    this.revision++; const snapshot = this.snapshot;
    if (open) this.reveal();
    for (const listener of this.listeners) try { listener(snapshot); } catch { /* isolate rendering */ }
  }
  accept(hostId: string, notification: unknown): boolean {
    const event = object(notification), params = object(event?.params);
    if (!params || hostId !== this.owner.hostId || params.threadId !== this.owner.threadId) return false;
    const method = text(event?.method), turn = object(params.turn), incomingTurn = text(params.turnId) || text(turn?.id);
    if (method === 'turn/started') return this.turn(incomingTurn);
    if (method === 'turn/completed') {
      if (incomingTurn !== this.turnId) return false;
      for (const call of this.calls) if (call.turnId === incomingTurn && (call.status === 'running' || call.status === 'writing')) call.status = turn?.status === 'interrupted' ? 'interrupted' : turn?.status === 'failed' ? 'failed' : 'completed';
      this.retired.add(incomingTurn); this.changed(); return true;
    }
    if (method === 'turn/plan/updated') {
      if (!this.turn(incomingTurn) || !Array.isArray(params.plan)) return false;
      this.plan = params.plan.flatMap(value => { const step = object(value); return step && typeof step.step === 'string' ? [{ step: shown(step.step, 500), status: text(step.status) }] : []; }).slice(0, 30);
      this.changed(); return true;
    }
    // Stock patch streaming precedes item/started. Its itemId is the custom call_id.
    if (method === 'item/fileChange/patchUpdated') {
      if (typeof params.itemId !== 'string' || !Array.isArray(params.changes) || !params.changes.length || !this.turn(incomingTurn)) return false;
      let call = this.calls.find(call => call.id === params.itemId && call.turnId === incomingTurn);
      if (!call) { call = { id: params.itemId, turnId: incomingTurn, tool: 'patch', title: '', input: '', output: '', progress: '', status: 'writing', inputSource: 'model-patch-stream', time: Date.now() }; this.calls.push(call); }
      if (call.status !== 'writing' && call.status !== 'running') return false;
      call.title = shown(text(object(params.changes[0])?.path) || '파일 변경', 500);
      call.changeKind = changeKind(object(params.changes[0])?.kind) ?? call.changeKind;
      call.input = shown(changeText(params.changes)); this.calls = this.calls.slice(-40); this.changed(true); return true;
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = object(params.item), input = item && inputOf(item);
      if (!item || !input || typeof item.id !== 'string' || !this.turn(incomingTurn)) return false;
      let call = this.calls.find(call => call.id === item.id && call.turnId === incomingTurn);
      if (!call) { call = { id: item.id, turnId: incomingTurn, tool: input.tool, title: '', input: '', output: '', progress: '', status: 'running', inputSource: 'tool-input-ready', time: Date.now() }; this.calls.push(call); }
      call.title = shown(input.title, 500); call.input = shown(input.input); call.tool = input.tool;
      call.changeKind = input.changeKind ?? call.changeKind;
      call.status = method === 'item/completed' ? (item.error != null || item.success === false ? 'failed' : phase(item.status) === 'running' ? 'completed' : phase(item.status)) : 'running';
      if (typeof item.aggregatedOutput === 'string') call.output = shown(item.aggregatedOutput);
      if (item.type === 'mcpToolCall' && item.result != null) {
        const result = object(item.result), content = Array.isArray(result?.content) ? result.content : [];
        call.output = shown(content.map(value => text(object(value)?.text)).filter(Boolean).join('\n') || encode(result?.structuredContent ?? item.result));
      }
      if (item.type === 'dynamicToolCall' && Array.isArray(item.contentItems)) call.output = shown(item.contentItems.map(value => text(object(value)?.text)).filter(Boolean).join('\n'));
      if (item.error != null) call.output = shown(encode(item.error));
      if (typeof item.durationMs === 'number') call.durationMs = item.durationMs;
      if (typeof item.exitCode === 'number') { call.exitCode = item.exitCode; if (item.exitCode !== 0) call.status = 'failed'; }
      this.calls = this.calls.slice(-40); this.changed(true); return true;
    }
    if (incomingTurn !== this.turnId) return false;
    const call = this.calls.find(call => call.id === params.itemId && call.turnId === incomingTurn);
    if (!call || call.status === 'completed' || call.status === 'failed' || call.status === 'interrupted') return false;
    if (method === 'item/commandExecution/outputDelta' || method === 'item/fileChange/outputDelta') call.output = shown(call.output + text(params.delta));
    else if (method === 'item/mcpToolCall/progress') call.progress = shown(text(params.message), 1000);
    else return false;
    this.changed(); return true;
  }
}
