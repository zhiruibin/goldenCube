/**
 * PieceRenderer - 方块渲染器
 * 职责：绘制当前方块、Ghost Piece、Next/Hold 预览
 * 支持从本地存储读取已装备的方块皮肤（equipped_block）
 * 完整支持皮肤特性：渐变 gradient / 发光 glow / 纹理 texture / 透明度 transparency / 闪耀 shimmer
 */

const { PIECE_COLORS, PIECE_SHADOW_COLORS } = require('../../data/pieces');
const { blockSkins } = require('../../data/skins');

class PieceRenderer {
    constructor() {
        this._shadowMap = PIECE_SHADOW_COLORS;
        this._gradientMap = {};
        this._applySkin();
    }

    /**
     * 读取已装备方块皮肤并生成颜色映射与特性配置
     * 渐变皮肤（colors 为数组）保留完整渐变数组
     */
    _applySkin() {
        let skinId = 'default';
        try {
            skinId = wx.getStorageSync('equipped_block') || 'default';
        } catch (e) {
            // 忽略，使用默认皮肤
        }
        const skin = blockSkins.find((s) => s.id === skinId) || blockSkins[0];
        this._skin = skin;
        const colors = skin.colors || {};
        this._colorMap = {};
        for (const key of Object.keys(PIECE_COLORS)) {
            const c = colors[key];
            if (Array.isArray(c)) {
                this._colorMap[key] = c[0] || PIECE_COLORS[key];
                this._gradientMap[key] = c;
            } else {
                this._colorMap[key] = c || PIECE_COLORS[key];
                this._gradientMap[key] = null;
            }
        }
        this._glow = !!skin.glow;
        this._shimmer = !!skin.shimmer;
        this._texture = skin.texture || null;
        this._transparency = (typeof skin.transparency === 'number' && skin.transparency >= 0 && skin.transparency <= 1)
            ? skin.transparency : 1;
    }

    /**
     * 渲染当前活动方块
     */
    renderPiece(ctx, type, matrix, row, col, boardX, boardY, cellSize) {
        if (!matrix) return;
        const color = this._colorMap[type] || '#888888';
        const shadow = this._shadowMap[type] || '#444444';
        const gradColors = this._gradientMap[type] || null;

        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c]) {
                    const x = boardX + (col + c) * cellSize;
                    const y = boardY + (row + r) * cellSize;
                    this._drawCell(ctx, x, y, cellSize, color, shadow, gradColors);
                }
            }
        }
    }

    /**
     * 渲染 Ghost Piece（半透明预览落点）
     */
    renderGhost(ctx, type, matrix, row, col, boardX, boardY, cellSize) {
        if (!matrix) return;
        const color = this._colorMap[type] || '#888888';

        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c]) {
                    const x = boardX + (col + c) * cellSize;
                    const y = boardY + (row + r) * cellSize;
                    const inset = 1;

                    // 半透明填充
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.18;
                    ctx.fillRect(x + inset, y + inset, cellSize - inset * 2, cellSize - inset * 2);

                    // 加粗描边
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = 0.65;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + inset, y + inset, cellSize - inset * 2, cellSize - inset * 2);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    /**
     * 渲染预览方块（Next / Hold 区域）
     */
    renderPreview(ctx, type, matrix, x, y, cellSize) {
        if (!matrix) return;
        const color = this._colorMap[type] || '#888888';
        const shadow = this._shadowMap[type] || '#444444';
        const gradColors = this._gradientMap[type] || null;

        // 计算居中偏移
        const mw = matrix[0].length * cellSize;
        const mh = matrix.length * cellSize;
        const offsetX = x + (cellSize * 4 - mw) / 2;
        const offsetY = y;

        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c]) {
                    this._drawCell(ctx, offsetX + c * cellSize, offsetY + r * cellSize, cellSize, color, shadow, gradColors);
                }
            }
        }
    }

    /**
     * 绘制单个方块格子（完整支持皮肤特性）
     * @param {Object} ctx - 渲染上下文
     * @param {number} x - 格子 X
     * @param {number} y - 格子 Y
     * @param {number} size - 格子边长
     * @param {string} color - 主色
     * @param {string} shadow - 阴影色
     * @param {string[]|null} gradColors - 渐变颜色数组（可选）
     */
    _drawCell(ctx, x, y, size, color, shadow, gradColors) {
        const inset = 1;
        const w = size - inset * 2;

        // 透明度（水晶等）
        if (this._transparency < 1) {
            ctx.globalAlpha = this._transparency;
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
        if (this._glow) {
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
        if (this._texture) {
            this._applyTexture(ctx, x, y, size, inset);
        }

        // 高光（左上）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(x + inset, y + inset, w, 2);
        ctx.fillRect(x + inset, y + inset, 2, w);

        // 阴影（右下）
        ctx.fillStyle = shadow;
        ctx.fillRect(x + inset, y + size - inset - 2, w, 2);
        ctx.fillRect(x + size - inset - 2, y + inset, 2, w);

        // 闪耀光泽（黄金 shimmer）
        if (this._shimmer) {
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
        if (this._transparency < 1) {
            ctx.globalAlpha = 1;
        }
    }

    /**
     * 应用纹理效果
     */
    _applyTexture(ctx, x, y, size, inset) {
        const w = size - inset * 2;
        switch (this._texture) {
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

module.exports = { PieceRenderer };
