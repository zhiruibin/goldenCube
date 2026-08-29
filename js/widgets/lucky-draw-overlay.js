/**
 * LuckyDrawOverlay - 幸运卷轴摇奖遮罩（可嵌入结算页）
 * idle → 用户点「开始摇奖」→ rolling → result → 确认领取
 */
const { PIECES, PIECE_COLORS } = require('../../data/pieces');
const { ConfettiFx } = require('../render/confetti-fx');
const { rollCoinPrize } = require('../../utils/lucky-draw-manager');

const SYMBOLS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

class LuckyDrawOverlay {
    constructor() {
        this._active = false;
        this._phase = 'idle';
        this._elapsed = 0;
        this._prize = null;
        this._reels = [];
        this._btnRect = null;
        this._confirmRect = null;
        this._headline = '恭喜获得幸运卷轴！';
        this._subCelebrate = '即将进入摇奖…';
        this._onFinish = null;
        this._confettiFx = null;
        this._t1 = 0.35;
        this._t3 = 2.0;
        this._vmax = 1100;
    }

    init() {
        if (this._confettiFx) {
            this._confettiFx.destroy();
        }
        this._confettiFx = new ConfettiFx();
        this._confettiFx.init();
    }

    /** @param {{ headline?: string, subCelebrate?: string, onFinish?: (prize) => void }} opts */
    start(opts) {
        opts = opts || {};
        this._active = true;
        this._phase = 'celebrate';
        this._elapsed = 0;
        this._prize = null;
        this._headline = opts.headline || '恭喜获得幸运卷轴！';
        this._subCelebrate = opts.subCelebrate || '即将进入摇奖…';
        this._onFinish = typeof opts.onFinish === 'function' ? opts.onFinish : null;
        this._btnRect = null;
        this._confirmRect = null;
        this._buildReels();
        const game = GameGlobal && GameGlobal.game;
        if (this._confettiFx && game) {
            this._confettiFx.trigger(game.width / 2, game.height * 0.45);
        }
    }

    isActive() {
        return this._active;
    }

    destroy() {
        this._active = false;
        if (this._confettiFx) {
            this._confettiFx.destroy();
            this._confettiFx = null;
        }
    }

    update(dt) {
        if (!this._active) return;
        if (this._confettiFx) this._confettiFx.update(dt);

        if (this._phase === 'celebrate') {
            this._elapsed += dt;
            if (this._elapsed >= 1.2) {
                this._phase = 'idle';
                this._elapsed = 0;
            }
            return;
        }
        if (this._phase === 'result' || this._phase === 'done') return;
        if (this._phase !== 'rolling') return;

        this._elapsed += dt;
        const t = this._elapsed;
        const t1 = this._t1;
        const t3 = this._t3;
        const vmax = this._vmax;

        for (const reel of this._reels) {
            if (reel.settled) continue;
            const tConstEnd = t1 + reel.constDist / vmax;
            let v;
            if (t < t1) {
                v = vmax * (t / t1);
            } else if (t < tConstEnd) {
                v = vmax;
            } else {
                v = Math.max(0, vmax * (1 - (t - tConstEnd) / t3) ** 2);
            }
            reel.scroll += v * dt;
            if (reel.scroll >= reel.totalDist) {
                reel.scroll = reel.totalDist;
                reel.settled = true;
            } else if (t >= tConstEnd + t3) {
                reel.scroll = reel.totalDist;
                reel.settled = true;
            }
        }

        if (this._reels.every((reel) => reel.settled)) {
            this._phase = 'result';
            const game = GameGlobal && GameGlobal.game;
            if (this._confettiFx && game) {
                this._confettiFx.trigger(game.width / 2, game.height * 0.45);
            }
            try {
                const audio = game && game.audioManager;
                if (audio && typeof audio.playClick === 'function') {
                    audio.playClick();
                }
            } catch (e) { /* ignore */ }
            try {
                const vibrate = wx.getStorageSync('gc_setting_vibrate') !== false;
                if (vibrate && wx.vibrateShort) {
                    wx.vibrateShort({ type: 'light' });
                }
            } catch (e) { /* ignore */ }
        }
    }

