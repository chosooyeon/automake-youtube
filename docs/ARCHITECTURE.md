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

### 주식 자동매매 — 백테스트 (알림 트랙의 확장, 1단계만 구현)
```
config/stock-trading.json  정책 (원금·진입·청산·리스크·비용) + markets.{KR,US} 덮어쓰기
  → lib/stock/tradingConfig.ts  로더(공통값 위에 시장층) + 설정 모순 검사 + 규칙 비교표
       → app/api/stock/method/route.ts     두 시장 규칙 + 워크포워드 상태 서빙
       → components/MethodBoard.tsx        주식 탭 [📐 방법론] (다른 항목만 색으로)
  → lib/stock/backtest.ts       하루씩 시뮬레이션 → 성적표
  ← lib/stock/signals.ts        진입/청산 신호 (알림과 **같은 엔진**)
  ← lib/stock/indicators.ts     ATR 추가 (손절폭 산정)
  → scripts/backtest.ts         CLI 1회 실행 (cd admin && npx tsx ../scripts/backtest.ts)
  → scripts/backtest-sweep.ts   설정 × 종목군을 한 번에 → admin/data/stock/backtest/sweep-{market}.json
  ← config/stock-groups.json    자산군 분류 (지수ETF·커버드콜·금채권, 나머지는 '개별주' 자동)
       → app/api/stock/backtest/route.ts   그룹목록 / 그룹요약 / 매매내역 세 갈래로 서빙
       → components/BacktestBoard.tsx      주식 탭 [🧪 백테스트] 서브탭 (시장→종목군→설정 3단)
```
- **국내와 미국은 같은 규칙으로 굴지 않는다.** 국내 설정을 그대로 미국에 들고 갔더니
  PF 0.88 / -13.1% 로 돈을 잃었다(STOCK-TRADING 8-4). 그래서 설정이 2층이 됐고,
  **`loadTradingConfig(market)` 에 시장을 넘기지 않으면 공통값으로 돈다** — 그 상태가 바로
  미국을 국내 규칙으로 굴리는 상태다. CLI 셋(`backtest`·`backtest-sweep`·`walk-forward`)은
  전부 `--market` 을 그대로 로더에 넘긴다.
- **알림 엔진과의 차이**: `signals.ts` 는 "지금 살까"만 답한다. 백테스트는 여기에
  청산 규칙·포지션 크기·거래비용을 얹어 "그렇게 매매했으면 벌었나"를 답한다.
  이 셋이 없으면 신호가 좋아 보여도 돈을 버는지 알 수 없다.
- **판정 로직을 재구현하지 않고 `analyze()` 를 그대로 부른다.** 백테스트에서 검증한 규칙과
  실제로 나갈 주문이 갈라지면 검증이 무의미해지기 때문. 실매매(추후 `broker/*`)도 같은 설정을 읽는다.
- **미래 참조 방지가 이 엔진의 핵심 계약**: 신호는 `analyze(candles.slice(0, i))` 로 어제 종가까지만,
  체결은 오늘 시가, 손절·익절은 오늘 고/저가, 한 봉에 둘 다 닿으면 손절 우선(보수적).
  속도를 포기하고 매 봉 `analyze()` 를 다시 부르는 것도 같은 이유 —
  지표를 통째로 미리 계산해 인덱싱하면 미래 값을 참조하기 쉽다.
- 성적표는 5개 기준으로 자동 채점한다: 표본 100회 · 기대값 >0R · PF ≥1.3 · MDD ≤25% · 단순보유 초과.
  **단순보유(benchmark)를 항상 같이 계산**하는 이유는, 못 이기면 매매할 이유가 없기 때문.
- **스윕(`backtest-sweep.ts`)은 일봉을 1회만 받아 모든 변형·종목군이 공유한다.** 변형마다 다시 받으면
  데이터가 미묘하게 달라져 비교 자체가 무의미해지고, 네이버 호출도 조합 수만큼 늘어난다.
  변형 목록(`VARIANTS`)은 그 스크립트에 하드코딩돼 있고 **배열 순서가 곧 차트의 색 순서**다.
