/**
 * utils/golden-block-manager.js
 * 金色方块：进度货币
 *  - 首通 +1；破纪录 +1/关且每关封顶 2 次（不含首通）
 *  - 章节全通 +5；全通全部关卡里程碑 +10
 *  - 成就发金累计校验（3 章表 +8 / 10 章表 +12）
 */

const STAGES_DATA = require('../data/stages-v1.js');

const KEYS = {
    balance: 'gc_goldenBlocks',
    unlocked: 'gc_stagesUnlocked',
    bestPrefix: 'gc_stageBest_',
    rewardCountPrefix: 'gc_stageRewardCount_',
    chaptersCleared: 'gc_chaptersCleared',
    allClearClaimed: 'gc_allClearClaimed',
    achievementGold: 'gc_achievementGoldTotal',
    firstRankClaimed: 'gc_firstRankGoldClaimed',
};

/** 全通关卡数：以 stages 长度为准（30 或 100） */
function getTotalStageCount() {
    return (STAGES_DATA.stages || []).length;
}

/** 成就发金生涯上限：≥100 关用 12，否则 8 */
function getAchievementGoldCap() {
    return getTotalStageCount() >= 100 ? 12 : 8;
}

function getStages() {
    return STAGES_DATA.stages || [];
}

function getStage(id) {
    const nid = Number(id);
    return getStages().find((s) => s.id === nid) || null;
}

function getChapters() {
    return STAGES_DATA.chapters || [];
}

function getStagesByChapter(chapterId) {
    const cid = Number(chapterId);
    const all = getStages();
    const byField = all.filter((s) => Number(s.chapterId) === cid);
    if (byField.length) return byField;
    const chapters = getChapters();
    const size = Math.max(1, Math.round(all.length / Math.max(1, chapters.length)));
    return all.filter((s) => s.id > (cid - 1) * size && s.id <= cid * size);
}

function isChapterUnlocked(chapterId) {
    const chapters = getChapters();
    const idx = chapters.findIndex((c) => Number(c.id) === Number(chapterId));
    if (idx <= 0) return true;
    const prevStages = getStagesByChapter(chapters[idx - 1].id);
    return prevStages.every((s) => isCleared(s.id));
}

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
    } catch (e) { /* ignore */ }
    return v;
}

function spendBalance(n) {
    const cost = Number(n) || 0;
    const v = getBalance();
    if (v < cost) return false;
    try {
        wx.setStorageSync(KEYS.balance, v - cost);
    } catch (e) { /* ignore */ }
    return true;
}

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
    } catch (e) { /* ignore */ }
}

function isUnlocked(id) {
    const stage = getStage(id);
    if (!stage) return false;
    if (stage.unlockCost === 0) return true;
    return getUnlocked().indexOf(stage.id) >= 0;
}

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

function getStageBest(id) {
    try {
        return wx.getStorageSync(KEYS.bestPrefix + Number(id)) || null;
    } catch (e) {
        return null;
    }
}

function isBetter(a, b) {
    if (a.lines !== b.lines) return a.lines < b.lines;
    if ((a.pieces || 0) !== (b.pieces || 0)) return (a.pieces || 0) < (b.pieces || 0);
    return (a.timeMs || 0) < (b.timeMs || 0);
}

function isCleared(id) {
    return !!getStageBest(id);
}

function getClearedCount() {
    return getStages().filter((s) => isCleared(s.id)).length;
}

function _saveStageBest(id, rec) {
    try {
        wx.setStorageSync(KEYS.bestPrefix + Number(id), rec);
    } catch (e) { /* ignore */ }
}

function _getRecordRewardCount(id) {
    try {
        return Number(wx.getStorageSync(KEYS.rewardCountPrefix + Number(id))) || 0;
    } catch (e) {
        return 0;
    }
}

function _setRecordRewardCount(id, n) {
    try {
        wx.setStorageSync(KEYS.rewardCountPrefix + Number(id), n);
    } catch (e) { /* ignore */ }
}

function _getChaptersCleared() {
    try {
        return wx.getStorageSync(KEYS.chaptersCleared) || [];
    } catch (e) {
        return [];
    }
}

