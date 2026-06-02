#!/usr/bin/env bash
# Mac에서 DMG 설치 파일을 만듭니다. (Mac + Xcode CLI 도구 필요)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "📦 의존성 설치…"
npm ci

echo "🔨 웹 빌드 + Electron DMG 패키징…"
npm run build:mac

echo ""
echo "✅ 완료! 설치 파일:"
ls -lh release/*.dmg 2>/dev/null || ls -lh release/
