/**
 * Aggregates CFBD API data and optional manual inputs into the shape
 * expected by the transfer probability scorer.
 */

import * as api from '../api/client.js';

/** Rough average miles between state centers (for states that don't match). */
const STATE_DISTANCE_APPROXIMATE_MILES = 800;

/**
 * Resolve player by name only: call /player/search, return first match with team.
 * @param {number} year
 * @param {string} playerName
 * @returns {Promise<{ team: string, name: string }|null>}
 */
export async function resolvePlayerByName(year, playerName) {
  if (!playerName || !String(playerName).trim()) return null;
  const list = await api.searchPlayers(year, String(playerName).trim());
  if (!Array.isArray(list) || list.length === 0) return null;
  const nameLower = String(playerName).toLowerCase();
  const exact = list.find((p) => (p.name || p.player || '').toLowerCase() === nameLower);
  const match = exact || list.find((p) => (p.name || p.player || '').toLowerCase().includes(nameLower));
  if (!match) return null;
  const team = match.team || match.school;
  if (!team) return null;
  return { team: String(team), name: match.name || match.player || playerName };
}

/**
 * Get team win rate for a season (regular season).
 */
async function getWinRate(year, team) {
  try {
    const records = await api.getTeamRecords(year, team);
    const season = findTeamRecord(records, year, team);
    if (season) {
      const wins = Number(season.total?.wins ?? season.wins ?? 0);
      const games = Number(season.total?.games ?? season.games ?? season.total?.losses != null ? wins + Number(season.total?.losses ?? season.losses ?? 0) : 0);
      if (games > 0) return wins / games;
    }
    const games = await api.getTeamGames(year, team, 'regular');
    const wins = games.filter((g) => (g.home_team === team ? g.home_points > g.away_points : g.away_points > g.home_points)).length;
    return games.length > 0 ? wins / games.length : 0.5;
  } catch {
    return 0.5;
  }
}

function findTeamRecord(records, year, team) {
  if (!Array.isArray(records) || records.length === 0) return null;
  const y = String(year);
  return records.find((r) => String(r.season ?? r.year ?? '') === y && (r.team === team || !r.team)) ?? records.find((r) => r.team === team);
}

/**
 * Normalize recruiting rating to 0–1. API often returns 0–1 or 0.8–1.0 scale.
 */
function normalizeRecruitingRating(rating) {
  if (rating == null) return null;
  const r = Number(rating);
  if (Number.isNaN(r)) return null;
  if (r <= 1) return r;
  if (r <= 5) return r / 5;   // stars
  if (r <= 100) return r / 100;
  if (r <= 255) return r / 255; // 247 scale
  return Math.min(1, r / 300);
}

