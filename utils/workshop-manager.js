/**
 * 工坊 / 关卡广场（本地 MVP）
 * 对齐 docs/gc-workshop-plaza-design.md
 * - 创作免费；槽位 3 免费，金递增扩至 10
 * - 广场：金方块或激励视频永久解锁；开打免费；通关不发货币
 */

const goldenBlock = require('./golden-block-manager');
const OFFICIAL_PLAZA = require('../data/plaza-official-v1.js');

const KEYS = {
    stages: 'gc_workshop_stages',
    slotCap: 'gc_workshop_slotCap',
    unlockedPlaza: 'gc_workshop_plazaUnlocked',
    clearedPlaza: 'gc_workshop_plazaCleared', // { [stageId]: { firstAt, date, clearsToday, best? } }
    submitDaily: 'gc_workshop_submitDaily',
    freePlayDaily: 'gc_workshop_freePlayDaily',
    authorShareDaily: 'gc_workshop_authorShareDaily',
    plazaCache: 'gc_workshop_plazaCache', // { [stageId]: stageDoc }
    deletedStages: 'gc_workshop_deletedStages', // 离线删除墓碑，防止云端恢复时复活
};

const FREE_SLOTS = 3;
const MAX_SLOTS = 10;
/** 开通第 N 槽所需金（index = N，3 及以下为 0） */
const SLOT_EXPAND_COST = {
    4: 2,
    5: 3,
    6: 5,
    7: 8,
    8: 12,
    9: 18,
    10: 25,
};

const SUBMIT_DAILY_MAX = 3;
const FREE_PLAY_DAILY = 8;
const WORKSHOP_CLEAR_DAILY = 120;
const AUTHOR_SHARE_DAILY = 80;
const PLAZA_UNLOCK_GOLD = 1;
const CHALLENGE_FEE = 0;

const STATUS = {
    draft: 'draft',
    cleared: 'cleared',
    reviewing: 'reviewing',
    published: 'published',
    rejected: 'rejected',
    delisted: 'delisted',
};

