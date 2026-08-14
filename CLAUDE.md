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
| 대시보드 탭 구성 | `admin/components/Dashboard.tsx` (탭 셸). 유튜브 탭은 `YoutubeWorkspace.tsx` 안에 주제큐·롱폼·숏폼 서브탭 |
| 클로드 대화 탭 (일반 채팅) | `admin/app/api/chat/route.ts` (`claude -p --output-format stream-json` 스트리밍) + `admin/components/ChatPanel.tsx` + `Markdown.tsx`. 프로젝트 CLAUDE.md 오염을 피하려 빈 cwd `admin/data/chat/` 에서 실행 |
| 색상·테마(라이트/다크) | `admin/app/globals.css` 의 `:root`/`.dark` 변수 ← **여기만 고치면 전 화면 반영**. 컴포넌트엔 `bg-panel`·`text-subtext` 같은 시맨틱 토큰만 쓰고 `gray-700` 류 하드코딩 금지 |
| 인스타 카드 생성 | `admin/app/api/instagram/generate/route.ts` + `admin/lib/instagram/*` |
| 뉴스 RSS 스크랩 | `admin/lib/news/{feeds,rss}.ts` (캐시 `.cache/news/`, TTL 30분) |
| 블로그 생성 | `admin/app/api/blog/generate/route.ts` + `admin/data/blog_style.md` |
| 이모티콘 | `admin/lib/emoticon*.ts` |
| 주식 매매신호·알림 | `admin/lib/stock/*` (naver=데이터·indicators=지표·signals=판정·scan=알림). 관심종목·알림이력은 `config/stock-*.json` (커밋됨), 봇 토큰만 `admin/data/stock/telegram.json` (git 제외) |
| 주식 알림 상시 가동 | `.github/workflows/stock-alert.yml` → `scripts/stock-scan-ci.ts` (tsx, admin 서버 불필요). 맥 켜둔 채 돌릴 땐 `scripts/stock-watch.mjs` |
| 데일리 퀘스트 (일/월/년 달성 관리) | `admin/lib/quest.ts`(순수 집계·클라이언트 공용) + `questStore.ts`(파일 IO) + `components/QuestBoard.tsx`·`QuestCharts.tsx`. 기록은 `config/quest-{tasks,log,season}.json` (커밋됨). 미니 퀘스트·코치 배너·시즌 진행바 포함 |
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
```

## 규칙
- API 키는 `.env` / 환경변수만 사용. `config/global.json` 에 절대 넣지 않는다.
- 업로드는 기본 `private` + 사람 승인 필수.
- 문서를 고쳤으면 이 파일과 `docs/ARCHITECTURE.md` 도 같이 갱신한다 (지도가 틀리면 다음 세션이 다시 탐색하며 토큰을 태운다).
