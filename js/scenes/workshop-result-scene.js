/**
 * WorkshopResultScene - 工坊/广场结算（只展示金币，永不发金方块）
 */
const {
    fillNightBackground,
    drawBrandTitle,
    ACCENT,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const { Button } = require('../widgets/button');
const { ConfettiFx } = require('../render/confetti-fx');
const {
    preloadResultBlockImages,
    drawResultBlockImage,
} = require('../render/result-block-image');
const { buildIsoBlockFaces, drawSolidIsoBlock } = require('../render/iso-block-renderer');
const workshop = require('../../utils/workshop-manager');

class WorkshopResultScene {
    constructor() {
        this._buttons = [];
        this._result = null;
        this._animTime = 0;
        this._confettiFx = null;
        this._buttonsTopY = 0;
    }

    onEnter(params) {
        this._params = params || {};
        this._animTime = 0;
        this._result = this._params.result || {};
        this._authorTrial = !!this._params.authorTrial;
        this._stageId = this._params.workshopStageId;
        this._title = this._params.workshopTitle || '工坊关卡';
        this._returnTo = this._params.workshopReturnTo || 'editor';
        this._listParams = this._params.workshopListParams || {
            origin: this._authorTrial ? 'workshop' : 'plaza',
            mineSub: 'draft',
        };
        this._replayKey = this._params.replayKey || '';
        preloadResultBlockImages();
        this._buildButtons();

        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        if (this._confettiFx) this._confettiFx.destroy();
        this._confettiFx = new ConfettiFx();
        this._confettiFx.init();
        this._confettiFx.trigger(W / 2, H * 0.42);

        try {
            const audio = GameGlobal.game && GameGlobal.game.audioManager;
            if (audio && typeof audio.playLevelUp === 'function') {
                audio.playLevelUp();
            }
        } catch (e) { /* ignore */ }
    }

    onExit() {
        this._buttons = [];
        if (this._confettiFx) {
            this._confettiFx.destroy();
            this._confettiFx = null;
        }
    }

    update(dt) {
        this._animTime += dt;
        if (this._confettiFx) this._confettiFx.update(dt);
    }

    _getTopInset() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;
        return Math.max(statusBarHeight, safeTop) + 16;
    }

    _getBottomInset() {
        const H = GameGlobal.game.height;
        const safeArea = (GameGlobal.game.systemInfo || {}).safeArea || {};
        return (safeArea.bottom && H > safeArea.bottom) ? (H - safeArea.bottom) : 0;
    }

    _resolveOrigin() {
        const p = this._listParams || {};
        if (p.origin === 'plaza' || p.origin === 'workshop') return p.origin;
        if (p.mainTab === 'plaza') return 'plaza';
        if (this._authorTrial) return 'workshop';
        return 'plaza';
    }

    _goList(extra) {
        const sm = GameGlobal.game.sceneManager;
        const extraParams = extra || {};
        const origin = this._resolveOrigin();
        if (origin === 'plaza') {
            sm.leaveTo('plaza', {
                plazaSort: (this._listParams && this._listParams.plazaSort) || 'official',
                toast: extraParams.toast || '',
                scrollY: (this._listParams && typeof this._listParams.scrollY === 'number')
                    ? this._listParams.scrollY
                    : 0,
                focusStageId: (this._listParams && this._listParams.focusStageId) || this._stageId || '',
            }, ['home']);
            return;
        }
        sm.leaveTo('workshop', {
            mineSub: extraParams.mineSub
                || (this._listParams && this._listParams.mineSub)
                || 'draft',
            toast: extraParams.toast || '',
        }, ['home']);
    }

    _goOrigin() {
        const sm = GameGlobal.game.sceneManager;
        if (this._authorTrial && this._returnTo === 'editor') {
            sm.leaveTo('workshopEditor', {
                stageId: this._stageId,
            }, ['home', 'workshop']);
            return;
        }
        if (this._authorTrial) {
            this._goList({ mineSub: 'cleared' });
            return;
        }
        this._goList();
    }

    _buildButtons() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const bottomInset = this._getBottomInset();
        const bw = Math.min(260, W * 0.7);
        const bh = 46;
        const gap = 12;
        const defs = [];

        if (this._authorTrial) {
            const primaryLabel = this._returnTo === 'editor' ? '← 返回编辑' : '← 返回列表';
            defs.push({
                text: primaryLabel,
                color: '#3a7ab0',
                onClick: () => this._goOrigin(),
            });
            if (this._returnTo === 'list') {
                defs.push({
                    text: '去编辑',
                    color: '#555',
                    onClick: () => {
                        GameGlobal.game.sceneManager.leaveTo('workshopEditor', {
                            stageId: this._stageId,
                        }, ['home', 'workshop']);
                    },
                });
            } else {
                defs.push({
                    text: '我的关卡',
                    color: '#555',
                    onClick: () => {
                        GameGlobal.game.sceneManager.leaveTo('workshop', {
                            mineSub: 'cleared',
                        }, ['home']);
                    },
                });
            }
        } else {
            const origin = this._resolveOrigin();
            const backLabel = origin === 'workshop' ? '← 返回工坊' : '← 返回广场';
            defs.push({
                text: '再玩一局',
                color: '#e09a30',
                onClick: () => {
                    const stage = workshop.getStage(this._stageId);
                    if (!stage) {
                        this._goList();
                        return;
                    }
                    this._goList({ toast: '请再次开打' });
                },
            });
            defs.push({
                text: backLabel,
                color: '#555',
                onClick: () => this._goList(),
            });
        }
        if (this._replayKey) {
            defs.splice(Math.max(0, defs.length - 1), 0, {
                text: '回看本局',
                color: '#7b52ab',
                onClick: () => {
                    GameGlobal.game.sceneManager.switchTo('replay', {
                        replayKey: this._replayKey,
                        fromWorkshopResult: true,
                        workshopStageId: this._stageId,
                        workshopTitle: this._title,
                        authorTrial: this._authorTrial,
                        workshopReturnTo: this._returnTo,
                        workshopListParams: this._listParams,
                        result: this._result,
                    });
                },
            });
        }

        const totalH = defs.length * bh + (defs.length - 1) * gap;
        this._buttonsTopY = H - bottomInset - totalH - 24;
        let y = this._buttonsTopY;
        this._buttons = defs.map((d) => {
            const btn = new Button({
                x: (W - bw) / 2,
                y,
                w: bw,
                h: bh,
                text: d.text,
                color: d.color,
                onClick: d.onClick,
            });
            y += bh + gap;
            return btn;
        });
    }

    _roundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.arcTo(x + w, y, x + w, y + radius, radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
        ctx.lineTo(x + radius, y + h);
        ctx.arcTo(x, y + h, x, y + h - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    }

    _formatTime(ms) {
        const s = Math.floor((ms || 0) / 1000);
        const m = Math.floor(s / 60);
        const ss = s % 60;
        return m + ':' + (ss < 10 ? '0' : '') + ss;
    }

    _drawHeroBlock(ctx, cx, cy, size) {
        const r = this._result || {};
        const kind = this._authorTrial
            ? 'clear'
            : ((r.coinGained || 0) > 0 ? 'record' : 'clear');
        const drawn = drawResultBlockImage(ctx, kind, cx, cy, size * 1.35, this._animTime);
        if (drawn) return;

        const geo = buildIsoBlockFaces(cx, cy, size * 0.92, 'cube');
        drawSolidIsoBlock(ctx, geo, {
            left: 'rgba(201, 162, 39, 0.55)',
            right: 'rgba(224, 154, 48, 0.55)',
            top: 'rgba(255, 215, 64, 0.5)',
            bottom: 'rgba(140, 100, 25, 0.35)',
            backEdge: 'rgba(255, 230, 150, 0.75)',
            frontEdge: 'rgba(255, 240, 180, 0.7)',
            shadowAlpha: 0.35,
        });
    }

    _drawStatsPanel(ctx, W, panelY, panelW, panelH) {
        const px = (W - panelW) / 2;
        this._roundRect(ctx, px, panelY, panelW, panelH, 14);
        ctx.fillStyle = 'rgba(255, 245, 230, 0.06)';
        ctx.fill();
        this._roundRect(ctx, px, panelY, panelW, panelH, 14);
        ctx.strokeStyle = 'rgba(255, 245, 230, 0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const r = this._result || {};
        const cx = W / 2;
        let y = panelY + 36;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ACCENT;
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText(String(r.lines || 0) + ' 行', cx, y);
        y += 34;

        ctx.fillStyle = MUTED;
        ctx.font = '14px sans-serif';
        ctx.fillText(
            '用块 ' + (r.pieces || 0) + ' · 用时 ' + this._formatTime(r.timeMs || 0),
            cx, y
        );
    }

    _drawCredentialBadge(ctx, W, y) {
        const bw = Math.min(280, W * 0.82);
        const bh = 44;
        const bx = (W - bw) / 2;
        this._roundRect(ctx, bx, y, bw, bh, bh / 2);
        ctx.fillStyle = 'rgba(46, 204, 113, 0.18)';
        ctx.fill();
        this._roundRect(ctx, bx, y, bw, bh, bh / 2);
        ctx.strokeStyle = 'rgba(46, 204, 113, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#2ecc71';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓ 已记录自通凭证，可提交广场', W / 2, y + bh / 2);
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);

        const topInset = this._getTopInset();
        const headline = this._authorTrial ? '自通成功' : '通关！';
        drawBrandTitle(ctx, headline, W / 2, topInset + 10, 'bold 30px sans-serif');

        ctx.fillStyle = SUBTITLE;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._title, W / 2, topInset + 52);

        const panelW = Math.min(300, W * 0.86);
        const panelH = 88;
        const panelY = topInset + 78;
        this._drawStatsPanel(ctx, W, panelY, panelW, panelH);

        const heroTop = panelY + panelH + 12;
        const heroBottom = (this._buttonsTopY || H * 0.72) - 28;
        const heroCy = (heroTop + heroBottom) / 2 - 8;
        const heroSize = Math.min(110, Math.max(72, (heroBottom - heroTop) * 0.42));
        this._drawHeroBlock(ctx, W / 2, heroCy, heroSize);

        const footY = heroCy + heroSize * 0.72;
        ctx.textAlign = 'center';

        if (this._authorTrial) {
            this._drawCredentialBadge(ctx, W, footY + 8);
            ctx.fillStyle = MUTED;
            ctx.font = '13px sans-serif';
            ctx.fillText('工坊自通不产出金方块', W / 2, footY + 68);
        } else {
            const r = this._result || {};
            ctx.fillStyle = ACCENT;
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('+' + (r.coinGained || 0) + ' 金币', W / 2, footY + 18);
            if ((r.coinWant || 0) > (r.coinGained || 0)) {
                ctx.fillStyle = MUTED;
                ctx.font = '12px sans-serif';
                ctx.fillText('日池已触顶（理论 ' + r.coinWant + '）', W / 2, footY + 44);
            } else {
                ctx.fillStyle = MUTED;
                ctx.font = '13px sans-serif';
                ctx.fillText('广场通关不奖励金方块', W / 2, footY + 44);
            }
        }

        ctx.textAlign = 'left';
        for (const btn of this._buttons) btn.render(ctx);

        if (this._confettiFx && this._confettiFx.isActive()) {
            this._confettiFx.render(ctx);
        }
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
