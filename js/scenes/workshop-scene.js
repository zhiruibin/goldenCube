/**
 * WorkshopScene - 工坊：造关 / 管关（状态 Tab 为一级）
 * 关卡广场已拆到独立 plaza 场景。
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
const { achievementManager } = require('../../utils/achievement-manager');
const { drawGarbageLayoutCell } = require('../render/garbage-cell');
const { drawLayoutBoardTiles } = require('../render/board-tiles');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');

const STATUS_TABS = [
    { id: 'draft', label: '待自通', status: workshop.STATUS.draft },
    { id: 'cleared', label: '已通关', status: workshop.STATUS.cleared },
    { id: 'reviewing', label: '审核中', status: workshop.STATUS.reviewing },
    { id: 'published', label: '已发布', status: workshop.STATUS.published },
];

class WorkshopScene {
    constructor() {
        this._mineSub = 'draft';
        this._buttons = [];
        this._listRects = [];
        this._toast = '';
        this._toastUntil = 0;
        this._confirm = null;
        this._playDialog = null;
        this._scrollY = 0;
        this._scrollVel = 0;
        this._moveSamples = [];
    }

    onEnter(params) {
        const p = params || {};
        // 兼容旧 mainTab/mineSub 回流参数
        if (p.mineSub) this._mineSub = p.mineSub;
        else if (p.mainTab === 'plaza') this._mineSub = 'published';
        if (p.toast) this._showToast(p.toast);
        this._confirm = null;
        this._playDialog = null;
        this._actionSheet = null;
        this._scrollY = 0;
        this._scrollVel = 0;
        this._moveSamples = [];
        this._rebuild();
    }

    onExit() {
        this._buttons = [];
        this._listRects = [];
        this._scrollVel = 0;
        this._moveSamples = [];
    }

    onResume() {
        this._rebuild();
    }

    update(dt) {
        if (this._toast && Date.now() > this._toastUntil) this._toast = '';
        this._applyScrollInertia(dt);
    }

    _maxScroll() {
        return Math.max(0, (this._listContentH || 0) - Math.max(1, this._listBottom - this._listTop));
    }

    _clampScrollY(y) {
        return Math.max(0, Math.min(this._maxScroll(), y));
    }

    _launchScrollInertia() {
        const samples = this._moveSamples || [];
        this._moveSamples = [];
        if (this._confirm || this._actionSheet || this._playDialog || samples.length < 2) {
            this._scrollVel = 0;
            return;
        }
        const newest = samples[samples.length - 1];
        let oldest = samples[0];
        for (let i = samples.length - 2; i >= 0; i--) {
            if (newest.t - samples[i].t > 100) break;
            oldest = samples[i];
        }
        const dtSec = Math.max(0.016, (newest.t - oldest.t) / 1000);
        let vel = (oldest.y - newest.y) / dtSec;
        const MAX_VEL = 4200;
        if (vel > MAX_VEL) vel = MAX_VEL;
        if (vel < -MAX_VEL) vel = -MAX_VEL;
        this._scrollVel = Math.abs(vel) >= 180 ? vel : 0;
    }

    _applyScrollInertia(dt) {
        if (this._confirm || this._actionSheet || this._playDialog) {
            this._scrollVel = 0;
            return;
        }
        const vel = this._scrollVel || 0;
        if (Math.abs(vel) < 28) {
            this._scrollVel = 0;
            return;
        }
        const sec = Math.max(0, Math.min(0.05, Number(dt) || 0));
        if (sec <= 0) return;
        const next = this._clampScrollY((this._scrollY || 0) + vel * sec);
        if (next <= 0 || next >= this._maxScroll()) {
            this._scrollY = next;
            this._scrollVel = 0;
            this._buildListRects();
            return;
        }
        this._scrollY = next;
        this._scrollVel = vel * Math.pow(0.90, sec * 60);
        this._buildListRects();
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

        const sw = (W - side * 2 - gap * 3) / 4;
        STATUS_TABS.forEach((t, i) => {
            this._buttons.push(new Button({
                x: side + i * (sw + gap),
                y: tabY,
                w: sw,
                h: 42,
                text: t.label,
                color: this._mineSub === t.id ? '#e09a30' : '#444',
                onClick: () => {
                    this._mineSub = t.id;
                    this._scrollY = 0;
                    this._scrollVel = 0;
                    this._rebuild();
                },
            }));
        });

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
        this._listTop = tabY + 42 + 16;
        this._listBottom = bottomY - 12;
        this._buildListRects();
    }

    _buildListRects() {
        this._listRects = [];
        const W = GameGlobal.game.width;
        const tab = STATUS_TABS.find((t) => t.id === this._mineSub) || STATUS_TABS[0];
        const items = workshop.listByStatus(tab.status);
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
            this._startWorkshopGame(stage, {
                authorTrial: true,
                entryPaid: 0,
                returnTo: 'list',
                listParams: {
                    origin: 'workshop',
                    mineSub: this._mineSub,
                },
            });
            return;
        }
        if (action === 'submit') {
            this._showToast('提交中…');
            Promise.resolve(workshop.submitForReview(stage.stageId)).then((r) => {
                if (!r || !r.ok) {
                    const map = {
                        'daily-limit': '今日提交已满',
                        'not-cleared': '请先自通',
                        'need-clear': '布局已改，请重通',
                        invalid: (r && r.detail) || '布局不合规',
                        cloud: (r && r.detail) || '云发布失败',
                    };
                    this._showToast((r && map[r.reason]) || '提交失败');
                } else {
                    this._showToast(r.offline ? '已本地发布（离线）' : '已发布到广场');
                    this._mineSub = 'published';
                    if (achievementManager && typeof achievementManager.reportWorkshopPublished === 'function') {
                        achievementManager.reportWorkshopPublished();
                    }
                }
                this._rebuild();
            });
            return;
        }
        if (action === 'challenge') {
            this._startWorkshopChallenge(stage);
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
            Promise.resolve(workshop.delistStage(stage.stageId)).then((r) => {
                if (!r || !r.ok) {
                    this._showToast('下架失败');
                } else {
                    this._showToast('已下架');
                    this._mineSub = 'cleared';
                }
                this._rebuild();
            });
            return;
        }
        if (action === 'play') {
            this._tryPlayOwnPublished(stage);
        }
    }

    _startWorkshopChallenge(stage) {
        const { cloudService } = require('../../utils/cloud-service');
        if (!cloudService.isAvailable()) {
            this._showToast('云开发未配置，无法发起挑战');
            return;
        }
        const best = stage.authorBest;
        if (!best || !(best.lines >= 1)) {
            this._showToast('请先自通再挑战');
            return;
        }
        const fee = workshop.spendChallengeFee();
        if (!fee.ok) {
            this._showToast('金币不足（需 ' + workshop.CHALLENGE_FEE + '）');
            return;
        }
        this._showToast('创建挑战中…');
        let profile = {};
        try {
            profile = require('../../utils/user-profile').getCachedProfile() || {};
        } catch (e) { /* ignore */ }
        cloudService.createChallenge({
            mode: 'workshop',
            workshopStageId: stage.stageId,
            workshopTitle: stage.title,
            layoutSnapshot: workshop.cloneRows(stage.rows),
            challengerLines: best.lines,
            challengerPieces: best.pieces || 0,
            challengerTimeMs: best.timeMs || 0,
            nickname: profile.nickname || '',
            avatarUrl: profile.avatarUrl || '',
        }).then((res) => {
            if (!res || !res.success) {
                // 退回挑战费
                try {
                    const bal = require('../../utils/coin-manager').coinManager.getCoins();
                    wx.setStorageSync('gc_coins', bal + (fee.paid || 0));
                } catch (e) { /* ignore */ }
                this._showToast((res && res.errMsg) || '发起失败');
                return;
            }
            workshop.bumpChallengeSend(stage.stageId);
            const lines = best.lines;
            const shareTitle = (stage.title || '工坊关卡') + ' · ' + lines + ' 行，来挑战！';
            try {
                const challengeShareCard = require('../../utils/challenge-share-card');
                const sharePayload = {
                    mode: 'workshop',
                    workshopStageId: stage.stageId,
                    workshopTitle: stage.title,
                    layoutSnapshot: workshop.cloneRows(stage.rows),
                    challengerLines: lines,
                    challengerPieces: best.pieces || 0,
                    challengerTimeMs: best.timeMs || 0,
                };
                challengeShareCard.shareWithCard({
                    title: shareTitle,
                    query: 'challengeId=' + encodeURIComponent(res.challengeId)
                        + '&mode=workshop&score=' + lines,
                    cardOpts: challengeShareCard.cardOptsFromPayload(sharePayload),
                });
            } catch (e) { /* ignore */ }
            this._showToast('挑战已创建，请分享给好友');
        }).catch(() => {
            try {
                const bal = require('../../utils/coin-manager').coinManager.getCoins();
                wx.setStorageSync('gc_coins', bal + (fee.paid || 0));
            } catch (e2) { /* ignore */ }
            this._showToast('发起失败');
        });
    }

    /** 已发布关：作者也可当玩家开打（回流工坊「已发布」） */
    _tryPlayOwnPublished(stage) {
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
            workshopReturnTo: o.returnTo || 'list',
            workshopListParams: o.listParams || {
                origin: 'workshop',
                mineSub: this._mineSub,
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

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, this._listTop, W, this._listBottom - this._listTop);
        ctx.clip();

        if (this._listRects.length === 0) {
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('暂无关卡，点底部创建', W / 2, (this._listTop + this._listBottom) / 2);
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
        if (stage.status === workshop.STATUS.rejected) {
            sub = '已驳回 · ' + sub;
        } else if (stage.status === workshop.STATUS.delisted) {
            sub = '已下架 · ' + sub;
        }
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.fillText(sub, x + 12, y + 48);

        this._drawMiniBoard(ctx, stage.rows, x + w - 56, y + 10, 4);
    }

    _drawMiniBoard(ctx, rows, ox, oy, cell) {
        const cols = 10;
        const visRows = 10;
        const r = workshop.cloneRows(rows);
        const occ = [];
        for (let y = 10; y < 20; y++) {
            const rowIdx = y - 10;
            occ[rowIdx] = [];
            const line = r[String(y)] || '';
            for (let x = 0; x < cols; x++) {
                occ[rowIdx][x] = line[x] === '#';
            }
        }
        if (!drawLayoutBoardTiles(ctx, ox, oy, cols, visRows, cell, occ)) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(ox, oy, cols * cell, visRows * cell);
        }
        for (let y = 10; y < 20; y++) {
            const line = r[String(y)];
            for (let x = 0; x < cols; x++) {
                if (line[x] === '#') {
                    drawGarbageLayoutCell(ctx, ox + x * cell, oy + (y - 10) * cell, cell - 0.5, x, y);
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
        const bh = d.canAd ? 272 : 232;
        const px = (W - bw) / 2;
        const py = (H - bh) / 2;
        ctx.fillStyle = '#2a2a32';
        this._round(ctx, px, py, bw, bh, 12);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.stage.title, W / 2, py + 36);
        ctx.fillStyle = SUBTITLE;
        ctx.font = '13px sans-serif';
        ctx.fillText('开打消耗 ' + d.fee + ' 金币', W / 2, py + 68);

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
        by += 52;
        ctx.fillStyle = '#555';
        this._round(ctx, px + 20, by, btnW, 40, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('取消', W / 2, by + 20);
        this._playRects.cancel = { x: px + 20, y: by, w: btnW, h: 40 };
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
        this._scrollVel = 0;
        this._lastMoveY = y;
        const now = Date.now();
        this._moveSamples = [{ t: now, y: y }];
    }

    onTouchMove(x, y) {
        if (this._confirm || this._actionSheet || this._playDialog) return;
        const prev = this._lastMoveY != null ? this._lastMoveY : y;
        const dy = prev - y;
        if (Math.abs(dy) > 2) this._touchMoved = true;
        this._scrollY = this._clampScrollY((this._scrollY || 0) + dy);
        this._lastMoveY = y;
        const now = Date.now();
        this._moveSamples.push({ t: now, y: y });
        while (this._moveSamples.length > 1 && now - this._moveSamples[0].t > 120) {
            this._moveSamples.shift();
        }
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
        this._launchScrollInertia();
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
                this._startWorkshopGame(d.stage, {
                    entryPaid: paid.paid,
                    listParams: {
                        origin: 'workshop',
                        mineSub: this._mineSub,
                    },
                });
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
                        this._startWorkshopGame(d.stage, {
                            entryPaid: 0,
                            listParams: {
                                origin: 'workshop',
                                mineSub: this._mineSub,
                            },
                        });
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
                    this._onMineItem(item.stage);
                    return;
                }
            }
        }
    }
}

module.exports = WorkshopScene;
