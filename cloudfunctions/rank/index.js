// 排行榜云函数（挖个方块 · 闯关复合键）
// 职责：
//   1. submitScore - 上报复合键（clearedCount DESC → lines/pieces/time ASC），编码为 score 降序
//   2. getRankList - 分页查询（全服/好友 × 周/月/总榜）
//   3. getMyRank  - 查询当前用户排名
//   4. getReplay  - 回放（兼容旧数据；闯关主榜通常无回放）
//
// 部署：上传后确认集合 rankings；建议对 mode + score 建组合索引

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTION = 'rankings';
const ALLOWED_MODES = ['stage'];
const ALLOWED_PERIODS = ['week', 'month', 'total'];
const MAX_PAGE_SIZE = 50;

const CLEARED_MUL = 1e10;
const LINES_MUL = 1e5;
const PIECES_MUL = 10;
const CAP_L = 90000;
const CAP_P = 90000;
const CAP_T = 99999;

function encodeRankScore(sums) {
    const s = sums || {};
    const c = Math.max(0, Math.min(999, Math.floor(Number(s.clearedCount) || 0)));
    const L = Math.max(0, Math.min(CAP_L, Math.floor(Number(s.linesSum) || 0)));
    const P = Math.max(0, Math.min(CAP_P, Math.floor(Number(s.piecesSum) || 0)));
    const T = Math.max(0, Math.min(CAP_T, Math.floor((Number(s.timeSum) || 0) / 1000)));
    return c * CLEARED_MUL
        + (CAP_L - L) * LINES_MUL
        + (CAP_P - P) * PIECES_MUL
        + (CAP_T - T);
}

function decodeClearedCount(score) {
    return Math.floor(Math.max(0, Number(score) || 0) / CLEARED_MUL);
}

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
 * 提交闯关复合键
 * @param {string} openid
 * @param {object} data
 */
async function submitScore(openid, data) {
    const mode = data.mode || 'stage';
    if (ALLOWED_MODES.indexOf(mode) < 0) {
        return { success: false, errMsg: 'invalid mode' };
    }

    const sums = {
        clearedCount: Math.max(0, Math.floor(Number(data.clearedCount) || 0)),
        linesSum: Math.max(0, Math.floor(Number(data.linesSum) || 0)),
        piecesSum: Math.max(0, Math.floor(Number(data.piecesSum) || 0)),
        timeSum: Math.max(0, Math.floor(Number(data.timeSum) || 0)),
    };
    let score = encodeRankScore(sums);
    if (!(sums.clearedCount > 0) && data.score != null) {
        score = Math.max(0, Math.floor(Number(data.score) || 0));
        sums.clearedCount = decodeClearedCount(score);
    }

    const coll = db.collection(COLLECTION);
    const now = Date.now();
    const profile = {
        nickname: typeof data.nickname === 'string' ? data.nickname.slice(0, 32) : '',
        avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl.slice(0, 512) : '',
    };

    let prev = null;
    try {
        const res = await coll.where({ openid, mode }).limit(1).get();
        prev = res.data && res.data[0] ? res.data[0] : null;
    } catch (e) {
        prev = null;
    }

    const isNewRecord = !prev || score > (prev.score || 0);

    if (isNewRecord) {
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
            clearedCount: sums.clearedCount,
            linesSum: sums.linesSum,
            piecesSum: sums.piecesSum,
            timeSum: sums.timeSum,
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
            // ignore
        }
    }

    let rank = null;
    try {
        const myScore = isNewRecord ? score : (prev.score || 0);
        const better = await coll.where({ mode, score: _.gt(myScore) }).count();
        rank = better.total + 1;
    } catch (e) {
        rank = null;
    }

    return {
        success: true,
        isNewRecord,
        rank,
        score: isNewRecord ? score : (prev && prev.score) || score,
        clearedCount: isNewRecord ? sums.clearedCount : (prev && prev.clearedCount) || sums.clearedCount,
        mode,
    };
}

async function getRankList(openid, data) {
    const mode = data.mode || 'stage';
    const type = data.type === 'friend' ? 'friend' : 'all';
    const period = ALLOWED_PERIODS.indexOf(data.period) >= 0 ? data.period : 'total';
    const page = Math.max(1, Math.floor(Number(data.page) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(data.pageSize) || 20)));

    if (ALLOWED_MODES.indexOf(mode) < 0) {
        return { success: false, errMsg: 'invalid mode' };
    }

    const coll = db.collection(COLLECTION);
    const where = { mode };

    if (period !== 'total') {
        where.updatedAt = _.gte(periodStart(period));
    }

    if (type === 'friend') {
        const friendOpenIds = Array.isArray(data.friendOpenIds) ? data.friendOpenIds.slice(0, 50) : [];
        if (friendOpenIds.length === 0) {
            return { success: true, list: [], total: 0, page, pageSize, myRank: null, myScore: null };
        }
        where.openid = _.in(friendOpenIds);
    }

    const query = coll.where(where);

    let total = 0;
    try {
        const c = await query.count();
        total = c.total;
    } catch (e) {
        total = 0;
    }

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
            clearedCount: typeof item.clearedCount === 'number'
                ? item.clearedCount
                : decodeClearedCount(item.score || 0),
            linesSum: item.linesSum || 0,
            piecesSum: item.piecesSum || 0,
            timeSum: item.timeSum || 0,
            updatedAt: item.updatedAt || 0,
            hasReplay: !!(item.replay && item.replay.seed != null),
        }));
    } catch (e) {
        list = [];
    }

    let myRank = null;
    let myScore = null;
    let myCleared = null;
    try {
        const myWhere = { openid, mode };
        if (period !== 'total') {
            myWhere.updatedAt = _.gte(periodStart(period));
        }
        const my = await coll.where(myWhere).orderBy('score', 'desc').limit(1).get();
        if (my.data && my.data[0]) {
            myScore = my.data[0].score || 0;
            myCleared = typeof my.data[0].clearedCount === 'number'
                ? my.data[0].clearedCount
                : decodeClearedCount(myScore);
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
        // ignore
    }

    return {
        success: true,
        list,
        total,
        page,
        pageSize,
        myRank,
        myScore,
        myClearedCount: myCleared,
    };
}

async function getMyRank(openid, data) {
    const mode = data.mode || 'stage';
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
        return {
            success: true,
            myRank: better.total + 1,
            myScore,
            clearedCount: typeof my.data[0].clearedCount === 'number'
                ? my.data[0].clearedCount
                : decodeClearedCount(myScore),
            hasRecord: true,
        };
    } catch (e) {
        return { success: false, errMsg: (e && e.errMsg) || String(e) };
    }
}

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
        // ignore
    }

    return { success: false, errMsg: 'replay not found' };
}

function periodStart(period) {
    const now = new Date();
    if (period === 'week') {
        const day = now.getDay() || 7;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).getTime();
    }
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function defaultName(openid) {
    const tail = String(openid || '').slice(-4);
    return tail ? '玩家' + tail : '玩家';
}
