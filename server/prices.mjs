// Yahoo Finance 무료 차트 엔드포인트 기반 가격 데이터 (API 키 불필요).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const quoteCache = new Map();
const avgVolCache = new Map();
const dailyCache = new Map();
const QUOTE_TTL = 30 * 1000; // 30초 캐시
const DAILY_TTL = 60 * 60 * 1000; // 1시간 캐시

/**
 * 재시도 + 타임아웃이 적용된 Yahoo fetch.
 * 비공식 API라 일시적 429/5xx가 잦아 지수 백오프로 견딘다.
 */
async function yahooFetch(url, { retries = 2, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`yahoo ${res.status}`);
      }
      if (!res.ok) throw new Error(`yahoo ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const backoff = 300 * 2 ** attempt + Math.random() * 200;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

const pct = (a, b) => (b > 0 ? (a / b - 1) * 100 : null);

/**
 * 프리마켓/정규장 시세 + 분봉 기반 VWAP/세션 통계를 한 번에 수집.
 * 전일 종가 대비 상승률, 프리마켓 고점/현재가/시초가, 거래량, 당일 고저, VWAP 등.
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
  const lows = q.low || [];
  const vols = q.volume || [];

  const tp = meta.currentTradingPeriod || {};
  const pre = tp.pre;
  const reg = tp.regular;
  const post = tp.post;

  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose);
  let preLast = null;
  let preHigh = null;
  let preLow = null;
  let preVol = 0;
  let regOpen = null;
  let lastTs = null;

  // VWAP (정규장 분봉 기준) + 당일 저점
  let vwapNum = 0;
  let vwapDen = 0;
  let dayLow = null;

  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const c = closes[i];
    const hi = typeof highs[i] === "number" ? highs[i] : c;
    const lo = typeof lows[i] === "number" ? lows[i] : c;
    const v = typeof vols[i] === "number" ? vols[i] : 0;

    if (pre && t >= pre.start && t < pre.end) {
      if (typeof hi === "number")
        preHigh = preHigh == null ? hi : Math.max(preHigh, hi);
      if (typeof lo === "number")
        preLow = preLow == null ? lo : Math.min(preLow, lo);
      if (typeof c === "number") preLast = c;
      preVol += v;
    }
    if (reg && t >= reg.start && t < reg.end) {
      if (regOpen == null) {
        const o = typeof opens[i] === "number" ? opens[i] : c;
        if (typeof o === "number") regOpen = o;
      }
      // VWAP: 전형가격 * 거래량 누적
      if (typeof c === "number" && v > 0) {
        const typical = (hi + lo + c) / 3;
        vwapNum += typical * v;
        vwapDen += v;
      }
      if (typeof lo === "number") dayLow = dayLow == null ? lo : Math.min(dayLow, lo);
    }
    if (typeof c === "number") lastTs = t;
  }

  const lastClose = [...closes].reverse().find((c) => typeof c === "number");
  const price = Number(
    meta.regularMarketPrice != null ? meta.regularMarketPrice : lastClose
  );
  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose <= 0)
    return null;

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

  const vwap = vwapDen > 0 ? vwapNum / vwapDen : null;
  const fiftyTwoHigh = Number(meta.fiftyTwoWeekHigh);
  const fiftyTwoLow = Number(meta.fiftyTwoWeekLow);

  const out = {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    currency: meta.currency || "USD",
    session,
    prevClose,
    price,
    changePct: pct(price, prevClose),
    preMarketPrice: preLast,
    preMarketChangePct: preLast != null ? pct(preLast, prevClose) : null,
    preMarketHigh: preHigh,
    preMarketLow: preLow,
    sessionHigh,
    sessionLow: dayLow,
    fromHighPct: sessionHigh != null ? pct(price, sessionHigh) : null,
    regularOpen: regOpen,
    fromOpenPct: regOpen != null ? pct(price, regOpen) : null,
    gapPct: regOpen != null ? pct(regOpen, prevClose) : null,
    volume: Number(meta.regularMarketVolume) || 0,
    preMarketVolume: preVol,
    vwap,
    vwapDeltaPct: vwap != null ? pct(price, vwap) : null,
    fiftyTwoHigh: Number.isFinite(fiftyTwoHigh) ? fiftyTwoHigh : null,
    fiftyTwoLow: Number.isFinite(fiftyTwoLow) ? fiftyTwoLow : null,
    from52HighPct: Number.isFinite(fiftyTwoHigh)
      ? pct(price, fiftyTwoHigh)
      : null,
    from52LowPct: Number.isFinite(fiftyTwoLow) ? pct(price, fiftyTwoLow) : null,
  };
  quoteCache.set(symbol, { at: Date.now(), data: out });
  return out;
}

/** 일봉 시계열(최근 ~1년) 수집 — 평균 거래량/ATR/추세/갭 베이스레이트 계산용 */
async function fetchDaily(symbol) {
  const cached = dailyCache.get(symbol);
  if (cached && Date.now() - cached.at < DAILY_TTL) return cached.data;
  let series = null;
  try {
    const data = await yahooFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=1y&interval=1d`
    );
    const r = data?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (q && Array.isArray(q.close)) {
      series = {
        open: q.open || [],
        close: q.close,
        high: q.high || [],
        low: q.low || [],
        volume: q.volume || [],
      };
    }
  } catch {
    series = null;
  }
  dailyCache.set(symbol, { at: Date.now(), data: series });
  return series;
}

