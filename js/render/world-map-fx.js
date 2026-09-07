/**
 * 闯关世界地图绘制：贴图章节块 + 石砖路径（对齐效果图）。
 */

const { drawBoardTileCell, roundRectPath } = require('./board-tiles');
const IconRenderer = require('./icon-renderer');
const { getThemeImage } = require('../theme/theme-images');

const COLS = 10;
const GOLD = '#FFC857';
const LEFT_COLS = [2.15, 2.95, 2.35, 3.25, 2.55];
const RIGHT_COLS = [6.55, 6.95, 6.35, 6.75, 6.15];
/** 首屏约 3 整块 + 半块；顶/底留白只够标签与返回钮，避免两端大片空档 */
const BASE_ROW = 2.6;
const ROW_STEP = 6.5;
const TOP_PAD_ROWS = 7;
/** cubeScreenPos 相对路径格上移量，计算底留白时需抵消 */
const CUBE_LIFT_PX = 50;

const PATH_TILE_STYLE = {
    background: 'rgba(0,0,0,0)',
    cellLight: '#7a6a5a',
    cellDark: '#5a4c40',
    cellGap: 2,
    cellRadius: 5,
    cellInsetBevel: true,
    borderColor: 'rgba(0,0,0,0)',
    frameRadius: 0,
    frameGlow: 'rgba(0,0,0,0)',
    framePadding: 0,
};

function hashSeed(col, row) {
    return ((col * 73856093) ^ (row * 19349663)) >>> 0;
}

function rnd(seed, n) {
    let s = (seed + n * 2654435761) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 2246822519);
    s = Math.imul(s ^ (s >>> 13), 3266489917);
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}

function layoutChapterNode(index, bottomPad) {
    const col = (index % 2 === 0)
        ? LEFT_COLS[Math.floor(index / 2) % LEFT_COLS.length]
        : RIGHT_COLS[Math.floor(index / 2) % RIGHT_COLS.length];
    return { col, row: BASE_ROW + index * ROW_STEP + (bottomPad || 0) };
}

function boardRowsForCount(n, bottomPad) {
    if (n <= 0) return 24 + (bottomPad || 0);
    return Math.ceil(BASE_ROW + (n - 1) * ROW_STEP + TOP_PAD_ROWS) + (bottomPad || 0);
}

function fillEllipse(ctx, cx, cy, rx, ry) {
    const rxn = Math.max(0.5, rx);
    const ryn = Math.max(0.5, ry);
    const kappa = 0.5522848;
    const ox = rxn * kappa;
    const oy = ryn * kappa;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ryn);
    ctx.bezierCurveTo(cx + ox, cy - ryn, cx + rxn, cy - oy, cx + rxn, cy);
    ctx.bezierCurveTo(cx + rxn, cy + oy, cx + ox, cy + ryn, cx, cy + ryn);
    ctx.bezierCurveTo(cx - ox, cy + ryn, cx - rxn, cy + oy, cx - rxn, cy);
    ctx.bezierCurveTo(cx - rxn, cy - oy, cx - ox, cy - ryn, cx, cy - ryn);
    ctx.closePath();
}

function nearChapter(nodes, c, r) {
    let best = 99;
    let state = 'locked';
    for (let i = 0; i < nodes.length; i++) {
        const ch = nodes[i];
        const d = Math.hypot(c - ch.col, r - ch.row);
        if (d < best) {
            best = d;
            state = ch.state;
        }
    }
    return { d: best, state };
}

function buildDecors(nodes, rows) {
    const decors = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
            const near = nearChapter(nodes, c + 0.5, r + 0.5);
            if (near.d < 2.5) continue;
            const seed = hashSeed(c, r);
            let chance = 0.08;
            if (near.state === 'cleared' && near.d < 5.5) chance = 0.22;
            else if (near.d < 4.5) chance = 0.12;
            if (rnd(seed, 1) > chance) continue;
            const roll = rnd(seed, 2);
            let kind = 'rubble';
            if (roll > 0.7 && roll <= 0.85) kind = 'teal';
            else if (roll > 0.85 && roll <= 0.93) kind = 'gold';
            else if (roll > 0.93) kind = 'chip';
            decors.push({
                c: c + 0.15 + rnd(seed, 3) * 0.7,
                r: r + 0.15 + rnd(seed, 4) * 0.7,
                kind,
                seed,
                scale: 0.45 + rnd(seed, 6) * 0.4,
            });
        }
    }
    return decors;
}

