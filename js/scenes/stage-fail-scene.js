/**
 * StageFailScene - 闯关失败结算
 * 展示本局成绩；支持广告免费重开 / 付费重玩 / 回看 / 分享 / 返回关选。
 */

const {
    fillNightBackground,
    drawBrandTitle,
    ACCENT,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const { drawThemeBackground } = require('../theme/theme-images');
const goldenBlock = require('../../utils/golden-block-manager');
const { coinManager } = require('../../utils/coin-manager');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const { achievementManager } = require('../../utils/achievement-manager');
const stageFailShareCard = require('../../utils/stage-fail-share-card');
const { Button } = require('../widgets/button');
const { stageSelectStack } = require('../../utils/stage-nav');
const {
    promptStageEntry,
    handleEntryDialogTap,
    renderEntryDialog,
    renderCenterToast,
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
        this._shareBusy = false;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._entryDialog = null;
        this._toast = '';
        this._toastUntil = 0;
        this._shareBusy = false;
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
            onToast: (msg) => this._showToast(msg),
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

    /** 分享本局失败战绩（专用紧凑分享卡，避免截屏顶空白） */
    _shareFail() {
        if (this._shareBusy) return;
        this._shareBusy = true;
        const stageId = this._stage ? this._stage.id : (this._params.stageId || '?');
        const stageName = this._stage ? this._stage.name : '';
        const title = stageName
            ? `挖个方块第 ${stageId} 关「${stageName}」没过，你来挑战一下？`
            : `挖个方块第 ${stageId} 关没过，你来挑战一下？`;
        const result = this._result || {};
        stageFailShareCard.shareWithCard({
            title,
            cardOpts: {
                stageId,
                stageName,
                lines: result.lines,
                minLines: result.minLines || (this._stage ? this._stage.minLines : 0),
                pieces: result.pieces,
                timeMs: result.timeMs,
            },
            success: () => {
                try {
                    achievementManager.reportShare();
                    achievementManager.reportInvite();
                } catch (e) { /* ignore */ }
            },
            fail: () => {
                this._showToast('分享暂不可用');
            },
        }).then(() => {
            this._shareBusy = false;
        }).catch(() => {
            this._shareBusy = false;
            this._showToast('分享暂不可用');
        });
        setTimeout(() => { this._shareBusy = false; }, 1200);
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
        // 通栏条形钮：命中框与贴图同为 4:1，contain 避免再被拉扁
        const btnW = Math.min(240, Math.round(W * 0.64));
        const hPad = (W - btnW) / 2;
        const bh = Math.round(btnW / 4);
        const gapY = 10;

        const rows = [];
        const canFreeRetry = coinManager.getFreeRetryRemaining() > 0
            && isRewardedVideoConfigured() === true;
        if (canFreeRetry) {
            const left = coinManager.getFreeRetryRemaining();
            rows.push({
                text: '广告免费重开（剩' + left + '）',
                color: '#c89840',
                skin: 'btnBarAmber',
                labelColor: '#241408',
                onClick: () => this._freeRetryViaAd(),
            });
        }

        rows.push({
            text: formatStageEntryButtonLabel('重玩本关', this._stage ? this._stage.id : 0),
            color: '#c9a227',
            skin: 'btnBarGold',
            labelColor: '#241408',
            onClick: () => this._promptEnter(this._stage),
        });
        rows.push({
            text: '回看本局',
            color: '#c89840',
            skin: 'btnBarAmber',
            labelColor: '#241408',
            onClick: () => {
                if (!this._replayKey) {
                    this._showToast('暂无可回看');
                    return;
                }
                GameGlobal.game.sceneManager.switchTo('replay', {
                    replayKey: this._replayKey,
                    fromStageFail: true,
                    stageId: this._params.stageId,
                    result: this._result,
                });
            },
        });
        rows.push({
            text: '分享',
            color: '#c89840',
            skin: 'btnBarAmber',
            labelColor: '#241408',
            onClick: () => this._shareFail(),
        });
        rows.push({
            text: '返回关卡',
            color: '#5a4030',
            skin: 'btnBarBrown',
            labelColor: '#fff8ef',
            onClick: () => GameGlobal.game.sceneManager.leaveTo('stageSelect', {
                stageId: this._params.stageId,
            }, stageSelectStack()),
        });

        const totalH = rows.length * bh + Math.max(0, rows.length - 1) * gapY;
        // 整体上移 30px
        this._buttonsTopY = H - bottomInset - totalH - 24 - 30;

        this._buttons = [];
        let y = this._buttonsTopY;
        for (let i = 0; i < rows.length; i++) {
            const b = rows[i];
            this._buttons.push(new Button({
                x: hPad,
                y,
                w: btnW,
                h: bh,
                text: b.text,
                color: b.color,
                skin: b.skin,
                skinMode: 'contain',
                labelColor: b.labelColor,
                fontScale: 0.88,
                onClick: b.onClick,
            }));
            y += bh + gapY;
        }
    }

    handleTap(x, y) {
        if (this._entryDialog) {
            const action = handleEntryDialogTap(this._entryDialog, x, y, {
                onToast: (msg) => this._showToast(msg),
            });
            if (action === 'dismiss') {
                this._entryDialog = null;
            }
            return;
        }
        for (let i = 0; i < this._buttons.length; i++) {
            const btn = this._buttons[i];
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
    }

    handleTouchStart() {
        if (this._entryDialog) this._entryDialog.armed = true;
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
        if (!drawThemeBackground(ctx, 'homeBg', W, H)) {
            fillNightBackground(ctx, W, H);
        } else {
            ctx.fillStyle = 'rgba(10, 7, 4, 0.42)';
            ctx.fillRect(0, 0, W, H);
        }

        const topInset = this._getTopInset() - 30;
        // 与通关成功页同源：字号 + 信息区位置 + 英雄位紧贴成绩
        drawBrandTitle(ctx, '未过关', W / 2, topInset + 96, 'bold 24px sans-serif');

        const stageName = this._stage ? this._stage.name : '';
        ctx.fillStyle = SUBTITLE;
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('第 ' + (this._stage ? this._stage.id : '?') + ' 关 · ' + stageName, W / 2, topInset + 126);

        const cx = W / 2;
        let y = topInset + 180;
        if (this._result) {
            const lines = this._result.lines || 0;
            const minLines = this._result.minLines || (this._stage ? this._stage.minLines : 0);
            ctx.fillStyle = '#ff8a7a';
            ctx.font = 'bold 30px sans-serif';
            ctx.fillText(String(lines) + ' 行', cx, y);
            y += 28;
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText('需消 ' + minLines + ' 行垃圾方可过关', cx, y);
            y += 22;

            ctx.fillStyle = SUBTITLE;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                '用块 ' + (this._result.pieces || 0) + ' · 用时 ' + this._formatTime(this._result.timeMs || 0),
                cx, y
            );
            y += 22;

            const statsBottom = y + 4;
            const heroSize = 108;
            let heroCy = statsBottom + 18 + heroSize * 0.52;
            const labelReserve = 42;
            const maxCy = (this._buttonsTopY || H * 0.72) - labelReserve - heroSize * 0.52;
            if (heroCy > maxCy) heroCy = Math.max(statsBottom + heroSize * 0.4, maxCy);
            this._drawGrayBlockHero(ctx, cx, heroCy, heroSize);

            const cubeBottomY = heroCy + heroSize * 1.35 * 0.48;
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            const reasonText = this._result.reason === 'topOut' ? '方块堆满，本局结束'
                : '未达过关条件';
            ctx.fillText(reasonText, cx, cubeBottomY + 18);
        }

        ctx.textAlign = 'left';
        this._buttons.forEach((b) => b.render(ctx));

        if (this._entryDialog) {
            renderEntryDialog(ctx, W, H, this._entryDialog);
        }
        if (this._toast) {
            renderCenterToast(ctx, W, H, this._toast);
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
