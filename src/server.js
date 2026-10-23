const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const cacheStore = require("./services/cache-store");
const fixtureService = require("./services/fixtures");
const newsService = require("./services/news");
const sportsProvider = require("./providers/espn");

const publicRoot = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT) || 3000;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

function sendText(response, statusCode, message, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

function requireGet(request, response) {
  if (request.method === "GET") return true;
  response.setHeader("Allow", "GET");
  sendText(response, 405, "Method not allowed");
  return false;
}

async function handleApiRequest(request, response, pathname) {
  if (pathname === "/api/health") {
    if (!requireGet(request, response)) return true;

    const sources = {
      news: cacheStore.getCacheHealth("news"),
      fixtures: cacheStore.getCacheHealth("fixtures")
    };
    const healthy = Object.values(sources).every((source) => source.status === "live");
    sendText(response, 200, JSON.stringify({
      status: healthy ? "ok" : "degraded",
      provider: sportsProvider.name,
      uptimeSeconds: Math.floor(process.uptime()),
      sources
    }), "application/json; charset=utf-8");
    return true;
  }

  if (pathname === "/api/fixtures") {
    if (!requireGet(request, response)) return true;
    try {
      const schedule = await fixtureService.getFixtures();
      sendText(response, 200, JSON.stringify(schedule), "application/json; charset=utf-8");
    } catch (error) {
      console.error("Unable to load live match schedules:", error);
      sendText(response, 502, JSON.stringify({ error: "Live match schedules are temporarily unavailable." }), "application/json; charset=utf-8");
    }
    return true;
  }

  if (pathname === "/api/news") {
    if (!requireGet(request, response)) return true;
    try {
      const news = await newsService.getNews();
      sendText(response, 200, JSON.stringify(news), "application/json; charset=utf-8");
    } catch (error) {
      console.error("Unable to load live sports news:", error);
      sendText(response, 502, JSON.stringify({ error: "Live sports news is temporarily unavailable." }), "application/json; charset=utf-8");
    }
    return true;
  }

  return false;
}

async function serveStaticFile(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Method not allowed");
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendText(response, 400, "Invalid URL path");
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(publicRoot, relativePath);
  const pathFromRoot = path.relative(publicRoot, filePath);
  if (pathFromRoot.startsWith("..") || path.isAbsolute(pathFromRoot)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const contentType = contentTypes.get(path.extname(filePath)) || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  if (await handleApiRequest(request, response, requestUrl.pathname)) return;
  await serveStaticFile(request, response, requestUrl.pathname);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Request failed:", error);
    if (!response.headersSent) {
      sendText(response, 500, "Internal server error");
    } else {
      response.destroy(error);
    }
  });
});

async function startServer() {
  await cacheStore.loadPersistentCache();
  server.listen(port, () => {
    console.log(`Sports is running at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Unable to start the Sports server:", error);
  process.exitCode = 1;
});

server.on("error", (error) => {
  console.error("Unable to start the Sports server:", error.message);
  process.exitCode = 1;
});
