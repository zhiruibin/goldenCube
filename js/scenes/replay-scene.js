/*** ReplayScene - 战局回放场景（M1 本地闭环）
 * 职责：按回放数据重建引擎（注入种子保证方块序列可复现），
 *       以虚拟时钟推进引擎并按时序回放输入，支持 1x/2x/4x 倍速、暂停/继续与返回。
 */

const { TetrisEngine, HIDDEN_ROWS } = require('../../utils/tetris-engine');
const { BoardRenderer } = require('../render/board-renderer');
const { PieceRenderer } = require('../render/piece-renderer');// 兼容 ReplayRecorder 命名导出 / 默认导出两种写法
const { EffectRenderer } = require('../render/effect-renderer');
const ReplayRecorderModule = require('../../utils/replay-recorder');
const { BackgroundEffects } = require('../render/background-effects');
const ReplayRecorder = ReplayRecorderModule.ReplayRecorder || ReplayRecorderModule;

/** 回放输入动作 -> 引擎方法映射（与 ReplayRecorder.record 的 action 命名对齐） */
const ACTION_MAP = {
    left: 'moveLeft',
    right: 'moveRight',
    rotateCW: 'rotateCW',
    rotateCCW: 'rotateCCW',
    softDrop: 'softDrop',
    hardDrop: 'hardDrop',
    hold: 'hold',
};

/** 倍速档位（循环切换：1x -> 2x -> 4x -> 1x） */
const SPEED_LEVELS = [1, 2, 4];

/** 对局类型中文名（顶部信息栏；无经典/限时/马拉松） */
const MODE_LABELS = {
    stage: '闯关',
    workshop: '工坊',
    plaza: '广场',
    challenge: '挑战',
};

class ReplayScene {
    constructor() {
        this._params = null;
        this._data = null;
        this._engine = null;
        this._boardRenderer = null;
        this._pieceRenderer = null;
        this._effectRenderer = null;
        this._hardDropStartRow = null;
        this._bgEffects = null;

        /** 回放虚拟时钟（秒，按 dt * 倍速 累加） */
        this._playTime = 0;
        /** 回放总时长（毫秒，来自录制数据 durationMs） */
        this._durationMs = 1;
        /** 当前倍速 */
        this._speed = 1;
        this._speedIndex = 0;
        /** 暂停状态：用户手动暂停 / 切后台自动暂停标记 */
        this._paused = false;
        this._autoPaused = false;
        /** 回放是否结束（输入耗尽或引擎先行结束） */
        this._done = false;
        /** 已回放的输入游标 */
        this._inputIndex = 0;

        // 布局参数
        this._boardX = 0;
        this._boardY = 0;
        this._cellSize = 0;
        this._progressRect = null;
        this._backBtnRect = null;
        this._speedBtnRect = null;
        this._pauseBtnRect = null;
    }

