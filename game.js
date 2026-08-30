/*** 挖个方块 - 微信小游戏入口
 * 职责：初始化 Canvas、启动主循环、管理全局生命周期
 */

const { SceneManager } = require('./js/runtime/scene-manager');
const { InputManager } = require('./js/runtime/input-manager');
const { adManager } = require('./utils/ad-manager');
const AudioManager = require('./utils/audio-manager');

/*** 全局共享对象，挂载到 wx 全局以便各模块访问
 */
GameGlobal.game = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,
    sceneManager: null,
    inputManager: null,
    /** 系统信息（含安全区） */
    systemInfo: null,
    /** 音频管理器（音效 + 背景音乐） */
    audioManager: null,
    /** 帧间隔（秒） */
    deltaTime: 0,
    /** 上一帧时间戳 */
    _lastTime: 0,
    /** 主循环 requestAnimationFrame ID */
    _rafId: null,
};

/*** 小游戏入口函数
 */
function onStart() {
    // 获取主 Canvas
    const canvas = wx.createCanvas();
    const ctx = canvas.getContext('2d');
    const info = wx.getSystemInfoSync();
    const dpr = info.pixelRatio;

    // 设置 Canvas 物理尺寸（适配高清屏）
    // 窗口尺寸 windowWidth/windowHeight 在显示状态栏时会排除顶部区域，改用整块屏幕尺寸（screen* 优先，回退 window*）
    const fullW = info.screenWidth || info.windowWidth;
    const fullH = info.screenHeight || info.windowHeight;
    canvas.width = fullW * dpr;
    canvas.height = fullH * dpr;
    ctx.scale(dpr, dpr);
    // 记录逻辑尺寸
    GameGlobal.game.canvas = canvas;
    GameGlobal.game.ctx = ctx;
    GameGlobal.game.width = fullW;
    GameGlobal.game.height = fullH;
    GameGlobal.game.systemInfo = info;
    GameGlobal.game.systemInfo = info;

    // 全屏沉浸：隐藏「回到首页」圆形胶囊按钮（基础库 2.16+），并把「···」菜单胶囊设为白色融入深色背景
    try {
        if (typeof wx.hideHomeButton === 'function') {
            wx.hideHomeButton();
        }
        if (typeof wx.setMenuStyle === 'function') {
            wx.setMenuStyle({ style: 'white' });
        }
    } catch (e) { /* 低版本/模拟器忽略 */ }

    // 窗口尺寸变化时保持画布满屏（模拟器切换机型 / 真机环境变化）
    // 画布覆盖整屏后，右上角「···」菜单胶囊悬浮在背景之上，背景自然包住胶囊
    try {
        if (typeof wx.onWindowResize === 'function') {
            wx.onWindowResize(function (res) {
                const size = res && res.size;
                const w = size && (size.screenWidth || size.windowWidth);
                const h = size && (size.screenHeight || size.windowHeight);
                if (!w || !h) return;
                const sys = GameGlobal.game.systemInfo || {};
                const newDpr = Number(sys.pixelRatio) || GameGlobal.game.dpr || 1;
                canvas.width = Math.round(w * newDpr);
                canvas.height = Math.round(h * newDpr);
                if (typeof ctx.setTransform === 'function') {
                    ctx.setTransform(newDpr, 0, 0, newDpr, 0, 0);
                } else {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.scale(newDpr, newDpr);
                }
                GameGlobal.game.width = w;
                GameGlobal.game.height = h;
                GameGlobal.game.dpr = newDpr;
            });
        }
    } catch (e) { /* 忽略 */ }


    // 初始化运行时
    GameGlobal.game.sceneManager = new SceneManager();
    GameGlobal.game.inputManager = new InputManager(canvas);
    // 全局音频管理器（延迟到首次用户交互时 init，满足自动播放策略）
    GameGlobal.game.audioManager = new AudioManager();

    // 隐私：尽早注册 onNeedPrivacyAuthorization（自定义弹窗 + resolve agree）
    try {
        const { initPrivacy } = require('./utils/privacy');
        initPrivacy();
    } catch (e) {
        console.warn('[Game] 隐私模块初始化失败', e);
    }

    // 云服务初始化（隐私/头像昵称在成绩同步、发起挑战等动作内就地请求，需用户手势）
    try {
        const { cloudService } = require('./utils/cloud-service');
        cloudService.init();
    } catch (e) {
        console.warn('[Game] 云服务初始化失败（降级本地模式）', e);
    }

    // 注册场景
    const HomeScene = require('./js/scenes/home-scene');
    const GameScene = require('./js/scenes/game-scene');
    const ResultScene = require('./js/scenes/result-scene');
    const RankScene = require('./js/scenes/rank-scene');
    const ShopScene = require('./js/scenes/shop-scene');
    const SettingsScene = require('./js/scenes/settings-scene');
    const AchievementScene = require('./js/scenes/achievement-scene');
    const ChallengeScene = require('./js/scenes/challenge-scene');
    const ReplayScene = require('./js/scenes/replay-scene');
    const StageSelectScene = require('./js/scenes/stage-select-scene');
    const StageResultScene = require('./js/scenes/stage-result-scene');
    const StageFailScene = require('./js/scenes/stage-fail-scene');
    const WorkshopScene = require('./js/scenes/workshop-scene');
    const PlazaScene = require('./js/scenes/plaza-scene');
    const WorkshopEditorScene = require('./js/scenes/workshop-editor-scene');
    const WorkshopResultScene = require('./js/scenes/workshop-result-scene');
    GameGlobal.game.sceneManager.register('home', HomeScene);
    GameGlobal.game.sceneManager.register('game', GameScene);
    GameGlobal.game.sceneManager.register('result', ResultScene);
    GameGlobal.game.sceneManager.register('rank', RankScene);
    GameGlobal.game.sceneManager.register('shop', ShopScene);
    GameGlobal.game.sceneManager.register('settings', SettingsScene);
    GameGlobal.game.sceneManager.register('achievement', AchievementScene);
    GameGlobal.game.sceneManager.register('challenge', ChallengeScene);
    GameGlobal.game.sceneManager.register('replay', ReplayScene);
    GameGlobal.game.sceneManager.register('stageSelect', StageSelectScene);
    GameGlobal.game.sceneManager.register('stageResult', StageResultScene);
    GameGlobal.game.sceneManager.register('stageFail', StageFailScene);
    GameGlobal.game.sceneManager.register('workshop', WorkshopScene);
    GameGlobal.game.sceneManager.register('plaza', PlazaScene);
    GameGlobal.game.sceneManager.register('workshopEditor', WorkshopEditorScene);
    GameGlobal.game.sceneManager.register('workshopResult', WorkshopResultScene);

    // 预加载结算页方块插画
    try {
        const { preloadResultBlockImages } = require('./js/render/result-block-image');
        preloadResultBlockImages();
    } catch (e) { /* ignore */ }
    // 冷启动：进入首页 Hub（闯关/排行/成就/商店/设置入口）；若带挑战分享卡再按身份分流
    let launchQuery = null;
    try {
        const _launch = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
        if (_launch && _launch.query && _launch.query.challengeId) {
            launchQuery = _launch.query;
        }
    } catch (e) {
        console.warn('[Game] 读取启动参数失败', e);
    }
    GameGlobal.game.sceneManager.switchTo('home');
    if (launchQuery) {
        _handleShareChallengeEntry(launchQuery, { fromLaunch: true });
    }

    // 启动主循环

    // 启动主循环
    GameGlobal.game._lastTime = Date.now();
    _loop();

    console.log('[Game] 挖个方块启动完成', {
        width: info.windowWidth,
        height: info.windowHeight,
        dpr: dpr,
    });
}

