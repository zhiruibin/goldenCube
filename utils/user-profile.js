/*** 用户资料工具模块
 * 提供用户微信昵称与头像的获取与缓存能力。
 *
 * 策略：直接使用微信头像昵称（wx.createUserInfoButton 授权获取），
 * 不再让用户手动上传头像或输入昵称。
 */

const PROFILE_KEY = 'gc_user_profile';
/** 用户在首页授权层点过「稍后再说」后不再首启强提示（设置里仍可授权） */
const PROFILE_SKIP_KEY = 'gc_profile_auth_skipped';
const { CLOUD_ENV } = require('./cloud-config');

const MAX_NICKNAME_LENGTH = 32;
const MAX_AVATAR_URL_LENGTH = 512;

/*** 截断字符串，超出最大长度时保留前 maxLength 个字符
 * @param {*} value 原始值（非字符串时返回空字符串）
 * @param {number} maxLength 最大长度
 * @returns {string}
 */
function truncate(value, maxLength) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/*** 读取缓存的用户资料
 * @returns {object|null} 缓存中的 { nickname, avatarUrl }；无缓存时返回 null
 */
function getCachedProfile() {
    try {
        const cached = wx.getStorageSync(PROFILE_KEY);
        if (cached && typeof cached === 'object') {
            return {
                nickname: truncate(cached.nickname, MAX_NICKNAME_LENGTH),
                avatarUrl: truncate(cached.avatarUrl, MAX_AVATAR_URL_LENGTH),
            };
        }
    } catch (error) {
        // 读取缓存失败时静默降级
    }
    return null;
}

/*** 尝试静默获取微信资料：
 * 若用户此前已授权过，wx.getUserInfo 可直接返回真实头像昵称，无需再次弹出授权框。
 * 微信返回的匿名资料（昵称为"微信用户"）会被忽略，避免污染缓存。
 * @returns {Promise<object|null>} 成功时返回并已保存的 { nickname, avatarUrl }；否则返回 null
 */
function tryAutoFetchProfile() {
    const cached = getCachedProfile();
    if (cached) {
        return Promise.resolve(cached);
    }
    return new Promise((resolve) => {
        if (typeof wx.getUserInfo !== 'function') {
            resolve(null);
            return;
        }
        wx.getUserInfo({
            withCredentials: false,
            success: (res) => {
                const userInfo = res && res.userInfo;
                const nickName = userInfo && typeof userInfo.nickName === 'string'
                    ? userInfo.nickName.trim()
                    : '';
                if (nickName && nickName !== '微信用户') {
                    resolve(saveProfile({
                        nickname: nickName,
                        avatarUrl: (userInfo && userInfo.avatarUrl) || '',
                    }));
                } else {
                    resolve(null);
                }
            },
            fail: () => {
                resolve(null);
            },
        });
    });
}

/*** 确保存在用户资料：优先读取缓存，无缓存时尝试静默获取微信资料。
 * 均未取得时返回空资料（不弹授权框，授权需由用户点击触发，见 requestWechatProfile）。
 * @returns {Promise<{nickname: string, avatarUrl: string}>}
 */
function ensureUserProfile() {
    const cached = getCachedProfile();
    if (cached) {
        return Promise.resolve(cached);
    }
    return tryAutoFetchProfile().then((profile) => {
        return profile || { nickname: '', avatarUrl: '' };
    });
}

/**
 * 是否需要在首页首启弹出微信头像昵称授权层。
 * 已有可用昵称、或用户曾点「稍后再说」→ 不再强提示（设置页仍可授权）。
 * @returns {boolean}
 */
function shouldPromptProfileAuth() {
    const cached = getCachedProfile();
    if (cached && cached.nickname) {
        return false;
    }
    try {
        if (wx.getStorageSync(PROFILE_SKIP_KEY)) {
            return false;
        }
    } catch (e) {
        // ignore
    }
    return true;
}

/** 用户跳过首页授权层后写入本地，避免每次进首页都挡操作 */
function markProfileAuthSkipped() {
    try {
        wx.setStorageSync(PROFILE_SKIP_KEY, 1);
    } catch (e) {
        // ignore
    }
}

