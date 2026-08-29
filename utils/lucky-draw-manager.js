/**
 * 幸运摇奖：频控 + 开奖（仅金币，不发金方块）
 * - 破个人纪录：每关每日最多 1 次
 * - 挑战获胜：每个 challengeId 终身最多 1 次
 */

function _todayKey() {
    const d = new Date();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function _recordKey(stageId) {
    return 'gc_luckyRecord_' + Number(stageId) + '_' + _todayKey();
}

function _challengeKey(challengeId) {
    return 'gc_luckyChallenge_' + String(challengeId);
}

/** 破纪录（非首通）是否还可领取今日摇奖 */
function canClaimRecordBreak(stageId) {
    if (!stageId) return false;
    try {
        return !wx.getStorageSync(_recordKey(stageId));
    } catch (e) {
        return true;
    }
}

function markRecordBreakClaimed(stageId) {
    if (!stageId) return;
    try {
        wx.setStorageSync(_recordKey(stageId), 1);
    } catch (e) { /* ignore */ }
}

/** 该挑战获胜是否还可领取摇奖（按 challengeId 终身一次） */
function canClaimChallengeWin(challengeId) {
    if (!challengeId) return false;
    try {
        return !wx.getStorageSync(_challengeKey(challengeId));
    } catch (e) {
        return true;
    }
}

function markChallengeWinClaimed(challengeId) {
    if (!challengeId) return;
    try {
        wx.setStorageSync(_challengeKey(challengeId), 1);
    } catch (e) { /* ignore */ }
}

/** 三连 6% / 二连 34% / 单配 60%；仅金币档 */
function rollCoinPrize() {
    const r = Math.random();
    const tier = r < 0.06 ? 3 : (r < 0.40 ? 2 : 1);
    if (tier === 3) return { type: 'gc_coins', amount: 20, tier: 3 };
    if (tier === 2) return { type: 'gc_coins', amount: 10, tier: 2 };
    return { type: 'gc_coins', amount: 5, tier: 1 };
}

module.exports = {
    canClaimRecordBreak,
    markRecordBreakClaimed,
    canClaimChallengeWin,
    markChallengeWinClaimed,
    rollCoinPrize,
};
