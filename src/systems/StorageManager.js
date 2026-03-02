/**
 * StorageManager - Local storage wrapper with profile and game data
 */
const SEASONAL_RANKING_KEY = 'seasonal_ranking_v1';
const KST_HOUR_MS = 60 * 60 * 1000;
const KST_DAY_MS = 24 * KST_HOUR_MS;
const KST_WEEK_MS = 7 * KST_DAY_MS;
const KST_OFFSET_MS = 9 * KST_HOUR_MS;
const KST_RESET_HOUR = 9;
const LEGACY_ACHIEVEMENT_ID_MAP = Object.freeze({
    'neon-slotmachine': Object.freeze({
        ns_high_3000: 'ns_high_30000',
        ns_high_9000: 'ns_high_90000',
        ns_total_score_50000: 'ns_total_score_500000',
        ns_best_stage_12: 'ns_best_stage_10'
    })
});

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
    let seasonStartKstMs = startOfTodayKstMs - (daysSinceMonday * KST_DAY_MS) + (KST_RESET_HOUR * KST_HOUR_MS);

    if (kstNowMs < seasonStartKstMs) {
        seasonStartKstMs -= KST_WEEK_MS;
    }

    const seasonEndKstMs = seasonStartKstMs + KST_WEEK_MS;
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

export class StorageManager {
    constructor() {
        this.prefix = 'mgp_'; // Minigame Platform prefix
        this.data = this.loadAll();
    }

    /**
     * Generate storage key
     */
    key(name) {
        return `${this.prefix}${name}`;
    }

    /**
     * Load all saved data
     */
    loadAll() {
        try {
            const profile = this.normalizeProfile(this.get('profile'));
            const games = this.get('games') || {};
            const rawAchievements = this.get('achievements') || {};
            const achievements = this.normalizeLocalAchievementsMap(rawAchievements);
            const settings = this.get('settings') || this.createDefaultSettings();
            const seasonalRanking = this.normalizeSeasonalRanking(this.get(SEASONAL_RANKING_KEY));

            if (JSON.stringify(rawAchievements) !== JSON.stringify(achievements)) {
                this.set('achievements', achievements);
            }

            return { profile, games, achievements, settings, seasonalRanking };
        } catch (e) {
            console.warn('Failed to load storage:', e);
            return {
                profile: this.normalizeProfile(),
                games: {},
                achievements: {},
                settings: this.createDefaultSettings(),
                seasonalRanking: this.createDefaultSeasonalRanking()
            };
        }
    }

    /**
     * Create default profile
     */
    createDefaultProfile() {
        return {
            id: this.generateId(),
            nickname: 'Player',
            avatar: 'default',
            cloudUid: null,
            email: '',
            provider: 'guest',
            createdAt: Date.now(),
            totalPlayTime: 0,
            totalGamesPlayed: 0,
            totalScore: 0
        };
    }

    /**
     * Normalize profile for backward compatibility
     */
    normalizeProfile(profile = {}) {
        const defaults = this.createDefaultProfile();
        return {
            ...defaults,
            ...(profile || {})
        };
    }

