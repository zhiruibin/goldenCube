/**
 * icon-renderer.js
 * 统一矢量图标绘制库。
 *
 * 所有 UI 图标均使用 canvas 路径原语（moveTo/lineTo/arc/bezierCurveTo/
 * quadraticCurveTo/rect）绘制，不依赖任何 PNG/图片资源，从而在不同
 * 机型、不同分辨率下渲染结果 100% 一致。
 *
 * 用法：
 *   const IconRenderer = require('../../render/icon-renderer');
 *   IconRenderer.draw(ctx, 'gear', x, y, size, '#FFFFFF');
 *
 * 每个图标以 (x, y) 为中心、size 为外接正方形边长绘制。
 */

const TAU = Math.PI * 2;

function gear(ctx, x, y, size) {
    const R = size * 0.5;
    const r0 = R * 0.74;
    const teeth = 8;
    const step = TAU / teeth;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
        const a0 = i * step;
        const b0 = a0 + step * 0.2;
        const b1 = a0 + step * 0.8;
        ctx.lineTo(x + Math.cos(b0) * r0, y + Math.sin(b0) * r0);
        ctx.lineTo(x + Math.cos(b0) * R, y + Math.sin(b0) * R);
        ctx.lineTo(x + Math.cos(b1) * R, y + Math.sin(b1) * R);
        ctx.lineTo(x + Math.cos(b1) * r0, y + Math.sin(b1) * r0);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, R * 0.3, 0, TAU);
    ctx.stroke();
}

function rotate(ctx, x, y, size) {
    const r = size * 0.36;
    const a0 = -Math.PI / 3;
    const a1 = (Math.PI * 7) / 6;
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1, false);
    ctx.stroke();
    const tx = x + Math.cos(a1) * r;
    const ty = y + Math.sin(a1) * r;
    const dir = a1 + Math.PI / 2;
    const len = size * 0.24;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(dir + 0.45) * len, ty + Math.sin(dir + 0.45) * len);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(dir - 0.45) * len, ty + Math.sin(dir - 0.45) * len);
    ctx.stroke();
}

function hardDrop(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.3);
    ctx.lineTo(x, y + size * 0.16);
    ctx.moveTo(x - size * 0.18, y + size * 0.02);
    ctx.lineTo(x, y + size * 0.22);
    ctx.lineTo(x + size * 0.18, y + size * 0.02);
    ctx.moveTo(x - size * 0.32, y + size * 0.36);
    ctx.lineTo(x + size * 0.32, y + size * 0.36);
    ctx.stroke();
}

function pause(ctx, x, y, size) {
    ctx.fillRect(x - size * 0.3, y - size * 0.34, size * 0.18, size * 0.68);
    ctx.fillRect(x + size * 0.12, y - size * 0.34, size * 0.18, size * 0.68);
}

function play(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.2, y - size * 0.32);
    ctx.lineTo(x - size * 0.2, y + size * 0.32);
    ctx.lineTo(x + size * 0.34, y);
    ctx.closePath();
    ctx.fill();
}

function back(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y - size * 0.28);
    ctx.lineTo(x - size * 0.18, y);
    ctx.lineTo(x + size * 0.2, y + size * 0.28);
    ctx.stroke();
}

function coin(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.38, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.24, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - size * 0.1, y - size * 0.12, size * 0.06, Math.PI * 0.8, Math.PI * 2.1);
    ctx.stroke();
}

function sound(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.36, y - size * 0.12);
    ctx.lineTo(x - size * 0.14, y - size * 0.12);
    ctx.lineTo(x + size * 0.1, y - size * 0.3);
    ctx.lineTo(x + size * 0.1, y + size * 0.3);
    ctx.lineTo(x - size * 0.14, y + size * 0.12);
    ctx.lineTo(x - size * 0.36, y + size * 0.12);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.16, y, size * 0.16, -Math.PI / 2.6, Math.PI / 2.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.28, y, size * 0.3, -Math.PI / 2.6, Math.PI / 2.6);
    ctx.stroke();
}

