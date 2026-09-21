/**
 * tools/gc-test-stage-select-tap.js
 * 冒烟测试：关卡选择点卡与广场一致——已解锁免费关直进；未解锁只开窗，确认才扣费。
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
            replace(name, params) {
                switched = { name, params };
            },
        },
    },
};
const store = Object.create(null);
global.wx = {
    getStorageSync(k) { return store[k] == null ? null : store[k]; },
    setStorageSync(k, v) { store[k] = v; },
    getMenuButtonBoundingClientRect() {
        return { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
    },
};

const StageSelectScene = require('../js/scenes/stage-select-scene');
const goldenBlock = require('../utils/golden-block-manager');
const {
    enterOfficialStage,
    stageEntryShortageText,
    formatEntryDialogTitle,
} = require('../utils/stage-entry-ui');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL: ' + msg);
        process.exit(1);
    }
}

const scene = new StageSelectScene();
scene.onEnter();

assert(formatEntryDialogTitle({ id: 8, name: '双环八' }) === '第8关·双环八', '闯关弹窗标题应为 第x关·关卡名');
assert(formatEntryDialogTitle({ title: '短匕' }) === '短匕', '无编号关卡应只用关卡名');

switched = null;
scene.handleTap(0, 0);
assert(switched === null, '点击空白区域不应切换场景');

const card = scene._chapterCards[0][0];
switched = null;
scene.handleTap(card.x + card.w / 2, card.y + card.h / 2);
assert(switched !== null, '点击卡片应触发切换');
assert(switched.name === 'game', '应切换到 game 场景, got=' + (switched && switched.name));
assert(switched.params && switched.params.mode === 'stage', 'mode 应为 stage');
assert(switched.params && switched.params.stageId === card.stage.id, 'stageId 应为卡片关卡 id');
assert(scene._entryDialog === null, '第 1 关免费，不应弹出入场对话框');

const card2 = scene._chapterCards[0][1];
assert(card2 && card2.stage && card2.stage.id === 2, '第二张应为第 2 关');
switched = null;
scene.handleTap(card2.x + card2.w / 2, card2.y + card2.h / 2);
assert(scene._entryDialog && scene._entryDialog.locked, '点未解锁关卡应弹出确认窗');
assert(scene._entryDialog.needGold === 1, '应告知用金方块解锁');
assert(scene._entryDialog.fee === 0, '第 2 关入场费应为 0');
assert(!switched, '点卡开窗不应立刻进游戏');
assert(!goldenBlock.isUnlocked(2), '开窗不应立刻解锁');

scene._entryDialog.payRect = { x: 0, y: 0, w: 400, h: 800 };
scene.handleTap(card2.x + card2.w / 2, card2.y + card2.h / 2);
assert(scene._entryDialog, '开窗同一记抬手不应触发确认扣费');
assert(!switched, '开窗同一记抬手不应进游戏');

store.gc_goldenBlocks = 0;
store.gc_coins = 0;
scene.handleTouchStart();
scene.handleTap(10, 10);
assert(scene._entryDialog, '金方块不足时应留在确认窗');
assert(!switched, '金方块不足不应进游戏');
assert(!goldenBlock.isUnlocked(2), '金方块不足不应解锁');
assert(scene._toast === '金方块不足', '缺金方块文案, got=' + scene._toast);
assert(scene._entryDialog.lackGold === true, '缺金方块应标红金方块行');
assert(scene._entryDialog.lackCoins !== true, '第 2 关不缺金币，金币行不应标红');

store.gc_goldenBlocks = 5;
scene.handleTouchStart();
scene._entryDialog.payRect = { x: 0, y: 0, w: 400, h: 800 };
switched = null;
scene.handleTap(10, 10);
assert(switched && switched.name === 'game', '确认且资源足够应进游戏');
assert(switched.params && switched.params.stageId === 2, '应进入第 2 关');
assert(goldenBlock.isUnlocked(2), '确认后应已解锁');
assert(store.gc_goldenBlocks === 4, '应扣 1 金方块');

// 第 11 章生成关只保留金方块永久解锁，开打免费。
store.gc_stagesUnlocked = [];
store.gc_goldenBlocks = 5;
store.gc_coins = 500;
const chapter11 = new StageSelectScene();
chapter11.onEnter({ chapterId: 11 });
const stage102 = chapter11._chapterCards[10][1].stage;
assert(stage102.id === 102, '第 11 章第二张卡应为第 102 关');
assert(stage102.unlockCost === 1, '第 102 关应消耗 1 个金方块解锁');
chapter11._handleCardTap(chapter11._chapterCards[10][1]);
assert(chapter11._entryDialog && chapter11._entryDialog.stage.id === 102, '第 102 关应打开自己的入场弹窗');
assert(chapter11._entryDialog.locked === true, '第 102 关未解锁时弹窗应为锁定状态');
assert(chapter11._entryDialog.needGold === 1, '第 102 关弹窗应显示 1 个金方块解锁');
assert(chapter11._entryDialog.fee === 0, '第 102 关不应再收金币入场费');

store.gc_goldenBlocks = 0;
store.gc_coins = 0;
store.gc_stagesUnlocked = [];
let entry = enterOfficialStage(4);
assert(entry.reason === 'no-gold', '只校验金方块, got=' + entry.reason);
assert(stageEntryShortageText(entry) === '金方块不足', '缺金方块文案');

store.gc_goldenBlocks = 5;
entry = enterOfficialStage(4);
assert(entry.ok, '金方块足够应解锁并开打');
assert(entry.goldPaid === 1, '未解锁应扣 1 金方块');
assert(entry.paid === 0, '第 4 关不应扣金币');
assert(goldenBlock.isUnlocked(4), '开打后应已解锁');
assert(store.gc_goldenBlocks === 4, '金方块应只扣 1');

entry = enterOfficialStage(4);
assert(entry.ok && entry.goldPaid === 0 && entry.paid === 0, '已解锁应免费重玩');

console.log('PASS: handleTap 免费关直进 / 未解锁确认窗 / 确认扣费');
