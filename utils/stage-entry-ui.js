/**
 * 官方闯关入场：与广场一致——点卡只开窗，确认时才校验并扣金方块 / 金币。
 */
const { SUBTITLE } = require('../js/theme/arcade-night');
const { roundRectPath } = require('../js/render/board-tiles');
const { drawGoldenCubeBadge } = require('../js/render/title-decor');
const { coinManager } = require('./coin-manager');
const goldenBlock = require('./golden-block-manager');
const { adManager, isRewardedVideoConfigured } = require('./ad-manager');

const DIALOG_MASK = 'rgba(0, 0, 0, 0.75)';
const LACK_RED = '#ff5c5c';
const GOLD_BORDER = 'rgba(255, 200, 87, 0.88)';
const COST_ICON = 16;
const COST_ICON_GAP = 6;

function applyShortageHighlight(dialog, result) {
    if (!dialog) return;
    const reason = result && result.reason;
    dialog.lackGold = reason === 'no-gold' || reason === 'no-gold-and-coins';
    dialog.lackCoins = reason === 'no-coins' || reason === 'no-gold-and-coins';
}

function hitRect(x, y, rect) {
    return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function fillGoldBorderedPanel(ctx, x, y, w, h, r) {
    const rad = r == null ? 12 : r;
    ctx.fillStyle = '#2a2a32';
    roundRectPath(ctx, x, y, w, h, rad);
    ctx.fill();
    ctx.strokeStyle = GOLD_BORDER;
    ctx.lineWidth = 1.6;
    roundRectPath(ctx, x, y, w, h, rad);
    ctx.stroke();
    ctx.lineWidth = 1;
}

function _drawCoinGlyph(ctx, cx, cy, size) {
    ctx.save();
    const r = size * 0.42;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b032';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 248, 210, 0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function _drawCostLine(ctx, cx, y, kind, text, lack) {
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(text).width;
    const total = COST_ICON + COST_ICON_GAP + textW;
    const left = cx - total / 2;
    const iconX = left + COST_ICON / 2;
    ctx.save();
    if (kind === 'gold') {
        drawGoldenCubeBadge(ctx, iconX, y, COST_ICON);
    } else {
        _drawCoinGlyph(ctx, iconX, y, COST_ICON);
    }
    ctx.restore();
    ctx.fillStyle = lack ? LACK_RED : SUBTITLE;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + COST_ICON + COST_ICON_GAP, y);
}

function formatEntryDialogTitle(stage) {
    if (!stage) return '解锁关卡';
    const name = String(stage.name || stage.title || '').trim();
    const nid = Number(stage.id);
    if (Number.isFinite(nid) && nid > 0) {
        return name ? ('第' + nid + '关·' + name) : ('第' + nid + '关');
    }
    return name || '解锁关卡';
}

function _entryShortage(needGold, fee) {
    const lackGold = needGold > 0 && goldenBlock.getBalance() < needGold;
    const lackCoins = fee > 0 && coinManager.getCoins() < fee;
    if (lackGold && lackCoins) return 'no-gold-and-coins';
    if (lackGold) return 'no-gold';
    if (lackCoins) return 'no-coins';
    return '';
}

/** 开打确认缺资源时的提示文案（与广场一致） */
function stageEntryShortageText(result) {
    if (!result || result.ok) return '';
    if (result.reason === 'no-gold-and-coins') return '金方块不足，金币也不足';
    if (result.reason === 'no-gold') return '金方块不足';
    if (result.reason === 'no-coins') return '金币不足（需 ' + (result.fee || 0) + '）';
    if (result.reason === 'missing') return '关卡不可用';
    return '无法开打';
}

/**
 * 官方关开打：先校验再扣费。未解锁扣金方块+金币；已解锁只扣金币。
 * @param {number} stageId
 * @param {{ skipFee?: boolean }} [opts] skipFee 为看广告免入场费（仍须已解锁）
 */
function enterOfficialStage(stageId, opts) {
    const o = opts || {};
    const skipFee = !!o.skipFee;
    const stage = goldenBlock.getStage(stageId);
    if (!stage) {
        return { ok: false, reason: 'missing', fee: 0, needGold: 0 };
    }
    const already = goldenBlock.isUnlocked(stage.id);
    const needGold = already ? 0 : (stage.unlockCost || 0);
    const fullFee = coinManager.getEntryFee(stage.id);
    const fee = skipFee ? 0 : fullFee;
    const shortage = _entryShortage(needGold, fee);
    if (shortage) {
        return { ok: false, reason: shortage, fee: fullFee, needGold };
    }

    let goldPaid = 0;
    if (needGold > 0) {
        const unlocked = goldenBlock.unlockStage(stage.id);
        if (!unlocked.ok) {
            const reason = unlocked.reason === 'no-gold' ? 'no-gold' : (unlocked.reason || 'no-gold');
            return { ok: false, reason, fee: fullFee, needGold };
        }
        goldPaid = needGold;
    }

    let paid = 0;
    if (fee > 0) {
        const coinRes = coinManager.spendEntryFee(stage.id);
        if (!coinRes.ok) {
            if (goldPaid > 0) {
                goldenBlock.addBalance(goldPaid);
                goldenBlock.revokeUnlock(stage.id);
            }
            const reason = coinRes.reason === 'no-coins' ? 'no-coins' : (coinRes.reason || 'no-coins');
            return { ok: false, reason, fee: fullFee, needGold };
        }
        paid = coinRes.paid;
    }

    return {
        ok: true,
        already,
        goldPaid,
        paid,
        fee: skipFee ? 0 : fullFee,
        needGold,
    };
}

