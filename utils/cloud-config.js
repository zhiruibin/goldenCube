/**
 * cloud-config - 云开发配置
 * 职责：集中管理云开发环境、排行榜集合名、对局/挑战类型常量
 *
 * 挖个方块没有「经典 / 限时 / 马拉松」等产品模式；
 * 排行榜字段 mode 实为榜分区 boardKey（仅 stage）；
 * 挑战字段 mode 实为 challengeKind（stage / workshop / plaza）。
 */

/** 云开发环境 ID（挖个方块独立环境，勿用「方块过把瘾」旧 env） */
const CLOUD_ENV = 'cloudbase-d2g1zc0tt4a4c2dc3';

/** 排行榜集合名（与 cloudfunctions/rank/index.js 保持一致） */
const RANK_COLLECTION = 'rankings';

/** 挑战集合名（与 cloudfunctions/challenge/index.js 保持一致） */
const CHALLENGE_COLLECTION = 'challenges';

/** 工坊广场集合名（与 cloudfunctions/workshop/index.js 保持一致） */
const WORKSHOP_COLLECTION = 'workshop_stages';

/** 好友榜存储键（微信开放数据域 wx.setUserCloudStorage 使用） */
const FRIEND_RANK_KEY = 'gc_rank_score';

/**
 * 排行榜分区键（库字段仍叫 mode，语义是 boardKey）
 * 挖个方块主榜仅闯关复合键
 */
const GAME_MODES = ['stage'];

/**
 * 挑战内容类型（库字段仍叫 mode，语义是 challengeKind）
 * 挂在哪类关上：闯关 / 工坊 / 广场
 */
const CHALLENGE_MODES = ['stage', 'workshop', 'plaza'];

/** 挑战 / 榜分区展示名（禁止经典限时马拉松文案） */
const MODE_NAMES = {
    stage: '闯关挑战',
    workshop: '工坊挑战',
    plaza: '广场挑战',
};

/** 排行榜类型 */
const RANK_TYPES = {
    friend: '好友榜',
    all: '全服榜',
};

/** 时间周期 */
const RANK_PERIODS = {
    total: '总榜',
    week: '周榜',
    month: '月榜',
};

module.exports = {
    CLOUD_ENV,
    RANK_COLLECTION,
    CHALLENGE_COLLECTION,
    WORKSHOP_COLLECTION,
    FRIEND_RANK_KEY,
    GAME_MODES,
    CHALLENGE_MODES,
    MODE_NAMES,
    RANK_TYPES,
    RANK_PERIODS,
};
