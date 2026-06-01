#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export MPLCONFIGDIR="${MPLCONFIGDIR:-/private/tmp/matplotlib}"
export YOUTUBE_COOKIES_FILE="${YOUTUBE_COOKIES_FILE:-streams/youtube_cookies.txt}"

.venv/bin/python app/auto_relay_manager.py \
  --api-url "${ASSBI_API_URL:-http://13.60.80.234}" \
  --poll-interval "${ASSBI_RELAY_POLL_INTERVAL:-8}"
