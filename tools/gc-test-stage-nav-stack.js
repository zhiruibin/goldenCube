/**
 * 闯关导航栈：结算/失败回关选不应叠两层 stageSelect，返回一次应回首页。
 * 运行：node tools/gc-test-stage-nav-stack.js
 */
'use strict';

global.wx = {
    _s: {},
    getStorageSync(k) { return this._s[k]; },
    setStorageSync(k, v) { this._s[k] = v; },
    getMenuButtonBoundingClientRect() {
        return { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
    },
};

global.GameGlobal = {
    game: {
        width: 375,
        height: 667,
        systemInfo: {
            statusBarHeight: 20,
            safeArea: { top: 20, bottom: 647, left: 0, right: 375, width: 375, height: 627 },
        },
        audioManager: null,
    },
};

const { SceneManager } = require('../js/runtime/scene-manager');

function makeScene(name) {
    return class {
        constructor() {
            this._params = null;
            this.enterCount = 0;
            this.exitCount = 0;
            this.sceneName = name;
        }
        onEnter(params) {
            this._params = params || null;
            this.enterCount++;
        }
        onExit() {
            this.exitCount++;
        }
    };
}

const sm = new SceneManager();
['home', 'stageSelect', 'game', 'stageResult', 'stageFail'].forEach((n) => {
    sm.register(n, makeScene(n));
});

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

// 首页 → 关选 → 游戏
sm.switchTo('home');
sm.switchTo('stageSelect');
sm.switchTo('game', { mode: 'stage', stageId: 47 });
assert(sm._stack.length === 2, 'game 栈应为 home+stageSelect');
assert(sm._stack[0].name === 'home' && sm._stack[1].name === 'stageSelect', 'game 栈顺序');

// 游戏结束 → 结算（leaveTo 保留 home+stageSelect）
sm.leaveTo('stageResult', { stageId: 47, result: {} }, ['home', 'stageSelect']);
assert(sm.currentName === 'stageResult', '当前应为 stageResult');
assert(sm._stack.length === 2, 'stageResult 栈应为 home+stageSelect');

// 结算 → 返回关选（leaveTo 重置栈为仅 home，并带 stageId）
sm.leaveTo('stageSelect', { stageId: 47 }, ['home']);
assert(sm.currentName === 'stageSelect', '当前应为 stageSelect');
assert(sm._stack.length === 1 && sm._stack[0].name === 'home', '关选栈应仅 home');
assert(sm.current._params.stageId === 47, '关选应收到 stageId');

// 返回一次 → 首页
sm.back();
assert(sm.currentName === 'home', '返回一次应到 home');
assert(sm._stack.length === 0, '回首页后栈应为空');

console.log('PASS: 闯关导航栈 home→关选→游戏→结算→关选→home');
