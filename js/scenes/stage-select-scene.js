/**
 * StageSelectScene - 关卡选择场景（挖个方块首页）
 * 职责：展示 10 关进度、金色方块余额、每关最少消行记录；解锁 / 进入关卡。
 * 取代 tetris-mini 的四模式首页。
 */

const {
    fillNightBackground,
    drawBrandTitle,
    ACCENT,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const goldenBlock = require('../../utils/golden-block-manager');

const COLS = 2;
const CARD_GAP = 14;
const CARD_H = 84;
const HEADER_H = 120;

class StageSelectScene {
    constructor() {
        this._params = null;
        this._cards = [];
        this._hitRects = [];
        this._toast = '';
        this._toastT = 0;
    }

    onEnter() {
        this._toast = '';
        this._toastT = 0;
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
        if (this._toastT > 0) this._toastT -= dt;
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
        fillNightBackground(ctx, W, H);

        const topInset = this._getTopInset();

        drawBrandTitle(ctx, '挖个方块', 12, topInset, 'bold 26px sans-serif');

        // 金色方块余额
        const balance = goldenBlock.getBalance();
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('◆ ' + balance, W - 16, topInset + 10);
        ctx.textAlign = 'left';

        ctx.fillStyle = SUBTITLE;
        ctx.font = '14px sans-serif';
        ctx.fillText('清掉垃圾过关 · 最少消行', 14, topInset + 42);

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
