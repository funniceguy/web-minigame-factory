/**
 * CollisionDetector - Efficient collision detection utilities
 * Supports AABB, circle, and point collision
 */
export class CollisionDetector {
    /**
     * AABB (Axis-Aligned Bounding Box) collision check
     * @param {Object} a - First rectangle {x, y, width, height}
     * @param {Object} b - Second rectangle {x, y, width, height}
     * @returns {boolean} True if colliding
     */
    static rectRect(a, b) {
        return a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
    }

    /**
     * Circle to circle collision
     * @param {Object} a - First circle {x, y, radius}
     * @param {Object} b - Second circle {x, y, radius}
     * @returns {boolean} True if colliding
     */
    static circleCircle(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < a.radius + b.radius;
    }

    /**
     * Circle to rectangle collision
     * @param {Object} circle - Circle {x, y, radius}
     * @param {Object} rect - Rectangle {x, y, width, height}
     * @returns {boolean} True if colliding
     */
    static circleRect(circle, rect) {
        const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
        const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

        const dx = circle.x - closestX;
        const dy = circle.y - closestY;

        return (dx * dx + dy * dy) < (circle.radius * circle.radius);
    }

    /**
     * Point inside rectangle check
     * @param {Object} point - Point {x, y}
     * @param {Object} rect - Rectangle {x, y, width, height}
     * @returns {boolean} True if inside
     */
    static pointRect(point, rect) {
        return point.x >= rect.x &&
            point.x <= rect.x + rect.width &&
            point.y >= rect.y &&
            point.y <= rect.y + rect.height;
    }

    /**
     * Point inside circle check
     * @param {Object} point - Point {x, y}
     * @param {Object} circle - Circle {x, y, radius}
     * @returns {boolean} True if inside
     */
    static pointCircle(point, circle) {
        const dx = point.x - circle.x;
        const dy = point.y - circle.y;
        return (dx * dx + dy * dy) < (circle.radius * circle.radius);
    }

    /**
     * Get collision info for circle vs rectangle
     * @param {Object} circle - Circle {x, y, radius, vx, vy}
     * @param {Object} rect - Rectangle {x, y, width, height}
     * @returns {Object|null} Collision info or null
     */
    static getCircleRectCollision(circle, rect) {
        const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
        const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

        const dx = circle.x - closestX;
        const dy = circle.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= circle.radius) return null;

        // Determine collision side
        const relX = circle.x - (rect.x + rect.width / 2);
        const relY = circle.y - (rect.y + rect.height / 2);

        let normalX = 0;
        let normalY = 0;

        // Calculate normal based on where ball hit
        if (Math.abs(relX / rect.width) > Math.abs(relY / rect.height)) {
            normalX = relX > 0 ? 1 : -1;
        } else {
            normalY = relY > 0 ? 1 : -1;
        }

        return {
            collision: true,
            closestX,
            closestY,
            distance: dist,
            normalX,
            normalY,
            penetration: circle.radius - dist,
            side: normalX !== 0 ? (normalX > 0 ? 'right' : 'left') : (normalY > 0 ? 'bottom' : 'top')
        };
    }

    /**
     * Reflect velocity based on collision normal
     * @param {Object} velocity - Velocity {x, y}
     * @param {number} normalX - Normal X component
     * @param {number} normalY - Normal Y component
     * @param {number} bounce - Bounce factor (1 = full bounce)
     * @returns {Object} New velocity {x, y}
     */
    static reflect(velocity, normalX, normalY, bounce = 1) {
        // v' = v - 2(v·n)n
        const dot = velocity.x * normalX + velocity.y * normalY;
        return {
            x: (velocity.x - 2 * dot * normalX) * bounce,
            y: (velocity.y - 2 * dot * normalY) * bounce
        };
    }

    /**
     * Calculate bounce velocity off paddle (for block breaker style games)
     * @param {Object} ball - Ball {x, y, vx, vy}
     * @param {Object} paddle - Paddle {x, y, width, height}
     * @param {number} speed - Ball speed
     * @returns {Object} New velocity {x, y}
     */
    static paddleBounce(ball, paddle, speed) {
        // Calculate hit position (-1 to 1)
        const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);

        // Calculate angle (more extreme at edges)
        const maxAngle = Math.PI / 3; // 60 degrees max
        const angle = hitPos * maxAngle;

        return {
            x: Math.sin(angle) * speed,
            y: -Math.abs(Math.cos(angle) * speed) // Always go up
        };
    }

    /**
     * Line vs circle intersection
     * @param {Object} line - Line {x1, y1, x2, y2}
     * @param {Object} circle - Circle {x, y, radius}
     * @returns {boolean} True if intersecting
     */
    static lineCircle(line, circle) {
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const fx = line.x1 - circle.x;
        const fy = line.y1 - circle.y;

        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - circle.radius * circle.radius;

        let discriminant = b * b - 4 * a * c;

        if (discriminant < 0) return false;

        discriminant = Math.sqrt(discriminant);

        const t1 = (-b - discriminant) / (2 * a);
        const t2 = (-b + discriminant) / (2 * a);

        return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
    }

    /**
     * Check if moving circle will hit rectangle (swept collision)
     * @param {Object} circle - Circle with velocity {x, y, radius, vx, vy}
     * @param {Object} rect - Rectangle {x, y, width, height}
     * @returns {Object|null} Collision time and point or null
     */
    static sweptCircleRect(circle, rect) {
        // Expand rectangle by circle radius
        const expanded = {
            x: rect.x - circle.radius,
            y: rect.y - circle.radius,
            width: rect.width + circle.radius * 2,
            height: rect.height + circle.radius * 2
        };

        // Ray-box intersection
        let tmin = 0;
        let tmax = 1;

        // X axis
        if (circle.vx !== 0) {
            const tx1 = (expanded.x - circle.x) / circle.vx;
            const tx2 = (expanded.x + expanded.width - circle.x) / circle.vx;

            tmin = Math.max(tmin, Math.min(tx1, tx2));
            tmax = Math.min(tmax, Math.max(tx1, tx2));
        }

        // Y axis
        if (circle.vy !== 0) {
            const ty1 = (expanded.y - circle.y) / circle.vy;
            const ty2 = (expanded.y + expanded.height - circle.y) / circle.vy;

            tmin = Math.max(tmin, Math.min(ty1, ty2));
            tmax = Math.min(tmax, Math.max(ty1, ty2));
        }

        if (tmax >= tmin && tmin >= 0 && tmin <= 1) {
            return {
                time: tmin,
                x: circle.x + circle.vx * tmin,
                y: circle.y + circle.vy * tmin
            };
        }

        return null;
    }
}
