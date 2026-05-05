# psy-2026-05-loss-aversion

심리식탁 채널 첫 영상. **사전 작성 대본 → `scripts/build-video.mjs` 로 자동 생성.**

01-benchmark / 02-strategy 단계는 **스킵**. 사용자가 의뢰한 대본 (`shared/references/psychology/loss-aversion-10min.md`) 을 03-script 산출물 형식으로 변환한 뒤, build-video.mjs 가 03-script + 05-visual 만 읽어 이미지·음성·최종 mp4 까지 한 방에 만든다.

## 📦 산출물

| 파일 | 용도 | git |
|------|------|------|
| `00-input/brief.md` | 영상 개요 | ✅ |
| `00-input/channel_config.json` | 심리식탁 niche 스냅샷 (`@healingtable64`, TTS=ko-KR-InJoonNeural) | ✅ |
| `03-script/output.json` | 13개 씬, narration 은 TTS 친화 (em-dash·따옴표·% 등 모두 제거됨) | ✅ |
| `03-script/script.md` | 사람용 마크다운 (참고) | ✅ |
| `05-visual/output.json` | 13씬 image 프롬프트 + 텍스트 레이어 명세 | ✅ |
| `05-visual/storyboard.md` | 스토리보드 표 (참고) | ✅ |
| `05-visual/scenes/scene-NNN/img-01.png` | Pollinations Flux 생성 이미지 13장 | ❌ (gitignore) |
| `04-audio/scene_audio/scene-NNN.{mp3,wav}` | Edge TTS 한국어 음성 | ❌ (gitignore) |
| `06-edit-upload/scene_clips/scene-NNN.mp4` | 씬별 mp4 (이미지+음성) | ❌ (gitignore) |
| `06-edit-upload/final.mp4` | **최종 영상** (1920x1080, 약 9분 36초, 자막 없음) | ❌ (gitignore) |
| `06-edit-upload/build_meta.json` | 빌드 메타 (TTS voice, 씬별 길이) | ❌ (gitignore) |
| `06-edit-upload/thumbnails.spec.json` | 썸네일 5종 명세 (인물 표정 + 굵은 단어) | ✅ |
| `06-edit-upload/upload_metadata.json` | YouTube 제목·설명·태그·챕터 | ✅ |

## ▶ 빌드 흐름

```bash
# 처음 또는 강제 재생성
node scripts/build-video.mjs psy-2026-05-loss-aversion

# 음성만 다시 (대본 수정 후)
node scripts/build-video.mjs psy-2026-05-loss-aversion --force-audio

# 특정 씬 이미지만 다시
node scripts/build-video.mjs psy-2026-05-loss-aversion --force-image scene-005
```

build-video.mjs 가 알아서:
1. **이미지** — Pollinations.ai (Flux) 로 13장 생성 (캐시됨)
2. **TTS** — channel_config.apis.tts 의 voice/rate 읽어서 Edge TTS 호출
3. **씬 클립** — ffmpeg 로 정적 이미지 + 음성 합성 (zoompan 미사용 → 깜빡임 없음, 0.3s fade-out)
4. **최종 concat** — 모든 씬 mp4 를 재인코딩으로 안전하게 결합 + audio stream 검증

## ▶ 썸네일 / 업로드 (수동)

1. **썸네일**: `06-edit-upload/thumbnails.spec.json` 의 5종 중 1~2장 골라 외부 이미지 도구로 생성 → 1280×720 PNG 로 저장 → CapCut/Photoshop 에서 우측 굵은 단어 + 하단 띠 카피 합성
2. **업로드**: `06-edit-upload/upload_metadata.json` 의 title/description/tags 를 어드민 업로드 모달 또는 YouTube Studio 에 붙여 넣기
   - 채널: `@healingtable64` (psychology niche)
   - 기본 privacy: `private` → 영상 확인 후 public 전환

## ⚠ 주의

- **자막 없음** (사용자 요청). YouTube 자체 자막 기능으로 자동 생성되거나, 필요시 외부 SRT 도구 사용.
- 첫 빌드만 이미지 생성에 시간 소요 (Pollinations 응답 느릴 때 5~10분). 두 번째부터는 캐시.
- TTS 음성 변경하려면 `00-input/channel_config.json` 의 `apis.tts.voice` 수정 후 `--force-audio` 로 재생성.
