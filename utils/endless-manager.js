/**
 * 无尽练习：广场官方 Tab 置顶特殊关（一期本地闭环）
 * - 无经济、无通关
 * - 清掉含垃圾的行才补底（含垃圾几行补几行；纯玩家块行不补）
 * - 消任意行都计分：1/4/8/16
 * - 本地续玩；失败清档
 */

const STAGE_ID = 'plaza_endless';
const SAVE_KEY = 'gc_endless_run_v1';
const INTRO_KEY = 'gc_endless_intro_seen';
const BEST_KEY = 'gc_endless_best_score';

const SCORE_TABLE = [0, 1, 4, 8, 16];

function scoreForClear(n) {
    const k = Math.min(4, Math.max(0, Number(n) || 0));
    return SCORE_TABLE[k] || 0;
}

function _safeGet(key, fallback) {
    try {
        const v = wx.getStorageSync(key);
        return v == null || v === '' ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

function _safeSet(key, val) {
    try {
        wx.setStorageSync(key, val);
        return true;
    } catch (e) {
        return false;
    }
}

function _safeRemove(key) {
    try {
        wx.removeStorageSync(key);
    } catch (e) { /* ignore */ }
}

function hasSeenIntro() {
    return !!_safeGet(INTRO_KEY, false);
}

function markIntroSeen() {
    _safeSet(INTRO_KEY, true);
}

function getBestScore() {
    const n = Number(_safeGet(BEST_KEY, 0)) || 0;
    return Math.max(0, Math.floor(n));
}

function noteBestScore(score) {
    const s = Math.max(0, Math.floor(Number(score) || 0));
    const cur = getBestScore();
    if (s > cur) {
        _safeSet(BEST_KEY, s);
        return true;
    }
    return false;
}

function loadRun() {
    const raw = _safeGet(SAVE_KEY, null);
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.snapshot || typeof raw.snapshot !== 'object') return null;
    return raw;
}

function saveRun(payload) {
    if (!payload || !payload.snapshot) return false;
    return _safeSet(SAVE_KEY, Object.assign({ savedAt: Date.now(), version: 1 }, payload));
}

function clearRun() {
    _safeRemove(SAVE_KEY);
}

/** 生成一行：4～7 个空洞随机分布，禁止整行全满 */
function generateGarbageLine(rng) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    const holes = 3 + Math.floor(rand() * 4); // 3～6 空 → 4～7 实
    const cells = [];
    for (let i = 0; i < 10; i++) cells.push('#');
    let placed = 0;
    let guard = 0;
    while (placed < holes && guard < 40) {
        guard++;
        const c = Math.floor(rand() * 10);
        if (cells[c] === '#') {
            cells[c] = '.';
            placed++;
        }
    }
    if (cells.every((ch) => ch === '#')) {
        cells[Math.floor(rand() * 10)] = '.';
    }
    return cells.join('');
}

/**
 * 生成开局布局：底部 height 行随机垃圾（visible row 0 = 顶）
 * @param {number} [height] 默认 5～9 随机
 */
function generateOpeningLayout(height, rng) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    let h = height;
    if (!(h >= 1 && h <= 9)) {
        h = 5 + Math.floor(rand() * 5); // 5～9
    }
    h = Math.max(1, Math.min(9, Math.floor(h)));
    const rows = {};
    for (let i = 0; i < h; i++) {
        const visibleRow = 20 - h + i;
        rows[String(visibleRow)] = generateGarbageLine(rand);
    }
    return { rows, height: h };
}

/**
 * 续玩快照 → 广场卡剪影 rows（可见行 0～19，非空格记为 '#'）
 * 含垃圾与已锁定玩家块；不含当前下落块。
 */
function rowsFromSnapshot(snap) {
    const board = snap && snap.board;
    if (!Array.isArray(board)) return { rows: {}, cellCount: 0 };
    const HIDDEN = 2;
    const VIS = 20;
    const COLS = 10;
    const rows = {};
    let cellCount = 0;
    for (let vr = 0; vr < VIS; vr++) {
        const line = board[vr + HIDDEN];
        if (!Array.isArray(line)) continue;
        let chars = '';
        let any = false;
        for (let c = 0; c < COLS; c++) {
            const v = line[c];
            if (v) {
                chars += '#';
                any = true;
                cellCount++;
            } else {
                chars += '.';
            }
        }
        if (any) rows[String(vr)] = chars;
    }
    return { rows, cellCount };
}

function getEndlessStageMeta() {
    const best = getBestScore();
    const run = loadRun();
    const hasRun = !!(run && run.snapshot);
    const resumeScore = hasRun && run.score != null ? Number(run.score) || 0 : 0;
    let rows = {};
    let garbageCount = 0;
    if (hasRun) {
        const preview = rowsFromSnapshot(run.snapshot);
        rows = preview.rows || {};
        garbageCount = preview.cellCount || 0;
    }
    // 展示用最高分：存档里的历史最高，至少不低于当前续玩分
    const displayBest = Math.max(best, resumeScore);
    return {
        stageId: STAGE_ID,
        kind: 'endless',
        title: '无尽',
        authorName: '官方',
        status: 'published',
        source: 'official',
        featured: true,
        featuredRank: 0,
        tags: ['endless', 'practice'],
        rows,
        minLines: 0,
        garbageCount,
        coinThreshold: 0,
        dropIntervalMs: 900,
        playFee: 0,
        stats: { playCount: 0, clearCount: 0, likeCount: 0 },
        heatScore: 0,
        endlessBest: displayBest,
        endlessResume: hasRun,
        endlessResumeScore: hasRun ? resumeScore : 0,
    };
}

function isEndlessStageId(id) {
    return id === STAGE_ID;
}

/** 官方列表前插入无尽卡 */
function prependEndlessIfOfficial(sort, list) {
    if (sort !== 'official') return Array.isArray(list) ? list.slice() : [];
    const items = Array.isArray(list) ? list.filter((s) => s && s.stageId !== STAGE_ID) : [];
    items.unshift(getEndlessStageMeta());
    return items;
}

module.exports = {
    STAGE_ID,
    SCORE_TABLE,
    scoreForClear,
    hasSeenIntro,
    markIntroSeen,
    getBestScore,
    noteBestScore,
    loadRun,
    saveRun,
    clearRun,
    generateGarbageLine,
    generateOpeningLayout,
    rowsFromSnapshot,
    getEndlessStageMeta,
    isEndlessStageId,
    prependEndlessIfOfficial,
};
