/**
 * 金矿工坊主题贴图加载（对齐首页概念示意图）
 * 路径相对小游戏根目录；失败时调用方回退到纯色绘制。
 */

const THEME_PATHS = {
  homeBg: 'assets/images/theme/home-bg.jpg',
  titlePlaque: 'assets/images/theme/title-plaque.png',
  btnSquareAmber: 'assets/images/theme/btn-square-amber.png',
  btnSquareGold: 'assets/images/theme/btn-square-gold.png',
  btnSquareBrown: 'assets/images/theme/btn-square-brown.png',
  btnSquareTeal: 'assets/images/theme/btn-square-teal.png',
  btnIconBrown: 'assets/images/theme/btn-icon-brown.png',
  btnBarBrown: 'assets/images/theme/btn-bar-brown.png',
  btnBarAmber: 'assets/images/theme/btn-bar-amber.png',
  btnBarGold: 'assets/images/theme/btn-bar-gold.png',
  btnCircleTeal: 'assets/images/theme/btn-circle-teal.png',
  btnCircleGold: 'assets/images/theme/btn-circle-gold.png',
  btnCircleRose: 'assets/images/theme/btn-circle-rose.png',
  btnCircleBlue: 'assets/images/theme/btn-circle-blue.png',
  btnCircleBrown: 'assets/images/theme/btn-circle-brown.png',
  mapGroundTile: 'assets/images/theme/map-ground-tile.jpg',
  mapMineBg: 'assets/images/theme/map-mine-bg.jpg',
  mapTitlePlaque: 'assets/images/theme/map-title-plaque.png',
  mapBtnBack: 'assets/images/theme/map-btn-back.png',
  mapCubeCleared: 'assets/images/theme/map-cube-cleared.png',
  mapCubeUnlocked: 'assets/images/theme/map-cube-unlocked.png',
  mapCubeProgress: 'assets/images/theme/map-cube-progress.png',
  mapCubeLocked: 'assets/images/theme/map-cube-locked.png',
  mapIconLock: 'assets/images/theme/map-icon-lock.png',
  cardStageAmber: 'assets/images/theme/card-stage-amber.png',
  cardStageGold: 'assets/images/theme/card-stage-gold.png',
  cardStageBrown: 'assets/images/theme/card-stage-brown.png',
};

/** @type {Record<string, { img: any, ready: boolean, failed: boolean }>} */
const _cache = {};

function _kickLoop() {
  try {
    if (typeof GameGlobal !== 'undefined' && GameGlobal.game && typeof GameGlobal.game.kickLoop === 'function') {
      GameGlobal.game.kickLoop();
    }
  } catch (e) { /* ignore */ }
}

function _loadOne(key) {
  if (_cache[key]) return _cache[key];
  const path = THEME_PATHS[key];
  if (!path || typeof wx === 'undefined' || typeof wx.createImage !== 'function') {
    _cache[key] = { img: null, ready: false, failed: true };
    return _cache[key];
  }
  const entry = { img: null, ready: false, failed: false };
  const img = wx.createImage();
  img.onload = () => {
    entry.ready = true;
    _kickLoop();
  };
  img.onerror = () => {
    entry.failed = true;
    entry.ready = false;
  };
  img.src = path;
  entry.img = img;
  _cache[key] = entry;
  return entry;
}

function preloadThemeImages() {
  Object.keys(THEME_PATHS).forEach((key) => _loadOne(key));
}

function getThemeImage(key) {
  return _loadOne(key);
}

/**
 * cover 方式绘制主题背景（居中裁切）
 * @returns {boolean}
 */
function drawThemeBackground(ctx, key, w, h) {
  const entry = _loadOne(key);
  if (!entry.ready || !entry.img) return false;
  const iw = entry.img.width || 1;
  const ih = entry.img.height || 1;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(entry.img, dx, dy, dw, dh);
  return true;
}

/**
 * contain 方式绘制贴图（完整显示，居中）
 * @returns {{ drawn: boolean, x: number, y: number, w: number, h: number }}
 */
