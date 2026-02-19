/**
 * GameHub - dashboard, game launcher, and popup UIs
 */
import { storage } from '../systems/StorageManager.js';
import { ShareManager } from './ShareManager.js';
import { AchievementSystem } from './AchievementSystem.js';

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

        this.eventsBound = false;
        this.discoveryStarted = false;
        this.runtimeBasePath = this.resolveRuntimeBasePath();
        this.handleContainerClick = this.handleContainerClick.bind(this);
        this.handleWindowMessage = this.handleWindowMessage.bind(this);

        this.init();
    }

    init() {
        this.render();
        this.setupEventListeners();
        this.discoverGames();
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

    render() {
        const profile = storage.getProfile();
        const totals = this.getDashboardTotals();

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
                    <div class="stat-item"><span class="stat-value neon-text-cyan">${totals.totalPlayCount}</span><span class="stat-label">전체 플레이</span></div>
                    <div class="stat-divider"></div>
                    <div class="stat-item"><span class="stat-value neon-text-pink">${totals.achievementUnlocked}/${totals.achievementTotal}</span><span class="stat-label">전체 업적</span></div>
                    <div class="stat-divider"></div>
                    <div class="stat-item"><span class="stat-value neon-text-yellow">${this.formatNumber(totals.totalScore)}</span><span class="stat-label">누적 점수</span></div>
                    <div class="stat-divider"></div>
                    <div class="stat-item"><span class="stat-value neon-text-cyan">${totals.totalGames}</span><span class="stat-label">게임 수</span></div>
                </div>

                <section class="game-gallery">
                    <h2 class="section-title font-display"><span class="neon-text-cyan">🎮</span>게임 선택</h2>
                    <div class="game-grid stagger-children">${this.renderGameCards()}</div>
                </section>

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
            const progress = this.achievementSystem.getProgress(game.id);

            return `
                <article class="game-card glass-card" data-game-id="${game.id}" style="--card-color:${game.color};">
                    <div class="game-card-bg" style="background:linear-gradient(135deg, ${game.gradient[0]}22, ${game.gradient[1]}22);"></div>
                    <div class="game-card-content">
                        <div class="game-icon">${game.icon}</div>
                        <h3 class="game-name font-display">${game.name}</h3>
                        <p class="game-desc">${game.description}</p>
                        <div class="game-metrics"><span class="high-score">최고 ${this.formatNumber(gameData.highScore)}</span><span>플레이 ${gameData.playCount}회</span></div>
                        <div class="game-metrics"><span class="achievement-count">업적 ${progress.unlocked}/${progress.total}</span></div>
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

        const gameCard = event.target.closest('.game-card');
        if (!gameCard) return;

        const gameId = gameCard.dataset.gameId;
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        const action = event.target.closest('[data-action]')?.dataset.action;
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
            `
        };

        const fallbackScript = fallbackByGame[gameId];
        if (!fallbackScript) return null;

        try {
            const fallbackSnapshot = iframe.contentWindow.eval(fallbackScript);
            if (fallbackSnapshot && typeof fallbackSnapshot === 'object') {
                return fallbackSnapshot;
            }
        } catch (error) {
            console.warn('Fallback snapshot eval failed:', error);
        }

        return null;
    }

    recordCurrentSession(result = {}) {
        if (!this.currentSession || this.currentSession.recorded) return;
        const normalized = this.normalizeSessionResult(result);
        storage.recordGameSession(this.currentSession.gameId, normalized);
        this.achievementSystem.checkAndUnlock(this.currentSession.gameId);
        this.currentSession.recorded = true;
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

    showAchievementsPopup(gameId) {
        if (document.querySelector('.achievements-modal')) return;
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        const gameData = storage.getGameData(gameId);
        const progress = this.achievementSystem.getProgress(gameId);

        const modal = document.createElement('div');
        modal.className = 'hub-modal-overlay glass-overlay animate-fadeIn achievements-modal';
        modal.innerHTML = `
            <div class="hub-modal glass-modal animate-fadeInScale achievements-modal-content">
                <div class="popup-header">
                    <h2 class="font-display neon-text-cyan">${game.name} 업적</h2>
                    <button class="glass-btn popup-close" id="closeAchievementsBtn">닫기</button>
                </div>
                <div class="achievements-meta">
                    <span>플레이 ${gameData.playCount}회</span>
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
                    <div class="stat-item"><span class="stat-value neon-text-cyan">${totals.totalPlayCount}</span><span class="stat-label">전체 플레이</span></div>
                    <div class="stat-item"><span class="stat-value neon-text-pink">${totals.achievementUnlocked}/${totals.achievementTotal}</span><span class="stat-label">업적</span></div>
                </div>
                <button class="neon-btn" id="saveProfileBtn">저장</button>
            </div>
        `;

        document.body.appendChild(modal);
        modal.querySelector('#closeProfileBtn').onclick = () => modal.remove();
        modal.querySelector('#saveProfileBtn').onclick = () => {
            const nickname = modal.querySelector('#nicknameInput').value.trim() || 'Player';
            storage.setNickname(nickname);
            modal.remove();
            this.render();
        };
        modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
    }

    showShareModal(gameId) {
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        const gameData = storage.getGameData(gameId);
        const profile = storage.getProfile();
        this.shareManager.showShareModal({
            gameId,
            gameName: game.name,
            playerName: profile.nickname,
            highScore: gameData.highScore,
            playCount: gameData.playCount,
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
