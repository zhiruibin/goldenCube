// 底部迷你方块：七种标准形状，格子是共用的暖色石块（各主题不换图）+ 晃动彩蛋
const { PIECES, PIECE_COLORS } = require('../../data/pieces');

const STONE_WARM = '#c4a574';
const STONE_SIDE = '#5c3a24';
const STONE_SHADE = '#3a2416';

const MINI_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

class MiniTetrisFx {
  constructor() {
    this._enabled = false;
    this._listening = false;
    this._pieces = [];
    this._layout = null;
    this._onTouch = null;
  }

  init(layout) {
    this._layout = layout || {};
    this._interactive = layout.interactive !== false;
    let on = wx.getStorageSync('gc_setting_miniFx') !== false;
    let lowEnd = false;
    try {
      const info = wx.getSystemInfoSync();
      if (typeof info.benchmarkLevel === 'number' && info.benchmarkLevel > 0 && info.benchmarkLevel < 25) {
        lowEnd = true;
      }
    } catch (e) {
      // ignore
    }
    this.setEnabled(on && !lowEnd);
  }

  setEnabled(on) {
    this._enabled = !!on;
    if (this._enabled) {
      this._buildPieces();
      this._startListening();
    } else {
      this._stopListening();
    }
  }

  pause() {
    this._stopListening();
  }

  resume() {
    if (this._enabled) {
      this._startListening();
    }
  }

  destroy() {
    this._stopListening();
    this._pieces = [];
    this._layout = null;
  }

  _startListening() {
    if (!this._interactive || this._listening || !wx.onTouchStart) return;
    try {
      this._onTouch = (e) => {
        if (!e.touches || !e.touches.length) return;
        const touch = e.touches[0];
        const cx = touch.clientX;
        const cy = touch.clientY;
        let hit = false;
        for (const p of this._pieces) {
          if (Math.abs(cx - p.x) <= p.w / 2 && Math.abs(cy - p.y) <= p.h / 2) {
            hit = true;
            break;
          }
        }
        if (!hit) return;
        for (const p of this._pieces) {
          p.vx += (Math.random() - 0.5) * 500;
        }
      };
      wx.onTouchStart(this._onTouch);
      this._listening = true;
    } catch (e) {
      this._listening = false;
    }
  }

  _stopListening() {
    if (!this._listening) {
      return;
    }
    try {
      if (this._onTouch) {
        wx.offTouchStart(this._onTouch);
      }
    } catch (e) {
      // ignore
    }
    this._listening = false;
  }

  _buildPieces() {
    if (!this._layout) return;
    const W = this._layout.width;
    const H = this._layout.height;
    const bottomSafe = this._layout.bottomSafe || 0;
    const controlBottom = this._layout.controlBottom;

    let areaTop;
    let areaBottom;
    if (typeof this._layout.areaTop === 'number' && typeof this._layout.areaBottom === 'number') {
      areaTop = this._layout.areaTop;
      areaBottom = this._layout.areaBottom;
    } else {
      areaTop = (controlBottom || 0) + 6;
      areaBottom = H - bottomSafe - 6;
    }
    const areaH = areaBottom - areaTop;

    let cell = Math.max(8, Math.min(13, Math.floor((W - 36) / 26)));
    const gap = Math.max(3, Math.floor(cell * 0.34));
    const pieceGap = Math.max(6, Math.floor(cell * 0.9));

    let totalW = 0;
    const metas = [];
    for (const t of MINI_TYPES) {
      const shape = PIECES[t].shapes[0];
      const w = shape[0].length * (cell + gap) - gap;
      const h = shape.length * (cell + gap) - gap;
      metas.push({ type: t, shape, w, h });
      totalW += w;
    }
    totalW += pieceGap * (7 - 1);

    let scale = 1;
    if (totalW > W - 40) {
      scale = (W - 40) / totalW;
    }

    const centerY = areaTop + areaH / 2;
    let cx = (W - totalW * scale) / 2;

    this._pieces = [];
    for (const m of metas) {
      const item = {
        type: m.type,
        shape: m.shape,
        color: PIECE_COLORS[m.type],
        baseX: cx + m.w / 2,
        baseY: centerY,
        x: cx + m.w / 2,
        y: centerY,
        vx: 0,
        w: m.w,
        h: m.h,
        cell: cell * scale,
        gap: gap * scale,
      };
      this._pieces.push(item);
      cx += m.w + pieceGap * scale;
    }
  }

