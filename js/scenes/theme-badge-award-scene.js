/** 中秋专题徽章获得页：仅在徽章真正写入收藏的那一次进入。 */
const { Button } = require('../widgets/button');
const { fillNightBackground, drawBrandTitle } = require('../theme/arcade-night');
const { drawThemeBackground, getThemeImage } = require('../theme/theme-images');
const { ConfettiFx } = require('../render/confetti-fx');

const RISE_SEC = 1.2;
const BUTTON_AT_SEC = 1.72;

function clamp01(value) { return Math.max(0, Math.min(1, value)); }

function easeOutBack(value) {
    const x = clamp01(value);
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

class ThemeBadgeAwardScene {
    constructor() {
        this._params = null;
        this._animTime = 0;
        this._button = null;
        this._buttonReady = false;
        this._confettiFx = null;
        this._confettiTriggered = false;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._buttonReady = false;
        this._confettiTriggered = false;
        getThemeImage('badgeMidAutumn');
        if (this._confettiFx) this._confettiFx.destroy();
        this._confettiFx = new ConfettiFx();
        this._confettiFx.init();
        this._buildButton();
    }

    onExit() {
        this._button = null;
        if (this._confettiFx) {
            this._confettiFx.destroy();
            this._confettiFx = null;
        }
    }
    onPause() {}
    onResume() {}

    _buildButton() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const w = Math.min(224, W * .64);
        const h = Math.round(w / 4);
        this._button = new Button({
            x: (W - w) / 2,
            y: H - h - 54,
            w, h,
            text: '收下徽章',
            skin: 'btnBarGold',
            skinMode: 'contain',
            color: '#c9a227',
            labelColor: '#241408',
            onClick: () => GameGlobal.game.sceneManager.leaveTo('themeEvent', {}, ['home']),
        });
    }

    update(dt) {
        const delta = Number(dt) || 0;
        this._animTime += delta;
        if (this._confettiFx) this._confettiFx.update(delta);
        if (!this._confettiTriggered && this._animTime >= RISE_SEC) {
            this._confettiTriggered = true;
            this._confettiFx.trigger(GameGlobal.game.width / 2, GameGlobal.game.height * .46);
            try {
                const audio = GameGlobal.game && GameGlobal.game.audioManager;
                if (audio && typeof audio.playLevelUp === 'function') audio.playLevelUp();
            } catch (e) { /* ignore */ }
        }
        if (!this._buttonReady && this._animTime >= BUTTON_AT_SEC) this._buttonReady = true;
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        if (!drawThemeBackground(ctx, 'mapMineBg', W, H)) fillNightBackground(ctx, W, H);
        else { ctx.fillStyle = 'rgba(10,6,2,.56)'; ctx.fillRect(0, 0, W, H); }

        const headingAlpha = clamp01((this._animTime - .34) / .5);
        ctx.save();
        ctx.globalAlpha = headingAlpha;
        drawBrandTitle(ctx, '获得主题徽章', W / 2, H * .17, 'bold 34px sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFE69A'; ctx.font = 'bold 18px sans-serif';
        ctx.fillText('中秋 · 团团圆圆', W / 2, H * .245);
        ctx.restore();

        this._drawAwardFx(ctx, W, H);

        const copyAlpha = clamp01((this._animTime - RISE_SEC) / .32);
        ctx.save();
        ctx.globalAlpha = copyAlpha;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFF1BF'; ctx.font = '15px sans-serif';
        ctx.fillText('完成中秋专题全部 20 关', W / 2, H * .665);
        ctx.fillStyle = 'rgba(255,239,195,.72)'; ctx.font = '13px sans-serif';
        ctx.fillText('徽章已收入收藏', W / 2, H * .705);
        ctx.restore();

        if (this._buttonReady && this._button) this._button.render(ctx);
        if (this._confettiFx && this._confettiFx.isActive()) this._confettiFx.render(ctx);
    }

    _drawAwardFx(ctx, W, H) {
        const progress = clamp01(this._animTime / RISE_SEC);
        const eased = easeOutBack(progress);
        const cx = W / 2;
        const targetY = H * .46;
        const cy = H + 90 + (targetY - H - 90) * eased;
        const baseSize = Math.min(172, W * .44);
        const size = baseSize * (.56 + eased * .44);
        const after = Math.max(0, this._animTime - RISE_SEC);
        const pulse = progress < 1 ? 1 : 1 + Math.sin(after * 3) * .035;
        const drawSize = size * pulse;

        this._drawRays(ctx, cx, cy, drawSize, progress, after);
        const badge = getThemeImage('badgeMidAutumn');
        ctx.save();
        ctx.shadowColor = 'rgba(255,213,65,.92)';
        ctx.shadowBlur = 24 + Math.sin(after * 2.6) * 5;
        if (badge.ready && badge.img) {
            ctx.drawImage(badge.img, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
        } else {
            ctx.fillStyle = '#D9A62E'; ctx.beginPath(); ctx.arc(cx, cy, drawSize * .48, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#FFF0A1'; ctx.beginPath(); ctx.arc(cx, cy, drawSize * .34, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        this._drawLandingRings(ctx, cx, cy, drawSize, after);
    }

    _drawRays(ctx, cx, cy, size, progress, after) {
        const alpha = clamp01((progress - .24) / .5) * .42;
        if (alpha <= 0) return;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(this._animTime * .14);
        ctx.globalAlpha = alpha; ctx.fillStyle = '#FFE37A';
        const inner = size * .49;
        const outer = size * (1.03 + Math.sin(after * 1.8) * .04);
        for (let i = 0; i < 20; i++) {
            const a = i * Math.PI * 2 / 20;
            const spread = Math.PI / 90;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a - spread) * inner, Math.sin(a - spread) * inner);
            ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
            ctx.lineTo(Math.cos(a + spread) * inner, Math.sin(a + spread) * inner);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }

    _drawLandingRings(ctx, cx, cy, size, after) {
        if (after <= 0 || after > 1.25) return;
        ctx.save();
        ctx.strokeStyle = '#FFF0A8'; ctx.lineWidth = 2.4;
        for (let i = 0; i < 3; i++) {
            const t = clamp01(after * 1.28 - i * .2);
            if (t <= 0 || t >= 1) continue;
            ctx.globalAlpha = (1 - t) * .8;
            ctx.beginPath(); ctx.arc(cx, cy, size * (.42 + t * .72), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }

    handleTap(x, y) {
        if (this._buttonReady && this._button && this._button.hitTest(x, y)) this._button.trigger();
    }
}

module.exports = ThemeBadgeAwardScene;
