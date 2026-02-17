/**
 * Neon Block Evolution - Time Attack Block Breaker
 * Features: Time attack, upgrade cards, keyboard & touch controls
 * Responsive 9:16 design with horizontal-based scaling
 */
import { GameEngine } from '../../core/GameEngine.js';
import { StateManager, GameSession } from '../../core/StateManager.js';
import { ParticleSystem } from '../../systems/ParticleSystem.js';
import { ScoreManager } from '../../systems/ScoreManager.js';

export default class NeonEvolution extends GameEngine {
    constructor(canvasId, options = {}) {
        super(canvasId);
        this.options = options;

        // Systems
        this.state = null;
        this.particles = null;
        this.scoreManager = null;
        this.session = null;

        // Virtual dimensions (9:16 portrait)
        // Game area is 450x750, bottom 50px reserved for commentary
        this.virtualWidth = 450;
        this.virtualHeight = 800;
        this.gameAreaHeight = 750; // Playable area (excludes commentary)
        this.scale = 1;
        this.dpr = 1;

        // Game state
        this.level = 1;
        this.timeLeft = 120;
        this.combo = 0;
        this.lastComboTime = 0;
        this.itemSelectionType = 'LEVEL_CLEAR';

        // Time scale for slow-mo effect
        this.timeScale = 1;
        this.targetTimeScale = 1;

        // Input state
        this.keys = { left: false, right: false };
        this.paddleVelocity = 0;
        this.lastPaddleX = 0;

        // Commentary system
        this.currentComment = '';
        this.commentTimer = 0;
        this.comments = {
            start: ['블럭 박살 내자!', '시간은 금이다!', '집중! 집중!', '파이팅!'],
            combo: ['콤보 유지!', '연속 파괴!', '멈추지 마!', '대단해!'],
            special: ['스페셜 블럭!', '보너스 타임!', '행운의 블럭!'],
            warning: ['시간이 없어!', '서둘러!', '타임 오버 임박!'],
            clear: ['스테이지 클리어!', '다음 스테이지!', '잘했어!'],
            miss: ['아깝다!', '다시 도전!', '괜찮아!']
        };

        // Upgrades
        this.upgrades = {
            paddleWidth: 100,
            ballSpeedMult: 1.0,
            ballDamage: 1.0,
            bulletDamage: 0.5,
            extraBalls: 0,
            gunsLevel: 0,
            homing: false,
            fireRate: 60,
            explosiveLevel: 0,
            shield: false
        };

        // Game objects
        this.paddle = { x: 0, y: 0, height: 14, speed: 10 };
        this.balls = [];
        this.bullets = [];
        this.blocks = [];
        this.shieldActive = false;
        this.gameFrame = 0;
        this.pendingCardSelect = false; // Prevent multiple card selections

        // Cards database
        this.cardsDB = [
            { id: 'multiball', title: '멀티 볼', desc: '공 추가', icon: '⚽' },
            { id: 'power_ball', title: '파워 볼', desc: '데미지 +100%', icon: '💪' },
            { id: 'wide_paddle', title: '와이드', desc: '패들 +20', icon: '📏' },
            { id: 'blaster_count', title: '오토 건', desc: '총알 발사', icon: '🔫' },
            { id: 'blaster_dmg', title: '헤비 불렛', desc: '총알 +25%', icon: '💣', req: 'gun' },
            { id: 'homing', title: '유도', desc: '총알 유도', icon: '🎯', req: 'gun' },
            { id: 'explosive', title: '폭발', desc: '광역 피해', icon: '💥' },
            { id: 'shield', title: '쉴드', desc: '방어막', icon: '🛡️' }
        ];
    }

