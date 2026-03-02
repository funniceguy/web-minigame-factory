const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const baseUrl = (process.argv[2] || DEFAULT_BASE_URL).replace(/\/+$/, '');

function color(value, code) {
    return `\x1b[${code}m${value}\x1b[0m`;
}

function ok(text) {
    return color(`OK   ${text}`, 32);
}

function warn(text) {
    return color(`WARN ${text}`, 33);
}

function fail(text) {
    return color(`FAIL ${text}`, 31);
}

async function requestJson(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    const text = await response.text();
    let data = {};

    try {
        data = text ? JSON.parse(text) : {};
    } catch (_error) {
        const snippet = String(text || '').slice(0, 120).replace(/\s+/g, ' ');
        throw new Error(`${response.status} non-json response from ${pathname}: ${snippet}`);
    }

    if (!response.ok) {
        throw new Error(`${response.status} ${data?.error || response.statusText}`);
    }
    return data;
}

async function checkHealth() {
    const health = await requestJson('/api/health');
    if (!health?.ok) throw new Error('health response missing ok=true');
    console.log(ok(`health revision=${health.revision}, season=${health?.season?.id || '-'}`));
    return health;
}

async function checkSyncAndSnapshot() {
    const playerId = `check-${Date.now()}`;
    const nickname = 'Checker';

    // Compatibility check: sync without progress payload.
    await requestJson('/api/leaderboard/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            playerId,
            nickname,
            avatar: 'default',
            gameScores: {
                'neon-block': 1234,
                'neon-survivor': 5678
            }
        })
    });

    // New payload check: sync with cloud progress payload.
    const syncWithProgress = await requestJson('/api/leaderboard/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            playerId,
            nickname,
            avatar: 'default',
            gameScores: {
                'neon-block': 2234,
                'neon-survivor': 6678
            },
            progress: {
                profile: {
                    createdAt: Date.now() - 1000,
                    totalPlayTime: 360,
                    totalGamesPlayed: 12,
                    totalScore: 8900
                },
                games: {
                    'neon-block': {
                        highScore: 2234,
                        bestRank: 2,
                        totalScore: 8000,
                        playCount: 10,
                        bestLevel: 7,
                        bestStage: 7,
                        maxCombo: 15,
                        totalComboCount: 80,
                        totalStageClears: 20,
                        totalItemsCollected: 45,
                        itemStats: {
                            multiball: 5
                        },
                        lastSessionScore: 2234,
                        totalPlayTime: 120,
                        lastPlayed: Date.now()
                    }
                },
                achievements: {
                    'neon-block': ['nb_play_1', 'nb_score_3000']
                }
            }
        })
    });

    if (!syncWithProgress?.player?.progress?.profile) {
        throw new Error('sync response missing player.progress.profile');
    }

    const snapshot = await requestJson(
        `/api/leaderboard/snapshot?playerId=${encodeURIComponent(playerId)}&gameIds=neon-block,neon-survivor&topLimit=5`
    );

    if (!snapshot?.enabled) throw new Error('snapshot enabled=false');
    if (!snapshot?.myOverall || !Number.isFinite(Number(snapshot.myOverall.rank))) {
        throw new Error('snapshot missing myOverall.rank');
    }

    console.log(ok(`snapshot myOverall.rank=${snapshot.myOverall.rank}, overallTop=${snapshot?.overallTop?.length || 0}`));
}

async function checkSseHandshake() {
    const response = await fetch(`${baseUrl}/api/leaderboard/events`);
    if (!response.ok || !response.body) {
        throw new Error(`SSE open failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const first = await Promise.race([
        reader.read(),
        new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 3000))
    ]);

    if (first?.timeout) {
        throw new Error('SSE first frame timeout');
    }

    const chunk = decoder.decode(first.value || new Uint8Array());
    const hasReady = chunk.includes('event: ready');
    if (!hasReady) {
        console.log(warn('SSE opened but ready event was not detected in first chunk'));
    } else {
        console.log(ok('SSE ready event detected'));
    }

    try {
        await reader.cancel();
    } catch (_error) {
        // ignore
    }
}

async function run() {
    console.log(`[check-leaderboard] base URL: ${baseUrl}`);
    await checkHealth();
    await checkSyncAndSnapshot();
    await checkSseHandshake();
    console.log(ok('leaderboard API check passed'));
}

run().catch((error) => {
    console.error(fail(`[check-leaderboard] ${error.message}`));
    process.exitCode = 1;
});
