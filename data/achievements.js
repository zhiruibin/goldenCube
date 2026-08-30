/**
 * 成就定义（挖个方块 · 进度 + 广场 + 工坊 + 社交）
 *
 * 设计原则：
 * - 同一条统计线只保留 3～4 档阶梯（初/中/高），避免 1/5/15 过密
 * - 通章不再 10 个重复徽章，改为「通章数」三档
 * - 工坊「创建 N 关」与「保有 N 关」合并为同一计数
 * - 广场「官方精选 N 关」并入「广场通关数」（官方是子集）
 * - deprecated 项仅保留 ID 供旧存档查奖励，不出现在列表
 */

const achievements = {
    progress: [
        {
            id: 'prog_clear_1',
            name: '初挖一关',
            desc: '主线累计通关 1 关',
            icon: 'sparkle',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 1 },
            rewardGold: 1,
            rewardCoins: 0,
        },
        {
            id: 'prog_clear_10',
            name: '小有斩获',
            desc: '主线累计通关 10 关',
            icon: 'star',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 10 },
            rewardGold: 1,
            rewardCoins: 0,
        },
        {
            id: 'prog_clear_50',
            name: '半程碑',
            desc: '主线累计通关 50 关',
            icon: 'medal',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 50 },
            rewardGold: 2,
            rewardCoins: 0,
        },
        {
            id: 'prog_clear_100',
            name: '全部挖通',
            desc: '主线通关全部关卡',
            icon: 'diamond',
            category: 'progress',
            condition: { type: 'all_stages_clear' },
            rewardGold: 3,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_any_1',
            name: '通章初体验',
            desc: '任意 1 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear_count', count: 1 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_any_5',
            name: '五章连斩',
            desc: '累计 5 章全部通关',
            icon: 'fire',
            category: 'progress',
            condition: { type: 'chapter_clear_count', count: 5 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_all',
            name: '十章圆满',
            desc: '10 章全部通关',
            icon: 'crown',
            category: 'progress',
            condition: { type: 'chapter_clear_count', count: 10 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_unlock_25',
            name: '钥匙入门',
            desc: '累计解锁 25 关（含免费关）',
            icon: 'gift',
            category: 'progress',
            condition: { type: 'unlock_count', count: 25 },
            rewardGold: 2,
            rewardCoins: 0,
        },
        {
            id: 'prog_unlock_60',
            name: '钥串在手',
            desc: '累计解锁 60 关',
            icon: 'crystal',
            category: 'progress',
            condition: { type: 'unlock_count', count: 60 },
            rewardGold: 3,
            rewardCoins: 0,
        },
    ],
    plaza: [
        {
            id: 'plaza_clear_1',
            name: '初探广场',
            desc: '首次通关任意广场关卡（含官方精选）',
            icon: 'sparkle',
            category: 'plaza',
            condition: { type: 'plaza_clear_count', count: 1 },
            rewardGold: 0,
            rewardCoins: 15,
        },
        {
            id: 'plaza_clear_10',
            name: '广场常客',
            desc: '累计通关 10 个不同广场关卡',
            icon: 'star',
            category: 'plaza',
            condition: { type: 'plaza_clear_count', count: 10 },
            rewardGold: 0,
            rewardCoins: 30,
        },
        {
            id: 'plaza_clear_30',
            name: '挖遍广场',
            desc: '累计通关 30 个不同广场关卡',
            icon: 'medal',
            category: 'plaza',
            condition: { type: 'plaza_clear_count', count: 30 },
            rewardGold: 0,
            rewardCoins: 45,
        },
        {
            id: 'plaza_unlock_5',
            name: '解锁尝鲜',
            desc: '用金方块解锁 5 个广场关卡',
            icon: 'gift',
            category: 'plaza',
            condition: { type: 'plaza_unlock_count', count: 5 },
            rewardGold: 0,
            rewardCoins: 25,
        },
        {
            id: 'plaza_unlock_20',
            name: '广场收藏家',
            desc: '累计解锁 20 个广场关卡',
            icon: 'crystal',
            category: 'plaza',
            condition: { type: 'plaza_unlock_count', count: 20 },
            rewardGold: 0,
            rewardCoins: 40,
        },
    ],
    workshop: [
        {
            id: 'workshop_create_1',
            name: '造关入门',
            desc: '在工坊创建第 1 个关卡',
            icon: 'sparkle',
            category: 'workshop',
            condition: { type: 'workshop_create_count', count: 1 },
            rewardGold: 0,
            rewardCoins: 15,
        },
        {
            id: 'workshop_create_5',
            name: '高产造物',
            desc: '工坊中同时保有 5 个关卡',
            icon: 'star',
            category: 'workshop',
            condition: { type: 'workshop_create_count', count: 5 },
            rewardGold: 0,
            rewardCoins: 30,
        },
        {
            id: 'workshop_author_clear_1',
            name: '自通认证',
            desc: '试玩并自通 1 个自己造的关',
            icon: 'target',
            category: 'workshop',
            condition: { type: 'workshop_author_clear_count', count: 1 },
            rewardGold: 0,
            rewardCoins: 20,
        },
        {
            id: 'workshop_author_clear_5',
            name: '五关自证',
            desc: '累计自通 5 个自己造的关',
            icon: 'medal',
            category: 'workshop',
            condition: { type: 'workshop_author_clear_count', count: 5 },
            rewardGold: 0,
            rewardCoins: 35,
        },
        {
            id: 'social_workshop_publish_1',
            name: '自我突破',
            desc: '自通后发布 1 关到关卡广场',
            icon: 'rocket',
            category: 'workshop',
            condition: { type: 'workshop_publish', count: 1 },
            rewardGold: 0,
            rewardCoins: 40,
        },
        {
            id: 'workshop_publish_3',
            name: '广场创作者',
            desc: '累计发布 3 关到关卡广场',
            icon: 'fire',
            category: 'workshop',
            condition: { type: 'workshop_publish', count: 3 },
            rewardGold: 0,
            rewardCoins: 50,
        },
        {
            id: 'workshop_slot_6',
            name: '扩槽达人',
            desc: '将工坊槽位扩至 6 个',
            icon: 'gift',
            category: 'workshop',
            condition: { type: 'workshop_slot_cap', count: 6 },
            rewardGold: 0,
            rewardCoins: 25,
        },
    ],
    social: [
        {
            id: 'social_share_1',
            name: '分享一局',
            desc: '首次分享游戏',
            icon: 'share',
            category: 'social',
            condition: { type: 'share', count: 1 },
            rewardGold: 0,
            rewardCoins: 20,
        },
        {
            id: 'social_invite_1',
            name: '呼朋唤友',
            desc: '邀请好友进入游戏 1 次',
            icon: 'handshake',
            category: 'social',
            condition: { type: 'invite_friend', count: 1 },
            rewardGold: 0,
            rewardCoins: 30,
        },
        {
            id: 'social_challenge_send_1',
            name: '挑战好友',
            desc: '向好友发起一次挑战',
            icon: 'bolt',
            category: 'social',
            condition: { type: 'challenge_create', count: 1 },
            rewardGold: 0,
            rewardCoins: 20,
        },
        {
            id: 'social_challenge_accept_1',
            name: '迎接挑战',
            desc: '应战一次',
            icon: 'shield',
            category: 'social',
            condition: { type: 'challenge_respond', count: 1 },
            rewardGold: 0,
            rewardCoins: 20,
        },
        {
            id: 'social_challenge_perfect_ten',
            name: '十全十美',
            desc: '累计发起 10 次挑战并完成 10 次应战',
            icon: 'star',
            category: 'social',
            condition: { type: 'challenge_create_and_respond', count: 10 },
            rewardGold: 0,
            rewardCoins: 50,
        },
        {
            id: 'social_challenge_last10_win',
            name: '紫禁之巅',
            desc: '最近十次挑战局与应战局全胜',
            icon: 'crown',
            category: 'social',
            condition: { type: 'challenge_last10_all_win', count: 10 },
            rewardGold: 0,
            rewardCoins: 50,
        },
    ],
};

