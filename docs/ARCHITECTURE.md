# 상세 지도

`CLAUDE.md` 로 부족할 때만 여는 파일. 여기까지 읽으면 저장소를 탐색할 필요가 없어야 한다.

## 1. 누가 무엇을 실행하나

```
사람 ─┬─ admin 대시보드(:3000) 버튼 ─┬─ runBot.ts → spawn("claude", ["-p", ...])  → 봇 실행
      │                              ├─ instagram/blog/emoticon API → spawn("claude") + Gemini 이미지
      │                              └─ upload/build API → node scripts/*.mjs
      ├─ 터미널 scripts/run-bot.sh ──── 같은 headless claude 호출 (대시보드 없이)
      └─ Claude Code 대화 ──────────── "<slug> 03번 실행" 같은 자연어 지시
```

세 경로 모두 **결국 `bots/{stage}/prompt.md` + `config.json` 을 따른다.** 봇 동작을 바꾸려면
코드가 아니라 prompt.md 를 고친다.

## 2. 디렉터리

| 경로 | 내용 |
|------|------|
| `bots/{stage}/` | `prompt.md`(지시문·두뇌), `config.json`(모델티어·파라미터), 일부 `README.md` |
| `config/global.json` | 채널·브랜드·영상기본값·API·휴먼게이트 + `active_niche` / `niches.*` |
| `config/pipeline.json` | 단계 순서·의존성·입출력 선언. `step_by_step_only: true` (풀 자동실행 비활성) |
| `config/channels.json` | 채널 목록 |
| `shared/schemas/` | 단계별 입출력 JSON 스키마 (계약서) |
| `shared/templates/` | 썸네일·CapCut 베이스 |
| `shared/fonts/` | Pretendard (카드/자막 렌더용) |
| `shared/references/` | 니치별 리서치 자료 (예: `psychology/`) |
| `projects/{slug}/` | 영상/카드뉴스 1건 = 폴더 1개. `_example`, `_example-short` 이 템플릿 |
| `topics/queue/`, `topics/archive/` | 00-topic 봇이 뽑은 주제 후보 → promote 하면 archive 로 이동 |
| `scripts/` | 렌더·업로드·봇 실행 wrapper (아래 3절) |
| `tools/ffmpeg` | libass 포함 정적 빌드 ffmpeg (시스템 설치 불필요) |
| `admin/` | Next.js 14 App Router 로컬 대시보드 |
| `cinema/` | 시나리오(cinema) 트랙 프로젝트 저장소 |
| `.cache/news/` | RSS 수집 캐시 (30분 TTL) |

## 3. scripts/

| 파일 | 역할 |
|---|---|
| `run-bot.sh` | 봇 1개 headless 실행. `scripts/lib/resolve-model.sh` 로 모델 티어 해석 |
| `run-topic.sh` | 00-topic 실행 (`--niche` 지정 가능) |
| `build-video.mjs` | 롱폼: 이미지 + TTS + ffmpeg → 영상 |
| `render-shorts.mjs` | 숏폼 9:16 렌더 (이미지 슬라이드쇼 + 음성 + 자막 burn-in) |
| `upload_shorts.mjs` | 숏폼 업로드 |
| `init-youtube-auth.mjs` | YouTube OAuth 최초 인증 (`localhost:43210` 콜백) |
| `to-capcut.mjs` | CapCut 프로젝트로 내보내기 |

## 4. 트랙별 데이터 흐름

### 롱폼 (봇 00~06)
```
00-topic → topics/queue/*.json ─(promote)→ projects/{slug}/00-input/brief.md
01-benchmark → 02-strategy → 03-script → 04-audio → 05-visual → [사람 검수] → 06-edit-upload
각 단계: projects/{slug}/{stage}/output.json (+ run.log.md)
최종: 06-edit-upload/final.mp4, thumbnails/thumb-1~5.png, upload_metadata.json
```