function drawThemeImageContain(ctx, key, cx, cy, maxW, maxH) {
  const entry = _loadOne(key);
  if (!entry.ready || !entry.img) {
    return { drawn: false, x: 0, y: 0, w: 0, h: 0 };
  }
  const iw = entry.img.width || 1;
  const ih = entry.img.height || 1;
  const scale = Math.min(maxW / iw, maxH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const x = cx - dw / 2;
  const y = cy - dh / 2;
  ctx.drawImage(entry.img, x, y, dw, dh);
  return { drawn: true, x, y, w: dw, h: dh };
}

/**
 * 拉伸绘制按钮砖皮
 * 源图边缘内缩，去掉抠图白边/抗锯齿光晕
 * @returns {boolean}
 */
function drawThemeButtonSkin(ctx, key, x, y, w, h) {
  const entry = _loadOne(key);
  if (!entry.ready || !entry.img) return false;
  const img = entry.img;
  const iw = img.width || 0;
  const ih = img.height || 0;
  if (iw < 8 || ih < 8) {
    ctx.drawImage(img, x, y, w, h);
    return true;
  }
  const inset = Math.max(1, Math.round(Math.min(iw, ih) * 0.035));
  ctx.drawImage(
    img,
    inset,
    inset,
    iw - inset * 2,
    ih - inset * 2,
    x,
    y,
    w,
    h
  );
  return true;
}

/**
 * 九宫格拉伸：四角不变形，上下边只横向拉、左右边只纵向拉。
 * 宽按钮用方钮皮，避免整图压扁导致上下 3D 边别扭。
 * @param {number} [cornerRatio=0.28] 角块占源图短边比例
 * @returns {boolean}
 */
function drawThemeButtonSkin9Slice(ctx, key, x, y, w, h, cornerRatio) {
  const entry = _loadOne(key);
  if (!entry.ready || !entry.img) return false;
  const img = entry.img;
  let iw = img.width || 0;
  let ih = img.height || 0;
  if (iw < 16 || ih < 16) {
    return drawThemeButtonSkin(ctx, key, x, y, w, h);
  }

  const inset = Math.max(1, Math.round(Math.min(iw, ih) * 0.0355));
  const sx0 = inset;
  const sy0 = inset;
  iw = iw - inset * 2;
  ih = ih - inset * 2;
  if (iw < 12 || ih < 12) {
    return drawThemeButtonSkin(ctx, key, x, y, w, h);
  }

  const ratio = typeof cornerRatio === 'number' ? cornerRatio : 0.3;
  let cw = Math.floor(Math.min(iw, ih) * ratio);
  let ch = cw;
  // 目标区域角块：不超过宽/高的 40%，且至少留出中心 4px
  let dw = Math.min(cw, Math.floor(w * 0.38), Math.floor((w - 4) / 2));
  let dh = Math.min(ch, Math.floor(h * 0.38), Math.floor((h - 4) / 2));
  dw = Math.max(8, dw);
  dh = Math.max(8, dh);
  cw = Math.min(cw, Math.floor((iw - 4) / 2));
  ch = Math.min(ch, Math.floor((ih - 4) / 2));

  const midSrcW = iw - cw * 2;
  const midSrcH = ih - ch * 2;
  const midDstW = w - dw * 2;
  const midDstH = h - dh * 2;
  if (midSrcW < 2 || midSrcH < 2 || midDstW < 2 || midDstH < 2) {
    return drawThemeButtonSkin(ctx, key, x, y, w, h);
  }

  // 四角
  ctx.drawImage(img, sx0, sy0, cw, ch, x, y, dw, dh);
  ctx.drawImage(img, sx0 + iw - cw, sy0, cw, ch, x + w - dw, y, dw, dh);
  ctx.drawImage(img, sx0, sy0 + ih - ch, cw, ch, x, y + h - dh, dw, dh);
  ctx.drawImage(img, sx0 + iw - cw, sy0 + ih - ch, cw, ch, x + w - dw, y + h - dh, dw, dh);
  // 四边
  ctx.drawImage(img, sx0 + cw, sy0, midSrcW, ch, x + dw, y, midDstW, dh);
  ctx.drawImage(img, sx0 + cw, sy0 + ih - ch, midSrcW, ch, x + dw, y + h - dh, midDstW, dh);
  ctx.drawImage(img, sx0, sy0 + ch, cw, midSrcH, x, y + dh, dw, midDstH);
  ctx.drawImage(img, sx0 + iw - cw, sy0 + ch, cw, midSrcH, x + w - dw, y + dh, dw, midDstH);
  // 中心
  ctx.drawImage(img, sx0 + cw, sy0 + ch, midSrcW, midSrcH, x + dw, y + dh, midDstW, midDstH);
  return true;
}

/**
 * 平铺绘制主题贴图（闯关地图俯视地面）
 * @returns {boolean}
 */
function drawThemeTiledBackground(ctx, key, x, y, w, h, tileSize) {
  const entry = _loadOne(key);
  if (!entry.ready || !entry.img) return false;
  const img = entry.img;
  const iw = img.width || 1;
  const ih = img.height || 1;
  const ts = Math.max(48, tileSize || Math.round(Math.min(w, h) * 0.42));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + w);
  const y1 = Math.ceil(y + h);
  for (let py = y0; py < y1; py += ts) {
    for (let px = x0; px < x1; px += ts) {
      const dw = Math.min(ts, x1 - px);
      const dh = Math.min(ts, y1 - py);
      ctx.drawImage(img, 0, 0, (dw / ts) * iw, (dh / ts) * ih, px, py, dw, dh);
    }
  }
  return true;
}

module.exports = {
  THEME_PATHS,
  preloadThemeImages,
  getThemeImage,
  drawThemeBackground,
  drawThemeImageContain,
  drawThemeButtonSkin,
  drawThemeButtonSkin9Slice,
  drawThemeTiledBackground,
};
