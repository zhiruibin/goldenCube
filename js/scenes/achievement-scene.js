/** 徽章图鉴：矿洞收藏陈列墙。 */
const { Button } = require('../widgets/button');
const IconRenderer = require('../render/icon-renderer');
const { LIST_FRAME_INTERVAL } = require('../runtime/frame-budget');
const { drawThemeBackground, drawThemeImageContain, getThemeImage, fillThemeVeil } = require('../theme/theme-images');
const { layoutTabRow } = require('../widgets/tab-layout');
const { fillNightBackground, drawBrandTitle } = require('../theme/arcade-night');
const { roundRectPath } = require('../render/board-tiles');
const catalog = require('../../data/badge-catalog');
const badgeProgressSignal = require('../../utils/badge-progress-signal');

const PALETTES = [
    { rim: '#d8aa55', inner: '#6f431d', icon: '#ffd878' },
    { rim: '#79b8ad', inner: '#245d5c', icon: '#b9eee2' },
    { rim: '#bd8250', inner: '#633a2b', icon: '#f0bb83' },
];

class AchievementScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._category = 'chapter';
        this._badges = [];
        this._tabAreas = [];
        this._badgeAreas = [];
        this._scrollY = 0;
        this._maxScroll = 0;
        this._touchId = null;
        this._touchStartY = 0;
        this._isScrolling = false;
        this._suppressTap = false;
        this._detail = null;
        this._snapshot = null;
        this._unsubscribeProgress = null;
        this._scrollVelocity = 0;
        this._inertiaActive = false;
        this._lastTouchTime = 0;
    }

    onEnter(params) {
        this._params = params || {};
        this._category = catalog.CATEGORY_ORDER.indexOf(this._params.category) >= 0
            ? this._params.category : 'chapter';
        this._scrollY = 0;
        this._refreshSnapshot();
        this._unsubscribeProgress = badgeProgressSignal.subscribe(() => this._refreshSnapshot());
        this._initUI();
    }

    onExit() {
        this._buttons = [];
        if (this._unsubscribeProgress) this._unsubscribeProgress();
        this._unsubscribeProgress = null;
        this._inertiaActive = false;
    }
    onPause() {}
    onResume() { this._refreshSnapshot(); }
    update(dt) {
        if (!this._inertiaActive) return;
        const step = Math.min(.05, Math.max(0, Number(dt) || 0));
        const before = this._scrollY;
        this._scrollY = Math.max(0, Math.min(this._maxScroll, this._scrollY + this._scrollVelocity * step));
        this._scrollVelocity *= Math.exp(-7.5 * step);
        if (this._scrollY === before || Math.abs(this._scrollVelocity) < 8) {
            this._scrollVelocity = 0;
            this._inertiaActive = false;
        }
    }
    getRenderInterval() { return this._inertiaActive ? LIST_FRAME_INTERVAL : 0; }

    _requestRender() {
        try {
            if (GameGlobal && GameGlobal.game && typeof GameGlobal.game.kickLoop === 'function') {
                GameGlobal.game.kickLoop();
            }
        } catch (e) { /* ignore */ }
    }

    _refreshSnapshot() {
        const detailId = this._detail && this._detail.id;
        this._snapshot = catalog.getSnapshot();
        this._badges = this._snapshot.categories[this._category] || [];
        this._detail = detailId ? (this._badges.find((badge) => badge.id === detailId) || null) : null;
        this._requestRender();
    }

    _topInset() {
        const sys = GameGlobal.game.systemInfo || {};
        return Math.max(sys.statusBarHeight || 0, (sys.safeArea && sys.safeArea.top) || 0);
    }

    _metrics() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const top = this._topInset();
        const titleY = top + 18;
        const progressY = titleY + 43;
        const tabsY = progressY + 46;
        const wallTop = tabsY + 43;
        const bottomY = H - 72;
        return { W, H, top, titleY, progressY, tabsY, wallTop, bottomY };
    }

    render(ctx) {
        const m = this._metrics();
        if (!drawThemeBackground(ctx, 'mapMineBg', m.W, m.H)) fillNightBackground(ctx, m.W, m.H);
        else fillThemeVeil(ctx, m.W, m.H, 0.42);
        drawBrandTitle(ctx, '徽章图鉴', m.W / 2, m.titleY, 'bold 27px sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(245,226,194,.68)'; ctx.font = '11px sans-serif';
        ctx.fillText('完成冒险目标，点亮收藏徽章', m.W / 2, m.titleY + 25);
        this._drawProgress(ctx, m);
        this._drawTabs(ctx, m);
        this._drawWall(ctx, m);
        this._buttons.forEach((button) => button.render(ctx));
        if (this._detail) this._drawDetail(ctx, m, this._detail);
    }

    _drawProgress(ctx, m) {
        const summary = (this._snapshot && this._snapshot.summary) || { owned: 0, total: 0 };
        const x = 16; const y = m.progressY; const w = m.W - 32; const h = 36;
        roundRectPath(ctx, x, y, w, h, 9);
        ctx.fillStyle = 'rgba(39,24,12,.86)'; ctx.fill();
        ctx.strokeStyle = 'rgba(176,125,61,.70)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f2dfbc'; ctx.font = 'bold 12px sans-serif';
        ctx.fillText('已获得 ' + summary.owned + ' / ' + summary.total, x + 12, y + 11);
        const barX = x + 12; const barY = y + 23; const barW = w - 24;
        roundRectPath(ctx, barX, barY, barW, 6, 3);
        ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fill();
        if (summary.total > 0 && summary.owned > 0) {
            roundRectPath(ctx, barX, barY, Math.max(6, barW * summary.owned / summary.total), 6, 3);
            ctx.fillStyle = '#d7a83e'; ctx.fill();
        }
    }

    _drawTabs(ctx, m) {
        const order = catalog.CATEGORY_ORDER;
        const layout = layoutTabRow(m.W, order.length, { gap: 1, side: 12, height: 36, maxWidth: 82 });
        this._tabAreas = [];
        for (let i = 0; i < order.length; i++) {
            const key = order[i]; const x = layout.xAt(i); const active = key === this._category;
            const stat = (this._snapshot && this._snapshot.categoryStats[key]) || { owned: 0, total: 0 };
            const drawn = drawThemeImageContain(ctx, active ? 'cardStageGold' : 'cardStageBrown',
                x + layout.width / 2, m.tabsY + 18, layout.width, 36);
            if (!drawn.drawn) {
                roundRectPath(ctx, x, m.tabsY, layout.width, 36, 6);
                ctx.fillStyle = active ? '#c99b32' : '#523824'; ctx.fill();
            }
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = active ? '#2b1809' : '#f0dfc5';
            ctx.fillText(catalog.CATEGORY_NAMES[key] + ' ' + stat.owned + '/' + stat.total,
                x + layout.width / 2, m.tabsY + 18);
            this._tabAreas.push({ x, y: m.tabsY, w: layout.width, h: 36, key });
        }
    }

    _drawWall(ctx, m) {
        const wallX = 12; const wallW = m.W - 24;
        const wallBottom = m.bottomY - 12; const wallH = wallBottom - m.wallTop;
        roundRectPath(ctx, wallX, m.wallTop, wallW, wallH, 10);
        ctx.fillStyle = 'rgba(45,27,14,.91)'; ctx.fill();
        ctx.strokeStyle = 'rgba(145,94,47,.76)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save();
        ctx.beginPath(); ctx.rect(wallX + 3, m.wallTop + 3, wallW - 6, wallH - 6); ctx.clip();
        const cols = 3; const pad = 8; const gap = 4;
        const cellW = (wallW - pad * 2 - gap * (cols - 1)) / cols;
        const cellH = 126; const rows = Math.ceil(this._badges.length / cols);
        this._maxScroll = Math.max(0, rows * cellH + pad * 2 - wallH);
        this._scrollY = Math.max(0, Math.min(this._maxScroll, this._scrollY));
        this._badgeAreas = [];
        for (let i = 0; i < this._badges.length; i++) {
            const badge = this._badges[i]; const col = i % cols; const row = Math.floor(i / cols);
            const x = wallX + pad + col * (cellW + gap);
            const y = m.wallTop + pad + row * cellH - this._scrollY;
            if (y + cellH < m.wallTop || y > wallBottom) continue;
            this._drawBadge(ctx, badge, x, y, cellW, cellH - 4);
            // 命中区域必须与徽章墙的可见裁剪范围一致，避免点到底部返回钮时
            // 命中已经被裁掉、肉眼看不到的徽章。
            const hitTop = Math.max(y, m.wallTop + 3);
            const hitBottom = Math.min(y + cellH - 4, wallBottom - 3);
            if (hitBottom > hitTop) {
                this._badgeAreas.push({ x, y: hitTop, w: cellW, h: hitBottom - hitTop, badge });
            }
        }
        ctx.restore();
        if (!this._badges.length) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,239,210,.55)'; ctx.font = '13px sans-serif';
            ctx.fillText('暂无可展示徽章', m.W / 2, m.wallTop + wallH / 2);
        }
    }

    _drawBadge(ctx, badge, x, y, w) {
        const cx = x + w / 2; const cy = y + 43;
        const radius = Math.min(34, w * .31); const palette = PALETTES[badge.palette % PALETTES.length];
        ctx.save();
        let drewImage = false;
        const imageKey = badge.owned ? badge.image : (badge.lockedImage || badge.image);
        if (imageKey) {
            const image = getThemeImage(imageKey);
            if (image.ready && image.img) {
                // 滚动热路径关闭实时模糊阴影；停下后的最终帧会恢复微光。
                if (badge.owned && !this._isScrolling && !this._inertiaActive) {
                    ctx.shadowColor = 'rgba(240,181,66,.34)'; ctx.shadowBlur = 8;
                }
                const artRadius = radius + 5;
                const grayLocked = !badge.owned && !badge.lockedImage
                    && ['chapter', 'plaza', 'memorial'].indexOf(badge.category) >= 0;
                const dimFallback = !badge.owned && !badge.lockedImage && !grayLocked;
                const previousFilter = ctx.filter;
                let filterApplied = false;
                if (grayLocked && typeof previousFilter === 'string') {
                    ctx.filter = 'grayscale(1) brightness(.72) contrast(1.15)';
                    filterApplied = ctx.filter !== previousFilter;
                } else if (dimFallback) {
                    ctx.globalAlpha = .38;
                }
                if (Number.isInteger(badge.atlasIndex)) {
                    const cols = Math.max(1, badge.atlasCols || 1);
                    const rows = Math.max(1, badge.atlasRows || 1);
                    const sourceW = image.img.width / cols;
                    const sourceH = image.img.height / rows;
                    const sourceX = (badge.atlasIndex % cols) * sourceW;
                    const sourceY = Math.floor(badge.atlasIndex / cols) * sourceH;
                    ctx.drawImage(image.img, sourceX, sourceY, sourceW, sourceH,
                        cx - artRadius, cy - artRadius, artRadius * 2, artRadius * 2);
                } else {
                    ctx.drawImage(image.img, cx - artRadius, cy - artRadius, artRadius * 2, artRadius * 2);
                }
                if (filterApplied) ctx.filter = previousFilter;
                ctx.globalAlpha = 1;
                if (grayLocked && !filterApplied) {
                    // 不支持 Canvas filter 的运行环境使用饱和度混合降为灰阶，不叠加暗色蒙层。
                    ctx.save();
                    ctx.globalCompositeOperation = 'saturation';
                    ctx.beginPath(); ctx.arc(cx, cy, artRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#000'; ctx.fill();
                    ctx.restore();
                } else if (dimFallback) {
                    ctx.beginPath(); ctx.arc(cx, cy, radius * .74, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(18,20,20,.50)'; ctx.fill();
                }
                drewImage = true;
            }
        }
        if (!drewImage) {
            if (badge.owned && !this._isScrolling && !this._inertiaActive) {
                ctx.shadowColor = 'rgba(240,181,66,.34)'; ctx.shadowBlur = 8;
            }
            ctx.beginPath(); ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
            ctx.fillStyle = badge.owned ? palette.rim : '#58534d'; ctx.fill();
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = badge.owned ? palette.inner : '#292827'; ctx.fill();
            ctx.strokeStyle = badge.owned ? 'rgba(255,229,154,.55)' : 'rgba(185,180,170,.28)';
            ctx.lineWidth = 1.5; ctx.stroke();
            IconRenderer.draw(ctx, badge.icon || 'medal', cx, cy, radius * 1.05,
                badge.owned ? palette.icon : 'rgba(174,170,164,.45)');
        }
        ctx.restore();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = badge.owned ? '#f2ddb7' : 'rgba(224,215,201,.68)';
        ctx.fillText(badge.name, cx, y + 98, w - 4);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = badge.owned ? '#d9a94f' : 'rgba(210,201,188,.50)';
        const current = Math.min(Number(badge.current) || 0, Number(badge.target) || 0);
        ctx.fillText(badge.owned ? '已获得' : (current + '/' + badge.target), cx, y + 116, w - 4);
    }

    _drawDetail(ctx, m, badge) {
        ctx.fillStyle = 'rgba(5,3,2,.72)'; ctx.fillRect(0, 0, m.W, m.H);
        const w = Math.min(300, m.W - 36); const h = 220;
        const x = (m.W - w) / 2; const y = (m.H - h) / 2;
        roundRectPath(ctx, x, y, w, h, 14);
        ctx.fillStyle = 'rgba(49,30,15,.98)'; ctx.fill();
        ctx.strokeStyle = 'rgba(211,160,75,.78)'; ctx.lineWidth = 2; ctx.stroke();
        this._drawBadge(ctx, badge, x + w / 2 - 60, y + 18, 120);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f5e1bc'; ctx.font = '12px sans-serif';
        ctx.fillText(badge.description, x + w / 2, y + 151, w - 30);
        ctx.fillStyle = badge.owned ? '#d9aa4e' : 'rgba(229,218,198,.62)';
        ctx.fillText(badge.owned ? '徽章已收入图鉴' : ('当前进度 ' + badge.current + '/' + badge.target),
            x + w / 2, y + 177);
        ctx.fillStyle = 'rgba(255,244,224,.46)'; ctx.font = '11px sans-serif';
        ctx.fillText('点击任意位置关闭', x + w / 2, y + 202);
    }

    _initUI() {
        const m = this._metrics(); const h = 48; const w = Math.min(220, m.W - 60);
        this._buttons = [new Button({
            x: (m.W - w) / 2, y: m.H - 62, w, h, text: '返回', color: '#6b4a2e',
            skin: 'btnBarBrown', skinMode: 'stretch', labelColor: '#fff8ef', fontScale: .92,
            onClick: () => GameGlobal.game.sceneManager.back(),
        })];
    }

    handleTap(x, y) {
        if (this._suppressTap) { this._suppressTap = false; return; }
        if (this._detail) { this._detail = null; this._requestRender(); return; }
        // 固定操作按钮优先于滚动内容，禁止底层徽章“穿透”返回按钮。
        for (const button of this._buttons) {
            if (button.hitTest(x, y)) { button.trigger(); return; }
        }
        for (const area of this._tabAreas) {
            if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
                if (area.key !== this._category) {
                    this._category = area.key;
                    this._scrollY = 0;
                    this._badges = (this._snapshot && this._snapshot.categories[area.key]) || [];
                    this._requestRender();
                }
                return;
            }
        }
        for (const area of this._badgeAreas) {
            if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
                this._detail = area.badge; this._requestRender(); return;
            }
        }
    }

    handleTouchStart(identifier, x, y) {
        this._touchId = identifier;
        this._touchStartY = y;
        this._isScrolling = false;
        this._scrollVelocity = 0;
        this._inertiaActive = false;
        this._lastTouchTime = Date.now();
    }

    handleTouchMove(identifier, x, y) {
        if (identifier !== this._touchId || this._detail) return;
        const dy = y - this._touchStartY;
        if (!this._isScrolling && Math.abs(dy) < 10) return;
        this._isScrolling = true;
        const now = Date.now();
        const elapsed = Math.max(8, now - (this._lastTouchTime || now));
        const next = Math.max(0, Math.min(this._maxScroll, this._scrollY - dy));
        const instantVelocity = (next - this._scrollY) * 1000 / elapsed;
        this._scrollVelocity = this._scrollVelocity * .35 + instantVelocity * .65;
        this._scrollY = next;
        this._touchStartY = y;
        this._lastTouchTime = now;
    }

    handleTouchEnd(identifier) {
        if (identifier === -1 || identifier === this._touchId) {
            this._touchId = null;
            if (this._isScrolling) this._suppressTap = true;
            this._inertiaActive = this._isScrolling && Math.abs(this._scrollVelocity) >= 40;
            this._isScrolling = false;
            this._requestRender();
        }
    }
}

module.exports = AchievementScene;
