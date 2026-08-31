/*** 挖个方块 - 核心俄罗斯方块引擎（残局闯关）
 * 职责：
 *   - 游戏状态管理（初始化/开始/暂停/恢复/重置）
 *   - 7-Bag 随机方块生成
 *   - 碰撞检测
 *   - 消行判定与执行
 *   - 等级与速度系统
 *   - Hold 逻辑
 *   - Ghost Piece 计算
 *   - T-Spin 检测
 *   - Combo 与 Back-to-Back 计分
 * 注意：本模块不依赖任何微信小游戏 API，保持纯逻辑可测试性。
 * 注意：微信小游戏 require 为相对当前文件目录解析，此处使用 ./ 与 ../ 相对路径。
 */

const { PIECE_TYPES, PIECE_COLORS } = require('../data/pieces');
const SRSRotation = require('./srs-rotation');

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const BOARD_COLS = 10;
const BOARD_ROWS = 20;
const HIDDEN_ROWS = 2;
const TOTAL_ROWS = BOARD_ROWS + HIDDEN_ROWS;
const EMPTY = 0;
const GARBAGE = 99;

const GameState = {
    IDLE: 'idle',
    READY: 'ready',
    PLAYING: 'playing',
    PAUSED: 'paused',
    SETTLING: 'settling',
    OVER: 'over',
};

/** 闯关塌陷动画时序（毫秒） */
const STAGE_SETTLE_FLASH_MS = 150;
const STAGE_SETTLE_FALL_MS_MIN = 150;
const STAGE_SETTLE_FALL_MS_PER_ROW = 28;
const STAGE_SETTLE_FALL_MS_MAX = 300;
const STAGE_SETTLE_CHAIN_GAP_MS = 80;
/** 塌陷结算超时保护（毫秒），防止动画状态卡死导致无方块可操作 */
const STAGE_SETTLE_TIMEOUT_MS = 4000;

/** 等级对应的下落间隔（毫秒），索引 = 等级 - 1 */
const LEVEL_SPEEDS = [
    1000, 793, 618, 473, 355, 262, 190, 135, 94, 64,
    43, 28, 18, 11, 7,
];

/** 消行基础分：Single / Double / Triple / Tetris */
const LINE_SCORES = [100, 300, 500, 800];
const SOFT_DROP_SCORE = 1;
const HARD_DROP_SCORE = 2;
const LINES_PER_LEVEL = 10;
const MAX_LEVEL = 15;
const LOCK_DELAY_MS = 500;
const MAX_LOCK_MOVES = 15;

/** 方块类型 → 棋盘存储值（1-7 标准，8-11 特殊，12-18 实验室新方块） */
const TYPE_TO_VALUE = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7, C: 8, D: 9, P: 10, M: 11, R: 12, Q: 13, X: 14, K: 15, W: 16, A: 17, N: 18 };

/** 不可旋转方块类型 */
const NON_ROTATABLE_TYPES = { D: true, P: true, M: true, Q: true, N: true };

/** 特殊方块计分倍率（触发消行的方块为特殊/新方块时按倍率加成；T/R 为标准锚点无加成） */
const SPECIAL_SCORE_MULTIPLIERS = {
    C: 1.5,
    D: 2.0,
    P: 1.2,
    M: 1.2,
    Q: 1.2,
    X: 1.5,
    K: 1.5,
    W: 1.5,
    A: 1.2,
    N: 1.5,
    R: 1.0,
};

/** 可复现伪随机数生成器（mulberry32）：同一 seed 产生同一序列 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

class BagRandomizer {
    constructor(seed) {
        this._bags = [];
        this._bagIdx = 0;
        this._pieceIdx = 0;
        this._seed = typeof seed === 'number' ? seed : null;
        this._rng = this._seed !== null ? mulberry32(this._seed) : Math.random;
    }

    /** 启用/关闭特殊模式（已废弃，挖个方块不使用） */
    setSpecialMode() {}

    /** 取出下一个方块类型 */
    next() {
        this._ensure(1);
        const bag = this._bags[this._bagIdx];
        const type = bag[this._pieceIdx++];
        if (this._pieceIdx >= bag.length) {
            this._bagIdx++;
            this._pieceIdx = 0;
        }
        return type;
    }

    /** 预览接下来 count 个方块（不消耗） */
    peek(count) {
        this._ensure(count);
        const result = [];
        let bi = this._bagIdx;
        let pi = this._pieceIdx;
        for (let i = 0; i < count; i++) {
            const bag = this._bags[bi];
            result.push(bag[pi++]);
            if (pi >= bag.length) { bi++; pi = 0; }
        }
        return result;
    }

    /** 确保剩余方块数 >= count，不足时预生成新 bag */
    _ensure(count) {
        while (this._remaining() < count) {
            this._bags.push(this._shuffle());
        }
    }

    /** 剩余方块数（当前袋未消耗部分 + 后续袋全部） */
    _remaining() {
        let total = 0;
        for (let i = this._bagIdx; i < this._bags.length; i++) {
            const bag = this._bags[i];
            total += i === this._bagIdx ? bag.length - this._pieceIdx : bag.length;
        }
        return total;
    }

    /** Fisher-Yates 洗牌；标准 7-Bag */
    _shuffle() {
        const bag = [...PIECE_TYPES];
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(this._rng() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        return bag;
    }

    reset() {
        this._bags = [];
        this._bagIdx = 0;
        this._pieceIdx = 0;
        if (this._seed !== null) {
            this._rng = mulberry32(this._seed);
        }
    }
}


// ---------------------------------------------------------------------------
// TetrisEngine 主类
// ---------------------------------------------------------------------------

