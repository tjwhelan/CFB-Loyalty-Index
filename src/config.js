import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function loadEnv() {
  const root = join(__dirname, '..');
  return { ...loadEnvFile(join(root, '.env')), ...loadEnvFile(join(root, 'key.env')) };
}

const env = loadEnv();

// Prefer key from files (.env / key.env) so updates take effect; then process.env
export const CFBD_API_KEY = (env.CFBD_API_KEY || env.API_KEY || process.env.CFBD_API_KEY || process.env.API_KEY || '').trim();
export const API_BASE = 'https://api.collegefootballdata.com';
