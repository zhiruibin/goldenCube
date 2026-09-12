/**
 * 顶部 Tab 行布局：按主题卡片的真实 2:1 比例排布，保证可见边缘间距一致。
 */

function layoutTabRow(screenWidth, count, options) {
    const opts = options || {};
    const gap = Number(opts.gap) >= 0 ? Number(opts.gap) : 10;
    const side = Number(opts.side) >= 0 ? Number(opts.side) : 12;
    const aspect = Number(opts.aspect) > 0 ? Number(opts.aspect) : 2;
    const preferredHeight = Number(opts.height) > 0 ? Number(opts.height) : 40;
    const maxWidth = Number(opts.maxWidth) > 0 ? Number(opts.maxWidth) : Infinity;
    const safeCount = Math.max(1, Math.floor(Number(count) || 1));
    const availableWidth = Math.max(1, screenWidth - side * 2 - gap * (safeCount - 1));
    const width = Math.min(maxWidth, preferredHeight * aspect, availableWidth / safeCount);
    const height = width / aspect;
    const totalWidth = width * safeCount + gap * (safeCount - 1);

    return {
        gap,
        width,
        height,
        startX: (screenWidth - totalWidth) / 2,
        xAt(index) {
            return this.startX + index * (this.width + this.gap);
        },
    };
}

module.exports = { layoutTabRow };
