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

        // 初始化并进入
        this.current.onEnter && this.current.onEnter(params);
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

        this.current.onEnter && this.current.onEnter(params);
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
        this.current.onEnter && this.current.onEnter(params);
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

        this.current.onEnter && this.current.onEnter(prev.params);
    }

    /**
     * 清空场景栈
     */
    clearStack() {
        this._stack = [];
    }

    /**
     * 每帧更新
     * @param {number} dt - 帧间隔（秒）
     */
    update(dt) {
        if (this.current && this.current.update) {
            this.current.update(dt);
        }
    }

    /**
     * 每帧渲染
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        if (this.current && this.current.render) {
            this.current.render(ctx);
        }
        // 全局授权弹窗叠在当前场景之上（「去授权」为 UserInfoButton）
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
}

module.exports = { SceneManager };
