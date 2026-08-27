/*** 广告管理模块
 * 统一管理激励视频、Banner、插屏广告的创建、展示、关闭及频率控制
 *
 * 健壮性设计：
 *  1. 广告位配置检查：空值/占位符跳过创建，避免无效广告请求
 *  2. 错误码细分：按微信广告错误码分类处理（致命/可重试/限频）
 *  3. 指数退避重试：失败后 3s→6s→12s 重试，达上限标记不可用，5 分钟后冷却恢复
 *  4. 展示容错：激励视频与插屏统一「先 load() 再 show()」流程，提高展示成功率
 *  5. Banner 适配：按安全区（iPhone X 等）定位，尺寸变化后自动重新定位
 *  6. 生命周期管理：onAppHide 自动隐藏 Banner，destroy 释放全部资源与定时器
 */

// 广告单元 ID 配置 —— 需在微信公众平台「流量主」中申请真实 adUnitId 后填入
// 留空字符串或占位符时，模块会跳过对应广告实例的创建，避免发送无效广告请求
const AD_UNIT_IDS = {
  rewardedVideo: '',
  banner: '',
  interstitial: '',
};

/** 占位符特征（微信官方示例 ID 形如 adunit-xxxxxxxxxxxxxxxx） */
const PLACEHOLDER_AD_UNIT = 'adunit-xxxxxxxxxxxxxxxx';

/** 判断单个 adUnitId 是否为可使用的真实配置 */
function isAdUnitIdReady(id) {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!trimmed) return false;
  if (trimmed === PLACEHOLDER_AD_UNIT) return false;
  // 未替换完的占位仍视为未配置
  if (trimmed.indexOf('xxxxxxxx') >= 0) return false;
  return true;
}

/**
 * 激励视频广告位是否已配置（模块级，供场景直接 require，避免实例方法绑定问题）
 * @returns {boolean}
 */
function isRewardedVideoConfigured() {
  return isAdUnitIdReady(AD_UNIT_IDS.rewardedVideo);
}

// 频率控制配置（单位：毫秒）
const FREQUENCY_CONFIG = {
  rewardedVideo: { interval: 60000, maxPerSession: 10 },   // 激励视频：60s 间隔，单次会话最多 10 次
  banner: { interval: 30000, showDuration: 15000 },        // Banner：30s 间隔，展示 15s 后自动关闭
  interstitial: { interval: 180000, maxPerSession: 3 },    // 插屏：180s 间隔，单次会话最多 3 次（与结算页降频叠加）
};

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 3000,       // 首次重试延迟 3s，后续指数退避
  backoffFactor: 2,
};

// 不可用冷却时间（毫秒）：达最大重试次数后标记不可用，5 分钟后自动恢复
const COOLDOWN_MS = 5 * 60 * 1000;

// Banner 底部安全距离与预期高度（逻辑像素）
const BANNER_BOTTOM_OFFSET = 8;
const BANNER_EXPECTED_HEIGHT = 90;

// 微信广告错误码（来源：微信小游戏广告错误码文档）
const AD_ERROR_CODE = {
  INVALID_ADUNIT: 1004,     // adUnitId 无效（通常是广告位 ID 填错/不存在）
  NO_FILL: 2000,            // 广告填充不足（暂无广告可展示）
  SLOT_CLOSED: 2001,        // 广告位已关闭（后台关闭，需重新申请）
  LOAD_TIMEOUT: 2002,       // 加载超时
  SHOW_REJECTED: 2003,      // 展示被拒绝（如未完成加载即展示）
  NETWORK: 2004,            // 网络错误
  COMPONENT_FAIL: 2005,     // 组件加载失败
  NOT_LOADED: 2006,         // 广告未加载完成
  RATE_LIMIT: 2007,         // 请求过于频繁
  UNAVAILABLE: 2008,        // 广告不可用
};

