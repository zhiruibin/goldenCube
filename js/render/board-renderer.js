/**
 * BoardRenderer - 棋盘渲染器
 * 职责：绘制棋盘网格、已锁定方块、边框
 * 支持从本地存储读取已装备的棋盘皮肤（equipped_board）
 * 完整支持棋盘动态特效：星空 stars / 气泡 bubbles / 数字雨 matrix / 樱花 sakura / 熔岩 lava
 * 锁定方块同时应用已装备的方块皮肤（equipped_block），保证落地前后样式一致
 */

const { boardSkins, blockSkins } = require('../../data/skins');
const { GARBAGE, hashSeed, drawGarbageCell } = require('./garbage-cell');

// 棋盘格子数值 -> 方块字母映射（与 data/pieces.js / data/skins.js 一致）
const TYPE_LETTER = {
    1: 'I',
    2: 'O',
    3: 'T',
    4: 'S',
    5: 'Z',
    6: 'J',
    7: 'L',
    8: 'C',
    9: 'D',
    10: 'P',
    11: 'M',
    12: 'R',
    13: 'Q',
    14: 'X',
    15: 'K',
    16: 'W',
    17: 'A',
    18: 'N',
};

class BoardRenderer {
    constructor(x, y, cellSize, cols, rows) {
        this.x = x;
        this.y = y;
        this.cellSize = cellSize;
        this.cols = cols;
        this.rows = rows;
        // 方块颜色映射（与 pieces.js 一致，构造时按已装备方块皮肤覆盖）
        this._colorMap = {
            1: '#00f0f0', // I
            2: '#f0f000', // O
            3: '#a000f0', // T
            4: '#00f000', // S
            5: '#f00000', // Z
            6: '#0000f0', // J
            7: '#f0a000', // L
            8: '#FF6B81', // C 直角块
            9: '#FFD700', // D 钻头块
            10: '#8E9EAB', // P 暗砖块
            11: '#B33771', // M 对角块
            12: '#F5F5F5', // R 光棱
            13: '#00BFA5', // Q 方碑
            14: '#C8A2C8', // X 台阶块
            15: '#FF7F50', // K 王冠
            16: '#98FB98', // W V型
            17: '#87CEEB', // A 方舟
            18: '#FFE08A', // N 星尘
        };
        this._shadowMap = {
            1: '#009999',
            2: '#999900',
            3: '#660099',
            4: '#009900',
            5: '#990000',
            6: '#000099',
            7: '#996600',
            8: '#B03A4B',
            9: '#B8860B',
            10: '#5C6B77',
            11: '#6D1D47',
            12: '#A9A9A9',
            13: '#00806F',
            14: '#8B6F8B',
            15: '#B3542E',
            16: '#66BB66',
            17: '#5A9FC8',
            18: '#B8A85A',
        };

        // 动态特效状态
        this._fxTime = 0;
        this._fxParticles = [];
        this._fxType = null;
        this._fxInitialized = false;

        this._applySkin();
        this._applyBlockSkin();
    }

    /**
     * 读取已装备棋盘皮肤并应用到背景/网格/边框/特效
     */
    _applySkin() {
        let skinId = 'default';
        try {
            skinId = wx.getStorageSync('gc_equipped_board') || 'default';
        } catch (e) {
            // 忽略，使用默认皮肤
        }
        const skin = boardSkins.find((s) => s.id === skinId) || boardSkins[0];
        this._skin = skin;
        const style = skin.style || {};
        this._bg = style.background || '#161d30';
        this._grid = style.gridColor || 'rgba(255, 255, 255, 0.04)';
        this._border = style.borderColor || '#16213e';
        this._gridLineWidth = style.gridLineWidth || 0.5;
        this._fxType = skin.effect || null;
        this._fxInitialized = false;
        this._fxParticles = [];
    }

