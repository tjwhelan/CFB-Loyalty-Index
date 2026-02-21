#!/usr/bin/env node
/**
 * CFB Loyalty Index – CLI
 * Scores transfer probability for college football athletes using CFBD API + manual factors.
 *
 * Usage:
 *   node src/index.js [score] --year=2024 --team="Ohio State" [--player="Name"]
 *   node src/index.js score --year=2024 --team="Alabama" --nil=0.3 --social=0.7
 *
 * Optional overrides (0–1 unless noted):
 *   --player=Name
 *   --nil=0.5       NIL collective strength (1 = strong)
 *   --social=0.2    Social/quotes sentiment (1 = unhappy)
 *   --distance=400  Miles from high school
 */

import { aggregatePlayerInput } from './data/aggregate.js';
import { computeTransferProbability } from './scoring/transferProbability.js';

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== 'score');
  const out = { year: new Date().getFullYear(), team: '' };
  for (const a of args) {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) {
      const [, key, value] = m;
      if (key === 'year') out.year = Number(value);
      else if (key === 'team') out.team = value;
      else if (key === 'player') out.playerName = value;
      else if (key === 'nil') out.nilScore = Number(value);
      else if (key === 'social') out.socialSentiment = Number(value);
      else if (key === 'distance') out.distanceFromHighSchoolMiles = Number(value);
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  if (!opts.team && !opts.playerName) {
    console.log(`
CFB Loyalty Index – transfer probability (0–100%)

Usage:
  node src/index.js --player="Marvin Harrison Jr" [--year=2024]
  node src/index.js --year=2024 --team="Ohio State" [--player="Name"]
  node src/index.js --team="Alabama" --nil=0.4 --social=0.6 --distance=900

Options:
  --year=YYYY       Season year (default: current)
  --player="Name"   Player name (resolves team from API if team omitted)
  --team="Name"     School name (optional if player given)
  --nil=0.5         NIL strength 0–1 (1 = strong)
  --social=0.2      Social/quotes risk 0–1 (1 = unhappy)
  --distance=400    Miles from high school (overrides API heuristic)

Set CFBD_API_KEY in .env or key.env (default: 69420).
API: https://api.collegefootballdata.com
`);
    process.exit(1);
  }

  console.log('Fetching data from College Football Data API...');
  const input = await aggregatePlayerInput(opts);
  const result = computeTransferProbability(input);

  console.log('\n--- Transfer probability ---');
  console.log(`Player context: ${input._meta?.playerName || '(any)'} @ ${input._meta?.team} (${input._meta?.year})`);
  console.log(`Probability to transfer (next 12 months): ${result.probability}%`);
  console.log('\nFactor breakdown (risk 0–1, weight, contribution):');
  for (const [key, v] of Object.entries(result.breakdown)) {
    console.log(`  ${key}: risk=${v.risk}, weight=${v.weight}, contribution=${v.contribution}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