function vibrate(ctx, x, y, size) {
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.2, y - size * 0.36, size * 0.4, size * 0.72);
    ctx.moveTo(x - size * 0.14, y + size * 0.04);
    ctx.quadraticCurveTo(x, y - size * 0.08, x + size * 0.14, y + size * 0.04);
    ctx.moveTo(x - size * 0.14, y + size * 0.2);
    ctx.quadraticCurveTo(x, y + size * 0.08, x + size * 0.14, y + size * 0.2);
    ctx.stroke();
}

function close(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.28, y - size * 0.28);
    ctx.lineTo(x + size * 0.28, y + size * 0.28);
    ctx.moveTo(x + size * 0.28, y - size * 0.28);
    ctx.lineTo(x - size * 0.28, y + size * 0.28);
    ctx.stroke();
}

function check(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.34, y + size * 0.04);
    ctx.lineTo(x - size * 0.08, y + size * 0.28);
    ctx.lineTo(x + size * 0.36, y - size * 0.28);
    ctx.stroke();
}

function star(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? size * 0.48 : size * 0.22;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.closePath();
    ctx.fill();
}

function trophy(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.28, y - size * 0.34);
    ctx.lineTo(x - size * 0.22, y + size * 0.08);
    ctx.quadraticCurveTo(x, y + size * 0.24, x + size * 0.22, y + size * 0.08);
    ctx.lineTo(x + size * 0.28, y - size * 0.34);
    ctx.moveTo(x - size * 0.38, y - size * 0.34);
    ctx.lineTo(x + size * 0.38, y - size * 0.34);
    ctx.moveTo(x - size * 0.26, y - size * 0.2);
    ctx.quadraticCurveTo(x - size * 0.44, y, x - size * 0.24, y + size * 0.12);
    ctx.moveTo(x + size * 0.26, y - size * 0.2);
    ctx.quadraticCurveTo(x + size * 0.44, y, x + size * 0.24, y + size * 0.12);
    ctx.moveTo(x - size * 0.16, y + size * 0.2);
    ctx.lineTo(x + size * 0.16, y + size * 0.2);
    ctx.moveTo(x - size * 0.26, y + size * 0.34);
    ctx.lineTo(x + size * 0.26, y + size * 0.34);
    ctx.stroke();
}

function lock(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y - size * 0.1, size * 0.18, Math.PI, 0, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.24, y - size * 0.06, size * 0.48, size * 0.38);
    ctx.beginPath();
    ctx.arc(x, y + size * 0.08, size * 0.06, 0, TAU);
    ctx.moveTo(x, y + size * 0.14);
    ctx.lineTo(x, y + size * 0.22);
    ctx.stroke();
}

function refresh(ctx, x, y, size) {
    const r = size * 0.3;
    const a0 = Math.PI * 0.12;
    const a1 = Math.PI * 1.62;
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1, false);
    ctx.stroke();
    const tx = x + Math.cos(a1) * r;
    const ty = y + Math.sin(a1) * r;
    const dir = a1 + Math.PI / 2;
    const len = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(dir + 0.5) * len, ty + Math.sin(dir + 0.5) * len);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(dir - 0.5) * len, ty + Math.sin(dir - 0.5) * len);
    ctx.stroke();
}

function question(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y - size * 0.1, size * 0.18, Math.PI * 1.05, Math.PI * 2.05, false);
    ctx.quadraticCurveTo(x + size * 0.22, y + size * 0.06, x + size * 0.02, y + size * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + size * 0.28, size * 0.045, 0, TAU);
    ctx.fill();
}

function cart(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.36, y - size * 0.28);
    ctx.lineTo(x - size * 0.2, y + size * 0.1);
    ctx.lineTo(x + size * 0.32, y + size * 0.1);
    ctx.lineTo(x + size * 0.42, y - size * 0.28);
    ctx.lineTo(x - size * 0.36, y - size * 0.28);
    ctx.moveTo(x - size * 0.36, y - size * 0.28);
    ctx.quadraticCurveTo(x - size * 0.28, y - size * 0.44, x - size * 0.12, y - size * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - size * 0.18, y + size * 0.28, size * 0.08, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.28, y + size * 0.28, size * 0.08, 0, TAU);
    ctx.stroke();
}

function heart(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.38);
    ctx.bezierCurveTo(x - size * 0.54, y + size * 0.08, x - size * 0.34, y - size * 0.42, x, y - size * 0.12);
    ctx.bezierCurveTo(x + size * 0.34, y - size * 0.42, x + size * 0.54, y + size * 0.08, x, y + size * 0.38);
    ctx.closePath();
    ctx.fill();
}

