<p align="center"><img src="packages/ui/public/icon.svg" width="88" alt="" /></p>

<h1 align="center">Discord Status Studio</h1>

<p align="center">디스코드 프로필에 표시되는 상태(Rich Presence)를 직접 디자인하고,<br/>앱이 백그라운드에서 계속 유지해주는 프로그램.</p>

<p align="center">
  <b>🪟 Windows 트레이 앱</b> · <b>🐧 Linux 서버 + 웹 대시보드</b> · 🤖 AI 자동 꾸미기 (OpenRouter)
</p>

---

## 구성

| | 🪟 **Windows 앱** (`apps/windows`) | 🐧 **Linux 서버** (`apps/server`) |
|---|---|---|
| 형태 | Electron 트레이 상주 앱 | 헤드리스 서버 + 웹 대시보드 + CLI |
| 제어 | 앱 창 · 트레이 메뉴 · 전역 단축키 | **웹사이트 (휴대폰 OK)** · REST API · `discord-status` CLI |
| Discord 연결 | 로컬 Discord 앱 (RPC) | 로컬 RPC / 봇 토큰 / 사용자 토큰 (게이트웨이) |
| 자동 규칙 | PC 프로그램 · 창 제목 · 자리비움 · 시간 | 서버 프로세스 · **PC 에이전트 보고** · 시간 |
| 실행 | PC 시작 시 자동 실행, 창 닫아도 트레이 유지 | systemd / Docker, PC를 꺼도 유지 |

두 앱은 같은 엔진(`packages/core`)과 같은 UI(`packages/ui`)를 공유합니다.

## ✨ 기능

### 🎨 에디터 & 미리보기
- **실시간 Discord 미리보기** — 프로필 팝업 + 멤버 목록 모양 그대로, 타이머까지 움직임
- NAME / DETAILS / STATE / 큰·작은 이미지 / 툴팁 / 버튼 2개 / 파티 인원 / 활동 종류(Playing·Listening·Watching·Competing)
- **이모지 = 이미지**: `⚡`만 넣으면 자동으로 Twemoji 이미지가 됨 (URL·에셋 키·GIF도 가능)
- **서버 이미지 호스팅**: 웹 대시보드에서 이미지 업로드 → 서버가 공개 URL로 호스팅
- 멤버 목록에 NAME / DETAILS / STATE 중 무엇을 보여줄지 선택
- 타임스탬프 6종: 경과 · 앱 시작부터 · **카운트다운** · **현재 시각처럼** · 특정 시각부터 · 없음
- 글자 수 카운터, "입력할 때마다 Discord에 바로 반영" 모드

### 🪄 AI 자동 꾸미기 (OpenRouter)
- `게임 좋아하고 개발하는 사람 느낌으로 만들어줘` → NAME·DETAILS·STATE·이미지·버튼까지 4가지 변형 생성
- `Minecraft 서버 개발 중 mc.krl.kr` → `⛏️ Minecraft Development` / `Building my server` / `mc.krl.kr` + 버튼
- **"✨ Make it aesthetic"** — 의미는 유지하고 스타일만 계속 바꿈 (이전 결과는 피함)
- API 키가 없어도 동작하는 **오프라인 생성기** (한국어/영어 키워드 25+ 주제 인식)

### 💅 예쁜 문자열
16가지 스타일을 원클릭으로: 클래식 · 대문자 · `┌─ 트리` · 𝐁𝐨𝐥𝐝 · ✦ sparkle ✦ · 【 괄호 】 · `> terminal_` · ꜱᴍᴀʟʟ ᴄᴀᴘꜱ · 𝚖𝚘𝚗𝚘 · S P A C E D · 𝒮𝒸𝓇𝒾𝓅𝓉 · 𝔻𝕠𝕦𝕓𝕝𝕖 … + 🎲 다른 스타일

### ✨ 원클릭 테마 (22종)
🖥️ Developer · 🎮 Gamer · 🌙 Minimal · 💎 Premium · 🌐 Web Developer · 🎵 Music · 📚 Study · 🧊 Glass · 🖤 Dark · 🍎 Apple · 🤖 AI · 🔥 Cyber · 💤 AFK · 😴 Sleeping · 💼 Work · 📺 Streamer · 🎨 Designer · 🎬 Video Editor · 💪 Workout · 🌸 Anime · ☕ Lo-fi · 🌃 Late Night

