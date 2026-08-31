/**
 * Button - 通用按钮组件
 * 职责：绘制按钮、点击检测、按下反馈
 */

const IconRenderer = require('../render/icon-renderer');

class Button {
    /**
     * @param {Object} opts
     * @param {number} opts.x - 左上角 X
     * @param {number} opts.y - 左上角 Y
     * @param {number} opts.w - 宽度
     * @param {number} opts.h - 高度
     * @param {string} opts.text - 按钮文字
     * @param {string} opts.color - 主色调
     * @param {number} [opts.radius] - 圆角半径
     * @param {Function} opts.onClick - 点击回调
     */
    constructor(opts) {
        this.x = opts.x;
        this.y = opts.y;
        this.w = opts.w;
        this.h = opts.h;
        this.text = opts.text || '';
        this.icon = opts.icon || null;
        this.color = opts.color || '#00c6ff';
        this.radius = opts.radius || 10;
        this.onClick = opts.onClick || (() => {});
        /** 按下状态 */
        this._pressed = false;
        this._pressScale = 1;
    }

    /**
     * 点击检测
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    hitTest(x, y) {
        return x >= this.x && x <= this.x + this.w &&
               y >= this.y && y <= this.y + this.h;
    }

    /**
     * 触发点击
     */
    trigger() {
        this._pressed = true;
        this._pressScale = 0.95;
        setTimeout(() => {
            this._pressed = false;
            this._pressScale = 1;
        }, 100);
        this.onClick();
    }

    /**
     * 渲染按钮
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        ctx.save();

        // 缩放动画
        if (this._pressScale !== 1) {
            const cx = this.x + this.w / 2;
            const cy = this.y + this.h / 2;
            ctx.translate(cx, cy);
            ctx.scale(this._pressScale, this._pressScale);
            ctx.translate(-cx, -cy);
        }

        if (this._isCircular()) {
            this._renderCircularBody(ctx);
        } else {
            ctx.fillStyle = this._pressed
                ? this._darken(this.color, 0.7)
                : this.color;
            this._roundRect(ctx, this.x, this.y, this.w, this.h, this.radius);
            ctx.fill();

            if (this._pressed) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                this._roundRect(ctx, this.x, this.y, this.w, this.h, this.radius);
                ctx.fill();
            }
        }

        // 图标/文字
        ctx.fillStyle = '#ffffff';
        if (this.icon === 'hardDrop') {
            this._drawHardDropIcon(ctx);
        } else if (this.icon === 'rotate') {
            this._drawRotateIcon(ctx);
        } else if (this.icon === 'hold') {
            this._drawHoldIcon(ctx);
        } else if (this.icon === 'gear') {
            this._drawGearWithText(ctx);
        } else if (this.icon === 'pause') {
            this._drawPauseIcon(ctx);
        } else if (IconRenderer.has(this.icon)) {
            this._drawIconWithText(ctx);
        } else {
            ctx.font = `bold ${Math.min(16, this.h * 0.38)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.text, this.x + this.w / 2, this.y + this.h / 2);
        }
        ctx.restore();
    }

    /**
     * 绘制硬降图标（向下双箭头+底线）
     */
    _drawHardDropIcon(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const s = this.w * 0.11;

        // 上方箭头
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.4);
        ctx.lineTo(cx - s, cy - s * 1.4);
        ctx.lineTo(cx + s, cy - s * 1.4);
        ctx.closePath();
        ctx.fill();

