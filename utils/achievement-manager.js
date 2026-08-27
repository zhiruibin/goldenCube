/**
 * AchievementManager - 成就系统管理器
 * 职责：维护玩家统计进度、检测成就解锁、发放金币奖励、本地持久化
 */

const { getAllAchievements, getAchievementById } = require('../data/achievements');

/** 统计项存储键 */
const STAT_KEYS = {
    totalGames: 'stat_total_games',
    totalScore: 'stat_total_score',
    bestScore: 'stat_best_score',
    totalClears: 'stat_total_clears',
    clear1: 'stat_clear_1',
    clear2: 'stat_clear_2',
    clear3: 'stat_clear_3',
    clear4: 'stat_clear_4',
    tetrisCount: 'stat_tetris_count',
    tspinCount: 'stat_tspin_count',
    tspinDoubleCount: 'stat_tspin_double_count',
    maxCombo: 'stat_max_combo',
    maxB2B: 'stat_max_b2b',
    maxLevel: 'stat_max_level',
    maxSurvive: 'stat_max_survive',
    totalCoins: 'stat_total_coins',
    shareCount: 'stat_share_count',
    rankEnters: 'stat_rank_enters',
    bestRank: 'stat_best_rank',
    inviteCount: 'stat_invite_count',
    useAllPieces: 'stat_use_all_pieces',
};

const UNLOCKED_KEY = 'unlockedAchievements';
const LAST_NEW_KEY = 'lastNewAchievements';

class AchievementManager {
    constructor() {
        this._unlocked = [];
    }