function buildPathCells(nodes) {
    const cells = [];
    const seen = {};
    const add = (c, r, accent) => {
        const cc = Math.round(c);
        const rr = Math.round(r);
        if (cc < 0 || cc >= COLS || rr < 0) return;
        const key = cc + ',' + rr;
        if (seen[key]) return;
        seen[key] = true;
        cells.push({ c: cc, r: rr, accent: !!accent });
    };
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        add(n.col, n.row, false);
        add(n.col - 1, n.row, false);
        add(n.col + 1, n.row, false);
        if (i === 0) continue;
        const a = nodes[i - 1];
        const b = n;
        const steps = Math.max(8, Math.ceil(Math.hypot(b.col - a.col, b.row - a.row) * 2.4));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const c = a.col + (b.col - a.col) * t;
            const r = a.row + (b.row - a.row) * t;
            const seed = hashSeed(Math.floor(c * 10), Math.floor(r * 10));
            add(c, r, rnd(seed, 3) > 0.84);
            add(c + (rnd(seed, 4) > 0.5 ? 0.55 : -0.55), r, false);
        }
    }
    return cells;
}

function isoPts(cx, cy, size) {
    const hw = size * 0.46;
    const hh = size * 0.22;
    const depth = size * 0.52;
    const midY = cy - depth * 0.2;
    const slice = (d) => ({
        T: { x: cx, y: midY - hh + d },
        L: { x: cx - hw, y: midY + d },
        R: { x: cx + hw, y: midY + d },
        B: { x: cx, y: midY + hh + d },
    });
    const top0 = slice(0);
    const bot = slice(depth);
    return {
        top: [top0.T, top0.R, top0.B, top0.L],
        left: [top0.L, top0.B, bot.B, bot.L],
        right: [top0.R, top0.B, bot.B, bot.R],
        shadow: { cx, cy: bot.B.y + size * 0.05, rx: hw * 0.95, ry: hh * 0.95 },
    };
}

function face(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw || 1;
        ctx.stroke();
    }
}

function worldToScreen(layout, col, row, originY) {
    return {
        x: layout.originX + col * layout.cell,
        y: layout.boardBottom - (row * layout.cell - originY),
    };
}

function makeLayout(width, screenH, chapterCount, contentBottom) {
    const cell = Math.max(16, Math.floor((width - 24) / COLS));
    const originX = (width - COLS * cell) / 2;
    const bottom = typeof contentBottom === 'number' ? contentBottom : screenH;
    // 让首章脚部落在返回钮上方：按目标屏幕 Y 反推行距，勿再叠加 UI 区 + 方块双倍留白
    const footClear = cell * 3.15 * 0.4;
    const targetCy = bottom - footClear;
    const targetRow = (screenH - CUBE_LIFT_PX + cell * 0.05 - targetCy) / cell;
    const bottomPad = Math.max(0, Math.ceil(targetRow - BASE_ROW));
    const rows = boardRowsForCount(chapterCount, bottomPad);
    return {
        cell,
        originX,
        boardBottom: screenH,
        rows,
        boardW: COLS * cell,
        boardH: rows * cell,
        bottomPad,
        contentBottom: bottom,
    };
}

function maxOrigin(layout, visH) {
    // 顶留白由 TOP_PAD_ROWS 承担，不再额外多滚，避免末章停在屏中
    return Math.max(0, layout.boardH - visH);
}

function drawPath(ctx, layout, pathCells, originY, visTop, visBot) {
    const cell = layout.cell;
    for (let i = 0; i < pathCells.length; i++) {
        const p = pathCells[i];
        if (p.r < visTop - 1 || p.r > visBot + 1) continue;
        const scr = worldToScreen(layout, p.c, p.r, originY);
        let style = PATH_TILE_STYLE;
        if (p.accent) {
            style = Object.assign({}, PATH_TILE_STYLE, {
                cellLight: '#4a7a72',
                cellDark: '#3a625c',
            });
        } else if (((p.c + p.r) & 1) === 0) {
            style = Object.assign({}, PATH_TILE_STYLE, {
                cellLight: '#8a7a68',
                cellDark: '#6a5a4a',
            });
        }
        drawBoardTileCell(ctx, scr.x, scr.y - cell, cell, p.c, p.r, style, true);
    }
}

