# automake-youtube

> **Claude Code(에이전트)** 가 6개의 봇을 순차/선택 실행해서
> 유튜브 영상 한 편을 **벤치마킹 → 전략 → 대본 → 음성 → 비주얼 → 편집/업로드** 까지
> 자동화하는 하네스. 매번 프롬프트를 새로 짜는 게 아니라, **설정 파일을 한 번 세팅**하면
> 그 다음부터는 슬러그 하나만 주고 봇을 돌리면 됩니다.

> **에이전트(Claude Code)로 이 저장소를 여는 경우**: `CLAUDE.md` 하나만 읽으면 전체 지도가 나옵니다.
> 더 자세한 구조는 `docs/ARCHITECTURE.md`. 이 README는 사람이 손으로 돌릴 때의 사용법입니다.

## 0. 지금 들어있는 것 (트랙 5개)

| 트랙 | 무엇 | 어디서 돌리나 |
|---|---|---|
| 유튜브 롱폼 | 봇 00~06 | 대시보드 "롱폼" 탭 / `scripts/run-bot.sh` |
| 유튜브 숏폼 | 봇 S1~S4 (부모 롱폼 필요) | "숏폼" 탭 |
| 인스타 카드뉴스 | RSS 수집 → 문안 → 카드 PNG | "인스타" 탭 |
| 블로그 글 | 카테고리 + 문체 시그니처로 초안 생성 | "블로그" 탭 |
| 이모티콘 / 시나리오 | Gemini 이미지, 씬·캐릭터 관리 | "이모티콘" · "시나리오" 탭 |

## 1. 한눈에 보는 구조

```
automake-youtube/
├─ CLAUDE.md              ← 에이전트가 읽는 전체 지도 (+ docs/ARCHITECTURE.md 상세)
├─ AGENTS.md              ← 봇 실행 규칙 요약
├─ README.md              ← (이 파일) 사람이 읽는 사용 가이드
├─ .claude/settings.json  ← Claude Code 권한·도구·로깅 설정
├─ admin/                 ← 로컬 대시보드 (Next.js 14, :3000) — 모든 트랙의 실행 버튼
├─ config/
│  ├─ global.json         ← 채널·브랜드·API + active_niche / niches.*
│  ├─ channels.json       ← 채널 목록
│  └─ pipeline.json       ← 봇 실행 순서·의존성
├─ shared/
│  ├─ schemas/            ← 봇 간 입출력 JSON 스키마(계약서)
│  ├─ templates/          ← 썸네일·CapCut 베이스
│  ├─ fonts/              ← Pretendard (카드·자막)
│  └─ references/         ← 니치별 리서치 자료
├─ bots/
│  ├─ 00-topic/           ← 다음에 만들 주제 5개 추천 (파이프라인 외부)
│  ├─ 01-benchmark/       ← 레퍼런스 수집 + 분석
│  ├─ 02-strategy/        ← 컨셉·제목·훅·인트로
│  ├─ 03-script/          ← 기획·집필·검수·리비전
│  ├─ 04-audio/           ← TTS·자막·무음 압축
│  ├─ 05-visual/          ← 씬 설계·이미지·영상 명세
│  ├─ 06-edit-upload/     ← ffmpeg 렌더링·썸네일 5장·YouTube 업로드
│  └─ S1~S4-shorts-*/     ← 숏폼 4단계
├─ scripts/               ← 렌더·업로드·봇 실행 wrapper
├─ tools/ffmpeg           ← libass 포함 정적 빌드 (시스템 설치 불필요)
├─ topics/                ← 주제 큐(queue) / 사용한 주제(archive)
├─ cinema/                ← 시나리오 트랙 프로젝트
└─ projects/
   ├─ _example/           ← 새 영상 시작 템플릿 (복사해서 사용)
   ├─ _example-short/     ← 숏폼 템플릿
   └─ <slug>/             ← 영상(또는 카드뉴스) 1건 = 폴더 1개
```

각 봇 폴더는 항상 다음 3개 파일로 구성됩니다.

| 파일 | 역할 |
|---|---|
| `README.md` | 사람이 읽는 봇 설명 |
| `config.json` | 봇의 **설정값** (튜닝 포인트). 매 실행마다 안 바꿔도 됨 |
| `prompt.md` | Claude에게 줄 시스템/작업 지시문. 봇의 "두뇌". |

## 2. 처음 한 번만 하면 되는 세팅 (5~10분)

### 2-1. 채널·브랜드 설정
`config/global.json` 열고 다음을 채우세요:
- `channel.name`, `channel.handle`, `channel.niche`, `channel.target_audience`, `channel.value_prop`
- `brand.tone`, `brand.ban_words`, `brand.intro_signature`, `brand.outro_signature`
- `brand.color_palette`, `brand.font_pair`
- `video_defaults.duration_sec` (롱폼 기본 길이)