/** Get a numeric value from an object trying several keys (for API response variance). */
function pickNum(obj, ...keys) {
  if (obj == null) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/** Get string from object. */
function pickStr(obj, ...keys) {
  if (obj == null) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

/**
 * Fetch and aggregate all available inputs for a player/team/year.
 * If only playerName is provided (no team), resolves team via /player/search first.
 *
 * @param {Object} opts
 * @param {number} opts.year - season year
 * @param {string} [opts.team] - school (optional if playerName provided)
 * @param {string} [opts.playerName] - player name (can be used without team for name-only search)
 * @param {number} [opts.distanceFromHighSchoolMiles] - override (if known)
 * @param {number} [opts.nilScore] - 0–1 NIL strength (manual)
 * @param {number} [opts.socialSentiment] - 0–1 from quotes/social (manual)
 * @returns {Promise<Object>} input for computeTransferProbability
 */
export async function aggregatePlayerInput(opts) {
  let { year, team, playerName, distanceFromHighSchoolMiles, nilScore, socialSentiment } = opts;

  if ((!team || !String(team).trim()) && playerName) {
    const resolved = await resolvePlayerByName(year, playerName);
    if (resolved) {
      team = resolved.team;
      playerName = resolved.name;
    } else {
      throw new Error(`No player found for "${playerName}". Try a different name or year.`);
    }
  }

  if (!team || !String(team).trim()) {
    throw new Error('Provide either a player name or a team (or both).');
  }

  const [usageList, roster, recruiting, records] = await Promise.all([
    api.getPlayerUsage(year, team).catch(() => []),
    api.getRoster(team, year).catch(() => []),
    api.getRecruitingPlayers(year, team).catch(() => []),
    api.getTeamRecords(year, team).catch(() => []),
  ]);

  let winRate = 0.5;
  if (Array.isArray(records) && records.length) {
    const season = findTeamRecord(records, year, team);
    const total = season?.total ?? season;
    const rec = total ?? season;
    if (rec) {
      const wins = Number(rec.total_wins ?? rec.wins ?? total?.wins ?? 0);
      const losses = Number(rec.total_losses ?? rec.losses ?? total?.losses ?? 0);
      const games = Number(rec.total_games ?? rec.games ?? total?.games ?? 0) || (wins + losses) || 1;
      if (games > 0) winRate = wins / games;
    }
  }
  if (winRate === 0.5) {
    winRate = await getWinRate(year, team);
  }

  let playerUsage = null;
  let playerRecruiting = null;
  let playerRoster = null;

  if (playerName) {
    const nameLower = String(playerName).toLowerCase();
    playerUsage = (usageList || []).find((p) => {
      const n = (pickStr(p, 'player', 'name') || '').toLowerCase();
      return n === nameLower || n.includes(nameLower) || nameLower.includes(n);
    });
    playerRecruiting = (recruiting || []).find((p) => {
      const n = (pickStr(p, 'name', 'player') || '').toLowerCase();
      return n === nameLower || n.includes(nameLower) || nameLower.includes(n);
    });
    playerRoster = (roster || []).find((p) => {
      const n = (pickStr(p, 'name', 'player') || '').toLowerCase();
      return n === nameLower || n.includes(nameLower) || nameLower.includes(n);
    });
  }

  if (!playerUsage && Array.isArray(usageList) && usageList.length) {
    playerUsage = usageList[0];
  }
  if (!playerRecruiting && Array.isArray(recruiting) && recruiting.length) {
    playerRecruiting = recruiting[0];
  }
  if (!playerRoster && Array.isArray(roster) && roster.length) {
    playerRoster = roster[0];
  }

  let playingTime = null;
  let snapsPlayed = null;

  if (playerUsage) {
    playingTime = pickNum(playerUsage, 'usg_overall', 'usage_overall', 'usage', 'usageOverall');
    if (playingTime != null && playingTime > 1) playingTime = playingTime / 100;
    if (playingTime == null && playerUsage.snap_counts) {
      const arr = Array.isArray(playerUsage.snap_counts) ? playerUsage.snap_counts : [playerUsage.snap_counts];
      const total = arr.reduce((a, b) => a + (Number(b) || 0), 0);
      snapsPlayed = total;
      playingTime = Math.min(1, total / (70 * 12));
    }
    if (snapsPlayed == null) snapsPlayed = pickNum(playerUsage, 'snaps', 'snap_count', 'totalSnaps');
  }

  let recruitingRank = null;
  if (playerRecruiting) {
    recruitingRank = normalizeRecruitingRating(
      pickNum(playerRecruiting, 'rating', 'rank', 'overall') ?? (playerRecruiting.stars != null ? playerRecruiting.stars / 5 : null)
    );
  }

  let distance = distanceFromHighSchoolMiles;
  if (distance == null && playerRoster) {
    const hometown = pickStr(playerRoster, 'hometown', 'home_town', 'city');
    if (hometown) {
      const teamState = inferTeamState(team);
      const hometownState = hometown.split(',').pop()?.trim()?.slice(0, 2) || '';
      if (teamState && hometownState && teamState.toUpperCase() === hometownState.toUpperCase()) {
        distance = 100;
      } else {
        distance = STATE_DISTANCE_APPROXIMATE_MILES;
      }
    }
  }

  const displayName = pickStr(playerUsage, 'player', 'name') ?? pickStr(playerRoster, 'name', 'player') ?? playerName;

  return {
    playingTime: playingTime ?? undefined,
    distanceFromHighSchoolMiles: distance,
    recruitingRank: recruitingRank ?? undefined,
    teamWinRate: winRate,
    nilScore: nilScore ?? undefined,
    snapsPlayed: snapsPlayed ?? undefined,
    socialSentiment: socialSentiment ?? undefined,
    _meta: {
      playerName: displayName,
      team,
      year,
    },
  };
}

/** Very rough team state lookup for distance heuristic. */
const TEAM_STATE = {
  'Ohio State': 'OH', 'Michigan': 'MI', 'Alabama': 'AL', 'Georgia': 'GA',
  'Texas': 'TX', 'Oklahoma': 'OK', 'Clemson': 'SC', 'Florida State': 'FL',
  'Florida': 'FL', 'LSU': 'LA', 'Penn State': 'PA', 'Notre Dame': 'IN',
  'Tennessee': 'TN', 'USC': 'CA', 'Oregon': 'OR', 'Washington': 'WA',
  'Texas A&M': 'TX', 'Auburn': 'AL', 'Miami': 'FL', 'Nebraska': 'NE',
  'Iowa': 'IA', 'Wisconsin': 'WI', 'Michigan State': 'MI', 'Kentucky': 'KY',
  'South Carolina': 'SC', 'Arkansas': 'AR', 'Ole Miss': 'MS', 'Mississippi State': 'MS',
  'Missouri': 'MO', 'North Carolina': 'NC', 'Virginia Tech': 'VA', 'West Virginia': 'WV',
  'California': 'CA', 'Stanford': 'CA', 'UCLA': 'CA', 'Arizona': 'AZ',
  'Arizona State': 'AZ', 'Utah': 'UT', 'Colorado': 'CO', 'Kansas': 'KS',
  'Kansas State': 'KS', 'Oklahoma State': 'OK', 'Baylor': 'TX', 'TCU': 'TX',
  'Texas Tech': 'TX', 'Houston': 'TX', 'SMU': 'TX', 'Tulane': 'LA',
  'Maryland': 'MD', 'Rutgers': 'NJ', 'Indiana': 'IN', 'Purdue': 'IN',
  'Illinois': 'IL', 'Northwestern': 'IL', 'Minnesota': 'MN',
};
function inferTeamState(team) {
  return TEAM_STATE[team] || null;
}
