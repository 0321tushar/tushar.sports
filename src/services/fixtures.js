const cacheStore = require("./cache-store");
const sportsProvider = require("../providers/espn");

function getFeaturedScore(fixture) {
  const competition = fixture.competition.toLowerCase();
  const teams = `${fixture.home.name} ${fixture.away.name}`.toLowerCase();
  const footballCompetitions = [
    ["premier league", 100],
    ["la liga", 95],
    ["bundesliga", 90],
    ["serie a", 85],
    ["ligue 1", 80]
  ];
  const notableTeams = [
    "arsenal", "aston villa", "barcelona", "bayern", "borussia dortmund", "chelsea",
    "liverpool", "manchester city", "manchester united", "newcastle", "paris saint-germain",
    "real madrid", "tottenham", "juventus", "inter milan", "ac milan",
    "boston celtics", "chicago bulls", "golden state warriors", "los angeles lakers",
    "miami heat", "new york knicks", "philadelphia 76ers"
  ];
  const notableTennisPlayers = [
    "alcaraz", "djokovic", "gauff", "medvedev", "rybakina", "sabalenka",
    "sinner", "swiatek", "zverev"
  ];

  let score = 0;
  if (fixture.sport === "Basketball" && competition === "nba") score += 100;

  for (const [league, leagueScore] of footballCompetitions) {
    if (fixture.sport === "Football" && competition.includes(league)) {
      score += leagueScore;
      break;
    }
  }

  if (fixture.sport === "Tennis") {
    score += 20;
    if (/grand slam|wimbledon|us open|french open|roland garros|australian open|atp finals|wta finals/i.test(competition)) {
      score += 80;
    }
    if (notableTennisPlayers.some((player) => teams.includes(player))) {
      score += 70;
    }
  }

  score += notableTeams.filter((team) => teams.includes(team)).length * 30;
  if (fixture.status === "Live" || fixture.status === "In Progress") score += 1000;
  return score;
}

async function getFixtures() {
  const cache = cacheStore.getCache("fixtures");
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  const now = new Date();
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() + 3);
  const recentDate = new Date(now);
  recentDate.setUTCHours(0, 0, 0, 0);
  recentDate.setUTCDate(recentDate.getUTCDate() - 1);
  const dates = Array.from({ length: 4 }, (_, index) => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });
  const scoreboardTasks = [
    ...dates.flatMap((date) => sportsProvider.footballLeagues.map((league) => ({
      key: `${date.toISOString().slice(0, 10)} ${league}`,
      promise: sportsProvider.fetchTeamFixtures("soccer", league, date)
    }))),
    ...dates.map((date) => ({
      key: `${date.toISOString().slice(0, 10)} NBA`,
      promise: sportsProvider.fetchTeamFixtures("basketball", "nba", date)
    }))
  ];
  const recentScoreTasks = [
    ...sportsProvider.footballLeagues.map((league) => ({
      key: `recent ${league}`,
      promise: sportsProvider.fetchTeamFixtures("soccer", league, recentDate)
    })),
    {
      key: "recent NBA",
      promise: sportsProvider.fetchTeamFixtures("basketball", "nba", recentDate)
    }
  ];
  const results = await Promise.allSettled([
    ...recentScoreTasks.map((task) => task.promise),
    ...scoreboardTasks.map((task) => task.promise),
    sportsProvider.fetchTennisFixtures(now, endDate)
  ]);
  const fixtures = [];
  const recentFixtures = [];
  const errors = [];
  const staleSources = [];
  let freshSourceCount = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (index === recentScoreTasks.length + scoreboardTasks.length) {
        fixtures.push(...result.value.fixtures);
        errors.push(...result.value.errors);
        staleSources.push(...result.value.errors);
        freshSourceCount += sportsProvider.tennisTours.length - result.value.errors.length;
      } else if (index < recentScoreTasks.length) {
        freshSourceCount += 1;
        recentFixtures.push(...result.value);
      } else {
        freshSourceCount += 1;
        fixtures.push(...result.value);
      }
    } else {
      const source = index < recentScoreTasks.length
        ? recentScoreTasks[index].key
        : scoreboardTasks[index - recentScoreTasks.length]?.key || "tennis";
      console.error(`Unable to load ${source} fixtures:`, result.reason);
      errors.push(source);
      staleSources.push(source);
    }
  });

  if (freshSourceCount === 0 && cache) {
    const staleValue = {
      ...cache.value,
      errors,
      stale: true,
      staleSources: [...new Set(staleSources)]
    };
    cacheStore.logStaleCache("match schedules", staleValue.updatedAt, staleValue.staleSources);
    return staleValue;
  }

  const freshFixtures = [...new Map(fixtures.map((fixture) => [fixture.id, fixture])).values()];
  const previousFixtures = cache?.value.fixtures || [];
  const previousTrending = cache?.value.trending || [];
  const cachedFixtures = staleSources.length
    ? [...freshFixtures, ...previousFixtures.filter((fixture) => !freshFixtures.some((fresh) => fresh.id === fixture.id))]
    : freshFixtures;
  const uniqueFixtures = cachedFixtures
    .map((fixture) => ({ ...fixture, featuredScore: getFeaturedScore(fixture) }))
    .sort((first, second) =>
      second.featuredScore - first.featuredScore ||
      new Date(first.date) - new Date(second.date)
    );
  if (uniqueFixtures.length === 0) {
    if (cache && staleSources.length) {
      const staleValue = {
        ...cache.value,
        errors,
        stale: true,
        staleSources: [...new Set(staleSources)]
      };
      cacheStore.logStaleCache("match schedules", staleValue.updatedAt, staleValue.staleSources);
      return staleValue;
    }
    throw new Error("Live football, basketball, and tennis schedules are temporarily unavailable");
  }

  const freshIds = new Set([...recentFixtures, ...freshFixtures].map((fixture) => fixture.id));
  const savedTrending = staleSources.length
    ? previousTrending.filter((fixture) => !freshIds.has(fixture.id))
    : [];
  const trending = [...recentFixtures, ...uniqueFixtures, ...savedTrending]
    .filter((fixture, index, all) => all.findIndex((entry) => entry.id === fixture.id) === index)
    .filter((fixture) =>
      /live|progress|half|quarter|period|final|end|complete|full time|^ft$|aet|pen/i.test(fixture.status) &&
      fixture.homeScore != null &&
      fixture.awayScore != null &&
      fixture.homeScore !== "" &&
      fixture.awayScore !== ""
    )
    .map((fixture) => ({ ...fixture, featuredScore: getFeaturedScore(fixture) }))
    .sort((first, second) => {
      const firstLive = /live|progress|half|period/i.test(first.status);
      const secondLive = /live|progress|half|period/i.test(second.status);
      return Number(secondLive) - Number(firstLive) ||
        second.featuredScore - first.featuredScore ||
        new Date(second.date) - new Date(first.date);
    });
  const value = {
    fixtures: uniqueFixtures,
    trending,
    errors,
    stale: staleSources.length > 0,
    staleSources: [...new Set(staleSources)],
    updatedAt: new Date().toISOString()
  };
  cacheStore.setCache("fixtures", value, Date.now() + cacheStore.durations.fixtures);
  await cacheStore.persistCache();
  return value;
}

module.exports = { getFixtures };
