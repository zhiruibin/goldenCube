/** 节日 / 主题挑战配置管理：本地缓存优先，云端静默刷新。 */
// v2 切换到首期中秋专题，避免旧版“主题挑战”占位缓存覆盖新页面。
const CACHE_KEY = 'gc_theme_event_cache_v2';

const DEFAULT_EVENT = Object.freeze({
    active: true,
    eventId: 'mid_autumn_preview',
    title: '中秋\n专题',
    pageTitle: '中秋专题',
    subtitle: '好时节，愿得年年，常见中秋月',
    description: '十轮明月，十段诗意，挖出属于这个中秋的团圆。',
    buttonSkin: 'btnSquareGold',
    accentColor: '#f2c94c',
    badge: '新',
});

const ALLOWED_SKINS = ['btnSquareAmber', 'btnSquareGold', 'btnSquareBrown', 'btnSquareTeal'];
let current = null;
let refreshing = null;

function normalize(raw) {
    if (!raw || typeof raw !== 'object') return Object.assign({}, DEFAULT_EVENT);
    const title = String(raw.title || raw.pageTitle || '主题挑战').slice(0, 8);
    const splitAt = title.length >= 4 ? Math.ceil(title.length / 2) : 0;
    return {
        active: raw.active === true && (!Number(raw.endAt) || Number(raw.endAt) > Date.now()),
        eventId: String(raw.eventId || raw._id || '').slice(0, 64),
        title: splitAt ? title.slice(0, splitAt) + '\n' + title.slice(splitAt) : title,
        pageTitle: title,
        subtitle: String(raw.subtitle || '').slice(0, 28),
        description: String(raw.description || '').slice(0, 160),
        rules: Array.isArray(raw.rules) ? raw.rules.slice(0, 5).map((v) => String(v).slice(0, 50)) : [],
        buttonSkin: ALLOWED_SKINS.indexOf(raw.buttonSkin) >= 0 ? raw.buttonSkin : DEFAULT_EVENT.buttonSkin,
        accentColor: /^#[0-9a-fA-F]{6}$/.test(raw.accentColor || '') ? raw.accentColor : DEFAULT_EVENT.accentColor,
        badge: String(raw.badge || '').slice(0, 4),
        startAt: Number(raw.startAt) || 0,
        endAt: Number(raw.endAt) || 0,
    };
}

function load() {
    if (current) {
        if (current.active && current.endAt && current.endAt <= Date.now()) {
            current = Object.assign({}, current, { active: false });
        }
        return current;
    }
    try { current = normalize(wx.getStorageSync(CACHE_KEY)); } catch (e) { current = normalize(null); }
    return current;
}

function refresh() {
    if (refreshing) return refreshing;
    if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.callFunction !== 'function') {
        return Promise.resolve(load());
    }
    refreshing = wx.cloud.callFunction({ name: 'theme-event', data: { action: 'getCurrent' } })
        .then((res) => {
            const result = res && res.result;
            if (!result || result.success !== true) return load();
            current = normalize(result.event);
            try { wx.setStorageSync(CACHE_KEY, current); } catch (e) { /* ignore */ }
            return current;
        })
        .catch(() => load())
        .then((value) => { refreshing = null; return value; }, (err) => { refreshing = null; throw err; });
    return refreshing;
}

module.exports = { getCurrent: load, refresh, CACHE_KEY };
