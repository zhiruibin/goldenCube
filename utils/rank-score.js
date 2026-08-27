/**
 * 闯关榜复合键编码
 * 排序语义：clearedCount DESC → linesSum ASC → piecesSum ASC → timeSum ASC
 * 编码为单一可降序比较的 number（云库 orderBy / 好友 KV 共用）
 *
 * 约束：低位总和必须严格小于 CLEARED_MUL，且总值 < Number.MAX_SAFE_INTEGER
 */

const CLEARED_MUL = 1e10;
const LINES_MUL = 1e5;
const PIECES_MUL = 10;
const CAP_L = 90000;
const CAP_P = 90000;
const CAP_T = 99999;

/**
 * @param {{ clearedCount?: number, linesSum?: number, piecesSum?: number, timeSum?: number }} sums
 * @returns {number}
 */
function encodeRankScore(sums) {
    const s = sums || {};
    const c = Math.max(0, Math.min(999, Math.floor(Number(s.clearedCount) || 0)));
    const L = Math.max(0, Math.min(CAP_L, Math.floor(Number(s.linesSum) || 0)));
    const P = Math.max(0, Math.min(CAP_P, Math.floor(Number(s.piecesSum) || 0)));
    const T = Math.max(0, Math.min(CAP_T, Math.floor((Number(s.timeSum) || 0) / 1000)));
    return c * CLEARED_MUL
        + (CAP_L - L) * LINES_MUL
        + (CAP_P - P) * PIECES_MUL
        + (CAP_T - T);
}

/** 从编码分还原通关数（展示用） */
function decodeClearedCount(score) {
    return Math.floor(Math.max(0, Number(score) || 0) / CLEARED_MUL);
}

module.exports = {
    encodeRankScore,
    decodeClearedCount,
    CLEARED_MUL,
    LINES_MUL,
    PIECES_MUL,
    CAP_L,
    CAP_P,
    CAP_T,
};
