#!/usr/bin/env node
/** 审核拒绝原因枚举、未读通知与玩家提示回归检查。 */
'use strict';

const fs = require('fs');
const path = require('path');
const storage = Object.create(null);
let modalOptions = null;
let switched = null;

global.wx = {
    getStorageSync(key) { return storage[key] == null ? null : storage[key]; },
    setStorageSync(key, value) { storage[key] = value; },
    showModal(options) { modalOptions = options; },
    showToast() {},
};
global.GameGlobal = {
    game: {
        width: 375,
        height: 812,
        systemInfo: {},
        sceneManager: {
            current: null,
            switchTo(name, params) { switched = { name, params }; },
        },
    },
};

const workshop = require('../utils/workshop-manager');
const WorkshopScene = require('../js/scenes/workshop-scene');

function assert(condition, message) {
    if (!condition) throw new Error('FAIL: ' + message);
}

assert(workshop.REJECT_REASONS.join('|') === '过于简单|过于复杂|其他', '拒审原因应为固定三项');
assert(workshop.normalizeRejectReason('过于复杂') === '过于复杂', '合法拒审原因应原样保留');
assert(workshop.normalizeRejectReason('随意填写') === '其他', '非枚举原因应归一为“其他”');

const rejectedStage = {
    stageId: 'stage_rejected_test',
    title: '测试关卡',
    status: workshop.STATUS.rejected,
    rejectReason: '过于简单',
    updatedAt: 100,
    review: { reviewedAt: 100 },
};
storage.gc_workshop_stages = [rejectedStage];
assert(workshop.listUnseenRejectedStages().length === 1, '首次同步到驳回结果应为未读');
workshop.markReviewNoticesSeen([rejectedStage]);
assert(workshop.listUnseenRejectedStages().length === 0, '展示通知后不应重复提醒');
storage.gc_workshop_stages[0] = Object.assign({}, rejectedStage, {
    updatedAt: 200,
    review: { reviewedAt: 200 },
});
assert(workshop.listUnseenRejectedStages().length === 1, '同一关卡再次拒审应再次提醒');

const scene = new WorkshopScene();
GameGlobal.game.sceneManager.current = scene;
modalOptions = null;
scene._showRejectedReviewNotice([rejectedStage]);
assert(modalOptions && modalOptions.title === '关卡审核未通过', '玩家应收到审核未通过弹窗');
assert(modalOptions.content.indexOf('「测试关卡」已驳回：过于简单') === 0,
    '弹窗应展示关卡名和具体拒审原因');
modalOptions.success({ confirm: true });
assert(switched && switched.name === 'workshopEditor'
    && switched.params.stageId === rejectedStage.stageId, '玩家可从通知直接去修改关卡');

modalOptions = null;
switched = null;
const latestRejected = Object.assign({}, rejectedStage, {
    stageId: 'stage_rejected_latest',
    title: '最新关卡',
    rejectReason: '过于复杂',
    updatedAt: 300,
    review: { reviewedAt: 300 },
});
scene._showRejectedReviewNotice([rejectedStage, latestRejected]);
assert(modalOptions.content.indexOf('「最新关卡」已驳回：过于复杂') === 0,
    '多个拒审结果只展示最近一次的关卡名和原因');
assert(modalOptions.content.indexOf('另有 1 个关卡未通过审核') >= 0,
    '多个拒审结果应补充其余数量而不连续弹窗');
modalOptions.success({ confirm: true });
assert(switched && switched.params.stageId === latestRejected.stageId,
    '多个拒审结果的去修改按钮应打开最近被拒关卡');

const root = path.resolve(__dirname, '..');
const plazaSource = fs.readFileSync(path.join(root, 'js/scenes/plaza-scene.js'), 'utf8');
assert(/itemList:\s*workshop\.REJECT_REASONS\.slice\(\)/.test(plazaSource),
    '管理员拒审时应选择固定原因');
const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/workshop/index.js'), 'utf8');
assert(/rejectReasons = \['过于简单', '过于复杂', '其他'\]/.test(cloudSource),
    '云端应校验固定拒审原因');

console.log('PASS: 拒审原因固定枚举，玩家未读通知、原因展示和去修改入口正确');
