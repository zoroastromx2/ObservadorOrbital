import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { normalizeGpPayload } from "./normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CACHE_FILE = path.join(ROOT, "data", "gp-cache.json");
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "0.0.0.0";
const SIX_HOURS = 6 * 60 * 60 * 1000;
const GP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json";

let lastAttempt = 0;

function readCache() {
  const raw = fs.readFileSync(CACHE_FILE, "utf8");
  return JSON.parse(raw);
}

function writeCache(cache) {
  const temp = `${CACHE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(cache));
  fs.renameSync(temp, CACHE_FILE);
}

async function fetchFreshCache(previous) {
  lastAttempt = Date.now();
  try {
    const response = await fetch(GP_URL, {
      headers: {
        "User-Agent": "OrbitalWatch/1.0 (local satellite tracker)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`CelesTrak HTTP ${response.status}`);
    const raw = await response.json();
    const satellites = normalizeGpPayload(raw);
    const cache = {
      meta: {
        fetchedAt: new Date().toISOString(),
        source: "CelesTrak GP data — GROUP=active",
        sourceUrl: GP_URL,
        count: satellites.length,
        offline: false,
      },
      satellites,
    };
    writeCache(cache);
    console.log(`[data] refreshed ${satellites.length} active satellites from CelesTrak`);
    return cache;
  } catch (error) {
    console.warn(`[data] CelesTrak refresh failed: ${error.message}`);
    return {
      ...previous,
      meta: {
        ...previous.meta,
        offline: true,
        refreshError: error.message,
      },
    };
  }
}

async function apiGp(req, res) {
  try {
    let cache = readCache();
    const age = Date.now() - new Date(cache.meta.fetchedAt).getTime();
    if (age >= SIX_HOURS && Date.now() - lastAttempt >= SIX_HOURS) {
      cache = await fetchFreshCache(cache);
    }
    const body = Buffer.from(JSON.stringify(cache));
    const acceptsGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
    const payload = acceptsGzip ? zlib.gzipSync(body) : body;
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": payload.length,
      ...(acceptsGzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
    });
    res.end(payload);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(DIST, safePath);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html");
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/api/gp") {
    apiGp(req, res);
    return;
  }
  if (pathname === "/data/gp-fallback.json") {
    fs.readFile(CACHE_FILE, (error, data) => {
      if (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": data.length,
      });
      res.end(data);
    });
    return;
  }
  serveStatic(req, res);
});

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("The production bundle is missing. Run `npm run build` first.");
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(`Orbital Watch running at http://localhost:${PORT}`);
  console.log(`Data cache: ${path.relative(ROOT, CACHE_FILE)}`);
});
