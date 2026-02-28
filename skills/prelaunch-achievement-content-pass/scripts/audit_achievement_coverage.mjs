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

function toGameIdFromPath(rawPath) {
  const fileName = path.basename(String(rawPath || ''));
  const stem = fileName.replace(/\.html$/i, '');
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function color(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

const ok = (text) => color(`OK   ${text}`, 32);
const warn = (text) => color(`WARN ${text}`, 33);
const fail = (text) => color(`FAIL ${text}`, 31);

function extractAchievementBlocks(sourceText) {
  const result = new Map();
  const re = /this\.register\('([^']+)'\s*,\s*\[([\s\S]*?)\]\);/g;
  for (const match of sourceText.matchAll(re)) {
    const gameId = match[1];
    const block = match[2];
    const ids = [...block.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
    const metrics = [...block.matchAll(/metric:\s*'([^']+)'/g)].map((m) => m[1]);
    result.set(gameId, { ids, metrics });
  }
  return result;
}

function run() {
  const registry = JSON.parse(readText('src/html/registry.json'));
  const registryGames = (registry?.games || []).map((entry) => toGameIdFromPath(entry?.path));
  const uniqueRegistryGames = Array.from(new Set(registryGames.filter(Boolean)));

  const achievementSource = readText('src/platform/AchievementSystem.js');
  const blocks = extractAchievementBlocks(achievementSource);

  let blocking = false;

  console.log(`[achievement-coverage-audit] games=${uniqueRegistryGames.length}`);
  console.log('');

  const missingDefinitions = uniqueRegistryGames.filter((gameId) => !blocks.has(gameId));
  if (missingDefinitions.length > 0) {
    blocking = true;
    console.log(fail(`missing achievement packs: ${missingDefinitions.join(', ')}`));
  } else {
    console.log(ok('all registered games have achievement packs'));
  }

  for (const gameId of uniqueRegistryGames) {
    const block = blocks.get(gameId);
    if (!block) continue;

    const idCount = block.ids.length;
    const metricSet = new Set(block.metrics);

    const hasPlay = metricSet.has('playCount');
    const hasHighScore = metricSet.has('highScore');
    const hasTotalScore = metricSet.has('totalScore');
    const hasProgression = metricSet.has('totalStageClears')
      || metricSet.has('bestStage')
      || metricSet.has('bestLevel');

    const weakPack = idCount < 8 || !hasPlay || !hasHighScore || !hasTotalScore || !hasProgression;
    if (weakPack) blocking = true;

    const prefix = weakPack ? fail(`pack ${gameId}`) : ok(`pack ${gameId}`);
    console.log(
      `${prefix} count=${idCount} play=${hasPlay} highScore=${hasHighScore} totalScore=${hasTotalScore} progression=${hasProgression}`
    );
  }

  const unknownPacks = [...blocks.keys()].filter((gameId) => !uniqueRegistryGames.includes(gameId));
  if (unknownPacks.length > 0) {
    console.log(warn(`achievement packs not in current html registry: ${unknownPacks.join(', ')}`));
  }

  const duplicateIds = [];
  const seenIds = new Set();
  for (const [gameId, block] of blocks.entries()) {
    for (const id of block.ids) {
      const key = `${gameId}:${id}`;
      if (seenIds.has(key)) duplicateIds.push(key);
      seenIds.add(key);
    }
  }
  if (duplicateIds.length > 0) {
    blocking = true;
    console.log(fail(`duplicate achievement ids in same game: ${duplicateIds.join(', ')}`));
  } else {
    console.log(ok('no duplicate achievement ids detected'));
  }

  if (blocking) {
    console.log('');
    console.error(fail('achievement coverage audit failed'));
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log(ok('achievement coverage audit passed'));
}

run();
