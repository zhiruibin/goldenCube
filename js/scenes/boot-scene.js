/** 冷启动品牌页：必须在任何网络请求和大批资源加载前画出首帧。 */

class BootScene {
    constructor() {
        this._params = null;
        this._time = 0;
        this._logoEntry = null;
    }

    onEnter(params) {
        this._params = params || {};
        this._time = 0;
        try {
            this._logoEntry = require('../theme/theme-images').getThemeImage('titlePlaque');
        } catch (e) {
            this._logoEntry = null;
        }
    }

    setStatus(status) {
        this._params = Object.assign({}, this._params || {}, { status });
        try { if (GameGlobal.game && GameGlobal.game.kickLoop) GameGlobal.game.kickLoop(); } catch (e) { /* ignore */ }
    }

    getRenderInterval() { return 1 / 30; }
    update(dt) { this._time += Number(dt) || 0; }
    onExit() {}

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#1a1009');
        g.addColorStop(.58, '#332011');
        g.addColorStop(1, '#120b06');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        const glow = ctx.createRadialGradient(W / 2, H * .35, 4, W / 2, H * .35, W * .58);
        glow.addColorStop(0, 'rgba(246,177,61,.26)');
        glow.addColorStop(1, 'rgba(246,177,61,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H * .74);

        const logo = this._logoEntry;
        const logoW = Math.min(320, W * .82);
        // 必须使用图片自身宽高比；资源含透明留白，实际尺寸为 320×146。
        const sourceW = logo && logo.img
            ? (Number(logo.img.naturalWidth) || Number(logo.img.width) || 320)
            : 320;
        const sourceH = logo && logo.img
            ? (Number(logo.img.naturalHeight) || Number(logo.img.height) || 146)
            : 146;
        const logoH = logoW * sourceH / sourceW;
        const logoCy = H * .38 + Math.sin(this._time * 2.4) * 2;
        if (logo && logo.ready && logo.img) {
            ctx.drawImage(logo.img, (W - logoW) / 2, logoCy - logoH / 2, logoW, logoH);
        } else if (logo && logo.failed) {
            // 极端资源错误时保证品牌名仍可见，但不再使用临时矢量方块。
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffe08a';
            ctx.font = 'bold 34px sans-serif';
            ctx.fillText('挖个方块', W / 2, logoCy);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(246,230,201,.76)';
        ctx.font = '13px sans-serif';
        ctx.fillText((this._params && this._params.status) || '正在进入方块世界…', W / 2, H * .51);

        const dotsY = H * .56;
        for (let i = 0; i < 3; i++) {
            const phase = (this._time * 2.8 - i * .42);
            ctx.globalAlpha = .28 + (Math.sin(phase) + 1) * .30;
            ctx.fillStyle = '#ffc857';
            ctx.beginPath();
            ctx.arc(W / 2 + (i - 1) * 18, dotsY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

module.exports = BootScene;
