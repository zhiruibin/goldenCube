/**
 * StageSelectScene - 章内关卡选择（从世界地图点主题块进入）
 * 职责：展示当前章 10 关进度、入场费与挑战；未解锁章节可查看但不可进入。
 * 返回世界地图（sceneManager.back()）。不再左右滑翻章。
 */
const { fillNightBackground } = require('../theme/arcade-night');
const {
    drawThemeBackground,
    drawThemeButtonSkin,
    getThemeImage,
} = require('../theme/theme-images');
const goldenBlock = require('../../utils/golden-block-manager');
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
const CARD_GAP = 8;
const CARD_H = 74;
const CARD_ROW_GAP = 7;
const FINALE_PLAQUE_ASPECT = 512 / 167;

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
        this._scrollY = 0;
        this._scrollDrag = null;
    }

    onEnter(params) {
        this._params = params || {};
        this._toast = '';
        this._toastT = 0;
        this._animTime = 0;
        this._entryDialog = null;
        this._scrollY = 0;
        this._scrollDrag = null;
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
        if (this._params.toast) {
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
        // 前9关两列任务牌 + 第10关横跨两列的章节终点牌，共6行。
        const rows = stageCount === 10 ? 6 : Math.ceil(stageCount / COLS);
        const backSkin = getThemeImage('mapBtnBack');
        const skinW = (backSkin.ready && backSkin.img && backSkin.img.width) || 640;
        const skinH = (backSkin.ready && backSkin.img && backSkin.img.height) || 287;
        const backAspect = skinW / Math.max(1, skinH);
        const backBtnW = Math.min(188, Math.round(W * 0.48));
        const backBtnH = Math.max(44, Math.round(backBtnW / backAspect));
        // 底部奖励提示与返回按钮作为一组下移 30px，释放终点牌下方的视觉空间。
        const backBtnY = H - bottomInset - backBtnH - 6;
        const footerY = backBtnY - 22;
        const gridBottom = backBtnY - 28;
        const availGridH = Math.max(0, gridBottom - gridTop);

        const cardGap = CARD_GAP;
        const cardW = (contentW - (COLS - 1) * cardGap) / COLS;
        // 以任务牌素材的视觉比例反算高度，避免宽屏设备把牌匾重新拉成细条。
        const cardH = Math.max(CARD_H - 5, Math.min(95, Math.round(cardW / 1.95) - 5));
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
                const finale = stageList.length === 10 && i === 9;
                const col = i % COLS;
                const row = finale ? 5 : Math.floor(i / COLS);
                const offsetX = finale ? 4 : [-2, 2, 1, -2, -1, 2, 2, -1, 0][i];
                const offsetY = finale ? 0 : [0, 2, -1, 1, 2, -1, 1, -2, 0][i];
                const x = finale
                    ? m.contentLeft + offsetX
                    : m.contentLeft + col * (m.cardW + m.cardGap) + offsetX;
                // 各状态牌匾使用相同高度，以固定视觉间距紧凑排布。
                const rowPitch = m.cardH + CARD_ROW_GAP;
                const y = m.gridTop + row * rowPitch + offsetY;
                const w = finale ? m.contentW - 8 : m.cardW;
                const isCleared = goldenBlock.isCleared(stage.id);
                const isCurrent = goldenBlock.isUnlocked(stage.id) && !isCleared;
                const cardH = finale
                    ? Math.round(w / FINALE_PLAQUE_ASPECT)
                    : m.cardH - (isCurrent ? 10 : 0) - (isCleared ? 15 : 0);
                const tilt = this._getStableCardTilt(chap.id, stage.id, finale);
                cards.push({
                    stage,
                    x,
                    y,
                    w,
                    h: cardH,
                    finale,
                    tilt,
                    challengeBtn: null,
                });
                hitRects.push({ x, y, w, h: cardH, challengeBtn: null });
            });
            this._chapterCards.push(cards);
            this._chapterHitRects.push(hitRects);
        }
        this._focusCurrentStage();
    }

    /**
     * 根据章节与关卡生成稳定的伪随机角度。普通牌范围 ±5°；
     * 横跨两列的终点牌保持水平，强化终点层级并避免碰到边框。
     */
    _getStableCardTilt(chapterId, stageId, finale) {
        if (finale) return 0;
        const seed = Number(chapterId) * 97 + Number(stageId) * 131;
        const random01 = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
        const maxDeg = 5;
        const degrees = -maxDeg + random01 * maxDeg * 2;
        return degrees * Math.PI / 180;
    }

    _getScrollMax() {
        const m = this._getLayoutMetrics();
        const cards = (this._chapterCards && this._chapterCards[this._chapter]) || [];
        if (!cards.length) return 0;
        const contentBottom = Math.max.apply(null, cards.map((card) => card.y + card.h));
        const viewportBottom = m.backBtnY - 28;
        return Math.max(0, contentBottom - viewportBottom + 8);
    }

    _clampScroll(value) {
        return Math.max(0, Math.min(this._getScrollMax(), Number(value) || 0));
    }

    _focusCurrentStage() {
        const cards = (this._chapterCards && this._chapterCards[this._chapter]) || [];
        const current = cards.find((card) => goldenBlock.isUnlocked(card.stage.id)
            && !goldenBlock.isCleared(card.stage.id));
        if (!current) {
            this._scrollY = this._clampScroll(this._scrollY);
            return;
        }
        const m = this._getLayoutMetrics();
        const viewportH = m.backBtnY - 28 - m.gridTop;
        this._scrollY = this._clampScroll(current.y + current.h / 2 - m.gridTop - viewportH / 2);
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
        const m = this._getLayoutMetrics();
        if (y < m.gridTop || y > m.backBtnY - 28) return;
        const contentY = y + this._scrollY;
        // 已通关关卡上的「挑战」按钮优先命中
        for (let i = 0; i < cards.length; i++) {
            const r = cards[i];
            const cb = r.challengeBtn;
            if (!cb) continue;
            if (localX >= cb.x && localX <= cb.x + cb.w && contentY >= cb.y && contentY <= cb.y + cb.h) {
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
            if (localX >= r.x && localX <= r.x + r.w && contentY >= r.y && contentY <= r.y + r.h) {
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

    handleTouchStart(identifier, x, y) {
        if (this._entryDialog) {
            this._entryDialog.armed = true;
            return;
        }
        const m = this._getLayoutMetrics();
        if (y < m.gridTop || y > m.backBtnY - 28) return;
        this._scrollDrag = { id: identifier, startY: y, baseScroll: this._scrollY };
        this._suppressTap = false;
    }

    handleTouchMove(identifier, x, y) {
        if (!this._scrollDrag || this._scrollDrag.id !== identifier) return;
        const dy = y - this._scrollDrag.startY;
        if (Math.abs(dy) > 7) this._suppressTap = true;
        this._scrollY = this._clampScroll(this._scrollDrag.baseScroll - dy);
    }

    handleTouchEnd(identifier) {
        if (this._scrollDrag && this._scrollDrag.id === identifier) this._scrollDrag = null;
    }

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
        const cleared = goldenBlock.isCleared(stage.id);

        let styleKey = 'locked';
        if (chapterUnlocked && unlocked) {
            styleKey = cleared ? 'cleared' : 'unlocked';
        }
        const style = CARD_STYLES[styleKey];
        const localX = -w / 2;
        const localY = -h / 2;

        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(card.tilt || 0);

        // 当前任务牌保持呼吸暖光；终点牌使用独立的大型皮肤。
        if (styleKey === 'unlocked') {
            const breathe = .55 + Math.sin(this._animTime * 2.5) * .12;
            ctx.save();
            ctx.shadowColor = 'rgba(255,184,48,' + breathe.toFixed(2) + ')';
            ctx.shadowBlur = 12;
            ctx.fillStyle = 'rgba(180,105,28,.16)';
            roundRectPath(ctx, localX + 5, localY + 5, w - 10, h - 10, 9);
            ctx.fill();
            ctx.restore();
        }

        const chapter = this._chapters && this._chapters[this._chapter];
        const flowerChapter = !!(chapter && Number(chapter.id) === 3);
        const skin = card.finale
            ? (cleared
                ? (flowerChapter ? 'stagePlaqueFinaleFlowerCleared' : 'stagePlaqueFinaleCleared')
                : (flowerChapter ? 'stagePlaqueFinaleFlower' : 'stagePlaqueFinale'))
            : (styleKey === 'locked'
                ? 'stagePlaqueLocked'
                : (styleKey === 'cleared'
                    ? 'stagePlaqueClearedFloral'
                    : 'stagePlaqueCleared'));
        // 所有任务牌均按完整图片绘制。终点牌高度已按源图比例反算，
        // 无需九宫格；切片会把中央石板再次压成细条。
        const plateDrawn = drawThemeButtonSkin(ctx, skin, localX - 2, localY - 2, w + 4, h + 4);
        if (!plateDrawn) {
            ctx.fillStyle = style.fill;
            roundRectPath(ctx, localX, localY, w, h, 9); ctx.fill();
            ctx.strokeStyle = style.stroke; ctx.lineWidth = style.lineWidth; ctx.stroke();
        }

        const pad = card.finale ? 24 : 16;
        const numSize = card.finale ? Math.min(42, h * .48) : Math.min(30, h * .40);
        const infoTop = localY + (card.finale ? 16 : 13);
        ctx.fillStyle = styleKey === 'locked' ? '#D8C7AE' : '#FFE278';
        ctx.font = 'bold ' + Math.round(numSize) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(20,10,4,.9)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;
        if (card.finale) {
            // 终点横牌采用“30  花园圆心”单行布局，充分利用横向空间。
            ctx.textBaseline = 'middle';
            const rowY = 2;
            const finaleTextX = localX + pad + 40;
            ctx.fillText(String(stage.id), finaleTextX, rowY);
            const numberW = ctx.measureText(String(stage.id)).width;
            ctx.fillStyle = styleKey === 'locked' ? '#E5D7C2' : '#fff8e8';
            ctx.font = 'bold 18px sans-serif';
            const nameMaxW = w * .46;
            ctx.fillText(
                this._truncateText(ctx, stage.name, nameMaxW),
                finaleTextX + numberW + 13,
                rowY + 2
            );
        } else {
            ctx.fillText(String(stage.id), localX + pad, infoTop);
            // 编号与名称组成一个信息组；右侧约 40% 完整留给锁链和挂锁。
            const nameY = infoTop + numSize + 1;
            const nameMaxW = w * .52;
            ctx.fillStyle = styleKey === 'locked' ? '#E5D7C2' : '#fff8e8';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(this._truncateText(ctx, stage.name, nameMaxW), localX + pad, nameY);
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.font = (card.finale ? '12px' : '10px') + ' sans-serif';
        ctx.fillStyle = styleKey === 'locked' ? 'rgba(225,207,180,.54)' : style.status;
        ctx.textAlign = 'right';
        let status;
        if (!chapterUnlocked) {
            status = '章节未解锁';
        } else if (!unlocked) {
            status = '解锁 ' + (stage.unlockCost || 0) + ' 块';
        } else if (cleared) {
            status = best ? ('最佳 ' + best.lines + ' 行') : '已通关 · 辅助';
        } else {
            status = '目标 ' + (stage.minLines || 0) + ' 行';
        }
        // 锁定牌的锁链和挂锁已成为素材主体，不再塞入细小状态文字。
        if (styleKey !== 'locked') {
            // 已解锁木牌右侧有花叶和金属包角，文案向内收出足够安全距离。
            // 终点横牌的透明边缘和厚金属框更宽，需使用独立安全区，避免文案浮到上边框外。
            const statusRight = card.finale
                ? w / 2 - 52
                : w / 2 - (styleKey === 'unlocked' ? 22 : pad) - (styleKey === 'cleared' ? 10 : 0);
            const statusY = card.finale
                ? localY + 44
                : localY + (styleKey === 'unlocked' ? 16 : 14) + (styleKey === 'cleared' ? 5 : 0);
            ctx.fillText(status, statusRight, statusY);
        }

        if (styleKey === 'locked' && card.finale) {
            const lock = getThemeImage('stageFinaleLock');
            if (lock.ready && lock.img) {
                const lockH = Math.min(76, h * .82);
                const lockW = lockH * ((lock.img.width || 1) / Math.max(1, lock.img.height || 1));
                ctx.drawImage(lock.img, w / 2 - lockW - 16, -lockH / 2 + 3, lockW, lockH);
            }
        }
        // 已解锁态只保留文字信息，避免装饰图标挤压木牌的有效内容区。
        ctx.restore();
    }

    _drawMissionWall(ctx, m) {
        const top = m.gridTop - 8;
        const bottom = m.backBtnY - 24;
        ctx.save();
        const beam = (x, y, w, h) => {
            const g = ctx.createLinearGradient(x, y, x + w, y);
            g.addColorStop(0, 'rgba(49,25,12,.82)');
            g.addColorStop(.45, 'rgba(119,69,31,.78)');
            g.addColorStop(1, 'rgba(42,22,11,.84)');
            ctx.fillStyle = g; roundRectPath(ctx, x, y, w, h, 5); ctx.fill();
            ctx.strokeStyle = 'rgba(206,133,61,.25)'; ctx.lineWidth = 1; ctx.stroke();
        };
        beam(m.contentLeft - 7, top, 12, bottom - top);
        beam(m.contentRight - 5, top, 12, bottom - top);
        beam(m.contentCenterX - 5, top + 3, 10, bottom - top - 6);
        beam(m.contentLeft - 6, top, m.contentW + 12, 11);
        ctx.restore();
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

            this._drawMissionWall(ctx, m);
            ctx.save();
            ctx.beginPath();
            ctx.rect(m.contentLeft - 10, m.gridTop - 3, m.contentW + 20, m.backBtnY - 25 - m.gridTop);
            ctx.clip();
            for (let i = 0; i < cards.length; i++) {
                const card = Object.assign({}, cards[i], { y: cards[i].y - this._scrollY });
                if (card.y + card.h >= m.gridTop - 6 && card.y <= m.backBtnY - 22) {
                    this._drawCard(ctx, card, pageX, unlocked);
                }
            }
            ctx.restore();

            if (this._getScrollMax() > 0) {
                const trackY = m.gridTop + 6;
                const trackH = m.backBtnY - 40 - trackY;
                const thumbH = Math.max(28, trackH * Math.min(1, trackH / (trackH + this._getScrollMax())));
                const thumbY = trackY + (trackH - thumbH) * (this._scrollY / this._getScrollMax());
                ctx.fillStyle = 'rgba(255,224,150,.28)';
                roundRectPath(ctx, m.contentRight + 6, thumbY, 3, thumbH, 1.5); ctx.fill();
            }
        }

        const balance = goldenBlock.getBalance();
        ctx.fillStyle = MINE_ACCENT;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('◆ 金方块 ' + balance, m.balanceX, m.balanceY);

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
