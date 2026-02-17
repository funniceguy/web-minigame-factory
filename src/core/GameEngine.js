/**
 * GameEngine - Core game loop with deltaTime and 60 FPS targeting
 * Provides the foundation for all minigames in the platform
 */
export class GameEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas with id "${canvasId}" not found`);
        }
        this.ctx = this.canvas.getContext('2d');

        // Timing
        this.targetFPS = 60;
        this.targetFrameTime = 1000 / this.targetFPS;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.accumulator = 0;
        this.fixedTimeStep = 1 / 60;

        // State
        this.isRunning = false;
        this.isPaused = false;
        this.timeScale = 1.0;

        // Performance tracking
        this.fps = 0;
        this.frameCount = 0;
        this.fpsUpdateTime = 0;

        // Animation frame ID
        this.rafId = null;

        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
    }

    /**
     * Initialize the engine
     */
    init() {
        this.setupCanvas();
        this.onInit();
    }

    /**
     * Setup canvas for optimal rendering
     */
    setupCanvas() {
        // Enable crisp pixel rendering
        this.ctx.imageSmoothingEnabled = false;

        // High DPI support
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        // Store logical dimensions
        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Start the game loop
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.isPaused = false;
        this.lastTime = performance.now();
        this.rafId = requestAnimationFrame(this.gameLoop);
    }

    /**
     * Stop the game loop
     */
    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * Pause the game
     */
    pause() {
        this.isPaused = true;
        this.onPause();
    }

    /**
     * Resume the game
     */
    resume() {
        this.isPaused = false;
        this.lastTime = performance.now();
        this.onResume();
    }

    /**
     * Set time scale for slow motion effects
     * @param {number} scale - Time scale (0.0 to 1.0)
     */
    setTimeScale(scale) {
        this.timeScale = Math.max(0.01, Math.min(1.0, scale));
    }

    /**
     * Main game loop using requestAnimationFrame
     * @param {number} currentTime - Current timestamp
     */
    gameLoop(currentTime) {
        if (!this.isRunning) return;

        // Calculate delta time in seconds
        const rawDeltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Clamp delta time to prevent spiral of death
        this.deltaTime = Math.min(rawDeltaTime, 0.1) * this.timeScale;

        // Update FPS counter
        this.frameCount++;
        this.fpsUpdateTime += rawDeltaTime;
        if (this.fpsUpdateTime >= 1.0) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = 0;
        }

        if (!this.isPaused) {
            // Fixed timestep updates for physics
            this.accumulator += this.deltaTime;
            while (this.accumulator >= this.fixedTimeStep) {
                this.fixedUpdate(this.fixedTimeStep);
                this.accumulator -= this.fixedTimeStep;
            }

            // Variable timestep update
            this.update(this.deltaTime);
        }

        // Always render
        this.render(this.ctx);

        // Schedule next frame
        this.rafId = requestAnimationFrame(this.gameLoop);
    }

    /**
     * Clear the canvas
     * @param {string} color - Background color
     */
    clear(color = '#0a0a0f') {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Override in subclass - Called once at initialization
     */
    onInit() { }

    /**
     * Override in subclass - Fixed timestep update (for physics)
     * @param {number} dt - Fixed delta time
     */
    fixedUpdate(dt) { }

    /**
     * Override in subclass - Variable timestep update
     * @param {number} dt - Delta time
     */
    update(dt) { }

    /**
     * Override in subclass - Render the game
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    render(ctx) {
        this.clear();
    }

    /**
     * Override in subclass - Called when paused
     */
    onPause() { }

    /**
     * Override in subclass - Called when resumed
     */
    onResume() { }

    /**
     * Get current FPS
     * @returns {number} Current FPS
     */
    getFPS() {
        return this.fps;
    }

    /**
     * Destroy the engine and cleanup
     */
    destroy() {
        this.stop();
        this.canvas = null;
        this.ctx = null;
    }
}
