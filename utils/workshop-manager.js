/**
 * 工坊 / 关卡广场（本地 MVP）
 * 对齐 docs/gc-workshop-plaza-design.md
 * - 创作免费；槽位 3 免费，金递增扩至 10
 * - 广场：金解锁 + 币开打；通关只发金币，0 金方块
 */

const goldenBlock = require('./golden-block-manager');
const { coinManager } = require('./coin-manager');
const OFFICIAL_PLAZA = require('../data/plaza-official-v1.js');

const KEYS = {
    stages: 'gc_workshop_stages',
    slotCap: 'gc_workshop_slotCap',
    unlockedPlaza: 'gc_workshop_plazaUnlocked',
    clearedPlaza: 'gc_workshop_plazaCleared', // { [stageId]: { date, clearsToday } }
    submitDaily: 'gc_workshop_submitDaily',
    freePlayDaily: 'gc_workshop_freePlayDaily',
    authorShareDaily: 'gc_workshop_authorShareDaily',
    plazaCache: 'gc_workshop_plazaCache', // { [stageId]: stageDoc }
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
const CHALLENGE_FEE = 10;

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
    const minLines = meta.minLines || 0;
    const garbageCount = meta.garbageCount || 0;
    if (minLines <= 6 && garbageCount <= 24) return 8;
    if (minLines >= 12 || garbageCount >= 50) return 16;
    return 12;
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
    return { ok: true, slotCap: next, cost };
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
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    if (cache[id]) return cache[id];
    const official = getOfficialPlazaStages().find((s) => s.stageId === id);
    return official || null;
}

