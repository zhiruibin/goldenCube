#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
t4: 给 tetris-engine.js 增加闯关（stage）模式能力。

采用锚点字符串替换（不依赖行号），每个锚点必须唯一，否则报错退出。
改动点：
  1) 常量区新增 GARBAGE = 99
  2) constructor 初始化 _garbageMask / _garbageRemaining / _stageConfig
  3) init() 重置垃圾状态
  4) setMode 识别 stage（标准 7 块）；新增 initStage(layout, config) / getGarbageRemaining() / getGarbageRows() 等方法
  5) _checkLines 分支：stage 模式仅清满行、玩家块按列塌缩、垃圾块保持原位（方案 B）；新增 _clearFullRowsStage
  6) _lockPiece 中消行后检查垃圾清零 -> finishGame('stageClear')
  7) _checkLevelUp：stage 模式跳过消行升级
  8) revive：stage 模式不清除垃圾格
  9) 导出 GARBAGE
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, 'utils', 'tetris-engine.js')

with open(ENGINE, encoding='utf-8') as f:
    text = f.read()


def replace_once(old, new, label):
    global text
    n = text.count(old)
    if n != 1:
        print('FAIL: anchor not unique (%s): count=%d' % (label, n))
        print('anchor head:', old[:80].replace('\n', '\\n'))
        sys.exit(2)
    text = text.replace(old, new)
    print('OK: %s' % label)


# 1) 常量
replace_once(
    'const EMPTY = 0;',
    'const EMPTY = 0;\nconst GARBAGE = 99;',
    '1 常量 GARBAGE',
)

# 2) constructor：在 _stats 后初始化垃圾状态
replace_once(
    '        this._stats = this._createStats();\n\n        // 回调',
    '        this._stats = this._createStats();\n        this._garbageMask = null;\n        this._garbageRemaining = 0;\n        this._stageConfig = null;\n\n        // 回调',
    '2 constructor 垃圾状态',
)

# 3) init()：重置垃圾状态
replace_once(
    '        this._stats = this._createStats();\n        this._state = GameState.READY;',
    '        this._stats = this._createStats();\n        this._garbageMask = this._createEmptyMask();\n        this._garbageRemaining = 0;\n        this._stageConfig = null;\n        this._state = GameState.READY;',
    '3 init 重置垃圾状态',
)

# 4) setMode 替换 + 新增闯关方法
replace_once(
    '''    /** 设置游戏模式（classic / timed / marathon / special） */
    setMode(mode) {
        this._mode = mode || 'classic';
        this._bag.setSpecialMode(this._mode === 'special');
    }''',
    '''    /** 设置游戏模式（classic / timed / marathon / special / stage） */
    setMode(mode) {
        this._mode = mode || 'classic';
        this._bag.setSpecialMode(this._mode === 'special');
        // 闯关模式：固定标准 7 块
        if (this._mode === 'stage') {
            this._bag.setSpecialMode(false);
        }
    }

    /**
     * 闯关模式：注入固定开局布局（stages-v1.json 的 rows 字段）。
     * 注意：须在 init() 之后、start() 之前调用；行号为可见行号（0=顶部）。
     * @param {Object} layout 行号字符串 -> 10 字符行字符串（'#' 垃圾 / '.' 空）
     * @param {Object} config 可选：{ dropIntervalMs }
     * @returns {{garbageCount: number, minLines: number}}
     */
    initStage(layout, config) {
        this._mode = 'stage';
        this._bag.setSpecialMode(false);
        this._stageConfig = config || {};
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
    }''',
    '4 setMode + initStage/getGarbageRemaining 等方法',
)

# 5) _checkLines 分支
replace_once(
    '''        const isTetris = fullRows.length === 4;
        const visibleRows = fullRows.map(r => r - HIDDEN_ROWS);

        // 从下往上移除满行，顶部补空行
        for (let i = fullRows.length - 1; i >= 0; i--) {
            this._board.splice(fullRows[i], 1);
        }
        for (let i = 0; i < fullRows.length; i++) {
            this._board.unshift(new Array(BOARD_COLS).fill(EMPTY));
        }

        const isDifficult = isTetris || this._tSpinType !== null;
        return { cleared: fullRows.length, lines: fullRows, visibleRows, clearedColors, isTetris, isDifficult };''',
    '''        const isTetris = fullRows.length === 4;
        const visibleRows = fullRows.map(r => r - HIDDEN_ROWS);

        if (this._mode === 'stage') {
            // 闯关模式（方案 B）：仅清除满行格子；上方玩家块按列塌缩，垃圾块保持原位
            this._clearFullRowsStage(fullRows);
        } else {
            // 经典模式：从下往上移除满行，顶部补空行
            for (let i = fullRows.length - 1; i >= 0; i--) {
                this._board.splice(fullRows[i], 1);
            }
            for (let i = 0; i < fullRows.length; i++) {
                this._board.unshift(new Array(BOARD_COLS).fill(EMPTY));
            }
        }

        const isDifficult = isTetris || this._tSpinType !== null;
        return { cleared: fullRows.length, lines: fullRows, visibleRows, clearedColors, isTetris, isDifficult };''',
    '5 _checkLines 分支',
)

