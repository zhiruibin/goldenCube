/**
 * StageSelectScene - 章内关卡选择（从世界地图点主题块进入）
 * 职责：展示当前章 10 关进度、入场费与挑战；未解锁章节可查看但不可进入。
 * 返回世界地图（sceneManager.back()）。不再左右滑翻章。
 */
const { fillNightBackground } = require('../theme/arcade-night');
const {
    drawThemeBackground,
    drawThemeImageContain,
    getThemeImage,
} = require('../theme/theme-images');
const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { Button } = require('../widgets/button');
const { roundRectPath } = require('../render/board-tiles');
const {
    promptStageEntry,
    handleEntryDialogTap,
    renderEntryDialog,
    renderCenterToast,
} = require('../../utils/stage-entry-ui');

const COLS = 2;
const H_PAD = 16;
const CARD_GAP = 12;
const CARD_H = 84;

/** 金矿工坊：章节页文案色（卡片仍用半透明样式） */
const MINE_TITLE = '#FFE566';
const MINE_TITLE_SHADOW = 'rgba(40, 24, 10, 0.7)';
const MINE_SUB = 'rgba(245, 230, 200, 0.84)';
const MINE_MUTED = 'rgba(230, 210, 180, 0.62)';
const MINE_ACCENT = '#FFC857';
/** 卡片三态：已通关 / 已解锁未通关 / 未解锁 */
const CARD_ACCENT = '#FFC857';
const CARD_MUTED = 'rgba(255, 245, 230, 0.42)';
const CARD_NAME = '#ffffff';
const CARD_STYLES = {
    cleared: {
        fill: 'rgba(255, 196, 80, 0.38)',
        stroke: 'rgba(255, 220, 120, 0.95)',
        lineWidth: 2,
        num: '#FFE566',
        name: '#fff8e8',
        status: 'rgba(255, 236, 190, 0.88)',
    },
    unlocked: {
        fill: 'rgba(70, 48, 28, 0.62)',
        stroke: 'rgba(255, 200, 87, 0.55)',
        lineWidth: 1.5,
        num: CARD_ACCENT,
        name: CARD_NAME,
        status: 'rgba(255, 245, 230, 0.62)',
    },
    locked: {
        fill: 'rgba(18, 14, 12, 0.55)',
        stroke: 'rgba(255, 255, 255, 0.12)',
        lineWidth: 1,
        num: CARD_MUTED,
        name: CARD_MUTED,
        status: CARD_MUTED,
    },
};

// 背景装饰：缓慢下落的半透明方块（暖土色，贴合矿洞）
const BG_TETROMINO_SHAPES = [
    [ [1, 1, 1, 1] ],
    [ [1, 1], [1, 1] ],
    [ [0, 1, 0], [1, 1, 1] ],
    [ [0, 1, 1], [1, 1, 0] ],
    [ [1, 1, 0], [0, 1, 1] ],
    [ [1, 0, 0], [1, 1, 1] ],
    [ [0, 0, 1], [1, 1, 1] ],
];
const BG_TETROMINO_COLORS = [
    '#8a6a48', '#c9a050', '#6a5840', '#a87840', '#5a4838', '#d4a060', '#7a6048',
];

class StageSelectScene {
    constructor() {
        this._params = null;
        this._cards = [];
        this._hitRects = [];
        this._toast = '';
        this._toastT = 0;
        // 背景装饰：缓慢下落的半透明方块
        this._fallingBlocks = [];
        this._animTime = 0;
        // 底部返回按钮（样式同商店）
        this._backButton = null;
        this._challengeBusy = false;
        this._chapters = [];
        this._chapter = 0;
        this._stages = [];
        this._offsetX = 0;
        this._dragBase = 0;
        this._touchId = null;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchLastX = 0;
        this._touchLastT = 0;
        this._touchVelocityX = 0;
        this._dragChapter = 0;
        this._isDragging = false;
        this._suppressTap = false;
        this._animFrom = 0;
        this._animTarget = 0;
        this._animT = 1;
        // 入场选择弹窗
        this._entryDialog = null;
    }

