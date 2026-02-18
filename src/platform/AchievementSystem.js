/**
 * AchievementSystem - game-specific achievement tracking and notifications
 */
import { storage } from '../systems/StorageManager.js';

export class AchievementSystem {
    constructor() {
        this.definitions = new Map();
        this.toastQueue = [];
        this.isShowingToast = false;

        this.registerDefaultAchievements();
    }

    /**
     * Register game-specific achievements.
     * Every achievement is evaluated from stored cumulative game data.
     */
    registerDefaultAchievements() {
        this.register('neon-block', [
            { id: 'nb_play_1', name: 'First Brick', desc: 'Play 1 time', icon: '*', points: 5, metric: 'playCount', threshold: 1 },
            { id: 'nb_play_10', name: 'Brick Regular', desc: 'Play 10 times', icon: '*', points: 12, metric: 'playCount', threshold: 10 },
            { id: 'nb_score_3000', name: 'Neon Starter', desc: 'High score 3,000', icon: '*', points: 10, metric: 'highScore', threshold: 3000 },
            { id: 'nb_score_12000', name: 'Neon Ace', desc: 'High score 12,000', icon: '*', points: 24, metric: 'highScore', threshold: 12000 },
            { id: 'nb_stage_25', name: 'Stage Crusher', desc: 'Total stage clears 25', icon: '*', points: 18, metric: 'totalStageClears', threshold: 25 },
            { id: 'nb_combo_20', name: 'Combo Burst', desc: 'Max combo 20', icon: '*', points: 20, metric: 'maxCombo', threshold: 20 },
            { id: 'nb_item_multiball_5', name: 'Multiball Collector', desc: 'Collect multiball 5 times', icon: '*', points: 15, metric: 'item.multiball', threshold: 5 },
            { id: 'nb_item_shield_5', name: 'Shield Expert', desc: 'Collect shield 5 times', icon: '*', points: 15, metric: 'item.shield', threshold: 5 },
            { id: 'nb_items_30', name: 'Loadout Builder', desc: 'Collect items 30 times', icon: '*', points: 20, metric: 'totalItemsCollected', threshold: 30 },
            { id: 'nb_total_score_50000', name: 'Score Engineer', desc: 'Total score 50,000', icon: '*', points: 30, metric: 'totalScore', threshold: 50000 },
            { id: 'nb_best_stage_15', name: 'Stage Veteran', desc: 'Best stage 15', icon: '*', points: 24, metric: 'bestStage', threshold: 15 }
        ]);

        this.register('neon-findmine', [
            { id: 'nf_play_1', name: 'Field Entry', desc: 'Play 1 time', icon: '*', points: 5, metric: 'playCount', threshold: 1 },
            { id: 'nf_play_8', name: 'Field Scout', desc: 'Play 8 times', icon: '*', points: 12, metric: 'playCount', threshold: 8 },
            { id: 'nf_play_20', name: 'Field Veteran', desc: 'Play 20 times', icon: '*', points: 20, metric: 'playCount', threshold: 20 },
            { id: 'nf_high_900', name: 'Clean Sweep', desc: 'High score 900', icon: '*', points: 16, metric: 'highScore', threshold: 900 },
            { id: 'nf_total_stage_8', name: 'Clear Operator', desc: 'Total clears 8', icon: '*', points: 16, metric: 'totalStageClears', threshold: 8 },
            { id: 'nf_total_stage_25', name: 'Mine Master', desc: 'Total clears 25', icon: '*', points: 30, metric: 'totalStageClears', threshold: 25 },
            { id: 'nf_item_flag_40', name: 'Flag Specialist', desc: 'Use flag 40 times', icon: '*', points: 16, metric: 'item.flag', threshold: 40 },
            { id: 'nf_best_stage_3', name: 'Hard Mode Clear', desc: 'Best stage 3', icon: '*', points: 26, metric: 'bestStage', threshold: 3 },
            { id: 'nf_total_score_6000', name: 'Steady Solver', desc: 'Total score 6,000', icon: '*', points: 20, metric: 'totalScore', threshold: 6000 }
        ]);

        this.register('neon-slotmachine', [
            { id: 'ns_play_1', name: 'First Spin', desc: 'Play 1 time', icon: '*', points: 5, metric: 'playCount', threshold: 1 },
            { id: 'ns_play_15', name: 'Spin Addict', desc: 'Play 15 times', icon: '*', points: 14, metric: 'playCount', threshold: 15 },
            { id: 'ns_high_3000', name: 'Cash Lift', desc: 'High score 3,000', icon: '*', points: 14, metric: 'highScore', threshold: 3000 },
            { id: 'ns_high_9000', name: 'High Roller', desc: 'High score 9,000', icon: '*', points: 26, metric: 'highScore', threshold: 9000 },
            { id: 'ns_stage_10', name: 'Stage Investor', desc: 'Total stage clears 10', icon: '*', points: 20, metric: 'totalStageClears', threshold: 10 },
            { id: 'ns_item_spin_120', name: 'Chip Grinder', desc: 'Collect spin chip 120', icon: '*', points: 18, metric: 'item.spin_chip', threshold: 120 },
            { id: 'ns_item_bingo_30', name: 'Line Hunter', desc: 'Bingo line 30', icon: '*', points: 20, metric: 'item.bingo', threshold: 30 },
            { id: 'ns_item_skull_5', name: 'Skull Survivor', desc: 'Skull bingo 5', icon: '*', points: 18, metric: 'item.skull_bingo', threshold: 5 },
            { id: 'ns_total_score_50000', name: 'Casino Veteran', desc: 'Total score 50,000', icon: '*', points: 32, metric: 'totalScore', threshold: 50000 },
            { id: 'ns_best_stage_12', name: 'Stage Climber', desc: 'Best stage 12', icon: '*', points: 24, metric: 'bestStage', threshold: 12 }
        ]);

        this.register('neon-survivor', [
            { id: 'nv_play_1', name: 'First Survival', desc: 'Play 1 time', icon: '*', points: 5, metric: 'playCount', threshold: 1 },
            { id: 'nv_play_10', name: 'Arena Regular', desc: 'Play 10 times', icon: '*', points: 14, metric: 'playCount', threshold: 10 },
            { id: 'nv_high_20000', name: 'Danger Zone', desc: 'High score 20,000', icon: '*', points: 16, metric: 'highScore', threshold: 20000 },
            { id: 'nv_high_60000', name: 'Hyper Core', desc: 'High score 60,000', icon: '*', points: 30, metric: 'highScore', threshold: 60000 },
            { id: 'nv_stage_40', name: 'Wave Keeper', desc: 'Total stage clears 40', icon: '*', points: 18, metric: 'totalStageClears', threshold: 40 },
            { id: 'nv_combo_25', name: 'Chain Spark', desc: 'Max combo 25', icon: '*', points: 20, metric: 'maxCombo', threshold: 25 },
            { id: 'nv_combo_total_250', name: 'Chain Reactor', desc: 'Total combo 250', icon: '*', points: 24, metric: 'totalComboCount', threshold: 250 },
            { id: 'nv_item_fireball_5', name: 'Missile Crafter', desc: 'Collect fireball 5 times', icon: '*', points: 18, metric: 'item.fireball', threshold: 5 },
            { id: 'nv_item_ricochet_5', name: 'Ricochet Pilot', desc: 'Collect ricochet 5 times', icon: '*', points: 18, metric: 'item.ricochet', threshold: 5 },
            { id: 'nv_items_35', name: 'Build Architect', desc: 'Collect items 35 times', icon: '*', points: 20, metric: 'totalItemsCollected', threshold: 35 },
            { id: 'nv_total_score_150000', name: 'Arena Legend', desc: 'Total score 150,000', icon: '*', points: 36, metric: 'totalScore', threshold: 150000 },
            { id: 'nv_best_stage_25', name: 'Wave Conqueror', desc: 'Best stage 25', icon: '*', points: 24, metric: 'bestStage', threshold: 25 }
        ]);
    }

