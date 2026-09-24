/**
 * 背景主题。每套两张全屏图：对局底（首页 / 对局 / 结算）和列表底（选关 / 广场 / 商店等）。
 * 矿洞默认拥有。其余通关主线获得，150 关收齐。未获得可看视频试用 3 天。
 * veil 是页面压暗的倍率：亮场景压轻一些，避免新图发闷。
 */

const themeBackgrounds = [
    {
        id: 'default',
        name: '矿洞',
        unlockCondition: 'default',
        description: '灯火通明的矿坑工坊',
        playKey: 'homeBg',
        listKey: 'mapMineBg',
        veil: 1,
    },
    {
        id: 'city',
        name: '都市',
        unlockCondition: 'stage_clear_30',
        description: '黄昏时的货运街区',
        playKey: 'themeCityPlay',
        listKey: 'themeCityList',
        veil: 0.82,
    },
    {
        id: 'forest',
        name: '山林',
        unlockCondition: 'stage_clear_60',
        description: '山间林道与石块',
        playKey: 'themeForestPlay',
        listKey: 'themeForestList',
        veil: 0.62,
    },
    {
        id: 'desert',
        name: '沙漠',
        unlockCondition: 'stage_clear_90',
        description: '午后的砂岩峡谷',
        playKey: 'themeDesertPlay',
        listKey: 'themeDesertList',
        veil: 0.4,
    },
    {
        id: 'grassland',
        name: '草原',
        unlockCondition: 'stage_clear_120',
        description: '暖阳下的草地石径',
        playKey: 'themeGrassPlay',
        listKey: 'themeGrassList',
        veil: 0.36,
    },
    {
        id: 'beach',
        name: '海滩',
        unlockCondition: 'stage_clear_150',
        description: '退潮后的石滩',
        playKey: 'themeBeachPlay',
        listKey: 'themeBeachList',
        veil: 0.3,
    },
];

function findTheme(id) {
    for (let i = 0; i < themeBackgrounds.length; i++) {
        if (themeBackgrounds[i].id === id) return themeBackgrounds[i];
    }
    return themeBackgrounds[0];
}

function readEquippedThemeId() {
    try {
        if (typeof wx === 'undefined' || !wx.getStorageSync) return 'default';
        const id = wx.getStorageSync('gc_equipped_theme');
        if (id && findTheme(id).id === id) return id;
    } catch (e) { /* ignore */ }
    return 'default';
}

function readEquippedTheme() {
    return findTheme(readEquippedThemeId());
}

module.exports = {
    themeBackgrounds,
    findTheme,
    readEquippedThemeId,
    readEquippedTheme,
};
