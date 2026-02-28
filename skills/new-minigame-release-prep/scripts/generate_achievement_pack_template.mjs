import path from 'node:path';

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

function toGameId(raw) {
  if (!raw) return '';
  const file = path.basename(String(raw)).replace(/\.html$/i, '');
  return file
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makePrefix(gameId) {
  const compact = gameId.replace(/-/g, '');
  return compact.slice(0, 4) || 'game';
}

function createPack(gameId) {
  const prefix = makePrefix(gameId);
  return `this.register('${gameId}', [
    { id: '${prefix}_play_1', name: 'First Run', desc: 'Play 1 time', icon: '*', points: 5, metric: 'playCount', threshold: 1 },
    { id: '${prefix}_play_10', name: 'Routine', desc: 'Play 10 times', icon: '*', points: 12, metric: 'playCount', threshold: 10 },
    { id: '${prefix}_high_5000', name: 'Score Spark', desc: 'High score 5,000', icon: '*', points: 12, metric: 'highScore', threshold: 5000 },
    { id: '${prefix}_high_20000', name: 'Score Surge', desc: 'High score 20,000', icon: '*', points: 24, metric: 'highScore', threshold: 20000 },
    { id: '${prefix}_best_stage_5', name: 'Stage Push', desc: 'Best stage 5', icon: '*', points: 18, metric: 'bestStage', threshold: 5 },
    { id: '${prefix}_stage_total_25', name: 'Stage Worker', desc: 'Total stage clears 25', icon: '*', points: 20, metric: 'totalStageClears', threshold: 25 },
    { id: '${prefix}_score_total_100000', name: 'Score Ledger', desc: 'Total score 100,000', icon: '*', points: 28, metric: 'totalScore', threshold: 100000 },
    { id: '${prefix}_items_total_40', name: 'Collector', desc: 'Collect items 40 times', icon: '*', points: 20, metric: 'totalItemsCollected', threshold: 40 }
]);`;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const gameId = args['game-id'] || toGameId(args.game);
  if (!gameId) {
    console.error('Usage: node skills/new-minigame-release-prep/scripts/generate_achievement_pack_template.mjs --game-id <id>');
    console.error('   or: node skills/new-minigame-release-prep/scripts/generate_achievement_pack_template.mjs --game src/html/<file>.html');
    process.exitCode = 1;
    return;
  }

  console.log(`[achievement-template] gameId=${gameId}`);
  console.log('');
  console.log(createPack(gameId));
}

run();
