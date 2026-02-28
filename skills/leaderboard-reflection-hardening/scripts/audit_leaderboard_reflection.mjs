import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

function readText(relPath) {
  const absPath = path.join(rootDir, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

function normalizeRelPath(rawPath) {
  return String(rawPath || '').replace(/^\/+/, '').replace(/\//g, path.sep);
}

function toGameIdFromPath(rawPath) {
  const fileName = path.basename(String(rawPath || ''));
  const stem = fileName.replace(/\.html$/i, '');
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractFallbackKeys(gameHubText) {
  const startToken = 'const fallbackByGame = {';
  const endToken = 'const genericFallbackScript =';
  const start = gameHubText.indexOf(startToken);
  const end = gameHubText.indexOf(endToken);

  if (start < 0 || end < 0 || end <= start) return new Set();

  const block = gameHubText.slice(start, end);
  const keys = new Set();
  for (const match of block.matchAll(/'([^']+)'\s*:\s*`/g)) {
    keys.add(match[1]);
  }
  return keys;
}

function hasBridge(gameHtmlText) {
  const hasSnapshot = /__mgpSnapshot/.test(gameHtmlText);
  const hasSource = /source:\s*['"]mgp-game['"]/.test(gameHtmlText);
  const hasResultType = /type:\s*['"]result['"]/.test(gameHtmlText);
  const hasPostMessage = /postMessage\s*\(/.test(gameHtmlText);
  return hasSnapshot && hasSource && hasResultType && hasPostMessage;
}

function color(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

const ok = (text) => color(`OK   ${text}`, 32);
const warn = (text) => color(`WARN ${text}`, 33);
const fail = (text) => color(`FAIL ${text}`, 31);

function run() {
  const registry = JSON.parse(readText('src/html/registry.json'));
  const games = Array.isArray(registry?.games) ? registry.games : [];

  if (games.length === 0) {
    console.error(fail('No html games found in src/html/registry.json'));
    process.exitCode = 1;
    return;
  }

  const gameHubText = readText('src/platform/GameHub.js');
  const fallbackKeys = extractFallbackKeys(gameHubText);
  const hasGenericFallback = gameHubText.includes('const genericFallbackScript =');
  const hasScriptsToTryFlow = gameHubText.includes('const scriptsToTry =')
    && gameHubText.includes('scriptsToTry.push(genericFallbackScript)');

  const rows = [];
  let blocking = false;

  for (const entry of games) {
    const gamePath = String(entry?.path || '');
    const gameId = toGameIdFromPath(gamePath);
    const relPath = normalizeRelPath(gamePath);
    const absPath = path.join(rootDir, relPath);

    let gameHtmlText = '';
    let fileExists = true;
    try {
      gameHtmlText = fs.readFileSync(absPath, 'utf8');
    } catch (_error) {
      fileExists = false;
    }

    const bridge = fileExists ? hasBridge(gameHtmlText) : false;
    const fallback = fallbackKeys.has(gameId);
    const dedicatedCoverage = bridge || fallback;
    if (!dedicatedCoverage) {
      blocking = true;
    }

    rows.push({
      gameId,
      gamePath,
      fileExists,
      bridge,
      fallback,
      status: fileExists
        ? (dedicatedCoverage ? 'PASS' : 'FAIL')
        : 'FAIL'
    });
  }

  console.log(`[leaderboard-reflection-audit] games=${rows.length}`);
  console.log('');
  for (const row of rows) {
    const prefix = row.status === 'PASS' ? ok('coverage') : fail('coverage');
    const detail = `id=${row.gameId} bridge=${row.bridge} fallback=${row.fallback} path=${row.gamePath}`;
    console.log(`${prefix} ${detail}`);
  }
  console.log('');

  if (hasGenericFallback) {
    console.log(ok('generic fallback script exists'));
  } else {
    blocking = true;
    console.log(fail('generic fallback script missing in GameHub.js'));
  }

  if (hasScriptsToTryFlow) {
    console.log(ok('specific -> generic fallback retry flow exists'));
  } else {
    blocking = true;
    console.log(fail('fallback retry flow missing (scriptsToTry + generic push)'));
  }

  const uncovered = rows.filter((row) => row.status !== 'PASS').map((row) => row.gameId);
  if (uncovered.length > 0) {
    console.log(warn(`games missing dedicated reflection coverage: ${uncovered.join(', ')}`));
  }

  if (blocking) {
    console.error('');
    console.error(fail('leaderboard reflection audit failed'));
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log(ok('leaderboard reflection audit passed'));
}

run();
