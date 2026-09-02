/**
 * 闯关世界地图绘制：格槽棋盘、散落碎渣/草丛、主题垃圾块。
 * 投影用椭圆 fill，不用 shadowBlur。
 */

const { drawBoardTileCell, DEFAULT_TILE_STYLE, roundRectPath } = require('./board-tiles');

const COLS = 10;
const GOLD = '#FFC857';
const CYAN = '#00c6ff';
const LEFT_COLS = [2.2, 3.0, 2.4, 3.4, 2.6];
const RIGHT_COLS = [6.4, 6.8, 6.2, 6.6, 6.0];
const BASE_ROW = 3.2;
const ROW_STEP = 6.2;
const TOP_PAD_ROWS = 7.2;

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
        topCenter: { x: cx, y: midY - 4 },
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
        ctx.lineWidth = lw || 1.4;
        ctx.stroke();
    }
}

function strokeCrack(ctx, points, lw) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.translate(0.7, 0.9);
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.lineWidth = lw + 0.8;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(24,22,28,0.9)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.translate(-0.45, -0.55);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = Math.max(0.35, lw * 0.32);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
}

function crackOnQuad(ctx, pts, seed, lwScale) {
    const bx = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
    const by = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
    const bw = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x) - bx;
    const bh = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y) - by;
    const w = Math.min(bw, bh);
    const lw = Math.max(0.65, w * 0.045 * (lwScale || 1));
    const startEdge = Math.floor(rnd(seed, 1) * 4);
    const t0 = 0.18 + rnd(seed, 3) * 0.64;
    const start = [
        { x: bx + t0 * bw, y: by },
        { x: bx + bw, y: by + t0 * bh },
        { x: bx + t0 * bw, y: by + bh },
        { x: bx, y: by + t0 * bh },
    ][startEdge];
    const depth = w * (0.35 + rnd(seed, 4) * 0.37);
    const inward = {
        0: Math.PI / 2 + (rnd(seed, 5) - 0.5) * 0.85,
        1: Math.PI + (rnd(seed, 5) - 0.5) * 0.85,
        2: -Math.PI / 2 + (rnd(seed, 5) - 0.5) * 0.85,
        3: (rnd(seed, 5) - 0.5) * 0.85,
    }[startEdge];
    const mid = {
        x: start.x + Math.cos(inward) * depth * 0.52,
        y: start.y + Math.sin(inward) * depth * 0.52,
    };
    const end = {
        x: start.x + Math.cos(inward) * depth,
        y: start.y + Math.sin(inward) * depth,
    };
        ctx.save();
        try {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            if (typeof ctx.clip === 'function') ctx.clip();
            strokeCrack(ctx, [start, mid, end], lw);
            if (rnd(seed, 7) > 0.45) {
                const ba = inward + (Math.PI / 2) * (rnd(seed, 8) > 0.5 ? 1 : -1) + (rnd(seed, 9) - 0.5) * 0.35;
                const bl = w * (0.1 + rnd(seed, 10) * 0.14);
                strokeCrack(ctx, [mid, { x: mid.x + Math.cos(ba) * bl, y: mid.y + Math.sin(ba) * bl }], lw * 0.68);
            }
            for (let i = 0; i < 2; i++) {
                ctx.globalAlpha = 0.1 + rnd(seed, 20 + i) * 0.12;
                ctx.fillStyle = '#2a2a30';
                ctx.beginPath();
                ctx.arc(bx + rnd(seed, 30 + i) * bw, by + rnd(seed, 40 + i) * bh, Math.max(1.2, w * 0.05), 0, Math.PI * 2);
                ctx.fill();
            }
        } catch (e) { /* 微信 canvas clip 兼容 */ }
        ctx.restore();
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
            if (near.d < 2.35) continue;
            const seed = hashSeed(c, r);
            let chance = 0.12;
            if (near.state === 'cleared' && near.d < 5.5) chance = 0.4;
            else if (near.state === 'current' && near.d < 5) chance = 0.22;
            else if (near.d < 4) chance = 0.16;
            if (rnd(seed, 1) > chance) continue;
            const roll = rnd(seed, 2);
            let kind = 'rubble';
            if (near.state === 'cleared' && near.d < 5 && roll > 0.88) kind = 'gold';
            else if (roll > 0.62 && roll <= 0.88) kind = 'grass';
            else if (roll > 0.88) kind = 'chip';
            const tuftRoll = rnd(seed, 7);
            const tuft = tuftRoll > 0.82 ? 15 : tuftRoll > 0.48 ? 7 : 3;
            decors.push({
                c: c + 0.15 + rnd(seed, 3) * 0.7,
                r: r + 0.15 + rnd(seed, 4) * 0.7,
                kind,
                seed,
                tuft,
                scale: 0.55 + rnd(seed, 6) * 0.45,
            });
        }
    }
    return decors;
}

