'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const {parse, stringify} = require('smol-toml');
const serverName = 'codex-live-viewer';
const pluginId = 'codex-live-viewer@codex-live-viewer';
const marker = 'CODEX_LIVE_VIEWER_MANAGED_INSTALL';

function removeSections(text, pattern) {
  return text.split(/(?=^\[)/m).filter(section => !pattern.test(section.split(/\r?\n/, 1)[0])).join('').trimEnd();
}
function scrub(config) {
  const value = JSON.parse(JSON.stringify(config));
  delete value.mcp_servers?.[serverName];
  if (value.mcp_servers && !Object.keys(value.mcp_servers).length) delete value.mcp_servers;
  const plugin = value.plugins?.[pluginId];
  if (plugin?.mcp_servers) {
    delete plugin.mcp_servers[serverName];
    if (!Object.keys(plugin.mcp_servers).length) delete plugin.mcp_servers;
  }
  return value;
}
function plan(text, root, node, enabled) {
  const before = parse(text);
  const existing = before.mcp_servers?.[serverName];
  if (existing && path.resolve(existing.env?.[marker] || '') !== path.resolve(root)) {
    throw Error('Another Live Viewer MCP registration exists; preserved.');
  }
  if (!enabled && !existing) return text;
  const entry = {...existing, command: node, args: [path.join(root, 'plugins/codex-live-viewer/hook-server.cjs')],
    enabled, env: {...existing?.env, [marker]: root},
    env_vars: [...new Set([...(existing?.env_vars || []), 'CODEX_LIVE_VIEWER_HOOK_ENDPOINT', 'CODEX_HOME', 'USERPROFILE', 'LOCALAPPDATA'])]};
  const policy = {...before.plugins?.[pluginId]?.mcp_servers?.[serverName], enabled: false};
  let next = removeSections(text, /^\[mcp_servers\.codex-live-viewer(?:\.|\])/);
  next = removeSections(next, /^\[plugins\."codex-live-viewer@codex-live-viewer"\.mcp_servers\.codex-live-viewer(?:\.|\])/);
  next += '\n\n' + stringify({mcp_servers: {[serverName]: entry}}).trimEnd();
  next += '\n\n' + stringify({plugins: {[pluginId]: {mcp_servers: {[serverName]: policy}}}}).trimEnd() + '\n';
  const after = parse(next);
  if (!isDeepStrictEqual(scrub(after), scrub(before))) throw Error('Unrelated configuration must remain unchanged');
  assert.equal(after.mcp_servers[serverName].enabled, enabled);
  assert.equal(after.plugins[pluginId].mcp_servers[serverName].enabled, false);
  return next;
}
function planAgentInstructions(text, enabled) {
  const begin = '<!-- BEGIN CODEX_LIVE_VIEWER_AUTO_OPEN -->';
  const end = '<!-- END CODEX_LIVE_VIEWER_AUTO_OPEN -->';
  const first = text.indexOf(begin), last = text.indexOf(end);
  if ((first < 0) !== (last < 0) || (first >= 0 && (last < first || text.indexOf(begin, first + begin.length) >= 0 || text.indexOf(end, last + end.length) >= 0))) {
    throw Error('Malformed automatic viewer instruction markers; preserved.');
  }
  if (!enabled) return first < 0 ? text : text.slice(0, first) + text.slice(last + end.length);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const block = [begin, '## Live Viewer automatic opening', '',
    '- When the codex-live-viewer integration is enabled, inspect the current conversation\'s open MCP App tabs before the first code-changing tool call. Use the host tab inventory, such as `cua.listTabs({browser:"mcpapps"})`, without changing focus or selecting another chat.',
    '- If a Live Viewer tab is already open, do not call `live_viewer`, even in a new coding turn. Reuse that panel. Only when the inventory confirms no viewer is open, call `live_viewer` with `{}` once before changing code. The user does not need to request the viewer. If tab inventory is unavailable, skip automatic opening rather than create a duplicate. Never open a browser fallback.',
    '- Do not open it for ordinary questions or read-only research. Honor an explicit request to keep it closed. If the viewer is unavailable, continue coding and briefly report the issue; do not repeatedly retry or change permissions.',
    end].join(newline);
  return first < 0 ? text + (text && !text.endsWith('\n') ? newline : '') + newline + block + newline : text.slice(0, first) + block + text.slice(last + end.length);
}
if (require.main === module) {
  const root = __dirname;
  const file = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
  const enabled = !process.argv.includes('--disable');
  const before = fs.readFileSync(file, 'utf8');
  const after = plan(before, root, process.execPath, enabled);
  const agentFile = path.join(path.dirname(file), 'AGENTS.md');
  const agentExisted = fs.existsSync(agentFile);
  const agentBefore = agentExisted ? fs.readFileSync(agentFile, 'utf8') : '';
  const agentAfter = planAgentInstructions(agentBefore, enabled);
  if (after !== before || agentAfter !== agentBefore) {
    const backups = path.join(path.dirname(file), 'backups', 'live-viewer-transport-' + Date.now());
    fs.mkdirSync(backups, {recursive: true});
    fs.writeFileSync(path.join(backups, 'config.toml.before'), before, {flag: 'wx'});
    fs.writeFileSync(path.join(backups, 'AGENTS.md.before'), agentBefore, {flag: 'wx'});
    if (fs.readFileSync(file, 'utf8') !== before) throw Error('Configuration changed; preserved.');
    if (fs.existsSync(agentFile) !== agentExisted || (agentExisted && fs.readFileSync(agentFile, 'utf8') !== agentBefore)) throw Error('User instructions changed; preserved.');
    for (const [target, previous, next] of [[file, before, after], [agentFile, agentBefore, agentAfter]]) {
      if (previous === next) continue;
      const temporary = target + '.live-viewer-' + process.pid;
      fs.writeFileSync(temporary, next, {flag: 'wx'});
      fs.renameSync(temporary, target);
    }
  }
  console.log(JSON.stringify({enabled, nativeTransport: true, inheritedRuntimeEndpoint: true, bundledDuplicateDisabled: true, automaticCodingRule: enabled}));
}
module.exports = {plan, planAgentInstructions};