/** 授权成功后清掉「稍后再说」标记，便于换号等场景再次引导 */
function clearProfileAuthSkipped() {
    try {
        wx.removeStorageSync(PROFILE_SKIP_KEY);
    } catch (e) {
        // ignore
    }
}

/**
 * 上报排行/发起挑战前使用：先隐私授权，再取微信头像昵称。
 * @returns {Promise<{nickname: string, avatarUrl: string, ok: boolean}>}
 * ok=false 表示仍无可用昵称（需引导就地授权，见 ensureProfileForAction）
 */
function loadProfileForCloud() {
    let privacy;
    try {
        privacy = require('./privacy');
    } catch (e) {
        privacy = null;
    }
    const gate = privacy && typeof privacy.ensurePrivacyAuthorize === 'function'
        ? privacy.ensurePrivacyAuthorize().catch(() => false)
        : Promise.resolve(true);

    return gate.then(() => ensureUserProfile()).then((profile) => {
        if (profile && profile.nickname) {
            return {
                nickname: profile.nickname,
                avatarUrl: profile.avatarUrl || '',
                ok: true,
            };
        }
        return tryAutoFetchProfile().then((fetched) => {
            if (fetched && fetched.nickname) {
                return {
                    nickname: fetched.nickname,
                    avatarUrl: fetched.avatarUrl || '',
                    ok: true,
                };
            }
            return {
                nickname: (profile && profile.nickname) || '',
                avatarUrl: (profile && profile.avatarUrl) || '',
                ok: false,
            };
        });
    });
}

/**
 * 业务需要微信头像昵称时调用：已有则直接返回；没有则弹出自建授权框。
 * 「去授权」为微信 UserInfoButton（一次点击即授权，符合微信要求）；
 * 「暂不授权」为 canvas 按钮，点后关弹窗并继续后续流程。
 *
 * @returns {Promise<{nickname: string, avatarUrl: string, ok: boolean}>}
 */
let _ensureProfileInFlight = null;
let _profileAuthDialogVisible = false;
let _profileAuthDialogLayout = null;
let _profileAuthDialogFinish = null;

/** 计算居中授权弹窗布局（含暂不 / 去授权两个按钮区） */
function layoutProfileAuthDialog(W, H) {
    const panelW = Math.min(300, W * 0.84);
    const panelH = 210;
    const panelX = (W - panelW) / 2;
    const panelY = Math.max(80, (H - panelH) / 2 - 20);
    const btnH = 44;
    const btnGap = 12;
    const sidePad = 18;
    const btnW = (panelW - sidePad * 2 - btnGap) / 2;
    const btnY = panelY + panelH - sidePad - btnH;
    return {
        panel: { x: panelX, y: panelY, w: panelW, h: panelH },
        skip: { x: panelX + sidePad, y: btnY, w: btnW, h: btnH },
        auth: { x: panelX + sidePad + btnW + btnGap, y: btnY, w: btnW, h: btnH },
    };
}

function isProfileAuthDialogVisible() {
    return !!_profileAuthDialogVisible;
}

function getProfileAuthDialogLayout() {
    return _profileAuthDialogLayout;
}

/** 绘制授权遮罩弹窗（「去授权」由原生 UserInfoButton 覆盖，此处只画「暂不授权」） */
function renderProfileAuthDialog(ctx, W, H) {
    if (!_profileAuthDialogVisible) {
        return;
    }
    const L = _profileAuthDialogLayout || layoutProfileAuthDialog(W, H);
    const p = L.panel;
    const skip = L.skip;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillRect(0, 0, W, H);

    // panel
    ctx.fillStyle = 'rgba(28, 32, 52, 0.98)';
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 14);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('使用微信头像昵称', p.x + p.w / 2, p.y + 42);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '14px sans-serif';
    const lines = ['授权后排行榜与好友挑战将显示', '你的微信资料；也可暂不授权。'];
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], p.x + p.w / 2, p.y + 78 + i * 22);
    }

    // 暂不授权（canvas）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    roundRectPath(ctx, skip.x, skip.y, skip.w, skip.h, skip.h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '16px sans-serif';
    ctx.fillText('暂不授权', skip.x + skip.w / 2, skip.y + skip.h / 2);

    // 去授权区域仅留底色，文案由 UserInfoButton 绘制
    const auth = L.auth;
    ctx.fillStyle = 'rgba(0, 198, 255, 0.35)';
    roundRectPath(ctx, auth.x, auth.y, auth.w, auth.h, auth.h / 2);
    ctx.fill();

    ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
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