**여러 채널(니치)을 돌린다면**: `niches.<id>` 에 덮어쓸 값만 적고 `active_niche` 로 전환합니다
(대시보드 상단 니치 셀렉터도 같은 일을 합니다). 전환하면 진행 중인 프로젝트에
`00-input/channel_config.json` 스냅샷이 남아, 과거 프로젝트는 예전 설정을 그대로 씁니다.

### 2-2. 모델·API 설정
`config/global.json.apis` 에서 placeholder 들을 채웁니다.
실제 키는 **이 파일에 박지 말고** 환경변수로 두세요. 파일에는 환경변수 이름만:
- `apis.tts.api_key_env: "ELEVENLABS_API_KEY"`
- `apis.image.api_key_env: "OPENAI_API_KEY"`
- `apis.video.api_key_env: "RUNWAY_API_KEY"`
- `apis.youtube.client_secret_env: "YOUTUBE_CLIENT_SECRET_PATH"`
- `apis.youtube.oauth_token_env: "YOUTUBE_OAUTH_TOKEN_PATH"`

그 다음 OS에 환경변수를 설정:
```bash
export ELEVENLABS_API_KEY="..."
export OPENAI_API_KEY="..."
export YOUTUBE_CLIENT_SECRET_PATH="$HOME/.youtube/client_secret.json"
export YOUTUBE_OAUTH_TOKEN_PATH="$HOME/.youtube/token.json"
```

### 2-3. 의존 도구
- `ffmpeg`, `ffprobe` — 04-audio 봇에서 사용 (`brew install ffmpeg`)
- `node` 또는 `python3` — 06번 업로드/이미지 처리 스크립트가 필요로 할 수 있음

### 2-4. (선택) 봇 튜닝
각 봇 `bots/<번호>/config.json` 의 `params` 를 취향에 맞게 한 번만 손봐두면 됩니다.
- 예: `bots/03-script/config.json` 의 `params.wpm_korean`, `params.max_revisions`
- 예: `bots/05-visual/config.json` 의 `design.style_keywords`, `generation.mode`
- 예: `bots/06-edit-upload/config.json` 의 `thumbnails.concept_strategies`

## 3. 영상 한 편 만드는 실제 흐름

### Step 1. 새 프로젝트 생성
```bash
cp -R projects/_example projects/deep-focus-01
```

### Step 2. brief 작성
`projects/deep-focus-01/00-input/brief.md` 채우기 (주제·타겟·길이·금지어)

### Step 3. 실행 (대시보드 권장)
```bash
cd admin && npm run dev    # → http://localhost:3000, "롱폼" 탭에서 단계별 [실행]
```
대시보드 사용법·트러블슈팅은 `admin/README.md`.

> **한 번에 한 단계만 돕니다.** 풀 파이프라인 자동 실행은 정책상 꺼져 있습니다
> (`config/pipeline.json.step_by_step_only`). 각 단계 결과를 보고 다음 단계를 누르세요.

Claude Code 대화로 시킬 수도 있습니다: `deep-focus-01 의 01번 봇 실행해`

#### 또는 터미널 wrapper 사용 (admin 안 거치고 바로)
```bash
# 한 봇만 실행 (admin 의 runBot.ts 와 동일한 model_tier 매핑 사용)
scripts/run-bot.sh 03-script deep-focus-01
scripts/run-bot.sh 04-audio  deep-focus-01 "여성 차분한 톤"

# 숏폼
scripts/run-bot.sh S1-shorts-script my-short --parent deep-focus-01

# 0번 (주제 추천)
scripts/run-topic.sh
scripts/run-topic.sh --niche psychology

# 자막 없는 영상 한 방에 (이미지 + TTS + ffmpeg)
node scripts/build-video.mjs deep-focus-01
```

#### 모델 티어 매핑 (각 봇 `config.json.model_tier`)
| 티어 | 모델 ID | 사용 봇 |
|---|---|---|
| `opus` (4.7) | `claude-opus-4-7` | 01-benchmark · 02-strategy · 03-script (전략적 사고) |
| `sonnet` (4.6) | `claude-sonnet-4-6` | 00-topic · 06-edit-upload · S1-shorts-script (중간 사고) |
| `haiku` (4.5) | `claude-haiku-4-5-20251001` | 04-audio · 05-visual · S2/S3/S4 (절차적/단순 변환) |

admin 대시보드와 터미널 wrapper 가 같은 매핑(`scripts/lib/resolve-model.sh` ↔ `admin/lib/runBot.ts`)을 사용합니다.

### Step 4. 중간 검수
5번까지 끝나면 다음 산출물을 사람이 확인:
- `projects/deep-focus-01/02-strategy/summary.md` — 제목·훅·인트로
- `projects/deep-focus-01/03-script/script.md` — 대본 본문
- `projects/deep-focus-01/04-audio/voice.compressed.wav` — 합성 음성
- `projects/deep-focus-01/05-visual/storyboard.md` — 씬 스토리보드