    /**
     * Register achievements for game
     */
    register(gameId, achievements) {
        this.definitions.set(gameId, achievements);
    }

    /**
     * Check definition exists
     */
    hasDefinition(gameId, achievementId) {
        return (this.definitions.get(gameId) || []).some((achievement) => achievement.id === achievementId);
    }

    /**
     * Resolve metric value from stored game data
     */
    getMetricValue(metric, gameData) {
        if (!metric || !gameData) return 0;

        if (metric.startsWith('item.')) {
            const itemId = metric.slice(5);
            return Number(gameData.itemStats?.[itemId] || 0);
        }

        const scalarValue = Number(gameData[metric] || 0);
        return Number.isFinite(scalarValue) ? scalarValue : 0;
    }

    /**
     * Evaluate one achievement
     */
    evaluateAchievement(achievement, gameData) {
        if (!achievement.metric || !Number.isFinite(achievement.threshold)) {
            return false;
        }
        return this.getMetricValue(achievement.metric, gameData) >= achievement.threshold;
    }

    /**
     * Get all achievements with unlock/current progress
     */
    getAll(gameId) {
        const definitions = this.definitions.get(gameId) || [];
        const unlockedIds = storage.getAchievements(gameId);
        const gameData = storage.getGameData(gameId);

        return definitions.map((achievement) => {
            const current = this.getMetricValue(achievement.metric, gameData);
            const threshold = Number(achievement.threshold || 0);
            return {
                ...achievement,
                current,
                threshold,
                unlocked: unlockedIds.includes(achievement.id)
            };
        });
    }

