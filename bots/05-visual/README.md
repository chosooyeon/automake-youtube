# 05-visual — 비주얼 봇

> **역할:** 씬별 비주얼 명세 → (선택) 이미지/영상 실제 생성 → CapCut으로 가져갈 중간 표현 JSON

## 입력
- `projects/{slug}/03-script/output.json`
- `projects/{slug}/04-audio/output.json` (씬 타이밍)

## 출력
- `output.json` — 스키마: `shared/schemas/05-visual.schema.json`
- `scenes/scene-XXX/...` — 생성한 이미지/영상 파일들 (생성 모드일 때)
- `storyboard.md` — 사람이 보는 스토리보드

## 3가지 생성 모드 (`config.json.generation.mode`)
| 모드 | 동작 | 언제 |
|---|---|---|
| `spec_only` (기본) | 프롬프트만 작성. 외부 호출 X | 빠른 1회독 / 비용 절약 |
| `local_assets` | 로컬 B-roll 라이브러리에서 매칭 | API 비용 0 |
| `generate` | 실제 이미지/영상 API 호출 | 최종본 만들 때 |

`generate` 모드는 휴먼 게이트가 기본 켜져 있어서, 봇이 한 번 멈추고 비용/씬 수를 보여준 뒤 사용자가 OK해야 진행됩니다.

## 튜닝 포인트
| 항목 | 위치 | 의미 |
|---|---|---|
| 스타일 키워드 | `design.style_keywords` | 모든 이미지에 공통 적용 |
| 씬당 이미지 개수 | `generation.image.per_scene_count` | 1 권장 |
| 씬당 영상 개수 | `generation.video.per_scene_count` | 0이면 영상 생성 안 함 |
| 영상 클립 길이 | `generation.video.duration_sec_per_clip` | 5초 기본 |

## 실행
> "`{slug}` 의 05번 비주얼 봇, 일단 spec_only 로 돌려줘."
> 결과 storyboard.md 보고 OK 하면:
> "이제 generate 모드로 다시 돌려서 실제 이미지 만들어줘."
