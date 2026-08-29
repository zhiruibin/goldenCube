/**
 * HomeScene - 首页场景
 * 职责：入口 Hub（闯关/关卡广场/工坊/排行/成就/商店/设置）+ 好友挑战 + 每日登录金币
 */
const { Button } = require('../widgets/button');
const { Panel } = require('../widgets/panel');
const { coinManager, DAILY_WELFARE_REWARD } = require('../../utils/coin-manager');
const { getPendingChallengeCount } = require('./challenge-scene');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const {
    AMBIENT_PIECE_COLORS,
    SUBTITLE,
    MUTED,
    fillNightBackground,
    drawBrandTitle,
} = require('../theme/arcade-night');

// 首页背景装饰：缓慢下落的半透明方块（七种俄罗斯方块形状）
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

/** 本会话是否已提醒过待应战（避免反复 toast） */
let _pendingRemindedSession = false;

class HomeScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._titleY = 0;
        this._animTime = 0;
        // 背景装饰：缓慢下落的半透明方块
        this._fallingBlocks = [];
    }

    onEnter(params) {
        this._params = params;
        this._animTime = 0;
        this._initFallingBlocks();
        this._initUI();
        this._claimDailyLogin();
        this._maybeRemindPending();
        // 若音频已在用户手势中初始化过，回首页立即恢复 BGM
        this._ensureHomeBgm();
    }

    onExit() {
        this._buttons = [];
    }

    onPause() {}

    onResume() {
        // 从后台/分享返回时刷新待应战角标
        this._initUI();
        this._maybeRemindPending();
        this._ensureHomeBgm();
    }

    /** 首页 BGM：仅在 AudioContext 已初始化时尝试（需先有用户触摸） */
    _ensureHomeBgm() {
        try {
            if (wx.getStorageSync('gc_setting_bgm') === false) return;
            const audio = GameGlobal.game && GameGlobal.game.audioManager;
            if (!audio || !audio.isInitialized()) return;
            if (typeof audio.ensureBgmPlaying === 'function') {
                audio.ensureBgmPlaying();
            } else if (!audio.isBgmPlaying()) {
                audio.playBGM();
            }
        } catch (e) { /* ignore */ }
    }
    update(dt) {
        this._animTime += dt;
        this._updateFallingBlocks(dt);
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 夜场街机背景（暖夜，非冷赛博）
        fillNightBackground(ctx, W, H);

        // 背景装饰：缓慢下落的半透明方块
        this._renderFallingBlocks(ctx);

        const titleY = H * 0.15 + Math.sin(this._animTime * 2) * 5;
        drawBrandTitle(ctx, '挖个方块', W / 2, titleY, 'bold 48px sans-serif');

        // 副标题：玩（闯关/广场）+ 造（工坊）
        ctx.fillStyle = SUBTITLE;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('官方闯关 · 广场开打 · 工坊造关', W / 2, titleY + 40);

        // 按钮
        for (const btn of this._buttons) {
            btn.render(ctx);
        }

        // 底部信息
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.fillText('v1.0.0', W / 2, H - 20);
    }

    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const centerX = W / 2;
        const btnW = Math.min(280, W * 0.74);
        const gap = 16;
        const primaryH = 56;
        const smallW = (btnW - gap) / 2;
        const smallH = 44;

        this._buttons = [];

        // 主双入口：闯关 | 关卡广场（玩）；工坊整宽下沉（造）
        const primaryY = H * 0.28;
        const halfW = (btnW - gap) / 2;
        this._buttons.push(new Button({
            x: centerX - btnW / 2,
            y: primaryY,
            w: halfW,
            h: primaryH,
            text: '闯关',
            icon: 'brick',
            color: '#e09a30',
            onClick: () => GameGlobal.game.sceneManager.switchTo('stageSelect'),
        }));
        this._buttons.push(new Button({
            x: centerX - btnW / 2 + halfW + gap,
            y: primaryY,
            w: halfW,
            h: primaryH,
            text: '关卡广场',
            icon: 'puzzle',
            color: '#c9a227',
            onClick: () => GameGlobal.game.sceneManager.switchTo('plaza'),
        }));

        const workshopY = primaryY + primaryH + gap;
        this._buttons.push(new Button({
            x: centerX - btnW / 2,
            y: workshopY,
            w: btnW,
            h: smallH,
            text: '工坊 · 造关',
            icon: 'construction',
            color: '#8b5a2b',
            onClick: () => GameGlobal.game.sceneManager.switchTo('workshop'),
        }));

        // 功能入口 2x2 网格（排行/成就/商店/设置）
        const footerY = workshopY + smallH + gap;
        const footerBtns = [
            { text: '排行', target: 'rank', icon: 'trophy' },
            { text: '成就', target: 'achievement', icon: 'medal' },
            { text: '商店', target: 'shop', icon: 'cart' },
            { text: '设置', target: 'settings', icon: 'gear' },
        ];
        for (let i = 0; i < footerBtns.length; i++) {
            const item = footerBtns[i];
            const row = Math.floor(i / 2);
            const col = i % 2;
            this._buttons.push(new Button({
                x: centerX - btnW / 2 + col * (smallW + gap),
                y: footerY + row * (smallH + gap),
                w: smallW,
                h: smallH,
                text: item.text,
                icon: item.icon,
                color: '#555',
                onClick: () => {
                    if (item.target === 'rank') {
                        // 在点击手势内触发隐私授权，再进排行（好友榜依赖朋友关系声明）
                        const { ensurePrivacyAuthorize, showPrivacyFailTip } = require('../../utils/privacy');
                        ensurePrivacyAuthorize().then((ok) => {
                            if (!ok) {
                                showPrivacyFailTip({ errMsg: 'privacy not authorized' });
                                return;
                            }
                            GameGlobal.game.sceneManager.switchTo('rank');
                        });
                        return;
                    }
                    GameGlobal.game.sceneManager.switchTo(item.target);
                },
            }));
        }

        // 好友挑战入口（整宽按钮；有待应战时显示数量并默认进「待我应战」）
        const challengeY = footerY + (smallH + gap) * 2 + 10;
        const pendingCount = getPendingChallengeCount();
        const challengeLabel = pendingCount > 0
            ? ('好友挑战 (' + pendingCount + ')')
            : '好友挑战';
        this._buttons.push(new Button({
            x: centerX - btnW / 2,
            y: challengeY,
            w: btnW,
            h: primaryH,
            text: challengeLabel,
            icon: 'handshake',
            color: pendingCount > 0 ? '#e67e22' : '#555',
            onClick: () => GameGlobal.game.sceneManager.switchTo('challenge', {
                tab: pendingCount > 0 ? 'incoming' : 'sent',
            }),
        }));

        // 每日福利广告 D（+30，日 1 次）—— 未配置激励视频时整项隐藏
        if (isRewardedVideoConfigured() === true) {
            const welfareY = challengeY + primaryH + gap;
            const welfareClaimed = coinManager.isDailyWelfareClaimed();
            const welfareText = welfareClaimed
                ? '今日福利已领'
                : ('每日福利 +' + DAILY_WELFARE_REWARD);
            this._buttons.push(new Button({
                x: centerX - btnW / 2,
                y: welfareY,
                w: btnW,
                h: smallH,
                text: welfareText,
                icon: 'gift',
                color: welfareClaimed ? '#444' : '#3a7ab0',
                onClick: () => this._claimDailyWelfare(),
            }));
        }
    }

    /** 每日福利：看激励视频 +30 金币（日 1） */
    _claimDailyWelfare() {
        if (coinManager.isDailyWelfareClaimed()) {
            try { wx.showToast({ title: '今日已领过福利', icon: 'none' }); } catch (e) { /* ignore */ }
            return;
        }
        if (isRewardedVideoConfigured() !== true) {
            try { wx.showToast({ title: '广告暂不可用', icon: 'none' }); } catch (e) { /* ignore */ }
            return;
        }
        adManager.showRewardedVideo()
            .then(() => {
                const res = coinManager.tryClaimDailyWelfare();
                if (res && res.claimed) {
                    try {
                        wx.showToast({ title: '福利 +' + res.amount + ' 金币', icon: 'none' });
                    } catch (e) { /* ignore */ }
                    this._initUI();
                } else {
                    try { wx.showToast({ title: '今日已领过福利', icon: 'none' }); } catch (e) { /* ignore */ }
                }
            })
            .catch(() => {
                try { wx.showToast({ title: '需完整观看广告', icon: 'none' }); } catch (e) { /* ignore */ }
            });
    }


    /** 每日首次进入首页领取登录奖励（不占消行日上限） */
    _claimDailyLogin() {
        try {
            const res = coinManager.tryClaimDailyLogin();
            if (res && res.claimed && res.amount > 0) {
                setTimeout(() => {
                    wx.showToast({ title: `每日登录 +${res.amount} 金币`, icon: 'none' });
                }, 400);
            }
        } catch (e) {
            // 领取失败不影响首页
        }
    }

    /** 有待应战时轻提醒一次（本会话），推动社交闭环 */
    _maybeRemindPending() {
        try {
            const n = getPendingChallengeCount();
            if (n <= 0 || _pendingRemindedSession) return;
            _pendingRemindedSession = true;
            setTimeout(() => {
                try {
                    wx.showToast({ title: `你有 ${n} 个待应战`, icon: 'none' });
                } catch (e) { /* ignore */ }
            }, 1100);
        } catch (e) {
            // ignore
        }
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
            // 透明度：0.15~0.35，半透明氛围不遮挡前景
            alpha: 0.15 + Math.random() * 0.20,
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

    /**
     * 处理触摸点击（由 game.js 的事件转发调用）
     * @param {number} x
     * @param {number} y
     */
    handleTap(x, y) {
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
    }
}

module.exports = HomeScene;
