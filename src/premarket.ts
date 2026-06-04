// 프리마켓 스캐너: 타입, API 호출, 그리고 위험도/매매적합도 점수 로직.

export interface ScanConfig {
  apiKey?: string;
  /** 공용 fallback (구버전 호환) */
  model: string;
  /** 이유 분석용 모델 (대량·정형 작업 → 저렴한 모델 권장) */
  issuesModel?: string;
  /** 심층 분석용 모델 (1종목 추론 → 플래그십 권장) */
  deepModel?: string;
}

export const DEFAULT_ISSUES_MODEL = "gpt-5.4-mini";
export const DEFAULT_DEEP_MODEL = "gpt-5.5";

export interface ScanFilters {
  minChangePct: number;
  minPrice: number;
  minVolume: number;
  excludeMid: boolean;
  limit: number;
}

export type Session = "pre" | "regular" | "post" | "closed";
export type Tier = "mega" | "large" | "mid";

export interface ScanRow {
  symbol: string;
  name: string;
  exchange: string;
  sector?: string;
  sectorKey?: string | null;
  tier: Tier;
  session: Session;
  prevClose: number;
  price: number;
  changePct: number;
  preMarketPrice: number | null;
  preMarketChangePct: number | null;
  preMarketHigh: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  fromHighPct: number | null;
  regularOpen: number | null;
  fromOpenPct: number | null;
  gapPct: number | null;
  volume: number;
  avgVolume: number | null;
  volumeRatio: number | null;
  vwap: number | null;
  vwapDeltaPct: number | null;
  fiftyTwoHigh: number | null;
  fiftyTwoLow: number | null;
  from52HighPct: number | null;
  atrPct: number | null;
  aboveVwap: boolean | null;
  ret5: number | null;
  ret20: number | null;
  breadthPct: number | null;
  gapHistory: GapHistory | null;
}

export interface GapHistory {
  count: number;
  lowSample: boolean;
  gapThreshold: number;
  continuationRate?: number;
  avgIntraday?: number | null;
  avgNextDay?: number | null;
}

export interface Regime {
  spyChangePct: number | null;
  qqqChangePct: number | null;
  vix: number | null;
  tone: "risk_on" | "risk_off" | "neutral";
}

export interface ScanResult {
  asOf: string;
  universeSize: number;
  regime?: Regime;
  count: number;
  rows: ScanRow[];
}

export type Category =
  | "earnings"
  | "guidance"
  | "ai"
  | "analyst"
  | "ma"
  | "contract"
  | "ceo"
  | "fda"
  | "short_squeeze"
  | "macro"
  | "none";

export interface Issue {
  symbol: string;
  summary: string;
  theme: string;
  categories: Category[];
  reliability: number; // 0~5
  related: string[];
  sources: string[];
}

export interface IssuesResult {
  issues: Record<string, Issue>;
  allSources: string[];
  chunksFailed?: number;
  chunksTotal?: number;
}

// ===== 심층 분석 =====
export type Relation =
  | "supplier"
  | "customer"
  | "competitor"
  | "partner"
  | "peer"
  | "index";

export const RELATION_LABELS: Record<Relation, string> = {
  supplier: "공급사",
  customer: "고객사",
  competitor: "경쟁사",
  partner: "파트너",
  peer: "테마 동조",
  index: "지수/ETF",
};

export type Impact = "positive" | "negative" | "neutral";

export interface TimelineEvent {
  date: string;
  title: string;
  impact: Impact;
}

export interface PriceLevel {
  label: string;
  value: number | null;
  note: string;
}

export interface RelatedCompany {
  symbol: string;
  name: string;
  relation: Relation;
  reason: string;
}

export interface DeepDive {
  symbol: string;
  oneLiner: string;
  sector: string;
  catalyst: string;
  timeline: TimelineEvent[];
  bullCase: string[];
  bearCase: string[];
  levels: PriceLevel[];
  related: RelatedCompany[];
  comment: string;
  confidence: number;
  sources: string[];
}

