/**
 * InputManager - Unified touch and mouse input handling
 * Optimized for mobile with touch-action: none
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.scale = 1;

        // Current input state
        this.pointer = {
            x: 0,
            y: 0,
            isDown: false,
            wasDown: false,
            justPressed: false,
            justReleased: false
        };

        // Swipe detection
        this.swipe = {
            startX: 0,
            startY: 0,
            startTime: 0,
            direction: null,
            velocity: 0
        };

        // Multi-touch support
        this.touches = new Map();

        // Event callbacks
        this.callbacks = {
            down: [],
            up: [],
            move: [],
            tap: [],
            swipe: []
        };

        // Configuration
        this.config = {
            tapThreshold: 200, // ms
            swipeThreshold: 50, // px
            swipeVelocityThreshold: 0.3 // px/ms
        };

        this.init();
    }

    /**
     * Initialize input listeners
     */
    init() {
        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });

        // Mouse events (for desktop)
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Prevent context menu on long press
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Set scale factor for coordinate conversion
     * @param {number} scale - Scale factor
     */
    setScale(scale) {
        this.scale = scale;
    }

    /**
     * Convert event coordinates to game coordinates
     * @param {Event} e - Event object
     * @returns {Object} Game coordinates {x, y}
     */
    getCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        return {
            x: (clientX - rect.left) / this.scale,
            y: (clientY - rect.top) / this.scale
        };
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        e.preventDefault();

        const coords = this.getCoords(e);
        this.pointer.x = coords.x;
        this.pointer.y = coords.y;
        this.pointer.isDown = true;
        this.pointer.justPressed = true;

        // Swipe tracking
        this.swipe.startX = coords.x;
        this.swipe.startY = coords.y;
        this.swipe.startTime = performance.now();

        // Store touch
        if (e.touches) {
            Array.from(e.touches).forEach(touch => {
                this.touches.set(touch.identifier, {
                    x: (touch.clientX - this.canvas.getBoundingClientRect().left) / this.scale,
                    y: (touch.clientY - this.canvas.getBoundingClientRect().top) / this.scale
                });
            });
        }

        this.emit('down', { x: coords.x, y: coords.y });
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        e.preventDefault();

        const coords = this.getCoords(e);
        this.pointer.x = coords.x;
        this.pointer.y = coords.y;

        // Update touches
        if (e.touches) {
            Array.from(e.touches).forEach(touch => {
                this.touches.set(touch.identifier, {
                    x: (touch.clientX - this.canvas.getBoundingClientRect().left) / this.scale,
                    y: (touch.clientY - this.canvas.getBoundingClientRect().top) / this.scale
                });
            });
        }

        this.emit('move', { x: coords.x, y: coords.y, isDown: this.pointer.isDown });
    }

    /**
     * Handle touch end
     */
    handleTouchEnd(e) {
        e.preventDefault();

        const endTime = performance.now();
        const duration = endTime - this.swipe.startTime;

        // Calculate swipe
        const dx = this.pointer.x - this.swipe.startX;
        const dy = this.pointer.y - this.swipe.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const velocity = distance / duration;

        // Detect tap
        if (duration < this.config.tapThreshold && distance < 10) {
            this.emit('tap', { x: this.pointer.x, y: this.pointer.y });
        }

        // Detect swipe
        if (distance > this.config.swipeThreshold && velocity > this.config.swipeVelocityThreshold) {
            let direction;
            if (Math.abs(dx) > Math.abs(dy)) {
                direction = dx > 0 ? 'right' : 'left';
            } else {
                direction = dy > 0 ? 'down' : 'up';
            }

            this.swipe.direction = direction;
            this.swipe.velocity = velocity;
            this.emit('swipe', { direction, velocity, dx, dy });
        }

        this.pointer.isDown = false;
        this.pointer.justReleased = true;

        // Clear touches
        if (e.changedTouches) {
            Array.from(e.changedTouches).forEach(touch => {
                this.touches.delete(touch.identifier);
            });
        }

        this.emit('up', { x: this.pointer.x, y: this.pointer.y });
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(e) {
        const coords = this.getCoords(e);
        this.pointer.x = coords.x;
        this.pointer.y = coords.y;
        this.pointer.isDown = true;
        this.pointer.justPressed = true;

        this.swipe.startX = coords.x;
        this.swipe.startY = coords.y;
        this.swipe.startTime = performance.now();

        this.emit('down', { x: coords.x, y: coords.y });
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(e) {
        const coords = this.getCoords(e);
        this.pointer.x = coords.x;
        this.pointer.y = coords.y;

        this.emit('move', { x: coords.x, y: coords.y, isDown: this.pointer.isDown });
    }

    /**
     * Handle mouse up
     */
    handleMouseUp(e) {
        const endTime = performance.now();
        const duration = endTime - this.swipe.startTime;
        const dx = this.pointer.x - this.swipe.startX;
        const dy = this.pointer.y - this.swipe.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (duration < this.config.tapThreshold && distance < 10) {
            this.emit('tap', { x: this.pointer.x, y: this.pointer.y });
        }

        this.pointer.isDown = false;
        this.pointer.justReleased = true;

        this.emit('up', { x: this.pointer.x, y: this.pointer.y });
    }

    /**
     * Register event callback
     * @param {string} event - Event type
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    /**
     * Remove event callback
     * @param {string} event - Event type
     * @param {Function} callback - Callback function
     */
    off(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
        }
    }

    /**
     * Emit event to all callbacks
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => callback(data));
        }
    }

    /**
     * Update input state (call at end of frame)
     */
    update() {
        this.pointer.wasDown = this.pointer.isDown;
        this.pointer.justPressed = false;
        this.pointer.justReleased = false;
    }

    /**
     * Check if pointer is within bounds
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @returns {boolean} True if within bounds
     */
    isInBounds(x, y, width, height) {
        return this.pointer.x >= x &&
            this.pointer.x <= x + width &&
            this.pointer.y >= y &&
            this.pointer.y <= y + height;
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        this.callbacks = { down: [], up: [], move: [], tap: [], swipe: [] };
        this.touches.clear();
    }
}
