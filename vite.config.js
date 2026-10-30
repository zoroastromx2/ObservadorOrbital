import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "data", "gp-cache.json");

function orbitalDataPlugin() {
  return {
    name: "orbital-data-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname === "/api/gp") {
          try {
            if (fs.existsSync(CACHE_FILE)) {
              const body = fs.readFileSync(CACHE_FILE);
              const acceptsGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
              const payload = acceptsGzip ? zlib.gzipSync(body) : body;
              res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                "Content-Length": payload.length,
                ...(acceptsGzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
              });
              res.end(payload);
              return;
            }
          } catch (e) {
            console.error("Error serving /api/gp in dev:", e);
          }
        }
        if (url.pathname === "/data/gp-fallback.json") {
          try {
            if (fs.existsSync(CACHE_FILE)) {
              const body = fs.readFileSync(CACHE_FILE);
              res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                "Content-Length": body.length,
              });
              res.end(body);
              return;
            }
          } catch (e) {
            console.error("Error serving /data/gp-fallback.json:", e);
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), orbitalDataPlugin()],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
