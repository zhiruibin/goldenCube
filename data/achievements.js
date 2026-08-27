/**
 * 成就定义（挖个方块 · 进度 + 社交）
 * 进度 18 + 社交 5 = 23；发金合计上限 +12（通章/全通/社交点亮发 0 金，社交发币）
 */

const achievements = {
    progress: [
        {
            id: 'prog_clear_1',
            name: '初挖一关',
            desc: '累计通关 1 关',
            icon: 'sparkle',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 1 },
            rewardGold: 1,
            rewardCoins: 0,
        },
        {
            id: 'prog_clear_5',
            name: '小有斩获',
            desc: '累计通关 5 关',
            icon: 'star',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 5 },
            rewardGold: 1,
            rewardCoins: 0,
        },
        {
            id: 'prog_clear_25',
            name: '四分之一',
            desc: '累计通关 25 关',
            icon: 'target',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 25 },
            rewardGold: 2,
            rewardCoins: 0,
        },
        {
            id: 'prog_clear_50',
            name: '半程碑',
            desc: '累计通关 50 关',
            icon: 'medal',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 50 },
            rewardGold: 2,
            rewardCoins: 0,
        },
        {
            id: 'prog_clear_75',
            name: '渐入深境',
            desc: '累计通关 75 关',
            icon: 'fire',
            category: 'progress',
            condition: { type: 'stage_clear_count', count: 75 },
            rewardGold: 2,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_1',
            name: '数字课·通章',
            desc: '第 1 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 1 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_2',
            name: '字母墙·通章',
            desc: '第 2 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 2 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_3',
            name: '花田·通章',
            desc: '第 3 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 3 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_4',
            name: '萌宠园·通章',
            desc: '第 4 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 4 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_5',
            name: '积木城·通章',
            desc: '第 5 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 5 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_6',
            name: '车水马龙·通章',
            desc: '第 6 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 6 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_7',
            name: '星象台·通章',
            desc: '第 7 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 7 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_8',
            name: '几何馆·通章',
            desc: '第 8 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 8 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_9',
            name: '地宫·通章',
            desc: '第 9 章全部通关',
            icon: 'trophy',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 9 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_chapter_10',
            name: '金方块殿·通章',
            desc: '第 10 章全部通关',
            icon: 'crown',
            category: 'progress',
            condition: { type: 'chapter_clear', chapterId: 10 },
            rewardGold: 0,
            rewardCoins: 0,
        },
        {
            id: 'prog_all_clear',
            name: '全部挖通',
            desc: '通关全部关卡',
            icon: 'diamond',
            category: 'progress',
            condition: { type: 'all_stages_clear' },
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
            rewardGold: 2,
            rewardCoins: 0,
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

const categoryNames = {
    progress: '进度',
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
    return getAllAchievements().find((a) => a.id === id) || null;
}

function getAchievementsByCategory() {
    return achievements;
}

module.exports = {
    achievements,
    categoryNames,
    getAllAchievements,
    getAchievementById,
    getAchievementsByCategory,
};
