# shared/references/

봇이 생성하기 전에 사람이 미리 작성한 참고용 사전 자료.

## 사용 규약

- **봇 산출물이 아님.** 03-script 봇은 이 폴더의 파일을 그대로 복붙하면 안 된다.
- **참고만.** 봇이 동일 주제를 다룰 때 톤·구조·인용 출처의 출발점으로 사용.
- **버전 관리.** 채널/주제별 디렉터리(`psychology/`, `mom_wallet/` 등)로 분리해 정리.

## 디렉터리

```
shared/references/
├─ README.md             ← (이 파일)
├─ psychology/           ← 마음현미경 niche 사전 자료
│  └─ loss-aversion-10min.md   손해의 역설 10분 대본 초안
└─ ...                   ← 향후 niche 추가 시 동일 패턴
```

## 봇이 이 폴더를 사용해야 할 때

- brief.md 의 "## 8. 레퍼런스" 섹션에 이 폴더의 파일 경로가 적혀 있으면 01-benchmark 봇이 우선 참조.
- 03-script 봇은 brief.md 에 적힌 참고 파일을 읽되, narration 은 채널 톤(`brand.tone`)에 맞게 재집필한다.
