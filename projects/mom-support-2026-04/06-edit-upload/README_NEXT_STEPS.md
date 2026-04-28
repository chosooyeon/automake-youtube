# 다음 단계 — 사람이 손으로 해야 할 일

> 자동 봇은 1~5단계 + 6단계 ‘기획·메타·CapCut 레시피’까지 끝냈습니다.
> 아래는 **사용자(=영상 제작자)가 직접 해야 하는 휴먼 게이트** 작업입니다.

---

## ① Gemini 나노바나나로 이미지 9장 생성 (배경) + 썸네일 5장

### 1-A. 9개 씬 배경
1. `gemini.google.com` 접속 → 본인 구글 계정 로그인 (한 번)
2. `projects/mom-support-2026-04/05-visual/storyboard.md` 열기
3. scene-001 부터 순서대로 영문 프롬프트를 채팅창에 붙여넣고 “1920x1080 16:9” 명시
4. 받은 이미지를 다음 경로로 저장:
   ```
   projects/mom-support-2026-04/05-visual/scenes/scene-001/bg.png
   projects/mom-support-2026-04/05-visual/scenes/scene-002/bg.png
   ... (~ scene-009)
   ```

### 1-B. 썸네일 5장
1. `projects/mom-support-2026-04/06-edit-upload/thumbnails.json` 열기
2. 각 candidate의 `prompt` 를 Gemini에 붙여넣고 1280x720 이미지 생성
3. `06-edit-upload/thumbnails/` 폴더 만들고 5장 저장 (`thumb-01-shock.png` 등)
4. 한국어 헤드라인은 Gemini가 깨끗히 못 만드므로 → CapCut 또는 피그마에서 후처리로 얹기
5. 5장 중 1장 골라 `06-edit-upload/thumbnails/selected.png` 로 저장

---

## ② CapCut으로 영상 만들기

1. CapCut Mac 앱 실행
2. 새 프로젝트 → 캔버스 1920x1080, 30fps
3. `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/mom-support-2026-04-references/` 폴더에
   레시피 파일들이 모두 들어있습니다. (CapCut 안에서 ‘파일 가져오기’로 활용)
4. **Build Recipe** (`capcut_project.json` 의 `build_recipe_steps` 10단계를 그대로 따라가면 됩니다.)
5. **TTS**: `capcut_tts_input.txt` 의 9개 씬 텍스트를 한 씬씩 ‘텍스트 → 텍스트 읽기’ 메뉴로 변환
   (한국어 차분한 여성 보이스 권장)
6. **자막**: `subtitle.srt` 를 자막 트랙에 import (또는 CapCut 자동 자막 후 SRT와 비교 보정)
7. **BGM**: CapCut 무료 음원 → ‘calm acoustic piano’ 1곡, 음량 0.15 (음성 -16dB)
8. **무음 제거**: 오디오 트랙 → ‘무음 감지/삭제’
9. Export → 1080p 30fps mp4 → `projects/mom-support-2026-04/06-edit-upload/final.mp4` 로 저장

---

## ③ 사용자 검수 (휴먼 게이트)

다음을 직접 확인해주세요:
- [ ] 정책 수치가 정확한가? (특히 부모급여 0세 100만원 / 1세 50만원, 첫만남 200/300, 국민행복카드 100/140)
- [ ] ‘2026년 4월 27일 기준’ 자막이 인트로와 영상 끝(scene-009)에 모두 있는가?
- [ ] 자극·과장 카피('대박', '안 받으면 손해', '공돈')가 없는가?
- [ ] 광고/협찬 문구가 없는가?
- [ ] 썸네일 1장(selected.png)이 결정되었는가?

---

## ④ YouTube 업로드 (휴먼 게이트 통과 후)

### 4-A. 최초 1회 셋업 (앞으로 모든 영상에 재사용)

1. Google Cloud Console (`console.cloud.google.com`) 접속
2. 새 프로젝트 생성 → ‘YouTube Data API v3’ 사용 설정
3. ‘OAuth 2.0 클라이언트 ID’ 발급 (애플리케이션 유형: 데스크톱 앱)
4. `client_secret.json` 다운로드 → 본인 안전한 위치에 저장 (예: `~/secrets/youtube/client_secret.json`)
5. 환경변수 설정 (zshrc):
   ```bash
   export YOUTUBE_CLIENT_SECRET_PATH="$HOME/secrets/youtube/client_secret.json"
   export YOUTUBE_OAUTH_TOKEN_PATH="$HOME/secrets/youtube/token.json"
   ```
6. 첫 업로드 시 브라우저 인증 1번 → 이후 token.json 으로 자동 갱신

### 4-B. 업로드 시점

- `upload_metadata.json` 의 `upload_mode` 가 `manual_confirm` 으로 잡혀 있습니다.
- 사용자가 “업로드 진행” 이라고 말하면, 6번 봇이 `upload_metadata.json` + `final.mp4` + `selected.png` + `subtitle.srt` 를 묶어 YouTube API로 업로드합니다.
- 기본 공개범위는 `private` (테스트). `public` 으로 바꾸려면 `upload_metadata.json` 의 `privacy` 수정.

---

## 산출물 한 번에 보기

```
projects/mom-support-2026-04/
├── 00-input/brief.md
├── 01-benchmark/output.json + summary.md
├── 02-strategy/output.json + summary.md
├── 03-script/output.json + script.md
├── 04-audio/output.json + subtitle.srt
├── 05-visual/output.json + storyboard.md (+ scenes/scene-XXX/bg.png ← Gemini로 직접 채움)
└── 06-edit-upload/
    ├── capcut_project.json          # CapCut 빌드 레시피
    ├── capcut_tts_input.txt         # TTS에 그대로 붙여넣을 9개 씬 텍스트
    ├── thumbnails.json              # Gemini 프롬프트 5장
    ├── upload_metadata.json         # YouTube 업로드 메타
    ├── README_NEXT_STEPS.md         # 이 문서
    ├── thumbnails/                  ← 직접 채움 (selected.png)
    └── final.mp4                    ← CapCut export 후 저장
```

CapCut에서 작업할 때 참고하시기 좋게, 같은 자료 사본을 여기에도 두었습니다:
`~/Movies/CapCut/User Data/Projects/com.lveditor.draft/mom-support-2026-04-references/`
