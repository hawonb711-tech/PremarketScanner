import { useCallback, useEffect, useMemo, useState } from "react";
import {
  scanPremarket,
  fetchIssues,
  fetchDeepDive,
  checkServer,
  volumeLevel,
  VOLUME_LABELS,
  tradeGrade,
  riskLevel,
  RISK_LABELS,
  GRADE_DESC,
  hasRealNews,
  buildWarnings,
  relatedNote,
  CATEGORY_LABELS,
  TIER_LABELS,
  SESSION_LABELS,
  RELATION_LABELS,
  fmtVolume,
  sortRows,
  buildChatGptInput,
  computeContinuation,
  CONTINUATION_LABELS,
  DEFAULT_ISSUES_MODEL,
  DEFAULT_DEEP_MODEL,
} from "./premarket";
import type {
  ScanConfig,
  ScanFilters,
  ScanRow,
  Issue,
  Grade,
  Risk,
  DeepDive,
  SortKey,
  SortState,
  Regime,
  ContinuationLabel,
  Prediction,
} from "./premarket";

const STORE_KEY = "pms.config";
const FILTER_KEY = "pms.filters";

function loadConfig(): ScanConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as ScanConfig;
      // 구버전(단일 model) 호환: 작업별 모델 기본값 채우기
      return {
        apiKey: c.apiKey ?? "",
        model: c.model || DEFAULT_DEEP_MODEL,
        issuesModel: c.issuesModel || DEFAULT_ISSUES_MODEL,
        deepModel: c.deepModel || c.model || DEFAULT_DEEP_MODEL,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    apiKey: "",
    model: DEFAULT_DEEP_MODEL,
    issuesModel: DEFAULT_ISSUES_MODEL,
    deepModel: DEFAULT_DEEP_MODEL,
  };
}

function loadFilters(): ScanFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return JSON.parse(raw) as ScanFilters;
  } catch {
    /* ignore */
  }
  return {
    minChangePct: 5,
    minPrice: 5,
    minVolume: 0,
    excludeMid: false,
    limit: 25,
  };
}

const GRADE_COLOR: Record<Grade, string> = {
  A: "#22c55e",
  B: "#3b82f6",
  C: "#f59e0b",
  D: "#ef4444",
};
const RISK_COLOR: Record<Risk, string> = {
  low: "#22c55e",
  mid: "#f59e0b",
  high: "#ef4444",
};
const CONT_COLOR: Record<ContinuationLabel, string> = {
  high: "#22c55e",
  mid: "#f59e0b",
  low: "#ef4444",
};

const AUTO_REFRESH_MS = 60_000;

