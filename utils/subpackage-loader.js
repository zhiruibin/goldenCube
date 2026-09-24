/** 微信小游戏分包加载：按场景下载资源包，并提供统一加载遮罩。 */

const PACKAGE_BY_SCENE = {
    worldMap: 'stage-assets',
    stageSelect: 'stage-assets',
    stageResult: 'stage-assets',
    stageFail: 'stage-assets',
    achievement: 'collection-assets',
    themeEvent: 'theme-event-assets',
    themeEventResult: 'theme-event-assets',
    themeBadgeAward: 'theme-event-assets',
};

const PACKAGE_LABELS = {
    'stage-assets': '正在加载闯关地图',
    'collection-assets': '正在打开徽章图鉴',
    'theme-event-assets': '正在加载专题资源',
};

const loaded = Object.create(null);
const pending = Object.create(null);
let state = null;

function packageForScene(sceneName) {
    return PACKAGE_BY_SCENE[sceneName] || '';
}

function isLoaded(name) {
    return !name || !!loaded[name];
}

function isSceneReady(sceneName) {
    if (typeof wx === 'undefined' || typeof wx.loadSubpackage !== 'function') return true;
    return isLoaded(packageForScene(sceneName));
}

function isBusy() {
    return !!state;
}

function getState() {
    return state ? Object.assign({}, state) : null;
}

function _kickLoop() {
    try {
        if (GameGlobal.game && typeof GameGlobal.game.kickLoop === 'function') {
            GameGlobal.game._forceRender = true;
            GameGlobal.game.kickLoop();
        }
    } catch (e) { /* ignore */ }
}

function load(name) {
    if (!name || loaded[name]) return Promise.resolve({ name, cached: true });
    if (pending[name]) return pending[name];

    // Node 测试、旧基础库或非微信环境：资源位于本地文件系统，直接按已加载处理。
    if (typeof wx === 'undefined' || typeof wx.loadSubpackage !== 'function') {
        loaded[name] = true;
        return Promise.resolve({ name, fallback: true });
    }

    state = { name, label: PACKAGE_LABELS[name] || '正在加载资源', progress: 0 };
    try { if (GameGlobal.game) GameGlobal.game._subpackageLoading = true; } catch (e) { /* ignore */ }
    _kickLoop();

    pending[name] = new Promise((resolve, reject) => {
        let task;
        try {
            task = wx.loadSubpackage({
                name,
                success(res) {
                    loaded[name] = true;
                    delete pending[name];
                    state = null;
                    try { if (GameGlobal.game) GameGlobal.game._subpackageLoading = false; } catch (e) { /* ignore */ }
                    _kickLoop();
                    resolve(res || { name });
                },
                fail(err) {
                    delete pending[name];
                    state = null;
                    try { if (GameGlobal.game) GameGlobal.game._subpackageLoading = false; } catch (e) { /* ignore */ }
                    _kickLoop();
                    reject(err || new Error('分包加载失败：' + name));
                },
            });
        } catch (e) {
            delete pending[name];
            state = null;
            try { if (GameGlobal.game) GameGlobal.game._subpackageLoading = false; } catch (err) { /* ignore */ }
            reject(e);
            return;
        }
        if (task && typeof task.onProgressUpdate === 'function') {
            task.onProgressUpdate((res) => {
                if (!state || state.name !== name) return;
                state.progress = Math.max(0, Math.min(100, Number(res && res.progress) || 0));
                _kickLoop();
            });
        }
    });
    return pending[name];
}

function loadForScene(sceneName) {
    const name = packageForScene(sceneName);
    return name ? load(name) : Promise.resolve({ sceneName, mainPackage: true });
}

function renderOverlay(ctx, width, height) {
    if (!state || !ctx) return;
    const W = width || 375;
    const H = height || 667;
    const panelW = Math.min(286, W - 42);
    const panelH = 112;
    const x = (W - panelW) / 2;
    const y = (H - panelH) / 2;
    const progress = Math.max(0, Math.min(100, state.progress || 0));

    ctx.save();
    ctx.fillStyle = 'rgba(8,5,3,.70)';
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, panelW, panelH, 14);
    else ctx.rect(x, y, panelW, panelH);
    ctx.fillStyle = 'rgba(48,30,15,.98)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(229,167,64,.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f3ddb2';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.label, W / 2, y + 34);

    const barX = x + 25;
    const barY = y + 67;
    const barW = panelW - 50;
    const barH = 9;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(barX, barY, barW, barH);
    const fillW = Math.max(progress > 0 ? 3 : 0, barW * progress / 100);
    const gradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    gradient.addColorStop(0, '#d88b24');
    gradient.addColorStop(1, '#ffd66b');
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, fillW, barH);

    ctx.fillStyle = 'rgba(239,220,186,.68)';
    ctx.font = '12px sans-serif';
    // 微信回调在部分机型会给出长小数；整数百分比更稳定、也更容易扫读。
    ctx.fillText(progress > 0 ? (Math.round(progress) + '%') : '准备资源…', W / 2, y + 91);
    ctx.restore();
}

module.exports = {
    PACKAGE_BY_SCENE,
    packageForScene,
    isLoaded,
    isSceneReady,
    load,
    loadForScene,
    isBusy,
    getState,
    renderOverlay,
};