### 숏폼 (봇 S1~S4)
부모 롱폼의 `03-script/output.json` 과 `05-visual/scenes/` 이미지를 재사용한다.
프로젝트 폴더는 `00-input/shorts_meta.json` 에 `parent_slug` 를 갖는다.
**봇 디렉터리(`bots/S1-shorts-script`)와 산출물 디렉터리(`S1-script`) 이름이 다르다** —
매핑은 `admin/lib/paths.ts` 의 `SHORTS_STAGES` 가 원본.
S3 는 macOS 내장 `say -v Yuna` 로 음성을 만들고 `tools/ffmpeg` 로 합성 → `S3-edit/short.mp4`.
(롱폼 `scripts/build-video.mjs` 는 msedge-tts 사용, 기본 보이스 `ko-KR-SunHiNeural` — 서로 다른 TTS다.)

### 인스타 카드뉴스 (봇 아님 — admin API가 처리)
```
NewsFeedPanel → /api/news/collect (RSS, lib/news/*) → 기사 선택
InstagramCardGenerator → /api/instagram/generate
   ├ spawn("claude") → 카드 문안 JSON (cards/caption/hashtags/verify_items) — 출처 검증 강제
   ├ lib/geminiImage.ts → 배경 이미지 생성
   └ lib/instagram/overlay.ts (@napi-rs/canvas + Pretendard) → 카드 PNG 합성
→ projects/{slug}/instagram-cards/{output.json, caption.txt, cards/card-NN.png}
카드 1장만 다시: /api/instagram/regenerate-card · 전체 내려받기: /api/instagram/download-zip
```
카테고리·레이아웃 정의는 `lib/instagram/categories.ts`, `card-layouts.ts`, 프롬프트는 `prompt.ts`.

### 블로그
`/api/blog/generate` 가 카테고리 가이드(라우트 안 `CATEGORY_GUIDE`)와
`admin/data/blog_style.md`(작성자 문체 시그니처)를 합쳐 `claude` 를 호출한다.
**파일로 저장하지 않고 응답으로 돌려준다** (진행률은 `BlogProgressBar` / `BlogJobContext`).

### 이모티콘
`lib/emoticonStore.ts` 가 `admin/data/emoticons/emj_*/` 에 프로젝트를 보관.
`concept → expressions → generate(장당) → export(zip)` 순서. 마켓 규격은 `emoticonMarkets.ts`.

### 시나리오 (cinema)
`lib/cinema.ts` 가 `cinema/{slug}/project.json` 하나로 캐릭터·씬·OST 를 관리.
`length_type`: `shorts` / `short_film` / `series_pilot`.

### 주식 매매 알림 (콘텐츠 트랙 아님 — admin API가 처리)
```
관심종목(admin/data/stock/watchlist.json)
  → naver.ts   네이버 금융에서 일봉 200일 + 실시간 시세
  → indicators.ts  RSI(14)·SMA(5/20/60)·MACD(12,26,9)·볼린저(20,2σ)
  → signals.ts     신호별 weight 합산 → STRONG_BUY~STRONG_SELL 판정
  → scan.ts        중복 판정(fingerprint) 통과한 것만 텔레그램 발송
```
- 판정은 **확정된 일봉**만 쓴다 (장중 리페인팅 방지). 실시간가는 표시용.
- 신호 `kind`: `primary`(매매 포인트) / `context`(추세 배경). context 만으로는 알림이 나가지 않는다.
- 발송 이력은 `config/stock-alert-state.json` 의 fingerprint(`판정|신호id들`)로 관리 —
  날짜가 바뀌어도 신호 구성이 같으면 재발송하지 않는다.
- **파일이 두 군데인 이유**: 맥이 꺼져 있어도 알림이 가도록 GitHub Actions 가 스캔하는데,
  러너는 커밋된 파일만 본다. `config/stock-{watchlist,alert-state}.json` 은 커밋되고,
  봇 토큰(`admin/data/stock/telegram.json`)만 git 제외 + CI 에선 Secrets 로 주입.
- **발송 주체는 깃허브 하나뿐이다.** admin 화면의 스캔은 `notify` 없이 부르므로 조회만 한다
  (손으로 보내는 [🔔 지금 알림 보내기] 버튼만 `?notify=1`). 화면에서도 자동 발송하면
  알림 이력 파일이 맥과 깃허브에 따로 쌓여 같은 신호가 두 번 간다.