function _today() {
    const d = new Date();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function _uid() {
    return 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function _loadJson(key, fallback) {
    try {
        const v = wx.getStorageSync(key);
        if (v === '' || v == null) return fallback;
        return v;
    } catch (e) {
        return fallback;
    }
}

function _saveJson(key, val) {
    try {
        wx.setStorageSync(key, val);
        return true;
    } catch (e) {
        return false;
    }
}

function _dailyCount(key) {
    const today = _today();
    const rec = _loadJson(key, {}) || {};
    if (rec.date !== today) return 0;
    return Number(rec.count) || 0;
}

function _bumpDaily(key, max) {
    const today = _today();
    const rec = _loadJson(key, {}) || {};
    const count = rec.date === today ? (Number(rec.count) || 0) : 0;
    if (count >= max) return false;
    _saveJson(key, { date: today, count: count + 1 });
    return true;
}

function layoutHash(rows) {
    const keys = Object.keys(rows || {}).map(Number).sort((a, b) => a - b);
    let s = '';
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        s += k + ':' + (rows[String(k)] || rows[k] || '') + '|';
    }
    // 简易稳定 hash
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
}

function emptyRows() {
    const rows = {};
    for (let r = 0; r < 20; r++) rows[String(r)] = '..........';
    return rows;
}

function cloneRows(rows) {
    const out = {};
    const src = rows || {};
    for (let r = 0; r < 20; r++) {
        const line = src[String(r)] || src[r] || '..........';
        out[String(r)] = String(line).slice(0, 10).padEnd(10, '.');
    }
    return out;
}

function analyzeLayout(rows) {
    const r = cloneRows(rows);
    let garbageCount = 0;
    let minLines = 0;
    let topGarbage = 20;
    let fullRow = false;
    for (let y = 0; y < 20; y++) {
        const line = r[String(y)];
        let g = 0;
        let empty = 0;
        for (let x = 0; x < 10; x++) {
            if (line[x] === '#') {
                g++;
                garbageCount++;
            } else empty++;
        }
        if (g > 0) {
            minLines++;
            if (y < topGarbage) topGarbage = y;
            if (empty === 0) fullRow = true;
        }
    }
    return { garbageCount, minLines, topGarbage, fullRow, rows: r };
}

/** 工坊硬约束校验 */
function validateLayout(rows) {
    const a = analyzeLayout(rows);
    if (a.fullRow) return { ok: false, reason: '禁止满行垃圾' };
    if (a.garbageCount < 8 || a.garbageCount > 80) {
        return { ok: false, reason: '垃圾格须在 8～80' };
    }
    if (a.minLines < 3 || a.minLines > 16) {
        return { ok: false, reason: '含垃圾行须在 3～16' };
    }
    if (a.topGarbage < 6) {
        return { ok: false, reason: '顶垃圾行须 ≥ 6（从顶往下数）' };
    }
    // 每垃圾行至少一个 .
    for (let y = 0; y < 20; y++) {
        const line = a.rows[String(y)];
        if (line.indexOf('#') >= 0 && line.indexOf('.') < 0) {
            return { ok: false, reason: '每垃圾行须有空格' };
        }
    }
    return { ok: true, meta: a };
}

function getPlayFee(meta) {
    return 0;
}

function getSlotCap() {
    const n = Number(_loadJson(KEYS.slotCap, FREE_SLOTS)) || FREE_SLOTS;
    return Math.max(FREE_SLOTS, Math.min(MAX_SLOTS, n));
}

function getExpandCost() {
    const next = getSlotCap() + 1;
    if (next > MAX_SLOTS) return null;
    return SLOT_EXPAND_COST[next] || null;
}

function expandSlot() {
    const cost = getExpandCost();
    if (cost == null) return { ok: false, reason: 'max' };
    if (goldenBlock.getBalance() < cost) return { ok: false, reason: 'no-gold', cost };
    if (!goldenBlock.spendBalance(cost)) return { ok: false, reason: 'no-gold', cost };
    const next = getSlotCap() + 1;
    _saveJson(KEYS.slotCap, next);
    try {
        _notifyWorkshopAchievement();
    } catch (e) { /* ignore */ }
    return { ok: true, slotCap: next, cost };
}

function _notifyWorkshopAchievement() {
    try {
        const { achievementManager } = require('./achievement-manager');
        if (achievementManager && typeof achievementManager.reportWorkshopProgress === 'function') {
            achievementManager.reportWorkshopProgress();
        }
    } catch (e) { /* ignore */ }
    try { require('./badge-progress-signal').invalidate('workshop'); } catch (e) { /* ignore */ }
}

/** 工坊内关卡总数（占槽数） */
function getWorkshopCreatedCount() {
    return countOccupiedSlots();
}

/** 作者自通过的关卡数 */
function getWorkshopAuthorClearCount() {
    return listStages().filter((s) => s && s.authorBest && s.authorBest.clearedAt).length;
}

/** 已发布到广场的关卡数 */
function getWorkshopPublishedCount() {
    return listStages().filter((s) => s && s.status === STATUS.published).length;
}

function listStages() {
    const list = _loadJson(KEYS.stages, []);
    return Array.isArray(list) ? list : [];
}

function _saveAll(list) {
    return _saveJson(KEYS.stages, list);
}

function getStage(id) {
    const local = listStages().find((s) => s.stageId === id);
    if (local) return local;
    const official = getOfficialPlazaStages().find((s) => s.stageId === id);
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    if (official) {
        return cache[id] ? _mergeOfficialPlazaStage(official, cache[id]) : official;
    }
    if (cache[id]) return cache[id];
    return null;
}

function cachePlazaStages(stages) {
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    (stages || []).forEach((s) => {
        if (!s || !s.stageId) return;
        if (_isOfficialPlazaStageId(s.stageId)) {
            const base = getOfficialPlazaStages().find((o) => o.stageId === s.stageId);
            cache[s.stageId] = base ? _mergeOfficialPlazaStage(base, s) : s;
        } else {
            cache[s.stageId] = s;
        }
    });
    _saveJson(KEYS.plazaCache, cache);
}

function cachePlazaStage(stage) {
    if (!stage || !stage.stageId) return;
    cachePlazaStages([stage]);
}

function countOccupiedSlots() {
    return listStages().length;
}

function canCreate() {
    return countOccupiedSlots() < getSlotCap();
}

function createStage(title) {
    if (!canCreate()) return { ok: false, reason: 'no-slot' };
    const rows = emptyRows();
    const stage = {
        stageId: _uid(),
        title: (title || '未命名关卡').slice(0, 20),
        status: STATUS.draft,
        rows,
        layoutHash: layoutHash(rows),
        minLines: 0,
        garbageCount: 0,
        coinThreshold: 0,
        dropIntervalMs: 1000,
        authorBest: null,
        stats: {
            playCount: 0,
            clearCount: 0,
            challengeSendCount: 0,
            likeCount: 0,
        },
        heatScore: 0,
        review: null,
        rejectReason: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        publishedAt: 0,
    };
    const list = listStages();
    list.unshift(stage);
    _saveAll(list);
    try {
        _notifyWorkshopAchievement();
    } catch (e) { /* ignore */ }
    return { ok: true, stage };
}

function updateStage(stageId, patch) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx < 0) return { ok: false, reason: 'missing' };
    const cur = list[idx];
    if (cur.status === STATUS.reviewing) {
        return { ok: false, reason: 'reviewing' };
    }
    if (cur.status === STATUS.published) {
        return { ok: false, reason: 'published' };
    }

    const next = Object.assign({}, cur, patch || {}, { updatedAt: Date.now() });

    if (patch && patch.rows) {
        const rows = cloneRows(patch.rows);
        const hash = layoutHash(rows);
        next.rows = rows;
        if (hash !== cur.layoutHash) {
            next.layoutHash = hash;
            next.status = STATUS.draft;
            next.authorBest = null;
            const meta = analyzeLayout(rows);
            next.garbageCount = meta.garbageCount;
            next.minLines = meta.minLines;
            next.coinThreshold = Math.max(meta.minLines * 2, 1);
        }
    }
    if (patch && patch.title != null) {
        next.title = String(patch.title).slice(0, 20);
    }

    list[idx] = next;
    _saveAll(list);
    return { ok: true, stage: next };
}

