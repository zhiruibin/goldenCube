// 排行榜云函数
// 职责：
//   1. submitScore - 提交分数（仅当高于历史最高分时写入），返回是否新纪录与当前排名
//   2. getRankList - 分页查询排行榜（全服/好友 × 周/月/总榜）
//   3. getMyRank  - 查询当前用户在某模式的最高分与排名（结算页展示用）
//
// 部署说明见同目录 README.md：
//   - 上传云函数后在云开发控制台创建集合 rankings
//   - 集合权限建议选择「所有用户可读，仅创建者可读写」（排行榜需要全服可读）
//   - 首次部署需在云开发控制台确认环境与数据库已开通

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/** 排行榜集合名（与 utils/cloud-config.js 保持一致） */
const COLLECTION = 'rankings';

/** 允许的游戏模式 */
const ALLOWED_MODES = ['classic', 'timed', 'marathon'];

/** 允许的时间周期 */
const ALLOWED_PERIODS = ['week', 'month', 'total'];

/** 单页最大条数 */
const MAX_PAGE_SIZE = 50;

/** 云函数主入口 */
exports.main = async (event, context) => {
    const { action, data } = event || {};
    const { OPENID } = cloud.getWXContext();

    switch (action) {
        case 'submitScore':
            return await submitScore(OPENID, data || {});
        case 'getRankList':
            return await getRankList(OPENID, data || {});
        case 'getMyRank':
            return await getMyRank(OPENID, data || {});
        case 'getReplay':
            return await getReplay(OPENID, data || {});
        default:
            return { success: false, errMsg: `Unknown action: ${action}` };
    }
};

/**
 * 提交分数
 * 仅当本次分数高于该用户在该模式的历史最高分时写入，避免频繁无效写入。
 * @param {string} openid
 * @param {object} data { score, mode, detail, nickname, avatarUrl }
 */
