/*** 皮肤配置数据
 * 包含方块皮肤、棋盘皮肤、音效包的定义
 *
 * 2025-08 经济平衡调整：可购商品提价，锚定「每日 600 金币上限 + 消行 1/2/3/5」产出
 *  - 入门档（第一局可买甜点）：150-300
 *  - 中档（1 天攒齐）：400-600
 *  - 高档（1-2 天攒齐）：1000
 *  - 最贵 gold（2-3 天攒齐 + 技术证明）：2000
 *  - 可购总价约 8950，全收集约 15 天满勤
 */

/** 方块皮肤列表 */
const blockSkins = [
  {
    id: 'default',
    name: '经典',
    price: 0,
    unlockCondition: 'default',
    description: '经典街机配色',
    colors: {
      I: '#00f0f0',
      O: '#f0f000',
      T: '#a000f0',
      S: '#00f000',
      Z: '#f00000',
      J: '#0000f0',
      L: '#f0a000'
    }
  },
  {
    id: 'neon',
    name: '霓虹',
    price: 400,
    unlockCondition: 'purchase',
    description: '赛博朋克霓虹发光（可选风格）',
    colors: {
      I: '#00ffff',
      O: '#ffff00',
      T: '#ff00ff',
      S: '#00ff66',
      Z: '#ff0044',
      J: '#4400ff',
      L: '#ff8800'
    },
    glow: true
  },
  {
    id: 'wood',
    name: '木纹',
    price: 500,
    unlockCondition: 'purchase',
    description: '温暖自然的木纹质感',
    colors: {
      I: '#c8a882',
      O: '#d4b896',
      T: '#a07850',
      S: '#b89870',
      Z: '#8b6840',
      J: '#9c7c5c',
      L: '#c4a070'
    },
    texture: 'wood'
  },
  {
    id: 'gradient',
    name: '渐变',
    price: 450,
    unlockCondition: 'purchase',
    description: '柔和的渐变色彩',
    colors: {
      I: ['#00c6ff', '#0072ff'],
      O: ['#f7971e', '#ffd200'],
      T: ['#a855f7', '#6366f1'],
      S: ['#11998e', '#38ef7d'],
      Z: ['#eb3349', '#f45c43'],
      J: ['#4f46e5', '#7c3aed'],
      L: ['#f97316', '#ef4444']
    },
    gradient: true
  },
  {
    id: 'pastel',
    name: '马卡龙',
    price: 300,
    unlockCondition: 'purchase',
    description: '清新甜美的马卡龙色系',
    colors: {
      I: '#a8e6cf',
      O: '#ffd3b6',
      T: '#d4a5ff',
      S: '#b5ead7',
      Z: '#ffaaa5',
      J: '#a0c4ff',
      L: '#ffcfdf'
    }
  },
  {
    id: 'crystal',
    name: '水晶',
    price: 1000,
    unlockCondition: 'purchase',
    description: '晶莹剔透的水晶方块',
    colors: {
      I: '#e0f7fa',
      O: '#fff9c4',
      T: '#f3e5f5',
      S: '#e8f5e9',
      Z: '#fce4ec',
      J: '#e8eaf6',
      L: '#fff3e0'
    },
    texture: 'crystal',
    transparency: 0.7
  },
  {
    id: 'pixel',
    name: '像素',
    price: 0,
    unlockCondition: 'stages_cleared_10',
    description: '主线闯关累计通关10关解锁',
    colors: {
      I: '#22d3ee',
      O: '#facc15',
      T: '#c084fc',
      S: '#4ade80',
      Z: '#f87171',
      J: '#60a5fa',
      L: '#fb923c'
    },
    texture: 'pixel'
  },
  {
    id: 'gold',
    name: '黄金',
    price: 2000,
    unlockCondition: 'purchase',
    description: '尊贵华丽的黄金方块',
    colors: {
      I: '#ffd700',
      O: '#ffec8b',
      T: '#daa520',
      S: '#f0c040',
      Z: '#cd950c',
      J: '#eec900',
      L: '#eeb422'
    },
    texture: 'metallic',
    shimmer: true
  }
];