const regimeCache = { at: 0, data: null };
const REGIME_TTL = 60 * 1000;

/** 간단 단일 시세(전일 종가 대비 % + 현재가) — 지수/ETF용 */
async function quickQuote(symbol) {
  try {
    const data = await yahooFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=1d&interval=5m&includePrePost=true`
    );
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const prev = Number(meta.previousClose ?? meta.chartPreviousClose);
    const price = Number(meta.regularMarketPrice);
    if (!Number.isFinite(price) || !(prev > 0)) return { price, changePct: null };
    return { price, changePct: (price / prev - 1) * 100 };
  } catch {
    return null;
  }
}

/**
 * 시장 레짐: SPY/QQQ 방향 + VIX 수준.
 * 위험선호(risk-on) ↔ 위험회피(risk-off)를 판정해 급등 지속성 예측에 반영.
 */
export async function fetchMarketRegime() {
  if (regimeCache.data && Date.now() - regimeCache.at < REGIME_TTL)
    return regimeCache.data;
  const [spy, qqq, vix] = await Promise.all([
    quickQuote("SPY"),
    quickQuote("QQQ"),
    quickQuote("^VIX"),
  ]);
  const spyCh = spy?.changePct ?? null;
  const qqqCh = qqq?.changePct ?? null;
  const vixLevel = vix?.price ?? null;
  let tone = "neutral";
  const up = (qqqCh ?? 0) > 0 && (spyCh ?? 0) > 0;
  const down = (qqqCh ?? 0) < 0 && (spyCh ?? 0) < 0;
  if (up && (vixLevel == null || vixLevel < 20)) tone = "risk_on";
  else if (down || (vixLevel != null && vixLevel > 25)) tone = "risk_off";
  const data = {
    spyChangePct: spyCh != null ? Math.round(spyCh * 100) / 100 : null,
    qqqChangePct: qqqCh != null ? Math.round(qqqCh * 100) / 100 : null,
    vix: vixLevel != null ? Math.round(vixLevel * 10) / 10 : null,
    tone,
  };
  regimeCache.at = Date.now();
  regimeCache.data = data;
  return data;
}

/**
 * 과거 갭 베이스레이트: 일봉 OHLC로 "비슷한 상승 갭일"을 찾아
 * 실제로 시초가 위에서 마감(지속)했는지 통계를 낸다.
 * - continuationRate: 유사 갭일 중 종가>시초가 비율(%)
 * - avgIntraday: 시초가→종가 평균 수익률(%)
 * - avgNextDay: 다음날 종가→종가 평균 수익률(%)
 */
export async function fetchGapHistory(symbol, currentGapPct) {
  const series = await fetchDaily(symbol);
  if (!series || !Array.isArray(series.open)) return null;
  const { open, close } = series;
  const n = close.length;
  if (n < 30) return null;

  // 기준 갭: 현재 갭(없으면 일간 상승률 대용)의 절반 이상, 최소 3%
  const base = Math.max(3, (Number(currentGapPct) || 6) * 0.5);

  const intradays = [];
  const nextDays = [];
  let cont = 0;
  for (let i = 1; i < n - 1; i++) {
    const o = open[i];
    const pc = close[i - 1];
    const c = close[i];
    if (![o, pc, c].every((x) => typeof x === "number") || !(pc > 0) || !(o > 0))
      continue;
    const gap = (o / pc - 1) * 100;
    if (gap < base) continue;
    const intraday = (c / o - 1) * 100;
    intradays.push(intraday);
    if (c > o) cont += 1;
    const cn = close[i + 1];
    if (typeof cn === "number" && c > 0) nextDays.push((cn / c - 1) * 100);
  }
  const count = intradays.length;
  if (count < 5) return { count, lowSample: true, gapThreshold: Math.round(base * 10) / 10 };
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return {
    count,
    lowSample: false,
    gapThreshold: Math.round(base * 10) / 10,
    continuationRate: Math.round((cont / count) * 100),
    avgIntraday: r1(mean(intradays)),
    avgNextDay: r1(mean(nextDays)),
  };
}

/** 최근 약 한 달 일평균 거래량 (거래량 상대 강도 판정용) */
export async function fetchAvgDailyVolume(symbol) {
  if (avgVolCache.has(symbol)) return avgVolCache.get(symbol);
  let avg = null;
  const series = await fetchDaily(symbol);
  if (series) {
    const valid = series.volume.filter((v) => typeof v === "number" && v > 0);
    if (valid.length) {
      const recent = valid.slice(-20);
      avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    }
  }
  avgVolCache.set(symbol, avg);
  return avg;
}

/** ATR(14) % + 5일/20일 단순 추세 — 변동성/추세 지표 */
export async function fetchTechnicals(symbol) {
  const series = await fetchDaily(symbol);
  if (!series) return null;
  const { close, high, low } = series;
  const n = close.length;
  if (n < 15) return null;

  // ATR(14)
  const trs = [];
  for (let i = 1; i < n; i++) {
    const h = high[i];
    const l = low[i];
    const pc = close[i - 1];
    if ([h, l, pc].every((x) => typeof x === "number")) {
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
  }
  const atr = trs.slice(-14);
  const atrVal = atr.length ? atr.reduce((s, v) => s + v, 0) / atr.length : null;
  const last = close[n - 1];
  const atrPct = atrVal && last > 0 ? (atrVal / last) * 100 : null;

  const closes = close.filter((c) => typeof c === "number");
  const sma = (arr, k) =>
    arr.length >= k
      ? arr.slice(-k).reduce((s, v) => s + v, 0) / k
      : null;
  const sma5 = sma(closes, 5);
  const sma20 = sma(closes, 20);
  const ret5 =
    closes.length > 5 ? pct(closes[closes.length - 1], closes[closes.length - 6]) : null;
  const ret20 =
    closes.length > 20
      ? pct(closes[closes.length - 1], closes[closes.length - 21])
      : null;

  return {
    atrPct: atrPct != null ? Math.round(atrPct * 10) / 10 : null,
    sma5: sma5 != null ? Math.round(sma5 * 100) / 100 : null,
    sma20: sma20 != null ? Math.round(sma20 * 100) / 100 : null,
    aboveSma20: sma20 != null ? last > sma20 : null,
    ret5: ret5 != null ? Math.round(ret5 * 10) / 10 : null,
    ret20: ret20 != null ? Math.round(ret20 * 10) / 10 : null,
  };
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