function info(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - size * 0.08, size * 0.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.04, y + size * 0.04, size * 0.08, size * 0.24);
}

function arrowUp(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.24, y + size * 0.16);
    ctx.lineTo(x, y - size * 0.24);
    ctx.lineTo(x + size * 0.24, y + size * 0.16);
    ctx.stroke();
}

function arrowDown(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.24, y - size * 0.16);
    ctx.lineTo(x, y + size * 0.24);
    ctx.lineTo(x + size * 0.24, y - size * 0.16);
    ctx.stroke();
}

function arrowLeft(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.16, y - size * 0.24);
    ctx.lineTo(x - size * 0.24, y);
    ctx.lineTo(x + size * 0.16, y + size * 0.24);
    ctx.stroke();
}

function arrowRight(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.16, y - size * 0.24);
    ctx.lineTo(x + size * 0.24, y);
    ctx.lineTo(x - size * 0.16, y + size * 0.24);
    ctx.stroke();
}
function sparkle(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? size * 0.5 : size * 0.16;
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.closePath();
    ctx.stroke();
}

function fireworks(ctx, x, y, size) {
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = size * (0.32 + (i % 2) * 0.14);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * size * 0.05, y + Math.sin(a) * size * 0.05);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.5);
    ctx.lineTo(x, y + size * 0.16);
    ctx.stroke();
}

function target(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.24, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.08, 0, TAU);
    ctx.fill();
}

function gamepad(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.42, y - size * 0.18);
    ctx.quadraticCurveTo(x - size * 0.42, y - size * 0.34, x - size * 0.22, y - size * 0.34);
    ctx.lineTo(x + size * 0.22, y - size * 0.34);
    ctx.quadraticCurveTo(x + size * 0.42, y - size * 0.34, x + size * 0.42, y - size * 0.18);
    ctx.quadraticCurveTo(x + size * 0.42, y + size * 0.2, x + size * 0.3, y + size * 0.24);
    ctx.quadraticCurveTo(x + size * 0.2, y + size * 0.34, x + size * 0.1, y + size * 0.34);
    ctx.quadraticCurveTo(x, y + size * 0.2, x - size * 0.1, y + size * 0.34);
    ctx.quadraticCurveTo(x - size * 0.2, y + size * 0.34, x - size * 0.3, y + size * 0.24);
    ctx.quadraticCurveTo(x - size * 0.42, y + size * 0.2, x - size * 0.42, y - size * 0.18);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.08, y - size * 0.24);
    ctx.lineTo(x + size * 0.08, y - size * 0.24);
    ctx.lineTo(x + size * 0.08, y - size * 0.08);
    ctx.lineTo(x + size * 0.24, y - size * 0.08);
    ctx.lineTo(x + size * 0.24, y + size * 0.08);
    ctx.lineTo(x + size * 0.08, y + size * 0.08);
    ctx.lineTo(x + size * 0.08, y + size * 0.24);
    ctx.lineTo(x - size * 0.08, y + size * 0.24);
    ctx.lineTo(x - size * 0.08, y + size * 0.08);
    ctx.lineTo(x - size * 0.24, y + size * 0.08);
    ctx.lineTo(x - size * 0.24, y - size * 0.08);
    ctx.lineTo(x - size * 0.08, y - size * 0.08);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.28, y - size * 0.16, size * 0.06, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.4, y - size * 0.02, size * 0.06, 0, TAU);
    ctx.stroke();
}

function brick(ctx, x, y, size) {
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.34, y - size * 0.26, size * 0.68, size * 0.52);
    ctx.moveTo(x - size * 0.34, y);
    ctx.lineTo(x + size * 0.34, y);
    ctx.moveTo(x - size * 0.16, y - size * 0.26);
    ctx.lineTo(x - size * 0.16, y);
    ctx.moveTo(x + size * 0.12, y);
    ctx.lineTo(x + size * 0.12, y + size * 0.26);
    ctx.stroke();
}

function clock(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * 0.22);
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 0.16, y + size * 0.1);
    ctx.stroke();
}