    onEnter(params) {
        this._params = params || {};
        this._engine = null;
        this._boardRenderer = null;
        this._pieceRenderer = null;
        this._effectRenderer = null;

        // 优先使用云端回放数据（排行榜/挑战列表来源），否则按 key 读取本地回放（M1 本地闭环）
        let data = null;
        const cloudData = this._params.replayData || null;
        if (cloudData && cloudData.seed != null && Array.isArray(cloudData.inputs)) {
            data = cloudData;
        } else {
            const key = this._params.replayKey || '';
            data = key ? ReplayRecorder.load(key) : null;
        }
        if (!data || data.seed == null || !Array.isArray(data.inputs)) {
            try {
                wx.showToast({ title: '回放数据不可用', icon: 'none' });
            } catch (e) { /* 忽略 */ }
            if (this._params && this._params.fromRank) {
                GameGlobal.game.sceneManager.switchTo('rank', {});
            } else if (this._params && this._params.fromStageResult) {
                GameGlobal.game.sceneManager.switchTo('stageResult', {
                    stageId: this._params.stageId,
                    result: this._params.result,
                    replayKey: this._params.replayKey,
                });
            } else if (this._params && this._params.fromStageFail) {
                GameGlobal.game.sceneManager.switchTo('stageFail', {
                    stageId: this._params.stageId,
                    result: this._params.result,
                    replayKey: this._params.replayKey,
                });
            } else if (this._params && this._params.fromWorkshopResult) {
                GameGlobal.game.sceneManager.switchTo('workshopResult', {
                    workshopStageId: this._params.workshopStageId,
                    workshopTitle: this._params.workshopTitle,
                    authorTrial: this._params.authorTrial,
                    workshopReturnTo: this._params.workshopReturnTo,
                    workshopListParams: this._params.workshopListParams,
                    result: this._params.result,
                    replayKey: this._params.replayKey,
                });
            } else if (this._params && this._params.fromChallenge) {
                GameGlobal.game.sceneManager.leaveTo('challenge', {}, ['home']);
            } else if (this._params && this._params.challengeId) {
                GameGlobal.game.sceneManager.leaveTo('result', this._params, ['home', 'challenge']);
            } else {
                GameGlobal.game.sceneManager.switchTo('home');
            }
            return;
        }
        this._data = data;
        this._durationMs = Math.max(1, data.durationMs || 0);
        this._playTime = 0;
        this._speedIndex = 0;
        this._speed = SPEED_LEVELS[0];
        this._paused = false;
        this._autoPaused = false;
        this._inputIndex = 0;
        this._done = data.inputs.length === 0;
        this._calculateLayout();
        this._initRenderers();
        this._bgEffects = new BackgroundEffects();
        this._bgEffects.init();
        this._bgEffects.setEnabled(wx.getStorageSync('gc_setting_bgEffects') !== false);

        // 用回放种子重建引擎（BagRandomizer 可复现，保证方块序列一致）
        this._engine = new TetrisEngine(data.seed);
        this._engine.setMode(data.mode || 'stage');
        this._engine.init();
        const meta = data.meta || {};
        if ((data.mode || 'stage') === 'stage') {
            if (meta.workshopRows) {
                this._engine.initStage(meta.workshopRows, {
                    dropIntervalMs: meta.dropIntervalMs || 1000,
                });
            } else if (meta.stageId) {
                try {
                    const goldenBlock = require('../../utils/golden-block-manager');
                    const st = goldenBlock.getStage(meta.stageId);
                    if (st && st.rows) {
                        this._engine.initStage(st.rows, {
                            dropIntervalMs: st.dropIntervalMs || 1000,
                        });
                    }
                } catch (e) { /* ignore */ }
            }
        }
        this._engine.start();
        this._engine.onStateChange((state) => {
            if (state === 'over') {
                this._done = true;
            }
        });
        this._engine.onLineClear((lineIndices, count, isTetris, colors, tSpinType, combo) => {
            if (this._bgEffects) { this._bgEffects.trigger(isTetris ? 'tetris' : 'lineClear'); }
            if (!this._effectRenderer) return;
            if (isTetris || tSpinType) {
                this._effectRenderer.addClimax(isTetris ? 'tetris' : 'tspin', this._boardX, this._boardY, this._cellSize, { rows: lineIndices, colors, combo: combo || 0 });
            } else {
                this._effectRenderer.addLineClear(lineIndices, this._boardX, this._boardY, this._cellSize, { colors, isTetris, tSpinType });
            }
            const popY = this._boardY + (lineIndices[0] || 0) * this._cellSize;
            this._effectRenderer.addScorePopup(this._boardX + this._cellSize * 5, popY, this._comboText(count, isTetris, tSpinType, combo), (isTetris || tSpinType) ? '#FFD700' : '#ffffff');
        });
        this._engine.onPieceLock((info) => {
            if (!this._effectRenderer) return;
            const current = this._engine.getCurrentPiece();
            this._effectRenderer.addLandRipple(this._boardX, this._boardY, this._cellSize, current || info, !!info.hardDrop);
            if (info.hardDrop && typeof this._hardDropStartRow === 'number' && current && typeof current.row === 'number') {
                this._effectRenderer.addDropTrail(this._boardX, this._boardY, this._cellSize, current, this._hardDropStartRow - HIDDEN_ROWS, current.row - HIDDEN_ROWS);
            }
        });
    }