/*** 主循环
 */
function _loop() {
    const now = Date.now();
    GameGlobal.game.deltaTime = (now - GameGlobal.game._lastTime) / 1000;
    GameGlobal.game._lastTime = now;

    // 限制最大帧间隔，防止切后台回来后一次性跳太多
    if (GameGlobal.game.deltaTime > 0.1) {
        GameGlobal.game.deltaTime = 0.016;
    }

    const sm = GameGlobal.game.sceneManager;
    if (sm) {
        sm.update(GameGlobal.game.deltaTime);
        sm.render(GameGlobal.game.ctx);
    }

    GameGlobal.game._rafId = requestAnimationFrame(_loop);
}

/*** 登记来自分享卡的待应战挑战（仅被挑战方调用，按 challengeId 去重）
 * @returns {{ registered: boolean, isNew: boolean, challengeId: string }}
 */
function _registerIncomingChallenge(query, challengeHint) {
    if (!query || !query.challengeId) {
        return { registered: false, isNew: false, challengeId: '' };
    }
    const challengeId = String(query.challengeId);
    try {
        const ChallengeScene = require('./js/scenes/challenge-scene');
        const pendingKey = ChallengeScene.PENDING_CHALLENGES_KEY;
        const stored = wx.getStorageSync(pendingKey);
        const pending = Array.isArray(stored) ? stored : [];
        for (let i = 0; i < pending.length; i++) {
            if (pending[i].challengeId === challengeId) {
                // 用云端详情补全本地记录（昵称头像等）
                if (challengeHint) {
                    const challengeUi = require('./utils/challenge-ui');
                    challengeUi.mergePendingFromCloud(pending[i], challengeHint);
                    wx.setStorageSync(pendingKey, pending);
                }
                return { registered: true, isNew: false, challengeId: challengeId };
            }
        }
        const scoreFromQuery = parseInt(query.score, 10);
        const scoreFromHint = challengeHint && typeof challengeHint.challengerScore === 'number'
            ? challengeHint.challengerScore
            : null;
        pending.push({
            challengeId: challengeId,
            mode: (challengeHint && challengeHint.mode) || query.mode || 'stage',
            challengerScore: scoreFromHint != null ? scoreFromHint : (isNaN(scoreFromQuery) ? null : scoreFromQuery),
            challengerLines: (challengeHint && typeof challengeHint.challengerLines === 'number')
                ? challengeHint.challengerLines
                : ((((challengeHint && challengeHint.mode) || query.mode) === 'workshop'
                    || ((challengeHint && challengeHint.mode) || query.mode) === 'stage')
                    && !isNaN(scoreFromQuery)
                    ? scoreFromQuery
                    : null),
            workshopStageId: (challengeHint && challengeHint.workshopStageId) || '',
            workshopTitle: (challengeHint && challengeHint.workshopTitle) || '',
            layoutSnapshot: (challengeHint && challengeHint.layoutSnapshot) || null,
            challengerName: (challengeHint && challengeHint.challengerName) || '',
            challengerAvatar: (challengeHint && challengeHint.challengerAvatar) || '',
            createdAt: Date.now(),
        });
        if (pending.length > 20) {
            pending.splice(0, pending.length - 20);
        }
        wx.setStorageSync(pendingKey, pending);
        return { registered: true, isNew: true, challengeId: challengeId };
    } catch (e) {
        console.warn('[Game] 登记挑战失败', e);
        return { registered: false, isNew: false, challengeId: challengeId };
    }
}