    handleTap(x, y) {
        if (!this._active) return false;
        if (this._phase === 'celebrate' || this._phase === 'rolling') return true;
        if (this._phase === 'idle') {
            if (this._btnRect && this._hitRect(x, y, this._btnRect)) {
                this._beginRoll();
            }
            return true;
        }
        if (this._phase === 'result') {
            if (this._confirmRect && this._hitRect(x, y, this._confirmRect)) {
                this._finish();
            }
            return true;
        }
        return false;
    }

    render(ctx) {
        if (!this._active) return;
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this._phase === 'celebrate') {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(this._headline, W / 2, H / 2 - 60);
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px sans-serif';
            ctx.fillText(this._subCelebrate, W / 2, H / 2 + 10);
            this._btnRect = null;
            if (this._confettiFx && this._confettiFx.isActive()) {
                this._confettiFx.render(ctx);
            }
            return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('幸运卷轴', W / 2, H / 2 - 165);

        const cellH = 84;
        const winH = cellH * 3;
        const reelW = 76;
        const gap = 8;
        const winW = 3 * reelW + 2 * gap;
        const winLeft = W / 2 - winW / 2;
        const winTop = H / 2 - winH / 2 - 8;
        const centerY = winTop + cellH;
        const cellW = cellH * 0.86;

        ctx.fillStyle = 'rgba(10, 12, 30, 0.92)';
        this._roundRect(ctx, winLeft, winTop, winW, winH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.lineWidth = 2;
        this._roundRect(ctx, winLeft, winTop, winW, winH, 12);
        ctx.stroke();

        for (let i = 0; i < 3; i++) {
            const reel = this._reels[i];
            if (!reel || reel.rolling.length === 0) continue;
            const colLeft = winLeft + i * (reelW + gap);
            const blockX = colLeft + (reelW - cellW) / 2;
            const len = reel.rolling.length;

            ctx.save();
            ctx.beginPath();
            ctx.rect(colLeft, winTop, reelW, winH);
            ctx.clip();

            const firstK = Math.floor((winTop - cellH - centerY - reel.scroll) / cellH);
            for (let k = firstK; k <= firstK + 5; k++) {
                const sy = k * cellH + reel.scroll + centerY;
                const idx = ((k % len) + len) % len;
                const type = reel.rolling[idx];
                this._drawReelBlock(ctx, blockX, sy, cellW, cellH, type);
            }
            ctx.restore();
        }

        ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.lineWidth = 2.5;
        this._roundRect(ctx, winLeft - 4, winTop + cellH - 4, winW + 8, cellH + 8, 12);
        ctx.stroke();

        if (this._phase === 'idle') {
            this._btnRect = this._drawButton(ctx, '开始摇奖', H / 2 + 205);
        } else if (this._phase === 'result' && this._prize) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('+' + this._prize.amount + ' 金币', W / 2, H / 2 + 149);
            this._confirmRect = this._drawButton(ctx, '确定领取', H / 2 + 205);
        }

        if (this._confettiFx && this._confettiFx.isActive()) {
            this._confettiFx.render(ctx);
        }
    }

    _buildReels() {
        const reelLen = 7;
        const reels = [];
        for (let i = 0; i < 3; i++) {
            const symbols = SYMBOLS.slice();
            for (let k = symbols.length - 1; k > 0; k--) {
                const j = Math.floor(Math.random() * (k + 1));
                const tmp = symbols[k];
                symbols[k] = symbols[j];
                symbols[j] = tmp;
            }
            reels.push({
                rolling: symbols,
                resultIdx: Math.floor(Math.random() * reelLen),
                scroll: 0,
                totalDist: 0,
                settled: false,
            });
        }
        this._reels = reels;
    }

