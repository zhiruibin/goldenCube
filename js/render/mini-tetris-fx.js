// 底部迷你方块特效：7 种标准迷你方块静态展示 + 晃动彩蛋
const { PIECES, PIECE_COLORS } = require('../../data/pieces');

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

    let cell = Math.max(6, Math.min(10, Math.floor((W - 48) / 28)));
    const gap = Math.max(2, Math.floor(cell * 0.3));
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
      const ox = p.x - p.w / 2;
      const oy = p.y - p.h / 2;
      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (p.shape[r][c] === 1) {
            const rx = ox + c * (p.cell + p.gap);
            const ry = oy + r * (p.cell + p.gap);
            ctx.fillStyle = p.color;
            ctx.fillRect(rx, ry, p.cell, p.cell);
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(rx, ry, p.cell, Math.max(1, p.cell * 0.25));
          }
        }
      }
    }
  }
}

module.exports = { MiniTetrisFx };