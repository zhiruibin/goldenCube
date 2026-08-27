/**
 * utils/golden-block-manager.js
 * 金色方块元货币管理（MVP）
 *  - 余额存取（gc_goldenBlocks）
 *  - 关卡解锁（gc_stagesUnlocked，0 成本=免费）
 *  - 首通 +1 / 破纪录 +1 / 重复通关不重复获得（评审决策）
 *  - 每关个人最佳（gc_stageBest_{id}：lines / pieces / timeMs）
 * 与 tetris-mini 数据完全隔离（gc_ 前缀）。
 */

const STAGES_DATA = require('../data/stages-v1.json');

const KEYS = {
    balance: 'gc_goldenBlocks',
    unlocked: 'gc_stagesUnlocked',
    bestPrefix: 'gc_stageBest_',
};

function getStages() {
    return STAGES_DATA.stages || [];
}

function getStage(id) {
    const nid = Number(id);
    return getStages().find((s) => s.id === nid) || null;
}

// ---------------- 余额 ----------------

function getBalance() {
    try {
        return Number(wx.getStorageSync(KEYS.balance)) || 0;
    } catch (e) {
        return 0;
    }
}

function addBalance(n) {
    const v = Math.max(0, getBalance() + (Number(n) || 0));
    try {
        wx.setStorageSync(KEYS.balance, v);
    } catch (e) { /* 忽略存储异常 */ }
    return v;
}

function spendBalance(n) {
    const cost = Number(n) || 0;
    const v = getBalance();
    if (v < cost) return false;
    try {
        wx.setStorageSync(KEYS.balance, v - cost);
    } catch (e) { /* 忽略存储异常 */ }
    return true;
}

// ---------------- 解锁 ----------------

function getUnlocked() {
    try {
        return wx.getStorageSync(KEYS.unlocked) || [];
    } catch (e) {
        return [];
    }
}

function _saveUnlocked(list) {
    try {
        wx.setStorageSync(KEYS.unlocked, list);
    } catch (e) { /* 忽略存储异常 */ }
}

/** 是否可玩：免费关或已解锁 */
function isUnlocked(id) {
    const stage = getStage(id);
    if (!stage) return false;
    if (stage.unlockCost === 0) return true;
    return getUnlocked().indexOf(stage.id) >= 0;
}

/** 解锁关卡：消耗金色方块；返回 { ok, stage, balance } */
function unlockStage(id) {
    const stage = getStage(id);
    if (!stage) return { ok: false, reason: 'no-stage' };
    if (isUnlocked(id)) return { ok: true, stage, balance: getBalance() };
    const cost = stage.unlockCost || 0;
    if (cost === 0) {
        const list = getUnlocked();
        if (list.indexOf(stage.id) < 0) list.push(stage.id);
        _saveUnlocked(list);
        return { ok: true, stage, balance: getBalance() };
    }
    if (!spendBalance(cost)) return { ok: false, reason: 'no-gold' };
    const list = getUnlocked();
    if (list.indexOf(stage.id) < 0) list.push(stage.id);
    _saveUnlocked(list);
    return { ok: true, stage, balance: getBalance() };
}

// ---------------- 个人最佳 ----------------

function getStageBest(id) {
    try {
        return wx.getStorageSync(KEYS.bestPrefix + Number(id)) || null;
    } catch (e) {
        return null;
    }
}

/** a 是否优于 b：消行少 → 用块少 → 用时短（文档《排行榜》） */
function isBetter(a, b) {
    if (a.lines !== b.lines) return a.lines < b.lines;
    if ((a.pieces || 0) !== (b.pieces || 0)) return (a.pieces || 0) < (b.pieces || 0);
    return (a.timeMs || 0) < (b.timeMs || 0);
}

/** 是否已通关（有个人最佳即通关） */
function isCleared(id) {
    return !!getStageBest(id);
}

function _saveStageBest(id, rec) {
    try {
        wx.setStorageSync(KEYS.bestPrefix + Number(id), rec);
    } catch (e) { /* 忽略存储异常 */ }
}

/**
 * 通关结算统一入口：更新最佳并发放金色方块。
 * 规则（已确认）：首通 +1（一次性）；重复通关破纪录 +1；重复通关不破纪录 +0。
 * @returns {{ first: boolean, isNewBest: boolean, reward: number, best: Object }}
 */
function rewardClear(id, lines, pieces, timeMs) {
    const rec = { lines, pieces: pieces || 0, timeMs: timeMs || 0 };
    const prev = getStageBest(id);
    const first = !prev;
    const isNewBest = !prev || isBetter(rec, prev);
    let reward = 0;
    if (first) {
        reward = 1;
    } else if (isNewBest) {
        reward = 1;
    }
    if (first || isNewBest) {
        _saveStageBest(id, rec);
    }
    if (reward > 0) {
        addBalance(reward);
    }
    return { first, isNewBest, reward, best: getStageBest(id) };
}

module.exports = {
    getStages,
    getStage,
    getBalance,
    addBalance,
    spendBalance,
    isUnlocked,
    unlockStage,
    getStageBest,
    isCleared,
    isBetter,
    rewardClear,
};
