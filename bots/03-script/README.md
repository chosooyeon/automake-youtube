# 03-script — 대본 봇

> **역할:** 전략을 받아 **기획 → 집필 → 검수 → 리비전** 4단계로 최종 대본을 만든다.

## 입력
- `projects/{slug}/02-strategy/output.json` (필수)
- `projects/{slug}/01-benchmark/output.json` (구조 참고용)

## 출력
- `projects/{slug}/03-script/output.json` — 스키마: `shared/schemas/03-script.schema.json`
- `projects/{slug}/03-script/script.md` — 사람이 읽는 본
- `projects/{slug}/03-script/run.log.md`

## 4단계 (config.json `phases`)
1. **plan** — 씬 구조/역할/길이 1차 설계
2. **write** — TTS-ready narration 작성
3. **review** — 체크리스트 + 자동실패 조건 점검
4. **revise** — `max_revisions` 회까지 자동 수정

## 튜닝 포인트
| 항목 | 위치 | 의미 |
|---|---|---|
| 목표 길이 | `params.target_duration_sec` | null 이면 global 기본값 사용 |
| 한국어 분당단어 | `params.wpm_korean` | TTS 길이 추정용 (기본 320) |
| 자막 한 줄 글자수 | `params.subtitle_max_chars_per_line` | 기본 18 |
| 최대 리비전 | `params.max_revisions` | 기본 2 |

## 실행
> "`{slug}` 의 03번 대본 봇 실행해줘. 길이는 6분."
