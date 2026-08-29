/**
 * cloud-service - 云开发服务封装
 * 职责：向游戏场景提供统一的云能力 API，并在云开发不可用时自动降级
 *
 * 能力：
 *   - init()              ：初始化云开发（wx.cloud.init），失败时进入本地降级模式
 *   - submitScore()       ：上报本局分数（云函数全服榜 + 开放数据域好友榜）
 *   - getRankList()       ：查询全服排行榜（周/月/总榜，分页）
 *   - getMyRank()         ：查询我的最高分与排名
 *   - renderFriendRank()  ：请求开放数据域渲染好友榜到 sharedCanvas
 *   - sendFriendTouch()   ：把主域触摸事件转发给开放数据域（好友榜滚动）
 *   - isAvailable()       ：云开发是否可用
 *   - createChallenge()   ：发起挑战（云函数 challenge）
 *   - respondChallenge()  ：应战并写回结果
 *   - getMyChallenges()   ：我的挑战（待对方应战 + 已完成）
 *   - getChallengeById()  ：挑战详情（分享卡片进入时读取）
 *   - cancelChallenge()   ：撤回挑战（仅发起者可撤回 pending 挑战）
 *
 * 架构说明：
 *   - 好友榜的 wx.setUserCloudStorage / wx.getFriendCloudStorage 只能在开放数据域调用，
 *     主域通过 wx.getOpenDataContext().postMessage() 与之通信；
 *   - 全服榜走云函数 rank + 云数据库 rankings；
 *   - 云开发未开通/调用失败时自动降级：好友榜显示开放数据域（即使无云开发也能显示
 *     本地好友数据），全服榜显示本地缓存或空列表。
 */

const {
    CLOUD_ENV,
    GAME_MODES,
    CHALLENGE_MODES,
} = require('./cloud-config');
const { encodeRankScore } = require('./rank-score');

/** 本地缓存键（按 模式_周期 维度缓存最近一次全服榜结果） */
function cacheKey(mode, period) {
    return 'gc_rank_cache_' + mode + '_' + period;
}

class CloudService {
    constructor() {
        this._available = false;
        this._initTried = false;
        this._openData = null;
    }

    /** 是否已初始化并可用 */
    isAvailable() {
        return this._available;
    }

    /** 初始化云开发（幂等） */
    init() {
        if (this._initTried) return this._available;
        this._initTried = true;

        try {
            if (typeof wx === 'undefined' || typeof wx.cloud === 'undefined') {
                console.warn('[Cloud] wx.cloud 不可用，进入本地降级模式');
                return false;
            }

            // 41002 appid missing：多数是开发者工具未带上 AppID（游客/未登录/项目详情 AppID 为空）
            let runtimeAppId = '';
            try {
                const acc = wx.getAccountInfoSync && wx.getAccountInfoSync();
                runtimeAppId = (acc
                    && acc.miniProgram
                    && acc.miniProgram.appId) || '';
            } catch (e) { /* ignore */ }

            if (!runtimeAppId) {
                console.warn(
                    '[Cloud] 运行时 AppID 为空（err 41002 常见原因）。'
                    + '请在微信开发者工具「详情 → 基本信息」确认 AppID 为 wxaf95434d9f7c7962，'
                    + '并用该小游戏管理员账号登录；不要用游客模式。进入本地降级。'
                );
                this._available = false;
                return false;
            }

            if (CLOUD_ENV) {
                wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
            } else {
                wx.cloud.init({ traceUser: true });
            }
            this._cloud = wx.cloud;
            this._available = true;
            console.log(
                '[Cloud] 云开发初始化成功',
                'appId=' + runtimeAppId,
                CLOUD_ENV ? 'env=' + CLOUD_ENV : '默认环境'
            );
        } catch (e) {
            console.warn('[Cloud] 云开发初始化失败，进入本地降级模式', e);
            this._available = false;
        }
        return this._available;
    }

