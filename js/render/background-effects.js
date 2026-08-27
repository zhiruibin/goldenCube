/*** BackgroundEffects - 全屏背景特效模块
 * 离屏预渲染深色渐变；星尘 + 多流星 + 脉冲星。
 * 按 benchmarkLevel 分档粒子数，低端机自动降级。
 */

/** 同屏最多流星数 */
const METEOR_MAX = 3;
/** 流星生成间隔（秒） */
const METEOR_SPAWN_MIN = 1.2;
const METEOR_SPAWN_MAX = 2.8;
/** 脉冲星占比（更明显的明暗呼吸） */
const PULSE_STAR_RATIO = 0.35;

function BackgroundEffects() {
  const systemInfo = wx.getSystemInfoSync();
  const level = systemInfo.benchmarkLevel || 2;

  if (level >= 3) {
    this._maxParticles = 32;
  } else if (level === 2) {
    this._maxParticles = 16;
  } else {
    this._maxParticles = 8;
  }

  let width = 375;
  let height = 667;
  if (typeof GameGlobal !== 'undefined' && GameGlobal.game) {
    width = GameGlobal.game.width || width;
    height = GameGlobal.game.height || height;
  }
  this._width = width;
  this._height = height;

  this._enabled = true;
  this._frame = 0;
  this._particles = [];
  this._gradientCanvas = null;
  this._pulse = null;
  // 偏暖白/琥珀星尘，弱化冷蓝赛博感
  this._starColors = ['#ffffff', '#ffe9a8', '#ffd6a0', '#e8e4ff'];
  /** @type {Array} 可同时存在多条流星 */
  this._meteors = [];
  this._meteorTimer = 1.5 + Math.random() * 1.5;
}

BackgroundEffects.prototype.init = function () {
  const canvas = wx.createCanvas();
  canvas.width = this._width;
  canvas.height = this._height;
  const ctx = canvas.getContext('2d');
  // 对局全屏底：深色可读 + 略暖夜场（非冷紫赛博）
  const gradient = ctx.createLinearGradient(0, 0, 0, this._height);
  gradient.addColorStop(0, '#243056');
  gradient.addColorStop(0.5, '#161d32');
  gradient.addColorStop(1, '#0c1020');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, this._width, this._height);
  this._gradientCanvas = canvas;

  for (let i = 0; i < this._maxParticles; i++) {
    this._particles.push(this._createStar(true));
  }
};

/** 生成一颗星；部分标记为脉冲星 */
BackgroundEffects.prototype._createStar = function (randomY) {
  const pulse = Math.random() < PULSE_STAR_RATIO;
  return {
    x: Math.random() * this._width,
    y: randomY ? Math.random() * this._height : -4,
    vx: (Math.random() - 0.5) * 12,
    vy: 8 + Math.random() * 16,
    size: pulse ? (4 + Math.random() * 3.5) : (2.5 + Math.random() * 3),
    alpha: pulse ? (0.7 + Math.random() * 0.3) : (0.5 + Math.random() * 0.5),
    color: this._starColors[Math.floor(Math.random() * this._starColors.length)],
    twinkle: Math.random() * Math.PI * 2,
    // 脉冲星闪得更快、幅度在 render 里拉大
    twinkleSpeed: pulse ? (2.2 + Math.random() * 2.8) : (1 + Math.random() * 3),
    pulse: pulse,
  };
};

BackgroundEffects.prototype._spawnMeteor = function () {
  // 偏向上半屏与左右侧，减少正中穿棋盘抢戏
  const fromLeft = Math.random() > 0.5;
  const x = fromLeft
    ? Math.random() * this._width * 0.45
    : this._width * 0.4 + Math.random() * this._width * 0.45;
  this._meteors.push({
    x: x,
    y: -16 - Math.random() * 24,
    vx: (fromLeft ? 1 : -0.3) * (100 + Math.random() * 90),
    vy: 85 + Math.random() * 70,
    life: 1.15,
    maxLife: 1.15,
  });
};

BackgroundEffects.prototype.isEnabled = function () {
  return this._enabled && (this._gradientCanvas !== null || this._particles.length > 0);
};

BackgroundEffects.prototype.setEnabled = function (enabled) {
  this._enabled = !!enabled;
};

