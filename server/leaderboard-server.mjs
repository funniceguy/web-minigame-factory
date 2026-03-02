import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'leaderboard-store.json');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY_SIZE = 128 * 1024;
const SAVE_DEBOUNCE_MS = 800;
const HEARTBEAT_MS = 25000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
const KST_RESET_HOUR = 9;
const STORE_VERSION = 2;
const MAX_PROGRESS_GAMES = 200;
const MAX_ITEM_STATS_PER_GAME = 200;
const MAX_ACHIEVEMENT_GAMES = 200;
const MAX_ACHIEVEMENTS_PER_GAME = 256;

const MIME_MAP = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8'
};

function toSafeScore(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function toSafeTimestamp(value, fallback = Date.now()) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
}

function clampTopLimit(limitCount) {
    const parsed = Number(limitCount);
    if (!Number.isFinite(parsed)) return 10;
    return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function sanitizeString(value, fallback, maxLength = 64) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    return raw.slice(0, maxLength);
}

function sanitizeId(value, fallback = '') {
    const base = sanitizeString(value, fallback, 96);
    if (!base) return '';
    return base.replace(/[^a-zA-Z0-9_\-:.]/g, '').slice(0, 96);
}

function sanitizeRank(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rank = Math.floor(parsed);
    return rank > 0 ? rank : null;
}

function sortObjectByKey(source = {}) {
    const sorted = {};
    Object.keys(source)
        .sort((a, b) => String(a).localeCompare(String(b), 'en'))
        .forEach((key) => {
            sorted[key] = source[key];
        });
    return sorted;
}

function hasMeaningfulGameProgress(gameProgress = {}) {
    if (!gameProgress || typeof gameProgress !== 'object') return false;
    if (toSafeScore(gameProgress.highScore) > 0) return true;
    if (sanitizeRank(gameProgress.bestRank) !== null) return true;
    if (toSafeScore(gameProgress.totalScore) > 0) return true;
    if (toSafeScore(gameProgress.playCount) > 0) return true;
    if (toSafeScore(gameProgress.bestLevel) > 1) return true;
    if (toSafeScore(gameProgress.bestStage) > 1) return true;
    if (toSafeScore(gameProgress.maxCombo) > 0) return true;
    if (toSafeScore(gameProgress.totalComboCount) > 0) return true;
    if (toSafeScore(gameProgress.totalStageClears) > 0) return true;
    if (toSafeScore(gameProgress.totalItemsCollected) > 0) return true;
    if (toSafeScore(gameProgress.lastSessionScore) > 0) return true;
    if (toSafeScore(gameProgress.totalPlayTime) > 0) return true;
    if (toSafeTimestamp(gameProgress.lastPlayed, 0) > 0) return true;
    return Object.keys(gameProgress.itemStats || {}).length > 0;
}

function sanitizeItemStats(source = {}) {
    if (!source || typeof source !== 'object') return {};

    const result = {};
    let count = 0;
    Object.entries(source).forEach(([rawItemId, rawCount]) => {
        if (count >= MAX_ITEM_STATS_PER_GAME) return;
        const itemId = sanitizeId(rawItemId);
        const itemCount = toSafeScore(rawCount);
        if (!itemId || itemCount <= 0) return;
        result[itemId] = itemCount;
        count += 1;
    });

    return sortObjectByKey(result);
}

function sanitizeGameProgress(rawGame = {}) {
    const safeGame = rawGame && typeof rawGame === 'object' ? rawGame : {};
    return {
        highScore: toSafeScore(safeGame.highScore),
        bestRank: sanitizeRank(safeGame.bestRank),
        totalScore: toSafeScore(safeGame.totalScore),
        playCount: toSafeScore(safeGame.playCount),
        bestLevel: Math.max(1, toSafeScore(safeGame.bestLevel || 1)),
        bestStage: Math.max(1, toSafeScore(safeGame.bestStage || 1)),
        maxCombo: toSafeScore(safeGame.maxCombo),
        totalComboCount: toSafeScore(safeGame.totalComboCount),
        totalStageClears: toSafeScore(safeGame.totalStageClears),
        totalItemsCollected: toSafeScore(safeGame.totalItemsCollected),
        itemStats: sanitizeItemStats(safeGame.itemStats),
        lastSessionScore: toSafeScore(safeGame.lastSessionScore),
        totalPlayTime: toSafeScore(safeGame.totalPlayTime),
        lastPlayed: toSafeTimestamp(safeGame.lastPlayed, 0)
    };
}

