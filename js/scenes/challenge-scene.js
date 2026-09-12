const { Button } = require('../widgets/button');
const { cloudService } = require('../../utils/cloud-service');
const { MODE_NAMES } = require('../../utils/cloud-config');
const IconRenderer = require('../render/icon-renderer');
const { resolveAvatarUrl, ensureProfileForAction, getCachedProfile } = require('../../utils/user-profile');
const { achievementManager } = require('../../utils/achievement-manager');
const challengeUi = require('../../utils/challenge-ui');
const challengeShareCard = require('../../utils/challenge-share-card');
const { LIST_FRAME_INTERVAL } = require('../runtime/frame-budget');
const { drawThemeBackground, drawThemeImageContain, drawThemeButtonSkin } = require('../theme/theme-images');
const { layoutTabRow } = require('../widgets/tab-layout');
const { fillNightBackground, drawBrandTitle } = require('../theme/arcade-night');

const PENDING_CHALLENGES_KEY = 'gc_pending_challenges';
/** 与云函数挑战过期一致：本地待应战超过 7 天视为失效 */
const PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const { windowWidth: W = 375, windowHeight: H = 667 } = wx.getSystemInfoSync();
const ITEM_W = Math.min(340, W * 0.85);
const LIST_X = (W - ITEM_W) / 2;
const ITEM_H = 72;

function _shortName(name) {
  if (!name) return '';
  const str = String(name).trim();
  return str.length > 6 ? str.slice(0, 6) + '…' : str;
}

/** 单行文本超出 maxWidth 时末尾省略 */
function _fillTextEllipsis(ctx, text, x, y, maxWidth) {
  const t = text == null ? '' : String(text);
  if (!t || maxWidth <= 0) return;
  if (ctx.measureText(t).width <= maxWidth) {
    ctx.fillText(t, x, y);
    return;
  }
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(t.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  ctx.fillText(lo > 0 ? t.slice(0, lo) + '…' : '…', x, y);
}

/** 列表展示：发起方/应战方成绩 */
function _scoreLabel(item, side) {
  if (!item) return '--';
  if (!isPuzzleChallenge(item)) {
    if (side === 'responder') {
      return item.responderScore != null ? String(item.responderScore) : '--';
    }
    return item.challengerScore != null ? String(item.challengerScore) : '--';
  }
  let lines = side === 'responder' ? item.responderLines : item.challengerLines;
  if (typeof lines !== 'number' && side !== 'responder' && item.challengerScore != null && item.challengerScore < 10000) {
    lines = item.challengerScore;
  }
  return typeof lines === 'number' ? (lines + '行') : '--';
}

function isPuzzleChallenge(rec) {
  return challengeUi.isPuzzleChallenge(rec);
}

/**
 * 残局应战开局（工坊 / 官方关共用）
 * @param {object} rec 本地待应战或云端 challenge
 * @param {object} [challenge] 云端详情（可覆盖 layout）
 */
function startPuzzleRespondGame(rec, challenge) {
  if (!rec || !rec.challengeId) return false;
  const src = challenge || rec;
  const rows = (src && src.layoutSnapshot) || rec.layoutSnapshot;
  if (!rows) return false;
  const targetLines = (src && src.challengerLines != null)
    ? src.challengerLines
    : rec.challengerLines;
  const title = (src && src.workshopTitle) || rec.workshopTitle
    || (rec.mode === 'stage' ? '闯关挑战' : '工坊挑战');
  const stageKey = (src && src.workshopStageId) || rec.workshopStageId || '';
  let dropMs = 1000;
  if (rec.mode === 'stage' && stageKey) {
    try {
      const goldenBlock = require('../../utils/golden-block-manager');
      const st = goldenBlock.getStage(Number(stageKey) || stageKey);
      if (st && st.dropIntervalMs) dropMs = st.dropIntervalMs;
    } catch (e) { /* ignore */ }
  }
  GameGlobal.game.sceneManager.switchTo('game', {
    mode: 'stage',
    workshop: true,
    workshopStageId: stageKey,
    workshopRows: rows,
    workshopTitle: title,
    authorTrial: false,
    workshopReturnTo: 'list',
    workshopListParams: { origin: 'challenge' },
    entryPaid: 0,
    challengeId: rec.challengeId,
    challengeMode: rec.mode || 'workshop',
    targetScore: targetLines,
    dropIntervalMs: dropMs,
  });
  return true;
}

/**
 * 清理本地待应战脏数据（无 id / 过期），写回 storage
 * @returns {Array} 清理后的列表
 */
function prunePendingChallenges() {
  let list = [];
  try {
    const stored = wx.getStorageSync(PENDING_CHALLENGES_KEY);
    list = Array.isArray(stored) ? stored : [];
  } catch (e) {
    return [];
  }
  const now = Date.now();
  const next = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || !item.challengeId) continue;
    const created = typeof item.createdAt === 'number' ? item.createdAt : 0;
    if (created > 0 && now - created > PENDING_EXPIRY_MS) continue;
    next.push(item);
  }
  if (next.length !== list.length) {
    try {
      wx.setStorageSync(PENDING_CHALLENGES_KEY, next);
    } catch (e) { /* ignore */ }
  }
  return next;
}

