/*** 音效管理模块
 * 基于 Web Audio API 程序化合成音效，无需加载外部音频文件
 * 适配微信小游戏 AudioContext（wx.createWebAudioContext 或全局 AudioContext）
 * 支持音效包：读取本地装备的 equipped_sound，按 soundPackProfiles 播放不同音色
 */

const { soundPackProfiles } = require('../data/skins');

class AudioManager {
  constructor() {
    /** @type {AudioContext|null} Web Audio 上下文 */
    this.ctx = null
    /** @type {number} 主音量 0~1 */
    this.masterVolume = 0.7
    /** @type {boolean} 是否静音 */
    this.muted = false
    /** @type {number} 音效音量 0~1 */
    this.sfxVolume = 0.8
    /** @type {number} 背景音乐音量 0~1 */
    this.bgmVolume = 0.5
    /** @type {boolean} 是否已初始化 */
    this._initialized = false
    /** @type {Array<Object>} 活跃音源节点，destroy 时统一停止 */
    this._activeSources = []
    /** @type {number|null} BGM 定时器 */
    this._bgmTimer = null
    /** @type {Array<Object>} BGM 音符序列 */
    this._bgmSequence = []
    /** @type {number} BGM 当前音符索引 */
    this._bgmIndex = 0
    /** @type {boolean} BGM 是否播放中 */
    this._bgmPlaying = false
    /** @type {string} 当前音效包 id */
    this._packId = 'default'
    /** @type {Object} 当前音效包参数 */
    this._pack = soundPackProfiles.default || {}
  }

  // ==================== 初始化 ====================

