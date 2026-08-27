/**
 * tools/gc-test-stage-render.js
 * 渲染回归测试：参考 tetris-mini 首页样式
 *  - 背景必须满屏：首个 fillRect 为 (0, 0, W, H)
 *  - 大标题水平居中：drawBrandTitle 以 x=W/2 为中心、textAlign=center
 *  - 小标题水平居中
 *  - 金方块余额仍绘制（右上角）
 *
 * 运行：node tools/gc-test-stage-render.js
 */
'use strict';

// ---------------------------------------------------------------------------
// 环境桩（GameGlobal / wx / 记录型 ctx）
// ---------------------------------------------------------------------------

const W = 375;
const H = 667;

global.GameGlobal = {
    game: {
        width: W,
        height: H,
        systemInfo: {
            statusBarHeight: 20,
            safeArea: { top: 20, bottom: 647, left: 0, right: 375, width: 375, height: 627 },
        },
        sceneManager: {
            switchTo() {},
            replace() {},
        },
    },
};

global.wx = {
    getStorageSync() { return null; },
    setStorageSync() {},
    removeStorageSync() {},
};

const ops = [];
const props = { textAlign: '', fillStyle: '', globalAlpha: 1 };

const ctxStub = new Proxy({}, {
    get(target, key) {
        if (key in props) return props[key];
        if (key === 'measureText') return (t) => ({ width: String(t).length * 10, height: 10 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
            return () => ({ addColorStop() {} });
        }
        if (key === 'canvas') return null;
        if (typeof key === 'string') {
            return (...args) => {
                ops.push({ m: key, args, textAlign: props.textAlign, fillStyle: props.fillStyle });
            };
        }
        return undefined;
    },
    set(target, key, value) {
        props[key] = value;
        return true;
    },
});

let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) {
        passed++;
        console.log('  PASS', msg);
    } else {
        failed++;
        console.log('  FAIL', msg);
    }
}

// ---------------------------------------------------------------------------
// 关卡选择场景渲染断言
// ---------------------------------------------------------------------------

const StageSelectScene = require('../js/scenes/stage-select-scene');
const select = new StageSelectScene();
select.onEnter();
ops.length = 0;
select.render(ctxStub);

console.log('--- StageSelect render ---');

const bgFills = ops.filter((o) => o.m === 'fillRect');
assert(bgFills.length > 0, '存在 fillRect 背景绘制');
assert(bgFills[0].args[0] === 0 && bgFills[0].args[1] === 0
    && bgFills[0].args[2] === W && bgFills[0].args[3] === H,
    '背景首个 fillRect = (0, 0, ' + W + ', ' + H + ') 满屏');

const titleOps = ops.filter((o) => o.m === 'fillText' && o.args[0] === '挖个方块');
assert(titleOps.length > 0, '大标题「挖个方块」已绘制');
const title = titleOps[titleOps.length - 1];
assert(title.args[1] === W / 2, '大标题 x = W/2 水平居中 (got=' + title.args[1] + ')');
assert(title.textAlign === 'center', '大标题 textAlign=center (got=' + title.textAlign + ')');

const subOps = ops.filter((o) => o.m === 'fillText' && String(o.args[0]).indexOf('清掉垃圾') === 0);
assert(subOps.length > 0, '小标题已绘制');
assert(subOps[0].args[1] === W / 2, '小标题 x = W/2 水平居中 (got=' + subOps[0].args[1] + ')');

const balanceOps = ops.filter((o) => o.m === 'fillText' && String(o.args[0]).indexOf('◆') === 0);
assert(balanceOps.length > 0, '金方块余额「◆ N」已绘制');

// ---------------------------------------------------------------------------
// 结算场景渲染断言
// ---------------------------------------------------------------------------

const StageResultScene = require('../js/scenes/stage-result-scene');
const result = new StageResultScene();
result.onEnter({ stageId: 1, result: { lines: 4, pieces: 10, timeMs: 30000, reward: 1, first: true } });
ops.length = 0;
result.render(ctxStub);

console.log('--- StageResult render ---');

const resTitleOps = ops.filter((o) => o.m === 'fillText' && o.args[0] === '过关');
assert(resTitleOps.length > 0, '结算大标题「过关」已绘制');
const resTitle = resTitleOps[resTitleOps.length - 1];
assert(resTitle.args[1] === W / 2, '结算大标题 x = W/2 水平居中 (got=' + resTitle.args[1] + ')');
assert(resTitle.textAlign === 'center', '结算大标题 textAlign=center (got=' + resTitle.textAlign + ')');

const resBg = ops.filter((o) => o.m === 'fillRect');
assert(resBg.length > 0 && resBg[0].args[0] === 0 && resBg[0].args[1] === 0
    && resBg[0].args[2] === W && resBg[0].args[3] === H,
    '结算背景满屏 fillRect(0,0,W,H)');

// ---------------------------------------------------------------------------
console.log('\n==== RESULT ====');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
console.log('ALL TESTS PASSED');
