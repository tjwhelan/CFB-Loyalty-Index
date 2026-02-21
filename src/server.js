/**
 * HTTP server: serves UI and API.
 * GET / → UI; GET /health, GET /?team=... → API; POST /score or /api/score → API.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CFBD_API_KEY } from './config.js';
import { aggregatePlayerInput } from './data/aggregate.js';
import { computeTransferProbability } from './scoring/transferProbability.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = join(__dirname, '..', 'public');

function serveHtml(res, path) {
  const full = join(PUBLIC_DIR, path === '/' ? 'index.html' : path);
  if (!existsSync(full)) return false;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.statusCode = 200;
  res.end(readFileSync(full, 'utf8'));
  return true;
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok', service: 'cfb-loyalty-index' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/' && !url.searchParams.has('team')) {
    if (serveHtml(res, '/')) return;
  }

  if (req.method === 'GET' && url.pathname === '/' && url.searchParams.has('team')) {
    res.setHeader('Content-Type', 'application/json');
    const year = url.searchParams.get('year') || new Date().getFullYear();
    const team = url.searchParams.get('team');
    try {
      const input = await aggregatePlayerInput({ year: Number(year), team, playerName: url.searchParams.get('player') || undefined });
      const result = computeTransferProbability(input);
      res.statusCode = 200;
      res.end(JSON.stringify({ input: { ...input, _meta: input._meta }, ...result }, null, 2));
      return;
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  const isScorePost = req.method === 'POST' && (url.pathname === '/score' || url.pathname === '/api/score');
  if (isScorePost) {
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    for await (const chunk of req) body += chunk;
    let json;
    try {
      json = JSON.parse(body || '{}');
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
    const { year, team, playerName, distanceFromHighSchoolMiles, nilScore, socialSentiment, ...rest } = json;
    const input = { year, team, playerName, distanceFromHighSchoolMiles, nilScore, socialSentiment, ...rest };
    if (year != null) input.year = Number(year);
    const hasLookup = (input.team && String(input.team).trim()) || (input.playerName && String(input.playerName).trim());
    const hasRawScore = input.playingTime != null || input.teamWinRate != null || input.recruitingRank != null;
    if (!hasLookup && hasRawScore) {
      const result = computeTransferProbability(input);
      res.statusCode = 200;
      res.end(JSON.stringify(result, null, 2));
      return;
    }
    try {
      const aggregated = await aggregatePlayerInput(input);
      const merged = { ...aggregated, ...input };
      delete merged._meta;
      const result = computeTransferProbability(merged);
      res.statusCode = 200;
      res.end(JSON.stringify({ input: { ...merged, _meta: aggregated._meta }, ...result }, null, 2));
      return;
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found. Try GET / for UI, GET /?team=... or POST /api/score for API.' }));
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`CFB Loyalty Index at http://localhost:${PORT}/`);
  if (CFBD_API_KEY) {
    console.log('  CFBD API key loaded from .env / key.env');
  } else {
    console.warn('  WARNING: No CFBD_API_KEY in .env or key.env – API calls will fail.');
  }
  console.log('  GET /             – UI');
  console.log('  GET /?team=...    – score from API');
  console.log('  POST /api/score  – score with JSON body');
});
