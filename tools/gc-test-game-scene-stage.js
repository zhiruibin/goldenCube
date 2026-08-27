/**
 * tools/gc-test-game-scene-stage.js
 * 回归测试：GameScene 集成层在 stage 模式下 onEnter 后
 *  - 棋盘应保留关卡垃圾布局（garbageCount 一致）
 *  - 引擎状态应为 playing（而不是第一个方块落地即 over）
 *
 * 背景：此前 onEnter 在 _initEngine() 内先 initStage() 灌入垃圾布局，
 * 末尾又调用 engine.init()——init() 会清空棋盘与 _garbageRemaining，
 * 导致所有关卡无垃圾、首块落地即触发 stageClear（游戏秒结束）。
 *
 * 运行：node tools/gc-test-game-scene-stage.js
 */
'use strict';

// ---------------------------------------------------------------------------
// 环境桩（wx / GameGlobal / canvas）
// ---------------------------------------------------------------------------
function makeCtxStub(canvas) {
    const gradientStub = { addColorStop() {} };
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key === 'canvas') return canvas;
            if (key === 'measureText') return () => ({ width: 0, height: 0 });
            if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
            if (key === 'createLinearGradient' || key === 'createRadialGradient') {
                return () => gradientStub;
            }
            if (typeof key === 'string') return () => {};
            return undefined;
        },
        set() { return true; },
    });
    return ctx;
}

function makeCanvasStub() {
    let canvas = null;
    canvas = {
        width: 375,
        height: 667,
        getContext() { return makeCtxStub(canvas); },
    };
    return canvas;
}

function makeAudioCtxStub() {
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key === 'currentTime') return 0;
            if (typeof key === 'string') return () => makeAudioCtxStub();
            return undefined;
        },
        set() { return true; },
    });
    return ctx;
}

const storage = {};

global.GameGlobal = {
    game: {
        width: 375,
        height: 667,
        systemInfo: {
            statusBarHeight: 20,
            safeArea: { top: 20, bottom: 647, left: 0, right: 375, width: 375, height: 627 },
        },
    },
    benchmarkLevel: 1,
};

global.wx = {
    getStorageSync(key) {
        return storage[key] !== undefined ? storage[key] : null;
    },
    setStorageSync(key, value) {
        storage[key] = value;
    },
    removeStorageSync(key) {
        delete storage[key];
    },
    getSystemInfoSync() {
        return {
            windowWidth: 375,
            windowHeight: 667,
            pixelRatio: 2,
            statusBarHeight: 20,
            safeArea: { top: 20, bottom: 647, left: 0, right: 375, width: 375, height: 627 },
        };
    },
    getMenuButtonBoundingClientRect() {
        return { top: 26, bottom: 58, left: 280, right: 365, width: 85, height: 32 };
    },
    createCanvas() {
        return makeCanvasStub();
    },
    createWebAudioContext() {
        return makeAudioCtxStub();
    },
    createInnerAudioContext() {
        return {
            src: '', volume: 1, loop: false, autoplay: false,
            play() {}, pause() {}, stop() {}, destroy() {},
            onPlay() {}, onError() {}, onEnded() {}, onStop() {},
            seek() {},
        };
    },
    createRewardedVideoAd() {
        return { load() { return Promise.resolve(); }, show() { return Promise.reject(new Error('no ad')); } };
    },
    vibrateShort() {},
    vibrateLong() {},
    onTouchStart() {},
    offTouchStart() {},
    onTouchMove() {},
    offTouchMove() {},
    onTouchEnd() {},
    offTouchEnd() {},
    onShow() {},
    onHide() {},
    setUserCloudStorage() {},
    getFriendCloudStorage() { return { KVDataList: [] }; },
};

// ---------------------------------------------------------------------------
// 断言工具
// ---------------------------------------------------------------------------

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
// 主测试
// ---------------------------------------------------------------------------

const GameScene = require('../js/scenes/game-scene');
const goldenBlock = require('../utils/golden-block-manager');
const { GARBAGE } = require('../utils/tetris-engine');

function runCase(stageId) {
    const stage = goldenBlock.getStage(stageId);
    if (!stage) {
        failed++;
        console.log('  FAIL stage ' + stageId + ': 关卡不存在');
        return;
    }
    const scene = new GameScene();
    scene.onEnter({ mode: 'stage', stageId });

    console.log('--- stage ' + stageId + ' (' + stage.name + ') ---');

    assert(scene._engine.getMode() === 'stage', '引擎模式为 stage');

    const remaining = scene._engine.getGarbageRemaining();
    assert(remaining === stage.garbageCount,
        '垃圾剩余数 = 关卡配置 (' + remaining + ' === ' + stage.garbageCount + ')');

    const garbageRows = scene._engine.getGarbageRows();
    assert(garbageRows === stage.minLines,
        '含垃圾行数 = minLines (' + garbageRows + ' === ' + stage.minLines + ')');

    // 棋盘可见区垃圾格计数与配置一致
    const board = scene._engine.getVisibleBoard();
    let garbageCells = 0;
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            if (board[r][c] === GARBAGE) garbageCells++;
        }
    }
    assert(garbageCells === stage.garbageCount,
        '可见棋盘垃圾格数 = 关卡配置 (' + garbageCells + ' === ' + stage.garbageCount + ')');

    // 状态应为 playing（start 已生成首个方块）
    assert(scene._engine.getState() === 'playing',
        '引擎状态为 playing (实际=' + scene._engine.getState() + ')');

    // 关键回归断言：首块落地不应立即结束
    const before = scene._engine.getState();
    scene._engine.hardDrop();
    const after = scene._engine.getState();
    assert(before === 'playing' && after === 'playing',
        '首块 hardDrop 后仍为 playing (before=' + before + ', after=' + after + ')');
    assert(scene._stageOverReason === null,
        '_stageOverReason 仍为 null（未误判 stageClear）');
}

console.log('GameScene 闯关模式集成回归测试');

// 用前 3 关（含 1 免费 + 2 需解锁）验证；解锁状态由桩存储控制，此处直接走 stage 数据
for (const id of [1, 2, 3]) {
    runCase(id);
}

console.log('\n==== RESULT ====');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
console.log('ALL TESTS PASSED');
