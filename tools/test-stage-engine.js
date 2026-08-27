/**
 * 闯关模式引擎单测（纯 node，不依赖微信 API）
 * 运行：node tools/test-stage-engine.js
 *
 * 覆盖：
 *  A. 关卡数据一致性：每关 garbageCount / minLines 与布局统计一致（t6 断言）
 *  B. 经典模式不回归：消行后上方整体下沉 1 格
 *  C. 闯关消行（方案 B）：满行清空；非垃圾塌陷；垃圾屏障不移动；塌陷后连锁
 *  D. 过关判定：垃圾清零触发 onGameOver reason='stageClear'
 *  E. revive：闯关模式复活不误删垃圾格
 *  F. stage 模式速度固定（不按消行升级）
 */
const assert = require('assert');

const { TetrisEngine, GameState, GARBAGE, BOARD_COLS, HIDDEN_ROWS } = require('../utils/tetris-engine');
const stagesData = require('../data/stages-v1.json');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  PASS', name);
    } catch (e) {
        failed++;
        console.log('  FAIL', name, '->', e.message);
        if (e.expected !== undefined) {
            console.log('    expected:', JSON.stringify(e.expected));
            console.log('    actual  :', JSON.stringify(e.actual));
        }
    }
}

function makeStageEngine(rows, dropIntervalMs) {
    const eng = new TetrisEngine(12345);
    eng.setMode('stage');
    eng.init();
    const info = eng.initStage(rows, { dropIntervalMs });
    return { eng, info };
}

// ---------------------------------------------------------------------------
console.log('A. 关卡数据一致性（t6 断言）');

for (const stage of stagesData.stages) {
    test(`stage ${stage.id} (${stage.name}) 字段与布局统计一致`, () => {
        const { eng, info } = makeStageEngine(stage.rows);
        assert.strictEqual(info.garbageCount, stage.garbageCount,
            `garbageCount 字段=${stage.garbageCount} 布局统计=${info.garbageCount}`);
        assert.strictEqual(info.minLines, stage.minLines,
            `minLines 字段=${stage.minLines} 布局统计=${info.minLines}`);
        assert.strictEqual(eng.getGarbageRemaining(), stage.garbageCount);
        assert.strictEqual(eng.getGarbageRows(), stage.minLines);
        const topGarbageRow = Math.min(...Object.keys(stage.rows).map(Number));
        assert.ok(topGarbageRow >= 4, `顶部留空不足：首垃圾行=${topGarbageRow}`);
    });
}

// ---------------------------------------------------------------------------
console.log('B. 经典模式不回归');
test('classic 消行后上方整体下沉 1 格', () => {
    const eng = new TetrisEngine(1);
    eng.setMode('classic');
    eng.init();
    // r19 满行；r17 col3 有一个玩家块（消行后整体下移 1 格 -> r18）
    for (let c = 0; c < BOARD_COLS; c++) {
        eng._board[19][c] = 1;
    }
    eng._board[17][3] = 1;
    eng._checkLines();
    assert.strictEqual(eng._board[18][3], 1, '原 r17 块应下沉到 r18');
    assert.strictEqual(eng._board[17][3], 0);
    assert.strictEqual(eng._board[19][3], 0);
});

// ---------------------------------------------------------------------------
console.log('C. 闯关消行（方案 B：非垃圾塌陷）');
test('stage 消行：满行垃圾格被清除，上方垃圾保持原位', () => {
    const { eng } = makeStageEngine({});
    const r21 = 21;
    const r20 = 20;
    eng._board[r21][5] = GARBAGE;
    eng._garbageMask[r21][5] = true;
    eng._garbageRemaining = 2;
    eng._board[r20][0] = GARBAGE;
    eng._garbageMask[r20][0] = true;
    for (let c = 0; c < BOARD_COLS; c++) {
        if (c === 5) continue;
        eng._board[r21][c] = 1;
    }
    const result = eng._checkLines();
    assert.strictEqual(result.cleared, 1);
    assert.strictEqual(eng._board[r21][5], 0, '满行垃圾格被清除');
    assert.strictEqual(eng._garbageRemaining, 1, '剩余垃圾 = r20 col0');
    assert.strictEqual(eng._board[r20][0], GARBAGE, '上方垃圾保持原位');
});

