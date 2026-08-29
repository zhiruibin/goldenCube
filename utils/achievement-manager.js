/**
 * AchievementManager - 进度系 + 社交成就
 * 条件：通关数 / 章节全通 / 全通 / 解锁数 / 分享 / 邀请 / 挑战发起 / 应战 / 发起+应战双十 / 工坊发布 / 近十局全胜
 * 奖励：金方块走 goldenBlock.grantAchievementGold；金币走 coinManager.rewardAdBonus
 */

const { getAllAchievements, getAchievementById } = require('../data/achievements');
const goldenBlock = require('./golden-block-manager');

const STAT_KEYS = {
    shareCount: 'gc_stat_share_count',
    inviteCount: 'gc_stat_invite_count',
    challengeCreateCount: 'gc_stat_challenge_create',
    challengeRespondCount: 'gc_stat_challenge_respond',
    // 保留旧键以免残留代码报错
    totalGames: 'gc_stat_total_games',
    totalClears: 'gc_stat_total_clears',
    totalCoins: 'gc_stat_total_coins',
};

const UNLOCKED_KEY = 'gc_unlockedAchievements';
const LAST_NEW_KEY = 'gc_lastNewAchievements';
/** 最近挑战/应战结果（最多保留 20，判定取末尾 10） */
const CHALLENGE_RESULTS_KEY = 'gc_challenge_match_results';
const CHALLENGE_RESULTS_MAX = 20;

class AchievementManager {
    constructor() {
        this._unlocked = [];
    }

    init() {
        try {
            this._unlocked = wx.getStorageSync(UNLOCKED_KEY) || [];
        } catch (e) {
            this._unlocked = [];
        }
        return this;
    }

    isUnlocked(id) {
        return this._unlocked.indexOf(id) >= 0;
    }

    getUnlocked() {
        return this._unlocked.slice();
    }

    getStat(key) {
        try {
            return wx.getStorageSync(STAT_KEYS[key]) || 0;
        } catch (e) {
            return 0;
        }
    }

    addStat(key, delta) {
        const v = this.getStat(key) + (delta || 0);
        try {
            if (STAT_KEYS[key]) wx.setStorageSync(STAT_KEYS[key], v);
        } catch (e) { /* ignore */ }
        return v;
    }

    setStat(key, value) {
        try {
            if (STAT_KEYS[key]) wx.setStorageSync(STAT_KEYS[key], value);
        } catch (e) { /* ignore */ }
        return value;
    }

    /** 闯关通关后调用：刷新进度成就 */
    reportStageProgress() {
        return this.checkAll();
    }

    /** 兼容旧局末上报（经典模式遗留）；闯关请用 reportStageProgress */
    reportGameResult() {
        return this.checkAll();
    }

    reportLineClear() { return []; }
    reportTSpin() { return []; }
    reportUseAllPieces() { return []; }

    reportShare() {
        this.addStat('shareCount', 1);
        return this.checkAll();
    }

    reportRankEnter() { return []; }

    reportInvite() {
        this.addStat('inviteCount', 1);
        return this.checkAll();
    }

    /** 成功创建一条好友挑战（发起） */
    reportChallengeCreate() {
        this.addStat('challengeCreateCount', 1);
        return this.checkAll();
    }

    /** 工坊关卡成功发布到广场（须已自通） */
    reportWorkshopPublished() {
        return this.checkAll();
    }

    /**
     * 成功应战写回
     * @param {string} result challenger_win | responder_win | tie
     * @param {object} [meta]
     */
    reportChallengeRespond(result, meta) {
        this.addStat('challengeRespondCount', 1);
        const challengeId = meta && meta.challengeId ? String(meta.challengeId) : '';
        this._pushMatchResult({
            id: challengeId || ('respond_' + Date.now()),
            role: 'responder',
            won: result === 'responder_win',
            ts: Date.now(),
        });
        return this.checkAll();
    }

