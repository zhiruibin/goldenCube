/** 闯关成功结算 · 500×400 紧凑分享卡，避免微信自动截取竖屏结算页产生大块留白。 */

const {
    ACCENT,
    SUBTITLE,
    MUTED,
    fillNightBackground,
} = require('../js/theme/arcade-night');

const CARD_W = 500;
const CARD_H = 400;

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
}

function formatTime(ms) {
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

function draw(ctx, opts) {
    const o = opts || {};
    fillNightBackground(ctx, CARD_W, CARD_H);

    // 全幅底色 + 两侧装饰，任何导出实现下都不会出现透明/白色空区。
    ctx.fillStyle = 'rgba(8, 6, 4, 0.22)';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = 'rgba(255, 200, 87, 0.10)';
    ctx.beginPath();
    ctx.arc(40, 48, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(465, 360, 135, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(20, 15, 11, 0.80)';
    roundRect(ctx, 28, 24, 444, 352, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 200, 87, 0.65)';
    ctx.lineWidth = 2;
    roundRect(ctx, 29, 25, 442, 350, 21);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('闯关成功', CARD_W / 2, 72);

    const stageId = o.stageId != null ? o.stageId : '?';
    const stageName = o.stageName ? ` · ${o.stageName}` : '';
    ctx.fillStyle = SUBTITLE;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`第 ${stageId} 关${stageName}`, CARD_W / 2, 118, 400);

    ctx.fillStyle = '#fff3c4';
    ctx.font = 'bold 82px sans-serif';
    ctx.fillText(`${Math.max(0, Number(o.lines) || 0)} 行`, CARD_W / 2, 202);

    ctx.fillStyle = MUTED;
    ctx.font = '18px sans-serif';
    ctx.fillText(
        `用块 ${Math.max(0, Number(o.pieces) || 0)}  ·  用时 ${formatTime(o.timeMs)}`,
        CARD_W / 2,
        266
    );

    ctx.fillStyle = 'rgba(255, 200, 87, 0.18)';
    roundRect(ctx, 116, 306, 268, 44, 22);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('来挖个方块，比比谁更快', CARD_W / 2, 328);
}

function generate(opts) {
    let canvas = null;
    try {
        canvas = wx.createOffscreenCanvas({ type: '2d', width: CARD_W, height: CARD_H });
    } catch (e) { /* 低版本回退 */ }
    if (!canvas) return Promise.resolve('');
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve('');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    draw(ctx, opts);

    return new Promise((resolve) => {
        const exportOpts = {
            x: 0,
            y: 0,
            width: CARD_W,
            height: CARD_H,
            destWidth: CARD_W,
            destHeight: CARD_H,
            fileType: 'jpg',
            quality: 0.92,
            success: (res) => resolve((res && res.tempFilePath) || ''),
            fail: () => resolve(''),
        };
        try {
            if (typeof canvas.toTempFilePath === 'function') {
                canvas.toTempFilePath(exportOpts);
            } else if (typeof wx.canvasToTempFilePath === 'function') {
                wx.canvasToTempFilePath(Object.assign({ canvas }, exportOpts));
            } else {
                resolve('');
            }
        } catch (e) {
            resolve('');
        }
    });
}

module.exports = { CARD_W, CARD_H, draw, generate };
