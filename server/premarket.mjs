// 프리마켓 급등 "이유" 분석용 프롬프트 + 구조화 스키마.
// 1패스: web_search로 최근 급등 사유 조사 + 출처 수집
// 2패스: json_schema로 구조화 (출처 화이트리스트)

// 이슈 카테고리 (사용자 요구사항 기반)
export const VALID_CATEGORIES = [
  "earnings", // 실적 발표
  "guidance", // 가이던스 상향
  "ai", // AI 관련 뉴스
  "analyst", // 애널리스트 목표가 상향
  "ma", // M&A / 인수합병
  "contract", // 대형 계약 / 수주
  "ceo", // CEO 발언
  "fda", // FDA 승인 / 바이오 임상
  "short_squeeze", // 숏스퀴즈 가능성
  "macro", // 거시/섹터 전반 흐름
  "none", // 특별한 뉴스 없음
];

export const CATEGORY_LABELS = {
  earnings: "실적 발표",
  guidance: "가이던스 상향",
  ai: "AI 관련",
  analyst: "목표가 상향",
  ma: "M&A/인수합병",
  contract: "대형 계약",
  ceo: "CEO 발언",
  fda: "FDA/임상",
  short_squeeze: "숏스퀴즈",
  macro: "거시/섹터",
  none: "뉴스 없음",
};

export function issueResearchPrompt(items) {
  const list = items
    .map((it, i) => `${i + 1}. ${it.symbol} (${it.name}) — 현재 +${it.changePct}%`)
    .join("\n");
  const today = new Date().toISOString().slice(0, 10);
  return `당신은 미국 주식 프리마켓을 분석하는 애널리스트입니다. 오늘(${today} 전후) 아래 종목들이 프리마켓/장 초반에 급등한 "이유"를 웹에서 조사하세요.

[급등 종목]
${list}

각 종목마다 조사할 것:
- 오늘(또는 직전 거래일 장 마감 후) 급등을 유발한 구체적 촉매(catalyst)
- 사유의 종류: 실적, 가이던스, AI 관련, 애널리스트 목표가 상향, M&A, 대형 계약/수주, CEO/주요인사 발언, FDA/임상, 숏스퀴즈, 거시/섹터 흐름 등
- 출처: 가능하면 Reuters/Bloomberg/WSJ/CNBC 등 신뢰도 높은 언론 또는 기업 공식 발표(IR). 반드시 실제 URL을 인용.
- 같은 테마로 함께 움직일 만한 관련주(티커)
- 만약 뚜렷한 뉴스/촉매를 찾지 못하면 "특별한 뉴스 없음"이라고 명확히 밝히세요. 추측으로 이유를 지어내지 마세요.

종목별로 위 내용을 정리해 출력하세요.`;
}

export function issueStructurePrompt(items, research, sources) {
  return `아래는 여러 급등 종목에 대한 웹조사 결과와, 실제 인용된 출처 URL 목록입니다. 이를 JSON으로 구조화하세요.

[대상 종목 (이 심볼들만 사용)]
${items.map((it) => `- ${it.symbol} (${it.name})`).join("\n")}

[조사 결과]
${research}

[사용 가능한 출처 URL 목록]
${sources.length ? sources.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(없음)"}

각 종목(stocks 배열 항목)에 대해:
- symbol: 위 심볼과 정확히 일치
- summary: 왜 올랐는지 한국어 1~2문장 요약. 뉴스가 없으면 "명확한 촉매 없이 급등 중".
- categories: 해당되는 카테고리 배열 (아래 enum에서 선택). 뉴스가 없으면 ["none"].
- theme: 한국어 테마 한 줄 라벨 (예: "AI 반도체/데이터센터", "비만 치료제", "실적 서프라이즈"). 없으면 빈 문자열.
- reliability: 사유의 신뢰도 0~5 정수.
    · 공식 실적/공시 = 5
    · Reuters/Bloomberg/WSJ/CNBC 등 주요 언론 = 4~5
    · 애널리스트 리포트 = 3
    · 소셜미디어/루머 = 1~2
    · 뉴스 없음 = 0~1
- related: 같은 테마 관련주 티커 배열 (최대 7개, 대문자 티커만).
- sources: 위 "사용 가능한 출처 URL 목록"에 있는 URL만. 없으면 빈 배열. 절대 URL을 지어내지 마세요.`;
}

export const ISSUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    stocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          symbol: { type: "string" },
          summary: { type: "string" },
          theme: { type: "string" },
          reliability: { type: "integer" },
          categories: {
            type: "array",
            items: { type: "string", enum: VALID_CATEGORIES },
          },
          related: {
            type: "array",
            items: { type: "string" },
          },
          sources: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "symbol",
          "summary",
          "theme",
          "reliability",
          "categories",
          "related",
          "sources",
        ],
      },
    },
  },
  required: ["stocks"],
};