function hitTestProfileAuthSkip(x, y) {
    if (!_profileAuthDialogVisible || !_profileAuthDialogLayout) {
        return false;
    }
    const s = _profileAuthDialogLayout.skip;
    return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
}

/** 点击「暂不授权」：关弹窗并继续后续流程（默认昵称） */
function skipProfileAuthDialog() {
    if (typeof _profileAuthDialogFinish === 'function') {
        _profileAuthDialogFinish({ nickname: '', avatarUrl: '', ok: false });
    } else {
        cancelWechatProfile();
        _profileAuthDialogVisible = false;
        _profileAuthDialogLayout = null;
    }
}

function ensureProfileForAction(options) {
    const opts = options || {};
    return loadProfileForCloud().then((profile) => {
        if (profile && profile.ok) {
            return profile;
        }
        if (_ensureProfileInFlight) {
            return _ensureProfileInFlight;
        }

        _ensureProfileInFlight = new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled) {
                    return;
                }
                settled = true;
                _profileAuthDialogVisible = false;
                _profileAuthDialogLayout = null;
                _profileAuthDialogFinish = null;
                try {
                    if (typeof opts.onAuthButtonHide === 'function') {
                        opts.onAuthButtonHide();
                    }
                } catch (e) { /* ignore */ }
                cancelWechatProfile();
                resolve(result || { nickname: '', avatarUrl: '', ok: false });
            };
            _profileAuthDialogFinish = finish;

            let privacy;
            try {
                privacy = require('./privacy');
            } catch (e) {
                privacy = null;
            }
            const privacyGate = privacy && typeof privacy.ensurePrivacyAuthorize === 'function'
                ? privacy.ensurePrivacyAuthorize().catch(() => false)
                : Promise.resolve(true);

            privacyGate.then((ok) => {
                if (!ok) {
                    finish({ nickname: '', avatarUrl: '', ok: false });
                    return;
                }

                let W = 375;
                let H = 667;
                try {
                    W = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.width) || W;
                    H = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.height) || H;
                } catch (e) { /* ignore */ }

                const layout = layoutProfileAuthDialog(W, H);
                _profileAuthDialogLayout = layout;
                _profileAuthDialogVisible = true;

                try {
                    if (typeof opts.onAuthButtonShow === 'function') {
                        opts.onAuthButtonShow(layout.auth);
                    }
                } catch (e) { /* ignore */ }

                // 「去授权」= UserInfoButton，用户点一次即可完成微信授权
                requestWechatProfile(layout.auth, {
                    buttonText: '去授权',
                }).then((r) => {
                    if (r && r.ok) {
                        finish({
                            nickname: r.nickname || '',
                            avatarUrl: r.avatarUrl || '',
                            ok: true,
                        });
                    } else {
                        // 点了去授权但未拿到资料 / 或点了暂不：关弹窗，按未授权继续
                        finish({ nickname: '', avatarUrl: '', ok: false });
                    }
                }).catch(() => finish({ nickname: '', avatarUrl: '', ok: false }));
            });
        }).then((result) => {
            _ensureProfileInFlight = null;
            return result;
        }, (err) => {
            _ensureProfileInFlight = null;
            throw err;
        });

        return _ensureProfileInFlight;
    });
}

/*** 保存用户资料：与当前缓存合并后写回 storage
 * @param {{nickname?: string, avatarUrl?: string}} profile
 * @returns {{nickname: string, avatarUrl: string}}
 */
