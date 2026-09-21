const assert = require('assert');

function freshRouter(initial) {
    const storage = Object.assign({}, initial || {});
    global.wx = {
        getStorageSync(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : ''; },
        setStorageSync(key, value) { storage[key] = value; },
        getStorageInfoSync() { return { keys: Object.keys(storage) }; },
    };
    const routerPath = require.resolve('../utils/first-launch-router');
    const goldenPath = require.resolve('../utils/golden-block-manager');
    delete require.cache[routerPath];
    delete require.cache[goldenPath];
    return { router: require(routerPath), storage };
}

{
    const { router, storage } = freshRouter({ gc_stageClearedIds_v1: [] });
    const route = router.resolveInitialRoute();
    assert.strictEqual(route.name, 'game');
    assert.strictEqual(route.params.stageId, 1);
    assert.strictEqual(storage[router.ROUTED_KEY], true);
}

{
    const { router } = freshRouter({ gc_stageClearedIds_v1: [] });
    const localState = router.captureLocalState();
    router.resolveInitialRoute({ localState });
    assert.strictEqual(router.resolveInitialRoute().name, 'home');
}

{
    const { router } = freshRouter({
        gc_stageClearedIds_v1: [1],
        gc_stageClear_1: { cleared: true },
    });
    const route = router.resolveInitialRoute();
    assert.strictEqual(route.name, 'home');
    assert.strictEqual(route.migrated, true);
}

{
    const { router } = freshRouter({ gc_stageClearedIds_v1: [] });
    assert.strictEqual(router.resolveInitialRoute({ hasChallengeLaunch: true }).name, 'home');
}

// 本机无缓存，但云恢复后出现老账号数据：仍按恢复前快照进入教学关。
{
    const { router, storage } = freshRouter({});
    const beforeCloud = router.captureLocalState();
    storage.gc_loginProgress_v1 = { totalLoginDays: 20 };
    storage.gc_stageClearedIds_v1 = [1, 2, 3];
    assert.strictEqual(router.resolveInitialRoute({ localState: beforeCloud }).name, 'game');
}

console.log('PASS: 首次启动进入第 1 关，后续/老玩家/挑战启动进入首页');
