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
            const profile = this.get('profile') || this.createDefaultProfile();
            const games = this.get('games') || {};
            const achievements = this.get('achievements') || {};
            const settings = this.get('settings') || this.createDefaultSettings();

            return { profile, games, achievements, settings };
        } catch (e) {
            console.warn('Failed to load storage:', e);
            return {
                profile: this.createDefaultProfile(),
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
            createdAt: Date.now(),
            totalPlayTime: 0,
            totalGamesPlayed: 0,
            totalScore: 0
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
        this.data.profile = { ...this.data.profile, ...updates };
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
        return this.data.games[gameId] || this.createDefaultGameData(gameId);
    }

    /**
     * Create default game data
     */
    createDefaultGameData(gameId) {
        return {
            gameId,
            highScore: 0,
            totalScore: 0,
            playCount: 0,
            bestLevel: 1,
            maxCombo: 0,
            totalPlayTime: 0,
            lastPlayed: null,
            achievements: []
        };
    }

    /**
     * Update game data
     */
    updateGameData(gameId, updates) {
        if (!this.data.games[gameId]) {
            this.data.games[gameId] = this.createDefaultGameData(gameId);
        }

        this.data.games[gameId] = {
            ...this.data.games[gameId],
            ...updates,
            lastPlayed: Date.now()
        };

        this.set('games', this.data.games);
        return this.data.games[gameId];
    }

    /**
     * Record game session
     */
    recordGameSession(gameId, sessionData) {
        const gameData = this.getGameData(gameId);

        const updates = {
            playCount: gameData.playCount + 1,
            totalScore: gameData.totalScore + (sessionData.score || 0),
            totalPlayTime: gameData.totalPlayTime + (sessionData.duration || 0)
        };

        // Update high score
        if (sessionData.score > gameData.highScore) {
            updates.highScore = sessionData.score;
        }

        // Update best level
        if (sessionData.level > gameData.bestLevel) {
            updates.bestLevel = sessionData.level;
        }

        // Update max combo
        if (sessionData.maxCombo > gameData.maxCombo) {
            updates.maxCombo = sessionData.maxCombo;
        }

        // Update profile totals
        this.updateProfile({
            totalGamesPlayed: this.data.profile.totalGamesPlayed + 1,
            totalScore: this.data.profile.totalScore + (sessionData.score || 0),
            totalPlayTime: this.data.profile.totalPlayTime + (sessionData.duration || 0)
        });

        return this.updateGameData(gameId, updates);
    }

    /**
     * Get all game stats
     */
    getAllGameStats() {
        return this.data.games;
    }

    // ===== Achievement Methods =====

    /**
     * Get achievements for game
     */
    getAchievements(gameId) {
        return this.data.achievements[gameId] || [];
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