    /**
     * Get unlocked achievements
     */
    getUnlocked(gameId) {
        return this.getAll(gameId).filter((achievement) => achievement.unlocked);
    }

    /**
     * Get progress summary
     */
    getProgress(gameId) {
        const all = this.getAll(gameId);
        const unlocked = all.filter((achievement) => achievement.unlocked).length;
        const total = all.length;
        return {
            unlocked,
            total,
            percentage: total > 0 ? Math.round((unlocked / total) * 100) : 0
        };
    }

    /**
     * Get progress summary across games
     */
    getTotalProgress(gameIds = []) {
        const targets = gameIds.length > 0 ? gameIds : Array.from(this.definitions.keys());
        const summary = targets.reduce((acc, gameId) => {
            const progress = this.getProgress(gameId);
            acc.unlocked += progress.unlocked;
            acc.total += progress.total;
            return acc;
        }, { unlocked: 0, total: 0 });

        return {
            ...summary,
            percentage: summary.total > 0 ? Math.round((summary.unlocked / summary.total) * 100) : 0
        };
    }

    /**
     * Unlock one achievement
     */
    unlock(gameId, achievementId) {
        if (!this.hasDefinition(gameId, achievementId)) {
            return false;
        }

        if (storage.hasAchievement(gameId, achievementId)) {
            return false;
        }

        const saved = storage.unlockAchievement(gameId, achievementId);
        if (!saved) {
            return false;
        }

        const achievement = this.definitions
            .get(gameId)
            ?.find((item) => item.id === achievementId);

        if (achievement) {
            this.showUnlockToast(achievement);
        }
        return true;
    }

    /**
     * Evaluate all achievements for a game using latest stored data
     */
    checkAndUnlock(gameId) {
        const definitions = this.definitions.get(gameId) || [];
        const gameData = storage.getGameData(gameId);
        let unlockedCount = 0;

        definitions.forEach((achievement) => {
            if (!this.evaluateAchievement(achievement, gameData)) return;
            if (this.unlock(gameId, achievement.id)) {
                unlockedCount += 1;
            }
        });

        return unlockedCount;
    }