function sanitizeGamesProgress(sourceGames = {}, fallbackGameScores = {}) {
    const safeGames = sourceGames && typeof sourceGames === 'object' ? sourceGames : {};
    const safeFallbackScores = fallbackGameScores && typeof fallbackGameScores === 'object'
        ? fallbackGameScores
        : {};

    const result = {};
    let count = 0;

    Object.entries(safeGames).forEach(([rawGameId, rawGame]) => {
        if (count >= MAX_PROGRESS_GAMES) return;
        const gameId = sanitizeId(rawGameId);
        if (!gameId) return;
        const normalizedGame = sanitizeGameProgress(rawGame);
        if (!hasMeaningfulGameProgress(normalizedGame)) return;

        result[gameId] = normalizedGame;
        count += 1;
    });

    Object.entries(safeFallbackScores).forEach(([rawGameId, rawScore]) => {
        if (count >= MAX_PROGRESS_GAMES) return;
        const gameId = sanitizeId(rawGameId);
        const score = toSafeScore(rawScore);
        if (!gameId || score <= 0 || result[gameId]) return;

        result[gameId] = sanitizeGameProgress({
            highScore: score,
            totalScore: score,
            lastSessionScore: score
        });
        count += 1;
    });

    return sortObjectByKey(result);
}

function sanitizeAchievementsProgress(sourceAchievements = {}) {
    if (!sourceAchievements || typeof sourceAchievements !== 'object') return {};

    const result = {};
    let gameCount = 0;
    Object.entries(sourceAchievements).forEach(([rawGameId, rawAchievementIds]) => {
        if (gameCount >= MAX_ACHIEVEMENT_GAMES) return;

        const gameId = sanitizeId(rawGameId);
        if (!gameId || !Array.isArray(rawAchievementIds)) return;

        const uniqueAchievementIds = new Set();
        rawAchievementIds.forEach((rawAchievementId) => {
            if (uniqueAchievementIds.size >= MAX_ACHIEVEMENTS_PER_GAME) return;
            const achievementId = sanitizeId(rawAchievementId);
            if (!achievementId) return;
            uniqueAchievementIds.add(achievementId);
        });

        if (uniqueAchievementIds.size === 0) return;
        result[gameId] = Array.from(uniqueAchievementIds)
            .sort((a, b) => String(a).localeCompare(String(b), 'en'));
        gameCount += 1;
    });

    return sortObjectByKey(result);
}

function sanitizeProfileProgress(rawProfile = {}, fallbackProfile = {}, fallbackCreatedAt = Date.now()) {
    const safeProfile = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
    const safeFallback = fallbackProfile && typeof fallbackProfile === 'object' ? fallbackProfile : {};

    const createdAtSource = safeProfile.createdAt ?? safeFallback.createdAt;
    const createdAt = toSafeTimestamp(createdAtSource, toSafeTimestamp(fallbackCreatedAt, Date.now()));

    return {
        createdAt,
        totalPlayTime: Math.max(
            toSafeScore(safeProfile.totalPlayTime),
            toSafeScore(safeFallback.totalPlayTime)
        ),
        totalGamesPlayed: Math.max(
            toSafeScore(safeProfile.totalGamesPlayed),
            toSafeScore(safeFallback.totalGamesPlayed)
        ),
        totalScore: Math.max(
            toSafeScore(safeProfile.totalScore),
            toSafeScore(safeFallback.totalScore)
        )
    };
}

