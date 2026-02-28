/**
 * GameHub - dashboard, game launcher, and popup UIs
 */
import { storage } from '../systems/StorageManager.js';
import { ShareManager } from './ShareManager.js';
import { AchievementSystem } from './AchievementSystem.js';
import { cloudAuth } from '../services/CloudAuthService.js';
import { leaderboardService } from '../services/LeaderboardService.js';

const GAME_CARD_PRESETS = {
    'neon-block': {
        name: 'Neon Block Evolution',
        description: 'Neon style block breaker',
        icon: '🧱',
        color: '#00f2ff',
        gradient: ['#00f2ff', '#ff00ff']
    },
    'neon-findmine': {
        name: 'Bloody Field',
        description: 'Gothic minesweeper challenge',
        icon: '🩸',
        color: '#ff3131',
        gradient: ['#8b0000', '#ff3131']
    },
    'neon-slotmachine': {
        name: 'Neon Slot Mania',
        description: 'Neon slot machine arcade',
        icon: '🎰',
        color: '#bc13fe',
        gradient: ['#bc13fe', '#ff00ff']
    },
    'neon-survivor': {
        name: 'Neon Survivor',
        description: 'Wave-based survival action',
        icon: '🔥',
        color: '#ff0044',
        gradient: ['#ff0044', '#ffcc00']
    },
    'neon-biztycoon': {
        name: 'Neon Biz Tycoon',
        description: 'Corporate strategy roguelike',
        icon: '💼',
        color: '#38d4ff',
        gradient: ['#38d4ff', '#8b5cf6']
    },
    'neon-survivors-gpt': {
        name: 'Neon Survivors GPT',
        description: 'JSX mini game',
        icon: 'S',
        color: '#2ea8ff',
        gradient: ['#2ea8ff', '#7c5bff']
    }
};

const LEADERBOARD_REFRESH_INTERVAL_MS = 180000;

export class GameHub {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.games = [];
        this.gameRegistry = new Map();

        this.currentGame = null;
        this.currentSession = null;
        this.gameInstance = null;

        this.shareManager = new ShareManager();
        this.achievementSystem = new AchievementSystem();

        this.authState = {
            enabled: false,
            isSignedIn: false,
            user: null
        };
        this.activeTab = 'play';
        this.leaderboardState = {
            enabled: false,
            overallTop: [],
            myOverall: null,
            games: {},
            season: null,
            source: 'server',
            loading: false,
            error: null,
            lastUpdatedAt: null
        };
        this.refreshLeaderboardPromise = null;
        this.refreshLeaderboardTimer = null;
        this.unsubscribeLeaderboardRealtime = null;
        this.unsubscribeAuthListener = null;

        this.eventsBound = false;
        this.discoveryStarted = false;
        this.runtimeBasePath = this.resolveRuntimeBasePath();
        this.handleContainerClick = this.handleContainerClick.bind(this);
        this.handleWindowMessage = this.handleWindowMessage.bind(this);
        this.handleAuthStateChange = this.handleAuthStateChange.bind(this);

