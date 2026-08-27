/**
 * EffectRenderer - 特效渲染器
 * 职责：消行粒子爆炸、闪屏、方块落地波纹、得分飘字
 * 参考产品方案 3.3.1 / 3.3.2 / 3.3.5
 */

// 粒子配置表（文档 3.3.1）
const PARTICLE_CONFIG = {
    1: { perCell: 4, speed: [80, 150], life: 0.30, gravity: 0, gold: false },
    2: { perCell: 6, speed: [100, 180], life: 0.35, gravity: 0, gold: false },
    3: { perCell: 8, speed: [120, 200], life: 0.40, gravity: 50, gold: false },
    4: { perCell: 12, speed: [150, 250], life: 0.50, gravity: 120, gold: false },
    tspin: { perCell: 10, speed: [130, 220], life: 0.45, gravity: 50, gold: true },
};

// 闪屏配置表（文档 3.3.2）
const FLASH_CONFIG = {
    1: { alpha: 0.3, duration: 0.10, range: 0, color: '#FFFFFF' },
    2: { alpha: 0.4, duration: 0.12, range: 0, color: '#FFFFFF' },
    3: { alpha: 0.5, duration: 0.15, range: 1, color: '#FFFFFF' },
    4: { alpha: 0.7, duration: 0.20, range: -1, color: '#FFFFFF' }, // -1 = 全棋盘
    tspin: { alpha: 0.6, duration: 0.18, range: 2, color: '#FFD700' },
};

// ---------------------------------------------------------------------------
// 高潮特效（QUAD / T-Spin 演出）—— 以"彩色方块碎片爆炸"为核心
// 设计原则：
//   1. 主角是被消方块的彩色碎片：碎片颜色取自被消行格子的真实颜色，
//      从消行位置向四周爆开（带旋转 + 速度拖尾），形成"方块被击碎"的因果感
//   2. 白闪只做爆炸瞬间的爆亮（0.1s），不是主角
//   3. 不做大字横幅、不做金雨——文字提示交给消行飘字（不挡棋盘）
//   4. 震屏轻微（3px、0.5s），强化爆炸冲击但不干扰操作
// 时间轴（总长 CLIMAX_DURATION 秒）：
//   0.00~0.10  爆亮白闪（消行行）+ 全屏爆闪
//   0.00~0.85  彩色碎片向四周爆开（重力回落 + 旋转）
//   0.10~0.70  第二波碎片自行底边缘二次爆
//   0.00~0.60  主题色火花向上喷（次要点缀）
//   0.05~0.55  轻微震屏（指数衰减）
// 注意：Tetris / T-Spin 为注册商标相关演出，文案避开商标字样
// ---------------------------------------------------------------------------
const CLIMAX_DURATION = 1.3;

/** 高潮主题：tetris（QUAD，金）与 tspin（T-Spin，紫）——用于火花配色 */
const CLIMAX_THEMES = {
    tetris: { text: 'QUAD!', color: '#FFD700', light: '#FFF7AE', dark: '#FF8C00' },
    tspin: { text: 'T-SPIN!', color: '#B85CFF', light: '#E8C8FF', dark: '#7A2FD0' },
};

/** 棋盘格子类型值 → 十六进制颜色（与 data/pieces.js 一致，供碎片取色） */
const TYPE_HEX = {
    1: '#00F0F0', 2: '#F0F000', 3: '#A000F0', 4: '#00F000', 5: '#F00000',
    6: '#0000F0', 7: '#F0A000', 8: '#FF6B81', 9: '#FFD700', 10: '#8E9EAB',
    11: '#B33771', 12: '#F5F5F5', 13: '#00BFA5', 14: '#C8A2C8', 15: '#FF7F50',
    16: '#98FB98', 17: '#87CEEB', 18: '#FFE08A',
};

/** 方块类型字母 → 十六进制颜色（标准 7 种 + 特殊/实验室方块，供残影/波纹取色） */
const PIECE_TYPE_COLOR_HEX = {
    I: '#00F0F0', O: '#F0F000', T: '#A000F0',
    S: '#00F000', Z: '#F00000', J: '#0000F0', L: '#F0A000',
    C: '#FF6B81', D: '#FFD700', P: '#8E9EAB', M: '#B33771',
    Q: '#F5F5F5', R: '#00BFA5', X: '#C8A2C8', K: '#FF7F50',
    W: '#98FB98', A: '#87CEEB', N: '#FFE08A',
};

