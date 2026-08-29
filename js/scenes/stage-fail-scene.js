/**
 * StageFailScene - 闯关失败结算
 * 展示本局成绩、入场费退还；支持广告免费重开 / 付费重玩 / 回看 / 返回关选。
 */

const {
    fillNightBackground,
    drawBrandTitle,
    ACCENT,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const { Button } = require('../widgets/button');
const {
    promptStageEntry,
    handleEntryDialogTap,
    renderEntryDialog,
    formatStageEntryButtonLabel,
} = require('../../utils/stage-entry-ui');
const { buildIsoBlockFaces, drawSolidIsoBlock } = require('../render/iso-block-renderer');
const {
    preloadResultBlockImages,
    drawResultBlockImage,
} = require('../render/result-block-image');

class StageFailScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._stage = null;
        this._result = null;
        this._animTime = 0;
        this._entryDialog = null;
        this._toast = '';
        this._toastUntil = 0;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._entryDialog = null;
        this._toast = '';
        this._toastUntil = 0;
        this._stage = goldenBlock.getStage(this._params.stageId);
        this._result = this._params.result || null;
        this._replayKey = this._params.replayKey || '';
        preloadResultBlockImages();
        this._buildButtons();
    }

    onExit() {}

    _getTopInset() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;
        return Math.max(statusBarHeight, safeTop) + 16;
    }

    _promptEnter(stage) {
        promptStageEntry(stage, {
            onDialog: (dialog) => {
                this._entryDialog = dialog;
            },
            onInsufficient: () => {
                const canAd = isRewardedVideoConfigured() === true;
                this._showToast(canAd ? '金币不足，可看广告免费入场' : '金币不足，请先攒够入场费');
            },
        });
    }

    _showToast(msg) {
        this._toast = msg || '';
        this._toastUntil = Date.now() + 2200;
    }

    _freeRetryViaAd() {
        if (coinManager.getFreeRetryRemaining() <= 0) return;
        if (isRewardedVideoConfigured() !== true) return;
        adManager.showRewardedVideo()
            .then(() => {
                coinManager.consumeFreeRetry();
                GameGlobal.game.sceneManager.replace('game', {
                    mode: 'stage',
                    stageId: this._params.stageId,
                    entryPaid: 0,
                });
            })
            .catch(() => { /* 未看完不重开 */ });
    }

    _getBottomInset() {
        const H = GameGlobal.game.height;
        const safeArea = (GameGlobal.game.systemInfo || {}).safeArea || {};
        return (safeArea.bottom && H > safeArea.bottom) ? (H - safeArea.bottom) : 0;
    }

    _buildButtons() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const bottomInset = this._getBottomInset();
        const bw = Math.min(260, W * 0.7);
        const bh = 46;
        const gap = 12;
        const buttons = [];

        const canFreeRetry = coinManager.getFreeRetryRemaining() > 0
            && isRewardedVideoConfigured() === true;
        if (canFreeRetry) {
            const left = coinManager.getFreeRetryRemaining();
            buttons.push({
                text: '看广告免费重开（剩 ' + left + ' 次）',
                color: '#3a7ab0',
                onClick: () => this._freeRetryViaAd(),
            });
        }
        buttons.push({
            text: formatStageEntryButtonLabel('重玩本关', this._stage ? this._stage.id : 0),
            color: '#f0a000',
            onClick: () => this._promptEnter(this._stage),
        });
        if (this._replayKey) {
            buttons.push({
                text: '回看本局',
                color: '#7b52ab',
                onClick: () => {
                    GameGlobal.game.sceneManager.switchTo('replay', {
                        replayKey: this._replayKey,
                        fromStageFail: true,
                        stageId: this._params.stageId,
                        result: this._result,
                    });
                },
            });
        }
        buttons.push({
            text: '返回关卡选择',
            color: '#333',
            onClick: () => GameGlobal.game.sceneManager.replace('stageSelect'),
        });

        const totalH = buttons.length * bh + (buttons.length - 1) * gap;
        this._buttonsTopY = H - bottomInset - totalH - 24;
        let y = this._buttonsTopY;
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

    handleTap(x, y) {
        if (this._entryDialog) {
            const action = handleEntryDialogTap(this._entryDialog, x, y, {
                onInsufficient: (fee) => {
                    const canAd = isRewardedVideoConfigured() === true;
                    this._showToast(canAd ? '金币不足（需 ' + fee + '）' : '金币不足，请先攒够入场费');
                },
                onToast: (msg) => this._showToast(msg),
            });
            if (action === 'dismiss') {
                this._entryDialog = null;
            }
            if (action) return;
        }
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
        if (this._toast && Date.now() > this._toastUntil) this._toast = '';
    }

    /** 中间展示区：失败方块插画（加载失败时回退矢量） */
    _drawGrayBlockHero(ctx, cx, cy, size) {
        const drawn = drawResultBlockImage(ctx, 'fail', cx, cy, size * 1.35, this._animTime);
        if (drawn) return;

        const t = this._animTime;
        const pulse = 0.88 + Math.sin(t * 2.4) * 0.08;
        const s = size * pulse;
        const geo = buildIsoBlockFaces(cx, cy, s, 'cube');
        drawSolidIsoBlock(ctx, geo, {
            left: 'rgba(72, 78, 92, 0.55)',
            right: 'rgba(108, 116, 132, 0.55)',
            top: 'rgba(178, 186, 200, 0.5)',
            bottom: 'rgba(42, 46, 58, 0.35)',
            backEdge: 'rgba(200, 210, 225, 0.75)',
            backEdgeWidth: 1.4,
            frontEdge: 'rgba(220, 228, 240, 0.65)',
            frontEdgeWidth: 1.3,
            shadowAlpha: 0.35,
        });
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);

        const topInset = this._getTopInset();
        drawBrandTitle(ctx, '未过关', W / 2, topInset + 10, 'bold 30px sans-serif');

        const stageName = this._stage ? this._stage.name : '';
        ctx.fillStyle = SUBTITLE;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('第 ' + (this._stage ? this._stage.id : '?') + ' 关 · ' + stageName, W / 2, topInset + 52);

        const cx = W / 2;
        let y = topInset + 108;
        if (this._result) {
            const lines = this._result.lines || 0;
            const minLines = this._result.minLines || (this._stage ? this._stage.minLines : 0);
            ctx.fillStyle = '#e74c3c';
            ctx.font = 'bold 44px sans-serif';
            ctx.fillText(String(lines) + ' 行', cx, y);
            y += 32;
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText('需消 ' + minLines + ' 行垃圾方可过关', cx, y);
            y += 36;

            ctx.fillStyle = SUBTITLE;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                '用块 ' + (this._result.pieces || 0) + ' · 用时 ' + this._formatTime(this._result.timeMs || 0),
                cx, y
            );
            y += 32;

            const refund = this._result.refund || 0;
            if (refund > 0) {
                ctx.fillStyle = ACCENT;
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText('入场费退还 ' + refund + ' 金币（50%）', cx, y);
                y += 28;
            }

            const statsBottom = y + 4;
            const heroTop = statsBottom + 8;
            const heroBottom = (this._buttonsTopY || H * 0.72) - 36;
            const heroCy = (heroTop + heroBottom) / 2 - 25;
            const heroSize = Math.min(120, Math.max(72, (heroBottom - heroTop) * 0.5));
            this._drawGrayBlockHero(ctx, cx, heroCy, heroSize);

            // 插画含光晕，按实际绘制边长估算底边
            const cubeBottomY = heroCy + heroSize * 1.35 * 0.48;
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            const reasonText = this._result.reason === 'topOut' ? '方块堆满，本局结束'
                : '未达过关条件';
            ctx.fillText(reasonText, cx, cubeBottomY + 20);
        }

        ctx.textAlign = 'left';
        this._buttons.forEach((b) => b.render(ctx));

        if (this._entryDialog) {
            renderEntryDialog(ctx, W, H, this._entryDialog);
        }
        if (this._toast) {
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.font = '14px sans-serif';
            const tw = ctx.measureText(this._toast).width + 24;
            const th = 34;
            const tx = W / 2 - tw / 2;
            const ty = H - 70;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, 8);
            else ctx.rect(tx, ty, tw, th);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._toast, W / 2, ty + th / 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }
    }

    _formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const ss = s % 60;
        return m + ':' + (ss < 10 ? '0' : '') + ss;
    }
}

module.exports = StageFailScene;
