# psy-2026-05-loss-aversion

심리식탁 채널 첫 영상. **사전 작성 대본 → 음성/이미지 단계로 직접 연결.**

01-benchmark / 02-strategy 단계는 **스킵**. 사용자가 의뢰한 대본 (`shared/references/psychology/loss-aversion-10min.md`) 을 03-script 산출물 형식으로 변환한 뒤, 04~06 단계를 사람이 손으로 실행할 수 있게 명세까지만 만들어 둔 상태.

## 📦 산출물

| 파일 | 상태 | 용도 |
|------|------|------|
| `00-input/brief.md` | ✅ | 영상 개요 |
| `00-input/channel_config.json` | ✅ | 심리식탁 niche 스냅샷 (`@healingtable64`, 인물 표정 썸네일 룰) |
| `01-benchmark/` | ⏭ skip | — |
| `02-strategy/` | ⏭ skip | — |
| `03-script/output.json` | ✅ | 13개 씬, 600s, 자막 라인 분할 완료 |
| `03-script/script.md` | ✅ | 사람용 마크다운 본 |
| `04-audio/output.json` | ✅ | 씬 타이밍 + subtitle_cues |
| `04-audio/narration.srt` | ✅ | 103개 자막 큐 (2.5~7s 단위) |
| `05-visual/output.json` | ✅ | 21개 이미지 프롬프트 (영어, cinematic) |
| `05-visual/storyboard.md` | ✅ | 스토리보드 표 + 톤 가이드 |
| `06-edit-upload/thumbnails.spec.json` | ✅ | 썸네일 5종 명세 (인물 표정 + 굵은 한 단어) |
| `06-edit-upload/upload_metadata.json` | ✅ | 제목·설명·태그·챕터 |

## ▶ 다음 작업 (사람이 할 일)

### 1. 음성 (CapCut)
1. CapCut 에서 새 프로젝트 생성 → 16:9 / 1920×1080 / 30fps
2. `03-script/script.md` 의 각 씬 narration 을 텍스트로 입력
3. 텍스트 읽기(TTS) → 한국어 여성 차분한 목소리, 속도 1.0
4. 결과 오디오를 `04-audio/voice.wav` 로 export
5. (선택) ffmpeg silenceremove 로 무음 압축 → `04-audio/voice_compressed.wav`

```bash
ffmpeg -i 04-audio/voice.wav \
  -af "silenceremove=stop_periods=-1:stop_duration=0.4:stop_threshold=-30dB" \
  04-audio/voice_compressed.wav
```

### 2. 이미지 (Gemini · Imagen · 등)
1. `05-visual/output.json` 에서 각 씬 `layers[].prompt` 복사
2. 이미지 도구에 붙여 16:9 / 1920×1080 생성
3. PNG 를 `05-visual/scenes/scene-XXX/img-XX.png` 로 저장
4. 총 21장. 일관된 톤 유지 위해 같은 모델·같은 시드 사용 권장

### 3. 썸네일 (Gemini · 별도 디자인)
1. `thumbnails.spec.json` 의 5장 중 1~2장 골라 생성
2. `background_image_prompt` 로 인물 표정 사진 생성 → CapCut/Photoshop 에서 우측 굵은 단어 + 하단 띠 카피 합성
3. 1280×720 PNG 로 저장

### 4. 편집 (CapCut)
1. 음성 트랙 + 이미지들 + `narration.srt` import
2. `05-visual/output.json` 의 씬 타이밍·in_anim·out_anim 참고
3. Pretendard Bold 폰트 다운로드 (이미 brand.font_pair 지정)
4. 핵심 숫자(2.25배, 80%, 100만원) 등장 시점에 빨간 카드 + 0.3s zoom-pop (number_card_motion)
5. ding/whoosh SFX 는 `shared/templates/sfx/` 에 파일 없으면 CapCut 내장으로 대체
6. 최종 `06-edit-upload/final.mp4` 로 export

### 5. 업로드
- `upload_metadata.json` 의 title/description/tags 를 YouTube Studio 에 그대로 붙여넣기
- 또는 어드민 → 업로드 모달에서 channel slot 선택 후 자동 업로드
- 기본 privacy = `private`. 사람이 영상 확인 후 public 전환

## ⚠ 주의

- `narration.srt` 의 큐 시간은 **균등 분할 추정값**. CapCut TTS 결과의 실제 발음 속도에 맞춰 미세 조정 필요. CapCut 자체 자막 정렬 기능 활용 권장.
- 이미지 모델이 한글 텍스트를 잘 못 그리니, 한국어 자막은 반드시 **CapCut 텍스트 레이어**로 따로 올릴 것.
- 썸네일에 인물 사진을 넣을 땐 **상업적으로 안전한 사용 권한** 확인 (Pexels/Unsplash 무료 인물 또는 본인 직접 촬영, AI 생성 인물도 OK).
