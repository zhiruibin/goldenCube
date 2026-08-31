/**
 * 首页标题装饰：「挖/个」间铲子、「方/块」间金色方块
 */
const { buildIsoBlockFaces, drawSolidIsoBlock } = require('./iso-block-renderer');

const SHOVEL_EMOJI = '🪏';

/** 按字符测量标题各字中心（与 drawBrandTitle 同 font / baseline） */
function measureTitleCharCenters(ctx, text, centerX, centerY, font) {
    ctx.save();
    ctx.font = font || 'bold 48px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const totalW = ctx.measureText(text).width;
    let x = centerX - totalW / 2;
    const centers = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const w = ctx.measureText(ch).width;
        centers.push({ ch, x: x + w / 2, y: centerY, w, index: i });
        x += w;
    }
    ctx.restore();
    return centers;
}

/** 两字之间的中点（上方装饰锚点） */
function gapCenter(a, b) {
    return { x: (a.x + b.x) / 2, y: a.y };
}

/** 矢量棕色铲子（emoji 不可用时的回退） */
function drawShovel(ctx, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.25);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = '#5c3d1e';
    ctx.lineWidth = size * 0.11;
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, -size * 0.48);
    ctx.lineTo(size * 0.18, size * 0.38);
    ctx.stroke();

    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = size * 0.085;
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, -size * 0.48);
    ctx.lineTo(size * 0.18, size * 0.38);
    ctx.stroke();

    ctx.fillStyle = '#6b4423';
    ctx.beginPath();
    ctx.moveTo(size * 0.02, size * 0.22);
    ctx.lineTo(size * 0.48, size * 0.52);
    ctx.lineTo(size * 0.38, size * 0.68);
    ctx.lineTo(-size * 0.08, size * 0.38);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#a0522d';
    ctx.beginPath();
    ctx.moveTo(size * 0.06, size * 0.26);
    ctx.lineTo(size * 0.44, size * 0.5);
    ctx.lineTo(size * 0.36, size * 0.62);
    ctx.lineTo(-size * 0.02, size * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#4a3018';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.02, size * 0.22);
    ctx.lineTo(size * 0.48, size * 0.52);
    ctx.lineTo(size * 0.38, size * 0.68);
    ctx.lineTo(-size * 0.08, size * 0.38);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
}

/** 🪏 emoji 铲子；旧机型无字形时自动回退矢量 */
let _shovelEmojiOk = null;

function drawShovelIcon(ctx, cx, cy, size) {
    if (_shovelEmojiOk !== false) {
        ctx.save();
        ctx.font = `${size}px sans-serif`;
        const w = ctx.measureText(SHOVEL_EMOJI).width;
        if (w > size * 0.35) {
            _shovelEmojiOk = true;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(SHOVEL_EMOJI, cx, cy);
            ctx.restore();
            return;
        }
        _shovelEmojiOk = false;
        ctx.restore();
    }
    drawShovel(ctx, cx, cy, size * 0.95);
}

/** 金色等轴方块徽章 */
function drawGoldenCubeBadge(ctx, cx, cy, size) {
    const geo = buildIsoBlockFaces(cx, cy, size, 'cube');
    drawSolidIsoBlock(ctx, geo, {
        left: 'rgba(201, 162, 39, 0.96)',
        right: 'rgba(224, 154, 48, 0.96)',
        top: 'rgba(255, 215, 64, 0.98)',
        bottom: 'rgba(140, 100, 25, 0.55)',
        backEdge: 'rgba(255, 230, 150, 0.82)',
        frontEdge: 'rgba(255, 240, 180, 0.78)',
        shadowAlpha: 0.28,
    });
}

/**
 * 在「挖个方块」标题上绘制铲子和金方块装饰
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} centerX
 * @param {number} centerY
 * @param {string} [font]
 * @param {number} [animTime] 轻微浮动相位（秒）
 */
function drawHomeTitleDecorations(ctx, text, centerX, centerY, font, animTime) {
    if (text !== '挖个方块') return;

    const centers = measureTitleCharCenters(ctx, text, centerX, centerY, font);
    if (centers.length < 4) return;

    const bob = animTime != null ? Math.sin(animTime * 2.4) * 2 : 0;
    const lift = 22;

    const shovelAnchor = gapCenter(centers[0], centers[1]);
    drawShovelIcon(ctx, shovelAnchor.x + 20, shovelAnchor.y - lift - 20 + bob * 0.6, 44);

    const cubeAnchor = gapCenter(centers[2], centers[3]);
    drawGoldenCubeBadge(ctx, cubeAnchor.x, cubeAnchor.y - lift + bob, 36);
}

module.exports = {
    drawHomeTitleDecorations,
    drawShovel,
    drawShovelIcon,
    drawGoldenCubeBadge,
};
