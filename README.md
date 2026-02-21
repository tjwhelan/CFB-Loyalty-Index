# CFB Loyalty Index

Measures the likelihood of a college football player to transfer schools within the next 12 months using the [College Football Data API](https://api.collegefootballdata.com) and a weighted scoring model.

## Factors (and weights)

| Factor | Weight | Description |
|--------|--------|-------------|
| **Playing time** | 22% | Low usage rate → higher transfer risk |
| **Recruiting rank** | 18% | High rank + low usage = “underutilized” → higher risk |
| **Distance from high school** | 15% | Farther from home → higher risk |
| **Team performance** | 15% | Poor win rate → higher risk |
| **Snaps played** | 12% | Fewer snaps → higher risk |
| **NIL collectives** | 10% | Weaker NIL (0–1 score) → higher risk (manual/override) |
| **Social / public quotes** | 8% | Unhappy sentiment (0–1) → higher risk (manual/override) |

NIL and social sentiment are not in the API; pass them as overrides when you have data.

## Setup

1. **Node.js 18+** (for native `fetch` and ES modules).

2. **API key**  
   Get a free key at [collegefootballdata.com/key](https://collegefootballdata.com/key).  
   Create a `.env` file in the project root:

   ```bash
   CFBD_API_KEY=your_api_key_here
   ```

   Or set the env var: `export CFBD_API_KEY=your_key`.  
   The app will fall back to the placeholder `69420` if unset (replace with your real key for live data).

## Usage

### CLI (score from API + optional overrides)

```bash
# By player name only (team is resolved from the API)
node src/index.js --player="Marvin Harrison Jr" --year=2024

# By team (optional player; otherwise first from API)
node src/index.js --year=2024 --team="Ohio State" --player="Marvin Harrison"

# Optional overrides (0–1 unless noted)
node src/index.js --team="Alabama" --nil=0.4 --social=0.6 --distance=900
```

### Web UI

```bash
npm run server
# or: node src/server.js
```

Then open **http://localhost:3000/** in a browser. Enter a **player name** (and optionally team and year); the app resolves the team from the API when only a name is given, so you avoid mismatching a player to the wrong school. You can also add optional overrides (NIL, social sentiment, distance) and see transfer probability with a factor breakdown.

### HTTP API (same server)

- **GET** `/` – serves the web UI (when no query params).
- **GET** `/?year=2024&team=Ohio%20State` – score using API data (optional `&player=Name`).
- **GET** `/health` – health check.
- **POST** `/score` or **POST** `/api/score` – body: JSON with `year`, `team`, and any overrides (`playerName`, `nilScore`, `socialSentiment`, `distanceFromHighSchoolMiles`, or raw scoring inputs). Returns transfer probability and factor breakdown.

### Programmatic (scoring only, no API)

```js
import { computeTransferProbability } from './src/scoring/transferProbability.js';

const result = computeTransferProbability({
  playingTime: 0.15,           // 15% usage
  distanceFromHighSchoolMiles: 1200,
  recruitingRank: 0.95,        // 0–1 (high = highly ranked)
  teamWinRate: 0.4,
  nilScore: 0.3,               // weak NIL
  snapsPlayed: 80,
  socialSentiment: 0.7         // unhappy
});
console.log(result.probability); // 0–100
console.log(result.breakdown);
```

## Project layout

- `src/config.js` – loads `CFBD_API_KEY` from `.env` or `process.env`.
- `src/api/client.js` – client for [College Football Data API](https://api.collegefootballdata.com) (player/usage, roster, recruiting, records, etc.).
- `src/data/aggregate.js` – pulls API data for a team/year (and optional player) and builds the object passed to the scorer (with optional overrides for distance, NIL, social).
- `src/scoring/transferProbability.js` – weighted model that outputs a 0–100% transfer probability and factor breakdown.
- `src/index.js` – CLI entry.
- `src/server.js` – HTTP server: serves `public/index.html` at GET `/` and API at GET `/?team=...`, POST `/api/score`.
- `public/index.html` – single-page web UI for the loyalty index.

## API reference

- [College Football Data API](https://api.collegefootballdata.com) (Swagger/docs at same host).
- Transfer portal endpoint: [GetTransferPortal](https://api.collegefootballdata.com/#/players/GetTransferPortal) (used for context; scoring uses usage, recruiting, roster, records).
