/** 徽章相关进度的轻量失效通知；避免页面轮询本地存储。 */
let revision = 0;
const listeners = [];

function invalidate(domain) {
    revision += 1;
    const event = { revision, domain: domain || 'all' };
    listeners.slice().forEach((listener) => {
        try { listener(event); } catch (e) { /* 单个监听器异常不影响进度写入 */ }
    });
    try {
        if (typeof GameGlobal !== 'undefined' && GameGlobal.game
            && typeof GameGlobal.game.kickLoop === 'function') {
            GameGlobal.game.kickLoop();
        }
    } catch (e) { /* ignore */ }
    return revision;
}

function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
    };
}

function getRevision() {
    return revision;
}

module.exports = { invalidate, subscribe, getRevision };
