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
scene.onEnter({
    stageId: 1,
    skipReveal: true,
    result: { lines: 4, pieces: 6, timeMs: 30000, reward: 1, first: true },
});

// 按钮顺序：下一关 2 / 重玩本关 / ← 返回关卡选择
assert(scene._buttons.length === 3, '应有 3 个按钮');

replaced = null;
scene.handleTap(0, 0);
assert(replaced === null, '点击空白不应触发切换');

replaced = null;
const back = scene._buttons[2];
scene.handleTap(back.x + back.w / 2, back.y + back.h / 2);
assert(replaced !== null && replaced.name === 'stageSelect', '返回按钮应切到 stageSelect');
assert(replaced.params && replaced.params.stageId === 1, '应带上本关 stageId');
assert(Array.isArray(replaced.stackNames) && replaced.stackNames.join() === 'home,worldMap', '返回栈应保留 home+worldMap');

replaced = null;
const next = scene._buttons[0];
scene.handleTap(next.x + next.w / 2, next.y + next.h / 2);
assert(replaced === null, '点下一关未解锁不应立刻进游戏');
assert(scene._entryDialog && scene._entryDialog.locked, '第 2 关未解锁应弹出确认窗');
assert(scene._entryDialog.needGold === 1, '应告知用金方块解锁');

scene._entryDialog.payRect = { x: 0, y: 0, w: 400, h: 800 };
scene.handleTap(next.x + next.w / 2, next.y + next.h / 2);
assert(scene._entryDialog, '开窗同一记抬手不应触发确认');
assert(replaced === null, '开窗同一记抬手不应进游戏');

scene.handleTouchStart();
scene._entryDialog.panelRect = { x: 40, y: 200, w: 280, h: 180 };
scene.handleTap(10, 10);
assert(!scene._entryDialog, '点蒙层应关闭弹窗');

console.log('PASS: stage-result handleTap 空白忽略 / 返回=stageSelect / 下一关确认窗');
