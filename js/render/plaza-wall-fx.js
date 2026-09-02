/**
 * 关卡广场镶嵌墙：按当前 Tab 排序套固定拼墙模板，卡片含盘面剪影与三行信息。
 * 滑动帧只做 fillRect / fillText / 一张描边；禁止每格 roundRect、渐变、clip、读 storage。
 */
const { roundRectPath } = require('./board-tiles');

const GOLD = '#FFC857';
const CYAN = '#00c6ff';
const REF_W = 358;
const BAND_GAP = 10;
const PATTERN = [
    { x: 0, y: 0, w: 232, h: 252 },
    { x: 240, y: 0, w: 118, h: 122 },
    { x: 240, y: 130, w: 118, h: 122 },
    { x: 0, y: 260, w: 175, h: 192 },
    { x: 183, y: 260, w: 175, h: 192 },
    { x: 0, y: 460, w: 118, h: 184 },
    { x: 126, y: 460, w: 116, h: 184 },
    { x: 250, y: 460, w: 108, h: 184 },
];
const BAND_H = 644;

const META_PAD = 8;
const META_GAP = 8;
const META_LINE1 = 13;
const META_LINE2 = 12;
const META_LINE3 = 12;
const META_FOOTER_H = META_PAD + META_LINE1 + META_GAP + META_LINE2 + META_GAP + META_LINE3 + META_PAD;

function metaFooterH() {
    return META_FOOTER_H;
}

function plazaCardState(unlocked, cleared) {
    if (cleared) return 'cleared';
    if (unlocked) return 'unlocked';
    return 'locked';
}

function layoutWall(items, opts) {
    const pad = opts.pad;
    const listTop = opts.listTop;
    const scrollY = opts.scrollY || 0;
    const width = opts.width;
    const innerW = Math.max(1, width - pad * 2);
    const scale = innerW / REF_W;
    const boxes = [];
    let contentH = 0;
    const list = items || [];
    for (let i = 0; i < list.length; i++) {
        const band = Math.floor(i / PATTERN.length);
        const slot = PATTERN[i % PATTERN.length];
        const localY = band * (BAND_H * scale + BAND_GAP) + slot.y * scale;
        const w = slot.w * scale;
        const h = slot.h * scale;
        contentH = Math.max(contentH, localY + h);
        boxes.push({
            stage: list[i],
            x: pad + slot.x * scale,
            localY,
            y: listTop + localY - scrollY,
            w,
            h,
        });
    }
    return { boxes, contentH: contentH + 16, scale };
}

function applyScroll(boxes, listTop, scrollY) {
    if (!boxes) return;
    const top = listTop || 0;
    const sy = scrollY || 0;
    for (let i = 0; i < boxes.length; i++) {
        boxes[i].y = top + boxes[i].localY - sy;
    }
}

function visRowRange(rows) {
    const r = rows || {};
    let t = 20;
    let b = -1;
    for (let y = 0; y < 20; y++) {
        const line = r[String(y)] || '';
        for (let x = 0; x < 10; x++) {
            if (line[x] === '#') {
                if (y < t) t = y;
                if (y > b) b = y;
            }
        }
    }
    if (b < 0) return { t: 10, b: 19, vis: 10 };
    t = Math.max(0, t - 1);
    b = Math.min(19, b + 1);
    return { t, b, vis: b - t + 1 };
}

function silPalette(state) {
    if (state === 'cleared') return { a: '#c9a227', b: '#7a5a12' };
    if (state === 'unlocked') return { a: '#4ec8e8', b: '#1a6a82' };
    return { a: '#6a6a74', b: '#3a3a42' };
}

function ensureSil(stage) {
    if (!stage) return { vis: 10, occ: [] };
    if (stage._sil) return stage._sil;
    const rows = stage.rows || {};
    const range = visRowRange(rows);
    const occ = [];
    for (let i = 0; i < range.vis; i++) {
        const line = rows[String(range.t + i)] || '';
        for (let c = 0; c < 10; c++) {
            if (line[c] === '#') occ.push((i << 4) | c);
        }
    }
    stage._sil = { vis: range.vis, occ };
    return stage._sil;
}

function truncateText(ctx, text, maxW, font) {
    const raw = String(text || '');
    if (!raw) return '';
    if (font) ctx.font = font;
    if (ctx.measureText(raw).width <= maxW) return raw;
    let s = raw;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) {
        s = s.slice(0, -1);
    }
    return s + '…';
}

