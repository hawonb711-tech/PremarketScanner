# 프리마켓 급등주 스캐너

미국 프리마켓에서 많이 오른 종목을 자동으로 뽑고, **"왜 올랐는지"** 뉴스·이슈를 한눈에 정리해주는 도구입니다. (기존 다른 프로젝트와 무관한 독립 프로젝트)

| 종목 | 상승률 | 현재가 | 거래량 | 주요 이슈 | 신뢰도 | 매매 | 위험도 |
|------|--------|--------|--------|-----------|--------|------|--------|
| MRVL | +27% | $278 | 높음 | AI 커스텀 칩 기대 | ●●●●● | A | 중간 |
| HPE  | +25% | $59  | 매우 높음 | AI 서버 실적 호조 | ●●●●○ | B | 중간 |

## 핵심 기능

1. **프리마켓 상승률 순위** — 큐레이션된 대형·중형주 유니버스(약 120종목, Nasdaq/NYSE)를 스캔해 전일 종가 대비 상승률로 정렬. 상승률/가격/거래량/시총 tier로 필터링(잡주·페니주 자동 배제).
2. **"왜 올랐는지" 자동 요약** — 종목마다 급등 사유를 한국어 1~2문장으로 요약 (OpenAI 웹검색 기반).
3. **이슈 카테고리 자동 분류** — 실적/가이던스/AI/목표가 상향/M&A/대형 계약/CEO 발언/FDA·임상/숏스퀴즈/거시 등. **"뉴스 없음 급등"** 은 위험 표시.
4. **급등 신뢰도 점수(0~5) + 매매 적합도(A/B/C/D)** — 사유의 출처 신뢰도와 거래량·시총·과열 여부를 종합.
5. **프리마켓 고점 대비 위치** — 프리마켓 고점, 고점 대비, 전일 종가 대비, 시초가 대비를 표시하고 "고점 근접 시 익절 구간" 경고.
6. **관련주 같이 보기** — 같은 테마 관련주 티커를 함께 제시.

## 데이터 출처

- **가격/거래량**: Yahoo Finance 무료 차트 API (프리/정규/애프터 포함). **API 키 불필요.**
- **급등 사유/뉴스**: OpenAI Responses API의 `web_search` (2-패스: 조사 → 구조화). 이 기능만 OpenAI 키가 필요합니다.

## Windows 원클릭 설치 (.exe)

Node.js 없이 **설치 파일 더블클릭**만으로 실행됩니다. 내장 서버 + UI가 한 번에 뜹니다.

### 사용자: 설치 방법

1. `PremarketScanner-0.1.0-win-x64.exe` (설치형) 또는 `PremarketScanner-0.1.0-portable.exe` (무설치) 다운로드
2. **설치형**: 더블클릭 → 설치 위치 선택 → 바탕화면/시작 메뉴 바로가기 생성
   **무설치(portable)**: 더블클릭하면 바로 실행
3. 시작 메뉴 또는 바탕화면의 **「프리마켓 급등주 스캐너」** 실행

> 처음 실행 시 Windows SmartScreen이 "Windows의 PC 보호" 경고를 띄울 수 있습니다.  
> **추가 정보 → 실행** 을 누르면 됩니다. (서명되지 않은 앱이라 정상입니다.)

OpenAI 키 설정 (이유 분석용, 선택):
- 앱 내 **⚙️ 설정**에서 입력 (권장), 또는
- `%APPDATA%\프리마켓 급등주 스캐너\.env` 에 `OPENAI_API_KEY=sk-...` 추가

### 개발자: 설치 파일 빌드 (Windows 필요)

```powershell
# 한 줄 빌드 (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\build-win.ps1
# → release\PremarketScanner-0.1.0-win-x64.exe (설치형)
# → release\PremarketScanner-0.1.0-portable.exe (무설치)
```

또는:

```powershell
npm install
npm run build:win
```

GitHub Actions로 빌드하려면 **Actions → Build Windows Installer → Run workflow** 후 Artifacts에서 `.exe`를 받습니다.

로컬에서 Electron 앱 테스트:

```powershell
npm run electron:dev
```

---