function fire(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.44);
    ctx.bezierCurveTo(x + size * 0.28, y - size * 0.12, x + size * 0.3, y + size * 0.12, x + size * 0.1, y + size * 0.36);
    ctx.bezierCurveTo(x + size * 0.22, y + size * 0.2, x + size * 0.14, y + size * 0.02, x, y - size * 0.1);
    ctx.bezierCurveTo(x - size * 0.18, y + size * 0.04, x - size * 0.26, y + size * 0.2, x - size * 0.12, y + size * 0.36);
    ctx.bezierCurveTo(x - size * 0.34, y + size * 0.12, x - size * 0.3, y - size * 0.12, x, y - size * 0.44);
    ctx.closePath();
    ctx.fill();
}

function diamond(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.38);
    ctx.lineTo(x + size * 0.34, y - size * 0.16);
    ctx.lineTo(x + size * 0.2, y + size * 0.3);
    ctx.lineTo(x, y + size * 0.42);
    ctx.lineTo(x - size * 0.2, y + size * 0.3);
    ctx.lineTo(x - size * 0.34, y - size * 0.16);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.38);
    ctx.lineTo(x, y + size * 0.42);
    ctx.moveTo(x - size * 0.34, y - size * 0.16);
    ctx.lineTo(x + size * 0.34, y - size * 0.16);
    ctx.stroke();
}

function crown(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.36, y + size * 0.18);
    ctx.lineTo(x - size * 0.36, y - size * 0.26);
    ctx.lineTo(x - size * 0.16, y - size * 0.08);
    ctx.lineTo(x, y - size * 0.32);
    ctx.lineTo(x + size * 0.16, y - size * 0.08);
    ctx.lineTo(x + size * 0.36, y - size * 0.26);
    ctx.lineTo(x + size * 0.36, y + size * 0.18);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.28, y + size * 0.32);
    ctx.lineTo(x + size * 0.28, y + size * 0.32);
    ctx.stroke();
}

function bomb(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x - size * 0.04, y + size * 0.04, size * 0.32, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.14, y - size * 0.2);
    ctx.quadraticCurveTo(x + size * 0.3, y - size * 0.42, x + size * 0.14, y - size * 0.46);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - size * 0.14, y - size * 0.06, size * 0.07, 0, TAU);
    ctx.fill();
}

function tornado(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.42);
    ctx.quadraticCurveTo(x + size * 0.3, y - size * 0.26, x + size * 0.1, y - size * 0.08);
    ctx.quadraticCurveTo(x - size * 0.22, y + size * 0.06, x + size * 0.12, y + size * 0.2);
    ctx.quadraticCurveTo(x + size * 0.34, y + size * 0.3, x, y + size * 0.42);
    ctx.stroke();
}

function bolt(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.14, y - size * 0.42);
    ctx.lineTo(x - size * 0.2, y + size * 0.04);
    ctx.lineTo(x - size * 0.02, y + size * 0.04);
    ctx.lineTo(x - size * 0.14, y + size * 0.42);
    ctx.lineTo(x + size * 0.2, y - size * 0.04);
    ctx.lineTo(x + size * 0.02, y - size * 0.04);
    ctx.closePath();
    ctx.fill();
}

function link(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.1, y - size * 0.3);
    ctx.lineTo(x - size * 0.3, y - size * 0.1);
    ctx.quadraticCurveTo(x - size * 0.42, y + size * 0.02, x - size * 0.3, y + size * 0.1);
    ctx.lineTo(x - size * 0.1, y + size * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.1, y - size * 0.3);
    ctx.lineTo(x + size * 0.3, y - size * 0.1);
    ctx.quadraticCurveTo(x + size * 0.42, y + size * 0.02, x + size * 0.3, y + size * 0.1);
    ctx.lineTo(x + size * 0.1, y + size * 0.3);
    ctx.stroke();
}

function rainbow(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y + size * 0.2, size * 0.5, Math.PI, 0, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + size * 0.2, size * 0.34, Math.PI, 0, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + size * 0.2, size * 0.18, Math.PI, 0, false);
    ctx.stroke();
}