BackgroundEffects.prototype.update = function (dt) {
  if (!this._enabled) {
    return;
  }

  // 流星与消行脉冲每帧更新，保证连贯
  if (this._meteorTimer > 0) {
    this._meteorTimer -= dt;
  }
  if (this._meteorTimer <= 0) {
    if (this._meteors.length < METEOR_MAX) {
      this._spawnMeteor();
      this._meteorTimer = METEOR_SPAWN_MIN +
        Math.random() * (METEOR_SPAWN_MAX - METEOR_SPAWN_MIN);
    } else {
      // 已满：短间隔后再尝试，避免 timer 卡在 0 导致刚腾出空位就连刷
      this._meteorTimer = 0.35 + Math.random() * 0.4;
    }
  }
  for (let i = this._meteors.length - 1; i >= 0; i--) {
    const m = this._meteors[i];
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.life -= dt;
    if (m.life <= 0 || m.y > this._height + 30 || m.x < -30 || m.x > this._width + 30) {
      this._meteors.splice(i, 1);
    }
  }

  if (this._pulse !== null) {
    this._pulse.time += dt * 2;
    if (this._pulse.time >= this._pulse.duration) {
      this._pulse = null;
    }
  }

  // 星尘隔帧更新，省一点算力
  this._frame++;
  if (this._frame % 2 !== 0) {
    return;
  }
  // 隔帧时用双倍 dt，位移近似连续
  const starDt = dt * 2;
  for (let i = 0; i < this._particles.length; i++) {
    const p = this._particles[i];
    p.y += p.vy * starDt;
    p.x += p.vx * starDt;
    p.twinkle += p.twinkleSpeed * starDt;
    if (p.y > this._height + 4) {
      this._particles[i] = this._createStar(false);
    }
  }
};

BackgroundEffects.prototype.trigger = function (type) {
  if (type === 'tetris') {
    this._pulse = { color: '#FFD700', alpha: 0.3, time: 0, duration: 0.5 };
  } else {
    this._pulse = { color: '#ffffff', alpha: 0.18, time: 0, duration: 0.5 };
  }
};

BackgroundEffects.prototype.render = function (ctx) {
  if (!this._enabled) {
    return;
  }

  if (this._gradientCanvas !== null) {
    ctx.drawImage(this._gradientCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#12182c';
    ctx.fillRect(0, 0, this._width, this._height);
  }

  for (let i = 0; i < this._particles.length; i++) {
    const p = this._particles[i];
    const wave = 0.5 + 0.5 * Math.sin(p.twinkle);
    let alpha;
    if (p.pulse) {
      // 脉冲星：明暗对比更大，亮时带淡光晕
      alpha = p.alpha * (0.2 + 0.8 * wave);
      if (wave > 0.55) {
        ctx.globalAlpha = alpha * 0.28;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x + p.size / 2, p.y + p.size / 2, p.size * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      alpha = p.alpha * (0.55 + 0.45 * wave);
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    if (p.pulse || p.size > 4.5) {
      ctx.fillRect(p.x - 3, p.y + p.size / 2 - 0.5, 6, 1);
      ctx.fillRect(p.x + p.size / 2 - 0.5, p.y - 3, 1, 6);
    }
  }

  for (let i = 0; i < this._meteors.length; i++) {
    const m = this._meteors[i];
    const fade = Math.min(1, m.life * 2.2) * Math.min(1, (m.maxLife - m.life) * 8 + 0.4);
    const trail = 0.22;
    ctx.globalAlpha = 0.45 * fade;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(m.x - m.vx * trail, m.y - m.vy * trail);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    ctx.globalAlpha = 0.95 * fade;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  if (this._pulse !== null) {
    const pulse = this._pulse;
    const progress = Math.min(1, pulse.time / pulse.duration);
    ctx.globalAlpha = pulse.alpha * (1 - progress);
    ctx.fillStyle = pulse.color;
    ctx.fillRect(0, 0, this._width, this._height);
    ctx.globalAlpha = 1;
  }
};

BackgroundEffects.prototype.destroy = function () {
  this._particles.length = 0;
  this._meteors.length = 0;
  this._gradientCanvas = null;
  this._pulse = null;
};

module.exports = { BackgroundEffects };