/** 避免冷启动 + onShow 对同一挑战重复弹窗 */
let _shareEntryInflightId = '';
let _shareEntryHandledAt = 0;

/**
 * 分享卡进入分流：
 * - 发起方：仅打开游戏（首页），不写待应战、不弹应战窗
 * - 被挑战方：落首页后弹「是否应战」；确认开局，取消留首页并进待应战
 * - 对局中：不打断，仅 toast
 */
function _handleShareChallengeEntry(query, opts) {
    if (!query || !query.challengeId) return;
    const challengeId = String(query.challengeId);
    const now = Date.now();
    // 冷启动后 onShow 常带同一 query，短窗内去重
    if (_shareEntryInflightId === challengeId) return;
    if (now - _shareEntryHandledAt < 2500 && GameGlobal._lastShareChallengeId === challengeId) {
        return;
    }
    _shareEntryInflightId = challengeId;
    GameGlobal._lastShareChallengeId = challengeId;

    const sm = GameGlobal.game && GameGlobal.game.sceneManager;
    const inGame = !!(sm && sm.currentName === 'game');
    const finish = () => {
        _shareEntryInflightId = '';
        _shareEntryHandledAt = Date.now();
    };

    // 非对局中：先落首页，保证返回有落点
    if (!inGame && sm && sm.currentName !== 'home') {
        sm.replace('home');
    }

    let cloudService = null;
    try {
        ({ cloudService } = require('./utils/cloud-service'));
    } catch (e) {
        cloudService = null;
    }

    const afterRole = (role, challenge) => {
        const ChallengeScene = require('./js/scenes/challenge-scene');

        if (role === 'challenger') {
            try {
                ChallengeScene.removePendingChallenge(challengeId);
            } catch (e) { /* ignore */ }
            if (!inGame) {
                try {
                    wx.showToast({ title: '这是你发起的挑战', icon: 'none' });
                } catch (e) { /* ignore */ }
            }
            finish();
            return;
        }

        const expired = !!(challenge && challenge.expiresAt && Number(challenge.expiresAt) < Date.now());
        const notPending = !!(challenge && challenge.status && challenge.status !== 'pending');
        if (role === 'responder' || notPending || expired) {
            try {
                ChallengeScene.removePendingChallenge(challengeId);
            } catch (e) { /* ignore */ }
            try {
                wx.showToast({
                    title: expired ? '挑战已过期'
                        : ((challenge && challenge.status === 'completed') ? '该挑战已结束' : '挑战不可应战'),
                    icon: 'none',
                });
            } catch (e) { /* ignore */ }
            finish();
            return;
        }

        // invitee：登记待应战，并认领 targetOpenid（对方授权后才能同步头像昵称）
        const reg = _registerIncomingChallenge(query, challenge);
        _claimChallengeInvite(challengeId, challenge);
        if (inGame) {
            try {
                wx.showToast({ title: '已收到好友挑战', icon: 'none' });
            } catch (e) { /* ignore */ }
            finish();
            return;
        }

        _refreshHomePendingBadge();
        _promptAcceptChallenge(query, challenge, reg);
        finish();
    };

    const cloudOk = cloudService && typeof cloudService.isAvailable === 'function' && cloudService.isAvailable();
    if (cloudOk && typeof cloudService.getChallengeById === 'function') {
        cloudService.getChallengeById(challengeId).then((res) => {
            const challenge = res && res.challenge;
            if (res && res.success && challenge) {
                const role = challenge.myRole || 'invitee';
                afterRole(role, challenge);
            } else {
                afterRole('invitee', null);
            }
        }).catch(() => {
            afterRole('invitee', null);
        });
    } else {
        afterRole('invitee', null);
    }
}

