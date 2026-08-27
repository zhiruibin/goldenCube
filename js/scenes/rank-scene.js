/**
 * RankScene - 排行榜场景
 * 职责：显示好友/全服排行榜（好友榜经开放数据域 sharedCanvas 渲染，全服榜走云函数）
 *
 * 数据流：
 *   - 好友榜：主域 postMessage → 开放数据域 wx.getFriendCloudStorage → sharedCanvas → 主域 drawImage
 *   - 全服榜：云函数 rank.getRankList → 云数据库 rankings（前十可回放）
 */

const { Button } = require('../widgets/button');
const { cloudService } = require('../../utils/cloud-service');
const { MODE_NAMES, RANK_PERIODS } = require('../../utils/cloud-config');
const IconRenderer = require('../render/icon-renderer');
const { achievementManager } = require('../../utils/achievement-manager');

let lastViewState = null;

class RankScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._rankData = [];
        this._total = 0;
        this._tab = 'friend'; // 'friend' | 'global'
        this._mode = 'classic';
        this._period = 'total';
        this._loading = false;
        this._error = '';
        this._offline = false;
        this._myRank = null;
        this._myScore = null;

        // 好友榜 sharedCanvas 区域
        this._friendArea = { x: 0, y: 0, w: 0, h: 0 };
        /** 已请求过好友榜的模式，避免与 _loadRankData 重复 postMessage */
        this._friendMode = '';

        // 滚动状态
        this._scrollY = 0;
        this._touchId = null;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._isScrolling = false;
        this._suppressTap = false;

        // 模式/周期选择按钮区域
        // 模式/周期选择按钮区域
        this._modeAreas = [];
        this._periodAreas = [];
        this._tabAreas = [];

        // 全服榜行内回放/挑战按钮（命中区 + 防重复点击）
        this._replayBtns = [];
        this._challengeBtns = [];
        this._replayLoading = false;
        this._shareBusy = false;
    }

    onEnter(params) {
        this._params = params || {};
        const s = lastViewState || {};
        this._tab = s.tab || 'friend';
        this._mode = s.mode || 'classic';
        this._period = s.period || 'total';
        this._scrollY = s.scrollY || 0;
        this._initUI();
        this._loadRankData();
    }

    onExit() {
        lastViewState = { tab: this._tab, mode: this._mode, period: this._period, scrollY: this._scrollY };
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

        // 标题（图标 + 文字整体居中，参考设置页布局）
        const titleText = '排行榜';
        const titleY = this._topInset() + 16;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const titleW = ctx.measureText(titleText).width;
        const iconSize = 24;
        const gap = 8;
        const totalW = iconSize + gap + titleW;
        const leftX = W / 2 - totalW / 2;
        ctx.fillStyle = '#ffffff';
        IconRenderer.draw(ctx, 'trophy', leftX + iconSize / 2, titleY, iconSize, '#ffffff');
        ctx.fillText(titleText, leftX + iconSize + gap + titleW / 2, titleY);


        // Tab 切换
        this._renderTabs(ctx);

        // 模式切换（经典/限时/马拉松）
        this._renderModeSelect(ctx);

        // 周期切换（全服榜：总榜/周榜/月榜）
        if (this._tab === 'global') {
            this._renderPeriodSelect(ctx);
        }

        // 列表区
        const listTop = this._listTop();
        const listBottom = this._listBottom();
        const listH = listBottom - listTop;

        if (this._tab === 'friend') {
            this._renderFriendRank(ctx, listTop, listBottom);
        } else {
            this._renderGlobalRank(ctx, listTop, listBottom);
        }

        // 底部我的排名条（全服榜）
        if (this._tab === 'global' && !this._loading && this._myRank) {
            this._renderMyRankBar(ctx, listBottom);
        }

        // 按钮
        for (const btn of this._buttons) {
            btn.render(ctx);
        }
    }

    /** 渲染好友榜（开放数据域 sharedCanvas） */
    _renderFriendRank(ctx, top, bottom) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const rect = this._listRect(top, bottom);

        // 首次进入 / 区域变化 / 模式切换：只发一次消息（避免与 _loadRankData 双打接口）
        const needRequest = !this._friendInited
            || this._friendMode !== this._mode
            || this._friendArea.x !== rect.x
            || this._friendArea.y !== rect.y
            || this._friendArea.w !== rect.w
            || this._friendArea.h !== rect.h;

        if (needRequest) {
            this._friendArea = rect;
            this._friendMode = this._mode;
            this._friendInited = true;
            cloudService.renderFriendRank({
                mode: this._mode,
                x: rect.x,
                y: rect.y,
                width: rect.w,
                height: rect.h,
                screenW: W,
                screenH: H,
            });
        }

        try {
            const od = wx.getOpenDataContext();
            const canvas = od.canvas;
            if (canvas) {
                const s = canvas.width / Math.max(1, W);
                ctx.drawImage(
                    canvas,
                    rect.x * s, rect.y * s, rect.w * s, rect.h * s,
                    rect.x, rect.y, rect.w, rect.h
                );
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('好友榜加载中...', W / 2, (top + bottom) / 2);
            }
        } catch (e) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('好友榜暂不可用', W / 2, (top + bottom) / 2);
        }
    }


    /** 渲染全服榜（云函数数据） */
    _renderGlobalRank(ctx, top, bottom) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const itemH = 56;
        const listW = Math.min(340, W * 0.85);
        const listX = (W - listW) / 2;

        if (this._loading) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('加载中...', W / 2, (top + bottom) / 2);
            return;
        }

        if (this._error) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._error, W / 2, (top + bottom) / 2);
            if (this._offline) {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '12px sans-serif';
                ctx.fillText('（已切换本地模式）', W / 2, (top + bottom) / 2 + 22);
            }
            return;
        }

        if (this._rankData.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('暂无排行数据', W / 2, (top + bottom) / 2);
            return;
        }

        const maxScroll = this._getMaxScroll(top, bottom);
        if (this._scrollY > maxScroll) this._scrollY = maxScroll;

        // 裁剪到列表可视区
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, top, W, bottom - top);
        ctx.clip();

        this._replayBtns = [];
        this._challengeBtns = [];
        for (let i = 0; i < this._rankData.length; i++) {
            const item = this._rankData[i];
            const y = top + i * itemH - this._scrollY;
            if (y + itemH < top || y > bottom) continue;

            // 行背景
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
            this._roundRect(ctx, listX, y, listW, itemH - 4, 8);
            ctx.fill();
            // 名次
            const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            if (i < 3) {
                IconRenderer.draw(ctx, 'medal', listX + 30, y + itemH / 2 - 2, 26, medalColors[i]);
            } else {
                ctx.fillText(String(i + 1), listX + 30, y + itemH / 2 - 2);
            }

            // 微信头像（有 avatarUrl 时绘制；否则仅昵称）
            const avatarSize = 28;
            const avatarX = listX + 52;
            const avatarY = y + (itemH - avatarSize) / 2 - 2;
            const hasAvatar = !!(item.avatarUrl);
            if (hasAvatar) {
                this._drawRankAvatar(ctx, item.avatarUrl, avatarX, avatarY, avatarSize);
            }

            // 昵称
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(item.nickname || '玩家', hasAvatar ? listX + 88 : listX + 60, y + itemH / 2 - 2);

            const hasReplay = !!item.hasReplay && i < 10;
            const isMe = typeof this._myRank === 'number' && this._myRank === i + 1;
            const showChallenge = !isMe && (item.score || 0) > 0;
            const btnW = 48;
            const btnH = 24;
            const btnGap = 6;
            let right = listX + listW - 12;

            if (hasReplay) {
                const btnX = right - btnW;
                const btnY = y + (itemH - btnH) / 2 - 2;
                ctx.fillStyle = 'rgba(0,198,255,0.25)';
                this._roundRect(ctx, btnX, btnY, btnW, btnH, 6);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,198,255,0.6)';
                ctx.lineWidth = 1;
                this._roundRect(ctx, btnX, btnY, btnW, btnH, 6);
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('回放', btnX + btnW / 2, btnY + btnH / 2);
                this._replayBtns.push({ x: btnX, y: btnY, w: btnW, h: btnH, replayId: item.id || '' });
                right = btnX - btnGap;
            }

            if (showChallenge) {
                const btnX = right - btnW;
                const btnY = y + (itemH - btnH) / 2 - 2;
                ctx.fillStyle = 'rgba(224, 154, 48, 0.28)';
                this._roundRect(ctx, btnX, btnY, btnW, btnH, 6);
                ctx.fill();
                ctx.strokeStyle = 'rgba(224, 154, 48, 0.7)';
                ctx.lineWidth = 1;
                this._roundRect(ctx, btnX, btnY, btnW, btnH, 6);
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('挑战', btnX + btnW / 2, btnY + btnH / 2);
                this._challengeBtns.push({
                    x: btnX, y: btnY, w: btnW, h: btnH,
                    score: item.score || 0,
                    nickname: item.nickname || '玩家',
                    avatarUrl: item.avatarUrl || '',
                    openid: item.openid || '',
                });
                right = btnX - btnGap;
            }

            // 分数（有按钮时右移让位）
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FFC857';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(String(item.score || 0), right - 4, y + itemH / 2 - 2);
        }

        ctx.restore();
    }

    /** 渲染底部我的排名条 */
    _renderMyRankBar(ctx, bottom) {
        const W = GameGlobal.game.width;
        const barW = Math.min(340, W * 0.85);
        const barX = (W - barW) / 2;
        const barH = 36;
        const barY = bottom - barH - 6;

        ctx.fillStyle = 'rgba(255, 200, 87, 0.12)';
        this._roundRect(ctx, barX, barY, barW, barH, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 200, 87, 0.35)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, barX, barY, barW, barH, 8);
        ctx.stroke();

        ctx.fillStyle = '#FFC857';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`我的排名: ${this._myRank}`, barX + 14, barY + barH / 2);

        let rightText = `最高 ${this._myScore || 0} 分`;
        if (typeof this._myRank === 'number' && this._myRank > 1 && this._rankData.length >= this._myRank) {
            const ahead = this._rankData[this._myRank - 2];
            if (ahead && typeof ahead.score === 'number') {
                const gap = ahead.score - (this._myScore || 0);
                if (gap > 0) {
                    rightText = `距上一名还差 ${gap}`;
                }
            }
        } else if (this._myRank === 1) {
            rightText = '当前第一';
        }
        ctx.textAlign = 'right';
        ctx.fillText(rightText, barX + barW - 14, barY + barH / 2);
    }

    _renderTabs(ctx) {
        const W = GameGlobal.game.width;
        const tabW = 100;
        const tabH = 36;
        const tabY = this._topInset() + 50;
        const gap = 10;
        const startX = W / 2 - tabW - gap / 2;

        // 好友 Tab
        ctx.fillStyle = this._tab === 'friend' ? '#00c6ff' : 'rgba(255,255,255,0.1)';
        this._roundRect(ctx, startX, tabY, tabW, tabH, 8);
        ctx.fill();
        ctx.fillStyle = this._tab === 'friend' ? '#fff' : 'rgba(255,255,255,0.5)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('好友排行', startX + tabW / 2, tabY + tabH / 2);

        // 全服 Tab
        const globalX = startX + tabW + gap;
        ctx.fillStyle = this._tab === 'global' ? '#00c6ff' : 'rgba(255,255,255,0.1)';
        this._roundRect(ctx, globalX, tabY, tabW, tabH, 8);
        ctx.fill();
        ctx.fillStyle = this._tab === 'global' ? '#fff' : 'rgba(255,255,255,0.5)';
        ctx.fillText('全服排行', globalX + tabW / 2, tabY + tabH / 2);

        this._tabAreas = [
            { x: startX, y: tabY, w: tabW, h: tabH, tab: 'friend' },
            { x: globalX, y: tabY, w: tabW, h: tabH, tab: 'global' },
        ];
    }

    /** 渲染模式切换（经典/限时/马拉松） */
    _renderModeSelect(ctx) {
        const W = GameGlobal.game.width;
        const names = [['classic', '经典'], ['timed', '限时'], ['marathon', '马拉松']];
        const itemW = 76;
        const itemH = 30;
        const gap = 8;
        const totalW = names.length * itemW + (names.length - 1) * gap;
        const startX = (W - totalW) / 2;
        const y = this._topInset() + 100;

        this._modeAreas = [];
        for (let i = 0; i < names.length; i++) {
            const x = startX + i * (itemW + gap);
            ctx.fillStyle = this._mode === names[i][0] ? 'rgba(0,198,255,0.3)' : 'rgba(255,255,255,0.08)';
            this._roundRect(ctx, x, y, itemW, itemH, 6);
            ctx.fill();
            ctx.strokeStyle = this._mode === names[i][0] ? 'rgba(0,198,255,0.6)' : 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            this._roundRect(ctx, x, y, itemW, itemH, 6);
            ctx.stroke();
            ctx.fillStyle = this._mode === names[i][0] ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(names[i][1], x + itemW / 2, y + itemH / 2);
            this._modeAreas.push({ x, y, w: itemW, h: itemH, mode: names[i][0] });
        }
    }

    /** 渲染周期切换（全服榜） */
    _renderPeriodSelect(ctx) {
        const W = GameGlobal.game.width;
        const names = [['total', '总榜'], ['week', '周榜'], ['month', '月榜']];
        const itemW = 68;
        const itemH = 28;
        const gap = 8;
        const totalW = names.length * itemW + (names.length - 1) * gap;
        const startX = (W - totalW) / 2;
        const y = this._topInset() + 144;

        this._periodAreas = [];
        for (let i = 0; i < names.length; i++) {
            const x = startX + i * (itemW + gap);
            ctx.fillStyle = this._period === names[i][0] ? 'rgba(0,198,255,0.3)' : 'rgba(255,255,255,0.08)';
            this._roundRect(ctx, x, y, itemW, itemH, 6);
            ctx.fill();
            ctx.strokeStyle = this._period === names[i][0] ? 'rgba(0,198,255,0.6)' : 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            this._roundRect(ctx, x, y, itemW, itemH, 6);
            ctx.stroke();
            ctx.fillStyle = this._period === names[i][0] ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(names[i][1], x + itemW / 2, y + itemH / 2);
            this._periodAreas.push({ x, y, w: itemW, h: itemH, period: names[i][0] });
        }
    }

    /** 列表顶部 y（好友榜：模式按钮下方；全服榜：周期按钮下方） */
    _listTop() {
        return this._tab === 'global' ? this._topInset() + 180 : this._topInset() + 140;
    }

    /** 列表底部：好友榜预留「发起挑战」+ 返回；全服榜预留返回 */
    _listBottom() {
        const H = GameGlobal.game.height;
        return this._tab === 'friend' ? H - 148 : H - 90;
    }

    /** 好友榜/全服榜统一列表容器（居中，左右边距一致） */
    _listRect(top, bottom) {
        const W = GameGlobal.game.width;
        const listW = Math.min(340, W * 0.85);
        const listX = (W - listW) / 2;
        return { x: listX, y: top, w: listW, h: bottom - top };
    }
    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const btnW = Math.min(260, W * 0.7);
        const btnH = 48;

        this._buttons = [];
        if (this._tab === 'friend') {
            this._buttons.push(new Button({
                x: W / 2 - btnW / 2, y: H - 140,
                w: btnW, h: btnH,
                text: '发起挑战',
                icon: 'share',
                color: '#e09a30',
                onClick: () => this._shareMyBestChallenge(),
            }));
        }
        this._buttons.push(new Button({
            x: W / 2 - btnW / 2, y: H - 80,
            w: btnW, h: btnH,
            text: '← 返回',
            color: '#555',
            onClick: () => GameGlobal.game.sceneManager.back(),
        }));
    }

    /** 用本模式本地最高分创建挑战并分享（好友榜无法读对方分，主路径用自己成绩） */
    _shareMyBestChallenge() {
        if (this._shareBusy) return;
        const mode = this._mode || 'classic';
        let score = 0;
        try {
            score = wx.getStorageSync('bestScore_' + mode) || 0;
        } catch (e) {
            score = 0;
        }
        score = Math.floor(Number(score) || 0);
        if (score <= 0) {
            wx.showToast({ title: '先打一局再发起挑战', icon: 'none' });
            return;
        }

        const modeNames = MODE_NAMES || {};
        const modeLabel = modeNames[mode] || '经典模式';
        const fallbackShare = () => {
            wx.shareAppMessage({
                title: `我在方块过把瘾「${modeLabel}」最高 ${score} 分，敢来超越吗？`,
            });
        };

        if (!(cloudService.isAvailable && cloudService.isAvailable())) {
            fallbackShare();
            return;
        }

        this._shareBusy = true;
        const { ensureProfileForAction } = require('../../utils/user-profile');
        ensureProfileForAction({
            title: '发起好友挑战',
            content: '授权微信头像昵称后，好友能看到你的资料。也可暂不授权，使用默认昵称继续发起。',
        }).then((profile) => {
            return cloudService.createChallenge({
                mode: mode,
                score: score,
                nickname: (profile && profile.nickname) || '',
                avatarUrl: (profile && profile.avatarUrl) || '',
            });
        }).then((res) => {
            this._shareBusy = false;
            if (!res) return;
            if (res && res.success && res.challengeId) {
                wx.shareAppMessage({
                    title: `向你发起挑战！我在『${modeLabel}』最高 ${score} 分，敢来超越吗？`,
                    query: 'challengeId=' + res.challengeId + '&mode=' + mode + '&score=' + score,
                    success: () => {
                        try {
                            achievementManager.reportShare();
                            achievementManager.reportInvite();
                        } catch (e) { /* ignore */ }
                    },
                });
            } else {
                fallbackShare();
            }
        }).catch(() => {
            this._shareBusy = false;
            fallbackShare();
        });
    }

    /** 以对方分数为目标开局，打完再发挑战卡 */
    _startTargetChallenge(targetScore, nickname, avatarUrl, openid) {
        const score = Math.floor(Number(targetScore) || 0);
        if (score <= 0) return;
        GameGlobal.game.sceneManager.switchTo('game', {
            mode: this._mode,
            targetScore: score,
            challengeLaunch: true,
            challengeTargetName: nickname || '',
            challengeTargetAvatar: avatarUrl || '',
            challengeTargetOpenid: openid || '',
        });
    }

    /** 加载排行数据 */
    _loadRankData() {
        if (this._tab === 'friend') {
            // 好友榜：隐私授权后由 _renderFriendRank 经开放数据域拉取
            const { ensurePrivacyAuthorize, showPrivacyFailTip } = require('../../utils/privacy');
            ensurePrivacyAuthorize().then((ok) => {
                if (this._tab !== 'friend') return;
                if (!ok) {
                    this._friendInited = false;
                    this._friendMode = '';
                    showPrivacyFailTip({ errMsg: 'privacy not authorized' });
                    return;
                }
                this._friendInited = false;
                this._friendMode = '';
            });
            return;
        }

        // 全服榜：云函数
        this._loading = true;
        this._error = '';
        this._offline = false;
        this._rankData = [];
        this._myRank = null;
        this._myScore = null;

        cloudService.getRankList({ mode: this._mode, period: this._period, page: 1, pageSize: 20 })
            .then((res) => {
                this._loading = false;
        if (res && res.success) {
            this._rankData = res.list || [];
            this._total = res.total || 0;
            this._myRank = res.myRank || null;
            this._myScore = res.myScore || null;
            this._offline = !!res.offline;
            if (typeof this._myRank === 'number' && this._myRank > 0) {
                try {
                    achievementManager.reportRankEnter(this._myRank);
                } catch (e) {}
            }
                } else {
                    this._offline = !!(res && res.offline);
                    this._error = this._offline
                        ? '云开发未配置，无法加载全服排行'
                        : '加载失败，请重试';
                }
            })
            .catch(() => {
                this._loading = false;
                this._error = '加载失败，请重试';
                this._offline = false;
            });
    }

    /** 从云端拉取回放数据并跳转到回放场景（全服榜前十行内回放） */
    _openReplay(replayId) {
        if (this._replayLoading) return;
        this._replayLoading = true;
        cloudService.getReplay(replayId)
            .then((res) => {
                const replay = res && res.replay;
                if (replay && replay.seed != null && Array.isArray(replay.inputs)) {
                    GameGlobal.game.sceneManager.switchTo('replay', { replayData: replay, fromRank: true });
                } else {
                    wx.showToast({ title: '回放加载失败', icon: 'none' });
                }
            })
            .catch(() => {
                wx.showToast({ title: '回放加载失败', icon: 'none' });
            })
            .finally(() => {
                this._replayLoading = false;
            });
    }

    _topInset() {
        const sys = GameGlobal.game.systemInfo || {};
        return Math.max(sys.statusBarHeight || 0, (sys.safeArea && sys.safeArea.top) || 0);
    }

    /** 全服榜圆形头像（异步加载，失败则忽略） */
    _drawRankAvatar(ctx, url, x, y, size) {
        if (!url || typeof url !== 'string') return;
        if (!this._avatarImgCache) this._avatarImgCache = {};
        let entry = this._avatarImgCache[url];
        if (!entry) {
            entry = { img: null, status: 'loading' };
            this._avatarImgCache[url] = entry;
            try {
                const { resolveAvatarUrl } = require('../../utils/user-profile');
                resolveAvatarUrl(url).then((httpsUrl) => {
                    if (!httpsUrl) {
                        entry.status = 'fail';
                        return;
                    }
                    const img = wx.createImage();
                    img.onload = () => {
                        entry.img = img;
                        entry.status = 'ok';
                    };
                    img.onerror = () => {
                        entry.status = 'fail';
                    };
                    img.src = httpsUrl;
                }).catch(() => {
                    entry.status = 'fail';
                });
            } catch (e) {
                entry.status = 'fail';
            }
        }
        if (entry.status === 'ok' && entry.img) {
            ctx.save();
            this._roundRect(ctx, x, y, size, size, size / 2);
            ctx.clip();
            ctx.drawImage(entry.img, x, y, size, size);
            ctx.restore();
            return;
        }
        // 加载中/失败占位
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        this._roundRect(ctx, x, y, size, size, size / 2);
        ctx.fill();
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

    /** 计算全服榜最大可滚动距离 */
    _getMaxScroll(top, bottom) {
        const itemH = 56;
        const contentBottom = top + this._rankData.length * itemH;
        const viewBottom = bottom - 42; // 预留底部我的排名条
        return Math.max(0, contentBottom - viewBottom);
    }

    handleTouchStart(identifier, x, y) {
        this._touchId = identifier;
        this._touchStartX = x;
        this._touchStartY = y;
        this._isScrolling = false;

        // 好友榜：转发给开放数据域
        if (this._tab === 'friend') {
            cloudService.sendFriendTouch('touchStart', identifier, x, y);
        }
    }

    handleTouchMove(identifier, x, y) {
        if (identifier !== this._touchId) return;
        const dx = x - this._touchStartX;
        const dy = y - this._touchStartY;

        if (this._tab === 'friend') {
            // 好友榜：转发给开放数据域
            cloudService.sendFriendTouch('touchMove', identifier, x, y);
            if (!this._isScrolling && (Math.abs(dy) >= 12 || Math.abs(dx) >= 12)) {
                this._isScrolling = true;
            }
            this._touchStartX = x;
            this._touchStartY = y;
            return;
        }

        // 全服榜：本地滚动
        if (!this._isScrolling) {
            if (Math.abs(dy) < 12 && Math.abs(dx) < 12) return;
            this._isScrolling = true;
        }
        const top = this._listTop();
        const bottom = this._listBottom();
        this._scrollY = Math.max(0, Math.min(this._getMaxScroll(top, bottom), this._scrollY - dy));
        this._touchStartX = x;
        this._touchStartY = y;
    }

    handleTouchEnd(identifier) {
        if (identifier === -1 || identifier === this._touchId) {
            this._touchId = null;
            if (this._tab === 'friend') {
                cloudService.sendFriendTouch('touchEnd', identifier);
            }
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

        // Tab 切换
        if (this._tabAreas) {
            for (const area of this._tabAreas) {
                if (x >= area.x && x <= area.x + area.w &&
                    y >= area.y && y <= area.y + area.h) {
                    if (area.tab !== this._tab) {
                        this._tab = area.tab;
                        this._scrollY = 0;
                        this._initUI();
                        this._loadRankData();
                    }
                    return;
                }
            }
        }
        // 模式切换（经典/限时/马拉松）
        if (this._modeAreas) {
            for (const area of this._modeAreas) {
                if (x >= area.x && x <= area.x + area.w &&
                    y >= area.y && y <= area.y + area.h) {
                    if (area.mode !== this._mode) {
                        this._mode = area.mode;
                        this._scrollY = 0;
                        this._loadRankData();
                    }
                    return;
                }
            }
        }

        // 周期切换（仅全服榜）
        if (this._tab === 'global' && this._periodAreas) {
            for (const area of this._periodAreas) {
                if (x >= area.x && x <= area.x + area.w &&
                    y >= area.y && y <= area.y + area.h) {
                    if (area.period !== this._period) {
                        this._period = area.period;
                        this._scrollY = 0;
                        this._loadRankData();
                    }
                    return;
                }
            }
        }

        // 全服榜行内回放 / 挑战
        if (this._tab === 'global') {
            if (this._challengeBtns && this._challengeBtns.length > 0) {
                for (const cb of this._challengeBtns) {
                    if (x >= cb.x && x <= cb.x + cb.w &&
                        y >= cb.y && y <= cb.y + cb.h) {
                        this._startTargetChallenge(cb.score, cb.nickname, cb.avatarUrl, cb.openid);
                        return;
                    }
                }
            }
            if (this._replayBtns.length > 0) {
                for (const rb of this._replayBtns) {
                    if (x >= rb.x && x <= rb.x + rb.w &&
                        y >= rb.y && y <= rb.y + rb.h) {
                        this._openReplay(rb.replayId);
                        return;
                    }
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

module.exports = RankScene;