function drawDecors(ctx, layout, decors, originY, visTop, visBot) {
    const cell = layout.cell;
    for (let i = 0; i < decors.length; i++) {
        const d = decors[i];
        if (d.r < visTop - 1 || d.r > visBot + 1) continue;
        const p = worldToScreen(layout, d.c, d.r, originY);
        const cx = p.x;
        const cy = p.y - cell * 0.3;
        const sz = cell * (d.kind === 'chip' ? 0.38 : 0.55) * d.scale;
        const geo = isoPts(cx, cy, sz);
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        fillEllipse(ctx, geo.shadow.cx, geo.shadow.cy, geo.shadow.rx, geo.shadow.ry);
        ctx.fill();
        ctx.restore();
        if (d.kind === 'gold') {
            face(ctx, geo.left, '#b8860b', '#7a5a10', 0.7);
            face(ctx, geo.right, '#d4a017', '#8a6a12', 0.7);
            face(ctx, geo.top, '#FFE566', '#c9a227', 0.7);
        } else if (d.kind === 'teal') {
            face(ctx, geo.left, '#3a6a64', '#2a4a46', 0.7);
            face(ctx, geo.right, '#4a857c', '#325850', 0.7);
            face(ctx, geo.top, '#6aa8a0', '#3a6a64', 0.7);
        } else {
            face(ctx, geo.left, '#5a4a3c', '#3a322a', 0.7);
            face(ctx, geo.right, '#6e5a48', '#403428', 0.7);
            face(ctx, geo.top, '#84705a', '#5c4c3c', 0.7);
        }
    }
}

function cubeSkinKey(node) {
    if (node.state === 'locked') return 'mapCubeLocked';
    if (node.state === 'cleared') return 'mapCubeCleared';
    if (node.isProgress) return 'mapCubeProgress';
    return 'mapCubeUnlocked';
}

function cubeScreenPos(layout, node, originY) {
    const p = worldToScreen(layout, node.col, node.row, originY);
    // 略放大并下压，让方块「落」在路径上，减轻飘在空中的割裂感
    const size = layout.cell * 3.15;
    const cx = p.x + layout.cell * 0.15;
    // 相对背景整体上移，与 makeLayout 底留白计算共用 CUBE_LIFT_PX
    const cy = p.y + layout.cell * 0.05 - CUBE_LIFT_PX;
    return { cx, cy, size };
}

function drawSpriteContain(ctx, key, cx, cy, box) {
    const entry = getThemeImage(key);
    if (!entry.ready || !entry.img) return null;
    const img = entry.img;
    const iw = img.width || 1;
    const ih = img.height || 1;
    const scale = Math.min(box / iw, box / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const x = cx - dw / 2;
    const y = cy - dh / 2;
    ctx.drawImage(img, x, y, dw, dh);
    return { x, y, w: dw, h: dh };
}

/**
 * 用贴图本身做外扩叠加，得到贴合方块轮廓的发光（不用几何六边形描边）。
 */
function drawSpriteOuterGlow(ctx, key, cx, cy, box) {
    const entry = getThemeImage(key);
    if (!entry.ready || !entry.img) return;
    const img = entry.img;
    const iw = img.width || 1;
    const ih = img.height || 1;
    const base = Math.min(box / iw, box / ih);
    const layers = [
        { mul: 1.26, a: 0.1 },
        { mul: 1.18, a: 0.16 },
        { mul: 1.12, a: 0.24 },
        { mul: 1.06, a: 0.34 },
    ];
    for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        const sc = base * L.mul;
        const dw = iw * sc;
        const dh = ih * sc;
        ctx.save();
        ctx.globalAlpha = L.a;
        try {
            ctx.globalCompositeOperation = 'lighter';
        } catch (e) { /* ignore */ }
        ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.restore();
    }
}

function drawContactShadow(ctx, cx, cy, box) {
    // 落地接触影：贴在方块底端略上，避免影子掉到方块下方过远
    const footY = cy + box * 0.22;
    ctx.save();
    ctx.fillStyle = '#000';
    // 外圈柔影（宽于方块）
    ctx.globalAlpha = 0.22;
    fillEllipse(ctx, cx + box * 0.02, footY + box * 0.02, box * 0.62, box * 0.24);
    ctx.fill();
    // 主投影
    ctx.globalAlpha = 0.36;
    fillEllipse(ctx, cx, footY, box * 0.5, box * 0.19);
    ctx.fill();
    // 贴地实影
    ctx.globalAlpha = 0.28;
    fillEllipse(ctx, cx - box * 0.02, footY - box * 0.02, box * 0.38, box * 0.13);
    ctx.fill();
    ctx.restore();
}

function currentLabelBob(nowMs) {
    const g = 380;
    const hops = [5, 1.6];
    const rest = 0.7;
    const segs = [];
    let totalAir = 0;
    for (let i = 0; i < hops.length; i++) {
        const h = hops[i];
        const v0 = Math.sqrt(2 * g * h);
        const dur = (2 * v0) / g;
        segs.push({ v0: v0, start: totalAir, dur: dur });
        totalAir += dur;
    }
    const t = (nowMs / 1000) % (totalAir + rest);
    if (t >= totalAir) return 0;
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (t <= s.start + s.dur) {
            const u = t - s.start;
            const y = s.v0 * u - 0.5 * g * u * u;
            return y > 0 ? y : 0;
        }
    }
    return 0;
}