## 개발용 설치 & 실행 (브라우저)

```bash
npm install

# (선택) 급등 "이유 분석"을 쓰려면 OpenAI 키 설정
cp server/.env.example server/.env   # 그리고 OPENAI_API_KEY 채우기

# 서버(8787) + 웹(5173) 동시 실행
npm run dev:all
```

브라우저에서 http://localhost:5173 가 열립니다.

- 키가 없어도 **가격 스캔**은 동작합니다 (상승률/거래량/고점 대비 등).
- 키가 있으면 스캔 직후 **이유 분석**이 자동 실행되어 주요 이슈·신뢰도·매매 등급·관련주가 채워집니다.

## 사용법

1. 상단에서 필터(최소 상승률 %, 최소 가격 $, 최소 거래량, 상위 N개, 중형주 제외)를 조정합니다.
2. **🔍 스캔** 클릭 → 급등 종목 표가 정렬됩니다.
3. 표의 종목을 클릭하면 오른쪽에 **상세 분석**(고점 대비 위치, 경고, 사유, 신뢰도, 관련주, 출처)이 표시됩니다.
4. 사유를 다시 분석하려면 **📰 이유 분석** 버튼을 누릅니다.

## 점수 기준 요약

- **신뢰도(0~5)**: 공식 실적/공시=5, 주요 언론(Reuters/Bloomberg/WSJ/CNBC)=4~5, 애널리스트=3, 소셜/루머=1~2, 뉴스 없음=0~1.
- **매매 적합도**:
  - **A**: 뉴스 확실(신뢰도 ≥4) + 거래량 높음 + 대형주
  - **B**: 뉴스 있음 + 변동성 높음
  - **C**: 뉴스는 있지만 이미 과열(고점 근접)
  - **D**: 뉴스 없음 / 신뢰도 낮음 / 위험
- **위험도(낮음·중간·높음)**: 뉴스 부재, 시총 작음, 과도한 갭, 고점 대비 큰 되돌림, 거래량 부족 등을 가점.

## 종목 유니버스 추가

`server/universe.mjs` 의 `UNIVERSE` 배열에 `{ symbol, name, tier }` 를 추가하면 됩니다. `tier` 는 `mega`(>$200B) / `large`($10B~$200B) / `mid`($2B~$10B).

## 폴더 구조

```
server/
  index.mjs       # Express API + (패키징 시) React UI 정적 서빙
  prices.mjs      # Yahoo 차트 기반 프리마켓 시세 + 평균 거래량
  universe.mjs    # 스캔 대상 큐레이션 유니버스
  premarket.mjs   # 급등 사유 프롬프트 + 구조화 스키마
src/
  App.tsx         # 스캐너 표 + 상세 패널 UI
  premarket.ts    # 타입, API 호출, 위험도/등급 점수 로직
  styles.css      # 다크 테마
electron/
  main.mjs        # 데스크톱 앱: 내장 서버 기동 + 창 열기
build/
  icon.png        # 앱/설치 파일 아이콘
scripts/
  build-win.ps1   # Windows 설치 파일 원클릭 빌드 스크립트
release/          # 빌드 결과 (.exe)
```

## ChatGPT 단타 코치 (시스템 프롬프트)

스캐너 결과를 ChatGPT에 붙여 **단타 관점 해석**을 받으려면:

- **파일**: [`docs/CHATGPT_DAYTRADING_SYSTEM_PROMPT.md`](docs/CHATGPT_DAYTRADING_SYSTEM_PROMPT.md) (약 15만 자)
- **방법**: 문서 안 `▼▼▼ 복사 시작 ▼▼▼` ~ `▲▲▲ 복사 끝 ▲▲▲` 사이 **코드 블록 전체**를 ChatGPT Custom GPT / Project **Instructions**에 붙여넣기
- **대화 시**: 스캐너 표·상세 패널 숫자를 프롬프트에 있는 INPUT FORMAT으로 붙여넣기

## 면책

투자 조언이 아닙니다. 가격은 지연/오차가 있을 수 있고, 급등 사유는 AI가 웹에서 수집·요약한 추정입니다. 매매 판단의 책임은 사용자에게 있습니다.