        // 下方箭头
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.6);
        ctx.lineTo(cx - s, cy - s * 0.4);
        ctx.lineTo(cx + s, cy - s * 0.4);
        ctx.closePath();
        ctx.fill();

        // 底线
        ctx.fillRect(cx - s, cy + s * 0.8, s * 2, 2);
    }

    /**
     * 绘制旋转图标（弧形箭头）
     */
    _drawRotateIcon(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const r = this.w * 0.14;

        // 弧线
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI * 0.3, Math.PI * 1.3);
        ctx.stroke();

        // 箭头头部
        const ax = cx + r * Math.cos(Math.PI * 1.3);
        const ay = cy + r * Math.sin(Math.PI * 1.3);
        const s = this.w * 0.05;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(ax, ay + s);
        ctx.lineTo(ax - s, ay - s * 0.3);
        ctx.lineTo(ax + s * 0.5, ay - s * 0.8);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * 绘制Hold图标（大写 H 字母，表示暂存/交换）
     */
    _drawHoldIcon(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const s = this.w * 0.09;   // 笔画宽度
        const h = this.w * 0.24;   // 字母总高
        const w2 = this.w * 0.15;  // 左右竖线距中心半距

        // 左竖线
        ctx.fillRect(cx - w2, cy - h / 2, s, h);
        // 右竖线
        ctx.fillRect(cx + w2 - s, cy - h / 2, s, h);
        // 横线
        ctx.fillRect(cx - w2, cy - s / 2, w2 * 2, s);
    }
    /**
     * 绘制暂停图标（两根竖条）
     */
    _drawPauseIcon(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const barW = Math.max(3, this.w * 0.08);
        const barH = this.w * 0.34;
        const gap = this.w * 0.12;
        ctx.fillRect(cx - gap - barW, cy - barH / 2, barW, barH);
        ctx.fillRect(cx + gap, cy - barH / 2, barW, barH);
    }

    /**
     * 绘制播放图标（右向三角）
     */
    _drawPlayIcon(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const s = this.w * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.45, cy - s);
        ctx.lineTo(cx - s * 0.45, cy + s);
        ctx.lineTo(cx + s * 0.75, cy);
        ctx.closePath();
        ctx.fill();
    }


    _drawGearWithText(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const maxFont = Math.min(16, this.h * 0.38);
        const baseGearR = Math.min(this.h * 0.24, this.w * 0.11);
        const gap = 6;
        const bgColor = this._pressed ? this._darken(this.color, 0.7) : this.color;

        // 选择尽量大的字号，使「齿轮+文本」并排放入按钮内（整体居中、互不重叠）
        let fontPx = maxFont;
        let gearR = baseGearR;
        let textW = 0;
        while (fontPx >= 12) {
            ctx.font = `bold ${fontPx}px sans-serif`;
            textW = ctx.measureText(this.text).width;
            if (gearR * 2 + gap + textW <= this.w - 8) {
                break;
            }
            fontPx -= 1;
        }
        if (fontPx < 12) {
            // 字号降到 12 仍放不下：缩小齿轮后使用 12px 再试
            gearR = Math.max(8, baseGearR * 0.8);
            fontPx = 12;
            ctx.font = `bold ${fontPx}px sans-serif`;
            textW = ctx.measureText(this.text).width;
        }

        if (gearR * 2 + gap + textW <= this.w - 8) {
            // 并排：齿轮居左、文字居右，作为一组整体水平居中，互不重叠
            const groupW = gearR * 2 + gap + textW;
            const left = cx - groupW / 2;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            this._drawGearIcon(ctx, left + gearR, cy, gearR, bgColor);
            ctx.fillText(this.text, left + gearR * 2 + gap, cy);
        } else {
            // 极窄按钮 + 长文本：齿轮在上、文本在下，垂直堆叠
            const stackR = Math.min(10, this.h * 0.17);
            this._drawGearIcon(ctx, cx, cy - this.h * 0.22, stackR, bgColor);
            ctx.font = `bold ${Math.min(12, this.h * 0.24)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.text, cx, cy + this.h * 0.24);
        }
    }

    /**
     * 绘制矢量图标 + 文字组合（图标居左、文字居右）
     * 图标由统一矢量图标库 IconRenderer 绘制，不依赖 emoji 字体。
     */
    _drawIconWithText(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const maxFont = Math.min(16, this.h * 0.38);
        const baseIcon = Math.min(this.h * 0.52, this.w * 0.24);
        const gap = 6;

        // 选择尽量大的字号，使「图标+文本」并排放入按钮内（整体居中、互不重叠）
        let fontPx = maxFont;
        let iconSize = baseIcon;
        let textW = 0;
        while (fontPx >= 12) {
            ctx.font = `bold ${fontPx}px sans-serif`;
            textW = ctx.measureText(this.text).width;
            if (iconSize + gap + textW <= this.w - 8) {
                break;
            }
            fontPx -= 1;
        }
        if (fontPx < 12) {
            // 字号降到 12 仍放不下：缩小图标后使用 12px 再试
            iconSize = Math.max(14, baseIcon * 0.8);
            fontPx = 12;
            ctx.font = `bold ${fontPx}px sans-serif`;
            textW = ctx.measureText(this.text).width;
        }

        if (iconSize + gap + textW <= this.w - 8) {
            // 并排：图标居左、文字居右，作为一组整体水平居中，互不重叠
            const groupW = iconSize + gap + textW;
            const left = cx - groupW / 2;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            IconRenderer.draw(ctx, this.icon, left + iconSize / 2, cy, iconSize, '#ffffff');
            ctx.fillText(this.text, left + iconSize + gap, cy);
        } else {
            // 极窄按钮 + 长文本：图标在上、文本在下，垂直堆叠
            const stackIcon = Math.min(20, this.h * 0.34);
            IconRenderer.draw(ctx, this.icon, cx, cy - this.h * 0.22, stackIcon, '#ffffff');
            ctx.font = `bold ${Math.min(12, this.h * 0.24)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.text, cx, cy + this.h * 0.24);
        }
    }
    /**
     * 绘制齿轮形状
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx - 齿轮中心 X
     * @param {number} cy - 齿轮中心 Y
     * @param {number} r - 齿轮半径（含齿）
     * @param {string} holeColor - 中心孔颜色（与按钮背景一致）
     */
    _drawGearIcon(ctx, cx, cy, r, holeColor) {
        const teeth = 8;
        const innerR = r * 0.82;

        ctx.save();
        ctx.translate(cx, cy);

        // 锯齿外圈
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
            const angle = (i * Math.PI) / teeth;
            const rad = i % 2 === 0 ? r : innerR;
            const px = Math.cos(angle) * rad;
            const py = Math.sin(angle) * rad;
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();

        // 中心孔
        ctx.fillStyle = holeColor;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /** 圆形操作钮（对局 Hold / 硬降 / 旋转等） */
    _isCircular() {
        return this.w === this.h && this.radius >= this.w / 2 - 1;
    }

    /** 立体圆形按钮：渐变 + 顶光 + 投影 */
    _renderCircularBody(ctx) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const r = this.w / 2;
        const pressed = this._pressed;

        if (!pressed) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
            ctx.shadowBlur = Math.max(4, r * 0.28);
            ctx.shadowOffsetY = Math.max(2, r * 0.14);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
            ctx.beginPath();
            ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        let bodyGrad;
        try {
            bodyGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
            if (pressed) {
                bodyGrad.addColorStop(0, this._darken(this.color, 0.62));
                bodyGrad.addColorStop(0.5, this._darken(this.color, 0.48));
                bodyGrad.addColorStop(1, this._darken(this.color, 0.35));
            } else {
                bodyGrad.addColorStop(0, this._lighten(this.color, 1.22));
                bodyGrad.addColorStop(0.45, this.color);
                bodyGrad.addColorStop(1, this._darken(this.color, 0.72));
            }
        } catch (e) {
            bodyGrad = null;
        }
        ctx.fillStyle = bodyGrad || (pressed ? this._darken(this.color, 0.55) : this.color);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
        ctx.clip();
        let gloss;
        try {
            gloss = ctx.createLinearGradient(cx, cy - r, cx, cy + r * 0.35);
            gloss.addColorStop(0, pressed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.32)');
            gloss.addColorStop(0.38, 'rgba(255,255,255,0.06)');
            gloss.addColorStop(1, 'rgba(255,255,255,0)');
        } catch (e) {
            gloss = null;
        }
        if (gloss) {
            ctx.fillStyle = gloss;
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        if (pressed) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.fillRect(cx - r, cy, r * 2, r);
        }
        ctx.restore();

        ctx.strokeStyle = pressed
            ? this._lighten(this.color, 1.08)
            : 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = pressed ? 1.5 : 1.25;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1.5, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
    }

    /**
     * 绘制圆角矩形路径
     */
    _roundRect(ctx, x, y, w, h, r) {
        if (typeof r === 'number') r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
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
}

module.exports = { Button };
