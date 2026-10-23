const fixtureList = document.querySelector("#fixture-list");
const matchSearch = document.querySelector("#match-search");
const matchCount = document.querySelector("#match-count");
const matchEmpty = document.querySelector("#match-empty");
const matchMoreButton = document.querySelector("#match-more");
const trendingGames = document.querySelector("#trending-games");
const trendingStatus = document.querySelector("#trending-status");
const favoriteTeamOptions = document.querySelector("#favorite-team-options");
const favoriteTeamSearch = document.querySelector("#favorite-team-search");
const favoriteTeamHint = document.querySelector("#favorite-team-hint");
const storyGrid = document.querySelector(".story-grid");
const newsStatus = document.querySelector("#news-status");
const newsSportFilter = document.querySelector("#news-sport-filter");
const newsMoreButton = document.querySelector("#news-more");
const heroPhotos = [
  {
    sport: "football",
    label: "Football",
    image: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1800&q=80"
  },
  {
    sport: "basketball",
    label: "Basketball",
    image: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1800&q=80"
  },
  {
    sport: "tennis",
    label: "Tennis",
    image: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1800&q=80"
  }
];
const heroPhotoLayers = document.querySelectorAll(".hero-photo");
const heroSlideCount = document.querySelector("#hero-slide-count");
const heroSlideLabel = document.querySelector("#hero-slide-label");
const heroSportButtons = document.querySelectorAll("[data-hero-sport]");
let selectedHeroPhoto = 0;

let matchSportFilter = "all";
let matchQuery = "";
const initialMatchLimit = 9;
let showAllMatches = false;
let matchCarouselPausedUntil = 0;
let matchCarouselLastFrame = null;
let newsCategoryFilter = "all";
let newsSportSelection = "all";
const newsPageSize = 6;
let visibleNewsLimit = newsPageSize;
const favoriteTeamsStorageKey = "sports-favorite-teams";
let favoriteTeams = loadFavoriteTeams();
let currentFixtures = [];
let currentRecentScores = [];

// Shared formatting and local-storage helpers.
function formatUpdateTime(updatedAt) {
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp)
    : "an unknown time";
}

function describeUnavailableSources(sources) {
  if (!sources?.length) return "Source unavailable";
  const visibleSources = sources.slice(0, 3).join(", ");
  const remainingCount = sources.length - 3;
  return `Unavailable: ${visibleSources}${remainingCount > 0 ? ` +${remainingCount} more` : ""}`;
}

function loadFavoriteTeams() {
  try {
    const savedTeams = JSON.parse(localStorage.getItem(favoriteTeamsStorageKey) || "[]");
    return Array.isArray(savedTeams) ? savedTeams.filter((team) => typeof team === "string") : [];
  } catch (error) {
    console.error("Unable to load favorite teams:", error);
    return [];
  }
}

function saveFavoriteTeams() {
  try {
    localStorage.setItem(favoriteTeamsStorageKey, JSON.stringify(favoriteTeams));
  } catch (error) {
    console.error("Unable to save favorite teams:", error);
  }
}

// Match ranking and favorite-team watchlist.
function isLiveFixture(fixture) {
  return /live|in progress|in-progress|half|quarter|period/i.test(fixture.status || "");
}

function isFinalFixture(fixture) {
  return /final|complete|full time|^ft$|aet/i.test(fixture.status || "");
}

function getWatchlistDetails(fixture, now) {
  const isLive = isLiveFixture(fixture);
  const isFinal = isFinalFixture(fixture);
  const startsAt = Date.parse(fixture.date);
  const minutesUntilStart = Number.isFinite(startsAt) ? (startsAt - now) / 60000 : Infinity;
  const isStartingSoon = !isLive && !isFinal && minutesUntilStart >= 0 && minutesUntilStart <= 90;
  const hasScore = fixture.homeScore !== null && fixture.homeScore !== undefined &&
    fixture.awayScore !== null && fixture.awayScore !== undefined &&
    fixture.homeScore !== "" && fixture.awayScore !== "";
  const scoreDifference = hasScore
    ? Math.abs(Number(fixture.homeScore) - Number(fixture.awayScore))
    : Infinity;
  const closeScoreLimit = fixture.sport === "Basketball" ? 5 : 1;
  const isClose = isLive && hasScore && Number.isFinite(scoreDifference) && scoreDifference <= closeScoreLimit;
  const favoriteMatch = favoriteTeams.some((team) =>
    team === fixture.home.name || team === fixture.away.name
  );
  const priority = isLive ? 0 : isStartingSoon ? 1 : isFinal ? 3 : 2;

  return {
    isLive,
    isStartingSoon,
    isClose,
    favoriteMatch,
    priority,
    minutesUntilStart,
    popularity: fixture.featuredScore || 0
  };
}

