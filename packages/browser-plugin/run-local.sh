#!/usr/bin/env bash
#
# Run the browser-plugin entry.ts directly (no Docker).
# Starts Xvfb, installs deps, compiles, and runs the entry point.
#
# Required env vars:
#   ANTHROPIC_API_KEY   — API key for Claude
#   BROWSER_PROMPT      — the browsing task
#
# Optional env vars:
#   BROWSER_START_URL   — URL to navigate to first
#   BROWSER_MAX_TURNS   — max agent iterations (default 30)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"

# This script might be triggered by claude and needs recursive access
unset CLAUDECODE

# ── Xvfb ──────────────────────────────────────────────────────────────
export DISPLAY="${DISPLAY:-:99}"
export CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}"
export PUPPETEER_SKIP_DOWNLOAD=true

if ! xdpyinfo -display "$DISPLAY" &>/dev/null 2>&1; then
  echo "[run-local] Starting Xvfb on $DISPLAY" >&2
  Xvfb "$DISPLAY" -screen 0 1280x720x24 -nolisten tcp &>/dev/null &
  XVFB_PID=$!
  trap "kill $XVFB_PID 2>/dev/null || true" EXIT
  sleep 0.5
fi

# ── Install deps & compile ────────────────────────────────────────────
cd "$DOCKER_DIR"

if [ ! -d node_modules ]; then
  echo "[run-local] Installing dependencies..." >&2
  npm install --ignore-scripts
fi

echo "[run-local] Compiling entry.ts..." >&2
npx tsc

# ── Run ───────────────────────────────────────────────────────────────
echo "[run-local] Starting browser agent" >&2
exec node dist/entry.js
