/**
 * coin-hud - 顶部金币显示（HUD）工具
 * 提供两种布局：
 *  - drawCoinHud：右上角绘制（图标 + 数字整体右对齐、垂直居中，自动避让微信胶囊按钮）
 *  - drawCoinHudCentered：水平居中绘制（用于 Title 下方单独一行，避免与居中标题抢横向空间）
 * 数量超过阈值时自动压缩：>= 100万 显示为 x.x万，>= 1亿 显示为 x.x亿。
 */

const IconRenderer = require('../js/render/icon-renderer');

/** 计算右侧需要避让胶囊按钮的安全边距（px）；取不到胶囊位置时使用默认值 */
function _getCapsuleInset(W) {
    let inset = 90; // 降级默认值：右侧预留 90px
    try {
        const rect = wx.getMenuButtonBoundingClientRect();
        if (rect && rect.left > 0 && rect.left < W) {
            // 胶囊按钮左边缘到屏幕右边缘的距离，再留 8px 间距
            inset = Math.max(inset, W - rect.left + 8);
        }
    } catch (e) {
        // 非微信环境或不支持时使用默认值
    }
    return inset;
}

/** 去掉小数部分多余的 .0 */
function _trimZero(s) {
    return s.replace(/\.0$/, '');
}

/** 大数压缩：>= 1亿 → x.x亿；>= 100万 → x.x万；否则原样返回 */
function formatCoins(n) {
    const v = n || 0;
    if (v >= 1e8) {
        return _trimZero((v / 1e8).toFixed(1)) + '亿';
    }
    if (v >= 1e6) {
        return _trimZero((v / 1e4).toFixed(1)) + '万';
    }
    return String(v);
}

/**
 * 在右上角绘制金币 HUD（右对齐避让胶囊按钮）
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {number} W 画布宽度
 * @param {number} y 垂直中心坐标
 * @param {number} coins 金币数量
 * @param {number} iconSize 金币图标尺寸（默认 18）
 */
function drawCoinHud(ctx, W, y, coins, iconSize) {
    const size = iconSize || 18;
    const gap = 4; // 图标与数字间距
    const text = formatCoins(coins);

    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const textW = ctx.measureText(text).width;
    const rightX = W - _getCapsuleInset(W);

    // 图标紧贴数字左侧，与数字垂直中心一致
    IconRenderer.draw(ctx, 'coin', rightX - textW - gap - size / 2, y, size, '#ffd700');
    ctx.fillStyle = '#ffd700';
    ctx.fillText(text, rightX, y);
}

/**
 * 在指定垂直位置水平居中绘制金币 HUD（Title 下方单独一行）
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {number} W 画布宽度
 * @param {number} y 垂直中心坐标
 * @param {number} coins 金币数量
 * @param {number} iconSize 金币图标尺寸（默认 18）
 */
function drawCoinHudCentered(ctx, W, y, coins, iconSize) {
    const size = iconSize || 18;
    const gap = 4; // 图标与数字间距
    const text = formatCoins(coins);

    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'middle';

    const textW = ctx.measureText(text).width;
    const totalW = size + gap + textW;
    const startX = W / 2 - totalW / 2;

    IconRenderer.draw(ctx, 'coin', startX + size / 2, y, size, '#ffd700');
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'left';
    ctx.fillText(text, startX + size + gap, y);
}

module.exports = { drawCoinHud, drawCoinHudCentered, formatCoins };