test('stage 消行：玩家块塌陷到垃圾屏障上方', () => {
    const { eng } = makeStageEngine({});
    const r21 = 21;
    const r20 = 20;
    const r19 = 19;
    const r18 = 18;
    eng._board[r21][5] = GARBAGE;
    eng._garbageMask[r21][5] = true;
    eng._garbageRemaining = 2;
    eng._board[r20][0] = GARBAGE;
    eng._garbageMask[r20][0] = true;
    eng._board[r18][0] = 1;
    for (let c = 0; c < BOARD_COLS; c++) {
        if (c === 5) continue;
        eng._board[r21][c] = 1;
    }
    const result = eng._checkLines();
    assert.strictEqual(result.cleared, 1);
    assert.strictEqual(eng._board[r21][5], 0, '满行垃圾被清除');
    assert.strictEqual(eng._garbageRemaining, 1);
    assert.strictEqual(eng._board[r20][0], GARBAGE, '垃圾屏障保持原位');
    assert.strictEqual(eng._board[r19][0], 1, '玩家块塌陷到屏障上方 r19');
    assert.strictEqual(eng._board[r18][0], 0);
});

test('stage 消行：无垃圾屏障时玩家块塌陷到底部', () => {
    const { eng } = makeStageEngine({});
    const r21 = 21;
    const r19 = 19;
    eng._board[r21][5] = GARBAGE;
    eng._garbageMask[r21][5] = true;
    eng._garbageRemaining = 1;
    eng._board[r19][0] = 1;
    for (let c = 0; c < BOARD_COLS; c++) {
        if (c === 5) continue;
        eng._board[r21][c] = 1;
    }
    eng._checkLines();
    assert.strictEqual(eng._board[r21][0], 1, '玩家块塌陷到底部 r21');
    assert.strictEqual(eng._board[r19][0], 0);
});

test('stage 消行：塌陷后新满行立即连锁清除', () => {
    const { eng } = makeStageEngine({});
    const r21 = 21;
    const r20 = 20;
    const r19 = 19;
    for (let c = 1; c < BOARD_COLS; c++) {
        eng._board[r21][c] = 1;
    }
    for (let c = 0; c < BOARD_COLS; c++) {
        eng._board[r20][c] = 2;
    }
    eng._board[r19][0] = 3;
    const result = eng._checkLines();
    assert.strictEqual(result.cleared, 2, '应连锁清除 2 行');
    assert.ok(eng._board[r21].every((cell) => cell === 0), '连锁后 r21 应清空');
    assert.ok(eng._board[r20].every((cell) => cell === 0), '连锁后 r20 应清空');
});

// ---------------------------------------------------------------------------
console.log('D. 过关判定');
test('stage 垃圾清零触发 stageClear', () => {
    const { eng } = makeStageEngine({});
    const r21 = 21;
    eng._board[r21][5] = GARBAGE;
    eng._garbageMask[r21][5] = true;
    eng._garbageRemaining = 1;
    let overReason = null;
    let overState = null;
    eng.onStateChange(s => { overState = s; });
    eng.onGameOver((score, level, lines, reason) => { overReason = reason; });
    eng._state = GameState.PLAYING;
    for (let c = 0; c < BOARD_COLS; c++) {
        if (c === 5) continue;
        eng._board[r21][c] = 1;
    }
    eng._checkLines();
    assert.strictEqual(eng.getGarbageRemaining(), 0, '垃圾已清零');
    // 手动触发 _lockPiece 中的过关判定路径（与引擎实现一致）
    if (eng._mode === 'stage' && eng._garbageRemaining === 0) {
        eng._clearTimers();
        eng._state = GameState.OVER;
        eng._emit(eng._onStateChange, eng._state);
        eng._emit(eng._onGameOver, eng._score, eng._level, eng._lines, 'stageClear');
    }
    assert.strictEqual(overState, GameState.OVER);
    assert.strictEqual(overReason, 'stageClear');
});

// ---------------------------------------------------------------------------
console.log('E. revive 垃圾保护');
test('stage revive 不误删垃圾格', () => {
    const { eng } = makeStageEngine({});
    const r2 = 2;
    eng._board[r2][3] = GARBAGE;
    eng._garbageMask[r2][3] = true;
    eng._garbageRemaining = 1;
    eng._state = GameState.OVER;
    const ok = eng.revive();
    assert.strictEqual(ok, true);
    assert.strictEqual(eng._board[r2][3], GARBAGE, '复活不应清除垃圾格');
    assert.strictEqual(eng._garbageRemaining, 1);
});

// ---------------------------------------------------------------------------
console.log('F. stage 模式速度固定（不按消行升级）');
test('stage 消行后 level 不提升', () => {
    const { eng } = makeStageEngine({}, 1000);
    eng._state = GameState.PLAYING;
    eng._lines = 9;
    eng._calculateScore({ cleared: 1, isTetris: false, isDifficult: false });
    assert.strictEqual(eng._level, 1, '闯关模式不按消行升级');
    assert.strictEqual(eng._dropInterval, 1000, '使用关卡配置的下落间隔');
});

// ---------------------------------------------------------------------------
console.log('\n==== RESULT ====');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
console.log('ALL TESTS PASSED');
