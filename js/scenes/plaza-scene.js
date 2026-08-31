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
const { drawGarbageLayoutCell } = require('../render/garbage-cell');
const { drawLayoutBoardTiles } = require('../render/board-tiles');

const PLAZA_SORT = [
    { id: 'official', label: '官方' },
    { id: 'new', label: '新关' },
    { id: 'heat', label: '热门' },
    { id: 'clearRate', label: '好通关' },
];

/** 与闯关解锁/已通关卡片一致的金色底/描边 */
const PLAZA_UNLOCKED_FILL = 'rgba(255, 200, 87, 0.14)';
const PLAZA_UNLOCKED_STROKE = 'rgba(255, 200, 87, 0.6)';
const PLAZA_LOCKED_FILL = 'rgba(255, 255, 255, 0.05)';
const PLAZA_LOCKED_STROKE = 'rgba(255, 255, 255, 0.14)';

class PlazaScene {
    constructor() {
        this._plazaSort = 'official';
        this._buttons = [];
        this._listRects = [];
        this._toast = '';
        this._toastUntil = 0;
        this._confirm = null;
        this._playDialog = null;
        this._scrollY = 0;
        this._scrollVel = 0;
        this._moveSamples = [];
        this._plazaLoading = false;
        this._plazaTabCache = {};
        this._plazaLoadGen = 0;
        this._challengeBusy = false;
    }

    onEnter(params) {
        const p = params || {};
        this._plazaSort = p.plazaSort || 'official';
        if (p.toast) this._showToast(p.toast);
        this._confirm = null;
        this._playDialog = null;
        this._scrollY = 0;
        this._scrollVel = 0;
        this._moveSamples = [];
        this._plazaItems = [];
        this._plazaLoading = true;
        this._challengeBusy = false;
        this._rebuild();
    }

    onExit() {
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
        this._buildListRects();
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
            this._buildListRects();
            return;
        }
        this._scrollY = next;
        // 指数衰减，约 0.9 / 帧 @60fps
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
        const tabY = metaY + 28;

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
        this._buildListRects();
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
                this._buildListRects();
            } else if (this._useLocalPlazaPreview(sort)) {
                if (!this._plazaItems || !this._plazaItems.length) {
                    this._plazaItems = workshop.listPlazaLocal(sort);
                }
                this._buildListRects();
            } else if (!this._plazaItems || !this._plazaItems.length) {
                this._plazaItems = [];
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

    _buildListRects() {
        this._listRects = [];
        const W = GameGlobal.game.width;
        const items = this._plazaItems || [];
        const rowH = 72;
        const cbW = 88;
        const cbH = 24;
        const titleY = 22;
        items.forEach((stage, i) => {
            const y = this._listTop + i * (rowH + 8) - this._scrollY;
            const x = 12;
            const w = W - 24;
            const cleared = workshop.isPlazaCleared(stage.stageId);
            const miniBoardX = x + w - 56;
            const challengeBtn = cleared ? {
                x: miniBoardX - 8 - cbW,
                y: y + titleY - cbH / 2,
                w: cbW,
                h: cbH,
            } : null;
            this._listRects.push({
                stage,
                x,
                y,
                w,
                h: rowH,
                challengeBtn,
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
            ctx.fillText(this._getPlazaListHint(), W / 2, (this._listTop + this._listBottom) / 2);
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
        const { stage, x, y, w, h, challengeBtn } = item;
        const cleared = workshop.isPlazaCleared(stage.stageId);
        const unlocked = workshop.isPlazaUnlocked(stage.stageId);
        const isOfficial = stage.source === 'official';
        const best = cleared ? workshop.getPlazaBest(stage.stageId) : null;

        ctx.fillStyle = unlocked ? PLAZA_UNLOCKED_FILL : PLAZA_LOCKED_FILL;
        this._round(ctx, x, y, w, h, 10);
        ctx.fill();
        ctx.strokeStyle = unlocked ? PLAZA_UNLOCKED_STROKE : PLAZA_LOCKED_STROKE;
        ctx.lineWidth = 1;
        this._round(ctx, x, y, w, h, 10);
        ctx.stroke();

        const miniBoardX = x + w - 56;
        const titleX = x + 12;
        const titleY = y + 22;
        const titleFont = 'bold 15px sans-serif';
        const btnLeft = challengeBtn ? challengeBtn.x : miniBoardX;
        const titleMaxW = btnLeft - titleX - 8;

        ctx.font = titleFont;
        const title = this._truncateText(ctx, stage.title || '未命名', Math.max(0, titleMaxW), titleFont);

        ctx.fillStyle = unlocked ? '#ffffff' : MUTED;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, titleX, titleY);

        let sub = '垃圾 ' + (stage.garbageCount || 0)
            + ' · 行 ' + (stage.minLines || 0);
        if (isOfficial) sub += ' · 官方';
        if (!unlocked) {
            sub += ' · 需1金解锁';
        } else if (!cleared) {
            sub += ' · 已解锁';
        }
        sub += ' · 全服通关' + ((stage.stats && stage.stats.clearCount) || 0);
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(sub, x + 12, y + 48);

        if (cleared && best && best.lines >= 1) {
            ctx.textAlign = 'right';
            ctx.fillStyle = MUTED;
            ctx.fillText('最佳 ' + best.lines + ' 行', x + w - 12, y + 48);
            ctx.textAlign = 'left';
        }

        if (cleared && challengeBtn) {
            const cb = challengeBtn;
            ctx.fillStyle = 'rgba(224, 154, 48, 0.9)';
            this._round(ctx, cb.x, cb.y, cb.w, cb.h, 6);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('约好友来战', cb.x + cb.w / 2, cb.y + cb.h / 2);
            ctx.textAlign = 'left';
        }

        this._drawMiniBoard(ctx, stage.rows, x + w - 56, y + 10, 4);
    }

    _truncateText(ctx, text, maxW, font) {
        const raw = String(text || '');
        if (!raw) return '';
        if (font) ctx.font = font;
        if (ctx.measureText(raw).width <= maxW) return raw;
        let s = raw;
        while (s.length > 1 && ctx.measureText(s + '…').width > maxW) {
            s = s.slice(0, -1);
        }
        return s + '…';
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
        const feeLine = '开打消耗 ' + d.fee + ' 金币';
        const cleared = workshop.isPlazaCleared(d.stage.stageId);
        const best = cleared ? workshop.getPlazaBest(d.stage.stageId) : null;
        const infoLine = (cleared && best && best.lines >= 1)
            ? (feeLine + ' · 最佳 ' + best.lines + ' 行')
            : feeLine;
        ctx.textAlign = 'center';
        ctx.fillText(infoLine, W / 2, py + 68);

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
        // 惯性已在 handleTouchEnd 启动；此处仅处理点击
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
                const cb = item.challengeBtn;
                if (cb && this._hit(x, y, cb)) {
                    this._startPlazaChallenge(item.stage);
                    return;
                }
            }
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