- **종목군을 나누는 이유**: 같은 규칙이라도 지수 ETF(완만한 우상향)와 개별주(변동성 큼)에서
  결과가 정반대로 나온다. 실제로 국내 개별주에서 +16%인 설정이 미국 개별주에선 -1.3%다.
  섞어 돌리면 어느 쪽이 성적을 만들었는지 알 수 없어 진단이 불가능해진다.
- 종목군이 작으면(3종목 등) 거래가 수십 회에 그쳐 PF·기대값이 크게 튄다.
  `verdictLines()` 의 표본 100회 기준이 그 경우를 ❌ 로 잡아주므로 **숫자만 보고 좋아하지 말 것**.
- **스윕 결과를 실전 설정으로 승격하기 전에 `scripts/walk-forward.ts` 를 통과해야 한다.**
  스윕은 전 구간을 보고 고르므로 구조적으로 과최적화다 — 실제로 스윕 1등(`minNetScore 6`)은
  학습구간만 보면 기대값 +0.018R 로 우위가 없었고, 그 성적은 검증구간이 만든 것이었다.
  승자 선택을 사람이 아니라 `pickWinner()` 가 하는 이유도 같다: 손으로 하면 검증 성적을 본 뒤
  되돌아가 고르게 되고, 그 순간 검증구간이 학습구간으로 오염된다.
- 판정에 **비율(검증÷학습)만 쓰면 안 된다.** 학습 기대값이 0 근처면 작은 검증값도 몇백 %로 찍힌다.
  검증 거래 30회 미만이거나 학습 기대값 0.1R 미만이면 `held = null`(판정 불가)로 빠진다.
- **원금은 시장마다 따로 잡는다** (`markets.{KR,US}.capital`). 엔진이 통화 환산을 하지 않으므로
  공통값 하나를 두 시장에 쓰면 원화 300만원이 미국에서 $3,000,000 이 된다.
- **`fractionalShares` 는 미국에서만 켠다.** 원금이 작을 때 정수주를 강제하면
  "규칙은 사라고 했는데 1주를 못 사서 0주" 가 되어, 성적표가 전략이 아니라 원금 부족을 측정한다.
  실제로 $2,100 · 1회 리스크 $21 에서 상위 12종목 중 9종목이 0주였고 5종목 분산이 2종목으로 무너졌다.
  한국투자·토스 실계좌가 미국주식 소수점을 지원하므로 실전보다 유리한 가정이 아니다.
  국내는 소수점 매매가 일반적이지 않아 false 로 둔다.
- **`runBacktest` 의 `tradeFrom` 옵션**은 워밍업 봉을 넉넉히 주면서 진입만 날짜로 자른다.
  이게 없으면 페이퍼가 시작 후 첫 6거래일 동안 조용히 "거래일 0" 만 찍는다 —
  시작일 기준 딱 `warmupBars` 만 잘라 넘기면 `warmupBars + 5` 가드에 전 종목이 걸리기 때문.
- **페이퍼 트레이딩(`lib/stock/paper.ts`)은 증분이 아니라 재생(replay)이다.** 어제 상태를 읽어
  오늘 판정을 이어붙이려면 진입·청산·수량 로직을 `backtest.ts` 와 한 벌 더 쓰게 되고,
  그 순간 검증한 규칙과 기록되는 매매가 갈라진다. 그래서 시작일부터 매번 통째로 다시 굴린다 —
  과거 일봉은 안 바뀌므로 결과는 항상 같고, 상태 파일이 없으니 상태가 썩지도 않는다.
- **페이퍼의 단위는 시장이 아니라 트랙이다** (`config/paper-{track}.json`). 계약서는 진행 중
  수정 금지인데, 그러면 규칙을 바꿔보려면 기록을 버리는 수밖에 없고 **"바꾼 게 나은가"를
  영원히 못 밝힌다.** 그래서 트랙을 하나 더 열어 나란히 굴린다 (`KR` 현재 설정 / `KR2` 덜 판다).
  새 트랙은 `--like <원본트랙>` 으로 만든다 — 종목뿐 아니라 **규칙의 출발점**도 원본 계약서에서
  물려받아야 한다. 현재 설정을 바닥으로 쓰면 그 사이 `stock-trading.json` 이 바뀐 만큼
  진입 문턱까지 달라져 비교가 깨진다 (KR 은 `minNetScore 4` 로 얼렸는데 현재 설정은 6이라
  실제로 KR2 가 6거래일간 한 건도 못 샀다). 재생 방식이라 `--start` 로 원본과 같은 날부터
  굴릴 수 있고, 시작일을 과거로 당기면 그 구간은 규칙 선택에 이미 쓴 데이터이므로
  계약서 `note` 에 **in-sample 경고가 자동으로 박힌다**.