function updateFavoriteTeamPicker(fixtures) {
  if (!favoriteTeamOptions) return;

  const teamScores = new Map();
  fixtures.forEach((fixture) => {
    const score = fixture.featuredScore || 0;
    [fixture.home.name, fixture.away.name].forEach((team) => {
      teamScores.set(team, Math.max(teamScores.get(team) || 0, score));
    });
  });
  const teams = [...new Set([...teamScores.keys(), ...favoriteTeams])]
    .sort((first, second) =>
      Number(favoriteTeams.includes(second)) - Number(favoriteTeams.includes(first)) ||
      (teamScores.get(second) || 0) - (teamScores.get(first) || 0) ||
      first.localeCompare(second)
    );
  const search = favoriteTeamSearch?.value.trim().toLowerCase() || "";
  const matchingTeams = search ? teams.filter((team) => team.toLowerCase().includes(search)) : teams;
  const visibleTeams = search ? matchingTeams.slice(0, 30) : matchingTeams.slice(0, 20);

  const buttons = visibleTeams.map((team) => {
    const button = textElement("button", team, "favorite-team-button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(favoriteTeams.includes(team)));
    button.addEventListener("click", () => {
      favoriteTeams = favoriteTeams.includes(team)
        ? favoriteTeams.filter((favorite) => favorite !== team)
        : [...favoriteTeams, team];
      saveFavoriteTeams();
      updateFavoriteTeamPicker(currentFixtures);
      renderWatchlist(currentFixtures, currentRecentScores);
    });
    return button;
  });

  favoriteTeamOptions.replaceChildren(...buttons);
  if (favoriteTeamHint) {
    favoriteTeamHint.textContent = search
      ? `${matchingTeams.length} matching teams${matchingTeams.length > visibleTeams.length ? " · showing first 30" : ""}`
      : `${teams.length} teams available · showing top 20; search to find others`;
  }
}

function renderWatchlist(fixtures, recentScores) {
  if (!trendingGames) return;

  const now = Date.now();
  const byId = new Map([...fixtures, ...recentScores].map((fixture) => [fixture.id, fixture]));
  const watchlist = [...byId.values()]
    .map((fixture) => ({ fixture, details: getWatchlistDetails(fixture, now) }))
    .filter(({ fixture, details }) =>
      details.isLive || isFinalFixture(fixture) ||
      (details.minutesUntilStart >= 0 && Number.isFinite(details.minutesUntilStart))
    )
    .sort((first, second) =>
      first.details.priority - second.details.priority ||
      Number(second.details.favoriteMatch) - Number(first.details.favoriteMatch) ||
      Number(second.details.isClose) - Number(first.details.isClose) ||
      second.details.popularity - first.details.popularity ||
      first.details.minutesUntilStart - second.details.minutesUntilStart
    )
    .slice(0, 4)
    .map(({ fixture, details }) => createTrendingCard(fixture, details));

  trendingGames.replaceChildren(...watchlist);
  if (watchlist.length === 0) {
    trendingGames.append(textElement("p", "No matches to watch right now.", "watchlist-empty"));
  }
}

function createFixtureCard(fixture) {
  const card = document.createElement("article");
  card.className = "fixture-card";
  card.dataset.sport = fixture.sport.toLowerCase();
  card.dataset.fixtureId = fixture.id;
  card.dataset.search = [
    fixture.sport,
    fixture.home.name,
    fixture.away.name,
    fixture.competition,
    fixture.day
  ].join(" ").toLowerCase();

  const meta = document.createElement("div");
  meta.className = "fixture-meta";
  const matchDate = new Date(fixture.date);
  const startTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(matchDate);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameLocalDate = (first, second) =>
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
  const matchDay = sameLocalDate(matchDate, today)
    ? "Today"
    : sameLocalDate(matchDate, tomorrow)
      ? "Tomorrow"
      : new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(matchDate);
  const matchStatus = fixture.status || "Scheduled";
  meta.append(
    textElement("span", fixture.sport),
    textElement("span", matchStatus.toLowerCase() === "scheduled" ? startTime : matchStatus)
  );

  const teams = document.createElement("div");
  teams.className = "fixture-teams";
  const homeMark = textElement("span", fixture.home.code, `team-mark ${fixture.home.color || ""}`);
  const homeName = textElement("strong", fixture.home.name);
  const versus = textElement("span", "VS", "versus");
  const awayMark = textElement("span", fixture.away.code, `team-mark ${fixture.away.color || ""}`);
  const awayName = textElement("strong", fixture.away.name);
  teams.append(homeMark, homeName, versus, awayMark, awayName);

  const footer = document.createElement("div");
  footer.className = "fixture-footer";
  footer.append(
    textElement("span", fixture.competition),
    textElement("span", matchDay)
  );

  const matchLink = document.createElement("a");
  matchLink.className = "fixture-link";
  matchLink.href = fixture.url;
  matchLink.textContent = fixture.sport === "Tennis" ? "View match schedule ↗" : "View match ↗";

  card.append(meta, teams, footer, matchLink);
  return card;
}

// Match filtering, carousel, and schedule loading.
function createTrendingCard(fixture, details = getWatchlistDetails(fixture, Date.now())) {
  const card = document.createElement("article");
  card.className = "trending-card";

  const hasScore = fixture.homeScore != null && fixture.awayScore != null;
  const matchStatus = textElement("p", fixture.status || "Scheduled", "trending-match-status");
  if (details.isLive) {
    matchStatus.classList.add("is-live");
  }

  const badges = document.createElement("div");
  badges.className = "trending-badges";
  if (details.isLive) badges.append(textElement("span", "LIVE NOW", "trending-badge is-live"));
  if (details.isClose) badges.append(textElement("span", "Close game", "trending-badge is-close"));
  if (details.isStartingSoon) badges.append(textElement("span", "Starting soon", "trending-badge"));
  if (details.favoriteMatch) badges.append(textElement("span", "Your team", "trending-badge is-favorite"));
  if (!details.favoriteMatch && details.popularity >= 80) {
    badges.append(textElement("span", "Popular", "trending-badge"));
  }

  const competition = textElement("p", fixture.competition, "trending-competition");
  const scoreline = document.createElement("div");
  scoreline.className = "trending-scoreline";
  scoreline.append(
    textElement("span", fixture.home.code, `team-mark trending-team-code ${fixture.home.color || ""}`),
    textElement("strong", hasScore ? `${fixture.homeScore} – ${fixture.awayScore}` : "VS", "trending-score")
  );
  scoreline.append(textElement("span", fixture.away.code, `team-mark trending-team-code ${fixture.away.color || ""}`));

  const teams = textElement("p", `${fixture.home.name} vs ${fixture.away.name}`, "trending-team-names");
  const link = document.createElement("a");
  link.className = "trending-card-link";
  link.href = fixture.url;
  link.textContent = fixture.sport === "Tennis" ? "View match schedule ↗" : "View game ↗";
  link.setAttribute("aria-label", `View ${fixture.home.name} versus ${fixture.away.name}`);

  card.append(matchStatus, badges, competition, scoreline, teams, link);
  if (!details.isLive && !details.isStartingSoon && !isFinalFixture(fixture)) {
    card.classList.add("is-upcoming");
  }
  return card;
}

function textElement(tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function filterMatches() {
  if (!fixtureList) return;

  const cards = [...fixtureList.querySelectorAll(".fixture-card")];
  const matchingCards = cards.filter((card) => {
    const matchesSport = matchSportFilter === "all" || card.dataset.sport === matchSportFilter;
    return matchesSport && card.dataset.search.includes(matchQuery);
  });
  const visibleCards = showAllMatches
    ? matchingCards
    : matchingCards.slice(0, initialMatchLimit);

  cards.forEach((card) => {
    card.hidden = !visibleCards.includes(card);
  });

  const matchLabel = matchingCards.length === 1 ? "match" : "matches";
  matchCount.textContent = showAllMatches || matchingCards.length <= initialMatchLimit
    ? `${matchingCards.length} ${matchLabel}`
    : `Showing ${visibleCards.length} of ${matchingCards.length} ${matchLabel}`;
  matchEmpty.hidden = matchingCards.length !== 0;
  if (matchMoreButton) {
    matchMoreButton.hidden = showAllMatches || matchingCards.length <= initialMatchLimit;
    matchMoreButton.textContent = `Show more matches (${matchingCards.length - visibleCards.length})`;
  }
}

function animateMatchCarousel(timestamp) {
  if (!fixtureList) return;

  const isPaused = document.hidden ||
    Date.now() < matchCarouselPausedUntil ||
    fixtureList.matches(":hover") ||
    fixtureList.contains(document.activeElement);
  if (isPaused) {
    matchCarouselLastFrame = null;
  } else {
    const elapsed = matchCarouselLastFrame === null ? 0 : Math.min(timestamp - matchCarouselLastFrame, 50);
    const maxScroll = fixtureList.scrollWidth - fixtureList.clientWidth;
    if (maxScroll > 0 && elapsed > 0) {
      fixtureList.scrollLeft += elapsed * 0.018;
      if (fixtureList.scrollLeft >= maxScroll) fixtureList.scrollLeft = 0;
    }
    matchCarouselLastFrame = timestamp;
  }

  window.requestAnimationFrame(animateMatchCarousel);
}

function pauseMatchCarousel(duration = 8000) {
  matchCarouselPausedUntil = Date.now() + duration;
}

async function loadFixtures() {
  if (!fixtureList) return;

  try {
    const response = await fetch("/api/fixtures");
    if (!response.ok) {
      throw new Error(`Fixture request failed (${response.status})`);
    }

    const schedule = await response.json();
    if (!Array.isArray(schedule.fixtures)) {
      throw new Error("The match schedule response did not contain a fixture list");
    }

    const cards = [...schedule.fixtures]
      .sort((first, second) => (second.featuredScore || 0) - (first.featuredScore || 0))
      .map(createFixtureCard);
    fixtureList.replaceChildren(...cards);
    showAllMatches = false;
    filterMatches();
    currentFixtures = schedule.fixtures;
    currentRecentScores = schedule.trending || [];
    updateFavoriteTeamPicker(schedule.fixtures);
    if (trendingGames) {
      const trendingFixtures = [...currentRecentScores];
      const hasRecentScores = trendingFixtures.length > 0;
      renderWatchlist(currentFixtures, trendingFixtures);
      if (trendingStatus) {
        const updatedTime = formatUpdateTime(schedule.updatedAt);
        if (schedule.stale) {
          trendingStatus.textContent = `Saved data · Last updated ${updatedTime} · ${describeUnavailableSources(schedule.staleSources || schedule.errors)}`;
        } else if (schedule.staleSources?.length) {
          trendingStatus.textContent = `${describeUnavailableSources(schedule.staleSources)} · Updated ${updatedTime}`;
        } else {
          trendingStatus.textContent = hasRecentScores
            ? `Recent scores · Updated ${updatedTime}`
            : `No recent scores available · Trending upcoming games · Updated ${updatedTime}`;
        }
      }
    }
  } catch (error) {
    console.error("Unable to load fixtures from the local server:", error);
  }
}

function showHeroPhoto(index) {
  const photo = heroPhotos[index];
  const [currentLayer, nextLayer] = heroPhotoLayers;
  if (!photo || !currentLayer || !nextLayer) return;

  const preload = new Image();
  preload.onload = () => {
    nextLayer.style.backgroundImage = `url("${photo.image}")`;
    nextLayer.classList.add("is-visible");
    currentLayer.classList.remove("is-visible");
    heroSportButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.heroSport === photo.sport));
    });
    heroSlideCount.textContent = `${String(index + 1).padStart(2, "0")} / ${String(heroPhotos.length).padStart(2, "0")}`;
    heroSlideLabel.textContent = `${photo.label} · All the action, all in one place`;
    selectedHeroPhoto = index;
    window.setTimeout(() => {
      currentLayer.style.backgroundImage = `url("${photo.image}")`;
      currentLayer.classList.add("is-visible");
      nextLayer.classList.remove("is-visible");
    }, 850);
  };
  preload.onerror = () => {
    console.error(`Unable to load the ${photo.label.toLowerCase()} hero photo`);
  };
  preload.src = photo.image;
}

