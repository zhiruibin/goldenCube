/*** 摇奖庆祝彩纸特效模块 ConfettiFx
 ** 效果：
 *  - 全屏彩纸从天而降：随机 x 下落，带左右摇摆与旋转，约 2.4-3.2 秒淡出
 *  - 面板中心彩纸向上炸开：初速度 170-490，重力 380，炸得更高更散
 *  - 0.45s 中心二次爆点、0.9s 左右两侧三次补炸，庆祝持续更久
 *  - 约 20% 概率的白色菱形闪光粒子（shape 2）
 ** 性能约束：
 *  - 复用场景现有 update/render 通道，不新增渲染循环
 *  - 粒子池与延迟爆点槽位在 init() 时预分配，逐帧零分配
 *  - 按 benchmarkLevel 分档硬上限（level>=3: 140 / level===2: 90 / 其他: 50 / 过低端: 关闭）
 *  - 存储开关 setting_luckyFx 默认开启
 */

const CONFETTI_COLORS = [
    '#ff5d5d',
    '#ff9f43',
    '#ffd35c',
    '#7bed9f',
    '#5dd9ff',
    '#5c7cff',
    '#c56cff',
    '#ff7ad9'
];

class ConfettiFx {
    constructor() {
        this.enabled = true;
        this.width = 375;
        this.height = 667;
        this.capacity = 0;
        this.pool = [];
        this.pendingBursts = [];
    }

    /*** 初始化：读取画布尺寸、存储开关，并按 benchmarkLevel 预分配粒子池
     */
    init() {
        let game = null;
        if (typeof GameGlobal !== 'undefined' && GameGlobal.game) {
            game = GameGlobal.game;
            if (game.width) this.width = game.width;
            if (game.height) this.height = game.height;
        }

        // 存储开关 setting_luckyFx：默认开启
        this.enabled = wx.getStorageSync('gc_setting_luckyFx') !== false;

        // benchmarkLevel 分档硬上限
        let level = 1;
        if (game && typeof game.benchmarkLevel === 'number') {
            level = game.benchmarkLevel;
        } else if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.benchmarkLevel === 'number') {
            level = GameGlobal.benchmarkLevel;
        }

        if (level < 1) {
            // 过低端设备：直接关闭彩纸特效
            this.capacity = 0;
        } else if (level >= 3) {
            this.capacity = 140;
        } else if (level === 2) {
            this.capacity = 90;
        } else {
            this.capacity = 50;
        }

        // 预分配粒子池，逐帧零分配
        this.pool = [];
        for (let i = 0; i < this.capacity; i++) {
            this.pool.push({
                active: false,
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                gravity: 0,
                rot: 0,
                rotSpeed: 0,
                size: 0,
                color: CONFETTI_COLORS[0],
                shape: 0, // 0: 矩形条, 1: 小方块, 2: 白色菱形闪光
                life: 0,
                maxLife: 0,
                swayPhase: 0,
                swayAmp: 0
            });
        }