// 错误分类：
//   fatal      - 配置/平台级问题，重试无意义，直接标记不可用
//   retryable  - 临时性问题（填充不足/网络/超时），指数退避重试
//   rateLimited- 频率限制，等待冷却后自然恢复
const ERROR_CATEGORY = {
  fatal: [AD_ERROR_CODE.INVALID_ADUNIT, AD_ERROR_CODE.SLOT_CLOSED, AD_ERROR_CODE.UNAVAILABLE],
  retryable: [AD_ERROR_CODE.NO_FILL, AD_ERROR_CODE.LOAD_TIMEOUT, AD_ERROR_CODE.NETWORK, AD_ERROR_CODE.COMPONENT_FAIL, AD_ERROR_CODE.NOT_LOADED],
  rateLimited: [AD_ERROR_CODE.RATE_LIMIT, AD_ERROR_CODE.SHOW_REJECTED],
};

class AdManager {
  constructor() {
    // 广告实例
    this._rewardedVideoAd = null;
    this._bannerAd = null;
    this._interstitialAd = null;

    // 频率控制状态
    this._lastShowTime = {
      rewardedVideo: 0,
      banner: 0,
      interstitial: 0,
    };
    this._sessionCount = {
      rewardedVideo: 0,
      interstitial: 0,
    };

    // Banner 自动关闭定时器
    this._bannerTimer = null;

    // 重试计数
    this._retryCount = {
      rewardedVideo: 0,
      banner: 0,
      interstitial: 0,
    };

    // 重试定时器（用于销毁时清理）
    this._retryTimers = {
      rewardedVideo: null,
      banner: null,
      interstitial: null,
    };

    // 冷却定时器（用于销毁时清理）
    this._cooldownTimers = {
      rewardedVideo: null,
      banner: null,
      interstitial: null,
    };

    // 不可用标记（达最大重试次数后置 true，冷却结束后自动恢复）
    this._disabled = {
      rewardedVideo: false,
      banner: false,
      interstitial: false,
    };
    this._cooldownUntil = {
      rewardedVideo: 0,
      banner: 0,
      interstitial: 0,
    };

    // 激励视频回调暂存
    this._rewardedVideoResolve = null;
    this._rewardedVideoReject = null;

    this._init();
  }

  // ==================== 初始化 ====================

  _init() {
    this._createRewardedVideoAd();
    this._createBannerAd();
    this._createInterstitialAd();
  }

  // ==================== 广告位配置检查 ====================

  /*** 检查某类广告位是否已配置有效的 adUnitId
   * 避免使用空值或占位符创建广告实例，产生无效请求、触发不必要的报错
   * @param {string} adType - rewardedVideo / banner / interstitial
   * @returns {boolean}
   */
  _isAdUnitReady(adType) {
    return isAdUnitIdReady(AD_UNIT_IDS[adType]);
  }

  /**
   * 激励视频入口是否应对玩家展示（未配置广告位时隐藏复活/领币，避免点了不可用）
   * @returns {boolean}
   */
  isRewardedVideoConfigured() {
    return isRewardedVideoConfigured();
  }

  // ==================== 错误处理 ====================

  /*** 将广告错误归类为 fatal / retryable / rateLimited / unknown
   * @param {Error|object} err - 广告错误对象（含 errCode / code）
   * @returns {string}
   */
  _classifyError(err) {
    const code = err && err.errCode !== undefined ? err.errCode : (err && err.code);
    if (ERROR_CATEGORY.fatal.indexOf(code) >= 0) return 'fatal';
    if (ERROR_CATEGORY.retryable.indexOf(code) >= 0) return 'retryable';
    if (ERROR_CATEGORY.rateLimited.indexOf(code) >= 0) return 'rateLimited';
    return 'unknown';
  }

  /*** 统一广告错误处理入口：分类 + 记录 + 触发重试/冷却
   * @param {string} adType
   * @param {Error|object} err
   */
  _handleError(adType, err) {
    const category = this._classifyError(err);
    console.error(`[AdManager] ${adType} 广告错误（${category}）:`, err);

    if (category === 'fatal') {
      // 配置/平台级问题：重试无意义，直接标记不可用
      this._markUnavailable(adType);
      return;
    }
    if (category === 'rateLimited') {
      // 请求过于频繁：不触发重试，静默等待冷却；记录状态供展示时拦截
      this._disabled[adType] = true;
      this._cooldownUntil[adType] = Date.now() + Math.min(COOLDOWN_MS, 30000);
      return;
    }
    // retryable / unknown：指数退避重试
    this._retryLoad(adType);
  }