    /**
     * Create default settings
     */
    createDefaultSettings() {
        return {
            soundEnabled: true,
            musicEnabled: true,
            vibrationEnabled: true,
            language: 'ko'
        };
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get data from storage
     */
    get(key) {
        try {
            const item = localStorage.getItem(this.key(key));
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.warn(`Failed to get ${key}:`, e);
            return null;
        }
    }

    /**
     * Set data to storage
     */
    set(key, value) {
        try {
            localStorage.setItem(this.key(key), JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn(`Failed to set ${key}:`, e);
            return false;
        }
    }

    /**
     * Remove data from storage
     */
    remove(key) {
        try {
            localStorage.removeItem(this.key(key));
            return true;
        } catch (e) {
            return false;
        }
    }

    // ===== Profile Methods =====

    /**
     * Get user profile
     */
    getProfile() {
        return this.data.profile;
    }

    /**
     * Update user profile
     */
    updateProfile(updates) {
        this.data.profile = this.normalizeProfile({ ...this.data.profile, ...updates });
        this.set('profile', this.data.profile);
        return this.data.profile;
    }

    /**
     * Set nickname
     */
    setNickname(nickname) {
        return this.updateProfile({ nickname });
    }

    /**
     * Add play time
     */
    addPlayTime(seconds) {
        return this.updateProfile({
            totalPlayTime: this.data.profile.totalPlayTime + seconds
        });
    }

    // ===== Game Data Methods =====

    /**
     * Get game data
     */
    getGameData(gameId) {
        return this.normalizeGameData(gameId, this.data.games[gameId]);
    }

    /**
     * Create default game data
     */
    createDefaultGameData(gameId) {
        return {
            gameId,
            highScore: 0,
            bestRank: null,
            totalScore: 0,
            playCount: 0,
            bestLevel: 1,
            bestStage: 1,
            maxCombo: 0,
            totalComboCount: 0,
            totalStageClears: 0,
            totalItemsCollected: 0,
            itemStats: {},
            lastSessionScore: 0,
            totalPlayTime: 0,
            lastPlayed: null,
            achievements: []
        };
    }

    /**
     * Normalize game data shape for backward compatibility
     */
    normalizeGameData(gameId, gameData = {}) {
        const defaults = this.createDefaultGameData(gameId);
        const normalized = {
            ...defaults,
            ...(gameData || {}),
            itemStats: {
                ...defaults.itemStats,
                ...(gameData?.itemStats || {})
            }
        };

        if (!Array.isArray(normalized.achievements)) {
            normalized.achievements = [];
        }

        return normalized;
    }

    /**
     * Update game data
     */
    updateGameData(gameId, updates) {
        const current = this.normalizeGameData(gameId, this.data.games[gameId]);
        const next = {
            ...current,
            ...updates,
            itemStats: {
                ...current.itemStats,
                ...(updates?.itemStats || {})
            },
            lastPlayed: Date.now()
        };
        this.data.games[gameId] = next;

        this.set('games', this.data.games);
        return next;
    }

    /**
     * Update best rank (lower is better)
     */
    updateBestRank(gameId, rank) {
        const safeRank = Math.floor(Number(rank));
        if (!Number.isFinite(safeRank) || safeRank <= 0) {
            return this.getGameData(gameId);
        }

        const gameData = this.getGameData(gameId);
        const currentBestRank = Math.floor(Number(gameData.bestRank));
        const hasCurrentBest = Number.isFinite(currentBestRank) && currentBestRank > 0;
        if (hasCurrentBest && currentBestRank <= safeRank) {
            return gameData;
        }

        return this.updateGameData(gameId, { bestRank: safeRank });
    }

    /**
     * Record game session
     */
    recordGameSession(gameId, sessionData) {
        const gameData = this.getGameData(gameId);
        const normalizedItemCounts = this.normalizeItemCounts(sessionData?.itemCounts);
        const normalizedItemsCollected = Number.isFinite(sessionData?.itemsCollected)
            ? Math.max(0, Math.floor(sessionData.itemsCollected))
            : Object.values(normalizedItemCounts).reduce((sum, count) => sum + count, 0);

        const safeSession = {
            score: Number.isFinite(sessionData?.score) ? sessionData.score : 0,
            duration: Number.isFinite(sessionData?.duration) ? sessionData.duration : 0,
            level: Number.isFinite(sessionData?.level) ? sessionData.level : 0,
            maxCombo: Number.isFinite(sessionData?.maxCombo) ? sessionData.maxCombo : 0,
            comboCount: Number.isFinite(sessionData?.comboCount)
                ? Math.max(0, Math.floor(sessionData.comboCount))
                : Math.max(0, Math.floor(sessionData?.maxCombo || 0)),
            stageClears: Number.isFinite(sessionData?.stageClears)
                ? Math.max(0, Math.floor(sessionData.stageClears))
                : Math.max(0, Math.floor((sessionData?.level || 1) - 1)),
            itemsCollected: normalizedItemsCollected,
            itemCounts: normalizedItemCounts
        };

        const mergedItemStats = {
            ...gameData.itemStats
        };
        for (const [itemId, count] of Object.entries(safeSession.itemCounts)) {
            mergedItemStats[itemId] = (mergedItemStats[itemId] || 0) + count;
        }

        const updates = {
            playCount: gameData.playCount + 1,
            totalScore: gameData.totalScore + safeSession.score,
            totalPlayTime: gameData.totalPlayTime + safeSession.duration,
            totalStageClears: gameData.totalStageClears + safeSession.stageClears,
            totalComboCount: gameData.totalComboCount + safeSession.comboCount,
            totalItemsCollected: gameData.totalItemsCollected + safeSession.itemsCollected,
            itemStats: mergedItemStats,
            lastSessionScore: safeSession.score
        };

        // Update high score
        if (safeSession.score > gameData.highScore) {
            updates.highScore = safeSession.score;
        }

        // Update best level
        if (safeSession.level > gameData.bestLevel) {
            updates.bestLevel = safeSession.level;
        }

        // Update best stage
        if (safeSession.level > gameData.bestStage) {
            updates.bestStage = safeSession.level;
        }

        // Update max combo
        if (safeSession.maxCombo > gameData.maxCombo) {
            updates.maxCombo = safeSession.maxCombo;
        }

        // Update profile totals
        this.updateProfile({
            totalGamesPlayed: this.data.profile.totalGamesPlayed + 1,
            totalScore: this.data.profile.totalScore + safeSession.score,
            totalPlayTime: this.data.profile.totalPlayTime + safeSession.duration
        });
        this.recordSeasonalScore(gameId, safeSession.score);

        return this.updateGameData(gameId, updates);
    }

    /**
     * Normalize item counts object
     */
    normalizeItemCounts(itemCounts) {
        if (!itemCounts || typeof itemCounts !== 'object') {
            return {};
        }

        const normalized = {};
        for (const [itemId, rawCount] of Object.entries(itemCounts)) {
            if (!itemId) continue;
            const count = Math.floor(Number(rawCount));
            if (!Number.isFinite(count) || count <= 0) continue;
            normalized[itemId] = count;
        }
        return normalized;
    }

    /**
     * Get all game stats
     */
    getAllGameStats() {
        return this.data.games;
    }

    /**
     * Get total play count across all games
     */
    getTotalPlayCount() {
        return Object.values(this.data.games).reduce((total, game) => {
            return total + (game.playCount || 0);
        }, 0);
    }

    // ===== Seasonal Ranking Methods =====

    createDefaultSeasonalRanking(nowMs = Date.now()) {
        const season = computeKstSeasonWindow(nowMs);
        return {
            version: 1,
            seasonId: season.id,
            seasonStartAt: season.startAt,
            seasonEndAt: season.endAt,
            season: {
                id: season.id,
                startAt: season.startAt,
                endAt: season.endAt,
                timezone: season.timezone,
                resetRule: season.resetRule
            },
            updatedAt: nowMs,
            games: {}
        };
    }

    normalizeSeasonalRanking(raw = {}) {
        const fallback = this.createDefaultSeasonalRanking();
        const safeRaw = raw && typeof raw === 'object' ? raw : {};
        const seasonWindow = computeKstSeasonWindow();
        const seasonId = typeof safeRaw.seasonId === 'string' && safeRaw.seasonId.trim()
            ? safeRaw.seasonId.trim()
            : (typeof safeRaw?.season?.id === 'string' && safeRaw.season.id.trim()
                ? safeRaw.season.id.trim()
                : seasonWindow.id);

        const sourceGames = safeRaw.games && typeof safeRaw.games === 'object'
            ? safeRaw.games
            : {};
        const games = {};

        Object.entries(sourceGames).forEach(([rawGameId, rawEntry]) => {
            const gameId = this.sanitizeCloudId(rawGameId);
            if (!gameId || !rawEntry || typeof rawEntry !== 'object') return;
            const weeklyHighScore = this.toSafeCounter(rawEntry.weeklyHighScore);
            const lastSessionScore = this.toSafeCounter(rawEntry.lastSessionScore);
            const lastPlayedAt = this.toSafeTimestamp(rawEntry.lastPlayedAt, 0);
            const playCount = this.toSafeCounter(rawEntry.playCount);
            if (weeklyHighScore <= 0 && lastSessionScore <= 0 && lastPlayedAt <= 0 && playCount <= 0) return;

            games[gameId] = {
                weeklyHighScore,
                lastSessionScore,
                lastPlayedAt,
                playCount
            };
        });

        return {
            version: 1,
            seasonId,
            seasonStartAt: this.toSafeTimestamp(
                safeRaw.seasonStartAt ?? safeRaw?.season?.startAt,
                fallback.seasonStartAt
            ),
            seasonEndAt: this.toSafeTimestamp(
                safeRaw.seasonEndAt ?? safeRaw?.season?.endAt,
                fallback.seasonEndAt
            ),
            season: {
                id: seasonId,
                startAt: this.toSafeTimestamp(
                    safeRaw?.season?.startAt ?? safeRaw.seasonStartAt,
                    fallback.seasonStartAt
                ),
                endAt: this.toSafeTimestamp(
                    safeRaw?.season?.endAt ?? safeRaw.seasonEndAt,
                    fallback.seasonEndAt
                ),
                timezone: 'Asia/Seoul',
                resetRule: 'weekly Monday 09:00 KST'
            },
            updatedAt: this.toSafeTimestamp(safeRaw.updatedAt, fallback.updatedAt),
            games
        };
    }

    resolveSeasonWindowByServer(seasonId = null, seasonMeta = null) {
        const computed = computeKstSeasonWindow();
        const meta = seasonMeta && typeof seasonMeta === 'object' ? seasonMeta : {};
        const resolvedSeasonId = (typeof seasonId === 'string' && seasonId.trim())
            ? seasonId.trim()
            : (typeof meta.id === 'string' && meta.id.trim() ? meta.id.trim() : computed.id);
        return {
            id: resolvedSeasonId,
            startAt: this.toSafeTimestamp(meta.startAt, computed.startAt),
            endAt: this.toSafeTimestamp(meta.endAt, computed.endAt),
            timezone: 'Asia/Seoul',
            resetRule: 'weekly Monday 09:00 KST'
        };
    }

    ensureSeasonalState(seasonId = null, seasonMeta = null) {
        const resolved = this.resolveSeasonWindowByServer(seasonId, seasonMeta);
        const current = this.normalizeSeasonalRanking(this.data.seasonalRanking);
        if (current.seasonId === resolved.id) {
            const updatedCurrent = {
                ...current,
                seasonStartAt: resolved.startAt,
                seasonEndAt: resolved.endAt,
                season: {
                    id: resolved.id,
                    startAt: resolved.startAt,
                    endAt: resolved.endAt,
                    timezone: resolved.timezone,
                    resetRule: resolved.resetRule
                }
            };
            this.data.seasonalRanking = updatedCurrent;
            this.set(SEASONAL_RANKING_KEY, updatedCurrent);
            return false;
        }

        const next = {
            version: 1,
            seasonId: resolved.id,
            seasonStartAt: resolved.startAt,
            seasonEndAt: resolved.endAt,
            season: {
                id: resolved.id,
                startAt: resolved.startAt,
                endAt: resolved.endAt,
                timezone: resolved.timezone,
                resetRule: resolved.resetRule
            },
            updatedAt: Date.now(),
            games: {}
        };

        this.data.seasonalRanking = next;
        this.set(SEASONAL_RANKING_KEY, next);
        return true;
    }

    getSeasonalState() {
        this.ensureSeasonalState();
        return this.normalizeSeasonalRanking(this.data.seasonalRanking);
    }

    getSeasonalGameEntry(gameId) {
        this.ensureSeasonalState();
        const safeGameId = this.sanitizeCloudId(gameId);
        if (!safeGameId) {
            return {
                weeklyHighScore: 0,
                lastSessionScore: 0,
                lastPlayedAt: 0,
                playCount: 0
            };
        }

        const existing = this.data.seasonalRanking?.games?.[safeGameId];
        if (!existing || typeof existing !== 'object') {
            return {
                weeklyHighScore: 0,
                lastSessionScore: 0,
                lastPlayedAt: 0,
                playCount: 0
            };
        }

        return {
            weeklyHighScore: this.toSafeCounter(existing.weeklyHighScore),
            lastSessionScore: this.toSafeCounter(existing.lastSessionScore),
            lastPlayedAt: this.toSafeTimestamp(existing.lastPlayedAt, 0),
            playCount: this.toSafeCounter(existing.playCount)
        };
    }

    recordSeasonalScore(gameId, score, playedAt = Date.now()) {
        const safeGameId = this.sanitizeCloudId(gameId);
        if (!safeGameId) return null;

        this.ensureSeasonalState();

        const safeScore = this.toSafeCounter(score);
        const safePlayedAt = this.toSafeTimestamp(playedAt, Date.now());
        const current = this.getSeasonalGameEntry(safeGameId);
        const next = {
            weeklyHighScore: Math.max(current.weeklyHighScore, safeScore),
            lastSessionScore: safeScore,
            lastPlayedAt: Math.max(current.lastPlayedAt, safePlayedAt),
            playCount: current.playCount + 1
        };

        const seasonalRanking = this.normalizeSeasonalRanking(this.data.seasonalRanking);
        seasonalRanking.games[safeGameId] = next;
        seasonalRanking.updatedAt = Date.now();
        this.data.seasonalRanking = seasonalRanking;
        this.set(SEASONAL_RANKING_KEY, seasonalRanking);
        return next;
    }

    getSeasonalHighScoresMap() {
        this.ensureSeasonalState();
        const sourceGames = this.data.seasonalRanking?.games && typeof this.data.seasonalRanking.games === 'object'
            ? this.data.seasonalRanking.games
            : {};
        const highScores = {};

        Object.entries(sourceGames).forEach(([gameId, rawEntry]) => {
            const safeGameId = this.sanitizeCloudId(gameId);
            const highScore = this.toSafeCounter(rawEntry?.weeklyHighScore);
            if (!safeGameId || highScore <= 0) return;
            highScores[safeGameId] = highScore;
        });

        return highScores;
    }

    // ===== Cloud Progress Sync Methods =====

    sanitizeCloudId(value, maxLength = 96) {
        const base = typeof value === 'string' ? value.trim() : '';
        if (!base) return '';
        return base.replace(/[^a-zA-Z0-9_\-:.]/g, '').slice(0, maxLength);
    }

    toSafeCounter(value, fallback = 0) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return Math.max(0, Math.floor(Number(fallback) || 0));
        return Math.max(0, Math.floor(parsed));
    }

    toSafeTimestamp(value, fallback = Date.now()) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return Math.max(0, Math.floor(Number(fallback) || Date.now()));
        return Math.max(0, Math.floor(parsed));
    }