class TetrisEngine {
    constructor(seed) {
        this._board = this._createEmptyBoard();
        this._currentPiece = null;
        this._holdPiece = null;
        this._canHold = true;
        this._seed = typeof seed === 'number' ? seed : null;
        this._bag = new BagRandomizer(seed);
        this._state = GameState.IDLE;

        this._score = 0;
        this._level = 1;
        this._lines = 0;
        this._combo = -1;
        this._lastClearWasDifficult = false;
        this._lastLockType = null;
        this._dropTimer = null;
        this._dropInterval = LEVEL_SPEEDS[0];
        this._lockTimer = null;
        this._engineTime = 0;
        this._dropDeadline = 0;
        this._lockDeadline = 0;
        this._inLockDelay = false;
        this._lockMoves = 0;

        this._lastAction = 'spawn';
        this._tSpinType = null;
        this._mode = 'stage';
        this._stats = this._createStats();
        this._garbageMask = null;
        this._garbageRemaining = 0;
        this._stageConfig = null;
        this._stageFirstPiecePending = null;
        this._stageSettle = null;
        this._stageSettleAnim = null;

        // 回调
        this._onStateChange = null;
        this._onBoardChange = null;
        this._onPieceSpawn = null;
        this._onLineClear = null;
        this._onPieceLock = null;
        this._onScoreChange = null;
        this._onLevelChange = null;
        this._onGameOver = null;
        this._onHoldChange = null;
        this._onCombo = null;
    }

    // ========================================================================
    // 生命周期
    // ========================================================================

    init() {
        this._clearTimers();
        this._board = this._createEmptyBoard();
        this._currentPiece = null;
        this._holdPiece = null;
        this._canHold = true;
        this._bag.reset();
        this._score = 0;
        this._level = 1;
        this._lines = 0;
        this._combo = -1;
        this._lastClearWasDifficult = false;
        this._lastLockType = null;
        this._dropInterval = LEVEL_SPEEDS[0];
        this._tSpinType = null;
        this._stats = this._createStats();
        this._garbageMask = this._createEmptyMask();
        this._garbageRemaining = 0;
        this._stageConfig = null;
        this._stageFirstPiecePending = null;
        this._stageSettle = null;
        this._stageSettleAnim = null;
        this._state = GameState.READY;
        this._emit(this._onStateChange, this._state);
    }

    /** 开始游戏（从 READY 进入 PLAYING） */
    start() {
        this._state = GameState.PLAYING;
        // 首次开始：生成第一个方块（init 只创建空棋盘，不生成方块）
        if (!this._currentPiece) {
            this._spawnPiece();
        }
        if (this._state === GameState.PLAYING) {
            this._startDropTimer();
        }
        this._emit(this._onStateChange, this._state);
    }

    pause() {
        if (this._state !== GameState.PLAYING) return;
        this._clearTimers();
        this._state = GameState.PAUSED;
        this._emit(this._onStateChange, this._state);
    }

    resume() {
        if (this._state !== GameState.PAUSED) return;
        this._state = GameState.PLAYING;
        // 容错：暂停期间若丢失当前方块（例如异常中断锁定），恢复时补发
        if (!this._currentPiece) {
            this._spawnPiece();
        }
        if (this._state === GameState.PLAYING) {
            this._startDropTimer();
            if (this._inLockDelay && this._currentPiece) {
                this._startLockTimer();
            }
        }
        this._emit(this._onStateChange, this._state);
    }

    reset() {
        this._clearTimers();
        this.init();
    }

    destroy() {
        this._clearTimers();
        this._onStateChange = null;
        this._onBoardChange = null;
        this._onPieceSpawn = null;
        this._onLineClear = null;
        this._onPieceLock = null;
        this._onScoreChange = null;
        this._onLevelChange = null;
        this._onGameOver = null;
        this._onHoldChange = null;
        this._onCombo = null;
        this._state = GameState.IDLE;
    }

    // ========================================================================
    // 操作
    // ========================================================================

    moveLeft() {
        if (this._state !== GameState.PLAYING || !this._currentPiece) return false;
        const p = this._currentPiece;
        if (this._isValidPosition(p.type, p.rotation, p.row, p.col - 1)) {
            p.col--;
            this._lastAction = 'move';
            this._onLockDelayMove();
            this._emit(this._onBoardChange, this.getVisibleBoard(), this.getCurrentPiece());
            return true;
        }
        return false;
    }

    moveRight() {
        if (this._state !== GameState.PLAYING || !this._currentPiece) return false;
        const p = this._currentPiece;
        if (this._isValidPosition(p.type, p.rotation, p.row, p.col + 1)) {
            p.col++;
            this._lastAction = 'move';
            this._onLockDelayMove();
            this._emit(this._onBoardChange, this.getVisibleBoard(), this.getCurrentPiece());
            return true;
        }
        return false;
    }

    softDrop() {
        if (this._state !== GameState.PLAYING || !this._currentPiece) return false;
        const p = this._currentPiece;
        if (this._isValidPosition(p.type, p.rotation, p.row + 1, p.col)) {
            p.row++;
            this._lastAction = 'drop';
            this._addScore(SOFT_DROP_SCORE);
            if (this._inLockDelay) {
                this._cancelLockDelay();
            }
            this._restartDropTimer();
            this._emit(this._onBoardChange, this.getVisibleBoard(), this.getCurrentPiece());
            return true;
        }
        return false;
    }

    hardDrop() {
        if (this._state !== GameState.PLAYING || !this._currentPiece) return 0;

        // 钻头块 D：硬降时穿透整列清空，直达棋盘底部
        if (this._currentPiece.type === 'D') {
            return this._drillDrop();
        }

        const ghostRow = this.getGhostRow();
        const dropDist = ghostRow - this._currentPiece.row;
        this._currentPiece.row = ghostRow;
        this._addScore(HARD_DROP_SCORE * dropDist);
        this._lastAction = 'hardDrop';
        this._stats.hardDropCount++;
        this._cancelLockDelay();
        this._lockPiece();
        return dropDist;
    }