    /**
     * 读取已装备方块皮肤并覆盖锁定方块的绘制配置
     * 保证落地后的方块与下落中（PieceRenderer）样式一致
     */
    _applyBlockSkin() {
        let skinId = 'default';
        try {
            skinId = wx.getStorageSync('gc_equipped_block') || 'default';
        } catch (e) {
            // 忽略，使用默认皮肤
        }
        const skin = blockSkins.find((s) => s.id === skinId) || blockSkins[0];
        this._blockSkin = skin;
        const colors = skin.colors || {};
        this._blockGradMap = {};
        for (const key of Object.keys(TYPE_LETTER)) {
            const letter = TYPE_LETTER[key];
            const c = colors[letter];
            if (Array.isArray(c)) {
                this._colorMap[key] = c[0] || this._colorMap[key];
                this._blockGradMap[key] = c;
            } else {
                this._colorMap[key] = c || this._colorMap[key];
                this._blockGradMap[key] = null;
            }
        }
        this._blockGlow = !!skin.glow;
        this._blockShimmer = !!skin.shimmer;
        this._blockTexture = skin.texture || null;
        this._blockTransparency = (typeof skin.transparency === 'number' && skin.transparency >= 0 && skin.transparency <= 1)
            ? skin.transparency : 1;
    }

    /**
     * 每帧更新动态特效
     * @param {number} dt - 帧间隔（秒）
     */
    update(dt) {
        if (!this._fxType) return;
        this._fxTime += dt;
        this._ensureFxInitialized();
        this._updateFx(dt);
    }

