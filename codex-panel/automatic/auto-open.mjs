export const AUTO_OPEN_INSTRUCTIONS = 'When this Live Viewer integration is enabled, inspect the current conversation\'s open MCP App tabs before creating, editing, or deleting source code. Use the host tab inventory, such as cua.listTabs({browser:"mcpapps"}). If a Live Viewer tab is already open, do not call live_viewer, even in a new coding turn; keep using that panel. Only when the inventory confirms no Live Viewer tab is open, automatically call live_viewer with {} once before the first code change. The user does not need to mention the viewer. Do not call again during the same turn. Honor an explicit request to keep it closed. Do not open it for ordinary questions or read-only research. Never select another thread or open a browser fallback. If tab inventory or the viewer is unavailable, continue coding without opening another panel.';

export const AUTO_OPEN_TOOL_DESCRIPTION = 'Open Live Viewer before writing or editing code only when the current conversation has no open Live Viewer MCP App tab. Check the host tab inventory first; never call this tool for an existing tab. Use {}.';

export const LIVE_VIEWER_SKILL = `---
name: live-viewer
description: Use automatically when a coding task will create, edit, or delete source code, including patches and file-changing terminal commands. Also use when asked to show Live Viewer. Do not use for ordinary questions or read-only research.
---

Before the first code-changing tool call, inspect the current conversation's
open MCP App tabs using the host tab inventory. In Codex computer use, call
\`cua.listTabs({browser: "mcpapps"})\` without changing focus or selecting a chat.

If a Live Viewer tab is already open, do not call \`live_viewer\`. Keep using
that panel across coding turns. Only when no Live Viewer tab is open, call the
installed \`live_viewer\` MCP tool with \`{}\` before changing code. The user does
not need to ask for the viewer. If tab inventory is unavailable, skip automatic
opening rather than risk creating another panel.

After opening once, let the existing stream update the panel. Do not repeat the
call before each file, command, or coding turn when that panel is still open.
Honor an explicit request to keep it closed.
Do not supply a thread ID, choose a different conversation, open a browser tab,
or run another model job to display the viewer. Do not invoke \`observe\` manually.

If the tool is unavailable or rejects the connection, continue the coding task
and briefly report the issue. Do not repeatedly retry or change permissions.
`;

export const LIVE_VIEWER_AGENT_POLICY = `interface:
  display_name: "Live Viewer"
  short_description: "Automatically show code changes in Codex"
  default_prompt: "Use $live-viewer to follow code changes in this conversation."
policy:
  allow_implicit_invocation: true
`;
