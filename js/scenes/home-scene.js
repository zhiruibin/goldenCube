/**
 * HomeScene - 首页场景
 * 职责：入口 Hub（闯关/关卡广场/工坊/排行/成就/商店/设置）+ 好友挑战 + 每日登录金币
 */
const { Button } = require('../widgets/button');
const { Panel } = require('../widgets/panel');
const { coinManager, DAILY_WELFARE_REWARD } = require('../../utils/coin-manager');
const { getPendingChallengeCount } = require('./challenge-scene');
const { adManager, isRewardedVideoConfigured, isBannerConfigured } = require('../../utils/ad-manager');
const {
    MUTED,
    fillNightBackground,
    drawBrandTitle,
} = require('../theme/arcade-night');
const { drawThemeBackground, drawThemeImageContain } = require('../theme/theme-images');
const { MiniTetrisFx } = require('../render/mini-tetris-fx');
const { FRAME_INTERVAL } = require('../runtime/frame-budget');

/** 首页底栏槽位高度（占位特效 / 后续 Banner 共用） */
const HOME_FOOTER_SLOT_H = 72;
/** 进入首页后延迟展示 Banner（毫秒） */
const HOME_BANNER_DELAY_MS = 1800;

// 首页背景装饰已关闭（概念图无下落方块）；保留形状表供日后复用
const BG_TETROMINO_SHAPES = [
    [ [1, 1, 1, 1] ],
    [ [1, 1], [1, 1] ],
    [ [0, 1, 0], [1, 1, 1] ],
    [ [0, 1, 1], [1, 1, 0] ],
    [ [1, 1, 0], [0, 1, 1] ],
    [ [1, 0, 0], [1, 1, 1] ],
    [ [0, 0, 1], [1, 1, 1] ],
];
const BG_TETROMINO_COLORS = ['#5ec8d4', '#e8c84a', '#b07cd4', '#5cbc6a', '#e07070', '#5a8fd4', '#e8a040'];

/** 本会话是否已提醒过待应战（避免反复 toast） */
let _pendingRemindedSession = false;

const PRIVACY_LINK_TEXT = '用户隐私保护指引';

class HomeScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._titleY = 0;
        this._animTime = 0;
        // 背景装饰：缓慢下落的半透明方块
        this._fallingBlocks = [];
        /** @type {{ x: number, y: number, w: number, h: number } | null} */
        this._privacyLinkRect = null;
        this._miniFx = null;
        this._bannerTimer = null;
    }

    onEnter(params) {
        this._params = params;
        this._animTime = 0;
        this._fallingBlocks = [];
        this._initUI();
        this._claimDailyLogin();
        this._maybeRemindPending();
        this._initFooterContent();
        // 若音频已在用户手势中初始化过，回首页立即恢复 BGM
        this._ensureHomeBgm();
    }

    getRenderInterval() {
        return FRAME_INTERVAL;
    }

    onExit() {
        this._teardownFooterContent();
        this._buttons = [];
    }

    onPause() {}

    onResume() {
        // 从后台/分享返回时刷新待应战角标
        this._initUI();
        this._maybeRemindPending();
        this._initFooterContent();
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
        if (this._miniFx) this._miniFx.update(dt);
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 概念图矿洞底；未就绪回退夜场渐变
        if (!drawThemeBackground(ctx, 'homeBg', W, H)) {
            fillNightBackground(ctx, W, H);
        } else {
            // 轻压暗，突出前景 UI
            ctx.fillStyle = 'rgba(8, 6, 4, 0.22)';
            ctx.fillRect(0, 0, W, H);
        }

        // 标题牌（整体下移 50px，给顶区留呼吸）
        const titleCy = H * 0.14 + 50 + Math.sin(this._animTime * 2) * 3;
        const plaque = drawThemeImageContain(
            ctx,
            'titlePlaque',
            W / 2,
            titleCy,
            Math.min(W * 0.86, 340),
            Math.min(H * 0.2, 150)
        );
        let subtitleY;
        if (plaque.drawn) {
            subtitleY = plaque.y + plaque.h + 10;
        } else {
            drawBrandTitle(ctx, '挖个方块', W / 2, titleCy, 'bold 48px sans-serif');
            subtitleY = titleCy + 42;
        }

        ctx.fillStyle = 'rgba(255, 245, 230, 0.82)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('官方闯关 · 广场开打 · 工坊造关', W / 2, subtitleY);

        for (const btn of this._buttons) {
            btn.render(ctx);
        }

        if (this._miniFx) {
            this._miniFx.render(ctx);
        }

        // 底部：隐私指引 + 版本号
        const privacyY = H - 66;
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(PRIVACY_LINK_TEXT, W / 2, privacyY);
        const privacyTextW = ctx.measureText(PRIVACY_LINK_TEXT).width;
        ctx.strokeStyle = MUTED;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - privacyTextW / 2, privacyY + 8);
        ctx.lineTo(W / 2 + privacyTextW / 2, privacyY + 8);
        ctx.stroke();
        ctx.fillText('v1.0.0', W / 2, H - 40);
    }

    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const centerX = W / 2;
        // 2×2 主钮 + 更宽的底栏小方钮行
        const gap = 10;
        const iconGap = 12;
        const gridY = H * 0.29 + 50;
        const gridMaxW = Math.min(248, W * 0.64);
        // 底栏可比主钮网格更宽
        const iconRowW = Math.min(W * 0.9, Math.max(gridMaxW * 1.28, gridMaxW + 56));
        const iconSizeGuess = Math.floor((iconRowW - iconGap * 3) / 4);
        const maxCell = Math.floor((H - gridY - iconSizeGuess - gap * 3 - 100) / 2);
        const cell = Math.max(100, Math.min((gridMaxW - gap) / 2, maxCell));
        const btnW = cell * 2 + gap;
        const left = centerX - btnW / 2;
        const iconSize = Math.max(58, Math.min(72, Math.floor((iconRowW - iconGap * 3) / 4)));
        const iconRowLeft = centerX - (iconSize * 4 + iconGap * 3) / 2;

        this._buttons = [];

        const pendingCount = getPendingChallengeCount();

        const bigBtns = [
            {
                col: 0,
                row: 0,
                text: '闯关',
                fontScale: 1,
                color: '#d87a28',
                skin: 'btnSquareAmber',
                onClick: () => {
                    try {
                        GameGlobal.game.sceneManager.switchTo('worldMap');
                    } catch (e) {
                        console.error('[Home] 进入世界地图失败', e);
                        GameGlobal.game.sceneManager.switchTo('stageSelect');
                    }
                },
            },
            {
                col: 1,
                row: 0,
                text: '关卡\n广场',
                fontScale: 1,
                color: '#c9a227',
                skin: 'btnSquareGold',
                onClick: () => GameGlobal.game.sceneManager.switchTo('plaza'),
            },
            {
                col: 0,
                row: 1,
                text: '工坊',
                fontScale: 1,
                color: '#8b5a2b',
                skin: 'btnSquareBrown',
                onClick: () => GameGlobal.game.sceneManager.switchTo('workshop'),
            },
            {
                col: 1,
                row: 1,
                text: pendingCount > 0 ? ('挑战\n(' + pendingCount + ')') : '好友\n挑战',
                fontScale: 1,
                color: pendingCount > 0 ? '#33d6ff' : '#1aa8a0',
                skin: 'btnSquareTeal',
                onClick: () => GameGlobal.game.sceneManager.switchTo('challenge', {
                    tab: pendingCount > 0 ? 'incoming' : 'sent',
                }),
            },
        ];

        for (let i = 0; i < bigBtns.length; i++) {
            const item = bigBtns[i];
            this._buttons.push(new Button({
                x: left + item.col * (cell + gap),
                y: gridY + item.row * (cell + gap),
                w: cell,
                h: cell,
                text: item.text,
                layout: 'text',
                fontScale: item.fontScale,
                letterSpacing: 2,
                labelColor: '#fff6e8',
                color: item.color,
                skin: item.skin,
                onClick: item.onClick,
            }));
        }

        const iconY = gridY + cell * 2 + gap * 2 + 4;
        const footerBtns = [
            { text: '排行', target: 'rank', icon: 'trophy' },
            { text: '成就', target: 'achievement', icon: 'medal' },
            { text: '商店', target: 'shop', icon: 'cart' },
            { text: '设置', target: 'settings', icon: 'gear' },
        ];
        for (let i = 0; i < footerBtns.length; i++) {
            const item = footerBtns[i];
            this._buttons.push(new Button({
                x: iconRowLeft + i * (iconSize + iconGap),
                y: iconY,
                w: iconSize,
                h: iconSize,
                text: item.text,
                icon: item.icon,
                layout: 'iconStack',
                labelColor: '#fff6e8',
                color: '#6b4a2e',
                skin: 'btnIconBrown',
                onClick: () => {
                    if (item.target === 'rank') {
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

        if (isRewardedVideoConfigured() === true) {
            const welfareY = iconY + iconSize + gap;
            const welfareClaimed = coinManager.isDailyWelfareClaimed();
            const welfareText = welfareClaimed
                ? '今日福利已领'
                : ('每日福利 +' + DAILY_WELFARE_REWARD);
            const welfareW = iconSize * 4 + iconGap * 3;
            this._buttons.push(new Button({
                x: iconRowLeft,
                y: welfareY,
                w: welfareW,
                h: 44,
                text: welfareText,
                layout: 'text',
                labelColor: '#fff6e8',
                color: welfareClaimed ? '#555' : '#6b4a2e',
                skin: 'btnIconBrown',
                skinMode: '9slice',
                onClick: () => this._claimDailyWelfare(),
            }));
        }

        this._privacyLinkRect = {
            x: 0,
            y: H - 84,
            w: W,
            h: 44,
        };
    }

    /** 底栏槽位：隐私指引上方固定高度区域 */
    _layoutFooterSlot(H) {
        const slotBottom = H - 78;
        return {
            top: slotBottom - HOME_FOOTER_SLOT_H,
            bottom: slotBottom,
        };
    }

    /**
     * 底栏内容：Banner 已配置 → 仅广告；未配置 → 7 方块占位特效（互斥）
     */
    _initFooterContent() {
        this._teardownFooterContent(false);

        if (isBannerConfigured()) {
            this._bannerTimer = setTimeout(() => {
                this._bannerTimer = null;
                adManager.showBanner();
            }, HOME_BANNER_DELAY_MS);
            return;
        }

        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const slot = this._layoutFooterSlot(H);
        this._miniFx = new MiniTetrisFx();
        this._miniFx.init({
            width: W,
            height: H,
            areaTop: slot.top,
            areaBottom: slot.bottom,
            interactive: true,
        });
    }

    /** @param {boolean} [hideBanner=true] */
    _teardownFooterContent(hideBanner) {
        if (hideBanner !== false) {
            adManager.hideBanner();
        }
        if (this._bannerTimer) {
            clearTimeout(this._bannerTimer);
            this._bannerTimer = null;
        }
        if (this._miniFx) {
            this._miniFx.destroy();
            this._miniFx = null;
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
        const count = 6;
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
            // 透明度：主题底图较满，装饰再淡一点
            alpha: 0.08 + Math.random() * 0.12,
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
        const r = this._privacyLinkRect;
        if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            const { openPrivacyContract } = require('../../utils/privacy');
            openPrivacyContract();
        }
    }
}

module.exports = HomeScene;