function rocket(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.44);
    ctx.lineTo(x + size * 0.14, y - size * 0.1);
    ctx.lineTo(x + size * 0.14, y + size * 0.12);
    ctx.lineTo(x - size * 0.14, y + size * 0.12);
    ctx.lineTo(x - size * 0.14, y - size * 0.1);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - size * 0.12, size * 0.06, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.14, y + size * 0.02);
    ctx.lineTo(x - size * 0.3, y + size * 0.16);
    ctx.lineTo(x - size * 0.14, y + size * 0.12);
    ctx.moveTo(x + size * 0.14, y + size * 0.02);
    ctx.lineTo(x + size * 0.3, y + size * 0.16);
    ctx.lineTo(x + size * 0.14, y + size * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.08, y + size * 0.12);
    ctx.lineTo(x, y + size * 0.4);
    ctx.lineTo(x + size * 0.08, y + size * 0.12);
    ctx.stroke();
}

function construction(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.3, y + size * 0.4);
    ctx.lineTo(x - size * 0.3, y - size * 0.2);
    ctx.lineTo(x + size * 0.2, y - size * 0.2);
    ctx.moveTo(x - size * 0.3, y - size * 0.2);
    ctx.lineTo(x - size * 0.3, y - size * 0.34);
    ctx.lineTo(x + size * 0.4, y - size * 0.34);
    ctx.lineTo(x + size * 0.4, y - size * 0.26);
    ctx.moveTo(x + size * 0.4, y - size * 0.3);
    ctx.lineTo(x + size * 0.08, y + size * 0.02);
    ctx.lineTo(x + size * 0.08, y + size * 0.4);
    ctx.stroke();
}

function shield(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.3, y - size * 0.34);
    ctx.lineTo(x - size * 0.3, y + size * 0.02);
    ctx.quadraticCurveTo(x - size * 0.3, y + size * 0.3, x, y + size * 0.4);
    ctx.quadraticCurveTo(x + size * 0.3, y + size * 0.3, x + size * 0.3, y + size * 0.02);
    ctx.lineTo(x + size * 0.3, y - size * 0.34);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, y + size * 0.02);
    ctx.lineTo(x - size * 0.02, y + size * 0.14);
    ctx.lineTo(x + size * 0.14, y - size * 0.1);
    ctx.stroke();
}

function dice(ctx, x, y, size) {
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.32, y - size * 0.32, size * 0.64, size * 0.64);
    const d = size * 0.14;
    ctx.beginPath();
    ctx.arc(x - d, y - d, size * 0.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + d, y - d, size * 0.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, size * 0.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - d, y + d, size * 0.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + d, y + d, size * 0.05, 0, TAU);
    ctx.fill();
}

function medal(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.22, y - size * 0.38);
    ctx.lineTo(x - size * 0.3, y + size * 0.12);
    ctx.quadraticCurveTo(x, y + size * 0.04, x + size * 0.3, y + size * 0.12);
    ctx.lineTo(x + size * 0.22, y - size * 0.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + size * 0.1, size * 0.3, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + size * 0.1, size * 0.12, 0, TAU);
    ctx.stroke();
}

function hundred(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.font = 'bold ' + Math.round(size * 0.36) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('100', x, y + size * 0.02);
    ctx.restore();
}

function gift(ctx, x, y, size) {
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.34, y - size * 0.1, size * 0.68, size * 0.36);
    ctx.moveTo(x, y - size * 0.34);
    ctx.lineTo(x, y + size * 0.26);
    ctx.moveTo(x - size * 0.34, y - size * 0.34);
    ctx.lineTo(x + size * 0.34, y - size * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.34);
    ctx.lineTo(x - size * 0.16, y - size * 0.46);
    ctx.lineTo(x - size * 0.14, y - size * 0.28);
    ctx.closePath();
    ctx.moveTo(x, y - size * 0.34);
    ctx.lineTo(x + size * 0.16, y - size * 0.46);
    ctx.lineTo(x + size * 0.14, y - size * 0.28);
    ctx.closePath();
    ctx.fill();
}

function crystal(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y - size * 0.02, size * 0.32, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.18, y + size * 0.32);
    ctx.lineTo(x + size * 0.18, y + size * 0.32);
    ctx.moveTo(x - size * 0.1, y + size * 0.24);
    ctx.lineTo(x + size * 0.1, y + size * 0.24);
    ctx.moveTo(x - size * 0.14, y + size * 0.32);
    ctx.lineTo(x - size * 0.1, y + size * 0.24);
    ctx.moveTo(x + size * 0.14, y + size * 0.32);
    ctx.lineTo(x + size * 0.1, y + size * 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.22);
    ctx.lineTo(x, y - size * 0.42);
    ctx.moveTo(x - size * 0.08, y - size * 0.3);
    ctx.lineTo(x + size * 0.08, y - size * 0.34);
    ctx.moveTo(x + size * 0.08, y - size * 0.3);
    ctx.lineTo(x - size * 0.08, y - size * 0.34);
    ctx.stroke();
}