function deleteStage(stageId) {
    const id = String(stageId || '');
    const list = listStages().filter((s) => s.stageId !== id);
    _saveAll(list);
    const deleted = _loadJson(KEYS.deletedStages, []) || [];
    if (deleted.indexOf(id) < 0) deleted.push(id);
    _saveJson(KEYS.deletedStages, deleted);
    try {
        const save = GameGlobal && GameGlobal.game && GameGlobal.game.cloudSave;
        if (save && typeof save.flush === 'function') save.flush(true).catch(() => {});
    } catch (e) { /* ignore */ }
    let service;
    try { service = require('./cloud-service').cloudService; } catch (e) { service = null; }
    if (!service || !service.isAvailable()) return Promise.resolve({ ok: true, pendingCloud: true });
    return service.deleteWorkshopStage(id).then((res) => {
        if (!res || !res.success) return { ok: true, pendingCloud: true, detail: res && res.errMsg };
        _saveJson(KEYS.deletedStages, deleted.filter((item) => item !== id));
        return { ok: true, pendingCloud: false };
    }).catch(() => ({ ok: true, pendingCloud: true }));
}

function listByStatus(status) {
    if (status === STATUS.cleared) {
        // 已通关子 Tab：含 cleared / rejected / delisted
        return listStages().filter((s) =>
            s.status === STATUS.cleared
            || s.status === STATUS.rejected
            || s.status === STATUS.delisted
        );
    }
    return listStages().filter((s) => s.status === status);
}

function markAuthorCleared(stageId, best) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx < 0) return { ok: false, reason: 'missing' };
    const cur = list[idx];
    const hash = layoutHash(cur.rows);
    if (cur.layoutHash !== hash) {
        cur.layoutHash = hash;
    }
    cur.status = STATUS.cleared;
    cur.authorBest = {
        lines: best.lines || 0,
        pieces: best.pieces || 0,
        timeMs: best.timeMs || 0,
        clearedAt: Date.now(),
        layoutHash: hash,
    };
    const meta = analyzeLayout(cur.rows);
    cur.garbageCount = meta.garbageCount;
    cur.minLines = meta.minLines;
    cur.coinThreshold = Math.max(meta.minLines * 2, 1);
    cur.updatedAt = Date.now();
    list[idx] = cur;
    _saveAll(list);
    _notifyWorkshopAchievement();
    return { ok: true, stage: cur };
}

/**
 * 提交审核：云端机审通过后进入 reviewing，等待管理员审核。
 * @returns {Promise<{ok, stage?, reason?, detail?, offline?}>}
 */
function submitForReview(stageId) {
    const used = _dailyCount(KEYS.submitDaily);
    if (used >= SUBMIT_DAILY_MAX) {
        return Promise.resolve({ ok: false, reason: 'daily-limit' });
    }
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx < 0) return Promise.resolve({ ok: false, reason: 'missing' });
    const cur = list[idx];
    if (cur.status !== STATUS.cleared && cur.status !== STATUS.rejected && cur.status !== STATUS.delisted) {
        return Promise.resolve({ ok: false, reason: 'not-cleared' });
    }
    if (!cur.authorBest || cur.authorBest.layoutHash !== layoutHash(cur.rows)) {
        return Promise.resolve({ ok: false, reason: 'need-clear' });
    }
    const v = validateLayout(cur.rows);
    if (!v.ok) return Promise.resolve({ ok: false, reason: 'invalid', detail: v.reason });

    const applyLocalReviewing = () => {
        if (!_bumpDaily(KEYS.submitDaily, SUBMIT_DAILY_MAX)) {
            return { ok: false, reason: 'daily-limit' };
        }
        cur.status = STATUS.reviewing;
        cur.publishedAt = 0;
        cur.updatedAt = Date.now();
        cur.rejectReason = '';
        cur.review = {
            submittedAt: Date.now(),
            reviewedAt: 0,
            rejectReason: '',
            snapshotId: cur.layoutHash,
            auto: true,
        };
        list[idx] = cur;
        _saveAll(list);
        _notifyWorkshopAchievement();
        return { ok: true, stage: cur };
    };

    let cloudService;
    try {
        cloudService = require('./cloud-service').cloudService;
    } catch (e) {
        return Promise.resolve({ ok: false, reason: 'cloud', detail: '云服务不可用，无法提交审核' });
    }
    if (!cloudService.isAvailable()) {
        return Promise.resolve({ ok: false, reason: 'cloud', detail: '云服务不可用，无法提交审核', offline: true });
    }

    let profile = {};
    try {
        profile = require('./user-profile').getCachedProfile() || {};
    } catch (e) { /* ignore */ }

    return cloudService.publishWorkshopStage({
        stageId: cur.stageId,
        title: cur.title,
        rows: cloneRows(cur.rows),
        authorBest: cur.authorBest,
        dropIntervalMs: cur.dropIntervalMs,
        nickname: profile.nickname || '',
        avatarUrl: profile.avatarUrl || '',
    }).then((res) => {
        if (!res || !res.success) {
            const msg = (res && res.errMsg) || '';
            if (msg.indexOf('daily-limit') >= 0) return { ok: false, reason: 'daily-limit' };
            if (msg.indexOf('need author') >= 0) return { ok: false, reason: 'need-clear' };
            if (msg.indexOf('invalid') >= 0) return { ok: false, reason: 'invalid', detail: msg };
            return { ok: false, reason: 'cloud', detail: msg || '发布失败' };
        }
        const r = applyLocalReviewing();
        if (res.stage && r.stage) r.stage.review = res.stage.review || r.stage.review;
        return r;
    }).catch((e) => ({
        ok: false,
        reason: 'cloud',
        detail: (e && e.message) || '发布失败',
    }));
}

