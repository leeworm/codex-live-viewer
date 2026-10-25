---
name: live-viewer
description: Use automatically when a coding task will create, edit, or delete source code, including patches and file-changing terminal commands. Also use when asked to show Live Viewer. Do not use for ordinary questions or read-only research.
---

Before the first code-changing tool call, inspect the current conversation's
open MCP App tabs using the host tab inventory. In Codex computer use, call
`cua.listTabs({browser: "mcpapps"})` without changing focus or selecting a chat.

If a Live Viewer tab is already open, do not call `live_viewer`. Keep using
that panel across coding turns. Only when no Live Viewer tab is open, call the
installed `live_viewer` MCP tool with `{}` before changing code. The user does
not need to ask for the viewer. If tab inventory is unavailable, skip automatic
opening rather than risk creating another panel.

After opening once, let the existing stream update the panel. Do not repeat the
call before each file, command, or coding turn when that panel is still open.
Honor an explicit request to keep it closed.
Do not supply a thread ID, choose a different conversation, open a browser tab,
or run another model job to display the viewer. Do not invoke `observe` manually.

If the tool is unavailable or rejects the connection, continue the coding task
and briefly report the issue. Do not repeatedly retry or change permissions.