// News card rendering, filters, and feed loading.
function formatPublishDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Latest";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function createNewsCard(article) {
  const card = document.createElement("article");
  card.className = "story-card";
  card.dataset.sport = article.category;
  card.dataset.newsSport = article.sport;

  const imageLink = document.createElement("a");
  imageLink.className = `story-image image-${article.category}`;
  imageLink.href = article.url;
  imageLink.setAttribute("aria-label", `Read: ${article.title}`);
  imageLink.append(
    textElement("span", article.label, "image-tag"),
    textElement("span", "↗", "image-arrow")
  );

  const copy = document.createElement("div");
  copy.className = "story-copy";
  const meta = textElement("p", `${article.source} · ${formatPublishDate(article.publishedAt)}`, "story-meta");
  const heading = document.createElement("h3");
  const titleLink = document.createElement("a");
  titleLink.href = article.url;
  titleLink.textContent = article.title;
  heading.append(titleLink);
  const summary = textElement("p", article.summary);
  const readLink = document.createElement("a");
  readLink.className = "text-link";
  readLink.href = article.url;
  readLink.append(
    document.createTextNode(`Read at ${article.source} `),
    textElement("span", "↗")
  );
  copy.append(meta, heading, summary, readLink);
  card.append(imageLink, copy);

  if (article.image) {
    const image = document.createElement("img");
    image.className = "news-image";
    image.src = article.image;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    imageLink.prepend(image);
    imageLink.classList.add("has-news-image");
  }

  return card;
}

