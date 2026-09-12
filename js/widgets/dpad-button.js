/**
 * DPadButton - 独立方向键按钮
 * 职责：点击即触发操作，长按走 DAS/ARR 连发
 * 用于左/右/下三个方向键
 */

const { drawThemeButtonSkin } = require('../theme/theme-images');

/** 绘制圆角多边形；radius 是沿相邻边收进的距离。 */
function roundedPolygon(ctx, points, radius) {
    if (!points || points.length < 3) return;
    const corners = points.map((point, i) => {
        const prev = points[(i + points.length - 1) % points.length];
        const next = points[(i + 1) % points.length];
        const prevLen = Math.hypot(prev.x - point.x, prev.y - point.y) || 1;
        const nextLen = Math.hypot(next.x - point.x, next.y - point.y) || 1;
        const prevInset = Math.min(radius, prevLen * 0.38);
        const nextInset = Math.min(radius, nextLen * 0.38);
        return {
            point,
            start: {
                x: point.x + (prev.x - point.x) * prevInset / prevLen,
                y: point.y + (prev.y - point.y) * prevInset / prevLen,
            },
            end: {
                x: point.x + (next.x - point.x) * nextInset / nextLen,
                y: point.y + (next.y - point.y) * nextInset / nextLen,
            },
        };
    });
    ctx.beginPath();
    ctx.moveTo(corners[0].start.x, corners[0].start.y);
    for (let i = 0; i < corners.length; i++) {
        const corner = corners[i];
        if (i > 0) ctx.lineTo(corner.start.x, corner.start.y);
        ctx.quadraticCurveTo(
            corner.point.x,
            corner.point.y,
            corner.end.x,
            corner.end.y
        );
    }
    ctx.closePath();
}

class DPadButton {
    /**
     * @param {Object} opts
     * @param {number} opts.x - 圆心 X
     * @param {number} opts.y - 圆心 Y
     * @param {number} opts.radius - 按钮半径
     * @param {string} opts.text - 箭头符号（如 '◀' '▶' '▼'）
     * @param {string} opts.color - 高亮主色调
     * @param {string} [opts.skin] - 主题圆钮皮 key
     * @param {Function} opts.onAction - 触发回调
     */
    constructor(opts) {
        this.x = opts.x;
        this.y = opts.y;
        this.radius = opts.radius || 28;
        this.direction = opts.direction || 'down';
        this.color = opts.color || '#00c6ff';
        this.skin = opts.skin || null;
        this.onAction = opts.onAction || (() => {});
        // 触摸状态
        this._activeTouchId = -1;
        this._pressed = false;

        // DAS/ARR 连发参数
        this._dasDelay = 170;
        this._arrInterval = 50;
        this._dasTimer = null;
        this._arrTimer = null;
        this._arrActive = false;

        // 连发脉冲动画相位
        this._pulsePhase = 0;
    }

    /**
     * 圆形点击检测
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    hitTest(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        return Math.sqrt(dx * dx + dy * dy) <= this.radius;
    }

    /**
     * 触摸按下 — 立即触发一次，启动 DAS 连发
     * @param {number} touchId - 触点标识符
     */
    press(touchId) {
        if (this._activeTouchId >= 0) return;

        this._activeTouchId = touchId;
        this._pressed = true;
        this.onAction();
        this._startDAS();
    }

    /**
     * 触摸释放 — 停止连发
     * @param {number} touchId - 触点标识符
     */
    release(touchId) {
        if (touchId !== this._activeTouchId) return;

        this._stopDAS();
        this._activeTouchId = -1;
        this._pressed = false;
    }

    // ==================== DAS/ARR 连发 ====================

    /**
     * 启动 DAS 延迟，到期后进入 ARR 连发
     */
    _startDAS() {
        this._stopDAS();
        this._arrActive = false;

        this._dasTimer = setTimeout(() => {
            this._arrActive = true;
            this._arrTimer = setInterval(() => {
                if (this._arrActive) {
                    this.onAction();
                }
            }, this._arrInterval);
        }, this._dasDelay);
    }

    /**
     * 停止 DAS/ARR 连发
     */
    _stopDAS() {
        if (this._dasTimer) {
            clearTimeout(this._dasTimer);
            this._dasTimer = null;
        }
        if (this._arrTimer) {
            clearInterval(this._arrTimer);
            this._arrTimer = null;
        }
        this._arrActive = false;
    }

