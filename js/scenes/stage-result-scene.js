/**
 * StageResultScene - 关卡结算（挖个方块）
 * 展示消行 vs 理论、金币效率结算、金色方块奖励；下一关 / 重玩 / 返回；可选广告再领一份。
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
const { buildIsoBlockFaces, drawSolidIsoBlock } = require('../render/iso-block-renderer');
const {
    preloadResultBlockImages,
    drawResultBlockImage,
} = require('../render/result-block-image');
const { ConfettiFx } = require('../render/confetti-fx');
const {
    promptStageEntry,
    handleEntryDialogTap,
    renderEntryDialog,
    formatStageEntryButtonLabel,
} = require('../../utils/stage-entry-ui');

class StageResultScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._stage = null;
        this._result = null;
        this._animTime = 0;
        this._doubleClaimed = false;
        this._confettiFx = null;
        this._entryDialog = null;
        this._toast = '';
        this._toastUntil = 0;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._doubleClaimed = false;
        this._entryDialog = null;
        this._toast = '';
        this._toastUntil = 0;
        this._stage = goldenBlock.getStage(this._params.stageId);
        this._result = this._params.result || null;
        this._replayKey = this._params.replayKey || '';
        preloadResultBlockImages();
        this._buildButtons();

        // 过关撒花：复用摇奖结束同款 ConfettiFx
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        if (this._confettiFx) {
            this._confettiFx.destroy();
        }
        this._confettiFx = new ConfettiFx();
        this._confettiFx.init();
        this._confettiFx.trigger(W / 2, H * 0.42);

        try {
            const audio = GameGlobal.game && GameGlobal.game.audioManager;
            if (audio && typeof audio.playTetris === 'function') {
                audio.playTetris();
            } else if (audio && typeof audio.playLevelUp === 'function') {
                audio.playLevelUp();
            }
        } catch (e) { /* ignore */ }
    }

    onExit() {
        if (this._confettiFx) {
            this._confettiFx.destroy();
            this._confettiFx = null;
        }
    }

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
        const nextStage = this._stage
            ? goldenBlock.getStage(Number(this._stage.id) + 1)
            : null;

        const canDouble = !this._doubleClaimed
            && this._result
            && (this._result.coinWant || 0) > 0
            && coinManager.getAdBonusRemaining() > 0
            && isRewardedVideoConfigured() === true;

        if (canDouble) {
            buttons.push({
                text: '看广告再领一份金币',
                color: '#3a7ab0',
                onClick: () => this._claimDouble(),
            });
        }
        if (nextStage && goldenBlock.isChapterUnlocked(
            nextStage.chapterId || Math.floor((nextStage.id - 1) / 10) + 1
        )) {
            buttons.push({
                text: formatStageEntryButtonLabel('下一关 ' + nextStage.id, nextStage.id),
                color: '#f0a000',
                onClick: () => this._promptEnter(nextStage),
            });
        }
        buttons.push({
            text: formatStageEntryButtonLabel('重玩本关', this._stage ? this._stage.id : 0),
            color: '#555',
            onClick: () => this._promptEnter(this._stage),
        });
        if (this._replayKey) {
            buttons.push({
                text: '回看本局',
                color: '#7b52ab',
                onClick: () => {
                    GameGlobal.game.sceneManager.switchTo('replay', {
                        replayKey: this._replayKey,
                        fromStageResult: true,
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

    _getGoldRewardTotal() {
        if (!this._result) return 0;
        return (this._result.reward || 0)
            + (this._result.chapterReward || 0)
            + (this._result.milestoneReward || 0);
    }

    _getGoldRewardLabel() {
        if (!this._result) return '';
        const bits = [];
        if (this._result.reward) bits.push(this._result.first ? '首通' : '破纪录');
        if (this._result.chapterReward) bits.push('章奖');
        if (this._result.milestoneReward) bits.push('全通');
        return bits.join(' · ');
    }

    /** 中间展示区：金色方块插画（破纪录 / 未破纪录）；数量文案在方块下方单独绘制 */
    _drawGoldenBlockHero(ctx, cx, cy, size, goldAmount) {
        const active = goldAmount > 0;
        const kind = active ? 'record' : 'clear';
        const drawn = drawResultBlockImage(ctx, kind, cx, cy, size * 1.35, this._animTime);

        if (!drawn) {
            const t = this._animTime;
            const pulse = 0.85 + Math.sin(t * 3.2) * 0.15;
            const s = size * (active ? pulse : 0.92);
            const geo = buildIsoBlockFaces(cx, cy, s, active ? 'cube' : 'halfFrame');
            const dim = active ? 1 : 0.45;
            if (geo.variant === 'halfFrame') {
                drawSolidIsoBlock(ctx, geo, {
                    left: `rgba(201, 162, 39, ${0.95 * dim})`,
                    right: `rgba(224, 154, 48, ${0.95 * dim})`,
                    top: `rgba(255, 215, 64, ${0.98 * dim})`,
                    cut: `rgba(255, 215, 64, ${0.88 * dim})`,
                    wireStroke: `rgba(255, 215, 64, ${0.75 * dim})`,
                    wireWidth: 1.8,
                    shadowAlpha: 0.3,
                });
            } else {
                drawSolidIsoBlock(ctx, geo, {
                    left: `rgba(201, 162, 39, ${0.55 * dim})`,
                    right: `rgba(224, 154, 48, ${0.55 * dim})`,
                    top: `rgba(255, 215, 64, ${0.5 * dim})`,
                    bottom: `rgba(140, 100, 25, ${0.35 * dim})`,
                    backEdge: `rgba(255, 230, 150, ${0.75 * dim})`,
                    frontEdge: `rgba(255, 240, 180, ${0.7 * dim})`,
                    shadowAlpha: 0.35,
                });
            }
        }
    }

    _claimDouble() {
        if (this._doubleClaimed || !this._result) return;
        const base = this._result.coinWant || this._result.coinGained || 0;
        if (base <= 0) return;
        adManager.showRewardedVideo()
            .then(() => {
                const gained = coinManager.rewardAdDouble(base);
                this._doubleClaimed = true;
                this._result.coinDouble = gained;
                this._buildButtons();
            })
            .catch(() => { /* 未看完不发 */ });
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
        if (this._confettiFx) this._confettiFx.update(dt);
        if (this._toast && Date.now() > this._toastUntil) this._toast = '';
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);

        const topInset = this._getTopInset();
        drawBrandTitle(ctx, '过关', W / 2, topInset + 10, 'bold 30px sans-serif');

        const stageName = this._stage ? this._stage.name : '';
        ctx.fillStyle = SUBTITLE;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('第 ' + (this._stage ? this._stage.id : '?') + ' 关 · ' + stageName, W / 2, topInset + 52);

        const cx = W / 2;
        let y = topInset + 110;
        if (this._result) {
            const lines = this._result.lines || 0;
            const theory = this._result.minLines || (this._stage ? this._stage.minLines : 0);
            const T = this._result.coinThreshold || theory * 2;
            ctx.fillStyle = ACCENT;
            ctx.font = 'bold 44px sans-serif';
            ctx.fillText(String(lines) + ' 行', cx, y);
            y += 37; // 「理论 / 阈值」相对大号消行下移 5px
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                '理论 ' + theory + ' · 阈值 T=' + T + (lines <= theory ? ' · 满分！' : ''),
                cx, y
            );
            y += 36;

            ctx.fillStyle = SUBTITLE;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                '用块 ' + (this._result.pieces || 0) + ' · 用时 ' + this._formatTime(this._result.timeMs || 0),
                cx, y
            );
            y += 32;

            const coinGained = this._result.coinGained || 0;
            const coinWant = this._result.coinWant || 0;
            ctx.fillStyle = ACCENT;
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(
                '金币 +' + coinGained + (coinGained < coinWant ? '（日限）' : ''),
                cx, y
            );
            y += 28;
            if (this._result.coinDouble) {
                ctx.fillStyle = SUBTITLE;
                ctx.font = '14px sans-serif';
                ctx.fillText('广告再领 +' + this._result.coinDouble, cx, y);
                y += 26;
            }
            if (this._result.luckyCoinBonus > 0) {
                ctx.fillStyle = SUBTITLE;
                ctx.font = '14px sans-serif';
                ctx.fillText('幸运摇奖 +' + this._result.luckyCoinBonus, cx, y);
                y += 26;
            }

            const statsBottom = y;
            const heroTop = statsBottom + 8;
            const heroBottom = (this._buttonsTopY || H * 0.72) - 36;
            const heroCy = (heroTop + heroBottom) / 2 - 25;
            const heroSize = Math.min(120, Math.max(72, (heroBottom - heroTop) * 0.5));
            const goldTotal = this._getGoldRewardTotal();

            this._drawGoldenBlockHero(ctx, cx, heroCy, heroSize, goldTotal);

            const cubeBottomY = heroCy + heroSize * 1.35 * 0.48;
            ctx.textAlign = 'center';
            if (goldTotal > 0) {
                ctx.fillStyle = ACCENT;
                ctx.font = 'bold 16px sans-serif';
                ctx.fillText('金色方块 +' + goldTotal, cx, cubeBottomY + 20);
                const label = this._getGoldRewardLabel();
                if (label) {
                    ctx.fillStyle = MUTED;
                    ctx.font = '12px sans-serif';
                    ctx.fillText(label, cx, cubeBottomY + 42);
                }
            } else {
                ctx.fillStyle = MUTED;
                ctx.font = '14px sans-serif';
                // isNewBest 但 reward=0：破纪录金已达每关 2 次封顶
                const capped = !!(this._result && this._result.isNewBest);
                ctx.fillText(
                    capped ? '已破纪录，破纪录奖励已达上限' : '本关已通关，未刷新记录',
                    cx, cubeBottomY + 20
                );
            }
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

        // 撒花叠在最上层（与摇奖庆祝一致）
        if (this._confettiFx && this._confettiFx.isActive()) {
            this._confettiFx.render(ctx);
        }
    }

    _formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const ss = s % 60;
        return m + ':' + (ss < 10 ? '0' : '') + ss;
    }
}

module.exports = StageResultScene;
