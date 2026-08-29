/**
 * 等轴测正方体 — 2D 六边形构造
 *
 * 立体感：前面三面半透明，背面三条棱透出（汇于远端顶点）。
 * depth 略大于 2*hh，避免等轴测顶点重合导致背棱塌成面对角线。
 *
 * variant:
 *   cube      — 半透明三面 + 透出背棱
 *   halfFrame — 下半实心 + 上半线框
 */

function drawIsoFace(ctx, pts, fill, stroke) {
    if (!pts || pts.length < 3) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }
}

function drawWireEdges(ctx, edges, stroke, lineWidth, dashed) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth || 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dashed && typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([5, 4]);
    }
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        ctx.beginPath();
        ctx.moveTo(e[0].x, e[0].y);
        ctx.lineTo(e[1].x, e[1].y);
        ctx.stroke();
    }
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
    ctx.restore();
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {'cube'|'halfFrame'} variant
 */
function buildIsoBlockFaces(cx, cy, size, variant) {
    const hw = size * 0.46;
    // 2*hh < depth，远端底顶点 bot.T 与顶面底尖 B 分离，背棱才能透出来
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

    const top = [top0.T, top0.R, top0.B, top0.L];
    const left = [top0.L, top0.B, bot.B, bot.L];
    const right = [top0.R, top0.B, bot.B, bot.R];
    // 真实底面（远端尖 = bot.T）
    const bottom = [bot.T, bot.R, bot.B, bot.L];

    // 背面三条棱：汇于远端顶点 bot.T
    const backEdges = [
        [top0.T, bot.T], // 远侧竖棱
        [bot.T, bot.L],  // 底面远-左
        [bot.T, bot.R],  // 底面远-右
    ];

    // 外轮廓 + 可见分缝（不透、压在最上）
    const frontEdges = [
        [top0.T, top0.R], [top0.R, top0.B], [top0.B, top0.L], [top0.L, top0.T],
        [top0.L, bot.L], [top0.R, bot.R], [top0.B, bot.B],
        [bot.L, bot.B], [bot.B, bot.R],
    ];

    const shadow = {
        cx: cx,
        cy: bot.B.y + size * 0.05,
        rx: hw * 0.95,
        ry: hh * 0.95,
    };

    const badgeAnchor = {
        x: top0.R.x - 4,
        y: top0.T.y - size * 0.04,
    };

    if (variant !== 'halfFrame') {
        return {
            variant: 'cube',
            top,
            left,
            right,
            bottom,
            backEdges,
            frontEdges,
            shadow,
            badgeAnchor,
            topCenter: { x: cx, y: midY },
        };
    }

    const mid = depth * 0.5;
    const midS = slice(mid);

    return {
        variant: 'halfFrame',
        bottomLeft: [midS.L, midS.B, bot.B, bot.L],
        bottomRight: [midS.R, midS.B, bot.B, bot.R],
        bottomCut: [midS.T, midS.R, midS.B, midS.L],
        bottom,
        backEdges,
        shadow,
        top,
        left,
        right,
        wireEdges: [
            [top0.T, top0.R], [top0.R, top0.B], [top0.B, top0.L], [top0.L, top0.T],
            [top0.T, midS.T],
            [top0.L, midS.L],
            [top0.R, midS.R],
            [top0.B, midS.B],
            [midS.T, midS.R], [midS.R, midS.B], [midS.B, midS.L], [midS.L, midS.T],
            // 下半也带一点背棱提示
            [midS.T, bot.T],
            [bot.T, bot.L],
            [bot.T, bot.R],
        ],
        badgeAnchor,
        topCenter: { x: cx, y: midY },
    };
}

/**
 * colors: {
 *   left, right, top, bottom?,
 *   leftStroke?, rightStroke?, topStroke?, bottomStroke?,
 *   backEdge?, backEdgeWidth?, frontEdge?, frontEdgeWidth?,
 *   cut?, cutStroke?, wireStroke?, wireWidth?,
 *   shadow?, shadowAlpha?
 * }
 */
function drawSolidIsoBlock(ctx, geo, colors) {
    if (geo.shadow && colors.shadow !== false) {
        const sh = geo.shadow;
        ctx.save();
        ctx.globalAlpha = typeof colors.shadowAlpha === 'number' ? colors.shadowAlpha : 0.32;
        ctx.fillStyle = colors.shadow || 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        if (typeof ctx.ellipse === 'function') {
            ctx.ellipse(sh.cx, sh.cy, sh.rx, sh.ry, 0, 0, Math.PI * 2);
        } else {
            ctx.translate(sh.cx, sh.cy);
            ctx.scale(1, sh.ry / Math.max(0.001, sh.rx));
            ctx.arc(0, 0, sh.rx, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
    }

    if (geo.variant === 'halfFrame') {
        if (geo.bottom) {
            drawIsoFace(
                ctx,
                geo.bottom,
                colors.bottom || 'rgba(40, 44, 55, 0.55)',
                colors.bottomStroke || 'rgba(90, 96, 110, 0.35)'
            );
        }
        drawIsoFace(ctx, geo.bottomLeft, colors.left, colors.leftStroke);
        drawIsoFace(ctx, geo.bottomRight, colors.right || colors.front, colors.rightStroke || colors.frontStroke);
        drawIsoFace(ctx, geo.bottomCut, colors.cut || colors.top, colors.cutStroke || colors.topStroke);
        if (colors.wireStroke && geo.wireEdges) {
            drawWireEdges(ctx, geo.wireEdges, colors.wireStroke, colors.wireWidth || 1.8, false);
        }
        return;
    }

    // —— 完整方块：底面 → 背棱 → 半透明三面 → 外轮廓 ——
    if (geo.bottom) {
        drawIsoFace(
            ctx,
            geo.bottom,
            colors.bottom || 'rgba(48, 52, 64, 0.35)',
            colors.bottomStroke || 'rgba(120, 128, 145, 0.25)'
        );
    }

    // 背面三条棱（先画，再被半透明面盖住一层，形成「透出」）
    if (geo.backEdges) {
        drawWireEdges(
            ctx,
            geo.backEdges,
            colors.backEdge || 'rgba(210, 218, 230, 0.55)',
            colors.backEdgeWidth || 1.5,
            true
        );
    }

    drawIsoFace(ctx, geo.left, colors.left, colors.leftStroke);
    drawIsoFace(ctx, geo.right, colors.right || colors.front, colors.rightStroke || colors.frontStroke);
    drawIsoFace(ctx, geo.top, colors.top, colors.topStroke);

    // 背棱再描一道更淡的，确保透过前面仍能看见
    if (geo.backEdges) {
        drawWireEdges(
            ctx,
            geo.backEdges,
            colors.backEdge || 'rgba(210, 218, 230, 0.7)',
            colors.backEdgeWidth || 1.35,
            true
        );
    }

    // 正面轮廓实线，保证外形清晰
    if (geo.frontEdges) {
        drawWireEdges(
            ctx,
            geo.frontEdges,
            colors.frontEdge || 'rgba(230, 235, 245, 0.55)',
            colors.frontEdgeWidth || 1.25,
            false
        );
    }
}

module.exports = {
    buildIsoBlockFaces,
    drawIsoFace,
    drawWireEdges,
    drawSolidIsoBlock,
};
