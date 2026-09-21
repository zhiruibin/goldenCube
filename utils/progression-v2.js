/**
 * 无金币版本的进度与激励视频额度。
 * - 金方块仍由 golden-block-manager 管理
 * - 激励视频只授予“指定关卡永久解锁”或“本局回退”
 * - 登录仅累计自然日并解锁纪念徽章，不发放任何资源
 */

const ECONOMY_VERSION_KEY = 'gc_economyVersion';
const ECONOMY_VERSION = 2;
const AD_QUOTA_KEY = 'gc_rewardedQuota_v2';
const LOGIN_KEY = 'gc_loginProgress_v1';

const AD_LIMITS = {
    officialUnlock: 1,
    plazaUnlock: 2,
};

const LOGIN_BADGES = [
    { id: 'login_7', days: 7, name: '初识方界', description: '累计登录 7 天' },
    { id: 'login_30', days: 30, name: '方块旅人', description: '累计登录 30 天' },
    { id: 'login_100', days: 100, name: '百日筑梦', description: '累计登录 100 天' },
    { id: 'login_365', days: 365, name: '岁月典藏', description: '累计登录 365 天' },
];

const LEGACY_COIN_KEYS = [
    'gc_coins',
    'gc_dailyCoinsEarned',
    'gc_dailyLoginClaimed',
    'gc_dailyAdCoinsEarned',
    'gc_dailyWelfareClaimed',
    'gc_dailyFreeEntry',
    'gc_dailyFreeRetry',
    'gc_workshopDailyCoins',
];

function _get(key, fallback) {
    try {
        const value = wx.getStorageSync(key);
        return value === '' || value == null ? fallback : value;
    } catch (e) { return fallback; }
}

function _set(key, value) {
    try { wx.setStorageSync(key, value); return true; } catch (e) { return false; }
}

function _beijingDay(now) {
    const utc = (now == null ? Date.now() : Number(now)) + 8 * 60 * 60 * 1000;
    return new Date(utc).toISOString().slice(0, 10);
}

function migrate() {
    const current = Number(_get(ECONOMY_VERSION_KEY, 0)) || 0;
    if (current >= ECONOMY_VERSION) return { changed: false, version: current };

    try {
        const goldenBlock = require('./golden-block-manager');
        goldenBlock.migrateClearRecords();
    } catch (e) { /* migration remains retryable */ }

    // 已购买皮肤由既有 owned 列表永久保留；只移除已废弃的货币运行态。
    LEGACY_COIN_KEYS.forEach((key) => {
        try { wx.removeStorageSync(key); } catch (e) { /* ignore */ }
    });
    _set(ECONOMY_VERSION_KEY, ECONOMY_VERSION);
    return { changed: true, version: ECONOMY_VERSION };
}

function _quota() {
    const day = _beijingDay();
    const raw = _get(AD_QUOTA_KEY, {}) || {};
    if (raw.day !== day) return { day, officialUnlock: 0, plazaUnlock: 0 };
    return {
        day,
        officialUnlock: Math.max(0, Number(raw.officialUnlock) || 0),
        plazaUnlock: Math.max(0, Number(raw.plazaUnlock) || 0),
    };
}

function getRewardedRemaining(kind) {
    const limit = AD_LIMITS[kind] || 0;
    return Math.max(0, limit - (_quota()[kind] || 0));
}

function consumeRewardedUnlock(kind) {
    if (!AD_LIMITS[kind]) return false;
    const quota = _quota();
    if (quota[kind] >= AD_LIMITS[kind]) return false;
    quota[kind] += 1;
    return _set(AD_QUOTA_KEY, quota);
}

function getLoginProgress() {
    const raw = _get(LOGIN_KEY, {}) || {};
    return {
        lastLoginDay: String(raw.lastLoginDay || ''),
        totalLoginDays: Math.max(0, Number(raw.totalLoginDays) || 0),
        earnedBadgeIds: Array.isArray(raw.earnedBadgeIds) ? raw.earnedBadgeIds.slice() : [],
    };
}

function _applyLoginDay(progress, day) {
    const next = Object.assign({}, progress);
    if (next.lastLoginDay !== day) {
        next.lastLoginDay = day;
        next.totalLoginDays = Math.max(0, Number(next.totalLoginDays) || 0) + 1;
    }
    const earned = Array.isArray(next.earnedBadgeIds) ? next.earnedBadgeIds.slice() : [];
    const newlyEarned = [];
    LOGIN_BADGES.forEach((badge) => {
        if (next.totalLoginDays < badge.days || earned.indexOf(badge.id) >= 0) return;
        earned.push(badge.id);
        newlyEarned.push(badge.id);
    });
    next.earnedBadgeIds = earned;
    return { progress: next, newlyEarned };
}

/**
 * 启动时记录登录。云端可用时以云函数时间为准；离线时本地累计，云存档会随后同步。
 */
function recordLogin(cloudService) {
    if (cloudService && cloudService.isAvailable && cloudService.isAvailable()
        && typeof cloudService.recordLoginDay === 'function') {
        return cloudService.recordLoginDay(getLoginProgress()).then((result) => {
            if (result && result.success && result.progress) {
                _set(LOGIN_KEY, result.progress);
                try { require('./badge-progress-signal').invalidate('memorial'); } catch (e) { /* ignore */ }
                return result;
            }
            return recordLoginLocal();
        }).catch(() => recordLoginLocal());
    }
    return Promise.resolve(recordLoginLocal());
}

function recordLoginLocal() {
    const applied = _applyLoginDay(getLoginProgress(), _beijingDay());
    _set(LOGIN_KEY, applied.progress);
    try { require('./badge-progress-signal').invalidate('memorial'); } catch (e) { /* ignore */ }
    return { success: true, offline: true, progress: applied.progress, newlyEarned: applied.newlyEarned };
}

module.exports = {
    ECONOMY_VERSION,
    AD_LIMITS,
    LOGIN_BADGES,
    migrate,
    getRewardedRemaining,
    consumeRewardedUnlock,
    getLoginProgress,
    recordLogin,
    recordLoginLocal,
};