function cachePlazaStages(stages) {
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    (stages || []).forEach((s) => {
        if (s && s.stageId) cache[s.stageId] = s;
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
    const list = listStages().filter((s) => s.stageId !== stageId);
    _saveAll(list);
    return { ok: true };
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
    return { ok: true, stage: cur };
}

/**
 * 提交发布：优先上云；成功后本地标 published。
 * 云不可用时降级本地上架（仅本机可见）。
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

    const applyLocalPublish = () => {
        if (!_bumpDaily(KEYS.submitDaily, SUBMIT_DAILY_MAX)) {
            return { ok: false, reason: 'daily-limit' };
        }
        cur.status = STATUS.published;
        cur.publishedAt = Date.now();
        cur.updatedAt = Date.now();
        cur.rejectReason = '';
        cur.review = {
            submittedAt: Date.now(),
            reviewedAt: Date.now(),
            rejectReason: '',
            snapshotId: cur.layoutHash,
            auto: true,
        };
        list[idx] = cur;
        _saveAll(list);
        cachePlazaStage(cur);
        return { ok: true, stage: cur };
    };

    let cloudService;
    try {
        cloudService = require('./cloud-service').cloudService;
    } catch (e) {
        return Promise.resolve(applyLocalPublish());
    }
    if (!cloudService.isAvailable()) {
        const r = applyLocalPublish();
        r.offline = true;
        return Promise.resolve(r);
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
        const r = applyLocalPublish();
        if (res.stage) {
            cachePlazaStage(res.stage);
            if (r.stage && res.stage.stats) r.stage.stats = res.stage.stats;
        }
        return r;
    }).catch((e) => ({
        ok: false,
        reason: 'cloud',
        detail: (e && e.message) || '发布失败',
    }));
}

function withdrawReview(stageId) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx < 0) return { ok: false, reason: 'missing' };
    const cur = list[idx];
    if (cur.status !== STATUS.reviewing) return { ok: false, reason: 'not-reviewing' };
    cur.status = STATUS.cleared;
    cur.updatedAt = Date.now();
    list[idx] = cur;
    _saveAll(list);
    return { ok: true, stage: cur };
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
        if (cache[id] && cache[id].status === STATUS.published) map[id] = cache[id];
    });
    // 官方精选：始终合并进广场（本地兜底；云端有同 ID 时以缓存/云为准）
    getOfficialPlazaStages().forEach((s) => {
        if (!map[s.stageId]) map[s.stageId] = s;
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

/**
 * 广场列表：云优先，失败降级本地缓存；官方精选始终可本地返回
 * @returns {Promise<Array>}
 */
function listPlaza(sort) {
    const mode = sort || 'new';
    // 官方精选以本地包为准（不依赖云种子是否已导入）
    if (mode === 'official') {
        return Promise.resolve(listPlazaLocal('official'));
    }
    let cloudService;
    try {
        cloudService = require('./cloud-service').cloudService;
    } catch (e) {
        return Promise.resolve(listPlazaLocal(mode));
    }
    if (!cloudService.isAvailable()) {
        return Promise.resolve(listPlazaLocal(mode));
    }
    return cloudService.listPlaza({ sort: mode, pageSize: 50 }).then((res) => {
        if (res && res.success && Array.isArray(res.list)) {
            cachePlazaStages(res.list);
            // 合并官方关，避免云列表冲掉精选可见性（非 official tab）
            const official = getOfficialPlazaStages();
            const map = {};
            official.forEach((s) => { map[s.stageId] = s; });
            res.list.forEach((s) => { map[s.stageId] = s; });
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

function unlockPlazaStage(stageId) {
    if (isPlazaUnlocked(stageId)) {
        return { ok: true, already: true, balance: goldenBlock.getBalance() };
    }
    let stage = getStage(stageId);
    if (!stage || stage.status !== STATUS.published) {
        // 尝试从缓存取；仍无则拒绝（UI 应先 listPlaza）
        return { ok: false, reason: 'missing' };
    }
    if (goldenBlock.getBalance() < PLAZA_UNLOCK_GOLD) {
        return { ok: false, reason: 'no-gold', cost: PLAZA_UNLOCK_GOLD };
    }
    if (!goldenBlock.spendBalance(PLAZA_UNLOCK_GOLD)) {
        return { ok: false, reason: 'no-gold', cost: PLAZA_UNLOCK_GOLD };
    }
    const map = _unlockedMap();
    map[stageId] = Date.now();
    _saveJson(KEYS.unlockedPlaza, map);
    return { ok: true, cost: PLAZA_UNLOCK_GOLD, balance: goldenBlock.getBalance() };
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
    const fee = getPlayFee(stage);
    if (fee <= 0) return { ok: true, fee: 0, paid: 0 };
    const bal = coinManager.getCoins();
    if (bal < fee) return { ok: false, reason: 'no-coins', fee, paid: 0 };
    try {
        wx.setStorageSync('gc_coins', bal - fee);
    } catch (e) {
        return { ok: false, reason: 'storage', fee, paid: 0 };
    }
    return { ok: true, fee, paid: fee };
}

function spendChallengeFee() {
    const fee = CHALLENGE_FEE;
    const bal = coinManager.getCoins();
    if (bal < fee) return { ok: false, reason: 'no-coins', fee, paid: 0 };
    try {
        wx.setStorageSync('gc_coins', bal - fee);
    } catch (e) {
        return { ok: false, reason: 'storage', fee, paid: 0 };
    }
    return { ok: true, fee, paid: fee };
}

function recordPlayStart(stageId) {
    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx >= 0) {
        list[idx].stats = list[idx].stats || {};
        list[idx].stats.playCount = (list[idx].stats.playCount || 0) + 1;
        list[idx].heatScore = _calcHeat(list[idx]);
        list[idx].updatedAt = Date.now();
        _saveAll(list);
    }
    const cache = _loadJson(KEYS.plazaCache, {}) || {};
    if (cache[stageId]) {
        cache[stageId].stats = cache[stageId].stats || {};
        cache[stageId].stats.playCount = (cache[stageId].stats.playCount || 0) + 1;
        cache[stageId].heatScore = _calcHeat(cache[stageId]);
        _saveJson(KEYS.plazaCache, cache);
    }
    try {
        const { cloudService } = require('./cloud-service');
        cloudService.reportWorkshopPlay(stageId).catch(() => {});
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
 * 广场通关结算：只发金币，绝不发金方块
 * @returns {{ coinWant, coinGained, goldGranted: 0, firstClear }}
 */
function rewardPlazaClear(stageId, lines, pieces, timeMs) {
    const stage = getStage(stageId);
    if (!stage) {
        return { coinWant: 0, coinGained: 0, goldGranted: 0, firstClear: false };
    }

    const list = listStages();
    const idx = list.findIndex((s) => s.stageId === stageId);
    if (idx >= 0) {
        list[idx].stats = list[idx].stats || {};
        list[idx].stats.clearCount = (list[idx].stats.clearCount || 0) + 1;
        list[idx].heatScore = _calcHeat(list[idx]);
        list[idx].updatedAt = Date.now();
        _saveAll(list);
    } else {
        const cache = _loadJson(KEYS.plazaCache, {}) || {};
        if (cache[stageId]) {
            cache[stageId].stats = cache[stageId].stats || {};
            cache[stageId].stats.clearCount = (cache[stageId].stats.clearCount || 0) + 1;
            cache[stageId].heatScore = _calcHeat(cache[stageId]);
            _saveJson(KEYS.plazaCache, cache);
        }
    }

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
    clearedMap[stageId] = rec;
    _saveJson(KEYS.clearedPlaza, clearedMap);

    const minLines = stage.minLines || 1;
    const T = stage.coinThreshold || minLines * 2;
    // 缩水版效率：官方公式 * 0.4，夹在 12～40
    let want = coinManager.calcStageClearReward(lines, minLines, T);
    want = Math.round(want * 0.4);
    want = Math.max(12, Math.min(40, want));
    if (!firstClear && rec.clearsToday > 1) {
        want = Math.max(4, Math.floor(want * 0.3));
    }

    const gained = coinManager.rewardWorkshopClear(want);

    // 云上报通关统计；作者分成需云端钱包（二期），此处不把分成误发给游玩者
    try {
        const { cloudService } = require('./cloud-service');
        cloudService.reportWorkshopClear(stageId).catch(() => {});
    } catch (e) { /* ignore */ }

    return {
        coinWant: want,
        coinGained: gained,
        goldGranted: 0,
        firstClear,
        lines,
        pieces,
        timeMs,
        minLines,
        coinThreshold: T,
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
    withdrawReview,
    delistStage,
    listPlaza,
    listPlazaLocal,
    getOfficialPlazaStages,
    isPlazaUnlocked,
    unlockPlazaStage,
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
