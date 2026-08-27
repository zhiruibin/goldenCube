/**
 * tools/gc-test-stage-select-tap.js
 * 冒烟测试：关卡选择场景点击卡片应切到 game 场景（mode=stage, stageId）。
 * 桩掉 GameGlobal / wx，直接 require 场景模块并调用 handleTap。
 */
'use strict';

let switched = null;
global.GameGlobal = {
    game: {
        width: 375,
        height: 667,
        sceneManager: {
            switchTo(name, params) {
                switched = { name, params };
            },
        },
    },
};
global.wx = {
    getStorageSync() { return null; },
    setStorageSync() {},
};

const StageSelectScene = require('../js/scenes/stage-select-scene');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL: ' + msg);
        process.exit(1);
    }
}

const scene = new StageSelectScene();
scene.onEnter();

// 未点中任何卡片 → 不应切换
switched = null;
scene.handleTap(0, 0);
assert(switched === null, '点击空白区域不应切换场景');

// 点第一张卡片中心 → 应切到 game/stage/1
const card = scene._cards[0];
switched = null;
scene.handleTap(card.x + card.w / 2, card.y + card.h / 2);
assert(switched !== null, '点击卡片应触发切换');
assert(switched.name === 'game', '应切换到 game 场景, got=' + (switched && switched.name));
assert(switched.params && switched.params.mode === 'stage', 'mode 应为 stage');
assert(switched.params && switched.params.stageId === card.stage.id, 'stageId 应为卡片关卡 id');

console.log('PASS: handleTap 点击卡片切换到 game(stage, id=' + card.stage.id + ')');