function filterNews() {
  const matchingCards = [];
  storyGrid?.querySelectorAll(".story-card").forEach((card) => {
    const categoryMatches = newsCategoryFilter === "all" || card.dataset.sport === newsCategoryFilter;
    const sportMatches = newsSportSelection === "all" || card.dataset.newsSport === newsSportSelection;
    if (categoryMatches && sportMatches) matchingCards.push(card);
  });

  matchingCards.forEach((card, index) => {
    card.hidden = index >= visibleNewsLimit;
  });

  newsMoreButton.hidden = matchingCards.length <= visibleNewsLimit;
  newsMoreButton.textContent = "Show more stories";
}

async function loadNews() {
  if (!storyGrid) return;

  try {
    const response = await fetch("/api/news");
    if (!response.ok) {
      throw new Error(`News request failed (${response.status})`);
    }

    const news = await response.json();
    if (!Array.isArray(news.articles)) {
      throw new Error("The news response did not contain an article list");
    }

    news.articles.forEach((article) => {
      const heroPhoto = heroPhotos.find((photo) => photo.sport === article.category);
      if (article.image && heroPhoto) {
        heroPhoto.image = article.image;
      }
    });
    storyGrid.replaceChildren(...news.articles.map(createNewsCard));
    const sports = [...new Map(news.articles.map((article) => [article.sport, article.label])).entries()]
      .sort((first, second) => first[1].localeCompare(second[1]));
    const options = [
      textElement("option", "Every sport"),
      ...sports.map(([sport, label]) => {
        const option = textElement("option", label);
        option.value = sport;
        return option;
      })
    ];
    options[0].value = "all";
    newsSportFilter.replaceChildren(...options);
    filterNews();
    showHeroPhoto(selectedHeroPhoto);
    newsStatus.textContent = news.stale
      ? `Saved headlines · Last updated ${formatUpdateTime(news.updatedAt)}`
      : `${news.articles.length} latest headlines`;
    const unavailableNewsSources = [...new Set([...(news.staleSources || []), ...(news.errors || [])])];
    if (unavailableNewsSources.length) {
      newsStatus.textContent += ` · ${describeUnavailableSources(unavailableNewsSources)}`;
    }
  } catch (error) {
    console.error("Unable to load live sports news:", error);
    newsStatus.textContent = "Live news is temporarily unavailable. The featured stories are shown instead.";
  }
}

