/**
 * CoinManager - 金币经济（挖个方块）
 *  - 通关效率结算 rewardStageClear（日限 DAILY_LIMIT=300）
 *  - 广告翻倍 rewardAdDouble（独立 AD_DOUBLE_LIMIT=300）
 *  - 入场费 spendEntryFee / 失败退还 refundEntryFee
 *  - 每日登录 +20；每日福利广告走 rewardDailyWelfare(+30)
 * 废弃：消行即时发币 rewardLineClear（保留空壳兼容旧调用，恒返回 0）
 */

const DAILY_LIMIT = 300;
const AD_DOUBLE_LIMIT = 300;
const DAILY_LOGIN_REWARD = 20;
const DAILY_WELFARE_REWARD = 30;

/** 兼容导出：旧消行表已废弃 */
const LINE_CLEAR_REWARDS = {};
const T_SPIN_BONUS = {};
const AD_DAILY_CAP = AD_DOUBLE_LIMIT;

const COINS_KEY = 'gc_coins';
const DAILY_KEY = 'gc_dailyCoinsEarned';
const DAILY_LOGIN_KEY = 'gc_dailyLoginClaimed';
const AD_DAILY_KEY = 'gc_dailyAdCoinsEarned';
const WELFARE_KEY = 'gc_dailyWelfareClaimed';
const TOTAL_COINS_KEY = 'gc_stat_total_coins';
const FREE_ENTRY_KEY = 'gc_dailyFreeEntry';
const FREE_RETRY_KEY = 'gc_dailyFreeRetry';

const FREE_ENTRY_DAILY = 10;
const FREE_RETRY_DAILY = 3;
/** 工坊广场通关独立日池（不产金方块） */
const WORKSHOP_CLEAR_DAILY = 120;
const WORKSHOP_DAILY_KEY = 'gc_workshopDailyCoins';

class CoinManager {
    constructor() {
        this._todayDate = '';
        this._todayEarned = 0;
        this._dailyLoaded = false;
        this._adTodayDate = '';
        this._adTodayEarned = 0;
        this._adDailyLoaded = false;
    }

    _today() {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    _loadDaily() {
        const dateStr = this._today();
        if (this._dailyLoaded && this._todayDate === dateStr) return;
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
        } catch (e) { /* ignore */ }
    }