    /**
     * 上报闯关榜复合键（通关数 / 消行和 / 块和 / 时和）
     * @param {object} payload { clearedCount, linesSum, piecesSum, timeSum, nickname, avatarUrl, detail }
     * @returns {Promise<{success, isNewRecord, rank, score, clearedCount}>}
     */
    async submitScore(payload) {
        const mode = GAME_MODES.indexOf(payload && payload.mode) >= 0
            ? payload.mode
            : 'stage';
        const sums = {
            clearedCount: Math.max(0, Math.floor(Number(payload && payload.clearedCount) || 0)),
            linesSum: Math.max(0, Math.floor(Number(payload && payload.linesSum) || 0)),
            piecesSum: Math.max(0, Math.floor(Number(payload && payload.piecesSum) || 0)),
            timeSum: Math.max(0, Math.floor(Number(payload && payload.timeSum) || 0)),
        };
        // 兼容旧调用：仅传 score 时当作编码分
        let score = encodeRankScore(sums);
        if (!(sums.clearedCount > 0) && payload && payload.score != null) {
            score = Math.max(0, Math.floor(Number(payload.score) || 0));
        }

        if (!this.isAvailable()) {
            this._submitFriendScore(mode, score);
            return {
                success: false,
                isNewRecord: false,
                rank: null,
                score,
                clearedCount: sums.clearedCount,
                offline: true,
            };
        }

        try {
            const res = await wx.cloud.callFunction({
                name: 'rank',
                data: {
                    action: 'submitScore',
                    data: {
                        mode,
                        score,
                        clearedCount: sums.clearedCount,
                        linesSum: sums.linesSum,
                        piecesSum: sums.piecesSum,
                        timeSum: sums.timeSum,
                        detail: (payload && payload.detail) || null,
                        nickname: (payload && payload.nickname) || '',
                        avatarUrl: (payload && payload.avatarUrl) || '',
                        replay: (payload && payload.replay) || null,
                    },
                },
            });
            const r = (res && res.result) || {};
            if (!r.success) {
                console.warn('[Cloud] 上报分数未成功', {
                    errMsg: r.errMsg || '(无 errMsg，请确认已上传部署云函数 rank)',
                    result: r,
                    raw: res,
                });
            }
            this._submitFriendScore(mode, score);
            return {
                success: !!r.success,
                isNewRecord: !!r.isNewRecord,
                rank: typeof r.rank === 'number' ? r.rank : null,
                score: typeof r.score === 'number' ? r.score : score,
                clearedCount: typeof r.clearedCount === 'number' ? r.clearedCount : sums.clearedCount,
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] 上报分数失败（callFunction 异常）', e);
            this._submitFriendScore(mode, score);
            return {
                success: false,
                isNewRecord: false,
                rank: null,
                score,
                clearedCount: sums.clearedCount,
                offline: false,
                errMsg: (e && e.errMsg) || String(e),
            };
        }
    }