    /**
     * 钻头块穿透硬降：从当前行向下清空整列已锁定方块，直达棋盘底部
     * @returns {number} 下落距离
     */
    _drillDrop() {
        const p = this._currentPiece;
        const col = p.col;
        // 从当前行向下清空整列（穿透）
        for (let row = p.row; row < TOTAL_ROWS; row++) {
            this._board[row][col] = EMPTY;
        }
        // 钻头直达底部
        const dropDist = (TOTAL_ROWS - 1) - p.row;
        this._currentPiece.row = TOTAL_ROWS - 1;
        this._addScore(HARD_DROP_SCORE * dropDist);
        this._lastAction = 'hardDrop';
        this._stats.hardDropCount++;
        this._cancelLockDelay();
        this._lockPiece();
        return dropDist;
    }

    rotateCW() {
        return this._rotate(1);
    }

    rotateCCW() {
        return this._rotate(-1);
    }

    hold() {
        if (this._state !== GameState.PLAYING || !this._canHold || !this._currentPiece) return false;
        this._cancelLockDelay();
        const currentType = this._currentPiece.type;
        if (this._holdPiece) {
            const holdType = this._holdPiece.type;
            this._holdPiece = { type: currentType, rotation: 0 };
            this._initPiece(holdType, 0);
        } else {
            this._holdPiece = { type: currentType, rotation: 0 };
            this._spawnPiece();
        }
        this._canHold = false;
        // 锁定延迟期间 dropDeadline 已被清零；换块后必须重启下落，否则新块会悬停不动
        if (this._state === GameState.PLAYING && this._currentPiece) {
            this._restartDropTimer();
        }
        this._emit(this._onHoldChange, this.getHoldPiece());
        return true;
    }

    // ========================================================================
    // 查询
    // ========================================================================

    getBoard() {
        return this._cloneBoard(this._board);
    }

    getVisibleBoard() {
        return this._board.slice(HIDDEN_ROWS);
    }

    /** 渲染用棋盘：塌陷动画期间隐藏正在下落的格，避免重影 */
    getVisibleBoardForRender() {
        const board = this.getVisibleBoard();
        const anim = this._stageSettleAnim;
        if (!anim || anim.phase !== 'fall' || !anim.moves || anim.moves.length === 0) {
            return board;
        }
        const copy = board.map(row => row.slice());
        for (const m of anim.moves) {
            const vr = m.fromRow - HIDDEN_ROWS;
            if (vr >= 0 && vr < BOARD_ROWS && copy[vr]) {
                copy[vr][m.col] = EMPTY;
            }
        }
        return copy;
    }

    /** 闯关塌陷动画：返回可见坐标下的浮动格（row 可为小数） */
    getStageFallOverlay() {
        const anim = this._stageSettleAnim;
        if (!anim || anim.phase !== 'fall' || !anim.moves || anim.moves.length === 0) {
            return null;
        }
        const t = anim.duration > 0
            ? Math.min(1, anim.elapsed / anim.duration)
            : 1;
        const eased = 1 - (1 - t) * (1 - t);
        return anim.moves.map(m => ({
            col: m.col,
            row: (m.fromRow - HIDDEN_ROWS) + (m.toRow - m.fromRow) * eased,
            value: m.value,
        }));
    }

    isStageSettling() {
        return this._state === GameState.SETTLING;
    }

    getCurrentPiece() {
        if (!this._currentPiece) return null;
        const p = this._currentPiece;
        return {
            type: p.type,
            rotation: p.rotation,
            row: p.row,
            col: p.col,
            matrix: SRSRotation.getState(p.type, p.rotation),
        };
    }

    getHoldPiece() {
        if (!this._holdPiece) return null;
        return {
            type: this._holdPiece.type,
            rotation: this._holdPiece.rotation,
            matrix: SRSRotation.getState(this._holdPiece.type, this._holdPiece.rotation),
        };
    }

    getNextPieces(count = 3) {
        const types = this._bag.peek(count);
        return types.map(type => ({
            type,
            rotation: 0,
            matrix: SRSRotation.getState(type, 0),
        }));
    }

    getGhostRow() {
        if (!this._currentPiece) return -1;
        const p = this._currentPiece;
        let row = p.row;
        while (this._isValidPosition(p.type, p.rotation, row + 1, p.col)) {
            row++;
        }
        return row;
    }

    getState() { return this._state; }
    getScore() { return this._score; }
    getLevel() { return this._level; }
    getLines() { return this._lines; }
    getCombo() { return Math.max(0, this._combo); }
    getSeed() { return this._seed; }
    getEngineTime() { return this._engineTime; }


    /** 逐帧驱动入口（虚拟时钟驱动）：引擎时间由外部每帧调用 update(dt) 累加，自动下落与锁定延迟通过截止点检查触发 */
    update(dt) {
        if (this._state === GameState.SETTLING) {
            this._engineTime += dt * 1000;
            this._updateStageSettle(dt);
            return;
        }
        if (this._state !== GameState.PLAYING) return;
        this._engineTime += dt * 1000;
        // 容错：对局中无当前方块且不在结算，补发一块（避免 Hold/锁死边界导致永久停表）
        if (!this._currentPiece) {
            this._spawnPiece();
            if (this._state === GameState.PLAYING && this._currentPiece) {
                this._restartDropTimer();
            }
            return;
        }
        if (this._dropDeadline > 0 && this._engineTime >= this._dropDeadline) {
            this._dropDeadline = 0;
            this._autoDrop();
        }
        if (this._lockDeadline > 0 && this._engineTime >= this._lockDeadline) {
            this._lockDeadline = 0;
            if (this._state === GameState.PLAYING && this._currentPiece && this._inLockDelay) {
                this._lockPiece();
            }
        }
        // 锁定延迟中但截止点丢失：补启锁定计时，避免方块贴地永不锁定
        if (this._inLockDelay && this._lockDeadline <= 0 && this._currentPiece) {
            this._startLockTimer();
        }
        // 有方块、非锁定、也无下落截止：补启下落（Hold 旧路径等）
        if (!this._inLockDelay && this._dropDeadline <= 0 && this._currentPiece) {
            this._restartDropTimer();
        }
    }
    // ========================================================================
    // 回调注册
    // ========================================================================

