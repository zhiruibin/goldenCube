/**
 * 官方闯关入场：与选关页一致的扣币 / 看广告免费入场流程
 */
const { ACCENT, SUBTITLE } = require('../js/theme/arcade-night');
const { coinManager } = require('./coin-manager');
const { adManager, isRewardedVideoConfigured } = require('./ad-manager');

function hitRect(x, y, rect) {
    return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** @returns {object|null} 需弹窗时返回 dialog 状态；免费关返回 null（应直接 enter） */
function createEntryDialog(stage) {
    if (!stage) return null;
    const fee = coinManager.getEntryFee(stage.id);
    if (fee <= 0) return null;
    return {
        stage,
        fee,
        freeLeft: coinManager.getFreeEntryRemaining(),
        canAd: isRewardedVideoConfigured() === true,
        panelRect: null,
        closeRect: null,
        payRect: null,
        adRect: null,
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

/**
 * 进入关卡：免费直进；收费关弹出入场选择（花币 / 广告 / 取消）
 * @param {object} stage
 * @param {{ onDialog?: (dialog) => void, onInsufficient?: () => void }} [hooks]
 */
function promptStageEntry(stage, hooks) {
    hooks = hooks || {};
    if (!stage) return;
    const dialog = createEntryDialog(stage);
    if (!dialog) {
        enterStageGame(stage.id, 0);
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
        const paid = coinManager.spendEntryFee(d.stage.id);
        if (!paid.ok) {
            if (typeof hooks.onInsufficient === 'function') {
                hooks.onInsufficient(d.fee);
            }
            return 'handled';
        }
        enterStageGame(d.stage.id, paid.paid);
        return 'dismiss';
    }

    if (d.adRect && hitRect(x, y, d.adRect)) {
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
                enterStageGame(d.stage.id, 0);
            })
            .catch(() => { /* 未看完 */ });
        return 'handled';
    }

    return false;
}

function renderEntryDialog(ctx, W, H, dialog) {
    const d = dialog;
    if (!d || !d.stage) return;
    const stage = d.stage;

    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, W, H);

    const bw = Math.min(300, W * 0.82);
    const showAd = d.canAd === true;
    const bh = showAd ? 268 : 218;
    const bx = W / 2 - bw / 2;
    const by = H / 2 - bh / 2;
    d.panelRect = { x: bx, y: by, w: bw, h: bh };

    ctx.fillStyle = '#1c2440';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 14);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,87,0.5)';
    ctx.stroke();

    const closeSize = 36;
    d.closeRect = {
        x: bx + bw - closeSize - 4,
        y: by + 4,
        w: closeSize,
        h: closeSize,
    };
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', d.closeRect.x + closeSize / 2, d.closeRect.y + closeSize / 2);

    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('进入第 ' + stage.id + ' 关', W / 2, by + 40);
    ctx.fillStyle = SUBTITLE;
    ctx.font = '13px sans-serif';
    ctx.fillText(stage.name + ' · 入场 ' + d.fee + ' 币', W / 2, by + 66);

    const btnW = bw - 40;
    const btnH = 40;
    const payY = by + 96;
    d.payRect = { x: bx + 20, y: payY, w: btnW, h: btnH };
    d.adRect = null;

    ctx.fillStyle = '#f0a000';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(d.payRect.x, d.payRect.y, btnW, btnH, 10);
    else ctx.rect(d.payRect.x, d.payRect.y, btnW, btnH);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('花 ' + d.fee + ' 币入场', W / 2, payY + btnH / 2);

    let cancelY = by + 150;
    if (showAd) {
        const adY = by + 146;
        cancelY = by + 200;
        d.adRect = { x: bx + 20, y: adY, w: btnW, h: btnH };
        ctx.fillStyle = d.freeLeft > 0 ? '#3a7ab0' : '#444';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(d.adRect.x, d.adRect.y, btnW, btnH, 10);
        else ctx.rect(d.adRect.x, d.adRect.y, btnW, btnH);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(
            '看广告免费（剩 ' + d.freeLeft + ' 次）',
            W / 2,
            adY + btnH / 2
        );
    }

    d.cancelRect = { x: bx + 20, y: cancelY, w: btnW, h: btnH };
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(d.cancelRect.x, d.cancelRect.y, btnW, btnH, 10);
    else ctx.rect(d.cancelRect.x, d.cancelRect.y, btnW, btnH);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('取消', W / 2, cancelY + btnH / 2);
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
    enterStageGame,
    formatStageEntryButtonLabel,
};
