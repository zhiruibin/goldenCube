/*** SRS (Super Rotation System) 旋转系统模块
 ** 实现标准 SRS 旋转规则，包含：
 * - 7 种方块的 4 个旋转状态矩阵
 * - JLSTZ 方块的 Wall Kick 偏移表（5 组测试数据 × 8 种旋转方向）
 * - I 方块的 Wall Kick 偏移表（5 组测试数据 × 8 种旋转方向）
 * - O 方块无需 Wall Kick
 * - 实验室模式新方块（R 光棱 / Q 方碑 / X 十字 / K 王冠 / W 折梯 / A 方舟）
 ** 坐标约定：
 *   dx — 列偏移，正值向右
 *   dy — 行偏移，正值向下（与棋盘行号方向一致）
 ** 旋转状态编号：0 = 初始, 1 = R(顺时针90°), 2 = 180°, 3 = L(逆时针90°)
 */

// ============================================================
// 旋转状态矩阵
// ============================================================

/** I 方块 — 4×4 矩阵 */
const I_STATES = [
  // 状态 0
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 状态 R (1)
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
  ],
  // 状态 2
  [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
  ],
  // 状态 L (3)
  [
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
  ],
];

/** O 方块 — 3×3 矩阵（所有旋转状态相同） */
const O_STATES = [
  [
    [0, 1, 1],
    [0, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 1, 1],
    [0, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 1, 1],
    [0, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 1, 1],
    [0, 1, 1],
    [0, 0, 0],
  ],
];