function _refreshHomePendingBadge() {
    const sm = GameGlobal.game && GameGlobal.game.sceneManager;
    if (sm && sm.currentName === 'home' && sm.current && typeof sm.current._initUI === 'function') {
        try {
            sm.current._initUI();
        } catch (e) { /* ignore */ }
    }
}

/** 被挑战方打开分享卡：绑定 targetOpenid，便于授权后 syncMyProfile 回写 */
function _claimChallengeInvite(challengeId, challengeHint) {
    if (!challengeId) return;
    let cloudService = null;
    try {
        ({ cloudService } = require('./utils/cloud-service'));
    } catch (e) {
        return;
    }
    if (!cloudService || !cloudService.isAvailable() || typeof cloudService.claimChallengeInvite !== 'function') {
        return;
    }
    let profile = null;
    try {
        profile = require('./utils/user-profile').getCachedProfile();
    } catch (e) {
        profile = null;
    }
    cloudService.claimChallengeInvite(challengeId, profile || {}).then((res) => {
        if (res && res.success && res.challenge) {
            try {
                const ChallengeScene = require('./js/scenes/challenge-scene');
                const pendingKey = ChallengeScene.PENDING_CHALLENGES_KEY;
                const stored = wx.getStorageSync(pendingKey);
                const pending = Array.isArray(stored) ? stored : [];
                const challengeUi = require('./utils/challenge-ui');
                for (let i = 0; i < pending.length; i++) {
                    if (pending[i] && pending[i].challengeId === challengeId) {
                        challengeUi.mergePendingFromCloud(pending[i], res.challenge);
                        wx.setStorageSync(pendingKey, pending);
                        break;
                    }
                }
            } catch (e) { /* ignore */ }
            // 已有微信资料则立刻回写一次（覆盖认领时的默认名）
            if (profile && profile.nickname && cloudService.syncMyChallengeProfile) {
                cloudService.syncMyChallengeProfile(profile).catch(() => {});
            }
        }
    }).catch(() => {});
}

