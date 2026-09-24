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

    /** 高辨识度启动动效：旋转矿灯光环 + 呼吸金方块。 */
    _drawLoadingSpinner(ctx, cx, cy) {
        const radius = 19;
        const segmentCount = 10;
        const rotation = this._time * 3.4;
        const pulse = (Math.sin(this._time * 4.2) + 1) / 2;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = 4.5;
        for (let i = 0; i < segmentCount; i++) {
            const angle = rotation + i * Math.PI * 2 / segmentCount;
            const tail = (i + 1) / segmentCount;
            ctx.strokeStyle = 'rgba(255,200,87,' + (.12 + tail * .82).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, angle, angle + .32);
            ctx.stroke();
        }

        // 呼吸光晕让加载状态在深色背景上更醒目。
        ctx.beginPath();
        ctx.arc(cx, cy, 10 + pulse * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,184,55,' + (.10 + pulse * .12).toFixed(2) + ')';
        ctx.fill();

        // 中心金方块采用菱形轮廓，避免再像普通的三点等待提示。
        const cubeSize = 6.5 + pulse * 1.2;
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4 - this._time * .45);
        ctx.fillStyle = '#ffc857';
        ctx.fillRect(-cubeSize / 2, -cubeSize / 2, cubeSize, cubeSize);
        ctx.strokeStyle = 'rgba(255,235,169,.95)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-cubeSize / 2, -cubeSize / 2, cubeSize, cubeSize);
        ctx.restore();
    }

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

        this._drawLoadingSpinner(ctx, W / 2, H * .57);
    }
}

module.exports = BootScene;
