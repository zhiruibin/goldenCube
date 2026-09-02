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
    ACCENT,
} = require('../theme/arcade-night');
const workshop = require('../../utils/workshop-manager');
const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { applyShortageHighlight, renderEntryDialog } = require('../../utils/stage-entry-ui');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const plazaWall = require('../render/plaza-wall-fx');
const { LIST_FRAME_INTERVAL } = require('../runtime/frame-budget');

const PLAZA_SORT = [
    { id: 'official', label: '官方' },
    { id: 'new', label: '新关' },
    { id: 'heat', label: '热门' },
    { id: 'clearRate', label: '好通关' },
];

class PlazaScene {
    constructor() {
        this._plazaSort = 'official';
        this._buttons = [];
        this._listRects = [];
        this._toast = '';
        this._toastUntil = 0;
        this._confirm = null;
        this._playDialog = null;
        this._playDialogArmed = false;
        this._scrollY = 0;
        this._scrollVel = 0;
        this._moveSamples = [];
        this._plazaLoading = false;
        this._plazaTabCache = {};
        this._plazaLoadGen = 0;
        this._challengeBusy = false;
        this._cardState = Object.create(null);
        this._hudLine = '';
        this._cachedTopInset = null;
        this._wallItems = null;
        this._wallW = 0;
        this._wallTop = 0;
        this._focusStageId = '';
    }

    onEnter(params) {
        const p = params || {};
        this._plazaSort = p.plazaSort || 'official';
        if (p.toast) this._showToast(p.toast);
        this._confirm = null;
        this._playDialog = null;
        this._playDialogArmed = false;
        this._scrollY = typeof p.scrollY === 'number' && Number.isFinite(p.scrollY)
            ? Math.max(0, p.scrollY)
            : 0;
        this._focusStageId = p.focusStageId ? String(p.focusStageId) : '';
        this._scrollVel = 0;
        this._moveSamples = [];
        this._plazaItems = [];
        this._plazaLoading = true;
        this._challengeBusy = false;
        this._cardState = Object.create(null);
        this._hudLine = '';
        this._cachedTopInset = null;
        this._wallItems = null;
        this._rebuild();
    }

    onExit() {
        this._params = Object.assign({}, this._params || {}, {
            plazaSort: this._plazaSort,
            scrollY: this._scrollY || 0,
            focusStageId: this._focusStageId || '',
        });
        this._buttons = [];
        this._listRects = [];
        this._scrollVel = 0;
        this._moveSamples = [];
        this._plazaTabCache = {};
    }

    onResume() {
        const hasItems = !!(this._plazaItems && this._plazaItems.length);
        this._rebuild({ silentReload: hasItems });
    }

    /** 仅官方 Tab 可用本地包即时展示（顺序稳定）；其余 Tab 依赖云排序，先展示会闪 */
    _useLocalPlazaPreview(sort) {
        return sort === 'official';
    }

    _switchPlazaTab(sortId) {
        this._plazaSort = sortId;
        this._scrollY = 0;
        this._scrollVel = 0;
        this._focusStageId = '';
        const cached = this._plazaTabCache[sortId];
        if (cached && cached.length) {
            this._plazaItems = cached;
            this._plazaLoading = false;
            this._rebuild({ silentReload: true });
            return;
        }
        this._plazaLoading = true;
        if (this._useLocalPlazaPreview(sortId)) {
            this._plazaItems = workshop.listPlazaLocal(sortId);
        } else {
            this._plazaItems = [];
        }
        this._wallItems = null;
        this._rebuild();
    }

    update(dt) {
        if (this._toast && Date.now() > this._toastUntil) this._toast = '';
        this._applyScrollInertia(dt);
    }

    getRenderInterval() {
        return LIST_FRAME_INTERVAL;
    }

    _maxScroll() {
        return Math.max(0, (this._listContentH || 0) - Math.max(1, this._listBottom - this._listTop));
    }

    _clampScrollY(y) {
        return Math.max(0, Math.min(this._maxScroll(), y));
    }

