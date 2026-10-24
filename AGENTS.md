# Working on Codex Live Viewer

Preserve unrelated local edits and active Codex processes. Runtime changes and source changes are separate facts; do not stop or restart another session's app to validate a change.

Use npm ci for dependencies, npm run verify for TypeScript and tests, npm run build for a new Windows bundle, and npm run verify:ui for renderer changes. Existing output folders are preserved; select a fresh --output path for another build.

Keep user settings, API keys, runtime-config.json, AUTO-STATE.json, app binaries and real conversation captures out of Git. Retain LICENSE and the reference notice when adapting the renderer. Never weaken ownership or secret-redaction boundaries to make a test pass.