function saveProfile(profile) {
    const cached = getCachedProfile() || {};
    const next = {
        nickname: cached.nickname || '',
        avatarUrl: cached.avatarUrl || '',
    };
    if (profile && typeof profile === 'object') {
        if (typeof profile.nickname === 'string' && profile.nickname) {
            next.nickname = profile.nickname;
        }
        if (typeof profile.avatarUrl === 'string' && profile.avatarUrl) {
            next.avatarUrl = profile.avatarUrl;
        }
    }
    next.nickname = truncate(next.nickname, MAX_NICKNAME_LENGTH);
    next.avatarUrl = truncate(next.avatarUrl, MAX_AVATAR_URL_LENGTH);
    try {
        wx.setStorageSync(PROFILE_KEY, next);
    } catch (error) {
        // 写入缓存失败时忽略，仍返回合并后的资料
    }
    // 授权后回写挑战记录，避免对方列表长期停在默认昵称/无头像
    if (next.nickname) {
        try {
            const { cloudService } = require('./cloud-service');
            if (cloudService && typeof cloudService.syncMyChallengeProfile === 'function') {
                cloudService.syncMyChallengeProfile(next).catch(() => {});
            }
        } catch (e) {
            // 云模块不可用时忽略
        }
    }
    return next;
}

let cloudInited = false;

/*** 幂等初始化云开发环境
 * @returns {boolean}
 */
function ensureCloudInit() {
    if (cloudInited) {
        return true;
    }
    if (typeof wx.cloud !== 'object' || typeof wx.cloud.init !== 'function') {
        return false;
    }
    try {
        wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
        cloudInited = true;
        return true;
    } catch (error) {
        return false;
    }
}

let activeUserButton = null;
let activeSettled = true;
let activeResolve = null;

/*** 取消进行中的微信头像昵称授权：销毁悬浮按钮并结束等待
 */
function cancelWechatProfile() {
    if (activeUserButton) {
        try {
            activeUserButton.destroy();
        } catch (error) {
            // 忽略销毁异常
        }
        activeUserButton = null;
    }
    if (!activeSettled && activeResolve) {
        activeSettled = true;
        activeResolve({ ok: false, errMsg: '已取消' });
        activeResolve = null;
    }
}

/*** 通过微信授权获取头像昵称：
 * 在指定屏幕区域（与 canvas 像素坐标一致）创建用户信息按钮，用户点击授权后
 * 直接取得微信头像昵称并保存到本地缓存。已授权过的用户点击后不会再次弹框，
 * 会直接返回微信资料；未授权用户会弹出微信授权框。
 * 一次授权后写入 PROFILE_KEY，全服榜 / 好友榜 / 挑战 / 设置均复用同一缓存。
 * @param {{x:number, y:number, w:number, h:number}} rect 按钮覆盖区域
 * @param {{buttonText?: string}=} options
 * @returns {Promise<{ok:boolean, nickname?:string, avatarUrl?:string, errMsg?:string}>}
 */
