# 04-audio — 음성 봇

> **역할:** 대본 → TTS 음성 + SRT 자막 + 무음 압축본

## 입력
- `projects/{slug}/03-script/output.json` (필수)
- `config/global.json.apis.tts` (TTS provider/voice 등)

## 출력
- `voice.wav` — 원본 TTS
- `voice.compressed.wav` — 무음 압축본
- `subtitle.srt` — 압축본 타이밍 기준 자막
- `output.json` — 스키마: `shared/schemas/04-audio.schema.json`
- `run.log.md`

## 의존 도구
- `ffmpeg`, `ffprobe` (시스템에 설치되어 있어야 함)
- TTS API 키는 `config/global.json.apis.tts.api_key_env` 가 가리키는 환경변수로 주입

## DRY-RUN
키가 없거나 사용자가 dry-run 을 요청하면 실제 합성 없이 길이만 추정하고 placeholder wav를 만듭니다. 이후 단계 테스트 용도로 충분합니다.

## 튜닝 포인트
| 항목 | 위치 | 의미 |
|---|---|---|
| 씬 사이 휴지 | `tts.pause_between_scenes_ms` | 350ms 권장 |
| 무음 임계 | `silence_compression.threshold_db` | -35dB 기본 |
| 무음 최소 길이 | `silence_compression.min_silence_ms` | 600ms |
| 자막 한 줄 글자수 | `subtitle.max_chars_per_line` | 18 |

## 실행
> "`{slug}` 의 04번 음성 봇 돌려줘. 보이스는 글로벌 설정 그대로."
