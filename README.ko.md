# Codex Live Viewer

Windows의 Codex 앱에서 코드·diff·명령 실행 상황을 자동으로 보여주는 라이브 뷰어입니다.

[English](README.md) · [라이선스](LICENSE) · [원본 출처](codex-panel/native/reference-NOTICE.txt)

현재 대화에서 코드 작업이 시작되면 해당 대화의 앱 내 브라우저 패널에 진행 상황이 표시됩니다.

## 주요 기능

- 시간순 Write/Edit/명령 카드, 간결한 Read/Grep/Glob 표시
- 구문 강조, diff 추가·삭제 색상과 제공된 줄 번호
- 수신 코드를 글자 단위로 보여주는 타이핑 효과와 커서
- 코드 펼치기·복사와 TODO 진행 트리
- 과거 내역을 볼 때 하단 중앙에 나타나는 복귀 버튼
- Cascadia Code/D2Coding 글꼴, 좁은 패널 대응, Codex 앱 테마 색상 자동 반영
- 한 번 설정한 뒤 기존 Codex 아이콘으로 자동 연결
- 실행 시 설치된 Codex 구성 요소 재탐색

코드는 수신 순서대로 표시됩니다. 도구에 따라 부분 갱신 또는 준비된 입력이 전달됩니다.

## 설치

Windows, 설치·로그인된 Codex 앱, Node.js 22 이상, npm이 필요합니다.

```powershell
git clone https://github.com/leeworm/codex-live-viewer.git
cd codex-live-viewer
npm ci
npm run verify
npm run build
```

1. 생성된 `dist/codex-live-viewer-0.5.4`의 `Enable-Auto.cmd`를 실행합니다.
2. 작업을 저장하고 Codex를 정상 종료한 뒤 기존 아이콘으로 다시 실행합니다.
3. 파일 작성·수정을 요청하면 Live Viewer가 자동으로 열립니다.

설치기는 검증된 파일을 사용자 AppData에 복사하고 `CODEX_CLI_PATH`를 등록합니다. 이전 설정을 보존하며 관계없는 CLI 설정을 덮어쓰지 않습니다. 실행 중인 앱을 강제 종료하지 않습니다. 이전 연결로 복구하려면 설치 폴더의 `Disable-Auto.cmd`를 실행합니다.

위로 스크롤하면 자동 스크롤이 멈춥니다. 하단 중앙의 복귀 버튼을 누르거나 맨 아래로 내려가면 최신 작업을 따라갑니다.

배경·글자·강조·diff 색상은 Codex 앱 테마를 따릅니다. 앱의 테마 설정을 바꾸면 열린 뷰어에도 반영됩니다.

이미 있는 빌드는 보존합니다. 다른 폴더에 빌드하려면 다음처럼 실행합니다.

```powershell
npm run build -- --output "C:\builds\codex-live-viewer-next"
```

## 개발 및 검증

```powershell
npm run verify
npm run verify:ui
```

`verify`는 타입과 단위 테스트를, `verify:ui`는 로컬 이벤트를 이용해 렌더링과 조작을 검사합니다. 화면 검사 결과는 `artifacts/`에 저장됩니다.

빌드에는 production 의존성의 라이선스 고지가 포함됩니다.

## 동작 구조와 범위

Windows 실행 연결기 → 설치된 원본 CLI → 기존 app-server 스트림 관찰 → host/thread/turn/call 소유권 검증 → 기본 앱 도구의 패널 열기 → localhost HTTP/SSE 표시 순서로 동작합니다. 앱 실행 파일은 패치하지 않습니다.

이 Windows 호스트의 로컬 실행을 지원합니다. 원격·서비스 전용 실행은 검증 범위 밖입니다. 앞으로 앱의 CLI 연결 설정이나 기본 패널 도구 계약이 변경되면 호환성 수정이 필요할 수 있습니다.

자세한 지원 항목은 [표시 동작 안내](docs/rendering-contract.ko.md)를 참고하세요.

## 출처

렌더링 구성과 색상은 [claude-code-live-viewer](https://github.com/moneycode11101-svg/claude-code-live-viewer)를 참고했습니다. 해당 프로젝트가 명시한 oh-my-pi를 포함한 전체 MIT 고지는 [reference-NOTICE.txt](codex-panel/native/reference-NOTICE.txt)에 보존했습니다. 공통 비밀정보 마스킹 코드는 Chat On Steroids에서 가져왔으며 기존 MIT 라이선스를 유지합니다.

독립적인 로컬 연동 프로젝트입니다.
