/** 徽章图鉴目录：动态章节 / 专题 / 广场，固定工坊与登录纪念徽章。 */
const goldenBlock = require('../utils/golden-block-manager');
const workshop = require('../utils/workshop-manager');
const themeBadges = require('./theme-badges');
const midAutumn = require('./mid-autumn-stages');
const progression = require('../utils/progression-v2');
const badgeProgressSignal = require('../utils/badge-progress-signal');

const CATEGORY_ORDER = ['chapter', 'theme', 'workshop', 'plaza', 'memorial'];
const CATEGORY_NAMES = { chapter: '闯关', theme: '专题', workshop: '工坊', plaza: '广场', memorial: '纪念' };
const CHAPTER_ICONS = ['hundred', 'brick', 'sparkle', 'heart', 'bank', 'rocket', 'star', 'diamond', 'puzzle', 'crown'];
const CHAPTER_ART = {
    1: { image: 'badgeChapter01', lockedImage: 'badgeChapter01Locked' },
    2: { image: 'badgeChapter02', lockedImage: 'badgeChapter02Locked' },
    3: { image: 'badgeChapter03', lockedImage: 'badgeChapter03Locked' },
};

const MEMORIAL_ART = {
    login_7: 'badgeLogin07',
    login_30: 'badgeLogin30',
    login_100: 'badgeLogin100',
    login_365: 'badgeLogin365',
};

function getChapterArt(chapterId) {
    if (CHAPTER_ART[chapterId]) return CHAPTER_ART[chapterId];
    if (chapterId >= 4 && chapterId <= 20) {
        return { image: 'badgeChapterAtlasV2', atlasIndex: chapterId - 4, atlasCols: 4, atlasRows: 5 };
    }
    return {};
}

function chapterBadges() {
    return goldenBlock.getChapterProgressSnapshot().map((progress, index) => {
        const chapter = progress.chapter;
        return Object.assign({
            id: 'chapter_' + chapter.id, category: 'chapter', name: '第' + chapter.id + '章',
            subtitle: chapter.name || '章节徽章',
            description: '完整通关「' + (chapter.name || ('第' + chapter.id + '章')) + '」',
            icon: CHAPTER_ICONS[index % CHAPTER_ICONS.length],
            current: progress.current, target: progress.target,
            owned: progress.owned, palette: index % 3,
        }, getChapterArt(chapter.id));
    });
}

function themeBadgeList() {
    return Object.keys(themeBadges.BADGES).map((id) => {
        const badge = themeBadges.BADGES[id];
        let progress = { cleared: 0, total: 1 };
        if (id === 'mid_autumn') progress = midAutumn.getProgress();
        return {
            id: 'theme_' + id, badgeId: id, category: 'theme', name: badge.name,
            subtitle: '专题典藏', description: badge.description, icon: 'medal',
            image: id === 'mid_autumn' ? 'badgeMidAutumn' : '',
            lockedImage: id === 'mid_autumn' ? 'badgeMidAutumnLocked' : '',
            current: progress.cleared, target: progress.total, owned: themeBadges.has(id), palette: 1,
        };
    });
}

function workshopBadges() {
    const published = workshop.getWorkshopPublishedCount();
    const slotCap = workshop.getSlotCap();
    return [
        {
            id: 'workshop_first_publish', category: 'workshop', name: '初铸成名', subtitle: '创作者徽章',
            description: '首次提交关卡并审核成功', icon: 'rocket', current: Math.min(1, published),
            target: 1, owned: published >= 1, palette: 0,
            image: 'badgeWorkshopFirstApproved', lockedImage: 'badgeWorkshopFirstApprovedLocked',
        },
        {
            id: 'workshop_max_slots', category: 'workshop', name: '工坊满载', subtitle: '扩建徽章',
            description: '将工坊扩展至全部 ' + workshop.MAX_SLOTS + ' 个槽位', icon: 'construction',
            current: slotCap, target: workshop.MAX_SLOTS, owned: slotCap >= workshop.MAX_SLOTS, palette: 2,
            image: 'badgeWorkshopMaxSlots', lockedImage: 'badgeWorkshopMaxSlotsLocked',
        },
    ];
}

function plazaBadges() {
    const cleared = workshop.getPlazaClearedCount();
    let publishedCount = 0;
    try { publishedCount = workshop.getOfficialPlazaStages().length; } catch (e) { /* ignore */ }
    const highest = Math.max(10, Math.ceil(Math.max(cleared, publishedCount) / 10) * 10);
    const list = [];
    for (let target = 10; target <= highest; target += 10) {
        list.push({
            id: 'plaza_clear_' + target, category: 'plaza', name: '广场' + target + '关',
            subtitle: '探索徽章', description: '累计通关 ' + target + ' 个不同的广场关卡',
            icon: target % 30 === 0 ? 'trophy' : (target % 20 === 0 ? 'star' : 'gamepad'),
            current: Math.min(cleared, target), target, owned: cleared >= target,
            palette: (target / 10 - 1) % 3,
            image: target <= 30 ? 'badgePlazaAtlas' : '',
            atlasIndex: target <= 30 ? target / 10 - 1 : undefined,
            atlasCols: target <= 30 ? 3 : undefined,
            atlasRows: target <= 30 ? 1 : undefined,
        });
    }
    return list;
}

function memorialBadges() {
    const progress = progression.getLoginProgress();
    return progression.LOGIN_BADGES.map((badge, index) => ({
        id: badge.id,
        category: 'memorial',
        name: badge.name,
        subtitle: '登录纪念',
        description: badge.description,
        icon: ['sparkle', 'star', 'diamond', 'crown'][index % 4],
        current: Math.min(progress.totalLoginDays, badge.days),
        target: badge.days,
        owned: progress.earnedBadgeIds.indexOf(badge.id) >= 0,
        palette: index % 3,
        image: MEMORIAL_ART[badge.id] || '',
    }));
}

const BUILDERS = {
    chapter: chapterBadges,
    theme: themeBadgeList,
    workshop: workshopBadges,
    plaza: plazaBadges,
    memorial: memorialBadges,
};

let _snapshot = null;

function buildSnapshot() {
    if (_snapshot) return _snapshot;
    const categories = {};
    const categoryStats = {};
    let owned = 0;
    let total = 0;
    CATEGORY_ORDER.forEach((category) => {
        const badges = BUILDERS[category] ? BUILDERS[category]() : [];
        const categoryOwned = badges.reduce((count, badge) => count + (badge.owned ? 1 : 0), 0);
        categories[category] = badges;
        categoryStats[category] = { owned: categoryOwned, total: badges.length };
        owned += categoryOwned;
        total += badges.length;
    });
    _snapshot = {
        revision: badgeProgressSignal.getRevision(),
        categories,
        categoryStats,
        summary: { owned, total },
    };
    return _snapshot;
}

function invalidate() {
    _snapshot = null;
}

badgeProgressSignal.subscribe(invalidate);

function getSnapshot() {
    return buildSnapshot();
}

function getBadges(category) {
    return buildSnapshot().categories[category] || [];
}

function getAllBadges() {
    const snapshot = buildSnapshot();
    return CATEGORY_ORDER.reduce((all, category) => all.concat(snapshot.categories[category] || []), []);
}

function getSummary() {
    return buildSnapshot().summary;
}

module.exports = {
    CATEGORY_ORDER,
    CATEGORY_NAMES,
    getSnapshot,
    getBadges,
    getAllBadges,
    getSummary,
    invalidate,
};