    toSafeRank(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        const rank = Math.floor(parsed);
        return rank > 0 ? rank : null;
    }

    mergeBestRank(localRank, incomingRank) {
        const safeLocal = this.toSafeRank(localRank);
        const safeIncoming = this.toSafeRank(incomingRank);
        if (safeLocal && safeIncoming) return Math.min(safeLocal, safeIncoming);
        return safeLocal || safeIncoming || null;
    }

    normalizeCloudProfileProgress(profile = {}) {
        const safe = profile && typeof profile === 'object' ? profile : {};
        return {
            createdAt: this.toSafeTimestamp(safe.createdAt, Date.now()),
            totalPlayTime: this.toSafeCounter(safe.totalPlayTime),
            totalGamesPlayed: this.toSafeCounter(safe.totalGamesPlayed),
            totalScore: this.toSafeCounter(safe.totalScore)
        };
    }

    normalizeCloudItemStats(itemStats = {}) {
        if (!itemStats || typeof itemStats !== 'object') return {};

        const normalized = {};
        let count = 0;
        Object.entries(itemStats).forEach(([rawItemId, rawCount]) => {
            if (count >= 200) return;
            const itemId = this.sanitizeCloudId(rawItemId);
            const itemCount = this.toSafeCounter(rawCount);
            if (!itemId || itemCount <= 0) return;
            normalized[itemId] = itemCount;
            count += 1;
        });

        const sorted = {};
        Object.keys(normalized).sort((a, b) => a.localeCompare(b, 'en')).forEach((key) => {
            sorted[key] = normalized[key];
        });
        return sorted;
    }