function listReviewingStages() {
    try {
        return require('./cloud-service').cloudService.listReviewingWorkshopStages({ pageSize: 50 })
            .then((res) => (res && res.success && Array.isArray(res.list)) ? res.list : []);
    } catch (e) {
        return Promise.resolve([]);
    }
}

function approveReview(stageId) {
    return require('./cloud-service').cloudService.approveWorkshopStage(stageId);
}

function rejectReview(stageId, reason) {
    return require('./cloud-service').cloudService.rejectWorkshopStage(stageId, reason);
}

function syncMyReviewStatuses() {
    let service;
    try { service = require('./cloud-service').cloudService; } catch (e) { return Promise.resolve(false); }
    if (!service || !service.isAvailable()) return Promise.resolve(false);
    return service.listMyWorkshopStages().then((res) => {
        if (!res || !res.success || !Array.isArray(res.list)) return false;
        const remote = {};
        res.list.forEach((s) => { if (s && s.stageId) remote[s.stageId] = s; });
        const deleted = _loadJson(KEYS.deletedStages, []) || [];
        const deletedMap = {};
        deleted.forEach((id) => { deletedMap[id] = true; });
        deleted.forEach((id) => {
            service.deleteWorkshopStage(id).then((result) => {
                if (!result || !result.success) return;
                const latest = _loadJson(KEYS.deletedStages, []) || [];
                _saveJson(KEYS.deletedStages, latest.filter((item) => item !== id));
            }).catch(() => {});
        });
        const list = listStages();
        let changed = false;
        res.list.forEach((cloudStage) => {
            if (!cloudStage || !cloudStage.stageId || remote[cloudStage.stageId] == null) return;
            if (deletedMap[cloudStage.stageId]) return;
            if (list.some((local) => local && local.stageId === cloudStage.stageId)) return;
            if (!cloudStage.rows) return;
            list.push(Object.assign({}, cloudStage, { rows: cloneRows(cloudStage.rows) }));
            changed = true;
        });
        list.forEach((local) => {
            const cloudStage = remote[local.stageId];
            if (!cloudStage) return;
            if (local.status !== cloudStage.status
                || local.rejectReason !== (cloudStage.rejectReason || '')) {
                local.status = cloudStage.status;
                local.rejectReason = cloudStage.rejectReason || '';
                local.review = cloudStage.review || local.review || null;
                local.publishedAt = cloudStage.publishedAt || 0;
                local.updatedAt = cloudStage.updatedAt || local.updatedAt;
                changed = true;
            }
        });
        if (changed) _saveAll(list);
        return changed;
    }).catch(() => false);
}

function withdrawReview(stageId) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx < 0) return { ok: false, reason: 'missing' };
    const cur = list[idx];
    if (cur.status !== STATUS.reviewing) return { ok: false, reason: 'not-reviewing' };
    let service;
    try { service = require('./cloud-service').cloudService; } catch (e) { service = null; }
    if (!service || !service.isAvailable()) {
        return Promise.resolve({ ok: false, reason: 'cloud' });
    }
    return service.withdrawWorkshopReview(stageId).then((res) => {
        if (!res || !res.success) return { ok: false, reason: 'cloud', detail: res && res.errMsg };
        cur.status = STATUS.cleared;
        cur.updatedAt = Date.now();
        list[idx] = cur;
        _saveAll(list);
        return { ok: true, stage: cur };
    }).catch(() => ({ ok: false, reason: 'cloud' }));
}

function delistStage(stageId) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx < 0) return Promise.resolve({ ok: false, reason: 'missing' });
    const cur = list[idx];
    if (cur.status !== STATUS.published) return Promise.resolve({ ok: false, reason: 'not-published' });

    const applyLocal = () => {
        cur.status = STATUS.delisted;
        cur.updatedAt = Date.now();
        list[idx] = cur;
        _saveAll(list);
        return { ok: true, stage: cur };
    };

    let cloudService;
    try {
        cloudService = require('./cloud-service').cloudService;
    } catch (e) {
        return Promise.resolve(applyLocal());
    }
    if (!cloudService.isAvailable()) {
        return Promise.resolve(applyLocal());
    }
    return cloudService.delistWorkshopStage(stageId).then((res) => {
        const r = applyLocal();
        if (res && !res.success && !res.offline) {
            // 本地仍下架，避免卡死；提示由 UI 决定
            r.cloudWarn = res.errMsg || '';
        }
        return r;
    }).catch(() => applyLocal());
}