    /**
     * Queue unlock toast
     */
    showUnlockToast(achievement) {
        this.toastQueue.push(achievement);
        if (!this.isShowingToast) {
            this.processToastQueue();
        }
    }

    /**
     * Show queued toasts sequentially
     */
    async processToastQueue() {
        if (this.toastQueue.length === 0) {
            this.isShowingToast = false;
            return;
        }

        this.isShowingToast = true;
        const achievement = this.toastQueue.shift();
        await this.displayToast(achievement);
        this.processToastQueue();
    }

    /**
     * Render toast
     */
    displayToast(achievement) {
        return new Promise((resolve) => {
            const toast = document.createElement('div');
            toast.className = 'achievement-toast animate-slideInRight';
            toast.innerHTML = `
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-info">
                    <div class="achievement-label">ACHIEVEMENT UNLOCKED</div>
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-desc">${achievement.desc}</div>
                </div>
                <div class="achievement-points">+${achievement.points || 0}</div>
            `;

            this.addToastStyles();
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.classList.remove('animate-slideInRight');
                toast.classList.add('animate-slideOutRight');
                setTimeout(() => {
                    toast.remove();
                    resolve();
                }, 280);
            }, 2600);
        });
    }

    /**
     * Add toast styles once
     */
    addToastStyles() {
        if (document.getElementById('achievement-toast-styles')) return;

        const style = document.createElement('style');
        style.id = 'achievement-toast-styles';
        style.textContent = `
            .achievement-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 16px;
                max-width: 380px;
                background: linear-gradient(135deg, rgba(0, 242, 255, 0.2), rgba(255, 0, 255, 0.18));
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                backdrop-filter: blur(14px);
                box-shadow: 0 0 30px rgba(0, 242, 255, 0.22);
                z-index: 9999;
            }

            .achievement-icon {
                font-size: 1.8rem;
                line-height: 1;
            }

            .achievement-info {
                flex: 1;
                min-width: 0;
            }

            .achievement-label {
                font-size: 0.62rem;
                color: rgba(255, 255, 255, 0.75);
                letter-spacing: 0.08em;
                text-transform: uppercase;
                margin-bottom: 2px;
            }

            .achievement-name {
                font-size: 0.95rem;
                font-weight: 700;
                color: #ffffff;
                margin-bottom: 1px;
            }

            .achievement-desc {
                font-size: 0.75rem;
                color: rgba(255, 255, 255, 0.72);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .achievement-points {
                font-family: var(--font-display, 'Orbitron', sans-serif);
                font-weight: 700;
                color: #fff485;
                text-shadow: 0 0 10px rgba(255, 244, 133, 0.5);
            }

            @keyframes slideInRight {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }

            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(120%); opacity: 0; }
            }

            .animate-slideInRight {
                animation: slideInRight 0.28s ease forwards;
            }

            .animate-slideOutRight {
                animation: slideOutRight 0.28s ease forwards;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Render achievement list HTML for popup
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
                ${achievements.map((achievement) => {
                    const isLocked = !achievement.unlocked;
                    const progressText = achievement.threshold > 0
                        ? `${Math.min(achievement.current, achievement.threshold)}/${achievement.threshold}`
                        : '';
                    return `
                        <div class="achievement-item ${achievement.unlocked ? 'unlocked' : 'locked'}">
                            <div class="achievement-item-icon">${achievement.unlocked ? achievement.icon : '🔒'}</div>
                            <div class="achievement-item-info">
                                <div class="achievement-item-name">${isLocked ? 'Locked Achievement' : achievement.name}</div>
                                <div class="achievement-item-desc">${isLocked ? achievement.desc : achievement.desc}</div>
                            </div>
                            <div class="achievement-item-points">${achievement.unlocked ? `+${achievement.points || 0}` : progressText}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
}
