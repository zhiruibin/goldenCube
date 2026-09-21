/**
 * 广场镶嵌墙：排序套模板、金方块/广告解锁、蒙层关闭。
 * 运行：node tools/gc-test-plaza-wall.js
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
const store = Object.create(null);
global.wx = {
    getStorageSync(k) { return store[k] == null ? null : store[k]; },
    setStorageSync(k, v) { store[k] = v; },
    getMenuButtonBoundingClientRect() {
        return { left: 281, right: 368, top: 48, bottom: 80, width: 87, height: 32 };
    },
};

// 广场在通关 20 个主线关卡后开放；测试夹具直接准备已通关状态。
for (let i = 1; i <= 20; i++) {
    store['gc_stageClear_' + i] = { cleared: true, firstClearedAt: 1, assisted: false };
}

const plazaWall = require('../js/render/plaza-wall-fx');
const PlazaScene = require('../js/scenes/plaza-scene');
const workshop = require('../utils/workshop-manager');
const { renderLockedEntryDialog } = require('../utils/stage-entry-ui');

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL: ' + msg);
        process.exit(1);
    }
}

const dummy = [
    { stageId: 'a', title: '短匕', authorName: '官方', garbageCount: 13, minLines: 7, stats: { clearCount: 3 } },
    { stageId: 'b', title: '柳叶刀', authorName: '官方', garbageCount: 18, minLines: 8, stats: { clearCount: 2 } },
    { stageId: 'c', title: '青龙偃月', authorName: '官方', garbageCount: 25, minLines: 9, stats: { clearCount: 1 } },
];
const laid = plazaWall.layoutWall(dummy, {
    pad: 12,
    listTop: 180,
    scrollY: 0,
    width: 375,
});
assert(laid.boxes.length === 3, '应排出三张嵌板');
assert(laid.boxes[0].w > laid.boxes[1].w, '当前排序第一张应占最大格');
assert(laid.boxes[0].h > laid.boxes[1].h, '最大格应高于右侧小格');
assert(laid.boxes[0].localY === 0, '第一张 localY 应为 0');
plazaWall.applyScroll(laid.boxes, 180, 40);
assert(Math.abs(laid.boxes[0].y - (180 - 40)) < 0.01, 'applyScroll 应只改 y');
plazaWall.applyScroll(laid.boxes, 180, 0);
assert(laid.boxes[1].y < laid.boxes[2].y, '右上两小格应上下叠');
assert(plazaWall.authorOf(dummy[0]) === '官方', '作者应取 authorName');
assert(plazaWall.clearCountOf(dummy[0]) === 3, '通关人数应取 stats.clearCount');
assert(plazaWall.plazaCardState(true, true) === 'cleared', '已通应为 cleared');
assert(plazaWall.plazaCardState(true, false) === 'unlocked', '已解锁未通应为 unlocked');
assert(plazaWall.plazaCardState(false, false) === 'locked', '未开应为 locked');
assert(plazaWall.metaFooterH() === 8 + 13 + 8 + 12 + 8 + 12 + 8, '三行信息行距应为 8px');

const scene = new PlazaScene();
scene.onEnter();
assert(Array.isArray(scene._listRects) && scene._listRects.length >= 8, '官方包应铺出镶嵌墙');
const first = scene._listRects[0];
const second = scene._listRects[1];
const playCard = second; // 第一格是无需解锁的无尽练习，第二格才是普通广场关卡。
assert(first.w > second.w, '官方第一张应大于第二张, ' + first.w + ' vs ' + second.w);
assert(first.h > plazaWall.metaFooterH() + 20, '嵌板应留出盘面区域');

switched = null;
scene.handleTap(playCard.x + playCard.w / 2, playCard.y + playCard.h / 2);
assert(scene._playDialog && scene._playDialog.locked, '点未解锁嵌板应弹出确认窗');
assert(scene._playDialog.needGold === workshop.PLAZA_UNLOCK_GOLD, '应告知用金方块解锁');
assert(scene._playDialog.fee == null || scene._playDialog.fee === 0, '闯关不应再收金币');
assert(!scene._confirm, '不应再弹出第二层解锁窗');
assert(!switched, '点卡开窗不应立刻进游戏');

scene._playRects = { pay: { x: 0, y: 0, w: 400, h: 800 } };
scene.handleTap(playCard.x + playCard.w / 2, playCard.y + playCard.h / 2);
assert(scene._playDialog, '开窗同一记抬手不应触发确认扣费');
assert(!switched, '开窗同一记抬手不应进游戏');

store.gc_goldenBlocks = 0;
scene.onTouchStart(10, 10);
scene._playRects = { pay: { x: 0, y: 0, w: 400, h: 800 } };
scene.handleTap(20, 20);
assert(scene._playDialog, '资源不足应留在确认窗');
assert(scene._playDialog.lackGold === true, '缺金方块应标红金方块行');
assert(scene._playDialog.lackCoins !== true, '不应再存在金币不足状态');
assert(scene._toast === '金方块不足，可观看视频解锁', '缺金方块 toast, got=' + scene._toast);

scene._playRects = {};
scene.onTouchStart(10, 10);
scene._playPanel = { x: 40, y: 200, w: 280, h: 180 };
scene.handleTap(10, 10);
assert(!scene._playDialog, '点蒙层应关闭弹窗');

let dlgStrokes = 0;
let dlgTexts = [];
const dlgCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {
        dlgStrokes += 1;
    },
    fillRect() {},
    fillText(t) { dlgTexts.push(String(t || '')); },
    save() {},
    restore() {},
    translate() {},
    scale() {},
    setLineDash() {},
    measureText(t) { return { width: String(t || '').length * 7 }; },
};
const lockedDlg = {
    stage: { title: '试关' },
    locked: true,
    needGold: 1,
    lackGold: true,
    canAd: true,
    rewardedLeft: 1,
};
renderLockedEntryDialog(dlgCtx, 375, 667, lockedDlg);
assert(dlgStrokes >= 1, '锁定弹窗应描边');
assert(lockedDlg.payRect && lockedDlg.cancelRect, '锁定弹窗应有支付/取消热区');
assert(lockedDlg.payRect.y < lockedDlg.cancelRect.y, '支付开打应在取消上方');
assert(Math.abs(lockedDlg.payRect.x - lockedDlg.cancelRect.x) < 1, '按钮应竖排左对齐');
assert(lockedDlg.adRect && !lockedDlg.challengeRect, '缺金方块时应提供视频解锁，不显示约好友');
assert(dlgTexts.indexOf('使用金方块解锁') >= 0, '主按钮应为金方块解锁');
assert(dlgTexts.some((t) => t.indexOf('观看视频永久解锁') >= 0), '应显示视频永久解锁按钮');
assert(dlgTexts.some((t) => t.indexOf('金方块') >= 0), '未解锁应显示金方块行');

dlgTexts = [];
const unlockedDlg = {
    stage: { title: '试关' },
    locked: false,
    needGold: 0,
    canChallenge: true,
    lackGold: false,
};
renderLockedEntryDialog(dlgCtx, 375, 667, unlockedDlg);
assert(dlgTexts.every((t) => t.indexOf('金方块') < 0), '已解锁不应显示金方块行');
assert(!unlockedDlg.adRect, '已解锁关卡不应再提供视频解锁');
assert(unlockedDlg.payRect.y < unlockedDlg.challengeRect.y, '约好友应在开始挑战下方');
assert(unlockedDlg.challengeRect.y < unlockedDlg.cancelRect.y, '取消应在约好友下方');
assert(dlgTexts.indexOf('约好友来战') >= 0, '已解锁通关后应能约好友');

const y0 = first.y;
scene.onTouchStart(first.x, first.y);
scene.onTouchMove(first.x, first.y - 30);
assert(scene._listRects[0] === first, '滑动不应重建嵌板对象');
assert(scene._listRects[0].y !== y0, '滑动应改 y');

let clip = 0;
let gradients = 0;
const fakeCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    fillText() {},
    save() {},
    restore() {},
    clip() { clip += 1; },
    createLinearGradient() { gradients += 1; return { addColorStop() {} }; },
    measureText(t) { return { width: String(t || '').length * 7 }; },
};
plazaWall.drawCard(fakeCtx, {
    stage: dummy[0],
    x: 12,
    y: 100,
    w: 200,
    h: 220,
}, 'locked');
assert(clip === 0, '卡片绘制不应 clip');
assert(gradients === 0, '卡片绘制不应每格建渐变');

scene._scrollY = 220;
switched = null;
scene._startPlazaGame(playCard.stage);
assert(switched && switched.name === 'game', '开打应进入游戏');
assert(switched.params.workshopListParams.scrollY === 220, '开打应带上滚动位置');
assert(switched.params.workshopListParams.focusStageId === playCard.stage.stageId, '开打应带上当前关卡');

const back = new PlazaScene();
back.onEnter({
    plazaSort: 'official',
    scrollY: 280,
    focusStageId: playCard.stage.stageId,
});
assert(back._scrollY > 0, '返回广场应停留在原滚动位置, got ' + back._scrollY);
assert(back._focusStageId === playCard.stage.stageId, '返回应记住刚打的关卡');
assert(back._cardState[playCard.stage.stageId], '刚打的关卡卡片状态应被刷新');

const sid = playCard.stage.stageId;
store.gc_goldenBlocks = 0;
store.gc_workshop_plazaUnlocked = {};
let entry = workshop.enterPlazaStage(sid);
assert(entry.reason === 'no-gold', '缺金方块应阻止开打, got ' + entry.reason);
assert(workshop.plazaEntryShortageText(entry) === '金方块不足，可观看视频解锁', '缺金方块文案');

store.gc_goldenBlocks = 5;
entry = workshop.enterPlazaStage(sid);
assert(entry.ok, '金方块足够应解锁并开打');
assert(entry.goldPaid === 1, '未解锁应扣 1 金方块');
assert(entry.paid === 0, '未解锁也不应扣金币');
assert(workshop.isPlazaUnlocked(sid), '开打后应已解锁');
// 夹具首次触发成就检查时可能补发既有主线成就金；扣款额以 goldPaid 为准。
const goldAfterUnlock = store.gc_goldenBlocks;

entry = workshop.enterPlazaStage(sid);
assert(entry.ok && entry.goldPaid === 0 && entry.paid === 0, '已解锁应免费开打');
assert(store.gc_goldenBlocks === goldAfterUnlock, '已解锁不应再扣金方块');

console.log('PASS: 广场镶嵌墙布局与点卡解锁');
