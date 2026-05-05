#!/usr/bin/env bash
# 00-topic 봇 실행. 프로젝트 슬러그 없음 (topics/queue/ 에 결과 저장).
#
# 사용:
#   scripts/run-topic.sh [extra_note] [--niche <name>]
#
# 예:
#   scripts/run-topic.sh
#   scripts/run-topic.sh "5월 1주차 트렌드 강조"
#   scripts/run-topic.sh --niche psychology
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/resolve-model.sh
source "$REPO_ROOT/scripts/lib/resolve-model.sh"

NOTE=""
NICHE_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --niche) NICHE_OVERRIDE="$2"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed -n '/^사용/,/^$/p'
      exit 0 ;;
    *) NOTE+="${NOTE:+ }$1"; shift ;;
  esac
done

resolve_model "bots/00-topic" || exit 1

ACTIVE_NICHE="${NICHE_OVERRIDE:-$(node -e "console.log(JSON.parse(require('fs').readFileSync('config/global.json','utf8')).active_niche||'mom_wallet')")}"
CHANNEL_INFO=$(node -e "
const r=JSON.parse(require('fs').readFileSync('config/global.json','utf8'));
const n='$ACTIVE_NICHE';
const ch = n==='mom_wallet' ? r.channel : (r.niches?.[n]?.channel ?? r.channel);
console.log(\`\${ch.name||'?'} / \${ch.niche||'?'}\`);
")

mkdir -p topics/queue
TS=$(date -u +%Y%m%dT%H%M)
LOG="topics/queue/${TS}.log.md"

PROMPT_BODY="AGENTS.md, config/global.json, config/pipeline.json 를 먼저 읽어줘.
이번 실행의 활성 니치: \`$ACTIVE_NICHE\` ($CHANNEL_INFO).
\`config/global.json.active_niche\` 값과 무관하게, 위 니치 기준으로 후보를 뽑아.
니치가 'mom_wallet' 이면 root 의 channel/brand/apis.search 를 그대로 사용.
그 외 니치면 \`niches[$ACTIVE_NICHE]\` 의 channel/brand/apis.search 를 root 위에 deep-merge 한 값을 사용.
slug_suggestion 의 niche_short prefix 도 이 니치에 맞게 (예: psychology → \`psy\`).
그 다음 \`bots/00-topic/prompt.md\` 와 \`bots/00-topic/config.json\` 의 룰을 따라 주제 후보 5개를 뽑아.
출력 \`topics/queue/${TS}.json\` (최상위 \`niche\` 필드 함께 기록).
사람용 요약은 같은 이름의 .md 로 저장.
반드시 archive 와 진행 중인 프로젝트와 중복 회피."

if [[ -n "$NOTE" ]]; then
  PROMPT_BODY+="
추가 요구사항: $NOTE"
fi

{
  echo "## ▶ Topic Run @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- niche: \`$ACTIVE_NICHE\` ($CHANNEL_INFO)"
  echo "- model_tier: $RESOLVED_TIER ($RESOLVED_MODEL)"
  [[ -n "$NOTE" ]] && echo "- note: $NOTE"
  echo ""
  echo '```'
} > "$LOG"

set +e
claude -p "$PROMPT_BODY" --model "$RESOLVED_MODEL" --max-turns "$RESOLVED_MAX_TURNS" 2>&1 | tee -a "$LOG"
EXIT=${PIPESTATUS[0]}
set -e

{
  echo '```'
  echo "- exit_code: $EXIT"
  echo "- finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$LOG"

exit "$EXIT"
