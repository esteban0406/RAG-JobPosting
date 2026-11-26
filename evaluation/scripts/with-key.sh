#!/usr/bin/env bash
# Runs a command with JUDGE_API_KEY set to one provider's key from Tesis/.env
# (git-ignored), without printing it. For the paid evaluation calls: judges,
# RAGAS and anything else that reads JUDGE_API_KEY.
#
# Usage (from the repository root or from backend/):
#   bash evaluation/scripts/with-key.sh openai|anthropic <command> [args...]
# Examples:
#   cd backend && bash ../evaluation/scripts/with-key.sh openai \
#       node dist/src/cli/main.js eval:judge --run <dir> --judge-base-url https://api.openai.com/v1 \
#       --judge-model gpt-6-sol --judge-reasoning-effort none
#   bash evaluation/scripts/with-key.sh openai docker run --rm --network host -e JUDGE_API_KEY ... jobai-ragas ...
#
# Groq generations do not need it: the backend reads GROQ_API_KEY from backend/.env.
set -euo pipefail
ENV_FILE="$(cd "$(dirname "$0")/../.." && pwd)/Tesis/.env"
case "${1:-}" in
  openai) VAR=OpenAI_API_KEY ;;
  anthropic) VAR=Anthropic_API_KEY ;;
  *) echo "usage: $0 openai|anthropic <command> [args...]" >&2; exit 2 ;;
esac
shift
[ "$#" -gt 0 ] || { echo "missing command" >&2; exit 2; }
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
KEY="$(sed -n "s/^${VAR}=//p" "$ENV_FILE" | tr -d '[:space:]')"
[ -n "$KEY" ] || { echo "$VAR is empty in $ENV_FILE" >&2; exit 1; }
export JUDGE_API_KEY="$KEY"
unset KEY
exec "$@"