        // 预分配延迟爆点槽位（0.45s/0.9s 补炸用），逐帧零分配
        this.pendingBursts = [];
        for (let i = 0; i < 8; i++) {
            this.pendingBursts.push({
                active: false,
                delay: 0,
                x: 0,
                y: 0,
                fullCircle: false,
                maxCount: 0
            });
        }
    }

    /*** 开关：开/关彩纸特效
     */
    setEnabled(on) {
        this.enabled = !!on;
    }

    isEnabled() {
        return this.enabled;
    }

    /*** 池中是否存在存活的粒子（含尚未触发的延迟爆点）
     */
    isActive() {
        const pool = this.pool;
        for (let i = 0, len = pool.length; i < len; i++) {
            if (pool[i].active) return true;
        }
        const slots = this.pendingBursts;
        for (let i = 0, len = slots.length; i < len; i++) {
            if (slots[i].active) return true;
        }
        return false;
    }

    /*** 触发彩纸庆祝
     * @param {number} centerX 面板中心 x
     * @param {number} centerY 面板中心 y
     */
    trigger(centerX, centerY) {
        if (!this.enabled || this.capacity <= 0) return;

        // 第一波：约 55% 配额用于主爆点 + 飘落，预留 45% 给延迟补炸
        const mainBudget = Math.floor(this.capacity * 0.55);
        const rainPart = Math.floor(mainBudget * 0.36);
        const burstPart = mainBudget - rainPart;
        const sideBudget = Math.max(1, Math.floor(this.capacity * 0.15));

        this.spawnRain(rainPart);
        this.spawnExplosion(centerX, centerY, false, burstPart);

        // 延迟二次爆点（0.45s 中心补炸）、三次爆点（0.9s 左右两侧补炸）
        this.scheduleBurst(0.45, centerX, centerY, true, sideBudget);
        this.scheduleBurst(0.9, centerX - 70, centerY - 20, true, sideBudget);
        this.scheduleBurst(0.9, centerX + 70, centerY - 20, true, sideBudget);
    }

    /*** 初始化粒子公共属性：颜色、形状（20% 白色菱形）、尺寸 5-11px、寿命 2.4-3.2s
     */
    initParticleCommon(p) {
        p.active = true;
        p.shape = Math.random() < 0.2 ? 2 : (Math.random() < 0.5 ? 0 : 1);
        p.color = p.shape === 2 ? '#ffffff' : CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
        p.size = 5 + Math.random() * 6;
        p.rot = Math.random() * Math.PI * 2;
        p.rotSpeed = (Math.random() - 0.5) * 10;
        p.maxLife = 2.4 + Math.random() * 0.8;
        p.life = p.maxLife;
    }

    /*** 从天而降的彩纸（随机 x 下落，带 sin 摇摆）
     * @param {number} maxCount 本波最大粒子数
     */
    spawnRain(maxCount) {
        let spawned = 0;
        const pool = this.pool;
        for (let i = 0, len = pool.length; i < len; i++) {
            if (maxCount > 0 && spawned >= maxCount) break;
            const p = pool[i];
            if (p.active) continue;

            this.initParticleCommon(p);
            p.x = Math.random() * this.width;
            p.y = -10 - Math.random() * 60;
            p.vx = (Math.random() - 0.5) * 20;
            p.vy = 60 + Math.random() * 90;
            p.gravity = 30 + Math.random() * 30;
            p.swayPhase = Math.random() * Math.PI * 2;
            p.swayAmp = 15 + Math.random() * 40;
            spawned++;
        }
    }

    /*** 爆点炸开的彩纸（初速 170-490，重力 380，更高更散）
     * @param {number} x 爆点 x
     * @param {number} y 爆点 y
     * @param {boolean} fullCircle true 全向炸开，false 上半圆
     * @param {number} maxCount 本波最大粒子数
     */
    spawnExplosion(x, y, fullCircle, maxCount) {
        let spawned = 0;
        const pool = this.pool;
        for (let i = 0, len = pool.length; i < len; i++) {
            if (maxCount > 0 && spawned >= maxCount) break;
            const p = pool[i];
            if (p.active) continue;

            this.initParticleCommon(p);
            p.x = x;
            p.y = y;
            const angle = fullCircle ? Math.random() * Math.PI * 2 : (-Math.PI + Math.random() * Math.PI);
            const speed = 170 + Math.random() * 320;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.gravity = 380;
            p.swayPhase = 0;
            p.swayAmp = 0;
            spawned++;
        }
    }

    /*** 调度一次延迟爆点（复用预分配槽位，不产生新对象）
     */
    scheduleBurst(delay, x, y, fullCircle, maxCount) {
        const slots = this.pendingBursts;
        for (let i = 0, len = slots.length; i < len; i++) {
            const s = slots[i];
            if (s.active) continue;
            s.active = true;
            s.delay = delay;
            s.x = x;
            s.y = y;
            s.fullCircle = !!fullCircle;
            s.maxCount = maxCount || 0;
            return;
        }
    }

    /*** 更新粒子（由场景 update 通道调用，不新增渲染循环）
     * @param {number} dt 帧间隔（秒）
     */
    update(dt) {
        if (dt > 0.05) dt = 0.05;

        const pool = this.pool;
        const w = this.width;
        const h = this.height;

        for (let i = 0, len = pool.length; i < len; i++) {
            const p = pool[i];
            if (!p.active) continue;

            p.life -= dt;
            if (p.life <= 0) {
                p.active = false;
                continue;
            }

            // sin 左右摇摆（仅下落的彩纸）
            if (p.swayAmp > 0) {
                p.swayPhase += dt * 3;
                p.x += Math.sin(p.swayPhase) * p.swayAmp * dt;
            }

            p.x += p.vx * dt;
            p.vy += p.gravity * dt;
            p.y += p.vy * dt;
            p.rot += p.rotSpeed * dt;

            // 越界则回收
            if (p.y > h + 30 || p.x < -50 || p.x > w + 50 || p.y < -100) {
                p.active = false;
            }
        }

        // 延迟爆点计时：到点后从对应位置补炸一次
        const slots = this.pendingBursts;
        for (let i = 0, len = slots.length; i < len; i++) {
            const s = slots[i];
            if (!s.active) continue;
            s.delay -= dt;
            if (s.delay <= 0) {
                s.active = false;
                this.spawnExplosion(s.x, s.y, s.fullCircle, s.maxCount);
            }
        }
    }

    /*** 绘制彩纸（由场景 render 通道调用，不新增渲染循环）
     * @param {CanvasRenderingContext2D} ctx
     */
    render(ctx) {
        if (!this.enabled) return;

        const pool = this.pool;
        for (let i = 0, len = pool.length; i < len; i++) {
            const p = pool[i];
            if (!p.active) continue;

            // 按剩余寿命比例淡出；菱形闪光粒子保持更亮更久
            const alpha = p.shape === 2
                ? Math.min(1, (p.life / p.maxLife) * 3)
                : Math.min(1, (p.life / p.maxLife) * 2.2);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            if (p.shape === 0) {
                // 矩形条
                ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
            } else if (p.shape === 1) {
                // 小方块
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            } else {
                // 白色菱形闪光：外层淡晕 + 内芯高亮
                ctx.globalAlpha = alpha * 0.45;
                ctx.beginPath();
                ctx.moveTo(0, -p.size * 1.7);
                ctx.lineTo(p.size * 1.7, 0);
                ctx.lineTo(0, p.size * 1.7);
                ctx.lineTo(-p.size * 1.7, 0);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size, 0);
                ctx.lineTo(0, p.size);
                ctx.lineTo(-p.size, 0);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        ctx.globalAlpha = 1;
    }

    /*** 销毁：清空粒子池释放内存
     */
    destroy() {
        this.pool = [];
        this.capacity = 0;
        const slots = this.pendingBursts;
        for (let i = 0, len = slots.length; i < len; i++) {
            slots[i].active = false;
        }
    }
}

module.exports = { ConfettiFx };