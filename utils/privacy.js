/**
 * 隐私授权（小游戏）
 * 参考：
 * - https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html
 * - https://developers.weixin.qq.com/community/minigame/doc/0004c84925817819b7ffd8b2356008
 *
 * 关键点：注册 wx.onNeedPrivacyAuthorization，弹窗曝光上报 exposureAuthorization，
 * 用户点击同意后再 resolve({ event:'agree' })（必须在点击回调里）。
 * 仅靠后台声明、不接弹窗，会报 1026 / please implement the privacy pop-up feature。
 */

let _inited = false;
let _authorized = false;
let _inflight = null;
let _modalVisible = false;
/** @type {Array<Function>} 等待用户点同意/拒绝的 resolve 队列 */
let _pendingResolves = [];

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
        _modalVisible = true;

        wx.showModal({
            title: '用户隐私保护提示',
            content: '为展示好友排行榜与玩家昵称头像，需要使用微信朋友关系、昵称和头像。请阅读并同意《用户隐私保护指引》。',
            confirmText: '同意',
            cancelText: '拒绝',
            success(res) {
                _modalVisible = false;
                // 必须在用户点击回调中 resolve agree/disagree
                _flushResolves(res && res.confirm ? 'agree' : 'disagree');
            },
            fail() {
                _modalVisible = false;
                _flushResolves('disagree');
            },
        });
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
            resolve(false);
            return;
        }
        wx.openPrivacyContract({
            success() { resolve(true); },
            fail() { resolve(false); },
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
                ? '请先点击「同意」隐私提示。若无弹窗，请重新编译后再真机调试，并确认公众平台已声明朋友关系与昵称头像。'
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
};