    _beginRoll() {
        if (this._phase !== 'idle') return;
        this._phase = 'rolling';
        this._elapsed = 0;
        if (!this._reels || this._reels.length !== 3) {
            this._buildReels();
        }

        this._prize = rollCoinPrize();
        const tier = this._prize.tier || 1;
        const targets = [];
        if (tier === 3) {
            const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            targets.push(s, s, s);
        } else if (tier === 2) {
            const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            let other = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            while (other === s) {
                other = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            }
            const diffReel = Math.floor(Math.random() * 3);
            for (let i = 0; i < 3; i++) {
                targets.push(i === diffReel ? other : s);
            }
        } else {
            const shuffled = SYMBOLS.slice();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = shuffled[i];
                shuffled[i] = shuffled[j];
                shuffled[j] = tmp;
            }
            targets.push(shuffled[0], shuffled[1], shuffled[2]);
        }

        for (let i = 0; i < this._reels.length; i++) {
            const symbols = this._reels[i].rolling;
            const targetSymbol = targets[i];
            const targetIdx = symbols.indexOf(targetSymbol);
            const resultIdx = this._reels[i].resultIdx;
            symbols[targetIdx] = symbols[resultIdx];
            symbols[resultIdx] = targetSymbol;
        }

        const cellH = 84;
        const reelLen = 7;
        const minDist = 3 * reelLen * cellH;
        const t1 = 0.35;
        const t3 = 2.0;
        const vmax = 1100;
        const distAccel = 0.5 * vmax * t1;
        const distDecel = vmax * t3 / 3;

        for (let i = 0; i < this._reels.length; i++) {
            const target = minDist + ((reelLen - this._reels[i].resultIdx) % reelLen) * cellH;
            const constDist = Math.max(0, target - distAccel - distDecel);
            this._reels[i].constDist = constDist;
            this._reels[i].totalDist = distAccel + constDist + distDecel;
        }
        this._t1 = t1;
        this._t3 = t3;
        this._vmax = vmax;
    }

    _finish() {
        if (this._phase !== 'result') return;
        const prize = this._prize;
        this._phase = 'done';
        this._active = false;
        if (this._onFinish && prize) {
            this._onFinish(prize);
        }
        this._onFinish = null;
    }

    _drawReelBlock(ctx, x, y, w, h, type) {
        const color = 'rgba(80, 85, 120, 0.5)';
        ctx.fillStyle = color;
        this._roundRect(ctx, x, y, w, h, 12);
        ctx.fill();

        const shape = (PIECES[type] && PIECES[type].shapes && PIECES[type].shapes[0]) || null;
        if (shape) {
            const rows = shape.length;
            const cols = shape[0].length;
            const cell = Math.floor(Math.min(w, h) * 0.20);
            const gap = Math.max(1, Math.floor(cell * 0.2));
            const ox = x + (w - (cols * cell + (cols - 1) * gap)) / 2;
            const oy = y + (h - (rows * cell + (rows - 1) * gap)) / 2;
            ctx.fillStyle = (PIECE_COLORS[type] || '#888888');
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (shape[r][c] === 1) {
                        const bx = ox + c * (cell + gap);
                        const by = oy + r * (cell + gap);
                        ctx.fillRect(bx, by, cell, cell);
                        ctx.strokeRect(bx + 0.5, by + 0.5, cell - 1, cell - 1);
                    }
                }
            }
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold ' + (h * 0.42) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(type, x + w / 2, y + h / 2);
        }
    }

    _drawButton(ctx, label, cy) {
        const W = GameGlobal.game.width;
        const bw = Math.min(220, W * 0.6);
        const bh = 50;
        const bx = W / 2 - bw / 2;
        const by = cy - bh / 2;

        ctx.fillStyle = '#f0a000';
        this._roundRect(ctx, bx, by, bw, bh, 12);
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, bx, by, bw, bh, 12);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(label, W / 2, cy);
        return { x: bx, y: by, w: bw, h: bh };
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    _hitRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }
}

module.exports = { LuckyDrawOverlay };