function drawContactShadow(ctx, geo, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    fillEllipse(ctx, geo.shadow.cx, geo.shadow.cy, geo.shadow.rx, geo.shadow.ry);
    ctx.fill();
    ctx.restore();
}

function drawGlowPool(ctx, geo, color, strength) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18 * strength;
    fillEllipse(ctx, geo.shadow.cx, geo.shadow.cy - 2, geo.shadow.rx * 1.45, geo.shadow.ry * 1.85);
    ctx.fill();
    ctx.globalAlpha = 0.28 * strength;
    fillEllipse(ctx, geo.shadow.cx, geo.shadow.cy - 2, geo.shadow.rx * 1.12, geo.shadow.ry * 1.4);
    ctx.fill();
    ctx.restore();
}

function drawGrassTuft(ctx, cx, cy, count, seed, scale) {
    const spread = count <= 3 ? 5.5 : count <= 7 ? 8.5 : 12;
    const s = 0.75 + scale * 0.55;
    ctx.save();
    ctx.fillStyle = 'rgba(62, 52, 38, 0.35)';
    fillEllipse(ctx, cx, cy + 1.2, spread * 0.38 * s, 2.1 * s);
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const fan = (t - 0.5) * 2;
        const wobble = (rnd(seed, 20 + i) - 0.5) * (count > 7 ? 4.2 : 2.4);
        const bx = cx + fan * spread * 0.42 * s + wobble;
        const by = cy + (rnd(seed, 40 + i) - 0.5) * 1.6;
        const h = (5.5 + rnd(seed, 60 + i) * 7.5) * s * (0.78 + (1 - Math.abs(fan)) * 0.35);
        const lean = fan * (count > 7 ? 5.5 : 3.8) + (rnd(seed, 80 + i) - 0.5) * 3.2;
        const midX = bx + lean * 0.35 + (rnd(seed, 100 + i) - 0.5) * 2.5;
        const tipX = bx + lean;
        const dark = rnd(seed, 120 + i) > 0.55;
        ctx.strokeStyle = dark ? 'rgba(86, 94, 56, 0.78)' : 'rgba(118, 126, 76, 0.82)';
        ctx.lineWidth = (0.85 + rnd(seed, 140 + i) * 0.55) * s;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(midX, by - h * 0.48, tipX, by - h);
        ctx.stroke();
    }
    ctx.restore();
}

function worldToScreen(layout, col, row, originY) {
    return {
        x: layout.originX + col * layout.cell,
        y: layout.boardBottom - (row * layout.cell - originY),
    };
}

function makeLayout(width, screenH, chapterCount, contentBottom) {
    const cell = Math.max(16, Math.floor((width - 36) / COLS));
    const originX = (width - COLS * cell) / 2;
    const bottom = typeof contentBottom === 'number' ? contentBottom : screenH;
    const bottomPad = Math.max(0, Math.ceil((screenH - bottom) / cell));
    const rows = boardRowsForCount(chapterCount, bottomPad);
    return {
        cell,
        originX,
        boardBottom: screenH,
        rows,
        boardW: COLS * cell,
        boardH: rows * cell,
        bottomPad,
    };
}