    onStateChange(cb) { this._onStateChange = cb; }
    onBoardChange(cb) { this._onBoardChange = cb; }
    onPieceSpawn(cb) { this._onPieceSpawn = cb; }
    onLineClear(cb) { this._onLineClear = cb; }
    onPieceLock(cb) { this._onPieceLock = cb; }
    onScoreChange(cb) { this._onScoreChange = cb; }
    onHoldChange(cb) { this._onHoldChange = cb; }
    onLevelChange(cb) { this._onLevelChange = cb; }
    onGameOver(cb) { this._onGameOver = cb; }
    onCombo(cb) { this._onCombo = cb; }

    // ========================================================================
    // 私有 — 碰撞检测
    // ========================================================================

    _isValidPosition(type, rotation, row, col) {
        const matrix = SRSRotation.getState(type, rotation);
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c] !== 1) continue;
                const br = row + r;
                const bc = col + c;
                if (bc < 0 || bc >= BOARD_COLS) return false;
                if (br < 0 || br >= TOTAL_ROWS) return false;
                if (this._board[br][bc] !== EMPTY) return false;
            }
        }
        return true;
    }

    // ========================================================================
    // 私有 — 旋转
    // ========================================================================

    _rotate(direction) {
        if (this._state !== GameState.PLAYING || !this._currentPiece) return false;
        const p = this._currentPiece;
        // 特殊方块 D/P/M/Q/X 不可旋转
        if (NON_ROTATABLE_TYPES[p.type]) return false;
        const result = SRSRotation.tryRotate(
            p.type, p.rotation, direction, p.col, p.row,
            (col, row) => {
                if (col < 0 || col >= BOARD_COLS) return false;
                if (row < 0 || row >= TOTAL_ROWS) return false;
                return this._board[row][col] === EMPTY;
            }
        );
        if (result) {
            p.rotation = result.newState;
            p.col = result.newX;
            p.row = result.newY;
            this._lastAction = 'rotate';
            this._onLockDelayMove();
            this._emit(this._onBoardChange, this.getVisibleBoard(), this.getCurrentPiece());
            return true;
        }
        return false;
    }

    // ========================================================================
    // 私有 — 方块生成与锁定
    // ========================================================================

    _spawnPiece() {
        let type = this._bag.next();
        if (this._stageFirstPiecePending) {
            type = this._stageFirstPiecePending;
            this._stageFirstPiecePending = null;
        }
        this._initPiece(type, 0);
        this._canHold = true;
    }

    _initPiece(type, rotation) {
        const matrix = SRSRotation.getState(type, rotation);
        const col = Math.floor((BOARD_COLS - matrix[0].length) / 2);
        const row = HIDDEN_ROWS;
        if (!this._isValidPosition(type, rotation, row, col)) {
            this._gameOver();
            return;
        }
        this._currentPiece = { type, rotation, row, col };
        this._lastAction = 'spawn';
        this._tSpinType = null;
        this._inLockDelay = false;
        this._lockMoves = 0;
        this._emit(this._onPieceSpawn, this.getCurrentPiece());
        this._emit(this._onBoardChange, this.getVisibleBoard(), this.getCurrentPiece());
    }

    _lockPiece() {
        const p = this._currentPiece;
        if (!p) return;

        // 写盘前检测 T-Spin（依赖当前棋盘与最后一次操作，修复死代码问题）
        this._detectTSpin();

        // 记录锁定方块类型（特殊方块计分倍率依赖）
        this._lastLockType = p.type;

        // 将方块写入棋盘
        const matrix = SRSRotation.getState(p.type, p.rotation);
        const value = TYPE_TO_VALUE[p.type];
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c] !== 1) continue;
                const br = p.row + r;
                const bc = p.col + c;
                if (br >= 0 && br < TOTAL_ROWS && bc >= 0 && bc < BOARD_COLS) {
                    this._board[br][bc] = value;
                }
            }
        }
        const lockedSnap = {
            type: p.type,
            row: p.row,
            col: p.col,
            matrix: SRSRotation.getState(p.type, p.rotation),
            hardDrop: this._lastAction === 'hardDrop',
        };

        this._currentPiece = null;
        this._inLockDelay = false;
        this._lockMoves = 0;

        // 闯关：有满行则进入 SETTLING，分波播放消行 + 塌陷动画
        if (this._mode === 'stage' && this._findFullRows().length > 0) {
            this._clearTimers();
            this._stageInitSettle(lockedSnap);
            this._emit(this._onPieceLock, lockedSnap);
            this._state = GameState.SETTLING;
            this._emit(this._onStateChange, this._state);
            this._stageStartNextWave();
            return;
        }

        const clearResult = this._mode === 'stage'
            ? { cleared: 0, lines: [], visibleRows: [], clearedColors: [], isTetris: false, isDifficult: false }
            : this._checkLines();

        // 先发消行 / 落地反馈，再处理闯关过关，避免终局跳过特效
        if (clearResult.cleared > 0) {
            this._combo++;
            this._calculateScore(clearResult);
            this._emit(
                this._onLineClear,
                clearResult.visibleRows,
                clearResult.cleared,
                clearResult.isTetris,
                clearResult.clearedColors,
                this._tSpinType,
                this._combo
            );
            if (this._combo > 0) {
                this._emit(this._onCombo, this._combo);
            }
        } else {
            this._combo = -1;
        }
        this._emit(this._onPieceLock, lockedSnap);

        if (this._mode === 'stage' && this._garbageRemaining === 0) {
            // 闯关过关：特效已发出，再停表切 OVER
            this._clearTimers();
            this._state = GameState.OVER;
            this._currentPiece = null;
            this._inLockDelay = false;
            this._lockMoves = 0;
            this._emit(this._onStateChange, this._state);
            this._emit(this._onGameOver, this._score, this._level, this._lines, 'stageClear');
            return;
        }

        if (this._state === GameState.PLAYING) {
            this._spawnPiece();
            if (this._state === GameState.PLAYING) {
                this._restartDropTimer();
            }
        }
    }

    // ========================================================================
    // 私有 — T-Spin 检测
    // ========================================================================

    _detectTSpin() {
        this._tSpinType = null;
        const p = this._currentPiece;
        if (!p || p.type !== 'T' || this._lastAction !== 'rotate') return;

        // T 方块中心在矩阵 [1][1]，检查四个对角
        const corners = [
            [p.row + 0, p.col + 0],
            [p.row + 0, p.col + 2],
            [p.row + 2, p.col + 0],
            [p.row + 2, p.col + 2],
        ];
        let filled = 0;
        for (const [r, c] of corners) {
            if (r < 0 || r >= TOTAL_ROWS || c < 0 || c >= BOARD_COLS) {
                filled++;
            } else if (this._board[r][c] !== EMPTY) {
                filled++;
            }
        }

        if (filled >= 3) {
            // 判断前方两角是否都被占据
            const frontPairs = {
                0: [[2, 0], [2, 2]],
                1: [[0, 2], [2, 2]],
                2: [[0, 0], [0, 2]],
                3: [[0, 0], [2, 0]],
            };
            const [f1, f2] = frontPairs[p.rotation] || frontPairs[0];
            const isFilled = (r, c) => {
                if (r < 0 || r >= TOTAL_ROWS || c < 0 || c >= BOARD_COLS) return true;
                return this._board[r][c] !== EMPTY;
            };
            if (filled === 4 || (isFilled(p.row + f1[0], p.col + f1[1])
                && isFilled(p.row + f2[0], p.col + f2[1]))) {
                this._tSpinType = 'full';
            } else {
                this._tSpinType = 'mini';
            }
        }
    }

    // ========================================================================
    // 私有 — 消行与计分
    // ========================================================================

    _checkLines() {
        if (this._mode === 'stage') {
            return this._checkLinesStageCascade();
        }

        const fullRows = [];
        for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
            if (this._board[r].every(cell => cell !== EMPTY)) {
                fullRows.push(r);
            }
        }
        if (fullRows.length === 0) {
            return { cleared: 0, lines: [], visibleRows: [], clearedColors: [], isTetris: false, isDifficult: false };
        }

        const clearedColors = fullRows.map(r => this._board[r].slice());
        const isTetris = fullRows.length === 4;
        const visibleRows = fullRows.map(r => r - HIDDEN_ROWS);

        // 经典重力消行（非 stage）：从下往上移除满行，顶部补空行
        for (let i = fullRows.length - 1; i >= 0; i--) {
            this._board.splice(fullRows[i], 1);
        }
        for (let i = 0; i < fullRows.length; i++) {
            this._board.unshift(new Array(BOARD_COLS).fill(EMPTY));
        }

        const isDifficult = isTetris || this._tSpinType !== null;
        return { cleared: fullRows.length, lines: fullRows, visibleRows, clearedColors, isTetris, isDifficult };
    }

    /**
     * 闯关消行：清空满行后，非垃圾块按列塌陷（垃圾为屏障不移动）；
     * 塌陷可能再次凑满，需连锁直至稳定，避免「满行却不消 / 死锁」。
     */
    _checkLinesStageCascade() {
        let totalCleared = 0;
        const visibleRows = [];
        const clearedColors = [];
        let anyTetris = false;
        let lastWaveRows = [];

        for (let guard = 0; guard < BOARD_ROWS; guard++) {
            const fullRows = this._findFullRows();
            if (fullRows.length === 0) break;

            for (let i = 0; i < fullRows.length; i++) {
                clearedColors.push(this._board[fullRows[i]].slice());
                visibleRows.push(fullRows[i] - HIDDEN_ROWS);
            }
            if (fullRows.length === 4) anyTetris = true;
            totalCleared += fullRows.length;
            lastWaveRows = fullRows;
            this._clearFullRowsOnly(fullRows);
            this._applyStageCollapse(this._planStageCollapse());
        }

        if (totalCleared === 0) {
            return { cleared: 0, lines: [], visibleRows: [], clearedColors: [], isTetris: false, isDifficult: false };
        }

        const isDifficult = anyTetris || this._tSpinType !== null;
        return {
            cleared: totalCleared,
            lines: lastWaveRows,
            visibleRows,
            clearedColors,
            isTetris: anyTetris,
            isDifficult,
        };
    }

    _findFullRows() {
        const fullRows = [];
        for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
            if (this._board[r].every(cell => cell !== EMPTY)) {
                fullRows.push(r);
            }
        }
        return fullRows;
    }

    /**
     * 闯关消行（方案 B）：
     * 1) 清空满行（含垃圾）
     * 2) 非垃圾块按列重力塌陷；垃圾格保持原位，作为不可穿越屏障
     */
    _clearFullRowsOnly(fullRows) {
        for (const r of fullRows) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (this._garbageMask && this._garbageMask[r][c]) {
                    this._garbageMask[r][c] = false;
                    this._garbageRemaining = Math.max(0, this._garbageRemaining - 1);
                }
                this._board[r][c] = EMPTY;
            }
        }
    }

    /** 计算当前棋盘非垃圾块的列向塌陷（不修改棋盘） */
    _planStageCollapse() {
        const moves = [];
        if (!this._garbageMask) return moves;
        for (let c = 0; c < BOARD_COLS; c++) {
            let target = TOTAL_ROWS - 1;
            for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
                if (this._garbageMask[r][c]) {
                    target = r - 1;
                    continue;
                }
                if (this._board[r][c] !== EMPTY) {
                    if (target !== r) {
                        moves.push({
                            col: c,
                            fromRow: r,
                            toRow: target,
                            value: this._board[r][c],
                        });
                    }
                    target--;
                }
            }
        }
        return moves;
    }

    _applyStageCollapse(moves) {
        if (!moves || moves.length === 0) return;
        for (const m of moves) {
            this._board[m.fromRow][m.col] = EMPTY;
        }
        for (const m of moves) {
            this._board[m.toRow][m.col] = m.value;
        }
    }

    _calcStageFallDuration(moves) {
        if (!moves || moves.length === 0) return 0;
        let maxDrop = 0;
        for (const m of moves) {
            maxDrop = Math.max(maxDrop, m.fromRow - m.toRow);
        }
        return Math.min(
            STAGE_SETTLE_FALL_MS_MAX,
            Math.max(STAGE_SETTLE_FALL_MS_MIN, STAGE_SETTLE_FALL_MS_MIN + maxDrop * STAGE_SETTLE_FALL_MS_PER_ROW)
        );
    }

    _stageInitSettle(lockedSnap) {
        this._stageSettle = {
            lockedSnap,
            totalCleared: 0,
            visibleRowsAll: [],
            clearedColorsAll: [],
            anyTetris: false,
            comboIncremented: false,
            wave: 0,
            startedAt: this._engineTime,
        };
        this._stageSettleAnim = null;
    }

    _stageStartNextWave() {
        if (!this._stageSettle) {
            this._stageFinishSettle();
            return;
        }
        this._stageSettle.wave += 1;
        if (this._stageSettle.wave > BOARD_ROWS + 2) {
            this._stageFinishSettle();
            return;
        }

        const fullRows = this._findFullRows();
        if (fullRows.length === 0) {
            this._stageFinishSettle();
            return;
        }

        const visibleRows = fullRows.map(r => r - HIDDEN_ROWS);
        const clearedColors = fullRows.map(r => this._board[r].slice());
        const isTetris = fullRows.length === 4;

        this._stageSettle.totalCleared += fullRows.length;
        this._stageSettle.visibleRowsAll.push(...visibleRows);
        this._stageSettle.clearedColorsAll.push(...clearedColors);
        if (isTetris) this._stageSettle.anyTetris = true;

        this._clearFullRowsOnly(fullRows);
        const moves = this._planStageCollapse();

        if (!this._stageSettle.comboIncremented) {
            this._combo++;
            this._stageSettle.comboIncremented = true;
            if (this._combo > 0) {
                this._emit(this._onCombo, this._combo);
            }
        }

        this._emit(
            this._onLineClear,
            visibleRows,
            fullRows.length,
            isTetris,
            clearedColors,
            this._tSpinType,
            this._combo
        );

        const duration = this._calcStageFallDuration(moves);
        this._stageSettleAnim = {
            moves,
            elapsed: 0,
            duration,
            phase: moves.length > 0 ? 'flashWait' : 'chainGap',
            phaseLeft: moves.length > 0 ? STAGE_SETTLE_FLASH_MS : STAGE_SETTLE_CHAIN_GAP_MS,
        };
        this._emit(this._onBoardChange, this.getVisibleBoardForRender(), null);
    }

    _updateStageSettle(dt) {
        const settle = this._stageSettle;
        if (settle && (this._engineTime - (settle.startedAt || 0) > STAGE_SETTLE_TIMEOUT_MS)) {
            this._stageFinishSettle();
            return;
        }

        const anim = this._stageSettleAnim;
        if (!anim) {
            this._stageFinishSettle();
            return;
        }

        const ms = dt * 1000;
        if (!(ms > 0)) return;

        if (anim.phase === 'flashWait') {
            anim.phaseLeft -= ms;
            if (anim.phaseLeft <= 0) {
                anim.phase = 'fall';
                anim.elapsed = 0;
            }
            return;
        }

        if (anim.phase === 'fall') {
            anim.elapsed += ms;
            const duration = Math.max(0, Number(anim.duration) || 0);
            if (anim.elapsed >= duration) {
                this._applyStageCollapse(anim.moves);
                this._emit(this._onBoardChange, this.getVisibleBoard(), null);
                this._stageSettleAnim = {
                    moves: [],
                    elapsed: 0,
                    duration: 0,
                    phase: 'chainGap',
                    phaseLeft: STAGE_SETTLE_CHAIN_GAP_MS,
                };
            } else {
                this._emit(this._onBoardChange, this.getVisibleBoardForRender(), null);
            }
            return;
        }

        if (anim.phase === 'chainGap') {
            anim.phaseLeft -= ms;
            if (anim.phaseLeft <= 0) {
                this._stageSettleAnim = null;
                this._stageStartNextWave();
            }
            return;
        }

        // 未知相位：直接结束，避免永久卡在 SETTLING
        this._stageFinishSettle();
    }

    _stageFinishSettle() {
        const settle = this._stageSettle;
        this._stageSettle = null;
        this._stageSettleAnim = null;

        if (settle && settle.totalCleared > 0) {
            const result = {
                cleared: settle.totalCleared,
                lines: [],
                visibleRows: settle.visibleRowsAll,
                clearedColors: settle.clearedColorsAll,
                isTetris: settle.anyTetris,
                isDifficult: settle.anyTetris || this._tSpinType !== null,
            };
            this._calculateScore(result);
        } else {
            this._combo = -1;
        }

        if (this._mode === 'stage' && this._garbageRemaining === 0) {
            this._clearTimers();
            this._state = GameState.OVER;
            this._emit(this._onStateChange, this._state);
            this._emit(this._onGameOver, this._score, this._level, this._lines, 'stageClear');
            return;
        }

        this._state = GameState.PLAYING;
        this._emit(this._onStateChange, this._state);
        this._spawnPiece();
        if (this._state === GameState.PLAYING) {
            this._restartDropTimer();
        }
    }

    /** @deprecated 内部仍供单测同步路径；运行时改用 _clearFullRowsOnly + _plan/_apply */
    _clearFullRowsStage(fullRows) {
        this._clearFullRowsOnly(fullRows);
        this._applyStageCollapse(this._planStageCollapse());
    }

    _calculateScore(result) {
        const { cleared, isTetris, isDifficult } = result;
        // 连锁可能一次清 >4 行；计分表按 1~4 封顶，消行计数仍用真实 cleared
        const scoreTier = Math.min(4, Math.max(1, cleared));
        let base = LINE_SCORES[scoreTier - 1] * this._level;

        // T-Spin 加分
        if (this._tSpinType === 'full') {
            base += 400 * this._level;
            this._stats.tSpinFullCount++;
        } else if (this._tSpinType === 'mini') {
            base += 100 * this._level;
            this._stats.tSpinMiniCount++;
        }
        if (this._tSpinType) {
            this._stats.tSpinCount++;
        }

        // Tetris 计数
        if (isTetris) {
            this._stats.tetrisCount++;
        }

        // Back-to-Back 加成（1.5×）
        if (isDifficult && this._lastClearWasDifficult) {
            base = Math.floor(base * 1.5);
            this._stats.b2bCount++;
        }

        // Combo 加成
        if (this._combo > 0) {
            base += 50 * this._combo * this._level;
        }
        if (this._combo > this._stats.maxCombo) {
            this._stats.maxCombo = this._combo;
        }

        // 特殊方块计分倍率（触发消行的方块为特殊/新方块时）
        const specialMultiplier = SPECIAL_SCORE_MULTIPLIERS[this._lastLockType] || 1;
        if (specialMultiplier !== 1) {
            base = Math.floor(base * specialMultiplier);
        }

        this._lastClearWasDifficult = isDifficult;
        this._addScore(base);

        // 更新消行数并检查升级
        this._lines += cleared;
        this._checkLevelUp();
    }

    _addScore(delta) {
        this._score += delta;
        this._emit(this._onScoreChange, this._score, delta);
    }

    // ========================================================================
    // 私有 — 等级系统
    // ========================================================================

    _checkLevelUp() {
        // 闯关模式：局内不按消行升级
        if (this._mode === 'stage') return;
        const targetLevel = Math.min(
            Math.floor(this._lines / LINES_PER_LEVEL) + 1,
            MAX_LEVEL
        );
        if (targetLevel > this._level) {
            this._level = targetLevel;
            this._dropInterval = this._getDropInterval(this._level);
            if (this._state === GameState.PLAYING) {
                this._restartDropTimer();
            }
            this._emit(this._onLevelChange, this._level);
        }
    }

    _getDropInterval(level) {
        const idx = Math.min(level - 1, LEVEL_SPEEDS.length - 1);
        return LEVEL_SPEEDS[idx];
    }

    // ========================================================================
    // 私有 — 下落计时
    // ========================================================================

    _startDropTimer() {
        this._stopDropTimer();
        this._scheduleDrop();
    }

    _restartDropTimer() {
        this._stopDropTimer();
        this._scheduleDrop();
    }

    _scheduleDrop() {
        this._dropDeadline = this._engineTime + this._dropInterval;
    }

    _stopDropTimer() {
        this._dropDeadline = 0;
    }

    _autoDrop() {
        if (this._state !== GameState.PLAYING || !this._currentPiece) return;
        const p = this._currentPiece;
        if (this._isValidPosition(p.type, p.rotation, p.row + 1, p.col)) {
            p.row++;
            if (this._inLockDelay) {
                this._cancelLockDelay();
            }
            this._emit(this._onBoardChange, this.getVisibleBoard(), this.getCurrentPiece());
            this._scheduleDrop();
        } else {
            if (!this._inLockDelay) {
                this._startLockDelay();
            }
        }
    }

    // ========================================================================
    // 私有 — 锁定延迟
    // ========================================================================

    _startLockDelay() {
        this._inLockDelay = true;
        this._lockMoves = 0;
        this._startLockTimer();
    }

    _startLockTimer() {
        this._stopLockTimer();
        this._lockDeadline = this._engineTime + LOCK_DELAY_MS;
    }

    _stopLockTimer() {
        this._lockDeadline = 0;
    }

    /** 锁定延迟期间成功移动/旋转后调用 */
    _onLockDelayMove() {
        if (!this._inLockDelay) return;
        const p = this._currentPiece;
        // 若移动/旋转后下方出现空位（方块悬空），则脱离锁定延迟并恢复下落，
        // 避免方块在空中悬停后原地锁定
        if (p && this._isValidPosition(p.type, p.rotation, p.row + 1, p.col)) {
            this._cancelLockDelay();
            this._restartDropTimer();
            return;
        }
        this._lockMoves++;
        if (this._lockMoves >= MAX_LOCK_MOVES) {
            this._stopLockTimer();
            this._lockPiece();
        } else {
            this._startLockTimer();
        }
    }

    _cancelLockDelay() {
        this._stopLockTimer();
        this._inLockDelay = false;
        this._lockMoves = 0;
    }

    // ========================================================================
    // 私有 — 游戏结束
    // ========================================================================

    _gameOver(reason) {
        this._clearTimers();
        this._state = GameState.OVER;
        this._emit(this._onStateChange, this._state);
        this._emit(this._onGameOver, this._score, this._level, this._lines, reason || 'topOut');
    }

    // ========================================================================
    // 公共 — 模式与统计
    // ========================================================================

    /** 获取本局统计信息（T-Spin 次数 / Tetris 次数 / 最大 Combo / B2B 次数 / 硬降次数） */
    getStats() {
        return {
            tSpinCount: this._stats.tSpinCount || 0,
            tSpinMiniCount: this._stats.tSpinMiniCount || 0,
            tSpinFullCount: this._stats.tSpinFullCount || 0,
            tetrisCount: this._stats.tetrisCount || 0,
            maxCombo: this._stats.maxCombo || 0,
            b2bCount: this._stats.b2bCount || 0,
            hardDropCount: this._stats.hardDropCount || 0,
        };
    }

    /** 设置规则档（产品对局一律 stage 残局规则） */
    setMode(mode) {
        this._mode = 'stage';
    }

    /**
     * 闯关模式：注入固定开局布局（stages-v1.json 的 rows 字段）。
     * 注意：须在 init() 之后、start() 之前调用；行号为可见行号（0=顶部）。
     * @param {Object} layout 行号字符串 -> 10 字符行字符串（'#' 垃圾 / '.' 空）
     * @param {Object} config 可选：{ dropIntervalMs, firstPiece }
     * @returns {{garbageCount: number, minLines: number}}
     */
    initStage(layout, config) {
        this._mode = 'stage';
        this._stageConfig = config || {};
        this._stageFirstPiecePending = null;
        const fp = this._stageConfig.firstPiece;
        if (fp && TYPE_TO_VALUE[fp]) {
            this._stageFirstPiecePending = fp;
        }
        this._garbageMask = this._createEmptyMask();
        this._garbageRemaining = 0;
        if (layout) {
            Object.keys(layout).forEach((rowKey) => {
                const visibleRow = parseInt(rowKey, 10);
                const r = visibleRow + HIDDEN_ROWS;
                if (isNaN(visibleRow) || r < 0 || r >= TOTAL_ROWS) return;
                const line = layout[rowKey];
                for (let c = 0; c < line.length && c < BOARD_COLS; c++) {
                    if (line[c] === '#') {
                        this._board[r][c] = GARBAGE;
                        this._garbageMask[r][c] = true;
                        this._garbageRemaining++;
                    }
                }
            });
        }
        if (this._stageConfig.dropIntervalMs) {
            this._dropInterval = this._stageConfig.dropIntervalMs;
        }
        return { garbageCount: this._garbageRemaining, minLines: this._countGarbageRows() };
    }

    /**
     * 开场掉落动画：取出已注入的垃圾格坐标，清空棋盘显示（供逐格放回）。
     * @returns {Array<{row:number,col:number}>} 可见行坐标（已按底→顶、左→右排序）
     */
    prepareStageIntro() {
        const cells = [];
        if (!this._garbageMask) return cells;
        for (let r = 0; r < TOTAL_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (!this._garbageMask[r][c]) continue;
                cells.push({ row: r - HIDDEN_ROWS, col: c });
                this._board[r][c] = EMPTY;
                this._garbageMask[r][c] = false;
            }
        }
        this._garbageRemaining = 0;
        // 底行先落地，上层再砸下来，更像堆叠
        cells.sort((a, b) => (b.row - a.row) || (a.col - b.col));
        return cells;
    }

    /**
     * 开场动画：放回一格垃圾
     * @param {number} visibleRow
     * @param {number} col
     */
    placeIntroGarbageCell(visibleRow, col) {
        const r = visibleRow + HIDDEN_ROWS;
        if (r < 0 || r >= TOTAL_ROWS || col < 0 || col >= BOARD_COLS) return;
        if (this._board[r][col] === GARBAGE) return;
        this._board[r][col] = GARBAGE;
        if (!this._garbageMask) this._garbageMask = this._createEmptyMask();
        if (!this._garbageMask[r][col]) {
            this._garbageMask[r][col] = true;
            this._garbageRemaining++;
        }
    }

    /** 剩余垃圾格数（归零即过关） */
    getGarbageRemaining() {
        return this._garbageRemaining;
    }

    /** 当前含垃圾行数（理论最少消行） */
    getGarbageRows() {
        return this._countGarbageRows();
    }

    _countGarbageRows() {
        if (!this._garbageMask) return 0;
        let rows = 0;
        for (let r = 0; r < TOTAL_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (this._garbageMask[r][c]) { rows++; break; }
            }
        }
        return rows;
    }

    /** 获取当前游戏模式 */
    getMode() {
        return this._mode;
    }

    /** 外部强制结束对局（如挑战超时等扩展点） */
    finishGame(reason) {
        if (this._state !== GameState.PLAYING) return;
        this._gameOver(reason || 'modeFinish');
    }

    // ========================================================================
    // 私有 — 工具
    // ========================================================================

    _clearTimers() {
        this._stopDropTimer();
        this._stopLockTimer();
    }

    _createStats() {
        return {
            tSpinCount: 0,
            tSpinMiniCount: 0,
            tSpinFullCount: 0,
            tetrisCount: 0,
            maxCombo: 0,
            b2bCount: 0,
            hardDropCount: 0,
        };
    }

    _createEmptyMask() {
        const mask = [];
        for (let r = 0; r < TOTAL_ROWS; r++) {
            mask.push(new Array(BOARD_COLS).fill(false));
        }
        return mask;
    }

    _createEmptyBoard() {
        const board = [];
        for (let r = 0; r < TOTAL_ROWS; r++) {
            board.push(new Array(BOARD_COLS).fill(EMPTY));
        }
        return board;
    }

    _cloneBoard(board) {
        return board.map(row => row.slice());
    }

    _emit(fn, ...args) {
        if (typeof fn === 'function') {
            try { fn(...args); } catch (e) {
                console.error('[TetrisEngine] callback error:', e);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

module.exports = {
    TetrisEngine,
    BagRandomizer,
    GameState,
    BOARD_COLS,
    BOARD_ROWS,
    HIDDEN_ROWS,
    TOTAL_ROWS,
    EMPTY,
    GARBAGE,
    LEVEL_SPEEDS,
    LINE_SCORES,
    SOFT_DROP_SCORE,
    HARD_DROP_SCORE,
    LINES_PER_LEVEL,
    MAX_LEVEL,
    TYPE_TO_VALUE,
};
