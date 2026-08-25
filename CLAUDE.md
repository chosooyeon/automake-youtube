# automake-youtube — 에이전트 컨텍스트

콘텐츠 자동 생산 하네스. **Claude Code 에이전트가 `bots/{stage}/prompt.md` 를 읽고 실행**하며,
`admin/` (Next.js 14 로컬 대시보드, http://localhost:3000)이 그 실행을 버튼으로 호출한다.

> **이 파일이 전체 지도다.** 세션 시작 시 저장소를 탐색하지 말고 아래 표에서 위치를 찾아
> 필요한 파일만 열어라. 더 자세한 지도가 필요하면 `docs/ARCHITECTURE.md` 1개만 추가로 읽는다.

## 탐색 비용 (중요)
전체 grep/find 금지. 아래는 크고 읽을 가치가 없다:
`projects/*/` (600MB, 산출물·이미지·오디오) · `node_modules/`(루트+admin) · `tools/ffmpeg`(101MB) · `.cache/`
→ 코드는 `admin/lib`, `admin/components`, `admin/app/api`, `bots`, `scripts` 안에만 있다.

## 트랙 5개
| 트랙 | 실행 경로 | 산출물 |
|------|-----------|--------|
| 유튜브 롱폼 | 봇 00~06 (Claude Code) | `projects/{slug}/{stage}/output.json`, `final.mp4` |
| 유튜브 숏폼 | 봇 S1~S4 (부모 롱폼 필요) | `projects/{slug}/S3-edit/short.mp4` |
| 인스타 카드뉴스 | admin API가 직접 처리 | `projects/{slug}/instagram-cards/cards/*.png` |
| 블로그 글 | admin API → `claude` 프로세스 | 응답으로 반환 (파일 저장 안 함) |
| 이모티콘 / 시나리오(cinema) | admin API + Gemini 이미지 | `admin/data/emoticons/`, `cinema/{slug}/project.json` |
| 주식 매매 알림 | admin API가 직접 처리 (콘텐츠 트랙 아님) | 텔레그램 메시지, `admin/data/stock/` |
| 데일리 퀘스트 | admin 탭에서 체크 (콘텐츠 트랙 아님 — 실행 관리) | `config/quest-{tasks,log}.json` |

## 어디를 볼까
| 하려는 일 | 파일 |
|---|---|
| 봇 동작·지시문 수정 | `bots/{stage}/prompt.md` + `config.json` |
| 채널·브랜드·니치 설정 | `config/global.json` (`active_niche` + `niches.*`) |
| 단계 순서·의존성 | `config/pipeline.json` |
| 봇이 어떻게 호출되나 | `admin/lib/runBot.ts` (headless `claude -p`), `scripts/run-bot.sh` |
| 모든 경로 상수·스테이지 ID | `admin/lib/paths.ts` ← **경로 추측 대신 여기 확인** |
| 대시보드 탭 구성 | `admin/components/Dashboard.tsx` (탭 셸). **탭 배열 순서가 곧 화면 순서이고 첫 항목이 기본 탭** — 기본값은 주식이 맨 앞. 단 **탭은 드래그로 순서 변경이 되고 그 순서가 `localStorage["dashboard.tabOrder"]` 에 남으므로 `TABS` 배열은 이제 기본값일 뿐** ← 화면 순서가 코드와 다르면 저장값부터 의심 (탭 바 [순서 초기화]). 탭을 추가·삭제해도 `mergeOrder()` 가 맞춰주니 저장값을 지울 필요 없다. 유튜브 탭은 `YoutubeWorkspace.tsx` 안에 주제큐·롱폼·숏폼 서브탭 |
| 클로드 대화 탭 (일반 채팅) | `admin/app/api/chat/route.ts` (`claude -p --output-format stream-json` 스트리밍) + `admin/components/ChatPanel.tsx` + `Markdown.tsx`. 프로젝트 CLAUDE.md 오염을 피하려 빈 cwd `admin/data/chat/` 에서 실행 |
| 색상·테마(라이트/다크) | `admin/app/globals.css` 의 `:root`/`.dark` 변수 ← **여기만 고치면 전 화면 반영**. 컴포넌트엔 `bg-panel`·`text-subtext` 같은 시맨틱 토큰만 쓰고 `gray-700` 류 하드코딩 금지 |
| 인스타 카드 생성 | `admin/app/api/instagram/generate/route.ts` + `admin/lib/instagram/*` |
| 뉴스 RSS 스크랩 | `admin/lib/news/{feeds,rss}.ts` (캐시 `.cache/news/`, TTL 30분) |
| 블로그 생성 | `admin/app/api/blog/generate/route.ts` + `admin/data/blog_style.md` |
| 이모티콘 | `admin/lib/emoticon*.ts` |
| 주식 매매신호·알림 | `admin/lib/stock/*` (naver=데이터·indicators=지표·signals=판정·scan=알림). 관심종목·알림이력은 `config/stock-*.json` (커밋됨), 봇 토큰만 `admin/data/stock/telegram.json` (git 제외) |
| 주식 알림 상시 가동 | `.github/workflows/stock-alert.yml` → `scripts/stock-scan-ci.ts` (tsx, admin 서버 불필요). 맥 켜둔 채 돌릴 땐 `scripts/stock-watch.mjs` |
| 페이퍼 트레이딩 상시 가동 | `.github/workflows/paper-trade.yml` — 한국장 15:50 KST(`KR KR2`) / 미국장 06:35 KST(`US`). **어느 크론이 깨웠는지(`github.event.schedule`)로 트랙을 가른다** (둘 다 매번 돌리면 장 열리기도 전의 시장까지 계산한다). 재생 방식이라 커밋할 상태가 없어 `contents: read` 로 충분. 마지막 스텝이 `config/paper-*.json` 변경을 감지하면 실패시킨다.  **매일 알림은 `KR` 하나뿐이고 나머지 트랙은 `--trades-only`** — 숫자가 여러 벌이면 나쁜 쪽을 만지게 되고 그게 계약서를 건드려 검증을 죽인다. 트랙을 지우는 대신 안 보이게 해서 막는다 (기록은 계속 쌓임 — 페이퍼는 소급이 안 되므로 끊지 않는다). **비교는 매일 할 일이 아니라 몇 주 뒤에 [📝 페이퍼] 탭에서 할 일** |
| 주식 자동매매 (백테스트) | `admin/lib/stock/backtest.ts`(시뮬레이션·성적표) + `tradingConfig.ts`(정책 로더) + `scripts/backtest.ts`(CLI). 정책은 `config/stock-trading.json` (커밋됨) ← **수익률은 여기서 계산되어 나오는 결과값**. 설정 의미·합격 기준·키 발급 절차는 `docs/STOCK-TRADING.md` |
| 시장별 매매 규칙 (국내 ≠ 미국) | `config/stock-trading.json` 이 **공통값 + `markets.{KR,US}` 덮어쓰기 2층**이고 `loadTradingConfig(market)` 이 합쳐서 준다 ← **백테스트·스윕·워크포워드는 반드시 market 을 넘긴다** (안 넘기면 공통값으로 돌아 미국을 국내 규칙으로 굴린다 — 그게 -13.1% 였다). 화면은 `admin/app/api/stock/method/route.ts` → `components/MethodBoard.tsx` (주식 탭 [📐 방법론]). `markets.*.verifiedAt` 이 null 이면 화면이 "검증 전 가설"로 표시하며, **워크포워드 통과일만 적는다** |
| 업종 분산 (사람이 넣은 보험 — 최적화 결과 아님) | `admin/lib/stock/industry.ts` + `entry.maxPerIndustry` (공통 null, `markets.KR` 만 2). ⚠ **워크포워드는 3개 split 중 2개에서 '제한 없음'을 골랐다** (-0.007~-0.009R). 그래도 켜 둔 건 **하락 3구간 모두에서 단순보유 대비 우위가 더 컸기** 때문 — 보험료를 내는 중이지 성적이 좋아서가 아니다. **'성적 안 좋으니 끄자'로 판단하면 안 되고 '하락장 보험이 필요 없다'로 판단해야 한다.** 1 로는 내리지 말 것(상승장 최악). 근거는 `config/stock-trading.json` 의 `_maxPerIndustry` |
| 하락장 구간 찾기 | `scripts/market-regime.ts` — 유니버스 100종목 **동일가중 지수**를 만들어 낙폭 구간을 뽑는다 (코스피 지수는 삼성전자에 끌려다녀 백테스트 대상과 다른 그림을 준다). 이게 필요한 이유는 **전 구간 백테스트가 상승장 편향이라 '그냥 묻어둬라'만 나오기 때문** — 규칙의 값어치는 하락장에서 갈린다 |
| 표본 늘리기 (알림과 분리) | `scripts/backtest.ts --universe marketCap --top 100` ← 관심종목은 곧 텔레그램 알림 대상이라 표본 늘리려고 거기에 종목을 넣으면 안 된다. 30종목 3개월=15거래는 통계가 아니고, 100종목 2.7년=377거래라야 판정이 뒤집히지 않는다 |
| 백테스트 파라미터 스윕 | `scripts/backtest-sweep.ts`(변형 목록이 여기 하드코딩 — 손잡이를 바꾸려면 `VARIANTS` 수정) → `admin/data/stock/backtest/sweep-{market}.json` (git 제외) → `admin/app/api/stock/backtest/route.ts` → `components/BacktestBoard.tsx` (주식 탭의 [🧪 백테스트] 서브탭). **일봉은 1회만 받아 모든 변형·종목군이 공유**하므로 조합을 늘려도 네트워크 비용은 그대로. 합격 기준은 복제하지 말고 `backtest.ts` 의 `verdictLines()` 를 쓸 것 |
| 페이퍼 트레이딩 (실시간 가상매매) | `admin/lib/stock/paper.ts` + `scripts/paper-trade.ts` + `components/PaperBoard.tsx` (주식 탭 [📝 페이퍼]). 계약서 `config/paper-{track}.json` (커밋됨 — 시작 시점의 **종목·규칙을 얼린 것**, 진행 중 수정 금지), 결과 `admin/data/stock/paper/{track}.json` (git 제외). **증분이 아니라 시작일부터 매번 재생(replay)한다** — 진입·청산 로직을 backtest.ts 와 한 벌 더 쓰지 않으려는 것. 상태 파일이 없으니 썩지도 않는다 |
| 페이퍼 **트랙** (규칙 A/B 비교) | 단위가 시장이 아니라 **트랙**이다 (`--track`). 계약서는 진행 중 수정 금지라 규칙을 바꾸려면 기록을 버리고 다시 시작하는 수밖에 없는데, 그러면 **"바꾼 게 나은가"를 영원히 못 밝힌다** → 트랙을 하나 더 연다. 현재 `KR`(현재 설정) · `KR2`(덜 판다) · `US`. **새 트랙은 반드시 `--like <원본트랙>`** 으로 만든다 — 종목과 **규칙 출발점**을 원본 계약서에서 물려받는다. 현재 설정을 바닥으로 쓰면 그 사이 `stock-trading.json` 이 바뀐 만큼 진입 문턱까지 달라져 비교가 깨진다 (실제로 KR 은 8/16에 `minNetScore 4` 로 얼렸는데 현재 설정은 6이다). 재생 방식이라 `--start` 로 원본과 같은 날부터 굴릴 수 있고, 그때 계약서 note 에 **in-sample 경고가 자동으로 박힌다** |
| 시장별 원금·소수점 매수 | `config/stock-trading.json` 의 `markets.{KR,US}` 에 `capital` 과 `fractionalShares` ← **엔진은 통화 환산을 안 한다.** 공통 capital 3,000,000 을 미국에 그대로 쓰면 300만원이 아니라 $3,000,000 으로 매매한다 (실제로 그 상태로 5일 돌았다). $2,100 으로 낮추면 이번엔 1회 리스크 $21 로 정수주를 못 사서 상위 12종목 중 9종목이 '0주' 가 된다 → 미국만 `fractionalShares: true`. 국내는 false 유지 |
| 워크포워드 검증 (과최적화 판정) | `scripts/walk-forward.ts` — 학습구간에서만 후보를 돌리고 **`pickWinner()` 규칙이 승자를 고른 뒤** 검증구간엔 승자만 1회. 선택 규칙을 코드에 박아둔 이유는 손으로 하면 검증 성적을 보고 되돌아가 고르게 되기 때문 ← **스윕 결과를 실전 설정으로 승격하기 전 반드시 통과**. 결과는 `admin/data/stock/backtest/walkforward-{market}-{universe}.json` (git 제외) |
| 백테스트 유니버스 (알림과 분리) | `admin/lib/stock/universe.ts` — 네이버 `m.stock.naver.com/api/stocks/marketValue/{KOSPI,KOSDAQ}` 랭킹에서 시총·거래대금 상위 N을 뽑는다. **관심종목(watchlist)에 넣지 않는 이유는 그게 곧 텔레그램 알림 대상이기 때문** — 100종목을 넣으면 알림이 못 쓰게 된다. 풀은 `.cache/stock/` 에 12h 캐시. `--universe marketCap,tradingValue --top 100` 처럼 여러 개를 주면 **합집합을 한 번만 받아** 일봉 수집이 배로 늘지 않는다 ← ⚠ 오늘 기준 스냅샷이라 선택 편향이 있다 |
| 백테스트 종목군 (자산군별 분리) | `config/stock-groups.json` (커밋됨) — 지수ETF·커버드콜·금채권만 적고 **나머지는 '개별주'로 자동 분류**되므로 종목을 추가해도 이 파일은 안 고쳐도 된다. 결과는 `종목군 × 설정` 2차원이고 API 가 `?group=` 으로 잘라서 준다 ← **지수ETF와 개별주를 한 솥에 넣으면 어느 쪽이 성적을 만들었는지 알 수 없다** |
| KIS 클라이언트 (조회 전용 · 실계좌 이중잠금) | `admin/lib/stock/kis.ts` — GET 전용 통로 하나뿐이라 **주문 함수가 없다**. `STOCK_MODE` 기본 `dry`, 실계좌는 `STOCK_MODE=live` **와** `KIS_LIVE_TRADING_ENABLED=true` 가 **둘 다** 있어야 열린다 ← 하나만 켜면 안 열림 |
| 매매 차단 현황 한눈에 | `scripts/trading-status.ts` — API 호출 없이 가드 함수를 실제로 불러보고 KIS·토스가 막혔는지 판정 |
| KIS 모의계좌 연결 확인 | `scripts/kis-check.ts` — 토큰 발급 + 잔고 조회만 (주문 안 나감). 키는 `.env` 의 `KIS_PAPER_*`, 토큰은 `admin/data/stock/kis-token.json` 에 24h 캐시. `--account`/`--product` 로 .env 안 고치고 계좌번호 시험 가능 |
| 토스증권 연결 확인 | `scripts/toss-check.ts` — 조회 전용 (`get()` 하나로만 호출해서 주문 경로가 없음). **실계좌다** (토스는 샌드박스 없음). `TOSS_ACCOUNT` 은 계좌번호가 아니라 `/api/v1/accounts` 가 주는 `accountSeq` |
| 토스 클라이언트 (조회 전용) | `admin/lib/stock/toss.ts` — GET 전용 `get()` 하나뿐이라 **주문 함수가 아예 없다**. `assertTradingAllowed()` 는 `.env` 의 `TOSS_TRADING_ENABLED=true` 없으면 throw ← **기본값 차단**. `positionAt()` 은 그 시점의 수량·평단 (오늘 평단을 과거에 소급하면 분할매수 종목 숫자가 틀어진다) |
| 토스 페이퍼 리포트 ("그때 팔았으면") | `scripts/toss-paper.ts` — 보유·체결이력은 토스에서 읽고, 매도 판정은 `signals.ts` 를 과거 일봉에 굴려 종이 위에서만 한다. 매수일은 체결이력에서 실제로 가져온다 |
| 데일리 퀘스트 (일/월/년 달성 관리) | `admin/lib/quest.ts`(순수 집계·클라이언트 공용) + `questStore.ts`(파일 IO) + `components/QuestBoard.tsx`·`QuestCharts.tsx`. 기록은 `config/quest-{tasks,log,season}.json` (커밋됨). 미니 퀘스트·코치 배너·시즌 진행바 포함 |
| 메인 퀘스트 (12주 시즌 플랜, 일회성) | `admin/lib/mission.ts` + `missionStore.ts` + `components/MissionBoard.tsx` (퀘스트 탭 서브뷰). 목록은 `config/missions.json` (커밋됨). **트랙 2개**(`income` 수익화 / `career` 이직 블록 1)이고 **챕터 번호는 트랙 안에서만 유효** — 집계 함수에 반드시 track 을 넘긴다 (안 넘기면 두 시즌이 한 진행바에 섞인다). 화면은 한 번에 한 트랙만 |
| 프로젝트 설명서 (면접용) | `admin/lib/projectBrief.ts` (내용 원본 — 순수 데이터) + `components/ProjectBrief.tsx` (탭 [🗂️ 프로젝트 설명]). 구조·판단카드·예상질문 3개 뷰. **여기 적힌 숫자와 주장은 면접에서 말할 내용이라 추측 금지** ← 코드를 바꾸면 이 파일도 같이 고친다 |
| 아이디어 파킹판 | `admin/lib/idea.ts` + `ideaStore.ts` + `components/IdeaBoard.tsx` (퀘스트 탭의 서브뷰). 목록은 `config/ideas.json` (커밋됨) ← **새 트랙 제안 전에 여기부터 확인** |
| 차트 색 (트랙 8색·달성률 램프) | `admin/app/globals.css` 의 `--c-series-1..8` / `--c-heat-0..4` ← **순서가 색약 안전장치라 섞지 말 것** |
| 주제 큐 | `topics/queue/`, `admin/lib/topics.ts` |
| 영상 렌더링 | `scripts/build-video.mjs`(롱폼), `scripts/render-shorts.mjs`(숏폼), `tools/ffmpeg` |
| 입출력 계약 | `shared/schemas/*.json` |
| 니치 전환 로직 | `admin/lib/niche.ts` (global.json 에 deep-merge 후 스냅샷 기록) |

## 봇 실행 규칙 (모든 봇 공통)
- **지시된 stage 1개만** 실행한다. 다른 stage 건드리지 않음.
- 입력은 직전 단계 `output.json`, 출력은 `projects/{slug}/{stage}/output.json`.
  **이 파일이 있어야 성공**으로 판정된다.
- 로그는 `projects/{slug}/{stage}/run.log.md` 에 **append** (덮어쓰기 금지).
- 파일 쓰기 전 부모 디렉터리 없으면 생성. 완료 후 output.json 존재 확인.
- 프로젝트별 `projects/{slug}/00-input/channel_config.json` 이 있으면 `config/global.json` 보다 **우선**.
- 비용 큰 작업(이미지 대량 생성·영상 생성·업로드)은 DRY-RUN 요약 후 승인받는다.

## 단계와 모델 티어
```
롱폼: 00-topic(파이프라인 외부) → 01-benchmark → 02-strategy → 03-script → 04-audio → 05-visual → [휴먼게이트] → 06-edit-upload
숏폼: 부모 롱폼 03-script output → S1 → S2 → S3 → S4
```
| 티어 | 모델 ID | 봇 |
|---|---|---|
| opus | `claude-opus-4-7` | 01 · 02 · 03 |
| sonnet | `claude-sonnet-4-6` | 00 · 06 · S1 |
| haiku | `claude-haiku-4-5-20251001` | 04 · 05 · S2 · S3 · S4 |

각 봇 `config.json.model_tier` 가 원본이고, `admin/lib/runBot.ts` 와 `scripts/lib/resolve-model.sh` 가 **같은 매핑을 각자 하드코딩**하고 있다 → 티어를 바꾸면 두 곳 다 확인.

> 봇 디렉터리와 산출물 디렉터리 이름이 숏폼만 다르다: `bots/S1-shorts-script` → `projects/{slug}/S1-script/`.

## 자주 쓰는 명령
```bash
cd admin && npm run dev          # 대시보드 (:3000)
scripts/run-bot.sh 03-script <slug>          # 봇 1개 실행
scripts/run-bot.sh S1-shorts-script <slug> --parent <부모slug>
scripts/run-topic.sh --niche psychology      # 주제 5개 추천
node scripts/build-video.mjs <slug>          # 롱폼 렌더
node scripts/render-shorts.mjs <slug>        # 숏폼 렌더
node scripts/stock-watch.mjs                 # 관심종목 스캔 → 텔레그램 알림 (admin 실행 중이어야 함)
cd admin && npx tsx ../scripts/backtest.ts   # 매매규칙 백테스트 (키 불필요, --market/--from/--to)
cd admin && npx tsx ../scripts/backtest-sweep.ts  # 설정 8종 한 번에 비교 → 주식탭 [🧪 백테스트]
cd admin && npx tsx ../scripts/walk-forward.ts    # 과최적화 검증 (--split 20250630 기본)
cd admin && npx tsx ../scripts/paper-trade.ts --track KR    # 페이퍼 트레이딩 갱신 (--notify 로 텔레그램)
cd admin && npx tsx ../scripts/paper-trade.ts --market KR --track KR3 --init --like KR --rules letitrun  # 비교 트랙 개설
cd admin && npx tsx ../scripts/walk-forward.ts --universe marketCap,tradingValue --top 100  # 100종목 유니버스로
cd admin && npx tsx ../scripts/kis-check.ts  # KIS 모의계좌 연결 확인 (조회만, --fresh 로 토큰 재발급)
cd admin && npx tsx ../scripts/toss-check.ts # 토스증권 연결 확인 (조회만 — 실계좌 주의)
cd admin && npx tsx ../scripts/toss-paper.ts # 토스 보유종목 "그때 팔았으면" 리포트 (주문 안 나감)
cd admin && npx tsx ../scripts/trading-status.ts  # 실계좌 주문이 막혀 있는지 확인
```

## 규칙
- API 키는 `.env` / 환경변수만 사용. `config/global.json` 에 절대 넣지 않는다.
- 업로드는 기본 `private` + 사람 승인 필수.
- 문서를 고쳤으면 이 파일과 `docs/ARCHITECTURE.md` 도 같이 갱신한다 (지도가 틀리면 다음 세션이 다시 탐색하며 토큰을 태운다).
