/** 图鉴性能回归：进入后渲染、切 Tab、拖动期间不得读取同步存储。 */
'use strict';

const W = 375;
const H = 667;
const storage = { gc_stageClearedIds_v1: [] };
let storageReads = 0;

global.GameGlobal = {
    game: {
        width: W,
        height: H,
        systemInfo: { statusBarHeight: 20, safeArea: { top: 20, bottom: 647 } },
        sceneManager: { back() {} },
        kickLoop() {},
    },
};

global.wx = {
    getStorageSync(key) {
        storageReads += 1;
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    setStorageSync(key, value) { storage[key] = value; },
    removeStorageSync(key) { delete storage[key]; },
};

const props = { globalAlpha: 1 };
const ctx = new Proxy({}, {
    get(target, key) {
        if (key in props) return props[key];
        if (key === 'measureText') return (text) => ({ width: String(text).length * 10 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
            return () => ({ addColorStop() {} });
        }
        if (typeof key === 'string') return () => {};
        return undefined;
    },
    set(target, key, value) { props[key] = value; return true; },
});

let passed = 0;
let failed = 0;
function assert(condition, message) {
    if (condition) {
        passed += 1;
        console.log('  PASS', message);
    } else {
        failed += 1;
        console.log('  FAIL', message);
    }
}

const AchievementScene = require('../js/scenes/achievement-scene');
const scene = new AchievementScene();
scene.onEnter({ category: 'chapter' });
scene.render(ctx); // 建立可见区域与滚动边界；允许首次快照读取。

storageReads = 0;
for (let i = 0; i < 5; i++) scene.render(ctx);
assert(storageReads === 0, '重复渲染不读取 wx 同步存储');
assert(scene.getRenderInterval() === 0, '静止图鉴页采用事件驱动停帧');

scene.handleTouchStart(1, 180, 460);
scene.handleTouchMove(1, 180, 400);
scene.render(ctx);
scene.handleTouchMove(1, 180, 340);
scene.render(ctx);
assert(storageReads === 0, '拖动与滚动渲染期间同步存储读取为 0');
scene.handleTouchEnd(1);
assert(scene.getRenderInterval() > 0, '松手后仅在惯性滚动期间启用连续帧');

scene.onExit();
console.log('\n==== RESULT ====');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
console.log('ALL TESTS PASSED');
