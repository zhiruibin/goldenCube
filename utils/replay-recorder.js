/*** utils/replay-recorder.js
 * 战局回放录制模块：负责在本地记录一局对战的全部操作输入，
 * 并在结算时生成可回放数据，供回放场景读取。
 */

class ReplayRecorder {
  constructor() {
    this.active = false;
    this.seed = null;
    this.mode = null;
    this.inputs = [];
  }

  /*** 开始录制
   * @param {number} seed 本局随机器种子（用于回放时复现同款方块序列）
   * @param {string} mode 游戏模式标识
   */
  start(seed, mode) {
    this.inputs = [];
    this.active = true;
    this.seed = seed;
    this.mode = mode;
  }

  /*** 录制一条输入动作
   * @param {string} action 动作标识（如 left / right / rotate / drop 等）
   * @param {number} t 相对开局的时间戳（毫秒）
   */
  record(action, t) {
    if (!this.active) return;
    this.inputs.push({ t: Math.round(t), a: action });
  }

  /*** 结束录制并生成回放数据
   * @param {Object} meta 本局结算附加信息（得分、消行数等）
   * @returns {{version: number, seed: number, mode: string, durationMs: number, inputs: Array, meta: Object}}
   */
  finish(meta) {
    const last = this.inputs[this.inputs.length - 1];
    const data = {
      version: 1,
      seed: this.seed,
      mode: this.mode,
      durationMs: last ? last.t : 0,
      inputs: this.inputs,
      meta: meta || {}
    };
    this.active = false;
    return data;
  }

  /*** 将回放数据保存到本地存储
   * @param {string} key 本地存储键
   * @param {Object} data 回放数据
   */
  save(key, data) {
    wx.setStorageSync(key, data);
  }

  /*** 从本地存储读取回放数据
   * @param {string} key 本地存储键
   * @returns {Object|null} 回放数据；读取失败或不存在时返回 null
   */
  static load(key) {
    try {
      return wx.getStorageSync(key) || null;
    } catch (e) {
      return null;
    }
  }
}

module.exports = { ReplayRecorder };