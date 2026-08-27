/**
 * ResultScene - 结算场景
 * 职责：显示本局成绩（含详细统计）、按模式最高分、激励视频双倍金币、分享卡片、插屏广告
 * 注意：广告奖励只加金币，绝不改本局分数或重报排行榜（保护榜单/挑战公正）
 */

const { Button } = require('../widgets/button');
const { cloudService } = require('../../utils/cloud-service');
const IconRenderer = require('../render/icon-renderer');
const PENDING_CHALLENGES_KEY = require('./challenge-scene').PENDING_CHALLENGES_KEY;
const {
    AMBIENT_PIECE_COLORS,
    ACCENT,
    SUBTITLE,
    MUTED,
    fillNightBackground,
    drawBrandTitle,
} = require('../theme/arcade-night');

// 插屏广告频率：前 N 局新手保护不展示；之后每 M 局最多 1 次（保护「再来一局」）
const INTERSTITIAL_FREE_GAMES = 5;
const INTERSTITIAL_EVERY = 6;

/** 日上限触顶导致本局产币为 0 时，看广告仍给少量安慰奖励（不改分数） */
const AD_CONSOLATION_COINS = 15;

/** 是否应在本局结算展示插屏（按累计局数；挑战局由调用方另行跳过） */
function shouldShowInterstitial(gameCount) {
    if (gameCount <= INTERSTITIAL_FREE_GAMES) return false;
    return gameCount % INTERSTITIAL_EVERY === 0;
}

// 结算页背景装饰：缓慢下落的半透明方块（七种俄罗斯方块形状，与首页一致）
const BG_TETROMINO_SHAPES = [
    [ [1, 1, 1, 1] ],               // I
    [ [1, 1], [1, 1] ],             // O
    [ [0, 1, 0], [1, 1, 1] ],       // T
    [ [0, 1, 1], [1, 1, 0] ],       // S
    [ [1, 1, 0], [0, 1, 1] ],       // Z
    [ [1, 0, 0], [1, 1, 1] ],       // J
    [ [0, 0, 1], [1, 1, 1] ],       // L
];
const BG_TETROMINO_COLORS = AMBIENT_PIECE_COLORS;

// 结算页整体垂直居中布局常量（成绩面板 + 统计区 + 状态行 + 按钮区）
const PANEL_H = 190;
const STATS_GAP = 14;
const STATS_H = 56;
const STATUS_GAP = 16;
/** 状态行高度：含挑战失败时的「重试同步」按钮空间 */
const STATUS_H = 44;
const BTN_H = 48;
const BTN_GAP = 12;
const BLOCK_GAP = 16;
const CONTENT_H = PANEL_H + STATS_GAP + STATS_H + STATUS_GAP + STATUS_H;

/** 计算内容块顶部 Y：面板 + 统计 + 状态行 + 按钮区整体垂直居中，矮屏时钳制在标题下方避免重叠 */
function computeLayoutTop(H, btnCount) {
    const totalH = btnCount * BTN_H + (btnCount - 1) * BTN_GAP;
    const blockH = CONTENT_H + BLOCK_GAP + totalH;
    const minTop = Math.min(150, Math.max(120, H * 0.10 + 60));
    return Math.max((H - blockH) / 2, minTop);
}

class ResultScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._animTime = 0;
        this._adManager = null;
        this._doubleApplied = false;
        this._syncState = 'idle'; // 'idle' | 'syncing' | 'done' | 'offline' | 'failed'
        // 挑战系统：挑战分享 + 自动应战
        this._challengeId = '';
        this._challengeTarget = null;
        this._challengeOpponent = null;
        this._challengeState = 'idle'; // idle|syncing|done|failed|offline|stale
        this._challengeResult = null;
        this._challengeFailMsg = '';
        this._challengeSyncBusy = false;
        this._challengeRetryRect = null;
        // 背景装饰：缓慢下落的半透明方块
        this._fallingBlocks = [];
        // 成就系统：结算页新解锁数量与金币奖励
        this._newAchievementCount = 0;
        this._newCoinReward = 0;
        // 经济系统：本局消行金币收益与今日进度
        this._coinEarned = 0;
        this._todayCoinEarned = 0;
        this._dailyLimit = 600;
        /** 应战结算后是否已提示回击（每进结算页一次） */
        this._counterPrompted = false;
    }

    onEnter(params) {
        this._params = params || {};
        this._replayKey = this._params.replayKey || '';
        this._challengeId = this._params.challengeId || '';
        this._challengeTarget = typeof this._params.targetScore === 'number' ? this._params.targetScore : null;
        this._challengeState = 'idle';
        this._challengeResult = null;
        this._challengeFailMsg = '';
        this._challengeSyncBusy = false;
        this._challengeRetryRect = null;
        this._challengeOpponent = null;
        this._counterPrompted = false;
        this._profilePromise = null;
        this._animTime = 0;
        this._syncState = 'idle';
        this._syncRank = null;

        // 经济系统：读取本局消行金币收益与今日进度
        this._coinEarned = this._params.coinEarned || 0;
        try {
            const { coinManager, DAILY_LIMIT } = require('../../utils/coin-manager');
            this._todayCoinEarned = coinManager.getTodayEarned();
            this._dailyLimit = DAILY_LIMIT;
        } catch (e) {
            this._todayCoinEarned = 0;
            this._dailyLimit = 600;
        }

        // 初始化背景装饰：缓慢下落的半透明方块
        this._initFallingBlocks();

        // 初始化广告管理器
        try {
            const { adManager } = require('../../utils/ad-manager');
            this._adManager = adManager;
        } catch (e) {
            // 广告模块不可用时降级，不影响结算页
        }

        // 成就系统：结算时检查解锁并提示金币奖励
        this._newAchievementCount = 0;
        this._newCoinReward = 0;
        try {
            const { achievementManager } = require('../../utils/achievement-manager');
            achievementManager.init();
            const newly = achievementManager.consumeLastNew();
            if (newly && newly.length > 0) {
                const { getAllAchievements } = require('../../data/achievements');
                const all = getAllAchievements();
                let reward = 0;
                for (const a of all) {
                    if (newly.indexOf(a.id) >= 0) reward += (a.reward || 0);
                }
                this._newAchievementCount = newly.length;
                this._newCoinReward = reward;
                setTimeout(() => {
                    wx.showToast({ title: `成就解锁 ${newly.length} 个，+${reward} 金币`, icon: 'none' });
                }, 800);
            }
        } catch (e) {
            // 成就展示失败不影响结算
        }

        this._initUI();

        // 先建好按钮再拉资料：授权按钮需盖在首枚主按钮上；成绩同步与应战共用一次询问
        if (this._challengeId) {
            this._respondChallenge();
        }
        this._submitScore();

        // 插屏：新手前 5 局跳过；之后每 6 局 1 次；挑战结算不打断社交流程
        const prevCount = wx.getStorageSync('gameCount') || 0;
        const gameCount = prevCount + 1;
        wx.setStorageSync('gameCount', gameCount);
        const skipForChallenge = !!this._challengeId;
        if (this._adManager && !skipForChallenge && shouldShowInterstitial(gameCount)) {
            setTimeout(() => {
                this._adManager.showInterstitial().catch(() => {});
            }, 1200);
        }
    }

    onExit() {
        this._buttons = [];
        this._profilePromise = null;
        try {
            const { cancelWechatProfile, skipProfileAuthDialog, isProfileAuthDialogVisible } = require('../../utils/user-profile');
            if (isProfileAuthDialogVisible()) {
                skipProfileAuthDialog();
            }
            cancelWechatProfile();
        } catch (e) { /* ignore */ }
        if (this._adManager) {
            this._adManager.hideBanner();
        }
    }

    onPause() {}

    onResume() {}
    update(dt) {
        this._animTime += dt;
        this._updateFallingBlocks(dt);
    }

    render(ctx) {
        // 防御：即使未走 onEnter 也不应崩溃（正常流程 SceneManager 总会先调 onEnter）
        if (!this._params) { this._params = {}; }

        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 夜场街机背景（与首页一致，分享截图更友好）
        fillNightBackground(ctx, W, H);

        // 背景装饰：缓慢下落的半透明方块
        this._renderFallingBlocks(ctx);

        // 标题
        drawBrandTitle(ctx, '游戏结束', W / 2, H * 0.10, 'bold 32px sans-serif');

        // 模式标签
        const modeNames = {
            classic: '经典模式',
            timed: '限时赛',
            marathon: '马拉松',
            special: '方块实验室',
        };
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = SUBTITLE;
        ctx.fillText(modeNames[this._params.mode] || '经典模式', W / 2, H * 0.10 + 35);

        // 成绩面板
        const hasAdOffer = this._hasAdCoinOffer();
        const btnCount = (hasAdOffer ? 1 : 0) + 3 + (this._replayKey ? 1 : 0);
        const panelY = computeLayoutTop(H, btnCount);
        const panelW = Math.min(320, W * 0.82);
        const panelH = PANEL_H;
        const panelX = (W - panelW) / 2;

        // 面板背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        this._roundRect(ctx, panelX, panelY, panelW, panelH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, panelX, panelY, panelW, panelH, 12);
        ctx.stroke();

        // 分数（大字）：暖金强调，聊天截图更易读
        const score = this._params.score || 0;
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(String(score), W / 2, panelY + 60);

        ctx.fillStyle = MUTED;
        ctx.font = '14px sans-serif';
        ctx.fillText('得分', W / 2, panelY + 22);

        // 等级和消行
        const infoY = panelY + 105;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';

        ctx.fillStyle = '#f0a000';
        ctx.fillText(`等级 ${this._params.level || 1}`, W / 2 - 60, infoY);

        ctx.fillStyle = '#00f000';
        ctx.fillText(`消行 ${this._params.lines || 0}`, W / 2 + 60, infoY);

        // 最高分（按模式）
        // 金币收益（本局消行金币 + 今日进度；经济系统 2025-08）
        const coinEarned = this._coinEarned || 0;
        const todayEarned = this._todayCoinEarned || 0;
        if (coinEarned > 0 || todayEarned > 0) {
            const coinLineY = panelY + panelH - 24;
            const coinText = coinEarned > 0
                ? `本局金币 +${coinEarned}  ·  今日 ${todayEarned}/${this._dailyLimit}`
                : `今日金币 ${todayEarned}/${this._dailyLimit}`;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(coinText, W / 2, coinLineY);
        }

        // 最高分（按模式）
        const bestScore = this._getBestScore(this._params.mode) || 0;
        const isNewRecord = this._isNewRecord(this._params.score || 0, this._params.mode);
        if (isNewRecord) {
            ctx.fillStyle = '#ff6b6b';
            const recText = '新纪录！';
            const tw = ctx.measureText(recText).width;
            const recStartX = W / 2 - (tw + 26) / 2;
            IconRenderer.draw(ctx, 'fireworks', recStartX + 11, infoY + 32, 20, '#ff6b6b');
            ctx.fillText(recText, recStartX + 26 + tw / 2, infoY + 32);
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '14px sans-serif';
            ctx.fillText(`最高分: ${bestScore}`, W / 2, infoY + 32);
        }

        // 详细统计（文档 P0 #14）
        const stats = this._params.stats || {};
        this._renderStats(ctx, panelX, panelY + panelH + 14, panelW, stats);

        // 排行榜同步状态（面板下方）
        if (this._challengeId) {
            this._renderChallengeStatus(ctx, panelY + panelH + 86);
        } else {
            this._renderSyncStatus(ctx, panelY + panelH + 86);
        }

        // 按钮
        for (let i = 0; i < this._buttons.length; i++) {
            this._buttons[i].render(ctx);
        }
    }

    /** 渲染详细统计行 */
    _renderStats(ctx, x, y, w, stats) {
        const items = [
            { label: 'T-Spin', value: (stats.tSpinCount || 0) + (stats.tSpinMiniCount || 0) },
            { label: 'QUAD', value: stats.tetrisCount || 0 },
            { label: '最大Combo', value: stats.maxCombo || 0 },
            { label: 'B2B', value: stats.b2bCount || 0 },
        ];

        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        this._roundRect(ctx, x, y, w, 56, 8);
        ctx.fill();

        const colW = w / items.length;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemX = x + colW * i + colW / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillText(item.label, itemX, y + 15);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(String(item.value), itemX, y + 39);
            ctx.font = '12px sans-serif';
        }
    }

    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const btnW = Math.min(260, W * 0.7);
        const btnH = 48;
        const centerX = W / 2 - btnW / 2;
        const gap = 12;

        // 整体垂直居中；挑战局优先「回击对方」，普通局优先「再来一局」
        const adOffer = this._getAdCoinOffer();
        const btnCount = (adOffer ? 1 : 0) + 3 + (this._replayKey ? 1 : 0);
        const startY = computeLayoutTop(H, btnCount) + CONTENT_H + BLOCK_GAP;

        let btnIndex = 0;
        this._buttons = [];

        const isChallenge = !!this._challengeId;
        const replayBtn = {
            text: '再来一局',
            icon: 'refresh',
            color: isChallenge ? '#555' : '#3aa8d8',
            onClick: () => GameGlobal.game.sceneManager.replace('game', { mode: this._params.mode }),
        };

        const shareBtn = {
            text: isChallenge ? '回击对方' : '发起挑战',
            icon: 'share',
            color: isChallenge ? '#e09a30' : '#2ecc71',
            onClick: () => this._share(this._challengeOpponent),
        };

        const ordered = isChallenge
            ? [shareBtn, replayBtn]
            : [replayBtn, shareBtn];

        for (let i = 0; i < ordered.length; i++) {
            const item = ordered[i];
            this._buttons.push(new Button({
                x: centerX, y: startY + (btnH + gap) * (btnIndex++),
                w: btnW, h: btnH,
                text: item.text,
                icon: item.icon,
                color: item.color,
                onClick: item.onClick,
            }));
        }

        if (this._replayKey) {
            this._buttons.push(new Button({
                x: centerX, y: startY + (btnH + gap) * (btnIndex++),
                w: btnW, h: btnH,
                text: '回看本局',
                icon: 'play',
                color: '#a000f0',
                onClick: () => GameGlobal.game.sceneManager.switchTo('replay', Object.assign({}, this._params, { replayKey: this._replayKey })),
            }));
        }

        if (adOffer) {
            this._buttons.push(new Button({
                x: centerX, y: startY + (btnH + gap) * (btnIndex++),
                w: btnW, h: btnH,
                text: adOffer.label,
                icon: 'tv',
                color: '#ff6b6b',
                onClick: () => this._doubleCoins(),
            }));
        }

        this._buttons.push(new Button({
            x: centerX, y: startY + (btnH + gap) * (btnIndex++),
            w: btnW, h: btnH,
            text: '返回首页',
            icon: 'home',
            color: '#555',
            onClick: () => GameGlobal.game.sceneManager.switchTo('home'),
        }));
    }

    /** 是否仍可提供结算广告金币奖励 */
    _hasAdCoinOffer() {
        return !!this._getAdCoinOffer();
    }

    /**
     * 结算广告金币方案（体验优先：有产币则双倍；日上限触顶仍给小额安慰）
     * 2025-09：广告双倍受独立日上限 AD_DAILY_CAP 约束，达上限后不再展示入口
     * 未配置激励视频广告位时不展示入口，避免点了不可用
     * @returns {{ amount: number, label: string, toast: string }|null}
     */
    _getAdCoinOffer() {
        if (this._doubleApplied) return null;
        // 未配置激励视频：默认不展示（失败也隐藏，避免出现无效入口）
        if (!this._isRewardedAdEntryEnabled()) {
            return null;
        }
        const remaining = coinManager.getAdBonusRemaining();
        if (remaining <= 0) return null;
        const earned = this._coinEarned || 0;
        if (earned > 0) {
            const amount = Math.min(earned, remaining);
            return {
                amount,
                label: '看广告双倍金币',
                toast: `双倍金币 +${amount}!`,
            };
        }
        if ((this._params.score || 0) > 0) {
            const amount = Math.min(AD_CONSOLATION_COINS, remaining);
            if (amount <= 0) return null;
            return {
                amount,
                label: '看广告领金币',
                toast: `获得金币 +${amount}!`,
            };
        }
        return null;
    }

    /** 是否允许展示结算页激励视频入口（仅当广告位已真实配置） */
    _isRewardedAdEntryEnabled() {
        try {
            const adMod = require('../../utils/ad-manager');
            if (typeof adMod.isRewardedVideoConfigured === 'function') {
                return adMod.isRewardedVideoConfigured() === true;
            }
            if (adMod.adManager && typeof adMod.adManager.isRewardedVideoConfigured === 'function') {
                return adMod.adManager.isRewardedVideoConfigured() === true;
            }
        } catch (e) {
            console.warn('[Result] 读取广告配置失败，隐藏领币入口', e);
        }
        return false;
    }


    /**
     * 结算页共用一次资料授权（同步成绩 / 应战共用）。
     * 缺资料时弹出自建弹窗：「去授权」为 UserInfoButton，「暂不授权」继续流程。
     */
    _ensureResultProfile() {
        if (this._profilePromise) {
            return this._profilePromise;
        }
        const { ensureProfileForAction } = require('../../utils/user-profile');
        this._profilePromise = ensureProfileForAction();
        return this._profilePromise;
    }

    /** 上报本局分数到排行榜（云函数全服榜 + 开放数据域好友榜） */
    _submitScore() {
        const score = this._params.score || 0;
        if (score <= 0) {
            this._syncState = 'done';
            return;
        }

        this._syncState = 'syncing';
        const mode = this._params.mode || 'classic';
        const detail = {
            lines: this._params.lines || 0,
            level: this._params.level || 1,
            stats: this._params.stats || null,
        };
        const replay = this._readReplayData();

        // 需要资料时就地询问授权；同意/拒绝后都继续上报（未授权则云端用默认「玩家xxxx」）
        this._ensureResultProfile()
            .then((profile) => {
                return cloudService.submitScore({
                    mode: mode,
                    score: score,
                    detail: detail,
                    replay: replay,
                    nickname: (profile && profile.nickname) || '',
                    avatarUrl: (profile && profile.avatarUrl) || '',
                });
            })
            .then((res) => {
                if (res && res.offline) {
                    this._syncState = 'offline';
                    return;
                }
                if (res && res.success) {
                    this._syncState = 'done';
                    this._syncRank = typeof res.rank === 'number' ? res.rank : null;
                } else {
                    this._syncState = 'failed';
                }
            })
            .catch(() => {
                this._syncState = 'failed';
            });
    }

    /** 读取本局回放数据（本地存储），供排行榜回放上传使用 */
    _readReplayData() {
        try {
            if (!this._replayKey) {
                return null;
            }
            const data = wx.getStorageSync(this._replayKey);
            if (!data || typeof data !== 'object') {
                return null;
            }
            if (data.seed == null || !Array.isArray(data.inputs)) {
                return null;
            }
            if (JSON.stringify(data).length > 60000) {
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    /** 渲染排行榜同步状态（结算面板下方） */
    _renderSyncStatus(ctx, y) {
        const W = GameGlobal.game.width;
        let text = '';
        let color = 'rgba(255,255,255,0.4)';
        let icon = null;
        switch (this._syncState) {
            case 'syncing':
                text = '成绩同步中...';
                icon = 'clock';
                break;
            case 'done':
                text = this._syncRank ? `已同步 · 全服第 ${this._syncRank} 名` : '已同步';
                icon = 'check';
                color = '#00f0f0';
                break;
            case 'offline':
                text = '离线模式，成绩仅保存在本地';
                color = 'rgba(255,255,255,0.4)';
                break;
            case 'failed':
                text = '同步失败，可稍后在排行榜查看';
                icon = 'warning';
                color = 'rgba(255,255,255,0.4)';
                break;
        }
        ctx.fillStyle = color;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (icon) {
            const tw = ctx.measureText(text).width;
            const startX = W / 2 - (tw + 22) / 2;
            IconRenderer.draw(ctx, icon, startX + 9, y, 15, color);
            ctx.fillText(text, startX + 22 + tw / 2, y);
        } else {
            ctx.fillText(text, W / 2, y);
        }
    }

    /** 自动应战：将本局分数写回挑战，并按结果更新挑战状态（支持失败重试） */
    _respondChallenge() {
        const challengeId = this._challengeId;
        if (!challengeId || this._challengeSyncBusy) {
            return;
        }
        if (this._challengeState === 'done' || this._challengeState === 'stale') {
            return;
        }

        this._challengeSyncBusy = true;
        this._challengeState = 'syncing';
        this._challengeFailMsg = '';
        this._challengeRetryRect = null;

        this._ensureResultProfile().then((profile) => {
            return cloudService.respondChallenge({
                challengeId: challengeId,
                score: this._params.score || 0,
                nickname: (profile && profile.nickname) || '',
                avatarUrl: (profile && profile.avatarUrl) || '',
            });
        }).then((res) => {
                if (!res) {
                    this._challengeSyncBusy = false;
                    this._challengeState = 'failed';
                    this._challengeFailMsg = '同步失败';
                    return;
                }
                this._challengeSyncBusy = false;
                if (res && res.offline) {
                    // 可重试：保留本地待应战，离开结算页后仍可从列表再进
                    this._challengeState = 'offline';
                    this._challengeFailMsg = '挑战联网暂不可用';
                    return;
                }
                if (res && res.success) {
                    this._challengeResult = {
                        result: res.result,
                        challengerScore: res.challengerScore,
                        responderScore: res.responderScore,
                    };
                    this._challengeOpponent = (res.challenge && res.challenge.challengerName) ? {
                        name: res.challenge.challengerName,
                        avatar: res.challenge.challengerAvatar || '',
                        openid: res.challenge.opponentOpenid || '',
                    } : null;
                    this._challengeState = 'done';
                    this._removePendingChallenge(challengeId);
                    this._maybePromptCounterShare();
                    return;
                }
                const errMsg = (res && res.errMsg) ? String(res.errMsg) : '';
                // 终态：清本地待应战，不再提供重试
                const terminal = errMsg.indexOf('already responded') >= 0
                    || errMsg.indexOf('expired') >= 0
                    || errMsg.indexOf('cannot respond to own') >= 0
                    || errMsg.indexOf('not found') >= 0;
                if (terminal) {
                    this._removePendingChallenge(challengeId);
                    this._challengeState = 'stale';
                    if (errMsg.indexOf('expired') >= 0) {
                        this._challengeFailMsg = '挑战已过期';
                    } else if (errMsg.indexOf('cannot respond to own') >= 0) {
                        this._challengeFailMsg = '不能应战自己发起的挑战';
                    } else if (errMsg.indexOf('not found') >= 0) {
                        this._challengeFailMsg = '挑战不存在或已失效';
                    } else {
                        this._challengeFailMsg = '该挑战已被应战';
                    }
                    return;
                }
                // 可重试失败：保留 pending
                this._challengeState = 'failed';
                this._challengeFailMsg = errMsg || '同步失败';
            })
            .catch(() => {
                this._challengeSyncBusy = false;
                this._challengeState = 'failed';
                this._challengeFailMsg = '网络异常';
            });
    }

    /** 从本地待应战列表移除（仅成功写回或确认终态时调用） */
    _removePendingChallenge(challengeId) {
        try {
            const list = wx.getStorageSync(PENDING_CHALLENGES_KEY) || [];
            if (!Array.isArray(list)) {
                return;
            }
            const next = list.filter((item) => item && item.challengeId !== challengeId);
            wx.setStorageSync(PENDING_CHALLENGES_KEY, next);
        } catch (e) {
            // 本地存储读写失败不影响结算页
        }
    }

    /** 应战写回成功后，引导回击（体验优先：默认确认） */
    _maybePromptCounterShare() {
        if (this._counterPrompted || !this._challengeId) return;
        this._counterPrompted = true;
        const self = this;
        try {
            wx.showModal({
                title: '挑战已结算',
                content: '要立刻回击对方吗？',
                confirmText: '回击对方',
                cancelText: '稍后再说',
                success(res) {
                    if (res && res.confirm) {
                        self._share(self._challengeOpponent);
                    }
                },
            });
        } catch (e) {
            // 弹窗失败不影响结算
        }
    }

    /** 渲染挑战结果状态（挑战局时替代排行榜同步状态行，样式仿 _renderSyncStatus） */
    _renderChallengeStatus(ctx, y) {
        const W = GameGlobal.game.width;
        this._challengeRetryRect = null;
        let text = '';
        let color = 'rgba(255,255,255,0.4)';
        let icon = null;
        let showRetry = false;
        switch (this._challengeState) {
            case 'syncing':
                text = '挑战结果同步中...';
                icon = 'clock';
                break;
            case 'offline':
                text = '挑战联网暂不可用，结果未同步';
                showRetry = true;
                break;
            case 'failed':
                text = this._challengeFailMsg || '挑战结果同步失败';
                icon = 'warning';
                showRetry = true;
                break;
            case 'stale':
                text = this._challengeFailMsg || '挑战已失效';
                icon = 'warning';
                color = '#f0a000';
                break;
            case 'done': {
                const result = this._challengeResult || {};
                const responderScore = result.responderScore || 0;
                const challengerScore = result.challengerScore || 0;
                if (result.result === 'responder_win') {
                    text = `挑战成功！你 ${responderScore} 分，超越对方 ${challengerScore} 分`;
                    icon = 'trophy';
                    color = '#00f0f0';
                } else if (result.result === 'challenger_win') {
                    text = `挑战失败！对方 ${challengerScore} 分，你仅 ${responderScore} 分`;
                    icon = 'warning';
                    color = '#ff6b6b';
                } else {
                    text = `平局！双方 ${challengerScore} 分`;
                    color = '#f0a000';
                }
                break;
            }
        }
        ctx.fillStyle = color;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (icon) {
            const tw = ctx.measureText(text).width;
            const startX = W / 2 - (tw + 22) / 2;
            IconRenderer.draw(ctx, icon, startX + 9, y, 15, color);
            ctx.fillText(text, startX + 22 + tw / 2, y);
        } else {
            ctx.fillText(text, W / 2, y);
        }

        // 失败/离线：提供可点的「重试同步」
        if (showRetry && !this._challengeSyncBusy) {
            const retryText = '点击重试同步';
            ctx.font = '12px sans-serif';
            const rw = ctx.measureText(retryText).width + 24;
            const rh = 26;
            const rx = W / 2 - rw / 2;
            const ry = y + 16;
            this._challengeRetryRect = { x: rx, y: ry, w: rw, h: rh };
            ctx.fillStyle = 'rgba(0, 198, 255, 0.18)';
            this._roundRect(ctx, rx, ry, rw, rh, rh / 2);
            ctx.fill();
            ctx.fillStyle = '#00c6ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(retryText, W / 2, ry + rh / 2);
        }
    }

    /** 激励视频金币奖励：双倍本局产币或日上限安慰奖；绝不改分数、不重报榜 */
    _doubleCoins() {
        const offer = this._getAdCoinOffer();
        if (!offer) return;
        if (!this._adManager) {
            wx.showToast({ title: '广告暂不可用', icon: 'none' });
            return;
        }
        const beforeEarned = this._coinEarned || 0;
        this._adManager.showRewardedVideo()
            .then(() => {
                const gained = coinManager.rewardAdBonusCapped(offer.amount);
                if (gained > 0) {
                    this._doubleApplied = true;
                    this._coinEarned = beforeEarned + gained;
                    this._todayCoinEarned = coinManager.getTodayEarned();
                    this._initUI();
                    wx.showToast({ title: offer.toast, icon: 'none' });
                } else {
                    // 发放失败不锁入口，允许再试一次
                    wx.showToast({ title: '发放失败，请稍后重试', icon: 'none' });
                }
            })
            .catch(() => {
                wx.showToast({ title: '未完整观看，无法领取', icon: 'none' });
            });
    }

    /** 分享成绩卡片（文档 6.1）——云可用且分数>0 时升级为挑战分享（携带 challengeId），失败/离线降级为纯文案分享 */
    _share(opponent) {
        const mode = this._params.mode || 'classic';
        const score = this._params.score || 0;
        const imageUrl = this._generateShareImage();
        const oppName = (opponent && opponent.name) ? String(opponent.name).slice(0, 12) : '';

        // 降级分享：原纯文案，不带 query
        const fallbackShare = () => {
            wx.shareAppMessage({
                title: oppName ? `回击 ${oppName}！我在方块过把瘾「${this._modeName(mode)}」得了 ${score} 分！` : `我在方块过把瘾「${this._modeName(mode)}」得了 ${score} 分！`,
                imageUrl: imageUrl,
                success: () => {
                    try {
                        const { achievementManager } = require('../../utils/achievement-manager');
                        achievementManager.reportShare();
                    } catch (e) {
                        // 分享成就上报失败不影响降级分享
                    }
                },
            });
        };

        // 云开发可用且分数>0 时，先创建挑战，再携带 challengeId 分享，便于好友应战
        if (cloudService.isAvailable && cloudService.isAvailable() && score > 0) {
            const { ensureProfileForAction } = require('../../utils/user-profile');
            ensureProfileForAction({
                title: '发起好友挑战',
                content: '授权微信头像昵称后，好友能看到你的资料。也可暂不授权，使用默认昵称继续发起。',
            }).then((profile) => {
                return cloudService.createChallenge({
                    mode: mode,
                    score: score,
                    nickname: (profile && profile.nickname) || '',
                    avatarUrl: (profile && profile.avatarUrl) || '',
                    targetName: oppName || '',
                    targetAvatar: (opponent && opponent.avatar) ? String(opponent.avatar).slice(0, 512) : '',
                    targetOpenid: (opponent && opponent.openid) ? String(opponent.openid).slice(0, 64) : '',
                });
            })
                .then((res) => {
                    if (!res) return;
                    if (res && res.success && res.challengeId) {
                        wx.shareAppMessage({
                            title: oppName ? `回击 ${oppName}！我在『${this._modeName(mode)}』拿了 ${score} 分，敢再来一局吗？` : `向你发起挑战！我在『${this._modeName(mode)}』拿了 ${score} 分，敢来超越吗？`,
                            imageUrl: imageUrl,
                            query: 'challengeId=' + res.challengeId + '&mode=' + mode + '&score=' + score,
                            success: () => {
                                try {
                                    const { achievementManager } = require('../../utils/achievement-manager');
                                    achievementManager.reportShare();
                                    achievementManager.reportInvite();
                                } catch (e) {
                                    // 分享成就上报失败不影响挑战分享
                                }
                            },
                        });
                    } else {
                        fallbackShare();
                    }
                })
                .catch(() => {
                    fallbackShare();
                });
        } else {
            fallbackShare();
        }
    }

    /** 生成分享卡片图片（通过离屏 Canvas 绘制，导出临时文件） */
    _generateShareImage() {
        try {
            const canvas = wx.createCanvas();
            const ctx = canvas.getContext('2d');
            const w = 300;
            const h = 400;
            const dpr = 2;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.scale(dpr, dpr);

            // 干净分享卡：夜场底 + 品牌 + 大分数（少叠霓虹）
            fillNightBackground(ctx, w, h);

            drawBrandTitle(ctx, '方块过把瘾', w / 2, 56, 'bold 28px sans-serif');

            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = SUBTITLE;
            ctx.fillText(this._modeName(this._params.mode), w / 2, 98);

            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText('得分', w / 2, 148);

            ctx.fillStyle = ACCENT;
            ctx.font = 'bold 64px sans-serif';
            ctx.fillText(String(this._params.score || 0), w / 2, 198);

            ctx.font = '15px sans-serif';
            ctx.fillStyle = SUBTITLE;
            ctx.fillText('敢来一局吗？', w / 2, 250);

            // 底部一排氛围方块（降饱和，不抢分数）
            for (let i = 0; i < 7; i++) {
                ctx.fillStyle = AMBIENT_PIECE_COLORS[i];
                const x = 30 + i * 38;
                ctx.globalAlpha = 0.85;
                ctx.fillRect(x, 318, 28, 28);
            }
            ctx.globalAlpha = 1;

            let tempPath = '';
            wx.canvasToTempFilePath({
                canvas: canvas,
                x: 0, y: 0,
                width: w, height: h,
                destWidth: w * dpr, destHeight: h * dpr,
                success: (res) => {
                    tempPath = res.tempFilePath;
                },
            });
            return tempPath;
        } catch (e) {
            return '';
        }
    }

    /** 模式名称 */
    _modeName(mode) {
        const names = { classic: '经典模式', timed: '限时赛', marathon: '马拉松', special: '方块实验室' };
        return names[mode] || '经典模式';
    }


    /** 获取指定模式最高分 */
    _getBestScore(mode) {
        const key = 'bestScore_' + (mode || 'classic');
        return wx.getStorageSync(key) || 0;
    }

    /** 判断是否为新模式最高分（首次进入结算时记录） */
    _isNewRecord(score, mode) {
        const key = 'bestScore_' + (mode || 'classic');
        const prev = wx.getStorageSync(key) || 0;
        if (score > prev) {
            wx.setStorageSync(key, score);
            return true;
        }
        return false;
    }

    /** 保存指定模式最高分 */
    _saveBestScore(score, mode) {
        const key = 'bestScore_' + (mode || 'classic');
        const prev = wx.getStorageSync(key) || 0;
        if (score > prev) {
            wx.setStorageSync(key, score);
        }
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    /**
     * 初始化背景装饰方块：随机生成若干缓慢下落的半透明方块
     */
    _initFallingBlocks() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const count = 12;
        this._fallingBlocks = [];
        for (let i = 0; i < count; i++) {
            this._fallingBlocks.push(this._createFallingBlock(W, H, true));
        }
    }

    /**
     * 生成一个背景装饰方块
     * @param {number} W 画布宽
     * @param {number} H 画布高
     * @param {boolean} initial 是否为初始生成（初始可分布在整屏，后续从顶部重生）
     */
    _createFallingBlock(W, H, initial) {
        const shapeIndex = Math.floor(Math.random() * BG_TETROMINO_SHAPES.length);
        const size = 18 + Math.floor(Math.random() * 22); // 18~40px
        return {
            shapeIndex: shapeIndex,
            color: BG_TETROMINO_COLORS[shapeIndex],
            // 初始生成时散布全屏；后续重生从屏幕上方进入
            y: initial ? Math.random() * H : -size * 4 - Math.random() * H * 0.3,
            baseX: Math.random() * W,
            size: size,
            // 下落速度：30~80 px/s，非常缓慢
            speed: 30 + Math.random() * 50,
            // 横向摆动
            swayAmp: 6 + Math.random() * 18,
            swaySpeed: 0.4 + Math.random() * 0.8,
            swayPhase: Math.random() * Math.PI * 2,
            // 旋转角度（缓慢旋转）
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.5,
            // 透明度：0.04~0.14，保持低透明不干扰阅读
            alpha: 0.04 + Math.random() * 0.10,
        };
    }

    /**
     * 更新背景装饰方块：下落 + 摆动 + 旋转，超出屏幕后从顶部重生
     * @param {number} dt 帧间隔（秒）
     */
    _updateFallingBlocks(dt) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        for (let i = 0; i < this._fallingBlocks.length; i++) {
            const b = this._fallingBlocks[i];
            b.y += b.speed * dt;
            b.rot += b.rotSpeed * dt;
            if (b.y - b.size * 2 > H) {
                this._fallingBlocks[i] = this._createFallingBlock(W, H, false);
            }
        }
    }

    /**
     * 渲染背景装饰方块：半透明、横向摆动、缓慢旋转
     * @param {CanvasRenderingContext2D} ctx
     */
    _renderFallingBlocks(ctx) {
        const shapeData = BG_TETROMINO_SHAPES;
        for (const b of this._fallingBlocks) {
            const swayX = Math.sin(this._animTime * b.swaySpeed + b.swayPhase) * b.swayAmp;
            const x = b.baseX + swayX;
            ctx.save();
            ctx.globalAlpha = b.alpha;
            ctx.translate(x + b.size, b.y + b.size);
            ctx.rotate(b.rot);
            ctx.fillStyle = b.color;
            for (let r = 0; r < shapeData[b.shapeIndex].length; r++) {
                const row = shapeData[b.shapeIndex][r];
                for (let c = 0; c < row.length; c++) {
                    if (row[c]) {
                        ctx.fillRect(c * b.size - b.size, r * b.size - b.size, b.size - 1, b.size - 1);
                    }
                }
            }
            ctx.restore();
        }
    }

    handleTap(x, y) {
        if (this._challengeRetryRect && this._hitRect(x, y, this._challengeRetryRect)) {
            this._respondChallenge();
            return;
        }
        for (let i = 0; i < this._buttons.length; i++) {
            const btn = this._buttons[i];
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
    }

    _hitRect(x, y, rect) {
        return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }
}

module.exports = ResultScene;
