const fs = require("node:fs/promises");
const path = require("node:path");

const cacheFilePath = path.join(__dirname, "..", "..", ".sports-cache.json");
const durations = {
  news: 5 * 60 * 1000,
  fixtures: 2 * 60 * 1000
};
const caches = { news: null, fixtures: null };
let cacheWrite = Promise.resolve();

function getCache(type) {
  return caches[type];
}

function setCache(type, value, expiresAt) {
  caches[type] = { value, expiresAt };
}

function getCacheAge(updatedAt) {
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : null;
}

function logStaleCache(label, updatedAt, staleSources) {
  const age = getCacheAge(updatedAt);
  const ageText = age === null ? "an unknown amount of time" : `${Math.round(age / 60000)} minutes`;
  console.warn(`Serving saved ${label} data from ${ageText} ago; unavailable sources: ${staleSources.join(", ") || "all"}.`);
}

async function persistCache() {
  const temporaryPath = `${cacheFilePath}.${process.pid}.tmp`;

  cacheWrite = cacheWrite.then(async () => {
    try {
      const contents = JSON.stringify({
        version: 1,
        news: caches.news?.value,
        fixtures: caches.fixtures?.value
      });
      await fs.writeFile(temporaryPath, contents, "utf8");
      await fs.rename(temporaryPath, cacheFilePath);
    } catch (error) {
      console.error("Unable to save the sports data cache:", error);
      try {
        await fs.unlink(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error("Unable to remove the temporary sports data cache:", cleanupError);
        }
      }
    }
  });

  await cacheWrite;
}

async function loadPersistentCache() {
  let contents;
  try {
    contents = await fs.readFile(cacheFilePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    console.error("Unable to read the sports data cache:", error);
    return;
  }

  try {
    const saved = JSON.parse(contents);
    if (saved.version !== 1) {
      console.error("Unable to load the sports data cache: unsupported cache version.");
      return;
    }

    if (saved.news !== undefined) {
      if (Array.isArray(saved.news?.articles) && Number.isFinite(Date.parse(saved.news.updatedAt))) {
        setCache("news", saved.news, 0);
      } else {
        console.error("Unable to load saved sports news: the cached data is invalid.");
      }
    }
    if (saved.fixtures !== undefined) {
      if (Array.isArray(saved.fixtures?.fixtures) &&
        Array.isArray(saved.fixtures.trending) &&
        Number.isFinite(Date.parse(saved.fixtures.updatedAt))) {
        setCache("fixtures", saved.fixtures, 0);
      } else {
        console.error("Unable to load saved match schedules: the cached data is invalid.");
      }
    }
  } catch (error) {
    console.error("Unable to parse the sports data cache:", error);
  }
}

function getCacheHealth(type) {
  const cache = getCache(type);
  if (!cache) {
    return { status: "unavailable", updatedAt: null, ageMs: null, unavailableSources: [] };
  }

  const ageMs = getCacheAge(cache.value.updatedAt);
  const hasSourceErrors = cache.value.stale || cache.value.errors?.length || cache.value.staleSources?.length;
  return {
    status: !hasSourceErrors && cache.expiresAt > Date.now() ? "live" : "cached",
    updatedAt: cache.value.updatedAt,
    ageMs,
    expiresInMs: Math.max(0, durations[type] - (ageMs ?? durations[type])),
    unavailableSources: [...new Set(cache.value.staleSources || cache.value.errors || [])]
  };
}

module.exports = {
  durations,
  getCache,
  setCache,
  getCacheAge,
  getCacheHealth,
  logStaleCache,
  persistCache,
  loadPersistentCache
};