// UI event handlers.
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    newsCategoryFilter = button.dataset.filter;
    newsSportSelection = "all";
    visibleNewsLimit = newsPageSize;
    newsSportFilter.value = "all";

    document.querySelectorAll("[data-filter]").forEach((filterButton) => {
      const active = filterButton === button;
      filterButton.classList.toggle("is-active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });

    filterNews();
  });
});

favoriteTeamSearch?.addEventListener("input", () => {
  updateFavoriteTeamPicker(currentFixtures);
});

newsSportFilter?.addEventListener("change", () => {
  newsSportSelection = newsSportFilter.value;
  newsCategoryFilter = "all";
  visibleNewsLimit = newsPageSize;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === "all";
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  filterNews();
});

newsMoreButton?.addEventListener("click", () => {
  visibleNewsLimit += newsPageSize;
  filterNews();
});

document.querySelectorAll("[data-match-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    matchSportFilter = button.dataset.matchFilter;
    showAllMatches = false;
    document.querySelectorAll("[data-match-filter]").forEach((filterButton) => {
      const active = filterButton === button;
      filterButton.classList.toggle("is-active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });
    fixtureList?.scrollTo({ left: 0, behavior: "smooth" });
    filterMatches();
  });
});

matchSearch?.addEventListener("input", () => {
  matchQuery = matchSearch.value.trim().toLowerCase();
  showAllMatches = false;
  fixtureList?.scrollTo({ left: 0, behavior: "smooth" });
  filterMatches();
});