    onExit() {
        if (this._bgEffects) {
            this._bgEffects.destroy();
            this._bgEffects = null;
        }
        this._engine = null;
        this._boardRenderer = null;
        this._pieceRenderer = null;
        this._effectRenderer = null;
        this._hardDropStartRow = null;
        this._data = null;
    }

    onPause() {
        if (!this._paused) {
            this._paused = true;
            this._autoPaused = true;
        }
    }

    onResume() {
        if (this._autoPaused) {
            this._paused = false;
            this._autoPaused = false;
        }
    }

    update(dt) {
        if (this._paused || !this._engine) return;

        const engineOver = this._engine.getState() === 'over';
        if (engineOver) {
            this._done = true;
        }

        // 回放结束后仍继续 tick 特效，让末次消行粒子自然播完（不再按倍速）
        const replayFinished = this._done || engineOver;
        if (!replayFinished) {
            this._playTime += dt * this._speed;
            this._engine.update(dt * this._speed);
            this._feedInputs();
        }

        const effectDt = replayFinished ? dt : dt * this._speed;
        if (this._effectRenderer) { this._effectRenderer.update(effectDt); }
        if (this._bgEffects) { this._bgEffects.update(dt); }
        if (this._boardRenderer && typeof this._boardRenderer.update === 'function') {
            this._boardRenderer.update(dt);
        }
    }

    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 深色背景（与对局场景一致，避免露白）
        if (this._bgEffects && this._bgEffects.isEnabled()) {
            this._bgEffects.render(ctx);
        } else {
            ctx.fillStyle = '#0f0f23';
            ctx.fillRect(0, 0, W, H);
        }

        if (!this._engine) return;
        const shake = this._effectRenderer ? this._effectRenderer.getShakeOffset() : null;
        if (shake) {
            ctx.save();
            ctx.translate(shake.x, shake.y);
        }

        // 棋盘
        if (this._boardRenderer) {
            this._boardRenderer.render(ctx, this._engine.getVisibleBoard());
        }

        // Ghost Piece（投影，绘制在当前方块下层）
        const current = this._engine.getCurrentPiece();
        const ghostRow = this._engine.getGhostRow();
        if (current && ghostRow >= 0 && this._pieceRenderer) {
            this._pieceRenderer.renderGhost(
                ctx, current.type, current.matrix, ghostRow - HIDDEN_ROWS, current.col,
                this._boardX, this._boardY, this._cellSize
            );
        }

        // 当前方块
        if (current && this._pieceRenderer) {
            this._pieceRenderer.renderPiece(
                ctx, current.type, current.matrix, current.row - HIDDEN_ROWS, current.col,
                this._boardX, this._boardY, this._cellSize
            );
        }

        // 特效（粒子/碎片/波纹/残影/飘字）
        if (this._effectRenderer) {
            this._effectRenderer.render(ctx);
        }

        if (shake) {
            ctx.restore();
        }

        // 顶部标题与分数/等级
        this._renderTopInfo(ctx);

        // 底部进度条
        this._renderProgress(ctx);

        // 控制按钮：← 返回 / 倍速 / 暂停
        this._renderControlButtons(ctx);