    onInit() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Keyboard input
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Mouse/Touch input
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleClick(e);
        }, { passive: false });

        this.state = new StateManager();
        this.particles = new ParticleSystem(50);
        this.scoreManager = new ScoreManager('neon-evolution');
        this.session = new GameSession();

        this.setupStateCallbacks();
        this.resetGame();
        this.state.setState('START');
    }

    handleKeyDown(e) {
        if (e.code === 'ArrowLeft') { this.keys.left = true; e.preventDefault(); }
        if (e.code === 'ArrowRight') { this.keys.right = true; e.preventDefault(); }
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.state.isState('START')) this.startGame();
            else if (this.state.isState('PLAYING')) this.launchBalls();
            else if (this.state.isState('PAUSED')) this.state.setState('PLAYING');
        }
        if (e.code === 'Escape' && this.state.isState('PLAYING')) this.state.setState('PAUSED');
    }

    handleKeyUp(e) {
        if (e.code === 'ArrowLeft') this.keys.left = false;
        if (e.code === 'ArrowRight') this.keys.right = false;
    }

    handlePointerMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.scale;
        this.paddle.x = Math.max(0, Math.min(this.virtualWidth - this.upgrades.paddleWidth, x - this.upgrades.paddleWidth / 2));
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.touches[0].clientX - rect.left) / this.scale;
            this.paddle.x = Math.max(0, Math.min(this.virtualWidth - this.upgrades.paddleWidth, x - this.upgrades.paddleWidth / 2));
        }
    }

    handleClick(e) {
        if (this.state.isState('START')) this.startGame();
        else if (this.state.isState('PLAYING')) this.launchBalls();
        else if (this.state.isState('PAUSED')) {
            // Check pause button click
            const rect = this.canvas.getBoundingClientRect();
            const x = ((e.clientX || e.touches?.[0]?.clientX) - rect.left) / this.scale;
            const y = ((e.clientY || e.touches?.[0]?.clientY) - rect.top) / this.scale;
            if (x > this.virtualWidth - 50 && y < 50) return; // Pause button area
            this.state.setState('PLAYING');
        }
    }

    launchBalls() {
        this.balls.forEach(b => {
            if (!b.active && !b.isDead) {
                b.active = true;
                const speedMult = this.getSpeedMultiplier();
                b.dx = 4 * this.upgrades.ballSpeedMult * speedMult * (Math.random() < 0.5 ? 1 : -1);
                b.dy = -5 * this.upgrades.ballSpeedMult * speedMult;
            }
        });
    }

    // Dynamic speed based on time and stage
    getSpeedMultiplier() {
        let mult = 1.0;
        // Time-based speed (under 60 seconds) - reduced
        if (this.timeLeft < 60) {
            mult += (60 - this.timeLeft) / 60 * 0.25; // up to +25% at 0 sec
        }
        // Stage-based speed (every 10 stages) - reduced
        mult += Math.floor(this.level / 10) * 0.08; // +8% per 10 stages
        return Math.min(mult, 1.5); // cap at 1.5x speed
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const cw = container.clientWidth;
        const ch = container.clientHeight;

        // Horizontal-based scaling (width determines scale)
        const ratio = this.virtualWidth / this.virtualHeight;
        let w, h;

        // Scale based on width, but clamp to height
        w = Math.min(cw, ch * ratio);
        h = w / ratio;

        // If height would exceed container, scale down
        if (h > ch) {
            h = ch;
            w = h * ratio;
        }

        this.scale = w / this.virtualWidth;
        this.dpr = window.devicePixelRatio || 1;

        this.canvas.width = w * this.dpr;
        this.canvas.height = h * this.dpr;
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${(cw - w) / 2}px`;
        this.canvas.style.top = `${(ch - h) / 2}px`;
        this.canvas.style.borderRadius = '16px';
        this.width = w;
        this.height = h;
    }

    setupStateCallbacks() {
        this.state.onEnter('START', () => { });
        this.state.onEnter('PLAYING', () => {
            if (!this.session.startTime) this.session.start();
        });
        this.state.onEnter('PAUSED', () => { });
        this.state.onEnter('CARD_SELECT', () => {
            // Slow-mo start
            this.timeScale = 0.1;
        });
        this.state.onEnter('GAMEOVER', () => {
            this.session.end();
        });
    }

    setComment(type) {
        const arr = this.comments[type];
        if (arr) {
            this.currentComment = arr[Math.floor(Math.random() * arr.length)];
            this.commentTimer = 3;
        }
    }

    getTimeLimit(lv) { return lv <= 5 ? 120 : lv <= 10 ? 90 : lv <= 15 ? 60 : lv <= 20 ? 30 : lv <= 30 ? 25 : lv <= 40 ? 20 : lv <= 50 ? 15 : 10; }
    getHp(lv) { let hp = 1; for (let i = 1; i < lv; i++) hp *= (i % 5 === 4) ? 1.5 : 1.1; return hp; }

    resetGame() {
        this.scoreManager.reset();
        this.level = 1;
        this.timeLeft = this.getTimeLimit(1);
        this.combo = 0;
        this.timeScale = 1;
        this.targetTimeScale = 1;
        this.upgrades = { paddleWidth: 100, ballSpeedMult: 1, ballDamage: 1, bulletDamage: 0.5, extraBalls: 0, gunsLevel: 0, homing: false, fireRate: 60, explosiveLevel: 0, shield: false };
        this.shieldActive = false;
        this.bullets = [];
        this.gameFrame = 0;
        this.paddle.x = (this.virtualWidth - this.upgrades.paddleWidth) / 2;
        this.paddle.y = this.gameAreaHeight - 80; // Above commentary area
        this.lastPaddleX = this.paddle.x;
        this.initLevel();
        this.spawnBalls();
        this.setComment('start');
    }

    initLevel() {
        this.blocks = [];
        this.timeLeft = this.getTimeLimit(this.level);
        const pattern = (this.level - 1) % 5;
        const hp = this.getHp(this.level);
        const colors = ['#ff00ff', '#00f2ff', '#00ff88', '#ffff00', '#ff6600'];
        const cols = 8, pad = 5, top = 80, left = 15;
        const bw = (this.virtualWidth - left * 2 - pad * (cols - 1)) / cols;
        const bh = 22;
        let blocks = [];

        if (pattern === 0) {
            for (let c = 0; c < cols; c++) for (let r = 0; r < 5; r++) blocks.push(this.mkBlock(c * (bw + pad) + left, r * (bh + pad) + top, bw, bh, colors[r], hp));
        } else if (pattern === 1) {
            const cx = cols / 2 - 0.5, cy = 2.5;
            for (let c = 0; c < cols; c++) for (let r = 0; r < 6; r++) if (Math.abs(c - cx) + Math.abs(r - cy) < 4) blocks.push(this.mkBlock(c * (bw + pad) + left, r * (bh + pad) + top, bw, bh, colors[(c + r) % 5], hp * 1.2));
        } else if (pattern === 2) {
            for (let r = 0; r < 6; r++) { const sp = (r % 2 ? -1 : 1) * (0.4 + this.level * 0.05); for (let c = 1; c < cols - 1; c++) { const b = this.mkBlock(c * (bw + pad) + left, r * (bh + pad) + top, bw, bh, colors[r], hp); b.type = 'h'; b.sp = sp; b.minX = 15; b.maxX = this.virtualWidth - 15 - bw; blocks.push(b); } }
        } else if (pattern === 3) {
            const cx = this.virtualWidth / 2, cy = top + 100;
            blocks.push(this.mkBlock(cx - 30, cy - 30, 60, 60, '#fff', hp * 5));
            for (let i = 0; i < 10; i++) { const a = Math.PI * 2 / 10 * i; blocks.push(this.mkBlock(cx + Math.cos(a) * 80 - bw / 2, cy + Math.sin(a) * 80 - bh / 2, bw, bh, colors[i % 5], hp * 1.5)); }
        } else {
            const cx = this.virtualWidth / 2, cy = top + 90;
            for (let l = 1; l <= 3; l++) { const r = l * 40, cnt = l * 5, sp = (l % 2 ? -0.02 : 0.02); for (let i = 0; i < cnt; i++) { const b = this.mkBlock(0, 0, bw * 0.8, bh * 0.8, colors[l], hp * 1.3); b.type = 'o'; b.cx = cx; b.cy = cy; b.rad = r; b.ang = Math.PI * 2 / cnt * i; b.sp = sp; blocks.push(b); } }
        }

        // Special blocks - always exactly 3
        const specialCount = 3;
        const availableBlocks = blocks.filter(b => !b.special);
        for (let i = 0; i < specialCount && availableBlocks.length > 0; i++) {
            const randIdx = Math.floor(Math.random() * availableBlocks.length);
            const block = availableBlocks.splice(randIdx, 1)[0];
            block.special = true;
            block.color = '#FFD700';
            block.maxHp = hp * 2;
            block.hp = hp * 2;
        }
        this.blocks = blocks;
    }

    mkBlock(x, y, w, h, color, hp) { return { x, y, w, h, color, hp, maxHp: hp, type: 's', special: false }; }

    spawnBalls() {
        this.balls = [];
        const cnt = 1 + this.upgrades.extraBalls;
        for (let i = 0; i < cnt; i++) {
            this.balls.push({ x: this.virtualWidth / 2, y: this.paddle.y - 12, r: 8, dx: 0, dy: 0, active: false, isDead: false, trail: [] });
        }
    }

    fireBullet() {
        if (this.upgrades.gunsLevel === 0) return;

        // Auto-launch balls when firing
        this.launchBalls();

        const cnt = Math.min(25, this.upgrades.gunsLevel);
        const sp = Math.min(12, 50 / cnt + 2);
        for (let i = 0; i < cnt; i++) {
            const off = (i - (cnt - 1) / 2) * sp * 2.5;
            this.bullets.push({ x: this.paddle.x + this.upgrades.paddleWidth / 2 + off, y: this.paddle.y - 5, r: 3, dy: -10, homing: this.upgrades.homing, trail: [] });
        }
    }

    togglePause() {
        if (this.state.isState('PLAYING')) this.state.setState('PAUSED');
        else if (this.state.isState('PAUSED')) this.state.setState('PLAYING');
    }

    selectCard(c) {
        if (c.id === 'multiball') { this.upgrades.extraBalls++; this.balls.push({ x: this.paddle.x + this.upgrades.paddleWidth / 2, y: this.paddle.y - 15, r: 8, dx: 4 * (Math.random() < 0.5 ? 1 : -1), dy: -5, active: true, isDead: false }); }
        if (c.id === 'power_ball') this.upgrades.ballDamage += 1;
        if (c.id === 'wide_paddle') this.upgrades.paddleWidth += 20;
        if (c.id === 'blaster_count') this.upgrades.gunsLevel = Math.min(25, this.upgrades.gunsLevel + 1);
        if (c.id === 'blaster_dmg') this.upgrades.bulletDamage += 0.25;
        if (c.id === 'homing') this.upgrades.homing = true;
        if (c.id === 'explosive') this.upgrades.explosiveLevel = Math.min(10, this.upgrades.explosiveLevel + 1);
        if (c.id === 'shield') { this.upgrades.shield = true; this.shieldActive = true; }

        // Slow-mo recovery
        this.timeScale = 0.2;
        this.targetTimeScale = 1;

        if (this.itemSelectionType === 'LEVEL_CLEAR') {
            this.nextLevel();
        } else {
            this.state.setState('PLAYING');
        }
    }

    generateCards() {
        return this.cardsDB.filter(c => !(c.req === 'gun' && this.upgrades.gunsLevel === 0)).sort(() => Math.random() - 0.5).slice(0, 3);
    }

    startGame() { this.resetGame(); this.state.setState('PLAYING'); }

    nextLevel() {
        this.level++;
        this.setComment('clear');
        if (this.upgrades.shield) this.shieldActive = true;
        this.initLevel();
        this.spawnBalls();
        this.state.setState('PLAYING');
    }

    quitToMenu() { this.resetGame(); this.state.setState('START'); }

    fixedUpdate(dt) {
        // Time scale recovery (slow-mo → normal)
        if (this.timeScale < this.targetTimeScale) {
            this.timeScale = Math.min(this.targetTimeScale, this.timeScale + 0.015);
        }

        if (!this.state.isState('PLAYING')) return;

        const scaledDt = dt * this.timeScale;

        // Timer
        this.timeLeft -= scaledDt;
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.state.setState('GAMEOVER'); return; }
        if (this.timeLeft <= 10 && this.commentTimer <= 0) this.setComment('warning');

        this.gameFrame++;

        // Track paddle velocity for angle transfer
        this.paddleVelocity = this.paddle.x - this.lastPaddleX;
        this.lastPaddleX = this.paddle.x;

        // Keyboard paddle movement
        if (this.keys.left) this.paddle.x = Math.max(0, this.paddle.x - this.paddle.speed * this.timeScale);
        if (this.keys.right) this.paddle.x = Math.min(this.virtualWidth - this.upgrades.paddleWidth, this.paddle.x + this.paddle.speed * this.timeScale);

        // Update blocks (moving types)
        this.blocks.forEach(b => {
            if (b.type === 'h') { b.x += b.sp * this.timeScale; if (b.x <= b.minX || b.x >= b.maxX) b.sp *= -1; }
            else if (b.type === 'o') { b.ang += b.sp * this.timeScale; b.x = b.cx + Math.cos(b.ang) * b.rad - b.w / 2; b.y = b.cy + Math.sin(b.ang) * b.rad - b.h / 2; }
        });

        // Auto-fire
        if (this.upgrades.gunsLevel > 0 && this.gameFrame % Math.max(20, this.upgrades.fireRate) === 0) this.fireBullet();

        // Bullets with trail
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            // Update trail
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 8) b.trail.shift(); // Longer trail

            if (b.homing) { const t = this.blocks.find(blk => blk.hp > 0); if (t) b.x += (t.x + t.w / 2 > b.x ? 2 : -2) * this.timeScale; }
            b.y += b.dy * this.timeScale;
            let hit = this.blocks.find(blk => blk.hp > 0 && b.x > blk.x && b.x < blk.x + blk.w && b.y > blk.y && b.y < blk.y + blk.h);
            if (hit) { this.dmgBlock(hit, this.upgrades.bulletDamage); this.bullets.splice(i, 1); }
            else if (b.y < 0) this.bullets.splice(i, 1);
        }

        // Balls
        this.balls.forEach(ball => {
            if (ball.isDead) return;
            if (!ball.active) { ball.x = this.paddle.x + this.upgrades.paddleWidth / 2; ball.y = this.paddle.y - ball.r - 3; return; }

            ball.x += ball.dx * this.timeScale;
            ball.y += ball.dy * this.timeScale;

            // Update trail for effect
            if (ball.active) {
                ball.trail.push({ x: ball.x, y: ball.y });
                if (ball.trail.length > 12) ball.trail.shift(); // Longer trail
            }

            // Walls
            if (ball.x > this.virtualWidth - ball.r) { ball.x = this.virtualWidth - ball.r; ball.dx = -Math.abs(ball.dx); }
            if (ball.x < ball.r) { ball.x = ball.r; ball.dx = Math.abs(ball.dx); }
            if (ball.y < ball.r + 50) { ball.y = ball.r + 50; ball.dy = Math.abs(ball.dy); }
            if (Math.abs(ball.dx) < 2) ball.dx = (ball.dx >= 0 ? 1 : -1) * 2.5;

            // Bottom (above commentary area)
            if (ball.y > this.gameAreaHeight - ball.r - 30) {
                if (this.shieldActive) {
                    ball.dy = -Math.abs(ball.dy);
                    this.shieldActive = false;
                    this.particles.sparkle(ball.x, this.gameAreaHeight - 30, '#00ffff');
                } else if (ball.y > this.gameAreaHeight + 10) {
                    ball.isDead = true;
                    this.setComment('miss');
                }
            }

            // Paddle collision with direction-based angle control
            if (ball.dy > 0 && ball.y + ball.r >= this.paddle.y && ball.y - ball.r <= this.paddle.y + this.paddle.height && ball.x >= this.paddle.x && ball.x <= this.paddle.x + this.upgrades.paddleWidth) {
                // Calculate hit position (-1 to 1)
                let hitPos = (ball.x - (this.paddle.x + this.upgrades.paddleWidth / 2)) / (this.upgrades.paddleWidth / 2);
                hitPos = Math.max(-1, Math.min(1, hitPos));

                // Apply paddle velocity to angle (direction-based reflection) - halved
                const paddleInfluence = this.paddleVelocity * 0.04;
                hitPos = Math.max(-1.2, Math.min(1.2, hitPos + paddleInfluence));

                // Calculate angle based on hit position + paddle movement
                const maxAngle = Math.PI / 2.8;
                const angle = hitPos * maxAngle;

                const speedMult = this.getSpeedMultiplier();
                const speed = Math.min(Math.sqrt(ball.dx ** 2 + ball.dy ** 2) * 1.002, 10 * speedMult);
                ball.dx = speed * Math.sin(angle);
                ball.dy = -speed * Math.cos(angle);
                ball.y = this.paddle.y - ball.r - 1;

                this.particles.emit(ball.x, this.paddle.y, 3, { colors: ['#00f2ff'] });
            }

            // Block collision
            this.blocks.forEach(blk => {
                if (blk.hp <= 0) return;
                const tx = Math.max(blk.x, Math.min(ball.x, blk.x + blk.w));
                const ty = Math.max(blk.y, Math.min(ball.y, blk.y + blk.h));
                const dx = ball.x - tx, dy = ball.y - ty;
                if (dx * dx + dy * dy <= ball.r * ball.r) {
                    // Reflection with paddle direction influence - halved
                    if (Math.abs(dx) > Math.abs(dy)) {
                        ball.dx = -ball.dx + this.paddleVelocity * 0.025;
                    } else {
                        ball.dy = -ball.dy;
                    }
                    this.dmgBlock(blk, this.upgrades.ballDamage);
                    // Explosive effect - increases AoE damage range on every hit
                    if (this.upgrades.explosiveLevel > 0) {
                        // Range increases with explosive level (base 30 + 20 per level)
                        const rad = 30 + 20 * this.upgrades.explosiveLevel;
                        const explosiveDmg = this.upgrades.ballDamage * 0.5;
                        this.blocks.forEach(nb => {
                            if (nb === blk || nb.hp <= 0) return;
                            const dist = Math.hypot(nb.x + nb.w / 2 - blk.x - blk.w / 2, nb.y + nb.h / 2 - blk.y - blk.h / 2);
                            if (dist < rad) {
                                nb.hp -= explosiveDmg;
                                this.particles.emit(nb.x + nb.w / 2, nb.y + nb.h / 2, 2, { colors: [nb.color] });
                                if (nb.hp <= 0 && !nb.special) {
                                    this.particles.explode(nb.x + nb.w / 2, nb.y + nb.h / 2, { count: 5, colors: [nb.color] });
                                    this.scoreManager.add(10);
                                }
                            }
                        });
                        this.particles.burst(blk.x + blk.w / 2, blk.y + blk.h / 2, '#ffaa00');
                    }
                }
            });
        });

        this.balls = this.balls.filter(b => !b.isDead);

        // Check for level clear or pending card select (prevent multiple triggers)
        if (this.pendingCardSelect && this.state.isState('PLAYING')) {
            this.pendingCardSelect = false;
            this.state.setState('CARD_SELECT');
        } else if (this.blocks.every(b => b.hp <= 0)) {
            this.itemSelectionType = 'LEVEL_CLEAR';
            this.state.setState('CARD_SELECT');
        }
        if (this.balls.length === 0) this.state.setState('GAMEOVER');

        // Comment timer
        if (this.commentTimer > 0) this.commentTimer -= scaledDt;
    }

    dmgBlock(blk, dmg) {
        if (blk.hp <= 0) return;
        blk.hp -= dmg;
        this.particles.emit(blk.x + blk.w / 2, blk.y + blk.h / 2, 2, { colors: [blk.color] });
        if (blk.hp <= 0) {
            this.particles.explode(blk.x + blk.w / 2, blk.y + blk.h / 2, { count: 8, colors: [blk.color] });
            this.scoreManager.add(blk.special ? 50 : 10);
            const now = Date.now();
            this.combo = now - this.lastComboTime < 1500 ? this.combo + 1 : 1;
            this.lastComboTime = now;
            if (this.combo >= 5) this.setComment('combo');

            // Special block gives card - schedule for end of frame to prevent freeze
            if (blk.special && !this.pendingCardSelect) {
                this.setComment('special');
                this.itemSelectionType = 'SPECIAL_ITEM';
                this.pendingCardSelect = true; // Defer to end of frame
            }
        }
    }

    update(dt) {
        this.particles.update(dt * this.timeScale);
    }

    render(ctx) {
        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.scale(this.scale, this.scale);

        // Background with rounded corners effect
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

        // Grid lines
        ctx.strokeStyle = 'rgba(0,242,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let y = 50; y < this.virtualHeight; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.virtualWidth, y); ctx.stroke(); }

        // ========== RENDER HUD INSIDE GAME ==========
        this.renderHUD(ctx);

        // Shield line (above commentary area)
        if (this.shieldActive) {
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 4;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00ffff';
            ctx.beginPath();
            ctx.moveTo(20, this.gameAreaHeight - 30);
            ctx.lineTo(this.virtualWidth - 20, this.gameAreaHeight - 30);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Paddle
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f2ff';
        const pg = ctx.createLinearGradient(this.paddle.x, 0, this.paddle.x + this.upgrades.paddleWidth, 0);
        pg.addColorStop(0, '#00f2ff');
        pg.addColorStop(1, '#0088ff');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.roundRect(this.paddle.x, this.paddle.y, this.upgrades.paddleWidth, this.paddle.height, 7);
        ctx.fill();

        // Guns on paddle
        if (this.upgrades.gunsLevel > 0) {
            ctx.fillStyle = '#ffaa00';
            const cnt = Math.min(25, this.upgrades.gunsLevel);
            const sp = Math.min(12, 50 / cnt + 2);
            for (let i = 0; i < cnt; i++) { const off = (i - (cnt - 1) / 2) * sp * 2.5; ctx.fillRect(this.paddle.x + this.upgrades.paddleWidth / 2 + off - 2, this.paddle.y - 8, 4, 8); }
        }
        ctx.shadowBlur = 0;

        // Blocks - IMPORTANT: reset globalAlpha after each block
        this.blocks.forEach(b => {
            if (b.hp <= 0) return;
            const ratio = b.hp / b.maxHp;
            ctx.globalAlpha = 0.5 + ratio * 0.5;
            ctx.shadowBlur = b.special ? 20 : 8;
            ctx.shadowColor = b.special ? '#FFD700' : b.color;
            ctx.fillStyle = b.special ? '#FFD700' : b.color;
            ctx.beginPath();
            ctx.roundRect(b.x, b.y, b.w, b.h, 6);
            ctx.fill();
            if (b.special) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        });
        ctx.globalAlpha = 1; // Reset after all blocks

        // Ball trails
        this.balls.forEach(b => {
            if (b.isDead || !b.trail) return;
            b.trail.forEach((t, i) => {
                const alpha = (i + 1) / b.trail.length * 0.6;
                const size = b.r * (0.3 + (i / b.trail.length) * 0.5);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#00f2ff';
                ctx.beginPath();
                ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
                ctx.fill();
            });
        });
        ctx.globalAlpha = 1;

        // Balls (main)
        this.balls.forEach(b => {
            if (b.isDead) return;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fff';
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // Bullet trails
        this.bullets.forEach(b => {
            if (!b.trail) return;
            b.trail.forEach((t, i) => {
                const alpha = (i + 1) / b.trail.length * 0.5;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ffaa00';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
                ctx.fill();
            });
        });
        ctx.globalAlpha = 1;

        // Bullets (main)
        ctx.fillStyle = '#ffff00';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffff00';
        this.bullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); });
        ctx.shadowBlur = 0;

        // Particles
        this.particles.render(ctx);

        // Fixed bottom commentary area (always visible space)
        ctx.fillStyle = 'rgba(0, 10, 30, 0.9)';
        ctx.fillRect(0, this.gameAreaHeight, this.virtualWidth, this.virtualHeight - this.gameAreaHeight);

        // Commentary text
        ctx.globalAlpha = 1;
        if (this.currentComment) {
            const alpha = this.commentTimer > 0 ? Math.min(1, this.commentTimer) : 0.4;
            ctx.fillStyle = `rgba(0, 242, 255, ${alpha})`;
            ctx.font = 'bold 16px "Noto Sans KR", sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00f2ff';
            ctx.fillText(this.currentComment, this.virtualWidth / 2, this.gameAreaHeight + 32);
            ctx.shadowBlur = 0;
        }

        // Overlays
        if (this.state.isState('START')) this.renderStartScreen(ctx);
        else if (this.state.isState('PAUSED')) this.renderPauseScreen(ctx);
        else if (this.state.isState('CARD_SELECT')) this.renderCardSelect(ctx);
        else if (this.state.isState('GAMEOVER')) this.renderGameOver(ctx);

        ctx.restore();
    }

    renderHUD(ctx) {
        // Timer (top left)
        const m = Math.floor(this.timeLeft / 60);
        const s = Math.floor(this.timeLeft % 60);
        const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        ctx.font = 'bold 22px "Orbitron", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = this.timeLeft <= 10 ? '#ff3333' : '#ffaa00';
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.timeLeft <= 10 ? '#ff3333' : '#ffaa00';
        ctx.fillText(timeStr, 20, 35);
        ctx.shadowBlur = 0;

        // Stage (top center)
        ctx.font = '12px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#888';
        ctx.fillText(`STAGE ${this.level}`, this.virtualWidth / 2, 22);

        // Score icon and score
        ctx.font = 'bold 18px "Orbitron", sans-serif';
        ctx.fillStyle = '#00f2ff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00f2ff';
        ctx.fillText(this.scoreManager.getScore().toLocaleString(), this.virtualWidth / 2, 42);
        ctx.shadowBlur = 0;

        // Pause button (top right)
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.virtualWidth - 30, 30, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⏸', this.virtualWidth - 30, 35);

        // High score & balls count (motivating display below HUD)
        ctx.font = '11px "Orbitron", sans-serif';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'left';
        ctx.fillText(`HIGH: ${this.scoreManager.getHighScore().toLocaleString()}`, 20, 58);
        ctx.textAlign = 'right';
        ctx.fillText(`BALLS: ${this.balls.filter(b => !b.isDead).length}`, this.virtualWidth - 20, 58);
    }

    renderStartScreen(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

        ctx.font = 'bold 28px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00f2ff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00f2ff';
        ctx.fillText('NEON BLOCK', this.virtualWidth / 2, this.virtualHeight / 2 - 60);
        ctx.fillStyle = '#ff00ff';
        ctx.shadowColor = '#ff00ff';
        ctx.fillText('EVOLUTION', this.virtualWidth / 2, this.virtualHeight / 2 - 25);
        ctx.shadowBlur = 0;

        ctx.font = '14px "Noto Sans KR", sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('Time Attack & Infinite Growth', this.virtualWidth / 2, this.virtualHeight / 2 + 15);

        ctx.font = 'bold 18px "Orbitron", sans-serif';
        ctx.fillStyle = '#ffff00';
        ctx.fillText(`🏆 ${this.scoreManager.getHighScore().toLocaleString()}`, this.virtualWidth / 2, this.virtualHeight / 2 + 55);

        // Start button
        const btnY = this.virtualHeight / 2 + 100;
        const gradient = ctx.createLinearGradient(this.virtualWidth / 2 - 80, 0, this.virtualWidth / 2 + 80, 0);
        gradient.addColorStop(0, '#00f2ff');
        gradient.addColorStop(1, '#0066ff');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(this.virtualWidth / 2 - 80, btnY, 160, 45, 25);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Orbitron", sans-serif';
        ctx.fillText('GAME START', this.virtualWidth / 2, btnY + 28);

        ctx.font = '12px "Noto Sans KR", sans-serif';
        ctx.fillStyle = '#666';
        ctx.fillText('← → 방향키 | Space 발사', this.virtualWidth / 2, this.virtualHeight / 2 + 175);
    }

    renderPauseScreen(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

        ctx.font = 'bold 32px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffff00';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffff00';
        ctx.fillText('PAUSED', this.virtualWidth / 2, this.virtualHeight / 2 - 40);
        ctx.shadowBlur = 0;

        // Resume button
        let btnY = this.virtualHeight / 2 + 10;
        ctx.fillStyle = '#00f2ff';
        ctx.beginPath();
        ctx.roundRect(this.virtualWidth / 2 - 70, btnY, 140, 40, 20);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Orbitron", sans-serif';
        ctx.fillText('RESUME', this.virtualWidth / 2, btnY + 26);

        // Quit button
        btnY += 55;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(this.virtualWidth / 2 - 70, btnY, 140, 40, 20);
        ctx.stroke();
        ctx.fillStyle = '#aaa';
        ctx.fillText('QUIT', this.virtualWidth / 2, btnY + 26);
    }

    renderCardSelect(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

        const title = this.itemSelectionType === 'SPECIAL_ITEM' ? 'SPECIAL!' : 'STAGE CLEAR!';
        ctx.font = 'bold 26px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00ff88';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ff88';
        ctx.fillText(title, this.virtualWidth / 2, this.virtualHeight / 2 - 120);
        ctx.shadowBlur = 0;

        ctx.font = '14px "Noto Sans KR", sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.fillText('업그레이드를 선택하세요', this.virtualWidth / 2, this.virtualHeight / 2 - 85);

        // Cards
        const cards = this._currentCards || (this._currentCards = this.generateCards());
        const cardW = 95, cardH = 120, gap = 15;
        const startX = (this.virtualWidth - (cardW * 3 + gap * 2)) / 2;
        const cardY = this.virtualHeight / 2 - 40;

        cards.forEach((card, i) => {
            const x = startX + i * (cardW + gap);

            // Ensure full opacity for cards
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // Card background
            ctx.fillStyle = 'rgba(20, 30, 50, 0.95)';
            ctx.strokeStyle = '#00f2ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x, cardY, cardW, cardH, 14);
            ctx.fill();
            ctx.stroke();

            // Icon - bright and visible
            ctx.globalAlpha = 1;
            ctx.font = '36px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(card.icon, x + cardW / 2, cardY + 48);

            // Title - bright white
            ctx.globalAlpha = 1;
            ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
            ctx.fillStyle = '#00f2ff';
            ctx.fillText(card.title, x + cardW / 2, cardY + 78);

            // Description
            ctx.globalAlpha = 1;
            ctx.font = '10px "Noto Sans KR", sans-serif';
            ctx.fillStyle = '#cccccc';
            ctx.fillText(card.desc, x + cardW / 2, cardY + 98);
        });

        // Store card bounds for click detection
        this._cardBounds = cards.map((c, i) => ({ card: c, x: startX + i * (cardW + gap), y: cardY, w: cardW, h: cardH }));

        // Add click handler for cards
        if (!this._cardClickHandler) {
            this._cardClickHandler = (e) => {
                if (!this.state.isState('CARD_SELECT')) return;
                const rect = this.canvas.getBoundingClientRect();
                const mx = ((e.clientX || e.touches?.[0]?.clientX) - rect.left) / this.scale;
                const my = ((e.clientY || e.touches?.[0]?.clientY) - rect.top) / this.scale;
                this._cardBounds?.forEach(b => {
                    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
                        this._currentCards = null;
                        this.selectCard(b.card);
                    }
                });
            };
            this.canvas.addEventListener('click', this._cardClickHandler);
        }
    }

    renderGameOver(ctx) {
        const isNew = this.scoreManager.isNewHighScore();
        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

        ctx.font = 'bold 30px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isNew ? '#ff00ff' : '#00f2ff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = isNew ? '#ff00ff' : '#00f2ff';
        ctx.fillText(this.timeLeft <= 0 ? 'TIME OVER' : 'GAME OVER', this.virtualWidth / 2, this.virtualHeight / 2 - 70);
        ctx.shadowBlur = 0;

        ctx.font = '14px "Noto Sans KR", sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.fillText(`Score: ${this.scoreManager.getScore().toLocaleString()} | Stage ${this.level}`, this.virtualWidth / 2, this.virtualHeight / 2 - 35);

        if (isNew) {
            ctx.font = 'bold 16px "Orbitron", sans-serif';
            ctx.fillStyle = '#ff00ff';
            ctx.fillText('🎉 NEW HIGH SCORE!', this.virtualWidth / 2, this.virtualHeight / 2);
        }

        // Retry button
        let btnY = this.virtualHeight / 2 + 40;
        ctx.fillStyle = '#00f2ff';
        ctx.beginPath();
        ctx.roundRect(this.virtualWidth / 2 - 70, btnY, 140, 40, 20);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px "Orbitron", sans-serif';
        ctx.fillText('RETRY', this.virtualWidth / 2, btnY + 26);

        // Home button
        btnY += 55;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(this.virtualWidth / 2 - 70, btnY, 140, 40, 20);
        ctx.stroke();
        ctx.fillStyle = '#aaa';
        ctx.fillText('HOME', this.virtualWidth / 2, btnY + 26);

        // Click handlers for buttons
        if (!this._gameOverClickHandler) {
            this._gameOverClickHandler = (e) => {
                if (!this.state.isState('GAMEOVER')) return;
                const rect = this.canvas.getBoundingClientRect();
                const mx = ((e.clientX || e.touches?.[0]?.clientX) - rect.left) / this.scale;
                const my = ((e.clientY || e.touches?.[0]?.clientY) - rect.top) / this.scale;
                const btnX = this.virtualWidth / 2 - 70;
                const retryY = this.virtualHeight / 2 + 40;
                const homeY = retryY + 55;
                if (mx >= btnX && mx <= btnX + 140) {
                    if (my >= retryY && my <= retryY + 40) this.startGame();
                    else if (my >= homeY && my <= homeY + 40) { if (this.options.onExit) this.options.onExit(); }
                }
            };
            this.canvas.addEventListener('click', this._gameOverClickHandler);
        }

        // Pause click handlers
        if (!this._pauseClickHandler) {
            this._pauseClickHandler = (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const mx = ((e.clientX || e.touches?.[0]?.clientX) - rect.left) / this.scale;
                const my = ((e.clientY || e.touches?.[0]?.clientY) - rect.top) / this.scale;

                // Pause button (always active)
                if (mx >= this.virtualWidth - 48 && mx <= this.virtualWidth - 12 && my >= 12 && my <= 48) {
                    this.togglePause();
                    return;
                }

                // Pause menu buttons
                if (this.state.isState('PAUSED')) {
                    const btnX = this.virtualWidth / 2 - 70;
                    if (mx >= btnX && mx <= btnX + 140) {
                        if (my >= this.virtualHeight / 2 + 10 && my <= this.virtualHeight / 2 + 50) this.state.setState('PLAYING');
                        else if (my >= this.virtualHeight / 2 + 65 && my <= this.virtualHeight / 2 + 105) this.quitToMenu();
                    }
                }
            };
            this.canvas.addEventListener('click', this._pauseClickHandler);
        }
    }

    destroy() {
        super.destroy();
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        this.particles?.destroy();
    }
}