matchMoreButton?.addEventListener("click", () => {
  showAllMatches = true;
  filterMatches();
  pauseMatchCarousel();
});

heroSportButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const index = heroPhotos.findIndex((photo) => photo.sport === button.dataset.heroSport);
    showHeroPhoto(index);
  });
});

document.querySelectorAll("[data-score-direction]").forEach((button) => {
  button.addEventListener("click", () => {
    const direction = Number(button.dataset.scoreDirection);
    pauseMatchCarousel();
    fixtureList?.scrollBy({ left: direction * fixtureList.clientWidth * 0.8, behavior: "smooth" });
  });
});

if (fixtureList && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  fixtureList.addEventListener("pointerenter", () => {
    matchCarouselPausedUntil = Number.POSITIVE_INFINITY;
  });
  fixtureList.addEventListener("pointerleave", () => pauseMatchCarousel(6000));
  fixtureList.addEventListener("focusin", () => {
    matchCarouselPausedUntil = Number.POSITIVE_INFINITY;
  });
  fixtureList.addEventListener("focusout", () => pauseMatchCarousel(6000));
  fixtureList.addEventListener("touchstart", () => pauseMatchCarousel(8000), { passive: true });
  fixtureList.addEventListener("wheel", () => pauseMatchCarousel(8000), { passive: true });
  window.requestAnimationFrame(animateMatchCarousel);
}

const menuToggle = document.querySelector(".menu-toggle");
const primaryNavigation = document.querySelector("#primary-navigation");

// Mobile navigation and footer information dialog.
menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  primaryNavigation?.classList.toggle("is-open", !isOpen);
});

primaryNavigation?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuToggle?.setAttribute("aria-expanded", "false");
    menuToggle?.setAttribute("aria-label", "Open navigation");
    primaryNavigation.classList.remove("is-open");
  });
});

const footerDialog = document.querySelector("#footer-dialog");
const footerDialogTitle = document.querySelector("#footer-dialog-title");
const footerDialogCopy = document.querySelector("#footer-dialog-copy");
const footerInfo = {
  privacy: {
    title: "Privacy Policy",
    copy: "Sports does not ask you to create an account. Match schedules and news headlines are fetched from ESPN by the Sports server. Opening an ESPN article or a social link takes you to that third-party website, which has its own privacy practices."
  },
  about: {
    title: "About Us",
    copy: "Sports brings match schedules and headlines from football, basketball, tennis, and more into one place. News and fixture links are provided by ESPN."
  },
  support: {
    title: "Support Us",
    copy: "Thanks for supporting Sports. Support options are not available yet, but you can keep exploring and sharing the site."
  },
  careers: {
    title: "Careers",
    copy: "There are no open roles listed right now. Check back later for updates."
  }
};

document.querySelectorAll("[data-footer-info]").forEach((button) => {
  button.addEventListener("click", () => {
    const content = footerInfo[button.dataset.footerInfo];
    if (!content || !footerDialog || !footerDialogTitle || !footerDialogCopy) return;
    footerDialogTitle.textContent = content.title;
    footerDialogCopy.textContent = content.copy;
    footerDialog.showModal();
  });
});

document.querySelector(".footer-dialog-close")?.addEventListener("click", () => {
  footerDialog?.close();
});

footerDialog?.addEventListener("click", (event) => {
  if (event.target === footerDialog) footerDialog.close();
});

loadFixtures();
loadNews();
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  window.setInterval(() => {
    showHeroPhoto((selectedHeroPhoto + 1) % heroPhotos.length);
  }, 7000);
}