function drawCubeFallback(ctx, cx, cy, size, node) {
    const geo = isoPts(cx, cy, size * 0.72);
    const locked = node.state === 'locked';
    const cleared = node.state === 'cleared';
    const top = locked ? '#6a6258' : cleared ? '#FFE566' : '#f0a14a';
    const left = locked ? '#4a453e' : cleared ? '#c9a227' : '#b86a28';
    const right = locked ? '#575148' : cleared ? '#e0b040' : '#d48432';
    face(ctx, geo.left, left, '#2e2a26', 1.2);
    face(ctx, geo.right, right, '#2e2a26', 1.2);
    face(ctx, geo.top, top, '#2e2a26', 1.2);
}

function drawCube(ctx, layout, node, originY, nowMs) {
    const pos = cubeScreenPos(layout, node, originY);
    // 进度章只轻跳，避免整块飘起来
    const bob = node.isProgress ? currentLabelBob(nowMs != null ? nowMs : Date.now()) * 0.45 : 0;
    const box = pos.size;
    const cx = pos.cx;
    const cy = pos.cy - bob;

    drawContactShadow(ctx, cx, cy, box);

    const key = cubeSkinKey(node);
    if (node.isProgress) {
        // 先外扩叠加发光，再用带轮廓光的进度贴图
        drawSpriteOuterGlow(ctx, 'mapCubeUnlocked', cx, cy, box * 0.92);
    }

    const drawn = drawSpriteContain(ctx, key, cx, cy, box);
    let x;
    let y;
    let w;
    let h;
    if (drawn) {
        x = drawn.x;
        y = drawn.y;
        w = drawn.w;
        h = drawn.h;
    } else {
        drawCubeFallback(ctx, cx, cy, box, node);
        w = box;
        h = box;
        x = cx - box / 2;
        y = cy - box / 2;
    }

    // 章节号
    const num = String((node.index != null ? node.index : 0) + 1);
    const numX = cx;
    const numY = y + h * 0.36;
    ctx.save();
    ctx.font = 'bold ' + Math.round(box * 0.17) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(num, numX + 1, numY + 1);
    ctx.fillStyle = node.state === 'locked' ? 'rgba(230,210,180,0.55)' : 'rgba(70,42,12,0.78)';
    ctx.fillText(num, numX, numY);
    ctx.restore();

    if (node.state === 'cleared') {
        const badgeX = cx + w * 0.28;
        const badgeY = y + h * 0.22;
        const r = Math.max(12, box * 0.08);
        ctx.save();
        ctx.fillStyle = '#d4782a';
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a4a12';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        IconRenderer.draw(ctx, 'check', badgeX, badgeY, Math.max(16, box * 0.11), '#FFE566');
        ctx.restore();
    } else if (node.state === 'locked') {
        // 立体锁贴图，居中压在方块顶面
        const lockBox = Math.max(52, Math.round(box * 0.42));
        const lx = cx;
        const ly = y + h * 0.36 + 10;
        ctx.save();
        const lockDrawn = drawSpriteContain(ctx, 'mapIconLock', lx, ly, lockBox);
        if (!lockDrawn) {
            IconRenderer.draw(ctx, 'lock', lx, ly, lockBox * 0.7, '#FFF0D8');
        }
        ctx.restore();
    }

    // 章节名：方块正上方
    const tx = cx;
    const ty = y - 6;
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(node.name, tx + 1, ty + 1);
    ctx.fillStyle = node.state === 'locked' ? 'rgba(210,190,165,0.6)' : '#f0dcc0';
    ctx.fillText(node.name, tx, ty);
    ctx.restore();
}

function cubeHitRect(layout, node, originY) {
    const pos = cubeScreenPos(layout, node, originY);
    const box = pos.size;
    const top = pos.cy - box / 2 - 22 - (node.isProgress ? 8 : 0);
    const bottom = pos.cy + box * 0.48;
    const left = pos.cx - box / 2;
    const right = pos.cx + box / 2;
    return {
        id: node.id,
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
    };
}

function visibleRowRange(layout, originY, screenH) {
    const cell = layout.cell;
    const base = layout.boardBottom + originY;
    const visTop = Math.floor((base - screenH) / cell) - 1;
    const visBot = Math.ceil(base / cell) + 1;
    return { visTop, visBot };
}

function cameraOriginForNode(layout, node, visH) {
    const y = node.row * layout.cell - visH * 0.52;
    return Math.max(0, Math.min(maxOrigin(layout, visH), y));
}

module.exports = {
    COLS,
    GOLD,
    layoutChapterNode,
    boardRowsForCount,
    buildDecors,
    buildPathCells,
    makeLayout,
    maxOrigin,
    worldToScreen,
    visibleRowRange,
    cameraOriginForNode,
    drawPath,
    drawDecors,
    drawCube,
    cubeHitRect,
};
