/** 主线进度功能门槛：所有账号（含管理员）使用同一规则。 */
const goldenBlock = require('./golden-block-manager');
const { drawThemeButtonSkin } = require('../js/theme/theme-images');

const FEATURES = {
    plaza: { name: '关卡广场', required: 20 },
    workshop: { name: '关卡工坊', required: 30 },
};

let activeDialog = null;
let dialogLayout = null;

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function kickRender() {
    try {
        if (GameGlobal.game && typeof GameGlobal.game.kickLoop === 'function') GameGlobal.game.kickLoop();
    } catch (e) { /* ignore */ }
}

function getStatus(feature) {
    const config = FEATURES[feature] || { name: '该功能', required: 0 };
    const cleared = goldenBlock.getClearedCount();
    return {
        feature,
        name: config.name,
        required: config.required,
        cleared,
        remaining: Math.max(0, config.required - cleared),
        unlocked: cleared >= config.required,
    };
}

function showLockedDialog(feature, options) {
    const status = getStatus(feature);
    if (status.unlocked) return false;
    activeDialog = { status, options: options || {} };
    dialogLayout = null;
    kickRender();
    return true;
}

function isDialogVisible() {
    return !!activeDialog;
}

function renderDialog(ctx, W, H) {
    if (!activeDialog) return;
    const status = activeDialog.status;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 5, 3, 0.72)';
    ctx.fillRect(0, 0, W, H);
    const w = Math.min(326, W - 32);
    const h = 226;
    const x = (W - w) / 2;
    const y = Math.max(30, (H - h) / 2);
    roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = 'rgba(45, 31, 21, 0.98)';
    ctx.fill();
    ctx.strokeStyle = '#d6a33b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff6e8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(status.name + '尚未开放', W / 2, y + 36);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255, 246, 232, 0.84)';
    ctx.fillText('通关 ' + status.required + ' 个主线关卡后开放', W / 2, y + 72);
    ctx.fillText('当前进度：' + status.cleared + ' / ' + status.required, W / 2, y + 99);

    const barX = x + 36;
    const barY = y + 119;
    const barW = w - 72;
    roundRect(ctx, barX, barY, barW, 9, 5);
    ctx.fillStyle = 'rgba(8, 5, 3, 0.62)';
    ctx.fill();
    const ratio = Math.max(0, Math.min(1, status.cleared / Math.max(1, status.required)));
    if (ratio > 0) {
        roundRect(ctx, barX, barY, Math.max(9, barW * ratio), 9, 5);
        ctx.fillStyle = '#d6a33b';
        ctx.fill();
    }
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255, 246, 232, 0.68)';
    ctx.fillText('再通关 ' + status.remaining + ' 关即可解锁', W / 2, y + 148);

    const gap = 12;
    const buttonW = (w - 48 - gap) / 2;
    const buttonH = 43;
    const buttonY = y + h - 58;
    const cancel = { x: x + 24, y: buttonY, w: buttonW, h: buttonH };
    const go = { x: cancel.x + buttonW + gap, y: buttonY, w: buttonW, h: buttonH };
    if (!drawThemeButtonSkin(ctx, 'btnBarBrown', cancel.x, cancel.y, cancel.w, cancel.h)) {
        roundRect(ctx, cancel.x, cancel.y, cancel.w, cancel.h, 9);
        ctx.fillStyle = '#6b4a2e';
        ctx.fill();
    }
    if (!drawThemeButtonSkin(ctx, 'btnBarAmber', go.x, go.y, go.w, go.h)) {
        roundRect(ctx, go.x, go.y, go.w, go.h, 9);
        ctx.fillStyle = '#d87a28';
        ctx.fill();
    }
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#fff6e8';
    ctx.fillText('知道了', cancel.x + cancel.w / 2, cancel.y + cancel.h / 2);
    ctx.fillText('去闯关', go.x + go.w / 2, go.y + go.h / 2);
    dialogLayout = { cancel, go };
    ctx.restore();
}

function hit(rect, x, y) {
    return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function handleDialogTap(x, y) {
    if (!activeDialog || !dialogLayout) return false;
    let action = '';
    if (hit(dialogLayout.cancel, x, y)) action = 'cancel';
    if (hit(dialogLayout.go, x, y)) action = 'go';
    if (!action) return true;
    const dialog = activeDialog;
    activeDialog = null;
    dialogLayout = null;
    kickRender();
    if (action === 'go') {
        if (typeof dialog.options.onGo === 'function') dialog.options.onGo(dialog.status);
        else GameGlobal.game.sceneManager.switchTo('worldMap');
    } else if (typeof dialog.options.onCancel === 'function') {
        dialog.options.onCancel(dialog.status);
    }
    return true;
}

function enter(feature, onUnlocked, options) {
    const status = getStatus(feature);
    if (!status.unlocked) {
        showLockedDialog(feature, options);
        return false;
    }
    if (typeof onUnlocked === 'function') onUnlocked(status);
    return true;
}

module.exports = {
    FEATURES,
    getStatus,
    showLockedDialog,
    isDialogVisible,
    renderDialog,
    handleDialogTap,
    enter,
};
