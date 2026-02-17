/**
 * ScoreManager - Score tracking with combos and multipliers
 */
export class ScoreManager {
    constructor(gameId) {
        this.gameId = gameId;
        this.score = 0;
        this.highScore = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.multiplier = 1;

        // Combo timing
        this.lastScoreTime = 0;
        this.comboTimeout = 2000; // ms

        // Score callbacks
        this.onScoreChange = null;
        this.onComboChange = null;
        this.onHighScore = null;

        // Load high score
        this.loadHighScore();
    }

    /**
     * Load high score from storage
     */
    loadHighScore() {
        try {
            const saved = localStorage.getItem(`highscore_${this.gameId}`);
            if (saved) {
                this.highScore = parseInt(saved, 10);
            }
        } catch (e) {
            console.warn('Failed to load high score:', e);
        }
    }

    /**
     * Save high score to storage
     */
    saveHighScore() {
        try {
            localStorage.setItem(`highscore_${this.gameId}`, this.highScore.toString());
        } catch (e) {
            console.warn('Failed to save high score:', e);
        }
    }

    /**
     * Add score with optional combo
     * @param {number} points - Base points
     * @param {boolean} applyCombo - Apply combo multiplier
     * @returns {Object} Score result {points, combo, multiplier}
     */
    add(points, applyCombo = true) {
        const now = performance.now();

        // Check combo timeout
        if (now - this.lastScoreTime > this.comboTimeout) {
            this.resetCombo();
        }

        // Apply combo
        if (applyCombo) {
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.updateMultiplier();

            if (this.onComboChange) {
                this.onComboChange(this.combo, this.multiplier);
            }
        }

        // Calculate final score
        const finalPoints = Math.floor(points * this.multiplier);
        this.score += finalPoints;
        this.lastScoreTime = now;

        // Check high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.saveHighScore();

            if (this.onHighScore) {
                this.onHighScore(this.highScore);
            }
        }

        if (this.onScoreChange) {
            this.onScoreChange(this.score, finalPoints);
        }

        return {
            points: finalPoints,
            combo: this.combo,
            multiplier: this.multiplier
        };
    }

    /**
     * Update multiplier based on combo
     */
    updateMultiplier() {
        if (this.combo >= 50) {
            this.multiplier = 4.0;
        } else if (this.combo >= 30) {
            this.multiplier = 3.0;
        } else if (this.combo >= 20) {
            this.multiplier = 2.5;
        } else if (this.combo >= 10) {
            this.multiplier = 2.0;
        } else if (this.combo >= 5) {
            this.multiplier = 1.5;
        } else {
            this.multiplier = 1.0;
        }
    }

    /**
     * Reset combo
     */
    resetCombo() {
        this.combo = 0;
        this.multiplier = 1;

        if (this.onComboChange) {
            this.onComboChange(0, 1);
        }
    }

    /**
     * Get current score
     */
    getScore() {
        return this.score;
    }

    /**
     * Get high score
     */
    getHighScore() {
        return this.highScore;
    }

    /**
     * Get combo count
     */
    getCombo() {
        return this.combo;
    }

    /**
     * Get max combo
     */
    getMaxCombo() {
        return this.maxCombo;
    }

    /**
     * Check if current score is new high score
     */
    isNewHighScore() {
        return this.score >= this.highScore && this.score > 0;
    }

    /**
     * Format score with commas
     */
    formatScore(score = this.score) {
        return score.toLocaleString();
    }

    /**
     * Reset for new game
     */
    reset() {
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.multiplier = 1;
        this.lastScoreTime = 0;
    }

    /**
     * Get session summary
     */
    getSummary() {
        return {
            score: this.score,
            highScore: this.highScore,
            maxCombo: this.maxCombo,
            isNewHighScore: this.isNewHighScore()
        };
    }
}

/**
 * TimerSystem - Game timer with pause support
 */
export class TimerSystem {
    constructor(initialTime = 60) {
        this.initialTime = initialTime;
        this.timeLeft = initialTime;
        this.isRunning = false;
        this.lastUpdate = 0;

        // Callbacks
        this.onTick = null;
        this.onComplete = null;
        this.onWarning = null;

        // Warning threshold
        this.warningThreshold = 10;
        this.warningTriggered = false;
    }

    /**
     * Start timer
     */
    start() {
        this.isRunning = true;
        this.lastUpdate = performance.now();
    }

    /**
     * Pause timer
     */
    pause() {
        this.isRunning = false;
    }

    /**
     * Resume timer
     */
    resume() {
        this.isRunning = true;
        this.lastUpdate = performance.now();
    }

    /**
     * Update timer
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (!this.isRunning || this.timeLeft <= 0) return;

        this.timeLeft -= dt;

        // Warning check
        if (!this.warningTriggered && this.timeLeft <= this.warningThreshold) {
            this.warningTriggered = true;
            if (this.onWarning) {
                this.onWarning(this.timeLeft);
            }
        }

        // Tick callback
        if (this.onTick) {
            this.onTick(this.timeLeft);
        }

        // Complete check
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.isRunning = false;
            if (this.onComplete) {
                this.onComplete();
            }
        }
    }

    /**
     * Add time
     */
    addTime(seconds) {
        this.timeLeft += seconds;
    }

    /**
     * Get formatted time string
     */
    getFormatted() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = Math.floor(this.timeLeft % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Get time left as percentage
     */
    getPercentage() {
        return (this.timeLeft / this.initialTime) * 100;
    }

    /**
     * Check if in warning state
     */
    isWarning() {
        return this.timeLeft <= this.warningThreshold && this.timeLeft > 0;
    }

    /**
     * Reset timer
     */
    reset() {
        this.timeLeft = this.initialTime;
        this.isRunning = false;
        this.warningTriggered = false;
    }
}