    normalizeCloudGameProgress(gameId, gameData = {}) {
        const safeGameId = this.sanitizeCloudId(gameId);
        if (!safeGameId) return null;

        const normalizedGame = this.normalizeGameData(safeGameId, gameData);
        return {
            highScore: this.toSafeCounter(normalizedGame.highScore),
            bestRank: this.toSafeRank(normalizedGame.bestRank),
            totalScore: this.toSafeCounter(normalizedGame.totalScore),
            playCount: this.toSafeCounter(normalizedGame.playCount),
            bestLevel: Math.max(1, this.toSafeCounter(normalizedGame.bestLevel || 1, 1)),
            bestStage: Math.max(1, this.toSafeCounter(normalizedGame.bestStage || 1, 1)),
            maxCombo: this.toSafeCounter(normalizedGame.maxCombo),
            totalComboCount: this.toSafeCounter(normalizedGame.totalComboCount),
            totalStageClears: this.toSafeCounter(normalizedGame.totalStageClears),
            totalItemsCollected: this.toSafeCounter(normalizedGame.totalItemsCollected),
            itemStats: this.normalizeCloudItemStats(normalizedGame.itemStats),
            lastSessionScore: this.toSafeCounter(normalizedGame.lastSessionScore),
            totalPlayTime: this.toSafeCounter(normalizedGame.totalPlayTime),
            lastPlayed: this.toSafeTimestamp(normalizedGame.lastPlayed, 0)
        };
    }

