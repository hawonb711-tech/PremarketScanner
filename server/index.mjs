import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 패키징된 Mac 앱: ~/Library/Application Support/PremarketScanner/.env */
function loadEnv() {
  const userEnvDir = process.env.PMS_ENV_DIR;
  if (userEnvDir) {
    mkdirSync(userEnvDir, { recursive: true });
    const userEnv = join(userEnvDir, ".env");
    const example = join(__dirname, ".env.example");
    if (!existsSync(userEnv) && existsSync(example)) {
      copyFileSync(example, userEnv);
    }
    dotenv.config({ path: userEnv });
  }
  dotenv.config({ path: join(__dirname, ".env") });
  dotenv.config();
}

loadEnv();

import { UNIVERSE } from "./universe.mjs";
import { fetchPremarketQuote, fetchAvgDailyVolume, mapPool } from "./prices.mjs";
import {
  issueResearchPrompt,
  issueStructurePrompt,
  ISSUE_SCHEMA,
  VALID_CATEGORIES,
} from "./premarket.mjs";

function getClient(req) {
  const key =
    req.get("x-openai-key") || process.env.OPENAI_API_KEY || "";
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/** Responses API 출력에서 url_citation 주석(실제 출처)을 모두 수집 */
function collectSources(response) {
  const urls = new Set();
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      for (const ann of content.annotations || []) {
        if (ann.type === "url_citation" && ann.url) urls.add(ann.url);
      }
    }
  }
  return [...urls];
}

const round = (n, d = 2) =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function processIssueChunk(client, model, isReasoning, items) {
  const research = await client.responses.create({
    model,
    tools: [{ type: "web_search" }],
    ...(isReasoning ? { reasoning: { effort: "low" } } : {}),
    input: issueResearchPrompt(items),
  });
  const researchText = research.output_text || "";
  const sources = collectSources(research);

  const structured = await client.responses.create({
    model,
    ...(isReasoning ? { reasoning: { effort: "low" } } : {}),
    input: issueStructurePrompt(items, researchText, sources),
    text: {
      format: {
        type: "json_schema",
        name: "PremarketIssues",
        strict: true,
        schema: ISSUE_SCHEMA,
      },
    },
  });

  let parsed;
  try {
    parsed = JSON.parse(structured.output_text || "{}");
  } catch {
    parsed = { stocks: [] };
  }
  return { parsed, sources };
}

/**
 * Express 앱 생성. staticDir 이 있으면 빌드된 React UI를 함께 서빙 (Electron/패키징용).
 */
