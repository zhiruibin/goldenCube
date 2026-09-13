/**
 * 核心云存档：启动恢复、变化防抖上传、切后台立即上传。
 * 回放和排行缓存体积较大/可重建，不进入通用存档。
 */
const META_REVISION = 'gc_cloud_save_revision_v1';
const EXCLUDED_PREFIXES = [
    'gc_replay_',
    'gc_rank_cache_',
    'gc_workshop_plazaCache',
    'gc_friend_kv_floor',
    'gc_cloud_save_',
];
const MAX_SNAPSHOT_CHARS = 700000;

let service = null;
let revision = 0;
let ready = false;
let syncing = null;
let lastSerialized = '';
let timer = null;

function isManagedKey(key) {
    if (typeof key !== 'string' || key.indexOf('gc_') !== 0) return false;
    return !EXCLUDED_PREFIXES.some((prefix) => key.indexOf(prefix) === 0);
}

function storageKeys() {
    try {
        const info = wx.getStorageInfoSync();
        return info && Array.isArray(info.keys) ? info.keys : [];
    } catch (e) { return []; }
}

function capture() {
    const snapshot = {};
    storageKeys().filter(isManagedKey).sort().forEach((key) => {
        try {
            const value = wx.getStorageSync(key);
            if (value !== '' && value != null) snapshot[key] = value;
        } catch (e) { /* ignore one key */ }
    });
    let serialized = JSON.stringify(snapshot);
    if (serialized.length > MAX_SNAPSHOT_CHARS) {
        delete snapshot.gc_endless_run_v1;
        delete snapshot.gc_pending_challenges;
        delete snapshot.gc_challenge_match_results;
        serialized = JSON.stringify(snapshot);
    }
    return { snapshot, serialized };
}

function applySnapshot(snapshot) {
    const src = snapshot && typeof snapshot === 'object' ? snapshot : {};
    storageKeys().filter(isManagedKey).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(src, key)) {
            try { wx.removeStorageSync(key); } catch (e) { /* ignore */ }
        }
    });
    Object.keys(src).filter(isManagedKey).forEach((key) => {
        try { wx.setStorageSync(key, src[key]); } catch (e) { /* ignore */ }
    });
}

function call(action, data) {
    if (!service || !service.isAvailable()) return Promise.resolve({ success: false, offline: true });
    return wx.cloud.callFunction({ name: 'rank', data: { action, data: data || {} } })
        .then((res) => (res && res.result) || { success: false });
}

function startTimer() {
    if (timer) return;
    timer = setInterval(() => { flush().catch(() => {}); }, 5000);
}

function init(cloudService) {
    service = cloudService;
    if (!service || !service.isAvailable()) return Promise.resolve({ success: false, offline: true });
    return call('pullPlayerSave').then((remote) => {
        if (!remote || !remote.success) return remote;
        const localRevision = Number(wx.getStorageSync(META_REVISION)) || 0;
        let shouldPushLocal = false;
        if (remote.exists && (!localRevision || remote.revision > localRevision)) {
            applySnapshot(remote.snapshot || {});
            revision = Number(remote.revision) || 0;
            wx.setStorageSync(META_REVISION, revision);
        } else {
            // 同一 revision 下本地可能有尚未上传的新变化；以云端 revision 为下次 CAS 基线补传。
            revision = remote.exists ? (Number(remote.revision) || 0) : 0;
            shouldPushLocal = true;
        }
        ready = true;
        lastSerialized = remote.exists ? JSON.stringify(remote.snapshot || {}) : '';
        startTimer();
        return shouldPushLocal ? flush(true) : remote;
    });
}

function flush(force) {
    if (!ready || !service || !service.isAvailable()) return Promise.resolve({ success: false, skipped: true });
    if (syncing) return syncing;
    const state = capture();
    if (!force && state.serialized === lastSerialized) return Promise.resolve({ success: true, skipped: true });
    syncing = call('pushPlayerSave', { snapshot: state.snapshot, baseRevision: revision }).then((res) => {
        if (res && res.success) {
            revision = Number(res.revision) || revision;
            wx.setStorageSync(META_REVISION, revision);
            lastSerialized = state.serialized;
        } else if (res && res.conflict) {
            applySnapshot(res.snapshot || {});
            revision = Number(res.revision) || 0;
            wx.setStorageSync(META_REVISION, revision);
            lastSerialized = JSON.stringify(res.snapshot || {});
        }
        return res;
    }).finally(() => { syncing = null; });
    return syncing;
}

module.exports = { init, flush, capture, applySnapshot, isManagedKey };