    hasMeaningfulCloudGameProgress(gameProgress = {}) {
        if (!gameProgress || typeof gameProgress !== 'object') return false;
        if (this.toSafeCounter(gameProgress.highScore) > 0) return true;
        if (this.toSafeRank(gameProgress.bestRank) !== null) return true;
        if (this.toSafeCounter(gameProgress.totalScore) > 0) return true;
        if (this.toSafeCounter(gameProgress.playCount) > 0) return true;
        if (this.toSafeCounter(gameProgress.bestLevel) > 1) return true;
        if (this.toSafeCounter(gameProgress.bestStage) > 1) return true;
        if (this.toSafeCounter(gameProgress.maxCombo) > 0) return true;
        if (this.toSafeCounter(gameProgress.totalComboCount) > 0) return true;
        if (this.toSafeCounter(gameProgress.totalStageClears) > 0) return true;
        if (this.toSafeCounter(gameProgress.totalItemsCollected) > 0) return true;
        if (this.toSafeCounter(gameProgress.lastSessionScore) > 0) return true;
        if (this.toSafeCounter(gameProgress.totalPlayTime) > 0) return true;
        if (this.toSafeTimestamp(gameProgress.lastPlayed, 0) > 0) return true;
        return Object.keys(gameProgress.itemStats || {}).length > 0;
    }

    normalizeCloudGamesMap(games = {}) {
        if (!games || typeof games !== 'object') return {};

        const normalized = {};
        let count = 0;
        Object.entries(games).forEach(([rawGameId, rawGameData]) => {
            if (count >= 200) return;
            const gameId = this.sanitizeCloudId(rawGameId);
            if (!gameId) return;

            const gameProgress = this.normalizeCloudGameProgress(gameId, rawGameData);
            if (!gameProgress || !this.hasMeaningfulCloudGameProgress(gameProgress)) return;

            normalized[gameId] = gameProgress;
            count += 1;
        });

        const sorted = {};
        Object.keys(normalized).sort((a, b) => a.localeCompare(b, 'en')).forEach((gameId) => {
            sorted[gameId] = normalized[gameId];
        });
        return sorted;
    }

    normalizeAchievementId(gameId, achievementId) {
        const safeGameId = this.sanitizeCloudId(gameId);
        const safeAchievementId = this.sanitizeCloudId(achievementId);
        if (!safeAchievementId) return '';
        const migrated = LEGACY_ACHIEVEMENT_ID_MAP[safeGameId]?.[safeAchievementId] || safeAchievementId;
        return this.sanitizeCloudId(migrated);
    }