/** @returns {object|null} 需弹窗时返回 dialog 状态；已解锁且免费关返回 null（应直接 enter） */
function createEntryDialog(stage) {
    if (!stage) return null;
    const fee = coinManager.getEntryFee(stage.id);
    const unlocked = goldenBlock.isUnlocked(stage.id);
    const needGold = unlocked ? 0 : (stage.unlockCost || 0);
    if (needGold <= 0 && fee <= 0) return null;
    return {
        stage,
        fee,
        locked: needGold > 0,
        needGold,
        freeLeft: coinManager.getFreeEntryRemaining(),
        canAd: unlocked && isRewardedVideoConfigured() === true,
        canChallenge: false,
        armed: false,
        lackGold: false,
        lackCoins: false,
        panelRect: null,
        closeRect: null,
        payRect: null,
        adRect: null,
        challengeRect: null,
        cancelRect: null,
    };
}

function enterStageGame(stageId, entryPaid) {
    GameGlobal.game.sceneManager.replace('game', {
        mode: 'stage',
        stageId: Number(stageId),
        entryPaid: entryPaid || 0,
    });
}

function _doEnter(stageId, entryPaid, hooks) {
    if (hooks && typeof hooks.onEnter === 'function') {
        hooks.onEnter(stageId, entryPaid);
        return;
    }
    enterStageGame(stageId, entryPaid);
}

/**
 * 进入关卡：已解锁且免费直进；否则弹出确认窗（余额只在点确认时检查）
 * @param {object} stage
 * @param {{ onDialog?: (dialog) => void, onEnter?: (stageId, paid) => void, onToast?: (msg) => void }} [hooks]
 */
function promptStageEntry(stage, hooks) {
    hooks = hooks || {};
    if (!stage) return;
    const dialog = createEntryDialog(stage);
    if (!dialog) {
        _doEnter(stage.id, 0, hooks);
        return;
    }
    if (typeof hooks.onDialog === 'function') {
        hooks.onDialog(dialog);
    }
}

/**
 * 处理入场弹窗点击
 * @returns {'dismiss'|'handled'|false}
 */
function handleEntryDialogTap(dialog, x, y, hooks) {
    hooks = hooks || {};
    if (!dialog) return false;
    if (!dialog.armed) return 'handled';
    const d = dialog;

    if (d.closeRect && hitRect(x, y, d.closeRect)) {
        return 'dismiss';
    }
    if (d.cancelRect && hitRect(x, y, d.cancelRect)) {
        return 'dismiss';
    }
    if (d.panelRect && !hitRect(x, y, d.panelRect)) {
        return 'dismiss';
    }

    if (d.payRect && hitRect(x, y, d.payRect)) {
        const paid = enterOfficialStage(d.stage.id);
        if (!paid.ok) {
            applyShortageHighlight(d, paid);
            const msg = stageEntryShortageText(paid);
            if (typeof hooks.onToast === 'function') {
                hooks.onToast(msg);
            } else if (typeof hooks.onInsufficient === 'function') {
                hooks.onInsufficient(d.fee);
            }
            return 'handled';
        }
        _doEnter(d.stage.id, paid.paid, hooks);
        return 'dismiss';
    }

    if (d.adRect && hitRect(x, y, d.adRect)) {
        if (d.locked) {
            if (typeof hooks.onToast === 'function') {
                hooks.onToast('请先解锁关卡');
            }
            return 'handled';
        }
        if (d.freeLeft <= 0) {
            if (typeof hooks.onToast === 'function') {
                hooks.onToast('今日免费入场已用完');
            }
            return 'handled';
        }
        if (!d.canAd) {
            if (typeof hooks.onToast === 'function') {
                hooks.onToast('广告暂不可用');
            }
            return 'handled';
        }
        adManager.showRewardedVideo()
            .then(() => {
                if (!coinManager.consumeFreeEntry()) {
                    if (typeof hooks.onToast === 'function') {
                        hooks.onToast('今日免费入场已用完');
                    }
                    return;
                }
                const paid = enterOfficialStage(d.stage.id, { skipFee: true });
                if (!paid.ok) {
                    if (typeof hooks.onToast === 'function') {
                        hooks.onToast(stageEntryShortageText(paid));
                    }
                    return;
                }
                _doEnter(d.stage.id, 0, hooks);
            })
            .catch(() => { /* 未看完 */ });
        return 'handled';
    }

    if (d.challengeRect && hitRect(x, y, d.challengeRect)) {
        if (d.locked) {
            if (typeof hooks.onToast === 'function') {
                hooks.onToast('请先解锁关卡');
            }
            return 'handled';
        }
        if (typeof hooks.onChallenge === 'function') {
            hooks.onChallenge(d.stage);
            return 'dismiss';
        }
        return 'handled';
    }

    return false;
}

