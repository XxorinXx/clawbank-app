#!/usr/bin/env bash
set -euo pipefail

echo "== Lint =="
npm run lint

echo "== Typecheck =="
npm run typecheck

echo "== Build =="
npm run build

echo "== Tests =="
npm test
