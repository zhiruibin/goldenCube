/**
 * tools/gc-test-stage-select-tap.js
 * 冒烟测试：关卡选择场景点击卡片应切到 game 场景（mode=stage, stageId）。
 * 第 1 关免费入场，应直接进入，不弹入场费对话框。
 */
'use strict';

let switched = null;
global.GameGlobal = {
    game: {
        width: 375,
        height: 667,
        systemInfo: {
            statusBarHeight: 20,
            safeArea: { top: 20, bottom: 647, left: 0, right: 375, width: 375, height: 627 },
        },
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
    getMenuButtonBoundingClientRect() {
        return { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
    },
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

assert(Array.isArray(scene._chapterCards) && scene._chapterCards[0] && scene._chapterCards[0].length > 0,
    '应构建第一章关卡卡片');

// 未点中任何卡片 → 不应切换
switched = null;
scene.handleTap(0, 0);
assert(switched === null, '点击空白区域不应切换场景');

// 点第一张卡片中心 → 应切到 game/stage/1（免费关）
const card = scene._chapterCards[0][0];
switched = null;
scene.handleTap(card.x + card.w / 2, card.y + card.h / 2);
assert(switched !== null, '点击卡片应触发切换');
assert(switched.name === 'game', '应切换到 game 场景, got=' + (switched && switched.name));
assert(switched.params && switched.params.mode === 'stage', 'mode 应为 stage');
assert(switched.params && switched.params.stageId === card.stage.id, 'stageId 应为卡片关卡 id');
assert(scene._entryDialog === null, '第 1 关免费，不应弹出入场对话框');

console.log('PASS: handleTap 点击卡片切换到 game(stage, id=' + card.stage.id + ')');
