// 프리마켓 스캐너 대상 유니버스: 미국 Nasdaq/NYSE의 유동성 높은 대형·중형주.
// 시총이 너무 작은 잡주/페니주는 처음부터 제외하기 위해 큐레이션된 목록을 사용한다.
// tier: mega(>$200B) / large($10B~$200B) / mid($2B~$10B)
// (무료 차트 API로는 시총을 직접 얻기 어려워, 이 tier로 "대형주" 여부를 판정한다.)

export const UNIVERSE = [
  // ── 메가캡 빅테크 ──
  { symbol: "AAPL", name: "Apple", tier: "mega" },
  { symbol: "MSFT", name: "Microsoft", tier: "mega" },
  { symbol: "GOOGL", name: "Alphabet (Google)", tier: "mega" },
  { symbol: "AMZN", name: "Amazon", tier: "mega" },
  { symbol: "META", name: "Meta Platforms", tier: "mega" },
  { symbol: "NVDA", name: "NVIDIA", tier: "mega" },
  { symbol: "TSLA", name: "Tesla", tier: "mega" },
  { symbol: "AVGO", name: "Broadcom", tier: "mega" },
  { symbol: "ORCL", name: "Oracle", tier: "mega" },
  { symbol: "NFLX", name: "Netflix", tier: "mega" },

  // ── 반도체 / AI 하드웨어 ──
  { symbol: "AMD", name: "Advanced Micro Devices", tier: "mega" },
  { symbol: "MRVL", name: "Marvell Technology", tier: "large" },
  { symbol: "QCOM", name: "Qualcomm", tier: "large" },
  { symbol: "TXN", name: "Texas Instruments", tier: "large" },
  { symbol: "INTC", name: "Intel", tier: "large" },
  { symbol: "MU", name: "Micron Technology", tier: "large" },
  { symbol: "TSM", name: "TSMC (ADR)", tier: "mega" },
  { symbol: "ASML", name: "ASML (ADR)", tier: "mega" },
  { symbol: "AMAT", name: "Applied Materials", tier: "large" },
  { symbol: "LRCX", name: "Lam Research", tier: "large" },
  { symbol: "KLAC", name: "KLA Corp", tier: "large" },
  { symbol: "ARM", name: "Arm Holdings", tier: "large" },
  { symbol: "SMCI", name: "Super Micro Computer", tier: "large" },
  { symbol: "DELL", name: "Dell Technologies", tier: "large" },
  { symbol: "HPE", name: "Hewlett Packard Enterprise", tier: "large" },
  { symbol: "ON", name: "ON Semiconductor", tier: "large" },
  { symbol: "MCHP", name: "Microchip Technology", tier: "large" },
  { symbol: "NXPI", name: "NXP Semiconductors", tier: "large" },
  { symbol: "ADI", name: "Analog Devices", tier: "large" },
  { symbol: "WDC", name: "Western Digital", tier: "mid" },
  { symbol: "STX", name: "Seagate Technology", tier: "mid" },
  { symbol: "VRT", name: "Vertiv Holdings", tier: "large" },
  { symbol: "ANET", name: "Arista Networks", tier: "large" },
  { symbol: "CRDO", name: "Credo Technology", tier: "mid" },
  { symbol: "ALAB", name: "Astera Labs", tier: "mid" },

  // ── 소프트웨어 / 클라우드 ──
  { symbol: "CRM", name: "Salesforce", tier: "mega" },
  { symbol: "ADBE", name: "Adobe", tier: "large" },
  { symbol: "NOW", name: "ServiceNow", tier: "large" },
  { symbol: "PLTR", name: "Palantir Technologies", tier: "large" },
  { symbol: "SNOW", name: "Snowflake", tier: "large" },
  { symbol: "PANW", name: "Palo Alto Networks", tier: "large" },
  { symbol: "CRWD", name: "CrowdStrike", tier: "large" },
  { symbol: "ZS", name: "Zscaler", tier: "large" },
  { symbol: "DDOG", name: "Datadog", tier: "large" },
  { symbol: "NET", name: "Cloudflare", tier: "large" },
  { symbol: "MDB", name: "MongoDB", tier: "mid" },
  { symbol: "SNPS", name: "Synopsys", tier: "large" },
  { symbol: "CDNS", name: "Cadence Design", tier: "large" },
  { symbol: "INTU", name: "Intuit", tier: "large" },
  { symbol: "WDAY", name: "Workday", tier: "large" },
  { symbol: "TEAM", name: "Atlassian", tier: "large" },
  { symbol: "SHOP", name: "Shopify", tier: "large" },
  { symbol: "UBER", name: "Uber Technologies", tier: "large" },
  { symbol: "ABNB", name: "Airbnb", tier: "large" },
  { symbol: "APP", name: "AppLovin", tier: "large" },

  // ── 인터넷 / 미디어 / 통신 ──
  { symbol: "DIS", name: "Walt Disney", tier: "large" },
  { symbol: "CMCSA", name: "Comcast", tier: "large" },
  { symbol: "T", name: "AT&T", tier: "large" },
  { symbol: "VZ", name: "Verizon", tier: "large" },
  { symbol: "SPOT", name: "Spotify", tier: "large" },
  { symbol: "ROKU", name: "Roku", tier: "mid" },
  { symbol: "PINS", name: "Pinterest", tier: "large" },
  { symbol: "SNAP", name: "Snap", tier: "mid" },
  { symbol: "RDDT", name: "Reddit", tier: "large" },
  { symbol: "DASH", name: "DoorDash", tier: "large" },

  // ── 결제 / 핀테크 / 금융 ──
  { symbol: "V", name: "Visa", tier: "mega" },
  { symbol: "MA", name: "Mastercard", tier: "mega" },
  { symbol: "JPM", name: "JPMorgan Chase", tier: "mega" },
  { symbol: "BAC", name: "Bank of America", tier: "large" },
  { symbol: "WFC", name: "Wells Fargo", tier: "large" },
  { symbol: "GS", name: "Goldman Sachs", tier: "large" },
  { symbol: "MS", name: "Morgan Stanley", tier: "large" },
  { symbol: "PYPL", name: "PayPal", tier: "large" },
  { symbol: "SQ", name: "Block", tier: "large" },
  { symbol: "COIN", name: "Coinbase", tier: "large" },
  { symbol: "HOOD", name: "Robinhood", tier: "large" },
  { symbol: "SOFI", name: "SoFi Technologies", tier: "mid" },
  { symbol: "AFRM", name: "Affirm", tier: "mid" },

  // ── 헬스케어 / 바이오 ──
  { symbol: "LLY", name: "Eli Lilly", tier: "mega" },
  { symbol: "JNJ", name: "Johnson & Johnson", tier: "mega" },
  { symbol: "UNH", name: "UnitedHealth", tier: "mega" },
  { symbol: "ABBV", name: "AbbVie", tier: "mega" },
  { symbol: "MRK", name: "Merck", tier: "large" },
  { symbol: "PFE", name: "Pfizer", tier: "large" },
  { symbol: "MRNA", name: "Moderna", tier: "mid" },
  { symbol: "AMGN", name: "Amgen", tier: "large" },
  { symbol: "GILD", name: "Gilead Sciences", tier: "large" },
  { symbol: "VRTX", name: "Vertex Pharmaceuticals", tier: "large" },
  { symbol: "REGN", name: "Regeneron", tier: "large" },
  { symbol: "BIIB", name: "Biogen", tier: "mid" },
  { symbol: "ISRG", name: "Intuitive Surgical", tier: "large" },

  // ── 소비재 / 리테일 ──
  { symbol: "WMT", name: "Walmart", tier: "mega" },
  { symbol: "COST", name: "Costco", tier: "mega" },
  { symbol: "HD", name: "Home Depot", tier: "mega" },
  { symbol: "NKE", name: "Nike", tier: "large" },
  { symbol: "SBUX", name: "Starbucks", tier: "large" },
  { symbol: "MCD", name: "McDonald's", tier: "mega" },
  { symbol: "TGT", name: "Target", tier: "large" },
  { symbol: "LULU", name: "Lululemon", tier: "large" },
  { symbol: "CMG", name: "Chipotle", tier: "large" },
  { symbol: "KO", name: "Coca-Cola", tier: "mega" },
  { symbol: "PEP", name: "PepsiCo", tier: "mega" },

  // ── 산업재 / 에너지 / EV ──
  { symbol: "BA", name: "Boeing", tier: "large" },
  { symbol: "GE", name: "GE Aerospace", tier: "large" },
  { symbol: "CAT", name: "Caterpillar", tier: "large" },
  { symbol: "XOM", name: "ExxonMobil", tier: "mega" },
  { symbol: "CVX", name: "Chevron", tier: "mega" },
  { symbol: "RIVN", name: "Rivian", tier: "mid" },
  { symbol: "LCID", name: "Lucid Group", tier: "mid" },
  { symbol: "NIO", name: "NIO (ADR)", tier: "mid" },
  { symbol: "F", name: "Ford", tier: "large" },
  { symbol: "GM", name: "General Motors", tier: "large" },
  { symbol: "ENPH", name: "Enphase Energy", tier: "mid" },
  { symbol: "FSLR", name: "First Solar", tier: "large" },
  { symbol: "PLUG", name: "Plug Power", tier: "mid" },
  { symbol: "CCJ", name: "Cameco", tier: "large" },
  { symbol: "OKLO", name: "Oklo", tier: "mid" },

  // ── 중국 ADR / 기타 변동성 대형주 ──
  { symbol: "BABA", name: "Alibaba (ADR)", tier: "large" },
  { symbol: "PDD", name: "PDD Holdings (ADR)", tier: "large" },
  { symbol: "JD", name: "JD.com (ADR)", tier: "large" },
  { symbol: "BIDU", name: "Baidu (ADR)", tier: "mid" },

  // ── 주요 ETF (테마/시장 흐름 참고용) ──
  { symbol: "SPY", name: "S&P 500 ETF", tier: "mega" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", tier: "mega" },
  { symbol: "SMH", name: "반도체 ETF", tier: "large" },
];

// 섹터/테마 라벨 (심층 분석·관련주 묶음용). 심볼→섹터 매핑.
export const SECTOR = {
  semi: "반도체/AI 하드웨어",
  software: "소프트웨어/클라우드",
  internet: "인터넷/미디어",
  fintech: "금융/핀테크",
  health: "헬스케어/바이오",
  consumer: "소비재/리테일",
  industrial: "산업재/에너지/EV",
  china: "중국 ADR",
  etf: "ETF",
  bigtech: "빅테크",
};

const SECTOR_BY_SYMBOL = {
  AAPL: "bigtech", MSFT: "bigtech", GOOGL: "bigtech", AMZN: "bigtech",
  META: "bigtech", NVDA: "semi", TSLA: "industrial", AVGO: "semi",
  ORCL: "software", NFLX: "internet",
  AMD: "semi", MRVL: "semi", QCOM: "semi", TXN: "semi", INTC: "semi",
  MU: "semi", TSM: "semi", ASML: "semi", AMAT: "semi", LRCX: "semi",
  KLAC: "semi", ARM: "semi", SMCI: "semi", DELL: "semi", HPE: "semi",
  ON: "semi", MCHP: "semi", NXPI: "semi", ADI: "semi", WDC: "semi",
  STX: "semi", VRT: "semi", ANET: "semi", CRDO: "semi", ALAB: "semi",
  CRM: "software", ADBE: "software", NOW: "software", PLTR: "software",
  SNOW: "software", PANW: "software", CRWD: "software", ZS: "software",
  DDOG: "software", NET: "software", MDB: "software", SNPS: "software",
  CDNS: "software", INTU: "software", WDAY: "software", TEAM: "software",
  SHOP: "software", UBER: "internet", ABNB: "internet", APP: "software",
  DIS: "internet", CMCSA: "internet", T: "internet", VZ: "internet",
  SPOT: "internet", ROKU: "internet", PINS: "internet", SNAP: "internet",
  RDDT: "internet", DASH: "internet",
  V: "fintech", MA: "fintech", JPM: "fintech", BAC: "fintech",
  WFC: "fintech", GS: "fintech", MS: "fintech", PYPL: "fintech",
  SQ: "fintech", COIN: "fintech", HOOD: "fintech", SOFI: "fintech",
  AFRM: "fintech",
  LLY: "health", JNJ: "health", UNH: "health", ABBV: "health",
  MRK: "health", PFE: "health", MRNA: "health", AMGN: "health",
  GILD: "health", VRTX: "health", REGN: "health", BIIB: "health",
  ISRG: "health",
  WMT: "consumer", COST: "consumer", HD: "consumer", NKE: "consumer",
  SBUX: "consumer", MCD: "consumer", TGT: "consumer", LULU: "consumer",
  CMG: "consumer", KO: "consumer", PEP: "consumer",
  BA: "industrial", GE: "industrial", CAT: "industrial", XOM: "industrial",
  CVX: "industrial", RIVN: "industrial", LCID: "industrial", NIO: "china",
  F: "industrial", GM: "industrial", ENPH: "industrial", FSLR: "industrial",
  PLUG: "industrial", CCJ: "industrial", OKLO: "industrial",
  BABA: "china", PDD: "china", JD: "china", BIDU: "china",
  SPY: "etf", QQQ: "etf", SMH: "etf",
};

export function sectorOf(symbol) {
  return SECTOR_BY_SYMBOL[symbol] || null;
}

export function sectorLabel(symbol) {
  const s = SECTOR_BY_SYMBOL[symbol];
  return s ? SECTOR[s] : "";
}

export const UNIVERSE_MAP = new Map(UNIVERSE.map((u) => [u.symbol, u]));