function sanitizeProgress(rawProgress = {}, options = {}) {
    const safeProgress = rawProgress && typeof rawProgress === 'object' ? rawProgress : {};
    const fallbackGameScores = options?.fallbackGameScores && typeof options.fallbackGameScores === 'object'
        ? options.fallbackGameScores
        : {};
    const fallbackProfile = options?.fallbackProfile && typeof options.fallbackProfile === 'object'
        ? options.fallbackProfile
        : {};
    const fallbackCreatedAt = options?.fallbackCreatedAt ?? Date.now();

    return {
        profile: sanitizeProfileProgress(safeProgress.profile, fallbackProfile, fallbackCreatedAt),
        games: sanitizeGamesProgress(safeProgress.games, fallbackGameScores),
        achievements: sanitizeAchievementsProgress(safeProgress.achievements)
    };
}

function mergeCreatedAt(localCreatedAt, incomingCreatedAt, fallback = Date.now()) {
    const safeLocal = toSafeTimestamp(localCreatedAt, 0);
    const safeIncoming = toSafeTimestamp(incomingCreatedAt, 0);
    if (safeLocal > 0 && safeIncoming > 0) {
        return Math.min(safeLocal, safeIncoming);
    }
    if (safeLocal > 0) return safeLocal;
    if (safeIncoming > 0) return safeIncoming;
    return toSafeTimestamp(fallback, Date.now());
}

function mergeProfileProgress(localProfile = {}, incomingProfile = {}) {
    const safeLocal = sanitizeProfileProgress(localProfile);
    const safeIncoming = sanitizeProfileProgress(incomingProfile);
    return {
        createdAt: mergeCreatedAt(safeLocal.createdAt, safeIncoming.createdAt),
        totalPlayTime: Math.max(safeLocal.totalPlayTime, safeIncoming.totalPlayTime),
        totalGamesPlayed: Math.max(safeLocal.totalGamesPlayed, safeIncoming.totalGamesPlayed),
        totalScore: Math.max(safeLocal.totalScore, safeIncoming.totalScore)
    };
}

function mergeBestRank(localRank, incomingRank) {
    const safeLocal = sanitizeRank(localRank);
    const safeIncoming = sanitizeRank(incomingRank);
    if (safeLocal && safeIncoming) return Math.min(safeLocal, safeIncoming);
    return safeLocal || safeIncoming || null;
}

function mergeItemStats(localStats = {}, incomingStats = {}) {
    const safeLocal = sanitizeItemStats(localStats);
    const safeIncoming = sanitizeItemStats(incomingStats);
    const merged = {};

    const itemIds = new Set([
        ...Object.keys(safeLocal),
        ...Object.keys(safeIncoming)
    ]);

    Array.from(itemIds)
        .sort((a, b) => String(a).localeCompare(String(b), 'en'))
        .slice(0, MAX_ITEM_STATS_PER_GAME)
        .forEach((itemId) => {
            const nextValue = Math.max(
                toSafeScore(safeLocal[itemId]),
                toSafeScore(safeIncoming[itemId])
            );
            if (nextValue > 0) {
                merged[itemId] = nextValue;
            }
        });

    return merged;
}

function mergeSingleGameProgress(localGame = {}, incomingGame = {}) {
    const safeLocal = sanitizeGameProgress(localGame);
    const safeIncoming = sanitizeGameProgress(incomingGame);

    const localLastPlayed = toSafeTimestamp(safeLocal.lastPlayed, 0);
    const incomingLastPlayed = toSafeTimestamp(safeIncoming.lastPlayed, 0);

    let lastSessionScore = 0;
    if (localLastPlayed > incomingLastPlayed) {
        lastSessionScore = toSafeScore(safeLocal.lastSessionScore);
    } else if (incomingLastPlayed > localLastPlayed) {
        lastSessionScore = toSafeScore(safeIncoming.lastSessionScore);
    } else {
        lastSessionScore = Math.max(
            toSafeScore(safeLocal.lastSessionScore),
            toSafeScore(safeIncoming.lastSessionScore)
        );
    }

    return {
        highScore: Math.max(safeLocal.highScore, safeIncoming.highScore),
        bestRank: mergeBestRank(safeLocal.bestRank, safeIncoming.bestRank),
        totalScore: Math.max(safeLocal.totalScore, safeIncoming.totalScore),
        playCount: Math.max(safeLocal.playCount, safeIncoming.playCount),
        bestLevel: Math.max(safeLocal.bestLevel, safeIncoming.bestLevel),
        bestStage: Math.max(safeLocal.bestStage, safeIncoming.bestStage),
        maxCombo: Math.max(safeLocal.maxCombo, safeIncoming.maxCombo),
        totalComboCount: Math.max(safeLocal.totalComboCount, safeIncoming.totalComboCount),
        totalStageClears: Math.max(safeLocal.totalStageClears, safeIncoming.totalStageClears),
        totalItemsCollected: Math.max(safeLocal.totalItemsCollected, safeIncoming.totalItemsCollected),
        itemStats: mergeItemStats(safeLocal.itemStats, safeIncoming.itemStats),
        lastSessionScore,
        totalPlayTime: Math.max(safeLocal.totalPlayTime, safeIncoming.totalPlayTime),
        lastPlayed: Math.max(localLastPlayed, incomingLastPlayed)
    };
}

