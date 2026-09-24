/**
 * 底部七方块：共用石块绘制，不再是纯色方格。
 * node tools/gc-test-mini-tetris-stone.js
 */
const { MiniTetrisFx } = require('../js/render/mini-tetris-fx');

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

global.wx = {
    getStorageSync() { return true; },
    getSystemInfoSync() { return { benchmarkLevel: 40 }; },
};

const fx = new MiniTetrisFx();
fx.init({
    width: 375,
    height: 667,
    areaTop: 560,
    areaBottom: 640,
    interactive: false,
});

assert(fx._pieces.length === 7, '应有 7 个方块');
const types = fx._pieces.map((p) => p.type).join('');
assert(types === 'IOTSZJL', '顺序应是 I O T S Z J L，实际 ' + types);
fx._pieces.forEach((p) => {
    assert(p.cell >= 8, p.type + ' 格子过小');
});

let paths = 0;
let flatOnly = 0;
const ctx = {
    fillStyle: '',
    beginPath() { paths += 1; },
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    fillRect() { flatOnly += 1; },
    save() {},
    restore() {},
    ellipse() {},
};
fx.render(ctx);
assert(paths >= 7 * 2, '每格应有侧面，path=' + paths);
assert(flatOnly > 0, '顶面仍要填色');

console.log('PASS: mini tetris stone');
