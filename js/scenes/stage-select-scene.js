/**
 * StageSelectScene - 关卡选择场景（挖个方块首页）
 * 职责：展示 10 关进度、金色方块余额、每关最少消行记录；解锁 / 进入关卡。
 * 取代 tetris-mini 的四模式首页。
 * 样式参考 tetris-mini home-scene：满屏夜场背景 + 下落方块装饰 + 标题水平居中。
 */

const {
    fillNightBackground,
    drawBrandTitle,
    ACCENT,
    SUBTITLE,
    MUTED,
    AMBIENT_PIECE_COLORS,
} = require('../theme/arcade-night');
const goldenBlock = require('../../utils/golden-block-manager');

const COLS = 2;
const CARD_GAP = 14;
const CARD_H = 84;
const HEADER_H = 120;

// 背景装饰：缓慢下落的半透明方块（移植 tetris-mini 首页样式）
const BG_TETROMINO_SHAPES = [
    [ [1, 1, 1, 1] ],               // I
    [ [1, 1], [1, 1] ],             // O
    [ [0, 1, 0], [1, 1, 1] ],       // T
    [ [0, 1, 1], [1, 1, 0] ],       // S
    [ [1, 1, 0], [0, 1, 1] ],       // Z
    [ [1, 0, 0], [1, 1, 1] ],       // J
    [ [0, 0, 1], [1, 1, 1] ],       // L
];
const BG_TETROMINO_COLORS = AMBIENT_PIECE_COLORS;

class StageSelectScene {
    constructor() {
        this._params = null;
        this._cards = [];
        this._hitRects = [];
        this._toast = '';
        this._toastT = 0;
        // 背景装饰：缓慢下落的半透明方块
        this._fallingBlocks = [];
        this._animTime = 0;
    }

    onEnter() {
        this._toast = '';
        this._toastT = 0;
        this._animTime = 0;
        this._initFallingBlocks();
        this._buildCards();
    }

    onExit() {}