    onEnter(params) {
        this._params = params || {};
        this._toast = '';
        this._toastT = 0;
        this._animTime = 0;
        this._entryDialog = null;
        this._initFallingBlocks();
        this._initBackButton();
        this._chapters = goldenBlock.getChapters();
        if (typeof goldenBlock.syncUnlockedFromProgress === 'function') {
            goldenBlock.syncUnlockedFromProgress();
        }
        const chapterIdx = goldenBlock.resolveInitialChapterIndex({
            chapterIndex: this._params.chapterIndex,
            chapterId: this._params.chapterId,
            stageId: this._params.stageId,
        });
        this._chapter = chapterIdx;
        this._offsetX = 0;
        this._animT = 1;
        this._buildChapterCards();
        const login = coinManager.tryClaimDailyLogin();
        if (login.claimed) {
            this._showToast('每日登录 +' + login.amount + ' 金币');
        } else if (this._params.toast) {
            this._showToast(this._params.toast);
        }
    }

    onExit() {
        this._saveChapterIndex();
    }

    _saveChapterIndex(idx) {
        if (typeof goldenBlock.setLastChapterIndex !== 'function') return;
        const i = typeof idx === 'number' ? idx : this._chapter;
        goldenBlock.setLastChapterIndex(i);
    }

    /**
     * 布局度量：安全区 + 微信胶囊避让 + 可用内容区。
     * 全屏 canvas（screenWidth）时须用 safeArea / 胶囊矩形约束绘制，避免标题被裁切。
     */
    _getLayoutMetrics() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const safe = sys.safeArea || {};

        const safeLeft = Number(safe.left) || 0;
        const safeRight = (safe.right && safe.right > 0) ? safe.right : W;
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = Number(safe.top) || 0;

        // 微信胶囊：货币条与胶囊垂直居中对齐，标题排在胶囊下方
        let capsuleTop = statusBarHeight || safeTop || 20;
        let capsuleBottom = capsuleTop + 32;
        let capsuleInset = 90;
        try {
            const rect = wx.getMenuButtonBoundingClientRect();
            if (rect && rect.height > 0) {
                capsuleTop = rect.top;
                capsuleBottom = rect.bottom;
                if (rect.left > 0 && rect.left < W) {
                    capsuleInset = Math.max(capsuleInset, W - rect.left + 8);
                }
            }
        } catch (e) { /* 非微信环境忽略 */ }

        const balanceY = capsuleTop + (capsuleBottom - capsuleTop) / 2;
        let headerTop = Math.max(statusBarHeight, safeTop, capsuleBottom) + 10;

        const bottomInset = (safe.bottom && H > safe.bottom) ? (H - safe.bottom) : 0;
        const contentLeft = safeLeft + H_PAD;
        const contentRight = Math.min(safeRight, W) - H_PAD;
        const contentW = Math.max(0, contentRight - contentLeft);
        const contentCenterX = contentLeft + contentW / 2;

        const titleRowH = 34;
        const subtitleGap = 8;
        const subtitleH = 18;
        const gridTop = headerTop + titleRowH + subtitleGap + subtitleH + 14;

        const stageCount = (this._stages && this._stages.length) ? this._stages.length : 10;
        const rows = Math.ceil(stageCount / COLS);
        const backSkin = getThemeImage('mapBtnBack');
        const skinW = (backSkin.ready && backSkin.img && backSkin.img.width) || 640;
        const skinH = (backSkin.ready && backSkin.img && backSkin.img.height) || 287;
        const backAspect = skinW / Math.max(1, skinH);
        const backBtnW = Math.min(188, Math.round(W * 0.48));
        const backBtnH = Math.max(44, Math.round(backBtnW / backAspect));
        const backBtnY = H - bottomInset - backBtnH - 36;
        const footerY = backBtnY - 22;
        const gridBottom = backBtnY - 28;
        const availGridH = Math.max(0, gridBottom - gridTop);

