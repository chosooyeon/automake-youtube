# AGENTS.md

이 저장소의 에이전트 컨텍스트는 **`CLAUDE.md` 하나로 통합**되어 있다.
(더 자세한 지도는 `docs/ARCHITECTURE.md`)

- `CLAUDE.md` — 전체 지도 + 실행 규칙. 세션 시작 시 이것만 읽으면 된다.
- `docs/ARCHITECTURE.md` — 트랙별 데이터 흐름, admin 라우트/lib 표, 함정 목록.
- `README.md` — 사람이 읽는 사용 가이드.
- `bots/{stage}/prompt.md` — 봇의 실제 지시문(두뇌). 봇 동작 변경은 여기서.

## 봇 실행 요약 (CLAUDE.md 와 동일, 단독으로 읽는 도구를 위한 사본)

1. 채널 설정 로드: `projects/{slug}/00-input/channel_config.json` 이 있으면 그것이 우선,
   없으면 `config/global.json`.
2. `bots/{stage}/prompt.md` + `config.json` 을 읽고 **지시된 stage 1개만** 실행한다.
3. 입력은 직전 단계의 `projects/{slug}/{prev-stage}/output.json`.
4. 출력은 반드시 `projects/{slug}/{stage}/output.json` (없으면 실패로 판정된다).
   추가 산출물(이미지·오디오·영상)은 같은 폴더 하위에 저장.
5. 로그는 `projects/{slug}/{stage}/run.log.md` 에 **append** (덮어쓰기 금지).
6. 출력은 `shared/schemas/{stage}.schema.json` 계약을 지킨다.
7. 파일 쓰기 전 부모 디렉터리가 없으면 생성하고, 완료 후 output.json 존재를 확인한다.

## 안전장치

- 한 번에 한 단계만. 풀 파이프라인 자동 실행은 정책상 비활성
  (`config/pipeline.json.step_by_step_only`).
- `05-visual` 다음은 **휴먼 게이트** — 사람 확인 후 `06-edit-upload`.
- 비용/시간이 큰 작업(이미지 대량 생성·영상 생성·업로드)은 DRY-RUN 요약 후 승인받는다.
- 업로드는 기본 `private`, 사용자 명시 승인 필요.
- API 키는 `.env`/환경변수만. `config/global.json` 에 실제 키를 넣지 않는다.