async function submitScore(openid, data) {
    const score = Math.floor(Number(data.score) || 0);
    const mode = data.mode || 'classic';

    // 1. 参数校验
    if (ALLOWED_MODES.indexOf(mode) < 0) {
        return { success: false, errMsg: 'invalid mode' };
    }
    if (!(score >= 0)) {
        return { success: false, errMsg: 'invalid score' };
    }

    const coll = db.collection(COLLECTION);
    const now = Date.now();
    const profile = {
        nickname: typeof data.nickname === 'string' ? data.nickname.slice(0, 32) : '',
        avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl.slice(0, 512) : '',
    };

    // 2. 查询该用户在该模式下的历史记录
    let prev = null;
    try {
        const res = await coll.where({ openid, mode }).limit(1).get();
        prev = res.data && res.data[0] ? res.data[0] : null;
    } catch (e) {
        prev = null;
    }

    const isNewRecord = !prev || score > (prev.score || 0);

    // 3. 刷新纪录时写完整记录；未破纪录但带了资料时，仍更新昵称头像（避免一直显示「玩家xxxx」）
    if (isNewRecord) {
        // 计算回放字段：仅当 replay 结构有效且序列化后不超过 60KB 时保留，防止超大回放撑爆云函数入参
        let replayField = null;
        const replay = data.replay;
        if (replay && typeof replay === 'object' && replay.seed != null && Array.isArray(replay.inputs)) {
            try {
                const replayStr = JSON.stringify(replay);
                if (replayStr.length <= 60000) {
                    replayField = replay;
                }
            } catch (e) {
                replayField = null;
            }
        }
        const record = {
            openid,
            mode,
            score,
            detail: data.detail || null,
            nickname: profile.nickname || (prev && prev.nickname) || '',
            avatarUrl: profile.avatarUrl || (prev && prev.avatarUrl) || '',
            replay: replayField,
            updatedAt: now,
        };
        try {
            if (prev && prev._id) {
                await coll.doc(prev._id).update({ data: record });
            } else {
                await coll.add({ data: record });
            }
        } catch (e) {
            return { success: false, errMsg: `write failed: ${(e && e.errMsg) || e.message || e}` };
        }
    } else if (prev && prev._id && (profile.nickname || profile.avatarUrl)) {
        try {
            const patch = { updatedAt: now };
            if (profile.nickname) patch.nickname = profile.nickname;
            if (profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;
            await coll.doc(prev._id).update({ data: patch });
        } catch (e) {
            // 资料更新失败不影响分数回报
        }
    }

    // 4. 计算当前排名（分数相同按先达者优先，此处取并列同排）
    let rank = null;
    try {
        const myScore = isNewRecord ? score : (prev.score || 0);
        const better = await coll.where({ mode, score: _.gt(myScore) }).count();
        rank = better.total + 1;
    } catch (e) {
        rank = null;
    }

    return { success: true, isNewRecord, rank, score, mode };
}

/**
 * 查询排行榜
 * @param {string} openid
 * @param {object} data { mode, type, period, page, pageSize, friendOpenIds }
 */
async function getRankList(openid, data) {
    const mode = data.mode || 'classic';
    const type = data.type === 'friend' ? 'friend' : 'all';
    const period = ALLOWED_PERIODS.indexOf(data.period) >= 0 ? data.period : 'total';
    const page = Math.max(1, Math.floor(Number(data.page) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(data.pageSize) || 20)));

    if (ALLOWED_MODES.indexOf(mode) < 0) {
        return { success: false, errMsg: 'invalid mode' };
    }

    const coll = db.collection(COLLECTION);
    const where = { mode };

    // 1. 时间范围（周榜从本周一 00:00 起，月榜从本月 1 日 00:00 起）
    if (period !== 'total') {
        where.updatedAt = _.gte(periodStart(period));
    }

    // 2. 用户范围（好友榜需要客户端传入好友 openid 列表）
    if (type === 'friend') {
        const friendOpenIds = Array.isArray(data.friendOpenIds) ? data.friendOpenIds.slice(0, 50) : [];
        if (friendOpenIds.length === 0) {
            return { success: true, list: [], total: 0, page, pageSize, myRank: null, myScore: null };
        }
        where.openid = _.in(friendOpenIds);
    }

    const query = coll.where(where);

    // 3. 总数
    let total = 0;
    try {
        const c = await query.count();
        total = c.total;
    } catch (e) {
        total = 0;
    }

    // 4. 按分数降序、先达者优先分页查询
    let list = [];
    try {
        const res = await query
            .orderBy('score', 'desc')
            .orderBy('updatedAt', 'asc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get();
        list = (res.data || []).map((item) => ({
            id: item._id || '',
            openid: item.openid,
            nickname: item.nickname || defaultName(item.openid),
            avatarUrl: item.avatarUrl || '',
            score: item.score || 0,
            updatedAt: item.updatedAt || 0,
            hasReplay: !!(item.replay && item.replay.seed != null),
        }));
    } catch (e) {
        list = [];
    }

    // 5. 我的最高分与排名（好友榜：仅在 friendOpenIds 范围内计名次）
    let myRank = null;
    let myScore = null;
    try {
        const myWhere = { openid, mode };
        if (period !== 'total') {
            myWhere.updatedAt = _.gte(periodStart(period));
        }
        const my = await coll.where(myWhere).orderBy('score', 'desc').limit(1).get();
        if (my.data && my.data[0]) {
            myScore = my.data[0].score || 0;
            const betterWhere = { mode, score: _.gt(myScore) };
            if (period !== 'total') {
                betterWhere.updatedAt = _.gte(periodStart(period));
            }
            if (type === 'friend') {
                const friendOpenIds = Array.isArray(data.friendOpenIds) ? data.friendOpenIds.slice(0, 50) : [];
                if (friendOpenIds.length > 0) {
                    betterWhere.openid = _.in(friendOpenIds);
                }
            }
            const better = await coll.where(betterWhere).count();
            myRank = better.total + 1;
        }
    } catch (e) {
        // 忽略，保持 null
    }

    return { success: true, list, total, page, pageSize, myRank, myScore };
}

/**
 * 查询我的最高分与排名
 * @param {string} openid
 * @param {object} data { mode }
 */
async function getMyRank(openid, data) {
    const mode = data.mode || 'classic';
    if (ALLOWED_MODES.indexOf(mode) < 0) {
        return { success: false, errMsg: 'invalid mode' };
    }

    const coll = db.collection(COLLECTION);
    try {
        const my = await coll.where({ openid, mode }).orderBy('score', 'desc').limit(1).get();
        if (!my.data || !my.data[0]) {
            return { success: true, myRank: null, myScore: null, hasRecord: false };
        }
        const myScore = my.data[0].score || 0;
        const better = await coll.where({ mode, score: _.gt(myScore) }).count();
        return { success: true, myRank: better.total + 1, myScore, hasRecord: true };
    } catch (e) {
        return { success: false, errMsg: (e && e.errMsg) || String(e) };
    }
}

/**
 * 查询单条回放数据（全服排行榜「回放」）
 * @param {string} openid
 * @param {object} data { replayId }
 */
async function getReplay(openid, data) {
    const replayId = data && typeof data.replayId === 'string' ? data.replayId.trim() : '';
    if (!replayId) {
        return { success: false, errMsg: 'invalid replayId' };
    }

    try {
        const res = await db.collection(COLLECTION).doc(replayId).get();
        const rec = res && res.data ? res.data : null;
        if (rec && rec.replay && rec.replay.seed != null) {
            return { success: true, replay: rec.replay, mode: rec.mode || '' };
        }
    } catch (e) {
        // 记录不存在或读取失败，走统一失败返回
    }

    return { success: false, errMsg: 'replay not found' };
}

/** 周/月榜起始时间戳 */
function periodStart(period) {
    const now = new Date();
    if (period === 'week') {
        const day = now.getDay() || 7; // 周日=0 → 7
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).getTime();
    }
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/** 默认昵称：玩家 + openid 后四位 */
function defaultName(openid) {
    const tail = String(openid || '').slice(-4);
    return tail ? '玩家' + tail : '玩家';
}
