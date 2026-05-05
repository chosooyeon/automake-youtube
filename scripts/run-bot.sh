#!/usr/bin/env bash
# 봇 1개를 터미널에서 실행. admin 의 runBot.ts 와 동일한 prompt + model_tier 매핑 사용.
#
# 사용:
#   scripts/run-bot.sh <stage> <slug> [extra_note]
#   scripts/run-bot.sh S1-shorts-script <slug> --parent <parent_slug> [extra_note]
#
# 예:
#   scripts/run-bot.sh 03-script psy-2026-05-loss-aversion
#   scripts/run-bot.sh 04-audio  psy-2026-05-loss-aversion "voice_id 는 여성_차분한"
#   scripts/run-bot.sh S1-shorts-script my-short --parent psy-2026-05-loss-aversion
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/resolve-model.sh
source "$REPO_ROOT/scripts/lib/resolve-model.sh"

usage() {
  cat <<EOF
Usage:
  scripts/run-bot.sh <stage> <slug> [extra_note]
  scripts/run-bot.sh <S?-stage> <slug> --parent <parent_slug> [extra_note]

Examples:
  scripts/run-bot.sh 03-script psy-2026-05-loss-aversion
  scripts/run-bot.sh 04-audio  psy-2026-05-loss-aversion "여성 차분한 톤"
  scripts/run-bot.sh S1-shorts-script my-short --parent psy-2026-05-loss-aversion
EOF
}

[[ $# -lt 2 ]] && { usage; exit 1; }

STAGE="$1"; shift
SLUG="$1"; shift
PARENT=""
NOTE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parent) PARENT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) NOTE+="${NOTE:+ }$1"; shift ;;
  esac
done

resolve_model "bots/$STAGE" || exit 1

DIR="projects/$SLUG/$STAGE"
mkdir -p "$DIR"
LOG="$DIR/run.log.md"

PROMPT_BODY="먼저 이 프로젝트의 채널 설정을 로드해.
우선순위 1: \`projects/$SLUG/00-input/channel_config.json\` (있으면 channel/brand/video_defaults/apis 의 source of truth.)
우선순위 2: \`config/global.json\` (1이 없을 때만)
그다음 \`bots/$STAGE/prompt.md\` 와 \`bots/$STAGE/config.json\` 을 읽고,
\`projects/$SLUG/$STAGE/\` 봇을 실행해줘.
결과 산출물: \`projects/$SLUG/$STAGE/output.json\`
로그: \`projects/$SLUG/$STAGE/run.log.md\` 에 append."

if [[ -n "$PARENT" ]]; then
  PROMPT_BODY+="
부모 롱폼 프로젝트: \`projects/$PARENT/\` (자산/대본 재사용)"
fi

if [[ -n "$NOTE" ]]; then
  PROMPT_BODY+="
추가 요구사항: $NOTE"
fi

{
  echo ""
  echo "## ▶ Run @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- slug: \`$SLUG\`"
  echo "- stage: \`$STAGE\`"
  echo "- model_tier: $RESOLVED_TIER ($RESOLVED_MODEL)"
  [[ -n "$PARENT" ]] && echo "- parent: \`$PARENT\`"
  [[ -n "$NOTE" ]] && echo "- note: $NOTE"
  echo ""
  echo '```'
} >> "$LOG"

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