function maxOrigin(layout, visH) {
    return Math.max(0, layout.boardH - visH);
}

function drawTiles(ctx, layout, originY, visTop, visBot) {
    const { cell, originX, rows, boardW, boardH } = layout;
    const bx = originX;
    const by = layout.boardBottom - (boardH - originY);
    const fillH = boardH + 20;

    ctx.fillStyle = DEFAULT_TILE_STYLE.background;
    roundRectPath(ctx, bx, by, boardW, fillH, 10);
    ctx.fill();
    ctx.strokeStyle = DEFAULT_TILE_STYLE.borderColor;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, bx, by, boardW, fillH, 10);
    ctx.stroke();

    const r0 = Math.max(0, visTop);
    const r1 = Math.min(rows - 1, visBot);
    for (let r = r0; r <= r1; r++) {
        for (let c = 0; c < COLS; c++) {
            const p = worldToScreen(layout, c, r, originY);
            drawBoardTileCell(ctx, p.x, p.y - cell, cell, c, r, DEFAULT_TILE_STYLE, true);
        }
    }
}

function drawDecors(ctx, layout, decors, originY, visTop, visBot) {
    const cell = layout.cell;
    for (let i = 0; i < decors.length; i++) {
        const d = decors[i];
        if (d.r < visTop - 1 || d.r > visBot + 1) continue;
        const p = worldToScreen(layout, d.c, d.r, originY);
        const cx = p.x;
        const cy = p.y - cell * 0.35;
        if (d.kind === 'grass') {
            drawGrassTuft(ctx, cx, cy, d.tuft, d.seed, d.scale);
            continue;
        }
        if (d.kind === 'gold') {
            const geo = isoPts(cx, cy - 2, cell * 0.55 * d.scale);
            drawContactShadow(ctx, geo, 0.32);
            face(ctx, geo.left, '#b8860b', '#7a5a10', 0.8);
            face(ctx, geo.right, '#d4a017', '#8a6a12', 0.8);
            face(ctx, geo.top, '#FFE566', '#c9a227', 0.8);
            continue;
        }
        const sz = cell * (d.kind === 'chip' ? 0.42 : 0.72) * d.scale;
        const geo = isoPts(cx, cy - 1, sz);
        drawContactShadow(ctx, geo, d.kind === 'chip' ? 0.22 : 0.28);
        ctx.save();
        ctx.globalAlpha = 0.92;
        face(ctx, geo.left, '#5a5a62', '#3a3a42', 0.7);
        face(ctx, geo.right, '#6e6e76', '#404048', 0.7);
        face(ctx, geo.top, '#84848c', '#5c5c64', 0.7);
        crackOnQuad(ctx, geo.top, d.seed, 1.2);
        ctx.restore();
    }
}

function cubeScreenPos(layout, node, originY) {
    const p = worldToScreen(layout, node.col, node.row, originY);
    const lifted = node.state === 'current' ? 7 : 0;
    const size = layout.cell * 2.35;
    const cx = p.x + layout.cell * 0.2;
    const cy = p.y - layout.cell * 0.35 - lifted;
    return { cx, cy, size, lifted };
}

function cubeHitRect(layout, node, originY) {
    const pos = cubeScreenPos(layout, node, originY);
    const geo = isoPts(pos.cx, pos.cy, pos.size);
    const labelY = geo.top[0].y - 18;
    const bobPad = node.state === 'current' ? 10 : 0;
    const top = labelY - 18 - bobPad;
    const bottom = geo.shadow.cy + geo.shadow.ry + 8;
    const halfW = Math.max(pos.size * 0.72, 56);
    return {
        id: node.id,
        x: pos.cx - halfW,
        y: top,
        w: halfW * 2,
        h: Math.max(pos.size * 0.9, bottom - top),
    };
}

/**
 * 正在通关主题名：初速向上、重力下落，落地再弹一小下后歇住。
 * y = v0 t - ½ g t²，第二跳高度按 restitution² 衰减。
 */