function _promptAcceptChallenge(query, challenge, reg) {
    const challengeId = (reg && reg.challengeId) || (query && query.challengeId);
    if (!challengeId) return;

    const ChallengeScene = require('./js/scenes/challenge-scene');
    const challengeUi = require('./utils/challenge-ui');
    const mode = (challenge && challenge.mode) || (query && query.mode) || 'stage';
    let modeName = mode;
    try {
        const { MODE_NAMES } = require('./utils/cloud-config');
        modeName = (challenge && challenge.workshopTitle)
            || (MODE_NAMES && MODE_NAMES[mode])
            || mode
            || '挑战';
    } catch (e) { /* ignore */ }

    const hint = challenge || { mode: mode };
    const isPuzzle = challengeUi.isPuzzleChallenge(hint)
        || mode === 'workshop'
        || mode === 'stage';

    let score = '--';
    let scoreUnit = '分';
    if (isPuzzle) {
        scoreUnit = '行';
        if (challenge && typeof challenge.challengerLines === 'number') {
            score = challenge.challengerLines;
        } else if (query && query.score != null) {
            const n = parseInt(query.score, 10);
            if (!isNaN(n)) score = n;
        }
    } else if (challenge && typeof challenge.challengerScore === 'number') {
        score = challenge.challengerScore;
    } else if (query && query.score != null) {
        const n = parseInt(query.score, 10);
        if (!isNaN(n)) score = n;
    }

    const challengerName = (challenge && challenge.challengerName) || '';
    const title = challengerName ? (challengerName + ' 向你发起挑战') : '好友挑战';
    const content = isPuzzle
        ? '「' + modeName + '」对方 ' + score + ' ' + scoreUnit + '，是否立即应战？'
        : '「' + modeName + '」目标 ' + score + ' ' + scoreUnit + '，是否立即应战？';

    try {
        wx.showModal({
            title: title,
            content: content,
            confirmText: '立即应战',
            cancelText: '稍后',
            success(res) {
                if (res && res.confirm) {
                    const sm = GameGlobal.game && GameGlobal.game.sceneManager;
                    if (!sm) return;
                    const rec = {
                        challengeId: challengeId,
                        mode: mode,
                        layoutSnapshot: challenge && challenge.layoutSnapshot,
                        workshopStageId: challenge && challenge.workshopStageId,
                        workshopTitle: challenge && challenge.workshopTitle,
                        challengerLines: challenge && challenge.challengerLines,
                        challengerScore: challenge && challenge.challengerScore,
                        createdAt: (challenge && challenge.createdAt) || Date.now(),
                    };
                    if (isPuzzle && ChallengeScene.startPuzzleRespondGame) {
                        if (ChallengeScene.startPuzzleRespondGame(rec, challenge)) {
                            return;
                        }
                        // 无布局时进挑战页应战
                        GameGlobal.game.sceneManager.switchTo('challenge', { tab: 'incoming' });
                        return;
                    }
                    GameGlobal.game.sceneManager.switchTo('game', {
                        mode: mode,
                        challengeId: challengeId,
                        targetScore: typeof score === 'number' ? score : (parseInt(score, 10) || null),
                    });
                } else {
                    try {
                        wx.showToast({ title: '已加入「待我应战」', icon: 'none' });
                    } catch (e) { /* ignore */ }
                    _refreshHomePendingBadge();
                }
            },
        });
    } catch (e) {
        try {
            wx.showToast({ title: '已加入「待我应战」', icon: 'none' });
        } catch (err) { /* ignore */ }
    }
}