function _saveChaptersCleared(list) {
    try {
        wx.setStorageSync(KEYS.chaptersCleared, list);
    } catch (e) { /* ignore */ }
}

/**
 * 通关结算：首通 +1；破纪录（非首通）+1 且每关最多 2 次；章全通 +5；全通里程碑 +10
 * @returns {{ first, isNewBest, reward, chapterReward, milestoneReward, best, clearedCount }}
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
        const cnt = _getRecordRewardCount(id);
        if (cnt < 2) {
            reward = 1;
            _setRecordRewardCount(id, cnt + 1);
        }
    }
    if (first || isNewBest) {
        _saveStageBest(id, rec);
    }
    if (reward > 0) addBalance(reward);

    let chapterReward = 0;
    const stage = getStage(id);
    if (stage) {
        const cid = Number(stage.chapterId) || Math.floor((Number(id) - 1) / 10) + 1;
        const chapterStages = getStagesByChapter(cid);
        const allCleared = chapterStages.length > 0 && chapterStages.every((s) => isCleared(s.id));
        if (allCleared) {
            const cleared = _getChaptersCleared();
            if (cleared.indexOf(cid) < 0) {
                cleared.push(cid);
                _saveChaptersCleared(cleared);
                chapterReward = 5;
                addBalance(5);
            }
        }
    }

    let milestoneReward = 0;
    const total = getTotalStageCount();
    if (getClearedCount() >= total && total > 0) {
        try {
            if (!wx.getStorageSync(KEYS.allClearClaimed)) {
                wx.setStorageSync(KEYS.allClearClaimed, 1);
                milestoneReward = 10;
                addBalance(10);
            }
        } catch (e) { /* ignore */ }
    }

    return {
        first,
        isNewBest,
        reward,
        chapterReward,
        milestoneReward,
        best: getStageBest(id),
        clearedCount: getClearedCount(),
    };
}

/** 成就发金（受生涯上限约束） */
function grantAchievementGold(amount) {
    const want = Math.max(0, Math.floor(Number(amount) || 0));
    if (want <= 0) return 0;
    let used = 0;
    try {
        used = Number(wx.getStorageSync(KEYS.achievementGold)) || 0;
    } catch (e) {
        used = 0;
    }
    const cap = getAchievementGoldCap();
    const room = Math.max(0, cap - used);
    const gain = Math.min(want, room);
    if (gain <= 0) return 0;
    addBalance(gain);
    try {
        wx.setStorageSync(KEYS.achievementGold, used + gain);
    } catch (e) { /* ignore */ }
    return gain;
}

function getAchievementGoldUsed() {
    try {
        return Number(wx.getStorageSync(KEYS.achievementGold)) || 0;
    } catch (e) {
        return 0;
    }
}

/** 闯关榜生平首次上榜发金 +1（本地一次性） */
function grantFirstRankGold() {
    try {
        if (wx.getStorageSync(KEYS.firstRankClaimed)) return 0;
        wx.setStorageSync(KEYS.firstRankClaimed, 1);
        addBalance(1);
        return 1;
    } catch (e) {
        return 0;
    }
}

/** 排行复合键用：已通关各关最佳消行/块/时之和 */
function getRankSums() {
    let linesSum = 0;
    let piecesSum = 0;
    let timeSum = 0;
    let clearedCount = 0;
    getStages().forEach((s) => {
        const best = getStageBest(s.id);
        if (!best) return;
        clearedCount += 1;
        linesSum += Number(best.lines) || 0;
        piecesSum += Number(best.pieces) || 0;
        timeSum += Number(best.timeMs) || 0;
    });
    return { clearedCount, linesSum, piecesSum, timeSum };
}

module.exports = {
    getStages,
    getStage,
    getChapters,
    getStagesByChapter,
    isChapterUnlocked,
    getBalance,
    addBalance,
    spendBalance,
    isUnlocked,
    unlockStage,
    getStageBest,
    isCleared,
    isBetter,
    rewardClear,
    getClearedCount,
    getTotalStageCount,
    getAchievementGoldCap,
    grantAchievementGold,
    getAchievementGoldUsed,
    grantFirstRankGold,
    getRankSums,
};
