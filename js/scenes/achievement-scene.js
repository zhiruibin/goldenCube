/**
 * AchievementScene - 成就场景
 * 职责：按系列展示成就列表（图标/名称/描述/进度/奖励），支持切换系列与返回
 */

const { Button } = require('../widgets/button');
const { getAllAchievements, categoryNames } = require('../../data/achievements');
const { achievementManager } = require('../../utils/achievement-manager');
const { drawCoinHudCentered } = require('../../utils/coin-hud');
const IconRenderer = require('../render/icon-renderer');

const CATEGORY_ORDER = ['progress', 'plaza', 'workshop', 'social'];

class AchievementScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._category = 'progress';
        this._scrollY = 0;
        this._tabAreas = [];
        this._list = [];
        this._touchId = null;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._isScrolling = false;
        this._suppressTap = false;
    }

    onEnter(params) {
        this._params = params || {};
        this._category = 'progress';
        this._scrollY = 0;
        achievementManager.init();
        achievementManager.checkAll();
        this._buildList();
        this._initUI();
    }

    onExit() {
        this._buttons = [];
    }

    onPause() {}

    onResume() {}

    update(dt) {}

    _buildList() {
        const all = getAllAchievements();
        this._list = all.filter((a) => a.category === this._category);
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        ctx.fillStyle = '#0f0f23';
        ctx.fillRect(0, 0, W, H);

        // 标题（图标 + 文字整体居中，参考设置页布局）
        const titleText = '成就';
        const titleY = this._topInset() + 16;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const titleW = ctx.measureText(titleText).width;
        const iconSize = 24;
        const gap = 8;
        const totalW = iconSize + gap + titleW;
        const leftX = W / 2 - totalW / 2;
        ctx.fillStyle = '#ffffff';
        IconRenderer.draw(ctx, 'trophy', leftX + iconSize / 2, titleY, iconSize, '#ffffff');
        ctx.fillText(titleText, leftX + iconSize + gap + titleW / 2, titleY);


        // 完成度（仅计当前有效成就，不含 deprecated）
        const activeIds = new Set(getAllAchievements().map((a) => a.id));
        const unlockedCount = achievementManager.getUnlocked().filter((id) => activeIds.has(id)).length;
        const total = getAllAchievements().length;
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'left';
        ctx.fillText(`${unlockedCount}/${total}`, 20, this._topInset() + 16);

        // 金币（Title 下方居中一行，避免与居中标题抢横向空间）
        drawCoinHudCentered(ctx, W, titleY + 30, wx.getStorageSync('gc_coins') || 0);

        this._renderTabs(ctx);
        this._renderList(ctx);
        for (const btn of this._buttons) {
            btn.render(ctx);
        }
    }

    _renderTabs(ctx) {
        const W = GameGlobal.game.width;
        const n = CATEGORY_ORDER.length;
        const gap = 5;
        const tabH = 30;
        const tabW = Math.min(72, Math.floor((W - 24 - gap * (n - 1)) / n));
        const tabY = this._topInset() + 68;
        const totalW = n * tabW + (n - 1) * gap;
        const startX = (W - totalW) / 2;

        this._tabAreas = [];
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < CATEGORY_ORDER.length; i++) {
            const key = CATEGORY_ORDER[i];
            const x = startX + i * (tabW + gap);
            const active = this._category === key;
            ctx.fillStyle = active ? '#00c6ff' : 'rgba(255,255,255,0.1)';
            this._roundRect(ctx, x, tabY, tabW, tabH, 6);
            ctx.fill();
            ctx.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.5)';
            ctx.fillText(categoryNames[key] || key, x + tabW / 2, tabY + tabH / 2);
            this._tabAreas.push({ x, y: tabY, w: tabW, h: tabH, key });
        }
    }

    _renderList(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const startY = this._topInset() + 114;
        const itemH = 62;
        const listW = Math.min(340, W * 0.88);
        const listX = (W - listW) / 2;
        const unlocked = achievementManager.getUnlocked();

        const maxScroll = this._getMaxScroll();
        if (this._scrollY > maxScroll) this._scrollY = maxScroll;

        // 裁剪列表绘制区域：顶部不覆盖分类 Tab，底部不进入返回按钮区域
        const viewBottom = H - 90;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, startY, W, viewBottom - startY);
        ctx.clip();

        for (let i = 0; i < this._list.length; i++) {
            const a = this._list[i];
            const y = startY + i * (itemH + 6) - this._scrollY;
            if (y + itemH < startY || y > viewBottom) continue;

            const isUnlocked = unlocked.indexOf(a.id) >= 0;

            ctx.fillStyle = isUnlocked ? 'rgba(0,200,255,0.10)' : 'rgba(255,255,255,0.05)';
            this._roundRect(ctx, listX, y, listW, itemH, 8);
            ctx.fill();

            // 图标
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            IconRenderer.draw(ctx, isUnlocked ? a.icon : 'lock', listX + 28, y + itemH / 2, 26, '#ffffff');

            // 名称
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isUnlocked ? '#00f0f0' : 'rgba(255,255,255,0.75)';
            ctx.fillText(a.name, listX + 56, y + 10);

            // 描述
            ctx.font = '11px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(a.desc, listX + 56, y + 30);

            // 奖励：金方块优先，其次金币；双零仅点亮徽章
            const gold = Number(a.rewardGold) || 0;
            const coins = Number(a.rewardCoins) || Number(a.reward) || 0;
            const textRight = listX + listW - 20;
            const gap = 4;
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'right';
            if (gold > 0 || coins > 0) {
                const rewardText = gold > 0 ? `+${gold}` : `+${coins}`;
                const iconName = gold > 0 ? 'diamond' : 'coin';
                ctx.fillStyle = '#ffd700';
                ctx.fillText(rewardText, textRight, y + itemH - 26);
                IconRenderer.draw(
                    ctx,
                    iconName,
                    textRight - ctx.measureText(rewardText).width - gap - 7,
                    y + itemH - 20,
                    14,
                    '#ffd700'
                );
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillText('徽章', textRight, y + itemH - 26);
            }

            if (isUnlocked) {
                ctx.fillStyle = '#00f000';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText('已完成', listX + listW - 12, y + 8);
            } else {
                const prog = achievementManager.getProgress(a);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'right';
                const showCur = typeof prog.current === 'number' ? Math.min(prog.current, prog.target) : prog.current;
                ctx.fillText(`${showCur}/${prog.target}`, listX + listW - 12, y + 8);
            }
        }

        ctx.restore();
    }

    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const btnW = Math.min(260, W * 0.7);
        const btnH = 48;
        this._buttons = [
            new Button({
                x: W / 2 - btnW / 2, y: H - 80,
                w: btnW, h: btnH,
                text: '← 返回',
                color: '#555',
                onClick: () => GameGlobal.game.sceneManager.back(),
            }),
        ];
    }

    handleTap(x, y) {
        if (this._suppressTap) {
            this._suppressTap = false;
            return;
        }
        for (const area of this._tabAreas) {
            if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
                if (area.key !== this._category) {
                    this._category = area.key;
                    this._scrollY = 0;
                    this._buildList();
                }
                return;
            }
        }
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
    }

    /** 计算当前分类列表的最大可滚动距离 */
    _getMaxScroll() {
        const H = GameGlobal.game.height;
        const startY = this._topInset() + 114;
        const itemH = 62;
        const gap = 6;
        const count = this._list.length;
        const contentBottom = startY + count * (itemH + gap) - gap;
        const viewBottom = H - 90;
        return Math.max(0, contentBottom - viewBottom);
    }

    handleTouchStart(identifier, x, y) {
        this._touchId = identifier;
        this._touchStartX = x;
        this._touchStartY = y;
        this._isScrolling = false;
    }

    handleTouchMove(identifier, x, y) {
        if (identifier !== this._touchId) return;
        const dx = x - this._touchStartX;
        const dy = y - this._touchStartY;
        if (!this._isScrolling) {
            if (Math.abs(dy) < 12 && Math.abs(dx) < 12) return;
            this._isScrolling = true;
        }
        this._scrollY = Math.max(0, Math.min(this._getMaxScroll(), this._scrollY - dy));
        this._touchStartX = x;
        this._touchStartY = y;
    }

    handleTouchEnd(identifier) {
        if (identifier === -1 || identifier === this._touchId) {
            this._touchId = null;
            if (this._isScrolling) {
                this._suppressTap = true;
            }
            this._isScrolling = false;
        }
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    _topInset() {
        const sys = GameGlobal.game.systemInfo || {};
        return Math.max(sys.statusBarHeight || 0, (sys.safeArea && sys.safeArea.top) || 0);
    }

}

module.exports = AchievementScene;
