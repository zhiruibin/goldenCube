/** 首次启动路由：真正的新玩家直达第 1 关，已有玩家保持进入首页。 */

const ROUTED_KEY = 'gc_device_firstLaunchTutorialRouted_v1';
const TUTORIAL_SEEN_KEY = 'gc_tutorial_gold_block_seen_v1';

function _get(key, fallback) {
    try {
        const value = wx.getStorageSync(key);
        return value === '' || value == null ? fallback : value;
    } catch (e) {
        return fallback;
    }
}

function _hasExistingLocalPlayerData() {
    if (_get(TUTORIAL_SEEN_KEY, false)) return true;
    if (Number(_get('gc_stat_total_games', 0)) > 0) return true;

    const unlocked = _get('gc_stagesUnlocked', []);
    if (Array.isArray(unlocked) && unlocked.length > 0) return true;

    const login = _get('gc_loginProgress_v1', null);
    if (login && Number(login.totalLoginDays) > 0) return true;

    try {
        const cleared = _get('gc_stageClearedIds_v1', []);
        if (Array.isArray(cleared) && cleared.length > 0) return true;
        const info = wx.getStorageInfoSync && wx.getStorageInfoSync();
        const keys = info && Array.isArray(info.keys) ? info.keys : [];
        return keys.some((key) => /^gc_stage(?:Best|Clear)_\d+$/.test(String(key)));
    } catch (e) {
        return false;
    }
}

/** 必须在云存档恢复前采集，避免云端账号数据改变“本机首次启动”的含义。 */
function captureLocalState() {
    return {
        routed: !!_get(ROUTED_KEY, false),
        hasExistingPlayerData: _hasExistingLocalPlayerData(),
    };
}

/**
 * 云存档恢复完成后调用，确保跨设备老玩家不会被误判为新玩家。
 * 决策一经作出就落盘；即使玩家退出教学，下一次也正常进入首页。
 */
function resolveInitialRoute(options) {
    const opts = options || {};
    if (opts.hasChallengeLaunch) return { name: 'home', firstLaunch: false };
    const localState = opts.localState || captureLocalState();
    if (localState.routed) return { name: 'home', firstLaunch: false };

    try { wx.setStorageSync(ROUTED_KEY, true); } catch (e) { /* ignore */ }
    if (localState.hasExistingPlayerData) {
        return { name: 'home', firstLaunch: false, migrated: true };
    }

    return {
        name: 'game',
        firstLaunch: true,
        params: { mode: 'stage', stageId: 1, entryPaid: 0 },
    };
}

module.exports = {
    ROUTED_KEY,
    captureLocalState,
    resolveInitialRoute,
};
