/**
 * AchievementSystem - Game achievement tracking and notifications
 */
import { storage } from '../systems/StorageManager.js';

export class AchievementSystem {
    constructor() {
        // Achievement definitions by game
        this.definitions = new Map();

        // Register default achievements
        this.registerDefaultAchievements();

        // Active achievement toast queue
        this.toastQueue = [];
        this.isShowingToast = false;
    }

    /**
     * Register default achievements
     */
    registerDefaultAchievements() {
        // Block Breaker achievements
        this.register('block-breaker', [
            { id: 'first_clear', name: '첫 클리어', desc: '첫 번째 레벨 클리어', icon: '🏆', points: 10 },
            { id: 'combo_10', name: '콤보 마스터', desc: '10 콤보 달성', icon: '🔥', points: 20 },
            { id: 'combo_20', name: '콤보 레전드', desc: '20 콤보 달성', icon: '💥', points: 50 },
            { id: 'score_1000', name: '천점 돌파', desc: '1,000점 달성', icon: '⭐', points: 10 },
            { id: 'score_5000', name: '오천점 돌파', desc: '5,000점 달성', icon: '✨', points: 25 },
            { id: 'score_10000', name: '만점왕', desc: '10,000점 달성', icon: '🌟', points: 50 },
            { id: 'score_50000', name: '레전드', desc: '50,000점 달성', icon: '👑', points: 100 },
            { id: 'level_3', name: '중급자', desc: '레벨 3 도달', icon: '📈', points: 15 },
            { id: 'level_5', name: '레벨왕', desc: '레벨 5 도달', icon: '🎯', points: 30 },
            { id: 'level_10', name: '마스터', desc: '레벨 10 도달', icon: '🏅', points: 75 },
            { id: 'play_10', name: '단골 플레이어', desc: '10회 플레이', icon: '🎮', points: 10 },
            { id: 'play_50', name: '열정 플레이어', desc: '50회 플레이', icon: '❤️‍🔥', points: 30 },
            { id: 'perfect_level', name: '퍼펙트', desc: '생명 손실 없이 클리어', icon: '💎', points: 40 },
            { id: 'speed_clear', name: '스피드러너', desc: '30초 이내 클리어', icon: '⚡', points: 40 }
        ]);

        // Future games would have their achievements registered here
    }

    /**
     * Register achievements for a game
     */
    register(gameId, achievements) {
        this.definitions.set(gameId, achievements);
    }

    /**
     * Get all achievements for a game
     */
    getAll(gameId) {
        const definitions = this.definitions.get(gameId) || [];
        const unlocked = storage.getAchievements(gameId);

        return definitions.map(achievement => ({
            ...achievement,
            unlocked: unlocked.includes(achievement.id),
            unlockedAt: null // Could be stored if we track timestamps
        }));
    }

    /**
     * Get unlocked achievements for a game
     */
    getUnlocked(gameId) {
        const all = this.getAll(gameId);
        return all.filter(a => a.unlocked);
    }

    /**
     * Get locked achievements for a game
     */
    getLocked(gameId) {
        const all = this.getAll(gameId);
        return all.filter(a => !a.unlocked);
    }

    /**
     * Get total achievement progress
     */
    getProgress(gameId) {
        const all = this.getAll(gameId);
        const unlocked = all.filter(a => a.unlocked).length;
        return {
            unlocked,
            total: all.length,
            percentage: all.length > 0 ? Math.round((unlocked / all.length) * 100) : 0
        };
    }

    /**
     * Get total points for a game
     */
    getPoints(gameId) {
        const unlocked = this.getUnlocked(gameId);
        return unlocked.reduce((sum, a) => sum + (a.points || 0), 0);
    }

    /**
     * Unlock an achievement
     * @returns {boolean} True if newly unlocked
     */
    unlock(gameId, achievementId) {
        const wasUnlocked = storage.hasAchievement(gameId, achievementId);

        if (!wasUnlocked) {
            const success = storage.unlockAchievement(gameId, achievementId);

            if (success) {
                const achievement = this.definitions.get(gameId)?.find(a => a.id === achievementId);
                if (achievement) {
                    this.showUnlockToast(achievement);
                }
                return true;
            }
        }

        return false;
    }