    normalizeAchievementListForGame(gameId, achievementIds = []) {
        const safeGameId = this.sanitizeCloudId(gameId);
        if (!safeGameId || !Array.isArray(achievementIds)) return [];
        const unique = new Set();
        achievementIds.forEach((rawAchievementId) => {
            if (unique.size >= 256) return;
            const achievementId = this.normalizeAchievementId(safeGameId, rawAchievementId);
            if (!achievementId) return;
            unique.add(achievementId);
        });
        return Array.from(unique).sort((a, b) => a.localeCompare(b, 'en'));
    }

    normalizeLocalAchievementsMap(achievements = {}) {
        if (!achievements || typeof achievements !== 'object') return {};

        const normalized = {};
        let gameCount = 0;
        Object.entries(achievements).forEach(([rawGameId, rawAchievementIds]) => {
            if (gameCount >= 200) return;
            const gameId = this.sanitizeCloudId(rawGameId);
            if (!gameId) return;

            const list = this.normalizeAchievementListForGame(gameId, rawAchievementIds);
            if (!list.length) return;

            normalized[gameId] = list;
            gameCount += 1;
        });

        const sorted = {};
        Object.keys(normalized).sort((a, b) => a.localeCompare(b, 'en')).forEach((gameId) => {
            sorted[gameId] = normalized[gameId];
        });
        return sorted;
    }

    normalizeCloudAchievementList(gameId, achievementIds = []) {
        return this.normalizeAchievementListForGame(gameId, achievementIds);
    }

    normalizeCloudAchievementsMap(achievements = {}) {
        if (!achievements || typeof achievements !== 'object') return {};

        const normalized = {};
        let gameCount = 0;
        Object.entries(achievements).forEach(([rawGameId, rawAchievementIds]) => {
            if (gameCount >= 200) return;
            const gameId = this.sanitizeCloudId(rawGameId);
            if (!gameId) return;

            const list = this.normalizeCloudAchievementList(gameId, rawAchievementIds);
            if (!list.length) return;

            normalized[gameId] = list;
            gameCount += 1;
        });

        const sorted = {};
        Object.keys(normalized).sort((a, b) => a.localeCompare(b, 'en')).forEach((gameId) => {
            sorted[gameId] = normalized[gameId];
        });
        return sorted;
    }

    normalizeCloudProgressPayload(progress = {}) {
        const safe = progress && typeof progress === 'object' ? progress : {};
        return {
            profile: this.normalizeCloudProfileProgress(safe.profile),
            games: this.normalizeCloudGamesMap(safe.games),
            achievements: this.normalizeCloudAchievementsMap(safe.achievements)
        };
    }

    getCloudProgressSnapshot() {
        const profile = this.normalizeCloudProfileProgress(this.data.profile || {});
        const games = this.normalizeCloudGamesMap(this.data.games || {});
        const achievements = this.normalizeCloudAchievementsMap(this.data.achievements || {});

        return {
            profile,
            games,
            achievements
        };
    }

    mergeCloudProfileProgress(localProfile = {}, incomingProfile = {}) {
        const safeLocal = this.normalizeCloudProfileProgress(localProfile);
        const safeIncoming = this.normalizeCloudProfileProgress(incomingProfile);
        const localCreatedAt = this.toSafeTimestamp(safeLocal.createdAt, 0);
        const incomingCreatedAt = this.toSafeTimestamp(safeIncoming.createdAt, 0);

        let createdAt = localCreatedAt || incomingCreatedAt || Date.now();
        if (localCreatedAt > 0 && incomingCreatedAt > 0) {
            createdAt = Math.min(localCreatedAt, incomingCreatedAt);
        }

        return {
            createdAt,
            totalPlayTime: Math.max(safeLocal.totalPlayTime, safeIncoming.totalPlayTime),
            totalGamesPlayed: Math.max(safeLocal.totalGamesPlayed, safeIncoming.totalGamesPlayed),
            totalScore: Math.max(safeLocal.totalScore, safeIncoming.totalScore)
        };
    }

    mergeCloudItemStats(localStats = {}, incomingStats = {}) {
        const safeLocal = this.normalizeCloudItemStats(localStats);
        const safeIncoming = this.normalizeCloudItemStats(incomingStats);
        const merged = {};
        const itemIds = new Set([
            ...Object.keys(safeLocal),
            ...Object.keys(safeIncoming)
        ]);

        Array.from(itemIds)
            .sort((a, b) => a.localeCompare(b, 'en'))
            .slice(0, 200)
            .forEach((itemId) => {
                const nextValue = Math.max(
                    this.toSafeCounter(safeLocal[itemId]),
                    this.toSafeCounter(safeIncoming[itemId])
                );
                if (nextValue > 0) {
                    merged[itemId] = nextValue;
                }
            });

        return merged;
    }

