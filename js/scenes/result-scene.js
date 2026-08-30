/**
 * ResultScene - 好友挑战应战结算
 * 职责：展示残局挑战成绩、云端写回结果、回击分享与导航
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
const challengeUi = require('../../utils/challenge-ui');
const challengeShareCard = require('../../utils/challenge-share-card');

// 结算页背景装饰
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
const STATUS_H = 44;
const BTN_H = 48;
const BTN_GAP = 12;
const BLOCK_GAP = 16;
const CONTENT_H_CHALLENGE = PANEL_H + 44 + STATUS_H;

function computeLayoutTop(H, btnCount, contentH) {
    const ch = contentH != null ? contentH : CONTENT_H_CHALLENGE;
    const totalH = btnCount * BTN_H + (btnCount - 1) * BTN_GAP;
    const blockH = ch + BLOCK_GAP + totalH;
    const minTop = Math.min(150, Math.max(120, H * 0.10 + 60));
    return Math.max((H - blockH) / 2, minTop);
}

class ResultScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._animTime = 0;
        // 挑战系统
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
        if (!this._challengeId) {
            setTimeout(() => GameGlobal.game.sceneManager.switchTo('home'), 0);
            return;
        }
        this._challengeTarget = typeof this._params.targetScore === 'number' ? this._params.targetScore : null;
        if (this._challengeTarget == null && this._params.targetScore != null && this._params.targetScore !== '') {
            const parsed = parseInt(this._params.targetScore, 10);
            this._challengeTarget = isNaN(parsed) ? null : parsed;
        }
        this._targetScore = this._challengeTarget;
        this._challengeState = 'idle';
        this._challengeResult = null;
        this._challengeFailMsg = '';
        this._challengeSyncBusy = false;
        this._challengeRetryRect = null;
        this._challengeOpponent = null;
        this._counterPrompted = false;
        this._profilePromise = null;
        this._animTime = 0;

        // 经济系统：读取本局消行金币收益与今日进度（含对局页已发的摇奖金币）
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

        if (this._params.challengePreSynced && this._params.challengeSyncResult) {
            this._applyChallengeSyncResult(this._params.challengeSyncResult);
        } else {
            this._respondChallenge();
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
        drawBrandTitle(ctx, '挑战结算', W / 2, H * 0.10, 'bold 32px sans-serif');

        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = SUBTITLE;
        ctx.fillText(challengeUi.modeLabel(this._params), W / 2, H * 0.10 + 35);

        // 成绩面板（按钮数 / 内容高度与 _initUI 一致）
        const layout = this._settleLayout();
        const panelY = computeLayoutTop(H, layout.btnCount, layout.contentH);
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

        // 主成绩
        const lines = this._params.lines || 0;
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(String(lines), W / 2, panelY + 60);

        ctx.fillStyle = MUTED;
        ctx.font = '14px sans-serif';
        ctx.fillText('消行', W / 2, panelY + 22);

        const infoY = panelY + 105;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';

        const showCoinLine = (this._coinEarned || 0) > 0 || (this._todayCoinEarned || 0) > 0;
        ctx.fillStyle = '#00f000';
        ctx.fillText(`块数 ${this._params.pieces || 0}`, W / 2 - 70, infoY);
        ctx.fillStyle = '#5ec8d4';
        const sec = Math.max(0, Math.floor((this._params.timeMs || 0) / 1000));
        ctx.fillText(`用时 ${sec}s`, W / 2 + 70, infoY);
        const coinLineY = panelY + panelH - 16;
        const opponentY = showCoinLine ? coinLineY - 28 : coinLineY;
        if (this._targetScore != null) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = '14px sans-serif';
            ctx.fillText(`对手 ${this._targetScore} 行（越少越好）`, W / 2, opponentY);
        }

        const coinEarned = this._coinEarned || 0;
        const todayEarned = this._todayCoinEarned || 0;
        if (showCoinLine) {
            const coinText = coinEarned > 0
                ? `本局金币 +${coinEarned}  ·  今日 ${todayEarned}/${this._dailyLimit}`
                : `今日金币 ${todayEarned}/${this._dailyLimit}`;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(coinText, W / 2, coinLineY);
        }

        const statusY = panelY + panelH + 44;
        this._renderChallengeStatus(ctx, statusY);

        // 按钮
        for (let i = 0; i < this._buttons.length; i++) {
            this._buttons[i].render(ctx);
        }
    }

    _settleLayout() {
        const showReplay = !!this._replayKey;
        return {
            showReplay,
            btnCount: 4 + (showReplay ? 1 : 0),
            contentH: CONTENT_H_CHALLENGE,
        };
    }

    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const btnW = Math.min(260, W * 0.7);
        const btnH = BTN_H;
        const centerX = W / 2 - btnW / 2;
        const gap = BTN_GAP;

        const layout = this._settleLayout();
        const startY = computeLayoutTop(H, layout.btnCount, layout.contentH)
            + layout.contentH + BLOCK_GAP;

        let btnIndex = 0;
        this._buttons = [];

        const pushBtn = (item) => {
            this._buttons.push(new Button({
                x: centerX, y: startY + (btnH + gap) * (btnIndex++),
                w: btnW, h: btnH,
                text: item.text,
                icon: item.icon,
                color: item.color,
                onClick: item.onClick,
            }));
        };

        pushBtn({
            text: '回击对方',
            icon: 'share',
            color: '#e09a30',
            onClick: () => this._share(this._challengeOpponent),
        });
        pushBtn({
            text: '闯关',
            icon: 'brick',
            color: '#3aa8d8',
            onClick: () => GameGlobal.game.sceneManager.leaveTo('stageSelect', {}, ['home']),
        });
        pushBtn({
            text: '关卡广场',
            icon: 'puzzle',
            color: '#c9a227',
            onClick: () => GameGlobal.game.sceneManager.leaveTo('plaza', {}, ['home']),
        });
        if (layout.showReplay) {
            pushBtn({
                text: '回看本局',
                icon: 'play',
                color: '#a000f0',
                onClick: () => GameGlobal.game.sceneManager.switchTo(
                    'replay',
                    Object.assign({}, this._params, {
                        replayKey: this._replayKey,
                        fromChallenge: true,
                    })
                ),
            });
        }
        pushBtn({
            text: '返回',
            icon: 'back',
            color: '#555',
            onClick: () => GameGlobal.game.sceneManager.leaveTo('challenge', {}, ['home']),
        });
    }

    _ensureResultProfile() {
        if (this._profilePromise) {
            return this._profilePromise;
        }
        const { ensureProfileForAction } = require('../../utils/user-profile');
        this._profilePromise = ensureProfileForAction();
        return this._profilePromise;
    }

    _isChallengePuzzle() {
        if (!this._challengeId) return false;
        return challengeUi.isPuzzleChallenge(this._params)
            || this._params.challengeMode === 'stage'
            || this._params.challengeMode === 'workshop'
            || (!!this._params.workshop && !!this._params.layoutSnapshot);
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
                lines: this._params.lines,
                pieces: this._params.pieces,
                timeMs: this._params.timeMs,
                failed: !!this._params.challengeFailed,
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
                    this._challengeResult = challengeUi.mergeSyncIntoResult(res);
            if (this._challengeResult && this._params.challengeFailed) {
                this._challengeResult.failed = true;
            }
                    this._challengeOpponent = (res.challenge && res.challenge.challengerName) ? {
                        name: res.challenge.challengerName,
                        avatar: res.challenge.challengerAvatar || '',
                        openid: res.challenge.opponentOpenid || res.challenge.challengerOpenid || '',
                    } : null;
                    this._challengeState = 'done';
                    this._removePendingChallenge(challengeId);
                    try {
                        const { achievementManager } = require('../../utils/achievement-manager');
                        achievementManager.reportChallengeRespond(res.result, { challengeId });
                    } catch (e) { /* ignore */ }
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

    /** 对局页已同步的挑战结果（含先摇奖再进页） */
    _applyChallengeSyncResult(res) {
        const challengeId = this._challengeId;
        if (!res) {
            this._challengeState = 'failed';
            this._challengeFailMsg = '同步失败';
            return;
        }
        if (res.offline) {
            this._challengeState = 'offline';
            this._challengeFailMsg = '挑战联网暂不可用';
            return;
        }
        if (res.success) {
            this._challengeResult = challengeUi.mergeSyncIntoResult(res);
            if (this._challengeResult && this._params.challengeFailed) {
                this._challengeResult.failed = true;
            }
            this._challengeOpponent = (res.challenge && res.challenge.challengerName) ? {
                name: res.challenge.challengerName,
                avatar: res.challenge.challengerAvatar || '',
                openid: res.challenge.opponentOpenid || res.challenge.challengerOpenid || '',
            } : null;
            this._challengeState = 'done';
            this._removePendingChallenge(challengeId);
            try {
                const { achievementManager } = require('../../utils/achievement-manager');
                achievementManager.reportChallengeRespond(res.result, { challengeId });
            } catch (e) { /* ignore */ }
            this._maybePromptCounterShare();
            return;
        }
        const errMsg = (res.errMsg) ? String(res.errMsg) : '';
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
        this._challengeState = 'failed';
        this._challengeFailMsg = errMsg || '同步失败';
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
                text = challengeUi.formatResponderResultText(this._challengeResult);
                if (this._challengeResult && this._challengeResult.result === 'responder_win') {
                    icon = 'trophy';
                    color = '#00f0f0';
                } else if (this._challengeResult && this._challengeResult.result === 'challenger_win') {
                    icon = 'warning';
                    color = '#ff6b6b';
                } else {
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
