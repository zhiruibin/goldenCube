/**
 * PlazaScene - 关卡广场（首页主入口之一）
 * 浏览/解锁/开打他人发布的 UGC 关卡；与工坊「造关」分离。
 */
const { Button } = require('../widgets/button');
const {
    fillNightBackground,
    drawBrandTitle,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const workshop = require('../../utils/workshop-manager');
const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');

const PLAZA_SORT = [
    { id: 'new', label: '新关' },
    { id: 'heat', label: '热门' },
    { id: 'clearRate', label: '好通关' },
];

class PlazaScene {
    constructor() {
        this._plazaSort = 'new';
        this._buttons = [];
        this._listRects = [];
        this._toast = '';
        this._toastUntil = 0;
        this._confirm = null;
        this._playDialog = null;
        this._scrollY = 0;
    }

    onEnter(params) {
        const p = params || {};
        if (p.plazaSort) this._plazaSort = p.plazaSort;
        if (p.toast) this._showToast(p.toast);
        this._confirm = null;
        this._playDialog = null;
        this._scrollY = 0;
        this._rebuild();
    }

    onExit() {
        this._buttons = [];
        this._listRects = [];
    }

    onResume() {
        this._rebuild();
    }

    update() {
        if (this._toast && Date.now() > this._toastUntil) this._toast = '';
    }

    _showToast(msg) {
        this._toast = msg || '';
        this._toastUntil = Date.now() + 2200;
    }

    _getTopInset() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;
        let capsuleBottom = Math.max(statusBarHeight, safeTop) + 32;
        try {
            if (typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect) {
                const rect = wx.getMenuButtonBoundingClientRect();
                if (rect && rect.height > 0) capsuleBottom = rect.bottom;
            }
        } catch (e) { /* ignore */ }
        return Math.max(statusBarHeight, safeTop, capsuleBottom) + 12;
    }

    _rebuild() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const top = this._getTopInset();
        const side = 14;
        const gap = 10;
        this._buttons = [];

        const titleY = top + 6;
        const metaY = titleY + 34;
        const tabY = metaY + 28;

        const sw = (W - side * 2 - gap * 2) / 3;
        PLAZA_SORT.forEach((t, i) => {
            this._buttons.push(new Button({
                x: side + i * (sw + gap),
                y: tabY,
                w: sw,
                h: 42,
                text: t.label,
                color: this._plazaSort === t.id ? '#e09a30' : '#444',
                onClick: () => {
                    this._plazaSort = t.id;
                    this._scrollY = 0;
                    this._plazaItems = [];
                    this._rebuild();
                },
            }));
        });

        const bottomH = 48;
        const bottomY = H - bottomH - 18;
        this._buttons.push(new Button({
            x: side,
            y: bottomY,
            w: W - side * 2,
            h: bottomH,
            text: '返回首页',
            color: '#555',
            onClick: () => GameGlobal.game.sceneManager.back(),
        }));

        this._titleY = titleY;
        this._metaY = metaY;
        this._listTop = tabY + 42 + 16;
        this._listBottom = bottomY - 12;
        this._plazaItems = this._plazaItems || [];
        this._buildListRects();
        this._loadPlaza();
    }

    _loadPlaza() {
        const sort = this._plazaSort;
        Promise.resolve(workshop.listPlaza(sort)).then((items) => {
            if (this._plazaSort !== sort) return;
            this._plazaItems = Array.isArray(items) ? items : [];
            this._buildListRects();
        });
    }

    _buildListRects() {
        this._listRects = [];
        const W = GameGlobal.game.width;
        const items = this._plazaItems || [];
        const rowH = 72;
        items.forEach((stage, i) => {
            this._listRects.push({
                stage,
                x: 12,
                y: this._listTop + i * (rowH + 8) - this._scrollY,
                w: W - 24,
                h: rowH,
            });
        });
        this._listContentH = items.length * (rowH + 8);
    }

    _tryPlayPlaza(stage) {
        if (!workshop.isPlazaUnlocked(stage.stageId)) {
            this._confirm = {
                title: '解锁关卡',
                body: '消耗 ' + workshop.PLAZA_UNLOCK_GOLD + ' 金方块永久解锁？',
                onOk: () => {
                    const r = workshop.unlockPlazaStage(stage.stageId);
                    this._confirm = null;
                    if (!r.ok) {
                        this._showToast('金方块不足');
                        return;
                    }
                    this._showToast('已解锁');
                    this._openPlayDialog(stage);
                    this._rebuild();
                },
            };
            return;
        }
        this._openPlayDialog(stage);
    }

    _openPlayDialog(stage) {
        const fee = workshop.getPlayFee(stage);
        this._playDialog = {
            stage,
            fee,
            freeLeft: workshop.getFreePlayRemaining(),
            canAd: isRewardedVideoConfigured() === true,
        };
    }

    _startPlazaGame(stage, opts) {
        const o = opts || {};
        workshop.recordPlayStart(stage.stageId);
        GameGlobal.game.sceneManager.switchTo('game', {
            mode: 'stage',
            workshop: true,
            workshopStageId: stage.stageId,
            workshopRows: workshop.cloneRows(stage.rows),
            workshopTitle: stage.title,
            authorTrial: false,
            workshopReturnTo: 'list',
            workshopListParams: {
                origin: 'plaza',
                plazaSort: this._plazaSort,
            },
            entryPaid: o.entryPaid || 0,
            dropIntervalMs: stage.dropIntervalMs || 1000,
        });
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);

        const top = this._getTopInset();
        const titleY = this._titleY != null ? this._titleY : top + 6;
        const metaY = this._metaY != null ? this._metaY : titleY + 34;
        drawBrandTitle(ctx, '关卡广场', W / 2, titleY, 'bold 28px sans-serif');

        ctx.fillStyle = SUBTITLE;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            '金' + goldenBlock.getBalance()
            + ' · 币' + coinManager.getCoins()
            + ' · 今日免费 ' + workshop.getFreePlayRemaining(),
            W / 2,
            metaY
        );

        for (const btn of this._buttons) btn.render(ctx);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, this._listTop, W, this._listBottom - this._listTop);
        ctx.clip();

        if (this._listRects.length === 0) {
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('广场暂无发布关卡', W / 2, (this._listTop + this._listBottom) / 2);
        }

        this._listRects.forEach((item) => {
            if (item.y + item.h < this._listTop || item.y > this._listBottom) return;
            this._drawRow(ctx, item);
        });
        ctx.restore();

        if (this._confirm) this._drawConfirm(ctx);
        if (this._playDialog) this._drawPlayDialog(ctx);

        if (this._toast) {
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            const tw = Math.min(W * 0.8, 280);
            ctx.fillRect(W / 2 - tw / 2, H * 0.42, tw, 40);
            ctx.fillStyle = '#fff';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._toast, W / 2, H * 0.42 + 20);
        }
    }

    _drawRow(ctx, item) {
        const { stage, x, y, w, h } = item;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        this._round(ctx, x, y, w, h, 10);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(stage.title || '未命名', x + 12, y + 22);

        const unlocked = workshop.isPlazaUnlocked(stage.stageId);
        let sub = '垃圾 ' + (stage.garbageCount || 0)
            + ' · 行 ' + (stage.minLines || 0);
        sub += unlocked ? ' · 已解锁' : ' · 需1金解锁';
        sub += ' · 通关' + ((stage.stats && stage.stats.clearCount) || 0);
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.fillText(sub, x + 12, y + 48);

        this._drawMiniBoard(ctx, stage.rows, x + w - 56, y + 10, 4);
    }

    _drawMiniBoard(ctx, rows, ox, oy, cell) {
        const r = workshop.cloneRows(rows);
        for (let y = 10; y < 20; y++) {
            const line = r[String(y)];
            for (let x = 0; x < 10; x++) {
                if (line[x] === '#') {
                    ctx.fillStyle = '#c9a227';
                    ctx.fillRect(ox + x * cell, oy + (y - 10) * cell, cell - 0.5, cell - 0.5);
                }
            }
        }
    }

    _drawConfirm(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const c = this._confirm;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        const bw = Math.min(300, W * 0.82);
        const bh = 180;
        const px = (W - bw) / 2;
        const py = (H - bh) / 2;
        ctx.fillStyle = '#2a2a32';
        this._round(ctx, px, py, bw, bh, 12);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.title, W / 2, py + 36);
        ctx.fillStyle = SUBTITLE;
        ctx.font = '13px sans-serif';
        const lines = String(c.body || '').split('\n');
        lines.forEach((ln, i) => ctx.fillText(ln, W / 2, py + 70 + i * 20));
        const btnW = (bw - 36) / 2;
        const by = py + bh - 56;
        ctx.fillStyle = '#555';
        this._round(ctx, px + 12, by, btnW, 40, 8);
        ctx.fill();
        ctx.fillStyle = '#e09a30';
        this._round(ctx, px + 24 + btnW, by, btnW, 40, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('取消', px + 12 + btnW / 2, by + 20);
        ctx.fillText('确定', px + 24 + btnW + btnW / 2, by + 20);
        this._confirmRects = {
            cancel: { x: px + 12, y: by, w: btnW, h: 40 },
            ok: { x: px + 24 + btnW, y: by, w: btnW, h: 40 },
        };
    }

    _drawPlayDialog(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const d = this._playDialog;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        const bw = Math.min(300, W * 0.82);
        const bh = d.canAd ? 220 : 180;
        const px = (W - bw) / 2;
        const py = (H - bh) / 2;
        ctx.fillStyle = '#2a2a32';
        this._round(ctx, px, py, bw, bh, 12);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.stage.title, W / 2, py + 36);
        ctx.fillStyle = SUBTITLE;
        ctx.font = '13px sans-serif';
        ctx.fillText('开打消耗 ' + d.fee + ' 金币（失败退 50%）', W / 2, py + 68);

        const btnW = bw - 40;
        let by = py + 100;
        ctx.fillStyle = '#e09a30';
        this._round(ctx, px + 20, by, btnW, 40, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('支付开打', W / 2, by + 20);
        this._playRects = {
            pay: { x: px + 20, y: by, w: btnW, h: 40 },
        };
        if (d.canAd) {
            by += 52;
            ctx.fillStyle = '#3a7ab0';
            this._round(ctx, px + 20, by, btnW, 40, 8);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText('看广告免费（余' + d.freeLeft + '）', W / 2, by + 20);
            this._playRects.ad = { x: px + 20, y: by, w: btnW, h: 40 };
        }
        this._playRects.cancel = { x: px + 20, y: py + bh - 44, w: btnW, h: 32 };
        ctx.fillStyle = MUTED;
        ctx.font = '13px sans-serif';
        ctx.fillText('取消', W / 2, py + bh - 28);
    }

    _round(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    _hit(x, y, r) {
        return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    onTouchStart(x, y) {
        this._touchStartY = y;
        this._touchMoved = false;
        this._lastMoveY = y;
    }

    onTouchMove(x, y) {
        if (this._confirm || this._playDialog) return;
        const prev = this._lastMoveY != null ? this._lastMoveY : y;
        const dy = prev - y;
        if (Math.abs(dy) > 2) this._touchMoved = true;
        const maxScroll = Math.max(0, (this._listContentH || 0) - Math.max(1, this._listBottom - this._listTop));
        this._scrollY = Math.max(0, Math.min(maxScroll, (this._scrollY || 0) + dy));
        this._lastMoveY = y;
        this._buildListRects();
    }

    handleTouchStart(identifier, x, y) {
        this.onTouchStart(x, y);
    }

    handleTouchMove(identifier, x, y) {
        this.onTouchMove(x, y);
    }

    handleTouchEnd() {
        this._lastMoveY = null;
    }

    handleTap(x, y) {
        this.onTouchEnd(x, y);
    }

    onTouchEnd(x, y) {
        this._lastMoveY = null;
        if (this._confirm) {
            if (this._hit(x, y, this._confirmRects && this._confirmRects.ok)) {
                if (this._confirm.onOk) this._confirm.onOk();
                return;
            }
            if (this._hit(x, y, this._confirmRects && this._confirmRects.cancel)) {
                this._confirm = null;
                return;
            }
            return;
        }
        if (this._playDialog) {
            const d = this._playDialog;
            const r = this._playRects || {};
            if (this._hit(x, y, r.cancel)) {
                this._playDialog = null;
                return;
            }
            if (this._hit(x, y, r.pay)) {
                const paid = workshop.spendPlayFee(d.stage.stageId);
                if (!paid.ok) {
                    this._showToast('金币不足（需 ' + d.fee + '）');
                    return;
                }
                this._playDialog = null;
                this._startPlazaGame(d.stage, { entryPaid: paid.paid });
                return;
            }
            if (this._hit(x, y, r.ad)) {
                if (d.freeLeft <= 0) {
                    this._showToast('今日免费开打已用完');
                    return;
                }
                adManager.showRewardedVideo()
                    .then(() => {
                        if (!workshop.consumeFreePlay()) {
                            this._showToast('今日免费开打已用完');
                            return;
                        }
                        this._playDialog = null;
                        this._startPlazaGame(d.stage, { entryPaid: 0 });
                    })
                    .catch(() => this._showToast('需完整观看广告'));
                return;
            }
            return;
        }

        if (this._touchMoved) {
            this._touchMoved = false;
            return;
        }

        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }

        if (y >= this._listTop && y <= this._listBottom) {
            for (let i = 0; i < this._listRects.length; i++) {
                const item = this._listRects[i];
                if (this._hit(x, y, item)) {
                    this._tryPlayPlaza(item.stage);
                    return;
                }
            }
        }
    }
}

module.exports = PlazaScene;