수정이 필요하면 그 봇만 다시 돌리면 됩니다:
```
deep-focus-01 의 03번만 다시. 인트로를 더 짧게, 도발적으로.
```

### Step 5. 6번 봇 실행 (편집 + 업로드)
영상 OK 라고 판단되면:
```
deep-focus-01 의 06번 진행해. 일단 업로드는 skip.
```

봇이 다음을 만듭니다:
- `06-edit-upload/final.mp4` — ffmpeg로 자동 렌더링된 영상 (자막 burn-in 포함)
- `06-edit-upload/thumbnails/thumb-1.png` ~ `thumb-5.png` (5장)
- `06-edit-upload/upload_metadata.json` — 제목/설명/태그/카테고리

### Step 6. 업로드
```
deep-focus-01 업로드 진행. privacy=unlisted, 영상 파일은 06-edit-upload/final.mp4.
```

봇이 메타와 썸네일을 사용해 YouTube Data API로 업로드합니다.
**기본은 `private`** 이고, `manual_confirm` 모드라서 한 번 더 확인을 받습니다.

## 4. 숏폼(YouTube Shorts) 파이프라인

롱폼 영상 1편을 기반으로 60초 이하 숏폼을 자동 생성합니다.

### 의존 관계
```
롱폼 03-script output → S1-script → S2-audio → S3-edit → S4-upload
```

### 사용 도구
| 단계 | 봇 | 하는 일 |
|---|---|---|
| S1 | S1-shorts-script | 롱폼 대본에서 훅·본문·CTA 추출, 씬별 내러티브 설계 |
| S2 | S2-shorts-audio | 씬별 narration 텍스트 + 자막 큐 작성 |
| S3 | S3-shorts-edit | 이미지 매핑 → `render-shorts.mjs` 실행 → `short.mp4` 생성 |
| S4 | S4-shorts-upload | YouTube Shorts 메타 생성 + 업로드 |

### S3에서 영상이 만들어지는 방법 (CapCut 불필요)
1. 롱폼 `05-visual/scenes/` 이미지를 재사용
2. `say -v Yuna` (macOS 내장 한국어 TTS) 로 씬별 음성 생성
3. `tools/ffmpeg` (libass 포함) 로 이미지 슬라이드쇼 + 음성 + 자막 burn-in
4. 결과: `projects/{slug}/S3-edit/short.mp4`

### 새 숏폼 시작
```bash
# 1. 새 프로젝트 생성
cp -R projects/_example-short projects/my-slug-short

# 2. 입력 파일 작성
# projects/my-slug-short/00-input/brief.md
# projects/my-slug-short/00-input/shorts_meta.json (parent_slug 포함)

# 3. Claude Code에 명령
# "my-slug-short 숏폼 S1~S4 순서대로 실행해줘"
```

### 명령 모음
| 의도 | 한 줄 |
|---|---|
| S1~S4 전체 실행 | `<slug> 숏폼 S1부터 S4까지 실행` |
| 특정 단계만 | `<slug> 숏폼 S3만 다시 (이미지 매핑 수정)` |
| 영상만 재렌더링 | `node scripts/render-shorts.mjs <slug>` |
| 업로드 | `<slug> S4 업로드, privacy=private` |

---

## 5. 안전장치 (요약)

- **휴먼 게이트**: 5번 → 6번 사이, 그리고 업로드 직전에는 항상 사용자 승인이 필요합니다.
- **DRY-RUN 우선**: 비주얼 생성/영상 생성/업로드는 기본이 spec 출력이고, 실제 호출은 명시 승인 시에만.
- **시크릿 분리**: API 키는 절대 `config/global.json` 에 박지 않고 환경변수만 참조합니다.
- **스키마 검증**: 각 단계 출력은 `shared/schemas/*.json` 으로 검증. 실패하면 다음 단계로 안 넘어갑니다.

## 6. 자주 쓰는 명령 모음 (롱폼)

| 의도 | 한 줄 |
|---|---|
| 새 영상 시작 | `<slug> 01번 봇 실행` (이후 단계별로 하나씩) |
| 특정 봇만 재실행 | `<slug> 의 03번 봇 다시` |
| 비주얼 실제 생성 | `<slug> 의 05번 generate 모드로` |
| 6번 진행 (업로드 X) | `<slug> 06번, 업로드는 skip` |
| 업로드 | `<slug> 업로드, privacy=unlisted, 영상은 final.mp4` |
| 톤 조정 | `<slug> 02번 다시. 톤은 더 단호하게` |

## 7. 더 깊이

- 저장소 전체 구조·데이터 흐름·함정: `docs/ARCHITECTURE.md`
- 에이전트용 지도 + 실행 규칙: `CLAUDE.md`, `AGENTS.md`
- 대시보드 사용법·트러블슈팅: `admin/README.md`
- 봇이 정확히 뭘 하는지: 각 `bots/<번호>/prompt.md`
- 입출력 계약: `shared/schemas/*.json`
- 권한·로깅: `.claude/settings.json`
