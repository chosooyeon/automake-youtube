# 02-strategy — 전략 봇

> **역할:** 벤치마킹 결과 + 채널 톤 → 컨셉 / 제목 / 훅 / 인트로 결정

## 입력
- `projects/{slug}/01-benchmark/output.json` (필수)
- `projects/{slug}/00-input/brief.md`
- `config/global.json` 의 `channel`, `brand`

## 출력
- `projects/{slug}/02-strategy/output.json` — 스키마: `shared/schemas/02-strategy.schema.json`
- `projects/{slug}/02-strategy/summary.md`
- `projects/{slug}/02-strategy/run.log.md`

## 튜닝 포인트
| 항목 | 위치 | 의미 |
|---|---|---|
| 제목 후보 개수 | `config.json` `params.title_candidates` | 기본 7 |
| 훅 후보 개수 | `params.hook_candidates` | 기본 4 |
| 제목 길이 제한 | `params.title_max_length` | 기본 45자 |
| 인트로 분량 | `params.intro_target_seconds` | 기본 25초 |
| 클릭베이트 차단 | `guardrails.no_clickbait` | true 권장 |

## 실행
> "`{slug}` 의 02번 전략 봇 실행해줘."

01번 출력이 없으면 봇은 멈추고 01번을 먼저 돌려달라고 보고합니다.