function ensureMeta(ctx, box, state) {
    const w = Math.round(box.w);
    const key = state + '|' + w;
    if (box._metaKey === key && box._meta) return box._meta;
    const s = box.stage || {};
    const pad = META_PAD;
    const maxW = Math.max(0, box.w - pad * 2);
    const narrow = box.w < 130;
    const titleFont = narrow ? 'bold 12px sans-serif' : 'bold 13px sans-serif';
    const subFont = narrow ? '10px sans-serif' : '11px sans-serif';
    const titleColor = state === 'cleared' ? GOLD
        : state === 'unlocked' ? CYAN
        : 'rgba(255,236,210,0.72)';
    const meta = {
        t1: truncateText(ctx, (s.title || '未命名') + '·' + authorOf(s), maxW, titleFont),
        t2: truncateText(ctx, (s.garbageCount || 0) + '个垃圾块·' + (s.minLines || 0) + '行', maxW, subFont),
        t3: truncateText(ctx, '通关人数' + clearCountOf(s) + '人', maxW, subFont),
        titleFont,
        subFont,
        titleColor,
    };
    box._metaKey = key;
    box._meta = meta;
    return meta;
}

function drawSilhouette(ctx, stage, x, y, w, h, state) {
    ctx.fillStyle = '#0c101c';
    ctx.fillRect(x, y, w, h);
    const sil = ensureSil(stage);
    const vis = sil.vis || 10;
    const cs = Math.min(w / 10, h / vis);
    if (cs < 1) return;
    const ox = x + (w - cs * 10) / 2;
    const oy = y + (h - cs * vis) / 2;
    const pal = silPalette(state);
    ctx.fillStyle = '#141b2c';
    ctx.fillRect(ox, oy, cs * 10, cs * vis);
    ctx.fillStyle = '#1a2236';
    for (let i = 0; i < vis; i++) {
        const py = oy + i * cs;
        const start = i & 1;
        for (let c = start; c < 10; c += 2) {
            ctx.fillRect(ox + c * cs, py, cs, cs);
        }
    }
    const occ = sil.occ || [];
    for (let n = 0; n < occ.length; n++) {
        const packed = occ[n];
        const i = packed >> 4;
        const c = packed & 15;
        const px = ox + c * cs;
        const py = oy + i * cs;
        ctx.fillStyle = pal.a;
        ctx.fillRect(px, py, cs, cs);
        if (cs >= 8) {
            ctx.fillStyle = pal.b;
            ctx.fillRect(px, py + cs * 0.65, cs, cs * 0.35);
        }
    }
    if (state === 'locked') {
        ctx.fillStyle = 'rgba(8,10,18,0.42)';
        ctx.fillRect(x, y, w, h);
    }
}

function authorOf(stage) {
    if (stage && stage.authorName) return String(stage.authorName);
    if (stage && stage.source === 'official') return '官方';
    return '玩家';
}

function clearCountOf(stage) {
    return (stage && stage.stats && stage.stats.clearCount) || 0;
}

function drawCardMeta(ctx, box, state) {
    const fh = META_FOOTER_H;
    const fy = box.y + box.h - fh;
    const pad = META_PAD;
    const meta = ensureMeta(ctx, box, state);

    ctx.fillStyle = 'rgba(8,10,18,0.86)';
    ctx.fillRect(box.x, fy, box.w, fh);

    const y1 = fy + pad;
    const y2 = y1 + META_LINE1 + META_GAP;
    const y3 = y2 + META_LINE2 + META_GAP;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = meta.titleFont;
    ctx.fillStyle = meta.titleColor;
    ctx.fillText(meta.t1, box.x + pad, y1);
    ctx.font = meta.subFont;
    ctx.fillStyle = 'rgba(255,236,210,0.55)';
    ctx.fillText(meta.t2, box.x + pad, y2);
    ctx.fillStyle = 'rgba(255,236,210,0.42)';
    ctx.fillText(meta.t3, box.x + pad, y3);
}

function drawCard(ctx, box, state) {
    const r = 8;
    ctx.fillStyle = '#0c101c';
    roundRectPath(ctx, box.x, box.y, box.w, box.h, r);
    ctx.fill();

    drawSilhouette(ctx, box.stage, box.x, box.y, box.w, box.h - META_FOOTER_H, state);
    drawCardMeta(ctx, box, state);

    ctx.strokeStyle = state === 'cleared' ? GOLD
        : state === 'unlocked' ? CYAN
        : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = state === 'cleared' ? 2.4 : state === 'unlocked' ? 2 : 1;
    roundRectPath(ctx, box.x + 1, box.y + 1, box.w - 2, box.h - 2, r);
    ctx.stroke();
}

module.exports = {
    GOLD,
    CYAN,
    PATTERN,
    BAND_H,
    layoutWall,
    applyScroll,
    metaFooterH,
    plazaCardState,
    drawCard,
    truncateText,
    authorOf,
    clearCountOf,
};