  isBusy() {
    if (!this._enabled || !this._pieces.length) return false;
    for (let i = 0; i < this._pieces.length; i++) {
      if (Math.abs(this._pieces[i].vx) > 2) return true;
    }
    return false;
  }

  update(dt) {
    if (!this._enabled || !this._pieces.length) return;
    dt = Math.min(dt, 0.05);

    for (const p of this._pieces) {
      p.vx += (-26 * (p.x - p.baseX) - 4.2 * p.vx) * dt;
      p.x += p.vx * dt;
    }

    // 相邻方块弹性碰撞
    for (let i = 0; i < this._pieces.length - 1; i++) {
      const a = this._pieces[i];
      const b = this._pieces[i + 1];
      const minGap = (a.w + b.w) / 2;
      const dx = b.x - a.x;
      if (dx < minGap) {
        const overlap = minGap - dx;
        a.x -= overlap / 2;
        b.x += overlap / 2;
        const tmp = a.vx;
        a.vx = b.vx * 0.9;
        b.vx = tmp * 0.9;
      }
    }

    // 边界限制
    const margin = 20;
    for (const p of this._pieces) {
      const minX = margin + p.w / 2;
      const maxX = this._layout.width - margin - p.w / 2;
      if (p.x < minX) {
        p.x = minX;
        p.vx = 0;
      } else if (p.x > maxX) {
        p.x = maxX;
        p.vx = 0;
      }
    }
  }

  render(ctx) {
    if (!this._enabled || !this._pieces.length) return;
    for (const p of this._pieces) {
      this._drawPieceShadow(ctx, p);
      const ox = p.x - p.w / 2;
      const oy = p.y - p.h / 2;
      const tone = _stoneTone(p.color);
      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (p.shape[r][c] === 1) {
            const rx = ox + c * (p.cell + p.gap);
            const ry = oy + r * (p.cell + p.gap);
            _drawStoneCell(ctx, rx, ry, p.cell, tone);
          }
        }
      }
    }
  }

  _drawPieceShadow(ctx, p) {
    ctx.save();
    ctx.fillStyle = 'rgba(28, 16, 8, 0.28)';
    ctx.beginPath();
    const rx = Math.max(3, p.w * 0.42);
    const ry = Math.max(1.6, p.cell * 0.22);
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(p.x, p.y + p.h * 0.38, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.rect(p.x - rx, p.y + p.h * 0.38 - ry, rx * 2, ry * 2);
    }
    ctx.fill();
    ctx.restore();
  }
}

function _hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _mix(hex, target, t) {
  const a = _hexToRgb(hex);
  const b = _hexToRgb(target);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

/** 霓虹色压进暖石，侧面再压暗，七色仍能分开。 */
function _stoneTone(hex) {
  return {
    top: _mix(hex, STONE_WARM, 0.46),
    side: _mix(hex, STONE_SIDE, 0.58),
    shade: _mix(hex, STONE_SHADE, 0.7),
  };
}

function _drawStoneCell(ctx, x, y, size, tone) {
  const s = Math.max(4, size);
  const d = Math.max(1.5, s * 0.26);
  const w = s - d;

  ctx.fillStyle = tone.side;
  ctx.beginPath();
  ctx.moveTo(x + w, y + 0.5);
  ctx.lineTo(x + s, y + d * 0.7);
  ctx.lineTo(x + s, y + d * 0.7 + w);
  ctx.lineTo(x + w, y + w);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = tone.shade;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + w);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x + s, y + w + d * 0.7);
  ctx.lineTo(x + d * 0.7, y + w + d * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = tone.top;
  ctx.fillRect(x, y, w, w);
  ctx.fillStyle = 'rgba(255, 236, 210, 0.32)';
  ctx.fillRect(x, y, w, Math.max(1, s * 0.12));
  ctx.fillStyle = 'rgba(48, 28, 14, 0.22)';
  ctx.fillRect(x, y, Math.max(1, s * 0.1), w);
}

module.exports = { MiniTetrisFx };