    /**
     * 用云端「已完成」列表同步近局胜负（补齐作为发起方的结果）
     * @param {Array} completedList getMyChallenges().completed
     */
    syncCompletedChallenges(completedList) {
        if (!Array.isArray(completedList) || completedList.length === 0) return [];
        let hist = this._getMatchResults();
        const byId = {};
        hist.forEach((r) => { if (r && r.id) byId[r.id] = r; });

        const sorted = completedList.slice().sort((a, b) => {
            const ta = Number(a && (a.completedAt || a.updatedAt || a.createdAt)) || 0;
            const tb = Number(b && (b.completedAt || b.updatedAt || b.createdAt)) || 0;
            return ta - tb;
        });

        for (const item of sorted) {
            if (!item || !item.challengeId) continue;
            const id = String(item.challengeId);
            const role = item.myRole === 'responder' ? 'responder' : 'challenger';
            const result = item.result;
            let won = false;
            if (role === 'challenger') won = result === 'challenger_win';
            else won = result === 'responder_win';
            const ts = Number(item.completedAt || item.updatedAt || item.createdAt) || Date.now();
            byId[id] = { id, role, won: !!won, ts };
        }

        hist = Object.keys(byId).map((k) => byId[k])
            .sort((a, b) => (a.ts || 0) - (b.ts || 0));
        if (hist.length > CHALLENGE_RESULTS_MAX) {
            hist = hist.slice(hist.length - CHALLENGE_RESULTS_MAX);
        }
        this._saveMatchResults(hist);
        return this.checkAll();
    }

    _getMatchResults() {
        try {
            const raw = wx.getStorageSync(CHALLENGE_RESULTS_KEY) || [];
            return Array.isArray(raw) ? raw : [];
        } catch (e) {
            return [];
        }
    }

    _saveMatchResults(list) {
        try {
            wx.setStorageSync(CHALLENGE_RESULTS_KEY, list);
        } catch (e) { /* ignore */ }
    }

    _pushMatchResult(entry) {
        if (!entry || !entry.id) return;
        let hist = this._getMatchResults().filter((r) => r && r.id !== entry.id);
        hist.push({
            id: String(entry.id),
            role: entry.role || '',
            won: !!entry.won,
            ts: entry.ts || Date.now(),
        });
        if (hist.length > CHALLENGE_RESULTS_MAX) {
            hist = hist.slice(hist.length - CHALLENGE_RESULTS_MAX);
        }
        this._saveMatchResults(hist);
    }

    _last10Matches() {
        const hist = this._getMatchResults();
        return hist.slice(Math.max(0, hist.length - 10));
    }

    _isLast10AllWin() {
        const last = this._last10Matches();
        return last.length >= 10 && last.every((r) => r && r.won);
    }

    _countWorkshopPublished() {
        try {
            const workshop = require('./workshop-manager');
            return workshop.listStages().filter((s) => s && s.status === workshop.STATUS.published).length;
        } catch (e) {
            return 0;
        }
    }

    checkAll() {
        this.init();
        const all = getAllAchievements();
        const newly = [];
        for (const a of all) {
            if (this.isUnlocked(a.id)) continue;
            if (this._evaluate(a)) {
                if (this.unlock(a.id)) newly.push(a);
            }
        }
        if (newly.length > 0) {
            try {
                wx.setStorageSync(LAST_NEW_KEY, newly.map((a) => a.id));
            } catch (e) { /* ignore */ }
        }
        return newly;
    }

    _countUnlockedStages() {
        return goldenBlock.getStages().filter((s) => goldenBlock.isUnlocked(s.id)).length;
    }

    _isChapterCleared(chapterId) {
        const stages = goldenBlock.getStagesByChapter(chapterId);
        return stages.length > 0 && stages.every((s) => goldenBlock.isCleared(s.id));
    }

