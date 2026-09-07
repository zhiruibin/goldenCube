/**
 * WorldMapScene - 闯关世界层（效果图贴图还原）
 */

const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { Button } = require('../widgets/button');
const { WORLD_MAP, STAGE_SELECT } = require('../../utils/stage-nav');
const fx = require('../render/world-map-fx');
const { LIST_FRAME_INTERVAL } = require('../runtime/frame-budget');
const {
    drawThemeTiledBackground,
    drawThemeImageContain,
    getThemeImage,
} = require('../theme/theme-images');
const IconRenderer = require('../render/icon-renderer');
const { renderCenterToast } = require('../../utils/stage-entry-ui');

function chapterState(ch) {
    if (!goldenBlock.isChapterUnlocked(ch.id)) return 'locked';
    const stages = goldenBlock.getStagesByChapter(ch.id);
    if (stages.length && stages.every((s) => goldenBlock.isCleared(s.id))) return 'cleared';
    return 'unlocked';
}

class WorldMapScene {
    constructor() {
        this._params = null;
        this._nodes = [];
        this._decors = [];
        this._pathCells = [];
        this._layout = null;
        this._originY = 0;
        this._vel = 0;
        this._drag = null;
        this._suppressTap = false;
        this._backButton = null;
        this._metrics = null;
        this._toast = '';
        this._toastT = 0;
    }