  /*** 检查某类广告当前是否处于不可用状态（含冷却到期自动恢复）
   * @param {string} adType
   * @returns {boolean} true 表示不可用，应跳过展示
   */
  _isDisabled(adType) {
    if (!this._disabled[adType]) return false;
    // 冷却到期：自动恢复
    if (Date.now() >= this._cooldownUntil[adType]) {
      this._disabled[adType] = false;
      this._cooldownUntil[adType] = 0;
      this._retryCount[adType] = 0;
      console.log(`[AdManager] ${adType} 冷却结束，恢复可用`);
      return false;
    }
    return true;
  }

  /*** 标记某类广告为不可用，并在 COOLDOWN_MS 后自动恢复并重新加载
   * @param {string} adType
   */
  _markUnavailable(adType) {
    if (this._disabled[adType]) return;
    this._disabled[adType] = true;
    this._cooldownUntil[adType] = Date.now() + COOLDOWN_MS;
    console.warn(`[AdManager] ${adType} 标记不可用，${COOLDOWN_MS / 60000} 分钟后自动恢复`);

    if (this._cooldownTimers[adType]) {
      clearTimeout(this._cooldownTimers[adType]);
    }
    this._cooldownTimers[adType] = setTimeout(() => {
      this._disabled[adType] = false;
      this._cooldownUntil[adType] = 0;
      this._retryCount[adType] = 0;
      this._cooldownTimers[adType] = null;
      console.log(`[AdManager] ${adType} 冷却结束，恢复可用并重新加载`);
      this._reloadAd(adType);
    }, COOLDOWN_MS);
  }

  /*** 重新加载某类广告（冷却恢复或主动刷新时调用）
   * @param {string} adType
   */
  _reloadAd(adType) {
    switch (adType) {
      case 'rewardedVideo':
        if (this._rewardedVideoAd && typeof this._rewardedVideoAd.load === 'function') {
          this._rewardedVideoAd.load().catch(() => {});
        }
        break;
      case 'banner':
        this._recreateBannerAd();
        break;
      case 'interstitial':
        if (this._interstitialAd && typeof this._interstitialAd.load === 'function') {
          this._interstitialAd.load().catch(() => {});
        }
        break;
      default:
        break;
    }
  }

  /*** 指数退避重试
   * 达到最大重试次数后标记不可用，避免持续失败消耗性能；冷却结束后可重新尝试
   * @param {string} adType - 广告类型
   */
  _retryLoad(adType) {
    if (this._disabled[adType]) return;
    const count = this._retryCount[adType] || 0;
    if (count >= RETRY_CONFIG.maxRetries) {
      console.warn(`[AdManager] ${adType} 已达最大重试次数 ${RETRY_CONFIG.maxRetries}，标记不可用`);
      this._markUnavailable(adType);
      return;
    }

    const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffFactor, count);
    this._retryCount[adType] = count + 1;

    console.log(`[AdManager] ${adType} 将在 ${delay}ms 后进行第 ${count + 1} 次重试`);

