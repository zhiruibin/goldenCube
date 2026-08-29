/**
 * 隐私授权（小游戏）
 * 参考：
 * - https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html
 *
 * 要点：注册 wx.onNeedPrivacyAuthorization，弹窗曝光上报 exposureAuthorization，
 * 用户点击同意后再 resolve({ event:'agree' })（必须在点击回调里）。
 * 弹窗内《用户隐私保护指引》必须可点，并用 wx.openPrivacyContract 打开（审核硬性要求）；
 * wx.showModal 正文无法点链接，故使用 canvas 自定义弹窗。
 */

let _inited = false;
let _authorized = false;
let _inflight = null;
let _modalVisible = false;
/** @type {Array<Function>} 等待用户点同意/拒绝的 resolve 队列 */
let _pendingResolves = [];
/** @type {object|null} 弹窗命中区域 */
let _layout = null;
/** 指引文档展示名（后台配置后由 getPrivacySetting 返回） */
let _contractName = '用户隐私保护指引';

function _flushResolves(event) {
    const list = _pendingResolves.splice(0, _pendingResolves.length);
    for (let i = 0; i < list.length; i++) {
        try {
            list[i]({ event: event });
        } catch (e) { /* ignore */ }
    }
    if (event === 'agree') {
        _authorized = true;
    }
}

function _gameSize() {
    let W = 375;
    let H = 667;
    try {
        W = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.width) || W;
        H = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.height) || H;
    } catch (e) { /* ignore */ }
    return { W, H };
}