    /**
     * 查询全服排行榜
     * @param {object} opts { mode, period, page, pageSize }
     * @returns {Promise<{success:boolean, list:Array, total:number, myRank:number|null, myScore:number|null, offline:boolean, fromCache:boolean}>}
     */
    async getRankList(opts) {
        const mode = GAME_MODES.indexOf(opts && opts.mode) >= 0 ? opts.mode : 'stage';
        const period = (opts && opts.period) || 'total';
        const page = Math.max(1, Math.floor(Number(opts && opts.page) || 1));
        const pageSize = Math.min(50, Math.max(1, Math.floor(Number(opts && opts.pageSize) || 20)));
        const key = cacheKey(mode, period);

        if (!this.isAvailable()) {
            const cached = this._readCache(key);
            if (cached) {
                return { success: true, list: cached.list, total: cached.total, myRank: cached.myRank, myScore: cached.myScore, offline: true, fromCache: true };
            }
            return { success: false, list: [], total: 0, myRank: null, myScore: null, offline: true, fromCache: false };
        }

        try {
            const res = await wx.cloud.callFunction({
                name: 'rank',
                data: {
                    action: 'getRankList',
                    data: { mode, type: 'all', period, page, pageSize },
                },
            });
            const r = (res && res.result) || {};
            if (r.success) {
                const payload = {
                    list: r.list || [],
                    total: r.total || 0,
                    myRank: typeof r.myRank === 'number' ? r.myRank : null,
                    myScore: typeof r.myScore === 'number' ? r.myScore : null,
                };
                this._writeCache(key, payload);
                return { ...payload, success: true, offline: false, fromCache: false };
            }
            // 云函数返回失败 → 尝试本地缓存
            const cached = this._readCache(key);
            if (cached) {
                return { ...cached, success: true, offline: true, fromCache: true };
            }
            return { success: false, list: [], total: 0, myRank: null, myScore: null, offline: false, fromCache: false };
        } catch (e) {
            console.warn('[Cloud] 查询全服排行榜失败', e);
            const cached = this._readCache(key);
            if (cached) {
                return { ...cached, success: true, offline: true, fromCache: true };
            }
            return { success: false, list: [], total: 0, myRank: null, myScore: null, offline: false, fromCache: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /**
     * 获取单条回放（全服排行榜回放）
     * @param {string} replayId
     * @returns {Promise<{success:boolean, replay:object|null, mode:string, offline:boolean, errMsg?:string}>}
     */
    async getReplay(replayId) {
        if (!replayId) {
            return { success: false, replay: null, offline: false, errMsg: 'replayId 无效' };
        }
        if (!this.isAvailable()) {
            return { success: false, replay: null, offline: true };
        }
        try {
            const res = await wx.cloud.callFunction({
                name: 'rank',
                data: {
                    action: 'getReplay',
                    data: { replayId },
                },
            });
            const r = (res && res.result) || {};
            if (r.success) {
                return { success: true, replay: r.replay || null, mode: r.mode || '', offline: false };
            }
            return { success: false, replay: null, offline: false, errMsg: r.errMsg || '' };
        } catch (e) {
            console.warn('[Cloud] 获取回放失败', e);
            return { success: false, replay: null, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /**
     * 查询我的最高分与排名
     * @param {object} opts { mode }
     */
    async getMyRank(opts) {
        const mode = GAME_MODES.indexOf(opts && opts.mode) >= 0 ? opts.mode : 'stage';
        if (!this.isAvailable()) {
            return { success: false, myRank: null, myScore: null, offline: true };
        }
        try {
            const res = await wx.cloud.callFunction({
                name: 'rank',
                data: { action: 'getMyRank', data: { mode } },
            });
            const r = (res && res.result) || {};
            return {
                success: !!r.success,
                myRank: typeof r.myRank === 'number' ? r.myRank : null,
                myScore: typeof r.myScore === 'number' ? r.myScore : null,
                hasRecord: !!r.hasRecord,
                offline: false,
            };
        } catch (e) {
            return { success: false, myRank: null, myScore: null, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /**
     * 发起挑战
     * @param {object} payload { mode, score, nickname, avatarUrl, target*, workshop* }
     */
    async createChallenge(payload) {
        const rawMode = (payload && payload.mode) || 'stage';
        const mode = (CHALLENGE_MODES || []).indexOf(rawMode) >= 0
            ? rawMode
            : (GAME_MODES.indexOf(rawMode) >= 0 ? rawMode : 'stage');
        const score = Math.max(0, Math.floor(Number(payload && payload.score) || 0));

        if (!this.isAvailable()) {
            return { success: false, challengeId: '', challenge: null, offline: true, errMsg: 'cloud unavailable' };
        }

        try {
            const data = {
                mode,
                score,
                nickname: (payload && payload.nickname) || '',
                avatarUrl: (payload && payload.avatarUrl) || '',
                targetName: (payload && payload.targetName) || '',
                targetAvatar: (payload && payload.targetAvatar) || '',
                targetOpenid: (payload && payload.targetOpenid) || '',
            };
            // 工坊 / 官方关残局挑战共用布局与成绩字段
            if (mode === 'workshop' || (mode === 'stage' && payload && payload.layoutSnapshot)) {
                data.workshopStageId = (payload && (payload.workshopStageId || payload.stageId)) || '';
                data.workshopTitle = (payload && (payload.workshopTitle || payload.stageTitle)) || '';
                data.layoutSnapshot = (payload && payload.layoutSnapshot) || null;
                data.challengerLines = Math.max(0, Math.floor(Number(payload && payload.challengerLines) || 0));
                data.challengerPieces = Math.max(0, Math.floor(Number(payload && payload.challengerPieces) || 0));
                data.challengerTimeMs = Math.max(0, Math.floor(Number(payload && payload.challengerTimeMs) || 0));
            }
            const res = await wx.cloud.callFunction({
                name: 'challenge',
                data: { action: 'createChallenge', data },
            });
            const r = (res && res.result) || {};
            return {
                success: !!r.success,
                challengeId: r.challengeId || '',
                challenge: r.challenge || null,
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] 发起挑战失败', e);
            return { success: false, challengeId: '', challenge: null, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /*** 应战并写回结果
     * @param {object} payload { challengeId, score, nickname, avatarUrl, lines, pieces, timeMs }
     */
    async respondChallenge(payload) {
        const challengeId = payload && payload.challengeId;
        if (!challengeId) {
            return { success: false, challengeId: '', result: null, challenge: null, offline: false, errMsg: 'challengeId 无效' };
        }
        const score = Math.max(0, Math.floor(Number(payload && payload.score) || 0));

        if (!this.isAvailable()) {
            return { success: false, challengeId: '', result: null, challenge: null, offline: true, errMsg: 'cloud unavailable' };
        }

        try {
            const res = await wx.cloud.callFunction({
                name: 'challenge',
                data: {
                    action: 'respondChallenge',
                    data: {
                        challengeId,
                        score,
                        nickname: (payload && payload.nickname) || '',
                        avatarUrl: (payload && payload.avatarUrl) || '',
                        lines: payload && payload.lines,
                        pieces: payload && payload.pieces,
                        timeMs: payload && payload.timeMs,
                    },
                },
            });
            const r = (res && res.result) || {};
            return {
                success: !!r.success,
                challengeId: r.challengeId || challengeId,
                result: r.result || null,
                mode: r.mode || '',
                challengerScore: typeof r.challengerScore === 'number'
                    ? r.challengerScore
                    : (r.challenge && typeof r.challenge.challengerScore === 'number' ? r.challenge.challengerScore : null),
                responderScore: typeof r.responderScore === 'number'
                    ? r.responderScore
                    : (r.challenge && typeof r.challenge.responderScore === 'number' ? r.challenge.responderScore : null),
                challengerLines: typeof r.challengerLines === 'number' ? r.challengerLines : null,
                responderLines: typeof r.responderLines === 'number' ? r.responderLines : null,
                challenge: r.challenge || null,
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] 应战失败', e);
            return { success: false, challengeId: challengeId, result: null, challenge: null, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /*** 我的挑战（待对方应战 + 已完成）
     * @returns {Promise<{success:boolean, pending:Array, completed:Array, offline:boolean, errMsg?:string}>}
     */
    async getMyChallenges() {
        if (!this.isAvailable()) {
            return { success: false, pending: [], completed: [], offline: true };
        }
        try {
            const res = await wx.cloud.callFunction({
                name: 'challenge',
                data: { action: 'getMyChallenges' },
            });
            const r = (res && res.result) || {};
            return {
                success: !!r.success,
                pending: r.pending || [],
                completed: r.completed || [],
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] 查询我的挑战失败', e);
            return { success: false, pending: [], completed: [], offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /**
     * 把本人微信资料回写到相关挑战记录（发起方 / 应战方 / 意向目标）
     * @param {{nickname?: string, avatarUrl?: string}} profile
     */
    async syncMyChallengeProfile(profile) {
        const nickname = (profile && profile.nickname) || '';
        if (!nickname || !this.isAvailable()) {
            return { success: false };
        }
        try {
            const res = await wx.cloud.callFunction({
                name: 'challenge',
                data: {
                    action: 'syncMyProfile',
                    data: {
                        nickname,
                        avatarUrl: (profile && profile.avatarUrl) || '',
                    },
                },
            });
            const r = (res && res.result) || {};
            return { success: !!r.success, updated: r.updated || null, errMsg: r.errMsg || '' };
        } catch (e) {
            console.warn('[Cloud] 同步挑战资料失败', e);
            return { success: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /**
     * 被挑战方打开分享卡时认领挑战（绑定 targetOpenid，供授权后资料回写）
     * @param {string} challengeId
     * @param {{nickname?: string, avatarUrl?: string}} [profile]
     */
    async claimChallengeInvite(challengeId, profile) {
        if (!challengeId || !this.isAvailable()) {
            return { success: false };
        }
        try {
            const res = await wx.cloud.callFunction({
                name: 'challenge',
                data: {
                    action: 'claimChallengeInvite',
                    data: {
                        challengeId: String(challengeId),
                        nickname: (profile && profile.nickname) || '',
                        avatarUrl: (profile && profile.avatarUrl) || '',
                    },
                },
            });
            const r = (res && res.result) || {};
            return {
                success: !!r.success,
                claimed: !!r.claimed,
                challenge: r.challenge || null,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] 认领挑战失败', e);
            return { success: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /*** 挑战详情（分享卡片进入时读取）
     * @param {string} challengeId
     * @returns {Promise<{success:boolean, challenge:object|null, offline:boolean, errMsg?:string}>}
     */
    async getChallengeById(challengeId) {
        if (!challengeId) {
            return { success: false, challenge: null, offline: false, errMsg: 'challengeId 无效' };
        }
        if (!this.isAvailable()) {
            return { success: false, challenge: null, offline: true };
        }
        try {
            const res = await wx.cloud.callFunction({
                name: 'challenge',
                data: {
                    action: 'getChallengeById',
                    data: { challengeId },
                },
            });
            const r = (res && res.result) || {};
            return {
                success: !!r.success,
                challenge: r.challenge || null,
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] 查询挑战详情失败', e);
            return { success: false, challenge: null, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /*** 撤回挑战（仅发起者可撤回 pending 挑战）
     * @param {string} challengeId
     * @returns {Promise<{success:boolean, challengeId:string, offline:boolean, errMsg?:string}>}
     */
    async cancelChallenge(challengeId) {
        if (!challengeId) {
            return { success: false, challengeId: '', offline: false, errMsg: 'challengeId 无效' };
        }
        if (!this.isAvailable()) {
            return { success: false, challengeId: '', offline: true, errMsg: 'cloud unavailable' };
        }
        try {
            const res = await wx.cloud.callFunction({
                name: 'challenge',
                data: {
                    action: 'cancelChallenge',
                    data: { challengeId },
                },
            });
            const r = (res && res.result) || {};
            return {
                success: !!r.success,
                challengeId: r.challengeId || challengeId,
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] 撤回挑战失败', e);
            return { success: false, challengeId: challengeId, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    /*** 请求开放数据域渲染好友榜（好友榜数据由开放数据域绘制到 sharedCanvas）
     * @param {object} opts { mode, x, y, width, height, screenW, screenH }
     *   - x/y    ：好友榜列表在主屏的逻辑位置（开放数据域在 sharedCanvas 的 (x, y) 处绘制）
     *   - width/height：列表逻辑尺寸
     *   - screenW/screenH：屏幕逻辑宽高（开放数据域据此把 sharedCanvas 实际尺寸换算成绘制缩放）
     */
    renderFriendRank(opts) {
        try {
            const od = this._getOpenData();
            if (!od) return;
            od.postMessage({
                action: 'render',
                mode: (opts && opts.mode) || 'stage',
                x: opts && opts.x,
                y: opts && opts.y,
                width: opts && opts.width,
                height: opts && opts.height,
                screenW: opts && opts.screenW,
                screenH: opts && opts.screenH,
            });
        } catch (e) {
            console.warn('[Cloud] 请求好友榜渲染失败', e);
        }
    }


    /**
     * 把主域触摸事件转发给开放数据域（好友榜滚动）
     * @param {string} action touchStart | touchMove | touchEnd
     */
    sendFriendTouch(action, identifier, x, y) {
        try {
            const od = this._getOpenData();
            if (!od) return;
            od.postMessage({ action, identifier, x, y });
        } catch (e) {
            // 忽略
        }
    }

    /** 获取开放数据域实例 */
    _getOpenData() {
        try {
            if (!this._openData) {
                this._openData = wx.getOpenDataContext();
            }
            return this._openData;
        } catch (e) {
            return null;
        }
    }

    /**
     * 上报好友榜分数（经开放数据域调用 wx.setUserCloudStorage）
     * @param {string} mode
     * @param {number} score
     */
    _submitFriendScore(mode, score) {
        try {
            const od = this._getOpenData();
            if (!od) return;
            od.postMessage({
                action: 'submitScore',
                mode,
                score,
            });
        } catch (e) {
            // 忽略：开放数据域不可用时静默跳过
        }
    }

    /** 读取本地缓存 */
    _readCache(key) {
        try {
            return wx.getStorageSync(key) || null;
        } catch (e) {
            return null;
        }
    }

    /** 写入本地缓存 */
    _writeCache(key, payload) {
        try {
            wx.setStorageSync(key, payload);
        } catch (e) {
            // 忽略存储异常
        }
    }

    // ---------- 工坊 / 广场 ----------

    _callWorkshop(action, data) {
        return wx.cloud.callFunction({
            name: 'workshop',
            data: { action, data: data || {} },
        }).then((res) => (res && res.result) || { success: false, errMsg: 'empty result' });
    }

    /** 发布关卡到广场 */
    async publishWorkshopStage(payload) {
        if (!this.isAvailable()) {
            return { success: false, offline: true, errMsg: 'cloud unavailable' };
        }
        try {
            const r = await this._callWorkshop('publishStage', payload);
            return Object.assign({ offline: false }, r);
        } catch (e) {
            console.warn('[Cloud] publishWorkshopStage', e);
            return { success: false, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    async delistWorkshopStage(stageId) {
        if (!this.isAvailable()) {
            return { success: false, offline: true, errMsg: 'cloud unavailable' };
        }
        try {
            const r = await this._callWorkshop('delistStage', { stageId });
            return Object.assign({ offline: false }, r);
        } catch (e) {
            return { success: false, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    async listPlaza(opts) {
        if (!this.isAvailable()) {
            return { success: false, list: [], total: 0, offline: true };
        }
        try {
            const r = await this._callWorkshop('listPlaza', {
                sort: (opts && opts.sort) || 'new',
                page: (opts && opts.page) || 1,
                pageSize: (opts && opts.pageSize) || 30,
            });
            return {
                success: !!r.success,
                list: r.list || [],
                total: r.total || 0,
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            console.warn('[Cloud] listPlaza', e);
            return { success: false, list: [], total: 0, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    async getWorkshopStage(stageId) {
        if (!this.isAvailable()) {
            return { success: false, stage: null, offline: true };
        }
        try {
            const r = await this._callWorkshop('getStage', { stageId });
            return {
                success: !!r.success,
                stage: r.stage || null,
                offline: false,
                errMsg: r.errMsg || '',
            };
        } catch (e) {
            return { success: false, stage: null, offline: false, errMsg: (e && e.errMsg) || String(e) };
        }
    }

    async reportWorkshopPlay(stageId) {
        if (!this.isAvailable() || !stageId) return { success: false };
        try {
            return await this._callWorkshop('reportPlay', { stageId });
        } catch (e) {
            return { success: false };
        }
    }

    async reportWorkshopClear(stageId) {
        if (!this.isAvailable() || !stageId) return { success: false };
        try {
            return await this._callWorkshop('reportClear', { stageId });
        } catch (e) {
            return { success: false };
        }
    }

    async bumpWorkshopChallenge(stageId) {
        if (!this.isAvailable() || !stageId) return { success: false };
        try {
            return await this._callWorkshop('bumpChallenge', { stageId });
        } catch (e) {
            return { success: false };
        }
    }
}

/** 全局单例 */
const cloudService = new CloudService();

module.exports = { CloudService, cloudService };