/** T 方块 — 3×3 矩阵 */
const T_STATES = [
  // 状态 0
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // 状态 R (1)
  [
    [0, 1, 0],
    [0, 1, 1],
    [0, 1, 0],
  ],
  // 状态 2
  [
    [0, 0, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  // 状态 L (3)
  [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
];

/** S 方块 — 3×3 矩阵 */
const S_STATES = [
  // 状态 0
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  // 状态 R (1)
  [
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
  ],
  // 状态 2
  [
    [0, 0, 0],
    [0, 1, 1],
    [1, 1, 0],
  ],
  // 状态 L (3)
  [
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
];

/** Z 方块 — 3×3 矩阵 */
const Z_STATES = [
  // 状态 0
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  // 状态 R (1)
  [
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ],
  // 状态 2
  [
    [0, 0, 0],
    [1, 1, 0],
    [0, 1, 1],
  ],
  // 状态 L (3)
  [
    [0, 1, 0],
    [1, 1, 0],
    [1, 0, 0],
  ],
];

/** J 方块 — 3×3 矩阵 */
const J_STATES = [
  // 状态 0
  [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // 状态 R (1)
  [
    [0, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
  ],
  // 状态 2
  [
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
  ],
  // 状态 L (3)
  [
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
];

/** L 方块 — 3×3 矩阵 */
const L_STATES = [
  // 状态 0
  [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // 状态 R (1)
  [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 1],
  ],
  // 状态 2
  [
    [0, 0, 0],
    [1, 1, 1],
    [1, 0, 0],
  ],
  // 状态 L (3)
  [
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
];

/** C 方块（直角块）— 2×2 矩阵，4 个旋转状态 */
const C_STATES = [
  [
    [1, 0],
    [1, 1],
  ],
  [
    [1, 1],
    [1, 0],
  ],
  [
    [1, 1],
    [0, 1],
  ],
  [
    [0, 1],
    [1, 1],
  ],
];

/** D 方块（钻头块）— 1×1 矩阵，所有旋转状态相同（不可旋转） */
const D_STATES = [
  [[1]],
  [[1]],
  [[1]],
  [[1]],
];

/** P 方块（暗砖块）— 2×1 立式矩阵，所有旋转状态相同（不可旋转） */
const P_STATES = [
  [[1], [1]],
  [[1], [1]],
  [[1], [1]],
  [[1], [1]],
];

/** M 方块（对角块）— 2×2 对角 X 矩阵，所有旋转状态相同（不可旋转） */
const M_STATES = [
  [[1, 0], [0, 1]],
  [[1, 0], [0, 1]],
  [[1, 0], [0, 1]],
  [[1, 0], [0, 1]],
];

/** R 方块（光棱）— 4×4 矩阵，4 个旋转状态（同 I 形长条） */
const R_STATES = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
  ],
  [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
  ],
  [
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
  ],
];

/** Q 方块（方碑）— 2×2 矩阵，所有旋转状态相同（不可旋转） */
const Q_STATES = [
  [[1, 1], [1, 1]],
  [[1, 1], [1, 1]],
  [[1, 1], [1, 1]],
  [[1, 1], [1, 1]],
];

/** X 方块（台阶块）— 2×3 ↔ 3×2 矩阵，4 个旋转状态（可旋转） */
const X_STATES = [
  [[1, 1, 1], [1, 1, 0]],
  [[1, 1], [1, 1], [0, 1]],
  [[0, 1, 1], [1, 1, 1]],
  [[1, 0], [1, 1], [1, 1]],
];

/** K 方块（王冠）— 3×3 矩阵，4 个旋转状态 */
const K_STATES = [
  [[1, 0, 1], [1, 1, 1], [0, 0, 0]],
  [[0, 1, 1], [0, 1, 0], [0, 1, 1]],
  [[0, 0, 0], [1, 1, 1], [1, 0, 1]],
  [[1, 1, 0], [0, 1, 0], [1, 1, 0]],
];

/** W 方块（V型）— 3×3 矩阵，4 个旋转状态（可旋转） */
const W_STATES = [
  [[1, 0, 0], [1, 0, 0], [1, 1, 1]],
  [[1, 1, 1], [1, 0, 0], [1, 0, 0]],
  [[1, 1, 1], [0, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [0, 0, 1], [1, 1, 1]],
];

/** A 方块（方舟）— 2×3 ↔ 3×2 矩阵，横竖两态交替（180° 对称） */
const A_STATES = [
  [[1, 1, 1], [1, 1, 1]],
  [[1, 1], [1, 1], [1, 1]],
  [[1, 1, 1], [1, 1, 1]],
  [[1, 1], [1, 1], [1, 1]],
];

/** N 方块（星尘）— 1×1 矩阵，所有旋转状态相同（不可旋转） */
const N_STATES = [
  [[1]],
  [[1]],
  [[1]],
  [[1]],
];

// ============================================================
// 方块类型 → 旋转状态映射
// ============================================================

const ROTATION_STATES = {
  I: I_STATES,
  O: O_STATES,
  T: T_STATES,
  S: S_STATES,
  Z: Z_STATES,
  J: J_STATES,
  L: L_STATES,
  C: C_STATES,
  D: D_STATES,
  P: P_STATES,
  M: M_STATES,
  R: R_STATES,
  Q: Q_STATES,
  X: X_STATES,
  K: K_STATES,
  W: W_STATES,
  A: A_STATES,
  N: N_STATES,
};

// ============================================================
// Wall Kick 偏移表
// ============================================================

/*** JLSTZ 方块 Wall Kick 偏移表
 ** 键格式：`${fromState}->${toState}`，例如 "0>1" 表示从状态 0 旋转到状态 1 (R)
 * 每个条目包含 5 组 [dx, dy] 偏移，按优先级从高到低排列
 * 第 1 组 [0, 0] 为基本位置（无偏移）
 */
const JLSTZ_WALL_KICKS = {
  // 0 → R
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  // R → 0
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  // R → 2
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  // 2 → R
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  // 2 → L
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  // L → 2
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  // L → 0
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  // 0 → L
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

/*** I 方块 Wall Kick 偏移表
 ** 键格式同 JLSTZ_WALL_KICKS
 * I 方块的偏移量更大，因为 4×4 矩阵的旋转中心不同
 */
const I_WALL_KICKS = {
  // 0 → R
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  // R → 0
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  // R → 2
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  // 2 → R
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  // 2 → L
  '2>3': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  // L → 2
  '3>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  // L → 0
  '3>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  // 0 → L
  '0>3': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
};
// SRSRotation 类
// ============================================================

class SRSRotation {
  /*** 获取指定方块类型在指定旋转状态下的矩阵
   * @param {string} type - 方块类型 ('I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L')
   * @param {number} state - 旋转状态 (0 | 1 | 2 | 3)
   * @returns {number[][]} 方块矩阵
   */
  static getState(type, state) {
    const states = ROTATION_STATES[type];
    if (!states) {
      throw new Error(`[SRSRotation] 未知方块类型: ${type}`);
    }
    return states[state % 4];
  }

  /*** 计算顺时针旋转后的状态编号
   * @param {number} currentState - 当前旋转状态 (0-3)
   * @returns {number} 旋转后的状态编号
   */
  static rotateCW(currentState) {
    return (currentState + 1) % 4;
  }

  /*** 计算逆时针旋转后的状态编号
   * @param {number} currentState - 当前旋转状态 (0-3)
   * @returns {number} 旋转后的状态编号
   */
  static rotateCCW(currentState) {
    return (currentState + 3) % 4;
  }

  /*** 获取 Wall Kick 偏移列表
   * @param {string} type - 方块类型
   * @param {number} fromState - 旋转前状态
   * @param {number} toState - 旋转后状态
   * @returns {number[][]} 5 组 [dx, dy] 偏移量
   */
  static getWallKicks(type, fromState, toState) {
    // O 方块不需要 Wall Kick
    if (type === 'O') {
      return [[0, 0]];
    }
    // 不可旋转方块（D/P/M/Q/N）：禁止偏移（引擎层也会拦截旋转）
    if (type === 'D' || type === 'P' || type === 'M' || type === 'Q' || type === 'N') {
      return [[0, 0]];
    }
    // C 直角块 / A 方舟：简化墙踢表（4 方向试探）
    if (type === 'C' || type === 'A') {
      return [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    }

    const key = `${fromState}>${toState}`;
    // R 光棱同 I 长条使用 I 踢表；K/W 及其余 3×3 块使用 JLSTZ 踢表
    const table = (type === 'I' || type === 'R') ? I_WALL_KICKS : JLSTZ_WALL_KICKS;
    return table[key] || [[0, 0]];
  }

  static tryRotate(type, currentState, direction, pieceX, pieceY, isCellEmpty) {
    const toState = direction === 1
      ? SRSRotation.rotateCW(currentState)
      : SRSRotation.rotateCCW(currentState);
    const targetMatrix = SRSRotation.getState(type, toState);
    const kicks = SRSRotation.getWallKicks(type, currentState, toState);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      if (SRSRotation.isValidPosition(targetMatrix, pieceX + dx, pieceY + dy, isCellEmpty)) {
        return { success: true, newState: toState, newX: pieceX + dx, newY: pieceY + dy, kickIndex: i };
      }
    }
    return null;
  }

  /*** 检测指定位置的方块矩阵是否与棋盘发生碰撞
   ** @param {number[][]} matrix - 方块矩阵
   * @param {number} x - 左上角列坐标
   * @param {number} y - 左上角行坐标
   * @param {Function} isCellEmpty - 碰撞检测回调 (col, row) => boolean
   * @returns {boolean} true 表示无碰撞（合法），false 表示有碰撞
   */
  static isValidPosition(matrix, x, y, isCellEmpty) {
    for (let row = 0; row < matrix.length; row++) {
      for (let col = 0; col < matrix[row].length; col++) {
        if (matrix[row][col] === 1) {
          const absCol = x + col;
          const absRow = y + row;
          if (absCol < 0 || absCol >= 10) return false;
          if (absRow < 0 || absRow >= 22) return false;
          if (!isCellEmpty(absCol, absRow)) return false;
        }
      }
    }
    return true;
  }

  /*** 获取旋转状态名称
   * @param {number} state - 旋转状态 (0-3)
   * @returns {string} 状态名称 ('0' | 'R' | '2' | 'L')
   */
  static getStateName(state) {
    const names = ['0', 'R', '2', 'L'];
    return names[state % 4];
  }
}

module.exports = SRSRotation;