- 상시 가동: `.github/workflows/stock-alert.yml` (평일 15:50 KST / 06:30 KST).
  `scripts/stock-scan-ci.ts` 를 tsx 로 직접 실행 — admin 서버도 `npm ci` 도 필요 없다
  (판정 로직이 node 내장 모듈만 쓰기 때문). 알림 이력은 러너가 커밋해 되돌려놓는다.
- 데이터 소스가 네이버인 이유: Yahoo Finance 는 429, Stooq 는 JS 챌린지로 막힌다 (2026-08 확인).

### 데일리 퀘스트 (콘텐츠 트랙 아님 — 실행 관리)
```
config/quest-tasks.json   퀘스트 정의 (이름·트랙·반복요일·mini·startDate·archivedDate)
config/quest-log.json     완료 기록  date → taskId → { at, mini? }
config/quest-season.json  시즌 (이름·시작일·주수)
  → lib/questStore.ts  파일 입출력 (서버 전용)
  → lib/quest.ts       타입 + 순수 집계 함수 (클라이언트에서도 import)
  → components/QuestBoard.tsx / QuestCharts.tsx
```
- `/api/quest` GET 한 번으로 정의+기록을 통째로 내려주고 **집계는 전부 클라이언트**.
  1년치가 수백 KB 라, 일/월/년 뷰를 오갈 때마다 서버를 왕복하는 것보다 빠르다.
- **미완료는 기록하지 않는다.** 로그엔 완료한 것만 남고, 분모(예정)는 정의에서 매번 다시 계산한다.
  그래서 퀘스트에 `startDate`/`archivedDate` 가 있다 — 오늘 만든 퀘스트 때문에
  지난 1월이 통째로 "미달성"으로 물드는 걸 막는다. 삭제 대신 **보관**을 쓰면 과거 통계가 보존된다.
- 달성률 분모는 `clampToToday()` 로 오늘까지만 센다 (안 온 날을 넣으면 연간 달성률이 늘 처참하게 나온다).
- 스트릭은 예정이 없는 날(쉬는 날)을 건너뛰고, 오늘은 미완이어도 끊지 않는다.
- **미니 퀘스트(`Quest.mini`)**: 컨디션 나쁜 날 최소 버전만 해도 완료로 친다.
  `QuestCheck = { at, mini? }` 로 기록하고 달성률·스트릭에는 **똑같이 완료로 센다** — 0인 날을 안 만드는 게 목적이다.
  통계에서만 `miniDone` 으로 따로 보여준다. 이 동등성을 깨면 기능의 존재 이유가 사라진다.
  (초기 버전은 로그 값이 ISO 문자열이었다. `normalizeCheck()` 가 읽는 쪽에서 흡수한다.)
- **코치 배너(`coachMessage`)**: 오늘 날짜를 볼 때만 뜬다. 원칙은 *못 한 걸 지적하지 않고 다음 한 걸음만 제시*.
  하루 놓치면 "이틀 연속만 아니면 된다", **일주일 넘게 비면 일수를 말하지 않는다**(큰 숫자는 격려가 아니라 처벌).
- **시즌(`config/quest-season.json`)**: 12주 단위. 진행바에 중간 지점 눈금이 있고,
  중간 주차에만 점검 안내가 뜬다 — 12주는 길어서 여기쯤 한 번 꺾이기 때문.
- 차트는 외부 라이브러리 없이 SVG/CSS. 색은 `globals.css` 의 `--c-series-1..8`(트랙 식별)과
  `--c-heat-0..4`(달성률 램프). **series 순서 자체가 색약 안전장치**라 순서를 섞거나 중간에 끼워넣지 말 것
  (인접쌍 CVD ΔE 9.1 light / 8.4 dark 로 검증됨). 9번째 계열이 필요하면 "기타" 로 접는다.

### 아이디어 파킹판 (퀘스트 탭의 서브뷰)
```
config/ideas.json  → lib/ideaStore.ts (파일 IO) → lib/idea.ts (타입·집계)
                   → components/IdeaBoard.tsx
```
- 카테고리 6개(콘텐츠/자동화/제품/수익화/브랜드/알아볼것) × 상태 5개(파킹·시즌후보·진행중·완료·보류).
- **이 화면의 목적은 아이디어 관리가 아니라 착수 억제다.** 새 갈래가 떠오르면 시작하는 대신
  파킹하고 시즌이 끝날 때만 꺼낸다. 그래서 시즌 후보에 상한(`SHORTLIST_MAX = 3`)이 있고,
  넘치면 화면이 경고색으로 바뀐다. 이 상한을 늘리는 방향의 수정은 도구의 목적을 무너뜨린다.