        // 回放结束遮罩：等末次消行特效播完再出现，避免粒子中途定格
        const effectsDone = !this._effectRenderer || !this._effectRenderer.hasActiveEffects();
        if (this._done && effectsDone) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(this._boardX, this._boardY, this._cellSize * 10, this._cellSize * 20);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('回放结束', this._boardX + this._cellSize * 5, this._boardY + this._cellSize * 10);
        }
    }

    handleTap(x, y) {
        if (this._hitRect(x, y, this._backBtnRect)) {
            this._goBack();
            return;
        }
        if (this._hitRect(x, y, this._speedBtnRect)) {
            this._cycleSpeed();
            return;
        }
        if (this._hitRect(x, y, this._pauseBtnRect)) {
            this._togglePause();
        }
    }

    _getTopInset() {
        const sys = (GameGlobal && GameGlobal.game && GameGlobal.game.systemInfo) || {};
        const statusBarHeight = Number(sys.statusBarHeight) || 0;
        const safeTop = (sys.safeArea && Number(sys.safeArea.top)) || 0;
        let capsuleBottom = 0;
        try {
            const rect = wx.getMenuButtonBoundingClientRect();
            if (rect && rect.bottom) capsuleBottom = rect.bottom;
        } catch (e) { /* ignore */ }
        return Math.max(statusBarHeight, safeTop, capsuleBottom) + 8;
    }

    // ==================== 布局计算 ====================

    _calculateLayout() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 底部安全区适配（iPhone Home 指示条）
        const sys = GameGlobal.game.systemInfo || {};
        const safeArea = sys.safeArea || {};
        const bottomSafe = (safeArea.bottom && H > safeArea.bottom) ? (H - safeArea.bottom) : 0;
        // 顶部：刘海/胶囊下方 + 标题 + 信息行
        this._topInset = this._getTopInset();
        const topArea = this._topInset + 52;
        // 底部：进度条 + 控制按钮
        const progressTop = H - bottomSafe - 80;
        const controlCenterY = H - bottomSafe - 38;
        const boardBottomLimit = progressTop - 14;
        const availH = Math.max(0, boardBottomLimit - topArea);
        const availW = W - 20;

        // cellSize 由屏幕宽高约束取小值（棋盘 10:20）
        const cellByHeight = Math.floor(availH / 20);
        const cellByWidth = Math.floor(availW / 10);
        this._cellSize = Math.max(8, Math.min(cellByHeight, cellByWidth));

        const boardW = this._cellSize * 10;
        const boardH = this._cellSize * 20;

        // 棋盘居中
        this._boardX = Math.floor((W - boardW) / 2);
        this._boardY = topArea + Math.floor((availH - boardH) / 2);

        // 底部进度条
        this._progressRect = { x: 20, y: progressTop, w: W - 40, h: 8 };

        // 控制按钮：← 返回 / 倍速 / 暂停（返回略宽，避免箭头+文字挤出）
        const backW = 88;
        const btnSize = 56;
        const btnGap = 20;
        const totalW = backW + btnSize * 2 + btnGap * 2;
        const startX = Math.floor((W - totalW) / 2);
        const btnY = controlCenterY - btnSize / 2;
        this._backBtnRect = { x: startX, y: btnY, w: backW, h: btnSize };
        this._speedBtnRect = { x: startX + backW + btnGap, y: btnY, w: btnSize, h: btnSize };
        this._pauseBtnRect = { x: startX + backW + btnGap + btnSize + btnGap, y: btnY, w: btnSize, h: btnSize };
    }

    // ==================== 渲染器初始化 ====================

    _initRenderers() {
        this._boardRenderer = new BoardRenderer(
            this._boardX, this._boardY,
            this._cellSize, 10, 20);
        this._pieceRenderer = new PieceRenderer();
        this._effectRenderer = new EffectRenderer();
    }

    // ==================== 输入回放 ====================

    _engineTimeMs() {
        return this._playTime * 1000;
    }

    _feedInputs() {
        if (!this._data) return;
        const inputs = this._data.inputs;
        const limitMs = this._engineTimeMs();
        while (this._inputIndex < inputs.length && inputs[this._inputIndex].t <= limitMs) {
            const action = inputs[this._inputIndex].a;
            this._inputIndex++;
            if (this._engine.getState() === 'over') break;
            const methodName = ACTION_MAP[action];
            if (action === 'hardDrop') {
                const cur = this._engine.getCurrentPiece();
                this._hardDropStartRow = cur ? cur.row : null;
            }
            if (methodName && typeof this._engine[methodName] === 'function') {
                this._engine[methodName]();
            }
        }

        // 输入耗尽：回放结束
        if (this._inputIndex >= inputs.length) {
            this._done = true;
        }
    }

    // ==================== 渲染细节 ====================

    _comboText(count, isTetris, tSpinType, combo) {
        let label = '';
        if (isTetris) label = 'QUAD!';
        else if (tSpinType === 'full') label = 'T-SPIN!';
        else if (tSpinType === 'mini') label = 'T-SPIN MINI';
        else label = 'CLEAR ×' + count;
        if (combo && combo > 1) label += '  COMBO×' + combo;
        return label;
    }

    _renderTopInfo(ctx) {
        const W = GameGlobal.game.width;
        const top = this._topInset || this._getTopInset();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('战局回放', W / 2, top);

        let info = `消行: ${this._engine.getLines()}`;
        const meta = (this._data && this._data.meta) || {};
        const playContext = meta.playContext || ((this._data && this._data.mode) || 'stage');
        if (playContext === 'stage' || playContext === 'challenge' || playContext === 'plaza' || playContext === 'workshop') {
            const pieces = meta.pieces != null ? meta.pieces : '-';
            const timeMs = meta.timeMs || 0;
            const sec = Math.floor(timeMs / 1000);
            const m = Math.floor(sec / 60);
            const ss = sec % 60;
            const timeStr = m + ':' + (ss < 10 ? '0' : '') + ss;
            info = `消行: ${this._engine.getLines()}   用块: ${pieces}   用时: ${timeStr}`;
            if (meta.stageId) info += `   第 ${meta.stageId} 关`;
            else if (meta.workshopTitle) info += `   ${meta.workshopTitle}`;
            else info += `   ${MODE_LABELS[playContext] || playContext}`;
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = '13px sans-serif';
        ctx.fillText(info, W / 2, top + 24);
    }

    _renderProgress(ctx) {
        const W = GameGlobal.game.width;
        const r = this._progressRect;
        const total = this._durationMs || 1;
        const progress = Math.min(1, this._engineTimeMs() / total);

        // 时间文本（engineTime / durationMs）
        const curSec = (this._engineTimeMs() / 1000).toFixed(1);
        const durSec = (total / 1000).toFixed(1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${curSec} / ${durSec}s`, W / 2, r.y - 5);

        // 进度条背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        this._roundRect(ctx, r.x, r.y, r.w, r.h, r.h / 2);
        ctx.fill();

        // 进度条填充
        if (progress > 0) {
            ctx.fillStyle = '#00c6ff';
            const fillW = Math.max(r.h, Math.floor(r.w * progress));
            this._roundRect(ctx, r.x, r.y, fillW, r.h, r.h / 2);
            ctx.fill();
        }
    }

    _renderControlButtons(ctx) {
        this._drawControlButton(ctx, this._backBtnRect, '← 返回', '#3a3a55');
        this._drawControlButton(ctx, this._speedBtnRect, this._speed + 'x', '#14506e');
        this._drawControlButton(
            ctx,
            this._pauseBtnRect,
            this._paused ? '继续' : '暂停',
            this._paused ? '#2ecc71' : '#f0a000'
        );
    }

    _drawControlButton(ctx, rect, label, bgColor) {
        if (!rect) return;
        ctx.fillStyle = bgColor;
        this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    }

    // ==================== 控制逻辑 ====================

    _goBack() {
        this._paused = false;
        // 弹栈返回上一场景（排行榜或结算页），避免 switchTo 每次压栈造成场景栈膨胀与返回循环
        GameGlobal.game.sceneManager.back();
    }

    _cycleSpeed() {
        if (this._done) return;
        this._speedIndex = (this._speedIndex + 1) % SPEED_LEVELS.length;
        this._speed = SPEED_LEVELS[this._speedIndex];
    }

    _togglePause() {
        if (this._done) return;
        this._paused = !this._paused;
    }

    // ==================== 工具方法 ====================

    _hitRect(x, y, rect) {
        if (!rect) return false;
        return x >= rect.x && x <= rect.x + rect.w &&
               y >= rect.y && y <= rect.y + rect.h;
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
}

module.exports = ReplayScene;