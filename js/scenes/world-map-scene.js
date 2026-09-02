/**
 * WorldMapScene - 闯关世界层
 * 可拖的格槽棋盘，十章垃圾块散落其上；点块进入该章 2×5 关卡卡。
 */

const {
    fillNightBackground,
    ACCENT,
    TITLE,
    TITLE_GLOW,
} = require('../theme/arcade-night');
const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { Button } = require('../widgets/button');
const { WORLD_MAP, STAGE_SELECT } = require('../../utils/stage-nav');
const fx = require('../render/world-map-fx');
const { LIST_FRAME_INTERVAL } = require('../runtime/frame-budget');

function chapterState(ch) {
    if (!goldenBlock.isChapterUnlocked(ch.id)) return 'locked';
    const stages = goldenBlock.getStagesByChapter(ch.id);
    if (stages.length && stages.every((s) => goldenBlock.isCleared(s.id))) return 'cleared';
    return 'current';
}

class WorldMapScene {
    constructor() {
        this._params = null;
        this._nodes = [];
        this._decors = [];
        this._layout = null;
        this._originY = 0;
        this._vel = 0;
        this._drag = null;
        this._suppressTap = false;
        this._backButton = null;
        this._metrics = null;
    }

    onEnter(params) {
        this._params = params || {};
        if (typeof goldenBlock.syncUnlockedFromProgress === 'function') {
            goldenBlock.syncUnlockedFromProgress();
        }
        this._layoutBoard();
        if (typeof this._params.originY === 'number' && Number.isFinite(this._params.originY)) {
            this._originY = this._clampOrigin(this._params.originY);
        } else {
            this._originY = this._cameraOnProgress();
        }
        this._vel = 0;
        this._drag = null;
        this._suppressTap = false;
    }

    onExit() {
        this._params = this._params || {};
        this._params.originY = this._originY;
    }

    onPause() {}

    onResume() {}

    getRenderInterval() {
        return LIST_FRAME_INTERVAL;
    }

    _requestRender() {
        try {
            if (GameGlobal && GameGlobal.game) GameGlobal.game._forceRender = true;
        } catch (e) { /* ignore */ }
    }

    _buildNodes() {
        const chapters = goldenBlock.getChapters() || [];
        this._nodes = chapters.map((ch, i) => {
            const pos = fx.layoutChapterNode(i, this._layout ? this._layout.bottomPad : 0);
            return {
                id: ch.id,
                name: ch.name,
                col: pos.col,
                row: pos.row,
                state: chapterState(ch),
            };
        });
        const rowCount = this._layout
            ? this._layout.rows
            : fx.boardRowsForCount(this._nodes.length);
        this._decors = fx.buildDecors(this._nodes, rowCount);
    }

