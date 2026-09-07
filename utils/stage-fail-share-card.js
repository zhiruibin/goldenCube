/**
 * 闯关失败 · 分享卡片（离屏 Canvas 绘制 + 导出临时图）
 * 微信 shareAppMessage imageUrl：5:4，500×400；文案垂直居中，避免截屏顶空白。
 */

const {
    ACCENT,
    SUBTITLE,
    MUTED,
    fillNightBackground,
} = require('../js/theme/arcade-night');

const CARD_W = 500;
const CARD_H = 400;

function formatTime(ms) {
    const s = Math.floor((Number(ms) || 0) / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
}

function createShareCanvas() {
    let canvas = null;
    try {
        canvas = wx.createOffscreenCanvas({ type: '2d', width: CARD_W, height: CARD_H });
    } catch (e) {
        canvas = null;
    }
    if (!canvas) {
        try {
            canvas = wx.createCanvas();
        } catch (e2) {
            return null;
        }
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { canvas, ctx };
}

function exportCanvas(canvas) {
    return new Promise((resolve) => {
        const opts = {
            x: 0,
            y: 0,
            width: CARD_W,
            height: CARD_H,
            destWidth: CARD_W,
            destHeight: CARD_H,
            fileType: 'jpg',
            quality: 0.9,
            success(res) {
                resolve((res && res.tempFilePath) || '');
            },
            fail() {
                resolve('');
            },
        };
        try {
            if (canvas && typeof canvas.toTempFilePath === 'function') {
                canvas.toTempFilePath(opts);
                return;
            }
            wx.canvasToTempFilePath(Object.assign({ canvas: canvas }, opts));
        } catch (e) {
            resolve('');
        }
    });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ stageId?: number|string, stageName?: string, lines?: number, minLines?: number, pieces?: number, timeMs?: number }} opts
 */
function drawFailShareCard(ctx, opts) {
    const o = opts || {};
    fillNightBackground(ctx, CARD_W, CARD_H);
    // 轻微暗角，贴近结算氛围
    ctx.fillStyle = 'rgba(10, 7, 4, 0.28)';
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const stageId = o.stageId != null ? o.stageId : '?';
    const stageName = o.stageName || '';
    const lines = Math.max(0, Math.floor(Number(o.lines) || 0));
    const minLines = Math.max(0, Math.floor(Number(o.minLines) || 0));
    const pieces = Math.max(0, Math.floor(Number(o.pieces) || 0));
    const timeLabel = formatTime(o.timeMs);

    const rows = [
        { text: '未过关', font: 'bold 40px sans-serif', color: ACCENT, gap: 36 },
        {
            text: stageName ? ('第 ' + stageId + ' 关 · ' + stageName) : ('第 ' + stageId + ' 关'),
            font: '20px sans-serif',
            color: SUBTITLE,
            gap: 40,
        },
        { text: String(lines) + ' 行', font: 'bold 48px sans-serif', color: '#ff8a7a', gap: 36 },
        {
            text: '需消 ' + minLines + ' 行垃圾方可过关',
            font: '18px sans-serif',
            color: MUTED,
            gap: 28,
        },
        {
            text: '用块 ' + pieces + ' · 用时 ' + timeLabel,
            font: '18px sans-serif',
            color: SUBTITLE,
            gap: 0,
        },
    ];

    let stackH = 0;
    for (let i = 0; i < rows.length; i++) {
        stackH += rows[i].gap;
    }
    // 以首行基线起算，整体垂直居中
    let y = Math.round((CARD_H - stackH) / 2) + 28;
    const cx = CARD_W / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        ctx.fillStyle = row.color;
        ctx.font = row.font;
        ctx.fillText(row.text, cx, y);
        y += row.gap;
    }
}

function generate(opts) {
    const built = createShareCanvas();
    if (!built) return Promise.resolve('');
    drawFailShareCard(built.ctx, opts);
    return exportCanvas(built.canvas);
}

/**
 * @param {{ title: string, cardOpts: object, success?: Function, fail?: Function }} opts
 */
function shareWithCard(opts) {
    const o = opts || {};
    return generate(o.cardOpts).then((imageUrl) => {
        const msg = {
            title: o.title || '挖个方块',
            success: o.success,
            fail: o.fail,
        };
        if (imageUrl) msg.imageUrl = imageUrl;
        try {
            wx.shareAppMessage(msg);
        } catch (e) { /* ignore */ }
    });
}

module.exports = {
    CARD_W,
    CARD_H,
    drawFailShareCard,
    generate,
    shareWithCard,
};
