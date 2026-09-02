/**
 * 世界地图点主题块应进入该章关卡卡（stageSelect + chapterId）。
 * 运行：node tools/gc-test-world-map-tap.js
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
            back() {
                switched = { name: 'back' };
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

const WorldMapScene = require('../js/scenes/world-map-scene');
const fx = require('../js/render/world-map-fx');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL: ' + msg);
        process.exit(1);
    }
}

const scene = new WorldMapScene();
scene.onEnter();

assert(Array.isArray(scene._nodes) && scene._nodes.length >= 10, '应生成十章节点');
assert(scene._layout && scene._layout.cell > 0, '应完成棋盘布局');
assert(scene._originY >= 0, '镜头 originY 应有效');

switched = null;
scene.handleTap(0, 0);
assert(switched === null, '点击空白不应切场景');

const node = scene._nodes[0];
const hit = fx.cubeHitRect(scene._layout, node, scene._originY);
switched = null;
scene.handleTap(hit.x + hit.w / 2, hit.y + hit.h / 2);
assert(switched !== null, '点击第一章垃圾块应切场景');
assert(switched.name === 'stageSelect', '应进入 stageSelect, got=' + (switched && switched.name));
assert(switched.params && switched.params.chapterId === node.id, '应带上 chapterId');

switched = null;
scene.handleTap(hit.x + hit.w / 2, hit.y + 8);
assert(switched !== null && switched.params.chapterId === node.id, '点击主题名区域也应进入该章');

assert(scene._layout.boardBottom === scene._metrics.H, '棋盘底应贴齐屏幕底');
assert(scene._layout.bottomPad > 0, '底部应有垫行铺满返回按钮后方');
const range0 = fx.visibleRowRange(scene._layout, 0, scene._metrics.H);
assert(range0.visTop <= 0, '初始镜头底部格槽应可见, visTop=' + range0.visTop);

console.log('PASS: 世界地图点块进入 stageSelect(chapterId=' + node.id + ')');
