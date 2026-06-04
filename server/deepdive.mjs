// 단일 종목 심층 분석용 프롬프트 + 구조화 스키마.
// PremarketScanner 내부에 자체 구현 (StockAnalyser와 코드 분리).
// 1패스: web_search로 사업/촉매/관계망/리스크 조사 + 출처 수집
// 2패스: json_schema로 구조화 (출처 화이트리스트)

export const VALID_RELATION = [
  "supplier", // 공급사
  "customer", // 고객사
  "competitor", // 경쟁사
  "partner", // 파트너
  "peer", // 동종/테마 동조
  "index", // 지수/ETF
];

export const RELATION_LABELS = {
  supplier: "공급사",
  customer: "고객사",
  competitor: "경쟁사",
  partner: "파트너",
  peer: "테마 동조",
  index: "지수/ETF",
};

export function deepDivePrompt(stock) {
  const today = new Date().toISOString().slice(0, 10);
  const ctx = [];
  if (stock.changePct != null) ctx.push(`전일 종가 대비 ${stock.changePct}%`);
  if (stock.price != null) ctx.push(`현재가 $${stock.price}`);
  if (stock.fromHighPct != null) ctx.push(`당일 고점 대비 ${stock.fromHighPct}%`);
  if (stock.vwapDeltaPct != null) ctx.push(`VWAP 대비 ${stock.vwapDeltaPct}%`);
  if (stock.atrPct != null) ctx.push(`ATR(14) ${stock.atrPct}%`);
  if (stock.from52HighPct != null)
    ctx.push(`52주 고점 대비 ${stock.from52HighPct}%`);

  // 정량 예측 컨텍스트 (지속 가능성 점수 + 과거 갭 베이스레이트 + 시장 레짐)
  const quant = [];
  if (stock.continuationScore != null)
    quant.push(`지속 가능성 점수 ${stock.continuationScore}/100 (${stock.continuationLabel || "-"})`);
  if (stock.gapHistory && stock.gapHistory.count >= 5)
    quant.push(
      `과거 유사 갭일 ${stock.gapHistory.count}회 중 ${stock.gapHistory.continuationRate}%가 시초가 위 마감, 평균 장중 ${stock.gapHistory.avgIntraday}%·익일 ${stock.gapHistory.avgNextDay}%`
    );
  if (stock.regime)
    quant.push(
      `시장 레짐: QQQ ${stock.regime.qqqChangePct}% · SPY ${stock.regime.spyChangePct}% · VIX ${stock.regime.vix} (${stock.regime.tone})`
    );
  if (stock.breadthPct != null)
    quant.push(`섹터 동조(브레드스) ${stock.breadthPct}%`);

  return `당신은 미국 주식 단타 트레이더를 돕는 시니어 애널리스트입니다. 아래 종목을 ${today} 기준으로 **심층 분석**하세요. 웹에서 최신 정보를 조사하고, 추측 대신 출처 있는 사실에 근거하세요.

[대상 종목]
${stock.symbol} (${stock.name})
시세 컨텍스트: ${ctx.join(" · ") || "정보 없음"}
${quant.length ? `정량 예측 컨텍스트(스캐너 계산값, 참고):\n- ${quant.join("\n- ")}` : ""}

위 "정량 예측 컨텍스트"는 스캐너가 가격/거래량/과거 통계로 계산한 값입니다. 당신의 강세/약세 논거와 종합 코멘트는 이 정량 근거와 웹에서 찾은 촉매를 **함께** 반영하되, 둘이 상충하면 그 점을 명확히 지적하세요. (예: 뉴스는 강하지만 과거 베이스레이트상 갭 소멸이 잦음)

조사·정리할 것:
1. 회사 개요: 한 줄 사업 설명, 핵심 제품/서비스, 소속 섹터/테마.
2. 오늘 급등(또는 변동)의 구체적 촉매와 그 신뢰도. 촉매가 없으면 명확히 밝힐 것.
3. 최근 촉매 타임라인: 최근 며칠~몇 주 내 주가에 영향을 준 이벤트 2~5개 (날짜·내용·방향).
4. 강세 논거(bull case) 2~4개, 약세/리스크 논거(bear case) 2~4개.
5. 단타 관점 핵심 가격대: 지지/저항 후보, 주목할 레벨(전일 종가, 프리마켓 고점, VWAP, 52주 고점 등) 설명.
6. 관계망: 이 종목과 함께 움직이거나 영향을 주고받는 기업/지수 4~8개. 각각 관계 유형(supplier/customer/competitor/partner/peer/index)과 한 줄 이유.
7. 종합 코멘트: 단타 트레이더가 알아야 할 핵심 1~2문장. (매수 권유 아님, 리스크 중심)
8. 신뢰도(confidence) 0~5: 분석의 근거 충실도.

규칙:
- Reuters/Bloomberg/WSJ/CNBC 등 주요 언론·기업 공시를 우선.
- 반드시 실제 URL 출처를 인용. 없으면 그렇다고 명시.
- 투자 권유·목표가 단정 금지. 시나리오와 리스크 위주.

종목에 대해 위 항목을 정리해 출력하세요.`;
}

export function deepDiveStructurePrompt(stock, research, sources) {
  return `아래는 ${stock.symbol}(${stock.name})에 대한 심층 웹조사 결과와, 실제 인용된 출처 URL 목록입니다. 이를 JSON으로 구조화하세요.

[조사 결과]
${research}

[사용 가능한 출처 URL 목록]
${sources.length ? sources.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(없음)"}

규칙:
- 모든 텍스트는 한국어.
- oneLiner: 회사 한 줄 설명.
- sector: 섹터/테마 라벨 (예: "AI 반도체/데이터센터").
- catalyst: 오늘 변동의 핵심 촉매 1~2문장. 없으면 "명확한 촉매 없음".
- timeline: 최근 이벤트 배열 (date "YYYY-MM-DD" 또는 "최근", title, impact는 positive|negative|neutral).
- bullCase / bearCase: 각각 문자열 배열 (2~4개).
- levels: 단타 가격대 배열 (label, value 숫자 또는 null, note).
- related: 관계망 배열 (symbol 대문자 티커, name, relation은 enum, reason 한 줄).
- comment: 단타 종합 코멘트 (리스크 중심).
- confidence: 0~5 정수.
- sources: 위 "사용 가능한 출처 URL 목록"에 있는 URL만. 없으면 빈 배열. 절대 지어내지 마세요.`;
}

export const DEEP_DIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    oneLiner: { type: "string" },
    sector: { type: "string" },
    catalyst: { type: "string" },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          title: { type: "string" },
          impact: { type: "string", enum: ["positive", "negative", "neutral"] },
        },
        required: ["date", "title", "impact"],
      },
    },
    bullCase: { type: "array", items: { type: "string" } },
    bearCase: { type: "array", items: { type: "string" } },
    levels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: ["number", "null"] },
          note: { type: "string" },
        },
        required: ["label", "value", "note"],
      },
    },
    related: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          symbol: { type: "string" },
          name: { type: "string" },
          relation: { type: "string", enum: VALID_RELATION },
          reason: { type: "string" },
        },
        required: ["symbol", "name", "relation", "reason"],
      },
    },
    comment: { type: "string" },
    confidence: { type: "integer" },
    sources: { type: "array", items: { type: "string" } },
  },
  required: [
    "oneLiner",
    "sector",
    "catalyst",
    "timeline",
    "bullCase",
    "bearCase",
    "levels",
    "related",
    "comment",
    "confidence",
    "sources",
  ],
};