function mergeGamesProgress(localGames = {}, incomingGames = {}) {
    const safeLocal = sanitizeGamesProgress(localGames);
    const safeIncoming = sanitizeGamesProgress(incomingGames);

    const merged = {};
    const gameIds = new Set([
        ...Object.keys(safeLocal),
        ...Object.keys(safeIncoming)
    ]);

    Array.from(gameIds)
        .sort((a, b) => String(a).localeCompare(String(b), 'en'))
        .slice(0, MAX_PROGRESS_GAMES)
        .forEach((gameId) => {
            const mergedGame = mergeSingleGameProgress(
                safeLocal[gameId] || {},
                safeIncoming[gameId] || {}
            );

            if (hasMeaningfulGameProgress(mergedGame)) {
                merged[gameId] = mergedGame;
            }
        });

    return merged;
}

function mergeAchievementsProgress(localAchievements = {}, incomingAchievements = {}) {
    const safeLocal = sanitizeAchievementsProgress(localAchievements);
    const safeIncoming = sanitizeAchievementsProgress(incomingAchievements);

    const merged = {};
    const gameIds = new Set([
        ...Object.keys(safeLocal),
        ...Object.keys(safeIncoming)
    ]);

    Array.from(gameIds)
        .sort((a, b) => String(a).localeCompare(String(b), 'en'))
        .slice(0, MAX_ACHIEVEMENT_GAMES)
        .forEach((gameId) => {
            const mergedSet = new Set([
                ...(safeLocal[gameId] || []),
                ...(safeIncoming[gameId] || [])
            ]);
            if (mergedSet.size === 0) return;
            merged[gameId] = Array.from(mergedSet)
                .sort((a, b) => String(a).localeCompare(String(b), 'en'))
                .slice(0, MAX_ACHIEVEMENTS_PER_GAME);
        });

    return merged;
}

function mergePlayerProgress(localProgress = {}, incomingProgress = {}, options = {}) {
    const safeLocal = sanitizeProgress(localProgress, {
        fallbackGameScores: options?.localFallbackGameScores,
        fallbackProfile: options?.localFallbackProfile,
        fallbackCreatedAt: options?.fallbackCreatedAt
    });
    const safeIncoming = sanitizeProgress(incomingProgress, {
        fallbackGameScores: options?.incomingFallbackGameScores,
        fallbackProfile: options?.incomingFallbackProfile,
        fallbackCreatedAt: options?.fallbackCreatedAt
    });

    return {
        profile: mergeProfileProgress(safeLocal.profile, safeIncoming.profile),
        games: mergeGamesProgress(safeLocal.games, safeIncoming.games),
        achievements: mergeAchievementsProgress(safeLocal.achievements, safeIncoming.achievements)
    };
}