/** 读取本地「待我应战」列表（默认先清理过期项） */
function getPendingChallenges() {
  return prunePendingChallenges();
}

/** 待我应战数量（首页红点/文案用） */
function getPendingChallengeCount() {
  return getPendingChallenges().length;
}

/** 按 id 移除本地待应战 */
function removePendingChallenge(challengeId) {
  if (!challengeId) return;
  try {
    const stored = wx.getStorageSync(PENDING_CHALLENGES_KEY);
    const list = Array.isArray(stored) ? stored : [];
    const next = list.filter((item) => item && item.challengeId !== challengeId);
    wx.setStorageSync(PENDING_CHALLENGES_KEY, next);
  } catch (e) { /* ignore */ }
}

class ChallengeScene {
  constructor() {
    this._params = null;
    this._avatarCache = {};
    this._buttons = [];
    this._tab = 'sent';
    this._sentList = [];
    this._incomingList = [];
    this._completedList = [];
    this._loading = false;
    this._error = '';
    this._offline = false;
    this._busy = false;
    this._toast = null;
    this._scrollY = 0;
    this._touchId = null;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._isScrolling = false;
    this._suppressTap = false;
    this._view = 'list';
    this._modeAreas = [];
    this._launchArea = null;
    this._tabAreas = [];
    this._actionAreas = [];
    this._emptyCtaArea = null;
  }

  onEnter(params) {
    this._params = params || null;
    this._view = 'list';
    this._sheetOpen = false;
    this._modeAreas = [];
    this._launchArea = null;
    this._scrollY = 0;
    this._error = '';
    this._offline = false;
    this._toast = null;

    // 默认 Tab：有待应战或分享卡进入时优先「待我应战」
    const incoming = getPendingChallenges();
    this._incomingList = incoming;
    if (params && params.tab) {
      this._tab = params.tab;
    } else if (incoming.length > 0) {
      this._tab = 'incoming';
    } else {
      this._tab = 'sent';
    }

    this._initUI();
    this._loadData();
    // 分享卡应战确认改由 game.js 在首页弹出（避免发起方误入待应战、返回无栈）
  }

  onExit() {
    this._buttons = [];
    this._actionAreas = [];
    this._toast = null;
  }

  onPause() {}

  onResume() {}

  getRenderInterval() {
    return LIST_FRAME_INTERVAL;
  }

  update(dt) {
    if (this._toast && Date.now() > this._toast.expireAt) {
      this._toast = null;
    }
  }

  render(ctx) {
    if (!drawThemeBackground(ctx, 'mapMineBg', W, H)) {
      fillNightBackground(ctx, W, H);
    } else {
      ctx.fillStyle = 'rgba(12, 8, 4, 0.36)';
      ctx.fillRect(0, 0, W, H);
    }

    const titleY = this._topInset() + 18;
    drawBrandTitle(ctx, '挑战', W / 2, titleY, 'bold 28px sans-serif');

    this._renderTabs(ctx);
    this._renderList(ctx);
    if (this._sheetOpen) {
      this._renderSheet(ctx);
    } else {
      this._renderBottomBar(ctx);
      for (const btn of this._buttons) {
        btn.render(ctx);
      }
    }

    this._renderToast(ctx);
  }

