/**
/*** StageSelectScene - 关卡选择场景（闯关二级页，从首页进入）
 * 职责：章节制闯关选择（横向分页翻章），每章展示 10 关进度与金色方块余额；锁定章节可滑动查看但不可进入。
 * 由首页 Hub 进入的二级页：底部提供「← 返回」按钮（sceneManager.back() 回首页），样式同商店场景。
 * 样式参考 tetris-mini home-scene：满屏夜场背景 + 下落方块装饰 + 标题水平居中。
 */
const {
    fillNightBackground,
    ACCENT,
    SUBTITLE,
    MUTED,
    TITLE,
    TITLE_GLOW,
    AMBIENT_PIECE_COLORS,
} = require('../theme/arcade-night');
const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const { Button } = require('../widgets/button');
const COLS = 2;
const H_PAD = 16;
const CARD_GAP = 12;
const CARD_H = 84;

// 背景装饰：缓慢下落的半透明方块（移植 tetris-mini 首页样式）
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
        this._chapter = 0;
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

    onExit() {}

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
        const backBtnH = 48;
        const backBtnY = H - bottomInset - backBtnH - 32;
        const footerY = backBtnY - 44;
        const gridBottom = backBtnY - 48;
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
                const btnW = 88;
                const btnH = 24;
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
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const safe = sys.safeArea || {};
        const bottomInset = (safe.bottom && H > safe.bottom) ? (H - safe.bottom) : 0;
        const btnW = Math.min(260, W * 0.7);
        const btnH = 48;
        this._backButton = new Button({
            x: W / 2 - btnW / 2,
            y: H - bottomInset - 80,
            w: btnW,
            h: btnH,
            text: '← 返回',
            color: '#555',
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
            this._handleEntryDialogTap(x, y);
            return;
        }
        // 底部返回按钮命中检测
        if (this._backButton && this._backButton.hitTest(x, y)) {
            this._backButton.trigger();
            return;
        }
        const W = GameGlobal.game.width;
        const ch = this._chapter;
        const cards = this._chapterHitRects[ch] || [];
        const pageOffset = ch * W + this._offsetX;
        const localX = x - pageOffset;
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
        const unlocked = goldenBlock.isUnlocked(stage.id);
        if (!unlocked) {
            const res = goldenBlock.unlockStage(stage.id);
            if (!res.ok) {
                if (res.reason === 'no-gold') {
                    this._showToast('金色方块不足');
                }
                return;
            }
            this._buildChapterCards();
        }
        const fee = coinManager.getEntryFee(stage.id);
        if (fee <= 0) {
            this._startStage(stage.id, 0);
            return;
        }
        this._entryDialog = {
            stage,
            fee,
            freeLeft: coinManager.getFreeEntryRemaining(),
            canAd: isRewardedVideoConfigured() === true,
        };
    }

    _startStage(stageId, entryPaid) {
        this._entryDialog = null;
        GameGlobal.game.sceneManager.switchTo('game', {
            mode: 'stage',
            stageId,
            entryPaid: entryPaid || 0,
        });
    }

    _handleEntryDialogTap(x, y) {
        const d = this._entryDialog;
        if (!d) return;
        // 关闭：右上角 × / 取消按钮 / 点遮罩空白
        if (d.closeRect && this._hit(x, y, d.closeRect)) {
            this._entryDialog = null;
            return;
        }
        if (d.cancelRect && this._hit(x, y, d.cancelRect)) {
            this._entryDialog = null;
            return;
        }
        if (d.panelRect && !this._hit(x, y, d.panelRect)) {
            this._entryDialog = null;
            return;
        }
        if (d.payRect && this._hit(x, y, d.payRect)) {
            const paid = coinManager.spendEntryFee(d.stage.id);
            if (!paid.ok) {
                this._showToast('金币不足（需 ' + d.fee + '）');
                return;
            }
            this._startStage(d.stage.id, paid.paid);
            return;
        }
        if (d.adRect && this._hit(x, y, d.adRect)) {
            if (d.freeLeft <= 0) {
                this._showToast('今日免费入场已用完');
                return;
            }
            if (!d.canAd) {
                this._showToast('广告暂不可用');
                return;
            }
            adManager.showRewardedVideo()
                .then(() => {
                    if (!coinManager.consumeFreeEntry()) {
                        this._showToast('今日免费入场已用完');
                        return;
                    }
                    this._startStage(d.stage.id, 0);
                })
                .catch(() => {
                    this._showToast('需完整观看广告');
                });
        }
    }

    _hit(x, y, r) {
        return !!(r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    }

    _showToast(msg) {
        this._toast = msg;
        this._toastT = 1.6;
    }

    handleTouchStart(identifier, x, y) {
        this._touchId = identifier;
        this._touchStartX = x;
        this._touchStartY = y;
        this._isDragging = false;
        this._dragBase = this._offsetX;
    }

    handleTouchMove(identifier, x, y) {
        if (identifier !== this._touchId) return;
        const dx = x - this._touchStartX;
        const dy = y - this._touchStartY;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) >= Math.abs(dx)) return;
        this._isDragging = true;
        const W = GameGlobal.game.width;
        const chapters = this._chapters || [];
        let off = this._dragBase + dx;
        const minOff = -(chapters.length - 1) * W;
        if (off > 0) {
            off *= 0.35;
        } else if (off < minOff) {
            off = minOff + (off - minOff) * 0.35;
        }
        this._offsetX = off;
    }

    handleTouchEnd(identifier) {
        if (identifier !== this._touchId && identifier !== -1) return;
        this._touchId = null;
        if (this._isDragging) {
            this._suppressTap = true;
            const W = GameGlobal.game.width;
            const chapters = this._chapters || [];
            const idx = Math.max(0, Math.min(chapters.length - 1, Math.round(-this._offsetX / W)));
            this._chapter = idx;
            this._animFrom = this._offsetX;
            this._animTarget = -idx * W;
            this._animT = 0;
        }
        this._isDragging = false;
    }

    update(dt) {
        this._animTime += dt;
        if (this._toastT > 0) this._toastT -= dt;
        this._updateFallingBlocks(dt);
        if (this._animT < 1) {
            this._animT = Math.min(1, this._animT + dt * 8);
            const e = 1 - Math.pow(1 - this._animT, 3);
            this._offsetX = this._animFrom + (this._animTarget - this._animFrom) * e;
            if (this._animT >= 1) this._offsetX = this._animTarget;
        }
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

    _drawBrandTitle(ctx, text, x, y, font) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = font || 'bold 28px sans-serif';
        ctx.fillStyle = TITLE_GLOW;
        ctx.fillText(text, x + 1, y + 2);
        ctx.fillStyle = TITLE;
        ctx.fillText(text, x, y);
    }

    _cnNum(n) {
        const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        return map[n] || String(n);
    }

    _drawPageDots(ctx, m) {
        const chapters = this._chapters;
        if (!chapters || chapters.length === 0) return;
        const r = 4;
        const gap = 12;
        const totalW = chapters.length * (r * 2) + (chapters.length - 1) * gap;
        const startX = m.contentCenterX - totalW / 2;
        const y = m.backBtnY - 30;
        for (let i = 0; i < chapters.length; i++) {
            const x = startX + i * (r * 2 + gap);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = (i === this._chapter) ? ACCENT : 'rgba(255,255,255,0.25)';
            ctx.fill();
        }
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
        const nameMaxW = w - 24 - (cleared ? 94 : 0);

        if (!chapterUnlocked) {
            // 章节未解锁：整体灰态，仅提示不可进入
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, w, h, 10);
            } else {
                ctx.rect(x, y, w, h);
            }
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, w, h, 10);
            } else {
                ctx.rect(x, y, w, h);
            }
            ctx.stroke();

            // 关卡号
            ctx.fillStyle = MUTED;
            ctx.font = 'bold 30px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(String(stage.id), x + 12, y + 10);

            // 名称（过长截断）
            ctx.fillStyle = MUTED;
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(this._truncateText(ctx, stage.name, nameMaxW), x + 12, nameY);

            // 状态行：固定提示章节未解锁
            ctx.font = '12px sans-serif';
            ctx.fillStyle = MUTED;
            ctx.textAlign = 'right';
            ctx.fillText('🔒 章节未解锁', x + w - 12, y + 12);
            ctx.textAlign = 'left';
            return;
        }

        ctx.fillStyle = unlocked ? 'rgba(255, 200, 87, 0.14)' : 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, 10);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.fill();
        ctx.strokeStyle = unlocked ? 'rgba(255, 200, 87, 0.6)' : 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, 10);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.stroke();

        // 关卡号
        ctx.fillStyle = unlocked ? ACCENT : MUTED;
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(stage.id), x + 12, y + 10);

        // 名称（过长截断）
        ctx.fillStyle = unlocked ? '#ffffff' : MUTED;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(this._truncateText(ctx, stage.name, nameMaxW), x + 12, nameY);

        // 状态行：理论 / 最佳 / 锁定
        ctx.font = '12px sans-serif';
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'right';
        let status;
        if (!unlocked) {
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

        // 已通关：右下角「约好友来战」（邀请好友打同一关，非自己再战）
        if (cleared && card.challengeBtn) {
            const cb = card.challengeBtn;
            const bx = cb.x + pageX;
            const by = cb.y;
            ctx.fillStyle = 'rgba(224, 154, 48, 0.9)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, cb.w, cb.h, 6);
            else ctx.rect(bx, by, cb.w, cb.h);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('约好友来战', bx + cb.w / 2, by + cb.h / 2);
            ctx.textAlign = 'left';
        }
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const m = this._getLayoutMetrics();

        // 满屏夜场街机背景（参考 tetris-mini 首页：fillNightBackground 全屏）
        fillNightBackground(ctx, W, H);
        // 背景装饰：缓慢下落的半透明方块
        this._renderFallingBlocks(ctx);

        // 逐章渲染分页内容（仅绘制屏幕内可见的页，含 8px 余量）
        const chapters = this._chapters;
        for (let ci = 0; ci < chapters.length; ci++) {
            const chap = chapters[ci];
            const pageX = ci * W + this._offsetX;
            if (pageX + W <= -8 || pageX >= W + 8) continue;

            const unlocked = goldenBlock.isChapterUnlocked(chap.id);
            const cards = this._chapterCards[ci] || [];

            // 章节标题：左对齐，整行可用（货币条已移到胶囊行）
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

            // 章节简介：未解锁章节展示解锁提示
            ctx.fillStyle = unlocked ? SUBTITLE : MUTED;
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const introRaw = unlocked ? chap.intro : '🔒 通关上一章全部关卡解锁';
            ctx.fillText(
                this._truncateText(ctx, introRaw, m.titleMaxW),
                pageX + m.contentLeft,
                m.subtitleY
            );

            // 该章卡片网格
            for (let i = 0; i < cards.length; i++) {
                this._drawCard(ctx, cards[i], pageX, unlocked);
            }
        }

        // ===== 固定层（不随分页滑动）=====

        // 金方块 / 金币：左上角，与微信胶囊垂直居中对齐
        const balance = goldenBlock.getBalance();
        const coins = coinManager.getCoins();
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('◆ ' + balance + '  ·  币 ' + coins, m.balanceX, m.balanceY);

        // 章节圆点指示器
        this._drawPageDots(ctx, m);

        if (this._backButton) this._backButton.render(ctx);

        // 底部提示（避开 Home Indicator）
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('首通 +1 金色方块 · 破纪录再 +1 · 左滑翻章', m.contentCenterX, m.footerY);
        ctx.textAlign = 'left';

        // 入场弹窗
        if (this._entryDialog) {
            this._drawEntryDialog(ctx, W, H);
        }

        // Toast
        if (this._toastT > 0 && this._toast) {
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.font = '14px sans-serif';
            const tw = ctx.measureText(this._toast).width + 24;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(W / 2 - tw / 2, H - 70, tw, 34, 8);
            else ctx.rect(W / 2 - tw / 2, H - 70, tw, 34);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(this._toast, W / 2, H - 53);
            ctx.textAlign = 'left';
        }
    }

    _drawEntryDialog(ctx, W, H) {
        const d = this._entryDialog;
        const stage = d.stage;
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, W, H);

        const bw = Math.min(300, W * 0.82);
        const showAd = d.canAd === true;
        const bh = showAd ? 268 : 218;
        const bx = W / 2 - bw / 2;
        const by = H / 2 - bh / 2;
        d.panelRect = { x: bx, y: by, w: bw, h: bh };

        ctx.fillStyle = '#1c2440';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 14);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,87,0.5)';
        ctx.stroke();

        // 右上角关闭 ×
        const closeSize = 36;
        d.closeRect = {
            x: bx + bw - closeSize - 4,
            y: by + 4,
            w: closeSize,
            h: closeSize,
        };
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×', d.closeRect.x + closeSize / 2, d.closeRect.y + closeSize / 2);

        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('进入第 ' + stage.id + ' 关', W / 2, by + 40);
        ctx.fillStyle = SUBTITLE;
        ctx.font = '13px sans-serif';
        ctx.fillText(stage.name + ' · 入场 ' + d.fee + ' 币', W / 2, by + 66);

        const btnW = bw - 40;
        const btnH = 40;
        const payY = by + 96;
        d.payRect = { x: bx + 20, y: payY, w: btnW, h: btnH };
        d.adRect = null;
        d.cancelRect = null;

        ctx.fillStyle = '#f0a000';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(d.payRect.x, d.payRect.y, btnW, btnH, 10);
        else ctx.rect(d.payRect.x, d.payRect.y, btnW, btnH);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('花 ' + d.fee + ' 币入场', W / 2, payY + btnH / 2);

        let cancelY = by + 150;
        if (showAd) {
            const adY = by + 146;
            cancelY = by + 200;
            d.adRect = { x: bx + 20, y: adY, w: btnW, h: btnH };
            ctx.fillStyle = d.freeLeft > 0 ? '#3a7ab0' : '#444';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(d.adRect.x, d.adRect.y, btnW, btnH, 10);
            else ctx.rect(d.adRect.x, d.adRect.y, btnW, btnH);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(
                '看广告免费（剩 ' + d.freeLeft + ' 次）',
                W / 2,
                adY + btnH / 2
            );
        }

        d.cancelRect = { x: bx + 20, y: cancelY, w: btnW, h: btnH };
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(d.cancelRect.x, d.cancelRect.y, btnW, btnH, 10);
        else ctx.rect(d.cancelRect.x, d.cancelRect.y, btnW, btnH);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('取消', W / 2, cancelY + btnH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
}

module.exports = StageSelectScene;
