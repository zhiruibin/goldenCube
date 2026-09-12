// 排行榜云函数（挖个方块 · 闯关复合键）
// 职责：
//   1. submitScore - 上报复合键（clearedCount DESC → lines/pieces/time ASC），编码为 score 降序
//   2. getRankList - 查询全服 Top 20 生涯榜
//   3. getMyRank  - 查询当前用户排名
//   4. getReplay  - 回放（兼容旧数据；闯关主榜通常无回放）

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTION = 'rankings';
const ALLOWED_MODES = ['stage'];
const TOP_LIMIT = 20;

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

function isBetterSums(a, b) {
    if (!b) return true;
    const oldCleared = typeof b.clearedCount === 'number' ? b.clearedCount : decodeClearedCount(b.score || 0);
    if (a.clearedCount !== oldCleared) return a.clearedCount > oldCleared;
    // 旧数据可能只有 score；无法还原效率时继续使用兼容分。
    if (typeof b.linesSum !== 'number') return encodeRankScore(a) > (b.score || 0);
    if (a.linesSum !== b.linesSum) return a.linesSum < b.linesSum;
    if (a.piecesSum !== b.piecesSum) return a.piecesSum < b.piecesSum;
    return a.timeSum < b.timeSum;
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
 * 仅破纪录时写入分数与 achievedAt；未破纪录可更新昵称头像，但不得改动 achievedAt。
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

    const isNewRecord = isBetterSums(sums, prev);

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
            achievedAt: now,
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
            // 旧数据补 achievedAt：用历史时间，保留同分先后顺序
            if (!prev.achievedAt) {
                const legacy = Number(prev.updatedAt) || Number(prev.createdAt) || 0;
                if (legacy > 0) patch.achievedAt = legacy;
            }
            await coll.doc(prev._id).update({ data: patch });
        } catch (e) {
            // ignore
        }
    } else if (prev && prev._id && !prev.achievedAt) {
        // 纯上报未破纪录且无资料：顺带补齐旧字段
        try {
            const legacy = Number(prev.updatedAt) || Number(prev.createdAt) || 0;
            if (legacy > 0) {
                await coll.doc(prev._id).update({ data: { achievedAt: legacy } });
            }
        } catch (e) {
            // ignore
        }
    }

    let rank = null;
    try {
        const mine = isNewRecord ? sums : prev;
        rank = await countBetter(coll, { mode }, mine) + 1;
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
    const page = 1;
    const pageSize = TOP_LIMIT;

    if (ALLOWED_MODES.indexOf(mode) < 0) {
        return { success: false, errMsg: 'invalid mode' };
    }

    const coll = db.collection(COLLECTION);
    const where = { mode };

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

    // 全服榜直接按独立字段做严格字典序，不再依赖有精度折损的复合数值。
    let list = [];
    try {
        const ranked = query
            .orderBy('clearedCount', 'desc')
            .orderBy('linesSum', 'asc')
            .orderBy('piecesSum', 'asc')
            .orderBy('timeSum', 'asc')
            .orderBy('achievedAt', 'asc');
        const res = await ranked
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
            updatedAt: item.achievedAt || item.updatedAt || 0,
            achievedAt: item.achievedAt || item.updatedAt || 0,
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
        const my = await coll.where(myWhere).orderBy('score', 'desc').limit(1).get();
        if (my.data && my.data[0]) {
            myScore = my.data[0].score || 0;
            myCleared = typeof my.data[0].clearedCount === 'number'
                ? my.data[0].clearedCount
                : decodeClearedCount(myScore);
            const rankScope = { mode };
            if (type === 'friend') {
                const friendOpenIds = Array.isArray(data.friendOpenIds) ? data.friendOpenIds.slice(0, 50) : [];
                if (friendOpenIds.length > 0) {
                    rankScope.openid = _.in(friendOpenIds);
                }
            }
            myRank = await countBetter(coll, rankScope, my.data[0]) + 1;
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

async function countBetter(coll, scope, mine) {
    const parts = [
        Object.assign({}, scope, { clearedCount: _.gt(mine.clearedCount || 0) }),
        Object.assign({}, scope, { clearedCount: mine.clearedCount || 0, linesSum: _.lt(mine.linesSum || 0) }),
        Object.assign({}, scope, { clearedCount: mine.clearedCount || 0, linesSum: mine.linesSum || 0, piecesSum: _.lt(mine.piecesSum || 0) }),
        Object.assign({}, scope, {
            clearedCount: mine.clearedCount || 0,
            linesSum: mine.linesSum || 0,
            piecesSum: mine.piecesSum || 0,
            timeSum: _.lt(mine.timeSum || 0),
        }),
    ];
    let total = 0;
    for (const where of parts) {
        const result = await coll.where(where).count();
        total += result.total || 0;
    }
    return total;
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
        return {
            success: true,
            myRank: await countBetter(coll, { mode }, my.data[0]) + 1,
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

function defaultName(openid) {
    const tail = String(openid || '').slice(-4);
    return tail ? '玩家' + tail : '玩家';
}
