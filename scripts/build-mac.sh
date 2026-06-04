#!/usr/bin/env bash
# Mac에서 DMG 설치 파일을 만듭니다. (macOS 필요 — Windows에서는 동작하지 않습니다)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/2] 의존성 설치…"
npm ci

echo "[2/2] 웹 빌드 + Electron DMG 패키징…"
npm run build:mac

echo ""
echo "완료! 설치 파일:"
ls -lh release/*.dmg 2>/dev/null || ls -lh release/
