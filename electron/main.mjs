import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {{ server: import('node:http').Server; port: number } | null} */
let serverInfo = null;

function appRoot() {
  // dev: 프로젝트 루트 / 패키징: app.asar 내부
  return app.getAppPath();
}

function ensureUserEnv() {
  const userData = app.getPath("userData");
  process.env.PMS_ENV_DIR = userData;
  return userData;
}

async function waitForHealth(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("내장 서버가 시작되지 않았습니다.");
}

async function bootServer() {
  ensureUserEnv();
  const staticDir = path.join(appRoot(), "dist");
  serverInfo = await startServer({
    port: 8787,
    host: "127.0.0.1",
    staticDir,
  });
  await waitForHealth(serverInfo.port);
}

function createWindow() {
  const port = serverInfo?.port ?? 8787;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: "프리마켓 급등주 스캐너",
    backgroundColor: "#0b1120",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await bootServer();
      createWindow();
    } catch (err) {
      console.error("[electron] boot failed:", err);
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverInfo) {
      createWindow();
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", () => {
    serverInfo?.server?.close();
  });
}
