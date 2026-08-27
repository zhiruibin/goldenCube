/**
 * CoinManager - 金币经济管理器
 * 职责：
 *  - 统一读写金币余额（'gc_coins'）
 *  - 发放消行金币（单消 1 / 双消 2 / 三消 3 / 四消 5）
 *  - 每日获取上限（默认 600/天，仅限消行金币；成就/广告加成不计入上限）
 *  - 累计金币统计（'gc_stat_total_coins'，供收集系成就 total_coins 使用）
 *
 * 经济平衡目标（2025-08 调整）：
 *  - 技术决定单局收益：四消单行收益（2/行）是单消（1/行）的 2 倍
 *  - 每日上限决定日收益天花板：普通玩家 35-40 分钟触顶，肝帝 15-20 分钟触顶
 *  - 成就奖励与消行金币共用累计统计，但互不影响每日上限
 *  - 结算「看广告双倍金币」按本局已发消行币再发一份，不改分数/排行榜
 *
 * 2025-09 经济调整：
 *  - 广告双倍金币设独立日上限（AD_DAILY_CAP=300，单独统计；登录/抽奖等小额加成不设限）
 *  - T-Spin 消行金币加成：full +2 / mini +1（计入每日消行上限，激励技巧）
 */

/** 每日消行金币上限 */
const DAILY_LIMIT = 600;

/** 每日登录奖励（远小于消行产出，仅作回访钩子；不占日上限） */
const DAILY_LOGIN_REWARD = 20;

/** 广告双倍金币独立日上限（不计入消行每日上限，单独统计） */
const AD_DAILY_CAP = 300;

/** T-Spin 消行金币加成：full +2 / mini +1（计入每日消行上限） */
const T_SPIN_BONUS = {
    full: 2,
    mini: 1,
};

/** 消行档位奖励：单消1 / 双消2 / 三消3 / 四消5 */
const LINE_CLEAR_REWARDS = {
    1: 1,
    2: 2,
    3: 3,
    4: 5,
};

/** 存储键 */
const COINS_KEY = 'gc_coins';
const DAILY_KEY = 'gc_dailyCoinsEarned';
const DAILY_LOGIN_KEY = 'gc_dailyLoginClaimed';
const AD_DAILY_KEY = 'gc_dailyAdCoinsEarned';
const TOTAL_COINS_KEY = 'gc_stat_total_coins';

class CoinManager {
    constructor() {
        this._todayDate = '';
        this._todayEarned = 0;
        this._dailyLoaded = false;
        this._adTodayDate = '';
        this._adTodayEarned = 0;
        this._adDailyLoaded = false;
    }