export const CATEGORY_LABELS: Record<Category, string> = {
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

export const TIER_LABELS: Record<Tier, string> = {
  mega: "초대형주",
  large: "대형주",
  mid: "중형주",
};

export const SESSION_LABELS: Record<Session, string> = {
  pre: "프리마켓",
  regular: "정규장",
  post: "애프터마켓",
  closed: "장마감",
};

// ===== API =====
function headers(config: ScanConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) h["x-openai-key"] = config.apiKey;
  return h;
}

export async function checkServer(): Promise<{
  ok: boolean;
  hasEnvKey: boolean;
}> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return { ok: false, hasEnvKey: false };
    return await res.json();
  } catch {
    return { ok: false, hasEnvKey: false };
  }
}

export async function scanPremarket(filters: ScanFilters): Promise<ScanResult> {
  const res = await fetch("/api/premarket-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `스캔 실패 (${res.status})`);
  return data as ScanResult;
}

export async function fetchDeepDive(
  row: ScanRow,
  config: ScanConfig,
  opts?: { issue?: Issue; regime?: Regime }
): Promise<DeepDive> {
  const pred = computeContinuation(row, opts?.issue, opts?.regime);
  const res = await fetch("/api/deep-dive", {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      model: config.deepModel || config.model || DEFAULT_DEEP_MODEL,
      stock: {
        symbol: row.symbol,
        name: row.name,
        price: row.price,
        changePct: row.changePct,
        fromHighPct: row.fromHighPct,
        vwapDeltaPct: row.vwapDeltaPct,
        atrPct: row.atrPct,
        from52HighPct: row.from52HighPct,
        continuationScore: pred.score,
        continuationLabel: CONTINUATION_LABELS[pred.label],
        gapHistory: row.gapHistory,
        regime: opts?.regime,
        breadthPct: row.breadthPct,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `심층 분석 실패 (${res.status})`);
  return data as DeepDive;
}

export async function fetchIssues(
  rows: ScanRow[],
  config: ScanConfig
): Promise<IssuesResult> {
  const res = await fetch("/api/premarket-issues", {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      model: config.issuesModel || config.model || DEFAULT_ISSUES_MODEL,
      stocks: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        changePct: r.changePct,
      })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `이슈 분석 실패 (${res.status})`);
  return data as IssuesResult;
}

// ===== 파생 점수 로직 =====
export type VolumeLevel = "low" | "medium" | "high" | "very_high";

export const VOLUME_LABELS: Record<VolumeLevel, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  very_high: "매우 높음",
};

export function volumeLevel(row: ScanRow): VolumeLevel {
  const r = row.volumeRatio;
  if (r != null) {
    if (r >= 3) return "very_high";
    if (r >= 1.5) return "high";
    if (r >= 0.7) return "medium";
    return "low";
  }
  // 비율 정보가 없으면 절대 거래량으로 대략 판정
  const v = row.volume;
  if (v >= 20_000_000) return "very_high";
  if (v >= 5_000_000) return "high";
  if (v >= 1_000_000) return "medium";
  return "low";
}

export function hasRealNews(issue?: Issue): boolean {
  if (!issue) return false;
  if (issue.categories.length && issue.categories.every((c) => c === "none"))
    return false;
  return issue.reliability >= 2 || issue.categories.some((c) => c !== "none");
}

/** 고점 대비 1.5% 이내로 붙어 있고 많이 오른 상태 = 과열 구간 */
export function isOverheated(row: ScanRow): boolean {
  return (
    row.fromHighPct != null && row.fromHighPct >= -1.5 && row.changePct >= 8
  );
}

export type Risk = "low" | "mid" | "high";

export const RISK_LABELS: Record<Risk, string> = {
  low: "낮음",
  mid: "중간",
  high: "높음",
};

export function riskLevel(row: ScanRow, issue?: Issue): Risk {
  const noNews = !hasRealNews(issue);
  const level = volumeLevel(row);
  let score = 0;
  if (noNews) score += 2;
  else if ((issue?.reliability ?? 0) <= 2) score += 1;
  if (row.tier === "mid") score += 1;
  if (row.changePct >= 20) score += 1; // 큰 갭 = 변동성 큼
  if (row.fromHighPct != null && row.fromHighPct <= -5) score += 1; // 고점서 밀림
  if (level === "low") score += 1;
  if ((issue?.reliability ?? 0) >= 4 && row.tier !== "mid") score -= 1;
  if (score >= 2) return "high";
  if (score === 1) return "mid";
  return "low";
}

export type Grade = "A" | "B" | "C" | "D";

export const GRADE_DESC: Record<Grade, string> = {
  A: "뉴스 확실 + 거래량 높음 + 대형주",
  B: "뉴스 있음 + 변동성 높음",
  C: "뉴스는 있지만 이미 과열",
  D: "뉴스 없음 / 위험",
};

export function tradeGrade(row: ScanRow, issue?: Issue): Grade {
  const noNews = !hasRealNews(issue);
  const reliability = issue?.reliability ?? 0;
  if (noNews || reliability <= 1) return "D";

  const level = volumeLevel(row);
  const volStrong = level === "high" || level === "very_high";
  const big = row.tier !== "mid";
  const overheated = isOverheated(row);

  let g: Grade;
  if (reliability >= 4 && volStrong && big) g = "A";
  else if (reliability >= 3 && (volStrong || big)) g = "B";
  else g = "C";

  // 과열이면 한 단계 보수적으로
  if (overheated) {
    if (g === "A") g = "B";
    else if (g === "B") g = "C";
  }
  return g;
}

export interface Warning {
  kind: "near_high" | "no_news" | "mid_cap" | "pulled_back";
  text: string;
}

export function buildWarnings(row: ScanRow, issue?: Issue): Warning[] {
  const out: Warning[] = [];
  if (!hasRealNews(issue)) {
    out.push({
      kind: "no_news",
      text: "명확한 뉴스 없이 급등 중입니다. 추격매수 위험이 높습니다.",
    });
  }
  if (row.fromHighPct != null && row.fromHighPct >= -2) {
    out.push({
      kind: "near_high",
      text: "현재가가 프리마켓/장중 고점에 거의 근접했습니다. 신규매수보다 익절 구간일 수 있습니다.",
    });
  } else if (row.fromHighPct != null && row.fromHighPct <= -6) {
    out.push({
      kind: "pulled_back",
      text: `고점 대비 ${row.fromHighPct.toFixed(
        1
      )}% 밀렸습니다. 급등 후 되돌림이 진행 중일 수 있습니다.`,
    });
  }
  if (row.tier === "mid") {
    out.push({
      kind: "mid_cap",
      text: "상대적으로 시총이 작은 중형주입니다. 변동성에 유의하세요.",
    });
  }
  return out;
}

export function relatedNote(row: ScanRow, issue?: Issue): string {
  if (!issue || issue.related.length === 0) return "";
  const theme = issue.theme || "동일 테마";
  return `${row.symbol} 급등은 ${theme} 관련 이슈입니다. 같은 테마의 ${issue.related.join(
    ", "
  )}도 함께 확인하세요.`;
}

export function fmtVolume(v: number | null): string {
  if (v == null) return "-";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// ===== 정렬 =====
export type SortKey =
  | "changePct"
  | "price"
  | "volume"
  | "volumeRatio"
  | "fromHighPct"
  | "atrPct"
  | "reliability"
  | "grade"
  | "continuation";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const GRADE_RANK: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1 };

export function sortRows(
  rows: ScanRow[],
  issues: Record<string, Issue>,
  sort: SortState,
  regime?: Regime
): ScanRow[] {
  const val = (r: ScanRow): number => {
    const issue = issues[r.symbol];
    switch (sort.key) {
      case "price":
        return r.price;
      case "volume":
        return r.volume;
      case "volumeRatio":
        return r.volumeRatio ?? -1;
      case "fromHighPct":
        return r.fromHighPct ?? -999;
      case "atrPct":
        return r.atrPct ?? -1;
      case "reliability":
        return issue?.reliability ?? -1;
      case "grade":
        return issue ? GRADE_RANK[tradeGrade(r, issue)] : 0;
      case "continuation":
        return computeContinuation(r, issue, regime).score;
      case "changePct":
      default:
        return r.changePct;
    }
  };
  const sorted = [...rows].sort((a, b) => val(b) - val(a));
  if (sort.dir === "asc") sorted.reverse();
  return sorted;
}

// ===== ChatGPT 단타 코치용 복사 텍스트 =====
export function buildChatGptInput(row: ScanRow, issue?: Issue): string {
  const grade = tradeGrade(row, issue);
  const risk = RISK_LABELS[riskLevel(row, issue)];
  const lvl = VOLUME_LABELS[volumeLevel(row)];
  const lines = [
    "[스캐너 붙여넣기]",
    `- 종목: ${row.symbol} (${row.name})`,
    row.sector ? `- 섹터: ${row.sector}` : "",
    `- changePct: +${row.changePct}% / price: $${row.price} / prevClose: $${row.prevClose}`,
    `- fromHighPct: ${row.fromHighPct ?? "-"}% / fromOpenPct: ${
      row.fromOpenPct ?? "-"
    }% / gapPct: ${row.gapPct ?? "-"}%`,
    `- sessionHigh: $${row.sessionHigh ?? "-"} / VWAP: $${
      row.vwap ?? "-"
    } (VWAP대비 ${row.vwapDeltaPct ?? "-"}%)`,
    `- 52주고점대비: ${row.from52HighPct ?? "-"}% / ATR: ${row.atrPct ?? "-"}%`,
    `- volume: ${fmtVolume(row.volume)} (${lvl}, x${
      row.volumeRatio ?? "-"
    }) / tier: ${TIER_LABELS[row.tier]} / session: ${SESSION_LABELS[row.session]}`,
    issue
      ? `- 이슈: ${issue.summary} / 카테고리: ${issue.categories
          .map((c) => CATEGORY_LABELS[c])
          .join(", ")} / 신뢰도: ${issue.reliability}/5${
          issue.theme ? ` / 테마: ${issue.theme}` : ""
        }`
      : "- 이슈: (미분석)",
    `- 매매등급: ${grade} / 위험도: ${risk}`,
    issue && issue.related.length ? `- 관련주: ${issue.related.join(", ")}` : "",
    "[추가] 포지션: 없음 / 당일 단타 관점으로, 진입·손절·익절 프레임만 짧게.",
  ];
  return lines.filter(Boolean).join("\n");
}

// ===== 지속 가능성(추격 가능성) 예측 모델 =====
// 가격/거래량/과거 베이스레이트/시장 레짐/뉴스를 가중 합산한 투명한 점수(0~100).
// 블랙박스가 아니라 요인별 기여도를 그대로 보여준다.

export type ContinuationLabel = "high" | "mid" | "low";

export const CONTINUATION_LABELS: Record<ContinuationLabel, string> = {
  high: "지속 가능성 높음",
  mid: "지속 가능성 보통",
  low: "지속 가능성 낮음",
};

export interface PredFactor {
  name: string;
  contribution: number; // 점수 기여 (양/음)
  detail: string;
}

export interface Prediction {
  score: number; // 0~100
  label: ContinuationLabel;
  factors: PredFactor[];
  expectedMovePct: number | null; // ATR 기반 당일 기대 변동폭
  basisCount: number; // 사용된 요인 수
}

export function computeContinuation(
  row: ScanRow,
  issue: Issue | undefined,
  regime: Regime | undefined
): Prediction {
  const factors: PredFactor[] = [];
  let score = 50;
  const add = (name: string, contribution: number, detail: string) => {
    const c = Math.round(contribution);
    if (c === 0 && !detail) return;
    factors.push({ name, contribution: c, detail });
    score += c;
  };

  // 1) 거래량 강도 (RVOL) — 거래량이 움직임을 확증
  if (row.volumeRatio != null) {
    const r = row.volumeRatio;
    let c = 0;
    if (r >= 3) c = 14;
    else if (r >= 1.5) c = 8;
    else if (r >= 1) c = 3;
    else if (r >= 0.7) c = -3;
    else c = -9;
    add("거래량 강도(RVOL)", c, `평균 대비 x${r}`);
  }

  // 2) VWAP 관계 — VWAP 위면 매수 우위
  if (row.vwapDeltaPct != null) {
    const c = row.vwapDeltaPct >= 0 ? 8 : -9;
    add(
      "VWAP 관계",
      c,
      row.vwapDeltaPct >= 0
        ? `VWAP 위 +${row.vwapDeltaPct}%`
        : `VWAP 아래 ${row.vwapDeltaPct}%`
    );
  }

  // 3) 고점 대비 위치 — 고점 부근 유지=강함 / 깊은 되돌림=소멸
  if (row.fromHighPct != null) {
    const f = row.fromHighPct;
    let c = 0;
    if (f >= -1) c = 5;
    else if (f >= -3) c = 8;
    else if (f >= -6) c = -1;
    else c = -11;
    add("고점 대비 위치", c, `${f}%`);
  }

  // 4) 갭/변동성(과열) — 갭이 ATR 대비 너무 크면 소진 위험
  if (row.atrPct && row.atrPct > 0 && row.changePct != null) {
    const ratio = row.changePct / row.atrPct;
    let c = 0;
    if (ratio <= 1.2) c = 6;
    else if (ratio <= 2.5) c = 2;
    else if (ratio <= 4) c = -6;
    else c = -12;
    add("갭/변동성(과열)", c, `갭 ${row.changePct}% = ATR의 ${ratio.toFixed(1)}배`);
  }

  // 5) 뉴스 촉매 신뢰도
  if (issue) {
    const rel = issue.reliability;
    const real = hasRealNews(issue);
    const c = real ? (rel - 2) * 5 : -6;
    add("뉴스 촉매", c, real ? `신뢰도 ${rel}/5` : "명확한 촉매 없음");
  }

  // 6) 테마 동조(브레드스) — 섹터 동반 상승이면 테마 실재성↑
  if (row.breadthPct != null) {
    const c = Math.max(-10, Math.min(10, Math.round((row.breadthPct - 50) / 5)));
    add("테마 동조", c, `섹터 동반 상승 ${row.breadthPct}%`);
  }

  // 7) 시장 레짐 — 지수 방향 + VIX
  if (regime) {
    let c = 0;
    if (regime.qqqChangePct != null) c += regime.qqqChangePct > 0 ? 3 : -3;
    if (regime.spyChangePct != null) c += regime.spyChangePct > 0 ? 2 : -2;
    if (regime.vix != null) c += regime.vix < 18 ? 3 : regime.vix > 25 ? -5 : 0;
    add(
      "시장 레짐",
      c,
      `QQQ ${regime.qqqChangePct ?? "-"}% · VIX ${regime.vix ?? "-"}`
    );
  }

  // 8) 과거 갭 베이스레이트 — 이 종목의 실제 갭 지속 확률
  const gh = row.gapHistory;
  if (gh && !gh.lowSample && gh.continuationRate != null) {
    const c = Math.max(-12, Math.min(12, Math.round((gh.continuationRate - 50) / 4)));
    add(
      "과거 갭 베이스레이트",
      c,
      `유사 갭 ${gh.count}회 중 ${gh.continuationRate}% 지속(장중 평균 ${gh.avgIntraday ?? "-"}%)`
    );
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label: ContinuationLabel =
    score >= 66 ? "high" : score >= 45 ? "mid" : "low";

  return {
    score,
    label,
    factors: factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    expectedMovePct: row.atrPct ?? null,
    basisCount: factors.length,
  };
}
