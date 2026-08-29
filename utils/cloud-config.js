/**
 * cloud-config - 云开发配置
 * 职责：集中管理云开发环境、排行榜集合名、游戏模式等常量
 *
 * 使用方式：
 *   1. 在微信开发者工具中开通「云开发」，创建环境
 *   2. 将下方 CLOUD_ENV 改为你的环境 ID（如 'tetris-1a2b3c'）
 *   3. 将 cloudfunctions/rank 云函数上传部署
 *   4. 在云开发控制台创建集合 rankings（权限：所有用户可读，仅创建者可读写）
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

/** 允许的游戏模式（挖个方块主榜仅闯关复合键） */
const GAME_MODES = ['stage'];

/** 挑战允许的 mode（含工坊残局挑战） */
const CHALLENGE_MODES = ['stage', 'workshop', 'classic', 'timed', 'marathon', 'special'];

/** 模式显示名 */
const MODE_NAMES = {
    stage: '闯关挑战',
    workshop: '工坊挑战',
    classic: '经典模式',
    timed: '限时赛',
    marathon: '马拉松',
    special: '方块实验室',
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
