const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const {
  ACCENT,
  SUBTITLE,
  MUTED,
  AMBIENT_PIECE_COLORS,
  fillNightBackground,
  drawBrandTitle,
} = require('../theme/arcade-night');

let cloudService = null;
try {
  ({ cloudService } = require('../../utils/cloud-service'));
} catch (e) {
  cloudService = null;
}
const { ensureProfileForAction } = require('../../utils/user-profile');
const challengeUi = require('../../utils/challenge-ui');

const { windowWidth: W, windowHeight: H } = wx.getSystemInfoSync();

const MODE_NAMES = {
  classic: '经典模式',
  timed: '限时赛',
  marathon: '马拉松',
  special: '方块实验室'
};

const PANEL_H = 190;
const BTN_H = 48;
const BTN_GAP = 12;
const BTN_COUNT = 3;

function computeLayoutTop(scrH, count) {
  const cnt = count || BTN_COUNT;
  const blockH = PANEL_H + 16 + (cnt * BTN_H + (cnt - 1) * BTN_GAP);
  return Math.max((scrH - blockH) / 2, Math.min(150, Math.max(120, scrH * 0.10 + 60)));
}

class Button {
  constructor(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.w = opts.w;
    this.h = opts.h;
    this.text = opts.text;
    this.color = opts.color;
    this.icon = opts.icon || '';
    this.onTap = opts.onTap;
  }

  hitTest(x, y) {
    return x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h;
  }
}

class ChallengeResultScene {
  constructor() {
    this._params = {};
    this._buttons = [];
    this._adManager = adManager;
    this._sharing = false;
  }

  onEnter(params) {
    this._params = params || {};
    this._adManager = adManager;
    this._initUI();
  }

  onExit() {
    this._buttons = [];
    this._sharing = false;
    if (this._adManager && typeof this._adManager.hideBanner === 'function') {
      this._adManager.hideBanner();
    }
  }

  render(ctx) {
    ctx = ctx || GameGlobal.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    fillNightBackground(ctx, W, H);

    // 标题
    drawBrandTitle(ctx, '挑战结束', W / 2, H * 0.10, 'bold 32px sans-serif');

    // 模式标签
    const mode = this._params.mode || 'classic';
    ctx.fillStyle = SUBTITLE;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._modeName(mode), W / 2, H * 0.10 + 40);

    // 成绩面板布局（与按钮数量对齐，避免广告入口隐藏后错位）
    const top = computeLayoutTop(H, this._buttons.length || BTN_COUNT);
    const panelX = (W - 300) / 2;
    const panelY = top;

    // 成绩面板
    this._roundRect(ctx, panelX, panelY, 300, PANEL_H, 16);
    ctx.fillStyle = 'rgba(255, 245, 230, 0.06)';
    ctx.fill();
    this._roundRect(ctx, panelX, panelY, 300, PANEL_H, 16);
    ctx.strokeStyle = 'rgba(255, 245, 230, 0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 分数
    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(String(Number(this._params.score) || 0), W / 2, panelY + 60);

    // 等级
    ctx.fillStyle = '#e09a30';
    ctx.font = '20px sans-serif';
    ctx.fillText('等级 ' + (Number(this._params.level) || 0), W / 2, panelY + 110);

    // 消行
    ctx.fillStyle = '#5cbc6a';
    ctx.font = '20px sans-serif';
    ctx.fillText('消行 ' + (Number(this._params.lines) || 0), W / 2, panelY + 150);

