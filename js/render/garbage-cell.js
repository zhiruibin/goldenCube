/**
 * 垃圾方块绘制：灰色块体 + 确定性裂纹，与玩家方块皮肤解耦
 */

const { GARBAGE } = require('../../utils/tetris-engine');

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
    GARBAGE_UI_COLOR,
    hashSeed,
    drawGarbageCell,
    drawGarbageLayoutCell,
};
