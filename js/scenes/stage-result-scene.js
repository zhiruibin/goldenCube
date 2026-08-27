/**
 * StageResultScene - 关卡结算场景（挖个方块）
 * 职责：展示本关消行数 vs 理论最少、用时、金色方块奖励；下一关 / 重玩 / 返回关选。
 */

const {
    fillNightBackground,
    drawBrandTitle,
    ACCENT,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const goldenBlock = require('../../utils/golden-block-manager');
const { Button } = require('../widgets/button');

class StageResultScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._stage = null;
        this._result = null;
        this._animTime = 0;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._stage = goldenBlock.getStage(this._params.stageId);
        this._result = this._params.result || null;
        this._buildButtons();
    }

    onExit() {}

    _buildButtons() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const bw = Math.min(260, W * 0.7);
        const bh = 46;
        const gap = 12;
        const buttons = [];
        const nextStage = this._stage
            ? goldenBlock.getStage(Number(this._stage.id) + 1)
            : null;
        if (nextStage) {
            buttons.push({
                text: '下一关 ' + nextStage.id,
                color: '#f0a000',
                onClick: () => this._enterStage(nextStage),
            });
        }
        buttons.push({
            text: '重玩本关',
            color: '#555',
            onClick: () => this._enterStage(this._stage),
        });
        buttons.push({
            text: '返回关卡选择',
            color: '#333',
            onClick: () => GameGlobal.game.sceneManager.replace('stageSelect'),
        });
        const totalH = buttons.length * bh + (buttons.length - 1) * gap;
        let y = H - totalH - 24;
        this._buttons = buttons.map((b) => {
            const x = W / 2 - bw / 2;
            const btn = new Button({
                x,
                y,
                w: bw,
                h: bh,
                text: b.text,
                color: b.color,
                onClick: b.onClick,
            });
            y += bh + gap;
            return btn;
        });
    }

    _enterStage(stage) {
        if (!stage) return;
        GameGlobal.game.sceneManager.replace('game', {
            mode: 'stage',
            stageId: stage.id,
        });
    }

    onTouchStart(e) {
        const x = e.clientX;
        const y = e.clientY;
        for (let i = 0; i < this._buttons.length; i++) {
            const btn = this._buttons[i];
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
    }

    update(dt) {
        this._animTime += dt;
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);

        drawBrandTitle(ctx, '过关', 12, 14, 'bold 30px sans-serif');

        const stageName = this._stage ? this._stage.name : '';
        ctx.fillStyle = SUBTITLE;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('第 ' + (this._stage ? this._stage.id : '?') + ' 关 · ' + stageName, W / 2, 80);
        ctx.textAlign = 'left';

        const cx = W / 2;
        let y = 150;
        ctx.textAlign = 'center';

        // 消行数 vs 理论
        if (this._result) {
            const lines = this._result.lines || 0;
            const theory = this._stage ? this._stage.minLines : 0;
            ctx.fillStyle = ACCENT;
            ctx.font = 'bold 44px sans-serif';
            ctx.fillText(String(lines) + ' 行', cx, y);
            y += 34;
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText('理论最少 ' + theory + ' 行' + (lines === theory ? ' · 满分！' : ''), cx, y);
            y += 40;

            // 用块数 / 用时
            ctx.fillStyle = SUBTITLE;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                '用块 ' + (this._result.pieces || 0) + ' · 用时 ' + this._formatTime(this._result.timeMs || 0),
                cx, y
            );
            y += 34;

            // 奖励
            const reward = this._result.reward || 0;
            if (reward > 0) {
                ctx.fillStyle = ACCENT;
                ctx.font = 'bold 20px sans-serif';
                ctx.fillText('金色方块 +' + reward, cx, y);
                y += 30;
                ctx.fillStyle = MUTED;
                ctx.font = '12px sans-serif';
                ctx.fillText(this._result.first ? '首通奖励' : '刷新最少消行记录', cx, y);
            } else {
                ctx.fillStyle = MUTED;
                ctx.font = '14px sans-serif';
                ctx.fillText('本关已通关，未刷新记录', cx, y);
            }
        }

        ctx.textAlign = 'left';

        // 按钮
        this._buttons.forEach((b) => b.render(ctx));
    }

    _formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        return m > 0 ? m + '分' + (s % 60) + '秒' : s + '秒';
    }
}

module.exports = StageResultScene;
