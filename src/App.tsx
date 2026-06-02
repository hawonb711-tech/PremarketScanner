import { useCallback, useEffect, useMemo, useState } from "react";
import {
  scanPremarket,
  fetchIssues,
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
  fmtVolume,
} from "./premarket";
import type {
  ScanConfig,
  ScanFilters,
  ScanRow,
  Issue,
  Grade,
  Risk,
} from "./premarket";

const STORE_KEY = "pms.config";
const FILTER_KEY = "pms.filters";

function loadConfig(): ScanConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as ScanConfig;
  } catch {
    /* ignore */
  }
  return { apiKey: "", model: "gpt-5.5" };
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

export default function App() {
  const [config, setConfig] = useState<ScanConfig>(loadConfig);
  const [filters, setFilters] = useState<ScanFilters>(loadFilters);
  const [showSettings, setShowSettings] = useState(false);

  const [rows, setRows] = useState<ScanRow[]>([]);
  const [issues, setIssues] = useState<Record<string, Issue>>({});
  const [asOf, setAsOf] = useState<string>("");
  const [universeSize, setUniverseSize] = useState(0);

  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<string | null>(null);
  const [server, setServer] = useState({ ok: true, hasEnvKey: true });

  useEffect(() => {
    checkServer().then(setServer);
  }, []);

  const keyReady = server.hasEnvKey || Boolean(config.apiKey);

  const runIssues = useCallback(
    async (scanRows: ScanRow[]) => {
      if (scanRows.length === 0 || !keyReady) return;
      setAnalyzing(true);
      setError("");
      setStatus(`급등 이유 분석 중… ${scanRows.length}개 종목 뉴스 조사`);
      try {
        const result = await fetchIssues(scanRows, config);
        setIssues(result.issues);
        setStatus(
          `완료 · ${scanRows.length}개 종목 · 이유 분석 ${
            Object.keys(result.issues).length
          }개`
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("");
      } finally {
        setAnalyzing(false);
      }
    },
    [config, keyReady]
  );

  const runScan = useCallback(async () => {
    if (scanning || analyzing) return;
    setScanning(true);
    setError("");
    setIssues({});
    setSelected(null);
    setStatus("프리마켓 시세 스캔 중… (유니버스 전 종목 조회)");
    try {
      const result = await scanPremarket(filters);
      setRows(result.rows);
      setAsOf(result.asOf);
      setUniverseSize(result.universeSize);
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
  }, [filters, scanning, analyzing, keyReady, runIssues]);

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

  const selectedRow = useMemo(
    () => rows.find((r) => r.symbol === selected) || null,
    [rows, selected]
  );

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
        <button className="ghost-btn" onClick={() => setShowSettings(true)}>
          ⚙️ 설정
        </button>
      </header>

      <FilterBar
        filters={filters}
        onChange={updateFilters}
        onScan={runScan}
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
          OpenAI 키가 없어 가격 스캔만 가능합니다. "왜 올랐는지" 이유 분석을
          쓰려면 <code>server/.env</code>에 OPENAI_API_KEY를 넣거나 ⚙️ 설정에서
          키를 입력하세요.
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

      <div className="main">
        <div className="table-wrap">
          {rows.length === 0 && !scanning ? (
            <div className="empty">
              <p>
                위 <b>스캔</b> 버튼을 누르면 미국 대형·중형주 유니버스에서
                프리마켓 급등 종목을 찾아 정렬합니다.
              </p>
              <p className="hint">
                기본 필터: 전일 종가 대비 +5% 이상 · 가격 $5 이상 · Nasdaq/NYSE
                대형주 위주
              </p>
            </div>
          ) : (
            <ScanTable
              rows={rows}
              issues={issues}
              analyzing={analyzing}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>

        <aside className="detail">
          {selectedRow ? (
            <DetailPanel
              row={selectedRow}
              issue={issues[selectedRow.symbol]}
              analyzing={analyzing}
            />
          ) : (
            <div className="detail-empty">
              <p>표에서 종목을 클릭하면 상세 분석이 여기에 표시됩니다.</p>
              <p className="hint">
                프리마켓 고점 대비 위치, 경고, 관련주, 출처를 확인하세요.
              </p>
            </div>
          )}
        </aside>
      </div>

      <p className="disclaimer">
        ※ 본 도구는 투자 조언이 아닙니다. 가격은 지연/오차가 있을 수 있으며,
        급등 사유는 AI가 웹에서 수집·요약한 추정입니다. 매매 판단의 책임은
        사용자에게 있습니다.
      </p>

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

function ScanTable({
  rows,
  issues,
  analyzing,
  selected,
  onSelect,
}: {
  rows: ScanRow[];
  issues: Record<string, Issue>;
  analyzing: boolean;
  selected: string | null;
  onSelect: (s: string) => void;
}) {
  return (
    <table className="scan-table">
      <thead>
        <tr>
          <th>종목</th>
          <th className="num">상승률</th>
          <th className="num">현재가</th>
          <th className="num">거래량</th>
          <th>주요 이슈</th>
          <th className="ctr">신뢰도</th>
          <th className="ctr">매매</th>
          <th className="ctr">위험도</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const issue = issues[r.symbol];
          const lvl = volumeLevel(r);
          const grade = tradeGrade(r, issue);
          const risk = riskLevel(r, issue);
          const news = hasRealNews(issue);
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
                <div className="sub">전일 ${r.prevClose}</div>
              </td>
              <td className="num">
                {fmtVolume(r.volume)}
                <div className={`sub vol-${lvl}`}>{VOLUME_LABELS[lvl]}</div>
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
                  <span className="muted">분석 중…</span>
                ) : (
                  <span className="muted">미분석 (이유 분석 실행)</span>
                )}
              </td>
              <td className="ctr">
                {issue ? <Stars n={issue.reliability} /> : <span className="muted">–</span>}
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
  analyzing,
}: {
  row: ScanRow;
  issue?: Issue;
  analyzing: boolean;
}) {
  const grade = tradeGrade(row, issue);
  const risk = riskLevel(row, issue);
  const warnings = buildWarnings(row, issue);
  const note = relatedNote(row, issue);

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
          </div>
        </div>
        <div className="d-grade">
          <span className="grade big" style={{ background: GRADE_COLOR[grade] }}>
            {grade}
          </span>
          <span className="grade-desc">{GRADE_DESC[grade]}</span>
        </div>
      </div>

      <div className="d-price">
        <div className="dp-main">
          <span className="dp-cur">${row.price}</span>
          <span className="dp-chg">+{row.changePct}%</span>
        </div>
        <div className="d-grid">
          <Metric label="전일 종가" value={`$${row.prevClose}`} />
          <Metric
            label="전일 종가 대비"
            value={`+${row.changePct}%`}
            tone="up"
          />
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
          <Metric
            label="거래량"
            value={`${fmtVolume(row.volume)} (${
              VOLUME_LABELS[volumeLevel(row)]
            })`}
          />
          <Metric label="위험도" value={`● ${RISK_LABELS[risk]}`} tone="risk" riskColor={RISK_COLOR[risk]} />
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
        <h3>왜 올랐는지</h3>
        {issue ? (
          <>
            {issue.theme && <div className="theme">🎯 {issue.theme}</div>}
            <p className="d-summary">{issue.summary || "요약 없음"}</p>
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
  const [model, setModel] = useState(config.model);

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
        <label>모델 (직접 입력 가능)</label>
        <input
          list="model-presets"
          value={model}
          placeholder="gpt-5.5"
          onChange={(e) => setModel(e.target.value)}
        />
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
              onSave({ apiKey: apiKey.trim(), model: model.trim() || "gpt-5.5" })
            }
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
