# 06-edit-upload — 편집 + 업로드 봇

> **역할:** CapCut 프로젝트 JSON 빌드 + 썸네일 5장 + YouTube 업로드 메타 + (승인 시) 실제 업로드

## 휴먼 게이트
이 봇은 **5번까지 끝나고 사용자가 영상을 확인한 뒤** 실행되는 게 기본입니다.
업로드는 항상 사용자가 한 번 더 명시적으로 승인해야 진행됩니다.

## 입력
- `02-strategy/output.json` — 제목/키워드
- `04-audio/output.json` — voice/subtitle 경로
- `05-visual/output.json` — 씬·레이어 명세
- `shared/templates/capcut_base.json`
- `shared/templates/thumbnail_base.json`

## 출력
- `capcut_project.json` — CapCut에 import 할 프로젝트 파일
- `thumbnails/thumb-1.png` ~ `thumb-5.png` (또는 `*.spec.json`)
- `upload_metadata.json` — YouTube 업로드용 메타
- `output.json` — 스키마: `shared/schemas/06-edit-upload.schema.json`
- `run.log.md`

## 사용 흐름
1. 5번까지 끝남 → CapCut에 임시 영상 만들거나 storyboard로 확인
2. 영상 OK → "06번 편집 봇 진행" 지시
3. 봇이 CapCut JSON + 썸네일 5장 + 업로드 메타 만든 뒤 멈춤
4. 사용자가 CapCut에서 import → 익스포트 → 영상 파일 확보
5. "이제 업로드해" 라고 하면 봇이 업로드 메타 + 영상 파일을 YouTube API로 올림
6. `output.json.upload_result` 에 video_id 기록

## 튜닝 포인트
| 항목 | 위치 | 의미 |
|---|---|---|
| 썸네일 컨셉 5종 | `config.thumbnails.concept_strategies` | 카피/구도 전략 |
| 썸네일 카피 글자수 | `config.thumbnails.headline_max_chars` | 14자 권장 |
| 업로드 자동성 | `config.upload.enabled_default` | 기본 false (안전) |
| 업로드 공개 범위 | `global.apis.youtube.default_privacy` | private 권장 |

## API 키 / OAuth
- `config/global.json.apis.youtube.client_secret_env` 가 가리키는 환경변수에 클라이언트 시크릿 JSON 경로
- `oauth_token_env` 가 가리키는 환경변수에 access/refresh 토큰 경로
- 환경변수 없으면 봇은 업로드를 시도하지 않고 사용자에게 안내합니다.
