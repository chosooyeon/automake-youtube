# automake-youtube — 에이전트 컨텍스트

유튜브 영상 자동화 파이프라인. Claude Code 에이전트가 봇을 순차 실행합니다.

## 핵심 경로
| 경로 | 용도 |
|------|------|
| `bots/{stage}/config.json` | 봇 설정 (입출력·파라미터·모델) |
| `bots/{stage}/prompt.md` | 봇 상세 지시사항 |
| `projects/{slug}/{stage}/output.json` | **성공 판정 기준** — 없으면 실패 |
| `projects/{slug}/{stage}/run.log.md` | 실행 로그 (append) |
| `config/global.json` | 채널·브랜드·API 전역 설정 (`active_niche` + `niches.*` 로 다중 니치 지원) |
| `projects/<slug>/00-input/channel_config.json` | 프로젝트별 resolved 채널 설정 스냅샷. 봇이 global.json 보다 우선 읽음 |
| `shared/schemas/` | 입출력 JSON 스키마 |

## 실행 규칙 (모든 봇 공통)
- **지시된 stage 1개만** 실행한다. 다른 stage 건드리지 않음.
- 산출물은 반드시 `projects/{slug}/{stage}/output.json` 에 저장.
- 로그는 `projects/{slug}/{stage}/run.log.md` 에 append (덮어쓰기 금지).
- 파일 쓰기 전 부모 디렉터리가 없으면 생성한다.
- 완료 후 output.json이 존재하는지 반드시 확인한다.

## 단계 의존성 (롱폼)
00-topic → 01-benchmark → 02-strategy → 03-script → 04-audio → 05-visual → 06-edit-upload

## 단계 의존성 (숏폼)
부모 롱폼 03-script output → S1-script → S2-audio → S3-edit → S4-upload