/** 本地已发布列表（作者本机）+ 官方精选种子 */
function listPlazaLocal(sort) {
    const published = listStages().filter((s) => s.status === STATUS.published);
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    const map = {};
    published.forEach((s) => { map[s.stageId] = s; });
    Object.keys(cache).forEach((id) => {
        if (!cache[id] || cache[id].status !== STATUS.published) return;
        if (_isOfficialPlazaStageId(id)) return;
        map[id] = cache[id];
    });
    // 官方精选：本地包为准，stats 从 cache / 云合并
    getOfficialPlazaStages().forEach((s) => {
        const overlay = map[s.stageId] || cache[s.stageId];
        map[s.stageId] = overlay ? _mergeOfficialPlazaStage(s, overlay) : s;
    });
    let arr = Object.keys(map).map((k) => map[k]);
    if (sort === 'official') {
        arr = arr.filter((s) => s.source === 'official' && s.featured !== false);
        arr.sort((a, b) => (a.featuredRank || 0) - (b.featuredRank || 0));
    } else if (sort === 'heat') {
        arr.sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
    } else if (sort === 'clearRate') {
        arr.sort((a, b) => {
            const ra = (a.stats.clearCount || 0) / Math.max(1, a.stats.playCount || 0);
            const rb = (b.stats.clearCount || 0) / Math.max(1, b.stats.playCount || 0);
            return rb - ra;
        });
    } else {
        arr.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    }
    return arr;
}

/** 官方精选关卡（P0 起） */
function getOfficialPlazaStages() {
    const list = (OFFICIAL_PLAZA && OFFICIAL_PLAZA.stages) || [];
    return list.map((s) => Object.assign({}, s, {
        rows: cloneRows(s.rows),
        status: STATUS.published,
        source: 'official',
        featured: true,
        authorName: s.authorName || '官方',
    }));
}

function _isOfficialPlazaStageId(stageId) {
    return !!stageId && String(stageId).startsWith('official_plaza_');
}

/** 官方关以本地包为准，只叠加 stats / heat 等云端字段（避免云 stub 盖掉标题与布局） */
function _mergeOfficialPlazaStage(base, overlay) {
    if (!base) return overlay || null;
    if (!overlay) return base;
    const mergedStats = Object.assign({}, base.stats || {}, overlay.stats || {});
    const merged = Object.assign({}, base, {
        stats: mergedStats,
        heatScore: _calcHeat(Object.assign({}, base, { stats: mergedStats })),
    });
    if (overlay.updatedAt) merged.updatedAt = overlay.updatedAt;
    return merged;
}

/**
 * 广场列表：云优先，失败降级本地缓存；官方精选始终可本地返回
 * @returns {Promise<Array>}
 */
function listPlaza(sort, options) {
    const mode = sort || 'new';
    const onReviewerStatus = options && typeof options.onReviewerStatus === 'function'
        ? options.onReviewerStatus
        : null;
    const reportReviewerStatus = (res) => {
        if (onReviewerStatus && res && res.success) onReviewerStatus(res.isAdmin === true);
    };
    let cloudService;
    try {
        cloudService = require('./cloud-service').cloudService;
    } catch (e) {
        cloudService = null;
    }
    // 官方精选：本地包为准，但 stats 可从云合并（全服通关数）
    if (mode === 'official') {
        const local = listPlazaLocal('official');
        if (!cloudService || !cloudService.isAvailable()) {
            return Promise.resolve(local);
        }
        return cloudService.listPlaza({ sort: 'official', pageSize: 100 }).then((res) => {
            reportReviewerStatus(res);
            if (res && res.success && Array.isArray(res.list)) {
                return _mergeOfficialCloudStats(local, res.list);
            }
            return local;
        }).catch(() => local);
    }
    if (!cloudService || !cloudService.isAvailable()) {
        return Promise.resolve(listPlazaLocal(mode));
    }
    return cloudService.listPlaza({ sort: mode, pageSize: 50 }).then((res) => {
        reportReviewerStatus(res);
        if (res && res.success && Array.isArray(res.list)) {
            cachePlazaStages(res.list);
            // 合并官方关，避免云列表冲掉精选可见性（非 official tab）
            const official = getOfficialPlazaStages();
            const map = {};
            official.forEach((s) => { map[s.stageId] = s; });
            res.list.forEach((s) => {
                if (!s || !s.stageId) return;
                if (_isOfficialPlazaStageId(s.stageId) && map[s.stageId]) {
                    map[s.stageId] = _mergeOfficialPlazaStage(map[s.stageId], s);
                } else {
                    map[s.stageId] = s;
                }
            });
            let arr = Object.keys(map).map((k) => map[k]);
            if (mode === 'heat') {
                arr.sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
            } else if (mode === 'clearRate') {
                arr.sort((a, b) => {
                    const ra = ((a.stats && a.stats.clearCount) || 0) / Math.max(1, (a.stats && a.stats.playCount) || 0);
                    const rb = ((b.stats && b.stats.clearCount) || 0) / Math.max(1, (b.stats && b.stats.playCount) || 0);
                    return rb - ra;
                });
            } else {
                arr.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
            }
            return arr;
        }
        return listPlazaLocal(mode);
    }).catch(() => listPlazaLocal(mode));
}

function _unlockedMap() {
    return _loadJson(KEYS.unlockedPlaza, {}) || {};
}

function isPlazaUnlocked(stageId) {
    return !!_unlockedMap()[stageId];
}

function _grantPlazaUnlock(stageId) {
    const map = _unlockedMap();
    map[stageId] = Date.now();
    _saveJson(KEYS.unlockedPlaza, map);
}

function _revokePlazaUnlock(stageId) {
    const map = _unlockedMap();
    delete map[stageId];
    _saveJson(KEYS.unlockedPlaza, map);
}

function _reportPlazaUnlock() {
    try {
        const { achievementManager } = require('./achievement-manager');
        if (achievementManager && typeof achievementManager.reportPlazaProgress === 'function') {
            achievementManager.reportPlazaProgress();
        }
    } catch (e) { /* ignore */ }
}