function _roundRectPath(ctx, x, y, w, h, r) {
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

function _hit(x, y, r) {
    return !!(r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

function _linkLabel() {
    const name = String(_contractName || '用户隐私保护指引').trim() || '用户隐私保护指引';
    if (name.charAt(0) === '《') return name;
    return '《' + name + '》';
}

function layoutPrivacyDialog(W, H) {
    const panelW = Math.min(320, W * 0.86);
    const panelH = 268;
    const panelX = (W - panelW) / 2;
    const panelY = Math.max(72, (H - panelH) / 2 - 16);
    const btnH = 44;
    const btnGap = 12;
    const sidePad = 18;
    const btnW = (panelW - sidePad * 2 - btnGap) / 2;
    const btnY = panelY + panelH - sidePad - btnH;
    const linkY = panelY + 168;
    const linkText = _linkLabel();
    // 预估链接点击热区（渲染时再按 measureText 收紧）
    const linkW = Math.min(panelW - 40, Math.max(160, linkText.length * 15));
    return {
        panel: { x: panelX, y: panelY, w: panelW, h: panelH },
        link: {
            x: panelX + (panelW - linkW) / 2,
            y: linkY - 14,
            w: linkW,
            h: 28,
            text: linkText,
            cy: linkY,
        },
        disagree: { x: panelX + sidePad, y: btnY, w: btnW, h: btnH },
        agree: { x: panelX + sidePad + btnW + btnGap, y: btnY, w: btnW, h: btnH },
    };
}

function _refreshContractName() {
    getPrivacySetting().then((res) => {
        if (res && res.privacyContractName) {
            _contractName = String(res.privacyContractName);
            if (_modalVisible) {
                const { W, H } = _gameSize();
                _layout = layoutPrivacyDialog(W, H);
            }
        }
    });
}

function _showCustomPrivacyModal() {
    _modalVisible = true;
    const { W, H } = _gameSize();
    _layout = layoutPrivacyDialog(W, H);
    _refreshContractName();
}

function isPrivacyDialogVisible() {
    return !!_modalVisible;
}

function renderPrivacyDialog(ctx, W, H) {
    if (!_modalVisible || !ctx) return;
    const L = _layout || layoutPrivacyDialog(W, H);
    _layout = L;
    const p = L.panel;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(28, 32, 52, 0.98)';
    _roundRectPath(ctx, p.x, p.y, p.w, p.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    _roundRectPath(ctx, p.x, p.y, p.w, p.h, 14);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('用户隐私保护提示', p.x + p.w / 2, p.y + 36);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '14px sans-serif';
    const lines = [
        '为展示好友排行榜、玩家昵称头像，',
        '以及发起/应战好友挑战，需要使用',
        '微信朋友关系、昵称和头像。',
        '请阅读并同意以下指引：',
    ];
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], p.x + p.w / 2, p.y + 72 + i * 22);
    }

    // 可点击的隐私指引链接（必须走 openPrivacyContract）
    const linkText = L.link.text || _linkLabel();
    ctx.font = 'bold 15px sans-serif';
    const tw = ctx.measureText(linkText).width;
    const linkW = Math.min(p.w - 36, Math.max(tw + 8, 120));
    L.link.w = linkW;
    L.link.x = p.x + (p.w - linkW) / 2;
    L.link.text = linkText;

    ctx.fillStyle = '#4da3ff';
    ctx.fillText(linkText, p.x + p.w / 2, L.link.cy);
    // 下划线
    const ux = p.x + p.w / 2 - tw / 2;
    const uy = L.link.cy + 10;
    ctx.strokeStyle = '#4da3ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ux, uy);
    ctx.lineTo(ux + tw, uy);
    ctx.stroke();

    // 拒绝
    const d = L.disagree;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    _roundRectPath(ctx, d.x, d.y, d.w, d.h, d.h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.font = '16px sans-serif';
    ctx.fillText('拒绝', d.x + d.w / 2, d.y + d.h / 2);

    // 同意
    const a = L.agree;
    ctx.fillStyle = 'rgba(0, 198, 255, 0.42)';
    _roundRectPath(ctx, a.x, a.y, a.w, a.h, a.h / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('同意', a.x + a.w / 2, a.y + a.h / 2);

    ctx.restore();
}

/**
 * 处理隐私弹窗点击。返回 true 表示已消费事件（勿再传给场景）。
 */
function handlePrivacyDialogTap(x, y) {
    if (!_modalVisible || !_layout) return false;
    const L = _layout;

    if (_hit(x, y, L.link)) {
        openPrivacyContract();
        return true;
    }
    if (_hit(x, y, L.agree)) {
        _modalVisible = false;
        _layout = null;
        _flushResolves('agree');
        return true;
    }
    if (_hit(x, y, L.disagree)) {
        _modalVisible = false;
        _layout = null;
        _flushResolves('disagree');
        return true;
    }
    // 点遮罩不关闭，避免误触拒绝
    return true;
}

/**
 * 启动时调用一次：注册自定义隐私授权模式
 */
function initPrivacy() {
    if (_inited) return;
    _inited = true;

    if (typeof wx.onNeedPrivacyAuthorization !== 'function') {
        console.warn('[Privacy] onNeedPrivacyAuthorization 不可用');
        return;
    }

    wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
        console.log('[Privacy] need auth, referrer=', eventInfo && eventInfo.referrer);

        try {
            resolve({ event: 'exposureAuthorization' });
        } catch (e) { /* ignore */ }

        _pendingResolves.push(resolve);

        if (_modalVisible) {
            return;
        }
        _showCustomPrivacyModal();
    });
}

function getPrivacySetting() {
    return new Promise((resolve) => {
        if (typeof wx.getPrivacySetting !== 'function') {
            resolve({ unsupported: true });
            return;
        }
        wx.getPrivacySetting({
            success(res) {
                resolve({
                    needAuthorization: !!res.needAuthorization,
                    privacyContractName: res.privacyContractName || '',
                });
            },
            fail(err) {
                resolve({ error: err });
            },
        });
    });
}

function openPrivacyContract() {
    return new Promise((resolve) => {
        if (typeof wx.openPrivacyContract !== 'function') {
            try {
                wx.showToast({ title: '无法打开隐私指引', icon: 'none' });
            } catch (e) { /* ignore */ }
            resolve(false);
            return;
        }
        wx.openPrivacyContract({
            success() { resolve(true); },
            fail(err) {
                console.warn('[Privacy] openPrivacyContract fail', err);
                try {
                    wx.showToast({ title: '打开隐私指引失败', icon: 'none' });
                } catch (e) { /* ignore */ }
                resolve(false);
            },
        });
    });
}

/**
 * 在用户点击手势内调用：主动拉起隐私授权
 * @returns {Promise<boolean>}
 */
function ensurePrivacyAuthorize() {
    if (_authorized) {
        return Promise.resolve(true);
    }
    if (_inflight) {
        return _inflight;
    }

    initPrivacy();

    if (typeof wx.requirePrivacyAuthorize !== 'function') {
        return Promise.resolve(true);
    }

    _inflight = new Promise((resolve) => {
        wx.requirePrivacyAuthorize({
            success() {
                _authorized = true;
                _inflight = null;
                resolve(true);
            },
            fail(err) {
                console.warn('[Privacy] requirePrivacyAuthorize fail', err);
                _inflight = null;
                resolve(false);
            },
        });
    });
    return _inflight;
}

function showPrivacyFailTip(err) {
    const errMsg = (err && err.errMsg) ? String(err.errMsg) : '';
    const is1026 = (err && (err.errno === 1026 || err.errno === 1025))
        || errMsg.indexOf('announce your privacy') >= 0
        || errMsg.indexOf('NeedPrivacyAuthorization') >= 0
        || errMsg.indexOf('privacy pop-up') >= 0;

    try {
        wx.showModal({
            title: is1026 ? '隐私授权未完成' : '无法使用好友榜',
            content: is1026
                ? '请先点击「同意」隐私提示，并可点《用户隐私保护指引》查看详情。若无弹窗，请重新编译后再真机调试。'
                : '需要同意隐私协议后才能查看好友排行榜。',
            confirmText: '查看协议',
            cancelText: '关闭',
            success(res) {
                if (res && res.confirm) {
                    openPrivacyContract();
                }
            },
        });
    } catch (e) {
        try {
            wx.showToast({ title: '请先同意隐私协议', icon: 'none' });
        } catch (e2) { /* ignore */ }
    }
}

module.exports = {
    initPrivacy,
    getPrivacySetting,
    openPrivacyContract,
    ensurePrivacyAuthorize,
    showPrivacyFailTip,
    isPrivacyDialogVisible,
    renderPrivacyDialog,
    handlePrivacyDialogTap,
};