    _loadAdDaily() {
        const dateStr = this._today();
        if (this._adDailyLoaded && this._adTodayDate === dateStr) return;
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
        } catch (e) { /* ignore */ }
    }

    getCoins() {
        try {
            return Number(wx.getStorageSync(COINS_KEY)) || 0;
        } catch (e) {
            return 0;
        }
    }

    getTodayEarned() {
        this._loadDaily();
        return this._todayEarned;
    }

    getTodayRemaining() {
        return Math.max(0, DAILY_LIMIT - this.getTodayEarned());
    }

    isTodayFull() {
        return this.getTodayEarned() >= DAILY_LIMIT;
    }

    getTodayAdBonus() {
        this._loadAdDaily();
        return this._adTodayEarned;
    }

    getAdBonusRemaining() {
        return Math.max(0, AD_DOUBLE_LIMIT - this.getTodayAdBonus());
    }

    isAdBonusFull() {
        return this.getTodayAdBonus() >= AD_DOUBLE_LIMIT;
    }

    /**
     * 计算通关效率金币（不计日限，纯公式）
     * @param {number} lines 实际消行
     * @param {number} minLines 理论最少
     * @param {number} [coinThreshold] T，缺省 minLines*2
     */
    calcStageClearReward(lines, minLines, coinThreshold) {
        const ml = Math.max(1, Number(minLines) || 1);
        const T = Math.max(ml, Number(coinThreshold) || ml * 2);
        const raw = Number(lines);
        const linesP = isNaN(raw) ? T : Math.max(ml, Math.min(T, raw));
        if (T === ml) {
            return linesP <= ml ? 100 : 20;
        }
        const gold = 20 + Math.round(((T - linesP) / (T - ml)) * 80);
        return Math.max(20, Math.min(100, gold));
    }

    /**
     * 通关效率结算（基础池日限 300）
     * @returns {{ want: number, gained: number, remaining: number }}
     */
    rewardStageClear(lines, minLines, coinThreshold) {
        const want = this.calcStageClearReward(lines, minLines, coinThreshold);
        this._loadDaily();
        if (this._todayEarned >= DAILY_LIMIT) {
            return { want, gained: 0, remaining: 0 };
        }
        const gained = Math.min(want, DAILY_LIMIT - this._todayEarned);
        if (gained > 0) {
            this._todayEarned += gained;
            this._addBalance(gained);
            this._persistDaily();
        }
        return { want, gained, remaining: Math.max(0, DAILY_LIMIT - this._todayEarned) };
    }

    /**
     * 结算广告再领一份（翻倍池，独立日限 300）
     * @param {number} baseAmount 本局基础结算 want（或实际 gained）
     */
    rewardAdDouble(baseAmount) {
        return this.rewardAdBonusCapped(baseAmount);
    }

    /** @deprecated 消行即时发币已废弃，恒返回 0 */
    rewardLineClear() {
        return 0;
    }

    rewardAdBonus(amount) {
        const gain = Math.max(0, Math.floor(Number(amount) || 0));
        if (gain <= 0) return 0;
        this._addBalance(gain);
        return gain;
    }

    rewardAdBonusCapped(amount) {
        const want = Math.max(0, Math.floor(Number(amount) || 0));
        if (want <= 0) return 0;
        this._loadAdDaily();
        if (this._adTodayEarned >= AD_DOUBLE_LIMIT) return 0;
        const gain = Math.min(want, AD_DOUBLE_LIMIT - this._adTodayEarned);
        if (gain <= 0) return 0;
        this._adTodayEarned += gain;
        this._addBalance(gain);
        this._persistAdDaily();
        return gain;
    }

    tryClaimDailyLogin() {
        const today = this._today();
        try {
            const last = wx.getStorageSync(DAILY_LOGIN_KEY) || '';
            if (last === today) return { claimed: false, amount: 0 };
            const amount = this.rewardAdBonus(DAILY_LOGIN_REWARD);
            if (amount > 0) {
                wx.setStorageSync(DAILY_LOGIN_KEY, today);
                return { claimed: true, amount };
            }
        } catch (e) { /* ignore */ }
        return { claimed: false, amount: 0 };
    }

    /** 每日福利广告 +30（日 1 次，不占基础/翻倍池） */
    tryClaimDailyWelfare() {
        const today = this._today();
        try {
            const last = wx.getStorageSync(WELFARE_KEY) || '';
            if (last === today) return { claimed: false, amount: 0 };
            const amount = this.rewardAdBonus(DAILY_WELFARE_REWARD);
            if (amount > 0) {
                wx.setStorageSync(WELFARE_KEY, today);
                return { claimed: true, amount };
            }
        } catch (e) { /* ignore */ }
        return { claimed: false, amount: 0 };
    }

    isDailyWelfareClaimed() {
        try {
            return (wx.getStorageSync(WELFARE_KEY) || '') === this._today();
        } catch (e) {
            return false;
        }
    }

    // ---------- 入场费 ----------

    /** 章节 id：1..n（按每章 10 关） */
    getChapterIdByStageId(stageId) {
        const id = Number(stageId) || 1;
        return Math.floor((id - 1) / 10) + 1;
    }

    /** 入场费：前 3 关 0；第 1 章 5；第 2 章 10；第 3 章及以后 15 */
    getEntryFee(stageId) {
        const id = Number(stageId) || 0;
        if (id <= 3) return 0;
        const chapter = this.getChapterIdByStageId(id);
        if (chapter <= 1) return 5;
        if (chapter === 2) return 10;
        return 15;
    }

    /**
     * 扣入场费
     * @returns {{ ok: boolean, fee: number, paid: number, reason?: string }}
     */
    spendEntryFee(stageId) {
        const fee = this.getEntryFee(stageId);
        if (fee <= 0) return { ok: true, fee: 0, paid: 0 };
        const bal = this.getCoins();
        if (bal < fee) return { ok: false, fee, paid: 0, reason: 'no-coins' };
        try {
            wx.setStorageSync(COINS_KEY, bal - fee);
        } catch (e) {
            return { ok: false, fee, paid: 0, reason: 'storage' };
        }
        return { ok: true, fee, paid: fee };
    }

    /** 失败退还 50%（向下取整），仅对实付金额 */
    refundEntryFee(paidAmount) {
        const paid = Math.max(0, Math.floor(Number(paidAmount) || 0));
        const refund = Math.floor(paid * 0.5);
        if (refund > 0) this._addBalance(refund);
        return refund;
    }

    // ---------- 广告免费入场 / 重试次数 ----------

    _loadCountKey(key) {
        const today = this._today();
        try {
            const rec = wx.getStorageSync(key) || {};
            if (rec && rec.date === today) return rec.count || 0;
            wx.setStorageSync(key, { date: today, count: 0 });
            return 0;
        } catch (e) {
            return 0;
        }
    }

    _bumpCountKey(key, max) {
        const today = this._today();
        const n = this._loadCountKey(key);
        if (n >= max) return false;
        try {
            wx.setStorageSync(key, { date: today, count: n + 1 });
        } catch (e) {
            return false;
        }
        return true;
    }

    getFreeEntryRemaining() {
        return Math.max(0, FREE_ENTRY_DAILY - this._loadCountKey(FREE_ENTRY_KEY));
    }

    consumeFreeEntry() {
        return this._bumpCountKey(FREE_ENTRY_KEY, FREE_ENTRY_DAILY);
    }

    getFreeRetryRemaining() {
        return Math.max(0, FREE_RETRY_DAILY - this._loadCountKey(FREE_RETRY_KEY));
    }

    consumeFreeRetry() {
        return this._bumpCountKey(FREE_RETRY_KEY, FREE_RETRY_DAILY);
    }

    // ---------- 工坊通关日池（与主线 300 分离） ----------

    _loadWorkshopDaily() {
        const dateStr = this._today();
        try {
            const rec = wx.getStorageSync(WORKSHOP_DAILY_KEY) || {};
            if (rec && rec.date === dateStr) {
                this._workshopTodayEarned = rec.earned || 0;
                this._workshopTodayDate = dateStr;
                return;
            }
            wx.setStorageSync(WORKSHOP_DAILY_KEY, { date: dateStr, earned: 0 });
        } catch (e) { /* ignore */ }
        this._workshopTodayEarned = 0;
        this._workshopTodayDate = dateStr;
    }

    _persistWorkshopDaily() {
        try {
            wx.setStorageSync(WORKSHOP_DAILY_KEY, {
                date: this._workshopTodayDate || this._today(),
                earned: this._workshopTodayEarned || 0,
            });
        } catch (e) { /* ignore */ }
    }

    getWorkshopTodayRemaining() {
        this._loadWorkshopDaily();
        return Math.max(0, WORKSHOP_CLEAR_DAILY - (this._workshopTodayEarned || 0));
    }

    /**
     * 工坊/广场通关发币（独立日限；永不发金方块）
     * @returns {number} 实际获得
     */
    rewardWorkshopClear(wantAmount) {
        const want = Math.max(0, Math.floor(Number(wantAmount) || 0));
        if (want <= 0) return 0;
        this._loadWorkshopDaily();
        if (this._workshopTodayEarned >= WORKSHOP_CLEAR_DAILY) return 0;
        const gained = Math.min(want, WORKSHOP_CLEAR_DAILY - this._workshopTodayEarned);
        if (gained <= 0) return 0;
        this._workshopTodayEarned += gained;
        this._addBalance(gained);
        this._persistWorkshopDaily();
        return gained;
    }

    _addBalance(gain) {
        try {
            wx.setStorageSync(COINS_KEY, this.getCoins() + gain);
            const total = wx.getStorageSync(TOTAL_COINS_KEY) || 0;
            wx.setStorageSync(TOTAL_COINS_KEY, total + gain);
        } catch (e) { /* ignore */ }
    }
}

const coinManager = new CoinManager();

module.exports = {
    CoinManager,
    coinManager,
    DAILY_LIMIT,
    DAILY_LOGIN_REWARD,
    DAILY_WELFARE_REWARD,
    AD_DOUBLE_LIMIT,
    AD_DAILY_CAP,
    T_SPIN_BONUS,
    LINE_CLEAR_REWARDS,
    FREE_ENTRY_DAILY,
    FREE_RETRY_DAILY,
    WORKSHOP_CLEAR_DAILY,
};