    /**
     * 初始化特效粒子（首次渲染时按棋盘尺寸生成）
     */
    _ensureFxInitialized() {
        if (this._fxInitialized || !this._fxType) return;
        this._fxInitialized = true;

        const w = this.cellSize * this.cols;
        const h = this.cellSize * this.rows;

        if (this._fxType === 'stars') {
            // 星空：以棋盘中心为圆心的极坐标星盘（缓慢逆时针旋转 + 闪烁）
            const maxR = Math.sqrt(w * w + h * h) / 2;
            for (let i = 0; i < 60; i++) {
                // 半径混合分布：小半径星盘为主，兼顾大轨道掠边星，保证覆盖全棋盘
                const t = Math.random();
                const radius = (t < 0.6)
                    ? maxR * (0.1 + Math.random() * 0.45)
                    : maxR * (0.55 + Math.random() * 0.4);
                this._fxParticles.push({
                    angle: Math.random() * Math.PI * 2,
                    radius: radius,
                    r: 0.5 + Math.random() * 1.5,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.6 + Math.random() * 1.6,
                });
            }
        } else if (this._fxType === 'bubbles') {
            // 气泡：自底部上浮
            for (let i = 0; i < 16; i++) {
                this._fxParticles.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 1.5 + Math.random() * 4,
                    speed: 8 + Math.random() * 20,
                    alpha: 0.15 + Math.random() * 0.3,
                });
            }
        } else if (this._fxType === 'matrix') {
            // 数字雨：每列一个下落头
            const charW = 10;
            const colCount = Math.floor(w / charW);
            for (let i = 0; i < colCount; i++) {
                this._fxParticles.push({
                    x: i * charW + charW / 2,
                    y: Math.random() * h,
                    speed: 40 + Math.random() * 80,
                    charH: 14,
                });
            }
        } else if (this._fxType === 'sakura') {
            // 樱花：花瓣自顶部飘落
            for (let i = 0; i < 22; i++) {
                this._fxParticles.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 2.5 + Math.random() * 3,
                    speed: 12 + Math.random() * 22,
                    swayAmp: 8 + Math.random() * 18,
                    swaySpeed: 1 + Math.random() * 2,
                    phase: Math.random() * Math.PI * 2,
                    alpha: 0.35 + Math.random() * 0.35,
                });
            }
        } else if (this._fxType === 'lava') {
            // 熔岩：流动的亮点
            for (let i = 0; i < 24; i++) {
                this._fxParticles.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 1 + Math.random() * 2.5,
                    speed: 6 + Math.random() * 16,
                    phase: Math.random() * Math.PI * 2,
                    alpha: 0.25 + Math.random() * 0.4,
                });
            }
        }
    }

    /**
     * 更新特效粒子位置
     */
    _updateFx(dt) {
        const w = this.cellSize * this.cols;
        const h = this.cellSize * this.rows;
        const parts = this._fxParticles;

        if (this._fxType === 'bubbles') {
            for (const p of parts) {
                p.y -= p.speed * dt;
                if (p.y < -p.r) {
                    p.y = h + p.r;
                    p.x = Math.random() * w;
                }
            }
        } else if (this._fxType === 'matrix') {
            for (const p of parts) {
                p.y += p.speed * dt;
                if (p.y > h + p.charH) {
                    p.y = -p.charH;
                }
            }
        } else if (this._fxType === 'sakura') {
            for (const p of parts) {
                p.y += p.speed * dt;
                p.phase += p.swaySpeed * dt;
                if (p.y > h + p.r) {
                    p.y = -p.r;
                    p.x = Math.random() * w;
                }
            }
        } else if (this._fxType === 'lava') {
            for (const p of parts) {
                p.y += Math.sin(this._fxTime * 2 + p.phase) * 8 * dt;
                p.x += Math.cos(this._fxTime * 1.5 + p.phase) * 6 * dt;
                // 回流
                if (p.y > h + p.r) p.y = -p.r;
                if (p.y < -p.r) p.y = h + p.r;
                if (p.x > w + p.r) p.x = -p.r;
                if (p.x < -p.r) p.x = w + p.r;
            }
        }
        // stars 无需移动
    }

    /**
     * 渲染棋盘
     * @param {CanvasRenderingContext2D} ctx
     * @param {number[][]} board - 可见棋盘数据 (rows × cols)
     */
    render(ctx, board) {
        if (!board) return;

        const cs = this.cellSize;
        const x = this.x;
        const y = this.y;

        // 棋盘背景
        ctx.fillStyle = this._bg;
        ctx.fillRect(x, y, cs * this.cols, cs * this.rows);

        // 动态背景特效（在网格和方块之前绘制）
        if (this._fxType) {
            this._renderBackgroundEffect(ctx);
        }

        // 网格线（强制最小 1px 线宽，避免 0.5px 在移动端 DPR 缩放下不可见）
        const gridLineWidth = Math.max(1, this._gridLineWidth || 1);
        ctx.strokeStyle = this._grid;
        ctx.lineWidth = gridLineWidth;
        for (let r = 0; r <= this.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(x, y + r * cs);
            ctx.lineTo(x + this.cols * cs, y + r * cs);
            ctx.stroke();
        }
        for (let c = 0; c <= this.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(x + c * cs, y);
            ctx.lineTo(x + c * cs, y + this.rows * cs);
            ctx.stroke();
        }

        // 已锁定方块
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const val = board[r] && board[r][c];
                if (val && val !== 0) {
                    this._drawCell(ctx, x + c * cs, y + r * cs, cs, val, c, r);
                }
            }
        }

        // 棋盘边框
        ctx.strokeStyle = this._border;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, cs * this.cols + 2, cs * this.rows + 2);
    }

    /**
     * 绘制浮动格（闯关塌陷动画等）
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ col: number, row: number, value: number }[]} cells - row 为可见行，可为小数
     */
    renderOverlayCells(ctx, cells) {
        if (!cells || cells.length === 0) return;
        const cs = this.cellSize;
        const x = this.x;
        const y = this.y;
        for (const cell of cells) {
            if (!cell || !cell.value) continue;
            this._drawCell(
                ctx,
                x + cell.col * cs,
                y + cell.row * cs,
                cs,
                cell.value,
                cell.col,
                Math.floor(cell.row)
            );
        }
    }

    /**
     * 绘制动态背景特效
     */
    _renderBackgroundEffect(ctx) {
        const x = this.x;
        const y = this.y;
        const cs = this.cellSize;
        const w = cs * this.cols;
        const h = cs * this.rows;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        if (this._fxType === 'stars') {
            // 星空：星盘绕棋盘中心缓慢逆时针旋转（斗转星移）+ 增强闪烁
            const cx = x + w / 2;
            const cy = y + h / 2;
            const rot = this._fxTime * 0.07; // 缓慢逆时针：约 90 秒一圈
            for (const p of this._fxParticles) {
                const a = p.angle - rot;
                const px = cx + Math.cos(a) * p.radius;
                const py = cy + Math.sin(a) * p.radius;
                const tw = 0.5 + 0.5 * Math.sin(this._fxTime * p.speed + p.phase);
                const alpha = 0.15 + 0.85 * tw;
                // 柔和光晕
                ctx.globalAlpha = alpha * 0.25;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(px, py, p.r * 2.6, 0, Math.PI * 2);
                ctx.fill();
                // 星核（亮度高时轻微放大）
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(px, py, p.r * (0.8 + 0.3 * tw), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        } else if (this._fxType === 'bubbles') {
            for (const p of this._fxParticles) {
                ctx.globalAlpha = p.alpha;
                ctx.strokeStyle = '#7ec8ff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x + p.x, y + p.y, p.r, 0, Math.PI * 2);
                ctx.stroke();
                // 小高光
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = p.alpha * 0.6;
                ctx.beginPath();
                ctx.arc(x + p.x - p.r * 0.3, y + p.y - p.r * 0.3, p.r * 0.25, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this._fxType === 'matrix') {
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (const p of this._fxParticles) {
                const char = Math.random() > 0.5 ? '1' : '0';
                // 头部亮绿，拖尾渐隐
                for (let k = 0; k < 6; k++) {
                    const cy = p.y - k * p.charH;
                    if (cy < -p.charH || cy > h) continue;
                    const alpha = 0.08 + (k === 0 ? 0.7 : 0.35 * (1 - k / 6));
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = k === 0 ? '#ccffcc' : '#00ff66';
                    ctx.fillText(char, x + p.x, y + cy);
                }
            }
        } else if (this._fxType === 'sakura') {
            for (const p of this._fxParticles) {
                const swayX = Math.sin(p.phase) * p.swayAmp;
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = '#ffb6c1';
                ctx.beginPath();
                ctx.ellipse(x + p.x + swayX, y + p.y, p.r, p.r * 0.7, 0.4, 0, Math.PI * 2);
                ctx.fill();
                // 花心
                ctx.fillStyle = '#ff8fa3';
                ctx.globalAlpha = p.alpha * 0.8;
                ctx.beginPath();
                ctx.arc(x + p.x + swayX, y + p.y, p.r * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this._fxType === 'lava') {
            for (const p of this._fxParticles) {
                const flicker = 0.6 + 0.4 * Math.sin(this._fxTime * 3 + p.phase);
                ctx.globalAlpha = p.alpha * flicker;
                ctx.fillStyle = '#ff5a00';
                ctx.beginPath();
                ctx.arc(x + p.x, y + p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
            // 底部熔岩辉光
            ctx.globalAlpha = 0.18;
            let grad;
            try {
                grad = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h);
                grad.addColorStop(0, 'rgba(255,80,0,0)');
                grad.addColorStop(1, 'rgba(255,80,0,0.5)');
            } catch (e) {
                grad = null;
            }
            if (grad) {
                ctx.fillStyle = grad;
                ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
            }
        }

        ctx.restore();
        ctx.globalAlpha = 1;
    }

    /**
     * 绘制单个方块格子（完整支持方块皮肤特性，与 PieceRenderer 保持一致）
     * @param {Object} ctx - 渲染上下文
     * @param {number} x - 格子 X
     * @param {number} y - 格子 Y
     * @param {number} size - 格子边长
     * @param {number} colorId - 棋盘格子数值（1-7）
     */
    _drawCell(ctx, x, y, size, colorId, col, row) {
        if (colorId === GARBAGE) {
            const gc = (typeof col === 'number') ? col : Math.floor((x - this.x) / size);
            const gr = (typeof row === 'number') ? row : Math.floor((y - this.y) / size);
            drawGarbageCell(ctx, x, y, size, hashSeed(gc, gr));
            return;
        }

        const color = this._colorMap[colorId] || '#888888';
        const shadow = this._shadowMap[colorId] || '#444444';
        const gradColors = (this._blockGradMap && this._blockGradMap[colorId]) || null;
        const inset = 1;
        const w = size - inset * 2;

        // 透明度（水晶等）
        if (this._blockTransparency < 1) {
            ctx.globalAlpha = this._blockTransparency;
        }

        // 主体填充：渐变或纯色
        if (gradColors && gradColors.length >= 2) {
            let grad;
            try {
                grad = ctx.createLinearGradient(x, y, x + size, y + size);
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
        if (this._blockGlow) {
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = size * 0.5;
            ctx.fillRect(x + inset, y + inset, w, w);
            ctx.restore();
            ctx.fillStyle = color;
            ctx.fillRect(x + inset, y + inset, w, w);
        } else {
            ctx.fillRect(x + inset, y + inset, w, w);
        }

        // 纹理
        if (this._blockTexture) {
            this._applyTexture(ctx, x, y, size, inset);
        }

        // 高光（左上）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x + inset, y + inset, w, 2);
        ctx.fillRect(x + inset, y + inset, 2, w);

        // 阴影（右下）
        ctx.fillStyle = shadow;
        ctx.fillRect(x + inset, y + size - inset - 2, w, 2);
        ctx.fillRect(x + size - inset - 2, y + inset, 2, w);

        // 闪耀光泽（黄金 shimmer）
        if (this._blockShimmer) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(x + inset + 2, y + size - inset - 2);
            ctx.lineTo(x + size - inset - 2, y + inset + 2);
            ctx.lineTo(x + size - inset - 2, y + inset + 6);
            ctx.lineTo(x + inset + 6, y + size - inset - 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // 恢复透明度
        if (this._blockTransparency < 1) {
            ctx.globalAlpha = 1;
        }
    }

    /**
     * 应用纹理效果（与 PieceRenderer 一致）
     */
    _applyTexture(ctx, x, y, size, inset) {
        const w = size - inset * 2;
        switch (this._blockTexture) {
            case 'wood': {
                // 木纹：竖向细条纹
                ctx.save();
                ctx.globalAlpha = 0.18;
                ctx.fillStyle = '#5a3e1b';
                for (let sx = x + inset + 3; sx < x + size - inset - 2; sx += 5) {
                    ctx.fillRect(sx, y + inset, 1.5, w);
                }
                ctx.restore();
                break;
            }
            case 'crystal': {
                // 水晶：高亮边框 + 内部光泽
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x + inset + 1, y + inset + 1, w - 2, w - 2);
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(x + inset + 2, y + inset + 2);
                ctx.lineTo(x + inset + w * 0.45, y + inset + 2);
                ctx.lineTo(x + inset + 2, y + inset + w * 0.45);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'pixel': {
                // 像素：内部分隔成小格，形成像素风
                ctx.save();
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                const sub = 3;
                const subSize = w / sub;
                for (let i = 1; i < sub; i++) {
                    const px = x + inset + i * subSize;
                    ctx.beginPath();
                    ctx.moveTo(px, y + inset);
                    ctx.lineTo(px, y + inset + w);
                    ctx.stroke();
                    const py = y + inset + i * subSize;
                    ctx.beginPath();
                    ctx.moveTo(x + inset, py);
                    ctx.lineTo(x + inset + w, py);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }
            case 'metallic': {
                // 金属：斜向高光渐变
                ctx.save();
                let grad;
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
                    ctx.fillRect(x + inset, y + inset, w, w);
                }
                ctx.restore();
                break;
            }
            default:
                break;
        }
    }
}

module.exports = { BoardRenderer };
