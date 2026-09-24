/**
 * 结算插屏：延迟后才展示；取消后不再调用；加载完成前离开也不展示。
 * node tools/gc-test-settlement-interstitial.js
 */
const { scheduleSettlementInterstitial } = require('../utils/settlement-interstitial');

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    let calls = 0;
    const cancelled = scheduleSettlementInterstitial({
        delayMs: 30,
        show() { calls += 1; return Promise.resolve(false); },
    });
    cancelled.cancel();
    await wait(60);
    assert(calls === 0, 'cancel before delay skips the ad');

    let seen = null;
    const job = scheduleSettlementInterstitial({
        delayMs: 20,
        show(options) {
            seen = options;
            return Promise.resolve(true);
        },
    });
    await wait(50);
    assert(seen && seen.shouldShow() === true, 'show receives a live gate');
    job.cancel();
    assert(seen.shouldShow() === false, 'cancel after show still closes the gate');

    let late = 0;
    scheduleSettlementInterstitial({
        delayMs: 15,
        show(options) {
            return wait(30).then(() => {
                if (options.shouldShow()) late += 1;
            });
        },
    }).cancel();
    await wait(20);
    const pending = scheduleSettlementInterstitial({
        delayMs: 10,
        show(options) {
            const handle = { options: options };
            setTimeout(() => {
                if (handle.options.shouldShow()) late += 1;
            }, 25);
            return Promise.resolve(false);
        },
    });
    await wait(15);
    pending.cancel();
    await wait(40);
    assert(late === 0, 'leaving during load does not count as a show');

    console.log('PASS: settlement interstitial');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