function _plazaEntryShortage(needGold) {
    return needGold > 0 && goldenBlock.getBalance() < needGold ? 'no-gold' : '';
}

/** 开打确认缺资源时的提示文案 */
function plazaEntryShortageText(result) {
    if (!result || result.ok) return '';
    if (result.reason === 'no-gold') return '金方块不足，可观看视频解锁';
    if (result.reason === 'missing') return '关卡不可用';
    return '无法开打';
}

/**
 * 广场开打：已解锁免费；未解锁仅扣金方块。
 * @param {string} stageId
 * @param {{ skipFee?: boolean }} [opts] skipFee 为看广告免开打费（仍须已解锁或另有金方块）
 */
function enterPlazaStage(stageId, opts) {
    const o = opts || {};
    const rewardedUnlock = !!o.rewardedUnlock;
    const stage = getStage(stageId);
    if (!stage || stage.status !== STATUS.published) {
        return { ok: false, reason: 'missing', needGold: 0 };
    }
    const already = isPlazaUnlocked(stageId);
    const needGold = already ? 0 : PLAZA_UNLOCK_GOLD;
    if (rewardedUnlock && needGold > 0) {
        _grantPlazaUnlock(stageId);
        _reportPlazaUnlock();
        return { ok: true, already: false, goldPaid: 0, paid: 0, needGold };
    }
    const shortage = _plazaEntryShortage(needGold);
    if (shortage) {
        return { ok: false, reason: shortage, needGold };
    }

    let goldPaid = 0;
    if (needGold > 0) {
        if (!goldenBlock.spendBalance(needGold)) {
            return { ok: false, reason: 'no-gold', needGold };
        }
        goldPaid = needGold;
        _grantPlazaUnlock(stageId);
        _reportPlazaUnlock();
    }

    return {
        ok: true,
        already,
        goldPaid,
        paid: 0,
        needGold,
    };
}

function unlockPlazaStage(stageId) {
    if (isPlazaUnlocked(stageId)) {
        return { ok: true, already: true, balance: goldenBlock.getBalance() };
    }
    let stage = getStage(stageId);
    if (!stage || stage.status !== STATUS.published) {
        return { ok: false, reason: 'missing' };
    }
    if (goldenBlock.getBalance() < PLAZA_UNLOCK_GOLD) {
        return { ok: false, reason: 'no-gold', cost: PLAZA_UNLOCK_GOLD };
    }
    if (!goldenBlock.spendBalance(PLAZA_UNLOCK_GOLD)) {
        return { ok: false, reason: 'no-gold', cost: PLAZA_UNLOCK_GOLD };
    }
    _grantPlazaUnlock(stageId);
    _reportPlazaUnlock();
    return { ok: true, cost: PLAZA_UNLOCK_GOLD, balance: goldenBlock.getBalance() };
}

function grantPlazaStageUnlock(stageId, source) {
    if (isPlazaUnlocked(stageId)) return { ok: true, already: true };
    const stage = getStage(stageId);
    if (!stage || stage.status !== STATUS.published) return { ok: false, reason: 'missing' };
    _grantPlazaUnlock(stageId);
    _reportPlazaUnlock();
    try {
        wx.setStorageSync('gc_plazaUnlockMeta_' + stageId, {
            source: source || 'grant', unlockedAt: Date.now(),
        });
    } catch (e) { /* ignore */ }
    return { ok: true, already: false };
}

/** 当前用户是否已通关该广场关卡 */
function isPlazaCleared(stageId) {
    if (!stageId) return false;
    const map = _loadJson(KEYS.clearedPlaza, {}) || {};
    const rec = map[stageId];
    return !!(rec && (rec.firstAt || rec.clearsToday > 0 || rec.date));
}

function _isValidPlazaBest(rec) {
    return rec && typeof rec.lines === 'number' && rec.lines >= 1;
}

function _plazaIsBetter(a, b) {
    if (!_isValidPlazaBest(b)) return true;
    if (a.lines !== b.lines) return a.lines < b.lines;
    if ((a.pieces || 0) !== (b.pieces || 0)) return (a.pieces || 0) < (b.pieces || 0);
    return (a.timeMs || 0) < (b.timeMs || 0);
}

/** 广场关个人最佳（消行越少越好）；须已通关且有有效纪录 */
function getPlazaBest(stageId) {
    if (!stageId) return null;
    const map = _loadJson(KEYS.clearedPlaza, {}) || {};
    const rec = map[stageId];
    if (!rec || !rec.best || !_isValidPlazaBest(rec.best)) return null;
    return rec.best;
}

/** 已通关的不同广场关卡数（按 stageId 去重，含官方/UGC） */
function getPlazaClearedCount() {
    const map = _loadJson(KEYS.clearedPlaza, {}) || {};
    return Object.keys(map).filter((id) => {
        const rec = map[id];
        return rec && (rec.firstAt || rec.clearsToday > 0 || rec.date);
    }).length;
}

/** 已用金方块解锁的广场关卡数 */
function getPlazaUnlockedCount() {
    return Object.keys(_unlockedMap()).length;
}