### 🤖 상태 자동 변경
- **프로그램 감지**: `Code.exe`, `chrome`, `Ableton*`(와일드카드), `title:Minecraft*`(창 제목) — 쉼표로 여러 개
- **빠른 추가 33종**: VS Code, Cursor, JetBrains, Chrome, Minecraft, Spotify, After Effects, Premiere, Photoshop, Figma, Blender, OBS, VALORANT, 롤, 오버워치, 로블록스, 원신, 배그, 메이플, osu!, Unity, Unreal, Notion, Obsidian, FL Studio …
- **시간표**: `09:00~16:00 📚 Studying`, `22:00~02:00 🌙 Late night`(자정 넘김 지원), 요일 선택
- **자리비움**: N분 동안 입력이 없으면 AFK 상태
- 위에서부터 우선 적용, 규칙 순서 변경, 지금 매칭된 규칙 하이라이트
- **실행 중인 프로그램 목록**에서 바로 규칙 만들기

### 🧩 라이브 변수
`{song}` `{artist}` (Spotify) · `{file}` `{project}` (VS Code/Cursor) · `{time}` `{date}` `{weekday}` `{greeting}` · `{cpu}` `{mem}` `{uptime}` · `{app}` · `{random:a|b|c}` · `{song|기본값}`
→ 예: `🎵 {song|Listening to Spotify}` / `by {artist}`

### 📚 Status Library
- 저장 · ⭐ 즐겨찾기 · 검색 · 순서 변경 · 복제 · 사용 횟수
- **공유 코드** (`DSS1.…`)로 친구와 상태 주고받기
- JSON 내보내기/가져오기 (Windows ↔ 서버 이동)
- **🔁 자동 순환 모드**: 여러 상태를 N초/분마다 번갈아 표시

### ⏱️ 타이머 & 임시 상태
🍅 Focus 25분 · 📚 공부 50분 · ☕ 휴식 · 🚶 BRB · 🍜 식사 · 📹 회의 · 🎮 한 판만 · 😴 낮잠 — Discord에 남은 시간이 표시되고 끝나면 원래 상태로 자동 복귀

### 📊 통계 & 기록
오늘 상태별 표시 시간, 변경 횟수, 변경 기록

### 🪟 Windows 전용
- 창을 닫아도 **트레이에 상주** (🟢 실행 중 / 🎨 현재 상태 / ⏸ 일시정지 / 🔄 상태 변경 / 🧭 모드 / ⏱ 타이머 / ⚙ 설정)
- **PC 시작 시 자동 실행**, 트레이로 조용히 시작
- **전역 단축키**: `Ctrl+Alt+→/←` 즐겨찾기 전환 · `Ctrl+Alt+1~9` 즐겨찾기 적용 · `Ctrl+Alt+P` 일시정지 · `Ctrl+Alt+S` 창 열기
- 절전 해제 시 자동 재연결, 앱 프로필(여러 Application ID로 NAME 바꾸기)
- **원격 에이전트**: PC의 실행 프로그램을 Linux 서버로 보고 → 서버 규칙이 PC 활동에 반응

### 🐧 Linux 서버 전용
- **웹 대시보드** (모바일 반응형, PWA) — 휴대폰에서 상태 변경
- 비밀번호 로그인 · API 토큰 · 로그인 시도 제한 · CSRF 방어
- **REST API** (`/api/quick`) — iPhone 단축어, 자동화, 스크립트에서 상태 변경
- **공개 상태 API + SVG 배지** (`/badge.svg`) — GitHub README에 내 상태 표시
- 실시간 업데이트 (Server-Sent Events), systemd 서비스, Docker

---

## 🪟 Windows 앱

### 설치
[Releases](../../releases)에서 `Discord Status Studio Setup x.x.x.exe`(설치형) 또는 `…-portable.exe`를 받으세요.

### 직접 빌드
```bash
cd apps/windows
npm install
npm start          # 개발 실행
npm run dist       # 설치 파일 생성 → apps/windows/dist/
```