    /**
     * Check and unlock multiple achievements based on game result
     */
    checkAndUnlock(gameId, result) {
        const unlocked = [];

        // Score-based achievements
        if (result.score >= 1000) unlocked.push(this.unlock(gameId, 'score_1000'));
        if (result.score >= 5000) unlocked.push(this.unlock(gameId, 'score_5000'));
        if (result.score >= 10000) unlocked.push(this.unlock(gameId, 'score_10000'));
        if (result.score >= 50000) unlocked.push(this.unlock(gameId, 'score_50000'));

        // Level-based achievements
        if (result.level >= 1) unlocked.push(this.unlock(gameId, 'first_clear'));
        if (result.level >= 3) unlocked.push(this.unlock(gameId, 'level_3'));
        if (result.level >= 5) unlocked.push(this.unlock(gameId, 'level_5'));
        if (result.level >= 10) unlocked.push(this.unlock(gameId, 'level_10'));

        // Combo-based achievements
        if (result.maxCombo >= 10) unlocked.push(this.unlock(gameId, 'combo_10'));
        if (result.maxCombo >= 20) unlocked.push(this.unlock(gameId, 'combo_20'));

        // Play count achievements
        const gameData = storage.getGameData(gameId);
        if (gameData.playCount >= 10) unlocked.push(this.unlock(gameId, 'play_10'));
        if (gameData.playCount >= 50) unlocked.push(this.unlock(gameId, 'play_50'));

        // Special achievements
        if (result.perfectLevel) unlocked.push(this.unlock(gameId, 'perfect_level'));
        if (result.clearTime && result.clearTime <= 30) unlocked.push(this.unlock(gameId, 'speed_clear'));

        return unlocked.filter(Boolean).length;
    }

    /**
     * Show achievement unlock toast
     */
    showUnlockToast(achievement) {
        this.toastQueue.push(achievement);

        if (!this.isShowingToast) {
            this.processToastQueue();
        }
    }

    /**
     * Process toast queue
     */
    async processToastQueue() {
        if (this.toastQueue.length === 0) {
            this.isShowingToast = false;
            return;
        }

        this.isShowingToast = true;
        const achievement = this.toastQueue.shift();

        await this.displayToast(achievement);

        // Process next toast
        this.processToastQueue();
    }

    /**
     * Display achievement toast
     */
    displayToast(achievement) {
        return new Promise(resolve => {
            const toast = document.createElement('div');
            toast.className = 'achievement-toast animate-slideInRight';
            toast.innerHTML = `
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-info">
                    <div class="achievement-label">업적 달성!</div>
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-desc">${achievement.desc}</div>
                </div>
                <div class="achievement-points">+${achievement.points || 0}</div>
            `;

            this.addToastStyles();
            document.body.appendChild(toast);

            // Auto remove after delay
            setTimeout(() => {
                toast.classList.remove('animate-slideInRight');
                toast.classList.add('animate-slideOutRight');
                setTimeout(() => {
                    toast.remove();
                    resolve();
                }, 400);
            }, 3000);
        });
    }

    /**
     * Add toast styles
     */
    addToastStyles() {
        if (document.getElementById('achievement-toast-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'achievement-toast-styles';
        styles.textContent = `
            .achievement-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px 20px;
                background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 165, 0, 0.1));
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 12px;
                backdrop-filter: blur(20px);
                box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
                z-index: 9999;
                max-width: 320px;
            }
            
            .achievement-icon {
                font-size: 2rem;
                animation: bounce 0.5s ease-in-out;
            }
            
            .achievement-info {
                flex: 1;
            }
            
            .achievement-label {
                font-size: 0.7rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: #ffd700;
                margin-bottom: 2px;
            }
            
            .achievement-name {
                font-family: 'Orbitron', sans-serif;
                font-size: 1rem;
                font-weight: bold;
                color: #fff;
            }
            
            .achievement-desc {
                font-size: 0.75rem;
                color: rgba(255, 255, 255, 0.7);
            }
            
            .achievement-points {
                font-family: 'Orbitron', sans-serif;
                font-size: 1rem;
                font-weight: bold;
                color: #ffd700;
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(120%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(120%);
                    opacity: 0;
                }
            }
            
            .animate-slideInRight {
                animation: slideInRight 0.4s ease forwards;
            }
            
            .animate-slideOutRight {
                animation: slideOutRight 0.4s ease forwards;
            }
            
            @keyframes bounce {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.2); }
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Render achievements list for UI
     */
    renderAchievementsList(gameId) {
        const achievements = this.getAll(gameId);
        const progress = this.getProgress(gameId);

        return `
            <div class="achievements-header">
                <span class="achievements-count">${progress.unlocked}/${progress.total}</span>
                <div class="achievements-bar">
                    <div class="achievements-bar-fill" style="width: ${progress.percentage}%"></div>
                </div>
            </div>
            <div class="achievements-grid">
                ${achievements.map(a => `
                    <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}">
                        <div class="achievement-item-icon">${a.unlocked ? a.icon : '🔒'}</div>
                        <div class="achievement-item-info">
                            <div class="achievement-item-name">${a.unlocked ? a.name : '???'}</div>
                            <div class="achievement-item-desc">${a.unlocked ? a.desc : '미해금'}</div>
                        </div>
                        ${a.unlocked ? `<div class="achievement-item-points">+${a.points}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
}