    /** 加载已解锁成就列表 */
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
            wx.setStorageSync(STAT_KEYS[key], v);
        } catch (e) {
            // 忽略存储异常
        }
        return v;
    }

    setStat(key, value) {
        try {
            wx.setStorageSync(STAT_KEYS[key], value);
        } catch (e) {
            // 忽略存储异常
        }
        return value;
    }

    /** 上报一局游戏结果 */
    reportGameResult(result) {
        const stats = result.stats || {};
        this.addStat('totalGames', 1);
        this.addStat('totalScore', result.score || 0);
        if ((result.score || 0) > this.getStat('bestScore')) {
            this.setStat('bestScore', result.score || 0);
        }
        this.addStat('totalClears', result.lines || 0);
        this.addStat('tetrisCount', stats.tetrisCount || 0);
        if ((stats.maxCombo || 0) > this.getStat('maxCombo')) {
            this.setStat('maxCombo', stats.maxCombo || 0);
        }
        if ((stats.b2bCount || 0) > this.getStat('maxB2B')) {
            this.setStat('maxB2B', stats.b2bCount || 0);
        }
        if ((result.level || 1) > this.getStat('maxLevel')) {
            this.setStat('maxLevel', result.level || 1);
        }
        if ((result.duration || 0) > this.getStat('maxSurvive')) {
            this.setStat('maxSurvive', Math.floor(result.duration || 0));
        }
        return this.checkAll();
    }

    /** 上报单次消行（按行数计数） */
    reportLineClear(count) {
        const key = 'clear' + Math.max(1, Math.min(4, count));
        this.addStat(key, 1);
        return this.checkAll();
    }

    /** 上报 T-Spin 消行 */
    reportTSpin(lines) {
        this.addStat('tspinCount', 1);
        if (lines >= 2) this.addStat('tspinDoubleCount', 1);
        return this.checkAll();
    }

    /** 上报单局使用全部 7 种方块 */
    reportUseAllPieces() {
        this.setStat('useAllPieces', 1);
        return this.checkAll();
    }

    reportShare() {
        this.addStat('shareCount', 1);
        return this.checkAll();
    }

    reportRankEnter(rank) {
        this.addStat('rankEnters', 1);
        const best = this.getStat('bestRank');
        if (rank && rank > 0 && (best === 0 || rank < best)) {
            this.setStat('bestRank', rank);
        }
        return this.checkAll();
    }

    reportInvite() {
        this.addStat('inviteCount', 1);
        return this.checkAll();
    }

    /** 遍历所有成就，解锁满足条件的项，返回本次新解锁列表 */
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
            } catch (e) {
                // 忽略存储异常
            }
        }
        return newly;
    }

    /** 判断单个成就是否满足条件 */
    _evaluate(a) {
        const c = a.condition;
        if (!c) return false;
        switch (c.type) {
            case 'single_clear':
                return this.getStat('totalClears') >= (c.count || 1);
            case 'multi_clear': {
                const key = 'clear' + Math.max(1, Math.min(4, c.lines || 1));
                return this.getStat(key) >= (c.count || 1);
            }
            case 'single_score':
                return this.getStat('bestScore') >= (c.score || 0);
            case 'total_games':
                return this.getStat('totalGames') >= (c.count || 0);
            case 'total_clears':
                return this.getStat('totalClears') >= (c.count || 0);
            case 'survive_time':
                return this.getStat('maxSurvive') >= (c.seconds || 0);
            case 'tspin_clear':
                if (c.lines >= 2) return this.getStat('tspinDoubleCount') >= (c.count || 1);
                return this.getStat('tspinCount') >= (c.count || 1);
            case 'back_to_back':
                return this.getStat('maxB2B') >= (c.count || 0);
            case 'combo':
                return this.getStat('maxCombo') >= (c.count || 0);
            case 'max_level':
                return this.getStat('maxLevel') >= (c.level || 0);
            case 'use_all_pieces':
                return this.getStat('useAllPieces') >= 1;
            case 'total_coins':
                return this.getStat('totalCoins') >= (c.count || 0);
            case 'share':
                return this.getStat('shareCount') >= (c.count || 0);
            case 'enter_rank':
                return this.getStat('rankEnters') >= (c.count || 0);
            case 'rank_top': {
                const best = this.getStat('bestRank');
                return best > 0 && best <= (c.rank || 0);
            }
            case 'invite_friend':
                return this.getStat('inviteCount') >= (c.count || 0);
            default:
                return false;
        }
    }

    /** 解锁成就并发放金币奖励 */
    unlock(id) {
        if (this.isUnlocked(id)) return false;
        const a = getAchievementById(id);
        if (!a) return false;
        this._unlocked.push(id);
        try {
            wx.setStorageSync(UNLOCKED_KEY, this._unlocked);
        } catch (e) {
            // 忽略存储异常
        }
        if (a.reward) {
            const coins = wx.getStorageSync('coins') || 0;
            wx.setStorageSync('coins', coins + a.reward);
            this.addStat('totalCoins', a.reward);
        }
        return true;
    }

    /** 获取某成就的进度（用于展示） */
    getProgress(a) {
        const c = a.condition;
        if (!c) return { current: 0, target: 0 };
        switch (c.type) {
            case 'single_clear':
                return { current: Math.min(this.getStat('totalClears'), 1), target: 1 };
            case 'multi_clear': {
                const key = 'clear' + Math.max(1, Math.min(4, c.lines || 1));
                return { current: this.getStat(key), target: c.count || 1 };
            }
            case 'single_score':
                return { current: this.getStat('bestScore'), target: c.score || 0 };
            case 'total_games':
                return { current: this.getStat('totalGames'), target: c.count || 0 };
            case 'total_clears':
                return { current: this.getStat('totalClears'), target: c.count || 0 };
            case 'survive_time':
                return { current: this.getStat('maxSurvive'), target: c.seconds || 0 };
            case 'tspin_clear':
                if (c.lines >= 2) return { current: this.getStat('tspinDoubleCount'), target: c.count || 1 };
                return { current: this.getStat('tspinCount'), target: c.count || 1 };
            case 'back_to_back':
                return { current: this.getStat('maxB2B'), target: c.count || 0 };
            case 'combo':
                return { current: this.getStat('maxCombo'), target: c.count || 0 };
            case 'max_level':
                return { current: this.getStat('maxLevel'), target: c.level || 0 };
            case 'use_all_pieces':
                return { current: Math.min(this.getStat('useAllPieces'), 1), target: 1 };
            case 'total_coins':
                return { current: this.getStat('totalCoins'), target: c.count || 0 };
            case 'share':
                return { current: this.getStat('shareCount'), target: c.count || 0 };
            case 'enter_rank':
                return { current: this.getStat('rankEnters'), target: c.count || 0 };
            case 'rank_top':
                return { current: this.getStat('bestRank') || '-', target: c.rank || 0 };
            case 'invite_friend':
                return { current: this.getStat('inviteCount'), target: c.count || 0 };
            default:
                return { current: 0, target: 0 };
        }
    }

    /** 读取并清空上次新解锁成就记录（结算页展示用） */
    consumeLastNew() {
        let ids = [];
        try {
            ids = wx.getStorageSync(LAST_NEW_KEY) || [];
            wx.removeStorageSync(LAST_NEW_KEY);
        } catch (e) {
            ids = [];
        }
        return ids;
    }
}

/** 全局单例 */
const achievementManager = new AchievementManager();

module.exports = { AchievementManager, achievementManager };
