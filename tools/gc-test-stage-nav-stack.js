/**
 * 闯关导航栈：首页 → 世界地图 → 关选 → 游戏；结算回关选后返回一次到地图。
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
const { stagePlayStack, stageSelectStack } = require('../utils/stage-nav');

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
['home', 'worldMap', 'stageSelect', 'game', 'stageResult', 'stageFail'].forEach((n) => {
    sm.register(n, makeScene(n));
});

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

// 首页 → 世界地图 → 关选 → 游戏
sm.switchTo('home');
sm.switchTo('worldMap');
sm.switchTo('stageSelect', { chapterId: 1 });
sm.switchTo('game', { mode: 'stage', stageId: 47 });
assert(sm._stack.length === 3, 'game 栈应为 home+worldMap+stageSelect');
assert(
    sm._stack[0].name === 'home'
        && sm._stack[1].name === 'worldMap'
        && sm._stack[2].name === 'stageSelect',
    'game 栈顺序'
);

// 游戏结束 → 结算（leaveTo 保留 home+worldMap+stageSelect）
sm.leaveTo('stageResult', { stageId: 47, result: {} }, stagePlayStack());
assert(sm.currentName === 'stageResult', '当前应为 stageResult');
assert(sm._stack.length === 3, 'stageResult 栈应为 home+worldMap+stageSelect');
assert(sm._stack[1].name === 'worldMap', '结算栈应含 worldMap');

// 结算 → 返回关选（leaveTo 重置栈为 home+worldMap）
sm.leaveTo('stageSelect', { stageId: 47 }, stageSelectStack());
assert(sm.currentName === 'stageSelect', '当前应为 stageSelect');
assert(sm._stack.length === 2, '关选栈应为 home+worldMap');
assert(sm._stack[0].name === 'home' && sm._stack[1].name === 'worldMap', '关选返回目标为世界地图');
assert(sm.current._params.stageId === 47, '关选应收到 stageId');

// 返回一次 → 世界地图
sm.back();
assert(sm.currentName === 'worldMap', '返回一次应到 worldMap');

// 再返回 → 首页
sm.back();
assert(sm.currentName === 'home', '再返回应到 home');
assert(sm._stack.length === 0, '回首页后栈应为空');

console.log('PASS: 闯关导航栈 home→地图→关选→游戏→结算→关选→地图→home');
