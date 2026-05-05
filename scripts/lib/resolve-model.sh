#!/usr/bin/env bash
# 공유 헬퍼: 봇 config.json 의 model_tier 를 읽어 모델 ID 와 max_turns 를 환경변수로 export.
# 사용: source scripts/lib/resolve-model.sh <bot_dir>  (예: bots/03-script)
# admin/lib/runBot.ts 의 MODEL_TIERS 와 동일 매핑.

resolve_model() {
  local bot_dir="$1"
  local cfg="$bot_dir/config.json"
  if [[ ! -f "$cfg" ]]; then
    echo "❌ Config not found: $cfg" >&2
    return 1
  fi
  local tier
  tier=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$cfg','utf8')).model_tier||'sonnet')")
  case "$tier" in
    haiku)  RESOLVED_MODEL="claude-haiku-4-5-20251001" ;;
    sonnet) RESOLVED_MODEL="claude-sonnet-4-6" ;;
    opus)   RESOLVED_MODEL="claude-opus-4-7" ;;
    *)      RESOLVED_MODEL="claude-sonnet-4-6" ;;
  esac
  RESOLVED_TIER="$tier"
  RESOLVED_MAX_TURNS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$cfg','utf8')).max_turns||25)")
  export RESOLVED_MODEL RESOLVED_TIER RESOLVED_MAX_TURNS
}
