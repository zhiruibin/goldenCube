/** 激励视频失败回退：保存一次性、跨场景的确定性检查点。 */
const KEY = 'gc_stage_rewind_v1';
const REWIND_STEPS = 8;
const MAX_HISTORY = 11;

function save(payload) {
    if (!payload || !payload.snapshot) return false;
    try {
        wx.setStorageSync(KEY, Object.assign({}, payload, {
            savedAt: Date.now(),
            used: false,
        }));
        return true;
    } catch (e) { return false; }
}

function load() {
    try {
        const data = wx.getStorageSync(KEY);
        if (!data || !data.snapshot || data.used) return null;
        // 失败页只应恢复刚结束的这一局，过期快照直接丢弃。
        if (Date.now() - (Number(data.savedAt) || 0) > 30 * 60 * 1000) {
            clear();
            return null;
        }
        return data;
    } catch (e) { return null; }
}

function consume() {
    const data = load();
    if (!data) return null;
    try {
        wx.setStorageSync(KEY, Object.assign({}, data, { used: true }));
    } catch (e) { return null; }
    return data;
}

function clear() {
    try { wx.removeStorageSync(KEY); } catch (e) { /* ignore */ }
}

function pick(history) {
    const list = Array.isArray(history) ? history : [];
    if (list.length < 2) return null;
    const index = Math.max(0, list.length - 1 - REWIND_STEPS);
    return list[index] || null;
}

module.exports = { REWIND_STEPS, MAX_HISTORY, save, load, consume, clear, pick };
