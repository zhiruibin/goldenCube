/**
 * Panel - 面板组件
 * 职责：绘制半透明面板背景、标题栏、内容区域
 */

class Panel {
    /**
     * @param {Object} opts
     * @param {number} opts.x - 左上角 X
     * @param {number} opts.y - 左上角 Y
     * @param {number} opts.w - 宽度
     * @param {number} opts.h - 高度
     * @param {string} [opts.title] - 标题文字
     * @param {number} [opts.radius] - 圆角半径
     * @param {string} [opts.bgColor] - 背景色
     */
    constructor(opts) {
        this.x = opts.x;
        this.y = opts.y;
        this.w = opts.w;
        this.h = opts.h;
        this.title = opts.title || '';
        this.radius = opts.radius || 12;
        this.bgColor = opts.bgColor || 'rgba(255, 255, 255, 0.06)';
        this.borderColor = opts.borderColor || 'rgba(255, 255, 255, 0.1)';
    }

    /**
     * 渲染面板
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        // 面板背景
        ctx.fillStyle = this.bgColor;
        this._roundRect(ctx, this.x, this.y, this.w, this.h, this.radius);
        ctx.fill();

        // 边框
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 1;
        this._roundRect(ctx, this.x, this.y, this.w, this.h, this.radius);
        ctx.stroke();

        // 标题
        if (this.title) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(this.title, this.x + this.w / 2, this.y + 12);
        }
    }

    /**
     * 获取内容区域（标题下方）
     * @returns {{x: number, y: number, w: number, h: number}}
     */
    getContentArea() {
        const titleH = this.title ? 40 : 0;
        return {
            x: this.x + 10,
            y: this.y + titleH + 5,
            w: this.w - 20,
            h: this.h - titleH - 15,
        };
    }

    /**
     * 点击检测
     */
    hitTest(x, y) {
        return x >= this.x && x <= this.x + this.w &&
               y >= this.y && y <= this.y + this.h;
    }

    _roundRect(ctx, x, y, w, h, r) {
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
}

module.exports = { Panel };