/** 棋盘皮肤列表 */
const boardSkins = [
  {
    id: 'default',
    name: '经典',
    price: 0,
    unlockCondition: 'default',
    description: '夜场街机深色棋盘',
    style: {
      background: '#161d30',
      gridColor: 'rgba(255, 245, 230, 0.16)',
      borderColor: '#243050',
      gridLineWidth: 1
    }
  },
  {
    id: 'starry',
    name: '星空',
    price: 400,
    unlockCondition: 'purchase',
    description: '深邃的星空背景',
    style: {
      background: '#0b0d17',
      gridColor: 'rgba(255, 255, 255, 0.18)',
      borderColor: '#1a1a3e',
      gridLineWidth: 1
    },
    effect: 'stars'
  },
  {
    id: 'ocean',
    name: '海洋',
    price: 450,
    unlockCondition: 'purchase',
    description: '宁静的深海主题',
    style: {
      background: '#0a192f',
      gridColor: 'rgba(100, 200, 255, 0.22)',
      borderColor: '#112240',
      gridLineWidth: 1
    },
    effect: 'bubbles'
  },
  {
    id: 'matrix',
    name: '矩阵',
    price: 500,
    unlockCondition: 'purchase',
    description: '黑客帝国数字雨',
    style: {
      background: '#000000',
      gridColor: 'rgba(0, 255, 0, 0.20)',
      borderColor: '#003300',
      gridLineWidth: 1
    },
    effect: 'matrix'
  },
  {
    id: 'sakura',
    name: '樱花',
    price: 600,
    unlockCondition: 'purchase',
    description: '浪漫的樱花飘落',
    style: {
      background: '#2d1b33',
      gridColor: 'rgba(255, 182, 193, 0.22)',
      borderColor: '#3d1b43',
      gridLineWidth: 1
    },
    effect: 'sakura'
  },
  {
    id: 'minimal',
    name: '极简',
    price: 0,
    unlockCondition: 'games_50',
    description: '累计对局50场解锁',
    style: {
      background: '#ffffff',
      gridColor: 'rgba(0, 0, 0, 0.18)',
      borderColor: '#e0e0e0',
      gridLineWidth: 1
    }
  },
  {
    id: 'lava',
    name: '熔岩',
    price: 1000,
    unlockCondition: 'purchase',
    description: '炽热的熔岩流动',
    style: {
      background: '#1a0000',
      gridColor: 'rgba(255, 80, 0, 0.22)',
      borderColor: '#330000',
      gridLineWidth: 1
    },
    effect: 'lava'
  }
];

/** 音效包列表 */
const soundPacks = [
  {
    id: 'default',
    name: '经典',
    price: 0,
    unlockCondition: 'default',
    description: '原版俄罗斯方块音效',
    files: {
      move: 'default_move.mp3',
      rotate: 'default_rotate.mp3',
      drop: 'default_drop.mp3',
      clear: 'default_clear.mp3',
      tetris: 'default_tetris.mp3',
      levelUp: 'default_levelup.mp3',
      gameOver: 'default_gameover.mp3',
      hold: 'default_hold.mp3'
    }
  },
  {
    id: 'retro',
    name: '复古',
    price: 200,
    unlockCondition: 'purchase',
    description: '8-bit 像素风音效',
    files: {
      move: 'retro_move.mp3',
      rotate: 'retro_rotate.mp3',
      drop: 'retro_drop.mp3',
      clear: 'retro_clear.mp3',
      tetris: 'retro_tetris.mp3',
      levelUp: 'retro_levelup.mp3',
      gameOver: 'retro_gameover.mp3',
      hold: 'retro_hold.mp3'
    }
  },
  {
    id: 'piano',
    name: '钢琴',
    price: 400,
    unlockCondition: 'purchase',
    description: '优雅的钢琴音色',
    files: {
      move: 'piano_move.mp3',
      rotate: 'piano_rotate.mp3',
      drop: 'piano_drop.mp3',
      clear: 'piano_clear.mp3',
      tetris: 'piano_tetris.mp3',
      levelUp: 'piano_levelup.mp3',
      gameOver: 'piano_gameover.mp3',
      hold: 'piano_hold.mp3'
    }
  },
  {
    id: 'electronic',
    name: '电子',
    price: 450,
    unlockCondition: 'purchase',
    description: '电子合成器音效',
    files: {
      move: 'electronic_move.mp3',
      rotate: 'electronic_rotate.mp3',
      drop: 'electronic_drop.mp3',
      clear: 'electronic_clear.mp3',
      tetris: 'electronic_tetris.mp3',
      levelUp: 'electronic_levelup.mp3',
      gameOver: 'electronic_gameover.mp3',
      hold: 'electronic_hold.mp3'
    }
  },
  {
    id: 'cute',
    name: '萌趣',
    price: 300,
    unlockCondition: 'purchase',
    description: '可爱卡通风格音效',
    files: {
      move: 'cute_move.mp3',
      rotate: 'cute_rotate.mp3',
      drop: 'cute_drop.mp3',
      clear: 'cute_clear.mp3',
      tetris: 'cute_tetris.mp3',
      levelUp: 'cute_levelup.mp3',
      gameOver: 'cute_gameover.mp3',
      hold: 'cute_hold.mp3'
    }
  },
  {
    id: 'epic',
    name: '史诗',
    price: 0,
    unlockCondition: 'tetris_count_100',
    description: '累计 100 次 QUAD 解锁',
    files: {
      move: 'epic_move.mp3',
      rotate: 'epic_rotate.mp3',
      drop: 'epic_drop.mp3',
      clear: 'epic_clear.mp3',
      tetris: 'epic_tetris.mp3',
      levelUp: 'epic_levelup.mp3',
      gameOver: 'epic_gameover.mp3',
      hold: 'epic_hold.mp3'
    }
  }
];

