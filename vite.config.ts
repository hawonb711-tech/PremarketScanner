import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        // 뉴스 웹검색 2패스는 수 분 걸릴 수 있어 타임아웃을 넉넉히
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
});
