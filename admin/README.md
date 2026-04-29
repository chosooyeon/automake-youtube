# automake-youtube · 관리자 대시보드

로컬 전용 Next.js 14 대시보드. 6단계 봇 파이프라인을 버튼 클릭으로 돌리고,
final.mp4 업로드와 API 토큰 상태를 한눈에 본다.

```
http://localhost:3000
```

> 외부에 배포하지 마세요. `.env`, OAuth 토큰, ffmpeg, CapCut 폴더에 직접 접근합니다.

---

## 1. 처음 한 번만

```bash
cd admin
npm install
```

루트 `.env` (`automake-youtube/.env`)는 자동으로 읽습니다. 별도 `.env.local` 안 만들어도 됨.

필요한 것:
- `YOUTUBE_CLIENT_SECRET_PATH` — Google OAuth 클라이언트 JSON
- `YOUTUBE_OAUTH_TOKEN_PATH` — 첫 업로드 시 자동 생성됨
- `GEMINI_API_KEY` — 이미지 키 검증용

(없어도 대시보드는 뜹니다. API 상태 카드에 빨간 표시만 뜸)

### Claude Code CLI 설치 (실제 봇 실행에 필요)

```bash
curl -fsSL https://claude.ai/install.sh | bash
# 새 터미널 열고
cd /Users/chosooyeon/Documents/automake-youtube
claude   # 첫 실행 → 브라우저 OAuth 로그인 (Pro/Max 계정 필요)
```

미설치/미로그인이어도 대시보드는 뜹니다 — API 상태 카드에서 알려줍니다.

---

## 2. 띄우기

```bash
cd admin
npm run dev
```

브라우저: <http://localhost:3000>

---

## 3. 화면 구성

```
┌────────────── 헤더 ──────────────┐
│ + 새 프로젝트   [ slug ▼ ]                          │
├──────────── 좌 (2/3 폭) ──────────┬─ 우 (1/3 폭) ─┤
│ 파이프라인 6장 카드 + 풀실행 버튼   │ API 상태 카드 │
│ 빠른 액션 (브리프/키워드/폴더…)    │ 채널 KPI      │
│ 썸네일 갤러리                       │ 업로드 가이드  │
│ 실행 로그 (라이브, 2초 폴링)        │              │
└─────────────────────────────────┴──────────────┘
```

### 들어있는 10가지 기능

| # | 기능 | 어디서 |
|---|---|---|
| 1 | 새 프로젝트 만들기 (`_example` 복사) | 헤더의 [+ 새 프로젝트] |
| 2 | 봇별 [실행]/[재실행] | 6장 카드 |
| 3 | 풀 파이프라인 (5번까지) | 파이프라인 상단 버튼 |
| 4 | 6번 = 업로드 (2단계 컨펌, "업로드" 입력) | 06 카드 또는 빠른액션 |
| 5 | API 상태 (YouTube/Gemini/Claude) + 토큰 부족 토스트 | 우측 상단 카드 |
| 6 | 라이브 로그 스트림 | 좌측 하단 |
| 7 | 썸네일 5장 갤러리 | 좌측 중간 |
| 8 | CapCut/edit/project 폴더 열기 | 빠른 액션 |
| 9 | 채널 KPI (구독자, 7일 업로드 수, 최근 영상) | 우측 |
| 10 | 벤치마크 키워드 빠른 갱신 | 빠른 액션 |
| (+) | brief.md 인라인 편집 | 빠른 액션 |

---

## 4. 봇 실행이 어떻게 되나?

[실행] 버튼을 누르면 서버가 다음을 실행합니다.

```bash
claude -p "AGENTS.md ... 를 읽고 projects/<slug>/<stage> 봇을 실행해줘. ..."
```

(이 레포의 `AGENTS.md` + `bots/<stage>/prompt.md` + `config.json` 을 그대로 따름)

표준출력은 `projects/<slug>/<stage>/run.log.md` 로 append되고,
대시보드 로그 카드가 2초마다 폴링하여 보여줍니다.

> **Claude Code CLI가 설치돼 있어야 [실행] 버튼이 동작합니다.**
> 미설치 시 API 상태 카드의 "Claude Code (CLI)" 가 빨간색으로 표시됩니다.

---

## 5. 업로드 모달

`06-edit-upload/upload_to_youtube.mjs` 를 그대로 호출합니다 (`googleapis` 사용).

- `final.mp4` 와 `upload_metadata.json` 둘 다 있어야 활성화
- "업로드" 텍스트를 정확히 입력해야 버튼 활성화
- `DRY-RUN` 버튼으로 호출 없이 로그만 확인 가능
- 실제 첫 업로드 시 OAuth 동의 창이 열립니다 (`http://localhost:43210` 콜백)

---

## 6. 트러블슈팅

| 증상 | 확인 |
|---|---|
| 빨간 "claude CLI 미설치" 토스트 | `which claude` 후 PATH 확인. 새 터미널 열기. |
| YouTube "토큰 만료" 빨간 표시 | `rm <YOUTUBE_OAUTH_TOKEN_PATH>` 후 다음 업로드 시 재인증 |
| Gemini 노란 "429 quota" | 무료 quota 초과. 하루 기다리거나 결제 등록 |
| 봇이 즉시 끝나고 로그가 비어있음 | 보통 Pro 메시지 한도 도달. 5시간 윈도우 후 재시도 |
| 업로드 모달이 final.mp4 못 찾음 | CapCut 익스포트 → `projects/<slug>/06-edit-upload/final.mp4` 로 직접 복사 |
| 새 프로젝트 만들기 실패 (`_example 없음`) | 루트의 `projects/_example/` 폴더 확인 |

---

## 7. 확장 아이디어 (지금은 안 만들어둠)

- 5번 → 6번 휴먼 게이트 시 푸시 알림 (Slack/macOS notify)
- KPI를 Analytics API로 확장 (수익/RPM/CTR)
- 업로드 스케줄러 (정해진 요일 시간에 자동 업로드)
- Vercel + 로컬 워커 모드 (외출 중 폰으로 트리거)