function requestWechatProfile(rect, options) {
    return new Promise((resolve) => {
        cancelWechatProfile();
        if (typeof wx.createUserInfoButton !== 'function') {
            resolve({ ok: false, errMsg: '当前微信版本不支持获取头像昵称' });
            return;
        }

        const x = Math.round((rect && rect.x) || 0);
        const y = Math.round((rect && rect.y) || 0);
        const w = Math.round((rect && rect.w) || 260);
        const h = Math.round((rect && rect.h) || 44);
        const buttonText = (options && options.buttonText) || '使用微信头像昵称';

        let button = null;
        try {
            button = wx.createUserInfoButton({
                type: 'text',
                text: buttonText,
                style: {
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    lineHeight: h,
                    backgroundColor: 'rgba(0,198,255,0.92)',
                    color: '#ffffff',
                    textAlign: 'center',
                    fontSize: Math.max(14, Math.min(16, Math.floor(h * 0.36))),
                    borderRadius: Math.round(h / 2),
                },
                withCredentials: false,
            });
        } catch (error) {
            resolve({ ok: false, errMsg: '创建授权按钮失败' });
            return;
        }

        let settled = false;
        activeSettled = false;
        activeResolve = resolve;
        activeUserButton = button;

        function finish(result) {
            if (settled) {
                return;
            }
            settled = true;
            activeSettled = true;
            activeResolve = null;
            if (activeUserButton === button) {
                activeUserButton = null;
                try {
                    button.destroy();
                } catch (error) {
                    // 忽略销毁异常
                }
            }
            resolve(result);
        }

        button.onTap((res) => {
            const userInfo = res && res.userInfo;
            const nickName = userInfo && typeof userInfo.nickName === 'string'
                ? userInfo.nickName.trim()
                : '';
            if (nickName && nickName !== '微信用户') {
                const avatarUrl = (userInfo && userInfo.avatarUrl) || '';
                saveProfile({ nickname: nickName, avatarUrl: avatarUrl });
                clearProfileAuthSkipped();
                finish({ ok: true, nickname: nickName, avatarUrl: avatarUrl });
                return;
            }

            // 兜底：部分基础库/开发者工具下，授权按钮 onTap 回调的 res.userInfo
            // 可能为空或返回匿名资料；用户刚完成授权点击，此时再调用
            // wx.getUserInfo 通常能取得真实头像昵称。
            if (typeof wx.getUserInfo === 'function') {
                wx.getUserInfo({
                    withCredentials: false,
                    success: (infoRes) => {
                        const info = infoRes && infoRes.userInfo;
                        const nick = info && typeof info.nickName === 'string'
                            ? info.nickName.trim()
                            : '';
                        if (nick && nick !== '微信用户') {
                            const avatar = (info && info.avatarUrl) || '';
                            saveProfile({ nickname: nick, avatarUrl: avatar });
                            clearProfileAuthSkipped();
                            finish({ ok: true, nickname: nick, avatarUrl: avatar });
                        } else {
                            finish({ ok: false, errMsg: '未获取到微信头像昵称（可能已拒绝授权），请重试' });
                        }
                    },
                    fail: () => {
                        finish({ ok: false, errMsg: '未获取到微信头像昵称（可能已拒绝授权），请重试' });
                    },
                });
            } else {
                finish({ ok: false, errMsg: '未获取到微信头像昵称（可能已拒绝授权），请重试' });
            }
        });
    });
}

/*** 解析可用头像链接：将 cloud:// fileID 转换为 https 临时链接
 * 小游戏 canvas 的 Image 不支持 cloud:// 协议，需先换取临时链接。
 * @param {string} url 原始头像地址（可能为 cloud:// fileID）
 * @returns {Promise<string>} 可加载的 https 链接；非 cloud:// 原样返回；失败返回空串
 */
let tempUrlCache = {};

function resolveAvatarUrl(url) {
    if (typeof url !== 'string' || !url) {
        return Promise.resolve('');
    }
    if (url.indexOf('cloud://') !== 0) {
        return Promise.resolve(url);
    }
    if (tempUrlCache[url]) {
        return Promise.resolve(tempUrlCache[url]);
    }
    return new Promise((resolve) => {
        if (!ensureCloudInit() || typeof wx.cloud.getTempFileURL !== 'function') {
            resolve('');
            return;
        }
        wx.cloud.getTempFileURL({
            fileList: [url],
            success: (res) => {
                const item = res && res.fileList && res.fileList[0];
                if (item && item.status === 0 && item.tempFileURL) {
                    tempUrlCache[url] = item.tempFileURL;
                    resolve(item.tempFileURL);
                } else {
                    resolve('');
                }
            },
            fail: () => {
                resolve('');
            },
        });
    });
}

module.exports = {
    PROFILE_KEY,
    PROFILE_SKIP_KEY,
    getCachedProfile,
    ensureUserProfile,
    shouldPromptProfileAuth,
    markProfileAuthSkipped,
    clearProfileAuthSkipped,
    loadProfileForCloud,
    ensureProfileForAction,
    tryAutoFetchProfile,
    saveProfile,
    requestWechatProfile,
    cancelWechatProfile,
    resolveAvatarUrl,
    isProfileAuthDialogVisible,
    getProfileAuthDialogLayout,
    renderProfileAuthDialog,
    hitTestProfileAuthSkip,
    skipProfileAuthDialog,
};