/*** 解锁条件类型说明
 * - 'default'        : 默认解锁，无需条件
 * - 'purchase'       : 需要花费金币购买
 * - 'stages_cleared_10': 主线闯关累计通关 10 关
 * - 'games_50'       : 累计对局达到 50 场
 * - 'tetris_count_100': 累计消除 Tetris 达到 100 次
 */

/** 音效包程序化合成参数（与 AudioManager 配合，无需外部音频文件）
 * 每种动作定义: 波形 type、频率/音阶、时长、音量
 * - move       : 单音
 * - rotate     : 频率上扫 freqStart -> freqEnd
 * - softDrop   : 单音
 * - hardDrop   : 单音 + 噪声 noise
 * - lineClear  : 基础音 base 上行琶音（1~4 行）
 * - tetris     : 琶音 + 追加高频音 extra*
 * - levelUp    : 频率上扫
 * - gameOver   : 下行序列 seq
 * - tspin      : 扫频 freqs[0] -> freqs[1] + 尾音 freqs[2]
 * - click      : 单音
 */
const soundPackProfiles = {
  default: {
    move: { type: 'square', freq: 800, dur: 0.03, vol: 0.15 },
    rotate: { type: 'sine', freqStart: 300, freqEnd: 600, dur: 0.08, vol: 0.25 },
    softDrop: { type: 'triangle', freq: 200, dur: 0.05, vol: 0.15 },
    hardDrop: { type: 'sine', freq: 100, dur: 0.15, vol: 0.3, noise: 0.15 },
    lineClear: { type: 'sine', base: 523, dur: 0.12, vol: 0.35 },
    tetris: { type: 'sine', base: 523, dur: 0.25, vol: 0.2, chord: [659, 784], extraFreq: 1047, extraType: 'square', extraDur: 0.15, extraVol: 0.2 },
    levelUp: { type: 'triangle', freqStart: 440, freqEnd: 880, dur: 0.15, vol: 0.3 },
    gameOver: { seq: [784, 659, 523, 392, 330], type: 'sine', dur: 0.2, vol: 0.3, interval: 0.2 },
    tspin: { type: 'sawtooth', freqs: [400, 1200, 800], dur: 0.2, vol: 0.3 },
    click: { type: 'sine', freq: 1000, dur: 0.02, vol: 0.2 }
  },
  retro: {
    move: { type: 'square', freq: 600, dur: 0.04, vol: 0.18 },
    rotate: { type: 'square', freqStart: 200, freqEnd: 700, dur: 0.09, vol: 0.25 },
    softDrop: { type: 'square', freq: 150, dur: 0.05, vol: 0.15 },
    hardDrop: { type: 'square', freq: 80, dur: 0.18, vol: 0.35, noise: 0.12 },
    lineClear: { type: 'square', base: 660, dur: 0.1, vol: 0.3 },
    tetris: { type: 'square', base: 660, dur: 0.22, vol: 0.2, chord: [880, 990], extraFreq: 1320, extraType: 'square', extraDur: 0.12, extraVol: 0.18 },
    levelUp: { type: 'square', freqStart: 330, freqEnd: 990, dur: 0.16, vol: 0.3 },
    gameOver: { seq: [660, 495, 440, 330, 220], type: 'square', dur: 0.22, vol: 0.3, interval: 0.18 },
    tspin: { type: 'square', freqs: [300, 900, 600], dur: 0.22, vol: 0.3 },
    click: { type: 'square', freq: 800, dur: 0.03, vol: 0.18 }
  },
  piano: {
    move: { type: 'sine', freq: 880, dur: 0.04, vol: 0.12 },
    rotate: { type: 'sine', freqStart: 523, freqEnd: 784, dur: 0.12, vol: 0.22 },
    softDrop: { type: 'sine', freq: 262, dur: 0.08, vol: 0.12 },
    hardDrop: { type: 'triangle', freq: 131, dur: 0.2, vol: 0.25, noise: 0.05 },
    lineClear: { type: 'sine', base: 587, dur: 0.2, vol: 0.3 },
    tetris: { type: 'sine', base: 587, dur: 0.35, vol: 0.22, chord: [740, 880], extraFreq: 1175, extraType: 'sine', extraDur: 0.2, extraVol: 0.15 },
    levelUp: { type: 'sine', freqStart: 392, freqEnd: 784, dur: 0.25, vol: 0.25 },
    gameOver: { seq: [784, 659, 587, 494, 392], type: 'sine', dur: 0.3, vol: 0.28, interval: 0.22 },
    tspin: { type: 'sine', freqs: [523, 1047, 784], dur: 0.25, vol: 0.25 },
    click: { type: 'sine', freq: 1047, dur: 0.05, vol: 0.15 }
  },
  electronic: {
    move: { type: 'sawtooth', freq: 500, dur: 0.03, vol: 0.15 },
    rotate: { type: 'sawtooth', freqStart: 200, freqEnd: 1000, dur: 0.1, vol: 0.25 },
    softDrop: { type: 'sawtooth', freq: 120, dur: 0.05, vol: 0.15 },
    hardDrop: { type: 'sine', freq: 60, dur: 0.2, vol: 0.35, noise: 0.2 },
    lineClear: { type: 'sawtooth', base: 440, dur: 0.12, vol: 0.3 },
    tetris: { type: 'sawtooth', base: 440, dur: 0.3, vol: 0.2, chord: [554, 659], extraFreq: 880, extraType: 'sawtooth', extraDur: 0.18, extraVol: 0.2 },
    levelUp: { type: 'sawtooth', freqStart: 220, freqEnd: 1100, dur: 0.2, vol: 0.3 },
    gameOver: { seq: [880, 700, 520, 400, 300], type: 'sawtooth', dur: 0.25, vol: 0.28, interval: 0.2 },
    tspin: { type: 'sawtooth', freqs: [250, 1250, 800], dur: 0.25, vol: 0.3 },
    click: { type: 'sawtooth', freq: 700, dur: 0.03, vol: 0.18 }
  },
  cute: {
    move: { type: 'triangle', freq: 1200, dur: 0.03, vol: 0.15 },
    rotate: { type: 'triangle', freqStart: 523, freqEnd: 1047, dur: 0.1, vol: 0.25 },
    softDrop: { type: 'triangle', freq: 300, dur: 0.05, vol: 0.15 },
    hardDrop: { type: 'triangle', freq: 150, dur: 0.15, vol: 0.3, noise: 0.05 },
    lineClear: { type: 'triangle', base: 880, dur: 0.1, vol: 0.32 },
    tetris: { type: 'triangle', base: 880, dur: 0.25, vol: 0.2, chord: [1109, 1319], extraFreq: 1760, extraType: 'triangle', extraDur: 0.15, extraVol: 0.2 },
    levelUp: { type: 'triangle', freqStart: 523, freqEnd: 1568, dur: 0.18, vol: 0.3 },
    gameOver: { seq: [1047, 880, 784, 659, 523], type: 'triangle', dur: 0.2, vol: 0.28, interval: 0.18 },
    tspin: { type: 'triangle', freqs: [659, 1319, 988], dur: 0.22, vol: 0.28 },
    click: { type: 'triangle', freq: 1568, dur: 0.04, vol: 0.18 }
  },
  epic: {
    move: { type: 'sawtooth', freq: 400, dur: 0.04, vol: 0.14 },
    rotate: { type: 'sawtooth', freqStart: 196, freqEnd: 784, dur: 0.14, vol: 0.28 },
    softDrop: { type: 'triangle', freq: 110, dur: 0.07, vol: 0.16 },
    hardDrop: { type: 'sine', freq: 50, dur: 0.3, vol: 0.4, noise: 0.25 },
    lineClear: { type: 'sawtooth', base: 392, dur: 0.18, vol: 0.32 },
    tetris: { type: 'sawtooth', base: 392, dur: 0.4, vol: 0.22, chord: [494, 587, 740], extraFreq: 784, extraType: 'sawtooth', extraDur: 0.25, extraVol: 0.2 },
    levelUp: { type: 'sawtooth', freqStart: 196, freqEnd: 1176, dur: 0.28, vol: 0.32 },
    gameOver: { seq: [392, 330, 262, 196, 147], type: 'sawtooth', dur: 0.35, vol: 0.32, interval: 0.25 },
    tspin: { type: 'sawtooth', freqs: [196, 1176, 784], dur: 0.3, vol: 0.32 },
    click: { type: 'sawtooth', freq: 600, dur: 0.04, vol: 0.16 }
  }
};

module.exports = {
  blockSkins,
  boardSkins,
  soundPacks,
  soundPackProfiles
};
