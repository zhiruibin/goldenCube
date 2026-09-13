/**
 * SceneManager - 场景管理器
 * 职责：场景注册、切换、生命周期管理、场景栈
 */

class SceneManager {
    constructor() {
        /** @type {Object<string, Function>} 场景构造函数注册表 */
        this._registry = {};

        /** @type {Object|null} 当前活跃场景实例 */
        this.current = null;

        /** @type {string} 当前场景名称 */
        this.currentName = '';

        /** @type {Object[]} 场景栈（用于返回上一场景） */
        this._stack = [];

        /** @type {Object|null} 切换过渡参数 */
        this._transition = null;
    }

    /**
     * 注册场景
     * @param {string} name - 场景名称
     * @param {Function} SceneClass - 场景构造函数
     */
    register(name, SceneClass) {
        this._registry[name] = SceneClass;
    }

    /**
     * 切换到指定场景（替换当前场景）
     * @param {string} name - 目标场景名称
     * @param {Object} [params] - 传递给目标场景的参数
     */
    switchTo(name, params) {
        if (!this._registry[name]) {
            console.error(`[SceneManager] 场景 "${name}" 未注册`);
            return;
        }

        // 退出当前场景
        if (this.current) {
            this.current.onExit && this.current.onExit();
        }

        // 压栈（保留返回能力）
        if (this.currentName) {
            this._stack.push({
                name: this.currentName,
                params: this.current._params || null,
            });
        }

        // 创建新场景实例
        const SceneClass = this._registry[name];
        this.current = new SceneClass();
        this.currentName = name;
        this.current._params = params || null;
        this._safeEnter(params);
        this._requestImmediateRender();
    }

    _safeEnter(params) {
        try {
            if (this.current && this.current.onEnter) this.current.onEnter(params);
        } catch (e) {
            console.error('[SceneManager] onEnter "' + this.currentName + '" 失败', e);
        }
    }

    /**
     * 切换场景但不压栈（用于"返回"操作，避免循环压栈）
     * @param {string} name
     * @param {Object} [params]
     */
    replace(name, params) {
        if (!this._registry[name]) {
            console.error(`[SceneManager] 场景 "${name}" 未注册`);
            return;
        }

        if (this.current) {
            this.current.onExit && this.current.onExit();
        }

        const SceneClass = this._registry[name];
        this.current = new SceneClass();
        this.currentName = name;
        this.current._params = params || null;
        this._safeEnter(params);
        this._requestImmediateRender();
    }

    /**
     * 结束当前流程并跳转：不把当前页压栈，并重置返回栈。
     * 用于「暂停退出 / 通关结算 / 失败回关选」等不应再回到对局页的跳转。
     * @param {string} name 目标场景
     * @param {Object} [params]
     * @param {string[]} [stackNames] 重置后的底层栈（默认 ['home']；目标为 home 时栈空）
     */
    leaveTo(name, params, stackNames) {
        if (!this._registry[name]) {
            console.error(`[SceneManager] 场景 "${name}" 未注册`);
            return;
        }

        if (this.current) {
            this.current.onExit && this.current.onExit();
        }

        if (name === 'home') {
            this._stack = [];
        } else {
            const names = Array.isArray(stackNames) ? stackNames : ['home'];
            this._stack = names
                .filter((n) => n && n !== name && this._registry[n])
                .map((n) => ({ name: n, params: null }));
        }

        const SceneClass = this._registry[name];
        this.current = new SceneClass();
        this.currentName = name;
        this.current._params = params || null;
        this._safeEnter(params);
        this._requestImmediateRender();
    }

    /**
     * 返回上一个场景
     */
    back() {
        if (this._stack.length === 0) {
            // 栈空时（如分享卡冷启动直达子页）回首页，避免「返回无响应」
            if (this.currentName !== 'home' && this._registry.home) {
                this.replace('home');
            } else {
                console.warn('[SceneManager] 场景栈为空，无法返回');
            }
            return;
        }

        if (this.current) {
            this.current.onExit && this.current.onExit();
        }

        const prev = this._stack.pop();
        const SceneClass = this._registry[prev.name];
        this.current = new SceneClass();
        this.currentName = prev.name;
        this.current._params = prev.params;
        this._safeEnter(prev.params);
        this._requestImmediateRender();
    }

    _requestImmediateRender() {
        try {
            if (typeof GameGlobal !== 'undefined' && GameGlobal.game) {
                GameGlobal.game._forceRender = true;
                if (typeof GameGlobal.game.kickLoop === 'function') {
                    GameGlobal.game.kickLoop();
                }
            }
        } catch (e) { /* ignore */ }
    }

