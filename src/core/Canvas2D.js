/**
 * Canvas2D - Canvas management with responsive scaling
 * Handles 16:9 aspect ratio and mobile-first design
 */
export class Canvas2D {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.getElementById(container)
            : container;

        this.options = {
            aspectRatio: 16 / 9,
            maxWidth: 480,
            maxHeight: 854,
            backgroundColor: '#0a0a0f',
            ...options
        };

        this.canvas = null;
        this.ctx = null;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Virtual dimensions (game coordinates)
        this.virtualWidth = this.options.maxWidth;
        this.virtualHeight = this.options.maxHeight;

        this.init();
    }

    /**
     * Initialize the canvas
     */
    init() {
        this.createCanvas();
        this.resize();
        this.setupResizeListener();
    }

    /**
     * Create canvas element
     */
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.touchAction = 'none';
        this.canvas.style.userSelect = 'none';
        this.canvas.style.webkitUserSelect = 'none';
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);
    }

    /**
     * Resize canvas to fit container while maintaining aspect ratio
     */
    resize() {
        const containerWidth = this.container.clientWidth;
        const containerHeight = this.container.clientHeight;

        // Calculate dimensions maintaining aspect ratio
        let width = containerWidth;
        let height = containerWidth / this.options.aspectRatio;

        if (height > containerHeight) {
            height = containerHeight;
            width = containerHeight * this.options.aspectRatio;
        }

        // Apply max constraints
        width = Math.min(width, this.options.maxWidth);
        height = Math.min(height, this.options.maxHeight);

        // Calculate scale
        this.scale = width / this.virtualWidth;

        // Calculate offsets for centering
        this.offsetX = (containerWidth - width) / 2;
        this.offsetY = (containerHeight - height) / 2;

        // Set canvas dimensions (handle DPR)
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.style.marginLeft = `${this.offsetX}px`;
        this.canvas.style.marginTop = `${this.offsetY}px`;

        // Scale context for DPR
        this.ctx.scale(dpr, dpr);

        // Store actual dimensions
        this.width = width;
        this.height = height;
    }

    /**
     * Setup window resize listener with debounce
     */
    setupResizeListener() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.resize(), 100);
        });
    }

    /**
     * Convert screen coordinates to game coordinates
     * @param {number} screenX - Screen X position
     * @param {number} screenY - Screen Y position
     * @returns {Object} Game coordinates {x, y}
     */
    screenToGame(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (screenX - rect.left) / this.scale,
            y: (screenY - rect.top) / this.scale
        };
    }

    /**
     * Convert game coordinates to screen coordinates
     * @param {number} gameX - Game X position
     * @param {number} gameY - Game Y position
     * @returns {Object} Screen coordinates {x, y}
     */
    gameToScreen(gameX, gameY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: gameX * this.scale + rect.left,
            y: gameY * this.scale + rect.top
        };
    }

    /**
     * Clear the canvas
     * @param {string} color - Background color
     */
    clear(color = this.options.backgroundColor) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Get canvas context
     * @returns {CanvasRenderingContext2D} Canvas 2D context
     */
    getContext() {
        return this.ctx;
    }

    /**
     * Get canvas element
     * @returns {HTMLCanvasElement} Canvas element
     */
    getCanvas() {
        return this.canvas;
    }

    /**
     * Destroy canvas and cleanup
     */
    destroy() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
    }
}

/**
 * Utility functions for canvas rendering
 */
export const CanvasUtils = {
    /**
     * Draw rounded rectangle
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    },

    /**
     * Create gradient from array of colors
     */
    createGradient(ctx, x1, y1, x2, y2, colors) {
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1), color);
        });
        return gradient;
    },

    /**
     * Draw text with shadow/glow
     */
    drawGlowText(ctx, text, x, y, options = {}) {
        const {
            font = '20px Orbitron',
            color = '#00f2ff',
            glowColor = 'rgba(0, 242, 255, 0.5)',
            glowSize = 10,
            align = 'center',
            baseline = 'middle'
        } = options;

        ctx.save();
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = baseline;

        // Glow layers
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowSize;
        ctx.fillStyle = color;

        // Draw multiple times for stronger glow
        for (let i = 0; i < 3; i++) {
            ctx.fillText(text, x, y);
        }

        ctx.restore();
    },

    /**
     * Draw neon line
     */
    drawNeonLine(ctx, x1, y1, x2, y2, color = '#00f2ff', width = 2) {
        ctx.save();

        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.restore();
    }
};
