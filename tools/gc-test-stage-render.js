/**
 * tools/gc-test-stage-render.js
 * 渲染回归：关选章节标题 / 结算「过关」/ 满屏背景
 *
 * 运行：node tools/gc-test-stage-render.js
 */
'use strict';

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
    getMenuButtonBoundingClientRect() {
        return { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
    },
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

const chapterTitleOps = ops.filter((o) => o.m === 'fillText'
    && String(o.args[0]).indexOf('第') === 0
    && String(o.args[0]).indexOf('章') >= 0
    && o.args[1] === 16);
assert(chapterTitleOps.length > 0, '章节大标题已绘制（左对齐）');
const title = chapterTitleOps[chapterTitleOps.length - 1];
assert(title.args[1] === 16, '章节标题 x = contentLeft (got=' + title.args[1] + ')');
assert(title.textAlign === 'left', '章节标题 textAlign=left (got=' + title.textAlign + ')');

const balanceOps = ops.filter((o) => o.m === 'fillText' && String(o.args[0]).indexOf('◆') === 0);
assert(balanceOps.length > 0, '金方块余额已绘制');
assert(balanceOps[0].args[1] === 16, '余额左对齐于 contentLeft (got x=' + balanceOps[0].args[1] + ')');
assert(balanceOps[0].textAlign === 'left', '余额 textAlign=left');
// 测试桩胶囊 top=48 bottom=80 → 垂直中心 64
assert(balanceOps[0].args[2] === 64, '余额与胶囊垂直居中对齐 (got y=' + balanceOps[0].args[2] + ')');
assert(title.args[2] > balanceOps[0].args[2], '章节标题在货币条下方');

// ---------------------------------------------------------------------------
const StageResultScene = require('../js/scenes/stage-result-scene');
const result = new StageResultScene();
result.onEnter({
    stageId: 1,
    result: {
        lines: 4,
        pieces: 10,
        timeMs: 30000,
        reward: 1,
        first: true,
        minLines: 3,
    },
});
// 结算页先播放金块升起动画；渲染断言直接切到完整信息态。
result._finishReveal(true);
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

const firstMedals = result._getResultMedals();
assert(firstMedals.length === 1 && firstMedals[0].kind === 'first', '首通使用首通章印');
result._result = { first: false, isNewBest: true };
assert(result._getResultMedals()[0].kind === 'record', '非首通破纪录使用新纪录章印');
result._result = { first: false, isNewBest: false };
assert(result._getResultMedals()[0].kind === 'clear', '普通重复通关使用通关章印');
assert(result._getOutcomeCaption() === '教学完成，继续挑战下一关吧',
    '教学关重复通关显示继续挑战说明');
result._stage = { id: 2, kind: 'silhouette' };
assert(result._getOutcomeCaption() === '顺利通关，最佳纪录保持不变',
    '普通关通关未破纪录显示结果说明');
result._result = { assisted: true, chapterReward: 1, milestoneReward: 10 };
const assistedMedals = result._getResultMedals();
assert(assistedMedals.map((item) => item.kind).join(',') === 'assisted,chapter,all',
    '辅助、章节完成、全通章印可以并列展示');

const StageFailScene = require('../js/scenes/stage-fail-scene');
const failedResult = new StageFailScene();
failedResult.onEnter({
    stageId: 1,
    result: { lines: 1, minLines: 3, pieces: 8, timeMs: 18000, reason: 'topOut' },
});
ops.length = 0;
failedResult.render(ctxStub);
assert(ops.some((o) => o.m === 'fillText' && o.args[0] === '未通关'),
    '失败结算英雄位绘制未通关章印');
assert(ops.some((o) => o.m === 'fillText' && o.args[0] === '距离目标还差 2 行，再试一次！'),
    '失败结算显示距离目标的动态说明');

console.log('\n==== RESULT ====');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
console.log('ALL TESTS PASSED');
