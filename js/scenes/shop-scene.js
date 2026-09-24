/**
 * ShopScene - 商店场景
 * 职责：方块、棋盘和背景主题。已获得或试用中可直接装备；未获得弹出说明，广告可用时可看视频试用 3 天。
 */

const { Button } = require('../widgets/button');
const IconRenderer = require('../render/icon-renderer');
const { blockSkins, boardSkins, soundPackProfiles } = require('../../data/skins');
const { themeBackgrounds } = require('../../data/themes');
const { LIST_FRAME_INTERVAL } = require('../runtime/frame-budget');
const { drawThemeBackground, drawThemeImageContain, drawThemeButtonSkin, fillThemeVeil } = require('../theme/theme-images');
const { layoutTabRow } = require('../widgets/tab-layout');
const { fillNightBackground, drawBrandTitle, SUBTITLE } = require('../theme/arcade-night');
const { fillGoldBorderedPanel } = require('../../utils/stage-entry-ui');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const skinTrial = require('../../utils/skin-trial');

class ShopScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._tab = 'block'; // 'block' | 'board' | 'theme'
        this._scrollY = 0;
        this._tabAreas = [];
        // 缓存本地存储数据，避免渲染帧内频繁读 storage
        this._owned = [];
        this._equipped = {};
        this._touchId = null;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._isScrolling = false;
        this._suppressTap = false;
        this._detail = null;
        this._detailBusy = false;
        this._trialTick = 0;
        this._trialByTab = { block: null, board: null, theme: null };
    }

    onEnter(params) {
        this._params = params || {};
        this._tab = 'block';
        this._scrollY = 0;
        this._refreshCache();
        this._initUI();
    }

    onExit() {
        this._buttons = [];
    }

    /** 从本地存储刷新一次缓存（进入场景时调用） */
    _refreshCache() {
        skinTrial.retireSoundShopTab();
        this._owned = wx.getStorageSync('gc_ownedItems') || [];
        const all = blockSkins.concat(boardSkins, themeBackgrounds);
        const nextOwned = this._owned.slice();
        all.forEach((item) => {
            if (nextOwned.indexOf(item.id) >= 0 || item.unlockCondition === 'default') return;
            if (this._canUnlockByCondition(item)) nextOwned.push(item.id);
        });
        if (nextOwned.length !== this._owned.length) {
            this._owned = nextOwned;
            wx.setStorageSync('gc_ownedItems', nextOwned);
        }
        skinTrial.settle();
        this._equipped = {
            block: wx.getStorageSync('gc_equipped_block') || 'default',
            board: wx.getStorageSync('gc_equipped_board') || 'default',
            theme: wx.getStorageSync('gc_equipped_theme') || 'default',
        };
        this._trialByTab = {
            block: skinTrial.getActive('block'),
            board: skinTrial.getActive('board'),
            theme: skinTrial.getActive('theme'),
        };
    }

    onPause() {}

    onResume() {}

    getRenderInterval() {
        return LIST_FRAME_INTERVAL;
    }

    update() {
        const now = Date.now();
        if (now - this._trialTick < 1000) return;
        this._trialTick = now;
        skinTrial.settle();
        this._equipped = {
            block: wx.getStorageSync('gc_equipped_block') || 'default',
            board: wx.getStorageSync('gc_equipped_board') || 'default',
            theme: wx.getStorageSync('gc_equipped_theme') || 'default',
        };
        this._trialByTab = {
            block: skinTrial.getActive('block'),
            board: skinTrial.getActive('board'),
            theme: skinTrial.getActive('theme'),
        };
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 金矿工坊主题背景
        if (!drawThemeBackground(ctx, 'mapMineBg', W, H)) {
            fillNightBackground(ctx, W, H);
        } else {
            fillThemeVeil(ctx, W, H, 0.36);
        }

        const titleY = this._topInset() + 16;
        drawBrandTitle(ctx, '皮肤', W / 2, titleY, 'bold 28px sans-serif');

        // Tab 切换
        this._renderTabs(ctx);
        // 商品列表
        this._renderItems(ctx);

        // 按钮
        for (const btn of this._buttons) {
            btn.render(ctx);
        }
        this._renderDetail(ctx);
    }

    _renderTabs(ctx) {
        const W = GameGlobal.game.width;
        const tabs = [
            { key: 'block', label: '方块' },
            { key: 'board', label: '棋盘' },
            { key: 'theme', label: '主题' },
        ];
        const layout = layoutTabRow(W, tabs.length, { gap: 0, side: 12, height: 40, maxWidth: 90 });
        const tabW = layout.width;
        const tabH = layout.height;
        const tabY = this._topInset() + 71;

        this._tabAreas = [];
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < tabs.length; i++) {
            const x = layout.xAt(i);
            const active = this._tab === tabs[i].key;
            const skin = active ? 'cardStageGold' : 'cardStageBrown';
            const drawn = drawThemeImageContain(
                ctx, skin, x + tabW / 2, tabY + tabH / 2, tabW, tabH
            );
            if (!drawn.drawn) {
                ctx.fillStyle = active ? '#c9a227' : '#5a4030';
                this._roundRect(ctx, x, tabY, tabW, tabH, 6);
                ctx.fill();
            }

            ctx.fillStyle = active ? '#241408' : '#ffffff';
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 1;
            ctx.fillText(tabs[i].label, x + tabW / 2, tabY + tabH / 2 + 1);
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            this._tabAreas.push({ x, y: tabY, w: tabW, h: tabH, tab: tabs[i].key });
        }
    }

    _renderItems(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const startY = this._listTop();
        const itemH = 80;
        const listW = Math.min(340, W * 0.85);
        const listX = (W - listW) / 2;
        const clipBottom = H - 90; // 返回按钮上方留 10px，列表可视区域底部

        const items = this._currentItems();

        const owned = this._owned;
        const equipped = this._equipped[this._tab] || 'default';

        // 裁剪列表绘制区域：顶部不覆盖类别 Tab，底部不进入返回按钮区域
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, startY - 4, W, clipBottom - startY + 4);
        ctx.clip();

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const y = startY + i * (itemH + 8) - this._scrollY;

            if (y + itemH < startY || y > clipBottom) continue;

            // 卡片背景（矿洞主题）
            ctx.fillStyle = 'rgba(28, 20, 14, 0.88)';
            this._roundRect(ctx, listX, y, listW, itemH, 10);
            ctx.fill();
            this._roundRect(ctx, listX + 0.75, y + 0.75, listW - 1.5, itemH - 1.5, 9);
            ctx.strokeStyle = 'rgba(31, 155, 152, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 方块皮肤预览（所见即所得：完整皮肤特性 + 7 种方块色）
            if (this._tab === 'block') {
                this._drawBlockPreview(ctx, item, listX + 15, y + (itemH - 28) / 2);
            }

            // 棋盘皮肤预览（迷你棋盘缩略图 + 动态特效示意）
            if (this._tab === 'board') {
                this._drawBoardPreview(ctx, item, listX + 15, y + 14, 44);
            }

            if (this._tab === 'theme') {
                this._drawThemePreview(ctx, item, listX + 15, y + 14, 44);
            }

            // 名称和描述（描述按右侧文案预留空间，超长自动省略号截断，避免与条件/价格重叠）
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(item.name, listX + 80, y + 12);

            const isOwned = owned.includes(item.id) || item.unlockCondition === 'default';
            const isEquipped = equipped === item.id;
            const trialLeft = this._trialRemainText(item.id);

            let rightText = '';
            let rightFont = '14px sans-serif';
            let rightColor = '#ffd700';
            if (isEquipped) {
                rightText = '使用中';
                rightFont = 'bold 14px sans-serif';
                rightColor = '#8fd36a';
            } else if (isOwned) {
                rightText = '装备';
                rightFont = '14px sans-serif';
                rightColor = '#c9a227';
            } else if (trialLeft) {
                rightText = trialLeft;
                rightFont = '12px sans-serif';
                rightColor = '#ffd700';
            } else if (item.unlockCondition) {
                rightText = '条件解锁';
                rightFont = '12px sans-serif';
                rightColor = '#a0a0a0';
            } else {
                rightText = '未解锁';
                rightColor = '#a0a0a0';
            }

            ctx.font = rightFont;
            let rightW = ctx.measureText(rightText).width;
            if (trialLeft && isEquipped) {
                ctx.font = '12px sans-serif';
                rightW = Math.max(rightW, ctx.measureText(trialLeft).width);
            }

            ctx.font = '12px sans-serif';
            const descX = listX + 80;
            const descMaxW = (listX + listW - 15 - rightW - 8) - descX;
            const desc = this._fitText(ctx, item.description || '', descMaxW);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(desc, descX, y + 34);

            const rightX = listX + listW - 15;
            ctx.textAlign = 'right';
            if (trialLeft && isEquipped) {
                ctx.font = 'bold 14px sans-serif';
                ctx.fillStyle = '#8fd36a';
                ctx.fillText('使用中', rightX, y + 22);
                ctx.font = '12px sans-serif';
                ctx.fillStyle = '#ffd700';
                ctx.fillText(trialLeft, rightX, y + 46);
            } else {
                ctx.font = rightFont;
                ctx.fillStyle = rightColor;
                ctx.fillText(rightText, rightX, y + itemH / 2 - 7);
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
                text: '返回',
                color: '#6b4a2e',
                skin: 'btnBarBrown',
                skinMode: 'stretch',
                labelColor: '#fff8ef',
                fontScale: 0.92,
                onClick: () => GameGlobal.game.sceneManager.back(),
            }),
        ];
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

    /**
     * 绘制方块皮肤预览（所见即所得）
     * 与 PieceRenderer._drawCell 使用相同的皮肤特性渲染：
     * 渐变 gradient / 发光 glow / 纹理 texture / 透明度 transparency / 闪耀 shimmer
     * 展示该皮肤下 7 种方块的配色与质感
     */
    _drawBlockPreview(ctx, item, x, y) {
        const order = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        const colors = item.colors || {};
        const cell = 12;
        const gap = 3;
        const glow = !!item.glow;
        const shimmer = !!item.shimmer;
        const softGlass = !!item.softGlass;
        const texture = item.texture || null;
        const transparency = (typeof item.transparency === 'number' && item.transparency >= 0 && item.transparency <= 1)
            ? item.transparency : 1;

        order.forEach((type, i) => {
            const cx = x + (i % 4) * (cell + gap);
            const cy = y + Math.floor(i / 4) * (cell + gap);
            const raw = colors[type] || '#888888';
            const gradColors = Array.isArray(raw) ? raw : null;
            const color = gradColors ? gradColors[0] : raw;

            ctx.save();
            if (transparency < 1) {
                ctx.globalAlpha = transparency;
            }

            // 主体填充：渐变或纯色
            let faceStyle = color;
            if (gradColors && gradColors.length >= 2) {
                let grad = null;
                try {
                    grad = softGlass
                        ? ctx.createLinearGradient(0, cy, 0, cy + cell)
                        : ctx.createLinearGradient(cx, cy, cx + cell, cy + cell);
                    grad.addColorStop(0, gradColors[0]);
                    grad.addColorStop(1, gradColors[1]);
                } catch (e) {
                    grad = null;
                }
                faceStyle = grad || color;
                ctx.fillStyle = faceStyle;
            } else {
                ctx.fillStyle = faceStyle;
            }

            // 发光效果（霓虹）
            if (glow) {
                ctx.shadowColor = color;
                ctx.shadowBlur = cell * 0.5;
                ctx.fillRect(cx, cy, cell, cell);
                ctx.shadowBlur = 0;
                ctx.fillStyle = color;
                ctx.fillRect(cx, cy, cell, cell);
            } else {
                ctx.fillRect(cx, cy, cell, cell);
            }

            // 纹理
            if (texture) {
                this._drawPreviewTexture(ctx, cx, cy, cell, texture);
            }

            // 高光（左上）
            ctx.fillStyle = softGlass ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.25)';
            const lightW = softGlass ? 1 : 2;
            ctx.fillRect(cx, cy, cell, lightW);
            ctx.fillRect(cx, cy, lightW, cell);

            // 阴影（右下）
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            const shadeW = softGlass ? 1 : 2;
            ctx.fillRect(cx, cy + cell - shadeW, cell, shadeW);
            ctx.fillRect(cx + cell - shadeW, cy, shadeW, cell);

            if (softGlass) {
                ctx.strokeStyle = 'rgba(28,17,38,0.48)';
                ctx.lineWidth = 1;
                ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
            }

            // 闪耀光泽（黄金 shimmer）
            if (shimmer) {
                ctx.globalAlpha = 0.35;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(cx + 2, cy + cell - 2);
                ctx.lineTo(cx + cell - 2, cy + 2);
                ctx.lineTo(cx + cell - 2, cy + 6);
                ctx.lineTo(cx + 6, cy + cell - 2);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        });
    }

    /**
     * 绘制方块皮肤纹理（预览用，与 PieceRenderer._applyTexture 一致）
     */
    _drawPreviewTexture(ctx, x, y, size, texture) {
        switch (texture) {
            case 'wood': {
                ctx.save();
                ctx.globalAlpha = 0.18;
                ctx.fillStyle = '#5a3e1b';
                for (let sx = x + 3; sx < x + size - 2; sx += 5) {
                    ctx.fillRect(sx, y, 1.5, size);
                }
                ctx.restore();
                break;
            }
            case 'crystal': {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(x + 2, y + 2);
                ctx.lineTo(x + size * 0.45, y + 2);
                ctx.lineTo(x + 2, y + size * 0.45);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'pixel': {
                ctx.save();
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                const sub = 3;
                const subSize = size / sub;
                for (let i = 1; i < sub; i++) {
                    const px = x + i * subSize;
                    ctx.beginPath();
                    ctx.moveTo(px, y);
                    ctx.lineTo(px, y + size);
                    ctx.stroke();
                    const py = y + i * subSize;
                    ctx.beginPath();
                    ctx.moveTo(x, py);
                    ctx.lineTo(x + size, py);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }
            case 'metallic': {
                ctx.save();
                let grad = null;
                try {
                    grad = ctx.createLinearGradient(x, y, x + size, y);
                    grad.addColorStop(0, 'rgba(255,255,255,0)');
                    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
                    grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
                    grad.addColorStop(0.65, 'rgba(255,255,255,0.2)');
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                } catch (e) {
                    grad = null;
                }
                if (grad) {
                    ctx.fillStyle = grad;
                    ctx.fillRect(x, y, size, size);
                }
                ctx.restore();
                break;
            }
            default:
                break;
        }
    }

    /**
     * 绘制棋盘皮肤预览（迷你棋盘缩略图）
     * 背景/网格/边框来自皮肤 style，动态特效为时间驱动动画示意
     */
    _drawBoardPreview(ctx, item, x, y, size) {
        const style = item.style || {};
        const bg = style.background || '#161d30';
        const grid = style.gridColor || 'rgba(255,255,255,0.05)';
        const border = style.borderColor || '#16213e';
        const effect = item.effect || null;

        const cell = size / 4;
        const rows = 4;
        const cols = 4;

        // 背景
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, size, size);

        // 动态特效示意图
        if (effect) {
            this._drawPreviewEffect(ctx, effect, x, y, size);
        }

        // 网格线
        ctx.strokeStyle = grid;
        ctx.lineWidth = 0.5;
        for (let r = 0; r <= rows; r++) {
            ctx.beginPath();
            ctx.moveTo(x, y + r * cell);
            ctx.lineTo(x + size, y + r * cell);
            ctx.stroke();
        }
        for (let c = 0; c <= cols; c++) {
            ctx.beginPath();
            ctx.moveTo(x + c * cell, y);
            ctx.lineTo(x + c * cell, y + size);
            ctx.stroke();
        }

        // 边框
        ctx.strokeStyle = border;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 1, y - 1, size + 2, size + 2);
    }

    /**
     * 绘制棋盘动态特效示意图（星空为时间驱动的缓慢闪烁动画，其余特效为静态示意）
     */
    _drawPreviewEffect(ctx, effect, x, y, size) {
        ctx.save();
        if (effect === 'stars') {
            // 星空：星盘绕预览中心缓慢逆时针旋转 + 增强闪烁（与游戏内星空特效一致的节奏）
            const time = Date.now() / 1000;
            const cx = x + size / 2;
            const cy = y + size / 2;
            const rot = time * 0.4; // 预览转速：约 16 秒一圈，缓慢可感
            const maxR = size * 0.45;
            const stars = [
                { angle: 0.0, radius: maxR * 0.2, r: 1.3, phase: 0.0, speed: 1.1 },
                { angle: 1.8, radius: maxR * 0.55, r: 1.0, phase: 2.1, speed: 0.8 },
                { angle: 3.6, radius: maxR * 0.85, r: 1.1, phase: 4.2, speed: 1.4 },
                { angle: 5.0, radius: maxR * 0.35, r: 1.2, phase: 1.0, speed: 0.9 },
                { angle: 2.6, radius: maxR * 0.7, r: 0.9, phase: 3.3, speed: 0.6 },
                { angle: 4.4, radius: maxR * 0.5, r: 1.0, phase: 5.0, speed: 1.2 },
            ];
            for (const s of stars) {
                const a = s.angle - rot;
                const px = cx + Math.cos(a) * s.radius;
                const py = cy + Math.sin(a) * s.radius;
                const tw = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
                const alpha = 0.15 + 0.85 * tw;
                // 柔和光晕
                ctx.globalAlpha = alpha * 0.25;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(px, py, s.r * 2.6, 0, Math.PI * 2);
                ctx.fill();
                // 星核（亮度高时轻微放大）
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(px, py, s.r * (0.8 + 0.3 * tw), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        } else if (effect === 'bubbles') {
            // 气泡：4~5 个气泡从底部循环上浮，x 随 sin 微摆
            const time = Date.now() / 1000;
            const bubbles = [
                { bx: 0.2, speed: 14, offset: 0.0, r: 3.0, sway: 2.5, phase: 0.0 },
                { bx: 0.45, speed: 18, offset: 0.3, r: 2.0, sway: 2.0, phase: 1.3 },
                { bx: 0.65, speed: 12, offset: 0.55, r: 3.5, sway: 3.0, phase: 2.6 },
                { bx: 0.85, speed: 16, offset: 0.75, r: 2.5, sway: 2.2, phase: 3.9 },
                { bx: 0.3, speed: 20, offset: 0.45, r: 4.0, sway: 2.8, phase: 5.2 },
            ];
            ctx.strokeStyle = '#7ec8ff';
            ctx.lineWidth = 1;
            for (const b of bubbles) {
                const baseX = x + b.bx * size;
                const cycle = size + b.r * 2;
                const py = y + size + b.r - ((time * b.speed + b.offset * cycle) % cycle);
                const px = baseX + Math.sin(time * 1.6 + b.phase) * b.sway;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.arc(px, py, b.r, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (effect === 'matrix') {
            // 数字雨：3~4 列数字随时间循环下落，字符按秒奇偶切换 0/1
            const time = Date.now() / 1000;
            const cols = [
                { cx: 0.2, speed: 10, offset: 0.0 },
                { cx: 0.5, speed: 14, offset: 0.35 },
                { cx: 0.8, speed: 12, offset: 0.6 },
                { cx: 0.35, speed: 16, offset: 0.8 },
            ];
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#00ff66';
            const glyph = Math.floor(time) % 2 === 0 ? '0' : '1';
            for (const c of cols) {
                const cycle = size + 8;
                const py = y - 8 + ((time * c.speed + c.offset * cycle) % cycle);
                const px = x + c.cx * size;
                ctx.globalAlpha = 0.7;
                ctx.fillText(glyph, px, py);
            }
        } else if (effect === 'sakura') {
            // 樱花：4~5 片花瓣循环下落，x 随 sin 左右摇摆
            const time = Date.now() / 1000;
            const petals = [
                { px: 0.15, speed: 11, offset: 0.0, sway: 3.0, phase: 0.0, rot: 0.4 },
                { px: 0.4, speed: 14, offset: 0.25, sway: 2.4, phase: 1.2, rot: 0.9 },
                { px: 0.6, speed: 12, offset: 0.5, sway: 3.4, phase: 2.4, rot: 0.2 },
                { px: 0.85, speed: 15, offset: 0.7, sway: 2.6, phase: 3.6, rot: 0.7 },
                { px: 0.3, speed: 13, offset: 0.4, sway: 3.2, phase: 4.8, rot: 1.1 },
            ];
            ctx.fillStyle = '#ffb6c1';
            for (const p of petals) {
                const cycle = size + 6;
                const py = y - 4 + ((time * p.speed + p.offset * cycle) % cycle);
                const px = x + p.px * size + Math.sin(time * 1.8 + p.phase) * p.sway;
                ctx.globalAlpha = 0.8;
                ctx.beginPath();
                ctx.ellipse(px, py, 2.5, 1.8, p.rot, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (effect === 'lava') {
            // 熔岩：4 个光点位置固定，半径与亮度随 sin(time) 脉动
            const time = Date.now() / 1000;
            const lavas = [
                { lx: 0.12, ly: 0.2, lr: 1.5, phase: 0.0 },
                { lx: 0.85, ly: 0.5, lr: 1.2, phase: 1.6 },
                { lx: 0.5, ly: 0.85, lr: 1.8, phase: 3.2 },
                { lx: 0.85, ly: 0.2, lr: 1.0, phase: 4.8 },
            ];
            ctx.fillStyle = '#ff5a00';
            for (const l of lavas) {
                const pulse = 0.5 + 0.5 * Math.sin(time * 2 + l.phase);
                ctx.globalAlpha = 0.4 + 0.5 * pulse;
                ctx.beginPath();
                ctx.arc(x + l.lx * size, y + l.ly * size, l.lr * (0.75 + 0.5 * pulse), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    _drawThemePreview(ctx, item, x, y, size) {
        ctx.save();
        this._roundRect(ctx, x, y, size, size, 6);
        ctx.clip();
        const drawn = drawThemeImageContain(ctx, item.listKey, x + size / 2, y + size / 2, size, size);
        if (!drawn || !drawn.drawn) {
            ctx.fillStyle = '#3a2a1c';
            ctx.fillRect(x, y, size, size);
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(31, 155, 152, 0.7)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, x, y, size, size, 6);
        ctx.stroke();
    }

    /**
     * 绘制音效包预览（基于真实合成参数的动态频率条）
     * 从 soundPackProfiles 读取各动作合成参数，映射为高低不同的彩色音条并轻微脉动
     */
    _drawSoundPreview(ctx, item, x, y, size) {
        const profile = soundPackProfiles[item.id] || soundPackProfiles.default;
        // 选取有代表性的动作：move / rotate / clear / tetris / levelUp
        const seq = [profile.move, profile.rotate, profile.lineClear, profile.tetris, profile.levelUp];
        const barW = 5;
        const gap = 3;
        const totalW = seq.length * barW + (seq.length - 1) * gap;
        const startX = x + (size - totalW) / 2;
        const bottomY = y + size;
        const time = Date.now() / 500;

        seq.forEach((p, i) => {
            let freq = 400;
            if (p) {
                if (typeof p.freq === 'number') freq = p.freq;
                else if (Array.isArray(p.freqs) && p.freqs.length) freq = p.freqs[0];
                else if (typeof p.freqStart === 'number') freq = p.freqStart;
                else if (typeof p.base === 'number') freq = p.base;
            }
            // 频率映射到高度（200Hz~2000Hz 归一化）
            const ratio = Math.max(0, Math.min(1, (freq - 200) / 1800));
            let h = 6 + ratio * (size - 12);
            // 轻微脉动
            h *= 0.85 + 0.3 * Math.sin(time + i * 1.2);
            h = Math.max(4, Math.min(size - 2, h));

            const bx = startX + i * (barW + gap);
            let grad = null;
            try {
                grad = ctx.createLinearGradient(bx, bottomY - h, bx, bottomY);
                grad.addColorStop(0, '#8be9fd');
                grad.addColorStop(1, '#bd93f9');
            } catch (e) {
                grad = null;
            }
            ctx.fillStyle = grad || '#8be9fd';
            ctx.fillRect(bx, bottomY - h, barW, h);
            ctx.fillRect(bx, bottomY - h, barW, 1.5);
            ctx.globalAlpha = 1;
        });
    }

    _topInset() {
        const sys = GameGlobal.game.systemInfo || {};
        return Math.max(sys.statusBarHeight || 0, (sys.safeArea && sys.safeArea.top) || 0);
    }

    /** 商品列表顶部 y 坐标（位于类别 Tab 下方），渲染/点击/滚动统一使用 */
    _listTop() {
        return this._topInset() + 121;
    }


    handleTap(x, y) {
        if (this._suppressTap) {
            this._suppressTap = false;
            return;
        }
        if (this._detail) {
            this._handleDetailTap(x, y);
            return;
        }
        // Tab 切换
        for (const area of this._tabAreas) {
            if (x >= area.x && x <= area.x + area.w &&
                y >= area.y && y <= area.y + area.h) {
                if (area.tab !== this._tab) {
                    this._tab = area.tab;
                    this._scrollY = 0;
                }
                return;
            }
        }

        // 按钮
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }

        this._handleItemTap(x, y);
    }

    /** 处理商品点击：购买 / 装备 / 条件解锁 */
    _handleItemTap(tapX, tapY) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const startY = this._listTop();
        const clipBottom = H - 80;
        const itemH = 80;
        const listW = Math.min(340, W * 0.85);
        const listX = (W - listW) / 2;

        const items = this._currentItems();

        const owned = this._owned;
        const equipped = this._equipped[this._tab] || 'default';

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemY = startY + i * (itemH + 8) - this._scrollY;
            if (itemY + itemH < startY || itemY > clipBottom) continue;
            if (tapX < listX || tapX > listX + listW) continue;
            if (tapY < itemY || tapY > itemY + itemH) continue;

            const isOwned = owned.indexOf(item.id) >= 0 || item.unlockCondition === 'default';
            if (isOwned || skinTrial.isActive(this._tab, item.id)) {
                this._equipItem(item, isOwned && equipped === item.id);
                return;
            }

            if (this._canUnlockByCondition(item)) {
                this._owned = owned.concat(item.id);
                wx.setStorageSync('gc_ownedItems', this._owned);
                skinTrial.settle();
                this._equipItem(item, false, '已解锁：' + item.name);
                return;
            }

            this._detail = item;
            this._detailBusy = false;
            return;
        }
    }

    /** 装备已拥有或试用中的皮肤。已拥有且正在使用时只提示。 */
    _equipItem(item, alreadyUsing, toastTitle) {
        const equippedKey = 'gc_equipped_' + this._tab;
        const equipped = this._equipped[this._tab] || 'default';
        if (alreadyUsing || equipped === item.id) {
            wx.showToast({ title: '正在使用中', icon: 'none' });
            return;
        }
        this._equipped[this._tab] = item.id;
        wx.setStorageSync(equippedKey, item.id);
        if (this._tab === 'sound') {
            try {
                const audio = GameGlobal.game && GameGlobal.game.audioManager;
                if (audio && typeof audio.applySoundPack === 'function') {
                    audio.applySoundPack(item.id);
                    if (typeof audio.playHardDrop === 'function') audio.playHardDrop();
                }
            } catch (e) { /* ignore */ }
        }
        wx.showToast({ title: toastTitle || ('已装备：' + item.name), icon: 'none' });
    }

    _trialRemainText(skinId) {
        const slot = this._trialByTab && this._trialByTab[this._tab];
        if (!slot || slot.skinId !== skinId) return '';
        const left = slot.expiresAt - Date.now();
        if (left <= 0) return '';
        return '剩' + skinTrial.formatRemaining(left);
    }

    _detailLayout() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const bw = Math.min(300, W * 0.82);
        const btnH = 44;
        const btnGap = 10;
        const showTrial = isRewardedVideoConfigured() === true;
        const bh = 108 + btnH + (showTrial ? btnH + btnGap : 0);
        const px = (W - bw) / 2;
        const py = Math.max(this._topInset() + 24, (H - bh) / 2);
        const btnW = bw - 40;
        let by = py + 96;
        const trial = showTrial ? { x: px + 20, y: by, w: btnW, h: btnH } : null;
        if (showTrial) by += btnH + btnGap;
        const close = { x: px + 20, y: by, w: btnW, h: btnH };
        return { px: px, py: py, bw: bw, bh: bh, trial: trial, close: close };
    }

    _renderDetail(ctx) {
        if (!this._detail) return;
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const box = this._detailLayout();
        ctx.fillStyle = 'rgba(10, 7, 4, 0.62)';
        ctx.fillRect(0, 0, W, H);
        fillGoldBorderedPanel(ctx, box.px, box.py, box.bw, box.bh, 12);

        ctx.fillStyle = '#fff8ef';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._detail.name || '皮肤', W / 2, box.py + 36);

        ctx.fillStyle = SUBTITLE;
        ctx.font = '14px sans-serif';
        ctx.fillText(this._unlockHint(this._detail), W / 2, box.py + 68);

        if (box.trial) {
            this._drawVideoTrialButton(ctx, box.trial);
        }
        this._drawBrownButton(ctx, box.close, '关闭');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    _drawVideoTrialButton(ctx, rect) {
        const drawn = drawThemeButtonSkin(ctx, 'btnBarVideo', rect.x, rect.y, rect.w, rect.h);
        if (!drawn) {
            ctx.fillStyle = '#c9a227';
            this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
            ctx.fill();
        }
        ctx.fillStyle = '#241408';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.28)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        ctx.fillText('试用 3 天', rect.x + rect.w * 0.62, rect.y + rect.h / 2 + 1);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
    }

    _drawBrownButton(ctx, rect, text) {
        const drawn = drawThemeButtonSkin(ctx, 'btnBarBrown', rect.x, rect.y, rect.w, rect.h);
        if (!drawn) {
            ctx.fillStyle = '#5a4030';
            this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
            ctx.fill();
        }
        ctx.fillStyle = '#fff8ef';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    }

    _hitRect(x, y, rect) {
        return !!(rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
    }

    _handleDetailTap(x, y) {
        const box = this._detailLayout();
        if (box.trial && this._hitRect(x, y, box.trial)) {
            this._startTrialFromDialog();
            return;
        }
        if (this._hitRect(x, y, box.close) || !this._hitRect(x, y, {
            x: box.px, y: box.py, w: box.bw, h: box.bh,
        })) {
            this._detail = null;
            this._detailBusy = false;
        }
    }

    _startTrialFromDialog() {
        if (this._detailBusy || !this._detail) return;
        if (isRewardedVideoConfigured() !== true) return;
        const item = this._detail;
        const tab = this._tab;
        this._detailBusy = true;
        adManager.showRewardedVideo()
            .then(() => {
                this._detailBusy = false;
                skinTrial.startTrial(tab, item.id);
                this._refreshCache();
                if (this._detail && this._detail.id === item.id) this._detail = null;
                wx.showToast({ title: '已开始试用', icon: 'none' });
            })
            .catch((err) => {
                this._detailBusy = false;
                const msg = err && err.message ? err.message : '';
                const title = msg.indexOf('未完整观看') >= 0 ? '需看完视频才能试用' : '视频暂不可用';
                wx.showToast({ title: title, icon: 'none' });
            });
    }

    /** 判断是否满足非购买类解锁条件 */
    _canUnlockByCondition(item) {
        const cond = item.unlockCondition;
        if (!cond || cond === 'purchase') return false;
        if (cond === 'default') return true;
        const stageMatch = /^stage_clear_(\d+)$/.exec(cond);
        if (stageMatch) {
            try {
                const goldenBlock = require('../../utils/golden-block-manager');
                return goldenBlock.isCleared(Number(stageMatch[1]));
            } catch (e) { return false; }
        }
        if (cond === 'stages_cleared_10') {
            try {
                const goldenBlock = require('../../utils/golden-block-manager');
                return goldenBlock.getClearedCount() >= 10;
            } catch (e) {
                return false;
            }
        }
        if (cond === 'games_50') return (wx.getStorageSync('gc_stat_total_games') || 0) >= 50;
        if (cond === 'tetris_count_100') return (wx.getStorageSync('gc_stat_tetris_count') || 0) >= 100;
        return false;
    }

    /** 未满足解锁条件的提示文案 */
    _unlockHint(item) {
        const hints = {
            stages_cleared_10: '主线闯关通关 10 关解锁',
            games_50: '累计对局 50 场解锁',
            tetris_count_100: '累计 100 次 QUAD 解锁',
        };
        const stageMatch = /^stage_clear_(\d+)$/.exec(item.unlockCondition || '');
        if (stageMatch) return '通关主线第 ' + stageMatch[1] + ' 关解锁';
        return hints[item.unlockCondition] || '未满足解锁条件';
    }

    /** 按最大宽度截断文本，超长以省略号结尾（避免描述与右侧文案重叠） */
    _fitText(ctx, text, maxW) {
        if (!text) return '';
        if (ctx.measureText(text).width <= maxW) return text;
        const ellipsis = '…';
        let low = 0;
        let high = text.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            const candidate = text.slice(0, mid) + ellipsis;
            if (ctx.measureText(candidate).width <= maxW) low = mid;
            else high = mid - 1;
        }
        const truncated = text.slice(0, low) + ellipsis;
        return truncated.length >= text.length ? text : truncated;
    }


    handleTouchStart(identifier, x, y) {
        this._touchId = identifier;
        this._touchStartX = x;
        this._touchStartY = y;
        this._isScrolling = false;
    }

    handleTouchMove(identifier, x, y) {
        if (this._detail) return;
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
        }
    }

    /** 计算当前 Tab 列表的最大可滚动距离（避免滚出空白区） */
    _getMaxScroll() {
        const H = GameGlobal.game.height;
        const items = this._currentItems();
        const startY = this._listTop();
        const itemH = 80;
        const gap = 8;
        const viewBottom = H - 90; // 返回按钮上方留 10px
        const contentHeight = items.length * (itemH + gap) - gap;
        const viewHeight = viewBottom - startY;
        return Math.max(0, contentHeight - viewHeight);
    }

    /** 获取当前 Tab 的商品列表 */
    _currentItems() {
        if (this._tab === 'block') return blockSkins;
        if (this._tab === 'board') return boardSkins;
        if (this._tab === 'theme') return themeBackgrounds;
        return [];
    }
}

module.exports = ShopScene;