/** 已通关的官方精选关卡数 */
function getPlazaOfficialClearedCount() {
    const map = _loadJson(KEYS.clearedPlaza, {}) || {};
    return getOfficialPlazaStages().filter((s) => {
        const rec = map[s.stageId];
        return rec && (rec.firstAt || rec.clearsToday > 0 || rec.date);
    }).length;
}

function getFreePlayRemaining() {
    return Math.max(0, FREE_PLAY_DAILY - _dailyCount(KEYS.freePlayDaily));
}

function consumeFreePlay() {
    return _bumpDaily(KEYS.freePlayDaily, FREE_PLAY_DAILY);
}

function spendPlayFee(stageId) {
    const stage = getStage(stageId);
    if (!stage) return { ok: false, reason: 'missing', fee: 0, paid: 0 };
    return { ok: true, fee: 0, paid: 0 };
}

function spendChallengeFee() {
    return { ok: true, fee: 0, paid: 0 };
}

function _ensurePlazaCacheEntry(stageId) {
    const list = listStages();
    if (list.findIndex((s) => s.stageId === stageId) >= 0) return false;
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    if (cache[stageId]) return true;
    const official = getOfficialPlazaStages().find((s) => s.stageId === stageId);
    if (official) {
        cache[stageId] = Object.assign({}, official, {
            rows: cloneRows(official.rows),
            stats: Object.assign({
                playCount: 0,
                clearCount: 0,
                challengeSendCount: 0,
                likeCount: 0,
            }, official.stats || {}),
        });
        _saveJson(KEYS.plazaCache, cache);
        return true;
    }
    const stage = getStage(stageId);
    if (!stage || stage.status !== STATUS.published) return false;
    cache[stageId] = Object.assign({}, stage, {
        rows: cloneRows(stage.rows),
        stats: Object.assign({
            playCount: 0,
            clearCount: 0,
            challengeSendCount: 0,
            likeCount: 0,
        }, stage.stats || {}),
    });
    _saveJson(KEYS.plazaCache, cache);
    return true;
}

function _setPlazaStatsFromCloud(stageId, patch) {
    if (!stageId || !patch) return;
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx >= 0) {
        list[idx].stats = list[idx].stats || {};
        if (patch.playCount != null) list[idx].stats.playCount = patch.playCount;
        if (patch.clearCount != null) list[idx].stats.clearCount = patch.clearCount;
        list[idx].heatScore = _calcHeat(list[idx]);
        list[idx].updatedAt = Date.now();
        _saveAll(list);
        return;
    }
    _ensurePlazaCacheEntry(stageId);
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    if (!cache[stageId]) return;
    cache[stageId].stats = cache[stageId].stats || {};
    if (patch.playCount != null) cache[stageId].stats.playCount = patch.playCount;
    if (patch.clearCount != null) cache[stageId].stats.clearCount = patch.clearCount;
    if (_isOfficialPlazaStageId(stageId)) {
        const base = getOfficialPlazaStages().find((s) => s.stageId === stageId);
        if (base) cache[stageId] = _mergeOfficialPlazaStage(base, cache[stageId]);
    } else {
        cache[stageId].heatScore = _calcHeat(cache[stageId]);
    }
    cache[stageId].updatedAt = Date.now();
    _saveJson(KEYS.plazaCache, cache);
}

function _bumpPlazaStat(stageId, statKey) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx >= 0) {
        list[idx].stats = list[idx].stats || {};
        list[idx].stats[statKey] = (list[idx].stats[statKey] || 0) + 1;
        list[idx].heatScore = _calcHeat(list[idx]);
        list[idx].updatedAt = Date.now();
        _saveAll(list);
        return;
    }
    _ensurePlazaCacheEntry(stageId);
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    if (!cache[stageId]) return;
    cache[stageId].stats = cache[stageId].stats || {};
    cache[stageId].stats[statKey] = (cache[stageId].stats[statKey] || 0) + 1;
    cache[stageId].heatScore = _calcHeat(cache[stageId]);
    cache[stageId].updatedAt = Date.now();
    _saveJson(KEYS.plazaCache, cache);
}

function _mergeOfficialCloudStats(localList, cloudList) {
    if (!Array.isArray(localList) || !Array.isArray(cloudList) || cloudList.length === 0) {
        return localList;
    }
    const statsMap = {};
    cloudList.forEach((s) => {
        if (s && s.stageId && s.stats) statsMap[s.stageId] = s.stats;
    });
    return localList.map((s) => {
        const cloudStats = statsMap[s.stageId];
        if (!cloudStats) return s;
        const mergedStats = Object.assign({}, s.stats || {}, cloudStats);
        return Object.assign({}, s, {
            stats: mergedStats,
            heatScore: _calcHeat(Object.assign({}, s, { stats: mergedStats })),
        });
    });
}

function recordPlayStart(stageId) {
    _bumpPlazaStat(stageId, 'playCount');
    try {
        const { cloudService } = require('./cloud-service');
        cloudService.reportWorkshopPlay(stageId).then((res) => {
            if (res && res.success && res.playCount != null) {
                _setPlazaStatsFromCloud(stageId, { playCount: res.playCount });
            }
        }).catch(() => {});
    } catch (e) { /* ignore */ }
}

