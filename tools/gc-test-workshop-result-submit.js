/**
 * tools/gc-test-workshop-result-submit.js
 * 冒烟测试：作者自通成功后可直接提交广场，失败态不显示提交入口。
 */
'use strict';

let modalOptions = null;
let toastOptions = null;

global.GameGlobal = {
    game: {
        width: 375,
        height: 812,
        systemInfo: {
            statusBarHeight: 20,
            safeArea: { top: 20, bottom: 778 },
        },
        sceneManager: {
            replace() {},
            leaveTo() {},
        },
    },
};

global.wx = {
    getStorageSync() { return null; },
    setStorageSync() {},
    showModal(options) { modalOptions = options; },
    showToast(options) { toastOptions = options; },
};

const workshop = require('../utils/workshop-manager');
const WorkshopResultScene = require('../js/scenes/workshop-result-scene');

function assert(condition, message) {
    if (!condition) throw new Error('FAIL: ' + message);
}

function buildScene(options) {
    const opts = options || {};
    GameGlobal.game.height = opts.height || 812;
    GameGlobal.game.systemInfo.safeArea.bottom = GameGlobal.game.height - 34;
    const scene = new WorkshopResultScene();
    scene._params = {};
    scene._result = {};
    scene._failed = !!opts.failed;
    scene._authorTrial = true;
    scene._reviewMode = false;
    scene._endless = false;
    scene._stageId = 'stage_submit_test';
    scene._title = '测试关卡';
    scene._returnTo = 'list';
    scene._listParams = { origin: 'workshop', mineSub: 'cleared' };
    scene._buildButtons();
    return scene;
}

async function run() {
    const longScene = buildScene({ height: 812 });
    assert(
        longScene._buttons.map((button) => button.text).join('|')
            === '提交到广场|再试一次|去编辑|返回列表',
        '长屏自通成功应展示提交、重试、编辑、返回四个按钮'
    );

    const compactScene = buildScene({ height: 667 });
    assert(
        compactScene._buttons.map((button) => button.text).join('|')
            === '提交到广场|去编辑|返回列表',
        '短屏应优先展示提交、编辑、返回，避免四按钮拥挤'
    );

    const failedScene = buildScene({ height: 812, failed: true });
    assert(
        failedScene._buttons.map((button) => button.text).join('|')
            === '再试一次|去编辑|返回列表',
        '自通失败不能显示提交入口'
    );

    const originalGetStage = workshop.getStage;
    const originalSubmitForReview = workshop.submitForReview;
    workshop.getStage = () => ({ stageId: 'stage_submit_test', title: '中秋月圆' });
    modalOptions = null;
    longScene._requestSubmitToPlaza();
    assert(modalOptions && modalOptions.title === '提交到广场', '提交前应展示确认弹窗');
    assert(modalOptions.content.indexOf('中秋月圆') >= 0, '确认弹窗应包含关卡名');

    let listParams = null;
    workshop.submitForReview = () => Promise.resolve({ ok: true });
    longScene._goList = (params) => { listParams = params; };
    modalOptions.success({ confirm: true });
    await Promise.resolve();
    await Promise.resolve();
    assert(
        listParams && listParams.mineSub === 'reviewing' && listParams.toast === '已提交审核',
        '提交成功后应进入审核中列表'
    );

    toastOptions = null;
    workshop.submitForReview = () => Promise.resolve({ ok: false, reason: 'daily-limit' });
    longScene._submitToPlaza();
    await Promise.resolve();
    await Promise.resolve();
    assert(toastOptions && toastOptions.title === '今日提交次数已用完', '提交失败应显示明确原因');
    assert(longScene._submitBusy === false, '提交失败后应恢复按钮状态');

    workshop.getStage = originalGetStage;
    workshop.submitForReview = originalSubmitForReview;
    console.log('PASS: 工坊自通成功可提交广场，短屏布局与失败提示正确');
}

run().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
