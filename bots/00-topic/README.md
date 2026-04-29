# 00-topic — 주제 추천 봇 (파이프라인 외부)

> 이 봇은 **파이프라인의 일부가 아닙니다.**
> 1~6번 봇은 한 영상에 묶여서 돌아가지만, 0번은 **언제든 따로** 돌려서 "이번 주에 뭘 만들지" 후보를 5개 뽑습니다.

## 하는 일

1. `config/global.json.apis.search.primary_sources` (정부 정책 사이트) + 설정된 검색 쿼리로 **최근 30일 트렌딩 주제** 수집
2. 후보를 **5개**로 압축 (`config.params.candidates_count`)
3. 각 후보에 대해:
   - 한 줄 주제 (예: "2026년 하반기 부모급여 인상 안내")
   - 추천 슬러그 (예: `mom-support-2026-05-parent-allowance`)
   - 신청 데드라인 / 시즌성 / 예상 검색량 추정
   - 채널 톤·niche 와의 적합도 0~10
4. 결과를 `topics/queue/<timestamp>.json` 으로 저장
5. 사용자가 어드민에서 1개 고르면 → 자동으로 `projects/<slug>/00-input/brief.md` 생성

## 주제 큐 폴더

```
topics/
├── queue/                     # 추천된 후보들 (아직 영상으로 안 만든 것)
│   └── 2026-04-29-1730.json
└── archive/                   # 프로젝트로 promote 된 후보들
    └── 2026-04-29__mom-support-2026-04.json
```

## 입출력 요약

| 항목 | 경로 |
|---|---|
| 입력 | `config/global.json` (channel, brand, search) |
| 입력 | `topics/archive/*.json` (이미 만든 주제 — 중복 회피용) |
| 입력 | `projects/*/00-input/brief.md` (이미 진행 중인 주제 — 중복 회피용) |
| 출력 | `topics/queue/<timestamp>.json` |
| 로그 | `topics/queue/<timestamp>.log.md` |

## promote 시 동작 (사용자가 어드민에서 후보 선택할 때)

1. 후보 JSON에서 `slug_suggestion`, `topic_oneliner`, `audience`, `must_cover[]` 추출
2. `cp -R projects/_example projects/<slug>` 자동 수행
3. `projects/<slug>/00-input/brief.md` 자동 작성 (템플릿 채워서)
4. queue 파일을 `topics/archive/<date>__<slug>.json` 으로 이동