function computeKstSeasonWindow(nowMs = Date.now()) {
    const kstNowMs = nowMs + KST_OFFSET_MS;
    const kstNow = new Date(kstNowMs);
    const startOfTodayKstMs = Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate(),
        0, 0, 0, 0
    );

    const dayOfWeek = kstNow.getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    let seasonStartKstMs = startOfTodayKstMs - (daysSinceMonday * DAY_MS) + (KST_RESET_HOUR * HOUR_MS);

    if (kstNowMs < seasonStartKstMs) {
        seasonStartKstMs -= WEEK_MS;
    }

    const seasonEndKstMs = seasonStartKstMs + WEEK_MS;
    const seasonStartUtcMs = seasonStartKstMs - KST_OFFSET_MS;
    const seasonEndUtcMs = seasonEndKstMs - KST_OFFSET_MS;
    const seasonId = `kst-week-${new Date(seasonStartKstMs).toISOString().slice(0, 10)}`;

    return {
        id: seasonId,
        startAt: seasonStartUtcMs,
        endAt: seasonEndUtcMs,
        timezone: 'Asia/Seoul',
        resetRule: 'weekly Monday 09:00 KST'
    };
}

function createEmptyState(nowMs = Date.now()) {
    return {
        version: STORE_VERSION,
        revision: 1,
        updatedAt: nowMs,
        season: computeKstSeasonWindow(nowMs),
        players: {}
    };
}

class LeaderboardStore {
    constructor(filePath) {
        this.filePath = filePath;
        this.state = createEmptyState();
        this.persistTimer = null;
        this.overallCache = null;
        this.gameCacheMap = new Map();
        this.subscribers = new Set();
    }

    async load() {
        await mkdir(path.dirname(this.filePath), { recursive: true });

        try {
            const raw = await readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            this.state = this.normalizeState(parsed);
        } catch (_error) {
            this.state = createEmptyState();
        }

        this.ensureActiveSeason();
        this.invalidateRankingCache();
    }

    normalizeState(raw = {}) {
        const fallback = createEmptyState();
        const sourcePlayers = raw?.players && typeof raw.players === 'object'
            ? raw.players
            : {};
        const normalizedPlayers = {};

        Object.entries(sourcePlayers).forEach(([rawUid, rawPlayer]) => {
            const uid = sanitizeId(rawUid);
            if (!uid || !rawPlayer || typeof rawPlayer !== 'object') return;

            const sourceGameScores = rawPlayer?.gameScores && typeof rawPlayer.gameScores === 'object'
                ? rawPlayer.gameScores
                : {};
            const gameScores = {};
            Object.entries(sourceGameScores).forEach(([rawGameId, rawScore]) => {
                const gameId = sanitizeId(rawGameId);
                const score = toSafeScore(rawScore);
                if (!gameId || score <= 0) return;
                gameScores[gameId] = score;
            });

            const legacyTotalScore = Object.values(gameScores).reduce((sum, score) => sum + toSafeScore(score), 0);
            const progress = sanitizeProgress(rawPlayer.progress, {
                fallbackGameScores: gameScores,
                fallbackProfile: {
                    createdAt: rawPlayer?.createdAt,
                    totalScore: legacyTotalScore
                },
                fallbackCreatedAt: toSafeTimestamp(rawPlayer.updatedAt, Date.now())
            });

            normalizedPlayers[uid] = {
                uid,
                nickname: sanitizeString(rawPlayer.nickname, 'Player', 32),
                avatar: sanitizeString(rawPlayer.avatar, 'default', 32),
                updatedAt: toSafeTimestamp(rawPlayer.updatedAt),
                gameScores,
                overallScore: legacyTotalScore,
                progress
            };
        });

        const season = {
            ...fallback.season,
            ...(raw?.season || {})
        };

        return {
            version: STORE_VERSION,
            revision: Math.max(1, Math.floor(Number(raw?.revision || 1))),
            updatedAt: toSafeTimestamp(raw?.updatedAt, fallback.updatedAt),
            season: {
                id: sanitizeString(season.id, fallback.season.id, 64),
                startAt: toSafeTimestamp(season.startAt, fallback.season.startAt),
                endAt: toSafeTimestamp(season.endAt, fallback.season.endAt),
                timezone: 'Asia/Seoul',
                resetRule: 'weekly Monday 09:00 KST'
            },
            players: normalizedPlayers
        };
    }