    if (this._retryTimers[adType]) {
      clearTimeout(this._retryTimers[adType]);
    }
    this._retryTimers[adType] = setTimeout(() => {
      this._retryTimers[adType] = null;
      this._reloadAd(adType);
    }, delay);
  }

  /*** 统一的「先 load() 再 show()」展示流程
   * 提高展示成功率：show 失败先尝试 load 后重试，与微信广告推荐用法一致
   * @param {object} ad - 广告实例
   * @returns {Promise<void>}
   */
  _loadThenShow(ad) {
    return new Promise((resolve, reject) => {
      if (!ad || typeof ad.show !== 'function') {
        reject(new Error('广告实例无效'));
        return;
      }

      const doShow = () => {
        ad.show()
          .then(resolve)
          .catch((showErr) => {
            // show 失败：尝试 load 后再 show 一次（部分场景展示需先加载完成）
            if (typeof ad.load === 'function') {
              ad.load()
                .then(() => ad.show())
                .then(resolve)
                .catch(reject);
            } else {
              reject(showErr);
            }
          });
      };

      if (typeof ad.load === 'function') {
        ad.load()
          .then(doShow)
          .catch(() => doShow()); // load 失败不阻塞展示，交给 show 决定
      } else {
        doShow();
      }
    });
  }

  // ==================== 激励视频广告 ====================

  /*** 创建激励视频广告实例（含低版本基础库兼容判断）
   */
  _createRewardedVideoAd() {
    if (!this._isAdUnitReady('rewardedVideo')) {
      console.warn('[AdManager] 激励视频 adUnitId 未配置，跳过创建（请在 AD_UNIT_IDS 中填写真实广告位 ID）');
      return;
    }

    if (typeof wx.createRewardedVideoAd !== 'function') {
      console.warn('[AdManager] 当前基础库不支持激励视频广告');
      return;
    }

    try {
      this._rewardedVideoAd = wx.createRewardedVideoAd({
        adUnitId: AD_UNIT_IDS.rewardedVideo,
      });

      this._rewardedVideoAd.onError((err) => {
        this._handleError('rewardedVideo', err);
        // 错误时若存在挂起的展示 Promise，reject 以避免悬挂
        if (this._rewardedVideoReject) {
          this._rewardedVideoReject(err);
          this._rewardedVideoReject = null;
        }
      });

      this._rewardedVideoAd.onClose((res) => {
        // res.isEnded === true 表示用户完整观看了广告
        if (res && res.isEnded) {
          if (this._rewardedVideoResolve) {
            this._rewardedVideoResolve(true);
          }
        } else {
          // 用户中途关闭，不发放奖励
          if (this._rewardedVideoReject) {
            this._rewardedVideoReject(new Error('用户未完整观看广告'));
          }
        }
        this._rewardedVideoResolve = null;
        this._rewardedVideoReject = null;
      });
    } catch (e) {
      console.error('[AdManager] 创建激励视频广告失败:', e);
    }
  }

  /*** 展示激励视频广告
   * @returns {Promise<boolean>} 用户完整观看返回 true，否则 reject
   */
  showRewardedVideo() {
    return new Promise((resolve, reject) => {
      if (!this._isAdUnitReady('rewardedVideo')) {
        reject(new Error('激励视频广告位未配置'));
        return;
      }

      if (this._isDisabled('rewardedVideo')) {
        reject(new Error('激励视频广告暂不可用，请稍后再试'));
        return;
      }

      // 频率检查
      if (!this._checkFrequency('rewardedVideo')) {
        reject(new Error('激励视频广告展示过于频繁，请稍后再试'));
        return;
      }

      if (!this._rewardedVideoAd) {
        reject(new Error('激励视频广告未初始化'));
        return;
      }

      this._rewardedVideoResolve = resolve;
      this._rewardedVideoReject = reject;

      // 先 load 再 show，失败时自动重试一次
      this._loadThenShow(this._rewardedVideoAd)
        .then(() => {
          this._recordShow('rewardedVideo');
        })
        .catch((err) => {
          console.error('[AdManager] 激励视频展示失败:', err);
          this._rewardedVideoResolve = null;
          this._rewardedVideoReject = null;
          reject(err);
        });
    });
  }

  // ==================== Banner 广告 ====================

  /*** 获取 Banner 展示样式（按安全区定位，适配 iPhone X 等异形屏）
   * @returns {{left:number, top:number, width:number}}
   */
  _getBannerStyle() {
    let windowInfo = null;
    // 优先使用新版 API，低版本回退到 getSystemInfoSync
    if (typeof wx.getWindowInfo === 'function') {
      try {
        windowInfo = wx.getWindowInfo();
      } catch (e) {
        windowInfo = null;
      }
    }
    if (!windowInfo) {
      const si = wx.getSystemInfoSync();
      windowInfo = {
        windowWidth: si.windowWidth,
        windowHeight: si.windowHeight,
        safeArea: si.safeArea,
      };
    }

    const winW = windowInfo.windowWidth || 375;
    const safeArea = windowInfo.safeArea;
    // 有安全区：Banner 底部对齐安全区底部；无安全区：底部留白
    const bottom = safeArea && typeof safeArea.bottom === 'number' ? safeArea.bottom : (windowInfo.windowHeight || 667);

    return {
      left: 0,
      top: Math.max(0, bottom - BANNER_EXPECTED_HEIGHT - BANNER_BOTTOM_OFFSET),
      width: winW,
    };
  }

  /*** 按当前安全区重新定位 Banner（屏幕旋转 / 尺寸变化时调用）
   */
  _repositionBanner() {
    if (!this._bannerAd) return;
    try {
      const style = this._getBannerStyle();
      this._bannerAd.style.left = style.left;
      this._bannerAd.style.top = style.top;
      this._bannerAd.style.width = style.width;
    } catch (e) {
      console.warn('[AdManager] Banner 重新定位失败:', e);
    }
  }

  /*** 创建 Banner 广告实例
   * 按安全区定位，注册 onResize 在尺寸变化后自动重新定位
   */
  _createBannerAd() {
    if (!this._isAdUnitReady('banner')) {
      console.warn('[AdManager] Banner adUnitId 未配置，跳过创建（请在 AD_UNIT_IDS 中填写真实广告位 ID）');
      return;
    }

    if (typeof wx.createBannerAd !== 'function') {
      console.warn('[AdManager] 当前基础库不支持 Banner 广告');
      return;
    }

    try {
      const style = this._getBannerStyle();
      this._bannerAd = wx.createBannerAd({
        adUnitId: AD_UNIT_IDS.banner,
        style,
      });

      this._bannerAd.onError((err) => {
        this._handleError('banner', err);
      });

      this._bannerAd.onResize((res) => {
        console.log('[AdManager] Banner 尺寸变化:', res.width, res.height);
        // 尺寸变化后重新定位，避免遮挡底部操作区
        this._repositionBanner();
      });
    } catch (e) {
      console.error('[AdManager] 创建 Banner 广告失败:', e);
    }
  }

  /*** 展示 Banner 广告（展示前按安全区重新定位）
   */
  showBanner() {
    if (!this._isAdUnitReady('banner')) {
      console.warn('[AdManager] Banner 广告位未配置，跳过展示');
      return;
    }

    if (this._isDisabled('banner')) {
      console.warn('[AdManager] Banner 广告暂不可用，跳过展示');
      return;
    }

    if (!this._checkFrequency('banner')) {
      console.log('[AdManager] Banner 广告展示过于频繁，跳过');
      return;
    }

    if (!this._bannerAd) {
      console.warn('[AdManager] Banner 广告未初始化');
      return;
    }

    this._repositionBanner();

    this._bannerAd.show()
      .then(() => {
        this._recordShow('banner');
        // 到时间后自动关闭
        this._bannerTimer = setTimeout(() => {
          this.hideBanner();
        }, FREQUENCY_CONFIG.banner.showDuration);
      })
      .catch((err) => {
        console.warn('[AdManager] Banner 展示失败:', err);
        // 展示失败：交由统一错误处理决定是否重试
        this._handleError('banner', err);
      });
  }

  /*** 隐藏 Banner 广告
   */
  hideBanner() {
    if (this._bannerTimer) {
      clearTimeout(this._bannerTimer);
      this._bannerTimer = null;
    }

    if (this._bannerAd) {
      this._bannerAd.hide().catch((err) => {
        console.warn('[AdManager] Banner 隐藏失败:', err);
      });
    }
  }

  /*** 销毁 Banner 广告实例并重新创建
   */
  _recreateBannerAd() {
    if (this._bannerAd) {
      try {
        this._bannerAd.destroy();
      } catch (e) {
        // 忽略销毁异常
      }
      this._bannerAd = null;
    }
    this._createBannerAd();
  }

  // ==================== 插屏广告 ====================

  /*** 创建插屏广告实例（含基础库版本兼容判断：2.6.0+ 才支持）
   */
  _createInterstitialAd() {
    if (!this._isAdUnitReady('interstitial')) {
      console.warn('[AdManager] 插屏 adUnitId 未配置，跳过创建（请在 AD_UNIT_IDS 中填写真实广告位 ID）');
      return;
    }

    if (typeof wx.createInterstitialAd !== 'function') {
      console.warn('[AdManager] 当前基础库不支持插屏广告');
      return;
    }

    try {
      this._interstitialAd = wx.createInterstitialAd({
        adUnitId: AD_UNIT_IDS.interstitial,
      });

      this._interstitialAd.onError((err) => {
        this._handleError('interstitial', err);
      });

      this._interstitialAd.onClose(() => {
        console.log('[AdManager] 插屏广告已关闭');
      });
    } catch (e) {
      console.error('[AdManager] 创建插屏广告失败:', e);
    }
  }

  /*** 展示插屏广告（先 load 再 show，失败时自动重试一次）
   * @returns {Promise<boolean>} 展示成功 resolve(true)，跳过/失败 resolve(false)
   */
  showInterstitial() {
    return new Promise((resolve) => {
      if (!this._isAdUnitReady('interstitial')) {
        console.warn('[AdManager] 插屏广告位未配置，跳过展示');
        resolve(false);
        return;
      }

      if (this._isDisabled('interstitial')) {
        console.warn('[AdManager] 插屏广告暂不可用，跳过展示');
        resolve(false);
        return;
      }

      if (!this._checkFrequency('interstitial')) {
        console.log('[AdManager] 插屏广告展示过于频繁，跳过');
        resolve(false);
        return;
      }

      if (!this._interstitialAd) {
        console.warn('[AdManager] 插屏广告未初始化');
        resolve(false);
        return;
      }

      this._loadThenShow(this._interstitialAd)
        .then(() => {
          this._recordShow('interstitial');
          resolve(true);
        })
        .catch((err) => {
          console.warn('[AdManager] 插屏展示失败:', err);
          resolve(false);
        });
    });
  }

  // ==================== 频率控制 ====================

  /*** 检查是否满足展示频率要求
   * @param {string} adType - 广告类型：rewardedVideo / banner / interstitial
   * @returns {boolean}
   */
  _checkFrequency(adType) {
    const config = FREQUENCY_CONFIG[adType];
    if (!config) return true;

    const now = Date.now();
    const elapsed = now - this._lastShowTime[adType];

    // 间隔检查
    if (elapsed < config.interval) {
      return false;
    }

    // 单次会话次数检查
    if (config.maxPerSession && this._sessionCount[adType] >= config.maxPerSession) {
      return false;
    }

    return true;
  }

  /*** 记录一次广告展示，更新频率控制状态
   * @param {string} adType
   */
  _recordShow(adType) {
    this._lastShowTime[adType] = Date.now();
    if (this._sessionCount[adType] !== undefined) {
      this._sessionCount[adType]++;
    }
  }

  /*** 重置单次会话计数（在游戏重新开始时调用）
   */
  resetSessionCount() {
    this._sessionCount.rewardedVideo = 0;
    this._sessionCount.interstitial = 0;
  }

  // ==================== 生命周期管理 ====================

  /*** 应用隐藏时调用：隐藏 Banner，避免切后台后广告悬浮
   * 由 game.js 的 wx.onHide 触发
   */
  onAppHide() {
    this.hideBanner();
  }

  // ==================== 销毁与清理 ====================

  /*** 销毁所有广告实例，释放资源与定时器
   * 由游戏入口在 onUnload / 页面卸载时调用
   */
  destroy() {
    this.hideBanner();

    // 清理重试与冷却定时器
    ['rewardedVideo', 'banner', 'interstitial'].forEach((adType) => {
      if (this._retryTimers[adType]) {
        clearTimeout(this._retryTimers[adType]);
        this._retryTimers[adType] = null;
      }
      if (this._cooldownTimers[adType]) {
        clearTimeout(this._cooldownTimers[adType]);
        this._cooldownTimers[adType] = null;
      }
    });

    if (this._bannerAd) {
      try {
        this._bannerAd.destroy();
      } catch (e) {
        // 忽略销毁异常
      }
      this._bannerAd = null;
    }

    // 激励视频和插屏广告由微信管理生命周期，置空引用即可
    this._rewardedVideoAd = null;
    this._interstitialAd = null;

    if (this._bannerTimer) {
      clearTimeout(this._bannerTimer);
      this._bannerTimer = null;
    }

    this._rewardedVideoResolve = null;
    this._rewardedVideoReject = null;
  }
}

// 导出单例
const adManager = new AdManager();

module.exports = {
  AdManager,
  adManager,
  isRewardedVideoConfigured,
  isAdUnitIdReady,
};
