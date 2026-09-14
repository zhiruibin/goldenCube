/**
 * 垃圾方块绘制：灰色块体 + 确定性裂纹，与玩家方块皮肤解耦
 */

const { GARBAGE, GOLD_GARBAGE } = require('../../utils/tetris-engine');

/** 垃圾块主色（工具栏、图例等 UI 与盘面保持一致） */
const GARBAGE_UI_COLOR = '#787880';

function hashSeed(col, row) {
    return ((col * 73856093) ^ (row * 19349663)) >>> 0;
}

function _rand(seed, n) {
    let s = (seed + n * 2654435761) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 2246822519);
    s = Math.imul(s ^ (s >>> 13), 3266489917);
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} [seed=0]
 */
function drawGarbageCell(ctx, x, y, size, seed) {
    const inset = size >= 8 ? 1 : (size >= 4 ? 0.5 : 0);
    const w = Math.max(1, size - inset * 2);
    const s = seed >>> 0;

    let grad;
    try {
        grad = ctx.createLinearGradient(x, y, x + size, y + size);
        grad.addColorStop(0, '#909098');
        grad.addColorStop(0.45, '#787880');
        grad.addColorStop(1, '#5c5c64');
    } catch (e) {
        grad = null;
    }
    ctx.fillStyle = grad || GARBAGE_UI_COLOR;
    ctx.fillRect(x + inset, y + inset, w, w);

    if (size >= 8) {
        ctx.save();
        for (let i = 0; i < 2; i++) {
            const px = x + inset + _rand(s, i * 3 + 1) * w;
            const py = y + inset + _rand(s, i * 3 + 2) * w;
            const pr = Math.max(1, size * (0.07 + _rand(s, i * 3 + 3) * 0.08));
            ctx.globalAlpha = 0.1 + _rand(s, i + 10) * 0.1;
            ctx.fillStyle = '#2a2a30';
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    if (size >= 4) {
        _drawCracks(ctx, x, y, size, inset, w, s);
    }

    if (size >= 5) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fillRect(x + inset, y + inset, w, Math.max(0.5, size * 0.08));
        ctx.fillRect(x + inset, y + inset, Math.max(0.5, size * 0.08), w);

        ctx.fillStyle = '#3a3a42';
        ctx.fillRect(
            x + inset,
            y + size - inset - Math.max(0.5, size * 0.08),
            w,
            Math.max(0.5, size * 0.08)
        );
        ctx.fillRect(
            x + size - inset - Math.max(0.5, size * 0.08),
            y + inset,
            Math.max(0.5, size * 0.08),
            w
        );
    }

    if (size >= 6) {
        ctx.strokeStyle = 'rgba(18, 18, 22, 0.35)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, w - 1, w - 1);
    }
}

/**
 * 布局预览（10×20 rows 中的 # 格）：与对局内垃圾块同款
 */
function drawGarbageLayoutCell(ctx, x, y, size, col, row) {
    drawGarbageCell(ctx, x, y, size, hashSeed(col, row));
}

/** 中秋专题障碍：月白方形月石，无普通垃圾块的灰色裂纹。 */
function drawMidAutumnGarbageCell(ctx, x, y, size, seed) {
    const s = seed >>> 0;
    const inset = size >= 8 ? 1 : 0.5;
    const w = Math.max(1, size - inset * 2);
    let grad = null;
    try {
        grad = ctx.createLinearGradient(x, y, x + size, y + size);
        grad.addColorStop(0, '#f2f7f5');
        grad.addColorStop(0.46, '#a9bdc2');
        grad.addColorStop(1, '#4c626d');
    } catch (e) { /* 单色回退 */ }
    ctx.save();
    ctx.fillStyle = grad || '#9aabb0';
    ctx.fillRect(x + inset, y + inset, w, w);
    const edge = Math.max(0.7, size * 0.09);
    ctx.fillStyle = 'rgba(244,255,252,.78)';
    ctx.fillRect(x + inset, y + inset, w, edge);
    ctx.fillRect(x + inset, y + inset, edge, w);
    ctx.fillStyle = 'rgba(30,52,63,.55)';
    ctx.fillRect(x + inset, y + inset + w - edge, w, edge);
    ctx.fillRect(x + inset + w - edge, y + inset, edge, w);
    ctx.strokeStyle = 'rgba(220,241,239,.82)';
    ctx.lineWidth = Math.max(.6, size * .035);
    ctx.strokeRect(x + inset + .5, y + inset + .5, w - 1, w - 1);

    // 月坑保留中秋识别，但不改变方形轮廓。
    if (size >= 7) {
        for (let i = 0; i < 2; i++) {
            const px = x + size * (.25 + _rand(s, i * 3 + 1) * .5);
            const py = y + size * (.25 + _rand(s, i * 3 + 2) * .5);
            const craterR = size * (.055 + _rand(s, i * 3 + 3) * .055);
            ctx.fillStyle = 'rgba(47, 65, 73, 0.22)';
            ctx.beginPath(); ctx.arc(px, py, craterR, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.lineWidth = Math.max(0.4, size * 0.025); ctx.stroke();
        }
    }
    ctx.restore();
}

/** 目标金块：仍是垃圾格，但用金矿石材质明确标识。 */
function drawGoldGarbageCell(ctx, x, y, size) {
    const inset = size >= 8 ? 1 : 0.5;
    const w = Math.max(1, size - inset * 2);
    let grad = null;
    try {
        grad = ctx.createLinearGradient(x, y, x + size, y + size);
        grad.addColorStop(0, '#fff3a3');
        grad.addColorStop(0.34, '#ffd43b');
        grad.addColorStop(0.7, '#d99000');
        grad.addColorStop(1, '#7c4300');
    } catch (e) { /* 单色回退 */ }
    ctx.save();
    ctx.shadowColor = 'rgba(255, 210, 50, 0.9)';
    ctx.shadowBlur = Math.max(3, size * 0.28);
    ctx.fillStyle = grad || '#f5bd24';
    ctx.fillRect(x + inset, y + inset, w, w);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,220,0.72)';
    ctx.fillRect(x + size * 0.18, y + size * 0.16, size * 0.42, Math.max(1, size * 0.11));
    ctx.fillRect(x + size * 0.16, y + size * 0.18, Math.max(1, size * 0.1), size * 0.34);
    ctx.strokeStyle = 'rgba(86,45,0,0.72)';
    ctx.lineWidth = Math.max(0.6, size * 0.045);
    ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, w - 1, w - 1);
    ctx.restore();
}