function _calcHeat(s) {
    const st = s.stats || {};
    let heat = (st.clearCount || 0) * 3 + (st.playCount || 0) * 1
        + (st.challengeSendCount || 0) * 2 + (st.likeCount || 0) * 2;
    if (s.publishedAt) {
        const weeks = Math.floor((Date.now() - s.publishedAt) / (7 * 24 * 3600 * 1000));
        let decay = 1;
        for (let i = 0; i < weeks; i++) decay *= 0.92;
        heat *= Math.max(0.5, decay);
    }
    return Math.round(heat * 100) / 100;
}

/**
 * 广场通关结算：记录进度与最佳成绩，不发放货币。
 */
function rewardPlazaClear(stageId, lines, pieces, timeMs, options) {
    const assisted = !!(options && options.assisted);
    const stage = getStage(stageId);
    if (!stage) {
        return { coinWant: 0, coinGained: 0, goldGranted: 0, firstClear: false };
    }

    _bumpPlazaStat(stageId, 'clearCount');

    const clearedMap = _loadJson(KEYS.clearedPlaza, {}) || {};
    const today = _today();
    const rec = clearedMap[stageId] || { firstAt: 0, date: '', clearsToday: 0 };
    const firstClear = !rec.firstAt;
    if (rec.date !== today) {
        rec.date = today;
        rec.clearsToday = 0;
    }
    rec.clearsToday += 1;
    if (firstClear) rec.firstAt = Date.now();
    const attempt = {
        lines: Math.max(1, Math.floor(Number(lines) || 0)),
        pieces: Math.max(0, Math.floor(Number(pieces) || 0)),
        timeMs: Math.max(0, Math.floor(Number(timeMs) || 0)),
    };
    const isNewBest = !assisted && (!_isValidPlazaBest(rec.best) || _plazaIsBetter(attempt, rec.best));
    if (isNewBest) {
        rec.best = attempt;
    }
    clearedMap[stageId] = rec;
    _saveJson(KEYS.clearedPlaza, clearedMap);
    try { require('./badge-progress-signal').invalidate('plaza'); } catch (e) { /* ignore */ }

    const minLines = stage.minLines || 1;

    try {
        const { achievementManager } = require('./achievement-manager');
        if (achievementManager && typeof achievementManager.reportPlazaProgress === 'function') {
            achievementManager.reportPlazaProgress();
        }
    } catch (e) { /* ignore */ }

    // 云上报通关统计；作者分成需云端钱包（二期），此处不把分成误发给游玩者
    try {
        const { cloudService } = require('./cloud-service');
        cloudService.reportWorkshopClear(stageId).then((res) => {
            if (res && res.success && res.clearCount != null) {
                _setPlazaStatsFromCloud(stageId, { clearCount: res.clearCount });
            }
        }).catch(() => {});
    } catch (e) { /* ignore */ }

    return {
        coinWant: 0,
        coinGained: 0,
        goldGranted: 0,
        firstClear,
        assisted,
        isNewBest,
        lines,
        pieces,
        timeMs,
        minLines,
    };
}

/** 作者自通试玩：不计广场奖励、不产金 */
function finishAuthorTrialClear(stageId, best) {
    return markAuthorCleared(stageId, best);
}

function bumpChallengeSend(stageId) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx >= 0) {
        list[idx].stats = list[idx].stats || {};
        list[idx].stats.challengeSendCount = (list[idx].stats.challengeSendCount || 0) + 1;
        list[idx].heatScore = _calcHeat(list[idx]);
        _saveAll(list);
    }
    try {
        const { cloudService } = require('./cloud-service');
        cloudService.bumpWorkshopChallenge(stageId).catch(() => {});
    } catch (e) { /* ignore */ }
}

function getSubmitRemaining() {
    return Math.max(0, SUBMIT_DAILY_MAX - _dailyCount(KEYS.submitDaily));
}

module.exports = {
    STATUS,
    FREE_SLOTS,
    MAX_SLOTS,
    SLOT_EXPAND_COST,
    PLAZA_UNLOCK_GOLD,
    CHALLENGE_FEE,
    WORKSHOP_CLEAR_DAILY,
    AUTHOR_SHARE_DAILY,
    layoutHash,
    emptyRows,
    cloneRows,
    analyzeLayout,
    validateLayout,
    getPlayFee,
    getSlotCap,
    getExpandCost,
    expandSlot,
    listStages,
    getStage,
    countOccupiedSlots,
    canCreate,
    createStage,
    updateStage,
    deleteStage,
    listByStatus,
    markAuthorCleared,
    submitForReview,
    listReviewingStages,
    approveReview,
    rejectReview,
    syncMyReviewStatuses,
    withdrawReview,
    delistStage,
    listPlaza,
    listPlazaLocal,
    getOfficialPlazaStages,
    isPlazaUnlocked,
    unlockPlazaStage,
    grantPlazaStageUnlock,
    enterPlazaStage,
    plazaEntryShortageText,
    isPlazaCleared,
    getPlazaBest,
    getPlazaClearedCount,
    getPlazaUnlockedCount,
    getPlazaOfficialClearedCount,
    getWorkshopCreatedCount,
    getWorkshopAuthorClearCount,
    getWorkshopPublishedCount,
    getFreePlayRemaining,
    consumeFreePlay,
    spendPlayFee,
    spendChallengeFee,
    recordPlayStart,
    rewardPlazaClear,
    finishAuthorTrialClear,
    bumpChallengeSend,
    getSubmitRemaining,
    cachePlazaStage,
    cachePlazaStages,
};
