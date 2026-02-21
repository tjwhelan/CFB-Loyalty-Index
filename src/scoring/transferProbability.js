/**
 * Transfer probability scoring model.
 * Each factor contributes 0–1 (transfer risk); combined into a 0–100% probability.
 */

const DEFAULT_WEIGHTS = {
  playingTime: 0.22,      // low snaps → higher risk
  distanceFromHome: 0.15, // miles from high school
  recruitingRank: 0.18,   // high rank + low usage = underutilized
  teamPerformance: 0.15,  // poor W-L / no success
  nilCollectives: 0.10,   // weak NIL → more likely to look elsewhere
  snapsPlayed: 0.12,      // explicit snap count (overlap with playing time, different scale)
  socialSentiment: 0.08,   // public quotes / social (unhappy signals)
};

/**
 * Normalize a value to 0–1 given a min/max (clamp then linear scale).
 */
function normalize(value, min, max) {
  if (value == null || Number.isNaN(Number(value))) return 0.5; // unknown = neutral
  const v = Math.max(min, Math.min(max, Number(value)));
  return (v - min) / (max - min || 1);
}

/**
 * Playing time: 0% = max risk (1), 100% = min risk (0).
 * usage can be 0–1 or 0–100; we treat as 0–1.
 */
function riskFromPlayingTime(usage) {
  if (usage == null) return 0.5;
  const u = Math.max(0, Math.min(1, Number(usage)));
  return 1 - u;
}

/**
 * Distance from high school (miles). 0 = low risk, 1500+ = high risk.
 */
function riskFromDistance(miles) {
  if (miles == null) return 0.5;
  const m = Math.max(0, Number(miles));
  return normalize(m, 0, 1500);
}

/**
 * Recruiting: high rating but low usage = underutilized = high risk.
 * recruitingRank: 0–1 (1 = best, e.g. 0.99 for 5-star), or 1–100 scale (100 = best).
 * We treat as "ranking quality" 0–1. Combined with playing time: high rank + low usage = risk.
 */
function riskFromRecruiting(recruitingRankNormalized, playingTimeNormalized) {
  if (recruitingRankNormalized == null) return 0.5;
  const rank = Math.max(0, Math.min(1, Number(recruitingRankNormalized)));
  const usage = playingTimeNormalized != null ? Math.max(0, Math.min(1, Number(playingTimeNormalized))) : 0.5;
  // Underutilization: high rank (1) and low usage (0) = high risk
  return rank * (1 - usage);
}

/**
 * Team performance: win rate 0–1. Low win rate = higher transfer risk.
 */
function riskFromTeamPerformance(winRate) {
  if (winRate == null) return 0.5;
  const w = Math.max(0, Math.min(1, Number(winRate)));
  return 1 - w;
}

/**
 * NIL collectives: 0–1 score (1 = strong NIL). Weak = higher risk.
 */
function riskFromNIL(nilScore) {
  if (nilScore == null) return 0.5;
  const n = Math.max(0, Math.min(1, Number(nilScore)));
  return 1 - n;
}

/**
 * Snaps played: raw count. Very low snaps = high risk. Scale by a reasonable max (e.g. 800).
 */
function riskFromSnaps(snaps, maxSnaps = 800) {
  if (snaps == null) return 0.5;
  const s = Math.max(0, Number(snaps));
  return 1 - normalize(s, 0, maxSnaps);
}

/**
 * Social / public quotes: 0–1 sentiment (1 = unhappy, likely to transfer).
 */
function riskFromSocial(sentiment) {
  if (sentiment == null) return 0.5;
  return Math.max(0, Math.min(1, Number(sentiment)));
}

/**
 * Compute transfer probability (0–100) from athlete and context.
 *
 * @param {Object} input
 * @param {number} [input.playingTime] - 0–1 (e.g. usage rate)
 * @param {number} [input.distanceFromHighSchoolMiles] - miles from HS to school
 * @param {number} [input.recruitingRank] - 0–1 (1 = best) or 1–100 (100 = best); we normalize
 * @param {number} [input.teamWinRate] - 0–1
 * @param {number} [input.nilScore] - 0–1 (1 = strong NIL)
 * @param {number} [input.snapsPlayed] - raw snap count
 * @param {number} [input.socialSentiment] - 0–1 (1 = unhappy/public quotes suggest transfer)
 * @param {Object} [input.weights] - override factor weights (same keys as DEFAULT_WEIGHTS)
 * @returns {{ probability: number, breakdown: Object, factors: Object }}
 */
export function computeTransferProbability(input = {}, weights = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...input.weights, ...weights };

  const playingTime = input.playingTime != null ? Number(input.playingTime) : null;
  const recruitingNorm = input.recruitingRank != null
    ? (Number(input.recruitingRank) <= 1 ? Number(input.recruitingRank) : Number(input.recruitingRank) / 100)
    : null;

  const rPlaying = riskFromPlayingTime(playingTime);
  const rDistance = riskFromDistance(input.distanceFromHighSchoolMiles);
  const rRecruiting = riskFromRecruiting(recruitingNorm, playingTime);
  const rTeam = riskFromTeamPerformance(input.teamWinRate);
  const rNIL = riskFromNIL(input.nilScore);
  const rSnaps = riskFromSnaps(input.snapsPlayed);
  const rSocial = riskFromSocial(input.socialSentiment);

  const factors = {
    playingTime: rPlaying,
    distanceFromHome: rDistance,
    recruitingRank: rRecruiting,
    teamPerformance: rTeam,
    nilCollectives: rNIL,
    snapsPlayed: rSnaps,
    socialSentiment: rSocial,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, risk] of Object.entries(factors)) {
    const weight = w[key];
    if (weight != null && weight > 0) {
      totalWeight += weight;
      weightedSum += weight * risk;
    }
  }

  const probability = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 50;
  const breakdown = {};
  for (const [key, risk] of Object.entries(factors)) {
    breakdown[key] = { risk: Math.round(risk * 100) / 100, weight: w[key] ?? 0, contribution: Math.round((w[key] ?? 0) * risk * 100) / 100 };
  }

  return {
    probability: Math.round(probability * 10) / 10,
    breakdown,
    factors,
  };
}

export { DEFAULT_WEIGHTS };
