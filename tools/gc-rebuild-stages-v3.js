/**
 * tools/gc-rebuild-stages-v3.js
 * 按「正形剪影 + 抬升/凌空 + 高位搭梯」原则重构 100 关布局。
 * 保留章节主题形（数字/字母/花/兽/建筑…）；用离地抬升制造搭梯空间，禁止天马行空抽象堆块。
 * 主题贴地偏好：建筑/车辆偏 raise=0；花/星/几何/圣物偏抬升；ladder 用主题碎片浮空。
 *
 * 运行：node tools/gc-rebuild-stages-v3.js
 * 随后：python3 tools/gc-sync-stages-js.py
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'stages-v1.json');
const prev = require('../data/stages-v1.json');

const COLS = 10;
const BOARD_ROWS = 20; // 0..19 visible

function emptyGrid() {
    return Array.from({ length: BOARD_ROWS }, () => Array(COLS).fill('.'));
}

function paint(g, r, c) {
    if (r >= 0 && r < BOARD_ROWS && c >= 0 && c < COLS) g[r][c] = '#';
}

function paintRow(g, r, pattern) {
    // pattern length 10 with #/.
    for (let c = 0; c < COLS; c++) {
        if (pattern[c] === '#') paint(g, r, c);
    }
}

/** 自底向上放置：bottomRow 为最底行，patterns[0] 在最底 */
function placeFromBottom(patterns, bottomRow) {
    const g = emptyGrid();
    const start = bottomRow - (patterns.length - 1);
    for (let i = 0; i < patterns.length; i++) {
        paintRow(g, start + i, patterns[i]);
    }
    return g;
}

/** 离地 raise 行放置主题剪影（下方真空 = 搭梯区） */
function placeRaised(patterns, raise) {
    const bottom = 19 - Math.max(0, raise);
    if (bottom - (patterns.length - 1) < 0) {
        throw new Error('raise too high for pattern height ' + patterns.length);
    }
    return placeFromBottom(patterns, bottom);
}

/**
 * 章主题抬升配额（离地行数）。null = 该关由 ladder/专用 builder 处理。
 * 建筑/车辆偏贴地；花田/星象/几何/金殿偏凌空；前几关保留贴地教学。
 */
function thematicRaise(ch, local) {
    const table = {
        // 数字课：先贴地认形，中后段数字「写在半空」
        1: [0, 0, 1, 2, null, 2, 2, 3, 3, 2],
        // 字母墙：黑板字逐渐离地
        2: [0, 1, 2, 2, 2, 3, null, 3, 3, 2],
        // 花田：茎叶悬空/花瓣离地（主题即浮空）
        3: [2, 2, null, 3, 3, 3, 4, 3, 4, null],
        // 萌宠：跳跃感，整体抬一点
        4: [1, 2, 2, 2, 3, 3, 3, null, 3, 3],
        // 积木城：天际线贴地为主，少数浮空楼阁
        5: [0, 0, 0, 1, 0, null, 1, 0, 2, 1],
        // 车水马龙：车船贴地；火箭等另标 ladder
        6: [0, 0, 0, 0, 0, 1, null, 2, 1, 0],
        // 星象：专用 stars()，整图浮在中盘
        7: [null, null, null, null, null, null, null, null, null, null],
        // 几何：空心框悬空
        8: [2, 3, 2, null, 3, 3, 3, 3, 4, 3],
        // 地宫：部分廊道贴地，浮桥/悬廊抬升
        9: [0, 1, 1, 2, 3, 2, null, 2, 2, 2],
        // 金殿：圣物离座悬空
        10: [2, 2, 3, 3, 3, 3, 4, 3, 4, null],
    };
    return table[ch][local - 1];
}

function gridToRows(g) {
    const rows = {};
    for (let r = 0; r < BOARD_ROWS; r++) {
        const line = g[r].join('');
        if (line.indexOf('#') >= 0) rows[String(r)] = line;
    }
    return rows;
}

function stats(rows) {
    let garbageCount = 0;
    const keys = Object.keys(rows).map(Number).sort((a, b) => a - b);
    for (const r of keys) {
        const line = rows[r];
        if (line === '##########') throw new Error('full row at ' + r);
        let n = 0;
        for (const ch of line) if (ch === '#') n++;
        if (n === 10) throw new Error('full row count at ' + r);
        if (n === 0) throw new Error('empty listed row ' + r);
        garbageCount += n;
    }
    return {
        minLines: keys.length,
        garbageCount,
        coinThreshold: keys.length * 2,
        top: keys.length ? keys[0] : 19,
    };
}

// ---------------------------------------------------------------------------
// 关型：silhouette 正形剪影（可抬升）/ ladder 主题浮空目标 / channel 廊道
// ---------------------------------------------------------------------------

