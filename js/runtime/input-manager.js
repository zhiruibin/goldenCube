/**
 * InputManager - 触摸输入管理器
 * 职责：触摸事件分发、手势识别（滑动/点击/长按）、DAS/ARR 连发
 */

class InputManager {
    constructor(canvas) {
        this.canvas = canvas;

        /** @type {Object|null} 当前触摸点 */
        this._touch = null;

        /** @type {number} 触摸开始时间 */
        this._touchStartTime = 0;

        /** @type {{x: number, y: number}} 触摸起始坐标 */
        this._touchStartPos = { x: 0, y: 0 };

        /** @type {boolean} 是否正在拖动 */
        this._dragging = false;

        /** @type {number} 滑动判定阈值（像素） */
        this._swipeThreshold = 20;

        /** @type {number} 长按判定时间（毫秒） */
        this._longPressTime = 200;

        /** @type {number|null} 长按定时器 */
        this._longPressTimer = null;

        /** @type {boolean} 长按已触发 */
        this._longPressFired = false;

        /** @type {Function|null} 点击回调 */
        this._onTap = null;

        /** @type {Function|null} 滑动回调 */
        this._onSwipe = null;

        /** @type {Function|null} 长按开始回调 */
        this._onLongPressStart = null;

        /** @type {Function|null} 长按结束回调 */
        this._onLongPressEnd = null;

        /** @type {Function|null} 拖动回调 */
        this._onDrag = null;

        /** DAS/ARR 连发状态 */
        this._das = {
            enabled: false,
            direction: 0,       // -1 左, 1 右
            delay: 170,         // DAS 延迟（毫秒）
            repeat: 50,         // ARR 重复间隔（毫秒）
            timer: null,
            repeatTimer: null,
            active: false,
        };
    }

    // ==================== 事件绑定 ====================

    /**
     * 设置点击回调
     * @param {Function} cb - (x, y) => void
     */
    onTap(cb) {
        this._onTap = cb;
    }

    /**
     * 设置滑动回调
     * @param {Function} cb - (direction, distance) => void  direction: 'left'|'right'|'up'|'down'
     */
    onSwipe(cb) {
        this._onSwipe = cb;
    }

    /**
     * 设置长按开始回调
     * @param {Function} cb - (x, y) => void
     */
    onLongPressStart(cb) {
        this._onLongPressStart = cb;
    }

    /**
     * 设置长按结束回调
     */
    onLongPressEnd(cb) {
        this._onLongPressEnd = cb;
    }

    /**
     * 设置拖动回调
     * @param {Function} cb - (x, y, dx, dy) => void
     */
    onDrag(cb) {
        this._onDrag = cb;
    }

    // ==================== 触摸处理 ====================

    /**
     * 触摸开始
     * @param {TouchEvent} e
     */
    handleTouchStart(e) {
        if (!e.touches || e.touches.length === 0) return;

        const t = e.touches[0];
        this._touch = t;
        this._touchStartTime = Date.now();
        this._touchStartPos = { x: t.clientX, y: t.clientY };
        this._dragging = false;
        this._longPressFired = false;

        // 启动长按检测
        this._clearLongPressTimer();
        this._longPressTimer = setTimeout(() => {
            this._longPressFired = true;
            if (this._onLongPressStart) {
                this._onLongPressStart(t.clientX, t.clientY);
            }
        }, this._longPressTime);
    }

    /**
     * 触摸移动
     * @param {TouchEvent} e
     */
    handleTouchMove(e) {
        if (!e.touches || e.touches.length === 0) return;

        const t = e.touches[0];
        const dx = t.clientX - this._touchStartPos.x;
        const dy = t.clientY - this._touchStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 超过阈值视为拖动，取消长按
        if (dist > this._swipeThreshold) {
            this._dragging = true;
            this._clearLongPressTimer();

            if (this._onDrag) {
                this._onDrag(t.clientX, t.clientY, dx, dy);
            }
        }
    }

    /**
     * 触摸结束
     * @param {TouchEvent} e
     */
    handleTouchEnd(e) {
        this._clearLongPressTimer();

        // 长按结束
        if (this._longPressFired) {
            if (this._onLongPressEnd) {
                this._onLongPressEnd();
            }
            this._reset();
            return;
        }

        // 拖动结束 → 判定为滑动
        if (this._dragging) {
            const changedTouches = e.changedTouches;
            if (changedTouches && changedTouches.length > 0) {
                const t = changedTouches[0];
                const dx = t.clientX - this._touchStartPos.x;
                const dy = t.clientY - this._touchStartPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > this._swipeThreshold && this._onSwipe) {
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    let direction;
                    if (angle > -45 && angle <= 45) direction = 'right';
                    else if (angle > 45 && angle <= 135) direction = 'down';
                    else if (angle > -135 && angle <= -45) direction = 'up';
                    else direction = 'left';

                    this._onSwipe(direction, dist);
                }
            }
            this._reset();
            return;
        }

        // 短按 → 点击
        if (this._onTap) {
            this._onTap(this._touchStartPos.x, this._touchStartPos.y);
        }

        this._reset();
    }

    /**
     * 触摸取消
     */
    handleTouchCancel() {
        this._clearLongPressTimer();
        this._stopDAS();
        this._reset();
    }

    // ==================== DAS/ARR 连发 ====================

    /**
     * 启动 DAS 连发
     * @param {number} direction - -1 左, 1 右
     * @param {Function} onRepeat - 每次重复的回调
     * @param {Object} [config] - { delay, repeat }
     */
    startDAS(direction, onRepeat, config) {
        this._stopDAS();

        this._das.enabled = true;
        this._das.direction = direction;
        this._das.delay = (config && config.delay) || this._das.delay;
        this._das.repeat = (config && config.repeat) || this._das.repeat;

        // DAS 延迟后开始连发
        this._das.timer = setTimeout(() => {
            this._das.active = true;
            this._das.repeatTimer = setInterval(() => {
                if (this._das.active && onRepeat) {
                    onRepeat(this._das.direction);
                }
            }, this._das.repeat);
        }, this._das.delay);
    }

    /**
     * 停止 DAS 连发
     */
    _stopDAS() {
        if (this._das.timer) {
            clearTimeout(this._das.timer);
            this._das.timer = null;
        }
        if (this._das.repeatTimer) {
            clearInterval(this._das.repeatTimer);
            this._das.repeatTimer = null;
        }
        this._das.enabled = false;
        this._das.active = false;
    }

    /**
     * 更新 DAS/ARR 配置
     * @param {number} delay
     * @param {number} repeat
     */
    setDASConfig(delay, repeat) {
        this._das.delay = delay;
        this._das.repeat = repeat;
    }

    // ==================== 内部方法 ====================

    _clearLongPressTimer() {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
    }

    _reset() {
        this._touch = null;
        this._dragging = false;
        this._longPressFired = false;
    }

    /**
     * 销毁，清理所有定时器
     */
    destroy() {
        this._clearLongPressTimer();
        this._stopDAS();
        this._onTap = null;
        this._onSwipe = null;
        this._onLongPressStart = null;
        this._onLongPressEnd = null;
        this._onDrag = null;
    }
}

module.exports = { InputManager };
