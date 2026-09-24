/**
 * 官方闯关入场：已解锁免费进入；未解锁使用金方块，余额不足可看广告永久解锁。
 */
const { SUBTITLE } = require('../js/theme/arcade-night');
const { roundRectPath } = require('../js/render/board-tiles');
const { drawGoldenCubeBadge } = require('../js/render/title-decor');
const { drawThemeButtonSkin } = require('../js/theme/theme-images');
const goldenBlock = require('./golden-block-manager');
const { adManager, isRewardedVideoConfigured } = require('./ad-manager');
const DIALOG_MASK = 'rgba(10, 7, 4, 0.62)';
const LACK_RED = '#ff5c5c';
const TEAL_BORDER = 'rgba(31, 155, 152, 0.7)';
const COST_ICON = 16;
const COST_ICON_GAP = 6;

function applyShortageHighlight(dialog, result) {
    if (!dialog) return;
    const reason = result && result.reason;
    dialog.lackGold = reason === 'no-gold';
}

function hitRect(x, y, rect) {
    return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function fillGoldBorderedPanel(ctx, x, y, w, h, r) {
    const rad = r == null ? 14 : r;
    roundRectPath(ctx, x, y, w, h, rad);
    ctx.fillStyle = 'rgba(28, 20, 14, 0.96)';
    ctx.fill();
    roundRectPath(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, Math.max(1, rad - 1));
    ctx.strokeStyle = TEAL_BORDER;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
}

function _drawCostLine(ctx, cx, y, text, lack) {
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(text).width;
    const total = COST_ICON + COST_ICON_GAP + textW;
    const left = cx - total / 2;
    const iconX = left + COST_ICON / 2;
    ctx.save();
    drawGoldenCubeBadge(ctx, iconX, y, COST_ICON);
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

function _entryShortage(needGold) {
    return needGold > 0 && goldenBlock.getBalance() < needGold ? 'no-gold' : '';
}

/** 开打确认缺资源时的提示文案（与广场一致） */
function stageEntryShortageText(result) {
    if (!result || result.ok) return '';
    if (result.reason === 'no-gold') return '金方块不足';
    if (result.reason === 'missing') return '关卡不可用';
    return '无法开打';
}

/**
 * 官方关开打：已解锁免费；未解锁仅扣金方块。
 * @param {number} stageId
 * @param {{ rewardedUnlock?: boolean }} [opts]
 */
function enterOfficialStage(stageId, opts) {
    const o = opts || {};
    const rewardedUnlock = !!o.rewardedUnlock;
    const stage = goldenBlock.getStage(stageId);
    if (!stage) {
        return { ok: false, reason: 'missing', fee: 0, needGold: 0 };
    }
    const already = goldenBlock.isUnlocked(stage.id);
    const needGold = already ? 0 : (stage.unlockCost || 0);
    if (rewardedUnlock && needGold > 0) {
        const granted = goldenBlock.grantStageUnlock(stage.id, 'rewarded_ad');
        return Object.assign({ paid: 0, fee: 0, goldPaid: 0, needGold }, granted);
    }
    const shortage = _entryShortage(needGold);
    if (shortage) {
        return { ok: false, reason: shortage, fee: 0, needGold };
    }

    let goldPaid = 0;
    if (needGold > 0) {
        const unlocked = goldenBlock.unlockStage(stage.id);
        if (!unlocked.ok) {
            const reason = unlocked.reason === 'no-gold' ? 'no-gold' : (unlocked.reason || 'no-gold');
            return { ok: false, reason, fee: 0, needGold };
        }
        goldPaid = needGold;
    }

    return {
        ok: true,
        already,
        goldPaid,
        paid: 0,
        fee: 0,
        needGold,
    };
}

/** @returns {object|null} 需弹窗时返回 dialog 状态；已解锁且免费关返回 null（应直接 enter） */
function createEntryDialog(stage) {
    if (!stage) return null;
    const unlocked = goldenBlock.isUnlocked(stage.id);
    const needGold = unlocked ? 0 : (stage.unlockCost || 0);
    if (needGold <= 0) return null;
    const lackGold = goldenBlock.getBalance() < needGold;
    return {
        stage,
        fee: 0,
        locked: needGold > 0,
        needGold,
        canAd: isRewardedVideoConfigured() === true,
        canChallenge: false,
        armed: false,
        lackGold,
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
                hooks.onInsufficient(d.needGold);
            }
            return 'handled';
        }
        _doEnter(d.stage.id, paid.paid, hooks);
        return 'dismiss';
    }

    if (d.adRect && hitRect(x, y, d.adRect)) {
        if (!d.canAd) {
            if (typeof hooks.onToast === 'function') {
                hooks.onToast('广告暂不可用');
            }
            return 'handled';
        }
        adManager.showRewardedVideo()
            .then(() => {
                const paid = enterOfficialStage(d.stage.id, { rewardedUnlock: true });
                if (!paid.ok) {
                    if (typeof hooks.onToast === 'function') {
                        hooks.onToast(stageEntryShortageText(paid));
                    }
                    return;
                }
                _doEnter(d.stage.id, 0, hooks);
            })
            .catch(() => {
                if (typeof hooks.onToast === 'function') hooks.onToast('需完整观看视频，或稍后再试');
            });
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
    const showAd = d.locked && d.canAd === true;
    const showChallenge = !d.locked && d.canChallenge === true;

    const bw = Math.min(300, W * 0.82);
    const infoLines = 1;
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

    ctx.fillStyle = '#fff8ef';
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
            '需要用 ' + d.needGold + ' 金方块解锁',
            !!d.lackGold
        );
    } else {
        ctx.fillStyle = SUBTITLE;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已解锁，本次挑战免费', W / 2, infoY);
    }

    const btnW = bw - 40;
    let by = py + btnBlockTop;
    d.payRect = { x: px + 20, y: by, w: btnW, h: btnH };
    _fillEntryBtn(ctx, d.payRect, d.lackGold ? 'disabled' : 'primary',
        d.locked ? '使用金方块解锁' : '开始挑战');
    by += btnH + btnGap;

    if (showAd) {
        d.adRect = { x: px + 20, y: by, w: btnW, h: btnH };
        _fillEntryBtn(ctx, d.adRect, 'ad', '观看视频永久解锁');
        by += btnH + btnGap;
    }
    if (showChallenge) {
        d.challengeRect = { x: px + 20, y: by, w: btnW, h: btnH };
        _fillEntryBtn(ctx, d.challengeRect, 'challenge', '约好友来战');
        by += btnH + btnGap;
    }

    d.cancelRect = { x: px + 20, y: by, w: btnW, h: btnH };
    _fillEntryBtn(ctx, d.cancelRect, 'cancel', '取消');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

function _fillEntryBtn(ctx, rect, kind, text) {
    // 通栏统一用 4:1 条形石砖皮（金 / 琥珀 / 棕），避免方卡横向拉扁
    let skin = 'btnBarGold';
    let labelColor = '#241408';
    let fallback = '#c9a227';
    if (kind === 'cancel' || kind === 'disabled') {
        skin = 'btnBarBrown';
        labelColor = kind === 'disabled' ? 'rgba(255,255,255,0.45)' : '#ffffff';
        fallback = kind === 'disabled' ? '#444' : '#5a4030';
    } else if (kind === 'challenge') {
        skin = 'btnBarAmber';
        labelColor = '#241408';
        fallback = '#c89840';
    } else if (kind === 'ad') {
        skin = 'btnBarGold';
        labelColor = '#241408';
        fallback = '#c9a227';
    }

    const drawn = drawThemeButtonSkin(ctx, skin, rect.x, rect.y, rect.w, rect.h);
    if (!drawn) {
        ctx.fillStyle = fallback;
        roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8);
        ctx.fill();
    }
    ctx.fillStyle = labelColor;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
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

/** 已解锁关卡不再收取入场费。 */
function formatStageEntryButtonLabel(baseLabel, stageId) {
    return baseLabel;
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