        let cardGap = CARD_GAP;
        let cardH = CARD_H;
        const neededH = rows * cardH + (rows - 1) * cardGap;
        if (neededH > availGridH && rows > 0) {
            cardGap = Math.max(8, Math.floor(cardGap * availGridH / neededH));
            cardH = Math.max(72, Math.floor((availGridH - (rows - 1) * cardGap) / rows));
        }

        const cardW = (contentW - (COLS - 1) * cardGap) / COLS;
        // 标题在胶囊下方整行可用，只需避开右侧安全边距
        const titleMaxW = Math.max(80, contentW);

        return {
            W,
            H,
            headerTop,
            titleY: headerTop + titleRowH / 2,
            subtitleY: headerTop + titleRowH + subtitleGap + subtitleH / 2,
            footerY,
            contentLeft,
            contentRight,
            balanceX: contentLeft,
            balanceY,
            titleMaxW,
            contentW,
            contentCenterX,
            capsuleInset,
            gridTop,
            cardW,
            cardH,
            cardGap,
            backBtnY,
            backBtnW,
            backBtnH,
        };
    }

    _buildChapterCards() {
        const chapters = goldenBlock.getChapters();
        this._chapters = chapters;
        this._stages = goldenBlock.getStagesByChapter(chapters[this._chapter].id);
        const m = this._getLayoutMetrics();
        this._chapterCards = [];
        this._chapterHitRects = [];
        for (let ci = 0; ci < chapters.length; ci++) {
            const chap = chapters[ci];
            const stageList = goldenBlock.getStagesByChapter(chap.id);
            const cards = [];
            const hitRects = [];
            stageList.forEach((stage, i) => {
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const x = m.contentLeft + col * (m.cardW + m.cardGap);
                const y = m.gridTop + row * (m.cardH + m.cardGap);
                const cleared = !!goldenBlock.getStageBest(stage.id);
                // 与 card-stage-amber 约 2:1，等比缩小
                const btnW = 64;
                const btnH = 32;
                const challengeBtn = cleared ? {
                    x: x + m.cardW - btnW - 10,
                    y: y + m.cardH - btnH - 10,
                    w: btnW,
                    h: btnH,
                    stageId: stage.id,
                } : null;
                cards.push({
                    stage,
                    x,
                    y,
                    w: m.cardW,
                    h: m.cardH,
                    challengeBtn,
                });
                hitRects.push({ x, y, w: m.cardW, h: m.cardH, challengeBtn });
            });
            this._chapterCards.push(cards);
            this._chapterHitRects.push(hitRects);
        }
    }

    _initBackButton() {
        const m = this._getLayoutMetrics();
        this._backButton = new Button({
            x: m.W / 2 - m.backBtnW / 2,
            y: m.backBtnY,
            w: m.backBtnW,
            h: m.backBtnH,
            text: '返回',
            color: '#5a4534',
            skin: 'mapBtnBack',
            skinMode: 'stretch',
            layout: 'text',
            labelColor: '#fff8ec',
            fontScale: 1.05,
            letterSpacing: 4,
            onClick: () => GameGlobal.game.sceneManager.back(),
        });
    }

    /**
     * 触摸结束点击路由（game.js 通过 scene.handleTap(x, y) 分发到当前场景）
     * @param {number} x 逻辑坐标 X
     * @param {number} y 逻辑坐标 Y
     */
    handleTap(x, y) {
        // 滑动翻页后抑制本次 tap，防止误触卡片
        if (this._suppressTap) {
            this._suppressTap = false;
            return;
        }
        if (this._entryDialog) {
            const action = handleEntryDialogTap(this._entryDialog, x, y, {
                onEnter: (stageId, paid) => this._startStage(stageId, paid),
                onToast: (msg) => this._showToast(msg),
                onChallenge: (stage) => this._startStageChallenge(stage),
            });
            if (action === 'dismiss') {
                this._entryDialog = null;
            }
            return;
        }
        // 底部返回按钮命中检测
        if (this._backButton && this._backButton.hitTest(x, y)) {
            this._backButton.trigger();
            return;
        }
        const ch = this._chapter;
        const cards = this._chapterHitRects[ch] || [];
        const localX = x;
        // 已通关关卡上的「挑战」按钮优先命中
        for (let i = 0; i < cards.length; i++) {
            const r = cards[i];
            const cb = r.challengeBtn;
            if (!cb) continue;
            if (localX >= cb.x && localX <= cb.x + cb.w && y >= cb.y && y <= cb.y + cb.h) {
                if (!goldenBlock.isChapterUnlocked(this._chapters[ch].id)) {
                    this._showToast('通关上一章全部关卡后解锁');
                    return;
                }
                this._startStageChallenge(this._chapterCards[ch][i].stage);
                return;
            }
        }
        for (let i = 0; i < cards.length; i++) {
            const r = cards[i];
            if (localX >= r.x && localX <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                if (!goldenBlock.isChapterUnlocked(this._chapters[ch].id)) {
                    this._showToast('通关上一章全部关卡后解锁');
                    return;
                }
                this._handleCardTap(this._chapterCards[ch][i]);
                return;
            }
        }
    }

    /** 已通关官方关：创建残局挑战并分享 */
    _startStageChallenge(stage) {
        if (!stage || this._challengeBusy) return;
        const best = goldenBlock.getStageBest(stage.id);
        if (!best || !(best.lines >= 1)) {
            this._showToast('请先通关再挑战');
            return;
        }
        if (!stage.rows) {
            this._showToast('关卡布局不可用');
            return;
        }

        let cloudService = null;
        try {
            ({ cloudService } = require('../../utils/cloud-service'));
        } catch (e) {
            cloudService = null;
        }
        if (!cloudService || !cloudService.isAvailable()) {
            this._showToast('云开发未配置，无法发起挑战');
            return;
        }

        this._challengeBusy = true;
        this._showToast('创建挑战中…');

        const workshop = require('../../utils/workshop-manager');
        const layoutSnapshot = workshop.cloneRows(stage.rows);
        const title = ('第' + stage.id + '关·' + (stage.name || '')).slice(0, 20);

        const { ensureProfileForAction } = require('../../utils/user-profile');
        ensureProfileForAction({
            title: '发起好友挑战',
            content: '授权微信头像昵称后，好友能看到你的资料。也可暂不授权，使用默认昵称继续发起。',
        }).then((profile) => {
            return cloudService.createChallenge({
                mode: 'stage',
                stageId: String(stage.id),
                workshopStageId: String(stage.id),
                workshopTitle: title,
                stageTitle: title,
                layoutSnapshot,
                challengerLines: best.lines,
                challengerPieces: best.pieces || 0,
                challengerTimeMs: best.timeMs || 0,
                nickname: (profile && profile.nickname) || '',
                avatarUrl: (profile && profile.avatarUrl) || '',
            });
        }).then((res) => {
            this._challengeBusy = false;
            if (!res || !res.success || !res.challengeId) {
                this._showToast((res && res.errMsg) || '发起失败');
                return;
            }
            try {
                const { achievementManager } = require('../../utils/achievement-manager');
                if (achievementManager && typeof achievementManager.reportChallengeCreate === 'function') {
                    achievementManager.reportChallengeCreate();
                }
            } catch (e) { /* ignore */ }
            try {
                const challengeShareCard = require('../../utils/challenge-share-card');
                const sharePayload = {
                    mode: 'stage',
                    workshopStageId: String(stage.id),
                    workshopTitle: title,
                    layoutSnapshot,
                    challengerLines: best.lines,
                    challengerPieces: best.pieces || 0,
                    challengerTimeMs: best.timeMs || 0,
                };
                challengeShareCard.shareWithCard({
                    title: title + ' · ' + best.lines + ' 行，敢来挑战吗？',
                    query: 'challengeId=' + encodeURIComponent(res.challengeId)
                        + '&mode=stage&score=' + best.lines,
                    cardOpts: challengeShareCard.cardOptsFromPayload(sharePayload),
                    success: () => {
                        try {
                            const { achievementManager } = require('../../utils/achievement-manager');
                            achievementManager.reportShare();
                            achievementManager.reportInvite();
                        } catch (e) { /* ignore */ }
                    },
                });
            } catch (e) { /* ignore */ }
            this._showToast('挑战已创建，请分享给好友');
        }).catch(() => {
            this._challengeBusy = false;
            this._showToast('发起失败');
        });
    }

    _handleCardTap(card) {
        const stage = card.stage;
        promptStageEntry(stage, {
            onDialog: (dialog) => {
                if (!dialog.locked) {
                    const best = goldenBlock.getStageBest(stage.id);
                    dialog.canChallenge = !!(best && best.lines >= 1);
                }
                this._entryDialog = dialog;
            },
            onEnter: (stageId, paid) => this._startStage(stageId, paid),
            onToast: (msg) => this._showToast(msg),
        });
    }

    _startStage(stageId, entryPaid) {
        this._entryDialog = null;
        if (typeof goldenBlock.setLastChapterIndex === 'function') {
            goldenBlock.setLastChapterIndex(goldenBlock.getChapterIndexByStageId(stageId));
        }
        GameGlobal.game.sceneManager.switchTo('game', {
            mode: 'stage',
            stageId,
            entryPaid: entryPaid || 0,
        });
    }

    _showToast(msg) {
        this._toast = msg;
        this._toastT = 1.6;
    }

    handleTouchStart() {
        if (this._entryDialog) this._entryDialog.armed = true;
    }

    handleTouchMove() {}

    handleTouchEnd() {}

    update(dt) {
        this._animTime += dt;
        if (this._toastT > 0) this._toastT -= dt;
        this._updateFallingBlocks(dt);
    }

    // ==================== 背景装饰：缓慢下落的半透明方块 ====================

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

    _drawBrandTitle(ctx, text, x, y, font) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = font || 'bold 28px sans-serif';
        ctx.fillStyle = MINE_TITLE_SHADOW;
        ctx.fillText(text, x + 1, y + 2);
        ctx.fillStyle = MINE_TITLE;
        ctx.fillText(text, x, y);
    }

    _cnNum(n) {
        const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        return map[n] || String(n);
    }

    _truncateText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let s = text;
        while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) {
            s = s.slice(0, -1);
        }
        return s + '…';
    }

    _drawCard(ctx, card, pageX, chapterUnlocked) {
        const { stage, y, w, h } = card;
        const x = card.x + pageX;
        const unlocked = goldenBlock.isUnlocked(stage.id);
        const best = goldenBlock.getStageBest(stage.id);
        const cleared = !!best;
        const nameY = y + Math.max(42, h - 36);
        const nameMaxW = w - 24 - (cleared ? 78 : 0);

        let styleKey = 'locked';
        if (chapterUnlocked && unlocked) {
            styleKey = cleared ? 'cleared' : 'unlocked';
        }
        const style = CARD_STYLES[styleKey];

        ctx.fillStyle = style.fill;
        roundRectPath(ctx, x, y, w, h, 10);
        ctx.fill();
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.lineWidth;
        ctx.stroke();

        // 已通关：内侧细高光，和其他状态拉开层次
        if (styleKey === 'cleared') {
            ctx.strokeStyle = 'rgba(255, 245, 200, 0.35)';
            ctx.lineWidth = 1;
            roundRectPath(ctx, x + 3, y + 3, w - 6, h - 6, 8);
            ctx.stroke();
        }

        ctx.fillStyle = style.num;
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(stage.id), x + 12, y + 10);

        ctx.fillStyle = style.name;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(this._truncateText(ctx, stage.name, nameMaxW), x + 12, nameY);

        ctx.font = '12px sans-serif';
        ctx.fillStyle = style.status;
        ctx.textAlign = 'right';
        let status;
        if (!chapterUnlocked) {
            status = '🔒 章节未解锁';
        } else if (!unlocked) {
            status = '🔒 解锁 ' + (stage.unlockCost || 0) + ' 块';
        } else if (cleared) {
            status = '最佳 ' + best.lines + ' 行';
        } else {
            const fee = coinManager.getEntryFee(stage.id);
            const T = stage.coinThreshold || ((stage.minLines || 1) * 2);
            status = fee > 0
                ? ('入场 ' + fee + '币 · T' + T)
                : ('免费 · 理论 ' + (stage.minLines || 0));
        }
        ctx.fillText(status, x + w - 12, y + 12);
        ctx.textAlign = 'left';

        if (chapterUnlocked && cleared && card.challengeBtn) {
            const cb = card.challengeBtn;
            const bx = cb.x + pageX;
            const by = cb.y;
            // amber 宽卡贴图等比 contain，不拉伸变形
            const drawn = drawThemeImageContain(
                ctx,
                'cardStageAmber',
                bx + cb.w / 2,
                by + cb.h / 2,
                cb.w,
                cb.h
            );
            if (!drawn.drawn) {
                ctx.fillStyle = 'rgba(168, 104, 48, 0.92)';
                roundRectPath(ctx, bx, by, cb.w, cb.h, 6);
                ctx.fill();
            }
            ctx.fillStyle = '#fff8ec';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('挑战好友', bx + cb.w / 2, by + cb.h / 2 + 1);
            ctx.textAlign = 'left';
        }
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const m = this._getLayoutMetrics();

        if (!drawThemeBackground(ctx, 'mapMineBg', W, H)) {
            fillNightBackground(ctx, W, H);
        } else {
            ctx.fillStyle = 'rgba(12, 8, 4, 0.28)';
            ctx.fillRect(0, 0, W, H);
        }
        this._renderFallingBlocks(ctx);

        const chapters = this._chapters;
        const ci = this._chapter;
        const chap = chapters[ci];
        if (chap) {
            const pageX = 0;
            const unlocked = goldenBlock.isChapterUnlocked(chap.id);
            const cards = this._chapterCards[ci] || [];

            const titleRaw = '第' + this._cnNum(ci + 1) + '章 · ' + chap.name;
            ctx.font = 'bold 28px sans-serif';
            const titleText = this._truncateText(ctx, titleRaw, m.titleMaxW);
            this._drawBrandTitle(
                ctx,
                titleText,
                pageX + m.contentLeft,
                m.titleY,
                'bold 28px sans-serif'
            );

            ctx.fillStyle = unlocked ? MINE_SUB : MINE_MUTED;
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const introRaw = unlocked ? chap.intro : '通关上一章全部关卡解锁';
            ctx.fillText(
                this._truncateText(ctx, introRaw, m.titleMaxW),
                pageX + m.contentLeft,
                m.subtitleY
            );

            for (let i = 0; i < cards.length; i++) {
                this._drawCard(ctx, cards[i], pageX, unlocked);
            }
        }

        const balance = goldenBlock.getBalance();
        const coins = coinManager.getCoins();
        ctx.fillStyle = MINE_ACCENT;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('◆ ' + balance + '  ·  币 ' + coins, m.balanceX, m.balanceY);

        if (this._backButton) this._backButton.render(ctx);

        ctx.fillStyle = MINE_MUTED;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('首通 +1 金色方块 · 破纪录再 +1', m.contentCenterX, m.footerY);
        ctx.textAlign = 'left';

        if (this._entryDialog) {
            renderEntryDialog(ctx, W, H, this._entryDialog);
        }

        if (this._toastT > 0 && this._toast) {
            renderCenterToast(ctx, W, H, this._toast);
        }
    }
}

module.exports = StageSelectScene;