- `runBacktest` 는 기간 끝에 남은 포지션을 `open_at_end` 로 강제 청산해 `trades` 에 넣는다.
  페이퍼에서는 그게 **아직 들고 있는 것**이라 갈라내고 실현 성적을 따로 센다 —
  안 그러면 팔지도 않은 평가이익이 성적표에 섞인다.
- **기록(보유·실현)과 예고(매수 후보)를 절대 같은 표에 넣지 않는다.** 섞이면 며칠 뒤에
  그게 실제 가상매매였는지 후보였는지 구분할 수 없다. `previewEntryCandidates()` 의 진입 조건은
  `backtest.ts` 의 판정과 같아야 하고(점수·uptrend), 슬롯·현금 한도는 일부러 적용하지 않는다.
- **백테스트 유니버스는 관심종목과 분리한다** (`lib/stock/universe.ts`).
  관심종목은 곧 텔레그램 알림 대상이라 표본을 늘리려고 100종목을 넣으면 알림이 못 쓰게 된다.
  유니버스는 네이버 시총 랭킹에서 받아오고 `.cache/stock/` 에 12시간 캐시한다.
  거래대금 상위는 별도 엔드포인트가 없어 **넓은 시총 풀을 받아 거래대금으로 재정렬**해 구한다.
  ⚠ 어느 쪽이든 **오늘 기준 스냅샷**이라 선택 편향이 있다 — 그 사이 망한 종목은 목록에 없다.
- 합격 기준은 `backtest.ts` 의 `verdictLines()` 하나가 정한다. UI 는 그 문자열을 표시만 하고
  기준을 복제하지 않는다 — 복제하면 CLI 와 화면의 판정이 갈라진다.
- 통화 환산을 하지 않으므로 국내/미국은 `--market` 으로 나눠 돌린다.
- 설정 항목 의미·합격 기준·증권사 키 발급 절차는 `docs/STOCK-TRADING.md`.
- 다음 단계(모의→실전)는 미구현. `.env.example` 에 `STOCK_MODE` 와 KIS/토스 키 이름만 잡아뒀다.
  KIS 는 모의계좌를 지원하지만(도메인·앱키·tr_id 전부 별개) **토스는 샌드박스가 없다** — 발급 즉시 실계좌.

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

### 메인 퀘스트 (퀘스트 탭의 서브뷰 — 12주짜리 시즌 플랜)
```
config/missions.json → lib/missionStore.ts (파일 IO) → lib/mission.ts (타입·집계)
                     → components/MissionBoard.tsx
```
- 데일리 퀘스트가 **반복**이라면 이쪽은 **일회성**이다. "한 번 하면 끝나지만 안 하면 다음이 안 열리는 일".
- **트랙이 여러 개다** (`MISSION_TRACKS` — `income` 12주 수익화 / `career` 금융권 이직 블록 1).
  각 트랙이 자기 챕터 4개를 들고 있고 **챕터 번호는 트랙 안에서만 유효**하다 (CHAPTER 1 이 트랙마다 하나씩 있다).
  집계 함수는 전부 `(missions, track)` 을 받는다 — 트랙을 안 넘기면 두 시즌이 한 진행바에 섞이고
  `13/26` 은 아무것도 말해주지 않는다. **화면은 한 번에 한 트랙만 보여준다** (동시에 펼치면 범위가 넓어진다).
- 챕터는 앞 챕터를 다 끝내면 다음이 `unlocked` 된다.
- **잠금은 시각적 안내일 뿐 체크를 막지 않는다.** 도구가 사람을 막아서면 판을 안 열게 되고
  그게 이 프로젝트가 막으려는 실패 경로다. 잠금을 강제로 바꾸지 말 것.
