# 01-benchmark — 벤치마킹 봇

> **역할:** 주제를 주면, 잘 되는 유튜브 영상들을 모아 패턴을 분석한다.

## 입력
- `projects/{slug}/00-input/brief.md` (주제·타겟·금지어 등)
- (선택) 사용자가 직접 넣은 레퍼런스 URL 목록

## 출력
- `projects/{slug}/01-benchmark/output.json` (스키마: `shared/schemas/01-benchmark.schema.json`)
- `projects/{slug}/01-benchmark/summary.md` (사람이 읽는 요약)
- `projects/{slug}/01-benchmark/run.log.md` (실행 로그)

## 설정 파일
- `config.json` — 검색 범위, 최소 레퍼런스 개수, 분석 축
- `prompt.md` — 실제 작업 지시문

## 어떻게 실행하나
Claude Code에 다음과 같이 말하면 됩니다:

> "`{slug}` 프로젝트에서 01번 벤치마킹 봇 돌려줘."

Claude Code는 자동으로:
1. `config/global.json` + 이 폴더의 `config.json` 읽기
2. `prompt.md` 의 지시를 수행
3. 레퍼런스 수집 → 영상별 분석 → 종합 → JSON 저장

## 튜닝 포인트 (`config.json`)
- `params.min_references` — 최소 몇 개 모을지
- `params.lookback_days` — 며칠 이내 영상까지 볼지
- `params.min_views` — 조회수 하한
- `analysis.axes` — 어떤 축으로 분석할지
