/** 专题徽章收藏。使用 gc_ 存储键，会自动进入现有玩家云存档。 */
const STORAGE_KEY = 'gc_theme_badges_v1';

const BADGES = {
    mid_autumn: {
        id: 'mid_autumn',
        name: '中秋徽章',
        description: '完成中秋专题全部 20 关',
        themeId: 'midAutumn',
    },
};

function getOwnedIds() {
    try {
        const value = wx.getStorageSync(STORAGE_KEY);
        return Array.isArray(value) ? value.filter((id) => BADGES[id]) : [];
    } catch (e) { return []; }
}

function has(id) {
    return getOwnedIds().indexOf(id) >= 0;
}

function award(id) {
    if (!BADGES[id]) return { awarded: false, first: false };
    const ids = getOwnedIds();
    if (ids.indexOf(id) >= 0) return { awarded: true, first: false };
    ids.push(id);
    try { wx.setStorageSync(STORAGE_KEY, ids); } catch (e) { return { awarded: false, first: false }; }
    return { awarded: true, first: true };
}

module.exports = { STORAGE_KEY, BADGES, getOwnedIds, has, award };