export default function App() {
  const [config, setConfig] = useState<ScanConfig>(loadConfig);
  const [filters, setFilters] = useState<ScanFilters>(loadFilters);
  const [showSettings, setShowSettings] = useState(false);

  const [rows, setRows] = useState<ScanRow[]>([]);
  const [issues, setIssues] = useState<Record<string, Issue>>({});
  const [asOf, setAsOf] = useState<string>("");
  const [universeSize, setUniverseSize] = useState(0);
  const [regime, setRegime] = useState<Regime | undefined>(undefined);

  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<string | null>(null);
  const [server, setServer] = useState({ ok: true, hasEnvKey: true });
  const [sort, setSort] = useState<SortState>({ key: "changePct", dir: "desc" });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copied, setCopied] = useState(false);

  // 심층 분석
  const [deepDive, setDeepDive] = useState<DeepDive | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState("");
  const [deepFor, setDeepFor] = useState<string | null>(null);

  useEffect(() => {
    checkServer().then(setServer);
  }, []);

  const keyReady = server.hasEnvKey || Boolean(config.apiKey);

  const sortedRows = useMemo(
    () => sortRows(rows, issues, sort, regime),
    [rows, issues, sort, regime]
  );

  const runIssues = useCallback(
    async (scanRows: ScanRow[]) => {
      if (scanRows.length === 0 || !keyReady) return;
      setAnalyzing(true);
      setError("");
      setStatus(`급등 이유 분석 중… ${scanRows.length}개 종목 뉴스 조사`);
      try {
        const result = await fetchIssues(scanRows, config);
        setIssues(result.issues);
        const covered = Object.keys(result.issues).length;
        const failNote = result.chunksFailed
          ? ` (일부 ${result.chunksFailed}/${result.chunksTotal} 그룹 실패)`
          : "";
        setStatus(`완료 · ${scanRows.length}개 종목 · 이유 ${covered}개${failNote}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("");
      } finally {
        setAnalyzing(false);
      }
    },
    [config, keyReady]
  );

  const runScan = useCallback(
    async (silent = false) => {
      if (scanning || analyzing) return;
      setScanning(true);
      setError("");
      if (!silent) {
        setIssues({});
        setSelected(null);
      }
      setStatus("프리마켓 시세 스캔 중… (유니버스 전 종목 조회)");
      try {
        const result = await scanPremarket(filters);
        setRows(result.rows);
        setAsOf(result.asOf);
        setUniverseSize(result.universeSize);
        setRegime(result.regime);
        if (result.rows.length === 0) {
          setStatus(
            `조건을 만족하는 급등 종목이 없습니다. (유니버스 ${result.universeSize}개 중)`
          );
        } else {
          setStatus(`${result.rows.length}개 급등 종목 발견 · 이유 분석 준비`);
          if (keyReady) runIssues(result.rows);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("");
      } finally {
        setScanning(false);
      }
    },
    [filters, scanning, analyzing, keyReady, runIssues]
  );

  // 자동 새로고침
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (!scanning && !analyzing) runScan(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, scanning, analyzing, runScan]);

  const runDeepDive = useCallback(
    async (row: ScanRow) => {
      if (!keyReady) {
        setShowSettings(true);
        return;
      }
      setDeepFor(row.symbol);
      setDeepLoading(true);
      setDeepError("");
      setDeepDive(null);
      try {
        const result = await fetchDeepDive(row, config, {
          issue: issues[row.symbol],
          regime,
        });
        setDeepDive(result);
      } catch (e) {
        setDeepError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeepLoading(false);
      }
    },
    [config, keyReady, issues, regime]
  );

  const closeDeep = useCallback(() => {
    setDeepFor(null);
    setDeepDive(null);
    setDeepError("");
  }, []);

  const copyForChatGpt = useCallback(
    (row: ScanRow) => {
      const text = buildChatGptInput(row, issues[row.symbol]);
      navigator.clipboard?.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        },
        () => setCopied(false)
      );
    },
    [issues]
  );

  // 키보드: ↑/↓ 종목 이동, Enter 스캔, Esc 모달 닫기, D 심층분석
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (deepFor) closeDeep();
        else if (showSettings) setShowSettings(false);
        return;
      }
      if (typing) {
        if (e.key === "Enter" && !scanning) runScan();
        return;
      }
      if (deepFor) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (sortedRows.length === 0) return;
        e.preventDefault();
        const idx = sortedRows.findIndex((r) => r.symbol === selected);
        const next =
          e.key === "ArrowDown"
            ? Math.min(sortedRows.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        setSelected(sortedRows[next < 0 ? 0 : next].symbol);
      } else if (e.key.toLowerCase() === "d" && selected) {
        const row = rows.find((r) => r.symbol === selected);
        if (row) runDeepDive(row);
      } else if (e.key === "Enter" && !scanning) {
        runScan();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    sortedRows,
    selected,
    rows,
    deepFor,
    showSettings,
    scanning,
    runScan,
    runDeepDive,
    closeDeep,
  ]);

  const saveConfig = (next: ScanConfig) => {
    setConfig(next);
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    setShowSettings(false);
  };

  const updateFilters = (patch: Partial<ScanFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  };

  const selectedRow = useMemo(
    () => rows.find((r) => r.symbol === selected) || null,
    [rows, selected]
  );

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const grades: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
    let contSum = 0;
    let best: { symbol: string; score: number } | null = null;
    for (const r of rows) {
      const issue = issues[r.symbol];
      grades[tradeGrade(r, issue)] += 1;
      const p = computeContinuation(r, issue, regime);
      contSum += p.score;
      if (!best || p.score > best.score) best = { symbol: r.symbol, score: p.score };
    }
    return {
      total: rows.length,
      grades,
      avgCont: Math.round(contSum / rows.length),
      best,
    };
  }, [rows, issues, regime]);

  const busy = scanning || analyzing;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🚀</span>
          <div>
            <h1>프리마켓 급등주 스캐너</h1>
            <p>미국 프리마켓에서 오른 종목과 "왜 올랐는지"를 한눈에</p>
          </div>
        </div>
        <div className="top-actions">
          <label className="auto-toggle" title="60초마다 자동 재스캔">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            자동 새로고침
          </label>
          <button className="ghost-btn" onClick={() => setShowSettings(true)}>
            ⚙️ 설정
          </button>
        </div>
      </header>

      <FilterBar
        filters={filters}
        onChange={updateFilters}
        onScan={() => runScan()}
        onAnalyze={() => runIssues(rows)}
        scanning={scanning}
        analyzing={analyzing}
        canAnalyze={rows.length > 0 && keyReady && !busy}
      />

      {!server.ok && (
        <div className="status error">
          백엔드 서버에 연결할 수 없습니다. 터미널에서{" "}
          <code>npm run dev:all</code>로 서버를 함께 실행하세요.
        </div>
      )}
      {server.ok && !keyReady && (
        <div className="status warn">
          OpenAI 키가 없어 가격 스캔만 가능합니다. "왜 올랐는지" 이유 분석·심층
          분석을 쓰려면 <code>server/.env</code>에 OPENAI_API_KEY를 넣거나 ⚙️
          설정에서 키를 입력하세요.
        </div>
      )}
      {(status || error) && (
        <div className={`status ${error ? "error" : ""}`}>
          {error || status}
          {asOf && !error && (
            <span className="as-of">
              {" "}
              · 기준 {new Date(asOf).toLocaleString("ko-KR")} · 유니버스{" "}
              {universeSize}종목 · 데이터: Yahoo Finance
            </span>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overview">
          {regime && <RegimeBanner regime={regime} />}
          {stats && <StatBar stats={stats} onPick={setSelected} />}
        </div>
      )}

      <div className="main">
        <div className="table-wrap">
          {rows.length === 0 && scanning ? (
            <SkeletonTable />
          ) : rows.length === 0 ? (
            <div className="empty">
              <p>
                위 <b>스캔</b> 버튼을 누르면 미국 대형·중형주 유니버스에서
                프리마켓 급등 종목을 찾아 정렬합니다.
              </p>
              <p className="hint">
                기본 필터: 전일 종가 대비 +5% 이상 · 가격 $5 이상 · Nasdaq/NYSE
                대형주 위주 · <kbd>Enter</kbd> 스캔 · <kbd>↑↓</kbd> 종목 이동 ·{" "}
                <kbd>D</kbd> 심층 분석
              </p>
            </div>
          ) : (
            <ScanTable
              rows={sortedRows}
              issues={issues}
              regime={regime}
              analyzing={analyzing}
              selected={selected}
              sort={sort}
              onSort={toggleSort}
              onSelect={setSelected}
              onDeepDive={runDeepDive}
            />
          )}
        </div>

        <aside className="detail">
          {selectedRow ? (
            <DetailPanel
              row={selectedRow}
              issue={issues[selectedRow.symbol]}
              regime={regime}
              analyzing={analyzing}
              keyReady={keyReady}
              copied={copied}
              onDeepDive={() => runDeepDive(selectedRow)}
              onCopy={() => copyForChatGpt(selectedRow)}
            />
          ) : (
            <div className="detail-empty">
              <p>표에서 종목을 클릭하면 상세 분석이 여기에 표시됩니다.</p>
              <p className="hint">
                고점 대비 위치·VWAP·ATR·52주 위치, 경고, 관련주, 출처를
                확인하고 <b>🔬 심층 분석</b>으로 더 깊게 파고드세요.
              </p>
            </div>
          )}
        </aside>
      </div>

      <p className="disclaimer">
        ※ 본 도구는 투자 조언이 아닙니다. 가격은 지연/오차가 있을 수 있으며,
        급등 사유·심층 분석은 AI가 웹에서 수집·요약한 추정입니다. 매매 판단의
        책임은 사용자에게 있습니다.
      </p>

      {deepFor && (
        <DeepDiveModal
          symbol={deepFor}
          data={deepDive}
          loading={deepLoading}
          error={deepError}
          onClose={closeDeep}
        />
      )}

      {showSettings && (
        <SettingsModal
          config={config}
          onSave={saveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  onScan,
  onAnalyze,
  scanning,
  analyzing,
  canAnalyze,
}: {
  filters: ScanFilters;
  onChange: (p: Partial<ScanFilters>) => void;
  onScan: () => void;
  onAnalyze: () => void;
  scanning: boolean;
  analyzing: boolean;
  canAnalyze: boolean;
}) {
  return (
    <div className="filterbar">
      <label className="f">
        최소 상승률
        <div className="f-input">
          <input
            type="number"
            value={filters.minChangePct}
            min={0}
            step={1}
            onChange={(e) => onChange({ minChangePct: Number(e.target.value) })}
          />
          <span>%</span>
        </div>
      </label>
      <label className="f">
        최소 가격
        <div className="f-input">
          <span>$</span>
          <input
            type="number"
            value={filters.minPrice}
            min={0}
            step={1}
            onChange={(e) => onChange({ minPrice: Number(e.target.value) })}
          />
        </div>
      </label>
      <label className="f">
        최소 거래량
        <div className="f-input">
          <input
            type="number"
            value={filters.minVolume}
            min={0}
            step={100000}
            onChange={(e) => onChange({ minVolume: Number(e.target.value) })}
          />
        </div>
      </label>
      <label className="f">
        상위
        <div className="f-input">
          <input
            type="number"
            value={filters.limit}
            min={5}
            max={40}
            step={5}
            onChange={(e) => onChange({ limit: Number(e.target.value) })}
          />
          <span>개</span>
        </div>
      </label>
      <label className="f-check">
        <input
          type="checkbox"
          checked={filters.excludeMid}
          onChange={(e) => onChange({ excludeMid: e.target.checked })}
        />
        중형주 제외 (대형주만)
      </label>

      <div className="spacer" />
      <button className="primary-btn" disabled={scanning} onClick={onScan}>
        {scanning ? "스캔 중…" : "🔍 스캔"}
      </button>
      <button
        className="news-btn"
        disabled={!canAnalyze}
        onClick={onAnalyze}
        title="급등 종목들의 '왜 올랐는지'를 다시 분석"
      >
        {analyzing ? "분석 중…" : "📰 이유 분석"}
      </button>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="stars" title={`신뢰도 ${n}/5`}>
      <span className="stars-on">{"●".repeat(n)}</span>
      <span className="stars-off">{"○".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

function RegimeBanner({ regime }: { regime: Regime }) {
  const toneLabel =
    regime.tone === "risk_on"
      ? "위험선호 (순풍)"
      : regime.tone === "risk_off"
      ? "위험회피 (역풍)"
      : "중립";
  const toneColor =
    regime.tone === "risk_on"
      ? "#22c55e"
      : regime.tone === "risk_off"
      ? "#ef4444"
      : "#94a3b8";
  const fmt = (v: number | null) =>
    v == null ? "-" : `${v >= 0 ? "+" : ""}${v}%`;
  return (
    <div className="regime-banner">
      <span className="regime-tone" style={{ color: toneColor }}>
        ● 시장 {toneLabel}
      </span>
      <span className="regime-item">
        QQQ <b style={{ color: (regime.qqqChangePct ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{fmt(regime.qqqChangePct)}</b>
      </span>
      <span className="regime-item">
        SPY <b style={{ color: (regime.spyChangePct ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{fmt(regime.spyChangePct)}</b>
      </span>
      <span className="regime-item">
        VIX <b>{regime.vix ?? "-"}</b>
      </span>
      <span className="regime-note">
        지속 가능성 점수는 이 시장 환경을 반영합니다
      </span>
    </div>
  );
}

function StatBar({
  stats,
  onPick,
}: {
  stats: {
    total: number;
    grades: Record<Grade, number>;
    avgCont: number;
    best: { symbol: string; score: number } | null;
  };
  onPick: (s: string) => void;
}) {
  const contColor =
    stats.avgCont >= 66 ? "#22c55e" : stats.avgCont >= 45 ? "#f59e0b" : "#ef4444";
  return (
    <div className="statbar">
      <div className="stat">
        <div className="stat-num">{stats.total}</div>
        <div className="stat-label">급등 종목</div>
      </div>
      <div className="stat-sep" />
      <div className="stat grades">
        {(["A", "B", "C", "D"] as Grade[]).map((g) => (
          <span key={g} className={`gchip g-${g}`} title={`${g}등급 ${stats.grades[g]}개`}>
            <b style={{ background: GRADE_COLOR[g] }}>{g}</b>
            {stats.grades[g]}
          </span>
        ))}
      </div>
      <div className="stat-sep" />
      <div className="stat">
        <div className="stat-num" style={{ color: contColor }}>
          {stats.avgCont}
        </div>
        <div className="stat-label">평균 지속성</div>
      </div>
      {stats.best && (
        <>
          <div className="stat-sep" />
          <button
            className="stat best"
            onClick={() => onPick(stats.best!.symbol)}
            title="가장 높은 지속 가능성 종목"
          >
            <div className="stat-num best-sym">⭐ {stats.best.symbol}</div>
            <div className="stat-label">최고 지속성 {stats.best.score}</div>
          </button>
        </>
      )}
    </div>
  );
}

function ContinuationGauge({ pred }: { pred: Prediction }) {
  const color = CONT_COLOR[pred.label];
  const R = 34;
  const C = 2 * Math.PI * R;
  const off = C * (1 - pred.score / 100);
  return (
    <div className="gauge-ring">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={R} className="ring-bg" />
        <circle
          cx="42"
          cy="42"
          r={R}
          className="ring-fg"
          style={{
            stroke: color,
            strokeDasharray: C,
            strokeDashoffset: off,
          }}
        />
        <text x="42" y="40" className="ring-score" style={{ fill: color }}>
          {pred.score}
        </text>
        <text x="42" y="55" className="ring-of">
          /100
        </text>
      </svg>
    </div>
  );
}

function ContinuationBadge({ pred }: { pred: Prediction }) {
  return (
    <span
      className="cont-badge"
      style={{ borderColor: CONT_COLOR[pred.label], color: CONT_COLOR[pred.label] }}
      title={`${CONTINUATION_LABELS[pred.label]} · ${pred.basisCount}개 요인`}
    >
      <b>{pred.score}</b>
      <span className="cont-bar">
        <span
          className="cont-fill"
          style={{ width: `${pred.score}%`, background: CONT_COLOR[pred.label] }}
        />
      </span>
    </span>
  );
}

function SkeletonTable() {
  return (
    <div className="skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <div className="skel-row" key={i}>
          <div className="skel-cell w-sym" />
          <div className="skel-cell w-num" />
          <div className="skel-cell w-num" />
          <div className="skel-cell w-issue" />
          <div className="skel-cell w-sm" />
        </div>
      ))}
    </div>
  );
}

const SORT_LABEL: Record<SortKey, string> = {
  changePct: "상승률",
  price: "현재가",
  volume: "거래량",
  volumeRatio: "거래량",
  fromHighPct: "고점대비",
  atrPct: "ATR",
  reliability: "신뢰도",
  grade: "매매",
  continuation: "지속성",
};

function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`sortable ${className ?? ""} ${active ? "active" : ""}`}
      onClick={() => onSort(sortKey)}
      title={`${SORT_LABEL[sortKey]} 기준 정렬`}
    >
      {label}
      <span className="sort-ind">{active ? (sort.dir === "desc" ? "▼" : "▲") : "↕"}</span>
    </th>
  );
}

function ScanTable({
  rows,
  issues,
  regime,
  analyzing,
  selected,
  sort,
  onSort,
  onSelect,
  onDeepDive,
}: {
  rows: ScanRow[];
  issues: Record<string, Issue>;
  regime?: Regime;
  analyzing: boolean;
  selected: string | null;
  sort: SortState;
  onSort: (k: SortKey) => void;
  onSelect: (s: string) => void;
  onDeepDive: (r: ScanRow) => void;
}) {
  return (
    <table className="scan-table">
      <thead>
        <tr>
          <th>종목</th>
          <SortTh label="상승률" sortKey="changePct" sort={sort} onSort={onSort} className="num" />
          <SortTh label="현재가" sortKey="price" sort={sort} onSort={onSort} className="num" />
          <SortTh label="거래량" sortKey="volumeRatio" sort={sort} onSort={onSort} className="num" />
          <SortTh label="지속성" sortKey="continuation" sort={sort} onSort={onSort} className="ctr" />
          <th>주요 이슈</th>
          <SortTh label="신뢰도" sortKey="reliability" sort={sort} onSort={onSort} className="ctr" />
          <SortTh label="매매" sortKey="grade" sort={sort} onSort={onSort} className="ctr" />
          <th className="ctr">위험도</th>
          <th className="ctr"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const issue = issues[r.symbol];
          const lvl = volumeLevel(r);
          const grade = tradeGrade(r, issue);
          const risk = riskLevel(r, issue);
          const news = hasRealNews(issue);
          const pred = computeContinuation(r, issue, regime);
          return (
            <tr
              key={r.symbol}
              className={selected === r.symbol ? "sel" : ""}
              onClick={() => onSelect(r.symbol)}
            >
              <td>
                <div className="sym">{r.symbol}</div>
                <div className="sym-name">{r.name}</div>
                <div className="badges">
                  <span className={`tier tier-${r.tier}`}>
                    {TIER_LABELS[r.tier]}
                  </span>
                  <span className="sess">{SESSION_LABELS[r.session]}</span>
                  {r.sector && <span className="sector">{r.sector}</span>}
                </div>
              </td>
              <td className="num">
                <span className="up">+{r.changePct}%</span>
                {r.fromHighPct != null && (
                  <div className="sub">고점대비 {r.fromHighPct}%</div>
                )}
              </td>
              <td className="num">
                ${r.price}
                {r.vwapDeltaPct != null && (
                  <div className={`sub ${r.aboveVwap ? "vwap-up" : "vwap-down"}`}>
                    VWAP {r.vwapDeltaPct >= 0 ? "+" : ""}
                    {r.vwapDeltaPct}%
                  </div>
                )}
              </td>
              <td className="num">
                {fmtVolume(r.volume)}
                <div className={`sub vol-${lvl}`}>
                  {VOLUME_LABELS[lvl]}
                  {r.volumeRatio != null && ` ·x${r.volumeRatio}`}
                </div>
              </td>
              <td className="ctr">
                <ContinuationBadge pred={pred} />
              </td>
              <td className="issue-cell">
                {issue ? (
                  <>
                    <div className="issue-sum">{issue.summary || "—"}</div>
                    <div className="cats">
                      {issue.categories.map((c) => (
                        <span
                          key={c}
                          className={`cat ${c === "none" ? "cat-none" : ""}`}
                        >
                          {CATEGORY_LABELS[c]}
                        </span>
                      ))}
                    </div>
                  </>
                ) : analyzing ? (
                  <span className="muted shimmer">분석 중…</span>
                ) : (
                  <span className="muted">미분석 (이유 분석 실행)</span>
                )}
              </td>
              <td className="ctr">
                {issue ? (
                  <Stars n={issue.reliability} />
                ) : (
                  <span className="muted">–</span>
                )}
              </td>
              <td className="ctr">
                {issue ? (
                  <span
                    className="grade"
                    style={{ background: GRADE_COLOR[grade] }}
                    title={GRADE_DESC[grade]}
                  >
                    {grade}
                  </span>
                ) : (
                  <span className="muted">–</span>
                )}
              </td>
              <td className="ctr">
                <span
                  className="risk"
                  style={{ color: RISK_COLOR[risk] }}
                  title={!news ? "뉴스 없음 급등 주의" : ""}
                >
                  ● {RISK_LABELS[risk]}
                </span>
              </td>
              <td className="ctr">
                <button
                  className="deep-mini"
                  title="심층 분석 (D)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeepDive(r);
                  }}
                >
                  🔬
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DetailPanel({
  row,
  issue,
  regime,
  analyzing,
  keyReady,
  copied,
  onDeepDive,
  onCopy,
}: {
  row: ScanRow;
  issue?: Issue;
  regime?: Regime;
  analyzing: boolean;
  keyReady: boolean;
  copied: boolean;
  onDeepDive: () => void;
  onCopy: () => void;
}) {
  const grade = tradeGrade(row, issue);
  const risk = riskLevel(row, issue);
  const warnings = buildWarnings(row, issue);
  const note = relatedNote(row, issue);
  const pred = computeContinuation(row, issue, regime);

  return (
    <div className="detail-card">
      <div className="d-head">
        <div>
          <h2>{row.symbol}</h2>
          <div className="d-name">{row.name}</div>
          <div className="badges">
            <span className={`tier tier-${row.tier}`}>
              {TIER_LABELS[row.tier]}
            </span>
            <span className="sess">{SESSION_LABELS[row.session]}</span>
            <span className="exch">{row.exchange}</span>
            {row.sector && <span className="sector">{row.sector}</span>}
          </div>
        </div>
        <div className="d-grade">
          <span className="grade big" style={{ background: GRADE_COLOR[grade] }}>
            {grade}
          </span>
          <span className="grade-desc">{GRADE_DESC[grade]}</span>
        </div>
      </div>

      <div className="d-actions">
        <button
          className="primary-btn block"
          onClick={onDeepDive}
          title={keyReady ? "이 종목 심층 분석 (D)" : "OpenAI 키 필요"}
        >
          🔬 심층 분석
        </button>
        <button className="ghost-btn" onClick={onCopy} title="ChatGPT 단타 코치용 텍스트 복사">
          {copied ? "✓ 복사됨" : "📋 ChatGPT 복사"}
        </button>
      </div>

      <div className="d-price">
        <div className="dp-main">
          <span className="dp-cur">${row.price}</span>
          <span className="dp-chg">+{row.changePct}%</span>
        </div>
        <div className="d-grid">
          <Metric label="전일 종가" value={`$${row.prevClose}`} />
          {row.gapPct != null && (
            <Metric
              label="갭(시초가)"
              value={`${row.gapPct >= 0 ? "+" : ""}${row.gapPct}%`}
              tone={row.gapPct >= 0 ? "up" : "down"}
            />
          )}
          {row.preMarketHigh != null && (
            <Metric label="프리마켓 고점" value={`$${row.preMarketHigh}`} />
          )}
          {row.sessionHigh != null && row.preMarketHigh == null && (
            <Metric label="장중 고점" value={`$${row.sessionHigh}`} />
          )}
          {row.fromHighPct != null && (
            <Metric
              label="고점 대비"
              value={`${row.fromHighPct}%`}
              tone={row.fromHighPct >= -2 ? "warn" : "down"}
            />
          )}
          {row.vwap != null && (
            <Metric label="VWAP" value={`$${row.vwap}`} />
          )}
          {row.vwapDeltaPct != null && (
            <Metric
              label="VWAP 대비"
              value={`${row.vwapDeltaPct >= 0 ? "+" : ""}${row.vwapDeltaPct}%`}
              tone={row.vwapDeltaPct >= 0 ? "up" : "down"}
            />
          )}
          {row.regularOpen != null && (
            <Metric label="시초가" value={`$${row.regularOpen}`} />
          )}
          {row.fromOpenPct != null && (
            <Metric
              label="시초가 대비"
              value={`${row.fromOpenPct >= 0 ? "+" : ""}${row.fromOpenPct}%`}
              tone={row.fromOpenPct >= 0 ? "up" : "down"}
            />
          )}
          {row.fiftyTwoHigh != null && (
            <Metric label="52주 고점" value={`$${row.fiftyTwoHigh}`} />
          )}
          {row.from52HighPct != null && (
            <Metric label="52주 고점 대비" value={`${row.from52HighPct}%`} />
          )}
          {row.atrPct != null && (
            <Metric label="ATR(14)" value={`${row.atrPct}%`} />
          )}
          <Metric
            label="거래량"
            value={`${fmtVolume(row.volume)} (${VOLUME_LABELS[volumeLevel(row)]})`}
          />
          <Metric
            label="위험도"
            value={`● ${RISK_LABELS[risk]}`}
            tone="risk"
            riskColor={RISK_COLOR[risk]}
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <div key={i} className={`warn-box warn-${w.kind}`}>
              ⚠️ {w.text}
            </div>
          ))}
        </div>
      )}

      <div className="d-section">
        <h3>지속 가능성 예측</h3>
        <div className="pred-head">
          <ContinuationGauge pred={pred} />
          <div className="pred-label-wrap">
            <div
              className="pred-label"
              style={{ color: CONT_COLOR[pred.label] }}
            >
              {CONTINUATION_LABELS[pred.label]}
            </div>
            {pred.expectedMovePct != null && (
              <div className="pred-exp">
                ATR 기준 당일 기대 변동폭 ±{pred.expectedMovePct}%
              </div>
            )}
          </div>
        </div>
        <div className="pred-factors">
          {pred.factors.map((f, i) => (
            <div className="pred-factor" key={i}>
              <span className="pf-name">{f.name}</span>
              <span className="pf-bar">
                <span
                  className="pf-fill"
                  style={{
                    width: `${Math.min(100, Math.abs(f.contribution) * 6)}%`,
                    background: f.contribution >= 0 ? "#22c55e" : "#ef4444",
                    marginLeft: f.contribution >= 0 ? "50%" : undefined,
                    marginRight: f.contribution < 0 ? "50%" : undefined,
                    transform: f.contribution < 0 ? "translateX(-100%)" : undefined,
                  }}
                />
              </span>
              <span
                className="pf-val"
                style={{ color: f.contribution >= 0 ? "#22c55e" : "#ef4444" }}
              >
                {f.contribution >= 0 ? "+" : ""}
                {f.contribution}
              </span>
              <span className="pf-detail">{f.detail}</span>
            </div>
          ))}
        </div>
        {row.gapHistory && !row.gapHistory.lowSample && (
          <p className="pred-note">
            📊 과거 유사 갭({row.gapHistory.gapThreshold}%+) {row.gapHistory.count}회
            중 <b>{row.gapHistory.continuationRate}%</b>가 시초가 위 마감 · 장중
            평균 {row.gapHistory.avgIntraday}% · 익일 평균{" "}
            {row.gapHistory.avgNextDay}%
          </p>
        )}
        {row.gapHistory && row.gapHistory.lowSample && (
          <p className="pred-note muted">
            과거 유사 갭 표본 부족({row.gapHistory.count}회) — 베이스레이트 신뢰도 낮음
          </p>
        )}
        {!issue && (
          <p className="pred-note muted">
            뉴스 미반영 점수입니다. "📰 이유 분석" 후 정확도가 올라갑니다.
          </p>
        )}
      </div>

      <div className="d-section">
        <h3>왜 올랐는지</h3>
        {issue ? (
          <>
            {issue.theme && <div className="theme">🎯 {issue.theme}</div>}
            <p className="d-summary">{issue.summary || "요약 없음"}</p>
            <div className="cats">
              {issue.categories.map((c) => (
                <span key={c} className={`cat ${c === "none" ? "cat-none" : ""}`}>
                  {CATEGORY_LABELS[c]}
                </span>
              ))}
            </div>
            <div className="reliability-row">
              <span>이슈 신뢰도</span>
              <Stars n={issue.reliability} />
              <span className="muted">{issue.reliability}/5</span>
            </div>
          </>
        ) : analyzing ? (
          <p className="muted">분석 중…</p>
        ) : (
          <p className="muted">
            아직 이유를 분석하지 않았습니다. 상단 "📰 이유 분석"을 실행하세요.
          </p>
        )}
      </div>

      {note && (
        <div className="d-section">
          <h3>관련주</h3>
          <p className="related-note">{note}</p>
          <div className="related-chips">
            {issue?.related.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {issue && issue.sources.length > 0 && (
        <div className="d-section">
          <h3>출처</h3>
          <div className="sources">
            {issue.sources.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" title={u}>
                🔗 출처{i + 1}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  riskColor,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "warn" | "risk";
  riskColor?: string;
}) {
  const color =
    tone === "up"
      ? "#22c55e"
      : tone === "down"
      ? "#ef4444"
      : tone === "warn"
      ? "#f59e0b"
      : tone === "risk"
      ? riskColor
      : undefined;
  return (
    <div className="metric-box">
      <div className="m-label">{label}</div>
      <div className="m-value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

const IMPACT_COLOR: Record<string, string> = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#94a3b8",
};

function DeepDiveModal({
  symbol,
  data,
  loading,
  error,
  onClose,
}: {
  symbol: string;
  data: DeepDive | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal deep-modal" onClick={(e) => e.stopPropagation()}>
        <div className="deep-head">
          <h2>🔬 {symbol} 심층 분석</h2>
          <button className="ghost-btn" onClick={onClose}>
            닫기 (Esc)
          </button>
        </div>

        {loading && (
          <div className="deep-loading">
            <div className="spinner" />
            <p>웹에서 사업·촉매·관계망·리스크를 조사 중입니다… (수십 초)</p>
          </div>
        )}

        {error && <div className="status error">{error}</div>}

        {data && !loading && (
          <div className="deep-body">
            {data.oneLiner && (
              <p className="deep-oneliner">
                {data.sector && <span className="deep-sector">{data.sector}</span>}
                {data.oneLiner}
              </p>
            )}

            <div className="deep-grid">
              <section className="deep-card">
                <h3>오늘의 촉매</h3>
                <p>{data.catalyst || "—"}</p>
                <div className="conf-row">
                  <span>분석 신뢰도</span>
                  <Stars n={data.confidence} />
                  <span className="muted">{data.confidence}/5</span>
                </div>
              </section>

              <section className="deep-card">
                <h3>단타 종합 코멘트</h3>
                <p>{data.comment || "—"}</p>
              </section>
            </div>

            {data.timeline.length > 0 && (
              <section className="deep-card">
                <h3>최근 촉매 타임라인</h3>
                <ul className="timeline">
                  {data.timeline.map((t, i) => (
                    <li key={i}>
                      <span
                        className="tl-dot"
                        style={{ background: IMPACT_COLOR[t.impact] }}
                      />
                      <span className="tl-date">{t.date}</span>
                      <span className="tl-title">{t.title}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="deep-grid">
              {data.bullCase.length > 0 && (
                <section className="deep-card bull">
                  <h3>▲ 강세 논거</h3>
                  <ul>
                    {data.bullCase.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </section>
              )}
              {data.bearCase.length > 0 && (
                <section className="deep-card bear">
                  <h3>▼ 약세·리스크</h3>
                  <ul>
                    {data.bearCase.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {data.levels.length > 0 && (
              <section className="deep-card">
                <h3>단타 핵심 가격대</h3>
                <table className="levels-table">
                  <tbody>
                    {data.levels.map((l, i) => (
                      <tr key={i}>
                        <td className="lv-label">{l.label}</td>
                        <td className="lv-val">
                          {l.value != null ? `$${l.value}` : "—"}
                        </td>
                        <td className="lv-note">{l.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {data.related.length > 0 && (
              <section className="deep-card">
                <h3>관계망 (함께 보는 종목)</h3>
                <div className="rel-grid">
                  {data.related.map((r) => (
                    <div className="rel-card" key={r.symbol}>
                      <div className="rel-top">
                        <span className="rel-sym">{r.symbol}</span>
                        <span className="rel-type">
                          {RELATION_LABELS[r.relation]}
                        </span>
                      </div>
                      <div className="rel-name">{r.name}</div>
                      <div className="rel-reason">{r.reason}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.sources.length > 0 && (
              <section className="deep-card">
                <h3>출처</h3>
                <div className="sources">
                  {data.sources.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" title={u}>
                      🔗 출처{i + 1}
                    </a>
                  ))}
                </div>
              </section>
            )}

            <p className="disclaimer">
              ※ AI가 웹에서 수집·요약한 추정입니다. 매수 권유가 아니며, 가격대는
              참고용입니다. 반드시 출처와 실제 차트로 교차검증하세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsModal({
  config,
  onSave,
  onClose,
}: {
  config: ScanConfig;
  onSave: (c: ScanConfig) => void;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState(config.apiKey ?? "");
  const [issuesModel, setIssuesModel] = useState(
    config.issuesModel || DEFAULT_ISSUES_MODEL
  );
  const [deepModel, setDeepModel] = useState(
    config.deepModel || config.model || DEFAULT_DEEP_MODEL
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>설정</h2>
        <label>OpenAI API 키 (선택)</label>
        <input
          type="password"
          value={apiKey}
          placeholder="server/.env에 키가 있으면 비워두세요"
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="note">
          권장: <code>server/.env</code>에 키를 보관하세요. 여기 입력한 키는
          브라우저에 저장되며 요청 시 백엔드로만 전달됩니다. 가격 스캔은 키
          없이도 동작합니다.
        </p>

        <label>📰 이유 분석 모델 (대량·저렴 권장)</label>
        <input
          list="model-presets"
          value={issuesModel}
          placeholder={DEFAULT_ISSUES_MODEL}
          onChange={(e) => setIssuesModel(e.target.value)}
        />
        <p className="note">
          25종목 뉴스 요약·분류는 정형 작업이라 저렴한 모델로도 충분합니다.
        </p>

        <label>🔬 심층 분석 모델 (추론·플래그십 권장)</label>
        <input
          list="model-presets"
          value={deepModel}
          placeholder={DEFAULT_DEEP_MODEL}
          onChange={(e) => setDeepModel(e.target.value)}
        />
        <p className="note">
          선택한 1종목의 강세/약세·관계망 판단은 강한 모델이 유리합니다.
        </p>

        <datalist id="model-presets">
          <option value="gpt-5.5">최신 플래그십</option>
          <option value="gpt-5.4-mini">빠름·저렴</option>
          <option value="gpt-4o">레거시</option>
        </datalist>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            취소
          </button>
          <button
            className="primary-btn"
            onClick={() =>
              onSave({
                apiKey: apiKey.trim(),
                issuesModel: issuesModel.trim() || DEFAULT_ISSUES_MODEL,
                deepModel: deepModel.trim() || DEFAULT_DEEP_MODEL,
                model: deepModel.trim() || DEFAULT_DEEP_MODEL,
              })
            }
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