/** 震屏参数（轻微） */
const CLIMAX_SHAKE = {
    start: 0.05,        // 震屏开始时间
    end: 0.55,          // 震屏结束时间
    maxIntensity: 3.2,  // 初始振幅（逻辑像素）
};

/** 碎片粒子数上限（低端机性能防线） */
const CLIMAX_PARTICLE_LIMIT = 110;

class EffectRenderer {
    constructor() {
        /** @type {Array} 活跃特效列表 */
        this._effects = [];
    }

    /**
     * 添加消行特效（粒子 + 闪屏组合）
     * @param {number[]} lineIndices - 可见行索引（0-19）
     * @param {number} boardX - 棋盘 X 坐标
     * @param {number} boardY - 棋盘 Y 坐标
     * @param {number} cellSize - 格子大小
     * @param {Object} [options] - 附加信息
     * @param {number[][]} [options.colors] - 每行被消除方块的类型颜色快照
     * @param {boolean} [options.isTetris]
     * @param {string} [options.tSpinType] - 'mini' | 'full' | null
     */
    addLineClear(lineIndices, boardX, boardY, cellSize, options) {
        const opts = options || {};
        const count = lineIndices.length;
        const isTetris = !!opts.isTetris;
        const isTSpin = !!opts.tSpinType;

        // 闪屏
        this._addFlash(count, isTetris, isTSpin, lineIndices, boardX, boardY, cellSize);

        // 粒子
        for (let i = 0; i < lineIndices.length; i++) {
            const row = lineIndices[i];
            const rowColors = (opts.colors && opts.colors[i]) ? opts.colors[i] : null;
            this._addRowParticles(row, boardX, boardY, cellSize, count, isTSpin, rowColors);
        }
    }

