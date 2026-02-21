import { CFBD_API_KEY, API_BASE } from '../config.js';

/**
 * College Football Data API client.
 * @see https://api.collegefootballdata.com/
 */
export async function cfbdFetch(path, params = {}) {
  const url = new URL(path, API_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  if (!CFBD_API_KEY || !String(CFBD_API_KEY).trim()) {
    throw new Error(
      'Missing CFBD API key. Add CFBD_API_KEY=your_key to a .env or key.env file in the project root. ' +
      'Get a free key at https://collegefootballdata.com/key'
    );
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${CFBD_API_KEY.trim()}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error(
        'CFBD API 401 Unauthorized. Check that your API key is correct in .env or key.env (variable: CFBD_API_KEY or API_KEY). ' +
        'Get or regenerate a key at https://collegefootballdata.com/key'
      );
    }
    throw new Error(`CFBD API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/** GET /player/search - find players by name (team optional). Returns array of { id, team, name, ... }. */
export async function searchPlayers(year, name, team) {
  const params = { searchTerm: name };
  if (year != null) params.year = year;
  if (team != null && team !== '') params.team = team;
  return cfbdFetch('/player/search', params);
}

/** GET /player/portal - transfer portal entries (optional year) */
export async function getTransferPortal(year) {
  return cfbdFetch('/player/portal', { year });
}

/** GET /player/usage - player usage (snaps, etc.) by year/team */
export async function getPlayerUsage(year, team) {
  return cfbdFetch('/player/usage', { year, team });
}

/** GET /recruiting/players - recruiting rankings */
export async function getRecruitingPlayers(year, team, position) {
  return cfbdFetch('/recruiting/players', { year, team, position });
}

/** GET /roster - team roster (includes player info, sometimes high school) */
export async function getRoster(team, year) {
  return cfbdFetch('/roster', { team, year });
}

/** GET /games - team games (for win/loss / performance) */
export async function getTeamGames(year, team, seasonType = 'regular') {
  return cfbdFetch('/games', { year, team, seasonType });
}

/** GET /records - team season records */
export async function getTeamRecords(year, team) {
  return cfbdFetch('/records', { year, team });
}

/** GET /stats/player/season - player season stats */
export async function getPlayerSeasonStats(year, team) {
  return cfbdFetch('/stats/player/season', { year, team });
}

/** GET /talent - team talent composite (optional context) */
export async function getTalent(year) {
  return cfbdFetch('/talent', { year });
}
