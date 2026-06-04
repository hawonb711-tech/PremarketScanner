# Windows에서 설치 파일(.exe)을 만듭니다. (Windows + Node.js 필요)
# 실행: PowerShell에서  powershell -ExecutionPolicy Bypass -File scripts\build-win.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# ── winCodeSign 캐시 우회 ──────────────────────────────────────────────
# electron-builder는 Windows 빌드 시 서명 도구(winCodeSign)를 받아 압축을 푸는데,
# 그 안에 macOS용 심볼릭 링크가 들어 있어 "개발자 모드"가 꺼진 PC에서는 실패한다.
# darwin(macOS) 파일을 제외하고 미리 풀어두면 electron-builder가 재압축 해제를 건너뛴다.
$cache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
if (-not (Test-Path (Join-Path $cache "windows-10\x64\signtool.exe"))) {
  Write-Host "[준비] winCodeSign 캐시 시드 (개발자 모드 불필요)..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path $cache | Out-Null
  $archive = Join-Path $env:TEMP "winCodeSign-2.6.0.7z"
  if (-not (Test-Path $archive)) {
    Invoke-WebRequest -UseBasicParsing `
      -Uri "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z" `
      -OutFile $archive
  }
  $sevenZip = "node_modules\7zip-bin\win\x64\7za.exe"
  if (Test-Path $sevenZip) {
    & $sevenZip x $archive "-o$cache" "-xr!darwin" -y | Out-Null
  } else {
    Write-Host "  (7za.exe 없음 — npm install 후 자동 시드됩니다)" -ForegroundColor DarkYellow
  }
}

Write-Host "[1/2] 의존성 설치..." -ForegroundColor Cyan
npm install

Write-Host "[2/2] 웹 빌드 + Electron Windows 패키징..." -ForegroundColor Cyan
npm run build:win

Write-Host ""
Write-Host "완료! 설치 파일 위치: release\" -ForegroundColor Green
Get-ChildItem release\*.exe | ForEach-Object {
  "{0,-45} {1,6} MB" -f $_.Name, [math]::Round($_.Length / 1MB, 1)
}
