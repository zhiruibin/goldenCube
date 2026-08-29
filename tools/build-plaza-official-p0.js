/**
 * 生成广场官方精选 P0（30 关：冷兵器 / 花瓣 / 叶子）
 * 运行：node tools/build-plaza-official-p0.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const workshop = require('../utils/workshop-manager');

/** 将剪影行放到棋盘：topRow 起贴（须 ≥6） */
function place(lines, topRow) {
    const rows = workshop.emptyRows();
    const start = Math.max(6, topRow | 0);
    for (let i = 0; i < lines.length; i++) {
        const y = start + i;
        if (y > 19) break;
        let line = String(lines[i] || '').slice(0, 10);
        while (line.length < 10) line += '.';
        rows[String(y)] = line;
    }
    return rows;
}

function compact(rows) {
    const out = {};
    Object.keys(rows).forEach((k) => {
        if (String(rows[k]).indexOf('#') >= 0) out[k] = rows[k];
    });
    return out;
}

/** @type {{ title: string, seriesId: string, seriesIndex: number, tags: string[], top: number, lines: string[] }[]} */
const DEFS = [
    // —— 冷兵器馆 ——
    {
        title: '短匕', seriesId: 'weapons', seriesIndex: 1, tags: ['冷兵器', '剪影'], top: 10,
        lines: [
            '.....#....',
            '....###...',
            '....###...',
            '.....#....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '柳叶刀', seriesId: 'weapons', seriesIndex: 2, tags: ['冷兵器', '剪影'], top: 9,
        lines: [
            '.....#....',
            '....##....',
            '...####...',
            '...####...',
            '....##....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '青龙偃月', seriesId: 'weapons', seriesIndex: 3, tags: ['冷兵器', '剪影'], top: 8,
        lines: [
            '...####...',
            '..##..##..',
            '.##.......',
            '.##.......',
            '..##..##..',
            '...####...',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '方天画戟', seriesId: 'weapons', seriesIndex: 4, tags: ['冷兵器', '剪影'], top: 7,
        lines: [
            '.....#....',
            '...#####..',
            '..##.#.##.',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '....###...',
            '...#####..',
        ],
    },
    {
        title: '九齿钉耙', seriesId: 'weapons', seriesIndex: 5, tags: ['冷兵器', '剪影'], top: 8,
        lines: [
            '#.#.#.#.#.',
            '#########.',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '如意金箍棒', seriesId: 'weapons', seriesIndex: 6, tags: ['冷兵器', '剪影'], top: 6,
        lines: [
            '...#####..',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '...#####..',
        ],
    },
    {
        title: '火尖枪', seriesId: 'weapons', seriesIndex: 7, tags: ['冷兵器', '搭梯'], top: 7,
        lines: [
            '.....#....',
            '....###...',
            '...#.#.#..',
            '.....#....',
            '.....#....',
            '..........',
            '.....#....',
            '.....#....',
            '.....###..',
            '....#####.',
        ],
    },
    {
        title: '双股剑', seriesId: 'weapons', seriesIndex: 8, tags: ['冷兵器', '剪影'], top: 8,
        lines: [
            '..#....#..',
            '..#....#..',
            '..##..##..',
            '..##..##..',
            '..#....#..',
            '..#....#..',
            '..#....#..',
            '.###..###.',
        ],
    },
    {
        title: '霸王枪', seriesId: 'weapons', seriesIndex: 9, tags: ['冷兵器', '剪影'], top: 6,
        lines: [
            '....###...',
            '...#####..',
            '..###.###.',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '....###...',
            '...#####..',
            '..#######.',
        ],
    },
    {
        title: '盘古斧', seriesId: 'weapons', seriesIndex: 10, tags: ['冷兵器', '剪影'], top: 7,
        lines: [
            '..#######.',
            '.#########',
            '.###...###',
            '..##...##.',
            '.....#....',
            '.....#....',
            '.....#....',
            '.....#....',
            '....###...',
            '...#####..',
        ],
    },

    // —— 花瓣谱 ——
    {
        title: '三叶草', seriesId: 'petals', seriesIndex: 1, tags: ['花瓣', '剪影'], top: 10,
        lines: [
            '...#.#....',
            '..#####...',
            '...###....',
            '..#####...',
            '...#.#....',
            '.....#....',
            '.....#....',
        ],
    },
    {
        title: '四叶草', seriesId: 'petals', seriesIndex: 2, tags: ['花瓣', '剪影'], top: 9,
        lines: [
            '...#.#....',
            '..##.##...',
            '..#####...',
            '...###....',
            '..#####...',
            '..##.##...',
            '...#.#....',
            '.....#....',
        ],
    },
    {
        title: '桃花', seriesId: 'petals', seriesIndex: 3, tags: ['花瓣', '剪影'], top: 9,
        lines: [
            '..##.##...',
            '.##...##..',
            '.##.#.##..',
            '..#####...',
            '...###....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '梅花', seriesId: 'petals', seriesIndex: 4, tags: ['花瓣', '剪影'], top: 8,
        lines: [
            '....#.....',
            '..##.##...',
            '.##...##..',
            '.##.#.##..',
            '..#####...',
            '...###....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '向日葵盘', seriesId: 'petals', seriesIndex: 5, tags: ['花瓣', '剪影'], top: 8,
        lines: [
            '...####...',
            '..##..##..',
            '.##....##.',
            '.##.##.##.',
            '.##....##.',
            '..##..##..',
            '...####...',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '郁金香', seriesId: 'petals', seriesIndex: 6, tags: ['花瓣', '剪影'], top: 8,
        lines: [
            '..##.##...',
            '.########.',
            '.########.',
            '..######..',
            '...####...',
            '.....#....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '莲瓣', seriesId: 'petals', seriesIndex: 7, tags: ['花瓣', '剪影'], top: 9,
        lines: [
            '....##....',
            '...####...',
            '..##..##..',
            '.##....##.',
            '..##..##..',
            '...####...',
            '....##....',
            '.....#....',
        ],
    },
    {
        title: '菊花', seriesId: 'petals', seriesIndex: 8, tags: ['花瓣', '剪影'], top: 8,
        lines: [
            '.#.#.#.#.#',
            '..#.#.#.#.',
            '.#.#.#.#.#',
            '..#######.',
            '...#####..',
            '....###...',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '风车花', seriesId: 'petals', seriesIndex: 9, tags: ['花瓣', '剪影'], top: 8,
        lines: [
            '##.....##.',
            '.##...##..',
            '..##.##...',
            '...###....',
            '..##.##...',
            '.##...##..',
            '##.....##.',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '花环', seriesId: 'petals', seriesIndex: 10, tags: ['花瓣', '剪影'], top: 8,
        lines: [
            '..##.##...',
            '.##...##..',
            '##.....##.',
            '#.......#.',
            '##.....##.',
            '.##...##..',
            '..##.##...',
            '.....#....',
            '...#####..',
            '..#######.',
        ],
    },

    // —— 叶子志 ——
    {
        title: '柳叶', seriesId: 'leaves', seriesIndex: 1, tags: ['叶子', '剪影'], top: 9,
        lines: [
            '.....#....',
            '....##....',
            '...###....',
            '...###....',
            '....##....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '枫叶', seriesId: 'leaves', seriesIndex: 2, tags: ['叶子', '剪影'], top: 9,
        lines: [
            '#...#...#.',
            '.##.#.##..',
            '..#####...',
            '...###....',
            '..#####...',
            '.##.#.##..',
            '.....#....',
            '.....#....',
        ],
    },
    {
        title: '银杏', seriesId: 'leaves', seriesIndex: 3, tags: ['叶子', '剪影'], top: 9,
        lines: [
            '..#####...',
            '.#######..',
            '.##...##..',
            '..##.##...',
            '...###....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '芭蕉', seriesId: 'leaves', seriesIndex: 4, tags: ['叶子', '剪影'], top: 8,
        lines: [
            '.....#....',
            '....###...',
            '...#####..',
            '..###.###.',
            '.###...###',
            '..###.###.',
            '...#####..',
            '....###...',
            '.....#....',
        ],
    },
    {
        title: '竹叶', seriesId: 'leaves', seriesIndex: 5, tags: ['叶子', '剪影'], top: 8,
        lines: [
            '....##....',
            '...###....',
            '..###.....',
            '...###....',
            '....###...',
            '...###....',
            '..###.....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '棕榈', seriesId: 'leaves', seriesIndex: 6, tags: ['叶子', '剪影'], top: 8,
        lines: [
            '#.#.#.#.#.',
            '.#########',
            '..#######.',
            '...#####..',
            '....###...',
            '.....#....',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '落叶堆', seriesId: 'leaves', seriesIndex: 7, tags: ['叶子', '剪影'], top: 11,
        lines: [
            '..#..#.#..',
            '.##.##.##.',
            '.########.',
            '..######..',
            '...####...',
            '....##....',
        ],
    },
    {
        title: '叶脉', seriesId: 'leaves', seriesIndex: 8, tags: ['叶子', '剪影'], top: 8,
        lines: [
            '.....#....',
            '...#.#.#..',
            '..#..#..#.',
            '.#...#...#',
            '..#..#..#.',
            '...#.#.#..',
            '.....#....',
            '.....#....',
            '....###...',
        ],
    },
    {
        title: '双叶对生', seriesId: 'leaves', seriesIndex: 9, tags: ['叶子', '剪影'], top: 9,
        lines: [
            '.##....##.',
            '####..####',
            '.##....##.',
            '....##....',
            '....##....',
            '.##....##.',
            '####..####',
            '.##....##.',
        ],
    },
    {
        title: '秋林', seriesId: 'leaves', seriesIndex: 10, tags: ['叶子', '剪影'], top: 8,
        lines: [
            '.#..#..#..',
            '###.###.##',
            '.#..#..#..',
            '..#...#...',
            '.###.###..',
            '..#...#...',
            '...#.#....',
            '..#####...',
            '...###....',
            '....#.....',
        ],
    },
];

function build() {
    const now = Date.now();
    const stages = [];
    const errors = [];

    DEFS.forEach((def, i) => {
        const rank = i + 1;
        const rowsFull = place(def.lines, def.top);
        const v = workshop.validateLayout(rowsFull);
        if (!v.ok) {
            errors.push(def.title + ': ' + v.reason);
            return;
        }
        const meta = v.meta;
        const rows = compact(rowsFull);
        const hash = workshop.layoutHash(rowsFull);
        const fee = workshop.getPlayFee(meta);
        stages.push({
            stageId: 'official_plaza_' + String(rank).padStart(3, '0'),
            source: 'official',
            featured: true,
            featuredRank: rank,
            title: def.title,
            authorName: '官方',
            authorOpenid: '',
            authorAvatar: '',
            status: 'published',
            tags: def.tags,
            seriesId: def.seriesId,
            seriesIndex: def.seriesIndex,
            rows,
            layoutHash: hash,
            minLines: meta.minLines,
            garbageCount: meta.garbageCount,
            coinThreshold: meta.minLines * 2,
            dropIntervalMs: 1000,
            playFee: fee,
            authorBest: {
                lines: meta.minLines,
                pieces: 0,
                timeMs: 0,
                clearedAt: now,
                layoutHash: hash,
            },
            stats: { playCount: 0, clearCount: 0, challengeSendCount: 0, likeCount: 0 },
            heatScore: 0,
            publishedAt: now - (30 - rank) * 60000,
            createdAt: now,
            updatedAt: now,
        });
    });

    if (errors.length) {
        console.error('VALIDATION FAILED');
        errors.forEach((e) => console.error('  ', e));
        process.exit(1);
    }

    const out = {
        version: 1,
        pack: 'P0',
        note: '冷兵器10 + 花瓣10 + 叶子10',
        generatedAt: new Date().toISOString(),
        stages,
    };
    const destJson = path.join(__dirname, '../data/plaza-official-v1.json');
    const destJs = path.join(__dirname, '../data/plaza-official-v1.js');
    fs.writeFileSync(destJson, JSON.stringify(out, null, 2), 'utf8');
    const jsBody = [
        '/**',
        ' * data/plaza-official-v1.js - 广场官方精选（P0）',
        " * 微信小游戏不能 require('.json')，须用 .js 模块导出。",
        ' * 由 tools/build-plaza-official-p0.js 生成，请勿手改。',
        ' */',
        "'use strict';",
        '',
        'module.exports = ' + JSON.stringify(out, null, 2) + ';',
        '',
    ].join('\n');
    fs.writeFileSync(destJs, jsBody, 'utf8');
    console.log('Wrote', destJson, 'and', destJs, 'stages=', stages.length);
    const fees = { 8: 0, 12: 0, 16: 0 };
    stages.forEach((s) => { fees[s.playFee] = (fees[s.playFee] || 0) + 1; });
    console.log('fee tiers', fees);
}

build();
