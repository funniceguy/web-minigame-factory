/**
 * GameHub - Main game selection hub and dashboard
 * Manages game gallery, profile display, and navigation
 */
import { storage } from '../systems/StorageManager.js';
import { ShareManager } from './ShareManager.js';
import { AchievementSystem } from './AchievementSystem.js';

export class GameHub {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.games = [];
        this.currentView = 'dashboard'; // dashboard, profile, game
        this.currentGame = null;

        // Sub-managers
        this.shareManager = new ShareManager();
        this.achievementSystem = new AchievementSystem();

        // Game registry
        this.gameRegistry = new Map();

        this.init();
    }

    /**
     * Initialize hub
     */
    init() {
        this.loadGameRegistry();
        this.render();
        this.setupEventListeners();
    }

    /**
     * Load available games
     */
    loadGameRegistry() {
        // HTML games loaded via iframe
        this.registerGame({
            id: 'neon-block',
            name: '네온 블록 브레이커',
            nameEn: 'Neon Block Breaker',
            description: '타임어택 블록 브레이커 + 무한 성장',
            icon: '🧱',
            color: '#00f2ff',
            gradient: ['#00f2ff', '#ff00ff'],
            htmlPath: '/src/html/neon_block.html'
        });

        this.registerGame({
            id: 'neon-findmine',
            name: '블러디 필드',
            nameEn: 'Bloody Field',
            description: '호러 지뢰찾기 - 피의 전장에서 살아남아라',
            icon: '💀',
            color: '#8b0000',
            gradient: ['#8b0000', '#ff3131'],
            htmlPath: '/src/html/neon_findmine.html'
        });

        this.registerGame({
            id: 'neon-slotmachine',
            name: '네온 슬롯 매니아',
            nameEn: 'Neon Slot Mania',
            description: '배수를 조절하고 잭팟을 노려라!',
            icon: '🎰',
            color: '#bc13fe',
            gradient: ['#bc13fe', '#ff00ff'],
            htmlPath: '/src/html/neon_slotmachine.html'
        });

        this.registerGame({
            id: 'neon-survivor',
            name: '네온 서바이버',
            nameEn: 'Neon Survivor',
            description: '30웨이브를 돌파하는 하이퍼 서바이벌',
            icon: '⭐',
            color: '#ff0044',
            gradient: ['#ff0044', '#ffcc00'],
            htmlPath: '/src/html/neon_survivor.html'
        });
    }

    /**
     * Register a game
     */
    registerGame(gameConfig) {
        this.gameRegistry.set(gameConfig.id, gameConfig);
        this.games.push(gameConfig);
    }

    /**
     * Render hub UI
     */
    render() {
        const profile = storage.getProfile();

        this.container.innerHTML = `
            <div class="hub-wrapper">
                <!-- Header -->
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
                
                <!-- Stats Bar -->
                <div class="stats-bar glass-card">
                    <div class="stat-item">
                        <span class="stat-value neon-text-cyan">${profile.totalGamesPlayed}</span>
                        <span class="stat-label">게임 수</span>
                    </div>
                    <div class="stat-divider"></div>
                    <div class="stat-item">
                        <span class="stat-value neon-text-yellow">${this.formatNumber(profile.totalScore)}</span>
                        <span class="stat-label">총 점수</span>
                    </div>
                    <div class="stat-divider"></div>
                    <div class="stat-item">
                        <span class="stat-value neon-text-pink">${storage.getTotalAchievementCount()}</span>
                        <span class="stat-label">업적</span>
                    </div>
                </div>
                
                <!-- Game Gallery -->
                <section class="game-gallery">
                    <h2 class="section-title font-display">
                        <span class="neon-text-cyan">🎮</span> 게임 선택
                    </h2>
                    <div class="game-grid stagger-children">
                        ${this.renderGameCards()}
                    </div>
                </section>
                
                <!-- Game Container (Hidden by default) -->
                <div class="game-container" id="gameContainer" style="display: none;">
                    <button class="back-btn glass-btn" id="backBtn">
                        ← 뒤로
                    </button>
                    <div class="game-canvas-wrapper" id="gameCanvasWrapper"></div>
                </div>
            </div>
        `;

        this.addHubStyles();
    }

    /**
     * Render game cards
     */
    renderGameCards() {
        return this.games.map(game => {
            const gameData = storage.getGameData(game.id);
            const isLocked = game.comingSoon;

            return `
                <div class="game-card glass-card ${isLocked ? 'locked' : ''}" 
                     data-game-id="${game.id}"
                     style="--card-color: ${game.color}">
                    <div class="game-card-bg" 
                         style="background: linear-gradient(135deg, ${game.gradient ? game.gradient[0] : game.color}22, ${game.gradient ? game.gradient[1] : game.color}22)">
                    </div>
                    <div class="game-card-content">
                        <div class="game-icon">${game.icon}</div>
                        <h3 class="game-name font-display">${game.name}</h3>
                        <p class="game-desc">${game.description}</p>
                        ${isLocked ? `
                            <div class="coming-soon-badge glass-badge">COMING SOON</div>
                        ` : `
                            <div class="game-stats">
                                <span class="high-score">🏆 ${this.formatNumber(gameData.highScore)}</span>
                                <span class="play-count">🎮 ${gameData.playCount}회</span>
                            </div>
                            <div class="game-actions">
                                <button class="play-btn neon-btn" data-action="play">
                                    플레이
                                </button>
                                <button class="share-btn glass-btn" data-action="share">
                                    📤
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Add hub-specific styles
     */
    addHubStyles() {
        if (document.getElementById('hub-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'hub-styles';
        styles.textContent = `
            .hub-wrapper {
                min-height: 100vh;
                padding: var(--space-4);
                padding-top: var(--space-6);
            }
            
            .hub-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: var(--space-4);
                margin-bottom: var(--space-4);
            }
            
            .hub-logo {
                display: flex;
                flex-direction: column;
                gap: 0;
                line-height: 1;
            }
            
            .profile-btn {
                display: flex;
                align-items: center;
                gap: var(--space-2);
            }
            
            .avatar {
                font-size: 1.5rem;
            }
            
            .nickname {
                max-width: 80px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .stats-bar {
                display: flex;
                justify-content: space-around;
                align-items: center;
                padding: var(--space-4);
                margin-bottom: var(--space-6);
            }
            
            .stat-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: var(--space-1);
            }
            
            .stat-value {
                font-family: var(--font-display);
                font-size: var(--font-size-xl);
                font-weight: var(--font-weight-bold);
            }
            
            .stat-label {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
            }
            
            .stat-divider {
                width: 1px;
                height: 30px;
                background: rgba(255, 255, 255, 0.1);
            }
            
            .section-title {
                font-size: var(--font-size-lg);
                margin-bottom: var(--space-4);
                display: flex;
                align-items: center;
                gap: var(--space-2);
            }
            
            .game-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: var(--space-4);
            }
            
            @media (min-width: 500px) {
                .game-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
            
            .game-card {
                position: relative;
                overflow: hidden;
                padding: var(--space-5);
                cursor: pointer;
                transition: all var(--transition-normal);
                animation: fadeInUp 0.4s ease forwards;
                opacity: 0;
            }
            
            .game-card:hover:not(.locked) {
                transform: translateY(-4px) scale(1.02);
                box-shadow: 
                    0 10px 40px rgba(0, 0, 0, 0.3),
                    0 0 20px var(--card-color, var(--neon-cyan));
            }
            
            .game-card.locked {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .game-card-bg {
                position: absolute;
                inset: 0;
                opacity: 0.3;
            }
            
            .game-card-content {
                position: relative;
                z-index: 1;
            }
            
            .game-icon {
                font-size: 2.5rem;
                margin-bottom: var(--space-3);
            }
            
            .game-name {
                font-size: var(--font-size-lg);
                margin-bottom: var(--space-2);
                color: var(--card-color, var(--neon-cyan));
            }
            
            .game-desc {
                font-size: var(--font-size-sm);
                color: var(--text-secondary);
                margin-bottom: var(--space-3);
            }
            
            .coming-soon-badge {
                display: inline-block;
                background: rgba(255, 255, 0, 0.2);
                color: var(--neon-yellow);
            }
            
            .game-stats {
                display: flex;
                gap: var(--space-4);
                font-size: var(--font-size-sm);
                margin-bottom: var(--space-3);
            }
            
            .high-score {
                color: var(--neon-yellow);
            }
            
            .play-count {
                color: var(--text-secondary);
            }
            
            .game-actions {
                display: flex;
                gap: var(--space-2);
            }
            
            .play-btn {
                flex: 1;
            }
            
            .share-btn {
                padding: var(--space-3);
            }
            
            .game-container {
                position: fixed;
                inset: 0;
                background: var(--bg-primary);
                z-index: var(--z-modal);
                display: flex;
                flex-direction: column;
            }
            
            .back-btn {
                position: absolute;
                top: var(--space-4);
                left: var(--space-4);
                z-index: 10;
            }
            
            .game-canvas-wrapper {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .game-iframe {
                width: 100%;
                height: 100%;
                border: none;
                border-radius: 0;
                background: #000;
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Game card clicks
        this.container.addEventListener('click', (e) => {
            const gameCard = e.target.closest('.game-card');
            const action = e.target.closest('[data-action]')?.dataset.action;
            const gameId = gameCard?.dataset.gameId;

            if (!gameId) return;

            const game = this.gameRegistry.get(gameId);
            if (!game || game.comingSoon) return;

            if (action === 'share') {
                e.stopPropagation();
                this.showShareModal(gameId);
            } else if (action === 'play' || gameCard) {
                this.launchGame(gameId);
            }
        });

        // Back button
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('#backBtn')) {
                this.exitGame();
            }
        });

        // Profile button
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('#profileBtn')) {
                this.showProfileModal();
            }
        });
    }

    /**
     * Launch a game
     */
    async launchGame(gameId) {
        const game = this.gameRegistry.get(gameId);
        if (!game) return;

        this.currentGame = gameId;

        // Show game container
        const gameContainer = document.getElementById('gameContainer');
        const canvasWrapper = document.getElementById('gameCanvasWrapper');

        gameContainer.style.display = 'flex';
        gameContainer.classList.add('animate-fadeIn');

        // HTML game - load via iframe
        if (game.htmlPath) {
            canvasWrapper.innerHTML = `
                <iframe 
                    id="gameIframe"
                    src="${game.htmlPath}" 
                    class="game-iframe"
                    allow="autoplay; fullscreen"
                    allowfullscreen
                ></iframe>
            `;
            return;
        }

        // JS module game - dynamic import
        try {
            const module = await import(game.path);
            const GameClass = module.default || module[Object.keys(module)[0]];

            // Create game instance
            canvasWrapper.innerHTML = '<canvas id="gameCanvas"></canvas>';
            this.gameInstance = new GameClass('gameCanvas', {
                onGameOver: (result) => this.handleGameOver(gameId, result),
                onAchievement: (achievementId) => this.achievementSystem.unlock(gameId, achievementId)
            });

            this.gameInstance.init();
            this.gameInstance.start();
        } catch (error) {
            console.error('Failed to load game:', error);
            canvasWrapper.innerHTML = `
                <div class="glass-panel" style="padding: var(--space-8); text-align: center;">
                    <p class="neon-text-pink">게임 로드 실패</p>
                    <p class="text-muted">${error.message}</p>
                </div>
            `;
        }
    }

    /**
     * Exit current game
     */
    exitGame() {
        // Clean up JS game instance
        if (this.gameInstance) {
            this.gameInstance.destroy?.();
            this.gameInstance = null;
        }

        // Clean up iframe
        const iframe = document.getElementById('gameIframe');
        if (iframe) {
            iframe.src = 'about:blank';
            iframe.remove();
        }

        this.currentGame = null;

        const gameContainer = document.getElementById('gameContainer');
        gameContainer.style.display = 'none';

        // Refresh dashboard
        this.render();
        this.setupEventListeners();
    }

    /**
     * Handle game over
     */
    handleGameOver(gameId, result) {
        // Record session
        storage.recordGameSession(gameId, result);

        // Check achievements
        this.checkAchievements(gameId, result);

        // Show game over UI is handled by game itself
    }

    /**
     * Check and unlock achievements
     */
    checkAchievements(gameId, result) {
        const game = this.gameRegistry.get(gameId);
        if (!game?.achievements) return;

        // Example achievement checks
        if (result.level >= 1) {
            this.achievementSystem.unlock(gameId, 'first_clear');
        }
        if (result.maxCombo >= 10) {
            this.achievementSystem.unlock(gameId, 'combo_10');
        }
        if (result.score >= 10000) {
            this.achievementSystem.unlock(gameId, 'score_10000');
        }
        if (result.level >= 5) {
            this.achievementSystem.unlock(gameId, 'level_5');
        }
    }

    /**
     * Show share modal
     */
    showShareModal(gameId) {
        const gameData = storage.getGameData(gameId);
        const game = this.gameRegistry.get(gameId);
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

    /**
     * Show profile modal
     */
    showProfileModal() {
        // Prevent duplicate modals
        if (document.querySelector('.profile-modal')) return;

        const profile = storage.getProfile();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay glass-overlay animate-fadeIn profile-modal';
        modal.innerHTML = `
            <div class="modal glass-modal animate-fadeInScale" style="padding: var(--space-6); max-width: 320px; margin: auto;">
                <h2 class="font-display neon-text-cyan" style="margin-bottom: var(--space-4);">프로필</h2>
                
                <div style="text-align: center; margin-bottom: var(--space-4);">
                    <div style="font-size: 3rem; margin-bottom: var(--space-2);">${this.getAvatarEmoji(profile.avatar)}</div>
                    <input type="text" class="glass-input" id="nicknameInput" 
                           value="${profile.nickname}" placeholder="닉네임" 
                           style="text-align: center; width: 100%;">
                </div>
                
                <div class="glass-divider"></div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4);">
                    <div class="stat-item">
                        <span class="stat-value neon-text-yellow">${this.formatNumber(profile.totalScore)}</span>
                        <span class="stat-label">총 점수</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value neon-text-cyan">${profile.totalGamesPlayed}</span>
                        <span class="stat-label">게임 수</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: var(--space-2);">
                    <button class="glass-btn" id="closeProfileBtn" style="flex: 1;">닫기</button>
                    <button class="neon-btn" id="saveProfileBtn" style="flex: 1;">저장</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('#closeProfileBtn').onclick = () => modal.remove();
        modal.querySelector('#saveProfileBtn').onclick = () => {
            const nickname = modal.querySelector('#nicknameInput').value.trim() || 'Player';
            storage.setNickname(nickname);
            modal.remove();
            this.render();
        };
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    /**
     * Get avatar emoji
     */
    getAvatarEmoji(avatar) {
        const avatars = {
            default: '👤',
            cat: '🐱',
            dog: '🐶',
            robot: '🤖',
            alien: '👽',
            ninja: '🥷'
        };
        return avatars[avatar] || avatars.default;
    }

    /**
     * Format number with commas
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    }
}