- 카테고리 색도 `--c-series-*`. 항상 이모지+이름을 같이 달아 색만으로 구분하지 않는다.

## 5. admin 상세

- 진입: `app/page.tsx` → `components/Dashboard.tsx` (탭 셸)
- 탭: 데일리 퀘스트(`QuestBoard`, 기본 탭) · 유튜브(`YoutubeWorkspace` 안에 롱폼/주제큐/숏폼) ·
  블로그(`BlogGenerator`) · 이모티콘(`EmoticonStudio`) · 인스타(`InstagramCardGenerator`) · 시나리오(`CinemaStudio`) ·
  주식(`StockAlertDashboard` + `TelegramSetupCard`) · 클로드 대화(`ChatPanel`)
- 니치 전환: `NicheSelector` → `/api/system/niche` → `lib/niche.ts`

### API 라우트 (`admin/app/api/`)
| 그룹 | 라우트 | 용도 |
|---|---|---|
| projects | `/projects`, `/projects/[slug]/{status,run,logs,brief,file,open,thumbnails,upload,upload-meta,build-video,build-status}` | 롱폼 파이프라인 조작 |
| shorts | `/shorts`, `/shorts/create`, `/shorts/[slug]/{status,run,logs}` | 숏폼 |
| topics | `/topics`, `/topics/run`, `/topics/manual`, `/topics/[id]/{promote,log}` | 주제 큐 (promote = 프로젝트 생성) |
| instagram | `/instagram/{generate,regenerate-card,download-zip}` | 카드뉴스 |
| news | `/news/collect` | RSS 수집 (캐시 30분) |
| blog | `/blog/generate` | 블로그 초안 |
| emoticon | `/emoticon/{projects,concept,expressions,generate,batch/[id],export/[id],image/...}` | 이모티콘 |
| cinema | `/cinema/projects`, `/cinema/projects/[slug]{,/generate}` | 시나리오 |
| quest | `/quest`(GET 전체), `/quest/tasks`(POST·PATCH·DELETE), `/quest/check`(POST 토글·mini), `/quest/season`(PATCH) | 데일리 퀘스트 |
| ideas | `/ideas` (GET·POST·PATCH·DELETE) | 아이디어 파킹판 |
| stock | `/stock/{search,watchlist,scan,telegram}` | 관심종목 검색·CRUD, 신호 스캔(`?notify=1`), 텔레그램 연결 |
| system | `/system/{api-status,channels,keywords,kpi,niche}` | 상태·설정 |

### lib
| 파일 | 역할 |
|---|---|
| `paths.ts` | **모든 경로/스테이지 상수의 원본**. 경로를 새로 조립하지 말고 여기 함수를 쓴다 |
| `runBot.ts` | 모델 티어 매핑 + headless `claude -p` 실행 + run.log.md append |
| `projects.ts` | 프로젝트 목록·단계 상태(`output.json` 유무로 판정)·`_example` 복사 |
| `pipeline.ts` | pipeline.json 로더 |
| `niche.ts` | `active_niche` 를 global.json 에 deep-merge, 프로젝트에 channel_config 스냅샷 |
| `topics.ts` | 큐/아카이브 읽기, brief.md 생성, promote |
| `apiHealth.ts` | YouTube OAuth / Gemini / claude CLI 상태 점검 |
| `geminiImage.ts` | Gemini 이미지 생성 공통 래퍼 |
| `env.ts` | 루트 `.env` 로더 (시스템 env 우선) |
| `stock/*` | `naver`(데이터) → `indicators`(지표) → `signals`(판정) → `scan`(알림). `store`=watchlist/설정, `telegram`=발송 |
| `instagram/*`, `news/*`, `emoticon*` | 각 트랙 전용 (4절 참고) |

## 6. 설정·니치