# 新增 _clearFullRowsStage 方法（插在 _calculateScore 前）
replace_once(
    '''    _calculateScore(result) {''',
    '''    /** 闯关模式消行（方案 B）：清除满行；玩家块按列重力塌缩，垃圾块作为屏障保持原位 */
    _clearFullRowsStage(fullRows) {
        // 1) 清除满行所有格子（含玩家块与垃圾块），并扣减垃圾计数
        for (const r of fullRows) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (this._garbageMask && this._garbageMask[r][c]) {
                    this._garbageMask[r][c] = false;
                    this._garbageRemaining = Math.max(0, this._garbageRemaining - 1);
                }
                this._board[r][c] = EMPTY;
            }
        }
        // 2) 玩家块按列塌缩（自底向上），垃圾格为不可穿越屏障，保持原位
        if (!this._garbageMask) return;
        for (let c = 0; c < BOARD_COLS; c++) {
            let target = TOTAL_ROWS - 1;
            for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
                if (this._garbageMask[r][c]) {
                    target = r - 1;
                    continue;
                }
                if (this._board[r][c] !== EMPTY) {
                    if (target !== r) {
                        this._board[target][c] = this._board[r][c];
                        this._board[r][c] = EMPTY;
                    }
                    target--;
                }
            }
        }
    }

    _calculateScore(result) {''',
    '5b 新增 _clearFullRowsStage',
)

# 6) _lockPiece 中消行后检查垃圾清零 -> stageClear
replace_once(
    '''        const clearResult = this._checkLines();
        if (clearResult.cleared > 0) {''',
    '''        const clearResult = this._checkLines();
        if (this._mode === 'stage' && this._garbageRemaining === 0) {
            // 闯关过关：停止并触发 STAGE_CLEAR
            this._clearTimers();
            this._state = GameState.OVER;
            this._emit(this._onStateChange, this._state);
            this._emit(this._onGameOver, this._score, this._level, this._lines, 'stageClear');
            this._currentPiece = null;
            return;
        }
        if (clearResult.cleared > 0) {''',
    '6 过关判定 stageClear',
)

# 7) _checkLevelUp：stage 跳过
replace_once(
    '''    _checkLevelUp() {
        const targetLevel = Math.min(''',
    '''    _checkLevelUp() {
        // 闯关模式：局内不按消行升级
        if (this._mode === 'stage') return;
        const targetLevel = Math.min(''',
    '7 闯关跳过升级',
)

# 8) revive：stage 模式不清除垃圾格
replace_once(
    '''        const clearTo = Math.min(HIDDEN_ROWS + 4, TOTAL_ROWS);
        for (let r = 0; r < clearTo; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                this._board[r][c] = EMPTY;
            }
        }''',
    '''        const clearTo = Math.min(HIDDEN_ROWS + 4, TOTAL_ROWS);
        for (let r = 0; r < clearTo; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                // 闯关模式：复活不误删垃圾格
                if (this._garbageMask && this._garbageMask[r][c]) continue;
                this._board[r][c] = EMPTY;
            }
        }''',
    '8 revive 垃圾保护',
)

# 8b) 新增 _createEmptyMask（插在 _createEmptyBoard 前）
replace_once(
    '''    _createEmptyBoard() {''',
    '''    _createEmptyMask() {
        const mask = [];
        for (let r = 0; r < TOTAL_ROWS; r++) {
            mask.push(new Array(BOARD_COLS).fill(false));
        }
        return mask;
    }

    _createEmptyBoard() {''',
    '8b 新增 _createEmptyMask',
)

# 9) 导出 GARBAGE
replace_once(
    '''    TOTAL_ROWS,
    EMPTY,''',
    '''    TOTAL_ROWS,
    EMPTY,
    GARBAGE,''',
    '9 导出 GARBAGE',
)

with open(ENGINE, 'w', encoding='utf-8') as f:
    f.write(text)

print('DONE: tetris-engine.js stage mode applied')
