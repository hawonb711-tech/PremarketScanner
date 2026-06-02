// 프리마켓 스캐너: 타입, API 호출, 그리고 위험도/매매적합도 점수 로직.

export interface ScanConfig {
  apiKey?: string;
  model: string;
}

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
  tier: Tier;
  session: Session;
  prevClose: number;
  price: number;
  changePct: number;
  preMarketPrice: number | null;
  preMarketChangePct: number | null;
  preMarketHigh: number | null;
  sessionHigh: number | null;
  fromHighPct: number | null;
  regularOpen: number | null;
  fromOpenPct: number | null;
  volume: number;
  avgVolume: number | null;
  volumeRatio: number | null;
}

export interface ScanResult {
  asOf: string;
  universeSize: number;
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

export async function fetchIssues(
  rows: ScanRow[],
  config: ScanConfig
): Promise<IssuesResult> {
  const res = await fetch("/api/premarket-issues", {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      model: config.model || "gpt-5.5",
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