    mergeCloudGameProgress(localGame = {}, incomingGame = {}) {
        const safeLocal = this.normalizeCloudGameProgress('local', localGame) || this.normalizeCloudGameProgress('fallback-local', {});
        const safeIncoming = this.normalizeCloudGameProgress('incoming', incomingGame) || this.normalizeCloudGameProgress('fallback-incoming', {});

        const localLastPlayed = this.toSafeTimestamp(safeLocal.lastPlayed, 0);
        const incomingLastPlayed = this.toSafeTimestamp(safeIncoming.lastPlayed, 0);

        let lastSessionScore = 0;
        if (localLastPlayed > incomingLastPlayed) {
            lastSessionScore = this.toSafeCounter(safeLocal.lastSessionScore);
        } else if (incomingLastPlayed > localLastPlayed) {
            lastSessionScore = this.toSafeCounter(safeIncoming.lastSessionScore);
        } else {
            lastSessionScore = Math.max(
                this.toSafeCounter(safeLocal.lastSessionScore),
                this.toSafeCounter(safeIncoming.lastSessionScore)
            );
        }

        return {
            highScore: Math.max(this.toSafeCounter(safeLocal.highScore), this.toSafeCounter(safeIncoming.highScore)),
            bestRank: this.mergeBestRank(safeLocal.bestRank, safeIncoming.bestRank),
            totalScore: Math.max(this.toSafeCounter(safeLocal.totalScore), this.toSafeCounter(safeIncoming.totalScore)),
            playCount: Math.max(this.toSafeCounter(safeLocal.playCount), this.toSafeCounter(safeIncoming.playCount)),
            bestLevel: Math.max(this.toSafeCounter(safeLocal.bestLevel, 1), this.toSafeCounter(safeIncoming.bestLevel, 1)),
            bestStage: Math.max(this.toSafeCounter(safeLocal.bestStage, 1), this.toSafeCounter(safeIncoming.bestStage, 1)),
            maxCombo: Math.max(this.toSafeCounter(safeLocal.maxCombo), this.toSafeCounter(safeIncoming.maxCombo)),
            totalComboCount: Math.max(this.toSafeCounter(safeLocal.totalComboCount), this.toSafeCounter(safeIncoming.totalComboCount)),
            totalStageClears: Math.max(this.toSafeCounter(safeLocal.totalStageClears), this.toSafeCounter(safeIncoming.totalStageClears)),
            totalItemsCollected: Math.max(this.toSafeCounter(safeLocal.totalItemsCollected), this.toSafeCounter(safeIncoming.totalItemsCollected)),
            itemStats: this.mergeCloudItemStats(safeLocal.itemStats, safeIncoming.itemStats),
            lastSessionScore,
            totalPlayTime: Math.max(this.toSafeCounter(safeLocal.totalPlayTime), this.toSafeCounter(safeIncoming.totalPlayTime)),
            lastPlayed: Math.max(localLastPlayed, incomingLastPlayed)
        };
    }

    mergeCloudProgress(progress = {}) {
        const local = this.getCloudProgressSnapshot();
        const incoming = this.normalizeCloudProgressPayload(progress);

        const mergedProfile = this.mergeCloudProfileProgress(local.profile, incoming.profile);

        const mergedGames = {};
        const gameIds = new Set([
            ...Object.keys(local.games || {}),
            ...Object.keys(incoming.games || {})
        ]);

        Array.from(gameIds)
            .sort((a, b) => a.localeCompare(b, 'en'))
            .slice(0, 200)
            .forEach((gameId) => {
                const mergedGame = this.mergeCloudGameProgress(
                    local.games?.[gameId] || {},
                    incoming.games?.[gameId] || {}
                );
                if (this.hasMeaningfulCloudGameProgress(mergedGame)) {
                    mergedGames[gameId] = mergedGame;
                }
            });

        const mergedAchievements = {};
        const achievementGameIds = new Set([
            ...Object.keys(local.achievements || {}),
            ...Object.keys(incoming.achievements || {})
        ]);

        Array.from(achievementGameIds)
            .sort((a, b) => a.localeCompare(b, 'en'))
            .slice(0, 200)
            .forEach((gameId) => {
                const mergedSet = new Set([
                    ...(local.achievements?.[gameId] || []),
                    ...(incoming.achievements?.[gameId] || [])
                ]);
                if (mergedSet.size === 0) return;
                mergedAchievements[gameId] = Array.from(mergedSet)
                    .sort((a, b) => a.localeCompare(b, 'en'))
                    .slice(0, 256);
            });

        const prevProfile = JSON.stringify(this.data.profile || {});
        const prevGames = JSON.stringify(this.data.games || {});
        const prevAchievements = JSON.stringify(this.data.achievements || {});

        const currentProfile = this.normalizeProfile(this.data.profile || {});
        this.data.profile = this.normalizeProfile({
            ...currentProfile,
            createdAt: mergedProfile.createdAt,
            totalPlayTime: mergedProfile.totalPlayTime,
            totalGamesPlayed: mergedProfile.totalGamesPlayed,
            totalScore: mergedProfile.totalScore
        });

        const currentGames = (this.data.games && typeof this.data.games === 'object') ? this.data.games : {};
        const nextGamesData = { ...currentGames };
        Object.entries(mergedGames).forEach(([gameId, mergedGame]) => {
            const existingGame = this.normalizeGameData(gameId, nextGamesData[gameId]);
            nextGamesData[gameId] = this.normalizeGameData(gameId, {
                ...existingGame,
                ...mergedGame,
                itemStats: mergedGame.itemStats,
                lastPlayed: mergedGame.lastPlayed
            });
        });
        this.data.games = nextGamesData;

        const currentAchievements = (this.data.achievements && typeof this.data.achievements === 'object')
            ? this.data.achievements
            : {};
        this.data.achievements = this.normalizeLocalAchievementsMap({
            ...currentAchievements,
            ...mergedAchievements
        });

        this.set('profile', this.data.profile);
        this.set('games', this.data.games);
        this.set('achievements', this.data.achievements);

        const nextProfile = JSON.stringify(this.data.profile || {});
        const nextGames = JSON.stringify(this.data.games || {});
        const nextAchievements = JSON.stringify(this.data.achievements || {});
        return (prevProfile !== nextProfile) || (prevGames !== nextGames) || (prevAchievements !== nextAchievements);
    }

