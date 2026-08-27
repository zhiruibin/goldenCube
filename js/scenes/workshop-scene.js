/**
 * WorkshopScene - 工坊：我的关卡 | 关卡广场
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

const MAIN_TABS = [
    { id: 'mine', label: '我的关卡' },
    { id: 'plaza', label: '关卡广场' },
];

const MINE_SUB = [
    { id: 'draft', label: '待自通', status: workshop.STATUS.draft },
    { id: 'cleared', label: '已通关', status: workshop.STATUS.cleared },
    { id: 'reviewing', label: '审核中', status: workshop.STATUS.reviewing },
    { id: 'published', label: '已发布', status: workshop.STATUS.published },
];

const PLAZA_SORT = [
    { id: 'new', label: '新关' },
    { id: 'heat', label: '热门' },
    { id: 'clearRate', label: '好通关' },
];

class WorkshopScene {
    constructor() {
        this._mainTab = 'mine';
        this._mineSub = 'draft';
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
        if (p.mainTab) this._mainTab = p.mainTab;
        if (p.mineSub) this._mineSub = p.mineSub;
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

        // 标题区占位：标题 + 副信息，再空一截才到主 Tab
        const titleY = top + 6;
        const metaY = titleY + 34;
        const tabY = metaY + 28;

        const tabW = (W - side * 2 - gap) / 2;
        MAIN_TABS.forEach((t, i) => {
            this._buttons.push(new Button({
                x: side + i * (tabW + gap),
                y: tabY,
                w: tabW,
                h: 42,
                text: t.label,
                color: this._mainTab === t.id ? '#e09a30' : '#444',
                onClick: () => {
                    this._mainTab = t.id;
                    this._scrollY = 0;
                    this._rebuild();
                },
            }));
        });

        const subY = tabY + 42 + 14;
        if (this._mainTab === 'mine') {
            const sw = (W - side * 2 - gap * 3) / 4;
            MINE_SUB.forEach((t, i) => {
                this._buttons.push(new Button({
                    x: side + i * (sw + gap),
                    y: subY,
                    w: sw,
                    h: 36,
                    text: t.label,
                    color: this._mineSub === t.id ? '#3a7ab0' : '#333',
                    onClick: () => {
                        this._mineSub = t.id;
                        this._scrollY = 0;
                        this._rebuild();
                    },
                }));
            });
        } else {
            const sw = (W - side * 2 - gap * 2) / 3;
            PLAZA_SORT.forEach((t, i) => {
                this._buttons.push(new Button({
                    x: side + i * (sw + gap),
                    y: subY,
                    w: sw,
                    h: 36,
                    text: t.label,
                    color: this._plazaSort === t.id ? '#3a7ab0' : '#333',
                    onClick: () => {
                        this._plazaSort = t.id;
                        this._scrollY = 0;
                        this._rebuild();
                    },
                }));
            });
        }

        // 底栏：返回 | 创建关卡 | 扩槽（三等分偏窄，带间隙）
        const bottomH = 48;
        const bottomY = H - bottomH - 18;
        const backW = 64;
        const expandW = 88;
        const createW = W - side * 2 - backW - expandW - gap * 2;

        this._buttons.push(new Button({
            x: side,
            y: bottomY,
            w: backW,
            h: bottomH,
            text: '返回',
            color: '#555',
            onClick: () => GameGlobal.game.sceneManager.back(),
        }));
        this._buttons.push(new Button({
            x: side + backW + gap,
            y: bottomY,
            w: createW,
            h: bottomH,
            text: '创建关卡',
            color: '#e09a30',
            onClick: () => this._onCreate(),
        }));
        const cost = workshop.getExpandCost();
        const expandLabel = cost == null
            ? '已满'
            : ('扩槽' + cost + '金');
        this._buttons.push(new Button({
            x: side + backW + gap + createW + gap,
            y: bottomY,
            w: expandW,
            h: bottomH,
            text: expandLabel,
            color: cost == null ? '#444' : '#8b5a2b',
            onClick: () => this._onExpand(),
        }));

        this._titleY = titleY;
        this._metaY = metaY;
        this._listTop = subY + 36 + 16;
        this._listBottom = bottomY - 12;
        this._buildListRects();
    }

    _buildListRects() {
        this._listRects = [];
        const W = GameGlobal.game.width;
        const items = this._mainTab === 'mine'
            ? workshop.listByStatus(MINE_SUB.find((t) => t.id === this._mineSub).status)
            : workshop.listPlaza(this._plazaSort);

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

    _onCreate() {
        if (!workshop.canCreate()) {
            const cost = workshop.getExpandCost();
            if (cost == null) {
                this._showToast('槽位已达上限 10');
            } else {
                this._showToast('槽位已满，请先扩槽（' + cost + ' 金方块）');
            }
            return;
        }
        this._promptStageTitle('未命名关卡', (title) => {
            const res = workshop.createStage(title);
            if (!res.ok) {
                this._showToast('创建失败');
                return;
            }
            GameGlobal.game.sceneManager.switchTo('workshopEditor', {
                stageId: res.stage.stageId,
            });
        });
    }

    /** 输入关卡名（微信 showModal editable） */
    _promptStageTitle(defaultTitle, onDone) {
        const fallback = () => {
            if (typeof onDone === 'function') onDone(defaultTitle || '未命名关卡');
        };
        try {
            wx.showModal({
                title: '关卡名称',
                editable: true,
                placeholderText: '最多 20 字',
                content: defaultTitle || '',
                confirmText: '确定',
                cancelText: '取消',
                success: (res) => {
                    if (!res || !res.confirm) return;
                    let title = String(res.content != null ? res.content : '').trim();
                    title = title.slice(0, 20);
                    if (!title) title = '未命名关卡';
                    onDone(title);
                },
                fail: fallback,
            });
        } catch (e) {
            fallback();
        }
    }

    _onExpand() {
        const cost = workshop.getExpandCost();
        if (cost == null) {
            this._showToast('槽位已达上限');
            return;
        }
        this._confirm = {
            title: '扩展槽位',
            body: '消耗 ' + cost + ' 金方块扩至 '
                + (workshop.getSlotCap() + 1) + ' 槽？\n主线解锁仍需金方块。',
            onOk: () => {
                const r = workshop.expandSlot();
                this._confirm = null;
                if (!r.ok) {
                    this._showToast(r.reason === 'no-gold' ? '金方块不足' : '扩容失败');
                } else {
                    this._showToast('已扩至 ' + r.slotCap + ' 槽');
                }
                this._rebuild();
            },
        };
    }

    _onMineItem(stage) {
        const st = stage.status;
        if (st === workshop.STATUS.draft) {
            this._openMineActions(stage, ['edit', 'rename', 'trial', 'delete']);
        } else if (st === workshop.STATUS.cleared
            || st === workshop.STATUS.rejected
            || st === workshop.STATUS.delisted) {
            this._openMineActions(stage, ['trial', 'submit', 'challenge', 'edit', 'rename', 'delete']);
        } else if (st === workshop.STATUS.reviewing) {
            this._openMineActions(stage, ['challenge', 'withdraw']);
        } else if (st === workshop.STATUS.published) {
            this._openMineActions(stage, ['play', 'challenge', 'delist']);
        }
    }

    _openMineActions(stage, actions) {
        this._actionSheet = { stage, actions };
    }

    _runAction(action, stage) {
        this._actionSheet = null;
        if (action === 'edit') {
            if (stage.status === workshop.STATUS.published) {
                this._showToast('请先下架再编辑');
                return;
            }
            if (stage.status === workshop.STATUS.reviewing) {
                this._showToast('请先撤回审核');
                return;
            }
            GameGlobal.game.sceneManager.switchTo('workshopEditor', { stageId: stage.stageId });
            return;
        }
        if (action === 'rename') {
            this._promptStageTitle(stage.title || '未命名关卡', (title) => {
                const r = workshop.updateStage(stage.stageId, { title });
                if (!r.ok) {
                    this._showToast('改名失败');
                } else {
                    this._showToast('已改名');
                    this._rebuild();
                }
            });
            return;
        }
        if (action === 'trial') {
            this._startWorkshopGame(stage, { authorTrial: true, entryPaid: 0 });
            return;
        }
        if (action === 'submit') {
            const r = workshop.submitForReview(stage.stageId);
            if (!r.ok) {
                const map = {
                    'daily-limit': '今日提交已满',
                    'not-cleared': '请先自通',
                    'need-clear': '布局已改，请重通',
                    invalid: r.detail || '布局不合规',
                };
                this._showToast(map[r.reason] || '提交失败');
            } else {
                this._showToast('已发布到广场');
                this._mineSub = 'published';
            }
            this._rebuild();
            return;
        }
        if (action === 'challenge') {
            this._showToast('工坊好友挑战云端下期接入');
            return;
        }
        if (action === 'delete') {
            this._confirm = {
                title: '删除关卡',
                body: '删除「' + stage.title + '」并腾出槽位？',
                onOk: () => {
                    workshop.deleteStage(stage.stageId);
                    this._confirm = null;
                    this._rebuild();
                },
            };
            return;
        }
        if (action === 'withdraw') {
            workshop.withdrawReview(stage.stageId);
            this._rebuild();
            return;
        }
        if (action === 'delist') {
            workshop.delistStage(stage.stageId);
            this._showToast('已下架');
            this._rebuild();
            return;
        }
        if (action === 'play') {
            this._tryPlayPlaza(stage);
        }
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

    _startWorkshopGame(stage, opts) {
        const o = opts || {};
        if (!o.authorTrial) {
            workshop.recordPlayStart(stage.stageId);
        }
        GameGlobal.game.sceneManager.switchTo('game', {
            mode: 'stage',
            workshop: true,
            workshopStageId: stage.stageId,
            workshopRows: workshop.cloneRows(stage.rows),
            workshopTitle: stage.title,
            authorTrial: !!o.authorTrial,
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
        drawBrandTitle(ctx, '工坊', W / 2, titleY, 'bold 28px sans-serif');

        ctx.fillStyle = SUBTITLE;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            '槽位 ' + workshop.countOccupiedSlots() + '/' + workshop.getSlotCap()
            + ' · 金' + goldenBlock.getBalance()
            + ' · 币' + coinManager.getCoins(),
            W / 2,
            metaY
        );

        for (const btn of this._buttons) btn.render(ctx);

        // 列表裁剪
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, this._listTop, W, this._listBottom - this._listTop);
        ctx.clip();

        if (this._listRects.length === 0) {
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(
                this._mainTab === 'mine' ? '暂无关卡，点底部创建' : '广场暂无发布关卡',
                W / 2,
                (this._listTop + this._listBottom) / 2
            );
        }

        this._listRects.forEach((item) => {
            if (item.y + item.h < this._listTop || item.y > this._listBottom) return;
            this._drawRow(ctx, item);
        });
        ctx.restore();

        if (this._actionSheet) this._drawActionSheet(ctx);
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

        let sub = '垃圾 ' + (stage.garbageCount || 0)
            + ' · 行 ' + (stage.minLines || 0);
        if (this._mainTab === 'plaza') {
            const unlocked = workshop.isPlazaUnlocked(stage.stageId);
            sub += unlocked ? ' · 已解锁' : ' · 需1金解锁';
            sub += ' · 通关' + ((stage.stats && stage.stats.clearCount) || 0);
        } else if (stage.status === workshop.STATUS.rejected) {
            sub = '已驳回 · ' + sub;
        } else if (stage.status === workshop.STATUS.delisted) {
            sub = '已下架 · ' + sub;
        }
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.fillText(sub, x + 12, y + 48);

        // 缩略盘：右侧小格
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

    _drawActionSheet(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const sheet = this._actionSheet;
        const labels = {
            edit: '编辑',
            rename: '改名',
            trial: '试玩自通',
            submit: '提交广场（免费）',
            challenge: '好友挑战',
            delete: '删除',
            withdraw: '撤回审核',
            delist: '下架',
            play: '游玩',
        };
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        const bw = Math.min(280, W * 0.78);
        const bh = 44;
        const gap = 10;
        const n = sheet.actions.length + 1;
        const panelH = n * (bh + gap) + 24;
        const px = (W - bw) / 2;
        const py = (H - panelH) / 2;
        ctx.fillStyle = '#2a2a32';
        this._round(ctx, px, py, bw, panelH, 12);
        ctx.fill();

        this._sheetRects = [];
        sheet.actions.forEach((a, i) => {
            const ry = py + 12 + i * (bh + gap);
            ctx.fillStyle = a === 'delete' ? '#a04040' : '#3a7ab0';
            this._round(ctx, px + 12, ry, bw - 24, bh, 8);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 15px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[a] || a, W / 2, ry + bh / 2);
            this._sheetRects.push({ action: a, x: px + 12, y: ry, w: bw - 24, h: bh });
        });
        const cy = py + 12 + sheet.actions.length * (bh + gap);
        ctx.fillStyle = '#555';
        this._round(ctx, px + 12, cy, bw - 24, bh, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText('取消', W / 2, cy + bh / 2);
        this._sheetRects.push({ action: 'cancel', x: px + 12, y: cy, w: bw - 24, h: bh });
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
        if (this._confirm || this._actionSheet || this._playDialog) return;
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
        if (this._actionSheet) {
            const rects = this._sheetRects || [];
            for (let i = 0; i < rects.length; i++) {
                if (this._hit(x, y, rects[i])) {
                    if (rects[i].action === 'cancel') this._actionSheet = null;
                    else this._runAction(rects[i].action, this._actionSheet.stage);
                    return;
                }
            }
            this._actionSheet = null;
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
                this._startWorkshopGame(d.stage, { entryPaid: paid.paid });
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
                        this._startWorkshopGame(d.stage, { entryPaid: 0 });
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
                    if (this._mainTab === 'mine') this._onMineItem(item.stage);
                    else this._tryPlayPlaza(item.stage);
                    return;
                }
            }
        }
    }
}

module.exports = WorkshopScene;
