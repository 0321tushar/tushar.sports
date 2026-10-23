function decodeXml(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: "\""
  };

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[\da-f]+|\d+);/gi, (entity, code) => {
      const value = code[0].toLowerCase() === "x"
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
    })
    .replace(/&(amp|apos|gt|lt|quot);/g, (entity, name) => namedEntities[name])
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getXmlTag(itemXml, tagName) {
  const match = itemXml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function getMetaAttributes(tag) {
  const attributes = {};
  const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;

  while ((match = attributePattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function getArticleImage(html) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = getMetaAttributes(match[0]);
    const property = attributes.property || attributes.name;
    if (property?.toLowerCase() !== "og:image" || !attributes.content) continue;

    try {
      const imageUrl = new URL(attributes.content);
      if (imageUrl.protocol === "https:" && /^a\d*\.espncdn\.com$/i.test(imageUrl.hostname)) {
        return imageUrl.href;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function safeEspnUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "espn.com" || parsed.hostname.endsWith(".espn.com"))
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

const newsFeeds = {
  soccer: { url: "https://www.espn.com/espn/rss/soccer/news", label: "Football", category: "football" },
  nba: { url: "https://www.espn.com/espn/rss/nba/news", label: "Basketball", category: "basketball" },
  tennis: { url: "https://www.espn.com/espn/rss/tennis/news", label: "Tennis", category: "tennis" },
  nfl: { url: "https://www.espn.com/espn/rss/nfl/news", label: "American football", category: "football" },
  mlb: { url: "https://www.espn.com/espn/rss/mlb/news", label: "Baseball", category: "other" },
  nhl: { url: "https://www.espn.com/espn/rss/nhl/news", label: "Ice hockey", category: "other" },
  golf: { url: "https://www.espn.com/espn/rss/golf/news", label: "Golf", category: "other" },
  mma: { url: "https://www.espn.com/espn/rss/mma/news", label: "MMA", category: "other" },
  boxing: { url: "https://www.espn.com/espn/rss/boxing/news", label: "Boxing", category: "other" },
  racing: { url: "https://www.espn.com/espn/rss/racing/news", label: "Motorsports", category: "other" },
  wnba: { url: "https://www.espn.com/espn/rss/wnba/news", label: "Women's basketball", category: "basketball" },
  cricket: { url: "https://www.espn.com/espn/rss/cricket/news", label: "Cricket", category: "other" },
  "college-football": { url: "https://www.espn.com/espn/rss/college-football/news", label: "College football", category: "football" },
  rugby: { url: "https://www.espn.com/espn/rss/rugby/news", label: "Rugby", category: "other" }
};
const footballLeagues = ["eng.1", "esp.1", "ger.1", "ita.1", "fra.1"];
const tennisTours = [
  { tour: "atp", label: "ATP" },
  { tour: "wta", label: "WTA" }
];

async function fetchNewsForSport(sport, feed) {
  const feedResponse = await fetch(feed.url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "SportsSite/1.0 (sports headlines reader)" }
  });
  if (!feedResponse.ok) {
    throw new Error(`ESPN ${sport} feed returned HTTP ${feedResponse.status}`);
  }

  const feedXml = await feedResponse.text();
  const items = [...feedXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const item = items
    .map((match) => match[1])
    .map((itemXml) => ({
      title: getXmlTag(itemXml, "title"),
      summary: getXmlTag(itemXml, "description"),
      url: getXmlTag(itemXml, "link"),
      publishedAt: getXmlTag(itemXml, "pubDate")
    }))
    .find((entry) => {
      const articleUrl = safeEspnUrl(entry.url);
      return entry.title && entry.summary && articleUrl;
    });

  if (!item) {
    throw new Error(`ESPN ${sport} feed did not contain a valid article`);
  }

  let image = null;
  const articleResponse = await fetch(item.url, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "SportsSite/1.0 (sports headlines reader)" }
  });
  if (articleResponse.ok) {
    image = getArticleImage(await articleResponse.text());
  }

  return { sport, label: feed.label, category: feed.category, ...item, image, source: "ESPN" };
}

function scoreboardDate(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function fetchScoreboard(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { "User-Agent": "SportsSite/1.0 (sports schedule reader)" }
  });
  if (!response.ok) {
    throw new Error(`Scoreboard returned HTTP ${response.status}`);
  }
  return response.json();
}

function getTeam(competitor, defaultColor) {
  const name = competitor?.team?.displayName || competitor?.athlete?.displayName;
  if (!name) return null;
  const colors = ["mark-red", "mark-blue", "mark-purple", "mark-green", "mark-orange", "mark-cyan"];
  const colorIndex = [...name].reduce((total, character) => total + character.charCodeAt(0), 0) % colors.length;
  return {
    name,
    code: competitor.team?.abbreviation || competitor.athlete?.shortName || name.slice(0, 3).toUpperCase(),
    color: defaultColor || colors[colorIndex]
  };
}

async function fetchTeamFixtures(sport, league, date) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${scoreboardDate(date)}`;
  const scoreboard = await fetchScoreboard(url);

  return (scoreboard.events || []).flatMap((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const homeCompetitor = competitors.find((team) => team.homeAway === "home");
    const awayCompetitor = competitors.find((team) => team.homeAway === "away");
    const home = getTeam(homeCompetitor);
    const away = getTeam(awayCompetitor);
    const link = (event.links || []).map((entry) => safeEspnUrl(entry.href)).find(Boolean);
    if (!home || !away || !link || !event.date) return [];

    const isBasketball = sport === "basketball";
    return [{
      id: event.id,
      sport: isBasketball ? "Basketball" : "Football",
      date: event.date,
      home,
      away,
      homeScore: homeCompetitor.score,
      awayScore: awayCompetitor.score,
      competition: isBasketball ? "NBA" : scoreboard.leagues?.[0]?.name || league.toUpperCase(),
      status: competition.status?.type?.state === "in"
        ? competition.status?.type?.shortDetail || "Live"
        : competition.status?.type?.description || "Scheduled",
      url: link
    }];
  });
}

async function fetchTennisFixtures(now, endDate) {
  const results = await Promise.allSettled(
    tennisTours.map(async ({ tour, label }) => {
      const scoreboard = await fetchScoreboard(
        `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${scoreboardDate(now)}`
      );
      const fixtures = [];

      for (const event of scoreboard.events || []) {
        const tournamentUrl = (event.links || [])
          .filter((entry) => entry.rel?.includes("summary") || entry.rel?.includes("bracket"))
          .map((entry) => safeEspnUrl(entry.href))
          .find(Boolean);
        if (!tournamentUrl) continue;

        for (const grouping of event.groupings || []) {
          for (const match of grouping.competitions || []) {
            const matchDate = new Date(match.date);
            if (!match.date || matchDate < now || matchDate > endDate) continue;
            if (match.status?.type?.state === "post") continue;

            const competitors = match.competitors || [];
            const home = getTeam(competitors[0], "mark-orange");
            const away = getTeam(competitors[1], "mark-cyan");
            if (!home || !away) continue;

            fixtures.push({
              id: `${event.id}-${match.id}`,
              sport: "Tennis",
              date: match.date,
              home,
              away,
              competition: `${event.name} · ${label}`,
              status: match.status?.type?.state === "in"
                ? match.status?.type?.shortDetail || "Live"
                : match.status?.type?.description || "Scheduled",
              url: tournamentUrl
            });
          }
        }
      }

      return fixtures;
    })
  );

  const fixtures = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      fixtures.push(...result.value);
    } else {
      const source = tennisTours[index].label;
      console.error(`Unable to load ${source} fixtures:`, result.reason);
      errors.push(source);
    }
  });
  return { fixtures, errors };
}

module.exports = {
  name: "ESPN",
  newsFeeds,
  footballLeagues,
  tennisTours,
  fetchNewsForSport,
  fetchTeamFixtures,
  fetchTennisFixtures
};