    /** 松手后按最近位移推算惯性速度（px/s，方向同 scrollY） */
    _launchScrollInertia() {
        const samples = this._moveSamples || [];
        this._moveSamples = [];
        if (this._confirm || this._playDialog || samples.length < 2) {
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
        // 手指上滑 y↓ → scrollY↑
        let vel = (oldest.y - newest.y) / dtSec;
        const MAX_VEL = 4200;
        if (vel > MAX_VEL) vel = MAX_VEL;
        if (vel < -MAX_VEL) vel = -MAX_VEL;
        this._scrollVel = Math.abs(vel) >= 180 ? vel : 0;
    }

    _applyScrollInertia(dt) {
        if (this._confirm || this._playDialog) {
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
        // 撞边立刻停
        if (next <= 0 || next >= this._maxScroll()) {
            this._scrollY = next;
            this._scrollVel = 0;
            plazaWall.applyScroll(this._listRects, this._listTop, this._scrollY);
            return;
        }
        this._scrollY = next;
        // 指数衰减，约 0.9 / 帧 @60fps
        this._scrollVel = vel * Math.pow(0.90, sec * 60);
        plazaWall.applyScroll(this._listRects, this._listTop, this._scrollY);
    }

    _showToast(msg) {
        this._toast = msg || '';
        this._toastUntil = Date.now() + 2200;
    }

    _getTopInset() {
        if (this._cachedTopInset != null) return this._cachedTopInset;
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
        this._cachedTopInset = Math.max(statusBarHeight, safeTop, capsuleBottom) + 12;
        return this._cachedTopInset;
    }

    _rebuild(options) {
        const opts = options || {};
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const top = this._getTopInset();
        const side = 14;
        const gap = 10;
        this._buttons = [];

        const titleY = top + 6;
        const metaY = titleY + 34;
        const hintY = metaY + 22;
        const tabY = hintY + 18;

        const sw = (W - side * 2 - gap * 3) / 4;
        PLAZA_SORT.forEach((t, i) => {
            this._buttons.push(new Button({
                x: side + i * (sw + gap),
                y: tabY,
                w: sw,
                h: 42,
                text: t.label,
                color: this._plazaSort === t.id ? '#e09a30' : '#444',
                onClick: () => {
                    if (this._plazaSort === t.id) return;
                    this._switchPlazaTab(t.id);
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
            text: '← 返回',
            color: '#555',
            onClick: () => GameGlobal.game.sceneManager.back(),
        }));

        this._titleY = titleY;
        this._metaY = metaY;
        this._hintY = hintY;
        this._listTop = tabY + 42 + 12;
        this._listBottom = bottomY - 12;
        this._plazaItems = this._plazaItems || [];
        this._refreshHud();
        this._buildListRects();
        this._refreshPlazaFlags();
        this._finalizePlazaView();
        this._loadPlaza(!!opts.silentReload);
    }

    _samePlazaOrder(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i].stageId !== b[i].stageId) return false;
        }
        return true;
    }

    _mergePlazaItemsInPlace(prev, next) {
        const map = {};
        (next || []).forEach((s) => {
            if (s && s.stageId) map[s.stageId] = s;
        });
        return (prev || []).map((s) => (map[s.stageId] ? Object.assign({}, s, map[s.stageId]) : s));
    }

    _applyPlazaList(sort, list) {
        const next = Array.isArray(list) ? list : [];
        if (this._plazaItems && this._plazaItems.length && this._samePlazaOrder(this._plazaItems, next)) {
            this._plazaItems = this._mergePlazaItemsInPlace(this._plazaItems, next);
        } else {
            this._plazaItems = next;
        }
        this._plazaTabCache[sort] = this._plazaItems;
        this._plazaLoading = false;
        this._wallItems = null;
        this._refreshHud();
        this._buildListRects();
        this._refreshPlazaFlags();
        this._finalizePlazaView();
    }

    _loadPlaza(silentReload) {
        const sort = this._plazaSort;
        const gen = ++this._plazaLoadGen;

        if (!silentReload) {
            this._plazaLoading = true;
            const cached = this._plazaTabCache[sort];
            if (cached && cached.length) {
                this._plazaItems = cached;
                this._plazaLoading = false;
                this._wallItems = null;
                this._buildListRects();
                this._refreshPlazaFlags();
                this._finalizePlazaView();
            } else if (this._useLocalPlazaPreview(sort)) {
                if (!this._plazaItems || !this._plazaItems.length) {
                    this._plazaItems = workshop.listPlazaLocal(sort);
                    this._wallItems = null;
                }
                this._buildListRects();
                this._refreshPlazaFlags();
                this._finalizePlazaView();
            } else if (!this._plazaItems || !this._plazaItems.length) {
                this._plazaItems = [];
                this._wallItems = null;
                this._buildListRects();
            }
        }

        Promise.resolve(workshop.listPlaza(sort)).then((items) => {
            if (this._plazaLoadGen !== gen || this._plazaSort !== sort) return;
            this._applyPlazaList(sort, items);
        }).catch(() => {
            if (this._plazaLoadGen !== gen || this._plazaSort !== sort) return;
            this._plazaLoading = false;
            if (!this._plazaItems || !this._plazaItems.length) {
                const local = workshop.listPlazaLocal(sort);
                this._applyPlazaList(sort, local);
            } else {
                this._buildListRects();
                this._finalizePlazaView();
            }
        });
    }

    _getPlazaListHint() {
        if (this._plazaLoading) return '加载中…';
        if (this._plazaSort === 'official') return '暂无官方精选关卡';
        if (this._plazaSort === 'heat') return '热门分类暂无关卡';
        if (this._plazaSort === 'clearRate') return '好通关分类暂无关卡';
        return '暂无玩家发布关卡';
    }

    _refreshHud() {
        this._hudLine = '金' + goldenBlock.getBalance()
            + ' · 币' + coinManager.getCoins()
            + ' · 今日免费 ' + workshop.getFreePlayRemaining();
    }

    _refreshPlazaFlags() {
        const flags = Object.create(null);
        const items = this._plazaItems || [];
        for (let i = 0; i < items.length; i++) {
            const id = items[i] && items[i].stageId;
            if (!id) continue;
            flags[id] = plazaWall.plazaCardState(
                workshop.isPlazaUnlocked(id),
                workshop.isPlazaCleared(id)
            );
        }
        this._cardState = flags;
    }

    /** 列表高度就绪后再夹紧滚动，并刷新刚打过的那张卡 */
    _finalizePlazaView() {
        if ((this._plazaItems || []).length && (this._listContentH || 0) > 0) {
            this._scrollY = this._clampScrollY(this._scrollY || 0);
        }
        plazaWall.applyScroll(this._listRects, this._listTop, this._scrollY || 0);
        if (this._focusStageId) this._refreshFocusedCard(this._focusStageId);
    }

    _refreshFocusedCard(stageId) {
        if (!stageId) return;
        const unlocked = workshop.isPlazaUnlocked(stageId);
        const cleared = workshop.isPlazaCleared(stageId);
        if (!this._cardState) this._cardState = Object.create(null);
        this._cardState[stageId] = plazaWall.plazaCardState(unlocked, cleared);
        const items = this._plazaItems || [];
        for (let i = 0; i < items.length; i++) {
            const s = items[i];
            if (!s || s.stageId !== stageId) continue;
            if (cleared) {
                const n = (s.stats && s.stats.clearCount) || 0;
                s.stats = Object.assign({}, s.stats || {}, { clearCount: Math.max(n, 1) });
            }
            break;
        }
        const rects = this._listRects || [];
        for (let i = 0; i < rects.length; i++) {
            const box = rects[i];
            if (box.stage && box.stage.stageId === stageId) {
                box._metaKey = '';
                box._meta = null;
            }
        }
    }

    _buildListRects() {
        const W = GameGlobal.game.width;
        const items = this._plazaItems || [];
        if (this._wallItems !== items || this._wallW !== W || this._wallTop !== this._listTop) {
            const laid = plazaWall.layoutWall(items, {
                pad: 12,
                listTop: this._listTop,
                scrollY: 0,
                width: W,
            });
            this._listRects = laid.boxes;
            this._listContentH = laid.contentH;
            this._wallItems = items;
            this._wallW = W;
            this._wallTop = this._listTop;
        }
        plazaWall.applyScroll(this._listRects, this._listTop, this._scrollY || 0);
    }

    _tryPlayPlaza(stage) {
        this._openPlayDialog(stage);
    }

    _openPlayDialog(stage) {
        const fee = workshop.getPlayFee(stage);
        const unlocked = workshop.isPlazaUnlocked(stage.stageId);
        this._playDialog = {
            stage,
            fee,
            locked: !unlocked,
            needGold: unlocked ? 0 : workshop.PLAZA_UNLOCK_GOLD,
            freeLeft: workshop.getFreePlayRemaining(),
            canAd: unlocked && isRewardedVideoConfigured() === true,
            canChallenge: false,
            lackGold: false,
            lackCoins: false,
        };
        // 开窗这记抬手不能落到「确认」上，余额只在下一次点确认时检查
        this._playDialogArmed = false;
    }

    _payAndEnterPlaza(stage) {
        const r = workshop.enterPlazaStage(stage.stageId);
        if (!r.ok) {
            applyShortageHighlight(this._playDialog, r);
            this._showToast(workshop.plazaEntryShortageText(r));
            return;
        }
        this._playDialog = null;
        this._refreshHud();
        this._refreshPlazaFlags();
        this._startPlazaGame(stage, { entryPaid: r.paid || 0 });
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
                scrollY: this._scrollY || 0,
                focusStageId: stage.stageId,
            },
            entryPaid: o.entryPaid || 0,
            dropIntervalMs: stage.dropIntervalMs || 1000,
        });
    }

    /** 已通关广场关：创建残局挑战并分享 */
    _startPlazaChallenge(stage) {
        if (!stage || this._challengeBusy) return;
        const best = workshop.getPlazaBest(stage.stageId);
        if (!best || !(best.lines >= 1)) {
            this._showToast('请再打一局以记录最佳成绩');
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

        const layoutSnapshot = workshop.cloneRows(stage.rows);
        const title = (stage.title || '广场关卡').slice(0, 20);

        const { ensureProfileForAction } = require('../../utils/user-profile');
        ensureProfileForAction({
            title: '发起好友挑战',
            content: '授权微信头像昵称后，好友能看到你的资料。也可暂不授权，使用默认昵称继续发起。',
        }).then((profile) => cloudService.createChallenge({
            mode: 'plaza',
            workshopStageId: stage.stageId,
            workshopTitle: title,
            layoutSnapshot,
            challengerLines: best.lines,
            challengerPieces: best.pieces || 0,
            challengerTimeMs: best.timeMs || 0,
            nickname: (profile && profile.nickname) || '',
            avatarUrl: (profile && profile.avatarUrl) || '',
        })).then((res) => {
            this._challengeBusy = false;
            if (!res || !res.success || !res.challengeId) {
                this._showToast((res && res.errMsg) || '发起失败');
                return;
            }
            try {
                workshop.bumpChallengeSend(stage.stageId);
            } catch (e) { /* ignore */ }
            try {
                const { achievementManager } = require('../../utils/achievement-manager');
                if (achievementManager && typeof achievementManager.reportChallengeCreate === 'function') {
                    achievementManager.reportChallengeCreate();
                }
            } catch (e) { /* ignore */ }
            try {
                const challengeShareCard = require('../../utils/challenge-share-card');
                const sharePayload = {
                    mode: 'plaza',
                    workshopStageId: stage.stageId,
                    workshopTitle: title,
                    layoutSnapshot,
                    challengerLines: best.lines,
                    challengerPieces: best.pieces || 0,
                    challengerTimeMs: best.timeMs || 0,
                };
                challengeShareCard.shareWithCard({
                    title: title + ' · ' + best.lines + ' 行，约好友来战！',
                    query: 'challengeId=' + encodeURIComponent(res.challengeId),
                    cardOpts: challengeShareCard.cardOptsFromPayload(sharePayload, { isCounter: false }),
                });
            } catch (e) {
                this._showToast('挑战已创建，请从分享菜单发送给好友');
            }
        }).catch(() => {
            this._challengeBusy = false;
            this._showToast('发起失败');
        });
    }

    render(ctx) {
        try {
            this._renderPlaza(ctx);
        } catch (e) {
            console.error('[Plaza] render 失败', e);
            const W = GameGlobal.game.width;
            const H = GameGlobal.game.height;
            fillNightBackground(ctx, W, H);
            ctx.fillStyle = ACCENT;
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('关卡广场', W / 2, H * 0.4);
        }
    }

    _renderPlaza(ctx) {
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
            this._hudLine || '',
            W / 2,
            metaY
        );

        const hintY = this._hintY != null ? this._hintY : metaY + 22;
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('点嵌板进入该关', W / 2, hintY);

        for (const btn of this._buttons) btn.render(ctx);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, this._listTop, W, this._listBottom - this._listTop);
        ctx.clip();

        if (this._listRects.length === 0) {
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this._getPlazaListHint(), W / 2, (this._listTop + this._listBottom) / 2);
        }

        const rects = this._listRects;
        for (let i = 0; i < rects.length; i++) {
            const item = rects[i];
            if (item.y + item.h < this._listTop || item.y > this._listBottom) continue;
            try {
                this._drawCard(ctx, item);
            } catch (e) { /* 单卡失败不拖死整墙 */ }
        }
        ctx.restore();

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

    _drawCard(ctx, item) {
        const stage = item.stage;
        const id = stage && stage.stageId;
        const state = (id && this._cardState && this._cardState[id]) || 'locked';
        plazaWall.drawCard(ctx, item, state);
    }

    _drawPlayDialog(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const d = this._playDialog;
        if (!d.locked) {
            const cleared = workshop.isPlazaCleared(d.stage.stageId);
            const best = cleared ? workshop.getPlazaBest(d.stage.stageId) : null;
            d.canChallenge = !!(cleared && best && best.lines >= 1);
        } else {
            d.canAd = false;
            d.canChallenge = false;
        }
        renderEntryDialog(ctx, W, H, d);
        this._playRects = {
            pay: d.payRect,
            cancel: d.cancelRect,
            ad: d.adRect,
            challenge: d.challengeRect,
        };
        this._playPanel = d.panelRect;
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
        if (this._playDialog) this._playDialogArmed = true;
    }

    onTouchMove(x, y) {
        if (this._confirm || this._playDialog) return;
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
        plazaWall.applyScroll(this._listRects, this._listTop, this._scrollY);
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
        // 惯性已在 handleTouchEnd 启动；此处仅处理点击
        if (this._playDialog) {
            if (!this._playDialogArmed) {
                return;
            }
            const d = this._playDialog;
            const r = this._playRects || {};
            if (this._hit(x, y, r.cancel)) {
                this._playDialog = null;
                this._playDialogArmed = false;
                return;
            }
            if (this._hit(x, y, r.pay)) {
                this._payAndEnterPlaza(d.stage);
                return;
            }
            if (this._hit(x, y, r.ad)) {
                if (d.locked) {
                    this._showToast('请先解锁关卡');
                    return;
                }
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
                        const paid = workshop.enterPlazaStage(d.stage.stageId, { skipFee: true });
                        if (!paid.ok) {
                            this._showToast(workshop.plazaEntryShortageText(paid));
                            return;
                        }
                        this._playDialog = null;
                        this._startPlazaGame(d.stage, { entryPaid: 0 });
                    })
                    .catch(() => this._showToast('需完整观看广告'));
                return;
            }
            if (this._hit(x, y, r.challenge)) {
                const stage = d.stage;
                this._playDialog = null;
                this._startPlazaChallenge(stage);
                return;
            }
            if (!this._hit(x, y, this._playPanel)) {
                this._playDialog = null;
                this._playDialogArmed = false;
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
            for (let i = this._listRects.length - 1; i >= 0; i--) {
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