    /**
     * iOS 刘海/状态栏避让：返回头部内容的安全起始 Y。
     * 取 statusBarHeight 与 safeArea.top 的较大者（iPhone X+ 约 44），
     * 再叠加额外留白，保证大标题/金方块数量不被刘海遮挡。
     */
    _getTopInset() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;
        return Math.max(statusBarHeight, safeTop) + 16;
    }

    _buildCards() {
        const stages = goldenBlock.getStages();
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const cardW = (W - 24 - (COLS - 1) * CARD_GAP) / COLS;
        const topY = this._getTopInset() + HEADER_H;
        this._cards = [];
        this._hitRects = [];
        stages.forEach((stage, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const x = 12 + col * (cardW + CARD_GAP);
            const y = topY + row * (CARD_H + CARD_GAP);
            this._cards.push({
                stage,
                x,
                y,
                w: cardW,
                h: CARD_H,
            });
            this._hitRects.push({ x, y, w: cardW, h: CARD_H });
        });
    }

    /**
     * 触摸结束点击路由（game.js 通过 scene.handleTap(x, y) 分发到当前场景）
     * @param {number} x 逻辑坐标 X
     * @param {number} y 逻辑坐标 Y
     */
    handleTap(x, y) {
        for (let i = 0; i < this._cards.length; i++) {
            const r = this._hitRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                this._handleCardTap(this._cards[i]);
                return;
            }
        }
    }

    _handleCardTap(card) {
        const stage = card.stage;
        const unlocked = goldenBlock.isUnlocked(stage.id);
        if (!unlocked) {
            const res = goldenBlock.unlockStage(stage.id);
            if (!res.ok) {
                if (res.reason === 'no-gold') {
                    this._showToast('金色方块不足');
                }
                return;
            }
        }
        GameGlobal.game.sceneManager.switchTo('game', {
            mode: 'stage',
            stageId: stage.id,
        });
    }

    _showToast(msg) {
        this._toast = msg;
        this._toastT = 1.6;
    }

    update(dt) {
        this._animTime += dt;
        if (this._toastT > 0) this._toastT -= dt;
        this._updateFallingBlocks(dt);
    }

    // ==================== 背景装饰：缓慢下落的半透明方块 ====================

    _initFallingBlocks() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const count = 12;
        this._fallingBlocks = [];
        for (let i = 0; i < count; i++) {
            this._fallingBlocks.push(this._createFallingBlock(W, H, true));
        }
    }

    /**
     * 生成一个背景装饰方块
     * @param {number} W 画布宽
     * @param {number} H 画布高
     * @param {boolean} initial 是否为初始生成（初始可分布在整屏，后续从顶部重生）
     */
    _createFallingBlock(W, H, initial) {
        const shapeIndex = Math.floor(Math.random() * BG_TETROMINO_SHAPES.length);
        const size = 18 + Math.floor(Math.random() * 22); // 18~40px
        return {
            shapeIndex: shapeIndex,
            color: BG_TETROMINO_COLORS[shapeIndex],
            // 初始生成时散布全屏；后续重生从屏幕上方进入
            y: initial ? Math.random() * H : -size * 4 - Math.random() * H * 0.3,
            baseX: Math.random() * W,
            size: size,
            // 下落速度：30~80 px/s，非常缓慢
            speed: 30 + Math.random() * 50,
            // 横向摆动
            swayAmp: 6 + Math.random() * 18,
            swaySpeed: 0.4 + Math.random() * 0.8,
            swayPhase: Math.random() * Math.PI * 2,
            // 旋转角度（缓慢旋转）
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.5,
            // 透明度：0.15~0.35，半透明氛围不遮挡前景
            alpha: 0.15 + Math.random() * 0.20,
        };
    }

    /**
     * 更新背景装饰方块：下落 + 摆动 + 旋转，超出屏幕后从顶部重生
     * @param {number} dt 帧间隔（秒）
     */
    _updateFallingBlocks(dt) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        for (let i = 0; i < this._fallingBlocks.length; i++) {
            const b = this._fallingBlocks[i];
            b.y += b.speed * dt;
            b.rot += b.rotSpeed * dt;
            if (b.y - b.size * 2 > H) {
                this._fallingBlocks[i] = this._createFallingBlock(W, H, false);
            }
        }
    }

    /**
     * 渲染背景装饰方块：半透明、横向摆动、缓慢旋转
     * @param {CanvasRenderingContext2D} ctx
     */
    _renderFallingBlocks(ctx) {
        const shapeData = BG_TETROMINO_SHAPES;
        for (const b of this._fallingBlocks) {
            const swayX = Math.sin(this._animTime * b.swaySpeed + b.swayPhase) * b.swayAmp;
            const x = b.baseX + swayX;
            ctx.save();
            ctx.globalAlpha = b.alpha;
            ctx.translate(x + b.size, b.y + b.size);
            ctx.rotate(b.rot);
            ctx.fillStyle = b.color;
            for (let r = 0; r < shapeData[b.shapeIndex].length; r++) {
                const row = shapeData[b.shapeIndex][r];
                for (let c = 0; c < row.length; c++) {
                    if (row[c]) {
                        ctx.fillRect(c * b.size - b.size, r * b.size - b.size, b.size - 1, b.size - 1);
                    }
                }
            }
            ctx.restore();
        }
    }

    _drawCard(ctx, card) {
        const { stage, x, y, w, h } = card;
        const unlocked = goldenBlock.isUnlocked(stage.id);
        const best = goldenBlock.getStageBest(stage.id);
        const cleared = !!best;

        ctx.fillStyle = unlocked ? 'rgba(255, 200, 87, 0.14)' : 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, 10);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.fill();
        ctx.strokeStyle = unlocked ? 'rgba(255, 200, 87, 0.6)' : 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, 10);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.stroke();

        // 关卡号
        ctx.fillStyle = unlocked ? ACCENT : MUTED;
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(stage.id), x + 12, y + 10);

        // 名称
        ctx.fillStyle = unlocked ? '#ffffff' : MUTED;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(stage.name, x + 12, y + 46);

        // 状态行：理论 / 最佳 / 锁定
        ctx.font = '12px sans-serif';
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'right';
        let status;
        if (!unlocked) {
            status = '🔒 解锁 ' + (stage.unlockCost || 0) + ' 块';
        } else if (cleared) {
            status = '最佳 ' + best.lines + ' 行';
        } else {
            status = '理论 ' + (stage.minLines || 0) + ' 行';
        }
        ctx.fillText(status, x + w - 12, y + 12);
        ctx.textAlign = 'left';
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 满屏夜场街机背景（参考 tetris-mini 首页：fillNightBackground 全屏）
        fillNightBackground(ctx, W, H);
        // 背景装饰：缓慢下落的半透明方块
        this._renderFallingBlocks(ctx);

        const topInset = this._getTopInset();

        // 大标题：水平居中（drawBrandTitle 以 x 为水平中心，参考 tetris-mini W/2 写法）
        drawBrandTitle(ctx, '挖个方块', W / 2, topInset, 'bold 26px sans-serif');

        // 金色方块余额（右上角，避开刘海）
        const balance = goldenBlock.getBalance();
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('◆ ' + balance, W - 16, topInset + 10);
        ctx.textAlign = 'left';

        // 小标题：水平居中
        ctx.fillStyle = SUBTITLE;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('清掉垃圾过关 · 最少消行', W / 2, topInset + 42);
        ctx.textAlign = 'left';

        this._cards.forEach((card) => this._drawCard(ctx, card));

        // 底部提示
        ctx.fillStyle = MUTED;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('首通 +1 金色方块 · 破纪录再 +1', W / 2, H - 14);
        ctx.textAlign = 'left';

        // Toast
        if (this._toastT > 0 && this._toast) {
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.font = '14px sans-serif';
            const tw = ctx.measureText(this._toast).width + 24;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(W / 2 - tw / 2, H - 70, tw, 34, 8);
            else ctx.rect(W / 2 - tw / 2, H - 70, tw, 34);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(this._toast, W / 2, H - 53);
        }
    }
}

module.exports = StageSelectScene;
