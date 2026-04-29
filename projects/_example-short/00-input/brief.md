# 숏폼 브리프 — __PARENT_SLUG__ 기반

## 부모 롱폼 프로젝트
- slug: `__PARENT_SLUG__`

## 숏폼 목표
- 롱폼의 가장 임팩트 있는 30~59초를 추출해 YouTube Shorts 제작
- 새 이미지/영상 없이 부모 프로젝트 자산 재사용

## 파이프라인
1. **S1-script**: 롱폼 대본에서 핵심 순간 추출 + 숏폼 대본 작성
2. **S2-audio**: TTS + SRT (59초 미만 필수)
3. **S3-edit**: 롱폼 이미지 재활용, 9:16 CapCut 프로젝트 생성
4. **S4-upload**: YouTube Shorts 업로드 메타데이터 생성

## 작업 순서
각 스텝은 독립적으로 실행. 이전 스텝 output.json 필수.
