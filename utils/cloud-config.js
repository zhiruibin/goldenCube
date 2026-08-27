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

/** 云开发环境 ID（留空则使用默认环境） */
const CLOUD_ENV = 'cloudbase-d9gmlzdh1c88ebeec';

/** 排行榜集合名（与 cloudfunctions/rank/index.js 保持一致） */
const RANK_COLLECTION = 'rankings';

/** 挑战集合名（与 cloudfunctions/challenge/index.js 保持一致） */
const CHALLENGE_COLLECTION = 'challenges';

/** 好友榜存储键（微信开放数据域 wx.setUserCloudStorage 使用） */
const FRIEND_RANK_KEY = 'rank_score';

/** 允许的游戏模式 */
const GAME_MODES = ['classic', 'timed', 'marathon'];

/** 模式显示名 */
const MODE_NAMES = {
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
    FRIEND_RANK_KEY,
    GAME_MODES,
    MODE_NAMES,
    RANK_TYPES,
    RANK_PERIODS,
};