function renderEntryDialog(ctx, W, H, dialog) {
    const d = dialog;
    if (!d || !d.stage) return;

    ctx.fillStyle = DIALOG_MASK;
    ctx.fillRect(0, 0, W, H);

    const showGold = !!d.locked && (d.needGold > 0);
    const showAd = !d.locked && d.canAd === true;
    const showChallenge = !d.locked && d.canChallenge === true;

    const bw = Math.min(300, W * 0.82);
    const infoLines = showGold ? 2 : 1;
    const extraBtns = (showAd ? 1 : 0) + (showChallenge ? 1 : 0);
    const btnCount = 2 + extraBtns;
    const infoTop = 62;
    const lineH = 24;
    const btnH = 40;
    const btnGap = 12;
    const btnBlockTop = infoTop + infoLines * lineH + 16;
    const bh = btnBlockTop + btnCount * btnH + (btnCount - 1) * btnGap + 16;
    const px = (W - bw) / 2;
    const py = (H - bh) / 2;
    d.panelRect = { x: px, y: py, w: bw, h: bh };
    d.closeRect = null;
    d.adRect = null;
    d.challengeRect = null;

    fillGoldBorderedPanel(ctx, px, py, bw, bh, 12);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatEntryDialogTitle(d.stage), W / 2, py + 32);

    let infoY = py + infoTop;
    if (showGold) {
        _drawCostLine(
            ctx,
            W / 2,
            infoY,
            'gold',
            '需要用 ' + d.needGold + ' 金方块解锁',
            !!d.lackGold
        );
        infoY += lineH;
    }
    _drawCostLine(
        ctx,
        W / 2,
        infoY,
        'coin',
        '用 ' + (d.fee || 0) + ' 金币闯关',
        !!d.lackCoins
    );

    const btnW = bw - 40;
    let by = py + btnBlockTop;
    d.payRect = { x: px + 20, y: by, w: btnW, h: btnH };
    _fillEntryBtn(ctx, d.payRect, '#e09a30', '支付开打', '#fff');
    by += btnH + btnGap;

    if (showAd) {
        d.adRect = { x: px + 20, y: by, w: btnW, h: btnH };
        _fillEntryBtn(
            ctx,
            d.adRect,
            d.freeLeft > 0 ? '#3a7ab0' : '#444',
            '看广告免费（余' + d.freeLeft + '）',
            '#fff'
        );
        by += btnH + btnGap;
    }
    if (showChallenge) {
        d.challengeRect = { x: px + 20, y: by, w: btnW, h: btnH };
        _fillEntryBtn(ctx, d.challengeRect, '#00c6ff', '约好友来战', '#062028');
        by += btnH + btnGap;
    }

    d.cancelRect = { x: px + 20, y: by, w: btnW, h: btnH };
    _fillEntryBtn(ctx, d.cancelRect, '#555', '取消', '#fff');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

function _fillEntryBtn(ctx, rect, fill, text, textColor) {
    ctx.fillStyle = fill;
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.fillStyle = textColor || '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function renderLockedEntryDialog(ctx, W, H, dialog) {
    renderEntryDialog(ctx, W, H, dialog);
}

/** 与广场一致：屏幕中部 toast */
function renderCenterToast(ctx, W, H, text) {
    if (!text) return;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    const tw = Math.min(W * 0.8, 280);
    const ty = H * 0.42;
    ctx.fillRect(W / 2 - tw / 2, ty, tw, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, ty + 20);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

/** 按钮文案：重玩/下一关展示入场费 */
function formatStageEntryButtonLabel(baseLabel, stageId) {
    const fee = coinManager.getEntryFee(stageId);
    if (fee <= 0) return baseLabel;
    return baseLabel + '（' + fee + '币）';
}

module.exports = {
    createEntryDialog,
    promptStageEntry,
    handleEntryDialogTap,
    renderEntryDialog,
    formatEntryDialogTitle,
    renderLockedEntryDialog,
    fillGoldBorderedPanel,
    renderCenterToast,
    applyShortageHighlight,
    enterStageGame,
    enterOfficialStage,
    stageEntryShortageText,
    formatStageEntryButtonLabel,
};