### 처음 설정
1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** — 앱 이름이 프로필의 "Playing ○○"가 됩니다 (예: `Coding Mode`)
2. **APPLICATION ID** 복사 → 앱 ⚙️ 설정에 붙여넣기 → 저장
3. Discord 데스크톱 앱이 실행 중이면 🟢 연결됨 표시 → 에디터에서 꾸미고 **✅ Discord에 적용**
4. (선택) ⚙️ 설정 → [OpenRouter API 키](https://openrouter.ai/keys)와 모델을 넣으면 AI가 상태를 만들어 줍니다

> NAME을 여러 개 쓰고 싶다면 이름별로 Discord 앱을 만들어 **앱 프로필**에 등록하세요.

---

## 🐧 Linux 서버

### 빠른 설치
```bash
git clone https://github.com/3289david/discord-status-studio.git
cd discord-status-studio
bash apps/server/deploy/install.sh            # discord-status 명령 설치
discord-status start -d                       # 백그라운드 실행 (초기 비밀번호 출력)
```
브라우저에서 `http://서버IP:8787` 접속 → 로그인.

부팅 시 자동 실행:
```bash
bash apps/server/deploy/install.sh --service
```

### Docker
```bash
STUDIO_PASSWORD=my-strong-password docker compose up -d
```

### HTTPS (권장)
`apps/server/deploy/nginx.conf.example` 참고 → `sudo certbot --nginx -d status.example.com`

### Discord 연결 방식 (⚙️ 설정)
| 방식 | 설명 |
|---|---|
| 🖥️ 로컬 Discord 앱 | 서버에 Discord 클라이언트가 떠 있어야 함 (데스크톱 Linux) |
| 🤖 봇 계정 | 봇 토큰으로 **봇의** 상태를 24시간 표시 — 약관상 안전 |
| 👤 사용자 토큰 | 내 계정 상태를 PC 없이 24시간 유지. ⚠️ **셀프봇은 Discord 약관 위반이며 계정 정지 위험**이 있습니다. 본인 책임 하에 사용하세요 |
| ⛔ 끄기 + Windows 원격 에이전트 | 서버는 규칙/웹 제어만, 실제 표시는 PC가 담당 |

### CLI
```text
discord-status start [-d] [--port 8787]   서버 시작
discord-status stop | restart | status | logs -f
discord-status set "Minecraft 서버 개발 중"  자유 입력 → 자동 꾸미기 → 적용
discord-status use <저장된 상태>          discord-status theme gamer
discord-status list | themes | next
discord-status mode auto                  discord-status timer 25 Focus
discord-status pause | resume
discord-status passwd                     discord-status token create iphone
discord-status install-service [--user]
```

### REST API
모든 요청: `Authorization: Bearer <API 토큰>` (⚙️ 설정 → API 토큰 또는 `discord-status token create`)
```bash
# 자유 입력으로 상태 변경
curl -X POST https://status.example.com/api/quick -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"text":"새벽 코딩"}'

# 그 밖에: {"theme":"gamer"} {"statusId":"…"} {"mode":"auto"} {"timer":25,"label":"Focus"} {"pause":true}
curl https://status.example.com/api/status -H "Authorization: Bearer $TOKEN"
```
공개 상태를 켜면(설정): `GET /api/public/status` (JSON), `GET /badge.svg` (README 배지)

### Windows + 서버 함께 쓰기
1. 서버 ⚙️ 설정 → API 토큰 발급
2. Windows 앱 ⚙️ 설정 → 원격 에이전트: 서버 주소 + 토큰, "서버로 활동 보고" 켜기
3. 서버에서 자동 모드 + 프로그램 규칙 → PC에서 VS Code를 켜면 서버가 `⌨️ Coding`으로 변경, PC를 끄면 서버 기본 상태 유지

---

## 🛠 개발

```text
packages/core     공유 엔진 — presence 변환, Discord IPC/게이트웨이, 규칙, 템플릿, 테마, 미학 생성기, OpenRouter AI
packages/ui       공유 웹 UI — Electron(IPC)과 서버(HTTP+SSE) 모두에서 동작
apps/windows      Electron 트레이 앱
apps/server       Node HTTP 서버 + CLI + 배포 파일
scripts/          sync-shared(공유 코드 복사), make-icons(아이콘 생성)
```
```bash
npm install --prefix packages/core
npm test                    # 코어 단위 테스트
```
데이터 위치 — Windows: `%APPDATA%\Discord Status Studio\data.json` · Linux: `~/.config/discord-status-studio/` (`DSS_DATA_DIR`로 변경)

AI 기능은 [OpenRouter](https://openrouter.ai/)를 사용합니다 — 설정에서 원하는 모델(기본 `openrouter/auto`)을 고를 수 있고, 서버는 `OPENROUTER_API_KEY` 환경변수도 지원합니다. 구조화 출력을 지원하지 않는 모델은 JSON 프롬프트로 자동 재시도하며, 키가 없거나 오류가 나면 오프라인 생성기로 자동 전환됩니다.

## 라이선스
MIT. Discord는 Discord Inc.의 상표이며 이 프로젝트는 Discord와 관련이 없습니다.
