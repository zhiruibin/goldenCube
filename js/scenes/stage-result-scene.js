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

class StageResultScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._stage = null;
        this._result = null;
        this._animTime = 0;
        this._doubleClaimed = false;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._doubleClaimed = false;
        this._stage = goldenBlock.getStage(this._params.stageId);
        this._result = this._params.result || null;
        this._buildButtons();
    }

    onExit() {}

    _getTopInset() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;
        return Math.max(statusBarHeight, safeTop) + 16;
    }

    _payAndEnter(stage) {
        if (!stage) return;
        const fee = coinManager.getEntryFee(stage.id);
        if (fee <= 0) {
            GameGlobal.game.sceneManager.replace('game', {
                mode: 'stage',
                stageId: stage.id,
                entryPaid: 0,
            });
            return;
        }
        const paid = coinManager.spendEntryFee(stage.id);
        if (!paid.ok) {
            const canAd = isRewardedVideoConfigured() === true;
            GameGlobal.game.sceneManager.replace('stageSelect', {
                toast: canAd ? '金币不足，可看广告免费入场' : '金币不足，请先攒够入场费',
            });
            return;
        }
        GameGlobal.game.sceneManager.replace('game', {
            mode: 'stage',
            stageId: stage.id,
            entryPaid: paid.paid,
        });
    }

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
                text: '下一关 ' + nextStage.id,
                color: '#f0a000',
                onClick: () => this._payAndEnter(nextStage),
            });
        }
        buttons.push({
            text: '重玩本关',
            color: '#555',
            onClick: () => this._payAndEnter(this._stage),
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
        for (let i = 0; i < this._buttons.length; i++) {
            const btn = this._buttons[i];
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                btn.onClick();
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
            y += 32;
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

            const goldTotal = (this._result.reward || 0)
                + (this._result.chapterReward || 0)
                + (this._result.milestoneReward || 0);
            if (goldTotal > 0) {
                ctx.fillStyle = ACCENT;
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText('金色方块 +' + goldTotal, cx, y);
                y += 26;
                ctx.fillStyle = MUTED;
                ctx.font = '12px sans-serif';
                const bits = [];
                if (this._result.reward) bits.push(this._result.first ? '首通' : '破纪录');
                if (this._result.chapterReward) bits.push('章奖');
                if (this._result.milestoneReward) bits.push('全通');
                ctx.fillText(bits.join(' · '), cx, y);
            } else {
                ctx.fillStyle = MUTED;
                ctx.font = '14px sans-serif';
                ctx.fillText('本关已通关，未刷新记录', cx, y);
            }
        }

        ctx.textAlign = 'left';
        this._buttons.forEach((b) => b.render(ctx));
    }

    _formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const ss = s % 60;
        return m + ':' + (ss < 10 ? '0' : '') + ss;
    }
}

module.exports = StageResultScene;