    // 按钮
    for (let i = 0; i < this._buttons.length; i++) {
      this._drawButton(ctx, this._buttons[i]);
    }
  }

  handleTap(x, y) {
    for (let i = 0; i < this._buttons.length; i++) {
      const btn = this._buttons[i];
      if (btn.hitTest(x, y)) {
        btn.onTap.call(this);
        return true;
      }
    }
    return false;
  }

  _initUI() {
    const btnW = Math.min(260, W * 0.7);
    const x = (W - btnW) / 2;
    const showAdRetry = isRewardedVideoConfigured() === true;

    const defs = [];
    // 未配置激励视频时隐藏「看广告重新挑战」，避免点了不可用
    if (showAdRetry) {
      defs.push({
        text: '看广告重新挑战',
        color: '#ff6b6b',
        icon: 'tv',
        onTap: this._retryWithAd,
      });
    }
    defs.push(
      { text: '终止挑战', color: '#555555', icon: '', onTap: this._goHome },
      { text: '发送战报', color: '#2ecc71', icon: 'share', onTap: this._sendReport }
    );

    const startY = computeLayoutTop(H, defs.length) + PANEL_H + 16;
    this._buttons = [];
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      this._buttons.push(new Button({
        x: x,
        y: startY + (BTN_H + BTN_GAP) * i,
        w: btnW,
        h: BTN_H,
        text: d.text,
        color: d.color,
        icon: d.icon,
        onTap: d.onTap,
      }));
    }
  }

  _drawButton(ctx, btn) {
    this._roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
    ctx.fillStyle = btn.color;
    ctx.fill();

    const iconMap = {
      tv: '📺',
      share: '📣'
    };
    if (btn.icon && iconMap[btn.icon]) {
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(iconMap[btn.icon], btn.x + 16, btn.y + btn.h / 2);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.text, btn.x + btn.w / 2, btn.y + btn.h / 2);
  }

  _retryWithAd() {
    const self = this;
    if (!this._adManager || typeof this._adManager.showRewardedVideo !== 'function') {
      wx.showToast({ title: '广告暂不可用', icon: 'none' });
      return;
    }

    let called = false;
    const onSuccess = function (res) {
      if (called) return;
      called = true;
      if (res && res.isEnded) {
        GameGlobal.game.sceneManager.switchTo('game', {
          mode: self._params.mode || 'classic',
          challengeLaunch: true,
          challengeTargetName: (self._params && self._params.challengeTargetName) || '',
          challengeTargetAvatar: (self._params && self._params.challengeTargetAvatar) || '',
          challengeTargetOpenid: (self._params && self._params.challengeTargetOpenid) || '',
        });
      } else {
        wx.showToast({ title: '请完整观看视频', icon: 'none' });
      }
    };
    const onFail = function () {
      if (called) return;
      called = true;
      wx.showToast({ title: '广告加载失败', icon: 'none' });
    };

    try {
      const ret = this._adManager.showRewardedVideo({
        success: onSuccess,
        fail: onFail
      });
      if (ret && typeof ret.then === 'function') {
        ret.then(function (res) { onSuccess(res || {}); }, onFail);
      }
    } catch (e) {
      onFail();
    }
  }

  _goHome() {
    GameGlobal.game.sceneManager.switchTo('home');
  }

  _sendReport() {
    if (this._sharing) return;
    this._sharing = true;

    const self = this;
    const score = Number(this._params.score) || 0;
    const mode = this._params.mode || 'classic';

    const doShare = function (imageUrl, query) {
      const shareData = {
        title: '向你发起挑战！我在『' + self._modeName(mode) + '』拿了 ' + score + ' 分，敢来超越吗？'
      };
      if (imageUrl) shareData.imageUrl = imageUrl;
      if (query) shareData.query = query;

      let finished = false;
      const finish = function () {
        if (finished) return;
        finished = true;
        self._sharing = false;
        GameGlobal.game.sceneManager.switchTo('challenge');
      };

      try {
        wx.shareAppMessage(Object.assign({}, shareData, {
          success: function () {
            try {
              const achievementManager = require('../../utils/achievement-manager');
              if (achievementManager && typeof achievementManager.reportShare === 'function') {
                achievementManager.reportShare();
              }
              if (query) {
                if (achievementManager && typeof achievementManager.reportInvite === 'function') {
                  achievementManager.reportInvite();
                }
              }
            } catch (e) {}
            finish();
          },
          fail: finish,
          complete: finish
        }));
      } catch (e) {
        finish();
        return;
      }
      setTimeout(finish, 800);
    };

    const shareWithoutQuery = function () {
      self._generateShareImage(function (imageUrl) {
        doShare(imageUrl, null);
      });
    };

    const cloudOk = !!(cloudService && (typeof cloudService.isAvailable === 'function' ? cloudService.isAvailable() : cloudService.isAvailable));
    if (cloudOk) {
      ensureProfileForAction({
        title: '发起好友挑战',
        content: '授权微信头像昵称后，好友能看到你的资料。也可暂不授权，使用默认昵称继续发起。',
      }).then(function (profile) {
        return self._createChallenge({
          mode: mode,
          score: score,
          nickname: (profile && profile.nickname) || '',
          avatarUrl: (profile && profile.avatarUrl) || '',
          targetName: (self._params && self._params.challengeTargetName) || '',
          targetAvatar: (self._params && self._params.challengeTargetAvatar) || '',
          targetOpenid: (self._params && self._params.challengeTargetOpenid) || '',
        });
      }).then(function (res) {
        if (!res) return;
        const challengeId = (res && res.challengeId) ? res.challengeId : '';
        if (challengeId) {
          try {
            const { achievementManager } = require('../../utils/achievement-manager');
            if (achievementManager && typeof achievementManager.reportChallengeCreate === 'function') {
              achievementManager.reportChallengeCreate();
            }
          } catch (e) {}
        }
        const query = 'challengeId=' + encodeURIComponent(challengeId) + '&mode=' + encodeURIComponent(mode) + '&score=' + score;
        self._generateShareImage(function (imageUrl) {
          doShare(imageUrl, query);
        });
      }).catch(function () {
        shareWithoutQuery();
      });
    } else {
      shareWithoutQuery();
    }
  }

  _createChallenge(data) {
    return new Promise(function (resolve, reject) {
      if (!cloudService || typeof cloudService.createChallenge !== 'function') {
        reject(new Error('cloudService unavailable'));
        return;
      }

      let settled = false;
      function settle(err, res) {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(res);
      }

      const payload = {
        mode: data.mode,
        score: data.score,
        nickname: data.nickname || '',
        avatarUrl: data.avatarUrl || '',
        targetName: data.targetName || '',
        targetAvatar: data.targetAvatar || '',
        targetOpenid: data.targetOpenid || '',
      };

      let ret;
      try {
        if (cloudService.createChallenge.length >= 2) {
          ret = cloudService.createChallenge(payload, function (err, res) {
            if (err) settle(err);
            else settle(null, res);
          });
        } else {
          ret = cloudService.createChallenge(Object.assign({}, payload, {
            success: function (res) { settle(null, res); },
            fail: function (err) { settle(err); }
          }));
        }
      } catch (e) {
        settle(e);
        return;
      }

      if (ret && typeof ret.then === 'function') {
        ret.then(function (res) { settle(null, res); }, function (err) { settle(err); });
      } else if (ret !== undefined && ret !== null) {
        settle(null, ret);
      }

      setTimeout(function () {
        settle(new Error('createChallenge timeout'));
      }, 3000);
    });
  }

  _generateShareImage(callback) {
    let canvas = null;
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: 300, height: 400 });
    } catch (e) {
      canvas = null;
    }
    if (!canvas) {
      callback(null);
      return;
    }

    const ctx = canvas.getContext('2d');
    fillNightBackground(ctx, 300, 400);

    drawBrandTitle(ctx, challengeUi.BRAND_NAME, 150, 56, 'bold 28px sans-serif');

    ctx.fillStyle = SUBTITLE;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._modeName(this._params.mode || 'classic'), 150, 110);

    ctx.fillStyle = MUTED;
    ctx.font = '14px sans-serif';
    ctx.fillText('得分', 150, 160);

    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(String(Number(this._params.score) || 0), 150, 210);

    ctx.fillStyle = SUBTITLE;
    ctx.font = '15px sans-serif';
    ctx.fillText('敢来一局吗？', 150, 262);

    for (let i = 0; i < AMBIENT_PIECE_COLORS.length; i++) {
      ctx.fillStyle = AMBIENT_PIECE_COLORS[i];
      ctx.globalAlpha = 0.85;
      const bx = 22 + i * 38;
      ctx.fillRect(bx, 318, 28, 28);
    }
    ctx.globalAlpha = 1;

    const exportOptions = {
      x: 0,
      y: 0,
      width: 300,
      height: 400,
      destWidth: 300,
      destHeight: 400,
      success: function (res) {
        callback(res.tempFilePath);
      },
      fail: function () {
        callback(null);
      }
    };

    if (typeof canvas.toTempFilePath === 'function') {
      canvas.toTempFilePath(exportOptions);
    } else {
      exportOptions.canvas = canvas;
      wx.canvasToTempFilePath(exportOptions);
    }
  }

  _modeName(mode) {
    return MODE_NAMES[mode] || '经典模式';
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
}

module.exports = ChallengeResultScene;