/** 已下线成就：保留 ID 以免旧存档 unlock 查不到定义 */
const deprecatedAchievements = [
    { id: 'prog_clear_5', deprecated: true, rewardGold: 1, rewardCoins: 0 },
    { id: 'prog_clear_25', deprecated: true, rewardGold: 2, rewardCoins: 0 },
    { id: 'prog_clear_75', deprecated: true, rewardGold: 3, rewardCoins: 0 },
    { id: 'prog_all_clear', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_1', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_2', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_3', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_4', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_5', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_6', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_7', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_8', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_9', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'prog_chapter_10', deprecated: true, rewardGold: 0, rewardCoins: 0 },
    { id: 'plaza_clear_5', deprecated: true, rewardGold: 0, rewardCoins: 25 },
    { id: 'plaza_clear_15', deprecated: true, rewardGold: 0, rewardCoins: 40 },
    { id: 'plaza_unlock_1', deprecated: true, rewardGold: 0, rewardCoins: 20 },
    { id: 'plaza_unlock_10', deprecated: true, rewardGold: 0, rewardCoins: 35 },
    { id: 'plaza_official_5', deprecated: true, rewardGold: 0, rewardCoins: 30 },
    { id: 'workshop_occupied_3', deprecated: true, rewardGold: 0, rewardCoins: 25 },
];

const categoryNames = {
    progress: '进度',
    plaza: '广场',
    workshop: '工坊',
    social: '社交',
};

function getAllAchievements() {
    const list = [];
    Object.keys(achievements).forEach((k) => {
        (achievements[k] || []).forEach((a) => list.push(a));
    });
    return list;
}

function getAchievementById(id) {
    const active = getAllAchievements().find((a) => a.id === id);
    if (active) return active;
    return deprecatedAchievements.find((a) => a.id === id) || null;
}

function getAchievementsByCategory() {
    return achievements;
}

function isDeprecatedAchievement(id) {
    return deprecatedAchievements.some((a) => a.id === id);
}

module.exports = {
    achievements,
    deprecatedAchievements,
    categoryNames,
    getAllAchievements,
    getAchievementById,
    getAchievementsByCategory,
    isDeprecatedAchievement,
};
