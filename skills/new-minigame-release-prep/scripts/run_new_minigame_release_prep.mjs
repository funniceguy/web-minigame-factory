import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

function color(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

const ok = (text) => color(`OK   ${text}`, 32);
const warn = (text) => color(`WARN ${text}`, 33);
const fail = (text) => color(`FAIL ${text}`, 31);

function normalizeRegistryPath(rawPath) {
  if (!rawPath) return '';
  let p = String(rawPath).replace(/\\/g, '/').trim();
  if (!p) return '';
  if (p.startsWith('./')) p = p.slice(2);
  if (!p.startsWith('/')) {
    if (p.startsWith('src/')) p = `/${p}`;
    else p = `/src/html/${p}`;
  }
  return p;
}

function toGameId(rawPath) {
  const file = path.basename(String(rawPath || '')).replace(/\.html$/i, '');
  return file
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveGameInput(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return { gameArg: '', gameIdArg: '' };
  }

  const normalized = value.replace(/\\/g, '/');
  const looksLikePath = normalized.includes('/')
    || normalized.startsWith('.')
    || normalized.toLowerCase().endsWith('.html');

  if (looksLikePath) {
    return {
      gameArg: normalizeRegistryPath(value),
      gameIdArg: ''
    };
  }

  return {
    gameArg: '',
    gameIdArg: toGameId(value)
  };
}

function toAbsFromRegistryPath(registryPath) {
  const rel = String(registryPath || '').replace(/^\/+/, '').replace(/\//g, path.sep);
  return path.join(rootDir, rel);
}

function runCommand(label, command) {
  console.log(`\n[cmd] ${label}`);
  console.log(`  $ ${command}`);
  const result = spawnSync(command, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true
  });
  return result.status === 0;
}

function readText(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

function extractFallbackKeys(gameHubText) {
  const start = gameHubText.indexOf('const fallbackByGame = {');
  const end = gameHubText.indexOf('const genericFallbackScript =');
  if (start < 0 || end < 0 || end <= start) return new Set();
  const block = gameHubText.slice(start, end);
  const set = new Set();
  for (const m of block.matchAll(/'([^']+)'\s*:\s*`/g)) {
    set.add(m[1]);
  }
  return set;
}

function hasBridge(htmlText) {
  const hasSnapshot = /__mgpSnapshot/.test(htmlText);
  const hasSource = /source:\s*['"]mgp-game['"]/.test(htmlText);
  const hasResultType = /type:\s*['"]result['"]/.test(htmlText);
  const hasPostMessage = /postMessage\s*\(/.test(htmlText);
  return hasSnapshot && hasSource && hasResultType && hasPostMessage;
}

function extractAchievementGameIds(text) {
  return new Set([...text.matchAll(/this\.register\('([^']+)'\s*,\s*\[/g)].map((m) => m[1]));
}

function extractAchievementMetrics(text) {
  return [...text.matchAll(/metric:\s*'([^']+)'/g)].map((m) => m[1]);
}

function ensureReportsDir() {
  const reportsDir = path.join(rootDir, 'skills/new-minigame-release-prep/reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const fromGame = resolveGameInput(args.game);
  const gameArg = fromGame.gameArg;
  const gameIdArg = args['game-id']
    ? toGameId(String(args['game-id']).trim())
    : fromGame.gameIdArg;

  if (!gameArg && !gameIdArg) {
    console.error('Usage: node skills/new-minigame-release-prep/scripts/run_new_minigame_release_prep.mjs --game src/html/<file>.html');
    console.error('   or: node skills/new-minigame-release-prep/scripts/run_new_minigame_release_prep.mjs --game-id <id>');
    process.exitCode = 1;
    return;
  }

  const syncOk = runCommand('sync game registries', 'npm.cmd run sync:games');

  const registry = JSON.parse(readText('src/html/registry.json'));
  const registryGames = Array.isArray(registry?.games) ? registry.games : [];
  const entries = registryGames
    .map((entry) => ({ path: normalizeRegistryPath(entry?.path), id: toGameId(entry?.path || '') }))
    .filter((entry) => entry.path && entry.id);

  const target = gameArg
    ? entries.find((entry) => entry.path === gameArg)
    : entries.find((entry) => entry.id === gameIdArg);

  const targetPath = target?.path || gameArg || '';
  const targetId = target?.id || gameIdArg || toGameId(targetPath);
  const targetAbsPath = targetPath ? toAbsFromRegistryPath(targetPath) : '';
  const targetExists = targetPath ? fs.existsSync(targetAbsPath) : false;
  const inRegistry = Boolean(target);

  const targetHtml = targetExists ? fs.readFileSync(targetAbsPath, 'utf8') : '';
  const bridge = targetHtml ? hasBridge(targetHtml) : false;

  const gameHubText = readText('src/platform/GameHub.js');
  const fallbackKeys = extractFallbackKeys(gameHubText);
  const fallback = fallbackKeys.has(targetId);
  const dedicatedCoverage = bridge || fallback;

  const achievementText = readText('src/platform/AchievementSystem.js');
  const achievementGameIds = extractAchievementGameIds(achievementText);
  const hasAchievementPack = achievementGameIds.has(targetId);

  const bridgeGames = entries.filter((entry) => {
    const abs = toAbsFromRegistryPath(entry.path);
    if (!fs.existsSync(abs)) return false;
    try {
      return hasBridge(fs.readFileSync(abs, 'utf8'));
    } catch (_error) {
      return false;
    }
  }).map((entry) => entry.id);

  const metrics = extractAchievementMetrics(achievementText);
  const uniqueItemMetrics = Array.from(new Set(metrics.filter((metric) => metric.startsWith('item.')))).sort();

  const leaderboardAuditOk = runCommand(
    'leaderboard reflection audit',
    'node skills/leaderboard-reflection-hardening/scripts/audit_leaderboard_reflection.mjs'
  );
  const achievementAuditOk = runCommand(
    'achievement coverage audit',
    'node skills/prelaunch-achievement-content-pass/scripts/audit_achievement_coverage.mjs'
  );

  const report = {
    generatedAt: new Date().toISOString(),
    target: {
      id: targetId,
      path: targetPath || null,
      exists: targetExists,
      inRegistry
    },
    checks: {
      syncOk,
      bridge,
      fallback,
      dedicatedCoverage,
      hasAchievementPack,
      leaderboardAuditOk,
      achievementAuditOk
    },
    patternSummary: {
      bridgeGameIds: bridgeGames,
      fallbackGameIds: Array.from(fallbackKeys).sort(),
      itemMetricPatterns: uniqueItemMetrics
    }
  };

  const reportsDir = ensureReportsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportName = `${targetId || 'unknown'}-${stamp}.json`;
  const reportPath = path.join(reportsDir, reportName);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n[target]');
  console.log(`  id: ${targetId}`);
  console.log(`  path: ${targetPath || '(unresolved)'}`);

  console.log('\n[status]');
  console.log(`  ${syncOk ? ok('registry sync passed') : fail('registry sync failed')}`);
  console.log(`  ${inRegistry ? ok('target is in registry') : fail('target is not in registry')}`);
  console.log(`  ${targetExists ? ok('target file exists') : fail('target file missing')}`);
  console.log(`  ${bridge ? ok('bridge present') : warn('bridge missing')}`);
  console.log(`  ${fallback ? ok('dedicated fallback present') : warn('dedicated fallback missing')}`);
  console.log(`  ${dedicatedCoverage ? ok('score reflection coverage present') : fail('score reflection coverage missing')}`);
  console.log(`  ${hasAchievementPack ? ok('achievement pack present') : fail('achievement pack missing')}`);
  console.log(`  ${leaderboardAuditOk ? ok('leaderboard audit passed') : fail('leaderboard audit failed')}`);
  console.log(`  ${achievementAuditOk ? ok('achievement audit passed') : fail('achievement audit failed')}`);

  console.log('\n[pattern summary]');
  console.log(`  bridge games: ${bridgeGames.length ? bridgeGames.join(', ') : '-'}`);
  console.log(`  item metric patterns: ${uniqueItemMetrics.length ? uniqueItemMetrics.join(', ') : '-'}`);
  console.log(`  report: ${path.relative(rootDir, reportPath).replace(/\\/g, '/')}`);

  const blocking = !syncOk || !inRegistry || !targetExists || !dedicatedCoverage || !hasAchievementPack;
  if (!hasAchievementPack) {
    console.log('\n[next]');
    console.log(`  node skills/new-minigame-release-prep/scripts/generate_achievement_pack_template.mjs --game-id ${targetId}`);
  }

  if (blocking) {
    console.error(`\n${fail('new minigame release prep failed (blocking issues found)')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${ok('new minigame release prep passed')}`);
}

run();
