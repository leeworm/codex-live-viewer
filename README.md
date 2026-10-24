# Codex Live Viewer

Automatic code, diff and execution progress inside the Codex desktop app for Windows.

[한국어](README.ko.md) · [License](LICENSE) · [Attribution](codex-panel/native/reference-NOTICE.txt)

When a code tool starts, the viewer follows its execution in the owning chat's built-in browser panel.

## Features

- Chronological Write, Edit and shell cards; compact Read/Grep/Glob rows.
- Syntax colors, diff additions/deletions and available source line numbers.
- Typing animation for incoming code.
- Expandable code previews, copy and a TODO tree.
- History browsing with a bottom-center button to return to the latest work.
- Cascadia Code / D2Coding fallbacks; narrow layouts and colors following the Codex app's appearance settings.
- Automatic connection from the ordinary Codex icon after one-time setup.
- Installed Codex components resolved again at launch; application binaries stay untouched.

![Renderer demo using fixed local events](docs/assets/typing-preview.png)

Code appears as it is received. Depending on the tool, the viewer receives partial updates or prepared input.

## Requirements

Windows, an installed and signed-in Codex desktop app, Node.js 22 or later, and npm. The current connection expects the Windows OpenAI.Codex package and its bundled codex-app-tools server.

## Build and install

```powershell
git clone https://github.com/leeworm/codex-live-viewer.git
cd codex-live-viewer
npm ci
npm run verify
npm run build
```

1. Open `dist/codex-live-viewer-0.5.4` and run `Enable-Auto.cmd`.
2. Close Codex normally when your work is saved, then start it using your usual icon.
3. Ask Codex to write or edit a file. Live Viewer opens automatically in the owning chat.

Enable-Auto copies the verified bundle into the current user's AppData and registers `CODEX_CLI_PATH`. It preserves the previous value and rejects unrelated overrides. It never stops the running app. To restore the prior setting, run `Disable-Auto.cmd` from the installed bundle.

Scroll upward to pause automatic scrolling. Use the bottom-center return button or scroll to the bottom to follow the latest work again.

Background, foreground, accent and diff colors follow the Codex app theme and update when its appearance settings change.

Build output folders must be new. To keep an existing build and create another:

```powershell
npm run build -- --output "C:\builds\codex-live-viewer-next"
```

## Development

```powershell
npm run verify
npm run verify:ui
```

`verify` checks types and unit tests. `verify:ui` checks rendering and interactions using local events, with results saved to `artifacts/`.

Production dependency license texts are collected from the lockfile's installed packages during build and included with the bundle. The optional generated hook plugin validates real executor ownership metadata and does not change tool input or permissions. Automatic display also works without installing that hook plugin.

## How it works and limitations

A small Windows launcher delegates to the installed stock CLI. A Node observer forwards the existing app-server stream and projects bounded, redacted tool events by host, thread, turn and call identity. The bundled app tool opens a per-chat localhost capability URL, and SSE updates its renderer.

The connection supports local execution on this Windows host. Remote and service-only execution are outside the verified scope. Future app versions must retain the CLI override and bundled panel tool contracts; compatibility is not unconditional.

## Credits

The tool-card presentation and palette draw from [claude-code-live-viewer](https://github.com/moneycode11101-svg/claude-code-live-viewer), which also credits [oh-my-pi](https://github.com/can1357/oh-my-pi). Full notices are retained in [reference-NOTICE.txt](codex-panel/native/reference-NOTICE.txt). The shared redaction helper originates in Chat On Steroids under the retained MIT license.

This is an independent local integration.