/*** 将窗口空间触摸坐标换算为画布逻辑坐标
 * 画布按整屏（screenWidth/screenHeight）布局，而 clientX/clientY 按窗口空间给出；
 * 状态栏可见时 window* 会小于 screen*，需补齐偏移。全屏时偏移为 0，行为不变。
 */
function _toCanvasXY(clientX, clientY) {
    const sys = (GameGlobal.game && GameGlobal.game.systemInfo) || {};
    const screenW = Number(sys.screenWidth);
    const windowW = Number(sys.windowWidth);
    const screenH = Number(sys.screenHeight);
    const windowH = Number(sys.windowHeight);
    const offX = Math.max(0, screenW - windowW);
    const offY = Math.max(0, screenH - windowH);
    return {
        x: Number(clientX) + offX,
        y: Number(clientY) + offY,
    };
}

/** touchStart 时的场景名；touchEnd 若场景已变则丢弃 tap，防止切场景穿透 */
const _touchStartScenes = Object.create(null);

function _clearTouchStartScene(touchId) {
    if (touchId != null) {
        delete _touchStartScenes[touchId];
    }
}

// 监听小游戏生命周期
wx.onTouchStart(function (e) {
    // 首次用户交互时初始化音频并启动 BGM（满足自动播放策略）
    const audio = GameGlobal.game.audioManager;
    if (audio) {
        if (!audio.isInitialized()) {
            audio.init();
        }
        try {
            const sfx = wx.getStorageSync('gc_setting_sfx') !== false;
            const bgm = wx.getStorageSync('gc_setting_bgm') !== false;
            if (typeof audio.applyUserSettings === 'function') {
                audio.applyUserSettings({ sfx, bgm });
            } else if (bgm && !audio.isBgmPlaying()) {
                audio.playBGM();
            }
        } catch (err) {
            if (wx.getStorageSync('gc_setting_bgm') !== false && !audio.isBgmPlaying()) {
                audio.playBGM();
            }
        }
    }

    if (GameGlobal.game.inputManager) {
        GameGlobal.game.inputManager.handleTouchStart(e);
    }

    // 路由所有触点到当前场景（多触点独立分发）
    const sm = GameGlobal.game.sceneManager;
    if (sm && sm.current && sm.current.handleTouchStart) {
        const touches = e.touches;
        if (touches) {
            for (let i = 0; i < touches.length; i++) {
                const t = touches[i];
                if (sm.currentName) {
                    _touchStartScenes[t.identifier] = sm.currentName;
                }
                const p = _toCanvasXY(t.clientX, t.clientY);
                sm.current.handleTouchStart(t.identifier, p.x, p.y);
            }
        }
    }
});

wx.onTouchMove(function (e) {
    if (GameGlobal.game.inputManager) {
        GameGlobal.game.inputManager.handleTouchMove(e);
    }

    // 路由所有触点移动到当前场景
    const sm = GameGlobal.game.sceneManager;
    if (sm && sm.current && sm.current.handleTouchMove) {
        const touches = e.touches;
        if (touches) {
            for (let i = 0; i < touches.length; i++) {
                const t = touches[i];
                const p = _toCanvasXY(t.clientX, t.clientY);
                sm.current.handleTouchMove(t.identifier, p.x, p.y);
            }
        }
    }
});

