// 排行榜云函数（挖个方块 · 闯关复合键）
// 职责：
//   1. submitScore - 上报复合键（clearedCount DESC → lines/pieces/time ASC），编码为 score 降序
//   2. getRankList - 查询全服 Top 20 生涯榜
//   3. getMyRank  - 查询当前用户排名
//   4. syncStageProgress - 合并并返回逐关最佳成绩云存档

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTION = 'rankings';
const SAVE_COLLECTION = 'player_saves';
const PROGRESS_COLLECTION = 'player_progress';
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
        case 'syncStageProgress':
            return await syncStageProgress(OPENID, data || {});
        case 'pullPlayerSave':
            return await pullPlayerSave(OPENID);
        case 'pushPlayerSave':
            return await pushPlayerSave(OPENID, data || {});
        case 'recordLoginDay':
            return await recordLoginDay(OPENID, data || {});
        default:
            return { success: false, errMsg: `Unknown action: ${action}` };
    }
};

const LOGIN_BADGES = [
    { id: 'login_7', days: 7 },
    { id: 'login_30', days: 30 },
    { id: 'login_100', days: 100 },
    { id: 'login_365', days: 365 },
];

function beijingDay(timestamp) {
    return new Date(Number(timestamp) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 服务端自然日累计；同一北京时间日期重复调用不会重复加一。 */
async function recordLoginDay(openid, data) {
    const now = Date.now();
    const today = beijingDay(now);
    const coll = db.collection(PROGRESS_COLLECTION);
    const found = await coll.where({ openid }).limit(1).get();
    const prev = (found.data && found.data[0]) || null;
    const login = (prev && prev.loginProgress) || {};
    const local = data && data.localProgress && typeof data.localProgress === 'object'
        ? data.localProgress : {};
    const alreadyCountedToday = login.lastLoginDay === today || local.lastLoginDay === today;
    const total = Math.max(
        0,
        Math.floor(Number(login.totalLoginDays) || 0),
        Math.floor(Number(local.totalLoginDays) || 0)
    ) + (alreadyCountedToday ? 0 : 1);
    const earned = Array.from(new Set(
        (Array.isArray(login.earnedBadgeIds) ? login.earnedBadgeIds : [])
            .concat(Array.isArray(local.earnedBadgeIds) ? local.earnedBadgeIds : [])
    ));
    const newlyEarned = [];
    LOGIN_BADGES.forEach((badge) => {
        if (total < badge.days || earned.indexOf(badge.id) >= 0) return;
        earned.push(badge.id);
        newlyEarned.push(badge.id);
    });
    const progress = { lastLoginDay: today, totalLoginDays: total, earnedBadgeIds: earned };
    const record = { openid, loginProgress: progress, updatedAt: now };
    if (prev && prev._id) await coll.doc(prev._id).update({ data: record });
    else await coll.add({ data: record });
    return { success: true, progress, newlyEarned };
}

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

    const progressMerge = mergeStageProgress(
        (prev && prev.stageProgress) || {},
        data.stageBest ? [data.stageBest] : []
    );

    const isNewRecord = isBetterSums(sums, prev);

    if (isNewRecord) {
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
            stageProgress: progressMerge.progress,
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
    } else if (prev && prev._id && (profile.nickname || profile.avatarUrl || progressMerge.changed)) {
        try {
            const patch = { updatedAt: now };
            if (profile.nickname) patch.nickname = profile.nickname;
            if (profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;
            if (progressMerge.changed) patch.stageProgress = progressMerge.progress;
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

function sanitizeStageBest(raw) {
    const stageId = Math.floor(Number(raw && raw.stageId));
    const lines = Math.floor(Number(raw && raw.lines));
    const pieces = Math.max(0, Math.floor(Number(raw && raw.pieces) || 0));
    const timeMs = Math.max(0, Math.floor(Number(raw && raw.timeMs) || 0));
    if (!(stageId >= 1 && stageId <= 1000) || !(lines >= 1 && lines <= 10000)) return null;
    return { stageId, lines, pieces, timeMs };
}

function isBetterStageBest(a, b) {
    if (!b) return true;
    if (a.lines !== b.lines) return a.lines < b.lines;
    if (a.pieces !== b.pieces) return a.pieces < b.pieces;
    return a.timeMs < b.timeMs;
}

function mergeStageProgress(base, incoming) {
    const progress = Object.assign({}, base && typeof base === 'object' ? base : {});
    let changed = false;
    (Array.isArray(incoming) ? incoming : []).slice(0, 1000).forEach((raw) => {
        const rec = sanitizeStageBest(raw);
        if (!rec) return;
        const key = String(rec.stageId);
        const old = sanitizeStageBest(Object.assign({ stageId: rec.stageId }, progress[key] || {}));
        if (!isBetterStageBest(rec, old)) return;
        progress[key] = { lines: rec.lines, pieces: rec.pieces, timeMs: rec.timeMs };
        changed = true;
    });
    return { progress, changed };
}

async function syncStageProgress(openid, data) {
    const coll = db.collection(COLLECTION);
    const found = await coll.where({ openid, mode: 'stage' }).limit(1).get();
    const prev = (found.data && found.data[0]) || null;
    const merged = mergeStageProgress((prev && prev.stageProgress) || {}, data.records || []);
    if (prev && prev._id && merged.changed) {
        await coll.doc(prev._id).update({ data: { stageProgress: merged.progress, updatedAt: Date.now() } });
    }
    return { success: true, progress: merged.progress };
}

function sanitizeSaveSnapshot(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid snapshot');
    const snapshot = {};
    const keys = Object.keys(raw);
    if (keys.length > 500) throw new Error('too many save keys');
    keys.forEach((key) => {
        if (!/^gc_[A-Za-z0-9_:-]{1,100}$/.test(key)) return;
        snapshot[key] = raw[key];
    });
    if (JSON.stringify(snapshot).length > 750000) throw new Error('snapshot too large');
    return snapshot;
}

async function pullPlayerSave(openid) {
    const res = await db.collection(SAVE_COLLECTION).where({ openid }).limit(1).get();
    const doc = (res.data && res.data[0]) || null;
    return {
        success: true,
        exists: !!doc,
        revision: doc ? (Number(doc.revision) || 0) : 0,
        snapshot: doc && doc.snapshot && typeof doc.snapshot === 'object' ? doc.snapshot : {},
        updatedAt: doc ? (Number(doc.updatedAt) || 0) : 0,
    };
}

async function pushPlayerSave(openid, data) {
    const snapshot = sanitizeSaveSnapshot(data.snapshot);
    const coll = db.collection(SAVE_COLLECTION);
    const found = await coll.where({ openid }).limit(1).get();
    const prev = (found.data && found.data[0]) || null;
    const expected = Math.max(0, Math.floor(Number(data.baseRevision) || 0));
    const remoteRevision = prev ? (Number(prev.revision) || 0) : 0;
    if (prev && expected !== remoteRevision) {
        return {
            success: false,
            conflict: true,
            revision: remoteRevision,
            snapshot: prev.snapshot || {},
            errMsg: 'revision conflict',
        };
    }
    const now = Date.now();
    const nextRevision = remoteRevision + 1;
    const record = { openid, snapshot, revision: nextRevision, updatedAt: now };
    if (prev && prev._id) await coll.doc(prev._id).update({ data: record });
    else await coll.add({ data: Object.assign({ createdAt: now }, record) });
    return { success: true, revision: nextRevision, updatedAt: now };
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

function defaultName(openid) {
    const tail = String(openid || '').slice(-4);
    return tail ? '玩家' + tail : '玩家';
}