/** 目标 minLines 表（章内非降，贴近原设计） */
const ML = {
    1: [3, 4, 4, 5, 5, 6, 6, 7, 7, 8],
    2: [5, 5, 6, 6, 7, 7, 8, 8, 9, 9],
    3: [6, 6, 7, 7, 8, 8, 9, 9, 10, 10],
    4: [7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
    5: [8, 8, 9, 9, 10, 10, 11, 11, 12, 12],
    6: [8, 9, 9, 10, 10, 11, 11, 12, 12, 13],
    7: [9, 9, 10, 10, 11, 11, 12, 12, 13, 13],
    8: [9, 10, 10, 11, 11, 12, 12, 13, 13, 14],
    9: [10, 10, 11, 11, 12, 12, 13, 13, 14, 14],
    10: [11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

/**
 * 主题剪影：默认可贴底或抬升 raise 行。
 * 保证顶垃圾行 >= minTop（普通 6 / boss 可 4）；若抬升导致顶太高则自动减小 raise。
 */
function silhouette(patterns, minTop, raise) {
    const h = patterns.length;
    let r = Math.max(0, raise || 0);
    let bottom = 19 - r;
    let top = bottom - h + 1;
    if (top < minTop) {
        // 顶太高：下调（减小抬升），必要时贴底
        bottom = Math.min(19, minTop + h - 1);
        if (bottom > 19) bottom = 19;
        top = bottom - h + 1;
        if (top < 4) {
            bottom = 4 + h - 1;
            if (bottom > 19) throw new Error('patterns too tall');
        }
    }
    return placeFromBottom(patterns, bottom);
}

/**
 * 主题浮空搭梯：目标剪影整坨离地；可选「错列」稀疏踏脚（不与主形同列钉死到底）。
 * footingPatterns 贴底但应与目标错列，避免变成贴地大楼。
 */
function ladder(targetPatterns, footingPatterns, targetTop, opts) {
    const g = emptyGrid();
    opts = opts || {};
    for (let i = 0; i < targetPatterns.length; i++) {
        paintRow(g, targetTop + i, targetPatterns[i]);
    }
    if (footingPatterns && footingPatterns.length) {
        const footBottom = opts.footBottom != null ? opts.footBottom : 19;
        const start = footBottom - (footingPatterns.length - 1);
        for (let i = 0; i < footingPatterns.length; i++) {
            paintRow(g, start + i, footingPatterns[i]);
        }
    }
    // 中段主题踏石（可选）：稀疏、不连续钉地
    if (opts.stepRows) {
        for (const [r, pat] of opts.stepRows) paintRow(g, r, pat);
    }
    return g;
}

/** 整坨主题形抬离地面（无底脚）——最干净的凌空剪影 */
function floatingGlyph(patterns, raise, minTop) {
    return silhouette(patterns, minTop, raise);
}

// ---- 第 1 章：数字正形剪影（# 构成数字笔画）----
function ch1(local) {
    const ml = ML[1][local - 1];
    const boss = local === 10;
    const minTop = boss ? 4 : 6;
    const digits = {
        1: [ // 竖一
            '....##....',
            '....##....',
            '....##....',
        ],
        2: [
            '.######...',
            '.....##...',
            '.######...',
            '.##.......',
        ],
        3: [
            '.######...',
            '.....##...',
            '..####....',
            '.....##...',
        ],
        4: [
            '.##...##..',
            '.##...##..',
            '.#######..',
            '......##..',
            '......##..',
        ],
        5: [ // 旗杆五 + 轻微高位感
            '.######...',
            '.##.......',
            '.######...',
            '.....##...',
            '.######...',
        ],
        6: [
            '..####....',
            '.##.......',
            '.######...',
            '.##...##..',
            '.##...##..',
            '..####....',
        ],
        7: [
            '.#######..',
            '......##..',
            '.....##...',
            '....##....',
            '...##.....',
            '...##.....',
        ],
        8: [
            '..####....',
            '.##...##..',
            '..####....',
            '.##...##..',
            '.##...##..',
            '..####....',
            '.##...##..',
        ],
        9: [
            '..####....',
            '.##...##..',
            '.##...##..',
            '..#####...',
            '.....##...',
            '.....##...',
            '.######...',
        ],
        10: [ // 圆环零：空心剪影，非实心盘
            '...####...',
            '..##..##..',
            '.##....##.',
            '.##....##.',
            '.##....##.',
            '.##....##.',
            '..##..##..',
            '...####...',
        ],
    };
    // local 5：旗尖高点 —— 数字「5」上半旗面浮空，下方真空搭梯（主题仍是数字课）
    if (local === 5) {
        const g = ladder(
            [
                '.######...',
                '.##.......',
                '.######...',
            ],
            null,
            8,
            {
                // 错列旗杆踏石：不钉死到第19行，保留凌空
                stepRows: [
                    [14, '....##....'],
                    [16, '....#.....'],
                ],
            }
        );
        return { grid: g, kind: 'ladder', nameHint: null };
    }
    let pats = digits[local];
    pats = fitPatterns(pats, ml);
    const raise = thematicRaise(1, local);
    return { grid: silhouette(pats, minTop, raise || 0), kind: 'silhouette' };
}

function fitPatterns(pats, ml) {
    if (pats.length === ml) return pats.slice();
    if (pats.length > ml) return pats.slice(pats.length - ml); // keep bottom of glyph
    const out = pats.slice();
    while (out.length < ml) {
        // 在顶部加稀疏帽，保持剪影感
        out.unshift(sparseCap(out[0]));
    }
    return out;
}

function sparseCap(below) {
    // 在下方笔画上方加 2~3 格，避免满行
    const arr = Array(COLS).fill('.');
    let placed = 0;
    for (let c = 0; c < COLS && placed < 3; c++) {
        if (below[c] === '#') {
            arr[c] = '#';
            placed++;
        }
    }
    if (placed === 0) {
        arr[4] = '#';
        arr[5] = '#';
    }
    return arr.join('');
}

// ---- 第 2 章：字母正形 ----
function letterPatterns(ch) {
    const L = {
        A: [
            '...##.....',
            '..##.##...',
            '.##...##..',
            '.#######..',
            '.##...##..',
        ],
        B: [
            '.######...',
            '.##...##..',
            '.######...',
            '.##...##..',
            '.######...',
        ],
        C: [
            '..#####...',
            '.##.......',
            '.##.......',
            '.##.......',
            '..#####...',
            '.##.......',
        ],
        E: [
            '.#######..',
            '.##.......',
            '.######...',
            '.##.......',
            '.#######..',
            '.##.......',
        ],
        F: [
            '.#######..',
            '.##.......',
            '.######...',
            '.##.......',
            '.##.......',
            '.##.......',
            '.##.......',
        ],
        H: [
            '.##...##..',
            '.##...##..',
            '.#######..',
            '.##...##..',
            '.##...##..',
            '.##...##..',
            '.##...##..',
        ],
        L: [
            '.##.......',
            '.##.......',
            '.##.......',
            '.##.......',
            '.##.......',
            '.##.......',
            '.##.......',
            '.#######..',
        ],
        N: [
            '.##....##.',
            '.###...##.',
            '.##.#..##.',
            '.##..#.##.',
            '.##...###.',
            '.##....##.',
            '.##....##.',
            '.##....##.',
        ],
        P: [
            '.######...',
            '.##...##..',
            '.##...##..',
            '.######...',
            '.##.......',
            '.##.......',
            '.##.......',
            '.##.......',
            '.##.......',
        ],
        T: [
            '.########.',
            '....##....',
            '....##....',
            '....##....',
            '....##....',
            '....##....',
            '....##....',
            '....##....',
            '....##....',
        ],
    };
    return L[ch];
}

function ch2(local) {
    const names = ['A', 'B', 'C', 'E', 'F', 'H', 'L', 'N', 'P', 'T'];
    const ml = ML[2][local - 1];
    if (local === 7) {
        // 大写 L：横杠浮空在高位，竖笔中段踏石 —— 仍是字母 L，不是抽象点
        const g = ladder(
            [
                '.######...',
            ],
            null,
            7,
            {
                stepRows: [
                    [10, '.##.......'],
                    [12, '.##.......'],
                    [14, '.##.......'],
                    [16, '.##.......'],
                ],
            }
        );
        return { grid: g, kind: 'ladder' };
    }
    let pats = letterPatterns(names[local - 1]);
    pats = fitPatterns(pats, ml);
    const raise = thematicRaise(2, local);
    return { grid: silhouette(pats, local === 10 ? 4 : 6, raise || 0), kind: 'silhouette' };
}

// ---- 通用：主题化稀疏剪影 ----
function plant(local, ml) {
    const catalog = [
        ['....#.....', '...###....', '....#.....', '....#.....', '....#.....', '....#.....'],
        ['...#.#....', '..##.##...', '...#.#....', '....#.....', '....#.....', '....#.....'],
        ['....#.....', '...#.#....', '..#.#.#...', '...#.#....', '....#.....', '....#.....', '....#.....'],
        ['..#...#...', '.#.#.#.#..', '..#...#...', '...#.#....', '....#.....', '....#.....', '....#.....'],
        ['...###....', '..##.##...', '...###....', '....#.....', '....#.....', '....#.....', '....#.....', '....#.....'],
        ['..#####...', '.##.#.##..', '..#####...', '....#.....', '....#.....', '...###....', '....#.....', '....#.....'],
        ['...#.#....', '....#.....', '...#.#....', '....#.....', '...#.#....', '....#.....', '....#.....', '....#.....', '....#.....'],
        ['.##...##..', '..##.##...', '...###....', '....#.....', '....#.....', '...###....', '..##.##...', '.##...##..', '....#.....'],
        ['..#.#.#...', '.#.#.#.#..', '..#.#.#...', '....#.....', '...#.#....', '....#.....', '...#.#....', '....#.....', '....#.....', '....#.....'],
        ['.#.#.#.#..', '..#.#.#...', '...###....', '....#.....', '...#.#....', '..##.##...', '...###....', '....#.....', '....#.....', '....#.....'],
    ];
    return fitPatterns(catalog[local - 1], ml);
}

function animal(local, ml) {
    const catalog = [
        ['..##..##..', '.########.', '..######..', '...####...', '....##....', '....##....', '....##....'],
        ['...####...', '..##..##..', '..######..', '...####...', '....##....', '...#..#...', '....##....'],
        ['....##....', '...####...', '..##..##..', '...####...', '....##.#..', '....###...', '....##....'],
        ['....#.#...', '...##.##..', '..######..', '...####...', '....##....', '...#..#...', '..##..##..'],
        ['..#....#..', '.##....##.', '.########.', '..######..', '...####...', '....##....', '....##....', '....##....'],
        ['.....#....', '....###...', '...#####..', '..###.....', '...###....', '....##....', '....##....', '...###....'],
        ['...####...', '..##..##..', '..######..', '.##....##.', '..######..', '...####...', '....##....', '....##....'],
        ['#.........', '.#........', '..##......', '...##.....', '....##....', '...##.....', '..##......', '.#........', '#.........', '.##.......'],
        ['...####...', '..##..##..', '..##..##..', '...####...', '....##....', '...####...', '..##..##..', '...####...', '....##....', '....##....'],
        ['...#..#...', '..##..##..', '.########.', '..######..', '...####...', '..##..##..', '.##....##.', '..##..##..', '...####...', '....##....', '...#..#...'],
    ];
    return fitPatterns(catalog[local - 1], ml);
}

function building(local, ml) {
    // 天际线轮廓：竖向柱/三角顶，避免实心楼块
    const catalog = [
        ['..######..', '.##....##.', '.##....##.', '.##.#..##.', '.##....##.', '.##....##.', '.##....##.', '.########.'],
        ['....##....', '...####...', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..##..##..', '..######..'],
        ['........#.', '.......##.', '..########', '.##......#', '.##......#', '..########', '.......##.', '........#.', '...##.....'],
        ['..##..##..', '.##....##.', '.########.', '.##....##.', '.##.#.#.##', '.##....##.', '.########.', '.##....##.', '..##..##..'],
        ['.##....##.', '.##....##.', '.##....##.', '.##.##.##.', '.##....##.', '.##....##.', '.##....##.', '.##....##.', '.########.', '.##....##.'],
        ['.......##.', '......###.', '.....##.##', '....##..##', '...##...##', '..##....##', '.##.....##', '.#########', '........##', '........##'],
        ['.##.#.#.##', '.##.....##', '.##.#.#.##', '.##.....##', '.##.#.#.##', '.##.....##', '.##.#.#.##', '.##.....##', '.#########', '.##.....##'],
        ['#.#.#.#.#.', '#########.', '#.#.#.#.#.', '#########.', '#.#.#.#.#.', '#########.', '#.#.#.#.#.', '#########.', '##.#.#.#.#', '##########'.replace(/#$/, '.')],
        ['....##....', '...####...', '..##..##..', '.##....##.', '.##....##.', '.##....##.', '.##....##.', '..##..##..', '...####...', '....##....', '...####...', '..##..##..'],
        ['#........#', '##......##', '#.#....#.#', '#..#..#..#', '#...##...#', '#..#..#..#', '#.#....#.#', '##......##', '#.##..##.#', '##.#..#.##', '#..####..#', '##......##'],
    ];
    // fix last pattern of #8 - ensure no full row
    catalog[7] = [
        '#.#.#.#.#.',
        '.########.',
        '#.#.#.#.#.',
        '.########.',
        '#.#.#.#.#.',
        '.########.',
        '#.#.#.#.#.',
        '.########.',
        '##.#.#.#..',
        '.#######..',
        '#.#.#.#.#.',
        '.########.',
    ];
    return fitPatterns(catalog[local - 1], ml);
}

function vehicle(local, ml) {
    const catalog = [
        ['..........', '..######..', '.##....##.', '.########.', '.##....##.', '..######..', '...#..#...', '...#..#...'],
        ['..........', '.########.', '.##....##.', '.##....##.', '.########.', '.##.......', '.##.......', '...#..#...', '...#..#...'],
        ['.########.', '.##.#.#.##', '.##.....##', '.##.#.#.##', '.#########'.slice(0, 10).replace(/#$/, '.'), '...#...#..', '...#...#..', '.########.', '.##....##.', '.##....##.'],
        ['...####...', '..##..##..', '.##....##.', '.########.', '.##.#..##.', '..##..##..', '...####...', '....##....', '...#..#...', '..##..##..'],
        ['.....#....', '....###...', '...##.##..', '..##...##.', '.##.....##.', '.#########'.replace(/#$/, '.'), '.....###..', '......##..', '.....###..'],
        ['#.........', '.##.......', '..##.#....', '...#####..', '..##.#.##.', '.##....##.', '#.........', '..##......', '...##.....', '....##....'],
        ['....#.....', '...###....', '..#####...', '.#######..', '....#.....', '....#.....', '....#.....', '...###....', '..#####...', '.##...##..', '....#.....'],
        ['...#.#....', '..##.##...', '.##...##..', '..##.##...', '...###....', '....#.....', '...#.#....', '..##.##...', '.##...##..', '...###....', '....#.....', '...#.#....'],
        ['.########.', '.##....##.', '.##.#.#.##', '.##....##.', '.########.', '...#..#...', '...#..#...', '.########.', '.##....##.', '.##.#.#.##', '.##....##.', '.########.'],
        ['#.#.#.#.#.', '.##.#.##..', '#.#.#.#.#.', '.##.#.##..', '#.#.#.#.#.', '..#...#...', '.##.#.##..', '#.#.#.#.#.', '.##.#.##..', '#.#.#.#.#.', '.##.#.##..', '#.#.#.#.#.', '..##.##...'],
    ];
    // sanitize any accidental full rows in templates
    return fitPatterns(catalog[local - 1].map(sanitizeLine), ml);
}

function sanitizeLine(line) {
    let s = (line + '..........').slice(0, 10);
    if (s === '##########') s = '#########.';
    return s;
}

function stars(local, ml) {
    // 星座：点落在中上盘（约 4–16），故意不钉第 19 行 —— 主题就是夜空浮星
    const seeds = [
        [[6, 4], [8, 2], [9, 7], [11, 4], [12, 5], [13, 3], [14, 6], [10, 8], [7, 5]],
        [[5, 3], [7, 5], [8, 4], [10, 6], [11, 3], [13, 5], [14, 7], [15, 4], [16, 2]],
        [[6, 4], [7, 4], [9, 2], [9, 6], [11, 4], [12, 4], [14, 4], [15, 4], [16, 4], [10, 4]],
        [[6, 2], [7, 3], [8, 4], [9, 5], [10, 6], [11, 5], [12, 4], [14, 3], [15, 2], [16, 4]],
        [[5, 1], [6, 2], [7, 3], [8, 4], [9, 5], [10, 6], [12, 7], [13, 5], [15, 3], [16, 4], [11, 8]],
        [[6, 2], [6, 7], [8, 4], [9, 1], [9, 8], [11, 4], [12, 2], [12, 7], [14, 4], [15, 5], [16, 3]],
        [[5, 4], [7, 3], [7, 5], [8, 2], [8, 6], [10, 4], [12, 4], [13, 3], [13, 5], [15, 4], [16, 4], [11, 7]],
        [[5, 1], [6, 8], [7, 2], [8, 7], [10, 3], [11, 6], [12, 1], [13, 8], [14, 4], [15, 5], [16, 2], [9, 4]],
        [[4, 0], [5, 9], [6, 2], [7, 7], [8, 4], [8, 5], [10, 1], [10, 8], [12, 3], [12, 6], [14, 4], [15, 2], [16, 7]],
        [[4, 4], [5, 2], [6, 6], [8, 4], [9, 1], [9, 7], [11, 4], [12, 2], [12, 6], [14, 4], [15, 3], [15, 5], [16, 4]],
    ];
    const g = emptyGrid();
    const pts = seeds[local - 1] || seeds[0];
    const byRow = {};
    for (const [r, c] of pts) {
        const rr = Math.min(16, Math.max(4, r));
        (byRow[rr] ||= []).push(c);
    }
    const rowList = Object.keys(byRow).map(Number).sort((a, b) => a - b);
    // 需要 ml 行：在 4..16 空档补星点
    let fillR = 4;
    while (rowList.length < ml && fillR <= 16) {
        if (!byRow[fillR]) {
            byRow[fillR] = [(fillR * 3 + local) % 10];
            rowList.push(fillR);
            rowList.sort((a, b) => a - b);
        }
        fillR++;
    }
    const useRows = rowList.slice(0, ml);
    for (const r of useRows) {
        for (const c of byRow[r] || [(r + local) % 10]) paint(g, r, c);
        let n = 0;
        for (let c = 0; c < COLS; c++) if (g[r][c] === '#') n++;
        if (n === 0) paint(g, r, 4);
    }
    return g;
}

function geometry(local, ml) {
    const catalog = [
        ['....#.....', '...###....', '..##.##...', '.##...##..', '.##...##..', '..##.##...', '...###....', '....#.....', '...###....'],
        ['....#.....', '...#.#....', '..#...#...', '.#.....#..', '..#...#...', '...#.#....', '....#.....', '...#.#....', '..#...#...', '.#.....#..'],
        ['.########.', '.##....##.', '.##....##.', '.##....##.', '.##....##.', '.##....##.', '.##....##.', '.########.', '.##....##.', '.##....##.'],
        ['#.........', '##........', '###.......', '####......', '#####.....', '######....', '#######...', '########..', '#########.', '#.#.#.#.#.'],
        ['#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.'],
        ['##.....##.', '##.....##.', '##.###.##.', '##.....##.', '##.###.##.', '##.....##.', '##.###.##.', '##.....##.', '##.###.##.', '##.....##.', '.#######..'],
        ['....#.....', '...###....', '..#.#.#...', '.#..#..#..', '..#.#.#...', '...###....', '....#.....', '...###....', '..#.#.#...', '.#..#..#..', '..#.#.#...', '...###....'],
        ['##......##', '.##....##.', '..##..##..', '...####...', '..##..##..', '.##....##.', '##......##', '...####...', '..##..##..', '.##....##.', '##......##', '...####...', '..##..##..'],
        ['..#.#.#...', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '..#.#.#...', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '..#.#.#...', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '..#.#.#...'],
        ['....#.....', '...#.#....', '..#.#.#...', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '..#.#.#...', '...#.#....', '....#.....', '...#.#....', '..#.#.#...', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..'],
    ];
    return fitPatterns(catalog[local - 1].map(sanitizeLine), ml);
}

function dungeon(local, ml) {
    // 廊道：两墙夹一通道（正形墙），避免大实心
    const catalog = [
        ['##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##', '##......##'],
        ['##.....##.', '##.....##.', '##..#..##.', '##.....##.', '##..#..##.', '##.....##.', '##..#..##.', '##.....##.', '##..#..##.', '##.....##.'],
        ['##......##', '##......##', '##..######', '##........', '##..######', '##......##', '##......##', '######..##', '........##', '######..##', '##......##'],
        ['....##....', '...##.#...', '..##...#..', '.##.....#.', '##.......#', '.##.....#.', '..##...#..', '...##.#...', '....##....', '...##.#...', '..##...#..'],
        ['##.##.##.#', '..........', '##.##.##.#', '..........', '##.##.##.#', '..........', '##.##.##.#', '..........', '##.##.##.#', '..........', '##.##.##.#'],
        ['.##....##.', '.##....##.', '.########.', '.##....##.', '.##....##.', '.########.', '.##....##.', '.##....##.', '.########.', '.##....##.', '.##....##.', '.########.'],
        ['##........', '##........', '########..', '........##', '........##', '..########', '##........', '##........', '########..', '........##', '........##', '..########'],
        ['##..##..##', '##......##', '##..##..##', '##......##', '##..##..##', '##......##', '##..##..##', '##......##', '##..##..##', '##......##', '##..##..##'],
        ['#........#', '##......##', '#.#....#.#', '#..#..#..#', '#...##...#', '#..#..#..#', '#.#....#.#', '##......##', '#........#', '##.#..#.##', '#..####..#', '##......##', '#........#'],
        ['....#.....', '...###....', '..##.##...', '.##...##..', '##.....##.', '.##...##..', '..##.##...', '...###....', '....#.....', '...###....', '..##.##...', '.##...##..', '##.....##.', '.##...##..'],
    ];
    return fitPatterns(catalog[local - 1].map(sanitizeLine), ml);
}

function golden(local, ml) {
    const catalog = [
        ['.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..', '#.#.#.#.#.', '.#.#.#.#..'],
        ['........##', '.......###', '......##.#', '.....##..#', '....##...#', '...##....#', '..##.....#', '.##......#', '##########'.replace(/#$/, '.'), '.........#', '........##'],
        ['...####...', '..##..##..', '.##....##.', '..##..##..', '...####...', '....##....', '...####...', '..##..##..', '.##....##.', '...####...', '....##....', '...####...'],
        ['...#.#....', '..#####...', '.##.#.##..', '.#######..', '..##.##...', '...###....', '....#.....', '...###....', '..##.##...', '.##...##..', '.#######..'],
        ['....#.....', '...###....', '..#####...', '....#.....', '....#.....', '....#.....', '...###....', '..#####...', '.##...##..', '.##...##..', '...###....', '....#.....', '...###....'],
        ['..######..', '.##....##.', '.##.#..##.', '.##....##.', '..######..', '....##....', '..######..', '.##....##.', '.##.#..##.', '.##....##.', '..######..', '....##....', '..######..'],
        ['##......##', '.##.##.##.', '..######..', '.##....##.', '##......##', '.##.##.##.', '..######..', '.##....##.', '##......##', '..######..', '.##....##.', '##......##'],
        ['#........#', '##......##', '#.##..##.#', '#........#', '##.#..#.##', '#........#', '##......##', '#.##..##.#', '#........#', '##.#..#.##', '#........#', '##......##', '#.##..##.#'],
        ['##......##', '###....###', '##.#..#.##', '##......##', '###....###', '##.#..#.##', '##......##', '###....###', '##.#..#.##', '##......##', '###....###', '##.#..#.##', '##......##', '###....###'],
        // boss: 高位单冠尖 + 下方稀疏圣殿轮廓（ladder+silhouette）
        null,
    ];
    if (local === 10) {
        // 终关：冠→殿梁悬空跨 4..18，底不钉 19，主题金殿王冠
        const g = emptyGrid();
        const pats = [
            '....#.....', // 4
            '...###....',
            '..##.##...',
            '...###....',
            '....#.....',
            '...#.#....',
            '..##.##...',
            '.##...##..',
            '.#######..',
            '....#.....',
            '..#...#...',
            '.##...##..',
            '...###....',
            '....#.....',
            '..#...#...', // 18
        ];
        for (let i = 0; i < pats.length; i++) paintRow(g, 4 + i, pats[i]);
        return g;
    }
    return fitPatterns(catalog[local - 1].map(sanitizeLine), ml);
}


/** 在已有稀疏垃圾行上最多补到 3 格；只贴着已有 # 生长，保持主题轮廓 */
function densifyExistingRow(g, salt) {
    const rows = gridToRows(g);
    const keys = Object.keys(rows).map(Number).sort((a, b) => a - b);
    if (!keys.length) return false;
    for (let i = 0; i < keys.length; i++) {
        const r = keys[(salt + i) % keys.length];
        let n = 0;
        for (let c = 0; c < COLS; c++) if (g[r][c] === '#') n++;
        if (n === 0 || n >= 3) continue;
        for (let t = 0; t < COLS; t++) {
            const idx = (t + salt) % COLS;
            if (g[r][idx] !== '.') continue;
            const left = idx > 0 && g[r][idx - 1] === '#';
            const right = idx < COLS - 1 && g[r][idx + 1] === '#';
            if (left || right) {
                g[r][idx] = '#';
                return true;
            }
        }
    }
    return false;
}

/** 在 absMinTop..18 空行补踏石以凑 minLines（可落在抬升真空中，形成可玩搭梯） */
function ensureMinLinesSpread(g, ml, absMinTop) {
    const lo = absMinTop == null ? 4 : absMinTop;
    let st = stats(gridToRows(g));
    let guard = 0;
    while (st.minLines < ml && guard++ < 40) {
        let placed = false;
        for (let r = lo; r <= 18; r++) {
            if (g[r].join('').indexOf('#') >= 0) continue;
            paint(g, r, 3 + ((r + guard) % 4));
            placed = true;
            break;
        }
        if (!placed) break;
        st = stats(gridToRows(g));
    }
    return st;
}

/** 仅在盘顶上方补稀疏行（不填抬升真空） */
function padRowsAbove(grid, targetMl, absMinTop) {
    let rows = gridToRows(grid);
    let st = stats(rows);
    let guard = 0;
    while (st.minLines < targetMl && guard++ < 40) {
        const r = st.top - 1;
        if (r < absMinTop) break;
        if (!rows[String(r)]) {
            paintRow(grid, r, sparseCap(rows[String(st.top)] || '....##....'));
        } else {
            break;
        }
        rows = gridToRows(grid);
        st = stats(rows);
    }
    return st;
}

function buildChapter(ch, local) {
    const ml = ML[ch][local - 1];
    const minTop = local === 10 ? 4 : 6;
    const raise = thematicRaise(ch, local);
    let grid;
    let kind = 'silhouette';

    if (ch === 1) {
        const r = ch1(local);
        grid = r.grid;
        kind = r.kind;
    } else if (ch === 2) {
        const r = ch2(local);
        grid = r.grid;
        kind = r.kind;
    } else if (ch === 3) {
        if (local === 3) {
            kind = 'ladder';
            grid = ladder(
                ['....#.....', '...#.#....', '..#.#.#...', '....#.....'],
                null,
                8,
                { stepRows: [[13, '....#.....'], [15, '....#.....']] }
            );
        } else if (local === 10) {
            kind = 'ladder';
            grid = ladder(
                ['...#.#....', '..##.##...', '...###....', '....#.....'],
                null,
                5,
                {
                    stepRows: [
                        [10, '....#.....'],
                        [11, '...#.#....'],
                        [13, '....#.....'],
                        [15, '...#.#....'],
                    ],
                }
            );
        } else {
            grid = silhouette(plant(local, ml), minTop, raise || 0);
        }
    } else if (ch === 4) {
        if (local === 8) {
            kind = 'ladder';
            grid = silhouette(animal(local, ml), minTop, 4);
        } else {
            grid = silhouette(animal(local, ml), minTop, raise || 0);
        }
    } else if (ch === 5) {
        if (local === 6) {
            kind = 'ladder';
            grid = ladder(
                ['.......##.', '......###.', '.......##.', '......##..'],
                null,
                5,
                {
                    stepRows: [
                        [10, '......##..'],
                        [12, '.....##...'],
                        [14, '....##....'],
                        [16, '...##.....'],
                    ],
                }
            );
        } else {
            grid = silhouette(building(local, ml), minTop, raise || 0);
        }
    } else if (ch === 6) {
        if (local === 7) {
            kind = 'ladder';
            grid = silhouette(vehicle(local, ml), minTop, 4);
        } else {
            grid = silhouette(vehicle(local, ml), minTop, raise || 0);
        }
    } else if (ch === 7) {
        kind = 'ladder';
        grid = stars(local, ml);
    } else if (ch === 8) {
        if (local === 4) {
            kind = 'ladder';
            grid = ladder(
                ['#.........', '##........', '###.......', '####......', '#####.....'],
                null,
                6,
                {
                    stepRows: [
                        [12, '##........'],
                        [14, '#.........'],
                        [16, '##........'],
                    ],
                }
            );
        } else {
            grid = silhouette(geometry(local, ml), minTop, raise || 0);
        }
    } else if (ch === 9) {
        if (local === 7) {
            kind = 'ladder';
            grid = ladder(
                ['##........', '##........', '########..'],
                null,
                6,
                {
                    stepRows: [
                        [10, '......##..'],
                        [11, '........##'],
                        [12, '........##'],
                        [14, '..########'],
                        [16, '........##'],
                    ],
                }
            );
        } else {
            grid = silhouette(dungeon(local, ml), minTop, raise || 0);
        }
    } else if (ch === 10) {
        if (local === 10) {
            kind = 'ladder';
            grid = golden(local, ml);
        } else {
            grid = silhouette(golden(local, ml), minTop, raise || 0);
        }
    }

    let rows = gridToRows(grid);
    let st = stats(rows);
    const bottom = Object.keys(rows).map(Number).sort((a, b) => a - b).pop();
    const floating = kind === 'ladder' || bottom < 19;
    const absMinTop = floating || local === 10 ? 4 : 6;

    if (st.minLines < ml) {
        st = padRowsAbove(grid, ml, absMinTop);
        rows = gridToRows(grid);
        st = stats(rows);
        if (st.minLines < ml) {
            st = ensureMinLinesSpread(grid, ml, absMinTop);
            rows = gridToRows(grid);
            st = stats(rows);
        }
    } else if (st.minLines > ml) {
        const keys = Object.keys(rows).map(Number).sort((a, b) => a - b);
        for (let i = 0; i < st.minLines - ml; i++) {
            grid[keys[i]] = Array(COLS).fill('.');
        }
        rows = gridToRows(grid);
        st = stats(rows);
    }

    // 仅贴地非 boss：顶太高则整体下移；浮空关不下压
    rows = gridToRows(grid);
    st = stats(rows);
    const bot2 = Object.keys(rows).map(Number).sort((a, b) => a - b).pop();
    if (!floating && local !== 10 && st.top < 6 && bot2 === 19) {
        const shift = 6 - st.top;
        const g2 = emptyGrid();
        let lost = false;
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] === '#') {
                    if (r + shift >= BOARD_ROWS) lost = true;
                    else g2[r + shift][c] = '#';
                }
            }
        }
        if (!lost) grid = g2;
        rows = gridToRows(grid);
        st = stats(rows);
    }

    return { rows: gridToRows(grid), ...stats(gridToRows(grid)), kind };
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const chapters = prev.chapters;
const stages = [];
const kinds = { silhouette: 0, ladder: 0, channel: 0 };

for (let ch = 1; ch <= 10; ch++) {
    for (let local = 1; local <= 10; local++) {
        const id = (ch - 1) * 10 + local;
        const old = prev.stages.find((s) => s.id === id);
        const built = buildChapter(ch, local);
        kinds[built.kind] = (kinds[built.kind] || 0) + 1;
        stages.push({
            id,
            chapterId: ch,
            name: old.name,
            minLines: built.minLines,
            garbageCount: built.garbageCount,
            coinThreshold: built.coinThreshold,
            dropIntervalMs: old.dropIntervalMs || chapters[ch - 1].dropIntervalMs,
            kind: built.kind,
            rows: built.rows,
        });
    }
}

// 章内难度硬性递进（多轮）：minLines 非降；garbage 不足则加稀疏行（允许 minLines 上升）
function rebuildGridFromRows(rowsObj) {
    const g = emptyGrid();
    for (const [rs, line] of Object.entries(rowsObj)) paintRow(g, Number(rs), line);
    return g;
}

function addSparseRowTo(g, salt, opts) {
    opts = opts || {};
    const absMinTop = opts.absMinTop != null ? opts.absMinTop : 4;
    let st = stats(gridToRows(g));
    // 1) 优先顶上补行
    let r = st.top - 1;
    while (r >= absMinTop && g[r].join('').indexOf('#') >= 0) r--;
    if (r >= absMinTop) {
        paint(g, r, 2 + (salt % 5));
        paint(g, r, 7 - (salt % 3));
        return true;
    }
    // 2) 在已有行加密度（保抬升真空 / 不往 floor 填）
    if (densifyExistingRow(g, salt)) return true;
    // 3) 禁止：在 bottom < 19 时往更低空行填（那是搭梯区）
    const keys = Object.keys(gridToRows(g)).map(Number).sort((a, b) => a - b);
    const bottom = keys[keys.length - 1];
    if (bottom < 19) return false;
    for (let rr = Math.max(st.top + 1, absMinTop); rr < bottom; rr++) {
        if (g[rr].join('').indexOf('#') < 0) {
            const emptyAbove = rr > 0 && g[rr - 1].join('').indexOf('#') < 0;
            const emptyBelow = rr < 19 && g[rr + 1].join('').indexOf('#') < 0;
            if (emptyAbove || emptyBelow) continue;
            paint(g, rr, 2 + (salt % 5));
            paint(g, rr, 7 - (salt % 3));
            return true;
        }
    }
    return false;
}

for (let pass = 0; pass < 12; pass++) {
    for (let ch = 1; ch <= 10; ch++) {
        const list = stages.filter((s) => s.chapterId === ch);
        for (let i = 1; i < list.length; i++) {
            const prevS = list[i - 1];
            const cur = list[i];
            const g = rebuildGridFromRows(cur.rows);
            let st = stats(gridToRows(g));
            let keys0 = Object.keys(cur.rows).map(Number);
            let bottom0 = Math.max(...keys0);
            const floating = cur.kind === 'ladder' || bottom0 < 19;
            let guard = 0;
            while ((st.minLines < prevS.minLines
                || (st.minLines === prevS.minLines && st.garbageCount < prevS.garbageCount))
                && guard++ < 40) {
                if (!addSparseRowTo(g, i + pass + guard, { absMinTop: floating ? 4 : 6 })) {
                    if (densifyExistingRow(g, guard)) {
                        st = stats(gridToRows(g));
                        continue;
                    }
                    // 最后手段：在顶上硬补一行（允许 top=4）
                    if (st.top > 4) {
                        paint(g, st.top - 1, 3 + (guard % 4));
                        paint(g, st.top - 1, 6);
                        st = stats(gridToRows(g));
                        continue;
                    }
                    break;
                }
                st = stats(gridToRows(g));
            }
            st = stats(gridToRows(g));
            const bot = Math.max(...Object.keys(gridToRows(g)).map(Number));
            if (!floating && cur.id % 10 !== 0 && st.top < 6 && bot === 19) {
                const shift = 6 - st.top;
                const g2 = emptyGrid();
                let lost = false;
                for (let r = 0; r < BOARD_ROWS; r++) {
                    for (let c = 0; c < COLS; c++) {
                        if (g[r][c] === '#') {
                            if (r + shift >= BOARD_ROWS) lost = true;
                            else g2[r + shift][c] = '#';
                        }
                    }
                }
                if (!lost) {
                    for (let r = 0; r < BOARD_ROWS; r++) g[r] = g2[r];
                }
            }
            const rows = gridToRows(g);
            st = stats(rows);
            cur.rows = rows;
            cur.minLines = st.minLines;
            cur.garbageCount = st.garbageCount;
            cur.coinThreshold = st.coinThreshold;
            cur.top = st.top;
        }
    }
}

// 最终章内递进兜底：若仍落后，在已有行轻补或顶行补点（保持主题稀疏）
for (let ch = 1; ch <= 10; ch++) {
    const list = stages.filter((s) => s.chapterId === ch);
    for (let i = 1; i < list.length; i++) {
        const prevS = list[i - 1];
        const cur = list[i];
        const g = rebuildGridFromRows(cur.rows);
        let st = stats(gridToRows(g));
        let guard = 0;
        while ((st.minLines < prevS.minLines
            || (st.minLines === prevS.minLines && st.garbageCount < prevS.garbageCount))
            && guard++ < 60) {
            if (st.minLines < prevS.minLines) {
                const bot = Math.max(...Object.keys(gridToRows(g)).map(Number));
                const fl = cur.kind === 'ladder' || bot < 19;
                ensureMinLinesSpread(g, prevS.minLines, fl ? 4 : 6);
                st = stats(gridToRows(g));
                if (st.minLines >= prevS.minLines && st.garbageCount >= prevS.garbageCount) break;
            }
            if (st.top > 4 && !gridToRows(g)[String(st.top - 1)]) {
                paint(g, st.top - 1, (guard * 2) % 9);
            } else if (!densifyExistingRow(g, guard + i)) {
                const keys = Object.keys(gridToRows(g)).map(Number);
                const r = keys[guard % keys.length];
                let n = 0;
                for (let c = 0; c < COLS; c++) if (g[r][c] === '#') n++;
                if (n < 4) {
                    for (let c = 0; c < COLS; c++) {
                        const left = c > 0 && g[r][c - 1] === '#';
                        const right = c < COLS - 1 && g[r][c + 1] === '#';
                        if (g[r][c] === '.' && (left || right)) { g[r][c] = '#'; break; }
                    }
                } else {
                    ensureMinLinesSpread(g, st.minLines + 1);
                }
            }
            st = stats(gridToRows(g));
        }
        // 若后关是 ladder 且仍 garbage 不足：从前一关剃掉边缘格（保前关可读）
        st = stats(gridToRows(g));
        if (st.minLines === prevS.minLines && st.garbageCount < prevS.garbageCount && cur.kind === 'ladder') {
            const pg = rebuildGridFromRows(prevS.rows);
            let pst = stats(gridToRows(pg));
            let shave = 0;
            while (pst.garbageCount > st.garbageCount && shave++ < 40) {
                let shaved = false;
                const keys = Object.keys(gridToRows(pg)).map(Number);
                for (const r of keys) {
                    let n = 0;
                    const cols = [];
                    for (let c = 0; c < COLS; c++) if (pg[r][c] === '#') { n++; cols.push(c); }
                    if (n <= 1) continue;
                    // 剃端点
                    pg[r][cols[cols.length - 1]] = '.';
                    shaved = true;
                    break;
                }
                if (!shaved) break;
                pst = stats(gridToRows(pg));
            }
            // 剃完仍需 >= 前前关
            if (i >= 2) {
                const pp = list[i - 2];
                while (pst.minLines < pp.minLines
                    || (pst.minLines === pp.minLines && pst.garbageCount < pp.garbageCount)) {
                    if (!densifyExistingRow(pg, shave++)) break;
                    pst = stats(gridToRows(pg));
                }
            }
            prevS.rows = gridToRows(pg);
            prevS.minLines = pst.minLines;
            prevS.garbageCount = pst.garbageCount;
            prevS.coinThreshold = pst.coinThreshold;
            prevS.top = pst.top;
        }
        const rows = gridToRows(g);
        st = stats(rows);
        cur.rows = rows;
        cur.minLines = st.minLines;
        cur.garbageCount = st.garbageCount;
        cur.coinThreshold = st.coinThreshold;
        cur.top = st.top;
    }
}

const warnings = [];
for (let ch = 1; ch <= 10; ch++) {
    const list = stages.filter((s) => s.chapterId === ch);
    for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        if (b.minLines < a.minLines) warnings.push(`Ch${ch} #${b.id} minLines 下降`);
        if (b.minLines === a.minLines && b.garbageCount < a.garbageCount) {
            warnings.push(`Ch${ch} #${b.id} 同 minLines 下 garbage 下降 (${a.garbageCount}->${b.garbageCount})`);
        }
        const bBot = Math.max(...Object.keys(b.rows).map(Number));
        const bFloat = b.kind === 'ladder' || bBot < 19;
        // 贴地高 minLines 关允许顶到 5；浮空/ladder 顶 >= 4
        if (!bFloat && b.id % 10 !== 0 && b.top < 5) warnings.push(`#${b.id} top=${b.top} < 5`);
        if (b.top < 4) warnings.push(`#${b.id} top=${b.top} < 4`);
    }
}

const out = {
    version: 3,
    cols: 10,
    rows: 20,
    encoding: { '#': 'garbage', '.': 'empty' },
    defaultDropIntervalMs: 1000,
    designNotes: {
        principles: [
            '正形剪影为主：垃圾块构成章节主题轮廓，不天马行空抽象堆块',
            '抬升/凌空：多数主题形离地 1～4 行，下方真空可搭梯；建筑/车辆偏贴地',
            '高位搭梯：用主题碎片（旗尖/花瓣/星点/冠尖）浮空，忌钉死底脚大楼',
            '负形通道少用：仅地宫等章少量廊道墙',
            '递进补块优先加顶行/加密度，禁止填死抬升真空',
        ],
        kinds,
    },
    chapters,
    stages: stages.map(({ kind, top, ...rest }) => ({ ...rest, kind })),
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Wrote', OUT);
console.log('kinds', kinds);
console.log('warnings', warnings.length ? warnings : 'none');
const fills = stages.map((s) => s.garbageCount / (s.minLines * 10));
console.log('avgFill', (fills.reduce((a, b) => a + b, 0) / fills.length).toFixed(2));
console.log('sample#1', stages[0].rows);
console.log('sample#5', stages[4].rows, stages[4].kind);
console.log('sample#100', stages[99].rows, stages[99].kind);