    ensureActiveSeason() {
        const latestSeason = computeKstSeasonWindow(Date.now());
        if (this.state?.season?.id === latestSeason.id) return false;

        this.state = {
            version: STORE_VERSION,
            revision: (Number(this.state?.revision) || 1) + 1,
            updatedAt: Date.now(),
            season: latestSeason,
            players: {}
        };
        this.invalidateRankingCache();
        this.schedulePersist();
        this.notifySubscribers();
        return true;
    }

    invalidateRankingCache() {
        this.overallCache = null;
        this.gameCacheMap.clear();
    }

    schedulePersist() {
        if (this.persistTimer) return;
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            this.persistNow().catch((error) => {
                console.warn('[leaderboard] failed to persist store:', error);
            });
        }, SAVE_DEBOUNCE_MS);
    }

    async persistNow() {
        const tempFile = `${this.filePath}.tmp`;
        await writeFile(tempFile, JSON.stringify(this.state), 'utf8');
        await rename(tempFile, this.filePath);
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this.subscribers.add(listener);
        return () => this.subscribers.delete(listener);
    }

    notifySubscribers() {
        const payload = {
            revision: Number(this.state?.revision || 1),
            season: this.state?.season || null,
            updatedAt: Date.now()
        };
        this.subscribers.forEach((listener) => {
            try {
                listener(payload);
            } catch (error) {
                console.warn('[leaderboard] subscriber failed:', error);
            }
        });
    }

    syncPlayer({ playerId, nickname, avatar, gameScores, progress }) {
        this.ensureActiveSeason();

        const uid = sanitizeId(playerId);
        if (!uid) {
            const error = new Error('invalid-player-id');
            error.statusCode = 400;
            throw error;
        }

        const safeNickname = sanitizeString(nickname, 'Player', 32);
        const safeAvatar = sanitizeString(avatar, 'default', 32);
        const sourceGameScores = gameScores && typeof gameScores === 'object'
            ? gameScores
            : {};

        const existing = this.state.players[uid] || {
            uid,
            nickname: safeNickname,
            avatar: safeAvatar,
            updatedAt: Date.now(),
            gameScores: {},
            overallScore: 0,
            progress: sanitizeProgress(null, {
                fallbackCreatedAt: Date.now()
            })
        };

        let hasMeaningfulChange = false;
        const nextGameScores = { ...existing.gameScores };

        Object.entries(sourceGameScores).forEach(([rawGameId, rawScore]) => {
            const gameId = sanitizeId(rawGameId);
            const score = toSafeScore(rawScore);
            if (!gameId || score <= 0) return;

            const previous = toSafeScore(nextGameScores[gameId]);
            if (score > previous) {
                nextGameScores[gameId] = score;
                hasMeaningfulChange = true;
            }
        });

        if (existing.nickname !== safeNickname || existing.avatar !== safeAvatar) {
            hasMeaningfulChange = true;
        }

        const overallScore = Object.values(nextGameScores).reduce((sum, score) => sum + toSafeScore(score), 0);
        if (overallScore !== existing.overallScore) {
            hasMeaningfulChange = true;
        }

        const nextProgress = mergePlayerProgress(existing.progress, progress, {
            localFallbackGameScores: existing.gameScores,
            incomingFallbackGameScores: sourceGameScores,
            localFallbackProfile: {
                createdAt: existing?.progress?.profile?.createdAt ?? existing.updatedAt,
                totalScore: existing.overallScore
            },
            incomingFallbackProfile: {
                createdAt: Date.now(),
                totalScore: overallScore
            },
            fallbackCreatedAt: Date.now()
        });
        const normalizedExistingProgress = sanitizeProgress(existing.progress, {
            fallbackGameScores: existing.gameScores,
            fallbackProfile: {
                createdAt: existing?.progress?.profile?.createdAt ?? existing.updatedAt,
                totalScore: existing.overallScore
            },
            fallbackCreatedAt: Date.now()
        });
        if (JSON.stringify(normalizedExistingProgress) !== JSON.stringify(nextProgress)) {
            hasMeaningfulChange = true;
        }

        this.state.players[uid] = {
            uid,
            nickname: safeNickname,
            avatar: safeAvatar,
            updatedAt: Date.now(),
            gameScores: nextGameScores,
            overallScore,
            progress: nextProgress
        };

        if (hasMeaningfulChange) {
            this.state.revision += 1;
            this.state.updatedAt = Date.now();
            this.invalidateRankingCache();
            this.schedulePersist();
            this.notifySubscribers();
        }

        return {
            playerId: uid,
            overallScore,
            progress: nextProgress,
            hasMeaningfulChange,
            season: this.state.season,
            revision: this.state.revision
        };
    }

    compareEntry(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
        return String(a.uid).localeCompare(String(b.uid), 'en');
    }

    buildOverallCache() {
        if (this.overallCache && this.overallCache.revision === this.state.revision) {
            return this.overallCache;
        }

        const entries = Object.values(this.state.players)
            .map((player) => ({
                uid: player.uid,
                nickname: player.nickname,
                avatar: player.avatar,
                score: toSafeScore(player.overallScore),
                updatedAt: toSafeTimestamp(player.updatedAt)
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => this.compareEntry(a, b))
            .map((entry, index) => ({
                rank: index + 1,
                uid: entry.uid,
                nickname: entry.nickname,
                avatar: entry.avatar,
                score: entry.score
            }));

        const rankByPlayer = new Map(entries.map((entry) => [entry.uid, entry]));
        this.overallCache = {
            revision: this.state.revision,
            entries,
            rankByPlayer
        };
        return this.overallCache;
    }

    buildGameCache(gameId) {
        const normalizedGameId = sanitizeId(gameId);
        if (!normalizedGameId) {
            return { revision: this.state.revision, entries: [], rankByPlayer: new Map() };
        }

        const cached = this.gameCacheMap.get(normalizedGameId);
        if (cached && cached.revision === this.state.revision) {
            return cached;
        }

        const entries = Object.values(this.state.players)
            .map((player) => ({
                uid: player.uid,
                nickname: player.nickname,
                avatar: player.avatar,
                score: toSafeScore(player?.gameScores?.[normalizedGameId]),
                updatedAt: toSafeTimestamp(player.updatedAt)
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => this.compareEntry(a, b))
            .map((entry, index) => ({
                rank: index + 1,
                uid: entry.uid,
                nickname: entry.nickname,
                avatar: entry.avatar,
                score: entry.score
            }));

        const rankByPlayer = new Map(entries.map((entry) => [entry.uid, entry]));
        const next = {
            revision: this.state.revision,
            entries,
            rankByPlayer
        };
        this.gameCacheMap.set(normalizedGameId, next);
        return next;
    }

    getSnapshot({ gameIds, playerId, topLimit }) {
        this.ensureActiveSeason();

        const limit = clampTopLimit(topLimit);
        const safePlayerId = sanitizeId(playerId);
        const overall = this.buildOverallCache();
        const myOverall = safePlayerId ? (overall.rankByPlayer.get(safePlayerId) || null) : null;

        const normalizedGameIds = Array.from(new Set((gameIds || []).map((id) => sanitizeId(id)).filter(Boolean)));
        const games = {};

        normalizedGameIds.forEach((gameId) => {
            const ranking = this.buildGameCache(gameId);
            games[gameId] = {
                top: ranking.entries.slice(0, limit),
                my: safePlayerId ? (ranking.rankByPlayer.get(safePlayerId) || null) : null
            };
        });

        return {
            enabled: true,
            season: this.state.season,
            revision: this.state.revision,
            generatedAt: Date.now(),
            overallTop: overall.entries.slice(0, limit),
            myOverall,
            games
        };
    }
}

const store = new LeaderboardStore(DATA_FILE);
await store.load();

const sseClients = new Set();
const unsubscribeStore = store.subscribe((payload) => {
    const frame = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach((client) => {
        try {
            client.write(frame);
        } catch (_error) {
            // closed socket; will be cleaned up by close event
        }
    });
});

const heartbeatTimer = setInterval(() => {
    const line = `: ping ${Date.now()}\n\n`;
    sseClients.forEach((client) => {
        try {
            client.write(line);
        } catch (_error) {
            // ignore
        }
    });
}, HEARTBEAT_MS);

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
}

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

async function readJsonBody(req) {
    const chunks = [];
    let received = 0;

    for await (const chunk of req) {
        received += chunk.length;
        if (received > MAX_BODY_SIZE) {
            const error = new Error('request-body-too-large');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};

    try {
        return JSON.parse(raw);
    } catch (_error) {
        const parseError = new Error('invalid-json');
        parseError.statusCode = 400;
        throw parseError;
    }
}

function parseGameIds(raw) {
    if (Array.isArray(raw)) return raw.map((value) => String(value || '').trim()).filter(Boolean);
    if (typeof raw !== 'string') return [];
    return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

async function handleApiRequest(req, res, url) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, {
            ok: true,
            revision: store.state.revision,
            season: store.state.season,
            updatedAt: store.state.updatedAt
        });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/leaderboard/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        });
        res.write(`event: ready\ndata: ${JSON.stringify({
            revision: store.state.revision,
            season: store.state.season,
            updatedAt: Date.now()
        })}\n\n`);

        sseClients.add(res);
        req.on('close', () => {
            sseClients.delete(res);
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/leaderboard/sync') {
        const payload = await readJsonBody(req);
        const result = store.syncPlayer({
            playerId: payload?.playerId,
            nickname: payload?.nickname,
            avatar: payload?.avatar,
            gameScores: payload?.gameScores,
            progress: payload?.progress
        });

        sendJson(res, 200, {
            ok: true,
            enabled: true,
            revision: result.revision,
            season: result.season,
            player: {
                uid: result.playerId,
                overallScore: result.overallScore,
                progress: result.progress
            }
        });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/leaderboard/snapshot') {
        const snapshot = store.getSnapshot({
            gameIds: parseGameIds(url.searchParams.get('gameIds')),
            playerId: url.searchParams.get('playerId'),
            topLimit: url.searchParams.get('topLimit')
        });
        sendJson(res, 200, snapshot);
        return;
    }

    sendJson(res, 404, { error: 'not-found' });
}

function resolveStaticFile(urlPathname) {
    const decodedPath = decodeURIComponent(urlPathname || '/');
    const requested = decodedPath === '/' ? '/index.html' : decodedPath;
    const absolutePath = path.resolve(PROJECT_ROOT, `.${requested}`);

    if (!absolutePath.startsWith(PROJECT_ROOT)) {
        return null;
    }

    return absolutePath;
}

async function handleStaticRequest(_req, res, url) {
    const filePath = resolveStaticFile(url.pathname);
    if (!filePath) {
        sendJson(res, 403, { error: 'forbidden' });
        return;
    }

    let finalFilePath = filePath;
    try {
        const fileStat = await stat(finalFilePath);
        if (fileStat.isDirectory()) {
            finalFilePath = path.join(finalFilePath, 'index.html');
        }
    } catch (_error) {
        sendJson(res, 404, { error: 'not-found' });
        return;
    }

    try {
        await stat(finalFilePath);
    } catch (_error) {
        sendJson(res, 404, { error: 'not-found' });
        return;
    }

    const ext = path.extname(finalFilePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    const cacheControl = ext === '.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable';

    res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl
    });
    createReadStream(finalFilePath).pipe(res);
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    try {
        if (url.pathname.startsWith('/api/')) {
            await handleApiRequest(req, res, url);
            return;
        }

        await handleStaticRequest(req, res, url);
    } catch (error) {
        console.error('[server] request failed:', error);
        const statusCode = Number(error?.statusCode) || 500;
        sendJson(res, statusCode, { error: error?.message || 'internal-error' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[server] running on http://${HOST}:${PORT}`);
    console.log(`[server] leaderboard season ${store.state.season.id}, revision ${store.state.revision}`);
});

function gracefulShutdown() {
    clearInterval(heartbeatTimer);
    unsubscribeStore();
    sseClients.forEach((client) => {
        try {
            client.end();
        } catch (_error) {
            // ignore
        }
    });

    if (store.persistTimer) {
        clearTimeout(store.persistTimer);
        store.persistTimer = null;
    }

    store.persistNow()
        .catch((error) => {
            console.warn('[server] failed final persist:', error);
        })
        .finally(() => {
            server.close(() => process.exit(0));
        });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