`config/global.json` 의 `niches.{id}` 가 base 설정을 **deep-merge** 로 덮어쓴다 (`active_niche` 로 선택).
니치를 바꾸면 `lib/niche.ts` 가 프로젝트에 `00-input/channel_config.json` 스냅샷을 남기고,
**봇은 global.json 보다 이 스냅샷을 우선 읽는다** → 과거 프로젝트가 니치 변경에 영향받지 않는다.

## 6-1. 업로드 (YouTube 채널 2개 지원)

`runUploadScript()` (`admin/lib/runBot.ts`)가 처리한다.
- 롱폼: `projects/{slug}/06-edit-upload/upload_to_youtube.mjs` + `final.mp4`
- 숏폼: 공유 스크립트 `scripts/upload_shorts.mjs` + `S4-upload/final_short.mp4`
- 채널 2를 고르면 `YOUTUBE_OAUTH_TOKEN_PATH_2` 를 `YOUTUBE_OAUTH_TOKEN_PATH` 로 덮어써 spawn하고,
  `YOUTUBE_CHANNEL_ID_{1,2}` 를 `YOUTUBE_EXPECTED_CHANNEL_ID` 로 넘겨 잘못된 채널 업로드를 막는다.
  client_secret 은 두 채널이 공유.
- 로그: `{06-edit-upload|S4-upload}/upload.log.md`. DRY-RUN 이면 실제 호출 없이 로그만 남는다.

## 7. 외부 의존성

| 것 | 필요한 곳 | 비고 |
|---|---|---|
| `claude` CLI | 모든 봇 실행, 인스타/블로그 생성 | 미설치면 대시보드 API 상태 카드가 빨강 |
| `GEMINI_API_KEY` | 이미지 생성 (인스타·이모티콘) | |
| `YOUTUBE_CLIENT_SECRET_PATH` / `YOUTUBE_OAUTH_TOKEN_PATH` | 업로드 | 토큰은 첫 업로드 시 생성 |
| `tools/ffmpeg` | 렌더링 | 저장소 동봉, 시스템 ffmpeg 불필요 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 주식 알림 | 선택. 탭 UI로 설정하면 `admin/data/stock/telegram.json` 에 저장 |
| 네이버 금융 (비공식) | 주식 시세·일봉 | API 키 불필요. 비공식이라 스키마 변경 가능 |
| npm: `@napi-rs/canvas`, `sharp`, `googleapis`, `archiver`(admin) / `msedge-tts`, `googleapis`(루트) | | |

키는 루트 `.env` 에만 둔다 (`admin/.env.local` 불필요).

## 7-1. 작업 중 (2026-08-13 기준 미커밋)

문서 정리 시점에 아직 커밋되지 않은 신규 파일들. 완성되면 위 표에 편입할 것.
- `admin/app/api/chat/route.ts` + `admin/components/Markdown.tsx` — 대시보드 채팅
- ~~`admin/lib/stock/*`~~ — 주식 매매 알림 트랙. **완료** (4·5·7절에 편입됨)
- `admin/components/ThemeToggle.tsx` + globals.css/tailwind 수정 — 다크 테마

## 8. 함정 (실수하기 쉬운 곳)

1. **모델 티어가 두 곳에 하드코딩** — `admin/lib/runBot.ts` 의 `MODEL_TIERS` 와 `scripts/lib/resolve-model.sh`. 한쪽만 고치면 대시보드/터미널 결과가 갈린다.
2. **성공 판정은 종료코드가 아니라 `output.json` 존재** (`lib/projects.ts`). 로그만 남고 파일이 없으면 실패다.
3. **`run.log.md` 는 append 전용.** 덮어쓰면 이력이 날아간다.
4. **숏폼 디렉터리명 불일치** (`bots/S1-shorts-script` ↔ `projects/{slug}/S1-script`).
5. **풀 파이프라인 자동실행은 정책상 비활성** (`pipeline.json.step_by_step_only`). 한 번에 한 단계.
6. **블로그 결과는 파일이 아니다** — 저장하려면 사용자가 복사하거나 별도 구현이 필요.
7. `admin/` 은 로컬 전용. `.env`·OAuth 토큰·파일시스템에 직접 접근하므로 배포 금지.
