/** Palette adapted from claude-code-live-viewer (MIT); see reference-NOTICE.txt. */
export const nativeViewCss = `
:host{--page:#f8f8f8;--card:#fff;--ink:#333841;--muted:#626b77;--rule:#c9ced5;--accent:#326f96;--green:#287452;--red:#b34449;--add-bg:#e5f3e9;--del-bg:#f9e8e8;--mono:"Cascadia Code","D2Coding","Cascadia Mono",ui-monospace,monospace;--sans:"Pretendard","Segoe UI",system-ui,sans-serif;display:flex;width:100%;height:100%;min-height:0;color:var(--ink);font:14px/1.55 var(--sans);text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
@media(prefers-color-scheme:dark){:host{--page:#151820;--card:#0f1216;--ink:#e8ecf4;--muted:#9ca3b0;--rule:#353d49;--accent:#6abcec;--green:#82d9ab;--red:#f19b9b;--add-bg:#142e26;--del-bg:#332126}}
*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.viewer{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--page)}
.bar{display:flex;gap:12px;align-items:center;min-height:43px;flex-shrink:0;padding:8px 16px;border-bottom:1px solid var(--rule)}
.heading{font-size:14px;font-weight:600;letter-spacing:.01em}.connection-dot{width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}.phase{font-size:12px;color:var(--muted)}.bar .phase{margin-left:auto}
.follow{border:1px solid var(--rule);border-radius:4px;padding:3px 8px;background:transparent;font-size:12px;color:var(--muted);white-space:nowrap}.follow[aria-pressed=true]{color:var(--ink)}
.timeline{flex:1;min-height:0;overflow:auto;padding:15px 16px 26px;scrollbar-gutter:stable;overscroll-behavior:contain}
.empty{padding:30px 0;color:var(--muted);font-size:14px}
.call{margin:16px 0 21px;border:1px solid var(--rule);border-radius:4px;background:var(--card);padding:0 0 6px}
.call-head{position:relative;display:flex;align-items:center;gap:8px;margin:-11px 8px 1px;padding:0 7px;width:fit-content;max-width:calc(100% - 16px);background:var(--page);min-height:22px;font:600 13.5px/1.65 var(--mono)}
.call-label{flex-shrink:0}.call-title{font-weight:450;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.call-count{color:var(--muted);font-weight:400;flex-shrink:0;font-size:12px}
.state-mark{display:block;width:7px;height:7px;border:1px solid var(--muted);border-radius:1px;flex-shrink:0}
.call[data-status=writing] .state-mark,.call[data-status=running] .state-mark{border-color:var(--accent);background:var(--accent);animation:pulse 1.2s ease-in-out infinite}
.call[data-status=completed] .state-mark{border-color:var(--green);background:var(--green)}
.call[data-status=failed] .state-mark{border-color:var(--red);background:var(--red)}
.call[data-status=failed]{border-color:var(--red)}
@keyframes pulse{50%{opacity:.3}}@media(prefers-reduced-motion:reduce){.state-mark{animation:none!important}}
.call-tools{display:flex;gap:9px;align-items:center;padding:0 11px 3px;min-height:23px;color:var(--muted);font:11.5px var(--sans)}
.call-tools .call-phase{margin-right:auto}.small-button{padding:1px 2px;border:0;background:none;color:var(--muted);font:11.5px var(--sans)}.small-button:hover{color:var(--ink)}
.code-line{display:grid;grid-template-columns:6ch 1.2ch minmax(0,1fr);min-height:24px;font:15px/24px var(--mono);font-variant-ligatures:none}
.code-line[data-tone=add]{background:var(--add-bg)}.code-line[data-tone=remove]{background:var(--del-bg)}.code-line[data-tone=hunk]{color:var(--accent)}
.line-number,.line-sign{user-select:none;text-align:right;color:var(--muted);padding-right:9px}.line-sign{padding-right:0;text-align:left}
.code-line[data-tone=add] .line-sign{color:var(--green)}.code-line[data-tone=remove] .line-sign{color:var(--red)}
.typing-caret{display:inline-block;width:2px;height:1.1em;margin-left:1px;vertical-align:-.15em;background:var(--accent);animation:caret-blink .85s step-end infinite}@keyframes caret-blink{50%{opacity:0}}
.code-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;padding-right:10px;min-width:0;font:inherit;tab-size:2}
.call[data-kind=shell] .code-line{grid-template-columns:2ch minmax(0,1fr)}.call[data-kind=shell] .line-number{display:none}.call[data-kind=shell] .line-sign{padding-left:9px;color:var(--accent)}
.overflow{margin:2px 12px;color:var(--muted);font:12px/1.8 var(--mono)}
.output{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 0;padding:7px 12px 2px;border-top:1px solid var(--rule);font:14px/1.65 var(--mono);color:var(--ink);max-width:100%}
.progress{padding:3px 12px;color:var(--muted);font:12px/1.6 var(--sans)}
.call[data-kind=line]{margin:7px 0;border:0;background:transparent;padding:0}.call[data-kind=line] .call-head{margin:0;padding:0;background:none;max-width:100%;font-size:13.5px;font-weight:400}.call[data-kind=line] .call-label{font-weight:650}.call[data-kind=line] .call-title{color:var(--muted)}
.call[data-kind=line] .call-tools{padding-left:15px}.call[data-kind=line][data-expanded=false] .call-tools{display:none}.call[data-kind=line] .call-head{cursor:pointer}.call[data-kind=line] .cm-content{background:var(--card)}
.plan-wrap{margin:25px 0 5px;font-family:var(--mono);font-size:13px}.plan-title{color:var(--accent);font-weight:650}.plan-count{font-weight:400;color:var(--muted)}
.plan{list-style:none;padding:0;margin:7px 0 0 3px}.plan li{position:relative;padding:2px 0 2px 26px;border-left:1px solid var(--accent);min-height:25px}.plan li:last-child{border-left-color:transparent}.plan li:before{content:"";position:absolute;left:-1px;top:0;height:14px;width:13px;border-left:1px solid var(--accent);border-bottom:1px solid var(--accent)}
.todo-mark{display:inline-block;width:7px;height:7px;border:1px solid var(--muted);margin-right:9px;vertical-align:1px}.plan li[data-status=completed]{color:var(--muted)}.plan li[data-status=completed] .todo-mark{border-color:var(--green);background:var(--green)}.plan li[data-status=inProgress]{font-weight:650}.plan li[data-status=inProgress] .todo-mark{border-color:var(--accent);background:var(--accent)}
.footer{flex-shrink:0;min-height:28px;padding:5px 16px;border-top:1px solid var(--rule);color:var(--muted);font:11px/1.5 var(--sans)}.source{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tok-keyword,.tok-operator{color:#3978a9}.tok-string,.tok-string2{color:#45804e}.tok-number,.tok-bool,.tok-atom{color:#936232}.tok-comment{color:#7d8790;font-style:italic}.tok-typeName,.tok-className{color:#8a5b86}.tok-variableName,.tok-propertyName{color:inherit}
@media(prefers-color-scheme:dark){.tok-keyword,.tok-operator{color:#83c5fa}.tok-string,.tok-string2{color:#a3d59c}.tok-number,.tok-bool,.tok-atom{color:#d9b387}.tok-comment{color:#939cac}.tok-typeName,.tok-className{color:#d1afe3}}
[hidden]{display:none!important}@media(max-width:480px){.bar{padding:8px 11px;gap:8px}.timeline{padding:14px 10px 22px}.code-line{font-size:14px;grid-template-columns:5ch 1.2ch minmax(0,1fr)}.call-head{font-size:13px}.call-count{font-size:11px}.footer{padding-left:11px}}
`;
