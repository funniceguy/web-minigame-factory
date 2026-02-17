/**
 * StateManager - Game state management with transitions
 * Handles game flow: START → PLAYING → CARD_SELECT → GAMEOVER
 */
export class StateManager {
    constructor() {
        // Available states
        this.states = {
            START: 'START',
            PLAYING: 'PLAYING',
            PAUSED: 'PAUSED',
            CARD_SELECT: 'CARD_SELECT',
            GAMEOVER: 'GAMEOVER',
            LOADING: 'LOADING',
            TRANSITIONING: 'TRANSITIONING'
        };

        // Current state
        this.currentState = this.states.START;
        this.previousState = null;

        // State data
        this.stateData = {};

        // Transition
        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 0.3;

        // State callbacks
        this.callbacks = {
            onEnter: {},
            onExit: {},
            onChange: []
        };

        // State history for back navigation
        this.history = [];
        this.maxHistory = 10;
    }

    /**
     * Get current state
     * @returns {string} Current state
     */
    getState() {
        return this.currentState;
    }

    /**
     * Check if current state matches
     * @param {string} state - State to check
     * @returns {boolean} True if matches
     */
    isState(state) {
        return this.currentState === state;
    }

    /**
     * Change to new state
     * @param {string} newState - New state
     * @param {Object} data - Optional data to pass
     * @param {boolean} addToHistory - Add to history for back navigation
     */
    setState(newState, data = {}, addToHistory = true) {
        if (!this.states[newState]) {
            console.warn(`Unknown state: ${newState}`);
            return;
        }

        if (this.currentState === newState) return;

        // Store previous state
        this.previousState = this.currentState;

        // Add to history
        if (addToHistory && this.currentState !== this.states.TRANSITIONING) {
            this.history.push(this.currentState);
            if (this.history.length > this.maxHistory) {
                this.history.shift();
            }
        }

        // Exit callbacks
        this.triggerExit(this.currentState, newState, data);

        // Update state
        this.currentState = newState;
        this.stateData = data;

        // Enter callbacks
        this.triggerEnter(newState, this.previousState, data);

        // Change callbacks
        this.callbacks.onChange.forEach(cb => cb(newState, this.previousState, data));
    }

    /**
     * Transition to new state with animation
     * @param {string} newState - New state
     * @param {Object} options - Transition options
     */
    async transition(newState, options = {}) {
        const { duration = 0.3, data = {} } = options;

        this.isTransitioning = true;
        this.transitionDuration = duration;
        this.transitionProgress = 0;

        // Transition out
        await this.animate(duration / 2, (progress) => {
            this.transitionProgress = progress;
        });

        // Change state
        this.setState(newState, data);

        // Transition in
        await this.animate(duration / 2, (progress) => {
            this.transitionProgress = 1 - progress;
        });

        this.isTransitioning = false;
        this.transitionProgress = 0;
    }

    /**
     * Helper animation function
     */
    animate(duration, onUpdate) {
        return new Promise(resolve => {
            const startTime = performance.now();

            const tick = (currentTime) => {
                const elapsed = (currentTime - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);

                onUpdate(progress);

                if (progress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    resolve();
                }
            };

            requestAnimationFrame(tick);
        });
    }

    /**
     * Go back to previous state
     */
    goBack() {
        if (this.history.length > 0) {
            const previousState = this.history.pop();
            this.setState(previousState, {}, false);
        }
    }

    /**
     * Register enter callback for state
     * @param {string} state - State name
     * @param {Function} callback - Callback function
     */
    onEnter(state, callback) {
        if (!this.callbacks.onEnter[state]) {
            this.callbacks.onEnter[state] = [];
        }
        this.callbacks.onEnter[state].push(callback);
    }

    /**
     * Register exit callback for state
     * @param {string} state - State name
     * @param {Function} callback - Callback function
     */
    onExit(state, callback) {
        if (!this.callbacks.onExit[state]) {
            this.callbacks.onExit[state] = [];
        }
        this.callbacks.onExit[state].push(callback);
    }

    /**
     * Register state change callback
     * @param {Function} callback - Callback function
     */
    onChange(callback) {
        this.callbacks.onChange.push(callback);
    }

    /**
     * Trigger enter callbacks
     */
    triggerEnter(state, fromState, data) {
        if (this.callbacks.onEnter[state]) {
            this.callbacks.onEnter[state].forEach(cb => cb(fromState, data));
        }
    }

    /**
     * Trigger exit callbacks
     */
    triggerExit(state, toState, data) {
        if (this.callbacks.onExit[state]) {
            this.callbacks.onExit[state].forEach(cb => cb(toState, data));
        }
    }

    /**
     * Get state data
     * @returns {Object} State data
     */
    getData() {
        return this.stateData;
    }

    /**
     * Update state data
     * @param {Object} data - Data to merge
     */
    updateData(data) {
        this.stateData = { ...this.stateData, ...data };
    }

    /**
     * Reset to initial state
     */
    reset() {
        this.currentState = this.states.START;
        this.previousState = null;
        this.stateData = {};
        this.history = [];
        this.isTransitioning = false;
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        this.callbacks = { onEnter: {}, onExit: {}, onChange: [] };
        this.history = [];
    }
}

/**
 * Game session data structure
 */
export class GameSession {
    constructor() {
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.timeLeft = 60;
        this.combo = 0;
        this.maxCombo = 0;
        this.startTime = 0;
        this.endTime = 0;
        this.achievements = [];
    }

    start() {
        this.startTime = Date.now();
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
    }

    end() {
        this.endTime = Date.now();
    }

    addScore(points, withCombo = true) {
        if (withCombo) {
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            points = Math.floor(points * (1 + this.combo * 0.1));
        }
        this.score += points;
        return points;
    }

    resetCombo() {
        this.combo = 0;
    }

    getDuration() {
        const end = this.endTime || Date.now();
        return Math.floor((end - this.startTime) / 1000);
    }

    toJSON() {
        return {
            score: this.score,
            level: this.level,
            maxCombo: this.maxCombo,
            duration: this.getDuration(),
            achievements: this.achievements
        };
    }
}
