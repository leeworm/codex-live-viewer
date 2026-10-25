# Automatic Live Viewer invocation

Before changing code, Codex checks the current conversation's open MCP App tabs.
When a Live Viewer tab already exists it skips `live_viewer` and keeps that tab,
including across coding turns. When none is open, Codex invokes `live_viewer`
with empty arguments; the host supplies the owning conversation. The existing
stream then updates that panel. No viewer request is needed from the user.

The implementation uses the implicit coding skill, its invocation policy, the
MCP initialization instructions, and the tool description. These describe the
same check-before-opening rule. Opening is limited to once in a coding turn,
and unavailable tab inventory skips automatic opening to prevent duplicates.
Enable-Auto also maintains an owned section in the
user's Codex AGENTS.md so the coding preference is part of normal task context;
Disable-Auto removes only that section. Existing user rules are preserved.
Ordinary questions and read-only research do not open
the viewer. An explicit user request to keep it closed takes precedence.

The installed app exposes no supported background API for opening an MCP App
resource directly. `open_in_codex` with a browser target opens a browser panel,
so it is not used as a substitute. Automatic invocation is handled by Codex's
coding workflow; it is not a host file-system event hook or a binary patch.

Validation includes a coding request without mentioning the viewer, comparison
of the actual call order, MCP instructions and resource discovery, and owner
isolation. Test files are removed after use. Existing application processes,
other plugins, authentication, and unrelated settings are preserved.
