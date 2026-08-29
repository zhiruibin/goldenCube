/**
 * 结算页方块插画：加载 /assets/images/block-*.png
 * PNG 只负责主体；光晕用 canvas 径向渐变绘制，避免位图光晕锯齿。
 */

const BLOCK_PATHS = {
    fail: 'assets/images/block-fail.png',
    record: 'assets/images/block-record.png',
    clear: 'assets/images/block-clear.png',
};

const GLOW = {
    fail: { color: 'rgba(180, 200, 230, 0.55)', outer: 'rgba(120, 150, 190, 0)', scale: 1.15 },
    record: { color: 'rgba(255, 210, 80, 0.65)', outer: 'rgba(255, 160, 0, 0)', scale: 1.28 },
    clear: { color: 'rgba(240, 190, 70, 0.4)', outer: 'rgba(200, 140, 40, 0)', scale: 1.12 },
};

const _cache = {
    fail: null,
    record: null,
    clear: null,
};

function _loadOne(key) {
    if (_cache[key]) return _cache[key];
    if (typeof wx === 'undefined' || typeof wx.createImage !== 'function') {
        _cache[key] = { img: null, ready: false, failed: true };
        return _cache[key];
    }
    const entry = { img: null, ready: false, failed: false };
    const img = wx.createImage();
    img.onload = () => {
        entry.ready = true;
    };
    img.onerror = () => {
        entry.failed = true;
        entry.ready = false;
    };
    img.src = BLOCK_PATHS[key];
    entry.img = img;
    _cache[key] = entry;
    return entry;
}

function preloadResultBlockImages() {
    _loadOne('fail');
    _loadOne('record');
    _loadOne('clear');
}

function getResultBlockImage(kind) {
    return _loadOne(kind);
}

function _drawSoftGlow(ctx, cx, cy, radius, kind, animTime) {
    const cfg = GLOW[kind] || GLOW.fail;
    const t = animTime || 0;
    const breathe = 0.92 + Math.sin(t * 2.4) * 0.08;
    const R = radius * cfg.scale * breathe;
    const gy = cy + radius * 0.06;

    ctx.save();
    const g = ctx.createRadialGradient(cx, gy, radius * 0.12, cx, gy, R);
    g.addColorStop(0, cfg.color);
    g.addColorStop(
        0.55,
        kind === 'record'
            ? 'rgba(255, 190, 60, 0.22)'
            : (kind === 'clear' ? 'rgba(230, 180, 60, 0.16)' : 'rgba(160, 185, 220, 0.18)')
    );
    g.addColorStop(1, cfg.outer);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, gy, R, 0, Math.PI * 2);
    ctx.fill();

    // 落地软影
    ctx.globalAlpha = kind === 'record' ? 0.28 : 0.22;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    const rx = radius * 0.55;
    const ry = radius * 0.16;
    const sy = cy + radius * 0.42;
    if (typeof ctx.ellipse === 'function') {
        ctx.ellipse(cx, sy, rx, ry, 0, 0, Math.PI * 2);
    } else {
        ctx.translate(cx, sy);
        ctx.scale(1, ry / Math.max(0.001, rx));
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
}

/**
 * @returns {boolean} 是否已成功绘制图片
 */
function drawResultBlockImage(ctx, kind, cx, cy, size, animTime) {
    const entry = _loadOne(kind);
    if (!entry || !entry.ready || !entry.img) return false;

    const t = animTime || 0;
    const pulse = kind === 'record'
        ? 0.96 + Math.sin(t * 3.0) * 0.04
        : 0.98 + Math.sin(t * 2.2) * 0.02;
    const drawSize = size * pulse;

    _drawSoftGlow(ctx, cx, cy, drawSize * 0.5, kind, t);

    const x = cx - drawSize / 2;
    const y = cy - drawSize / 2;
    try {
        ctx.drawImage(entry.img, x, y, drawSize, drawSize);
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = {
    BLOCK_PATHS,
    preloadResultBlockImages,
    getResultBlockImage,
    drawResultBlockImage,
};
