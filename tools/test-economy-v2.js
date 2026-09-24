'use strict';

const store = Object.create(null);
global.wx = {
    getStorageSync(key) { return store[key] == null ? '' : store[key]; },
    setStorageSync(key, value) { store[key] = value; },
    removeStorageSync(key) { delete store[key]; },
};

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const golden = require('../utils/golden-block-manager');
const progression = require('../utils/progression-v2');
const rewind = require('../utils/rewind-manager');
const { TetrisEngine } = require('../utils/tetris-engine');
const workshop = require('../utils/workshop-manager');

store.gc_coins = 999;
store.gc_dailyLoginClaimed = 'legacy';
store.gc_stageBest_2 = { lines: 4, pieces: 7, timeMs: 3000 };
progression.migrate();
assert(store.gc_coins == null, '迁移后应删除金币余额');
assert(golden.isCleared(2), '旧最佳纪录应迁移为通关记录');
assert(golden.getStageClear(2).cleared, '应存在独立通关记录');

store.gc_goldenBlocks = 0;
const assisted = golden.rewardClear(3, 5, 10, 5000, { assisted: true });
assert(assisted.first && assisted.assisted, '辅助首通应记录为首通');
assert(golden.isCleared(3), '辅助首通应推进关卡进度');
assert(golden.getStageBest(3) == null, '辅助首通不得写最佳纪录');
assert(store.gc_goldenBlocks === 1, '辅助首通只发设计内固定首通金方块');
const normal = golden.rewardClear(3, 5, 9, 4500);
assert(!normal.first && normal.isNewBest, '之后正常通关应补建最佳纪录');
assert(store.gc_goldenBlocks === 1, '补建首条最佳纪录不应额外发破纪录奖励');

const plazaStage = workshop.getOfficialPlazaStages()[0];
assert(plazaStage && plazaStage.stageId, '应有官方广场测试关卡');
store.gc_goldenBlocks = 0;
let plazaEntry = workshop.enterPlazaStage(plazaStage.stageId);
assert(plazaEntry.reason === 'no-gold', '未解锁广场关只校验金方块');
plazaEntry = workshop.enterPlazaStage(plazaStage.stageId, { rewardedUnlock: true });
assert(plazaEntry.ok && plazaEntry.paid === 0, '广告应永久解锁广场关且开打免费');
plazaEntry = workshop.enterPlazaStage(plazaStage.stageId);
assert(plazaEntry.ok && plazaEntry.paid === 0, '已解锁广场关应永久免费重玩');
const plazaClear = workshop.rewardPlazaClear(plazaStage.stageId, 8, 12, 6000, { assisted: true });
assert(plazaClear.firstClear && plazaClear.assisted, '广场辅助通关应推进通关进度');
assert(workshop.getPlazaBest(plazaStage.stageId) == null, '广场辅助通关不得写最佳纪录');

const login1 = progression.recordLoginLocal();
const login2 = progression.recordLoginLocal();
assert(login1.progress.totalLoginDays === login2.progress.totalLoginDays, '同一自然日不得重复累计登录');

const history = [];
for (let i = 0; i < 11; i++) history.push({ snapshot: { board: [[i]] }, pieceCount: i });
assert(rewind.pick(history).pieceCount === 2, '11个检查点应回退8步');
assert(rewind.save({ snapshot: { board: [[]] }, gameParams: { stageId: 1 } }), '回退快照应可保存');
assert(rewind.consume(), '回退快照应可消费一次');
assert(rewind.consume() == null, '回退快照不得二次消费');

const engine = new TetrisEngine(12345);
engine.init();
engine.setMode('stage');
engine.initStage({ 19: '####..####' }, { dropIntervalMs: 1000 });
engine.start();
const snapshot = engine.exportSnapshot();
const before = engine.getNextPieces().join(',');
const restored = new TetrisEngine(12345);
restored.init();
restored.setMode('stage');
restored.initStage({ 19: '####..####' }, { dropIntervalMs: 1000 });
assert(restored.restoreSnapshot(snapshot, { endless: false }), '应能恢复通用快照');
restored.start();
assert(restored.getNextPieces().join(',') === before, '恢复后 NEXT 序列必须保持一致');

console.log('PASS: economy v2 / login badges / rewind snapshot');
