# `_example` 프로젝트 — 새 영상의 출발 템플릿

이 폴더를 통째로 복사해서 새 슬러그(예: `deep-focus-01`)로 이름을 바꾼 뒤 사용합니다.

```
cp -R projects/_example projects/<새-슬러그>
```

폴더 구조:
```
<slug>/
  00-input/brief.md      ← 사람이 채움 (필수)
  01-benchmark/          ← 01번 봇이 채움
  02-strategy/           ← 02번 봇이 채움
  03-script/             ← 03번 봇이 채움
  04-audio/              ← 04번 봇이 채움 (voice.wav, voice.compressed.wav, subtitle.srt)
  05-visual/             ← 05번 봇이 채움 (scenes/, output.json, storyboard.md)
  06-edit-upload/        ← 06번 봇이 채움 (capcut_project.json, thumbnails/, upload_metadata.json)
```

## 새 영상 만드는 흐름

1. 폴더 복사 → `00-input/brief.md` 채우기
2. Claude Code에 한 줄 명령:
   > "`<새-슬러그>` 풀 파이프라인 시작. 단, 5번까지만."
3. 5번까지 끝나면 `05-visual/storyboard.md` 와 `04-audio/voice.compressed.wav` 로 영상 미리 확인
4. CapCut 에서 임시 import 해보고 (혹은 봇이 만든 명세 그대로 신뢰하고)
5. OK면 → "06번 진행해, 단 업로드는 일단 skip"
6. CapCut에서 익스포트해서 영상 파일 손에 넣기
7. 좋으면 → "이제 업로드해, privacy=unlisted 로"