    /**
     * 添加高潮特效（QUAD / T-Spin 演出）
     * 核心：被消方块的彩色碎片向四周爆开（旋转 + 速度拖尾）+ 主题色火花 + 爆亮白闪 + 轻微震屏
     * @param {string} kind - 'tetris' | 'tspin'
     * @param {number} boardX
     * @param {number} boardY
     * @param {number} cellSize
     * @param {Object} [options]
     * @param {number[]} [options.rows] - 被消除的可见行索引
     * @param {number[][]} [options.colors] - 每行被消除格子的类型值快照（与 rows 一一对应）
     * @param {number} [options.combo] - 当前连击数（飘字副字用）
     */
    addClimax(kind, boardX, boardY, cellSize, options) {
        const opts = options || {};
        const theme = CLIMAX_THEMES[kind] || CLIMAX_THEMES.tetris;
        const rows = (opts.rows && opts.rows.length) ? opts.rows : [Math.floor(Math.random() * 16) + 2];
        const colors = opts.colors || null;

        // 建立 可见行 → 该行格子类型快照 的映射（碎片按格取色）
        const rowColors = {};
        if (colors) {
            for (let i = 0; i < rows.length && i < colors.length; i++) {
                rowColors[rows[i]] = colors[i];
            }
        }

        // 第一波：彩色方块碎片，自消行位置向四周爆开（主角）
        const rects = [];
        const perRow = 22;
        const target = Math.min(CLIMAX_PARTICLE_LIMIT, perRow * rows.length);
        let made = 0;
        for (const row of rows) {
            if (made >= target) break;
            for (let i = 0; i < perRow && made < target; i++, made++) {
                const col = Math.floor(Math.random() * 10);
                const px = boardX + (col + 0.5) * cellSize;
                const py = boardY + (row + 0.5) * cellSize;
                const angle = Math.random() * Math.PI * 2;
                const speed = 180 + Math.random() * 280;
                rects.push({
                    x: px, y: py,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: cellSize * 0.25 * (0.8 + Math.random() * 0.4),
                    life: 0.5 + Math.random() * 0.35,
                    maxLife: 0.85,
                    gravity: 380,
                    spin: (Math.random() - 0.5) * 10,
                    rot: Math.random() * Math.PI * 2,
                    color: this._cellColor(rowColors, row, col, theme.color),
                    delay: 0,
                });
            }
        }

        // 第二波：自行底边缘二次爆（延迟 0.1s 激活，增加层次）
        const secondWave = [];
        for (let i = 0; i < 14; i++) {
            const row = rows[Math.floor(Math.random() * rows.length)];
            const px = boardX + Math.random() * cellSize * 10;
            const py = boardY + (row + 0.9) * cellSize;
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
            const speed = 160 + Math.random() * 220;
            secondWave.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: cellSize * 0.25 * (0.8 + Math.random() * 0.4),
                life: 0.45 + Math.random() * 0.25,
                maxLife: 0.7,
                gravity: 420,
                spin: (Math.random() - 0.5) * 10,
                rot: Math.random() * Math.PI * 2,
                color: this._cellColor(rowColors, row, Math.floor(Math.random() * 10), theme.color),
                delay: 0.1,
            });
        }

        // 主题色火花：自消行中央向上喷（次要点缀）
        const sparks = [];
        const sparkCount = 16;
        for (let i = 0; i < sparkCount; i++) {
            const row = rows[0];
            const px = boardX + (Math.random() * 6 + 2) * cellSize;
            const py = boardY + (row + 0.5) * cellSize;
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
            const speed = 260 + Math.random() * 220;
            sparks.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: cellSize * 0.25 * (0.8 + Math.random() * 0.4),
                life: 0.4 + Math.random() * 0.2,
                maxLife: 0.6,
                gravity: 300,
            });
        }

        const game = (typeof GameGlobal !== 'undefined' && GameGlobal.game) || null;
        this._effects.push({
            type: 'climax',
            kind: kind,
            theme: theme,
            rects: rects,
            secondWave: secondWave,
            sparks: sparks,
            rows: rows,
            boardX: boardX,
            boardY: boardY,
            cellSize: cellSize,
            screenW: (game && game.width) || 375,
            screenH: (game && game.height) || 667,
            time: 0,
            duration: CLIMAX_DURATION,
            done: false,
        });
    }

    /**
     * 取碎片颜色：优先用被消行该格子的真实颜色，无快照时退回主题色
     */
    _cellColor(rowColors, row, col, fallback) {
        const rowArr = rowColors && rowColors[row];
        if (rowArr && rowArr[col]) {
            return TYPE_HEX[rowArr[col]] || fallback;
        }
        return fallback;
    }

    /**
     * 为一行添加粒子（方案 A：按被消格子真实颜色取色）
    /**
     * 为一行添加粒子（方案 A：按被消格子真实颜色取色）
     * @param {number} row - 被消行可见索引
     * @param {number} boardX
     * @param {number} boardY
     * @param {number} cellSize
     * @param {number} lineCount - 本次消行数
     * @param {boolean} isTSpin - 是否为 T-Spin（粒子整波金色，保留奖励识别色）
     * @param {number[]} [rowColors] - 该行 10 格类型值快照（按列取真实颜色）
     */
    _addRowParticles(row, boardX, boardY, cellSize, lineCount, isTSpin, rowColors) {
        const cfg = isTSpin ? PARTICLE_CONFIG.tspin : PARTICLE_CONFIG[Math.min(lineCount, 4)];
        const n = cfg.perCell * 10;
        // 粒子尺寸：方块 1/4 为基准，±20% 随机抖动（放大爆炸碎块感）
        const baseSize = cellSize * 0.25;
        // 取色回退：该行第一个非空格子的真实颜色；无快照时白色
        let fallbackColor = '#ffffff';
        if (rowColors) {
            for (const cell of rowColors) {
                if (cell && TYPE_HEX[cell]) {
                    fallbackColor = TYPE_HEX[cell];
                    break;
                }
            }
        }
        const particles = [];
        for (let i = 0; i < n; i++) {
            const col = i % 10;
            const px = boardX + (col + 0.5) * cellSize;
            const py = boardY + (row + 0.5) * cellSize;
            const angle = Math.random() * Math.PI * 2;
            const speed = cfg.speed[0] + Math.random() * (cfg.speed[1] - cfg.speed[0]);
            // 粒子颜色：T-Spin 整波金色；常规消行按该列格子的真实颜色，空格回退该行首个非空格色
            let color = '#FFD700';
            if (!cfg.gold) {
                const cell = (rowColors && rowColors[col]) || 0;
                color = (cell && TYPE_HEX[cell]) ? TYPE_HEX[cell] : fallbackColor;
            }
            particles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: baseSize * (0.8 + Math.random() * 0.4),
                color: color,
                life: cfg.life * (0.8 + Math.random() * 0.4),
                maxLife: cfg.life,
                gravity: cfg.gravity,
            });
        }
        this._effects.push({
            type: 'particles',
            particles: particles,
            color: cfg.gold ? '#FFD700' : fallbackColor,
            time: 0,
            duration: cfg.life + 0.1,
            done: false,
        });
    }
    /**
     * 添加闪屏
     */
    _addFlash(lineCount, isTetris, isTSpin, lineIndices, boardX, boardY, cellSize) {
        const cfg = isTSpin ? FLASH_CONFIG.tspin : FLASH_CONFIG[Math.min(lineCount, 4)];
        this._effects.push({
            type: 'flash',
            color: cfg.color,
            alpha: cfg.alpha,
            duration: cfg.duration,
            range: cfg.range,
            rows: lineIndices.slice(),
            boardX: boardX,
            boardY: boardY,
            cellSize: cellSize,
            time: 0,
            done: false,
        });
    }

    /**
     * 添加方块落地波纹
     * @param {number} boardX
     * @param {number} boardY
     * @param {number} cellSize
     * @param {Object} [piece] - 当前方块信息（用于波纹颜色与中心）
     * @param {boolean} [hardDrop] - 是否硬降（增强波纹）
     */
    addLandRipple(boardX, boardY, cellSize, piece, hardDrop) {
        const type = piece && piece.type ? piece.type : 'T';
        const color = PIECE_TYPE_COLOR_HEX[type] || '#ffffff';

        // 波纹中心：方块底部中央
        let centerX = boardX + cellSize * 5;
        let centerY = boardY + cellSize * 19;
        if (piece && typeof piece.row === 'number' && piece.matrix) {
            const bottomRow = piece.row + piece.matrix.length;
            const midCol = 5;
            centerX = boardX + (midCol + 0.5) * cellSize;
            centerY = boardY + (bottomRow - 0.3) * cellSize;
        }

        const scale = hardDrop ? 1.5 : 1;
        const alpha = hardDrop ? 0.375 : 0.25;
        const speed = hardDrop ? 260 : 200;

        this._effects.push({
            type: 'ripple',
            x: centerX,
            y: centerY,
            baseRadius: cellSize * 0.5,
            maxRadius: cellSize * 2.5 * scale,
            speed: speed,
            color: color,
            alpha: alpha,
            time: 0,
            duration: 0.25,
            done: false,
        });
    }

    /**
     * 添加硬降路径残影（方块快速砸落的淡出快照）
     * 沿垂直下落路径绘制 2-6 个 alpha 递增的快照：越靠起点越淡、越靠终点越清晰，
     * 配合整体淡出表现"瞬间砸到底"的速度感。
     * 性能：快照矩形在添加时一次性预计算，帧内只做 fillRect 淡出，无逐帧分配。
     * @param {number} boardX
     * @param {number} boardY
     * @param {number} cellSize
     * @param {Object} piece - 落地时方块信息（type/col/matrix）
     * @param {number} startRow - 硬降起始可见行
     * @param {number} endRow - 硬降落点可见行
     */
    addDropTrail(boardX, boardY, cellSize, piece, startRow, endRow) {
        const type = piece && piece.type ? piece.type : 'T';
        const color = PIECE_TYPE_COLOR_HEX[type] || '#ffffff';
        const matrix = piece && piece.matrix;
        const col = (piece && typeof piece.col === 'number') ? piece.col : 0;
        const dist = endRow - startRow;
        if (!matrix || !matrix.length || dist <= 0) return;

        // 同屏最多保留 2 条残影：超出时移除最早一条
        let trailCount = 0;
        for (let i = this._effects.length - 1; i >= 0; i--) {
            if (this._effects[i].type !== 'dropTrail') continue;
            trailCount++;
            if (trailCount >= 2) {
                this._effects.splice(i, 1);
            }
        }

        // 快照数量随距离自适应（2-6 个）
        const n = Math.min(6, Math.max(2, Math.ceil(dist / 3)));
        const rects = [];
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const row = startRow + dist * t;
            const alpha = 0.08 + 0.32 * t;
            for (let r = 0; r < matrix.length; r++) {
                for (let c = 0; c < matrix[r].length; c++) {
                    if (matrix[r][c] !== 1) continue;
                    rects.push({
                        x: boardX + (col + c) * cellSize,
                        y: boardY + (row + r) * cellSize,
                        w: cellSize,
                        h: cellSize,
                        alpha: alpha,
                    });
                }
            }
        }

        this._effects.push({
            type: 'dropTrail',
            color: color,
            rects: rects,
            time: 0,
            duration: 0.32,
            done: false,
        });
    }

    /**
     * 添加得分飘字
     * @param {number} x
     * @param {number} y
     * @param {string} text
     * @param {string} [color]
     */
    addScorePopup(x, y, text, color) {
        this._effects.push({
            type: 'scorePopup',
            x: x,
            y: y,
            text: text,
            color: color || '#ffffff',
            time: 0,
            duration: 1.0,
            done: false,
        });
    }

    /**
     * 每帧更新
     * @param {number} dt - 帧间隔（秒）
     */
    update(dt) {
        for (let i = this._effects.length - 1; i >= 0; i--) {
            const e = this._effects[i];
            e.time += dt;

            if (e.type === 'particles') {
                for (const p of e.particles) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += (p.gravity || 0) * dt;
                    p.life -= dt;
                }
            } else if (e.type === 'flash') {
                // 闪屏无需额外更新
            } else if (e.type === 'ripple') {
                // 波纹无需额外更新（由 time 驱动）
            } else if (e.type === 'climax') {
                // 碎片物理（重力回落 + 自旋；第二波延迟激活）
                for (const p of e.rects) {
                    if (p.delay > 0) { p.delay -= dt; continue; }
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += p.gravity * dt;
                    p.rot += p.spin * dt;
                    p.life -= dt;
                }
                for (const p of e.secondWave) {
                    if (p.delay > 0) { p.delay -= dt; continue; }
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += p.gravity * dt;
                    p.rot += p.spin * dt;
                    p.life -= dt;
                }
                // 火花物理
                for (const p of e.sparks) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy += p.gravity * dt;
                    p.life -= dt;
                }
            }

            if (e.time >= e.duration) {
                e.done = true;
                this._effects.splice(i, 1);
            }
        }
    }

    /**
     * 渲染所有活跃特效
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        for (const e of this._effects) {
            switch (e.type) {
                case 'lineClear': // 兼容旧类型
                    this._renderLineClear(ctx, e);
                    break;
                case 'flash':
                    this._renderFlash(ctx, e);
                    break;
                case 'scorePopup':
                    this._renderScorePopup(ctx, e);
                    break;
                case 'particles':
                    this._renderParticles(ctx, e);
                    break;
                case 'ripple':
                    this._renderRipple(ctx, e);
                    break;
                case 'dropTrail':
                    this._renderDropTrail(ctx, e);
                    break;
                case 'climax':
                    this._renderClimax(ctx, e);
                    break;
            }
        }
    }

    _renderLineClear(ctx, e) {
        const progress = e.time / e.duration;
        const alpha = 1 - progress;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
            e.boardX,
            e.boardY + e.row * e.cellSize,
            e.cellSize * 10,
            e.cellSize
        );
        ctx.globalAlpha = 1;
    }

    /**
     * 渲染闪屏
     */
    _renderFlash(ctx, e) {
        const progress = e.time / e.duration;
        const alpha = e.alpha * (1 - progress);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);

        if (e.range === -1) {
            // 全棋盘闪屏（Tetris）
            ctx.fillStyle = e.color;
            ctx.fillRect(e.boardX, e.boardY, e.cellSize * 10, e.cellSize * 20);
        } else {
            ctx.fillStyle = e.color;
            for (const row of e.rows) {
                const startRow = Math.max(0, row - e.range);
                const endRow = Math.min(19, row + e.range);
                for (let r = startRow; r <= endRow; r++) {
                    ctx.fillRect(
                        e.boardX,
                        e.boardY + r * e.cellSize,
                        e.cellSize * 10,
                        e.cellSize
                    );
                }
            }
        }

        ctx.restore();
    }

    _renderScorePopup(ctx, e) {
        const progress = e.time / e.duration;
        const alpha = 1 - progress;
        const offsetY = -progress * 40;

        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = e.color;
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.text, e.x, e.y + offsetY);
        ctx.globalAlpha = 1;
    }

    _renderParticles(ctx, e) {
        for (const p of e.particles) {
            if (p.life <= 0) continue;
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
            ctx.fillStyle = p.color || e.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /**
     * 渲染落地波纹
     */
    _renderRipple(ctx, e) {
        const progress = e.time / e.duration;
        if (progress >= 1) return;
        const radius = e.baseRadius + (e.maxRadius - e.baseRadius) * progress;
        const alpha = e.alpha * (1 - progress);

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // 椭圆：水平半径 = radius，垂直半径 = radius * 0.5
        ctx.ellipse(e.x, e.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 渲染硬降路径残影：整体淡出，快照保持方块颜色
     */
    _renderDropTrail(ctx, e) {
        const progress = e.time / e.duration;
        if (progress >= 1) return;
        const fade = 1 - progress;
        ctx.fillStyle = e.color;
        for (const r of e.rects) {
            ctx.globalAlpha = Math.max(0, Math.min(1, r.alpha * fade));
            ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        ctx.globalAlpha = 1;
    }

    /**
     * 渲染高潮特效（QUAD / T-Spin 演出）
     * 主角：彩色方块碎片向四周爆开（旋转 + 速度拖尾）；辅以爆亮白闪、主题色火花
     */
    _renderClimax(ctx, e) {
        const t = e.time;
        const theme = e.theme;
        const W = e.screenW || 375;
        const H = e.screenH || 667;

        // ---- 爆亮白闪（0~0.10s：消行行爆亮，爆炸瞬间的"爆亮"，非主角）----
        if (t < 0.10) {
            const a = 0.9 * (1 - t / 0.10);
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = '#ffffff';
            for (const row of e.rows) {
                ctx.fillRect(e.boardX, e.boardY + row * e.cellSize, e.cellSize * 10, e.cellSize);
            }
            ctx.globalAlpha = 1;
        }

        // ---- 全屏爆闪（0~0.12s 淡出）----
        if (t < 0.12) {
            ctx.globalAlpha = 0.22 * (1 - t / 0.12);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }

        // ---- 彩色碎片（主角）：第一波 + 第二波，混排"碎块炸开"感 ----
        for (const p of e.rects) {
            if (p.delay > 0 || p.life <= 0) continue;
            this._renderShard(ctx, p);
        }
        for (const p of e.secondWave) {
            if (p.delay > 0 || p.life <= 0) continue;
            this._renderShard(ctx, p);
        }

        // ---- 主题色火花（向上喷的小光点，次要点缀）----
        for (const p of e.sparks) {
            if (p.life <= 0) continue;
            const a = Math.max(0, Math.min(1, p.life / p.maxLife));
            ctx.globalAlpha = a;
            ctx.fillStyle = theme.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /**
     * 渲染单个碎片：速度拖尾线 + 旋转实体方块
     * 拖尾用细长线绘制（零 transform 开销），配合旋转方块形成"被击碎炸开"的质感
     */
    _renderShard(ctx, p) {
        const a = Math.max(0, Math.min(1, p.life / p.maxLife));
        ctx.globalAlpha = a;
        // 速度拖尾（沿运动方向的细线，增强爆开动感）
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.024, p.y - p.vy * 0.024);
        ctx.stroke();
        // 旋转实体碎块
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
    }

    /**
     * 获取当前震屏位移（高潮特效震屏期间返回随机抖动，其余时间返回 null）
     * @returns {{x: number, y: number}|null}
     */
    getShakeOffset() {
        for (const e of this._effects) {
            if (e.type !== 'climax') continue;
            const t = e.time;
            if (t >= CLIMAX_SHAKE.start && t < CLIMAX_SHAKE.end) {
                const p = (t - CLIMAX_SHAKE.start) / (CLIMAX_SHAKE.end - CLIMAX_SHAKE.start);
                // 指数衰减：开场震感最强，随后快速回落
                const intensity = CLIMAX_SHAKE.maxIntensity * (1 - p) * (1 - p);
                if (intensity <= 0.3) return null;
                return {
                    x: (Math.random() * 2 - 1) * intensity,
                    y: (Math.random() * 2 - 1) * intensity,
                };
            }
        }
        return null;
    }
}

module.exports = { EffectRenderer };
