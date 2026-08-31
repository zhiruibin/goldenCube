/**
 * 棋盘格槽绘制（P0/P1：交替圆角砖 + 外框光晕 + 空格内凹）
 * 方块绘制不变；仅替换底色与网格线。
 */

const { boardSkins } = require('../../data/skins');

const DEFAULT_TILE_STYLE = {
    background: '#0c101c',
    cellLight: '#1a2236',
    cellDark: '#141b2c',
    cellGap: 2,
    cellRadius: null,
    cellInsetBevel: true,
    borderColor: '#2a3550',
    frameRadius: 10,
    frameGlow: 'rgba(88, 118, 188, 0.16)',
    framePadding: 4,
};

function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
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

function resolveTileStyle(style) {
    const s = style || {};
    return {
        background: s.background || DEFAULT_TILE_STYLE.background,
        cellLight: s.cellLight || DEFAULT_TILE_STYLE.cellLight,
        cellDark: s.cellDark || DEFAULT_TILE_STYLE.cellDark,
        cellGap: typeof s.cellGap === 'number' ? s.cellGap : DEFAULT_TILE_STYLE.cellGap,
        cellRadius: typeof s.cellRadius === 'number' ? s.cellRadius : DEFAULT_TILE_STYLE.cellRadius,
        cellInsetBevel: s.cellInsetBevel !== false,
        borderColor: s.borderColor || DEFAULT_TILE_STYLE.borderColor,
        frameRadius: typeof s.frameRadius === 'number' ? s.frameRadius : DEFAULT_TILE_STYLE.frameRadius,
        frameGlow: s.frameGlow || DEFAULT_TILE_STYLE.frameGlow,
        framePadding: typeof s.framePadding === 'number' ? s.framePadding : DEFAULT_TILE_STYLE.framePadding,
    };
}

/** 读取装备棋盘皮肤的格槽参数；非 tiles 模式返回 null */
function getBoardSkinTileStyle(skinId) {
    let id = skinId;
    if (!id) {
        try {
            id = wx.getStorageSync('gc_equipped_board') || 'default';
        } catch (e) {
            id = 'default';
        }
    }
    const skin = boardSkins.find((s) => s.id === id) || boardSkins[0];
    const style = (skin && skin.style) || {};
    if (style.gridMode !== 'tiles') return null;
    return resolveTileStyle(style);
}

function scaledTileMetrics(cellSize, style) {
    const s = resolveTileStyle(style);
    const scale = cellSize >= 14 ? 1 : Math.max(0.45, cellSize / 14);
    const gap = Math.max(1, Math.round(s.cellGap * scale));
    const radius = s.cellRadius != null
        ? Math.max(1, s.cellRadius * scale)
        : Math.max(1, Math.min(6, cellSize * 0.2));
    const frameRadius = Math.max(2, s.frameRadius * (cellSize >= 14 ? 1 : Math.max(0.5, cellSize / 14)));
    const framePadding = cellSize >= 10 ? s.framePadding : Math.max(1, s.framePadding * 0.5);
    return { gap, radius, frameRadius, framePadding, style: s };
}

/**
 * 棋盘外框：略宽于盘体，弱光晕 + 圆角容器
 */
function drawBoardChrome(ctx, x, y, boardW, boardH, cellSize, style) {
    const m = scaledTileMetrics(cellSize, style);
    const s = m.style;
    const pad = m.framePadding;
    const fr = m.frameRadius;

    ctx.save();
    ctx.shadowColor = s.frameGlow;
    ctx.shadowBlur = cellSize >= 10 ? 14 : 6;
    ctx.fillStyle = s.background;
    roundRectPath(ctx, x - pad, y - pad, boardW + pad * 2, boardH + pad * 2, fr + pad * 0.5);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = s.background;
    roundRectPath(ctx, x, y, boardW, boardH, fr);
    ctx.fill();

    ctx.strokeStyle = s.borderColor;
    ctx.lineWidth = cellSize >= 10 ? 1.5 : 1;
    roundRectPath(ctx, x, y, boardW, boardH, fr);
    ctx.stroke();
}

function drawBoardTileCell(ctx, cx, cy, cellSize, col, row, style, emptyBevel) {
    const m = scaledTileMetrics(cellSize, style);
    const s = m.style;
    const gap = m.gap;
    const half = gap / 2;
    const tx = cx + half;
    const ty = cy + half;
    const tw = cellSize - gap;
    const th = cellSize - gap;
    if (tw < 1 || th < 1) return;

    const r = Math.min(m.radius, tw / 2, th / 2);
    const fill = ((col + row) & 1) ? s.cellLight : s.cellDark;

    ctx.fillStyle = fill;
    roundRectPath(ctx, tx, ty, tw, th, r);
    ctx.fill();

    if (emptyBevel && s.cellInsetBevel && tw >= 5) {
        const hi = Math.max(1, th * 0.14);
        const sh = Math.max(1, th * 0.14);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fillRect(tx + 1, ty + 1, tw - 2, hi);
        ctx.fillRect(tx + 1, ty + 1, hi, th - 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
        ctx.fillRect(tx + 1, ty + th - sh, tw - 2, sh);
        ctx.fillRect(tx + tw - sh, ty + 1, sh, th - 2);
    }
}

/**
 * 绘制格槽铺砖
 * @param {number[][]|null} occupancy - 有方块/垃圾的格为 truthy；null 表示全空
 */
function drawBoardTiles(ctx, x, y, cols, rows, cellSize, occupancy, style) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const occupied = occupancy
                ? !!(occupancy[r] && occupancy[r][c])
                : false;
            drawBoardTileCell(
                ctx,
                x + c * cellSize,
                y + r * cellSize,
                cellSize,
                c,
                r,
                style,
                !occupied
            );
        }
    }
}

function clipBoardInterior(ctx, x, y, w, h, cellSize, style) {
    const m = scaledTileMetrics(cellSize, style);
    roundRectPath(ctx, x, y, w, h, m.frameRadius);
    ctx.clip();
}

/** 布局预览盘：格槽底 + 外框（垃圾/方块由调用方叠画） */
function drawLayoutBoardTiles(ctx, ox, oy, cols, visRows, cellSize, occupancy, skinId) {
    const style = getBoardSkinTileStyle(skinId);
    if (!style) return false;
    const bw = cols * cellSize;
    const bh = visRows * cellSize;
    drawBoardChrome(ctx, ox, oy, bw, bh, cellSize, style);
    drawBoardTiles(ctx, ox, oy, cols, visRows, cellSize, occupancy || null, style);
    return true;
}

module.exports = {
    DEFAULT_TILE_STYLE,
    resolveTileStyle,
    getBoardSkinTileStyle,
    roundRectPath,
    drawBoardChrome,
    drawBoardTiles,
    drawBoardTileCell,
    clipBoardInterior,
    drawLayoutBoardTiles,
};