    _evaluate(a) {
        const c = a.condition;
        if (!c) return false;
        switch (c.type) {
            case 'stage_clear_count':
                return goldenBlock.getClearedCount() >= (c.count || 0);
            case 'chapter_clear':
                return this._isChapterCleared(c.chapterId);
            case 'all_stages_clear':
                return goldenBlock.getClearedCount() >= goldenBlock.getTotalStageCount()
                    && goldenBlock.getTotalStageCount() > 0;
            case 'unlock_count':
                return this._countUnlockedStages() >= (c.count || 0);
            case 'share':
                return this.getStat('shareCount') >= (c.count || 1);
            case 'invite_friend':
                return this.getStat('inviteCount') >= (c.count || 1);
            case 'challenge_create':
                return this.getStat('challengeCreateCount') >= (c.count || 1);
            case 'challenge_respond':
                return this.getStat('challengeRespondCount') >= (c.count || 1);
            case 'challenge_create_and_respond': {
                const need = c.count || 10;
                return this.getStat('challengeCreateCount') >= need
                    && this.getStat('challengeRespondCount') >= need;
            }
            case 'workshop_publish':
                return this._countWorkshopPublished() >= (c.count || 1);
            case 'challenge_last10_all_win':
                return this._isLast10AllWin();
            default:
                return false;
        }
    }

    unlock(id) {
        if (this.isUnlocked(id)) return false;
        const a = getAchievementById(id);
        if (!a) return false;
        this._unlocked.push(id);
        try {
            wx.setStorageSync(UNLOCKED_KEY, this._unlocked);
        } catch (e) { /* ignore */ }

        const gold = Number(a.rewardGold) || 0;
        if (gold > 0) {
            goldenBlock.grantAchievementGold(gold);
        }
        const coins = Number(a.rewardCoins) || Number(a.reward) || 0;
        if (coins > 0) {
            try {
                const { coinManager } = require('./coin-manager');
                coinManager.rewardAdBonus(coins);
            } catch (e) { /* ignore */ }
        }
        return true;
    }

    getProgress(a) {
        const c = a.condition;
        if (!c) return { current: 0, target: 0 };
        switch (c.type) {
            case 'stage_clear_count':
                return { current: goldenBlock.getClearedCount(), target: c.count || 0 };
            case 'chapter_clear':
                return {
                    current: this._isChapterCleared(c.chapterId) ? 1 : 0,
                    target: 1,
                };
            case 'all_stages_clear':
                return {
                    current: goldenBlock.getClearedCount(),
                    target: goldenBlock.getTotalStageCount(),
                };
            case 'unlock_count':
                return { current: this._countUnlockedStages(), target: c.count || 0 };
            case 'share':
                return { current: this.getStat('shareCount'), target: c.count || 1 };
            case 'invite_friend':
                return { current: this.getStat('inviteCount'), target: c.count || 1 };
            case 'challenge_create':
                return { current: this.getStat('challengeCreateCount'), target: c.count || 1 };
            case 'challenge_respond':
                return { current: this.getStat('challengeRespondCount'), target: c.count || 1 };
            case 'challenge_create_and_respond': {
                const need = c.count || 10;
                const create = this.getStat('challengeCreateCount');
                const respond = this.getStat('challengeRespondCount');
                return { current: Math.min(create, respond), target: need };
            }
            case 'workshop_publish':
                return { current: this._countWorkshopPublished(), target: c.count || 1 };
            case 'challenge_last10_all_win': {
                const last = this._last10Matches();
                const wins = last.filter((r) => r && r.won).length;
                return { current: wins, target: c.count || 10 };
            }
            default:
                return { current: 0, target: 0 };
        }
    }

    consumeLastNew() {
        try {
            const ids = wx.getStorageSync(LAST_NEW_KEY) || [];
            wx.removeStorageSync(LAST_NEW_KEY);
            return ids;
        } catch (e) {
            return [];
        }
    }
}

const achievementManager = new AchievementManager();
achievementManager.init();

module.exports = {
    achievementManager,
};
