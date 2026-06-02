// Yahoo Finance 무료 차트 엔드포인트 기반 가격 데이터 (API 키 불필요).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const quoteCache = new Map();
const avgVolCache = new Map();
const QUOTE_TTL = 30 * 1000; // 30초 캐시

async function yahooFetch(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  return res.json();
}

const pct = (a, b) => (b > 0 ? (a / b - 1) * 100 : null);

/**
 * 프리마켓/정규장 시세를 한 번에 수집 (chart, prepost 포함).
 * 전일 종가 대비 상승률, 프리마켓 고점/현재가/시초가, 거래량 등을 계산한다.
 */
export async function fetchPremarketQuote(symbol) {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.at < QUOTE_TTL) return cached.data;

  let data;
  try {
    data = await yahooFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=1d&interval=5m&includePrePost=true`
    );
  } catch {
    return null;
  }
  const r = data?.chart?.result?.[0];
  const meta = r?.meta;
  if (!meta) return null;

  const ts = Array.isArray(r.timestamp) ? r.timestamp : [];
  const q = r?.indicators?.quote?.[0] || {};
  const closes = q.close || [];
  const opens = q.open || [];
  const highs = q.high || [];
  const vols = q.volume || [];

  const tp = meta.currentTradingPeriod || {};
  const pre = tp.pre;
  const reg = tp.regular;
  const post = tp.post;

  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose);
  let preLast = null;
  let preHigh = null;
  let preVol = 0;
  let regOpen = null;
  let lastTs = null;

  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const c = closes[i];
    if (pre && t >= pre.start && t < pre.end) {
      const hi = typeof highs[i] === "number" ? highs[i] : c;
      if (typeof hi === "number")
        preHigh = preHigh == null ? hi : Math.max(preHigh, hi);
      if (typeof c === "number") preLast = c;
      if (typeof vols[i] === "number") preVol += vols[i];
    }
    if (reg && t >= reg.start && regOpen == null) {
      const o = typeof opens[i] === "number" ? opens[i] : c;
      if (typeof o === "number") regOpen = o;
    }
    if (typeof c === "number") lastTs = t;
  }

  // 현재가: 정규장 시세가 있으면 그것, 없으면 마지막 체결가(프리/애프터)
  const lastClose = [...closes].reverse().find((c) => typeof c === "number");
  const price = Number(
    meta.regularMarketPrice != null ? meta.regularMarketPrice : lastClose
  );
  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose <= 0)
    return null;

  // 현재 세션 판정 (마지막 데이터 시점 기준)
  let session = "closed";
  if (lastTs != null) {
    if (pre && lastTs >= pre.start && lastTs < pre.end) session = "pre";
    else if (reg && lastTs >= reg.start && lastTs < reg.end) session = "regular";
    else if (post && lastTs >= post.start && lastTs < post.end) session = "post";
    else session = "regular";
  }

  const dayHigh = Number(meta.regularMarketDayHigh);
  const sessionHigh =
    preHigh != null && Number.isFinite(dayHigh)
      ? Math.max(preHigh, dayHigh)
      : preHigh != null
      ? preHigh
      : Number.isFinite(dayHigh)
      ? dayHigh
      : null;

  const out = {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    session,
    prevClose,
    price,
    // 헤드라인 상승률: 최신(프리/정규) 가격의 전일 종가 대비
    changePct: pct(price, prevClose),
    // 프리마켓 전용 지표
    preMarketPrice: preLast,
    preMarketChangePct: preLast != null ? pct(preLast, prevClose) : null,
    preMarketHigh: preHigh,
    sessionHigh,
    fromHighPct: sessionHigh != null ? pct(price, sessionHigh) : null,
    regularOpen: regOpen,
    fromOpenPct: regOpen != null ? pct(price, regOpen) : null,
    volume: Number(meta.regularMarketVolume) || 0,
    preMarketVolume: preVol,
  };
  quoteCache.set(symbol, { at: Date.now(), data: out });
  return out;
}

/** 최근 약 한 달 일평균 거래량 (거래량 상대 강도 판정용) */
export async function fetchAvgDailyVolume(symbol) {
  if (avgVolCache.has(symbol)) return avgVolCache.get(symbol);
  let avg = null;
  try {
    const data = await yahooFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=1mo&interval=1d`
    );
    const vols = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.volume;
    if (Array.isArray(vols)) {
      const valid = vols.filter((v) => typeof v === "number" && v > 0);
      if (valid.length) {
        const recent = valid.slice(-20);
        avg = recent.reduce((s, v) => s + v, 0) / recent.length;
      }
    }
  } catch {
    avg = null;
  }
  avgVolCache.set(symbol, avg);
  return avg;
}

/** 동시성 제한 병렬 실행 */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    }
  );
  await Promise.all(workers);
  return results;
}