    _getMetrics() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const safe = sys.safeArea || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = Number(safe.top) || 0;
        let capsuleTop = statusBarHeight || safeTop || 20;
        let capsuleBottom = capsuleTop + 32;
        try {
            const rect = wx.getMenuButtonBoundingClientRect();
            if (rect && rect.height > 0) {
                capsuleTop = rect.top;
                capsuleBottom = rect.bottom;
            }
        } catch (e) { /* 非微信环境忽略 */ }
        const balanceY = capsuleTop + (capsuleBottom - capsuleTop) / 2;
        const headerTop = Math.max(statusBarHeight, safeTop, capsuleBottom) + 8;
        const bottomInset = (safe.bottom && H > safe.bottom) ? (H - safe.bottom) : 0;
        const backH = 48;
        const backY = H - bottomInset - 80;
        const contentBottom = backY - 10;
        const boardBottom = H;
        const titleSize = 22;
        const subSize = 13;
        const titleY = headerTop + 12;
        const subtitleY = titleY + titleSize / 2 + 10 + subSize / 2;
        const boardTop = subtitleY + subSize / 2 + 8;
        return {
            W,
            H,
            balanceY,
            headerTop,
            titleY,
            subtitleY,
            titleSize,
            subSize,
            boardTop,
            boardBottom,
            contentBottom,
            visH: H,
            backY,
            backH,
            bottomInset,
        };
    }

    _layoutBoard() {
        const m = this._getMetrics();
        this._metrics = m;
        this._layout = fx.makeLayout(m.W, m.H, goldenBlock.getChapters().length, m.contentBottom);
        this._buildNodes();
        this._originY = this._clampOrigin(this._originY);
        this._initBackButton();
    }

    _initBackButton() {
        const m = this._metrics || this._getMetrics();
        const btnW = Math.min(260, m.W * 0.7);
        this._backButton = new Button({
            x: m.W / 2 - btnW / 2,
            y: m.backY,
            w: btnW,
            h: m.backH,
            text: '← 返回',
            color: '#555',
            onClick: () => GameGlobal.game.sceneManager.back(),
        });
    }

    _clampOrigin(y) {
        if (!this._layout || !this._metrics) return 0;
        return Math.max(0, Math.min(fx.maxOrigin(this._layout, this._metrics.visH), y));
    }

    _cameraOnProgress() {
        const idx = typeof goldenBlock.getProgressChapterIndex === 'function'
            ? goldenBlock.getProgressChapterIndex()
            : 0;
        const node = this._nodes[idx] || this._nodes[0];
        if (!node || !this._layout || !this._metrics) return 0;
        return fx.cameraOriginForNode(this._layout, node, this._metrics.visH);
    }

    _persistOrigin() {
        this._params = this._params || {};
        this._params.originY = this._originY;
    }

    handleTouchStart(identifier, x, y) {
        if (this._backButton && this._backButton.hitTest(x, y)) {
            this._drag = null;
            return;
        }
        this._drag = {
            id: identifier,
            y,
            origin: this._originY,
            lastY: y,
            lastT: Date.now(),
        };
        this._vel = 0;
        this._suppressTap = false;
    }

    handleTouchMove(identifier, x, y) {
        if (!this._drag || this._drag.id !== identifier) return;
        const dy = y - this._drag.y;
        if (Math.abs(dy) > 8) this._suppressTap = true;
        this._originY = this._clampOrigin(this._drag.origin + dy);
        const now = Date.now();
        const dt = Math.max(8, now - this._drag.lastT);
        const instant = ((y - this._drag.lastY) / dt) * 1000;
        this._vel = this._vel * 0.55 + instant * 0.45;
        this._drag.lastY = y;
        this._drag.lastT = now;
        this._persistOrigin();
        this._requestRender();
    }

    handleTouchEnd(identifier) {
        if (!this._drag) return;
        if (identifier !== this._drag.id && identifier !== -1) return;
        this._drag = null;
        if (Math.abs(this._vel) < 80) this._vel = 0;
    }

    handleTap(x, y) {
        if (this._suppressTap) {
            this._suppressTap = false;
            return;
        }
        if (this._backButton && this._backButton.hitTest(x, y)) {
            this._backButton.trigger();
            return;
        }
        const chapterId = this._hitChapterAt(x, y);
        if (chapterId != null) this._openChapter(chapterId);
    }

    _hitChapterAt(x, y) {
        if (!this._layout || !this._nodes.length) return null;
        const hits = this._nodes.map((n) => ({
            node: n,
            rect: fx.cubeHitRect(this._layout, n, this._originY),
        }));
        hits.sort((a, b) => a.node.row - b.node.row);
        for (let i = 0; i < hits.length; i++) {
            const r = hits[i].rect;
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                return hits[i].node.id;
            }
        }
        return null;
    }

    _openChapter(chapterId) {
        this._persistOrigin();
        GameGlobal.game.sceneManager.switchTo(STAGE_SELECT, { chapterId });
    }

    update(dt) {
        if (this._drag || !this._layout) return;
        if (Math.abs(this._vel) < 12) {
            this._vel = 0;
            return;
        }
        this._originY = this._clampOrigin(this._originY + this._vel * dt);
        this._vel *= Math.pow(0.92, Math.max(0.5, dt * 60));
        if (this._originY <= 0 || this._originY >= fx.maxOrigin(this._layout, this._metrics.visH)) {
            this._vel = 0;
        }
        this._persistOrigin();
    }

    render(ctx) {
        try {
            this._renderMap(ctx);
        } catch (e) {
            console.error('[WorldMap] render 失败', e);
            const W = GameGlobal.game.width;
            const H = GameGlobal.game.height;
            fillNightBackground(ctx, W, H);
            ctx.fillStyle = TITLE;
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('闯关地图', W / 2, H * 0.2);
            if (this._backButton) this._backButton.render(ctx);
        }
    }

    _renderMap(ctx) {
        const m = this._metrics || this._getMetrics();
        const W = m.W;
        const H = m.H;
        fillNightBackground(ctx, W, H);
        if (!this._layout) return;

        const originY = this._originY;
        const range = fx.visibleRowRange(this._layout, originY, m.H);
        fx.drawTiles(ctx, this._layout, originY, range.visTop, range.visBot);
        fx.drawDecors(ctx, this._layout, this._decors, originY, range.visTop, range.visBot);

        const order = this._nodes.slice().sort((a, b) => b.row - a.row);
        for (let i = 0; i < order.length; i++) {
            const node = order[i];
            if (node.row < range.visTop - 3 || node.row > range.visBot + 3) continue;
            fx.drawCube(ctx, this._layout, node, originY, Date.now());
        }

        const fadeH = m.boardTop + 8;
        try {
            const g = ctx.createLinearGradient(0, 0, 0, fadeH);
            if (g && g.addColorStop) {
                g.addColorStop(0, 'rgba(18, 24, 44, 0.92)');
                g.addColorStop(1, 'rgba(18, 24, 44, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, fadeH);
            }
        } catch (e) { /* ignore */ }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + m.titleSize + 'px sans-serif';
        ctx.fillStyle = TITLE_GLOW;
        ctx.fillText('闯关地图', 16 + 1, m.titleY + 2);
        ctx.fillStyle = TITLE;
        ctx.fillText('闯关地图', 16, m.titleY);

        const balance = goldenBlock.getBalance();
        const coins = coinManager.getCoins();
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('◆ ' + balance + '  ·  币 ' + coins, 16, m.balanceY);

        ctx.fillStyle = ACCENT;
        ctx.font = 'bold ' + m.subSize + 'px sans-serif';
        ctx.fillText('上拖查看更多主题', 16, m.subtitleY);

        if (this._backButton) this._backButton.render(ctx);

        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('点击主题块进入该章', W / 2, m.backY - 18);
        ctx.textAlign = 'left';
    }
}

WorldMapScene.SCENE_NAME = WORLD_MAP;

module.exports = WorldMapScene;