        this.init();
    }

    init() {
        this.render();
        this.setupEventListeners();
        this.discoverGames();
        this.bootstrapCloud();
    }

    async discoverGames() {
        if (this.discoveryStarted) return;
        this.discoveryStarted = true;

        try {
            const [htmlEntries, jsxEntries] = await Promise.all([
                this.loadHtmlGameEntries(),
                this.loadJsxGameEntries()
            ]);

            const htmlConfigs = await Promise.all(htmlEntries.map((entry) => this.toHtmlGameConfig(entry)));
            const jsxConfigs = jsxEntries.map((entry) => this.toJsxGameConfig(entry));
            const discoveredConfigs = this.resolveDiscoveredConfigs(
                [...htmlConfigs, ...jsxConfigs].filter(Boolean)
            );
            if (!discoveredConfigs.length) return;

            if (this.hasCatalogChanged(discoveredConfigs)) {
                this.games = discoveredConfigs;
                this.gameRegistry = new Map(
                    discoveredConfigs.map((game) => [game.id, game])
                );
                this.render();
                this.refreshLeaderboards({ force: true });
            }
        } catch (error) {
            console.warn('Failed to discover games:', error);
        }
    }

    resolveDiscoveredConfigs(configs) {
        const resolvedById = new Map();

        configs.forEach((config) => {
            if (!config?.id || config.enabled === false) return;

            const current = resolvedById.get(config.id);
            if (!current || this.isPreferredSource(config, current)) {
                resolvedById.set(config.id, config);
            }
        });

        return Array.from(resolvedById.values())
            .sort((a, b) => {
                const orderDiff = this.getSortOrder(a) - this.getSortOrder(b);
                if (orderDiff !== 0) return orderDiff;
                return (a.name || a.id).localeCompare((b.name || b.id), 'ko-KR');
            });
    }

    hasCatalogChanged(nextCatalog) {
        if (this.games.length !== nextCatalog.length) return true;

        for (let index = 0; index < nextCatalog.length; index += 1) {
            const previous = this.games[index];
            const next = nextCatalog[index];
            if (!previous || !next) return true;

            const changed = previous.id !== next.id
                || previous.name !== next.name
                || previous.description !== next.description
                || previous.icon !== next.icon
                || previous.color !== next.color
                || previous.gradient?.[0] !== next.gradient?.[0]
                || previous.gradient?.[1] !== next.gradient?.[1]
                || previous.order !== next.order
                || previous.sourcePriority !== next.sourcePriority
                || previous.source?.type !== next.source?.type
                || previous.source?.path !== next.source?.path
                || previous.source?.html !== next.source?.html;

            if (changed) return true;
        }

        return false;
    }

    isPreferredSource(candidate, current) {
        const candidatePriority = this.getSourcePriority(candidate);
        const currentPriority = this.getSourcePriority(current);
        if (candidatePriority !== currentPriority) {
            return candidatePriority > currentPriority;
        }

        const candidateOrder = this.getSortOrder(candidate);
        const currentOrder = this.getSortOrder(current);
        if (candidateOrder !== currentOrder) {
            return candidateOrder < currentOrder;
        }

        const candidateType = candidate.source?.type || '';
        const currentType = current.source?.type || '';
        if (candidateType !== currentType) {
            return candidateType === 'jsx';
        }

        return false;
    }

    getNumericOrFallback(value, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return parsed;
    }

    getSortOrder(config) {
        return this.getNumericOrFallback(config?.order, Number.MAX_SAFE_INTEGER);
    }

    getSourcePriority(config) {
        const typeDefaults = {
            html: 10,
            jsx: 20,
            module: 30
        };
        const fallback = typeDefaults[config?.source?.type] ?? 0;
        return this.getNumericOrFallback(config?.sourcePriority, fallback);
    }

    resolveRuntimeBasePath() {
        const pathname = window.location.pathname || '/';
        if (!pathname || pathname === '/') return '/';

        if (pathname.endsWith('/')) {
            return pathname;
        }

        const lastSegment = pathname.split('/').pop() || '';
        if (lastSegment.includes('.')) {
            const lastSlash = pathname.lastIndexOf('/');
            if (lastSlash < 0) return '/';
            return `${pathname.slice(0, lastSlash + 1)}`;
        }

        return `${pathname}/`;
    }

    createCacheToken() {
        return `${Date.now()}-${Math.floor(Math.random() * 1000000).toString(36)}`;
    }

    appendCacheBust(path, token = this.createCacheToken()) {
        if (!path || typeof path !== 'string') return path;

        const hashIndex = path.indexOf('#');
        const basePath = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
        const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
        const separator = basePath.includes('?') ? '&' : '?';
        return `${basePath}${separator}_v=${encodeURIComponent(token)}${hash}`;
    }

    resolveRuntimePath(rawPath) {
        if (!rawPath || typeof rawPath !== 'string') return '';
        const trimmed = rawPath.trim();
        if (!trimmed) return '';

        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }

        const cleaned = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
        if (cleaned.startsWith('/')) {
            if (this.runtimeBasePath === '/' || !cleaned.startsWith('/src/')) {
                return cleaned;
            }
            return `${this.runtimeBasePath.replace(/\/$/, '')}${cleaned}`;
        }

        return `${this.runtimeBasePath}${cleaned.replace(/^\/+/, '')}`;
    }

    buildRuntimeAssetUrl(path, options = {}) {
        const { cacheBust = false, token } = options;
        const resolvedPath = this.resolveRuntimePath(path);
        if (!resolvedPath) return '';
        if (!cacheBust) return resolvedPath;
        return this.appendCacheBust(resolvedPath, token);
    }

    attachIframeLoadGuard(canvasWrapper, game, iframeSrc) {
        const iframe = canvasWrapper.querySelector('#gameIframe');
        if (!iframe) return;

        let completed = false;
        const timeoutId = window.setTimeout(() => {
            if (completed || !canvasWrapper.contains(iframe)) return;

            canvasWrapper.innerHTML = `
                <div class="glass-panel" style="padding:16px;text-align:center;max-width:min(520px,90vw);">
                    <p class="neon-text-pink" style="margin:0 0 8px;">게임 화면을 불러오지 못했습니다.</p>
                    <p class="text-muted" style="margin:0 0 10px;">캐시된 파일 또는 경로 문제일 수 있습니다.</p>
                    <code style="font-size:0.7rem;word-break:break-all;opacity:0.85;">${iframeSrc}</code>
                </div>
            `;
            console.warn(`Game iframe load timeout: ${game?.id || 'unknown'}`, iframeSrc);
        }, 10000);

        const complete = () => {
            completed = true;
            window.clearTimeout(timeoutId);
        };

        iframe.addEventListener('load', complete, { once: true });
        iframe.addEventListener('error', () => {
            if (completed) return;
            complete();
            canvasWrapper.innerHTML = `
                <div class="glass-panel" style="padding:16px;text-align:center;">
                    <p class="neon-text-pink" style="margin:0 0 8px;">게임 로딩 실패</p>
                    <code style="font-size:0.7rem;word-break:break-all;opacity:0.85;">${iframeSrc}</code>
                </div>
            `;
        }, { once: true });
    }

    async loadHtmlGameEntries() {
        const [fromRegistry, fromDirectory] = await Promise.all([
            this.loadHtmlGameEntriesFromRegistry(),
            this.loadHtmlGameEntriesFromDirectoryListing()
        ]);
        return this.mergeDiscoveredEntries(fromRegistry, fromDirectory, (entry) => {
            if (typeof entry === 'string') {
                return this.normalizeHtmlPath(entry);
            }
            if (entry && typeof entry === 'object') {
                return this.normalizeHtmlPath(entry.path || entry.file || '');
            }
            return null;
        });
    }

    async loadHtmlGameEntriesFromRegistry() {
        try {
            const response = await fetch(
                this.buildRuntimeAssetUrl('/src/html/registry.json', { cacheBust: true }),
                { cache: 'no-store' }
            );
            if (!response.ok) return [];
            const data = await response.json();
            if (Array.isArray(data)) return data;
            if (Array.isArray(data?.games)) return data.games;
            return [];
        } catch (error) {
            return [];
        }
    }

    async loadHtmlGameEntriesFromDirectoryListing() {
        try {
            const response = await fetch(
                this.buildRuntimeAssetUrl('/src/html/', { cacheBust: true }),
                { cache: 'no-store' }
            );
            if (!response.ok) return [];

            const html = await response.text();
            const matches = [...html.matchAll(/href=["']([^"']+\.html)["']/gi)];
            const paths = matches.map((match) => this.normalizeHtmlPath(match[1]));
            return Array.from(new Set(paths)).filter(Boolean).sort();
        } catch (error) {
            return [];
        }
    }

    async loadJsxGameEntries() {
        const [fromRegistry, fromDirectory] = await Promise.all([
            this.loadJsxGameEntriesFromRegistry(),
            this.loadJsxGameEntriesFromDirectoryListing()
        ]);
        return this.mergeDiscoveredEntries(fromRegistry, fromDirectory, (entry) => {
            if (typeof entry === 'string') {
                return this.normalizeJsxPath(entry);
            }
            if (entry && typeof entry === 'object') {
                return this.normalizeJsxPath(entry.path || entry.scriptPath || entry.script || '');
            }
            return null;
        });
    }

    async loadJsxGameEntriesFromRegistry() {
        try {
            const response = await fetch(
                this.buildRuntimeAssetUrl('/src/jsx/registry.json', { cacheBust: true }),
                { cache: 'no-store' }
            );
            if (!response.ok) return [];
            const data = await response.json();
            if (Array.isArray(data)) return data;
            if (Array.isArray(data?.games)) return data.games;
            return [];
        } catch (error) {
            return [];
        }
    }

    async loadJsxGameEntriesFromDirectoryListing() {
        try {
            const response = await fetch(
                this.buildRuntimeAssetUrl('/src/jsx/', { cacheBust: true }),
                { cache: 'no-store' }
            );
            if (!response.ok) return [];

            const html = await response.text();
            const matches = [...html.matchAll(/href=["']([^"']+\.jsx)["']/gi)];
            const paths = matches.map((match) => this.normalizeJsxPath(match[1]));
            return Array.from(new Set(paths)).filter(Boolean).sort();
        } catch (error) {
            return [];
        }
    }

    mergeDiscoveredEntries(primaryEntries, secondaryEntries, normalizeEntry) {
        if (!Array.isArray(primaryEntries) || primaryEntries.length === 0) {
            return Array.isArray(secondaryEntries) ? secondaryEntries : [];
        }

        const merged = [...primaryEntries];
        const knownPaths = new Set(
            primaryEntries
                .map((entry) => normalizeEntry(entry))
                .filter(Boolean)
        );

        (secondaryEntries || []).forEach((entry) => {
            const normalized = normalizeEntry(entry);
            if (!normalized || knownPaths.has(normalized)) return;
            merged.push(normalized);
            knownPaths.add(normalized);
        });

        return merged;
    }

    normalizeFilePath(rawPath, folder, extension) {
        if (!rawPath || typeof rawPath !== 'string') return null;

        let path = rawPath.trim();
        if (!path) return null;

        try {
            if (path.startsWith('http://') || path.startsWith('https://')) {
                path = new URL(path).pathname;
            }
        } catch (error) {
            return null;
        }

        path = decodeURIComponent(path);
        path = path.replace(/\\/g, '/');
        if (path.includes('?')) path = path.split('?')[0];
        if (path.includes('#')) path = path.split('#')[0];

        const folderToken = `/src/${folder}/`;
        const relativeToken = `src/${folder}/`;
        if (path.includes(folderToken)) {
            path = path.slice(path.indexOf(folderToken));
        } else if (path.startsWith(relativeToken)) {
            path = `/${path}`;
        }

        if (path.startsWith('./')) {
            path = path.slice(2);
        }
        if (!path.startsWith('/')) {
            path = `/src/${folder}/${path}`;
        }
        if (!path.toLowerCase().endsWith(extension)) {
            return null;
        }

        return path;
    }

    normalizeHtmlPath(rawPath) {
        return this.normalizeFilePath(rawPath, 'html', '.html');
    }

    normalizeJsxPath(rawPath) {
        const path = this.normalizeFilePath(rawPath, 'jsx', '.jsx');
        if (!path) return null;

        const fileName = path.split('/').pop() || '';
        const lowerFileName = fileName.toLowerCase();
        if (
            lowerFileName === 'minigameframe.jsx'
            || lowerFileName.endsWith('.test.jsx')
            || lowerFileName.endsWith('.spec.jsx')
            || lowerFileName.startsWith('_')
        ) {
            return null;
        }

        return path;
    }

    toGameIdFromStem(stem) {
        return stem
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    toDisplayNameFromStem(stem) {
        return stem
            .split(/[_-]+/)
            .filter(Boolean)
            .map((word) => {
                const lower = word.toLowerCase();
                if (lower === 'gpt') return 'GPT';
                return lower.charAt(0).toUpperCase() + lower.slice(1);
            })
            .join(' ');
    }

    getGameCardPreset(gameId) {
        return GAME_CARD_PRESETS[gameId] || null;
    }

    resolveEntryEnabled(entry) {
        if (!entry || typeof entry !== 'object') {
            return true;
        }

        if (entry.hidden === true) {
            return false;
        }
        if (entry.enabled === false) {
            return false;
        }
        return true;
    }

    resolveEntryOrder(entry) {
        const parsed = Number(entry?.order);
        if (!Number.isFinite(parsed)) {
            return null;
        }
        return Math.floor(parsed);
    }

    resolveEntrySourcePriority(entry, fallback) {
        const priority = entry?.sourcePriority ?? entry?.priority;
        return this.getNumericOrFallback(priority, fallback);
    }

    toHtmlGameConfig(entry) {
        let sourcePath = '';
        let id = '';
        let name = '';
        let description = '';
        let icon = '';
        let color = '';
        let gradient = null;
        let enabled = true;
        let order = null;
        let sourcePriority = 10;

        if (typeof entry === 'string') {
            sourcePath = this.normalizeHtmlPath(entry) || '';
        } else if (entry && typeof entry === 'object') {
            sourcePath = this.normalizeHtmlPath(entry.path || entry.file || '');
            enabled = this.resolveEntryEnabled(entry);
            order = this.resolveEntryOrder(entry);
            sourcePriority = this.resolveEntrySourcePriority(entry, 10);
            id = typeof entry.id === 'string' ? entry.id : '';
            name = typeof entry.name === 'string' ? entry.name : '';
            description = typeof entry.description === 'string' ? entry.description : '';
            icon = typeof entry.icon === 'string' && entry.icon ? entry.icon : '';
            color = typeof entry.color === 'string' && entry.color ? entry.color : '';
            if (Array.isArray(entry.gradient) && entry.gradient.length >= 2) {
                gradient = [entry.gradient[0], entry.gradient[1]];
            }
        }

        if (!sourcePath) return null;
        if (!enabled) return null;
        const fileName = sourcePath.split('/').pop() || '';
        const stem = fileName.replace(/\.html$/i, '');
        if (!stem) return null;

        const gameId = id || this.toGameIdFromStem(stem);
        if (!gameId) return null;

        const preset = this.getGameCardPreset(gameId);
        const gameName = name || preset?.name || this.toDisplayNameFromStem(stem);
        const gameDescription = description || preset?.description || 'HTML mini game';
        const gameIcon = icon || preset?.icon || '\uD83C\uDFAE';
        const gameColor = color || preset?.color || '#3cc6ff';
        const gameGradient = gradient || preset?.gradient || [gameColor, '#6f5bff'];

        return {
            id: gameId,
            name: gameName,
            description: gameDescription,
            icon: gameIcon,
            color: gameColor,
            gradient: gameGradient,
            enabled,
            order,
            sourcePriority,
            source: {
                type: 'html',
                path: sourcePath
            }
        };
    }

    toJsxGameConfig(entry) {
        let sourcePath = '';
        let id = '';
        let name = '';
        let description = '';
        let icon = '';
        let color = '';
        let gradient = null;
        let htmlPath = '';
        let enabled = true;
        let order = null;
        let sourcePriority = 20;

        if (typeof entry === 'string') {
            sourcePath = this.normalizeJsxPath(entry) || '';
        } else if (entry && typeof entry === 'object') {
            sourcePath = this.normalizeJsxPath(entry.path || entry.scriptPath || entry.script || '');
            enabled = this.resolveEntryEnabled(entry);
            order = this.resolveEntryOrder(entry);
            sourcePriority = this.resolveEntrySourcePriority(entry, 20);
            id = typeof entry.id === 'string' ? entry.id : '';
            name = typeof entry.name === 'string' ? entry.name : '';
            description = typeof entry.description === 'string' ? entry.description : '';
            icon = typeof entry.icon === 'string' && entry.icon ? entry.icon : '';
            color = typeof entry.color === 'string' && entry.color ? entry.color : '';
            htmlPath = typeof entry.htmlPath === 'string'
                ? entry.htmlPath
                : (typeof entry.html === 'string' ? entry.html : '');
            if (Array.isArray(entry.gradient) && entry.gradient.length >= 2) {
                gradient = [entry.gradient[0], entry.gradient[1]];
            }
        }

        if (!sourcePath) return null;
        if (!enabled) return null;
        const fileName = sourcePath.split('/').pop() || '';
        const stem = fileName.replace(/\.jsx$/i, '');
        if (!stem) return null;

        const gameId = id || this.toGameIdFromStem(stem);
        if (!gameId) return null;

        const preset = this.getGameCardPreset(gameId);
        const gameName = name || preset?.name || this.toDisplayNameFromStem(stem);
        const gameDescription = description || preset?.description || 'JSX mini game';
        const gameIcon = icon || preset?.icon || '\uD83C\uDFAE';
        const gameColor = color || preset?.color || '#3cc6ff';
        const gameGradient = gradient || preset?.gradient || [gameColor, '#6f5bff'];
        const fallbackHtmlPath = this.normalizeHtmlPath(`${stem}.html`) || '';
        const normalizedHtmlPath = this.normalizeHtmlPath(htmlPath) || fallbackHtmlPath;

        return {
            id: gameId,
            name: gameName,
            description: gameDescription,
            icon: gameIcon,
            color: gameColor,
            gradient: gameGradient,
            enabled,
            order,
            sourcePriority,
            source: {
                type: 'jsx',
                path: sourcePath,
                html: normalizedHtmlPath
            }
        };
    }

    async bootstrapCloud() {
        try {
            await cloudAuth.init();
            this.authState = cloudAuth.getState();
            this.unsubscribeAuthListener = cloudAuth.onChange(this.handleAuthStateChange);

            if (this.authState.isSignedIn) {
                this.syncProfileWithAuthUser(this.authState.user);
            }
        } catch (error) {
            console.warn('Cloud bootstrap failed:', error);
        }

        try {
            await leaderboardService.syncFromLocal();
        } catch (error) {
            console.warn('Initial leaderboard sync failed:', error);
        }

        this.setupRealtimeLeaderboard();
        this.startLeaderboardAutoRefresh();
        this.refreshLeaderboards({ force: true });
        this.render();
    }

    handleAuthStateChange(state) {
        this.authState = state;
        this.syncProfileWithAuthUser(state.user);

        leaderboardService.syncFromLocal()
            .then(() => {
                this.refreshLeaderboards({ force: true });
            })
            .catch((error) => {
                console.warn('Failed to sync leaderboard after auth change:', error);
            });

        this.refreshLeaderboards({ force: true });
        this.render();
    }

    syncProfileWithAuthUser(user) {
        const profile = storage.getProfile();

        if (!user) {
            if (profile.cloudUid || profile.provider !== 'guest') {
                storage.updateProfile({
                    cloudUid: null,
                    email: '',
                    provider: 'guest'
                });
            }
            return;
        }

        const updates = {
            cloudUid: user.uid,
            email: user.email || '',
            provider: user.providerId || 'oauth'
        };

        const isDifferentAccount = Boolean(profile.cloudUid && profile.cloudUid !== user.uid);
        if ((isDifferentAccount || !profile.nickname || profile.nickname === 'Player') && user.displayName) {
            updates.nickname = user.displayName;
        }

        storage.updateProfile(updates);
    }

    async handleLoginRequest(providerType) {
        try {
            if (providerType === 'apple') {
                const result = await cloudAuth.signInWithApple();
                if (result?.redirect) return;
            } else {
                const result = await cloudAuth.signInWithGoogle();
                if (result?.redirect) return;
            }
        } catch (error) {
            console.warn('Sign-in failed:', error);
            window.alert(`로그인에 실패했습니다.\n${error?.message || error}`);
        }
    }

    async handleLogoutRequest() {
        try {
            await cloudAuth.signOut();
        } catch (error) {
            console.warn('Sign-out failed:', error);
            window.alert(`로그아웃에 실패했습니다.\n${error?.message || error}`);
        }
    }

    startLeaderboardAutoRefresh() {
        if (this.refreshLeaderboardTimer) return;
        this.refreshLeaderboardTimer = window.setInterval(() => {
            this.refreshLeaderboards();
        }, LEADERBOARD_REFRESH_INTERVAL_MS);
    }

    stopLeaderboardAutoRefresh() {
        if (!this.refreshLeaderboardTimer) return;
        window.clearInterval(this.refreshLeaderboardTimer);
        this.refreshLeaderboardTimer = null;
    }

    setupRealtimeLeaderboard() {
        if (this.unsubscribeLeaderboardRealtime) return;

        this.unsubscribeLeaderboardRealtime = leaderboardService.subscribeRealtime(() => {
            this.refreshLeaderboards();
        });
    }

    getLocalOverallHighScoreTotal() {
        const gameStats = storage.getAllGameStats() || {};
        return Object.values(gameStats).reduce((total, gameData) => {
            return total + Number(gameData?.highScore || 0);
        }, 0);
    }

    applyRankingSnapshotToLocal(snapshotGames = {}) {
        if (!snapshotGames || typeof snapshotGames !== 'object') return;

        Object.entries(snapshotGames).forEach(([gameId, rankingData]) => {
            const rank = Number(rankingData?.my?.rank);
            if (!Number.isFinite(rank) || rank <= 0) return;
            storage.updateBestRank(gameId, rank);
        });
    }

    async refreshLeaderboards(options = {}) {
        const { force = false } = options;
        if (this.refreshLeaderboardPromise && !force) {
            return this.refreshLeaderboardPromise;
        }

        const runRefresh = async () => {
            this.leaderboardState.loading = true;
            this.leaderboardState.error = null;
            this.render();

            try {
                const snapshot = await leaderboardService.getAllGameLeaderboardSnapshot({
                    gameIds: this.games.map((game) => game.id),
                    topLimit: 5
                });
                this.applyRankingSnapshotToLocal(snapshot.games);

                this.leaderboardState = {
                    ...this.leaderboardState,
                    enabled: Boolean(snapshot.enabled ?? true),
                    overallTop: snapshot.overallTop || [],
                    myOverall: snapshot.myOverall || null,
                    games: snapshot.games || {},
                    season: snapshot.season || null,
                    source: snapshot.source || 'server',
                    loading: false,
                    error: null,
                    lastUpdatedAt: Date.now()
                };
            } catch (error) {
                console.warn('Failed to refresh leaderboards:', error);
                this.leaderboardState = {
                    ...this.leaderboardState,
                    loading: false,
                    error: error?.message || String(error)
                };
            }

            this.render();
        };

        this.refreshLeaderboardPromise = runRefresh()
            .finally(() => {
                this.refreshLeaderboardPromise = null;
            });

        return this.refreshLeaderboardPromise;
    }

    async syncLeaderboardAfterSession(gameId) {
        try {
            await leaderboardService.syncFromLocal(gameId);
            this.refreshLeaderboards({ force: true });
        } catch (error) {
            console.warn('Failed to sync leaderboard after session:', error);
        }
    }

    formatLeaderboardRank(rank) {
        if (!Number.isFinite(rank) || rank <= 0) return '-';
        return `${rank}위`;
    }

    formatKstDateTime(timestamp) {
        if (!Number.isFinite(Number(timestamp))) return '-';
        return new Date(timestamp).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    getLeaderboardStatusText() {
        if (this.leaderboardState.loading) {
            return '서버 랭킹 갱신 중...';
        }

        const season = this.leaderboardState.season || {};
        const source = String(this.leaderboardState.source || 'server');
        const nextResetText = this.formatKstDateTime(season.endAt);
        const lastUpdatedText = this.leaderboardState.lastUpdatedAt
            ? new Date(this.leaderboardState.lastUpdatedAt).toLocaleTimeString('ko-KR', { hour12: false })
            : '-';

        if (source === 'local-fallback') {
            return `로컬 백업 랭킹 · 서버 연결 대기 · 최근 갱신 ${lastUpdatedText} · 다음 초기화 ${nextResetText} (KST 월요일 09:00)`;
        }

        return `실시간 서버 랭킹 · 최근 갱신 ${lastUpdatedText} · 다음 초기화 ${nextResetText} (KST 월요일 09:00)`;
    }

    renderLeaderboardRows(entries) {
        if (!entries || entries.length === 0) {
            return '<li class="leaderboard-empty">기록이 아직 없습니다.</li>';
        }

        return entries.map((entry) => `
            <li class="leaderboard-row">
                <span class="leaderboard-rank">${entry.rank}</span>
                <span class="leaderboard-name">${entry.nickname || 'Player'}</span>
                <span class="leaderboard-score">${this.formatNumber(entry.score || 0)}</span>
            </li>
        `).join('');
    }

    resolveCloudDisabledMessage() {
        const reason = String(this.authState?.reason || 'disabled');
        const reasonMessages = {
            disabled: '클라우드 인증이 꺼져 있습니다.',
            'missing-firebase-keys': 'Firebase 키(apiKey/authDomain/projectId)가 비어 있습니다.',
            'bootstrap-failed': 'Firebase SDK 초기화에 실패했습니다.'
        };

        const reasonLabel = reasonMessages[reason] || `클라우드 초기화 실패: ${reason}`;
        return `${reasonLabel} src/config/cloud-config.js에 Firebase 설정을 입력하세요.`;
    }

    renderCloudAuthControl() {
        if (!this.authState.enabled) {
            return `
                <div class="leaderboard-auth-note">${this.resolveCloudDisabledMessage()}</div>
                <div class="leaderboard-auth-actions">
                    <button class="glass-btn leaderboard-auth-btn" data-action="open-cloud-config">클라우드 설정</button>
                </div>
            `;
        }

        if (this.authState.isSignedIn) {
            const user = this.authState.user || {};
            return `
                <div class="leaderboard-auth-user">
                    <span class="leaderboard-auth-text">연동됨: ${user.displayName || 'Player'}${user.email ? ` (${user.email})` : ''}</span>
                    <div style="display:flex;gap:8px;">
                        <button class="glass-btn leaderboard-auth-btn" data-action="open-cloud-config">설정</button>
                        <button class="glass-btn leaderboard-auth-btn" data-action="logout-cloud">로그아웃</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="leaderboard-auth-actions">
                <button class="glass-btn leaderboard-auth-btn" data-action="open-cloud-config">클라우드 설정</button>
                <button class="glass-btn leaderboard-auth-btn" data-action="login-google">Google 로그인</button>
                <button class="glass-btn leaderboard-auth-btn" data-action="login-apple">Apple 로그인</button>
            </div>
        `;
    }

    getDashboardTotals() {
        const profile = storage.getProfile();
        const totalPlayCount = storage.getTotalPlayCount();
        const achievementSummary = this.achievementSystem.getTotalProgress(
            this.games.map((game) => game.id)
        );

        return {
            totalPlayCount,
            achievementUnlocked: achievementSummary.unlocked,
            achievementTotal: achievementSummary.total,
            totalScore: profile.totalScore || 0,
            totalGames: this.games.length
        };
    }

    getGameLeaderboardSnapshot(gameId) {
        if (!gameId) return { top: [], my: null };
        return this.leaderboardState.games?.[gameId] || { top: [], my: null };
    }

    getGameLeaderboardSummary(gameId) {
        const gameSnapshot = this.getGameLeaderboardSnapshot(gameId);
        const gameData = storage.getGameData(gameId);
        const localHighScore = Number(gameData?.highScore || 0);
        const topScore = Number(gameSnapshot?.top?.[0]?.score || 0);
        const myRank = Number(gameSnapshot?.my?.rank);
        const safeMyRank = Number.isFinite(myRank) && myRank > 0 ? Math.floor(myRank) : null;
        const storedBestRank = Number(gameData?.bestRank);
        const safeStoredBestRank = Number.isFinite(storedBestRank) && storedBestRank > 0
            ? Math.floor(storedBestRank)
            : null;
        const bestRank = safeMyRank && safeStoredBestRank
            ? Math.min(safeMyRank, safeStoredBestRank)
            : (safeMyRank || safeStoredBestRank || null);
        const myScore = Number(gameSnapshot?.my?.score ?? localHighScore);

        return {
            top: Array.isArray(gameSnapshot?.top) ? gameSnapshot.top : [],
            topScore,
            myRank: safeMyRank,
            bestRank,
            myScore
        };
    }

    renderPlayTab() {
        return `
            <section class="tab-panel play-tab">
                <section class="game-gallery">
                    <h2 class="section-title font-display"><span class="neon-text-cyan">🎮</span>게임 플레이</h2>
                    <div class="game-grid stagger-children">${this.renderGameCards()}</div>
                </section>
            </section>
        `;
    }

    renderRankingGameCards() {
        if (!this.games.length) {
            return '<div class="leaderboard-auth-note">표시할 게임이 없습니다.</div>';
        }

        return this.games.map((game) => {
            const ranking = this.getGameLeaderboardSummary(game.id);
            const myRankDisplay = this.formatLeaderboardRank(ranking.myRank);
            const bestRankDisplay = this.formatLeaderboardRank(ranking.bestRank);
            const myScoreDisplay = ranking.myScore > 0 ? this.formatNumber(ranking.myScore) : '-';
            const topScoreDisplay = ranking.topScore > 0 ? this.formatNumber(ranking.topScore) : '-';

            return `
                <article class="ranking-game-card glass-card" data-game-id="${game.id}" style="--card-color:${game.color};">
                    <div class="ranking-game-header">
                        <span class="ranking-game-icon">${game.icon}</span>
                        <div class="ranking-game-title-wrap">
                            <h3 class="ranking-game-title font-display">${game.name}</h3>
                            <p class="ranking-game-desc">${game.description}</p>
                        </div>
                    </div>
                    <div class="ranking-game-metrics">
                        <span>내 랭킹 <strong>${myRankDisplay}</strong></span>
                        <span>최고 랭킹 <strong>${bestRankDisplay}</strong></span>
                        <span>내 점수 <strong>${myScoreDisplay}</strong></span>
                        <span>1위 점수 <strong>${topScoreDisplay}</strong></span>
                    </div>
                    <ol class="leaderboard-list ranking-mini-list">${this.renderLeaderboardRows(ranking.top.slice(0, 3))}</ol>
                    <div class="ranking-card-actions">
                        <button class="neon-btn" data-action="play">바로 플레이</button>
                        <button class="glass-btn" data-action="achievements">업적</button>
                        <button class="glass-btn" data-action="share">공유</button>
                    </div>
                </article>
            `;
        }).join('');
    }

    renderRankingTab(leaderboardStatus, overallScoreDisplay, overallRankDisplay) {
        return `
            <section class="tab-panel ranking-tab">
                <section class="leaderboard-section glass-panel">
                    <div class="leaderboard-header">
                        <h2 class="section-title font-display"><span class="neon-text-yellow">🏆</span>랭킹</h2>
                        <button class="glass-btn" data-action="refresh-leaderboard">새로고침</button>
                    </div>
                    <div class="leaderboard-subtext">${leaderboardStatus}</div>
                    ${this.leaderboardState.error ? `<div class="leaderboard-error">${this.leaderboardState.error}</div>` : ''}

                    <div class="ranking-overview">
                        <article class="leaderboard-card glass-card">
                            <h3 class="leaderboard-title">전체 랭킹</h3>
                            <ol class="leaderboard-list">${this.renderLeaderboardRows(this.leaderboardState.overallTop)}</ol>
                        </article>
                        <article class="my-score-item glass-card">
                            <span class="my-score-label">내 전체 랭킹 점수</span>
                            <span class="my-score-value neon-text-yellow">${this.formatNumber(overallScoreDisplay)}</span>
                            <span class="my-score-rank">${overallRankDisplay}</span>
                        </article>
                    </div>

                    <div class="ranking-game-grid">
                        ${this.renderRankingGameCards()}
                    </div>
                </section>
            </section>
        `;
    }

    render() {
        const profile = storage.getProfile();
        const totals = this.getDashboardTotals();
        const localOverallHighScore = this.getLocalOverallHighScoreTotal();
        const myOverall = this.leaderboardState.myOverall;
        const overallScoreDisplay = Number(myOverall?.score ?? localOverallHighScore);
        const overallRankDisplay = this.formatLeaderboardRank(myOverall?.rank);
        const leaderboardStatus = this.getLeaderboardStatusText();
        const activeTabContent = this.activeTab === 'ranking'
            ? this.renderRankingTab(leaderboardStatus, overallScoreDisplay, overallRankDisplay)
            : this.renderPlayTab();

        this.container.innerHTML = `
            <div class="hub-wrapper">
                <header class="hub-header glass-panel">
                    <div class="hub-logo">
                        <span class="neon-text-cyan font-display text-xl">MINIGAME</span>
                        <span class="neon-text-pink font-display text-xl">FACTORY</span>
                    </div>
                    <button class="profile-btn glass-btn" id="profileBtn">
                        <span class="avatar">${this.getAvatarEmoji(profile.avatar)}</span>
                        <span class="nickname">${profile.nickname}</span>
                    </button>
                </header>

                <div class="stats-bar glass-card">
                    <div class="stat-item"><span class="stat-value neon-text-pink">${totals.achievementUnlocked}/${totals.achievementTotal}</span><span class="stat-label">전체 업적</span></div>
                    <div class="stat-divider"></div>
                    <div class="stat-item"><span class="stat-value neon-text-yellow">${this.formatNumber(totals.totalScore)}</span><span class="stat-label">누적 점수</span></div>
                    <div class="stat-divider"></div>
                    <div class="stat-item"><span class="stat-value neon-text-cyan">${totals.totalGames}</span><span class="stat-label">게임 수</span></div>
                </div>

                <nav class="hub-tabs glass-card">
                    <button
                        class="hub-tab-btn ${this.activeTab === 'play' ? 'active' : ''}"
                        data-action="switch-tab"
                        data-tab="play"
                    >
                        게임 플레이
                    </button>
                    <button
                        class="hub-tab-btn ${this.activeTab === 'ranking' ? 'active' : ''}"
                        data-action="switch-tab"
                        data-tab="ranking"
                    >
                        랭킹
                    </button>
                </nav>

                ${activeTabContent}

                <div class="game-container" id="gameContainer" style="display:none;">
                    <div class="game-container-header">
                        <button class="back-btn glass-btn" id="backBtn">← 대시보드</button>
                        <div class="active-game-meta">
                            <span id="activeGameName">GAME</span>
                            <span id="activeSourceBadge" class="renderer-badge">HTML</span>
                        </div>
                    </div>
                    <div class="game-canvas-wrapper" id="gameCanvasWrapper"></div>
                </div>
            </div>
        `;

        this.addHubStyles();
    }

    renderGameCards() {
        return this.games.map((game) => {
            const gameData = storage.getGameData(game.id);
            const ranking = this.getGameLeaderboardSummary(game.id);
            const bestRankText = this.formatLeaderboardRank(ranking.bestRank);

            return `
                <article class="game-card glass-card" data-game-id="${game.id}" style="--card-color:${game.color};">
                    <div class="game-card-bg" style="background:linear-gradient(135deg, ${game.gradient[0]}22, ${game.gradient[1]}22);"></div>
                    <div class="game-card-content">
                        <div class="game-icon">${game.icon}</div>
                        <h3 class="game-name font-display">${game.name}</h3>
                        <p class="game-desc">${game.description}</p>
                        <div class="game-metrics"><span class="high-score">최고 점수 ${this.formatNumber(gameData.highScore)}</span><span class="ranking-count">최고 랭킹 ${bestRankText}</span></div>
                        <div class="game-actions game-actions-main">
                            <button class="neon-btn" data-action="play">플레이</button>
                        </div>
                        <div class="game-actions game-actions-sub">
                            <button class="glass-btn" data-action="achievements">업적</button>
                            <button class="glass-btn" data-action="share">공유</button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');
    }

    setupEventListeners() {
        if (this.eventsBound) return;
        this.container.addEventListener('click', this.handleContainerClick);
        window.addEventListener('message', this.handleWindowMessage);
        this.eventsBound = true;
    }

    handleContainerClick(event) {
        if (event.target.closest('#backBtn')) {
            this.exitGame();
            return;
        }

        if (event.target.closest('#profileBtn')) {
            this.showProfilePopup();
            return;
        }

        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'refresh-leaderboard') {
            this.refreshLeaderboards({ force: true });
            return;
        }
        if (action === 'login-google') {
            this.handleLoginRequest('google');
            return;
        }
        if (action === 'login-apple') {
            this.handleLoginRequest('apple');
            return;
        }
        if (action === 'logout-cloud') {
            this.handleLogoutRequest();
            return;
        }
        if (action === 'open-cloud-config') {
            this.showCloudConfigPopup();
            return;
        }
        if (action === 'switch-tab') {
            const tab = event.target.closest('[data-tab]')?.dataset.tab;
            if (tab !== 'play' && tab !== 'ranking') return;
            this.activeTab = tab;
            this.render();
            if (tab === 'ranking') {
                this.refreshLeaderboards();
            }
            return;
        }

        const gameCard = event.target.closest('[data-game-id]');
        if (!gameCard) return;

        const gameId = gameCard.dataset.gameId;
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        if (action === 'achievements') {
            this.showAchievementsPopup(gameId);
            return;
        }
        if (action === 'share') {
            this.showShareModal(gameId);
            return;
        }

        this.launchGame(gameId);
    }

    handleWindowMessage(event) {
        const data = event.data;
        if (!data || data.source !== 'mgp-game' || !this.currentSession) return;

        if (data.type === 'result') {
            this.recordCurrentSession(data.payload || {});
            return;
        }

        if (data.type === 'achievement' && data.payload?.achievementId && this.currentGame) {
            this.achievementSystem.unlock(this.currentGame, data.payload.achievementId);
        }
    }

    async launchGame(gameId) {
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        this.currentGame = gameId;
        this.startGameSession(gameId, game.source?.type || 'html');

        const gameContainer = document.getElementById('gameContainer');
        const canvasWrapper = document.getElementById('gameCanvasWrapper');
        document.getElementById('activeGameName').textContent = game.name;
        document.getElementById('activeSourceBadge').textContent = (game.source?.type || 'html').toUpperCase();

        gameContainer.style.display = 'flex';
        gameContainer.classList.add('animate-fadeIn');

        const source = game.source || {};
        if (source.type === 'html') {
            const cacheToken = this.createCacheToken();
            const iframeSrc = this.buildRuntimeAssetUrl(source.path, { cacheBust: true, token: cacheToken });
            canvasWrapper.innerHTML = `
                <iframe id="gameIframe" src="${iframeSrc}" class="game-iframe" allow="autoplay; fullscreen" allowfullscreen></iframe>
            `;
            this.attachIframeLoadGuard(canvasWrapper, game, iframeSrc);
            return;
        }

        if (source.type === 'jsx') {
            const iframeSrc = this.buildJsxRunnerUrl(gameId, source);
            canvasWrapper.innerHTML = `
                <iframe id="gameIframe" src="${iframeSrc}" class="game-iframe" allow="autoplay; fullscreen" allowfullscreen></iframe>
            `;
            this.attachIframeLoadGuard(canvasWrapper, game, iframeSrc);
            return;
        }

        if (source.type === 'module' && source.path) {
            try {
                const modulePath = this.buildRuntimeAssetUrl(source.path, { cacheBust: true });
                const module = await import(modulePath);
                const GameClass = module.default || module[Object.keys(module)[0]];
                canvasWrapper.innerHTML = '<canvas id="gameCanvas"></canvas>';
                this.gameInstance = new GameClass('gameCanvas', {
                    onGameOver: (result) => this.handleGameOver(gameId, result),
                    onAchievement: (achievementId) => this.achievementSystem.unlock(gameId, achievementId)
                });
                this.gameInstance.init();
                this.gameInstance.start();
            } catch (error) {
                console.error('Failed to load module game:', error);
                canvasWrapper.innerHTML = `
                    <div class="glass-panel" style="padding:16px;text-align:center;">
                        <p class="neon-text-pink">게임 로딩 실패</p>
                        <p class="text-muted">${error.message}</p>
                    </div>
                `;
            }
            return;
        }

        canvasWrapper.innerHTML = '<div class="glass-panel" style="padding:16px;">등록된 게임 파일이 없습니다.</div>';
    }

    buildJsxRunnerUrl(gameId, source) {
        const cacheToken = this.createCacheToken();
        const scriptPath = this.buildRuntimeAssetUrl(source.scriptPath || source.path || '', {
            cacheBust: true,
            token: cacheToken
        });
        const htmlPath = this.buildRuntimeAssetUrl(source.htmlPath || source.html || '', {
            cacheBust: true,
            token: cacheToken
        });
        const params = new URLSearchParams({
            gameId,
            script: scriptPath,
            html: htmlPath
        });
        const runnerPath = this.buildRuntimeAssetUrl('/src/platform/jsx-runner.html', {
            cacheBust: true,
            token: cacheToken
        });
        return `${runnerPath}#${params.toString()}`;
    }

    startGameSession(gameId, sourceType) {
        this.currentSession = {
            gameId,
            sourceType,
            startedAt: Date.now(),
            recorded: false
        };
    }

    normalizeSessionResult(result = {}) {
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - this.currentSession.startedAt) / 1000));
        const level = Number.isFinite(result.level) ? Math.floor(result.level) : 1;
        const maxCombo = Number.isFinite(result.maxCombo) ? Math.floor(result.maxCombo) : 0;
        const stageClears = Number.isFinite(result.stageClears) ? Math.floor(result.stageClears) : Math.max(0, level - 1);
        const comboCount = Number.isFinite(result.comboCount) ? Math.floor(result.comboCount) : maxCombo;
        const itemCounts = result.itemCounts && typeof result.itemCounts === 'object' ? result.itemCounts : {};
        const itemCountSum = Object.values(itemCounts).reduce((sum, count) => sum + (Number(count) || 0), 0);

        return {
            score: Number.isFinite(result.score) ? Math.floor(result.score) : 0,
            level,
            maxCombo,
            duration: Number.isFinite(result.duration) ? Math.floor(result.duration) : elapsedSeconds,
            clearTime: Number.isFinite(result.clearTime) ? Math.floor(result.clearTime) : null,
            stageClears: Math.max(0, stageClears),
            comboCount: Math.max(0, comboCount),
            itemCounts,
            itemsCollected: Number.isFinite(result.itemsCollected) ? Math.floor(result.itemsCollected) : Math.max(0, itemCountSum)
        };
    }

    collectSessionFromIframe(gameId) {
        const iframe = document.getElementById('gameIframe');
        if (!iframe || !iframe.contentWindow) return null;

        try {
            if (typeof iframe.contentWindow.__mgpSnapshot === 'function') {
                const snapshot = iframe.contentWindow.__mgpSnapshot();
                if (snapshot && typeof snapshot === 'object') {
                    return snapshot;
                }
            }
        } catch (error) {
            console.warn('Failed to collect iframe snapshot:', error);
        }

        const fallbackByGame = {
            'neon-block': `
                (() => {
                    try {
                        const level = Number(gameState?.level || 1);
                        const score = Number(gameState?.score || 0);
                        const maxCombo = Number(gameState?.combo || 0);
                        return {
                            score: Math.floor(score),
                            level: Math.floor(level),
                            maxCombo: Math.floor(maxCombo),
                            comboCount: Math.floor(maxCombo),
                            stageClears: Math.max(0, Math.floor(level - 1)),
                            itemsCollected: 0,
                            itemCounts: {}
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `,
            'neon-findmine': `
                (() => {
                    try {
                        const modeLevel = { easy: 1, medium: 2, hard: 3 };
                        const level = Number(modeLevel[curMode] || 1);
                        const targetReveal = (levels[curMode].r * levels[curMode].c) - levels[curMode].m;
                        const isWin = Boolean(isOver && revealed >= targetReveal);
                        const score = isWin
                            ? Math.floor((revealed * 12) + Math.max(0, (1200 - (time * 3)) * level))
                            : Math.floor(revealed * 2);
                        const flagCount = Math.max(0, Math.floor(Number(flags || 0)));
                        return {
                            score,
                            level,
                            maxCombo: 0,
                            comboCount: 0,
                            stageClears: isWin ? 1 : 0,
                            itemsCollected: flagCount,
                            itemCounts: { flag: flagCount }
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `,
            'neon-slotmachine': `
                (() => {
                    try {
                        const level = Math.floor(Number(state?.stage || 1));
                        const score = Math.floor(Number(state?.money || 0));
                        const stageClears = Math.max(0, level - 1);
                        const spinChip = Math.max(0, stageClears * 10);
                        return {
                            score,
                            level,
                            maxCombo: 0,
                            comboCount: 0,
                            stageClears,
                            itemsCollected: spinChip,
                            itemCounts: { spin_chip: spinChip }
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `,
            'neon-survivor': `
                (() => {
                    try {
                        const level = Math.floor(Number(wave || 1));
                        const scoreValue = Math.floor(Number(score || 0));
                        const maxComboValue = Math.floor(Number(combo || 0));
                        return {
                            score: scoreValue,
                            level,
                            maxCombo: maxComboValue,
                            comboCount: maxComboValue,
                            stageClears: Math.max(0, level - 1),
                            itemsCollected: 0,
                            itemCounts: {}
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `,
            'neon-jumpin': `
                (() => {
                    try {
                        const toNumber = (value) => {
                            const parsed = Number(String(value ?? '').replace(/[^0-9.-]+/g, ''));
                            return Number.isFinite(parsed) ? parsed : NaN;
                        };

                        const sceneManager = game?.scene;
                        const playScene = sceneManager?.keys?.PlayScene
                            || (typeof sceneManager?.getScene === 'function' ? sceneManager.getScene('PlayScene') : null);

                        const scoreFromScene = toNumber(playScene?.score);
                        const scoreFromDom = toNumber(document.getElementById('game-over-score')?.textContent);
                        const score = Number.isFinite(scoreFromScene)
                            ? scoreFromScene
                            : (Number.isFinite(scoreFromDom) ? scoreFromDom : 0);

                        return {
                            score: Math.max(0, Math.floor(score)),
                            level: 1,
                            maxCombo: 0,
                            comboCount: 0,
                            stageClears: 0,
                            itemsCollected: 0,
                            itemCounts: {}
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `,
            'neon-fruitmerge': `
                (() => {
                    try {
                        const scoreValue = Math.floor(Number(score ?? displayScore ?? 0));
                        const levelValue = Math.max(1, Math.floor(Number(stage ?? 1)));
                        return {
                            score: Math.max(0, scoreValue),
                            level: levelValue,
                            maxCombo: 0,
                            comboCount: 0,
                            stageClears: Math.max(0, levelValue - 1),
                            itemsCollected: 0,
                            itemCounts: {}
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `,
            'neon-strike': `
                (() => {
                    try {
                        const scoreValue = Math.floor(Number(game?.score ?? 0));
                        const levelValue = Math.max(1, Math.floor(Number(game?.stage ?? 1)));
                        const comboValue = Math.max(0, Math.floor(Number(game?.combo ?? 0)));
                        return {
                            score: Math.max(0, scoreValue),
                            level: levelValue,
                            maxCombo: comboValue,
                            comboCount: comboValue,
                            stageClears: Math.max(0, levelValue - 1),
                            itemsCollected: 0,
                            itemCounts: {}
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `,
            'neon-biztycoon': `
                (() => {
                    try {
                        const snapshot = window.__mgpBiztycoonSnapshot;
                        if (!snapshot || typeof snapshot !== 'object') return null;

                        const scoreValue = Math.max(0, Math.floor(Number(snapshot.score ?? 0)));
                        const levelValue = Math.max(1, Math.floor(Number(snapshot.level ?? 1)));
                        const maxComboValue = Math.max(0, Math.floor(Number(snapshot.maxCombo ?? 0)));
                        const comboCountValue = Math.max(0, Math.floor(Number(snapshot.comboCount ?? maxComboValue)));
                        const stageClearsValue = Math.max(
                            0,
                            Math.floor(Number(snapshot.stageClears ?? Math.max(0, levelValue - 1)))
                        );
                        return {
                            score: scoreValue,
                            level: levelValue,
                            maxCombo: maxComboValue,
                            comboCount: comboCountValue,
                            stageClears: stageClearsValue,
                            itemsCollected: Math.max(0, Math.floor(Number(snapshot.itemsCollected ?? 0))),
                            itemCounts: snapshot.itemCounts && typeof snapshot.itemCounts === 'object'
                                ? snapshot.itemCounts
                                : {}
                        };
                    } catch (error) {
                        return null;
                    }
                })()
            `
        };

        const genericFallbackScript = `
            (() => {
                try {
                    const parseNumber = (value) => {
                        if (typeof value === 'number' && Number.isFinite(value)) return value;
                        if (typeof value !== 'string') return NaN;
                        const normalized = value.replace(/,/g, '');
                        const matched = normalized.match(/-?\\d+(?:\\.\\d+)?/);
                        if (!matched) return NaN;
                        const parsed = Number(matched[0]);
                        return Number.isFinite(parsed) ? parsed : NaN;
                    };
                    const pick = (...values) => {
                        for (const value of values) {
                            const parsed = parseNumber(value);
                            if (Number.isFinite(parsed)) return parsed;
                        }
                        return NaN;
                    };
                    const byId = (id) => document.getElementById(id)?.textContent || '';

                    const scoreValue = pick(
                        window.score,
                        window.game?.score,
                        window.gameState?.score,
                        window.state?.score,
                        byId('score-display'),
                        byId('scoreText'),
                        byId('score-txt'),
                        byId('finalScore'),
                        byId('game-over-score')
                    );
                    const levelValue = pick(
                        window.level,
                        window.stage,
                        window.wave,
                        window.game?.stage,
                        window.gameState?.level,
                        byId('stage-display'),
                        byId('stageText'),
                        byId('finalStage'),
                        1
                    );
                    if (!Number.isFinite(scoreValue) && !Number.isFinite(levelValue)) return null;

                    const safeLevel = Number.isFinite(levelValue)
                        ? Math.max(1, Math.floor(levelValue))
                        : 1;
                    return {
                        score: Number.isFinite(scoreValue) ? Math.max(0, Math.floor(scoreValue)) : 0,
                        level: safeLevel,
                        maxCombo: 0,
                        comboCount: 0,
                        stageClears: Math.max(0, safeLevel - 1),
                        itemsCollected: 0,
                        itemCounts: {}
                    };
                } catch (error) {
                    return null;
                }
            })()
        `;

        const scriptsToTry = [];
        if (fallbackByGame[gameId]) {
            scriptsToTry.push(fallbackByGame[gameId]);
        }
        scriptsToTry.push(genericFallbackScript);

        for (const script of scriptsToTry) {
            try {
                const fallbackSnapshot = iframe.contentWindow.eval(script);
                if (fallbackSnapshot && typeof fallbackSnapshot === 'object') {
                    return fallbackSnapshot;
                }
            } catch (error) {
                console.warn('Fallback snapshot eval failed:', error);
            }
        }

        return null;
    }

    recordCurrentSession(result = {}) {
        if (!this.currentSession || this.currentSession.recorded) return;
        const normalized = this.normalizeSessionResult(result);
        const gameId = this.currentSession.gameId;
        storage.recordGameSession(gameId, normalized);
        this.achievementSystem.checkAndUnlock(gameId);
        this.currentSession.recorded = true;
        this.syncLeaderboardAfterSession(gameId);
    }

    handleGameOver(gameId, result) {
        if (!this.currentSession || this.currentSession.gameId !== gameId) return;
        this.recordCurrentSession(result);
    }

    exitGame() {
        if (!this.currentSession?.recorded) {
            const snapshot = this.collectSessionFromIframe(this.currentGame);
            this.recordCurrentSession(snapshot || {});
        }

        if (this.gameInstance) {
            this.gameInstance.destroy?.();
            this.gameInstance = null;
        }

        const iframe = document.getElementById('gameIframe');
        if (iframe) {
            iframe.src = 'about:blank';
            iframe.remove();
        }

        this.currentGame = null;
        this.currentSession = null;

        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.style.display = 'none';
        }

        this.render();
    }

    showCloudConfigPopup() {
        if (document.querySelector('.cloud-config-modal')) return;

        let existing = {};
        try {
            const raw = localStorage.getItem('mgp_cloud_config');
            if (raw) existing = JSON.parse(raw) || {};
        } catch (error) {
            console.warn('Failed to read local cloud config:', error);
        }

        const firebase = existing.firebase || {};
        const enabled = existing.enabled ?? true;

        const modal = document.createElement('div');
        modal.className = 'hub-modal-overlay glass-overlay animate-fadeIn cloud-config-modal';
        modal.innerHTML = `
            <div class="hub-modal glass-modal animate-fadeInScale" style="width:min(560px,92vw);padding:16px;display:flex;flex-direction:column;gap:10px;">
                <div class="popup-header">
                    <h2 class="font-display neon-text-cyan">클라우드 설정</h2>
                    <button class="glass-btn popup-close" id="closeCloudConfigBtn">닫기</button>
                </div>
                <label style="display:flex;gap:8px;align-items:center;font-size:0.9rem;">
                    <input type="checkbox" id="cloudEnabledInput" ${enabled ? 'checked' : ''}>
                    클라우드 인증/랭킹 활성화
                </label>
                <input class="glass-input" id="cloudApiKeyInput" placeholder="Firebase apiKey" value="${firebase.apiKey || ''}">
                <input class="glass-input" id="cloudAuthDomainInput" placeholder="Firebase authDomain (예: your-app.firebaseapp.com)" value="${firebase.authDomain || ''}">
                <input class="glass-input" id="cloudProjectIdInput" placeholder="Firebase projectId" value="${firebase.projectId || ''}">
                <input class="glass-input" id="cloudAppIdInput" placeholder="Firebase appId (선택)" value="${firebase.appId || ''}">
                <input class="glass-input" id="cloudStorageBucketInput" placeholder="Firebase storageBucket (선택)" value="${firebase.storageBucket || ''}">
                <input class="glass-input" id="cloudMessagingSenderIdInput" placeholder="Firebase messagingSenderId (선택)" value="${firebase.messagingSenderId || ''}">
                <p class="text-secondary" style="margin:0;font-size:0.78rem;">저장 시 브라우저 로컬 저장소(mgp_cloud_config)에 보관되며 페이지가 새로고침됩니다.</p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                    <button class="glass-btn" id="clearCloudConfigBtn">설정 초기화</button>
                    <button class="glass-btn" id="closeCloudConfigBtnBottom">취소</button>
                    <button class="neon-btn" id="saveCloudConfigBtn">저장 후 적용</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const close = () => modal.remove();

        modal.querySelector('#closeCloudConfigBtn')?.addEventListener('click', close);
        modal.querySelector('#closeCloudConfigBtnBottom')?.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });

        modal.querySelector('#saveCloudConfigBtn')?.addEventListener('click', () => {
            const nextConfig = {
                enabled: Boolean(modal.querySelector('#cloudEnabledInput')?.checked),
                firebase: {
                    apiKey: modal.querySelector('#cloudApiKeyInput')?.value.trim() || '',
                    authDomain: modal.querySelector('#cloudAuthDomainInput')?.value.trim() || '',
                    projectId: modal.querySelector('#cloudProjectIdInput')?.value.trim() || '',
                    appId: modal.querySelector('#cloudAppIdInput')?.value.trim() || '',
                    storageBucket: modal.querySelector('#cloudStorageBucketInput')?.value.trim() || '',
                    messagingSenderId: modal.querySelector('#cloudMessagingSenderIdInput')?.value.trim() || ''
                }
            };

            localStorage.setItem('mgp_cloud_config', JSON.stringify(nextConfig));
            window.location.reload();
        });

        modal.querySelector('#clearCloudConfigBtn')?.addEventListener('click', () => {
            localStorage.removeItem('mgp_cloud_config');
            window.location.reload();
        });
    }

    showAchievementsPopup(gameId) {
        if (document.querySelector('.achievements-modal')) return;
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        const gameData = storage.getGameData(gameId);
        const progress = this.achievementSystem.getProgress(gameId);
        const ranking = this.getGameLeaderboardSummary(gameId);
        const bestRankText = this.formatLeaderboardRank(ranking.bestRank);

        const modal = document.createElement('div');
        modal.className = 'hub-modal-overlay glass-overlay animate-fadeIn achievements-modal';
        modal.innerHTML = `
            <div class="hub-modal glass-modal animate-fadeInScale achievements-modal-content">
                <div class="popup-header">
                    <h2 class="font-display neon-text-cyan">${game.name} 업적</h2>
                    <button class="glass-btn popup-close" id="closeAchievementsBtn">닫기</button>
                </div>
                <div class="achievements-meta">
                    <span>최고 점수 ${this.formatNumber(gameData.highScore)}</span>
                    <span>최고 랭킹 ${bestRankText}</span>
                    <span>달성 ${progress.unlocked}/${progress.total}</span>
                </div>
                ${this.achievementSystem.renderAchievementsList(gameId)}
            </div>
        `;

        document.body.appendChild(modal);
        modal.querySelector('#closeAchievementsBtn').onclick = () => modal.remove();
        modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
    }

    showProfilePopup() {
        if (document.querySelector('.profile-modal')) return;
        const profile = storage.getProfile();
        const totals = this.getDashboardTotals();
        const authUser = this.authState.user;

        const authSection = !this.authState.enabled
            ? '<div class="profile-auth-note">클라우드 인증 비활성화 상태입니다.</div>'
            : this.authState.isSignedIn
                ? `
                    <div class="profile-auth-note">연동 계정: ${authUser?.displayName || 'Player'}${authUser?.email ? ` (${authUser.email})` : ''}</div>
                    <button class="glass-btn" id="profileLogoutBtn">로그아웃</button>
                `
                : `
                    <div class="profile-auth-actions">
                        <button class="glass-btn" id="profileGoogleLoginBtn">Google 로그인</button>
                        <button class="glass-btn" id="profileAppleLoginBtn">Apple 로그인</button>
                    </div>
                `;

        const modal = document.createElement('div');
        modal.className = 'hub-modal-overlay glass-overlay animate-fadeIn profile-modal';
        modal.innerHTML = `
            <div class="hub-modal glass-modal animate-fadeInScale profile-popup-content">
                <div class="popup-header">
                    <h2 class="font-display neon-text-cyan">플레이어 프로필</h2>
                    <button class="glass-btn popup-close" id="closeProfileBtn">닫기</button>
                </div>
                <div style="font-size:3rem;text-align:center;">${this.getAvatarEmoji(profile.avatar)}</div>
                <input type="text" class="glass-input" id="nicknameInput" value="${profile.nickname}" placeholder="닉네임" style="text-align:center;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
                    <div class="stat-item"><span class="stat-value neon-text-yellow">${this.formatNumber(totals.totalScore)}</span><span class="stat-label">누적 점수</span></div>
                    <div class="stat-item"><span class="stat-value neon-text-pink">${totals.achievementUnlocked}/${totals.achievementTotal}</span><span class="stat-label">업적</span></div>
                </div>
                ${authSection}
                <button class="neon-btn" id="saveProfileBtn">저장</button>
            </div>
        `;

        document.body.appendChild(modal);
        modal.querySelector('#closeProfileBtn').onclick = () => modal.remove();
        modal.querySelector('#saveProfileBtn').onclick = async () => {
            const nickname = modal.querySelector('#nicknameInput').value.trim() || 'Player';
            storage.setNickname(nickname);

            if (this.authState.isSignedIn) {
                try {
                    await cloudAuth.updateDisplayName(nickname);
                } catch (error) {
                    console.warn('Failed to sync nickname to cloud profile:', error);
                }
            }

            try {
                await leaderboardService.syncFromLocal();
                this.refreshLeaderboards({ force: true });
            } catch (error) {
                console.warn('Failed to sync profile nickname to server leaderboard:', error);
            }

            modal.remove();
            this.render();
        };
        modal.querySelector('#profileGoogleLoginBtn')?.addEventListener('click', async () => {
            await this.handleLoginRequest('google');
            modal.remove();
        });
        modal.querySelector('#profileAppleLoginBtn')?.addEventListener('click', async () => {
            await this.handleLoginRequest('apple');
            modal.remove();
        });
        modal.querySelector('#profileLogoutBtn')?.addEventListener('click', async () => {
            await this.handleLogoutRequest();
            modal.remove();
        });
        modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
    }

    showShareModal(gameId) {
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        const gameData = storage.getGameData(gameId);
        const profile = storage.getProfile();
        const ranking = this.getGameLeaderboardSummary(gameId);
        this.shareManager.showShareModal({
            gameId,
            gameName: game.name,
            playerName: profile.nickname,
            highScore: gameData.highScore,
            currentRank: ranking.myRank,
            bestRank: ranking.bestRank,
            achievements: storage.getAchievements(gameId)
        });
    }

    addHubStyles() {
        if (document.getElementById('hub-styles')) return;

        const style = document.createElement('style');
        style.id = 'hub-styles';
        style.textContent = `
            .hub-modal-overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:var(--space-4); z-index:var(--z-overlay); overflow-y:auto; }
            .hub-modal { width:min(720px,92vw); max-height:min(88vh,800px); overflow-y:auto; }
            .hub-wrapper { min-height:100vh; padding:var(--space-4); padding-top:var(--space-6); }
            .hub-header { display:flex; justify-content:space-between; align-items:center; padding:var(--space-4); margin-bottom:var(--space-4); }
            .hub-logo { display:flex; flex-direction:column; line-height:1; }
            .profile-btn { display:flex; align-items:center; gap:var(--space-2); }
            .avatar { font-size:1.4rem; }
            .nickname { max-width:84px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .stats-bar { display:flex; justify-content:space-around; align-items:center; padding:var(--space-4); margin-bottom:var(--space-6); }
            .stat-item { display:flex; flex-direction:column; align-items:center; gap:var(--space-1); }
            .stat-value { font-family:var(--font-display); font-size:var(--font-size-lg); font-weight:var(--font-weight-bold); }
            .stat-label { font-size:var(--font-size-xs); color:var(--text-muted); }
            .stat-divider { width:1px; height:30px; background:rgba(255,255,255,0.1); }
            .section-title { font-size:var(--font-size-lg); margin-bottom:var(--space-4); display:flex; align-items:center; gap:var(--space-2); }
            .hub-tabs { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:8px; margin-bottom:var(--space-4); }
            .hub-tab-btn { border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.04); color:var(--text-secondary); border-radius:10px; min-height:38px; font-weight:600; cursor:pointer; transition:all var(--transition-fast); }
            .hub-tab-btn:hover { border-color:rgba(255,255,255,0.28); color:var(--text-primary); }
            .hub-tab-btn.active { color:var(--text-primary); border-color:rgba(0,242,255,0.5); background:linear-gradient(135deg, rgba(0,242,255,0.16), rgba(255,0,255,0.08)); box-shadow:0 0 16px rgba(0,242,255,0.2); }
            .tab-panel { margin-bottom:var(--space-5); }
            .leaderboard-section { margin-bottom:var(--space-6); padding:var(--space-4); display:flex; flex-direction:column; gap:var(--space-3); }
            .leaderboard-header { display:flex; align-items:center; justify-content:space-between; gap:var(--space-2); }
            .leaderboard-subtext { font-size:var(--font-size-xs); color:var(--text-muted); }
            .leaderboard-card { padding:var(--space-3); }
            .leaderboard-title { font-size:var(--font-size-md); margin-bottom:var(--space-2); color:var(--text-primary); }
            .leaderboard-list { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
            .leaderboard-row { display:grid; grid-template-columns:34px 1fr auto; align-items:center; gap:8px; font-size:0.82rem; color:var(--text-secondary); }
            .leaderboard-rank { font-family:var(--font-display); color:var(--neon-cyan); }
            .leaderboard-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-primary); }
            .leaderboard-score { font-family:var(--font-display); color:var(--neon-yellow); }
            .leaderboard-empty { color:var(--text-muted); font-size:0.78rem; padding:4px 0; }
            .leaderboard-auth-actions { display:flex; gap:8px; flex-wrap:wrap; }
            .leaderboard-auth-user { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
            .leaderboard-auth-text { font-size:0.8rem; color:var(--text-secondary); }
            .leaderboard-auth-note { font-size:0.8rem; color:var(--text-muted); }
            .leaderboard-auth-btn { white-space:nowrap; }
            .leaderboard-error { font-size:0.78rem; color:var(--neon-pink); }
            .ranking-overview { display:grid; gap:10px; grid-template-columns:1fr; }
            @media (min-width:760px) { .ranking-overview { grid-template-columns:1.3fr 1fr; } }
            .my-score-item { display:flex; flex-direction:column; gap:4px; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.03); }
            .my-score-label { font-size:0.76rem; color:var(--text-muted); }
            .my-score-value { font-family:var(--font-display); font-size:1.1rem; }
            .my-score-rank { font-size:0.8rem; color:var(--text-secondary); }
            .ranking-game-grid { display:grid; gap:var(--space-3); grid-template-columns:1fr; }
            @media (min-width:780px) { .ranking-game-grid { grid-template-columns:repeat(2, 1fr); } }
            .ranking-game-card { padding:12px; border:1px solid rgba(255,255,255,0.14); background:linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)); }
            .ranking-game-header { display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; }
            .ranking-game-icon { font-size:1.8rem; line-height:1; }
            .ranking-game-title-wrap { min-width:0; }
            .ranking-game-title { margin:0; color:var(--card-color, var(--neon-cyan)); font-size:1rem; }
            .ranking-game-desc { margin:4px 0 0; font-size:0.75rem; color:var(--text-secondary); }
            .ranking-game-metrics { display:flex; flex-wrap:wrap; gap:8px 12px; font-size:0.75rem; color:var(--text-secondary); margin-bottom:10px; }
            .ranking-game-metrics strong { color:var(--text-primary); font-weight:700; }
            .ranking-mini-list { margin-bottom:10px; }
            .ranking-card-actions { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
            .game-grid { display:grid; grid-template-columns:1fr; gap:var(--space-4); }
            @media (min-width:500px) { .game-grid { grid-template-columns:repeat(2, 1fr); } }
            .game-card { position:relative; overflow:hidden; padding:var(--space-5); cursor:pointer; transition:all var(--transition-normal); animation:fadeInUp 0.4s ease forwards; opacity:0; }
            .game-card:hover { transform:translateY(-4px) scale(1.01); box-shadow:0 10px 40px rgba(0,0,0,0.32), 0 0 20px var(--card-color, var(--neon-cyan)); }
            .game-card-bg { position:absolute; inset:0; opacity:0.28; }
            .game-card-content { position:relative; z-index:1; }
            .game-icon { font-size:2.4rem; margin-bottom:var(--space-3); }
            .game-name { font-size:var(--font-size-lg); margin-bottom:var(--space-2); color:var(--card-color, var(--neon-cyan)); }
            .game-desc { font-size:var(--font-size-sm); color:var(--text-secondary); margin-bottom:var(--space-3); }
            .game-metrics { display:flex; justify-content:space-between; gap:8px; font-size:0.75rem; margin-bottom:8px; color:var(--text-secondary); }
            .high-score { color: var(--neon-yellow); }
            .achievement-count { color: var(--neon-pink); }
            .ranking-count { color: var(--neon-cyan); }
            .game-actions { display:grid; gap:8px; margin-top:8px; }
            .game-actions-main { grid-template-columns:1fr; }
            .game-actions-sub { grid-template-columns:1fr 1fr; }
            .game-container { position:fixed; inset:0; background:var(--bg-primary); z-index:var(--z-modal); display:flex; flex-direction:column; }
            .game-container-header { position:absolute; top:12px; left:12px; right:12px; z-index:20; display:flex; justify-content:space-between; align-items:center; gap:8px; }
            .active-game-meta { display:flex; gap:8px; align-items:center; padding:6px 10px; border-radius:999px; background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.2); backdrop-filter:blur(8px); }
            .renderer-badge { font-size:0.68rem; color:var(--neon-cyan); border:1px solid rgba(0,242,255,0.35); border-radius:999px; padding:2px 7px; }
            .game-canvas-wrapper { flex:1; display:flex; align-items:center; justify-content:center; width:100%; height:100%; }
            .game-iframe { width:100%; height:100%; border:none; background:#000; }
            .popup-header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
            .popup-close { white-space:nowrap; }
            .profile-popup-content { width:min(360px,92vw); padding:var(--space-6); display:flex; flex-direction:column; gap:var(--space-4); }
            .profile-auth-note { font-size:0.8rem; color:var(--text-secondary); text-align:center; }
            .profile-auth-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
            .achievements-modal-content { padding:var(--space-5); display:flex; flex-direction:column; gap:var(--space-4); }
            .achievements-modal-content { scrollbar-width:thin; scrollbar-color:rgba(96,102,120,0.9) rgba(12,15,22,0.9); }
            .achievements-modal-content::-webkit-scrollbar { width:10px; height:10px; }
            .achievements-modal-content::-webkit-scrollbar-track { background:rgba(12,15,22,0.92); border:1px solid rgba(255,255,255,0.08); border-radius:999px; }
            .achievements-modal-content::-webkit-scrollbar-thumb { background:linear-gradient(180deg, rgba(88,95,112,0.95), rgba(56,61,76,0.95)); border:1px solid rgba(255,255,255,0.14); border-radius:999px; }
            .achievements-modal-content::-webkit-scrollbar-thumb:hover { background:linear-gradient(180deg, rgba(122,130,150,0.95), rgba(76,83,102,0.95)); }
            .achievements-meta { display:flex; justify-content:space-between; font-size:var(--font-size-sm); color:var(--text-secondary); }
            .achievements-header { display:flex; align-items:center; gap:var(--space-3); }
            .achievements-count { font-family:var(--font-display); color:var(--neon-cyan); min-width:48px; }
            .achievements-bar { flex:1; height:8px; border-radius:999px; background:rgba(255,255,255,0.12); overflow:hidden; }
            .achievements-bar-fill { height:100%; background:linear-gradient(90deg, var(--neon-cyan), var(--neon-pink)); }
            .achievements-grid { display:grid; gap:8px; }
            .achievement-item { display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.03); }
            .achievement-item.unlocked { border-color:rgba(0,242,255,0.4); background:linear-gradient(135deg, rgba(0,242,255,0.12), rgba(255,0,255,0.08)); }
            .achievement-item.locked { opacity:0.68; }
            .achievement-item-icon { font-size:1.2rem; }
            .achievement-item-name { font-weight:700; font-size:0.85rem; color:var(--text-primary); }
            .achievement-item-desc { font-size:0.75rem; color:var(--text-secondary); }
            .achievement-item-points { font-family:var(--font-display); font-size:0.75rem; color:var(--neon-yellow); }
        `;
        document.head.appendChild(style);
    }

    getAvatarEmoji(avatar) {
        const avatars = {
            default: '🎮',
            cat: '🐱',
            dog: '🐶',
            robot: '🤖',
            alien: '👽',
            ninja: '🥷'
        };
        return avatars[avatar] || avatars.default;
    }

    formatNumber(num) {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return Number(num || 0).toLocaleString();
    }
}