- 미션마다 `reward`(끝내면 얻는 것)를 붙인다 — 동기를 눈에 보이게 하는 게 이 화면의 존재 이유.
- 씨앗(`SEEDS`)은 **파일이 없을 때만** 심는다. 기존 파일에 새 트랙을 덧뿌리지 말 것 —
  지운 미션이 되살아나면 판을 안 믿게 된다. 트랙을 추가할 땐 일회성 스크립트로 append 한다.

### 업종 분산 (`entry.maxPerIndustry` — 보험이지 수익원이 아님)
```
admin/lib/stock/industry.ts (업종 조회·30일 캐시) → SymbolData.industry → backtest.ts 진입 루프
```
- `maxOpenPositions` 는 **종목 수만 세고 업종은 안 센다.** 그래서 은행주 3종목이 세 칸을 차지할 수 있고,
  실제로 2026-06-05 에 KB·신한·하나를 같은 사유로 동시 매수해 3일 뒤 셋 다 손절됐다.
- ⚠ **값에 따라 부호가 바뀌므로 '좋다/나쁘다'로 말하면 안 된다.**
  | 값 | 상승장(2.7년) | 하락 3구간 |
  |---|---|---|
  | 1 | **후보 중 최악** (PF 0.98 · +0.006R · MDD -25.0%) | 셋 다 우위 |
  | 2 | 거의 안 걸림 (-0.007R) | 셋 다 우위 (-8.8% 장 +4.2%p vs +2.4%p) |
  | null | 기준선 (PF 1.29 · +0.108R) | 기준선 |
  1 이 나쁜 이유는 좋은 자리를 막고 **점수 낮은 다른 업종을 대신 사기** 때문이다.
- **워크포워드 3개 split 집계** (20250630 / 20250930 / 20251231): 승자는 `indoff`·`indoff`·동률 —
  즉 **최적화 규칙은 업종상한을 원하지 않는다.** 그런데도 `markets.KR` 에 2를 켜 둔 것은
  하락 3구간 전부에서 우위가 더 컸기 때문이고, **사람이 위험관리로 내린 결정이지 pickWinner 의 출력이 아니다.**
  → 이런 항목은 반드시 그 사실을 설정 파일에 적어 둔다(`_maxPerIndustry`). 안 적으면 다음 사람이
  "워크포워드가 고른 값"으로 오해하고, 반대로 성적표만 보고 조용히 꺼 버린다.
  → **분산은 좋은 장에서 조금 내고 나쁜 장에서 돌려받는 비용**이다. 공통값은 null, `markets.KR` 만 2.
- 업종을 못 받은 종목은 제약 대상에서 **뺀다** — 모른다는 이유로 기회를 지우면 결과가 조용히 왜곡된다.
- ⚠ **구간을 잘라 `SymbolData` 를 다시 만드는 곳은 `industry` 를 같이 넘겨야 한다**
  (`walk-forward.ts` 의 train/validation, `paper.ts`). 안 넘기면 변형들이 **전부 같은 숫자**로 나오는데,
  실제로 그렇게 한 번 속았다 → **결과가 '차이 없음'이면 진짜인지 배선이 끊긴 건지 먼저 의심할 것.**

### 시장 국면 (`scripts/market-regime.ts`)
- 유니버스 100종목의 **동일가중 지수**를 만들어 분기 수익률과 낙폭 구간을 뽑는다.
  코스피 지수를 안 쓰는 이유: 백테스트가 매매하는 건 그 100종목이고, 코스피는 삼성전자 비중에 끌려다녀
  **다른 무대를 보여준다.** 종가 평균이 아니라 일간 수익률 평균을 누적해야 주가 높은 종목이 지수를 지배하지 않는다.
- 왜 필요한가: 2023~2026 국내장은 크게 오른 구간이라 전 구간 백테스트는 늘 "묻어두는 게 나았다"로 끝난다.
  **매매 규칙의 값어치는 하락장에서 갈리므로** 그 구간을 따로 잘라 봐야 규칙과 무대를 구분할 수 있다.
  실제로 최종 설정은 전 구간에선 단순보유에 -156%p 지지만, 하락 3구간에선 전부 이긴다(+2.4 ~ +22.8%p).
