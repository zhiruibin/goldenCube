/** 中秋专题结算：与普通闯关、工坊奖励和进度完全隔离。 */
const { Button } = require('../widgets/button');
const { fillNightBackground, drawBrandTitle } = require('../theme/arcade-night');
const { drawThemeBackground, getThemeImage, fillThemeVeil } = require('../theme/theme-images');
const midAutumn = require('../../data/mid-autumn-stages');
const { ConfettiFx } = require('../render/confetti-fx');

const BADGE_RISE_SEC = 0.85;
const BUTTON_REVEAL_DELAY_SEC = 0.18;

class ThemeEventResultScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._confettiFx = null;
        this._confettiTriggered = false;
    }
    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._riseSec = BADGE_RISE_SEC;
        this._buttonsReady = false;
        this._confettiTriggered = false;
        if (this._confettiFx) this._confettiFx.destroy();
        this._confettiFx = null;
        if (this._params.cleared === true) {
            this._confettiFx = new ConfettiFx();
            this._confettiFx.init();
        }
        getThemeImage('badgeMidAutumn');
        getThemeImage('badgeMidAutumnLocked');
        this._buildButtons();
    }
    onExit() {
        this._buttons = [];
        if (this._confettiFx) {
            this._confettiFx.destroy();
            this._confettiFx = null;
        }
    }
    onPause() {}
    onResume() {}
    update(dt) {
        const delta = Number(dt) || 0;
        this._animTime += delta;
        if (this._confettiFx) this._confettiFx.update(delta);
        if (!this._confettiTriggered && this._params.cleared === true && this._animTime >= this._riseSec) {
            this._confettiTriggered = true;
            this._confettiFx.trigger(GameGlobal.game.width / 2, GameGlobal.game.height * .53);
        }
        if (!this._buttonsReady && this._animTime >= this._riseSec + BUTTON_REVEAL_DELAY_SEC) {
            this._buttonsReady = true;
        }
    }

    _buildButtons() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const stage = midAutumn.getStage(this._params.stageId || 1);
        const cleared = this._params.cleared === true;
        const nextStage = cleared ? midAutumn.getStage(stage.id + 1) : null;
        const primaryStage = nextStage || stage;
        const primaryText = cleared ? (nextStage ? '下一关' : '再玩一次') : '再试一次';
        const w = Math.min(224, W * .64);
        const h = Math.round(w / 4);
        const gap = 12;
        const y = H - h * 2 - gap - 42;
        this._buttons = [
            new Button({
                x: (W - w) / 2, y, w, h, text: primaryText, skin: 'btnBarGold', skinMode: 'contain',
                color: '#c9a227', labelColor: '#241408',
                onClick: () => GameGlobal.game.sceneManager.replace('game', this._gameParams(primaryStage)),
            }),
            new Button({
                x: (W - w) / 2, y: y + h + gap, w, h, text: '返回专题', skin: 'btnBarBrown', skinMode: 'contain',
                color: '#5a4030', labelColor: '#fff8ef',
                onClick: () => GameGlobal.game.sceneManager.leaveTo('themeEvent', {}, ['home']),
            }),
        ];
    }

    _gameParams(stage) {
        return {
            mode: 'stage', workshop: true, themeEvent: true,
            themeEventStageId: stage.id, workshopStageId: 'mid_autumn_' + stage.id,
            workshopTitle: stage.title, workshopRows: stage.rows,
            themeId: stage.themeId, dropIntervalMs: stage.dropIntervalMs,
            firstPiece: stage.firstPiece, entryPaid: 0,
        };
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        if (!drawThemeBackground(ctx, 'mapMineBg', W, H)) fillNightBackground(ctx, W, H);
        else fillThemeVeil(ctx, W, H, 0.38);
        const cleared = this._params.cleared === true;
        const stage = midAutumn.getStage(this._params.stageId || 1) || midAutumn.STAGES[0];
        drawBrandTitle(ctx, cleared ? '月出海面' : '月隐云后', W / 2, H * .19, 'bold 34px sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = cleared ? '#FFE566' : '#fff3dc'; ctx.font = 'bold 19px sans-serif';
        ctx.fillText(cleared ? ('第' + stage.id + '关完成') : ('第' + stage.id + '关未完成'), W / 2, H * .29);
        ctx.fillStyle = 'rgba(255,246,225,.84)'; ctx.font = '16px sans-serif';
        ctx.fillText(stage.line1, W / 2, H * .35);
        ctx.fillText(stage.line2, W / 2, H * .35 + 26);
        this._drawBadgeHero(ctx, W, H, cleared);
        ctx.fillStyle = 'rgba(255,235,190,.66)'; ctx.font = '13px sans-serif';
        const result = this._params.result || {};
        ctx.fillText('消除 ' + (result.lines || 0) + ' 行 · 使用 ' + (result.pieces || 0) + ' 个方块', W / 2, H * .64);
        const progress = this._params.themeProgress || midAutumn.getProgress();
        ctx.fillStyle = cleared ? '#FFE59A' : 'rgba(218,226,232,.82)';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('中秋徽章进度 ' + progress.cleared + '/' + progress.total, W / 2, H * .675);
        if (cleared && this._params.firstClear) {
            ctx.fillStyle = '#ffd85a'; ctx.font = 'bold 14px sans-serif';
            ctx.fillText('首次通关记录已保存', W / 2, H * .71);
        } else if (!cleared) {
            ctx.fillStyle = 'rgba(205,214,221,.66)'; ctx.font = '13px sans-serif';
            ctx.fillText('本次未增加进度', W / 2, H * .71);
        }
        if (this._buttonsReady) this._buttons.forEach((button) => button.render(ctx));
        if (this._confettiFx && this._confettiFx.isActive()) this._confettiFx.render(ctx);
    }

    /** 月华碎片在结算页凝聚为专题徽章，从底部升起并持续呼吸。 */
    _drawBadgeHero(ctx, W, H, cleared) {
        const riseSec = this._riseSec || BADGE_RISE_SEC;
        const progress = Math.min(1, this._animTime / riseSec);
        const eased = 1 - Math.pow(1 - progress, 3);
        const targetY = H * .53;
        const startY = H + 48;
        const cy = startY + (targetY - startY) * eased;
        const size = 92 * (0.66 + eased * 0.34);
        const pulseTime = progress < 1 ? this._animTime : this._animTime - riseSec;
        const pulse = progress < 1 ? 1 : 0.94 + Math.sin(pulseTime * 3.2) * 0.06;
        const drawSize = size * pulse;
        const badge = getThemeImage(cleared ? 'badgeMidAutumn' : 'badgeMidAutumnLocked');
        const badgeProgress = this._params.themeProgress || midAutumn.getProgress();
        const fullyEarned = cleared && badgeProgress.cleared >= badgeProgress.total;
        ctx.save();
        ctx.globalAlpha = cleared ? (fullyEarned ? 1 : .68) : .82;
        ctx.shadowColor = cleared
            ? (fullyEarned ? 'rgba(255,216,80,.78)' : 'rgba(255,216,80,.38)')
            : 'rgba(190,205,218,.42)';
        ctx.shadowBlur = (cleared ? (fullyEarned ? 18 : 10) : 12) + Math.sin(pulseTime * 2.5) * 3;
        if (badge.ready && badge.img) {
            ctx.drawImage(badge.img, W / 2 - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
        } else {
            ctx.fillStyle = cleared ? '#D6A22C' : '#737B82';
            ctx.beginPath(); ctx.arc(W / 2, cy, drawSize * .46, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = cleared ? '#FFE99A' : '#C6CDD2';
            ctx.beginPath(); ctx.arc(W / 2, cy, drawSize * .32, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    handleTap(x, y) {
        if (!this._buttonsReady) return;
        for (const button of this._buttons) if (button.hitTest(x, y)) { button.trigger(); return; }
    }
}

module.exports = ThemeEventResultScene;
