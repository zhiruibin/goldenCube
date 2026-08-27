/**
 * SettingsScene - 设置场景
 * 职责：音效/背景音乐/震动开关、DAS/ARR 参数调节
 */

const { Button } = require('../widgets/button');
const { getCachedProfile, tryAutoFetchProfile, requestWechatProfile, cancelWechatProfile, resolveAvatarUrl } = require('../../utils/user-profile');

class SettingsScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._settings = {};
        this._scrollY = 0;
        this._touchId = null;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._isScrolling = false;
        this._suppressTap = false;
        this._profile = null;
        this._avatarImg = null;
        this._avatarUrl = '';
    }

    onEnter(params) {
        this._params = params || {};
        this._loadSettings();
        this._loadProfile();
        this._initUI();
    }

    onExit() {
        cancelWechatProfile();
        this._buttons = [];
    }

    onPause() {}

    onResume() {}

    update(dt) {}

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 背景
        ctx.fillStyle = '#0f0f23';
        ctx.fillRect(0, 0, W, H);

        // 标题（齿轮图标 + 文字，整体居中）
        const titleText = '设置';
        const titleY = this._topInset() + 16;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const titleW = ctx.measureText(titleText).width;
        const gearR = 11;
        const gap = 8;
        const totalW = gearR * 2 + gap + titleW;
        const leftX = W / 2 - totalW / 2;
        ctx.fillStyle = '#ffffff';
        this._drawGearIcon(ctx, leftX + gearR, titleY, gearR, '#0f0f23');
        ctx.fillText(titleText, leftX + gearR * 2 + gap + titleW / 2, titleY);

        // 设置项
        this._renderSettings(ctx);

        // 按钮
        for (const btn of this._buttons) {
            btn.render(ctx);
        }
    }

    _renderSettings(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const startY = this._topInset() + 70;
        const itemH = 56;
        const listW = Math.min(340, W * 0.85);
        const listX = (W - listW) / 2;

        const items = [
            {
                label: '头像昵称',
                key: 'profile',
                type: 'profile',
            },
            {
                label: '音效',
                key: 'sfx',
                type: 'toggle',
                value: this._settings.sfx !== false,
            },
            {
                label: '背景音乐',
                key: 'bgm',
                type: 'toggle',
                value: this._settings.bgm !== false,
            },
            {
                label: '振动反馈',
                key: 'vibrate',
                type: 'toggle',
                value: this._settings.vibrate !== false,
            },
            {
                label: '背景特效',
                key: 'bgEffects',
                type: 'toggle',
                value: this._settings.bgEffects !== false,
            },
            {
                label: '底部方块特效',
                key: 'miniFx',
                type: 'toggle',
                value: this._settings.miniFx !== false,
            },

            {
                label: 'DAS 延迟',
                key: 'dasDelay',
                type: 'slider',
                min: 50, max: 500, step: 10,
                value: this._settings.dasDelay || 170,
                unit: 'ms',
            },
            {
                label: 'ARR 速度',
                key: 'arrRepeat',
                type: 'slider',
                min: 10, max: 200, step: 5,
                value: this._settings.arrRepeat || 50,
                unit: 'ms',
            },
        ];

        this._settingAreas = [];

        this._settingItems = items;
        const maxScroll = this._getMaxScroll();
        if (this._scrollY > maxScroll) this._scrollY = maxScroll;

        // 裁剪设置项绘制区域：顶部不覆盖标题，底部不进入按钮区
        const viewBottom = H - 160; // 恢复默认按钮上方
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, startY, W, viewBottom - startY);
        ctx.clip();

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const y = startY + i * (itemH + 8) - this._scrollY;
            if (y + itemH < startY || y > viewBottom) continue;

            // 行背景
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            this._roundRect(ctx, listX, y, listW, itemH, 8);
            ctx.fill();

            // 标签
            ctx.fillStyle = '#ffffff';
            ctx.font = '15px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, listX + 15, y + itemH / 2);

            // 控件
            if (item.type === 'profile') {
                const avatarSize = 30;
                const nickname = (this._profile && this._profile.nickname) ? this._profile.nickname : '';
                const ay = y + (itemH - avatarSize) / 2;
                const rightEdge = listX + listW - 15;

                // 头像圆形放在最右侧（对齐其它设置行的开关控件位置）
                const ax = rightEdge - avatarSize;
                ctx.save();
                ctx.beginPath();
                ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                ctx.clip();
                if (this._avatarImg) {
                    ctx.drawImage(this._avatarImg, ax, ay, avatarSize, avatarSize);
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.beginPath();
                    ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                    ctx.fill();
                    const ch = nickname ? nickname[0] : '微';
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.font = '15px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(ch, ax + avatarSize / 2, ay + avatarSize / 2 + 1);
                }
                ctx.restore();

                // 文字（未授权时显示"点击授权"）位于头像左侧，右对齐到头像左侧
                const display = nickname || '点击授权';
                const gap = 8;
                const textRight = ax - gap;
                ctx.font = '15px sans-serif';
                const maxTextW = Math.max(60, textRight - (listX + 15) - 8);
                const fitRight = (text, maxW) => {
                    if (ctx.measureText(text).width <= maxW) {
                        return { text: text, w: ctx.measureText(text).width };
                    }
                    let lo = 0;
                    let hi = text.length;
                    while (lo < hi) {
                        const mid = Math.ceil((lo + hi) / 2);
                        if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) {
                            lo = mid;
                        } else {
                            hi = mid - 1;
                        }
                    }
                    const t = lo > 0 ? text.slice(0, lo) + '…' : '';
                    return { text: t, w: ctx.measureText(t).width };
                };
                const fitted = fitRight(display, maxTextW);
                ctx.fillStyle = nickname ? '#ffffff' : 'rgba(255,255,255,0.45)';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(fitted.text, textRight, y + itemH / 2);

                this._settingAreas.push({
                    x: listX, y: y,
                    w: listW, h: itemH, key: 'profile', type: 'profile',
                });
            } else if (item.type === 'toggle') {
                this._renderToggle(ctx, listX + listW - 55, y + itemH / 2 - 12, item.value);
                this._settingAreas.push({
                    x: listX + listW - 55, y: y + itemH / 2 - 12,
                    w: 44, h: 24, key: item.key, type: 'toggle',
                });
            } else if (item.type === 'select') {
                ctx.fillStyle = '#00c6ff';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(item.value + ' ▸', listX + listW - 15, y + itemH / 2);
                this._settingAreas.push({
                    x: listX + listW - 80, y: y,
                    w: 80, h: itemH, key: item.key, type: 'select',
                    options: item.options,
                });
            } else if (item.type === 'slider') {
                this._renderSlider(ctx, listX + listW - 140, y + itemH / 2, 120, item);
                this._settingAreas.push({
                    x: listX + listW - 140, y: y + itemH / 2 - 15,
                    w: 120, h: 30, key: item.key, type: 'slider', item,
                });
            }
        }

        ctx.restore();
    }

    _renderToggle(ctx, x, y, value) {
        const w = 44;
        const h = 24;
        const r = h / 2;

        // 轨道
        ctx.fillStyle = value ? '#00c6ff' : 'rgba(255,255,255,0.2)';
        this._roundRect(ctx, x, y, w, h, r);
        ctx.fill();

        // 滑块
        const knobX = value ? x + w - h / 2 - 2 : x + h / 2 + 2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(knobX, y + h / 2, h / 2 - 3, 0, Math.PI * 2);
        ctx.fill();
    }

    _renderSlider(ctx, x, y, w, item) {
        const ratio = (item.value - item.min) / (item.max - item.min);

        // 轨道背景
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        this._roundRect(ctx, x, y - 2, w, 4, 2);
        ctx.fill();

        // 已填充部分
        ctx.fillStyle = '#00c6ff';
        this._roundRect(ctx, x, y - 2, w * ratio, 4, 2);
        ctx.fill();

        // 数值
        ctx.fillStyle = '#ffffff';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${item.value}${item.unit}`, x + w, y - 14);
    }

    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const btnW = Math.min(260, W * 0.7);
        const btnH = 48;

        this._buttons = [
            new Button({
                x: W / 2 - btnW / 2, y: H - 80,
                w: btnW, h: btnH,
                text: '← 返回',
                color: '#555',
                onClick: () => GameGlobal.game.sceneManager.back(),
            }),
            new Button({
                x: W / 2 - btnW / 2, y: H - 140,
                w: btnW, h: btnH,
                text: '恢复默认',
                color: '#f00000',
                onClick: () => this._resetDefaults(),
            }),
        ];
    }

    _loadSettings() {
        this._settings = {
            sfx: wx.getStorageSync('setting_sfx') !== false,
            bgm: wx.getStorageSync('setting_bgm') !== false,
            vibrate: wx.getStorageSync('setting_vibrate') !== false,
            bgEffects: wx.getStorageSync('setting_bgEffects') !== false,
            miniFx: wx.getStorageSync('setting_miniFx') !== false,
            dasDelay: wx.getStorageSync('setting_dasDelay') || 170,
            arrRepeat: wx.getStorageSync('setting_arrRepeat') || 50,
        };
    }

    _saveSettings() {
        wx.setStorageSync('setting_sfx', this._settings.sfx);
        wx.setStorageSync('setting_bgm', this._settings.bgm);
        wx.setStorageSync('setting_vibrate', this._settings.vibrate);
        wx.setStorageSync('setting_bgEffects', this._settings.bgEffects);
        wx.setStorageSync('setting_miniFx', this._settings.miniFx);
        wx.setStorageSync('setting_dasDelay', this._settings.dasDelay);
        wx.setStorageSync('setting_arrRepeat', this._settings.arrRepeat);
    }

    _resetDefaults() {
        // 危险操作二次确认（文档 3.2.9）
        wx.showModal({
            title: '恢复默认设置',
            content: '确定恢复所有操作设置为默认值？',
            confirmText: '确定',
            cancelText: '取消',
            success: (res) => {
                if (res.confirm) {
                    this._settings = {
                        sfx: true, bgm: true, vibrate: true, bgEffects: true,
                        miniFx: true,
                        dasDelay: 170, arrRepeat: 50,
                    };
                    this._saveSettings();
                    wx.showToast({ title: '已恢复默认', icon: 'none' });
                }
            },
        });
    }

    _loadProfile() {
        this._profile = getCachedProfile() || { nickname: '', avatarUrl: '' };
        const url = this._profile.avatarUrl || '';
        this._avatarUrl = url;
        this._avatarImg = null;
        if (!url) {
            // 未设置过头像时尝试静默获取微信资料（若用户已授权过则直接生效，无需再次弹框）
            tryAutoFetchProfile().then((profile) => {
                if (profile && profile.nickname) {
                    this._loadProfile();
                }
            });
            return;
        }
        resolveAvatarUrl(url).then((httpsUrl) => {
            if (!httpsUrl) return;
            try {
                const img = wx.createImage();
                img.onload = () => {
                    if (this._avatarUrl === url) {
                        this._avatarImg = img;
                    }
                };
                img.onerror = () => {};
                img.src = httpsUrl;
            } catch (e) {}
        });
    }

    _onEditProfile(area) {
        const rect = area
            ? { x: area.x, y: area.y, w: area.w, h: area.h }
            : null;
        const { ensurePrivacyAuthorize, showPrivacyFailTip } = require('../../utils/privacy');
        ensurePrivacyAuthorize().then((ok) => {
            if (!ok) {
                showPrivacyFailTip({ errMsg: 'privacy not authorized' });
                return;
            }
            return requestWechatProfile(rect);
        }).then((r) => {
            if (!r) return;
            if (r && r.ok) {
                this._loadProfile();
                wx.showToast({ title: '已获取微信头像昵称', icon: 'none' });
            } else if (r && r.errMsg) {
                wx.showToast({ title: r.errMsg, icon: 'none' });
            }
        });
    }

    _roundRect(ctx, x, y, w, h, r) {


        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    _topInset() {
        const sys = GameGlobal.game.systemInfo || {};
        return Math.max(sys.statusBarHeight || 0, (sys.safeArea && sys.safeArea.top) || 0);
    }

    /**
     * 绘制齿轮形状（8 齿锯齿外圈 + 中心孔镂空）
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx - 齿轮中心 X
     * @param {number} cy - 齿轮中心 Y
     * @param {number} r - 齿轮半径（含齿）
     * @param {string} holeColor - 中心孔颜色（与背景一致）
     */
    _drawGearIcon(ctx, cx, cy, r, holeColor) {
        const teeth = 8;
        const innerR = r * 0.82;

        ctx.save();
        ctx.translate(cx, cy);

        // 锯齿外圈
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
            const angle = (i * Math.PI) / teeth;
            const rad = i % 2 === 0 ? r : innerR;
            const px = Math.cos(angle) * rad;
            const py = Math.sin(angle) * rad;
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();

        // 中心孔
        ctx.fillStyle = holeColor;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /** 计算设置列表最大可滚动距离（内容超出可视区时才可滚动） */
    /** 计算设置列表最大可滚动距离（内容超出可视区时才可滚动） */
    _getMaxScroll() {
        const H = GameGlobal.game.height;
        const items = this._settingItems || [];
        const startY = this._topInset() + 70;
        const itemH = 56;
        const gap = 8;
        const count = items.length;
        const contentBottom = startY + count * (itemH + gap) - gap;
        const viewBottom = H - 160; // 恢复默认按钮上方
        return Math.max(0, contentBottom - viewBottom);
    }

    handleTouchStart(identifier, x, y) {
        this._touchId = identifier;
        this._touchStartX = x;
        this._touchStartY = y;
        this._isScrolling = false;
    }

    handleTouchMove(identifier, x, y) {
        if (identifier !== this._touchId) return;
        const dx = x - this._touchStartX;
        const dy = y - this._touchStartY;
        if (!this._isScrolling) {
            if (Math.abs(dy) < 12 && Math.abs(dx) < 12) return;
            cancelWechatProfile();
            this._isScrolling = true;
        }
        this._scrollY = Math.max(0, Math.min(this._getMaxScroll(), this._scrollY - dy));
        this._touchStartX = x;
        this._touchStartY = y;
    }

    handleTouchEnd(identifier) {
        if (identifier === -1 || identifier === this._touchId) {
            this._touchId = null;
            if (this._isScrolling) {
                this._suppressTap = true;
            }
            this._isScrolling = false;
        }
    }

    handleTap(x, y) {
        if (this._suppressTap) {
            this._suppressTap = false;
            return;
        }
        // 设置项点击
        if (this._settingAreas) {
            for (const area of this._settingAreas) {
                if (x >= area.x && x <= area.x + area.w &&
                    y >= area.y && y <= area.y + area.h) {
                    if (area.type === 'profile') {
                        this._onEditProfile(area);
                        return;
                    }
                    if (area.type === 'toggle') {
                        this._settings[area.key] = !this._settings[area.key];
                        this._saveSettings();
                        // BGM 开关实时生效
                        if (area.key === 'bgm') {
                            const audio = GameGlobal.game.audioManager;
                            if (audio) {
                                if (this._settings.bgm) {
                                    if (!audio.isInitialized()) audio.init();
                                    audio.playBGM();
                                } else {
                                    audio.stopBGM();
                                }
                            }
                        }
                    } else if (area.type === 'select') {
                        const opts = area.options;
                        const idx = opts.indexOf(this._settings[area.key]);
                        this._settings[area.key] = opts[(idx + 1) % opts.length];
                        this._saveSettings();
                    } else if (area.type === 'slider') {
                        // 点击滑块区域 → 调整值
                        const ratio = (x - area.x) / area.w;
                        const item = area.item;
                        const newVal = Math.round(
                            item.min + ratio * (item.max - item.min)
                        );
                        this._settings[area.key] = Math.max(item.min, Math.min(item.max, newVal));
                        this._saveSettings();
                    }
                    return;
                }
            }
        }

        // 按钮
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
    }
}

module.exports = SettingsScene;
