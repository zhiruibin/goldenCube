/**
 * 好友挑战 · 分享卡片（离屏 Canvas 绘制 + 导出临时图）
 * 微信 shareAppMessage imageUrl：5:4，推荐 500×400 像素。
 * 注意：canvas 物理尺寸与导出区域必须一致，勿 scale 后按逻辑宽高导出（会只截左上角）。
 */

const challengeUi = require('./challenge-ui');
const {
    ACCENT,
    SUBTITLE,
    MUTED,
    AMBIENT_PIECE_COLORS,
    fillNightBackground,
} = require('../js/theme/arcade-night');

const CARD_W = 500;
const CARD_H = 400;

function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.closePath();
}

function truncateText(ctx, text, maxW) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (ctx.measureText(raw).width <= maxW) return raw;
    let s = raw;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) {
        s = s.slice(0, -1);
    }
    return s + '…';
}

function cardOptsFromPayload(payload, extra) {
    const p = payload || {};
    const ex = extra || {};
    const puzzle = challengeUi.isPuzzleChallenge(p);
    return {
        puzzle,
        isCounter: !!ex.isCounter,
        title: p.workshopTitle || p.stageTitle || challengeUi.challengeTitle(p),
        lines: puzzle
            ? Math.max(0, Math.floor(Number(p.challengerLines != null ? p.challengerLines : p.lines) || 0))
            : null,
        score: puzzle
            ? null
            : Math.max(0, Math.floor(Number(p.score) || 0)),
        pieces: Math.max(0, Math.floor(Number(p.challengerPieces || p.pieces) || 0)),
        timeMs: Math.max(0, Math.floor(Number(p.challengerTimeMs || p.timeMs) || 0)),
        layoutSnapshot: p.layoutSnapshot || p.workshopRows || null,
        mode: p.mode || 'stage',
        chapterLine: challengeUi.resolveChapterLine(p),
    };
}

function drawMiniBoard(ctx, rows, cx, cy, maxW, maxH) {
    if (!rows || typeof rows !== 'object') return false;

    let minY = 20;
    let maxY = -1;
    let minX = 10;
    let maxX = -1;
    for (let y = 0; y < 20; y++) {
        const line = rows[String(y)] || '';
        for (let x = 0; x < 10; x++) {
            const ch = line[x];
            if (ch && ch !== '.') {
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
            }
        }
    }
    if (maxY < minY) return false;

    const cols = maxX - minX + 1;
    const rowCount = maxY - minY + 1;
    const gap = 2;
    const cell = Math.floor(Math.min((maxW - gap) / cols, (maxH - gap) / rowCount, 20));
    if (cell < 4) return false;

    const boardW = cols * cell + (cols - 1) * gap;
    const boardH = rowCount * cell + (rowCount - 1) * gap;
    const ox = cx - boardW / 2;
    const oy = cy - boardH / 2;

    for (let y = minY; y <= maxY; y++) {
        const line = rows[String(y)] || '';
        for (let x = minX; x <= maxX; x++) {
            const ch = line[x];
            if (!ch || ch === '.') continue;
            const ix = x - minX;
            const iy = y - minY;
            const px = ox + ix * (cell + gap);
            const py = oy + iy * (cell + gap);
            ctx.fillStyle = AMBIENT_PIECE_COLORS[(x + y) % AMBIENT_PIECE_COLORS.length];
            roundRect(ctx, px, py, cell, cell, Math.max(2, cell * 0.22));
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            roundRect(ctx, px + 1, py + 1, cell - 2, Math.max(2, cell * 0.35), 2);
            ctx.fill();
        }
    }
    return true;
}

function drawFallbackBlocks(ctx, cx, cy) {
    const unit = 18;
    const shapes = [
        { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: 3 },
        { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: 4 },
        { cells: [[1, 0], [2, 0], [1, 1], [2, 1]], color: 5 },
    ];
    let sx = cx - 62;
    for (let si = 0; si < shapes.length; si++) {
        ctx.fillStyle = AMBIENT_PIECE_COLORS[shapes[si].color];
        ctx.globalAlpha = 0.95;
        const cells = shapes[si].cells;
        for (let i = 0; i < cells.length; i++) {
            ctx.fillRect(
                sx + cells[i][0] * unit * 0.9,
                cy - 20 + cells[i][1] * unit * 0.9 + si * 6,
                unit * 0.82,
                unit * 0.82
            );
        }
        sx += 42;
    }
    ctx.globalAlpha = 1;
}

/**
 * 500×400 横版分享卡（全幅导出，左右分栏）
 */