  _renderTabs(ctx) {
    this._tabAreas = [];
    const tabs = [
      { tab: 'sent', label: '待对方应战' },
      { tab: 'incoming', label: '待我应战' },
      { tab: 'completed', label: '已完成' }
    ];
    const layout = layoutTabRow(W, tabs.length, { gap: 0, side: 16, height: 42, maxWidth: 110 });
    const tabH = layout.height;
    const tabW = layout.width;
    const tabY = this._topInset() + 52;
    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i];
      const x = layout.xAt(i);
      const selected = this._tab === t.tab;
      const skin = selected ? 'cardStageGold' : 'cardStageBrown';
      const cx = x + tabW / 2;
      const cy = tabY + tabH / 2;
      const drawn = drawThemeImageContain(ctx, skin, cx, cy, tabW, tabH);
      if (!drawn.drawn) {
        ctx.fillStyle = selected ? '#c9a227' : '#5a4030';
        this._roundRect(ctx, x, tabY, tabW, tabH, 8);
        ctx.fill();
      }
      ctx.fillStyle = selected ? '#241408' : '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 1;
      ctx.fillText(t.label, cx, cy + 1);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      this._tabAreas.push({ x, y: tabY, w: tabW, h: tabH, tab: t.tab });
    }
  }

  _renderBottomBar(ctx) {
    const x = 12 + 110 + 10;
    const w = W - 12 - (12 + 110 + 10);
    const y = H - 80;
    const h = 48;
    if (!drawThemeButtonSkin(ctx, 'btnBarGold', x, y, w, h)) {
      const drawn = drawThemeImageContain(ctx, 'cardStageGold', x + w / 2, y + h / 2, w, h);
      if (!drawn.drawn) {
        ctx.fillStyle = '#c9a227';
        this._roundRect(ctx, x, y, w, h, 10);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#241408';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillText('发起新挑战', x + w / 2, y + h / 2 + 1);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    this._launchArea = { x, y, w, h };
  }

  _renderSheet(ctx) {
    this._modeAreas = [];
    const sheetH = 202;
    const sheetY = H - sheetH;
    this._sheetY = sheetY;
    ctx.fillStyle = 'rgba(10, 7, 4, 0.62)';
    ctx.fillRect(0, 0, W, H);

    this._roundRect(ctx, 0, sheetY, W, sheetH, 16);
    ctx.fillStyle = 'rgba(28, 20, 14, 0.96)';
    ctx.fill();
    this._roundRect(ctx, 0.75, sheetY + 0.75, W - 1.5, sheetH - 1.5, 15);
    ctx.strokeStyle = 'rgba(31, 155, 152, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#fff8ef';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('发起新挑战', W / 2, sheetY + 24);

    // 右上角关闭
    const closeSize = 28;
    const closeCx = W - 26;
    const closeCy = sheetY + 24;
    const closeDrawn = drawThemeImageContain(ctx, 'btnCircleRose', closeCx, closeCy, closeSize, closeSize);
    if (!closeDrawn.drawn) {
      ctx.beginPath();
      ctx.arc(closeCx, closeCy, closeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#b24a3a';
      ctx.fill();
    }
    IconRenderer.draw(ctx, 'close', closeCx, closeCy, closeSize * 0.7, '#fff8ef');
    this._sheetCloseArea = {
      x: closeCx - closeSize / 2 - 4,
      y: closeCy - closeSize / 2 - 4,
      w: closeSize + 8,
      h: closeSize + 8,
    };

    const gridW = Math.min(300, W - 36);
    const gap = 10;
    const cardW = gridW;
    const cardH = 58;
    const x0 = (W - gridW) / 2;
    const y0 = sheetY + 52;
    const modes = [
      { mode: 'stageSelect', label: '闯关选关发起', hint: '通关后，在关卡结算页发起挑战', skin: 'btnBarAmber' },
      { mode: 'plaza', label: '去关卡广场', hint: '通关后，邀请好友挑战同一关', skin: 'btnBarGold' },
    ];
    for (let i = 0; i < modes.length; i++) {
      const m = modes[i];
      const x = x0;
      const y = y0 + i * (cardH + gap);
      if (!drawThemeButtonSkin(ctx, m.skin, x, y, cardW, cardH)) {
        ctx.fillStyle = '#c9a227';
        this._roundRect(ctx, x, y, cardW, cardH, 10);
        ctx.fill();
      }
      ctx.fillStyle = '#241408';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label, x + 18, y + 19);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = 'rgba(36, 20, 8, 0.72)';
      ctx.fillText(m.hint, x + 18, y + 40);
      this._modeAreas.push({ mode: m.mode, x, y, w: cardW, h: cardH });
    }
  }

  _renderList(ctx) {
    this._actionAreas = [];
    this._emptyCtaArea = null;
    const top = this._topInset() + 110;
    const bottom = H - 90;
    if (this._tab === 'sent') {
      this._renderSentList(ctx, top, bottom);
    } else if (this._tab === 'incoming') {
      this._renderIncomingList(ctx, top, bottom);
    } else {
      this._renderCompletedList(ctx, top, bottom);
    }
  }

  _renderListState(ctx, text, top, bottom) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, top + (bottom - top) / 2);
  }

  /**
   * 空态：标题 + 提示 + 可选 CTA 按钮
   * @param {{ title: string, hint: string, cta?: string, ctaAction?: string }} opts
   */
  _renderEmptyState(ctx, top, bottom, opts) {
    const cy = top + (bottom - top) / 2 - (opts.cta ? 18 : 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '15px sans-serif';
    ctx.fillText(opts.title || '', W / 2, cy - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px sans-serif';
    ctx.fillText(opts.hint || '', W / 2, cy + 12);
    if (opts.cta && opts.ctaAction) {
      const tw = Math.max(120, ctx.measureText(opts.cta).width + 48);
      const th = 40;
      const tx = W / 2 - tw / 2;
      const ty = cy + 36;
      this._emptyCtaArea = { x: tx, y: ty, w: tw, h: th, action: opts.ctaAction };
      const drawn = drawThemeImageContain(
        ctx, 'cardStageGold', tx + tw / 2, ty + th / 2, tw, th
      );
      if (!drawn.drawn) {
        ctx.fillStyle = '#c9a227';
        this._roundRect(ctx, tx, ty, tw, th, 8);
        ctx.fill();
      }
      ctx.fillStyle = '#241408';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(opts.cta, W / 2, ty + th / 2 + 1);
    }
  }

  _renderSentList(ctx, top, bottom) {
    if (this._loading) {
      this._renderListState(ctx, '加载中...', top, bottom);
      return;
    }
    if (this._error) {
      const msg = this._offline
        ? '挑战联网暂不可用，仅显示本地待应战'
        : (this._error || '加载失败，请重试');
      this._renderEmptyState(ctx, top, bottom, {
        title: msg,
        hint: this._offline ? '仍可在「待我应战」查看分享卡挑战' : '下拉切换 Tab 可重新加载',
        cta: this._offline ? '' : '重新加载',
        ctaAction: this._offline ? '' : 'reload',
      });
      return;
    }
    if (this._sentList.length === 0) {
      this._renderEmptyState(ctx, top, bottom, {
        title: '还没有发出的挑战',
        hint: '在已通关的闯关关或广场关上发起挑战',
        cta: '去选关',
        ctaAction: 'play',
      });
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, bottom - top);
    ctx.clip();
    for (let i = 0; i < this._sentList.length; i++) {
      const item = this._sentList[i];
      const rowY = top + i * ITEM_H - this._scrollY;
      if (rowY + ITEM_H < top || rowY > bottom) continue;
      this._drawSentRow(ctx, item, i, rowY, top, bottom);
    }
    ctx.restore();
  }

  _renderIncomingList(ctx, top, bottom) {
    if (this._incomingList.length === 0) {
      this._renderEmptyState(ctx, top, bottom, {
        title: '暂无待你应战的挑战',
        hint: '让好友分享挑战卡给你，点开即可应战',
      });
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, bottom - top);
    ctx.clip();
    for (let i = 0; i < this._incomingList.length; i++) {
      const item = this._incomingList[i];
      const rowY = top + i * ITEM_H - this._scrollY;
      if (rowY + ITEM_H < top || rowY > bottom) continue;
      this._drawIncomingRow(ctx, item, i, rowY, top, bottom);
    }
    ctx.restore();
  }

  _renderCompletedList(ctx, top, bottom) {
    if (this._loading) {
      this._renderListState(ctx, '加载中...', top, bottom);
      return;
    }
    if (this._error) {
      const msg = this._offline
        ? '挑战联网暂不可用'
        : (this._error || '加载失败，请重试');
      this._renderEmptyState(ctx, top, bottom, {
        title: msg,
        hint: this._offline ? '联网后可查看已完成对决' : '点击下方可重新加载',
        cta: this._offline ? '' : '重新加载',
        ctaAction: this._offline ? '' : 'reload',
      });
      return;
    }
    if (this._completedList.length === 0) {
      this._renderEmptyState(ctx, top, bottom, {
        title: '还没有完成的对决',
        hint: '应战或等待好友应战后，结果会出现在这里',
        cta: '查看待我应战',
        ctaAction: 'incoming',
      });
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, bottom - top);
    ctx.clip();
    for (let i = 0; i < this._completedList.length; i++) {
      const item = this._completedList[i];
      const rowY = top + i * ITEM_H - this._scrollY;
      if (rowY + ITEM_H < top || rowY > bottom) continue;
      this._drawCompletedRow(ctx, item, i, rowY, top, bottom);
    }
    ctx.restore();
  }

  _drawRowCard(ctx, rowY) {
    const padY = 3;
    const x = LIST_X;
    const y = rowY + padY;
    const w = ITEM_W;
    const h = ITEM_H - padY * 2;
    ctx.fillStyle = 'rgba(28, 20, 14, 0.88)';
    this._roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    this._roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 9);
    ctx.strokeStyle = 'rgba(31, 155, 152, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  _drawSentRow(ctx, item, index, rowY, top, bottom) {
    this._drawRowCard(ctx, rowY);
    const btnW = 68;
    const btnH = 36;
    const btnX = LIST_X + ITEM_W - btnW - 12;
    const btnY = rowY + (ITEM_H - btnH) / 2;

    // 「待对方应战」展示被挑战方（意向目标）；未知时用「好友」占位，勿显示发起方自己
    const targetName = (item.targetName || item.responderName || '').trim() || '好友';
    const targetAvatar = item.targetAvatar || item.responderAvatar || '';

    this._drawAvatar(ctx, targetAvatar, LIST_X + 14, rowY + (ITEM_H - 32) / 2, 32, targetName);

    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      (item.workshopTitle || MODE_NAMES[item.mode] || item.mode),
      LIST_X + 58, rowY + 24
    );

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(targetName + ' · ' + this._formatTime(item.createdAt), LIST_X + 58, rowY + 46);

    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#c9a227';
    ctx.textAlign = 'right';
    ctx.fillText(_scoreLabel(item, 'challenger'), btnX - 12, rowY + 26);

    if (btnY >= top && btnY + btnH <= bottom) {
      this._drawActionButton(ctx, btnX, btnY, btnW, btnH, '撤回', 'cardStageBrown', '#ffffff');
      this._actionAreas.push({ x: btnX, y: btnY, w: btnW, h: btnH, type: 'withdraw', index });
    }
  }

  _drawIncomingRow(ctx, item, index, rowY, top, bottom) {
    this._drawRowCard(ctx, rowY);
    const btnW = 68;
    const btnH = 36;
    const btnX = LIST_X + ITEM_W - btnW - 12;
    const btnY = rowY + (ITEM_H - btnH) / 2;

    this._drawAvatar(ctx, item.challengerAvatar, LIST_X + 14, rowY + (ITEM_H - 32) / 2, 32, item.challengerName || '玩家');

    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      (item.workshopTitle || MODE_NAMES[item.mode] || item.mode),
      LIST_X + 58, rowY + 24
    );

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText((item.challengerName || '玩家') + ' · ' + this._formatTime(item.createdAt), LIST_X + 58, rowY + 46);

    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#c9a227';
    ctx.textAlign = 'right';
    ctx.fillText(_scoreLabel(item, 'challenger'), btnX - 12, rowY + 26);

    if (btnY >= top && btnY + btnH <= bottom) {
      this._drawActionButton(ctx, btnX, btnY, btnW, btnH, '应战', 'cardStageGold', '#241408');
      this._actionAreas.push({ x: btnX, y: btnY, w: btnW, h: btnH, type: 'respond', index });
    }
  }

  _drawCompletedRow(ctx, item, index, rowY, top, bottom) {
    this._drawRowCard(ctx, rowY);
    const btnW = 68;
    const btnH = 36;
    const btnX = LIST_X + ITEM_W - btnW - 12;
    const btnY = rowY + (ITEM_H - btnH) / 2;

    const isChallenger = item.myRole === 'challenger';
    const myName = _shortName(isChallenger ? item.challengerName : item.responderName);
    const oppName = _shortName(isChallenger ? item.responderName : item.challengerName);
    const myAvatar = isChallenger ? item.challengerAvatar : item.responderAvatar;
    const oppAvatar = isChallenger ? item.responderAvatar : item.challengerAvatar;
    const myScore = isChallenger ? item.challengerScore : item.responderScore;
    const oppScore = isChallenger ? item.responderScore : item.challengerScore;
    const puzzle = isPuzzleChallenge(item);
    const myLabel = puzzle
      ? _scoreLabel(item, isChallenger ? 'challenger' : 'responder')
      : (myScore != null ? String(myScore) : '--');
    const oppLabel = puzzle
      ? _scoreLabel(item, isChallenger ? 'responder' : 'challenger')
      : (oppScore != null ? String(oppScore) : '--');

    // 双方头像
    this._drawAvatar(ctx, myAvatar, LIST_X + 14, rowY + (ITEM_H - 28) / 2, 28, myName || '我');
    this._drawAvatar(ctx, oppAvatar, LIST_X + 48, rowY + (ITEM_H - 28) / 2, 28, oppName || '对方');

    const line1 = (myName || '我') + ' ' + myLabel +
      ' : ' + (oppName || '对方') + ' ' + oppLabel;

    const textLeft = LIST_X + 86;
    const textRight = btnX - 12;
    const line1MaxW = Math.max(48, textRight - textLeft);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    _fillTextEllipsis(ctx, line1, textLeft, rowY + 24, line1MaxW);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const line2 = (MODE_NAMES[item.mode] || item.mode) + ' · ' + this._formatTime(item.respondedAt);
    const badge = this._getResultBadge(item);
    ctx.font = 'bold 13px sans-serif';
    const badgeW = ctx.measureText(badge.text).width;
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const line2MaxW = Math.max(40, btnX - 12 - badgeW - 8 - textLeft);
    _fillTextEllipsis(ctx, line2, textLeft, rowY + 46, line2MaxW);

    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = badge.color;
    ctx.textAlign = 'right';
    ctx.fillText(badge.text, btnX - 12, rowY + 46);

    if (btnY >= top && btnY + btnH <= bottom) {
      this._drawActionButton(ctx, btnX, btnY, btnW, btnH, '回击', 'cardStageAmber', '#241408');
      this._actionAreas.push({ x: btnX, y: btnY, w: btnW, h: btnH, type: 'counter', index });
    }
  }

  _drawActionButton(ctx, x, y, w, h, text, skin, labelColor) {
    const drawn = drawThemeImageContain(ctx, skin, x + w / 2, y + h / 2, w, h);
    if (!drawn.drawn) {
      ctx.fillStyle = '#6b4a2e';
      this._roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
    }
    ctx.fillStyle = labelColor || '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  _getAvatarImage(url) {
    if (!url) return null;
    const entry = this._avatarCache[url];
    if (entry === null) return null; // 失败过，不再重复加载
    if (entry) return entry.loaded ? entry.img : null; // 加载中则返回 null，避免重复创建
    const cacheEntry = { img: null, loaded: false };
    this._avatarCache[url] = cacheEntry;
    resolveAvatarUrl(url).then((httpsUrl) => {
      if (!httpsUrl) {
        this._avatarCache[url] = null;
        return;
      }
      const img = wx.createImage();
      if (this._avatarCache[url] !== cacheEntry) {
        return;
      }
      cacheEntry.img = img;
      img.onload = () => {
        const current = this._avatarCache[url];
        if (current && current.img === img) {
          current.loaded = true;
        }
      };
      img.onerror = () => {
        this._avatarCache[url] = null;
      };
      img.src = httpsUrl;
    });
    return null;
  }

  _drawAvatar(ctx, url, x, y, size, name) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const img = this._getAvatarImage(url);
    if (img) {
      ctx.drawImage(img, x, y, size, size);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name ? String(name).charAt(0) : '?', x + size / 2, y + size / 2 + 1);
    }
    ctx.restore();
  }

  _enrichIncomingProfiles() {
    if (this._enrichBusy) return;
    this._enrichBusy = true;
    const list = this._incomingList || [];
    let chain = Promise.resolve();
    // 始终用云端刷新发起方资料（对方后来授权时本地快照会过期）
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || !item.challengeId) continue;
      chain = chain.then(() => {
        return cloudService.getChallengeById(item.challengeId).then((res) => {
          const challenge = res && res.challenge;
          if (challenge) {
            challengeUi.mergePendingFromCloud(item, challenge);
            try {
              wx.setStorageSync(PENDING_CHALLENGES_KEY, this._incomingList);
            } catch (e) { /* ignore */ }
          }
        }).catch(() => { /* 静默忽略 */ });
      });
    }
    chain.then(() => {
      this._enrichBusy = false;
    }).catch(() => {
      this._enrichBusy = false;
    });
  }

  _getResultBadge(item) {
    const result = item.result;
    if (result === 'tie') {
      return { text: '平局', color: '#f0a000' };
    }
    let win = false;
    if (item.myRole === 'challenger') {
      win = result === 'challenger_win';
    } else if (item.myRole === 'responder') {
      win = result === 'responder_win';
    }
    if (win) {
      return { text: '我胜', color: '#00f0f0' };
    }
    if (result === 'challenger_win' || result === 'responder_win') {
      return { text: '我负', color: '#ff6b6b' };
    }
    return { text: '--', color: 'rgba(255,255,255,0.4)' };
  }

  _switchTab(tab) {
    if (tab === this._tab) return;
    this._tab = tab;
    this._scrollY = 0;
    if (tab === 'sent' || tab === 'completed') {
      this._loadData();
    }
  }

  _loadData() {
    this._incomingList = getPendingChallenges();
    this._enrichIncomingProfiles();
    this._loading = true;
    this._error = '';

    const profile = getCachedProfile();
    const syncThenFetch = () => cloudService.getMyChallenges().then((res) => {
      this._loading = false;
      if (res && res.success) {
        this._sentList = res.pending || [];
        this._completedList = res.completed || [];
        this._offline = false;
        this._error = '';
        this._scrollY = 0;
        this._pruneIncomingAgainstCompleted();
        try {
          achievementManager.syncCompletedChallenges(this._completedList);
        } catch (e) { /* ignore */ }
      } else {
        this._offline = !!(res && res.offline);
        const errMsg = this._offline ? '' : ((res && res.errMsg) ? String(res.errMsg) : '');
        const short = errMsg.length > 24 ? errMsg.slice(0, 24) + '…' : errMsg;
        this._error = this._offline ? '挑战联网暂不可用' : (short ? '加载失败：' + short : '加载失败，请重试');
      }
    }).catch(() => {
      this._loading = false;
      this._error = '加载失败，请重试';
      this._offline = false;
    });

    // 进页先用本地已授权资料刷一遍云端挑战，再拉列表（失败不挡展示）
    if (profile && profile.nickname && cloudService.syncMyChallengeProfile) {
      cloudService.syncMyChallengeProfile(profile).catch(() => {}).then(syncThenFetch);
    } else {
      syncThenFetch();
    }
  }

  /** 已完成列表中出现的 challengeId，从本地待应战移除 */
  _pruneIncomingAgainstCompleted() {
    const completed = this._completedList || [];
    if (completed.length === 0) return;
    const doneIds = {};
    for (let i = 0; i < completed.length; i++) {
      const id = completed[i] && (completed[i]._id || completed[i].challengeId);
      if (id) doneIds[id] = true;
    }
    const before = this._incomingList || [];
    const next = before.filter((item) => item && item.challengeId && !doneIds[item.challengeId]);
    if (next.length !== before.length) {
      try {
        wx.setStorageSync(PENDING_CHALLENGES_KEY, next);
      } catch (e) { /* ignore */ }
      this._incomingList = next;
    }
  }

  _withdraw(index) {
    if (this._busy) return;
    const rec = this._sentList[index];
    if (!rec) return;
    this._busy = true;
    cloudService.cancelChallenge(rec.challengeId).then((res) => {
      this._busy = false;
      if (res && res.success) {
        this._sentList.splice(index, 1);
        this._showToast('已撤回');
      } else {
        this._showToast((res && res.errMsg) || '撤回失败');
      }
    }).catch(() => {
      this._busy = false;
      this._showToast('撤回失败');
    });
  }

  _respond(index) {
    const rec = this._incomingList[index];
    if (!rec) return;
    this._startRespondGame(rec);
  }

  /** 用待应战记录开局（列表应战 / 分享卡确认共用）；开局前再清一次过期项 */
  _startRespondGame(rec) {
    if (!rec || !rec.challengeId) return;
    const created = typeof rec.createdAt === 'number' ? rec.createdAt : 0;
    if (created > 0 && Date.now() - created > PENDING_EXPIRY_MS) {
      removePendingChallenge(rec.challengeId);
      this._incomingList = getPendingChallenges();
      this._showToast('挑战已过期');
      return;
    }

    // 残局挑战（工坊 / 官方关）：拉布局后进 game
    if (isPuzzleChallenge(rec)) {
      this._startPuzzleRespond(rec);
      return;
    }

    // 旧版自由分制挑战已废弃（产品无经典模式）
    this._showToast('该挑战已过期，请发起新的闯关挑战');
    removePendingChallenge(rec.challengeId);
    this._incomingList = getPendingChallenges();
  }

  _startPuzzleRespond(rec) {
    if (rec.layoutSnapshot && startPuzzleRespondGame(rec)) {
      return;
    }
    if (!cloudService.isAvailable()) {
      this._showToast('云开发未配置');
      return;
    }
    this._showToast('加载挑战…');
    cloudService.getChallengeById(rec.challengeId).then((res) => {
      if (!res || !res.success || !res.challenge) {
        this._showToast('挑战不存在或已过期');
        return;
      }
      if (!startPuzzleRespondGame(rec, res.challenge)) {
        this._showToast('挑战布局不可用');
      }
    }).catch(() => this._showToast('加载失败'));
  }

  _counter(index) {
    const rec = this._completedList[index];
    if (!rec) return;
    const isChallenger = rec.myRole === 'challenger';
    const oppName = isChallenger ? (rec.responderName || '') : (rec.challengerName || '');
    const oppAvatar = isChallenger ? (rec.responderAvatar || '') : (rec.challengerAvatar || '');
    const oppOpenid = rec.opponentOpenid || '';
    if (!cloudService.isAvailable()) {
      this._showToast('云开发未配置，无法回击');
      return;
    }
    if (this._busy) return;
    this._busy = true;
    ensureProfileForAction({
      title: '发起回击挑战',
      content: '授权微信头像昵称后，好友能看到你的资料。也可暂不授权，使用默认昵称继续发起。',
    }).then((profile) => {
      const buildPayload = (recSrc) => challengeUi.buildCreateChallengePayload({
        profile,
        opponent: { name: oppName, avatar: oppAvatar, openid: oppOpenid },
        completedRecord: recSrc,
      });
      let createPayload = buildPayload(rec);
      if (challengeUi.isPuzzleChallenge(createPayload) && !createPayload.layoutSnapshot) {
        return cloudService.getChallengeById(rec._id || rec.challengeId).then((detail) => {
          if (!detail || !detail.success || !detail.challenge) {
            return { success: false, errMsg: '布局不可用' };
          }
          const merged = Object.assign({}, rec, detail.challenge);
          createPayload = buildPayload(merged);
          return cloudService.createChallenge(createPayload).then((res) => ({ res, createPayload }));
        });
      }
      return cloudService.createChallenge(createPayload).then((res) => ({ res, createPayload }));
    }).then((out) => {
      this._busy = false;
      if (!out) return;
      const res = out.res;
      const createPayload = out.createPayload;
      if (!res) return;
      if (res && res.success) {
        try {
          achievementManager.reportChallengeCreate();
        } catch (e) {}
        try {
          challengeShareCard.shareWithCard({
            title: challengeUi.buildShareTitle({
              isCounter: true,
              opponentName: oppName,
              payload: createPayload,
            }),
            query: challengeUi.buildShareQuery(res.challengeId, createPayload),
            cardOpts: challengeShareCard.cardOptsFromPayload(createPayload, { isCounter: true }),
            success() {
              try {
                achievementManager.reportShare();
                achievementManager.reportInvite();
              } catch (e) {}
            },
          });
        } catch (e) {}
        this._showToast('回击已发起');
      } else {
        this._showToast((res && res.errMsg) || '发起失败');
      }
    }).catch(() => {
      this._busy = false;
      this._showToast('发起失败');
    });
  }

  handleTap(x, y) {
    if (this._suppressTap) {
      this._suppressTap = false;
      return;
    }
    if (this._emptyCtaArea &&
        x >= this._emptyCtaArea.x && x <= this._emptyCtaArea.x + this._emptyCtaArea.w &&
        y >= this._emptyCtaArea.y && y <= this._emptyCtaArea.y + this._emptyCtaArea.h) {
      this._handleEmptyCta(this._emptyCtaArea.action);
      return;
    }
    if (this._sheetOpen) {
      if (this._sheetY != null && y < this._sheetY) {
        this._sheetOpen = false;
        return;
      }
      if (this._sheetCloseArea &&
          x >= this._sheetCloseArea.x && x <= this._sheetCloseArea.x + this._sheetCloseArea.w &&
          y >= this._sheetCloseArea.y && y <= this._sheetCloseArea.y + this._sheetCloseArea.h) {
        this._sheetOpen = false;
        return;
      }
      for (const area of this._modeAreas) {
        if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
          this._sheetOpen = false;
          if (area.mode === 'plaza') {
            GameGlobal.game.sceneManager.switchTo('plaza', {}, ['home']);
          } else {
            GameGlobal.game.sceneManager.switchTo('worldMap');
          }
          return;
        }
      }
      return;
    }
    if (this._launchArea &&
        x >= this._launchArea.x && x <= this._launchArea.x + this._launchArea.w &&
        y >= this._launchArea.y && y <= this._launchArea.y + this._launchArea.h) {
      this._sheetOpen = true;
      return;
    }
    for (const area of this._tabAreas) {
      if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
        this._switchTab(area.tab);
        return;
      }
    }
    for (const area of this._actionAreas) {
      if (x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h) {
        if (area.type === 'withdraw') this._withdraw(area.index);
        else if (area.type === 'respond') this._respond(area.index);
        else if (area.type === 'counter') this._counter(area.index);
        return;
      }
    }
    for (const btn of this._buttons) {
      const hit = btn.containsPoint
        ? btn.containsPoint(x, y)
        : (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h);
      if (hit) {
        btn.trigger();
        return;
      }
    }
  }

  /** 空态 CTA：去打一局 / 切 Tab / 重新加载 */
  _handleEmptyCta(action) {
    if (action === 'play') {
      this._sheetOpen = true;
      return;
    }
    if (action === 'incoming') {
      this._switchTab('incoming');
      return;
    }
    if (action === 'reload') {
      this._loadData();
    }
  }

  handleTouchStart(x, y, touchId) {
    this._touchId = touchId;
    this._touchStartX = x;
    this._touchStartY = y;
    this._isScrolling = false;
  }

  handleTouchMove(x, y, touchId) {
    if (touchId !== this._touchId) return;
    const dy = y - this._touchStartY;
    if (!this._isScrolling && Math.abs(dy) >= 12) {
      this._isScrolling = true;
    }
    if (this._isScrolling) {
      const top = this._topInset() + 110;
      const bottom = H - 90;
      const count = this._tab === 'sent' ? this._sentList.length :
        this._tab === 'incoming' ? this._incomingList.length : this._completedList.length;
      const maxScroll = this._getMaxScroll(top, bottom, count);
      this._scrollY = Math.max(0, Math.min(maxScroll, this._scrollY - dy));
      this._touchStartX = x;
      this._touchStartY = y;
    }
  }

  handleTouchEnd(x, y, touchId) {
    if (touchId !== this._touchId) return;
    if (this._isScrolling) {
      this._suppressTap = true;
    }
    this._touchId = null;
    this._isScrolling = false;
  }

  _initUI() {
    this._buttons = [];
    this._buttons.push(new Button({
      x: 12,
      y: H - 80,
      w: 110,
      h: 48,
      text: '返回',
      color: '#6b4a2e',
      skin: 'cardStageBrown',
      skinMode: 'contain',
      labelColor: '#ffffff',
      fontScale: 0.92,
      onClick: () => {
        GameGlobal.game.sceneManager.back();
      }
    }));
  }

  _topInset() {
    const sys = wx.getSystemInfoSync();
    return (sys.safeArea && sys.safeArea.top) || sys.statusBarHeight || 20;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _showToast(text) {
    this._toast = { text, expireAt: Date.now() + 2000 };
  }

  _renderToast(ctx) {
    if (!this._toast) return;
    const text = this._toast.text;
    ctx.save();
    ctx.font = '14px sans-serif';
    const w = ctx.measureText(text).width + 40;
    const h = 38;
    const x = (W - w) / 2;
    const y = H - 170;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    this._roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, y + h / 2 + 1);
    ctx.restore();
  }

  _formatTime(ts) {
    if (!ts) return '--';
    let value = ts;
    if (typeof value === 'number' && value < 1e12) {
      value = value * 1000;
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return '--';
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  _getMaxScroll(top, bottom, count) {
    return Math.max(0, top + count * ITEM_H - (bottom - 12));
  }
}

module.exports = ChallengeScene;
module.exports.PENDING_CHALLENGES_KEY = PENDING_CHALLENGES_KEY;
module.exports.getPendingChallenges = getPendingChallenges;
module.exports.getPendingChallengeCount = getPendingChallengeCount;
module.exports.prunePendingChallenges = prunePendingChallenges;
module.exports.removePendingChallenge = removePendingChallenge;
module.exports.isPuzzleChallenge = isPuzzleChallenge;
module.exports.startPuzzleRespondGame = startPuzzleRespondGame;