function puzzle(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.3, y - size * 0.3);
    ctx.lineTo(x - size * 0.1, y - size * 0.3);
    ctx.arc(x - size * 0.05, y - size * 0.3, size * 0.12, Math.PI, 0, false);
    ctx.lineTo(x + size * 0.3, y - size * 0.3);
    ctx.lineTo(x + size * 0.3, y + size * 0.3);
    ctx.lineTo(x - size * 0.3, y + size * 0.3);
    ctx.closePath();
    ctx.stroke();
}

function bank(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.4, y - size * 0.1);
    ctx.lineTo(x, y - size * 0.4);
    ctx.lineTo(x + size * 0.4, y - size * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.34, y - size * 0.1, size * 0.68, size * 0.4);
    ctx.moveTo(x - size * 0.2, y - size * 0.1);
    ctx.lineTo(x - size * 0.2, y + size * 0.14);
    ctx.moveTo(x, y - size * 0.1);
    ctx.lineTo(x, y + size * 0.14);
    ctx.moveTo(x + size * 0.2, y - size * 0.1);
    ctx.lineTo(x + size * 0.2, y + size * 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.4, y + size * 0.3);
    ctx.lineTo(x + size * 0.4, y + size * 0.3);
    ctx.stroke();
}

function share(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.18);
    ctx.lineTo(x, y - size * 0.3);
    ctx.moveTo(x - size * 0.14, y - size * 0.16);
    ctx.lineTo(x, y - size * 0.3);
    ctx.lineTo(x + size * 0.14, y - size * 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.3, y + size * 0.34);
    ctx.lineTo(x + size * 0.3, y + size * 0.34);
    ctx.stroke();
}

function megaphone(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.3, y - size * 0.08);
    ctx.lineTo(x - size * 0.3, y + size * 0.22);
    ctx.lineTo(x + size * 0.06, y + size * 0.22);
    ctx.lineTo(x + size * 0.3, y + size * 0.38);
    ctx.lineTo(x + size * 0.3, y - size * 0.24);
    ctx.lineTo(x + size * 0.06, y - size * 0.08);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - size * 0.24, y - size * 0.02, size * 0.14, -Math.PI / 2.4, Math.PI / 2.4);
    ctx.stroke();
}

function chart(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.4, y - size * 0.36);
    ctx.lineTo(x - size * 0.4, y + size * 0.4);
    ctx.lineTo(x + size * 0.4, y + size * 0.4);
    ctx.stroke();
    ctx.fillRect(x - size * 0.3, y + size * 0.1, size * 0.14, size * 0.3);
    ctx.fillRect(x - size * 0.08, y - size * 0.04, size * 0.14, size * 0.44);
    ctx.fillRect(x + size * 0.14, y - size * 0.2, size * 0.14, size * 0.6);
}

function handshake(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x - size * 0.12, y, size * 0.18, Math.PI * 0.9, Math.PI * 2.1, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.12, y, size * 0.18, Math.PI * 0.9, Math.PI * 2.1, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.34, y + size * 0.16);
    ctx.lineTo(x - size * 0.18, y + size * 0.1);
    ctx.moveTo(x + size * 0.34, y + size * 0.16);
    ctx.lineTo(x + size * 0.18, y + size * 0.1);
    ctx.stroke();
}

function users(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x - size * 0.12, y - size * 0.2, size * 0.1, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.14, y - size * 0.16, size * 0.08, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - size * 0.12, y + size * 0.08, size * 0.2, Math.PI, 0, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.14, y + size * 0.12, size * 0.16, Math.PI, 0, false);
    ctx.stroke();
}

