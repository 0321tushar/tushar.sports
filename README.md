# Sports

A lightweight sports homepage with a built-in Node.js API for fixtures and news.

## Run locally

```powershell
npm start
```

Open `http://localhost:3000`. Set the `PORT` environment variable to use another port.

## Project map

```text
.
|-- package.json                 # Start command
|-- src/
|   |-- server.js                # HTTP routes and static-file delivery
|   |-- providers/espn.js        # ESPN request and response normalization
|   `-- services/
|       |-- cache-store.js       # Persistent cache and source health
|       |-- fixtures.js          # Fixture aggregation and stale fallback
|       `-- news.js              # News aggregation and stale fallback
`-- public/
    |-- index.html               # Homepage structure
    |-- assets/                  # Local images
    |-- css/
    |   |-- main.css             # Stylesheet entry point; imports files below
    |   |-- base.css             # Theme, reset, shared controls, header
    |   |-- hero.css             # Homepage hero
    |   |-- matches.css          # Match finder and fixture cards
    |   |-- stories.css          # News filters and story grid
    |   |-- watchlist.css        # Trending games and favorite teams
    |   |-- sportswear.css       # Sportswear recommendations
    |   |-- story-cards.css      # Story imagery and card copy
    |   |-- footer.css           # Footer and information dialog
    |   `-- responsive.css       # Tablet/mobile and reduced-motion rules
    `-- js/
        `-- app.js               # Browser behavior (feature sections below)
```

The CSS import order in `public/css/main.css` is intentional. Add a new stylesheet there, after its shared foundations and before `responsive.css`.

## Finding a problem

| Symptom | Start here |
| --- | --- |
| Server will not start or a page is missing | `src/server.js` |
| `/api/fixtures` fails or returns unexpected matches | `src/providers/espn.js`, then `src/services/fixtures.js` |
| `/api/news` fails or returns unexpected stories | `src/providers/espn.js`, then `src/services/news.js` |
| Old saved results or source health looks wrong | `src/services/cache-store.js` |
| Match cards, filters, carousel, or favorites are wrong | `public/js/app.js` — match ranking, rendering, filters, and schedule loading |
| News cards or filters are wrong | `public/js/app.js` — news rendering, filters, and feed loading |
| Homepage photo selector is wrong | `public/js/app.js` — `showHeroPhoto()` |
| A visual or layout is wrong | The matching feature stylesheet in `public/css/` |

Useful checks:

```powershell
node --check src\server.js
node --check src\providers\espn.js
node --check src\services\cache-store.js
node --check src\services\fixtures.js
node --check src\services\news.js
node --check public\js\app.js
```

The local `.sports-cache.json` is runtime data and is intentionally git-ignored.
