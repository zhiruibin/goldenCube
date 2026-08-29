/**
 * tools/gc-test-stage-result-tap.js
 * 冒烟测试：结算场景 handleTap 应触发对应按钮回调（下一关/重玩/返回）。
 * 桩掉 GameGlobal / wx，require 场景模块直接调用 handleTap。
 */
'use strict';

let replaced = null;
global.GameGlobal = {
    game: {
        width: 375,
        height: 667,
        sceneManager: {
            switchTo(name, params) { replaced = { name, params }; },
            replace(name, params) { replaced = { name, params }; },
            leaveTo(name, params, stackNames) {
                replaced = { name, params, stackNames };
            },
        },
    },
};
global.wx = {
    getStorageSync() { return null; },
    setStorageSync() {},
};

const StageResultScene = require('../js/scenes/stage-result-scene');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL: ' + msg);
        process.exit(1);
    }
}

const scene = new StageResultScene();
scene.onEnter({ stageId: 1, result: { lines: 4, pieces: 6, timeMs: 30000, reward: 1, first: true } });

// 按钮顺序：下一关 2 / 重玩本关 / 返回关卡选择
assert(scene._buttons.length === 3, '应有 3 个按钮');

// 点「下一关」→ replace game(stage, 2)
replaced = null;
const next = scene._buttons[0];
scene.handleTap(next.x + next.w / 2, next.y + next.h / 2);
assert(replaced !== null, '点击下一关应触发切换');
assert(replaced.name === 'game', '应切换到 game 场景');
assert(replaced.params.mode === 'stage' && replaced.params.stageId === 2, 'stageId 应为 2');

// 点空白 → 不触发
replaced = null;
scene.handleTap(0, 0);
assert(replaced === null, '点击空白不应触发切换');

// 点「返回关卡选择」→ leaveTo stageSelect（栈仅 home，并带上 stageId）
replaced = null;
const back = scene._buttons[2];
scene.handleTap(back.x + back.w / 2, back.y + back.h / 2);
assert(replaced !== null && replaced.name === 'stageSelect', '返回按钮应切到 stageSelect');
assert(replaced.params && replaced.params.stageId === 1, '应带上本关 stageId');
assert(Array.isArray(replaced.stackNames) && replaced.stackNames.join() === 'home', '返回栈应仅保留 home');

console.log('PASS: stage-result handleTap 下一关=2 / 空白忽略 / 返回=stageSelect');