- ⚠ 하락 구간만 잘라 백테스트할 땐 `--from` 을 **워밍업 60봉(≈90일)만큼 앞당겨야** 한다.
  안 그러면 워밍업이 구간을 통째로 먹어 매매할 날이 안 남는다 (실제로 3개월 구간에서 2일만 남아 계산이 멈췄다).

### 프로젝트 설명서 (탭 [🗂️ 프로젝트 설명])
```
lib/projectBrief.ts (순수 데이터 — 파일 IO 없음) → components/ProjectBrief.tsx
```
- 면접에서 이 저장소를 설명하기 위한 화면. 뷰 3개: **① 구조 / ② 판단 / ③ 예상 질문**.
- **중심은 ② 판단 카드**다. 스택 목록은 코드를 읽으면 나오지만 *왜 그렇게 골랐나*는 복원되지 않는다.
  카드마다 `what` / `why` / `say`(그대로 읽을 문장) / `where`(근거 파일)를 둔다.
  카드에 넣는 기준: **코드를 봐도 이유가 안 보이는 것만.** "React 를 썼다"는 사실이지 판단이 아니다.
- 문서(`docs/*.md`)가 아니라 탭으로 만든 이유는 문서는 안 열게 되고 탭은 눈에 띄기 때문.
- ⚠ **숫자·주장은 저장소에서 직접 세거나 확인한 값만 적는다** — 면접에서 말할 내용이라 틀리면 곤란하다.
  코드 구조를 바꾸면 이 파일도 같이 고칠 것 (약점 목록 `GAPS` 포함).

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
- 탭: **주식(`StockAlertDashboard`, 기본 탭)** · 데일리 퀘스트(`QuestBoard`) ·
  유튜브(`YoutubeWorkspace` 안에 롱폼/주제큐/숏폼) · 블로그(`BlogGenerator`) · 이모티콘(`EmoticonStudio`) ·
  인스타(`InstagramCardGenerator`) · 시나리오(`CinemaStudio`) · 클로드 대화(`ChatPanel`)
  → `Dashboard.tsx` 의 `TABS` 배열 **순서가 곧 화면 순서이고 첫 항목이 기본 탭**이다.
- **탭은 드래그로 순서를 바꿀 수 있고, 그 순서는 `localStorage["dashboard.tabOrder"]` 에 남는다.**
  그래서 `TABS` 배열은 이제 *기본값*이다 — 화면 순서가 코드와 다르면 저장값을 먼저 의심할 것
  (탭 바 오른쪽 [순서 초기화] 로 되돌린다). 저장값은 마운트 후에 읽는다 (SSR hydration 불일치 방지).
  `mergeOrder()` 가 없어진 탭은 버리고 새로 생긴 탭은 뒤에 붙이므로, **탭을 추가·삭제해도
  저장값을 지울 필요가 없다.** 순서를 바꾸면 첫 항목이 기본 탭이라는 규칙도 따라 움직인다.
  외부 DnD 라이브러리 없이 HTML5 draggable 만 쓴다 (터치 기기에선 드래그가 안 되지만 로컬 데스크톱 도구다).
- 주식 탭은 축이 둘이다: **시장**(🌍 전체 · 🇰🇷 국내 · 🇺🇸 미국) × **화면**(신호 스캔 · 방법론 · 백테스트).
  시장을 위로 올린 이유는 두 시장이 다른 규칙으로 굴러서, 섞어 보면 어느 쪽 규칙으로 본
  숫자인지 알 수 없기 때문. '전체'는 스캔에서만 의미가 있다 (백테스트는 통화를 환산하지 않는다).
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
| missions | `/missions` (GET·POST·PATCH·DELETE) | 메인 퀘스트 (12주 플랜) |
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
| `STOCK_MODE` (`dry`\|`paper`\|`live`) | 자동매매 안전장치 | 기본 `dry` = 주문 안 나감. **백테스트는 이 값과 무관하게 키 없이 돈다** |
| `KIS_PAPER_*` / `KIS_LIVE_*` | 한국투자증권 주문 | 모의·실전 앱키가 별개. 도메인·`tr_id` 도 다름. 미구현 |
| `TOSS_CLIENT_ID` / `TOSS_CLIENT_SECRET` / `TOSS_ACCOUNT` | 토스증권 주문 | 샌드박스 없음 = 발급 즉시 실계좌. 미구현 |
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
