import { storage } from '../systems/StorageManager.js';

const DEFAULT_TOP_LIMIT = 10;
const MIN_TOP_LIMIT = 1;
const MAX_TOP_LIMIT = 50;
const SYNC_DEBOUNCE_MS = 1200;
const REQUEST_TIMEOUT_MS = 6000;

const LOCAL_FALLBACK_KEY = 'mgp_leaderboard_fallback_v1';
const LOCAL_FALLBACK_VERSION = 1;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
const KST_RESET_HOUR = 9;

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
    if (!Number.isFinite(parsed)) return DEFAULT_TOP_LIMIT;
    return Math.max(MIN_TOP_LIMIT, Math.min(MAX_TOP_LIMIT, Math.floor(parsed)));
}

function normalizeEntries(entries = []) {
    if (!Array.isArray(entries)) return [];
    return entries.map((entry, index) => ({
        rank: Number.isFinite(Number(entry?.rank)) ? Math.floor(Number(entry.rank)) : (index + 1),
        uid: String(entry?.uid || ''),
        nickname: String(entry?.nickname || 'Player'),
        avatar: String(entry?.avatar || 'default'),
        score: toSafeScore(entry?.score)
    }));
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

function formatApiErrorDetail(detail, fallback = 'request-failed') {
    if (detail === undefined || detail === null || detail === '') return fallback;
    if (typeof detail === 'string') return detail;
    if (detail instanceof Error) return detail.message || fallback;

    try {
        const serialized = JSON.stringify(detail);
        return serialized || fallback;
    } catch (_error) {
        return String(detail);
    }
}

export class LeaderboardService {
    constructor() {
        this.initialized = false;
        this.context = {
            enabled: true,
            source: 'server',
            apiBase: this.resolveApiBase()
        };

        this.syncInFlight = null;
        this.lastSyncAt = 0;
        this.lastSyncResult = null;

        this.realtimeSource = null;
        this.realtimeListeners = new Set();
        this.realtimeReconnectTimer = null;

        this.localFallbackState = this.createEmptyLocalFallbackState();
        this.localFallbackLoaded = false;
    }

    async init() {
        if (this.initialized) return this.context;
        this.loadLocalFallbackState();
        this.initialized = true;
        return this.context;
    }

    isEnabled() {
        return true;
    }

    getTopLimit() {
        return DEFAULT_TOP_LIMIT;
    }

    resolveApiBase() {
        if (typeof window === 'undefined') return '';

        const runtimeBase = typeof window.__MGP_LEADERBOARD_API_BASE__ === 'string'
            ? window.__MGP_LEADERBOARD_API_BASE__.trim()
            : '';
        if (runtimeBase) return runtimeBase.replace(/\/+$/, '');

        try {
            const localBase = localStorage.getItem('mgp_leaderboard_api_base');
            if (typeof localBase === 'string' && localBase.trim()) {
                return localBase.trim().replace(/\/+$/, '');
            }
        } catch (_error) {
            // ignore localStorage read failures
        }

        return '';
    }

    buildApiUrl(pathname, query = null) {
        const cleanPath = String(pathname || '').startsWith('/')
            ? String(pathname || '')
            : `/${String(pathname || '')}`;

        const base = this.context.apiBase
            ? `${this.context.apiBase.replace(/\/+$/, '')}/`
            : `${window.location.origin}/`;
        const url = new URL(cleanPath.replace(/^\//, ''), base);

        if (query && typeof query === 'object') {
            Object.entries(query).forEach(([key, value]) => {
                if (value === undefined || value === null || value === '') return;
                url.searchParams.set(key, String(value));
            });
        }

        return url;
    }

    async requestJson(pathname, options = {}) {
        const {
            method = 'GET',
            query = null,
            body = null,
            timeoutMs = REQUEST_TIMEOUT_MS
        } = options;

        const url = this.buildApiUrl(pathname, query);
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url.toString(), {
                method,
                headers: {
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {})
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });

            const responseText = await response.text();
            let payload = null;
            try {
                payload = responseText ? JSON.parse(responseText) : null;
            } catch (_error) {
                payload = null;
            }

            if (!response.ok) {
                const detailSource = payload?.error
                    ?? payload?.message
                    ?? (responseText ? responseText.slice(0, 120) : null)
                    ?? response.statusText
                    ?? 'request-failed';
                const detail = formatApiErrorDetail(detailSource);
                throw new Error(`Leaderboard API ${response.status}: ${detail}`);
            }

            return payload || {};
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error('Leaderboard API timeout');
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    createEmptyLocalFallbackState(nowMs = Date.now()) {
        return {
            version: LOCAL_FALLBACK_VERSION,
            revision: 1,
            updatedAt: nowMs,
            season: computeKstSeasonWindow(nowMs),
            players: {}
        };
    }

    normalizeLocalFallbackState(raw = {}) {
        const fallback = this.createEmptyLocalFallbackState();
        const sourcePlayers = raw?.players && typeof raw.players === 'object'
            ? raw.players
            : {};
        const normalizedPlayers = {};

        Object.entries(sourcePlayers).forEach(([uid, rawPlayer]) => {
            if (!uid || !rawPlayer || typeof rawPlayer !== 'object') return;

            const sourceScores = rawPlayer?.gameScores && typeof rawPlayer.gameScores === 'object'
                ? rawPlayer.gameScores
                : {};
            const gameScores = {};
            Object.entries(sourceScores).forEach(([gameId, score]) => {
                const safeScore = toSafeScore(score);
                if (!gameId || safeScore <= 0) return;
                gameScores[gameId] = safeScore;
            });

            const overallScore = Object.values(gameScores).reduce((sum, score) => sum + toSafeScore(score), 0);
            normalizedPlayers[uid] = {
                uid,
                nickname: String(rawPlayer.nickname || 'Player'),
                avatar: String(rawPlayer.avatar || 'default'),
                updatedAt: toSafeTimestamp(rawPlayer.updatedAt),
                gameScores,
                overallScore
            };
        });

        return {
            version: LOCAL_FALLBACK_VERSION,
            revision: Math.max(1, Math.floor(Number(raw?.revision || 1))),
            updatedAt: toSafeTimestamp(raw?.updatedAt, fallback.updatedAt),
            season: {
                id: String(raw?.season?.id || fallback.season.id),
                startAt: toSafeTimestamp(raw?.season?.startAt, fallback.season.startAt),
                endAt: toSafeTimestamp(raw?.season?.endAt, fallback.season.endAt),
                timezone: 'Asia/Seoul',
                resetRule: 'weekly Monday 09:00 KST'
            },
            players: normalizedPlayers
        };
    }

    loadLocalFallbackState() {
        if (this.localFallbackLoaded) return;
        this.localFallbackLoaded = true;

        try {
            const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
            if (!raw) {
                this.localFallbackState = this.createEmptyLocalFallbackState();
            } else {
                this.localFallbackState = this.normalizeLocalFallbackState(JSON.parse(raw));
            }
        } catch (_error) {
            this.localFallbackState = this.createEmptyLocalFallbackState();
        }

        this.ensureLocalFallbackSeason();
    }

    persistLocalFallbackState() {
        try {
            localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(this.localFallbackState));
        } catch (_error) {
            // ignore quota/storage failures for fallback mode
        }
    }

    ensureLocalFallbackSeason() {
        const latest = computeKstSeasonWindow(Date.now());
        if (this.localFallbackState?.season?.id === latest.id) return false;

        this.localFallbackState = {
            version: LOCAL_FALLBACK_VERSION,
            revision: (Number(this.localFallbackState?.revision) || 1) + 1,
            updatedAt: Date.now(),
            season: latest,
            players: {}
        };
        this.persistLocalFallbackState();
        return true;
    }

    buildGameHighScoresMap() {
        const allGameStats = storage.getAllGameStats() || {};
        const highScores = {};

        Object.entries(allGameStats).forEach(([gameId, gameData]) => {
            const highScore = toSafeScore(gameData?.highScore);
            if (!gameId || highScore <= 0) return;
            highScores[gameId] = highScore;
        });

        return highScores;
    }

    resolvePlayerProfile() {
        const profile = storage.getProfile() || {};
        return {
            uid: profile.cloudUid || profile.id || 'local-player',
            nickname: profile.nickname || 'Player',
            avatar: profile.avatar || 'default'
        };
    }

    setSource(source) {
        this.context.source = source;
    }

    syncLocalFallback(player, gameScores) {
        this.loadLocalFallbackState();
        this.ensureLocalFallbackSeason();

        const uid = String(player.uid || '').trim() || 'local-player';
        const existing = this.localFallbackState.players[uid] || {
            uid,
            nickname: player.nickname || 'Player',
            avatar: player.avatar || 'default',
            updatedAt: Date.now(),
            gameScores: {},
            overallScore: 0
        };

        const nextGameScores = { ...existing.gameScores };
        Object.entries(gameScores || {}).forEach(([gameId, score]) => {
            const safeScore = toSafeScore(score);
            if (!gameId || safeScore <= 0) return;
            const prev = toSafeScore(nextGameScores[gameId]);
            if (safeScore > prev) nextGameScores[gameId] = safeScore;
        });

        const overallScore = Object.values(nextGameScores).reduce((sum, score) => sum + toSafeScore(score), 0);
        this.localFallbackState.players[uid] = {
            uid,
            nickname: player.nickname || existing.nickname || 'Player',
            avatar: player.avatar || existing.avatar || 'default',
            updatedAt: Date.now(),
            gameScores: nextGameScores,
            overallScore
        };
        this.localFallbackState.revision += 1;
        this.localFallbackState.updatedAt = Date.now();
        this.persistLocalFallbackState();

        this.setSource('local-fallback');
        return {
            enabled: true,
            signedIn: true,
            uid,
            overallScore,
            season: this.localFallbackState.season,
            revision: this.localFallbackState.revision,
            source: 'local-fallback'
        };
    }

    getLocalSortedEntries(scoreSelector) {
        const players = Object.values(this.localFallbackState.players || {});
        return players
            .map((entry) => ({
                uid: String(entry.uid || ''),
                nickname: String(entry.nickname || 'Player'),
                avatar: String(entry.avatar || 'default'),
                score: toSafeScore(scoreSelector(entry)),
                updatedAt: toSafeTimestamp(entry.updatedAt)
            }))
            .filter((entry) => entry.uid && entry.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
                return a.uid.localeCompare(b.uid, 'en');
            })
            .map((entry, index) => ({
                rank: index + 1,
                uid: entry.uid,
                nickname: entry.nickname,
                avatar: entry.avatar,
                score: entry.score
            }));
    }

    getLocalSnapshot({ gameIds = [], topLimit } = {}) {
        this.loadLocalFallbackState();
        this.ensureLocalFallbackSeason();

        const player = this.resolvePlayerProfile();
        const uid = String(player.uid || '').trim() || 'local-player';
        const limit = clampTopLimit(topLimit);
        const normalizedGameIds = Array.from(new Set((gameIds || []).filter(Boolean)));

        const overallRanked = this.getLocalSortedEntries((entry) => entry.overallScore);
        const myOverall = overallRanked.find((entry) => entry.uid === uid) || null;

        const games = {};
        normalizedGameIds.forEach((gameId) => {
            const ranked = this.getLocalSortedEntries((entry) => entry?.gameScores?.[gameId]);
            games[gameId] = {
                top: ranked.slice(0, limit),
                my: ranked.find((entry) => entry.uid === uid) || null
            };
        });

        this.setSource('local-fallback');
        return {
            enabled: true,
            overallTop: overallRanked.slice(0, limit),
            myOverall,
            games,
            season: this.localFallbackState.season,
            revision: this.localFallbackState.revision,
            generatedAt: Date.now(),
            source: 'local-fallback'
        };
    }

    async syncFromLocal(_gameId = null) {
        await this.init();

        const now = Date.now();
        if (this.syncInFlight) return this.syncInFlight;
        if (this.lastSyncResult && (now - this.lastSyncAt) < SYNC_DEBOUNCE_MS) {
            return this.lastSyncResult;
        }

        const player = this.resolvePlayerProfile();
        const gameScores = this.buildGameHighScoresMap();
        const payload = {
            playerId: player.uid,
            nickname: player.nickname,
            avatar: player.avatar,
            gameScores
        };

        this.syncInFlight = this.requestJson('/api/leaderboard/sync', {
            method: 'POST',
            body: payload
        })
            .then((result) => {
                this.setSource('server');
                this.lastSyncAt = Date.now();
                this.lastSyncResult = {
                    enabled: true,
                    signedIn: true,
                    uid: player.uid,
                    overallScore: toSafeScore(result?.player?.overallScore),
                    season: result?.season || null,
                    revision: Number(result?.revision || 0),
                    source: 'server'
                };
                return this.lastSyncResult;
            })
            .catch((error) => {
                const fallback = this.syncLocalFallback(player, gameScores);
                this.lastSyncAt = Date.now();
                this.lastSyncResult = {
                    ...fallback,
                    backendError: error?.message || String(error)
                };
                return this.lastSyncResult;
            })
            .finally(() => {
                this.syncInFlight = null;
            });

        return this.syncInFlight;
    }

    normalizeServerSnapshot(result, player) {
        const gamesPayload = result?.games && typeof result.games === 'object'
            ? result.games
            : {};

        const normalizedGames = {};
        Object.entries(gamesPayload).forEach(([gameId, gameRanking]) => {
            const my = gameRanking?.my && typeof gameRanking.my === 'object'
                ? {
                    rank: Number.isFinite(Number(gameRanking.my.rank))
                        ? Math.floor(Number(gameRanking.my.rank))
                        : null,
                    uid: String(gameRanking.my.uid || player.uid),
                    nickname: String(gameRanking.my.nickname || player.nickname || 'Player'),
                    avatar: String(gameRanking.my.avatar || player.avatar || 'default'),
                    score: toSafeScore(gameRanking.my.score)
                }
                : null;

            normalizedGames[gameId] = {
                top: normalizeEntries(gameRanking?.top || []),
                my
            };
        });

        const myOverall = result?.myOverall && typeof result.myOverall === 'object'
            ? {
                rank: Number.isFinite(Number(result.myOverall.rank))
                    ? Math.floor(Number(result.myOverall.rank))
                    : null,
                uid: String(result.myOverall.uid || player.uid),
                nickname: String(result.myOverall.nickname || player.nickname || 'Player'),
                avatar: String(result.myOverall.avatar || player.avatar || 'default'),
                score: toSafeScore(result.myOverall.score)
            }
            : null;

        this.setSource('server');
        return {
            enabled: Boolean(result?.enabled ?? true),
            overallTop: normalizeEntries(result?.overallTop || []),
            myOverall,
            games: normalizedGames,
            season: result?.season || null,
            revision: Number(result?.revision || 0),
            generatedAt: Number(result?.generatedAt || Date.now()),
            source: 'server'
        };
    }

    async fetchSnapshot({ gameIds = [], topLimit } = {}) {
        await this.init();

        const player = this.resolvePlayerProfile();
        const query = {
            playerId: player.uid,
            topLimit: clampTopLimit(topLimit),
            gameIds: Array.from(new Set((gameIds || []).filter(Boolean))).join(',')
        };

        try {
            const result = await this.requestJson('/api/leaderboard/snapshot', {
                method: 'GET',
                query
            });
            return this.normalizeServerSnapshot(result, player);
        } catch (_error) {
            return this.getLocalSnapshot({ gameIds, topLimit });
        }
    }

    async getLeaderboardSnapshot({ gameId, topLimit } = {}) {
        const snapshot = await this.fetchSnapshot({
            gameIds: gameId ? [gameId] : [],
            topLimit
        });
        return {
            enabled: snapshot.enabled,
            overallTop: snapshot.overallTop,
            gameTop: gameId ? (snapshot.games?.[gameId]?.top || []) : [],
            myOverall: snapshot.myOverall,
            myGame: gameId ? (snapshot.games?.[gameId]?.my || null) : null,
            season: snapshot.season,
            revision: snapshot.revision,
            source: snapshot.source || this.context.source
        };
    }

    async getAllGameLeaderboardSnapshot({ gameIds = [], topLimit } = {}) {
        return this.fetchSnapshot({ gameIds, topLimit });
    }

    subscribeRealtime(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        this.realtimeListeners.add(listener);
        this.ensureRealtimeConnection();

        return () => {
            this.realtimeListeners.delete(listener);
            if (this.realtimeListeners.size === 0) {
                this.closeRealtimeConnection();
            }
        };
    }

    ensureRealtimeConnection() {
        if (this.realtimeSource || typeof window === 'undefined' || typeof EventSource === 'undefined') {
            return;
        }

        try {
            const url = this.buildApiUrl('/api/leaderboard/events');
            const source = new EventSource(url.toString());
            this.realtimeSource = source;

            const handlePush = (event) => {
                let payload = null;
                try {
                    payload = event?.data ? JSON.parse(event.data) : null;
                } catch (_error) {
                    payload = null;
                }

                this.realtimeListeners.forEach((fn) => {
                    try {
                        fn(payload || {});
                    } catch (error) {
                        console.warn('Leaderboard realtime listener failed:', error);
                    }
                });
            };

            source.addEventListener('ready', handlePush);
            source.addEventListener('update', handlePush);
            source.onmessage = handlePush;
            source.onerror = () => {
                this.closeRealtimeConnection();
                if (this.realtimeListeners.size === 0) return;

                this.realtimeReconnectTimer = window.setTimeout(() => {
                    this.realtimeReconnectTimer = null;
                    this.ensureRealtimeConnection();
                }, 3000);
            };
        } catch (error) {
            console.warn('Failed to open leaderboard realtime channel:', error);
        }
    }

    closeRealtimeConnection() {
        if (this.realtimeReconnectTimer) {
            window.clearTimeout(this.realtimeReconnectTimer);
            this.realtimeReconnectTimer = null;
        }

        if (!this.realtimeSource) return;
        this.realtimeSource.close();
        this.realtimeSource = null;
    }
}

export const leaderboardService = new LeaderboardService();
