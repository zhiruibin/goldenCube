/**
 * utils/golden-block-manager.js
 * 金色方块：进度货币
 *  - 首通 +1；破纪录 +1/关且每关封顶 2 次（不含首通）
 *  - 章节全通 +1/章；全通全部关卡里程碑 +10
 *  - 成就发金累计校验（3 章表 +8 / 10 章表 +15）
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
    lastChapterIndex: 'gc_lastChapterIndex',
};

/** 全通关卡数：以 stages 长度为准（30 或 100） */
function getTotalStageCount() {
    return (STAGES_DATA.stages || []).length;
}

/** 成就发金生涯上限：≥100 关用 15，否则 8 */
function getAchievementGoldCap() {
    return getTotalStageCount() >= 100 ? 15 : 8;
}

function getStages() {
    return STAGES_DATA.stages || [];
}

function getStage(id) {
    const nid = Number(id);
    return getStages().find((s) => s.id === nid) || null;
}

/** 演示关：仅首通发金方块，重玩不计破纪录奖励 */
function isTutorialStage(id) {
    const stage = getStage(id);
    return !!(stage && stage.kind === 'tutorial');
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

/** 已通关的关自动视为已解锁（升级 unlockCost 后兼容老存档，不重复扣金） */
function syncUnlockedFromProgress() {
    const list = getUnlocked();
    let changed = false;
    getStages().forEach((s) => {
        if (!s || s.unlockCost === 0) return;
        if (isCleared(s.id) && list.indexOf(s.id) < 0) {
            list.push(s.id);
            changed = true;
        }
    });
    if (changed) _saveUnlocked(list);
    return changed;
}

/** 合法个人最佳：至少消过 1 行（拒绝 lines:0 等幽灵纪录，避免永久堵死首通/破纪录） */
function _isValidBest(rec) {
    return !!(rec
        && typeof rec === 'object'
        && typeof rec.lines === 'number'
        && isFinite(rec.lines)
        && rec.lines >= 1);
}

function getStageBest(id) {
    try {
        const raw = wx.getStorageSync(KEYS.bestPrefix + Number(id));
        if (!_isValidBest(raw)) {
            // 清掉非法/空纪录，避免「以为首通却提示未刷新」
            if (raw) {
                try { wx.removeStorageSync(KEYS.bestPrefix + Number(id)); } catch (e2) { /* ignore */ }
            }
            return null;
        }
        return raw;
    } catch (e) {
        return null;
    }
}

function isBetter(a, b) {
    if (!_isValidBest(b)) return true;
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
    if (!_isValidBest(rec)) return;
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
 * 通关结算：首通 +1；破纪录（非首通）+1 且每关最多 2 次；章全通 +1；全通里程碑 +10
 * @returns {{ first, isNewBest, reward, chapterReward, milestoneReward, best, clearedCount }}
 */
function rewardClear(id, lines, pieces, timeMs) {
    const rec = { lines, pieces: pieces || 0, timeMs: timeMs || 0 };
    const prev = getStageBest(id);
    const first = !prev;
    let isNewBest = !prev || isBetter(rec, prev);
    let reward = 0;
    const tutorial = isTutorialStage(id);

    if (tutorial) {
        if (first) {
            reward = 1;
            _saveStageBest(id, rec);
        } else if (isNewBest) {
            _saveStageBest(id, rec);
            isNewBest = false;
        }
    } else if (first) {
        reward = 1;
        _saveStageBest(id, rec);
    } else if (isNewBest) {
        const cnt = _getRecordRewardCount(id);
        if (cnt < 2) {
            reward = 1;
            _setRecordRewardCount(id, cnt + 1);
        }
        _saveStageBest(id, rec);
    }

    if (reward > 0) addBalance(reward);

    let chapterReward = 0;
    const stage = getStage(id);
    if (stage) {
        setLastChapterIndex(getChapterIndexByStageId(id));
        const cid = Number(stage.chapterId) || Math.floor((Number(id) - 1) / 10) + 1;
        const chapterStages = getStagesByChapter(cid);
        const allCleared = chapterStages.length > 0 && chapterStages.every((s) => isCleared(s.id));
        if (allCleared) {
            const cleared = _getChaptersCleared();
            if (cleared.indexOf(cid) < 0) {
                cleared.push(cid);
                _saveChaptersCleared(cleared);
                chapterReward = 1;
                addBalance(1);
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

/** 章节索引（0-based）→ 关卡 id 所属章 */
function getChapterIndexByStageId(stageId) {
    const stage = getStage(stageId);
    if (!stage) return 0;
    const chapters = getChapters();
    const chapterId = Number(stage.chapterId) || Math.floor((Number(stage.id) - 1) / 10) + 1;
    const idx = chapters.findIndex((c) => Number(c.id) === chapterId);
    return idx >= 0 ? idx : 0;
}

function getLastChapterIndex() {
    try {
        const v = wx.getStorageSync(KEYS.lastChapterIndex);
        if (v === '' || v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    } catch (e) {
        return null;
    }
}

function setLastChapterIndex(index) {
    const chapters = getChapters();
    if (!chapters.length) return 0;
    const maxIdx = chapters.length - 1;
    const idx = Math.max(0, Math.min(maxIdx, Math.floor(Number(index) || 0)));
    try {
        wx.setStorageSync(KEYS.lastChapterIndex, idx);
    } catch (e) { /* ignore */ }
    return idx;
}

/** 按进度推断当前章节：首个未通关关卡所在章；全通则最后一章 */
function getProgressChapterIndex() {
    const chapters = getChapters();
    if (!chapters.length) return 0;
    const stages = getStages();
    for (let i = 0; i < stages.length; i++) {
        if (!isCleared(stages[i].id)) {
            return getChapterIndexByStageId(stages[i].id);
        }
    }
    return chapters.length - 1;
}

/**
 * 进入闯关页时的初始章节：优先 params，其次上次浏览/游玩，再次进度推断
 * @param {{ chapterIndex?: number, chapterId?: number, stageId?: number }} [options]
 */
function resolveInitialChapterIndex(options) {
    const chapters = getChapters();
    if (!chapters.length) return 0;
    const maxIdx = chapters.length - 1;
    const opts = options || {};

    if (typeof opts.chapterIndex === 'number' && Number.isFinite(opts.chapterIndex)) {
        return Math.max(0, Math.min(maxIdx, Math.floor(opts.chapterIndex)));
    }
    if (typeof opts.chapterId === 'number' && Number.isFinite(opts.chapterId)) {
        const byId = chapters.findIndex((c) => Number(c.id) === Number(opts.chapterId));
        if (byId >= 0) return byId;
    }
    if (typeof opts.stageId === 'number' && Number.isFinite(opts.stageId)) {
        return getChapterIndexByStageId(opts.stageId);
    }

    const saved = getLastChapterIndex();
    if (saved !== null) {
        return Math.max(0, Math.min(maxIdx, saved));
    }
    return getProgressChapterIndex();
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
    isTutorialStage,
    getChapters,
    getStagesByChapter,
    isChapterUnlocked,
    getBalance,
    addBalance,
    spendBalance,
    isUnlocked,
    unlockStage,
    syncUnlockedFromProgress,
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
    getChapterIndexByStageId,
    getLastChapterIndex,
    setLastChapterIndex,
    getProgressChapterIndex,
    resolveInitialChapterIndex,
};
