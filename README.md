# automake-youtube

> **Claude Code(에이전트)** 가 6개의 봇을 순차/선택 실행해서
> 유튜브 영상 한 편을 **벤치마킹 → 전략 → 대본 → 음성 → 비주얼 → 편집/업로드** 까지
> 자동화하는 하네스. 매번 프롬프트를 새로 짜는 게 아니라, **설정 파일을 한 번 세팅**하면
> 그 다음부터는 슬러그 하나만 주고 봇을 돌리면 됩니다.

## 1. 한눈에 보는 구조

```
automake-youtube/
├─ AGENTS.md              ← Claude Code가 가장 먼저 읽는 운영 매뉴얼
├─ README.md              ← (이 파일) 사람이 읽는 사용 가이드
├─ .claude/settings.json  ← Claude Code 권한·도구·로깅 설정
├─ config/
│  ├─ global.json         ← 채널·브랜드·언어·API 키 placeholder (전역)
│  └─ pipeline.json       ← 봇 실행 순서·의존성
├─ shared/
│  ├─ schemas/            ← 봇 간 입출력 JSON 스키마(계약서)
│  └─ templates/          ← CapCut 베이스 / 썸네일 베이스
├─ bots/
│  ├─ 01-benchmark/       ← 레퍼런스 수집 + 분석
│  ├─ 02-strategy/        ← 컨셉·제목·훅·인트로
│  ├─ 03-script/          ← 기획·집필·검수·리비전
│  ├─ 04-audio/           ← TTS·자막·무음 압축
│  ├─ 05-visual/          ← 씬 설계·이미지·영상 명세
│  └─ 06-edit-upload/     ← CapCut JSON·썸네일 5장·YouTube 업로드
└─ projects/
   ├─ _example/           ← 새 영상 시작 템플릿 (복사해서 사용)
   └─ <slug>/             ← 영상 1편 = 폴더 1개
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

### Step 3. Claude Code에 명령
```
deep-focus-01 풀 파이프라인 시작해. 5번까지만.
```

Claude Code는 `AGENTS.md` → `config/pipeline.json` → 각 봇 `prompt.md` 순으로 읽고
01 → 02 → 03 → 04 → 05 까지 순서대로 돌립니다.

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
- `06-edit-upload/capcut_project.json` — CapCut에 import
- `06-edit-upload/thumbnails/thumb-1.png` ~ `thumb-5.png` (5장)
- `06-edit-upload/upload_metadata.json` — 제목/설명/태그/카테고리

CapCut에서 import → 익스포트 → mp4 확보.

### Step 6. 업로드
```
deep-focus-01 업로드 진행. privacy=unlisted, 영상 파일은 06-edit-upload/final.mp4.
```

봇이 메타와 썸네일을 사용해 YouTube Data API로 업로드합니다.
**기본은 `private`** 이고, `manual_confirm` 모드라서 한 번 더 확인을 받습니다.

## 4. 안전장치 (요약)

- **휴먼 게이트**: 5번 → 6번 사이, 그리고 업로드 직전에는 항상 사용자 승인이 필요합니다.
- **DRY-RUN 우선**: 비주얼 생성/영상 생성/업로드는 기본이 spec 출력이고, 실제 호출은 명시 승인 시에만.
- **시크릿 분리**: API 키는 절대 `config/global.json` 에 박지 않고 환경변수만 참조합니다.
- **스키마 검증**: 각 단계 출력은 `shared/schemas/*.json` 으로 검증. 실패하면 다음 단계로 안 넘어갑니다.

## 5. 자주 쓰는 명령 모음

| 의도 | 한 줄 |
|---|---|
| 새 영상 시작 | `<slug> 풀 파이프라인 시작, 5번까지만` |
| 특정 봇만 재실행 | `<slug> 의 03번 봇 다시` |
| 비주얼 실제 생성 | `<slug> 의 05번 generate 모드로` |
| 6번 진행 (업로드 X) | `<slug> 06번, 업로드는 skip` |
| 업로드 | `<slug> 업로드, privacy=unlisted, 영상은 final.mp4` |
| 톤 조정 | `<slug> 02번 다시. 톤은 더 단호하게` |

## 6. 더 깊이

- 봇이 정확히 뭘 하는지: 각 `bots/<번호>/prompt.md`
- 입출력 계약: `shared/schemas/*.json`
- 에이전트 운영 규칙: `AGENTS.md`
- 권한·로깅: `.claude/settings.json`