    onEnter(params) {
        this._params = params || {};
        this._toast = '';
        this._toastT = 0;
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
        const progressIdx = typeof goldenBlock.getProgressChapterIndex === 'function'
            ? goldenBlock.getProgressChapterIndex()
            : 0;
        this._nodes = chapters.map((ch, i) => {
            const pos = fx.layoutChapterNode(i, this._layout ? this._layout.bottomPad : 0);
            return {
                id: ch.id,
                name: ch.name,
                index: i,
                col: pos.col,
                row: pos.row,
                state: chapterState(ch),
                isProgress: i === progressIdx,
            };
        });
        const rowCount = this._layout
            ? this._layout.rows
            : fx.boardRowsForCount(this._nodes.length);
        this._decors = fx.buildDecors(this._nodes, rowCount);
        this._pathCells = fx.buildPathCells(this._nodes);
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
        } catch (e) { /* ignore */ }
        const headerTop = Math.max(statusBarHeight, safeTop, capsuleBottom) + 4;
        const bottomInset = (safe.bottom && H > safe.bottom) ? (H - safe.bottom) : 0;
        // 返回钮按贴图比例，避免横向拉扁变形
        const backSkin = getThemeImage('mapBtnBack');
        const skinW = (backSkin.ready && backSkin.img && backSkin.img.width) || 640;
        const skinH = (backSkin.ready && backSkin.img && backSkin.img.height) || 287;
        const backAspect = skinW / Math.max(1, skinH);
        const backW = Math.min(188, Math.round(W * 0.48));
        const backH = Math.max(44, Math.round(backW / backAspect));
        const backY = H - bottomInset - backH - 36;
        const contentBottom = backY - 8;
        const plaqueMaxH = Math.min(H * 0.1, 72);
        const titleY = headerTop + plaqueMaxH * 0.48;
        const balanceY = headerTop + plaqueMaxH + 18;
        const boardTop = balanceY + 26;
        return {
            W,
            H,
            balanceY,
            headerTop,
            titleY,
            plaqueMaxH,
            boardTop,
            boardBottom: H,
            contentBottom,
            visH: H,
            backY,
            backW,
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
        this._backButton = new Button({
            x: m.W / 2 - m.backW / 2,
            y: m.backY,
            w: m.backW,
            h: m.backH,
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
        if (!goldenBlock.isChapterUnlocked(chapterId)) {
            this._showToast('通关上一章全部关卡后解锁');
            return;
        }
        this._persistOrigin();
        GameGlobal.game.sceneManager.switchTo(STAGE_SELECT, { chapterId });
    }

    _showToast(msg) {
        this._toast = msg || '';
        this._toastT = 1.6;
        this._requestRender();
    }

    update(dt) {
        if (this._toastT > 0) {
            this._toastT -= dt;
            if (this._toastT < 0) this._toastT = 0;
            this._requestRender();
        }
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

    _fillWarmFallback(ctx, W, H) {
        try {
            const g = ctx.createLinearGradient(0, 0, 0, H);
            if (g && g.addColorStop) {
                g.addColorStop(0, '#3a2a1c');
                g.addColorStop(0.45, '#2a1e14');
                g.addColorStop(1, '#1a120c');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
                return;
            }
        } catch (e) { /* ignore */ }
        ctx.fillStyle = '#2a1e14';
        ctx.fillRect(0, 0, W, H);
    }

    /**
     * 矿坑氛围底：纵向无缝平铺，与章节层同向滚动。
     */
    _drawScrollingGround(ctx, W, H, originY) {
        const entry = getThemeImage('mapMineBg');
        if (entry.ready && entry.img) {
            const img = entry.img;
            const scale = Math.max(W / (img.width || 1), 1);
            const dw = Math.ceil((img.width || W) * scale);
            // 多画 2px 重叠，避免平铺接缝露底
            const dh = Math.ceil((img.height || H) * scale);
            const dx = (W - dw) / 2;
            const period = Math.max(1, dh - 2);
            const scroll = (((originY % period) + period) % period);
            let y0 = scroll - period;
            while (y0 < H) {
                ctx.drawImage(img, dx, y0, dw, dh);
                y0 += period;
            }
            ctx.fillStyle = 'rgba(12, 8, 5, 0.18)';
            ctx.fillRect(0, 0, W, H);
            return;
        }
        const tile = Math.round(Math.min(W, H) * 0.38);
        const period = Math.max(1, tile - 1);
        const offset = ((originY % period) + period) % period;
        if (!drawThemeTiledBackground(ctx, 'mapGroundTile', 0, offset - period, W, H + period * 2, tile)) {
            this._fillWarmFallback(ctx, W, H);
        } else {
            ctx.fillStyle = 'rgba(18, 12, 8, 0.28)';
            ctx.fillRect(0, 0, W, H);
        }
    }

    _drawResourcePill(ctx, x, y, w, h, icon, text) {
        ctx.save();
        ctx.fillStyle = 'rgba(36, 24, 14, 0.86)';
        ctx.strokeStyle = 'rgba(140, 105, 60, 0.55)';
        ctx.lineWidth = 1.2;
        const r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arc(x + w - r, y + h / 2, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r, y + h);
        ctx.arc(x + r, y + h / 2, r, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        IconRenderer.draw(ctx, icon, x + 14, y + h / 2, 14, '#FFC857');
        ctx.fillStyle = '#f5e6c8';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 26, y + h / 2 + 0.5);
        ctx.restore();
    }

    render(ctx) {
        try {
            this._renderMap(ctx);
        } catch (e) {
            console.error('[WorldMap] render 失败', e);
            const W = GameGlobal.game.width;
            const H = GameGlobal.game.height;
            this._fillWarmFallback(ctx, W, H);
            ctx.fillStyle = '#FFC857';
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
        const originY = this._originY;

        this._drawScrollingGround(ctx, W, H, originY);
        if (!this._layout) return;

        const range = fx.visibleRowRange(this._layout, originY, m.H);
        fx.drawPath(ctx, this._layout, this._pathCells, originY, range.visTop, range.visBot);
        fx.drawDecors(ctx, this._layout, this._decors, originY, range.visTop, range.visBot);

        const order = this._nodes.slice().sort((a, b) => b.row - a.row);
        for (let i = 0; i < order.length; i++) {
            const node = order[i];
            if (node.row < range.visTop - 3 || node.row > range.visBot + 3) continue;
            fx.drawCube(ctx, this._layout, node, originY, Date.now());
        }

        // 顶区压暗，保证标题可读
        const fadeH = m.boardTop + 8;
        try {
            const g = ctx.createLinearGradient(0, 0, 0, fadeH);
            if (g && g.addColorStop) {
                g.addColorStop(0, 'rgba(22, 14, 8, 0.72)');
                g.addColorStop(0.6, 'rgba(22, 14, 8, 0.28)');
                g.addColorStop(1, 'rgba(22, 14, 8, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, fadeH);
            }
        } catch (e) { /* ignore */ }

        // 效果图标题牌（字已烧在图上）
        const plaque = drawThemeImageContain(
            ctx,
            'mapTitlePlaque',
            W / 2,
            m.titleY,
            Math.min(W * 0.78, 300),
            m.plaqueMaxH
        );
        if (!plaque.drawn) {
            ctx.save();
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFC857';
            ctx.fillText('闯关地图', W / 2, m.titleY);
            ctx.restore();
        }

        const balance = goldenBlock.getBalance();
        const coins = coinManager.getCoins();
        const pillH = 26;
        const pillY = m.balanceY - pillH / 2;
        const leftText = String(balance);
        const rightText = String(coins);
        const leftW = Math.max(88, 36 + leftText.length * 9);
        const rightW = Math.max(88, 36 + rightText.length * 9);
        this._drawResourcePill(ctx, 16, pillY, leftW, pillH, 'brick', leftText);
        this._drawResourcePill(ctx, 16 + leftW + 10, pillY, rightW, pillH, 'coin', rightText);

        if (this._backButton) this._backButton.render(ctx);

        ctx.save();
        ctx.fillStyle = 'rgba(245, 230, 200, 0.72)';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↑  上拖查看更多主题', W / 2, m.backY + m.backH + 16);
        ctx.restore();

        if (this._toastT > 0 && this._toast) {
            renderCenterToast(ctx, W, H, this._toast);
        }
    }
}

WorldMapScene.SCENE_NAME = WORLD_MAP;

module.exports = WorldMapScene;
