#!/usr/bin/env bash
set -euo pipefail

MAX_ITERS="${1:-12}"
i=1

while [ "$i" -le "$MAX_ITERS" ]; do
  echo "---- RALPH ITERATION $i / $MAX_ITERS ----"
  echo "1) Ensure docs/STORY.md exists and is current."
  echo "2) Agent executes one micro-step, then runs: ./scripts/checks.sh"
  echo "3) If green, write DONE marker into docs/PROGRESS.md and stop."
  echo ""
  echo "NOTE: This script is a human-visible harness. Actual agent loop is controlled by Claude Code Teams."
  i=$((i+1))
done

echo "MAX ITERATIONS REACHED. Lead must decide next step."
exit 1