wx.onTouchEnd(function (e) {
    const im = GameGlobal.game.inputManager;
    if (im) {
        im.handleTouchEnd(e);
    }

    const sm = GameGlobal.game.sceneManager;
    if (sm && sm.current) {
        // 释放所有结束的触点
        const changedTouches = e.changedTouches;
        if (changedTouches && sm.current.handleTouchEnd) {
            for (let i = 0; i < changedTouches.length; i++) {
                const t = changedTouches[i];
                sm.current.handleTouchEnd(t.identifier);
            }
        }
        // 如果没有 handleTouchStart 被调用过（非 DPad 区域），走 tap 逻辑
        if (changedTouches && changedTouches.length > 0 && sm.current.handleTap) {
            const t = changedTouches[0];
            const p = _toCanvasXY(t.clientX, t.clientY);
            const x = p.x;
            const y = p.y;
            const touchStartScene = _touchStartScenes[t.identifier];
            _clearTouchStartScene(t.identifier);
            // 按下与抬起之间若已切场景，不把同一笔 tap 交给新场景（防摇奖/弹窗穿透）
            if (touchStartScene && sm.currentName !== touchStartScene) {
                return;
            }
            // 隐私弹窗：指引链接须可点并 openPrivacyContract（审核要求）
            try {
                const {
                    isPrivacyDialogVisible,
                    handlePrivacyDialogTap,
                } = require('./utils/privacy');
                if (isPrivacyDialogVisible()) {
                    handlePrivacyDialogTap(x, y);
                    return;
                }
            } catch (e) { /* ignore */ }
            // 资料授权弹窗：暂不授权走 canvas；去授权由原生 UserInfoButton 承接
            try {
                const {
                    isProfileAuthDialogVisible,
                    hitTestProfileAuthSkip,
                    skipProfileAuthDialog,
                } = require('./utils/user-profile');
                if (isProfileAuthDialogVisible()) {
                    if (hitTestProfileAuthSkip(x, y)) {
                        skipProfileAuthDialog();
                    }
                    return;
                }
            } catch (e) { /* ignore */ }
            sm.current.handleTap(x, y);
        }
    }
});

wx.onTouchCancel(function (e) {
    if (GameGlobal.game.inputManager) {
        GameGlobal.game.inputManager.handleTouchCancel(e);
    }

    const changedTouches = e.changedTouches;
    if (changedTouches) {
        for (let i = 0; i < changedTouches.length; i++) {
            _clearTouchStartScene(changedTouches[i].identifier);
        }
    }

    // 释放所有取消的触点
    const sm = GameGlobal.game.sceneManager;
    if (sm && sm.current && sm.current.handleTouchEnd) {
        const changedTouches = e.changedTouches;
        if (changedTouches) {
            for (let i = 0; i < changedTouches.length; i++) {
                const t = changedTouches[i];
                sm.current.handleTouchEnd(t.identifier);
            }
        } else {
            sm.current.handleTouchEnd(-1);
        }
    }
});

/*** 小游戏隐藏时暂停
 */
wx.onHide(function () {
    if (GameGlobal.game._rafId) {
        cancelAnimationFrame(GameGlobal.game._rafId);
        GameGlobal.game._rafId = null;
    }
    const sm = GameGlobal.game.sceneManager;
    if (sm && sm.current) {
        sm.current.onPause && sm.current.onPause();
    }
    // 隐藏 Banner 广告，避免切后台后广告悬浮
    adManager.onAppHide();
    // 暂停背景音乐
    const audio = GameGlobal.game.audioManager;
    if (audio && audio.isInitialized()) {
        audio.pauseBGM();
    }
});

/*** 小游戏恢复时继续
 */
wx.onShow(function (res) {
    if (res && res.query && res.query.challengeId) {
        _handleShareChallengeEntry(res.query, { fromLaunch: false });
    }
    if (!GameGlobal.game._rafId) {
        GameGlobal.game._lastTime = Date.now();
        _loop();
    }
    const sm = GameGlobal.game.sceneManager;
    if (sm && sm.current) {
        sm.current.onResume && sm.current.onResume();
    }
    // 按设置恢复 BGM
    const audio = GameGlobal.game.audioManager;
    if (audio && audio.isInitialized()) {
        try {
            if (wx.getStorageSync('gc_setting_bgm') !== false) {
                audio.resumeBGM();
            }
        } catch (err) { /* 忽略存储异常 */ }
    }
});

onStart();
