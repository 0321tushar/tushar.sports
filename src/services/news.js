const cacheStore = require("./cache-store");
const sportsProvider = require("../providers/espn");

async function getNews() {
  const cache = cacheStore.getCache("news");
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  const results = await Promise.allSettled(
    Object.entries(sportsProvider.newsFeeds).map(([sport, feed]) => sportsProvider.fetchNewsForSport(sport, feed))
  );
  const articles = [];
  const errors = [];
  const staleSources = [];
  let freshFeedCount = 0;
  const previousArticles = new Map((cache?.value.articles || []).map((article) => [article.sport, article]));

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      freshFeedCount += 1;
      articles.push(result.value);
    } else {
      const sport = Object.keys(sportsProvider.newsFeeds)[index];
      console.error(`Unable to fetch ${sport} news:`, result.reason);
      errors.push(sport);
      const savedArticle = previousArticles.get(sport);
      if (savedArticle) {
        articles.push(savedArticle);
        staleSources.push(sport);
      }
    }
  });

  if (freshFeedCount === 0 && cache) {
    const staleValue = {
      ...cache.value,
      errors,
      stale: true,
      staleSources: errors
    };
    cacheStore.logStaleCache("sports news", staleValue.updatedAt, staleValue.staleSources);
    return staleValue;
  }

  if (articles.length === 0) {
    throw new Error("Sports news feeds are currently unavailable");
  }

  const value = {
    articles,
    errors,
    stale: staleSources.length > 0,
    staleSources,
    updatedAt: new Date().toISOString()
  };
  cacheStore.setCache("news", value, Date.now() + cacheStore.durations.news);
  await cacheStore.persistCache();
  return value;
}

module.exports = { getNews };
