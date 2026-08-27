/**
 * WorkshopResultScene - 工坊结算（只展示金币，永不发金方块）
 */
const {
    fillNightBackground,
    drawBrandTitle,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const { Button } = require('../widgets/button');
const workshop = require('../../utils/workshop-manager');

class WorkshopResultScene {
    constructor() {
        this._buttons = [];
        this._result = null;
    }

    onEnter(params) {
        this._params = params || {};
        this._result = this._params.result || {};
        this._authorTrial = !!this._params.authorTrial;
        this._stageId = this._params.workshopStageId;
        this._title = this._params.workshopTitle || '工坊关卡';
        this._buildButtons();
    }

    onExit() {
        this._buttons = [];
    }

    _buildButtons() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const bw = Math.min(260, W * 0.7);
        const bh = 46;
        this._buttons = [];

        if (this._authorTrial) {
            this._buttons.push(new Button({
                x: (W - bw) / 2,
                y: H * 0.62,
                w: bw,
                h: bh,
                text: '返回编辑',
                color: '#3a7ab0',
                onClick: () => {
                    GameGlobal.game.sceneManager.leaveTo('workshopEditor', {
                        stageId: this._stageId,
                    }, ['home', 'workshop']);
                },
            }));
            this._buttons.push(new Button({
                x: (W - bw) / 2,
                y: H * 0.62 + bh + 12,
                w: bw,
                h: bh,
                text: '我的关卡',
                color: '#555',
                onClick: () => {
                    GameGlobal.game.sceneManager.leaveTo('workshop', {
                        mainTab: 'mine',
                        mineSub: 'cleared',
                    }, ['home']);
                },
            }));
        } else {
            this._buttons.push(new Button({
                x: (W - bw) / 2,
                y: H * 0.62,
                w: bw,
                h: bh,
                text: '再玩一局',
                color: '#e09a30',
                onClick: () => {
                    const stage = workshop.getStage(this._stageId);
                    if (!stage) {
                        GameGlobal.game.sceneManager.leaveTo('workshop', {}, ['home']);
                        return;
                    }
                    GameGlobal.game.sceneManager.leaveTo('workshop', {
                        mainTab: 'plaza',
                        toast: '请再次解锁开打',
                    }, ['home']);
                },
            }));
            this._buttons.push(new Button({
                x: (W - bw) / 2,
                y: H * 0.62 + bh + 12,
                w: bw,
                h: bh,
                text: '返回广场',
                color: '#555',
                onClick: () => {
                    GameGlobal.game.sceneManager.leaveTo('workshop', {
                        mainTab: 'plaza',
                    }, ['home']);
                },
            }));
        }
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);
        drawBrandTitle(ctx, this._authorTrial ? '自通成功' : '通关！', W / 2, H * 0.18, 'bold 36px sans-serif');

        ctx.fillStyle = SUBTITLE;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this._title, W / 2, H * 0.26);

        const r = this._result;
        ctx.fillStyle = '#fff';
        ctx.font = '15px sans-serif';
        ctx.fillText('消行 ' + (r.lines || 0) + ' · 块数 ' + (r.pieces || 0), W / 2, H * 0.36);

        if (this._authorTrial) {
            ctx.fillStyle = '#2ecc71';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText('已记录自通凭证，可提交广场', W / 2, H * 0.46);
            ctx.fillStyle = MUTED;
            ctx.font = '13px sans-serif';
            ctx.fillText('工坊通关不产出金方块', W / 2, H * 0.52);
        } else {
            ctx.fillStyle = '#f0c040';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('+' + (r.coinGained || 0) + ' 金币', W / 2, H * 0.46);
            if ((r.coinWant || 0) > (r.coinGained || 0)) {
                ctx.fillStyle = MUTED;
                ctx.font = '12px sans-serif';
                ctx.fillText('日池已触顶（理论 ' + r.coinWant + '）', W / 2, H * 0.52);
            } else {
                ctx.fillStyle = MUTED;
                ctx.font = '13px sans-serif';
                ctx.fillText('不奖励金方块', W / 2, H * 0.52);
            }
        }

        for (const btn of this._buttons) btn.render(ctx);
    }

    handleTap(x, y) {
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
    }
}

module.exports = WorkshopResultScene;