  /*** 初始化 AudioContext
   * 需要在用户交互事件中调用，以符合浏览器/小游戏自动播放策略
   */
  init() {
    if (this._initialized) return
    // 读取已装备音效包
    this._loadEquippedPack()
    try {
      if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
        this.ctx = wx.createWebAudioContext()
      } else if (typeof AudioContext !== 'undefined') {
        this.ctx = new AudioContext()
      } else if (typeof webkitAudioContext !== 'undefined') {
        this.ctx = new webkitAudioContext()
      } else {
        console.warn('[AudioManager] 当前环境不支持 Web Audio API，音效不可用')
        return
      }
      this._initialized = true
      this._ensureRunning()
    } catch (e) {
      console.warn('[AudioManager] AudioContext 初始化失败:', e)
    }
  }

  /*** 读取本地装备的音效包并应用
   */
  _loadEquippedPack() {
    let packId = 'default'
    try {
      packId = wx.getStorageSync('gc_equipped_sound') || 'default'
    } catch (e) {
      // 忽略，使用默认音效包
    }
    this.applySoundPack(packId)
  }

  /*** 应用指定音效包
   * @param {string} packId - 音效包 id（data/skins.js soundPacks）
   */
  applySoundPack(packId) {
    const id = packId && soundPackProfiles[packId] ? packId : 'default'
    this._packId = id
    this._pack = soundPackProfiles[id] || soundPackProfiles.default || {}
  }

  /*** 获取当前音效包 id
   * @returns {string}
   */
  getSoundPackId() {
    return this._packId
  }

  /*** 获取当前音效包参数
   * @returns {Object}
   */
  getSoundPack() {
    return this._pack
  }

  /*** 是否已初始化 AudioContext
   * @returns {boolean}
   */
  isInitialized() {
    return this._initialized && !!this.ctx
  }

  /*** 背景音乐是否播放中
   * @returns {boolean}
   */
  isBgmPlaying() {
    return this._bgmPlaying
  }



  /*** 确保 AudioContext 处于运行状态（处理 suspended 状态）
   */
  _ensureRunning() {
    if (!this.ctx) return
    try {
      if (this.ctx.state === 'suspended' && this.ctx.resume) {
        this.ctx.resume().catch(() => {})
      }
    } catch (e) {
      // 忽略
    }
  }

  // ==================== 音量控制 ====================

  /*** 设置主音量
   * @param {number} volume - 音量值 0~1
   */
  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume))
  }

  /*** 设置音效音量
   * @param {number} volume - 音量值 0~1
   */
  setSfxVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume))
  }

  /*** 设置背景音乐音量
   * @param {number} volume - 音量值 0~1
   */
  setBgmVolume(volume) {
    this.bgmVolume = Math.max(0, Math.min(1, volume))
  }

  /*** 切换静音状态
   * @returns {boolean} 切换后的静音状态
   */
  toggleMute() {
    this.setMute(!this.muted)
    return this.muted
  }

  /*** 设置静音状态
   * @param {boolean} muted
   */
  setMute(muted) {
    this.muted = muted
    if (muted) {
      this._stopAllActive()
      this.stopBGM()
    } else if (this._bgmPlaying && !this._bgmTimer) {
      this.playBGM()
    }
  }

  /*** 停止所有活跃音源（静音/销毁时调用）
   */
  _stopAllActive() {
    for (const s of this._activeSources) {
      try {
        if (s && s.stop) s.stop()
      } catch (e) { /* 已停止 */ }
    }
    this._activeSources = []
  }

  // ==================== 基础合成工具 ====================

  /*** 创建一个振荡器节点并播放
   * @param {number} frequency - 频率 (Hz)
   * @param {string} type - 波形类型 'sine' | 'square' | 'sawtooth' | 'triangle'
   * @param {number} duration - 持续时间 (秒)
   * @param {number} volume - 音量 0~1
   * @param {number} [attack=0.01] - 起音时间 (秒)
   * @param {number} [release=0.05] - 释放时间 (秒)
   * @returns {OscillatorNode|null}
   */
  _playTone(frequency, type, duration, volume, attack = 0.01, release = 0.05) {
    if (!this.ctx || this.muted || volume <= 0) return null
    const eff = this._getEffectiveVolume(this.sfxVolume) * volume
    if (eff <= 0.001) return null

    try {
      this._ensureRunning()
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = type || 'sine'
      osc.frequency.setValueAtTime(frequency, now)

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(eff, now + attack)
      gain.gain.setValueAtTime(eff, now + attack + Math.max(0, duration - attack - release))
      gain.gain.linearRampToValueAtTime(0.0001, now + attack + Math.max(0, duration - attack - release) + release)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + duration + 0.1)
      this._activeSources.push(osc)

      // 播放结束后清理引用
      const self = this
      osc.onended = function () {
        const idx = self._activeSources.indexOf(osc)
        if (idx >= 0) self._activeSources.splice(idx, 1)
        try { osc.disconnect() } catch (e) { /* */ }
        try { gain.disconnect() } catch (e) { /* */ }
      }

      return osc
    } catch (e) {
      return null
    }
  }

  /*** 播放一个频率滑动的音（上扫/下扫）
   * @param {number} freqStart - 起始频率 (Hz)
   * @param {number} freqEnd - 结束频率 (Hz)
   * @param {string} type - 波形类型
   * @param {number} duration - 持续时间 (秒)
   * @param {number} volume - 音量 0~1
   * @param {number} [attack=0.01] - 起音时间 (秒)
   * @param {number} [release=0.05] - 释放时间 (秒)
   * @returns {OscillatorNode|null}
   */
  _playSweep(freqStart, freqEnd, type, duration, volume, attack = 0.01, release = 0.05) {
    if (!this.ctx || this.muted || volume <= 0) return null
    const eff = this._getEffectiveVolume(this.sfxVolume) * volume
    if (eff <= 0.001) return null

    try {
      this._ensureRunning()
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = type || 'sine'
      osc.frequency.setValueAtTime(freqStart, now)
      osc.frequency.linearRampToValueAtTime(freqEnd, now + duration)

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(eff, now + attack)
      gain.gain.linearRampToValueAtTime(0.0001, now + duration + release)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + duration + release + 0.1)
      this._activeSources.push(osc)

      const self = this
      osc.onended = function () {
        const idx = self._activeSources.indexOf(osc)
        if (idx >= 0) self._activeSources.splice(idx, 1)
        try { osc.disconnect() } catch (e) { /* */ }
        try { gain.disconnect() } catch (e) { /* */ }
      }

      return osc
    } catch (e) {
      return null
    }
  }

  /*** 播放一个噪声脉冲（用于打击类音效）
   * @param {number} duration - 持续时间 (秒)
   * @param {number} volume - 音量 0~1
   */
  _playNoise(duration, volume) {
    if (!this.ctx || this.muted || volume <= 0) return
    const eff = this._getEffectiveVolume(this.sfxVolume) * volume
    if (eff <= 0.001) return

    try {
      this._ensureRunning()
      const now = this.ctx.currentTime
      const sampleRate = this.ctx.sampleRate || 44100
      const frames = Math.max(1, Math.floor(sampleRate * duration))
      const buffer = this.ctx.createBuffer(1, frames, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < frames; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
      }

      const src = this.ctx.createBufferSource()
      src.buffer = buffer

      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(eff, now)
      gain.gain.linearRampToValueAtTime(0.0001, now + duration)

      src.connect(gain)
      gain.connect(this.ctx.destination)
      src.start(now)
      this._activeSources.push(src)

      const self = this
      src.onended = function () {
        const idx = self._activeSources.indexOf(src)
        if (idx >= 0) self._activeSources.splice(idx, 1)
        try { src.disconnect() } catch (e) { /* */ }
        try { gain.disconnect() } catch (e) { /* */ }
      }
    } catch (e) {
      // 忽略噪声播放失败
    }
  }

  /*** 计算实际播放音量（考虑静音、主音量、分类音量）
   * @param {number} categoryVolume - 分类音量 (sfxVolume / bgmVolume)
   * @returns {number}
   */
  _getEffectiveVolume(categoryVolume) {
    if (this.muted) return 0
    return this.masterVolume * categoryVolume
  }

  // ==================== 游戏音效（按音效包参数） ====================

  /*** 移动音效 - 短促的轻击声
   */
  playMove() {
    const p = this._pack.move || { type: 'square', freq: 800, dur: 0.03, vol: 0.15 }
    this._playTone(p.freq, p.type, p.dur, p.vol, 0.002, 0.02)
  }

  /*** 旋转音效 - 上升的短音
   */
  playRotate() {
    const p = this._pack.rotate || { type: 'sine', freqStart: 300, freqEnd: 600, dur: 0.08, vol: 0.25 }
    this._playSweep(p.freqStart, p.freqEnd, p.type, p.dur, p.vol, 0.01, 0.04)
  }

  /*** 软降音效 - 轻微的下落提示音
   */
  playSoftDrop() {
    const p = this._pack.softDrop || { type: 'triangle', freq: 200, dur: 0.05, vol: 0.15 }
    this._playTone(p.freq, p.type, p.dur, p.vol, 0.005, 0.03)
  }

  /*** 硬降音效 - 沉闷的撞击声
   */
  playHardDrop() {
    const p = this._pack.hardDrop || { type: 'sine', freq: 100, dur: 0.15, vol: 0.3, noise: 0.15 }
    this._playTone(p.freq, p.type, p.dur, p.vol, 0.005, 0.1)
    if (p.noise) this._playNoise(0.08, p.noise)
  }

  /*** 消行音效 - 清脆的消除声
   * @param {number} lines - 消除行数 (1~4)
   */
  playLineClear(lines) {
    if (!this.ctx || this.muted) return
    const p = this._pack.lineClear || { type: 'sine', base: 523, dur: 0.12, vol: 0.35 }
    const base = p.base || 523
    const seq = []
    const n = Math.min(Math.max(lines || 1, 1), 4)
    for (let i = 0; i < n; i++) {
      seq.push(base * Math.pow(2, i / 2))
    }
    // 1行: 单音; 2行: 双音上行; 3行: 三音琶音; 4行: 四音上行
    for (let i = 0; i < seq.length; i++) {
      const delay = i * 0.03
      const freq = seq[i]
      const self = this
      setTimeout(() => {
        self._playTone(freq, p.type, p.dur, p.vol, 0.005, 0.06)
      }, delay * 1000)
    }
    if (n >= 4) {
      // 4行: 追加和弦
      const self = this
      setTimeout(() => {
        self._playTone(base, p.type, p.dur + 0.13, p.vol * 0.6, 0.01, 0.15)
        self._playTone(base * 1.26, p.type, p.dur + 0.13, p.vol * 0.6, 0.01, 0.15)
        self._playTone(base * 1.5, p.type, p.dur + 0.13, p.vol * 0.6, 0.01, 0.15)
      }, 150)
    }
  }

  /*** Tetris（四行消除）音效 - 华丽的消除声
   */
  playTetris() {
    this.playLineClear(4)
    const p = this._pack.tetris || { type: 'sine', base: 523, dur: 0.25, vol: 0.2, extraFreq: 1047, extraType: 'square', extraDur: 0.15, extraVol: 0.2 }
    // 叠加一个高频闪烁
    const self = this
    setTimeout(() => {
      self._playTone(p.extraFreq || 1047, p.extraType || 'square', p.extraDur || 0.15, p.extraVol || 0.2, 0.005, 0.1)
    }, 120)
  }

  /*** T-Spin 音效 - 特殊的旋转消除声
   */
  playTSpin() {
    const p = this._pack.tspin || { type: 'sawtooth', freqs: [400, 1200, 800], dur: 0.2, vol: 0.3 }
    const freqs = p.freqs || [400, 1200, 800]
    const dur = p.dur || 0.2
    this._playSweep(freqs[0], freqs[1], p.type, dur * 0.6, p.vol, 0.01, 0.02)
    const self = this
    setTimeout(() => {
      self._playTone(freqs[2], p.type, dur * 0.5, p.vol, 0.01, 0.05)
    }, dur * 0.6 * 1000)
  }

  /*** T-Spin + 消行组合音效
   * @param {number} lines - 消除行数
   */
  playTSpinClear(lines) {
    this.playTSpin()
    const self = this
    setTimeout(() => {
      self.playLineClear(lines || 1)
    }, 120)
  }

  /*** 游戏结束音效 - 下行的悲伤旋律
   */
  playGameOver() {
    const p = this._pack.gameOver || { seq: [784, 659, 523, 392, 330], type: 'sine', dur: 0.2, vol: 0.3, interval: 0.2 }
    const seq = p.seq || [784, 659, 523, 392, 330]
    const interval = p.interval || 0.2
    for (let i = 0; i < seq.length; i++) {
      const delay = i * interval
      const freq = seq[i]
      const self = this
      setTimeout(() => {
        self._playTone(freq, p.type, p.dur, p.vol, 0.01, 0.1)
      }, delay * 1000)
    }
  }

  /*** 升级/加速音效 - 短促的上升音
   */
  playLevelUp() {
    const p = this._pack.levelUp || { type: 'triangle', freqStart: 440, freqEnd: 880, dur: 0.15, vol: 0.3 }
    this._playSweep(p.freqStart, p.freqEnd, p.type, p.dur, p.vol, 0.01, 0.04)
  }

  /*** 按钮点击音效
   */
  playClick() {
    const p = this._pack.click || { type: 'sine', freq: 1000, dur: 0.02, vol: 0.2 }
    this._playTone(p.freq, p.type, p.dur, p.vol, 0.002, 0.015)
  }

  // ==================== 背景音乐 ====================

  /*** 播放背景音乐
   * 使用定时器循环播放简单音符序列，实现芯片音乐风格 BGM
   * 旋律 + 低音双轨，增加层次感
   */
  playBGM() {
    if (!this.ctx || this.muted || this._bgmPlaying) return
    this._bgmPlaying = true
    this._bgmIndex = 0
    // 芯片音乐风格循环（C 大调）：[旋律频率, 低音频率]
    this._bgmSequence = [
      [523, 131], [659, 131], [784, 131], [659, 131],
      [523, 131], [659, 131], [880, 131], [659, 131],
      [784, 147], [880, 147], [1047, 147], [880, 147],
      [784, 147], [659, 147], [587, 147], [523, 147],
    ]
    this._scheduleNextBgmNote()
  }

  /*** 调度下一个 BGM 音符（旋律 + 低音叠加）
   */
  _scheduleNextBgmNote() {
    if (!this._bgmPlaying) return
    const note = this._bgmSequence[this._bgmIndex % this._bgmSequence.length]
    const melodyFreq = Array.isArray(note) ? note[0] : note
    const bassFreq = Array.isArray(note) ? note[1] : note / 2
    this._bgmIndex++
    const vol = this.bgmVolume * 0.35
    if (!this.muted && vol > 0.001) {
      this._playBgmTone(melodyFreq, 0.26, vol, 'triangle')
      // 低音更长、更柔和，形成简单伴奏
      this._playBgmTone(bassFreq, 0.5, vol * 0.45, 'sine')
    }
    const self = this
    this._bgmTimer = setTimeout(() => {
      this._scheduleNextBgmNote()
    }, 280)
  }

  /*** 播放一个 BGM 音符（使用独立的背景音乐音量）
   * @param {number} freq - 频率 (Hz)
   * @param {number} duration - 时长 (秒)
   * @param {number} volume - 音量 0~1
   * @param {string} [type='triangle'] - 波形类型
   */
  _playBgmTone(freq, duration, volume, type) {
    if (!this.ctx || this.muted || volume <= 0) return
    try {
      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = type || 'triangle'
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(volume, now + 0.02)
      gain.gain.linearRampToValueAtTime(0.0001, now + duration)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(now)
      osc.stop(now + duration + 0.05)
      this._activeSources.push(osc)
    } catch (e) { /* */ }
  }

  /*** 停止背景音乐
   */
  stopBGM() {
    this._bgmPlaying = false
    if (this._bgmTimer) {
      clearTimeout(this._bgmTimer)
      this._bgmTimer = null
    }
  }

  /*** 暂停背景音乐
   */
  pauseBGM() {
    this.stopBGM()
  }

  /*** 恢复背景音乐
   */
  resumeBGM() {
    if (!this._bgmPlaying) {
      this.playBGM()
    }
  }


  // ==================== 资源管理 ====================

  /*** 销毁所有音频资源，释放 AudioContext
   */
  destroy() {
    this.stopBGM()
    this._stopAllActive()
    if (this.ctx && this.ctx.close) {
      try { this.ctx.close() } catch (e) { /* */ }
    }
    this.ctx = null
    this._initialized = false
    this._bgmPlaying = false
  }
}

module.exports = AudioManager