function currentLabelBob(nowMs) {
    const g = 380;
    const hops = [8, 2.2];
    const rest = 0.5;
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

function drawCube(ctx, layout, node, originY, nowMs) {
    const pos = cubeScreenPos(layout, node, originY);
    const geo = isoPts(pos.cx, pos.cy, pos.size);
    const locked = node.state === 'locked';
    const glow = node.state === 'current' ? CYAN : node.state === 'cleared' ? GOLD : null;

    if (glow) {
        drawGlowPool(ctx, geo, glow, node.state === 'current' ? 1 : 0.65);
    }

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    fillEllipse(
        ctx,
        geo.shadow.cx,
        geo.shadow.cy + (pos.lifted ? 3 : 0),
        geo.shadow.rx,
        geo.shadow.ry
    );
    ctx.fill();
    ctx.restore();

    const dim = locked ? 0.55 : 1;
    ctx.save();
    ctx.globalAlpha = dim;
    face(ctx, geo.left, '#5a5a62', '#3a3a42', 1);
    face(ctx, geo.right, '#6e6e76', '#404048', 1);
    face(ctx, geo.top, locked ? '#7a7a82' : '#909098', '#5c5c64', 1);
    crackOnQuad(ctx, geo.top, hashSeed(node.id, 11), locked ? 0.7 : 1);
    crackOnQuad(ctx, geo.left, hashSeed(node.id, 22), locked ? 0.55 : 0.85);
    crackOnQuad(ctx, geo.right, hashSeed(node.id, 33), locked ? 0.45 : 0.7);

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(geo.top[0].x, geo.top[0].y);
    ctx.lineTo(geo.top[1].x, geo.top[1].y);
    ctx.lineTo((geo.top[1].x + geo.top[2].x) / 2, (geo.top[1].y + geo.top[2].y) / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (glow) {
        ctx.save();
        ctx.strokeStyle = glow;
        ctx.lineWidth = node.state === 'current' ? 2.6 : 1.7;
        ctx.beginPath();
        ctx.moveTo(geo.top[0].x, geo.top[0].y);
        geo.top.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(geo.left[0].x, geo.left[0].y);
        ctx.lineTo(geo.left[3].x, geo.left[3].y);
        ctx.lineTo(geo.left[2].x, geo.left[2].y);
        ctx.moveTo(geo.right[0].x, geo.right[0].y);
        ctx.lineTo(geo.right[3].x, geo.right[3].y);
        ctx.lineTo(geo.right[2].x, geo.right[2].y);
        ctx.stroke();
        ctx.restore();
    }

    const bob = node.state === 'current' ? currentLabelBob(nowMs != null ? nowMs : Date.now()) : 0;
    const tx = geo.topCenter.x;
    const ty = geo.top[0].y - 18 - bob;
    ctx.save();
    ctx.fillStyle = locked ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.22)';
    fillEllipse(ctx, geo.topCenter.x, geo.topCenter.y + 1, 20, 6.5);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(node.name, tx + 1, ty + 1);
    ctx.fillStyle = locked ? 'rgba(255,245,230,0.38)' : (node.state === 'current' ? '#e8fbff' : '#fff8e8');
    ctx.fillText(node.name, tx, ty);
    ctx.restore();
}

function visibleRowRange(layout, originY, screenH) {
    const cell = layout.cell;
    const base = layout.boardBottom + originY;
    const visTop = Math.floor((base - screenH) / cell) - 1;
    const visBot = Math.ceil(base / cell) + 1;
    return { visTop, visBot };
}

function cameraOriginForNode(layout, node, visH) {
    const y = node.row * layout.cell - visH * 0.55;
    return Math.max(0, Math.min(maxOrigin(layout, visH), y));
}

module.exports = {
    COLS,
    GOLD,
    CYAN,
    layoutChapterNode,
    boardRowsForCount,
    buildDecors,
    makeLayout,
    maxOrigin,
    worldToScreen,
    visibleRowRange,
    cameraOriginForNode,
    drawTiles,
    drawDecors,
    drawCube,
    cubeHitRect,
};
