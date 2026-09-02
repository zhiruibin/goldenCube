/**
 * StageResultScene - 关卡结算（挖个方块）
 * 展示消行 vs 理论、金币效率结算、金色方块奖励；下一关 / 重玩 / 返回；可选广告再领一份。
 *
 * 入场：金方块自屏底升起放大至英雄位（揭示态），到位后再撒花与开放按钮。
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
const { stageSelectStack } = require('../../utils/stage-nav');
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
    renderCenterToast,
    formatStageEntryButtonLabel,
} = require('../../utils/stage-entry-ui');

/** 有金奖励时升起时长（秒） */
const REVEAL_RISE_SEC = 1.1;
/** 无金奖励时略短，降低仪式感 */
const REVEAL_RISE_SEC_MUTED = 0.85;
/** progress≥此值开始淡入标题/数据 */
const REVEAL_UI_FADE_START = 0.52;
/** 金块到位后再等多久开放按钮（秒） */
const REVEAL_BUTTON_DELAY = 0.28;

function easeOutCubic(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - x, 3);
}

/** 末端轻微过冲，落地更有「挖出」感 */
function easeOutBack(t) {
    const x = Math.max(0, Math.min(1, t));
    const c1 = 1.55;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

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
        this._revealPhase = 'done';
        this._revealT = 0;
        this._revealProgress = 1;
        this._revealRiseSec = REVEAL_RISE_SEC;
        this._buttonsReady = true;
        this._buttonDelayT = 0;
        this._confettiTriggered = false;
        this._dirt = [];
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

        const goldTotal = this._getGoldRewardTotal();
        this._revealRiseSec = goldTotal > 0 ? REVEAL_RISE_SEC : REVEAL_RISE_SEC_MUTED;
        this._dirt = [];
        this._confettiTriggered = false;
        this._buttonDelayT = 0;

        if (this._confettiFx) {
            this._confettiFx.destroy();
            this._confettiFx = null;
        }
        this._confettiFx = new ConfettiFx();
        this._confettiFx.init();

        // 测试 / 回看等可跳过揭示
        if (this._params.skipReveal) {
            this._finishReveal(true);
        } else {
            this._revealPhase = 'rising';
            this._revealT = 0;
            this._revealProgress = 0;
            this._buttonsReady = false;
            this._spawnDirtBurst(true);
        }
    }

    onExit() {
        if (this._confettiFx) {
            this._confettiFx.destroy();
            this._confettiFx = null;
        }
        this._dirt = [];
    }

    _getTopInset() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;
        return Math.max(statusBarHeight, safeTop) + 16;
    }

    _promptEnter(stage) {
        if (!this._buttonsReady) return;
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
            text: '← 返回关卡选择',
            color: '#333',
            onClick: () => GameGlobal.game.sceneManager.leaveTo('stageSelect', {
                stageId: this._params.stageId,
            }, stageSelectStack()),
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

    /**
     * 与 render 同源的英雄位布局，供升起终点与撒花中心使用。
     * @returns {{ cx: number, heroCy: number, heroSize: number, statsBottom: number }|null}
     */
    _getHeroLayout() {
        if (!this._result) return null;
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const topInset = this._getTopInset();
        const cx = W / 2;
        let y = topInset + 110;
        y += 37; // 消行大号后
        y += 36; // 理论行
        y += 32; // 用块用时
        y += 28; // 金币
        if (this._result.coinDouble) y += 26;
        if (this._result.luckyCoinBonus > 0) y += 26;
        const statsBottom = y;
        const heroTop = statsBottom + 8;
        const heroBottom = (this._buttonsTopY || H * 0.72) - 36;
        const heroCy = (heroTop + heroBottom) / 2 - 25;
        const heroSize = Math.min(120, Math.max(72, (heroBottom - heroTop) * 0.5));
        return { cx, heroCy, heroSize, statsBottom };
    }

    /** 升起过程中的位置与尺寸（progress 0→1） */
    _getRisingPose(progress) {
        const layout = this._getHeroLayout();
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        if (!layout) {
            return { cx: W / 2, cy: H * 0.5, size: 80 };
        }
        const easeY = easeOutCubic(progress);
        const easeS = easeOutBack(progress);
        const startCy = H + layout.heroSize * 0.55;
        const endCy = layout.heroCy;
        const startSize = layout.heroSize * 0.22;
        const endSize = layout.heroSize;
        return {
            cx: layout.cx,
            cy: startCy + (endCy - startCy) * easeY,
            size: startSize + (endSize - startSize) * Math.min(1, easeS),
        };
    }

    _uiAlpha() {
        if (this._revealPhase === 'done' || this._revealPhase === 'landed') {
            if (this._revealPhase === 'landed') {
                return Math.min(1, this._buttonDelayT / Math.max(0.12, REVEAL_BUTTON_DELAY * 0.5));
            }
            return 1;
        }
        const p = this._revealProgress;
        if (p < REVEAL_UI_FADE_START) return 0;
        return Math.min(1, (p - REVEAL_UI_FADE_START) / (1 - REVEAL_UI_FADE_START));
    }

    _spawnDirtBurst(initial) {
        const pose = this._getRisingPose(Math.max(0.02, this._revealProgress));
        const n = initial ? 14 : 3;
        for (let i = 0; i < n; i++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
            const sp = 40 + Math.random() * 90;
            this._dirt.push({
                x: pose.cx + (Math.random() - 0.5) * pose.size * 0.6,
                y: pose.cy + pose.size * 0.35,
                vx: Math.cos(ang) * sp * (0.4 + Math.random()),
                vy: Math.sin(ang) * sp - 30,
                life: 0.35 + Math.random() * 0.45,
                maxLife: 0.5 + Math.random() * 0.4,
                r: 1.5 + Math.random() * 3.5,
                color: Math.random() > 0.45
                    ? 'rgba(180, 140, 70, 0.9)'
                    : 'rgba(90, 70, 45, 0.85)',
            });
        }
    }

    _updateDirt(dt) {
        if (this._revealPhase === 'rising' && Math.random() < dt * 8) {
            this._spawnDirtBurst(false);
        }
        for (let i = this._dirt.length - 1; i >= 0; i--) {
            const p = this._dirt[i];
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 280 * dt;
            if (p.life <= 0) this._dirt.splice(i, 1);
        }
    }

    _drawDirt(ctx) {
        for (let i = 0; i < this._dirt.length; i++) {
            const p = this._dirt[i];
            const a = Math.max(0, p.life / (p.maxLife || 0.5));
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    _finishReveal(fromSkip) {
        this._revealPhase = 'landed';
        this._revealProgress = 1;
        this._revealT = this._revealRiseSec;
        this._buttonDelayT = fromSkip ? REVEAL_BUTTON_DELAY : 0;
        this._dirt = [];
        this._triggerLandFx();
        if (fromSkip) {
            this._buttonsReady = true;
            this._revealPhase = 'done';
        }
    }

    _triggerLandFx() {
        if (this._confettiTriggered) return;
        this._confettiTriggered = true;
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const layout = this._getHeroLayout();
        const cx = layout ? layout.cx : W / 2;
        const cy = layout ? layout.heroCy : H * 0.42;
        if (this._confettiFx) {
            this._confettiFx.trigger(cx, cy);
        }
        try {
            const audio = GameGlobal.game && GameGlobal.game.audioManager;
            if (audio && typeof audio.playTetris === 'function') {
                audio.playTetris();
            } else if (audio && typeof audio.playLevelUp === 'function') {
                audio.playLevelUp();
            }
        } catch (e) { /* ignore */ }
    }

    /** 中间展示区：金色方块插画（破纪录 / 未破纪录）；数量文案在方块下方单独绘制 */
    _drawGoldenBlockHero(ctx, cx, cy, size, goldAmount, animTime) {
        const active = goldAmount > 0;
        const kind = active ? 'record' : 'clear';
        const t = animTime == null ? this._animTime : animTime;
        const drawn = drawResultBlockImage(ctx, kind, cx, cy, size * 1.35, t);

        if (!drawn) {
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
        if (!this._buttonsReady) return;
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
        if (this._revealPhase === 'rising') {
            this._finishReveal(true);
            return;
        }
        if (!this._buttonsReady) return;

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
        if (this._confettiFx) this._confettiFx.update(dt);
        if (this._toast && Date.now() > this._toastUntil) this._toast = '';

        if (this._revealPhase === 'rising') {
            this._revealT += dt;
            this._revealProgress = Math.min(1, this._revealT / this._revealRiseSec);
            this._updateDirt(dt);
            if (this._revealProgress >= 1) {
                this._finishReveal(false);
            }
        } else if (this._revealPhase === 'landed') {
            this._buttonDelayT += dt;
            if (this._buttonDelayT >= REVEAL_BUTTON_DELAY) {
                this._buttonsReady = true;
                this._revealPhase = 'done';
            }
        } else {
            this._updateDirt(dt);
        }
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);

        const uiAlpha = this._uiAlpha();
        const goldTotal = this._getGoldRewardTotal();
        const layout = this._getHeroLayout();
        const rising = this._revealPhase === 'rising';
        const pose = rising
            ? this._getRisingPose(this._revealProgress)
            : (layout
                ? { cx: layout.cx, cy: layout.heroCy, size: layout.heroSize }
                : { cx: W / 2, cy: H * 0.5, size: 80 });

        // 升起阶段暗角，把视线压在金块上
        if (rising || uiAlpha < 1) {
            const vig = rising ? (0.45 * (1 - this._revealProgress * 0.55)) : (0.22 * (1 - uiAlpha));
            if (vig > 0.02) {
                ctx.save();
                const g = ctx.createRadialGradient(pose.cx, pose.cy, pose.size * 0.2, pose.cx, pose.cy, Math.max(W, H) * 0.72);
                g.addColorStop(0, 'rgba(0,0,0,0)');
                g.addColorStop(1, 'rgba(0,0,0,' + vig + ')');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
                ctx.restore();
            }
        }

        const topInset = this._getTopInset();
        if (uiAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = uiAlpha;
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
                y += 37;
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
            }
            ctx.restore();
        }

        // 金块：升起过程用动点；到位后定在英雄位（同材质）
        if (this._result && layout) {
            const heroAnim = rising ? this._revealT : this._animTime;
            this._drawGoldenBlockHero(ctx, pose.cx, pose.cy, pose.size, goldTotal, heroAnim);
            this._drawDirt(ctx);

            if (uiAlpha > 0.01) {
                ctx.save();
                ctx.globalAlpha = uiAlpha;
                const cubeBottomY = pose.cy + pose.size * 1.35 * 0.48;
                ctx.textAlign = 'center';
                if (goldTotal > 0) {
                    ctx.fillStyle = ACCENT;
                    ctx.font = 'bold 16px sans-serif';
                    ctx.fillText('金色方块 +' + goldTotal, pose.cx, cubeBottomY + 20);
                    const label = this._getGoldRewardLabel();
                    if (label) {
                        ctx.fillStyle = MUTED;
                        ctx.font = '12px sans-serif';
                        ctx.fillText(label, pose.cx, cubeBottomY + 42);
                    }
                } else {
                    ctx.fillStyle = MUTED;
                    ctx.font = '14px sans-serif';
                    const capped = !!(this._result && this._result.isNewBest);
                    ctx.fillText(
                        capped ? '已破纪录，破纪录奖励已达上限' : '本关已通关，未刷新记录',
                        pose.cx, cubeBottomY + 20
                    );
                }
                ctx.restore();
            }
        }

        if (this._buttonsReady) {
            ctx.textAlign = 'left';
            this._buttons.forEach((b) => b.render(ctx));
        } else if (rising) {
            ctx.save();
            ctx.globalAlpha = 0.45 + Math.sin(this._animTime * 4) * 0.12;
            ctx.fillStyle = MUTED;
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('点击跳过', W / 2, H - this._getBottomInset() - 28);
            ctx.restore();
        }

        if (this._entryDialog) {
            renderEntryDialog(ctx, W, H, this._entryDialog);
        }
        if (this._toast) {
            renderCenterToast(ctx, W, H, this._toast);
        }

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