function drawChallengeShareCard(ctx, opts) {
    const o = opts || {};
    const w = CARD_W;
    const h = CARD_H;
    const puzzle = o.puzzle !== false && (o.puzzle || o.lines != null);
    const pad = 20;

    fillNightBackground(ctx, w, h);

    // 顶栏徽标（居中）
    const badge = o.isCounter ? '回击挑战' : '好友挑战';
    ctx.font = 'bold 15px sans-serif';
    const badgeW = ctx.measureText(badge).width + 32;
    const badgeH = 30;
    const badgeX = (w - badgeW) / 2;
    const badgeY = pad;
    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
    badgeGrad.addColorStop(0, '#f0a840');
    badgeGrad.addColorStop(1, '#d05818');
    ctx.fillStyle = badgeGrad;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 15);
    ctx.fill();
    ctx.fillStyle = '#fff8ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, w / 2, badgeY + badgeH / 2);

    const bodyY = badgeY + badgeH + 16;
    const bodyH = h - bodyY - pad;

    // 左：盘面（单层面板，避免多层嵌套框）
    const boardPanelW = 210;
    const boardPanelX = pad;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    roundRect(ctx, boardPanelX, bodyY, boardPanelW, bodyH, 14);
    ctx.fill();

    const hasBoard = drawMiniBoard(
        ctx,
        o.layoutSnapshot,
        boardPanelX + boardPanelW / 2,
        bodyY + bodyH / 2,
        boardPanelW - 28,
        bodyH - 24
    );
    if (!hasBoard) {
        drawFallbackBlocks(ctx, boardPanelX + boardPanelW / 2, bodyY + bodyH / 2);
    }

    // 右栏：章节 / 关卡 / 成绩 / 副指标，纵向铺满至 CTA 上方
    const infoX = boardPanelX + boardPanelW + 16;
    const infoW = w - infoX - pad;
    const ctaH = 46;
    const ctaY = bodyY + bodyH - ctaH;
    const infoTop = bodyY + 8;
    const infoBottom = ctaY - 10;

    ctx.textAlign = 'left';

    // 章节
    let cursorY = infoTop;
    if (o.chapterLine) {
        ctx.textBaseline = 'top';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = 'rgba(255, 210, 100, 0.95)';
        ctx.fillText(truncateText(ctx, o.chapterLine, infoW), infoX, cursorY);
        cursorY += 34;
    }

    // 关卡名
    const titleRaw = o.title || (puzzle ? '残局挑战' : challengeUi.modeLabel(o));
    ctx.font = 'bold 21px sans-serif';
    ctx.fillStyle = SUBTITLE;
    ctx.fillText(truncateText(ctx, titleRaw, infoW), infoX, cursorY);
    cursorY += 38;

    // 主指标（消行/得分）
    const mainVal = puzzle ? (o.lines != null ? o.lines : 0) : (o.score != null ? o.score : 0);
    const unit = puzzle ? '行' : '分';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 96px sans-serif';
    const numStr = String(mainVal);
    const metricY = cursorY + 78;
    ctx.fillText(numStr, infoX, metricY);
    const numW = ctx.measureText(numStr).width;
    ctx.fillStyle = MUTED;
    ctx.font = '26px sans-serif';
    ctx.fillText(unit, infoX + numW + 10, metricY - 8);

    // 块数·用时：下沉至 CTA 上方空白区，略放大并加底条
    if (puzzle && (o.pieces > 0 || o.timeMs > 0)) {
        const sec = Math.max(0, Math.floor(o.timeMs / 1000));
        const sub = (o.pieces > 0 ? ('块数 ' + o.pieces) : '')
            + (o.pieces > 0 && sec > 0 ? '  ·  ' : '')
            + (sec > 0 ? ('用时 ' + sec + 's') : '');
        const subBarH = 40;
        const subBarY = infoBottom - subBarH;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        roundRect(ctx, infoX, subBarY, infoW, subBarH, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        roundRect(ctx, infoX, subBarY, infoW, subBarH, 10);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 236, 210, 0.82)';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(sub, infoX + 12, subBarY + subBarH / 2);
    }

    const ctaGrad = ctx.createLinearGradient(infoX, ctaY, infoX + infoW, ctaY + ctaH);
    ctaGrad.addColorStop(0, '#00c6ff');
    ctaGrad.addColorStop(1, '#0088dd');
    ctx.fillStyle = ctaGrad;
    roundRect(ctx, infoX, ctaY, infoW, ctaH, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('点击应战 →', infoX + infoW / 2, ctaY + ctaH / 2);
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

function generate(cardOpts) {
    const built = createShareCanvas();
    if (!built) return Promise.resolve('');
    drawChallengeShareCard(built.ctx, cardOpts);
    return exportCanvas(built.canvas);
}

function shareWithCard(opts) {
    const o = opts || {};
    return generate(o.cardOpts).then((imageUrl) => {
        const msg = {
            title: o.title || '好友挑战',
            query: o.query || '',
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
    cardOptsFromPayload,
    drawChallengeShareCard,
    generate,
    shareWithCard,
};
