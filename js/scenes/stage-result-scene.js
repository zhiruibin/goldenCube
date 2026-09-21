/**
 * StageResultScene - 关卡结算（挖个方块）
 * 展示关卡成绩与金方块进度奖励；下一关 / 重玩 / 返回。
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
const { drawThemeBackground } = require('../theme/theme-images');
const goldenBlock = require('../../utils/golden-block-manager');
const { Button } = require('../widgets/button');
const { stageSelectStack } = require('../../utils/stage-nav');
const { buildIsoBlockFaces, drawSolidIsoBlock } = require('../render/iso-block-renderer');
const {
    preloadResultBlockImages,
    drawResultBlockImage,
} = require('../render/result-block-image');
const { ConfettiFx } = require('../render/confetti-fx');
const IconRenderer = require('../render/icon-renderer');
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
        this._shareImageUrl = '';
        this._shareCardActive = false;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._entryDialog = null;
        this._toast = '';
        this._toastUntil = 0;
        this._stage = goldenBlock.getStage(this._params.stageId);
        this._result = this._params.result || null;
        this._shareCardActive = true;
        this._prepareShareCard();
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
        this._shareImageUrl = '';
        this._shareCardActive = false;
    }

    _prepareShareCard() {
        const stage = this._stage || {};
        const result = this._result || {};
        try {
            const shareCard = require('../../utils/stage-result-share-card');
            shareCard.generate({
                stageId: stage.id != null ? stage.id : this._params.stageId,
                stageName: stage.name || '',
                lines: result.lines,
                pieces: result.pieces,
                timeMs: result.timeMs,
            }).then((imageUrl) => {
                // 场景离开后不再回写，避免旧异步结果污染复用状态。
                if (this._shareCardActive && imageUrl) this._shareImageUrl = imageUrl;
            }).catch(() => { /* 自动回退微信截图 */ });
        } catch (e) { /* 低版本自动回退 */ }
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
        // 通栏条形钮：命中框与贴图同为 4:1，contain 避免再被拉扁
        const btnW = Math.min(240, Math.round(W * 0.64));
        const hPad = (W - btnW) / 2;
        const bh = Math.round(btnW / 4);
        const gapY = 10;
        const nextStage = this._stage
            ? goldenBlock.getStage(Number(this._stage.id) + 1)
            : null;

        // 竖排通栏：每行一钮，4:1 条形石砖皮
        const rows = [];
        if (nextStage && goldenBlock.isChapterUnlocked(
            nextStage.chapterId || Math.floor((nextStage.id - 1) / 10) + 1
        )) {
            rows.push({
                text: formatStageEntryButtonLabel('下一关 ' + nextStage.id, nextStage.id),
                color: '#c9a227',
                skin: 'btnBarGold',
                labelColor: '#241408',
                onClick: () => this._promptEnter(nextStage),
            });
        }
        rows.push({
            text: formatStageEntryButtonLabel('重玩本关', this._stage ? this._stage.id : 0),
            color: '#c89840',
            skin: 'btnBarAmber',
            labelColor: '#241408',
            onClick: () => this._promptEnter(this._stage),
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

    _getGoldRewardTotal() {
        if (!this._result) return 0;
        return (this._result.reward || 0)
            + (this._result.chapterReward || 0)
            + (this._result.milestoneReward || 0);
    }

    /** 普通重复通关也给出明确反馈，避免无奖励状态只剩一个章印。 */
    _getOutcomeCaption() {
        if (!this._result || this._result.assisted
            || this._result.first || this._result.isNewBest) return '';
        if (this._stage && this._stage.kind === 'tutorial') {
            return '教学完成，继续挑战下一关吧';
        }
        return '顺利通关，最佳纪录保持不变';
    }

    /** 结算状态统一使用主题章印，不再依赖“首通 / 破纪录”等纯文字行。 */
    _getResultMedals() {
        if (!this._result) return [];
        const r = this._result;
        const medals = [];
        if (r.assisted) {
            medals.push({ kind: 'assisted', label: '辅助', icon: 'shield' });
        } else if (r.first) {
            medals.push({ kind: 'first', label: '首通', icon: 'crown' });
        } else if (r.isNewBest) {
            medals.push({ kind: 'record', label: '新纪录', icon: 'bolt' });
        } else {
            medals.push({ kind: 'clear', label: '通关', icon: 'check' });
        }
        if (r.chapterReward) medals.push({ kind: 'chapter', label: '章完成', icon: 'medal' });
        if (r.milestoneReward) medals.push({ kind: 'all', label: '全通', icon: 'trophy' });
        return medals;
    }

    _drawResultMedal(ctx, medal, cx, cy, size, animTime, index) {
        const palettes = {
            first: ['#fff0a3', '#d89319', '#6d3308', 'rgba(255,205,62,.58)'],
            record: ['#bdf7ff', '#269fc2', '#063b58', 'rgba(65,220,255,.52)'],
            clear: ['#ffe2ab', '#b66d2d', '#52270e', 'rgba(224,145,65,.42)'],
            chapter: ['#d9ffc2', '#65a943', '#244d20', 'rgba(133,224,91,.45)'],
            all: ['#f7d7ff', '#a04ec4', '#47205e', 'rgba(214,106,255,.52)'],
            assisted: ['#d8dde2', '#69757f', '#30363b', 'rgba(199,214,225,.30)'],
        };
        const p = palettes[medal.kind] || palettes.clear;
        const pulse = 1 + Math.sin((animTime || 0) * 3.4 + index * 1.7) * 0.035;
        const radius = size * 0.36 * pulse;
        ctx.save();

        // 柔光与八向放射，让章印像嵌在金块上的宝石而不是普通 UI 圆点。
        const glow = ctx.createRadialGradient(cx, cy, radius * .2, cx, cy, radius * 1.65);
        glow.addColorStop(0, p[3]);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.65, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 8);
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
            const rr = i % 2 === 0 ? radius * 1.23 : radius * .94;
            const a = i * Math.PI / 8 - Math.PI / 2;
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = p[1];
        ctx.fill();
        ctx.rotate(-Math.PI / 8);

        const face = ctx.createRadialGradient(-radius * .28, -radius * .32, 1, 0, 0, radius);
        face.addColorStop(0, p[0]);
        face.addColorStop(.48, p[1]);
        face.addColorStop(1, p[2]);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = face;
        ctx.fill();
        ctx.strokeStyle = p[0];
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, radius * .76, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.34)';
        ctx.lineWidth = 1;
        ctx.stroke();
        IconRenderer.draw(ctx, medal.icon, 0, -1, radius * 1.02, '#fff5cb');

        // 小型绶带保留最低限度语义，图标仍然是视觉主体。
        const rw = Math.max(35, medal.label.length * 10 + 10);
        const rh = 14;
        const ry = radius * .68;
        ctx.beginPath();
        ctx.moveTo(-rw / 2 - 4, ry);
        ctx.lineTo(-rw / 2, ry + rh / 2);
        ctx.lineTo(-rw / 2 - 4, ry + rh);
        ctx.lineTo(rw / 2 + 4, ry + rh);
        ctx.lineTo(rw / 2, ry + rh / 2);
        ctx.lineTo(rw / 2 + 4, ry);
        ctx.closePath();
        ctx.fillStyle = p[2];
        ctx.fill();
        ctx.strokeStyle = p[1];
        ctx.stroke();
        ctx.fillStyle = '#fff4d2';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(medal.label, 0, ry + rh / 2 + .5);
        ctx.restore();
    }

    _drawResultMedals(ctx, cx, cy, heroSize, animTime) {
        const medals = this._getResultMedals();
        if (!medals.length) return;
        // 章印是结算状态的核心反馈，放大至约 86px；三枚并排仍可完整落在 375px 画布内。
        const size = Math.max(82, Math.min(90, heroSize * .80));
        const gap = size * 1.12;
        const startX = cx - ((medals.length - 1) * gap) / 2;
        for (let i = 0; i < medals.length; i++) {
            this._drawResultMedal(ctx, medals[i], startX + i * gap, cy, size, animTime, i);
        }
    }

    /**
     * 与 render 同源的英雄位布局，供升起终点与撒花中心使用。
     * @returns {{ cx: number, heroCy: number, heroSize: number, statsBottom: number }|null}
     */
    _getHeroLayout() {
        if (!this._result) return null;
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const topInset = this._getTopInset() - 30;
        const cx = W / 2;
        // 与 render 信息区行距一致（信息区整体再下移 80px）
        let y = topInset + 180;
        y += 28; // 消行
        y += 22; // 理论
        y += 22; // 用块用时
        if (this._result.assisted) y += 20;
        const statsBottom = y + 4;
        const heroSize = 108;
        let heroCy = statsBottom + 18 + heroSize * 0.52;
        const labelReserve = 42;
        const maxCy = (this._buttonsTopY || H * 0.72) - labelReserve - heroSize * 0.52;
        if (heroCy > maxCy) heroCy = Math.max(statsBottom + heroSize * 0.4, maxCy);
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
        if (!drawThemeBackground(ctx, 'homeBg', W, H)) {
            fillNightBackground(ctx, W, H);
        } else {
            ctx.fillStyle = 'rgba(10, 7, 4, 0.38)';
            ctx.fillRect(0, 0, W, H);
        }

        const uiAlpha = this._uiAlpha();
        const goldTotal = this._getGoldRewardTotal();
        const outcomeCaption = this._getOutcomeCaption();
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

        const topInset = this._getTopInset() - 30;
        if (uiAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha = uiAlpha;
            // 信息区整体下移 80px，填补与按钮之间的空白
            drawBrandTitle(ctx, '过关', W / 2, topInset + 96, 'bold 24px sans-serif');

            const stageName = this._stage ? this._stage.name : '';
            ctx.fillStyle = SUBTITLE;
            ctx.font = '15px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('第 ' + (this._stage ? this._stage.id : '?') + ' 关 · ' + stageName, W / 2, topInset + 126);

            const cx = W / 2;
            let y = topInset + 180;
            if (this._result) {
                const lines = this._result.lines || 0;
                const theory = this._result.minLines || (this._stage ? this._stage.minLines : 0);
                ctx.fillStyle = ACCENT;
                ctx.font = 'bold 30px sans-serif';
                ctx.fillText(String(lines) + ' 行', cx, y);
                y += 28;
                ctx.fillStyle = MUTED;
                ctx.font = '14px sans-serif';
                ctx.fillText(
                    '目标 ' + theory + ' 行' + (lines <= theory ? ' · 高效通关！' : ''),
                    cx, y
                );
                y += 22;

                ctx.fillStyle = SUBTITLE;
                ctx.font = '14px sans-serif';
                ctx.fillText(
                    '用块 ' + (this._result.pieces || 0) + ' · 用时 ' + this._formatTime(this._result.timeMs || 0),
                    cx, y
                );
                y += 22;

                if (this._result.assisted) {
                    ctx.fillStyle = MUTED;
                    ctx.font = '13px sans-serif';
                    ctx.fillText('辅助通关 · 本局不计最佳纪录与排行', cx, y);
                    y += 20;
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
                    ctx.fillText('金色方块 +' + goldTotal, pose.cx, cubeBottomY + 18);
                } else if (outcomeCaption) {
                    ctx.fillStyle = '#e7c98a';
                    ctx.font = '14px sans-serif';
                    ctx.fillText(outcomeCaption, pose.cx, cubeBottomY + 20);
                }

                // 独立陈列在奖励文案与按钮之间；根据剩余空间动态居中，短屏也不会压住按钮。
                const hasCaption = goldTotal > 0 || !!outcomeCaption;
                const rewardBottomY = cubeBottomY + (hasCaption ? 38 : 18);
                const buttonTopY = this._buttonsTopY || H * .72;
                const medalY = Math.max(
                    rewardBottomY + 34,
                    Math.min(buttonTopY - 40, (rewardBottomY + buttonTopY) / 2)
                );
                this._drawResultMedals(ctx, pose.cx, medalY, pose.size, heroAnim);
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