/** 中秋专题目标块“月华碎片”：深青方形玉片内嵌一轮月亮。 */
function drawMidAutumnMoonShard(ctx, x, y, size) {
    const inset = size >= 8 ? 1 : 0.5;
    const w = Math.max(1, size - inset * 2);
    let grad = null;
    try {
        grad = ctx.createLinearGradient(x, y, x + size, y + size);
        grad.addColorStop(0, '#286b76');
        grad.addColorStop(.52, '#154550');
        grad.addColorStop(1, '#082831');
    } catch (e) { /* 单色回退 */ }
    ctx.save();
    ctx.shadowColor = 'rgba(255,230,130,.72)';
    ctx.shadowBlur = Math.max(3, size * .22);
    ctx.fillStyle = grad || '#154550';
    ctx.fillRect(x + inset, y + inset, w, w);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(126,225,220,.88)';
    ctx.lineWidth = Math.max(.7, size * .045);
    ctx.strokeRect(x + inset + .5, y + inset + .5, w - 1, w - 1);

    const cx = x + size * .5;
    const cy = y + size * .48;
    const r = size * .27;
    ctx.fillStyle = '#FFE991';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(166,119,40,.22)';
    ctx.beginPath(); ctx.arc(cx - r * .3, cy - r * .18, Math.max(.7, r * .16), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * .28, cy + r * .24, Math.max(.6, r * .12), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,225,.78)';
    ctx.beginPath(); ctx.arc(cx - r * .3, cy - r * .34, Math.max(.6, r * .12), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function _edgePoint(edge, bx, by, bw, t) {
    switch (edge) {
        case 0: return { x: bx + t * bw, y: by };
        case 1: return { x: bx + bw, y: by + t * bw };
        case 2: return { x: bx + t * bw, y: by + bw };
        default: return { x: bx, y: by + t * bw };
    }
}

function _strokeCrackPath(ctx, points, lw) {
    if (!points || points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
}

/** 凹槽感：先投影、再主色、再左上高光 */
function _drawCrackStroke(ctx, points, lw) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.translate(0.7, 0.9);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.lineWidth = lw + 0.8;
    ctx.globalAlpha = 0.55;
    _strokeCrackPath(ctx, points, lw + 0.8);
    ctx.restore();

    ctx.strokeStyle = 'rgba(24, 22, 28, 0.9)';
    ctx.lineWidth = lw;
    ctx.globalAlpha = 1;
    _strokeCrackPath(ctx, points, lw);

    if (lw >= 0.45) {
        ctx.save();
        ctx.translate(-0.45, -0.55);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = Math.max(0.35, lw * 0.32);
        ctx.globalAlpha = 0.85;
        _strokeCrackPath(ctx, points, Math.max(0.35, lw * 0.32));
        ctx.restore();
    }
}

function _drawCracks(ctx, x, y, size, inset, w, seed) {
    const bx = x + inset;
    const by = y + inset;
    const lw = size >= 10
        ? Math.max(0.65, size * 0.042)
        : Math.max(0.35, size * 0.09);

    const startEdge = Math.floor(_rand(seed, 1) * 4);
    const start = _edgePoint(startEdge, bx, by, w, 0.18 + _rand(seed, 3) * 0.64);
    const depth = w * (size >= 10
        ? (0.35 + _rand(seed, 4) * 0.37)
        : (0.28 + _rand(seed, 4) * 0.28));
    const inwardAngle = {
        0: Math.PI / 2 + (_rand(seed, 5) - 0.5) * 0.85,
        1: Math.PI + (_rand(seed, 5) - 0.5) * 0.85,
        2: -Math.PI / 2 + (_rand(seed, 5) - 0.5) * 0.85,
        3: (_rand(seed, 5) - 0.5) * 0.85,
    }[startEdge];
    const mid = {
        x: start.x + Math.cos(inwardAngle) * depth * 0.52,
        y: start.y + Math.sin(inwardAngle) * depth * 0.52,
    };
    const end = {
        x: start.x + Math.cos(inwardAngle) * depth,
        y: start.y + Math.sin(inwardAngle) * depth,
    };

    ctx.save();
    _drawCrackStroke(ctx, [start, mid, end], lw);

    if (size >= 14 && _rand(seed, 7) > 0.5) {
        const branchAngle = inwardAngle
            + (Math.PI / 2) * (_rand(seed, 8) > 0.5 ? 1 : -1)
            + (_rand(seed, 9) - 0.5) * 0.35;
        const branchLen = w * (0.1 + _rand(seed, 10) * 0.12);
        _drawCrackStroke(ctx, [mid, {
            x: mid.x + Math.cos(branchAngle) * branchLen,
            y: mid.y + Math.sin(branchAngle) * branchLen,
        }], lw * 0.68);
    }
    ctx.restore();
}

module.exports = {
    GARBAGE,
    GOLD_GARBAGE,
    GARBAGE_UI_COLOR,
    hashSeed,
    drawGarbageCell,
    drawMidAutumnGarbageCell,
    drawMidAutumnMoonShard,
    drawGoldGarbageCell,
    drawGarbageLayoutCell,
};
