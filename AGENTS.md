# automake-youtube — Claude Code Agent 하네스

이 저장소는 **Claude Code(에이전트)** 가 6개의 전용 봇을 순차/선택 실행해
유튜브 영상 한 편을 **벤치마킹 → 전략 → 대본 → 음성 → 비주얼 → 편집/업로드**
까지 자동화하는 하네스입니다.

> 사람이 매번 프롬프트를 새로 짜는 게 아니라, **각 봇 폴더의 `config.json` + `prompt.md`** 를
> 설정 파일처럼 두고, Claude Code가 그 설정을 읽어 실행만 하면 됩니다.

---

## 1. 폴더 구조

```
automake-youtube/
├─ AGENTS.md                 ← (이 파일) Claude Code가 가장 먼저 읽음
├─ README.md                 ← 사람을 위한 사용법
├─ .claude/
│  └─ settings.json          ← Claude Code 권한/도구 설정
├─ config/
│  ├─ global.json            ← 채널·브랜드·언어·API 등 전역 설정
│  └─ pipeline.json          ← 봇 실행 순서·의존성 정의
├─ shared/
│  ├─ schemas/               ← 단계별 입출력 JSON 스키마 (계약서)
│  └─ templates/             ← CapCut 템플릿, 썸네일 템플릿 등
├─ bots/
│  ├─ 01-benchmark/          ← 레퍼런스 수집 + 분석
│  ├─ 02-strategy/           ← 컨셉·제목·훅·인트로
│  ├─ 03-script/             ← 기획·집필·검수·리비전
│  ├─ 04-audio/              ← TTS·자막·무음 압축
│  ├─ 05-visual/             ← 씬 설계·이미지·영상
│  └─ 06-edit-upload/        ← CapCut JSON·썸네일·YouTube 업로드
└─ projects/
   └─ <영상 슬러그>/         ← 한 영상 = 한 폴더 (입력·중간산출·최종)
      ├─ 00-input/
      ├─ 01-benchmark/
      ├─ 02-strategy/
      ├─ 03-script/
      ├─ 04-audio/
      ├─ 05-visual/
      └─ 06-edit-upload/
```

각 봇 폴더는 항상 다음 3개 파일로 구성됩니다.

| 파일 | 역할 |
|---|---|
| `README.md` | 봇이 뭘 하는지 사람이 읽을 설명 |
| `config.json` | 봇의 **설정값**(모델·길이·톤·옵션). 매 실행마다 바꿀 필요 없음 |
| `prompt.md` | Claude에게 줄 **시스템/작업 지시문** (실행 시 Claude가 그대로 따름) |

---

## 2. Claude Code가 작업을 받았을 때 따라야 하는 절차

> 이 섹션은 **에이전트 자신**(Claude Code)을 위한 운영 매뉴얼입니다.

### 2-1. 컨텍스트 로드 (모든 작업 공통)

1. `config/global.json` 을 읽어 채널/언어/브랜드 톤을 파악한다.
2. `config/pipeline.json` 을 읽어 봇 의존성을 파악한다.
3. 사용자가 지정한 프로젝트 슬러그(`projects/<slug>/`)가 없으면 새로 만든다.
   - 슬러그가 명시되지 않았으면 사용자에게 한 번 묻는다.
4. 작업 대상 봇의 `bots/<번호-이름>/prompt.md` 와 `config.json` 을 읽는다.
5. 해당 봇의 `prompt.md` 가 정의한 **출력 JSON 스키마**(shared/schemas) 를 그대로 따른다.

### 2-2. 실행 규칙

- **입력은 직전 단계의 `projects/<slug>/<이전봇>/output.json`** 을 읽어서 사용한다.
- **출력은 반드시 `projects/<slug>/<현재봇>/output.json`** 으로 저장한다.
  추가 산출물(파일·이미지·오디오)은 같은 폴더 하위에 저장한다.
- 각 단계는 **검수 로그** 를 `projects/<slug>/<현재봇>/run.log.md` 에 남긴다.
  (사용한 모델, 입력 요약, 의사결정 근거, 실패/재시도 내역)
- 외부 API 키는 `config/global.json` 의 placeholder 만 참조한다.
  실제 키는 `.env` 또는 OS 환경변수로 사용자에게 안내한다 (커밋 금지).

### 2-3. 단일 봇 실행 / 풀 파이프라인 실행

- 사용자가 **"01번만 돌려"** 라고 하면 해당 봇만 실행한다.
- 사용자가 **"풀 파이프라인 / 끝까지 / 자동"** 이라고 하면 `pipeline.json` 의 `default_order` 를 따라 1→6 순서로 실행하되, **5번까지 끝나면 6번 직전에 사람 검수(휴먼 게이트)를 요청** 한다.
  (사용자가 영상 결과를 확인한 뒤 OK 해야 6번이 돌아감)

### 2-4. 안전장치

- 비용/시간이 큰 작업(이미지 대량 생성, 영상 생성, 업로드)은 실행 전 **DRY-RUN 요약**을 보여주고 승인 받는다.
- YouTube 업로드는 **반드시** `config/global.json.youtube.upload_mode` 가 `"manual_confirm"` 이거나, 사용자가 명시 승인했을 때만 진행한다.
- 잘못된 입력/스키마 위반은 다음 단계로 넘어가기 전에 멈추고 보고한다.

---

## 3. 한 줄 명령 예시 (사용자 → Claude Code)

- "벤치마킹부터 대본까지 돌려줘. 주제는 '딥포커스 학습법', 슬러그는 `deep-focus-01`."
- "`deep-focus-01` 의 5번 비주얼 봇만 다시 돌려. 톤은 더 시네마틱하게."
- "`deep-focus-01` 영상 확인했어. 6번 편집+업로드 진행해. 제목·설명은 02번 결과 그대로."

---

## 4. 새 영상 시작 체크리스트

1. `projects/<slug>/00-input/brief.md` 에 주제·타겟·길이·금지어 작성
2. Claude Code에 "이 슬러그로 풀 파이프라인 시작" 지시
3. 5번 끝난 뒤 CapCut에서 영상 확인
4. OK면 "6번 진행", 수정 필요하면 해당 봇만 재실행
