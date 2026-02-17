/**
 * ParticleSystem - Lightweight particle effects with object pooling
 * Maximum 50 simultaneous particles to maintain 60 FPS
 */
export class ParticleSystem {
    constructor(maxParticles = 50) {
        this.maxParticles = maxParticles;
        this.particles = [];
        this.pool = [];

        // Pre-allocate pool
        for (let i = 0; i < maxParticles; i++) {
            this.pool.push(this.createParticle());
        }
    }

    /**
     * Create a particle object
     */
    createParticle() {
        return {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            life: 0,
            maxLife: 0,
            size: 0,
            color: '#fff',
            alpha: 1,
            gravity: 0,
            friction: 1,
            shrink: true,
            active: false
        };
    }

    /**
     * Get particle from pool
     */
    getFromPool() {
        if (this.pool.length > 0) {
            return this.pool.pop();
        }
        // If pool is empty, reuse oldest particle
        if (this.particles.length >= this.maxParticles) {
            const oldest = this.particles.shift();
            return oldest;
        }
        return this.createParticle();
    }

    /**
     * Return particle to pool
     */
    returnToPool(particle) {
        particle.active = false;
        this.pool.push(particle);
    }

    /**
     * Spawn single particle
     */
    spawn(options = {}) {
        const particle = this.getFromPool();

        particle.x = options.x || 0;
        particle.y = options.y || 0;
        particle.vx = options.vx || (Math.random() - 0.5) * 4;
        particle.vy = options.vy || (Math.random() - 0.5) * 4;
        particle.life = options.life || 1;
        particle.maxLife = particle.life;
        particle.size = options.size || 4;
        particle.color = options.color || '#00f2ff';
        particle.alpha = options.alpha || 1;
        particle.gravity = options.gravity || 0.1;
        particle.friction = options.friction || 0.98;
        particle.shrink = options.shrink !== false;
        particle.active = true;

        this.particles.push(particle);
        return particle;
    }

    /**
     * Emit burst of particles
     */
    emit(x, y, count = 10, options = {}) {
        const colors = options.colors || ['#00f2ff', '#ff00ff', '#ffff00', '#00ff88'];

        for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
            const speed = options.speed || (2 + Math.random() * 4);

            this.spawn({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: options.life || (0.5 + Math.random() * 0.5),
                size: options.size || (3 + Math.random() * 3),
                color: colors[Math.floor(Math.random() * colors.length)],
                gravity: options.gravity || 0.1,
                friction: options.friction || 0.96,
                shrink: options.shrink !== false
            });
        }
    }

    /**
     * Create explosion effect
     */
    explode(x, y, options = {}) {
        const count = options.count || 20;
        const colors = options.colors || ['#ff4444', '#ff8844', '#ffff44'];

        for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;

            this.spawn({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.4 + Math.random() * 0.4,
                size: 2 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                gravity: 0.15,
                friction: 0.94
            });
        }
    }

    /**
     * Create sparkle effect
     */
    sparkle(x, y, color = '#00f2ff') {
        for (let i = 0; i < 5 && this.particles.length < this.maxParticles; i++) {
            this.spawn({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 2,
                vy: -1 - Math.random() * 2,
                life: 0.3 + Math.random() * 0.3,
                size: 2 + Math.random() * 2,
                color,
                gravity: 0.05
            });
        }
    }

    /**
     * Create trail effect
     */
    trail(x, y, color = '#00f2ff') {
        if (this.particles.length >= this.maxParticles) return;

        this.spawn({
            x,
            y,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            life: 0.2 + Math.random() * 0.1,
            size: 2 + Math.random() * 2,
            color,
            gravity: 0,
            friction: 0.9
        });
    }

    /**
     * Update all particles
     */
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            if (!p.active) {
                this.particles.splice(i, 1);
                this.returnToPool(p);
                continue;
            }

            // Physics
            p.vy += p.gravity;
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.x += p.vx;
            p.y += p.vy;

            // Life
            p.life -= dt;
            p.alpha = Math.max(0, p.life / p.maxLife);

            if (p.shrink) {
                p.size = p.size * (p.life / p.maxLife);
            }

            // Remove dead particles
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                this.returnToPool(p);
            }
        }
    }

    /**
     * Render all particles
     */
    render(ctx) {
        ctx.save();

        for (const p of this.particles) {
            if (!p.active || p.alpha <= 0) continue;

            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;

            // Draw circle
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.5, p.size / 2), 0, Math.PI * 2);
            ctx.fill();

            // Add glow effect for larger particles
            if (p.size > 3) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = p.size * 2;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        ctx.restore();
    }

    /**
     * Get particle count
     */
    getCount() {
        return this.particles.length;
    }

    /**
     * Clear all particles
     */
    clear() {
        while (this.particles.length > 0) {
            const p = this.particles.pop();
            this.returnToPool(p);
        }
    }

    /**
     * Destroy system
     */
    destroy() {
        this.particles = [];
        this.pool = [];
    }
}
