/**
 * 结算页插屏：成绩先露出来，约 1 秒后再尝试展示。
 * 这 1 秒内点了按钮，或加载完成前已经离开，就取消本次展示。
 * 频率仍由 ad-manager 控制：两次至少间隔 120 秒。未配置广告位时静默跳过。
 */

const { adManager } = require('./ad-manager');

const DELAY_MS = 1000;

function scheduleSettlementInterstitial(options) {
    const opts = options || {};
    const delay = typeof opts.delayMs === 'number' ? opts.delayMs : DELAY_MS;
    const show = typeof opts.show === 'function'
        ? opts.show
        : (gate) => adManager.showInterstitial(gate);

    let timer = null;
    let cancelled = false;
    const shouldShow = () => cancelled !== true;

    timer = setTimeout(() => {
        timer = null;
        if (!shouldShow()) return;
        try {
            const pending = show({ shouldShow: shouldShow });
            if (pending && typeof pending.catch === 'function') pending.catch(() => {});
        } catch (e) { /* 插屏失败不影响结算 */ }
    }, delay);
    if (timer && typeof timer.unref === 'function') timer.unref();

    return {
        cancel() {
            cancelled = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        },
    };
}

module.exports = {
    DELAY_MS,
    scheduleSettlementInterstitial,
};