    /** 今日日期字符串 YYYY-MM-DD */
    _today() {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    /** 加载/刷新今日记录（跨天自动归零） */
    _loadDaily() {
        const dateStr = this._today();
        if (this._dailyLoaded && this._todayDate === dateStr) {
            return;
        }
        try {
            const rec = wx.getStorageSync(DAILY_KEY) || {};
            if (rec && rec.date === dateStr) {
                this._todayDate = dateStr;
                this._todayEarned = rec.earned || 0;
            } else {
                this._todayDate = dateStr;
                this._todayEarned = 0;
                wx.setStorageSync(DAILY_KEY, { date: dateStr, earned: 0 });
            }
        } catch (e) {
            this._todayDate = dateStr;
            this._todayEarned = 0;
        }
        this._dailyLoaded = true;
    }

    _persistDaily() {
        try {
            wx.setStorageSync(DAILY_KEY, { date: this._todayDate, earned: this._todayEarned });
        } catch (e) {
            // 忽略存储异常
        }
    }

    /** 加载/刷新今日广告金币记录（跨天自动归零） */
    _loadAdDaily() {
        const dateStr = this._today();
        if (this._adDailyLoaded && this._adTodayDate === dateStr) {
            return;
        }
        try {
            const rec = wx.getStorageSync(AD_DAILY_KEY) || {};
            if (rec && rec.date === dateStr) {
                this._adTodayDate = dateStr;
                this._adTodayEarned = rec.earned || 0;
            } else {
                this._adTodayDate = dateStr;
                this._adTodayEarned = 0;
                wx.setStorageSync(AD_DAILY_KEY, { date: dateStr, earned: 0 });
            }
        } catch (e) {
            this._adTodayDate = dateStr;
            this._adTodayEarned = 0;
        }
        this._adDailyLoaded = true;
    }

    _persistAdDaily() {
        try {
            wx.setStorageSync(AD_DAILY_KEY, { date: this._adTodayDate, earned: this._adTodayEarned });
        } catch (e) {
            // 忽略存储异常
        }
    }

    /** 金币余额 */
    getCoins() {
        try {
            return wx.getStorageSync(COINS_KEY) || 0;
        } catch (e) {
            return 0;
        }
    }

    /** 今日已获得消行金币 */
    getTodayEarned() {
        this._loadDaily();
        return this._todayEarned;
    }

    /** 今日剩余可获消行金币 */
    getTodayRemaining() {
        return Math.max(0, DAILY_LIMIT - this.getTodayEarned());
    }

    /** 今日是否已达上限 */
    isTodayFull() {
        return this.getTodayEarned() >= DAILY_LIMIT;
    }

    /** 今日已获得广告双倍金币 */
    getTodayAdBonus() {
        this._loadAdDaily();
        return this._adTodayEarned;
    }

    /** 今日广告双倍剩余可获 */
    getAdBonusRemaining() {
        return Math.max(0, AD_DAILY_CAP - this.getTodayAdBonus());
    }

    /** 今日广告双倍是否已达上限 */
    isAdBonusFull() {
        return this.getTodayAdBonus() >= AD_DAILY_CAP;
    }

    /**
     * 发放消行金币（受每日上限约束；T-Spin 加成计入同一上限）
     * @param {number} count 本次消行数 1-4
     * @param {string} [tSpinType] T-Spin 类型 'full' | 'mini'，非 T-Spin 可省略
     * @returns {number} 实际发放金币数（触顶后为 0，或部分发放）
     */
    rewardLineClear(count, tSpinType) {
        const base = LINE_CLEAR_REWARDS[Math.max(1, Math.min(4, count))] || 0;
        const spinBonus = T_SPIN_BONUS[tSpinType] || 0;
        const total = base + spinBonus;
        if (total <= 0) return 0;
        this._loadDaily();
        if (this._todayEarned >= DAILY_LIMIT) return 0;
        const gain = Math.min(total, DAILY_LIMIT - this._todayEarned);
        if (gain <= 0) return 0;
        this._todayEarned += gain;
        this._addBalance(gain);
        this._persistDaily();
        return gain;
    }

    /**
     * 发放广告/活动加成金币（不计入每日消行上限，也不改今日进度展示）
     * 注意：结算「看广告双倍」请使用 rewardAdBonusCapped，本方法不设限
     * @param {number} amount 期望发放数量
     * @returns {number} 实际发放数量
     */
    rewardAdBonus(amount) {
        const gain = Math.max(0, Math.floor(Number(amount) || 0));
        if (gain <= 0) return 0;
        this._addBalance(gain);
        return gain;
    }

    /**
     * 发放广告双倍金币（受独立日上限 AD_DAILY_CAP 约束；仅用于结算广告，登录/抽奖不走此接口）
     * @param {number} amount 期望发放数量
     * @returns {number} 实际发放数量（触顶后为 0，或部分发放）
     */
    rewardAdBonusCapped(amount) {
        const want = Math.max(0, Math.floor(Number(amount) || 0));
        if (want <= 0) return 0;
        this._loadAdDaily();
        if (this._adTodayEarned >= AD_DAILY_CAP) return 0;
        const gain = Math.min(want, AD_DAILY_CAP - this._adTodayEarned);
        if (gain <= 0) return 0;
        this._adTodayEarned += gain;
        this._addBalance(gain);
        this._persistAdDaily();
        return gain;
    }

    /**
     * 尝试领取每日登录奖励（每天一次）
     * @returns {{ claimed: boolean, amount: number }} claimed=true 表示本次新领取成功
     */
    tryClaimDailyLogin() {
        const today = this._today();
        try {
            const last = wx.getStorageSync(DAILY_LOGIN_KEY) || '';
            if (last === today) {
                return { claimed: false, amount: 0 };
            }
            const amount = this.rewardAdBonus(DAILY_LOGIN_REWARD);
            if (amount > 0) {
                wx.setStorageSync(DAILY_LOGIN_KEY, today);
                return { claimed: true, amount };
            }
        } catch (e) {
            // 存储异常时不阻断首页
        }
        return { claimed: false, amount: 0 };
    }

    /** 增加余额与累计统计 */
    _addBalance(gain) {
        try {
            wx.setStorageSync(COINS_KEY, this.getCoins() + gain);
            const total = wx.getStorageSync(TOTAL_COINS_KEY) || 0;
            wx.setStorageSync(TOTAL_COINS_KEY, total + gain);
        } catch (e) {
            // 忽略存储异常
        }
    }
}

/** 全局单例 */
const coinManager = new CoinManager();

module.exports = {
    CoinManager,
    coinManager,
    DAILY_LIMIT,
    DAILY_LOGIN_REWARD,
    AD_DAILY_CAP,
    T_SPIN_BONUS,
    LINE_CLEAR_REWARDS,
};