    // ==================== 渲染 ====================

    /**
     * 渲染方向键按钮
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        const cx = this.x;
        const cy = this.y;
        const r = this.radius;

        // 连发脉冲动画
        let pulseAlpha = 0;
        if (this._arrActive) {
            this._pulsePhase = (this._pulsePhase + 0.15) % (Math.PI * 2);
            pulseAlpha = 0.15 * (0.5 + 0.5 * Math.sin(this._pulsePhase));
        }

        ctx.save();

        if (!this._pressed) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.beginPath();
            ctx.arc(cx + 0.5, cy + Math.max(2, r * 0.1), r, 0, Math.PI * 2);
            ctx.fill();
        }

        let usedSkin = false;
        if (this.skin) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.clip();
            usedSkin = drawThemeButtonSkin(
                ctx,
                this.skin,
                cx - r,
                cy - r,
                r * 2,
                r * 2
            );
            if (this._pressed) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
                ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            }
            ctx.restore();
        }

        if (!usedSkin) {
            let bodyGrad;
            try {
                bodyGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
                if (this._pressed) {
                    bodyGrad.addColorStop(0, this._darken(this.color, 0.62));
                    bodyGrad.addColorStop(0.5, this._darken(this.color, 0.48));
                    bodyGrad.addColorStop(1, this._darken(this.color, 0.35));
                } else {
                    bodyGrad.addColorStop(0, this._lighten(this.color, 1.18));
                    bodyGrad.addColorStop(0.45, this.color);
                    bodyGrad.addColorStop(1, this._darken(this.color, 0.72));
                }
            } catch (e) {
                bodyGrad = null;
            }
            ctx.fillStyle = bodyGrad || (this._pressed ? this._darken(this.color, 0.55) : this.color);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
            ctx.clip();
            let gloss;
            try {
                gloss = ctx.createLinearGradient(cx, cy - r, cx, cy + r * 0.4);
                gloss.addColorStop(0, this._pressed ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)');
                gloss.addColorStop(0.42, 'rgba(255,255,255,0.05)');
                gloss.addColorStop(1, 'rgba(255,255,255,0)');
            } catch (e) {
                gloss = null;
            }
            if (gloss) {
                ctx.fillStyle = gloss;
                ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            }
            if (this._pressed) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.fillRect(cx - r, cy, r * 2, r);
            }
            ctx.restore();

            ctx.strokeStyle = this._pressed
                ? this._lighten(this.color, 1.12)
                : 'rgba(255, 255, 255, 0.28)';
            ctx.lineWidth = this._pressed ? 2 : 1.25;
            ctx.beginPath();
            ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, r - 1.5, Math.PI * 0.12, Math.PI * 0.88);
            ctx.stroke();
        }

        const alpha = this._pressed ? Math.min(0.95 + pulseAlpha, 1) : 0.92;
        ctx.fillStyle = `rgba(255, 248, 236, ${alpha})`;
        const s = r * 0.45;
        let arrowPoints;
        if (this.direction === 'left') {
            arrowPoints = [
                { x: this.x - s, y: this.y },
                { x: this.x + s * 0.7, y: this.y - s },
                { x: this.x + s * 0.7, y: this.y + s },
            ];
        } else if (this.direction === 'right') {
            arrowPoints = [
                { x: this.x + s, y: this.y },
                { x: this.x - s * 0.7, y: this.y - s },
                { x: this.x - s * 0.7, y: this.y + s },
            ];
        } else {
            arrowPoints = [
                { x: this.x, y: this.y + s },
                { x: this.x - s, y: this.y - s * 0.7 },
                { x: this.x + s, y: this.y - s * 0.7 },
            ];
        }
        roundedPolygon(ctx, arrowPoints, Math.max(4.5, s * 0.38));
        ctx.fill();
        ctx.restore();
    }

    /**
     * 颜色变暗
     */
    _darken(hex, factor) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
    }

    _lighten(hex, factor) {
        const r = Math.min(255, Math.floor(parseInt(hex.slice(1, 3), 16) * factor));
        const g = Math.min(255, Math.floor(parseInt(hex.slice(3, 5), 16) * factor));
        const b = Math.min(255, Math.floor(parseInt(hex.slice(5, 7), 16) * factor));
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * 销毁，清理定时器
     */
    destroy() {
        this._stopDAS();
    }
}

module.exports = { DPadButton };
