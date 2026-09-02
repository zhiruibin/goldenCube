/**
 * ShopScene - 商店场景
 * 职责：展示方块皮肤、棋盘皮肤、音效包，支持购买和装备
 */

const { Button } = require('../widgets/button');
const { drawCoinHudCentered } = require('../../utils/coin-hud');
const IconRenderer = require('../render/icon-renderer');
const { blockSkins, boardSkins, soundPacks, soundPackProfiles } = require('../../data/skins');
const { LIST_FRAME_INTERVAL } = require('../runtime/frame-budget');

class ShopScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._tab = 'block'; // 'block' | 'board' | 'sound'
        this._scrollY = 0;
        this._tabAreas = [];
        // 缓存本地存储数据，避免渲染帧内频繁读 storage
        this._coins = 0;
        this._owned = [];
        this._equipped = {};
        this._touchId = null;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._isScrolling = false;
        this._suppressTap = false;
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
        this._coins = wx.getStorageSync('gc_coins') || 0;
        this._owned = wx.getStorageSync('gc_ownedItems') || [];
        this._equipped = {
            block: wx.getStorageSync('gc_equipped_block') || 'default',
            board: wx.getStorageSync('gc_equipped_board') || 'default',
            sound: wx.getStorageSync('gc_equipped_sound') || 'default',
        };
    }

    onPause() {}

    onResume() {}

    getRenderInterval() {
        return LIST_FRAME_INTERVAL;
    }

    update(dt) {}

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 背景
        ctx.fillStyle = '#0f0f23';
        ctx.fillRect(0, 0, W, H);

        // 标题（图标 + 文字整体居中，参考设置页布局）
        const titleText = '商店';
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
        IconRenderer.draw(ctx, 'cart', leftX + iconSize / 2, titleY, iconSize, '#ffffff');
        ctx.fillText(titleText, leftX + iconSize + gap + titleW / 2, titleY);


        // 金币（Title 下方居中一行，避免与居中标题抢横向空间）
        drawCoinHudCentered(ctx, W, titleY + 30, this._coins);

        // Tab 切换
        this._renderTabs(ctx);
        // 商品列表
        this._renderItems(ctx);

        // 按钮
        for (const btn of this._buttons) {
            btn.render(ctx);
        }
    }

    _renderTabs(ctx) {
        const W = GameGlobal.game.width;
        const tabs = [
            { key: 'block', label: '方块' },
            { key: 'board', label: '棋盘' },
            { key: 'sound', label: '音效' },
        ];
        const tabW = 80;
        const tabH = 32;
        const tabY = this._topInset() + 71;
        const gap = 8;
        const totalW = tabs.length * tabW + (tabs.length - 1) * gap;
        const startX = (W - totalW) / 2;

        this._tabAreas = [];
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < tabs.length; i++) {
            const x = startX + i * (tabW + gap);
            const active = this._tab === tabs[i].key;

            ctx.fillStyle = active ? '#00c6ff' : 'rgba(255,255,255,0.1)';
            this._roundRect(ctx, x, tabY, tabW, tabH, 6);
            ctx.fill();

            ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.fillText(tabs[i].label, x + tabW / 2, tabY + tabH / 2);

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

            // 卡片背景
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            this._roundRect(ctx, listX, y, listW, itemH, 10);
            ctx.fill();

            // 方块皮肤预览（所见即所得：完整皮肤特性 + 7 种方块色）
            if (this._tab === 'block') {
                this._drawBlockPreview(ctx, item, listX + 15, y + (itemH - 28) / 2);
            }

            // 棋盘皮肤预览（迷你棋盘缩略图 + 动态特效示意）
            if (this._tab === 'board') {
                this._drawBoardPreview(ctx, item, listX + 15, y + 14, 44);
            }

            // 音效包预览（基于真实合成参数的动态频率条）
            if (this._tab === 'sound') {
                this._drawSoundPreview(ctx, item, listX + 15, y + 14, 44);
            }

            // 名称和描述（描述按右侧文案预留空间，超长自动省略号截断，避免与条件/价格重叠）
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(item.name, listX + 80, y + 12);

            const isOwned = owned.includes(item.id) || item.unlockCondition === 'default';
            const isEquipped = equipped === item.id;

            // 先确定右侧状态/价格文案及其占用宽度
            let rightText = '';
            let rightFont = '14px sans-serif';
            let rightColor = '#ffd700';
            let hasCoin = false;

            if (isEquipped) {
                rightText = '使用中';
                rightFont = 'bold 14px sans-serif';
                rightColor = '#00f000';
            } else if (isOwned) {
                rightText = '装备';
                rightFont = '14px sans-serif';
                rightColor = '#00c6ff';
            } else if (item.unlockCondition && item.unlockCondition !== 'purchase') {
                // 条件解锁商品：右侧只显示简短标签，具体条件已由描述体现，避免两段长文案重叠
                rightText = '条件解锁';
                rightFont = '12px sans-serif';
                rightColor = '#a0a0a0';
            } else {
                rightText = String(item.price);
                hasCoin = true;
            }

            ctx.font = rightFont;
            const rightW = ctx.measureText(rightText).width + (hasCoin ? 14 + 4 + 2 : 0);

            // 描述：最大宽度 = 右侧文案左侧预留 8px
            ctx.font = '12px sans-serif';
            const descX = listX + 80;
            const descMaxW = (listX + listW - 15 - rightW - 8) - descX;
            const desc = this._fitText(ctx, item.description || '', descMaxW);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(desc, descX, y + 34);

            // 右侧文案（右对齐）
            ctx.font = rightFont;
            ctx.fillStyle = rightColor;
            ctx.textAlign = 'right';
            ctx.fillText(rightText, listX + listW - 15, y + itemH / 2 - 7);
            if (hasCoin) {
                const priceW = ctx.measureText(rightText).width;
                IconRenderer.draw(ctx, 'coin', listX + listW - 15 - priceW - 4 - 7, y + itemH / 2, 14, '#ffd700');
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
            if (gradColors && gradColors.length >= 2) {
                let grad = null;
                try {
                    grad = ctx.createLinearGradient(cx, cy, cx + cell, cy + cell);
                    grad.addColorStop(0, gradColors[0]);
                    grad.addColorStop(1, gradColors[1]);
                } catch (e) {
                    grad = null;
                }
                ctx.fillStyle = grad || color;
            } else {
                ctx.fillStyle = color;
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
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillRect(cx, cy, cell, 2);
            ctx.fillRect(cx, cy, 2, cell);

            // 阴影（右下）
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(cx, cy + cell - 2, cell, 2);
            ctx.fillRect(cx + cell - 2, cy, 2, cell);

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
     * 背景/网格/边框来自皮肤 style，方块使用当前装备的方块皮肤配色，动态特效以动画示意图展示（星空为缓慢闪烁）
     */
    _drawBoardPreview(ctx, item, x, y, size) {
        const style = item.style || {};
        const bg = style.background || '#161d30';
        const grid = style.gridColor || 'rgba(255,255,255,0.05)';
        const border = style.borderColor || '#16213e';
        const effect = item.effect || null;

        // 读取当前装备的方块皮肤颜色
        let blockColors = null;
        try {
            const equippedId = wx.getStorageSync('gc_equipped_block') || 'default';
            const skin = blockSkins.find((s) => s.id === equippedId) || blockSkins[0];
            blockColors = skin.colors || {};
        } catch (e) {
            blockColors = null;
        }

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

        // 几格已锁定方块（用装备方块皮肤配色）
        const filled = [
            { r: 2, c: 0, t: 'J' },
            { r: 2, c: 1, t: 'J' },
            { r: 2, c: 2, t: 'J' },
            { r: 1, c: 2, t: 'J' },
            { r: 0, c: 3, t: 'O' },
            { r: 1, c: 3, t: 'O' },
            { r: 0, c: 0, t: 'I' },
            { r: 1, c: 0, t: 'I' },
        ];
        filled.forEach((f) => {
            const raw = (blockColors && blockColors[f.t]) || '#888888';
            const color = Array.isArray(raw) ? raw[0] : raw;
            const fx = x + f.c * cell;
            const fy = y + f.r * cell;
            ctx.fillStyle = color;
            ctx.fillRect(fx + 1, fy + 1, cell - 2, cell - 2);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(fx + 1, fy + 1, cell - 2, 2);
            ctx.fillRect(fx + 1, fy + 1, 2, cell - 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(fx + 1, fy + cell - 3, cell - 2, 2);
            ctx.fillRect(fx + cell - 3, fy + 1, 2, cell - 2);
        });

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
            ctx.strokeStyle = '#7ec8ff';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.6;
            const bubbles = [[size - 10, 8, 3], [size / 2, size - 6, 4], [12, size / 2, 2.5]];
            for (const [bx, by, br] of bubbles) {
                ctx.beginPath();
                ctx.arc(x + bx, y + by, br, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (effect === 'matrix') {
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#00ff66';
            ctx.globalAlpha = 0.7;
            ctx.fillText('1', x + 6, y + 6);
            ctx.fillText('0', x + size - 6, y + size / 2);
            ctx.fillText('1', x + size / 2, y + size - 5);
        } else if (effect === 'sakura') {
            ctx.fillStyle = '#ffb6c1';
            ctx.globalAlpha = 0.8;
            const petals = [[8, 6], [size - 10, size - 8], [size / 2 + 4, size / 2]];
            for (const [px, py] of petals) {
                ctx.beginPath();
                ctx.ellipse(x + px, y + py, 2.5, 1.8, 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (effect === 'lava') {
            ctx.fillStyle = '#ff5a00';
            ctx.globalAlpha = 0.8;
            const lavas = [[6, 8, 1.5], [size - 8, size / 2, 1.2], [size / 2, size - 8, 1.8], [size - 6, 8, 1.0]];
            for (const [lx, ly, lr] of lavas) {
                ctx.beginPath();
                ctx.arc(x + lx, y + ly, lr, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
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
        const equippedKey = 'gc_equipped_' + this._tab;
        const equipped = this._equipped[this._tab] || 'default';

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemY = startY + i * (itemH + 8) - this._scrollY;
            if (itemY + itemH < startY || itemY > clipBottom) continue;
            if (tapX < listX || tapX > listX + listW) continue;
            if (tapY < itemY || tapY > itemY + itemH) continue;

            const isOwned = owned.indexOf(item.id) >= 0 || item.unlockCondition === 'default';
            if (isOwned) {
                if (equipped !== item.id) {
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
                    wx.showToast({ title: '已装备：' + item.name, icon: 'none' });
                } else {
                    wx.showToast({ title: '正在使用中', icon: 'none' });
                }
                return;
            }

            // 未拥有：先判断是否满足条件解锁
            if (this._canUnlockByCondition(item)) {
                this._owned = owned.concat(item.id);
                wx.setStorageSync('gc_ownedItems', this._owned);
                this._equipped[this._tab] = item.id;
                wx.setStorageSync(equippedKey, item.id);
                wx.showToast({ title: '已解锁：' + item.name, icon: 'none' });
                return;
            }

            // 购买类
            if (item.unlockCondition === 'purchase') {
                const coins = this._coins;
                if (coins >= item.price) {
                    this._coins = coins - item.price;
                    wx.setStorageSync('gc_coins', this._coins);
                    this._owned = owned.concat(item.id);
                    wx.setStorageSync('gc_ownedItems', this._owned);
                    this._equipped[this._tab] = item.id;
                    wx.setStorageSync(equippedKey, item.id);
                    wx.showToast({ title: '购买成功：' + item.name, icon: 'none' });
                } else {
                    wx.showToast({ title: '金币不足', icon: 'none' });
                }
                return;
            }

            wx.showToast({ title: this._unlockHint(item), icon: 'none' });
            return;
        }
    }

    /** 判断是否满足非购买类解锁条件 */
    _canUnlockByCondition(item) {
        const cond = item.unlockCondition;
        if (!cond || cond === 'purchase') return false;
        if (cond === 'default') return true;
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
        return soundPacks;
    }
}

module.exports = ShopScene;