    // ===== Achievement Methods =====

    /**
     * Get achievements for game
     */
    getAchievements(gameId) {
        const safeGameId = this.sanitizeCloudId(gameId);
        if (!safeGameId) return [];

        const current = Array.isArray(this.data.achievements?.[safeGameId])
            ? this.data.achievements[safeGameId]
            : [];
        const normalized = this.normalizeAchievementListForGame(safeGameId, current);

        const isSame = current.length === normalized.length && current.every((id, index) => id === normalized[index]);
        if (!isSame) {
            if (normalized.length > 0) {
                this.data.achievements[safeGameId] = normalized;
            } else if (this.data.achievements?.[safeGameId]) {
                delete this.data.achievements[safeGameId];
            }
            this.set('achievements', this.data.achievements);
        }

        return normalized;
    }

    /**
     * Get unlocked achievement count for a specific game
     */
    getGameAchievementCount(gameId) {
        return this.getAchievements(gameId).length;
    }

    /**
     * Unlock achievement
     */
    unlockAchievement(gameId, achievementId) {
        const safeGameId = this.sanitizeCloudId(gameId);
        const normalizedAchievementId = this.normalizeAchievementId(safeGameId, achievementId);
        if (!safeGameId || !normalizedAchievementId) return false;

        const current = this.getAchievements(safeGameId);
        if (current.includes(normalizedAchievementId)) return false; // Already unlocked

        if (!this.data.achievements[safeGameId]) {
            this.data.achievements[safeGameId] = [...current];
        }

        this.data.achievements[safeGameId].push(normalizedAchievementId);
        this.data.achievements[safeGameId] = this.normalizeAchievementListForGame(
            safeGameId,
            this.data.achievements[safeGameId]
        );
        this.set('achievements', this.data.achievements);
        return true; // Newly unlocked
    }

    /**
     * Check if achievement is unlocked
     */
    hasAchievement(gameId, achievementId) {
        const safeGameId = this.sanitizeCloudId(gameId);
        const normalizedAchievementId = this.normalizeAchievementId(safeGameId, achievementId);
        if (!safeGameId || !normalizedAchievementId) return false;
        return this.getAchievements(safeGameId).includes(normalizedAchievementId);
    }

    /**
     * Get total achievement count
     */
    getTotalAchievementCount() {
        let total = 0;
        for (const gameId in this.data.achievements) {
            total += this.data.achievements[gameId].length;
        }
        return total;
    }

    // ===== Settings Methods =====

    /**
     * Get settings
     */
    getSettings() {
        return this.data.settings;
    }

    /**
     * Update settings
     */
    updateSettings(updates) {
        this.data.settings = { ...this.data.settings, ...updates };
        this.set('settings', this.data.settings);
        return this.data.settings;
    }

    // ===== Utility Methods =====

    /**
     * Export all data (for backup)
     */
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }

    /**
     * Import data (for restore)
     */
    importData(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.data = {
                ...imported,
                profile: this.normalizeProfile(imported?.profile),
                games: imported?.games || {},
                achievements: this.normalizeLocalAchievementsMap(imported?.achievements || {}),
                settings: imported?.settings || this.createDefaultSettings(),
                seasonalRanking: this.normalizeSeasonalRanking(imported?.seasonalRanking)
            };
            this.set('profile', this.data.profile);
            this.set('games', this.data.games);
            this.set('achievements', this.data.achievements);
            this.set('settings', this.data.settings);
            this.set(SEASONAL_RANKING_KEY, this.data.seasonalRanking);
            return true;
        } catch (e) {
            console.error('Failed to import data:', e);
            return false;
        }
    }

    /**
     * Clear all data
     */
    clearAll() {
        this.remove('profile');
        this.remove('games');
        this.remove('achievements');
        this.remove('settings');
        this.remove(SEASONAL_RANKING_KEY);
        this.data = this.loadAll();
    }
}

// Singleton instance
export const storage = new StorageManager();
