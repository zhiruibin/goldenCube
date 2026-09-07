/**
 * WorkshopResultScene - 工坊/广场结算（只展示金币，永不发金方块）
 * 含作者试玩通关 / 未通关。
 */
const {
    fillNightBackground,
    drawBrandTitle,
    ACCENT,
    SUBTITLE,
    MUTED,
} = require('../theme/arcade-night');
const { drawThemeBackground } = require('../theme/theme-images');
const { Button } = require('../widgets/button');
const { ConfettiFx } = require('../render/confetti-fx');
const {
    preloadResultBlockImages,
    drawResultBlockImage,
} = require('../render/result-block-image');
const { buildIsoBlockFaces, drawSolidIsoBlock } = require('../render/iso-block-renderer');
const workshop = require('../../utils/workshop-manager');
const endless = require('../../utils/endless-manager');

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
        this._failed = !!this._params.failed;
        this._authorTrial = !!this._params.authorTrial;
        this._endless = !!this._params.endless
            || endless.isEndlessStageId(this._params.workshopStageId);
        this._stageId = this._params.workshopStageId;
        this._title = this._params.workshopTitle || (this._endless ? '无尽' : '工坊关卡');
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
        this._confettiFx = null;
        if (!this._failed && !this._endless) {
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
            this._goList({ mineSub: this._failed ? 'draft' : 'cleared' });
            return;
        }
        this._goList();
    }

    _retryTrial() {
        const stage = workshop.getStage(this._stageId);
        if (!stage) {
            this._goOrigin();
            return;
        }
        GameGlobal.game.sceneManager.replace('game', {
            mode: 'stage',
            workshop: true,
            workshopStageId: this._stageId,
            workshopTitle: stage.title || this._title,
            workshopRows: workshop.cloneRows(stage.rows),
            authorTrial: true,
            workshopReturnTo: this._returnTo,
            workshopListParams: this._listParams,
            dropIntervalMs: stage.dropIntervalMs || 1000,
            entryPaid: 0,
        });
    }

    _retryEndless() {
        endless.clearRun();
        const opening = endless.generateOpeningLayout();
        GameGlobal.game.sceneManager.replace('game', {
            mode: 'stage',
            workshop: true,
            endless: true,
            workshopStageId: endless.STAGE_ID,
            workshopTitle: '无尽',
            workshopRows: opening.rows,
            authorTrial: false,
            workshopReturnTo: 'list',
            workshopListParams: Object.assign(
                { origin: 'plaza', plazaSort: 'official', focusStageId: endless.STAGE_ID },
                this._listParams || {}
            ),
            entryPaid: 0,
            dropIntervalMs: 900,
            endlessResume: false,
            endlessSnapshot: null,
        });
    }

    _openReplay() {
        if (!this._replayKey) {
            return;
        }
        GameGlobal.game.sceneManager.switchTo('replay', {
            replayKey: this._replayKey,
            fromWorkshopResult: true,
            workshopStageId: this._stageId,
            workshopTitle: this._title,
            authorTrial: this._authorTrial,
            workshopReturnTo: this._returnTo,
            workshopListParams: this._listParams,
            result: this._result,
            failed: this._failed,
        });
    }

    /** 英雄位与文案底边（不依赖按钮，避免互相顶开） */
    _computeContentLayout() {
        const H = GameGlobal.game.height;
        const topInset = this._getTopInset() - 30;
        const panelY = topInset + 156;
        const panelH = 88;
        const statsBottom = panelY + panelH;
        const heroSize = 108;
        const heroCy = statsBottom + 18 + heroSize * 0.52 + 30;
        const footY = heroCy + heroSize * 0.72;
        let contentBottom = footY + 26;
        if (this._failed) {
            contentBottom = footY + 26;
            if (this._endless) contentBottom = footY + 48;
        } else if (this._authorTrial) {
            contentBottom = footY + 76;
        } else {
            // 「+N 金币」+「广场通关不奖励金方块」
            contentBottom = footY + 52;
        }
        return {
            topInset,
            panelY,
            panelH,
            statsBottom,
            heroSize,
            heroCy,
            footY,
            contentBottom: Math.min(contentBottom, H - 120),
        };
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

        if (this._endless) {
            rows.push({
                text: '再来一局',
                color: '#c9a227',
                skin: 'btnBarGold',
                labelColor: '#241408',
                onClick: () => this._retryEndless(),
            });
            rows.push({
                text: '返回广场',
                color: '#5a4030',
                skin: 'btnBarBrown',
                labelColor: '#fff8ef',
                onClick: () => this._goList(),
            });
        } else if (this._authorTrial) {
            rows.push({
                text: '再试一次',
                color: '#c9a227',
                skin: 'btnBarGold',
                labelColor: '#241408',
                onClick: () => this._retryTrial(),
            });
            if (this._returnTo === 'list') {
                rows.push({
                    text: '去编辑',
                    color: '#c89840',
                    skin: 'btnBarAmber',
                    labelColor: '#241408',
                    onClick: () => {
                        GameGlobal.game.sceneManager.leaveTo('workshopEditor', {
                            stageId: this._stageId,
                        }, ['home', 'workshop']);
                    },
                });
            } else {
                rows.push({
                    text: '我的关卡',
                    color: '#c89840',
                    skin: 'btnBarAmber',
                    labelColor: '#241408',
                    onClick: () => {
                        GameGlobal.game.sceneManager.leaveTo('workshop', {
                            mineSub: this._failed ? 'draft' : 'cleared',
                        }, ['home']);
                    },
                });
            }
            rows.push({
                text: '回看本局',
                color: '#c89840',
                skin: 'btnBarAmber',
                labelColor: '#241408',
                onClick: () => this._openReplay(),
            });
            rows.push({
                text: this._returnTo === 'editor' ? '返回编辑' : '返回列表',
                color: '#5a4030',
                skin: 'btnBarBrown',
                labelColor: '#fff8ef',
                onClick: () => this._goOrigin(),
            });
        } else {
            // 广场 / 他人关：与闯关结算同款竖排通栏
            rows.push({
                text: this._failed ? '再试一次' : '再玩一局',
                color: '#c9a227',
                skin: 'btnBarGold',
                labelColor: '#241408',
                onClick: () => {
                    const stage = workshop.getStage(this._stageId);
                    if (!stage) {
                        this._goList();
                        return;
                    }
                    this._goList({ toast: '请再次开打' });
                },
            });
            rows.push({
                text: '回看本局',
                color: '#c89840',
                skin: 'btnBarAmber',
                labelColor: '#241408',
                onClick: () => this._openReplay(),
            });
            const origin = this._resolveOrigin();
            rows.push({
                text: origin === 'workshop' ? '返回工坊' : '返回广场',
                color: '#5a4030',
                skin: 'btnBarBrown',
                labelColor: '#fff8ef',
                onClick: () => this._goList(),
            });
        }

        const totalH = rows.length * bh + Math.max(0, rows.length - 1) * gapY;
        const isPlaza = !this._authorTrial || this._endless;
        if (isPlaza) {
            // 广场结算：按钮顶贴上方文案底 + 30px（成功/失败同款）
            const layout = this._computeContentLayout();
            this._contentLayout = layout;
            let topY = layout.contentBottom + 30;
            const maxBottom = H - bottomInset - 12;
            if (topY + totalH > maxBottom) {
                topY = Math.max(layout.footY + 8, maxBottom - totalH);
            }
            this._buttonsTopY = topY;
        } else {
            this._contentLayout = null;
            this._buttonsTopY = H - bottomInset - totalH - 24;
        }

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
        const kind = this._failed
            ? 'fail'
            : (this._authorTrial
                ? 'clear'
                : ((r.coinGained || 0) > 0 ? 'record' : 'clear'));
        const drawn = drawResultBlockImage(ctx, kind, cx, cy, size * 1.35, this._animTime);
        if (drawn) return;

        if (this._failed) {
            const geo = buildIsoBlockFaces(cx, cy, size * 0.92, 'cube');
            drawSolidIsoBlock(ctx, geo, {
                left: 'rgba(72, 78, 92, 0.55)',
                right: 'rgba(108, 116, 132, 0.55)',
                top: 'rgba(178, 186, 200, 0.5)',
                bottom: 'rgba(42, 46, 58, 0.35)',
                backEdge: 'rgba(200, 210, 225, 0.75)',
                frontEdge: 'rgba(220, 228, 240, 0.65)',
                shadowAlpha: 0.35,
            });
            return;
        }

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
        ctx.strokeStyle = 'rgba(31, 155, 152, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const r = this._result || {};
        const cx = W / 2;
        let y = panelY + 36;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this._endless) {
            ctx.fillStyle = this._failed ? '#ff8a7a' : ACCENT;
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(String(r.score || 0) + ' 分', cx, y);
            y += 32;
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                '最高 ' + (r.best != null ? r.best : endless.getBestScore())
                + ' · 消行 ' + (r.lines || 0)
                + ' · ' + this._formatTime(r.timeMs || 0),
                cx, y
            );
            return;
        }

        ctx.fillStyle = this._failed ? '#ff8a7a' : ACCENT;
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(String(r.lines || 0) + ' 行', cx, y);
        y += 32;

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
        if (!drawThemeBackground(ctx, 'homeBg', W, H)) {
            fillNightBackground(ctx, W, H);
        } else {
            ctx.fillStyle = 'rgba(10, 7, 4, 0.42)';
            ctx.fillRect(0, 0, W, H);
        }

        const topInset = this._getTopInset() - 30;
        const headline = this._endless
            ? (this._failed
                ? ((this._result && this._result.isNewBest) ? '新纪录！' : '本局结束')
                : '无尽')
            : (this._failed
                ? '未通关'
                : (this._authorTrial ? '自通成功' : '通关！'));
        // 与闯关结算页同级上间距
        drawBrandTitle(ctx, headline, W / 2, topInset + 96, 'bold 24px sans-serif');

        ctx.fillStyle = SUBTITLE;
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._title, W / 2, topInset + 126);

        const layout = this._contentLayout || this._computeContentLayout();
        const panelW = Math.min(300, W * 0.86);
        this._drawStatsPanel(ctx, W, layout.panelY, panelW, layout.panelH);

        let heroCy = layout.heroCy;
        const heroSize = layout.heroSize;
        // 非广场（作者试玩）仍用按钮顶限制英雄位，避免与按钮重叠
        if (this._authorTrial && !this._endless) {
            const labelReserve = this._failed ? 42 : 78;
            const maxCy = (this._buttonsTopY || H * 0.72) - labelReserve - heroSize * 0.52;
            if (heroCy > maxCy) heroCy = Math.max(layout.statsBottom + heroSize * 0.4, maxCy);
        }
        this._drawHeroBlock(ctx, W / 2, heroCy, heroSize);

        const footY = heroCy + heroSize * 0.72;
        ctx.textAlign = 'center';

        if (this._endless) {
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                (this._result && this._result.isNewBest)
                    ? '新最高分已记录，再来一局重新开局'
                    : '失败后进度已清空，再来一局重新开局',
                W / 2,
                footY + 18
            );
        } else if (this._failed) {
            ctx.fillStyle = MUTED;
            ctx.font = '14px sans-serif';
            ctx.fillText(
                this._authorTrial
                    ? '试玩未通关，可继续改盘后再试'
                    : '未通关，可再试一次',
                W / 2,
                footY + 18
            );
        } else if (this._authorTrial) {
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