export function createApp({ staticDir } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, hasEnvKey: Boolean(process.env.OPENAI_API_KEY) });
  });

  // ===== 1단계: 프리마켓 급등주 스캔 (가격 데이터만, 키 불필요) =====
  app.post("/api/premarket-scan", async (req, res) => {
    const b = req.body || {};
    const minChangePct = Number.isFinite(Number(b.minChangePct))
      ? Number(b.minChangePct)
      : 5;
    const minPrice = Number.isFinite(Number(b.minPrice))
      ? Number(b.minPrice)
      : 5;
    const minVolume = Number.isFinite(Number(b.minVolume))
      ? Number(b.minVolume)
      : 0;
    const excludeMid = Boolean(b.excludeMid);
    const limit = Math.min(Number(b.limit) || 25, 40);

    try {
      const quotes = await mapPool(UNIVERSE, 12, async (u) => {
        const q = await fetchPremarketQuote(u.symbol);
        if (!q) return null;
        return { ...q, name: u.name || q.name, tier: u.tier };
      });

      let gainers = quotes
        .filter(Boolean)
        .filter((q) => q.changePct != null && q.changePct >= minChangePct)
        .filter((q) => q.price >= minPrice)
        .filter((q) => q.volume >= minVolume)
        .filter((q) => (excludeMid ? q.tier !== "mid" : true));

      gainers.sort((a, b2) => b2.changePct - a.changePct);
      gainers = gainers.slice(0, limit);

      await mapPool(gainers, 8, async (g) => {
        const avg = await fetchAvgDailyVolume(g.symbol);
        g.avgVolume = avg;
        g.volumeRatio = avg && avg > 0 ? g.volume / avg : null;
      });

      const rows = gainers.map((g) => ({
        symbol: g.symbol,
        name: g.name,
        exchange: g.exchange,
        tier: g.tier,
        session: g.session,
        prevClose: round(g.prevClose),
        price: round(g.price),
        changePct: round(g.changePct, 1),
        preMarketPrice: round(g.preMarketPrice),
        preMarketChangePct: round(g.preMarketChangePct, 1),
        preMarketHigh: round(g.preMarketHigh),
        sessionHigh: round(g.sessionHigh),
        fromHighPct: round(g.fromHighPct, 1),
        regularOpen: round(g.regularOpen),
        fromOpenPct: round(g.fromOpenPct, 1),
        volume: g.volume,
        avgVolume: g.avgVolume ? Math.round(g.avgVolume) : null,
        volumeRatio: round(g.volumeRatio, 2),
      }));

      res.json({
        asOf: new Date().toISOString(),
        universeSize: UNIVERSE.length,
        filters: { minChangePct, minPrice, minVolume, excludeMid },
        count: rows.length,
        rows,
      });
    } catch (err) {
      const msg = err?.message || String(err);
      console.error("[/api/premarket-scan]", msg);
      res.status(500).json({ error: `스캔 실패: ${msg}` });
    }
  });

  // ===== 2단계: 급등 "이유" 분석 (웹검색, OpenAI 키 필요) =====
  app.post("/api/premarket-issues", async (req, res) => {
    const client = getClient(req);
    if (!client) {
      return res.status(400).json({
        error:
          "OpenAI API 키가 없습니다. 앱 설정에서 키를 입력하거나, 환경설정 파일에 OPENAI_API_KEY를 넣으세요.",
      });
    }

    const items = Array.isArray(req.body?.stocks)
      ? req.body.stocks
          .map((s) => ({
            symbol: String(s?.symbol ?? "").trim(),
            name: String(s?.name ?? "").trim(),
            changePct: Number(s?.changePct) || 0,
          }))
          .filter((s) => s.symbol)
          .slice(0, 30)
      : [];
    if (items.length === 0) {
      return res.status(400).json({ error: "stocks가 필요합니다." });
    }

    const model = req.body?.model || "gpt-5.5";
    const isReasoning = /^(gpt-5|o\d)/i.test(model);

    try {
      const groups = chunk(items, 6);
      const results = await Promise.all(
        groups.map((g) => processIssueChunk(client, model, isReasoning, g))
      );

      const allSources = new Set();
      const bySymbol = {};
      for (const { parsed, sources } of results) {
        for (const s of sources) allSources.add(s);
        const allowed = new Set(sources);
        const list = Array.isArray(parsed?.stocks) ? parsed.stocks : [];
        for (const c of list) {
          const symbol = String(c?.symbol ?? "").trim().toUpperCase();
          if (!symbol) continue;
          const categories = Array.isArray(c?.categories)
            ? c.categories.filter((x) => VALID_CATEGORIES.includes(x))
            : [];
          const rel = Array.isArray(c?.related)
            ? [...new Set(c.related.map((r) => String(r).trim().toUpperCase()))]
                .filter((r) => r && r !== symbol)
                .slice(0, 7)
            : [];
          const rl = Number(c?.reliability);
          bySymbol[symbol] = {
            symbol,
            summary: String(c?.summary ?? "").trim(),
            theme: String(c?.theme ?? "").trim(),
            categories: categories.length ? categories : ["none"],
            reliability: Number.isFinite(rl) ? Math.min(5, Math.max(0, rl)) : 0,
            related: rel,
            sources: Array.isArray(c?.sources)
              ? c.sources.filter((u) => typeof u === "string" && allowed.has(u))
              : [],
          };
        }
      }

      res.json({ issues: bySymbol, allSources: [...allSources] });
    } catch (err) {
      const msg = err?.message || String(err);
      console.error("[/api/premarket-issues]", msg);
      res.status(500).json({ error: `이슈 분석 실패: ${msg}` });
    }
  });

  // 패키징된 앱: 빌드된 React UI 정적 서빙
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(join(staticDir, "index.html"));
    });
  }

  return app;
}

/** 서버 시작 (Electron 또는 CLI) */
export function startServer({ port, staticDir, host = "127.0.0.1" } = {}) {
  const listenPort = Number(port || process.env.PORT || 8787);
  const app = createApp({ staticDir });
  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, host, () => {
      console.log(`✅ 프리마켓 스캐너: http://${host}:${listenPort}`);
      if (!process.env.OPENAI_API_KEY) {
        console.log(
          "ℹ️  OPENAI_API_KEY 없음 — 가격 스캔은 가능, '이유 분석'은 키 필요"
        );
      }
      resolve({ app, server, port: listenPort, host });
    });
    server.on("error", reject);
  });
}

// CLI 직접 실행 (npm run server)
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
