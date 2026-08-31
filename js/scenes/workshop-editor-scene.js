/**
 * WorkshopEditorScene - 点涂垃圾布局编辑器
 * 顶栏文字化（‹ 返回 / 保存），试玩前自动保存并提示
 */
const { Button } = require('../widgets/button');
const {
    fillNightBackground,
    drawBrandTitle,
    MUTED,
    SUBTITLE,
} = require('../theme/arcade-night');
const workshop = require('../../utils/workshop-manager');
const { drawGarbageLayoutCell } = require('../render/garbage-cell');
const { drawLayoutBoardTiles } = require('../render/board-tiles');

class WorkshopEditorScene {
    constructor() {
        this._stageId = null;
        this._rows = null;
        this._tool = 'paint';
        this._buttons = [];
        this._undoStack = [];
        this._toast = '';
        this._toastUntil = 0;
        this._painting = false;
        this._dirty = false;
        this._chromeHits = [];
        this._trialBusy = false;
    }

    onEnter(params) {
        this._stageId = (params && params.stageId) || null;
        const stage = workshop.getStage(this._stageId);
        if (!stage) {
            GameGlobal.game.sceneManager.back();
            return;
        }
        this._rows = workshop.cloneRows(stage.rows);
        this._title = stage.title || '未命名关卡';
        this._undoStack = [];
        this._tool = 'paint';
        this._dirty = false;
        this._trialBusy = false;
        this._buildUI();
        if (params && params.toast) this._showToast(params.toast);
    }

    onExit() {
        // 不在此处强行保存：返回时由 _back 询问用户
        this._buttons = [];
        this._chromeHits = [];
        this._trialBusy = false;
    }

    update() {
        if (this._toast && Date.now() > this._toastUntil) this._toast = '';
    }

    _showToast(msg) {
        this._toast = msg || '';
        this._toastUntil = Date.now() + 2000;
    }

    /** 顶栏起点：避开状态栏 + 微信右上角胶囊 */
    _getHeaderMetrics() {
        const W = GameGlobal.game.width;
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;

        let capsuleBottom = Math.max(statusBarHeight, safeTop) + 32;
        try {
            if (typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect) {
                const rect = wx.getMenuButtonBoundingClientRect();
                if (rect && rect.height > 0) capsuleBottom = rect.bottom;
            }
        } catch (e) { /* 非微信环境忽略 */ }

        return {
            headerTop: Math.max(statusBarHeight, safeTop, capsuleBottom) + 12,
        };
    }

    _pushUndo() {
        this._undoStack.push(workshop.cloneRows(this._rows));
        if (this._undoStack.length > 40) this._undoStack.shift();
    }

    _buildUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const { headerTop } = this._getHeaderMetrics();
        this._headerTop = headerTop;
        this._buttons = [];
        this._chromeHits = [];

        // 单行顶栏：文字返回 | 关卡名 | 文字保存
        const chromeY = headerTop + 14;
        this._titleY = chromeY;
        this._metaY = chromeY + 24;

        this._chromeHits.push({
            id: 'back',
            x: 8,
            y: chromeY - 18,
            w: 72,
            h: 36,
        });
        this._chromeHits.push({
            id: 'save',
            x: W - 72,
            y: chromeY - 18,
            w: 64,
            h: 36,
        });
        this._titleHit = {
            x: 80,
            y: chromeY - 18,
            w: W - 160,
            h: 36,
        };

        const toolsY = H - 150;
        const tw = (W - 40) / 4;
        const tools = [
            { id: 'paint', label: '绘制', color: '#c9a227', toggle: true },
            { id: 'erase', label: '橡皮', color: '#6eb5d0', toggle: true },
            { id: 'clear', label: '清空', color: '#a04040', toggle: false },
            { id: 'mirror', label: '镜像', color: '#3a7ab0', toggle: false },
        ];
        tools.forEach((t, i) => {
            this._buttons.push(new Button({
                x: 10 + i * (tw + 6),
                y: toolsY,
                w: tw,
                h: 40,
                text: t.label,
                color: t.toggle && this._tool === t.id ? t.color : '#444',
                onClick: () => {
                    if (t.id === 'clear') {
                        this._pushUndo();
                        this._rows = workshop.emptyRows();
                        this._dirty = true;
                        return;
                    }
                    if (t.id === 'mirror') {
                        this._pushUndo();
                        this._mirror();
                        this._dirty = true;
                        return;
                    }
                    this._tool = t.id;
                    this._buildUI();
                },
            }));
        });