const ICONS = {
    gear: gear,
    rotate: rotate,
    hardDrop: hardDrop,
    pause: pause,
    play: play,
    back: back,
    coin: coin,
    sound: sound,
    vibrate: vibrate,
    close: close,
    check: check,
    star: star,
    trophy: trophy,
    lock: lock,
    refresh: refresh,
    question: question,
    cart: cart,
    heart: heart,
    info: info,
    arrowUp: arrowUp,
    arrowDown: arrowDown,
    arrowLeft: arrowLeft,
    arrowRight: arrowRight,
    sparkle: sparkle,
    fireworks: fireworks,
    target: target,
    gamepad: gamepad,
    brick: brick,
    clock: clock,
    fire: fire,
    diamond: diamond,
    crown: crown,
    bomb: bomb,
    tornado: tornado,
    bolt: bolt,
    link: link,
    rainbow: rainbow,
    rocket: rocket,
    construction: construction,
    shield: shield,
    dice: dice,
    medal: medal,
    hundred: hundred,
    gift: gift,
    crystal: crystal,
    puzzle: puzzle,
    bank: bank,
    share: share,
    megaphone: megaphone,
    chart: chart,
    handshake: handshake,
    users: users,
    runner: runner,
    warning: warning,
    home: home,
    tv: tv,
};

function runner(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y - size * 0.3, size * 0.12, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.18);
    ctx.lineTo(x, y + size * 0.06);
    ctx.moveTo(x, y - size * 0.06);
    ctx.lineTo(x - size * 0.22, y + size * 0.16);
    ctx.moveTo(x, y + size * 0.06);
    ctx.lineTo(x - size * 0.18, y + size * 0.34);
    ctx.moveTo(x, y - size * 0.06);
    ctx.lineTo(x + size * 0.2, y + size * 0.12);
    ctx.moveTo(x + size * 0.2, y + size * 0.12);
    ctx.lineTo(x + size * 0.16, y + size * 0.34);
    ctx.stroke();
}

function warning(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.42);
    ctx.lineTo(x + size * 0.4, y + size * 0.36);
    ctx.lineTo(x - size * 0.4, y + size * 0.36);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.fillRect(x - size * 0.035, y - size * 0.2, size * 0.07, size * 0.3);
    ctx.beginPath();
    ctx.arc(x, y + size * 0.2, size * 0.05, 0, TAU);
    ctx.fill();
}

function home(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.4, y + size * 0.1);
    ctx.lineTo(x, y - size * 0.36);
    ctx.lineTo(x + size * 0.4, y + size * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.24, y + size * 0.02, size * 0.48, size * 0.34);
    ctx.beginPath();
    ctx.moveTo(x - size * 0.1, y + size * 0.36);
    ctx.lineTo(x - size * 0.1, y + size * 0.14);
    ctx.lineTo(x + size * 0.1, y + size * 0.14);
    ctx.lineTo(x + size * 0.1, y + size * 0.36);
    ctx.stroke();
}

function tv(ctx, x, y, size) {
    ctx.beginPath();
    ctx.strokeRect(x - size * 0.36, y - size * 0.22, size * 0.72, size * 0.5);
    ctx.moveTo(x - size * 0.16, y + size * 0.28);
    ctx.lineTo(x - size * 0.24, y + size * 0.42);
    ctx.moveTo(x + size * 0.16, y + size * 0.28);
    ctx.lineTo(x + size * 0.24, y + size * 0.42);
    ctx.moveTo(x - size * 0.28, y + size * 0.28);
    ctx.lineTo(x + size * 0.28, y + size * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.12, y + size * 0.04);
    ctx.lineTo(x + size * 0.24, y + size * 0.04);
    ctx.lineTo(x + size * 0.24, y - size * 0.12);
    ctx.lineTo(x + size * 0.12, y - size * 0.12);
    ctx.closePath();
    ctx.stroke();
}

const IconRenderer = {
    draw(ctx, name, x, y, size, color) {
        const fn = ICONS[name];
        if (!fn || !ctx || !ctx.save) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = color || '#FFFFFF';
        ctx.fillStyle = color || '#FFFFFF';
        ctx.lineWidth = Math.max(1, Math.round(size * 0.08));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        fn(ctx, x, y, size);
        ctx.restore();
    },
    has(name) {
        return Object.prototype.hasOwnProperty.call(ICONS, name);
    },
    list() {
        return Object.keys(ICONS);
    },
};

module.exports = IconRenderer;
