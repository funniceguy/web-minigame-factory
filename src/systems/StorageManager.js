/**
 * StorageManager - Local storage wrapper with profile and game data
 */
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
            const achievements = this.get('achievements') || {};
            const settings = this.get('settings') || this.createDefaultSettings();

            return { profile, games, achievements, settings };
        } catch (e) {
            console.warn('Failed to load storage:', e);
            return {
                profile: this.normalizeProfile(),
                games: {},
                achievements: {},
                settings: this.createDefaultSettings()
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

    // ===== Achievement Methods =====

    /**
     * Get achievements for game
     */
    getAchievements(gameId) {
        return this.data.achievements[gameId] || [];
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
        if (!this.data.achievements[gameId]) {
            this.data.achievements[gameId] = [];
        }

        if (!this.data.achievements[gameId].includes(achievementId)) {
            this.data.achievements[gameId].push(achievementId);
            this.set('achievements', this.data.achievements);
            return true; // Newly unlocked
        }

        return false; // Already unlocked
    }

    /**
     * Check if achievement is unlocked
     */
    hasAchievement(gameId, achievementId) {
        const achievements = this.data.achievements[gameId] || [];
        return achievements.includes(achievementId);
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
            this.data = imported;
            this.set('profile', this.data.profile);
            this.set('games', this.data.games);
            this.set('achievements', this.data.achievements);
            this.set('settings', this.data.settings);
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
        this.data = this.loadAll();
    }
}

// Singleton instance
export const storage = new StorageManager();
