/**
 * 夜场街机视觉主题（Arcade Night）
 * 目标：轻松街机气质 — 暖夜场 + 街机霓虹，而非冷硬赛博朋克。
 * 对局棋盘仍保持深色可读；赛博感留给商店「霓虹」等皮肤。
 */

/** 页面/分享卡背景（上→下） */
const BG_TOP = '#2a3358';
const BG_MID = '#1c2440';
const BG_BOTTOM = '#12182c';
/** 单色回退（无渐变时） */
const BG_SOLID = '#1c2440';

/** 品牌标题：暖金，聊天缩略图更易辨认 */
const TITLE = '#FFE566';
const TITLE_GLOW = 'rgba(255, 196, 80, 0.28)';

/** 副文案 / 弱信息 */
const SUBTITLE = 'rgba(255, 236, 210, 0.75)';
const MUTED = 'rgba(255, 245, 230, 0.42)';

/** 社交面强调色（得分、分享卡数字） */
const ACCENT = '#FFC857';

/** 首页/结算氛围方块：略降饱和，少「生化霓虹」感 */
const AMBIENT_PIECE_COLORS = [
  '#5ec8d4',
  '#e8c84a',
  '#b07cd4',
  '#5cbc6a',
  '#e07070',
  '#5a8fd4',
  '#e8a040',
];

/**
 * 填充竖向夜场渐变背景
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function fillNightBackground(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(0.55, BG_MID);
  g.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * 绘制品牌标题（暖金 + 轻光晕，避免冷青霓虹）
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {string} [font]
 */
function drawBrandTitle(ctx, text, x, y, font) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font || 'bold 48px sans-serif';
  ctx.fillStyle = TITLE_GLOW;
  ctx.fillText(text, x + 1, y + 2);
  ctx.fillStyle = TITLE;
  ctx.fillText(text, x, y);
}

module.exports = {
  BG_TOP,
  BG_MID,
  BG_BOTTOM,
  BG_SOLID,
  TITLE,
  TITLE_GLOW,
  SUBTITLE,
  MUTED,
  ACCENT,
  AMBIENT_PIECE_COLORS,
  fillNightBackground,
  drawBrandTitle,
};