    /**
     * 清空场景栈
     */
    clearStack() {
        this._stack = [];
    }

    /**
     * 只推进当前可见场景。栈里被盖住的页面相当于 0fps：不 update、不 render。
     * @param {number} dt - 帧间隔（秒）
     */
    update(dt) {
        if (this.current && this.current.update) {
            this.current.update(dt);
        }
    }

    /**
     * 只绘制当前可见场景。
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        if (this.current && this.current.render) {
            this.current.render(ctx);
        }
        this._renderGoldTransition(ctx);
        // 全局授权弹窗叠在当前场景之上（隐私优先于资料授权）
        try {
            const {
                isPrivacyDialogVisible,
                renderPrivacyDialog,
            } = require('../../utils/privacy');
            if (isPrivacyDialogVisible()) {
                const W = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.width) || 375;
                const H = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.height) || 667;
                renderPrivacyDialog(ctx, W, H);
                return;
            }
        } catch (e) { /* ignore */ }
        try {
            const {
                isProfileAuthDialogVisible,
                renderProfileAuthDialog,
            } = require('../../utils/user-profile');
            if (isProfileAuthDialogVisible()) {
                const W = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.width) || 375;
                const H = (typeof GameGlobal !== 'undefined' && GameGlobal.game && GameGlobal.game.height) || 667;
                renderProfileAuthDialog(ctx, W, H);
            }
        } catch (e) { /* ignore */ }
    }

    /** 最后一块金块跨场景退场；不阻塞 GameScene → StageResultScene 切换。 */
    _renderGoldTransition(ctx) {
        let fx = null;
        try { fx = GameGlobal.game && GameGlobal.game._goldTransition; } catch (e) { return; }
        if (!fx) return;
        const duration = Math.max(0.1, Number(fx.duration) || 0.5);
        const t = Math.max(0, (Date.now() - fx.startedAt) / 1000 / duration);
        if (t >= 1) {
            GameGlobal.game._goldTransition = null;
            return;
        }
        const H = GameGlobal.game.height;
        const cs = Number(fx.cellSize) || 20;
        const apexY = Math.max(20, fx.fromY - cs * 4.8);
        const endY = H - Math.max(44, cs * 2.2);
        const riseEnd = 0.30;
        let y;
        let x = fx.fromX;
        if (t <= riseEnd) {
            const riseT = t / riseEnd;
            y = fx.fromY + (apexY - fx.fromY) * (1 - Math.pow(1 - riseT, 2));
        } else {
            const fallT = (t - riseEnd) / (1 - riseEnd);
            y = apexY + (endY - apexY) * fallT * fallT;
            // 下落阶段向屏幕底部中央汇拢，承接结算页从中央升起的金块。
            const centerT = 1 - Math.pow(1 - fallT, 2);
            x = fx.fromX + (GameGlobal.game.width / 2 - fx.fromX) * centerT;
        }
        // 从弹出第一帧开始线性淡化，500ms 时完全不可见并由上方清理。
        const alpha = Math.max(0, 1 - t);
        const size = cs * 1.18 * (1 + Math.sin(Math.PI * t) * 0.12);
        try {
            const { buildIsoBlockFaces, drawSolidIsoBlock } = require('../render/iso-block-renderer');
            const a = (base) => Math.max(0, Math.min(1, alpha * base)).toFixed(3);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(t * Math.PI * 0.55);
            ctx.shadowColor = 'rgba(255,212,59,' + a(0.9) + ')';
            ctx.shadowBlur = 12 + Math.sin(Math.PI * t) * 8;
            drawSolidIsoBlock(ctx, buildIsoBlockFaces(0, 0, size, 'cube'), {
                left: 'rgba(211,154,22,' + a(1) + ')',
                right: 'rgba(184,115,8,' + a(1) + ')',
                top: 'rgba(255,232,117,' + a(1) + ')',
                bottom: 'rgba(124,67,0,' + a(1) + ')',
                leftStroke: 'rgba(255,239,150,' + a(0.78) + ')',
                rightStroke: 'rgba(255,214,70,' + a(0.72) + ')',
                topStroke: 'rgba(255,246,189,' + a(1) + ')',
                backEdge: 'rgba(255,245,190,' + a(0.78) + ')',
                frontEdge: 'rgba(255,248,205,' + a(0.92) + ')',
                shadow: false,
            });
            ctx.restore();
        } catch (e) { /* ignore transition render failures */ }
    }
}

module.exports = { SceneManager };
