const test = require('node:test');
const assert = require('node:assert/strict');
const {plan, planAgentInstructions} = require('./configure-transport.cjs');

test('a fresh Codex configuration can register its first MCP server without changing other settings', () => {
  const enabled = plan('[plugins."codex-live-viewer@codex-live-viewer"]\nenabled = true\n', 'C:/fixture/viewer', process.execPath, true);
  assert.ok(enabled.includes('CODEX_LIVE_VIEWER_HOOK_ENDPOINT'));
  assert.equal(plan(enabled, 'C:/fixture/viewer', process.execPath, true), enabled);
});

test('enabling preserves existing user instructions and adds automatic coding invocation', () => {
  const existing = '# 개인 지침\r\n기존 내용을 유지합니다.\r\n';
  const enabled = planAgentInstructions(existing, true);
  assert.ok(enabled.startsWith(existing));
  assert.ok(enabled.includes('before the first code-changing tool call'));
  assert.ok(enabled.includes('live_viewer'));
  assert.ok(enabled.includes('If a Live Viewer tab is already open, do not call'));
  assert.ok(enabled.includes('cua.listTabs'));
});
test('enabling repeatedly creates only one managed section', () => {
  const once = planAgentInstructions('# Existing\n', true);
  assert.equal(planAgentInstructions(once, true), once);
  assert.equal(once.split('BEGIN CODEX_LIVE_VIEWER_AUTO_OPEN').length, 2);
});
test('disabling removes only the owned block and keeps later user additions', () => {
  const enabled = planAgentInstructions('# Existing\n', true) + '\n# Later user rules\nKeep this.\n';
  const disabled = planAgentInstructions(enabled, false);
  assert.ok(disabled.includes('# Existing\n'));
  assert.ok(disabled.endsWith('# Later user rules\nKeep this.\n'));
  assert.ok(!disabled.includes('CODEX_LIVE_VIEWER_AUTO_OPEN'));
});
test('malformed ownership markers are preserved by rejecting the edit', () => {
  assert.throws(() => planAgentInstructions('Keep\n<!-- BEGIN CODEX_LIVE_VIEWER_AUTO_OPEN -->\n', true), /Malformed automatic viewer instruction markers/);
});