        this._buttons.push(new Button({
            x: 10,
            y: toolsY + 48,
            w: (W - 26) / 2,
            h: 40,
            text: '撤销',
            color: '#555',
            onClick: () => {
                if (!this._undoStack.length) {
                    this._showToast('没有可撤销');
                    return;
                }
                this._rows = this._undoStack.pop();
                this._dirty = true;
            },
        }));
        this._buttons.push(new Button({
            x: 16 + (W - 26) / 2,
            y: toolsY + 48,
            w: (W - 26) / 2,
            h: 40,
            text: '试玩',
            color: '#2ecc71',
            onClick: () => this._trial(),
        }));

        const boardBottom = toolsY - 12;
        const boardTop = this._metaY + 14;
        const availH = Math.max(40, boardBottom - boardTop);
        const availW = W - 24;
        const cell = Math.floor(Math.min(availW / 10, availH / 20));
        const boardW = cell * 10;
        const boardH = cell * 20;
        this._cell = cell;
        this._boardX = (W - boardW) / 2;
        this._boardY = boardTop + Math.max(0, (availH - boardH) / 2);
        this._boardW = boardW;
        this._boardH = boardH;
    }

    _mirror() {
        const next = workshop.emptyRows();
        for (let y = 0; y < 20; y++) {
            const line = this._rows[String(y)];
            let out = '';
            for (let x = 9; x >= 0; x--) out += line[x];
            next[String(y)] = out;
        }
        this._rows = next;
    }

    _promptRename() {
        const cur = this._title || '未命名关卡';
        const apply = (title) => {
            this._title = title;
            this._dirty = true;
            this._showToast('已改名');
        };
        try {
            wx.showModal({
                title: '关卡名称',
                editable: true,
                placeholderText: '最多 20 字',
                content: cur,
                confirmText: '确定',
                cancelText: '取消',
                success: (res) => {
                    if (!res || !res.confirm) return;
                    let title = String(res.content != null ? res.content : '').trim().slice(0, 20);
                    if (!title) title = '未命名关卡';
                    apply(title);
                },
            });
        } catch (e) {
            this._showToast('当前环境不支持输入');
        }
    }

    /**
     * @param {boolean} [showToast]
     * @returns {{ ok: boolean, valid: boolean, reason?: string }}
     */
    _persist(showToast) {
        const v = workshop.validateLayout(this._rows);
        const res = workshop.updateStage(this._stageId, {
            rows: this._rows,
            title: this._title,
        });
        if (!res.ok) {
            if (showToast) {
                this._showToast(res.reason === 'reviewing' ? '审核中不可改' : '保存失败');
            }
            return { ok: false, valid: !!v.ok, reason: res.reason };
        }
        this._dirty = false;
        if (showToast) {
            if (!v.ok) this._showToast('已保存草稿（' + v.reason + '）');
            else this._showToast('已保存');
        }
        return { ok: true, valid: !!v.ok, reason: v.reason };
    }

    _save() {
        this._persist(true);
    }

    _back() {
        if (!this._dirty) {
            GameGlobal.game.sceneManager.back();
            return;
        }
        try {
            wx.showModal({
                title: '保存修改？',
                content: '关卡有未保存的改动',
                confirmText: '保存',
                cancelText: '不保存',
                success: (res) => {
                    if (res && res.confirm) {
                        this._persist(false);
                        GameGlobal.game.sceneManager.back();
                        return;
                    }
                    // 取消 / 不保存：丢弃内存改动，直接返回（存储仍是上次保存版）
                    if (res && res.cancel) {
                        GameGlobal.game.sceneManager.back();
                    }
                },
            });
        } catch (e) {
            GameGlobal.game.sceneManager.back();
        }
    }

    _trial() {
        if (this._trialBusy) return;
        // 试玩前必须落盘，否则对局读到旧布局
        const saved = this._persist(false);
        if (!saved.ok) {
            this._showToast('保存失败，无法试玩');
            return;
        }
        const v = workshop.validateLayout(this._rows);
        if (!v.ok) {
            this._showToast('已保存，' + v.reason);
            return;
        }
        const stage = workshop.getStage(this._stageId);
        if (!stage) {
            this._showToast('关卡不存在');
            return;
        }
        const gameParams = {
            mode: 'stage',
            workshop: true,
            workshopStageId: stage.stageId,
            workshopRows: workshop.cloneRows(stage.rows),
            workshopTitle: stage.title,
            authorTrial: true,
            workshopReturnTo: 'editor',
            entryPaid: 0,
            dropIntervalMs: stage.dropIntervalMs || 1000,
        };
        this._trialBusy = true;
        // 用系统 Toast + 短延迟，避免一切换场景就看不到「已保存」
        try {
            wx.showToast({ title: '已保存，开始试玩', icon: 'none', duration: 1200 });
        } catch (e) {
            this._showToast('已保存，开始试玩');
        }
        setTimeout(() => {
            this._trialBusy = false;
            GameGlobal.game.sceneManager.switchTo('game', gameParams);
        }, 480);
    }

    _cellAt(x, y) {
        if (x < this._boardX || y < this._boardY) return null;
        const col = Math.floor((x - this._boardX) / this._cell);
        const row = Math.floor((y - this._boardY) / this._cell);
        if (col < 0 || col >= 10 || row < 0 || row >= 20) return null;
        return { row, col };
    }

    _paintAt(row, col) {
        const key = String(row);
        const line = this._rows[key].split('');
        const ch = this._tool === 'erase' ? '.' : '#';
        if (line[col] === ch) return;
        line[col] = ch;
        this._rows[key] = line.join('');
        this._dirty = true;
    }

    _hitChrome(x, y) {
        for (let i = 0; i < this._chromeHits.length; i++) {
            const r = this._chromeHits[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
        }
        return null;
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        fillNightBackground(ctx, W, H);

        const titleY = this._titleY != null ? this._titleY : 80;
        const metaY = this._metaY != null ? this._metaY : titleY + 24;

        // 顶栏文字操作（无实心按钮）
        ctx.textBaseline = 'middle';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillText('‹ 返回', 14, titleY);

        ctx.textAlign = 'right';
        ctx.fillStyle = SUBTITLE;
        ctx.fillText('保存', W - 14, titleY);

        const name = this._title || '未命名关卡';
        drawBrandTitle(ctx, name, W / 2, titleY, 'bold 20px sans-serif');

        const meta = workshop.analyzeLayout(this._rows);
        ctx.fillStyle = MUTED;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            '点名称可改名 · 垃圾 ' + meta.garbageCount + ' · 行 ' + meta.minLines
            + (meta.fullRow ? ' · 有满行!' : ''),
            W / 2,
            metaY
        );

        const occ = [];
        for (let r = 0; r < 20; r++) {
            occ[r] = [];
            const line = this._rows[String(r)] || '';
            for (let c = 0; c < 10; c++) {
                occ[r][c] = line[c] === '#';
            }
        }
        if (!drawLayoutBoardTiles(ctx, this._boardX, this._boardY, 10, 20, this._cell, occ)) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(this._boardX - 2, this._boardY - 2, this._boardW + 4, this._boardH + 4);
        }
        for (let r = 0; r < 20; r++) {
            const line = this._rows[String(r)];
            for (let c = 0; c < 10; c++) {
                const px = this._boardX + c * this._cell;
                const py = this._boardY + r * this._cell;
                if (line[c] === '#') {
                    drawGarbageLayoutCell(ctx, px + 0.5, py + 0.5, this._cell - 1, c, r);
                }
            }
        }
        ctx.strokeStyle = 'rgba(255,100,100,0.45)';
        ctx.beginPath();
        ctx.moveTo(this._boardX, this._boardY + 6 * this._cell);
        ctx.lineTo(this._boardX + this._boardW, this._boardY + 6 * this._cell);
        ctx.stroke();

        for (const btn of this._buttons) btn.render(ctx);

        if (this._toast) {
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            const tw = Math.min(W * 0.85, 300);
            ctx.fillRect(W / 2 - tw / 2, H * 0.4, tw, 40);
            ctx.fillStyle = '#fff';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._toast, W / 2, H * 0.4 + 20);
        }
    }

    handleTouchStart(identifier, x, y) {
        this._touchId = identifier;
        this._touchDidPaint = false;
        if (this._hitChrome(x, y) || (this._titleHit
            && x >= this._titleHit.x && x <= this._titleHit.x + this._titleHit.w
            && y >= this._titleHit.y && y <= this._titleHit.y + this._titleHit.h)) {
            return;
        }
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                this._pendingBtn = btn;
                return;
            }
        }
        const cell = this._cellAt(x, y);
        if (cell) {
            this._pushUndo();
            this._painting = true;
            this._touchDidPaint = true;
            this._paintAt(cell.row, cell.col);
        }
    }

    handleTouchMove(identifier, x, y) {
        if (identifier !== this._touchId) return;
        if (!this._painting) return;
        const cell = this._cellAt(x, y);
        if (cell) this._paintAt(cell.row, cell.col);
    }

    handleTouchEnd(identifier) {
        if (identifier != null && identifier !== this._touchId) return;
        this._painting = false;
        this._touchId = null;
        // 松手不自动保存；有改动时点返回再询问
    }

    handleTap(x, y) {
        if (this._painting) return;
        const chrome = this._hitChrome(x, y);
        if (chrome === 'back') {
            this._back();
            return;
        }
        if (chrome === 'save') {
            this._save();
            return;
        }
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                btn.trigger();
                return;
            }
        }
        const hit = this._titleHit;
        if (hit && x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
            this._promptRename();
        }
    }

    onTouchStart() {}
    onTouchMove() {}
    onTouchEnd() {}
}

module.exports = WorkshopEditorScene;
