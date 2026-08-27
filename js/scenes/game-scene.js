/**
 * GameScene - 核心游戏场景
 * 职责：驱动游戏引擎、渲染棋盘/方块/UI、处理玩家输入
 */

const { TetrisEngine, HIDDEN_ROWS } = require('../../utils/tetris-engine');
const { ReplayRecorder } = require('../../utils/replay-recorder');
const { BoardRenderer } = require('../render/board-renderer');
const { PieceRenderer } = require('../render/piece-renderer');
const { EffectRenderer } = require('../render/effect-renderer');
const { BackgroundEffects } = require('../render/background-effects');
const { DPadButton } = require('../widgets/dpad-button');
const { Button } = require('../widgets/button');
const { PIECES, PIECE_COLORS } = require('../../data/pieces');
const { achievementManager } = require('../../utils/achievement-manager');
const { coinManager } = require('../../utils/coin-manager');
const { adManager, isRewardedVideoConfigured } = require('../../utils/ad-manager');
const IconRenderer = require('../render/icon-renderer');
const { MiniTetrisFx } = require('../render/mini-tetris-fx');
const { ConfettiFx } = require('../render/confetti-fx');

/** 硬降短时冷却：防止连点/多指瞬时误砸下一块（不改按钮布局） */
const HARD_DROP_COOLDOWN_MS = 200;

class GameScene {
    constructor() {
        this._params = null;
        this._engine = null;
        this._boardRenderer = null;
        this._pieceRenderer = null;
        this._effectRenderer = null;
        this._bgEffects = null;
        this._miniFx = null;
        this._confettiFx = null;
        this._dirButtons = [];
        this._buttons = [];
        this._mode = 'classic';

        // 成就系统：本局已上报标记 / 已使用方块类型集合
        this._achievementReported = false;
        // 本局存活计时（秒，成就统计用）
        this._surviveTime = 0;
        // 本局消行金币收益（结算页展示用）
        this._coinEarned = 0;

        // 模式计时（限时赛/马拉松）
        this._modeTimeLeft = 0;
        this._modeTimeTotal = 0;
        this._modeTargetLines = 0;

        // 误触保护：时间戳，此时间之前屏蔽输入
        this._inputBlockUntil = 0;

        this._hardDropReadyAt = 0;
        // 回放系统：本局回放录制器与随机种子（引擎开局注入 seed，方块序列可重放）
        this._recorder = null;
        this._replaySeed = null;

        // 按键震动节流：上次普通操作震动时间戳
        this._lastActionVibrateTime = 0;
        // 按键震动节流：上次普通操作震动时间戳
        this._lastActionVibrateTime = 0;

        // 棋盘布局参数
        this._boardX = 0;
        this._boardY = 0;
        this._cellSize = 0;

        // 侧边信息区
        this._sideX = 0;
        this._panelWidth = 90;
        // 消行特效队列
        this._lineClearEffects = [];

        // 多触点追踪：touchId -> 'dpad' | 'button' | null
        this._activeTouches = {};

        // 暂停菜单：触点消费标记（防止点暂停按钮抬手时二次切换）+ 菜单按钮命中区
        this._tapConsumed = false;
        this._pauseResumeBtnRect = null;
        this._pauseQuitBtnRect = null;

        // 游戏结束幸运摇奖状态（每局重置，确保每局仅摇一次）
        this._luckyDrawUsed = false;
        this._luckyDrawActive = false;
        this._luckyDrawPhase = 'idle';
        this._luckyDrawElapsed = 0;
        this._luckyDrawPrize = null;
        this._luckyDrawReels = [];
        this._luckyDrawMatchTypes = [];
        this._luckyDrawBtnRect = null;
        this._luckyDrawConfirmRect = null;
        this._luckyDrawGlowT = 0;
        this._luckyDrawT1 = 0.35;
        this._luckyDrawT3 = 1.0;
        this._luckyDrawVmax = 1100;
    }

    onEnter(params) {
        this._params = params || {};
        this._mode = this._params.mode || 'classic';
        this._challengeId = this._params.challengeId || '';
        // 挑战目标分：兼容 number / 数字字符串；无效则不展示
        if (typeof this._params.targetScore === 'number' && !isNaN(this._params.targetScore)) {
            this._targetScore = this._params.targetScore;
        } else if (this._params.targetScore != null && this._params.targetScore !== '') {
            const parsed = parseInt(this._params.targetScore, 10);
            this._targetScore = isNaN(parsed) ? null : parsed;
        } else {
            this._targetScore = null;
        }
        this._challengeLaunch = !!this._params.challengeLaunch;
        this._challengeTargetName = typeof this._params.challengeTargetName === 'string'
            ? this._params.challengeTargetName.slice(0, 32)
            : '';
        this._challengeTargetAvatar = typeof this._params.challengeTargetAvatar === 'string'
            ? this._params.challengeTargetAvatar.slice(0, 512)
            : '';
        this._challengeTargetOpenid = typeof this._params.challengeTargetOpenid === 'string'
            ? this._params.challengeTargetOpenid.slice(0, 64)
            : '';
        this._paused = false;

        // 成就系统：本局状态重置
        this._surviveTime = 0;
        // 本局消行金币收益（每局重置）
        this._coinEarned = 0;
        // 本局已使用方块类型集合
        this._usedPieceTypes = {};

        // 复活状态（每局重置，确保每局都有一次看广告复活机会）
        this._revivePending = false;

        // 摇奖状态（每局重置，确保每局仅摇一次）
        this._luckyDrawUsed = false;
        this._luckyDrawActive = false;
        this._luckyDrawPhase = 'idle';
        this._luckyDrawElapsed = 0;
        this._luckyDrawPrize = null;
        this._luckyDrawReels = [];
        this._luckyDrawMatchTypes = [];
        this._luckyDrawBtnRect = null;
        this._luckyDrawBtnRect = null;
        this._luckyDrawConfirmRect = null;
        this._luckyDrawGlowT = 0;
        this._luckyDrawT3 = 1.0;
        this._luckyDrawVmax = 1100;

        // 模式参数
        this._modeTimeLeft = 0;
        this._modeTimeTotal = 0;
        this._modeTargetLines = 0;
        if (this._mode === 'timed') {
            this._modeTimeTotal = 180; // 3 分钟
            this._modeTimeLeft = this._modeTimeTotal;
        } else if (this._mode === 'marathon') {
            this._modeTargetLines = 150; // 消除 150 行
        }

        // 读取设置
        this._settings = {
            sfx: wx.getStorageSync('gc_setting_sfx') !== false,
            bgm: wx.getStorageSync('gc_setting_bgm') !== false,
            vibrate: wx.getStorageSync('gc_setting_vibrate') !== false,
            bgEffects: wx.getStorageSync('gc_setting_bgEffects') !== false,
        };

        // 初始化音频
        const AudioManager = require('../../utils/audio-manager');
        this._audio = new AudioManager();
        this._audio.init();
        this._audio.setMute(!this._settings.sfx);

        // 误触保护：游戏开始前 0.5s 屏蔽输入
        this._inputBlockUntil = Date.now() + 500;
        this._hardDropReadyAt = 0;
        this._hardDropStartRow = null;

        this._calculateLayout();
        // 每局生成随机种子，供引擎 PRNG 与回放录制使用
        this._replaySeed = Math.floor(Math.random() * 0x7fffffff);
        // 懒加载回放录制器（同一场景实例跨局复用，首局创建）
        if (!this._recorder) {
            const { ReplayRecorder } = require('../../utils/replay-recorder');
            this._recorder = new ReplayRecorder();
        }
        this._recorder.start(this._replaySeed, this._mode);
        this._initEngine();
        this._initRenderers();
        this._initUI();
        this._bgEffects = new BackgroundEffects();
        this._bgEffects.init();
        this._bgEffects.setEnabled(this._settings.bgEffects);
        this._confettiFx = new ConfettiFx();
        this._confettiFx.init();

        // 底部迷你方块特效（静态展示 + 晃动彩蛋）
        const sys = GameGlobal.game.systemInfo || {};
        const safeArea = sys.safeArea || {};
        const H = GameGlobal.game.height;
        const bottomSafe = (safeArea.bottom && H > safeArea.bottom) ? (H - safeArea.bottom) : 0;
        this._miniFx = new MiniTetrisFx();
        this._miniFx.init({
            width: GameGlobal.game.width,
            height: H,
            bottomSafe,
            controlBottom: this._secondRowBottom,
        });

        // 启动引擎
        this._engine.init();
        this._engine.start();

        // 注册引擎回调
        this._bindEngineEvents();
    }

    onExit() {
        if (this._bgEffects) { this._bgEffects.destroy(); this._bgEffects = null; }
        if (this._miniFx) { this._miniFx.destroy(); this._miniFx = null; }
        if (this._confettiFx) { this._confettiFx.destroy(); this._confettiFx = null; }
        for (const btn of this._buttons) {
            if (btn.destroy) btn.destroy();
        }
        for (const btn of this._dirButtons) {
            if (btn.destroy) btn.destroy();
        }
        this._buttons = [];
        this._dirButtons = [];
        this._activeTouches = {};
    }

    onPause() {
        if (this._engine && this._engine.getState() === 'playing') {
            this._engine.pause();
            this._paused = true;
            if (this._miniFx) { this._miniFx.pause(); }
        }
    }

    onResume() {
        if (this._engine && this._paused) {
            this._engine.resume();
            this._paused = false;
            if (this._miniFx) { this._miniFx.resume(); }
            // 暂停恢复后 0.3s 屏蔽输入，防止恢复瞬间误操作（文档 3.2.9）
            this._inputBlockUntil = Date.now() + 300;
        }
    }

    update(dt) {
        if (this._paused) return;
        if (this._engine) {
            this._engine.update(dt);

            // 成就统计：累计存活时长（survive_time 成就）
            if (this._engine.getState() === 'playing') {
                this._surviveTime += dt;

                // 模式计时
                if (this._mode === 'timed') {
                    this._modeTimeLeft -= dt;
                    if (this._modeTimeLeft <= 0) {
                        this._modeTimeLeft = 0;
                        this._engine.finishGame('timeUp');
                    }
                } else if (this._mode === 'marathon') {
                    const lines = this._engine.getLines();
                    if (lines >= this._modeTargetLines) {
                        this._engine.finishGame('linesReached');
                    }
                }
            }
        }

        // 更新特效
        if (this._effectRenderer) {
            this._effectRenderer.update(dt);
        }

        // 更新棋盘动态背景特效（星空/气泡/数字雨/樱花/熔岩）
        if (this._boardRenderer) {
            this._boardRenderer.update(dt);
        }
        // 更新全屏背景特效（挂现有 update 通道，不新增渲染循环）
        if (this._bgEffects) { this._bgEffects.update(dt); }
        if (this._miniFx) { this._miniFx.update(dt); }
        this._updateLuckyDraw(dt);
        if (this._confettiFx) { this._confettiFx.update(dt); }
    }
    render(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 先铺深色底（震屏露边时保持深色，不露白）
        ctx.fillStyle = '#0f0f23';
        ctx.fillRect(0, 0, W, H);

        // 高潮特效震屏：整体画面位移（背景特效/棋盘/方块/UI 全部跟随）
        const shake = this._effectRenderer ? this._effectRenderer.getShakeOffset() : null;
        if (shake) {
            ctx.save();
            ctx.translate(shake.x, shake.y);
        }

        // 背景特效
        if (this._bgEffects && this._bgEffects.isEnabled()) {
            this._bgEffects.render(ctx);
        }
        if (!this._engine) {
            if (shake) ctx.restore();
            return;
        }

        // 渲染棋盘
        if (this._boardRenderer) {
            this._boardRenderer.render(ctx, this._engine.getVisibleBoard());
        }

        // 渲染 Ghost Piece
        const ghostRow = this._engine.getGhostRow();
        const current = this._engine.getCurrentPiece();
        if (current && ghostRow >= 0) {
            if (this._pieceRenderer) {
                this._pieceRenderer.renderGhost(
                    ctx, current.type, current.matrix,
                    ghostRow - HIDDEN_ROWS, current.col,
                    this._boardX, this._boardY, this._cellSize
                );
            }
        }

        // 渲染当前方块
        if (current) {
            if (this._pieceRenderer) {
                this._pieceRenderer.renderPiece(
                    ctx, current.type, current.matrix,
                    current.row - HIDDEN_ROWS, current.col,
                    this._boardX, this._boardY, this._cellSize
                );
            }
        }

        // 渲染消行特效
        if (this._effectRenderer) {
            this._effectRenderer.render(ctx);
        }

        // 渲染侧边信息
        this._renderSideInfo(ctx);

        // 渲染方向键
        for (const btn of this._dirButtons) {
            btn.render(ctx);
        }
        for (const btn of this._buttons) {
            btn.render(ctx);
        }
        if (this._miniFx) { this._miniFx.render(ctx); }
        // 暂停遮罩
        if (this._paused) {
            this._renderPauseOverlay(ctx);
        }

        // 复活弹窗（最高层，覆盖暂停遮罩）
        if (this._revivePending) {
            this._renderReviveOverlay(ctx);
        }

        // 摇奖遮罩（最顶层，覆盖复活弹窗）
        if (this._luckyDrawActive) {
            this._renderLuckyDrawOverlay(ctx);
        }
        if (this._confettiFx && this._confettiFx.isActive()) {
            this._confettiFx.render(ctx);
        }

        // 结束震屏位移
        if (shake) {
            ctx.restore();
        }
    }

    // ==================== 布局计算 ====================

    _calculateLayout() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        // 安全区适配（文档 3.2.5）
        const sys = GameGlobal.game.systemInfo || {};
        const statusBarHeight = sys.statusBarHeight || 0;
        const safeArea = sys.safeArea || {};
        const bottomSafe = (safeArea.bottom && H > safeArea.bottom) ? (H - safeArea.bottom) : 0;

        // 侧边信息面板固定宽度
        this._panelWidth = Math.min(90, Math.floor(W * 0.22));

        // 方向键按钮半径
        this._dirBtnRadius = Math.min(28, Math.floor(W * 0.07));
        this._controlBottomPadding = 30 + bottomSafe;
        const controlGap = 20;          // 棋盘与控制区（第一行按钮）之间的间距
        const rowGap = 56;              // 第一行按钮与第二行按钮之间的纵向间距

        // 动态获取胶囊按钮位置，计算顶部边距（刘海屏避免被遮挡）
        let capsuleBottom = 36;  // 默认值
        try {
            const rect = wx.getMenuButtonBoundingClientRect();
            if (rect && rect.bottom) {
                capsuleBottom = rect.bottom;
            }
        } catch (e) {
            // 降级使用默认值
        }
        // 顶部边距取 胶囊按钮底部 与 状态栏+安全区 的较大值
        const topMargin = Math.max(capsuleBottom, statusBarHeight) + 5;  // 底部 + 5px 间距

        // 两行按钮高度：第一行半径 + 行间距 + 第二行半径
        const dirAreaH = this._dirBtnRadius + rowGap + this._dirBtnRadius;
        const leftMargin = 15;
        const panelGap = 10;

        // 棋盘可用高度 = 屏幕高 - 顶部边距 - 棋盘与按钮间距 - 控制区高度 - 底部padding
        const availH = H - topMargin - controlGap - dirAreaH - this._controlBottomPadding;
        // 可用宽度 = 屏幕宽 - 左边距 - 面板宽 - 间距 - 右边距
        const availW = W - leftMargin - this._panelWidth - panelGap - 15;

        // 棋盘 10:20 比例
        const cellByHeight = Math.floor(availH / 20);
        const cellByWidth = Math.floor(availW / 10);
        this._cellSize = Math.min(cellByHeight, cellByWidth);

        const boardW = this._cellSize * 10;
        const boardH = this._cellSize * 20;

        // 棋盘左对齐，右侧留出面板空间
        this._boardX = leftMargin + Math.floor((availW - boardW) / 2);

        // 棋盘顶部紧贴胶囊按钮下方 5px
        this._boardY = topMargin;

        // 第一行按钮顶部 = 棋盘底部 + 20px（精确间距）
        this._firstRowTop = this._boardY + boardH + controlGap;
        this._rowGap = rowGap;

        // 侧边信息栏 X 坐标（棋盘右侧）
        this._sideX = this._boardX + boardW + panelGap;
    }

    // ==================== 引擎初始化 ====================

    _initEngine() {
        this._engine = new TetrisEngine(this._replaySeed);
        this._engine.setMode(this._mode);
    }

    _bindEngineEvents() {
        this._engine.onStateChange((state) => {
            if (state === 'over') {
                const score = this._engine.getScore();
                const level = this._engine.getLevel();
                const lines = this._engine.getLines();
                const stats = this._engine.getStats();
                if (this._audio) {
                    this._audio.playGameOver();
                    this._audio.stopBGM();
                }
                // 记录本地最高分（按模式）
                this._saveBestScore(score, this._mode);

                // 游戏结束幸运摇奖：非挑战时、本局消除行数≥50 时先摇奖（每局仅一次）
                if (!this._challengeLaunch && !this._luckyDrawUsed && lines >= 50) {
                    this._startLuckyDraw();
                    return;
                }

                // 走统一后续流程：看广告复活（经典、每局 1 次、非挑战）或直接进结算
                this._maybeShowReviveOrResult();
            }
        });
        this._engine.onLineClear((lineIndices, count, isTetris, colors, tSpinType, combo) => {
            if (this._bgEffects) {
                this._bgEffects.trigger(isTetris ? 'tetris' : 'lineClear');
            }
            if (this._effectRenderer) {
                // 稀有消行（QUAD / T-Spin）走全屏高潮演出（彩色碎片爆炸）；常规消行保持粒子+闪屏
                if (isTetris || tSpinType) {
                    this._effectRenderer.addClimax(
                        isTetris ? 'tetris' : 'tspin',
                        this._boardX, this._boardY, this._cellSize,
                        {
                            rows: lineIndices,
                            colors: colors,
                            combo: combo || 0,
                        }
                    );
                } else {
                    this._effectRenderer.addLineClear(
                        lineIndices, this._boardX, this._boardY, this._cellSize,
                        { colors, isTetris, tSpinType }
                    );
                }
                // 得分飘字（QUAD/T-Spin 金色、常规消行白色；小字不挡棋盘）
                const popY = this._boardY + (lineIndices[0] || 0) * this._cellSize;
                const popText = this._comboText(count, isTetris, tSpinType, combo);
                this._effectRenderer.addScorePopup(
                    this._boardX + this._cellSize * 5, popY, popText,
                    isTetris ? '#FFD700' : (tSpinType ? '#FFD700' : '#ffffff')
                );
            }
            // 震动反馈（文档 3.3.3）
            this._vibrateForClear(count, isTetris, tSpinType);
            // 音效（文档 3.3.4）
            if (this._audio) {
                if (isTetris) {
                    this._audio.playTetris();
                } else if (tSpinType) {
                    this._audio.playTSpinClear(count);
                } else {
                    this._audio.playLineClear(count);
                }
            }
            // 成就统计：消行 / T-Spin
            achievementManager.reportLineClear(count);
            if (tSpinType) {
                achievementManager.reportTSpin(count);
            }
            // 经济系统：发放消行金币（单消1/双消2/三消3/四消5，T-Spin 加成 full+2/mini+1，受每日上限约束）
            this._coinEarned += coinManager.rewardLineClear(count, tSpinType);
        });

        this._engine.onPieceLock((info) => {
            // 落地波纹（文档 3.3.5）
            if (this._effectRenderer) {
                const current = this._engine.getCurrentPiece();
                this._effectRenderer.addLandRipple(
                    this._boardX, this._boardY, this._cellSize,
                    current || info, !!info.hardDrop
                );
            }
            // 落地音效（震动预算已留给按键确认，落地改为纯声音反馈）
            if (this._audio) {
                if (info.hardDrop) {
                    this._audio.playHardDrop();
                } else {
                    this._audio.playSoftDrop();
                }
            }
            // 硬降路径残影：快速砸落时的淡出方块快照（跟随特效开关，低端机可关闭）
            if (info.hardDrop && this._effectRenderer && this._settings.bgEffects) {
                const landed = this._engine.getCurrentPiece();
                if (typeof this._hardDropStartRow === 'number' && landed && typeof landed.row === 'number') {
                    this._effectRenderer.addDropTrail(
                        this._boardX, this._boardY, this._cellSize,
                        landed, this._hardDropStartRow - HIDDEN_ROWS, landed.row - HIDDEN_ROWS
                    );
                }
            }
            // 成就统计：记录本局已使用方块类型（覆盖 7 种方块可解锁成就）
            if (info && info.type) {
                this._usedPieceTypes[info.type] = true;
            }
        });

        this._engine.onLevelChange((level) => {
            if (this._audio) this._audio.playLevelUp();
        });
    }

    /** 消行飘字文案（英文术语：QUAD/T-SPIN/CLEAR/COMBO，避开"三消/四消"中文表述） */
    _comboText(count, isTetris, tSpinType, combo) {
        let label = '';
        if (isTetris) label = 'QUAD!';
        else if (tSpinType === 'full') label = 'T-SPIN!';
        else if (tSpinType === 'mini') label = 'T-SPIN MINI';
        else label = `CLEAR ×${count}`;
        if (combo && combo > 1) label += `  COMBO×${combo}`;
        return label;
    }

    /** 震动反馈（文档 3.3.3） */
    _vibrateForClear(count, isTetris, tSpinType) {
        if (!this._settings.vibrate) return;
        if (tSpinType) {
            this._safeVibrate('heavy');
            setTimeout(() => this._safeVibrate('medium'), 100);
        } else if (isTetris) {
            this._safeVibrateLong();
        } else if (count >= 3) {
            this._safeVibrate('heavy');
        } else if (count === 2) {
            this._safeVibrate('medium');
        } else {
            this._safeVibrate('light');
        }
    }

    /** 安全调用 wx.vibrateShort（兼容不支持 type 的设备） */
    _safeVibrate(type) {
        try {
            if (wx.vibrateShort) {
                wx.vibrateShort({ type: type || 'light' });
            }
        } catch (e) {
            try { wx.vibrateShort(); } catch (e2) { /* 忽略 */ }
        }
    }

    /** 安全调用 wx.vibrateLong */
    _safeVibrateLong() {
        try {
            if (wx.vibrateLong) wx.vibrateLong();
        } catch (e) { /* 忽略 */ }
    }

    /**
     * 操作震动反馈
     * 覆盖：左右移动(move)、软降(softDrop)、旋转(rotate)、Hold(hold)、硬降(hardDrop)
     * 节流规则：move/softDrop/rotate/hold 100ms 内最多震一次 light；
     * 硬降为低频重大操作，medium 不节流。
     * @param {string} kind - 'move' | 'softDrop' | 'rotate' | 'hold' | 'hardDrop'
     */
    _vibrateForAction(kind) {
        if (!this._settings.vibrate) return;

        if (kind === 'hardDrop') {
            this._lastActionVibrateTime = Date.now();
            this._safeVibrate('medium');
            return;
        }

        const now = Date.now();
        if (now - this._lastActionVibrateTime < 100) return;
        this._lastActionVibrateTime = now;

        this._safeVibrate('light');
    }

    /** 按模式保存最高分 */
    _saveBestScore(score, mode) {
        const key = 'gc_bestScore_' + (mode || 'classic');
        const prev = wx.getStorageSync(key) || 0;
        if (score > prev) {
            wx.setStorageSync(key, score);
            return true;
        }
        return false;
    }

    /** 获取指定模式最高分 */
    _getBestScore(mode) {
        const key = 'gc_bestScore_' + (mode || 'classic');
        return wx.getStorageSync(key) || 0;
    }

    // ==================== 渲染器初始化 ====================

    _initRenderers() {
        this._boardRenderer = new BoardRenderer(
            this._boardX, this._boardY,
            this._cellSize, 10, 20
        );

        this._pieceRenderer = new PieceRenderer();

        this._effectRenderer = new EffectRenderer();
    }
    _initUI() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        this._buttons = [];
        this._dirButtons = [];

        // ---- 统一按钮参数 ----
        const r = this._dirBtnRadius;       // 方向键半径
        const btnSize = r * 2;              // 按钮直径 = 方向键直径
        const margin = 20;                  // 左右边距
        // ---- 横向等间距计算 ----
        const gap = (W - 2 * margin - 6 * btnSize) / 5;
        // ---- 六个按钮的 Y 坐标 ----
        // ---- 六个按钮的 Y 坐标（从棋盘底部往下推算）----
        // 第一行按钮圆心 Y = 棋盘底部 + 20px + 半径
        const leftRightY = this._firstRowTop + r;
        // 第二行按钮圆心 Y = 第一行 + 行间距
        const downY = leftRightY + this._rowGap;
        this._secondRowBottom = downY + r;

        // ---- 六个按钮横向等间距排列：◀ ▼ ▶ H ⏬ ↻ ----
        // 每个按钮圆心 X = margin + r + i * (btnSize + gap)
        const cx = (i) => margin + r + i * (btnSize + gap);

        // 左键（index 0）— 与 Hold、旋转水平对齐
        this._dirButtons.push(new DPadButton({
            x: cx(0),
            y: leftRightY,
            radius: r,
            direction: 'left',
            color: '#00c6ff',
            onAction: () => this._moveLeft(),
        }));

        // 下键（index 1）— 与硬降水平对齐
        this._dirButtons.push(new DPadButton({
            x: cx(1),
            y: downY,
            radius: r,
            direction: 'down',
            color: '#00c6ff',
            onAction: () => this._softDrop(),
        }));

        // 右键（index 2）— 与 Hold、旋转水平对齐
        this._dirButtons.push(new DPadButton({
            x: cx(2),
            y: leftRightY,
            radius: r,
            direction: 'right',
            color: '#00c6ff',
            onAction: () => this._moveRight(),
        }));

        // Hold 按钮（index 3）— 与下方向键水平对齐
        this._buttons.push(new Button({
            x: cx(3) - btnSize / 2,
            y: downY - btnSize / 2,
            w: btnSize,
            h: btnSize,
            icon: 'hold',
            color: '#f0a000',
            radius: btnSize / 2,
            onClick: () => this._hold(),
        }));

        // 硬降按钮（index 4）— 与下方向键、Hold 水平对齐
        this._buttons.push(new Button({
            x: cx(4) - btnSize / 2,
            y: downY - btnSize / 2,
            w: btnSize,
            h: btnSize,
            icon: 'hardDrop',
            color: '#ff4466',
            radius: btnSize / 2,
            onClick: () => this._hardDrop(),
        }));

        // 旋转按钮（index 5）— 与左右方向键水平对齐
        this._buttons.push(new Button({
            x: cx(5) - btnSize / 2,
            y: leftRightY - btnSize / 2,
            w: btnSize,
            h: btnSize,
            icon: 'rotate',
            color: '#00c6ff',
            radius: btnSize / 2,
            onClick: () => this._rotate(),
        }));

        // 暂停按钮（悬浮在棋盘左上角内侧，避开微信胶囊按钮与侧边信息面板）
        this._buttons.push(new Button({
            x: this._boardX + 8,
            y: this._boardY + 8,
            w: 40,
            h: 40,
            icon: 'pause',
            color: '#14506e',
            radius: 20,
            onClick: () => this._togglePause(),
        }));
    }

    // ==================== 侧边信息渲染 ====================

    _renderSideInfo(ctx) {
        const W = GameGlobal.game.width;
        const x = this._sideX;
        const pw = this._panelWidth;
        const y = this._boardY;
        if (x + pw > W) {
            this._renderTopInfo(ctx);
            return;
        }

        // 面板背景
        const panelH = this._cellSize * 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        this._roundRect(ctx, x - 5, y - 5, pw + 10, panelH + 10, 8);
        ctx.fill();

        let curY = y + 8;

        // 分数
        curY = this._renderInfoItem(ctx, x, curY, pw, '分数', String(this._engine.getScore()), '#00f0f0');

        // 等级
        curY = this._renderInfoItem(ctx, x, curY, pw, '等级', String(this._engine.getLevel()), '#f0a000');

        // 消行
        curY = this._renderInfoItem(ctx, x, curY, pw, '消行', String(this._engine.getLines()), '#00f000');

        if (this._mode === 'timed') {
            const secs = Math.max(0, Math.ceil(this._modeTimeLeft));
            const mm = Math.floor(secs / 60);
            const ss = secs % 60;
            const timeText = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
            curY = this._renderInfoItem(ctx, x, curY, pw, '时间', timeText, '#ff6b6b', 14);
        } else if (this._mode === 'marathon') {
            const remaining = Math.max(0, this._modeTargetLines - this._engine.getLines());
            curY = this._renderInfoItem(ctx, x, curY, pw, '目标', `剩 ${remaining} 行`, '#ff6b6b', 14);
        }

        // 挑战局：侧栏展示目标分与还差（不改操作区布局）
        if (this._hasChallengeTarget()) {
            curY = this._renderChallengeTarget(ctx, x, curY, pw);
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('NEXT', x + 8, curY);
        curY += 18;

        const nextPieces = this._engine.getNextPieces(2);
        if (nextPieces.length > 0 && this._pieceRenderer) {
            const previewSize = Math.min(Math.floor(this._cellSize * 0.55), 18);
            for (let i = 0; i < nextPieces.length; i++) {
                const p = nextPieces[i];
                this._pieceRenderer.renderPreview(
                    ctx, p.type, p.matrix,
                    x + 8, curY, previewSize
                );
                curY += previewSize * 3 + 6;
            }
        }

        // HOLD 预览
        curY += 12;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('HOLD', x + 8, curY);
        curY += 18;

        const holdPiece = this._engine.getHoldPiece();
        if (holdPiece && this._pieceRenderer) {
            const previewSize = Math.min(Math.floor(this._cellSize * 0.55), 18);
            this._pieceRenderer.renderPreview(
                ctx, holdPiece.type, holdPiece.matrix,
                x + 8, curY, previewSize
            );
        }
    }

    _renderInfoItem(ctx, x, y, pw, label, value, valueColor, valueSize) {
        // 标签
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + 8, y);

        // 数值
        ctx.fillStyle = valueColor;
        ctx.font = `bold ${valueSize || 20}px sans-serif`;
        ctx.fillText(value, x + 8, y + 14);

        return y + 44;
    }

    /** 是否展示目标分 HUD（应战局 或 排行榜「挑战」追分局） */
    _hasChallengeTarget() {
        return this._targetScore != null && !isNaN(this._targetScore)
            && (!!this._challengeId || !!this._challengeLaunch);
    }

    /**
     * 挑战目标分侧栏块：目标分 + 还差/已超越
     * @returns {number} 下一项起始 Y
     */
    _renderChallengeTarget(ctx, x, y, pw) {
        const score = this._engine ? this._engine.getScore() : 0;
        const target = this._targetScore;
        const remain = target - score;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('目标', x + 8, y);

        ctx.fillStyle = '#e67e22';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(String(target), x + 8, y + 14);

        ctx.font = '11px sans-serif';
        if (remain > 0) {
            ctx.fillStyle = '#ff6b6b';
            ctx.fillText('还差 ' + remain, x + 8, y + 32);
        } else {
            ctx.fillStyle = '#2ecc71';
            ctx.fillText('已超越', x + 8, y + 32);
        }
        return y + 50;
    }

    _renderTopInfo(ctx) {
        const W = GameGlobal.game.width;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        let line = `分数: ${this._engine.getScore()}  等级: ${this._engine.getLevel()}  消行: ${this._engine.getLines()}`;
        if (this._hasChallengeTarget()) {
            const remain = this._targetScore - this._engine.getScore();
            line += remain > 0
                ? `  目标: ${this._targetScore}  还差${remain}`
                : `  目标: ${this._targetScore}  已超越`;
        }
        ctx.fillText(line, W / 2, 10);
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    // ==================== 暂停遮罩 ====================

    _renderPauseOverlay(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, H);

        // 暂停标题
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('暂停', W / 2, H / 2 - 100);

        // 对局信息（挑战局附带目标分）
        ctx.font = '16px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        let info = this._engine
            ? `分数: ${this._engine.getScore()}   等级: ${this._engine.getLevel()}   消行: ${this._engine.getLines()}`
            : '';
        if (this._engine && this._hasChallengeTarget()) {
            const remain = this._targetScore - this._engine.getScore();
            info += remain > 0
                ? `   目标: ${this._targetScore}（还差${remain}）`
                : `   目标: ${this._targetScore}（已超越）`;
        }
        ctx.fillText(info, W / 2, H / 2 - 50);

        // 继续游戏按钮
        const bw = Math.min(220, W * 0.6);
        const bh = 46;
        const bx = W / 2 - bw / 2;
        const by1 = H / 2;
        this._pauseResumeBtnRect = { x: bx, y: by1, w: bw, h: bh };
        ctx.fillStyle = '#00c6ff';
        this._roundRect(ctx, bx, by1, bw, bh, 12);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('继续游戏', W / 2, by1 + bh / 2);

        // 重新开始按钮
        const byRestart = by1 + bh + 14;
        this._pauseRestartBtnRect = { x: bx, y: byRestart, w: bw, h: bh };
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        this._roundRect(ctx, bx, byRestart, bw, bh, 12);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, bx, byRestart, bw, bh, 12);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('重新开始', W / 2, byRestart + bh / 2);

        // 返回首页按钮
        const by2 = byRestart + bh + 14;
        this._pauseQuitBtnRect = { x: bx, y: by2, w: bw, h: bh };
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        this._roundRect(ctx, bx, by2, bw, bh, 12);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, bx, by2, bw, bh, 12);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('返回首页', W / 2, by2 + bh / 2);
    }

    // ==================== 玩家操作 ====================

    _moveLeft() {
        if (this._engine) {
            const moved = this._engine.moveLeft();
            if (moved && this._recorder) {
                this._recorder.record('left', this._engine.getEngineTime());
            }
            this._vibrateForAction('move');
        }
    }

    _moveRight() {
        if (this._engine) {
            const moved = this._engine.moveRight();
            if (moved && this._recorder) {
                this._recorder.record('right', this._engine.getEngineTime());
            }
            this._vibrateForAction('move');
        }
    }

    _softDrop() {
        if (this._engine) {
            const dropped = this._engine.softDrop();
            if (dropped && this._recorder) {
                this._recorder.record('softDrop', this._engine.getEngineTime());
            }
            this._vibrateForAction('softDrop');
        }
    }

    _hardDrop() {
        if (!this._engine) return;
        const now = Date.now();
        if (now < this._hardDropReadyAt) return;
        if (this._engine.getState() !== 'playing') return;
        // 快照硬降起始行，供 onPieceLock 生成路径残影（落点由引擎 hardDrop 决定）
        const cur = this._engine.getCurrentPiece();
        this._hardDropStartRow = (cur && typeof cur.row === 'number') ? cur.row : null;
        this._engine.hardDrop();
        if (this._recorder) {
            this._recorder.record('hardDrop', this._engine.getEngineTime());
        }
        this._hardDropReadyAt = now + HARD_DROP_COOLDOWN_MS;
        this._vibrateForAction('hardDrop');
    }

    _rotate() {
        if (this._engine) {
            const rotated = this._engine.rotateCW();
            if (rotated && this._recorder) {
                this._recorder.record('rotateCW', this._engine.getEngineTime());
            }
            this._vibrateForAction('rotate');
        }
    }

    _hold() {
        if (this._engine) {
            const held = this._engine.hold();
            if (held && this._recorder) {
                this._recorder.record('hold', this._engine.getEngineTime());
            }
            this._vibrateForAction('hold');
        }
    }
    _togglePause() {
        if (this._paused) {
            this._engine.resume();
            this._paused = false;
        } else {
            this._engine.pause();
            this._paused = true;
        }
    }


    // ==================== 触摸事件处理（多触点） ====================

    /**
     * 触摸开始 — 按触点 ID 独立分发
     * @param {number} touchId - 触点标识符
     * @param {number} x - 触点 X
     * @param {number} y - 触点 Y
     */
    handleTouchStart(touchId, x, y) {
        if (this._luckyDrawActive) { this._handleLuckyDrawTap(x, y); return; }
        // 复活弹窗期间：只响应复活/结束按钮
        if (this._revivePending) {
            if (this._reviveBtnRect && this._hitRect(x, y, this._reviveBtnRect)) {
                this._tryRevive();
            } else if (this._declineBtnRect && this._hitRect(x, y, this._declineBtnRect)) {
                this._declineRevive();
            }
            return;
        }

        if (this._paused) return;

        // 误触保护：输入屏蔽期间忽略所有操作（文档 3.2.9）
        if (Date.now() < this._inputBlockUntil) return;

        // 检查方向键
        for (const btn of this._dirButtons) {
            if (btn.hitTest(x, y)) {
                this._activeTouches[touchId] = 'dir';
                btn.press(touchId);
                return;
            }
        }

        // 检查按钮（按下即触发；标记本次触点已消费，抬手时不再重复触发）
        for (const btn of this._buttons) {
            if (btn.hitTest(x, y)) {
                this._activeTouches[touchId] = 'button';
                this._tapConsumed = true;
                btn.trigger();
                return;
            }
        }
    }

    /**
     * 触摸移动 — 方向键不需要 move 处理（按下即触发，长按连发）
     * @param {number} touchId - 触点标识符
     * @param {number} x - 触点 X
     * @param {number} y - 触点 Y
     */
    handleTouchMove(touchId, x, y) {
        // 方向键和按钮均不需要 move 处理
    }

    /**
     * 触摸结束 — 释放对应控件
     * @param {number} touchId - 触点标识符
     */
    handleTouchEnd(touchId) {
        const target = this._activeTouches[touchId];
        if (target === 'dir') {
            for (const btn of this._dirButtons) {
                btn.release(touchId);
            }
        }
        delete this._activeTouches[touchId];
    }

    /**
     * 点击回调（复活弹窗按钮 / 暂停状态下点击恢复）
     */
    handleTap(x, y) {
        if (this._luckyDrawActive) { this._handleLuckyDrawTap(x, y); return; }
        if (this._revivePending) {
            if (this._reviveBtnRect && this._hitRect(x, y, this._reviveBtnRect)) {
                this._tryRevive();
            } else if (this._declineBtnRect && this._hitRect(x, y, this._declineBtnRect)) {
                this._declineRevive();
            }
            return;
        }
        // 按钮按下即触发，抬手时不再重复触发（否则点暂停按钮会立即恢复）
        if (this._tapConsumed) {
            this._tapConsumed = false;
            return;
        }
        if (this._paused) {
            if (this._pauseResumeBtnRect && this._hitRect(x, y, this._pauseResumeBtnRect)) {
                this._togglePause();
                return;
            }
            if (this._pauseRestartBtnRect && this._hitRect(x, y, this._pauseRestartBtnRect)) {
                this._restartGame();
                return;
            }
            if (this._pauseQuitBtnRect && this._hitRect(x, y, this._pauseQuitBtnRect)) {
                this._quitToHome();
            }
            // 遮罩空白区域不响应，防止双击暂停按钮误恢复
            return;
        }
    }
    // ==================== 幸运摇奖 / 看广告复活 ====================

    /** 游戏结束统一后续：看广告复活（经典/每局 1 次/非挑战）或直接进结算 */
    _maybeShowReviveOrResult() {
        if (this._mode === 'classic' && !this._reviveConsumed && !this._challengeLaunch && isRewardedVideoConfigured() === true) {
            this._revivePending = true;
            return;
        }
        this._goToResult(
            this._engine.getScore(),
            this._engine.getLevel(),
            this._engine.getLines(),
            this._engine.getStats()
        );
    }

    /** 幸运摇奖：经典模式 5% 概率抽中复活大奖，否则金币档 +5/+10/+15 等权 */

    /** 幸运摇奖：进入 idle 等待页（用户手动点「开始摇奖」才开转）；idle 阶段预构建方块序列供滚筒展示，点开始后同一批方块进入滚动 */
    _startLuckyDraw() {
        this._luckyDrawUsed = true;
        this._luckyDrawActive = true;
        this._luckyDrawPhase = 'celebrate';
        this._luckyDrawElapsed = 0;
        this._luckyDrawPrize = null;
        this._buildLuckyDrawReels();
        this._luckyDrawMatchTypes = [];
        this._luckyDrawBtnRect = null;
        this._luckyDrawConfirmRect = null;
        this._luckyDrawGlowT = 0;
        const _W = GameGlobal.game.width;
        const _H = GameGlobal.game.height;
        if (this._confettiFx) {
            this._confettiFx.trigger(_W / 2, _H * 0.45);
        }
    }

    /** 构建摇奖滚筒三列 7 符号序列（每列一个 SYMBOLS 随机排列 + 随机 resultIdx），idle 阶段预展示，开奖时复用同一批方块 */
    _buildLuckyDrawReels() {
        const SYMBOLS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        const reelLen = 7;
        const reels = [];
        for (let i = 0; i < 3; i++) {
            const symbols = SYMBOLS.slice();
            for (let k = symbols.length - 1; k > 0; k--) {
                const j = Math.floor(Math.random() * (k + 1));
                const tmp = symbols[k];
                symbols[k] = symbols[j];
                symbols[j] = tmp;
            }
            reels.push({
                rolling: symbols,
                resultIdx: Math.floor(Math.random() * reelLen),
                scroll: 0,
                totalDist: 0,
                settled: false,
            });
        }
        this._luckyDrawReels = reels;
    }

    /** 开始摇奖：仅在 idle 阶段响应，抽取奖励、把目标符号换到各列 resultIdx 并规划滚动 */
    _beginLuckyDrawRoll() {
        if (this._luckyDrawPhase !== 'idle') return;
        this._luckyDrawPhase = 'rolling';
        this._luckyDrawElapsed = 0;

        if (!this._luckyDrawReels || this._luckyDrawReels.length !== 3) {
            this._buildLuckyDrawReels();
        }

        // 1) 抽等级：r<0.06 三连、r<0.40 二连、否则全不同
        const r = Math.random();
        const tier = r < 0.06 ? 3 : (r < 0.40 ? 2 : 1);

        // 2) 按等级生成 3 个目标符号（对应三列结果行）
        const SYMBOLS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        const targets = [];
        if (tier === 3) {
            const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            targets.push(s, s, s);
        } else if (tier === 2) {
            const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            let other = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            while (other === s) {
                other = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            }
            const diffReel = Math.floor(Math.random() * 3);
            for (let i = 0; i < 3; i++) {
                targets.push(i === diffReel ? other : s);
            }
        } else {
            const shuffled = SYMBOLS.slice();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = shuffled[i];
                shuffled[i] = shuffled[j];
                shuffled[j] = tmp;
            }
            targets.push(shuffled[0], shuffled[1], shuffled[2]);
        }

        // 3) 把目标符号换到各列 resultIdx（每列 7 符号排列中符号唯一，交换即可），idle 展示的同一批方块无缝进入滚动
        const reels = this._luckyDrawReels;
        for (let i = 0; i < reels.length; i++) {
            const symbols = reels[i].rolling;
            const targetSymbol = targets[i];
            const targetIdx = symbols.indexOf(targetSymbol);
            const resultIdx = reels[i].resultIdx;
            symbols[targetIdx] = symbols[resultIdx];
            symbols[resultIdx] = targetSymbol;
        }

        // 4) 奖品映射：三连→经典模式复活 / 20 金币，二连→10 金币，全不同→5 金币
        if (tier === 3) {
            this._luckyDrawPrize = this._mode === 'classic'
                ? { type: 'revive' }
                : { type: 'gc_coins', amount: 20 };
        } else if (tier === 2) {
            this._luckyDrawPrize = { type: 'gc_coins', amount: 10 };
        } else {
            this._luckyDrawPrize = { type: 'gc_coins', amount: 5 };
        }

        // 5) 匹配组符号（出现次数≥2）去重写入，result 阶段描金高亮
        const countMap = {};
        for (const s of targets) {
            countMap[s] = (countMap[s] || 0) + 1;
        }
        this._luckyDrawMatchTypes = Object.keys(countMap).filter((s) => countMap[s] >= 2);

        // 6) 滚动规划：共享缓起/缓停曲线，每列独立目标距离形成逐列停定节奏
        const cellH = 84;
        const reelLen = 7;
        const minDist = 3 * reelLen * cellH;
        const t1 = 0.35;
        const t3 = 2.0;
        const vmax = 1100;
        const distAccel = 0.5 * vmax * t1;
        const distDecel = vmax * t3 / 3;

        for (let i = 0; i < reels.length; i++) {
            const target = minDist + ((reelLen - reels[i].resultIdx) % reelLen) * cellH;
            const constDist = Math.max(0, target - distAccel - distDecel);
            reels[i].constDist = constDist;
            reels[i].totalDist = distAccel + constDist + distDecel;
        }

        this._luckyDrawT1 = t1;
        this._luckyDrawT3 = t3;
        this._luckyDrawVmax = vmax;
    }

    /** 摇奖滚动：按速度曲线积分滚动（缓起→匀速→缓停），位移到目标即定格进入 result 停留展示 */
    _updateLuckyDraw(dt) {
        if (!this._luckyDrawActive) return;
        if (this._luckyDrawPhase === 'celebrate') {
            this._luckyDrawElapsed += dt;
            if (this._luckyDrawElapsed >= 1.2) {
                this._luckyDrawPhase = 'idle';
                this._luckyDrawElapsed = 0;
            }
            return;
        }
        if (this._luckyDrawPhase === 'result') return;
        if (this._luckyDrawPhase !== 'rolling') return;
        this._luckyDrawElapsed += dt;
        const t = this._luckyDrawElapsed;
        const t1 = this._luckyDrawT1;
        const t3 = this._luckyDrawT3;
        const vmax = this._luckyDrawVmax;

        for (const reel of this._luckyDrawReels) {
            if (reel.settled) continue;
            const tConstEnd = t1 + reel.constDist / vmax;

            let v;
            if (t < t1) {
                v = vmax * (t / t1);
            } else if (t < tConstEnd) {
                v = vmax;
            } else {
                v = Math.max(0, vmax * (1 - (t - tConstEnd) / t3) ** 2);
            }

            reel.scroll += v * dt;
            if (reel.scroll >= reel.totalDist) {
                reel.scroll = reel.totalDist;
                reel.settled = true;
            } else if (t >= tConstEnd + t3) {
                // 减速结束兜底：速度已归零，离散积分误差致 scroll 未达 totalDist 时强制定格
                reel.scroll = reel.totalDist;
                reel.settled = true;
            }
        }

        if (this._luckyDrawReels.every((reel) => reel.settled)) {
            this._luckyDrawPhase = 'result';
            const _W = GameGlobal.game.width;
            const _H = GameGlobal.game.height;
            if (this._confettiFx) {
                this._confettiFx.trigger(_W / 2, _H * 0.45);
            }
            if (this._audio) {
                this._audio.playClick();
            }
            if (this._settings.vibrate && wx.vibrateShort) {
                wx.vibrateShort({ type: 'light' });
            }
        }
    }

    /** 摇奖页按钮点击分发：idle 点「开始摇奖」开转，result 点「确定领取」结算，其余点击忽略 */
    _handleLuckyDrawTap(x, y) {
        if (this._luckyDrawPhase === 'idle') {
            if (this._luckyDrawBtnRect && this._hitRect(x, y, this._luckyDrawBtnRect)) {
                this._beginLuckyDrawRoll();
            }
            return;
        }
        if (this._luckyDrawPhase === 'result') {
            if (this._luckyDrawConfirmRect && this._hitRect(x, y, this._luckyDrawConfirmRect)) {
                this._finishLuckyDraw();
            }
        }
    }

    /** 结算摇奖：result 阶段确认领取后关闭，复活大奖原地续玩，金币档入账后走统一后续 */
    _finishLuckyDraw() {
        if (this._luckyDrawPhase !== 'result') return;
        this._luckyDrawActive = false;
        if (this._luckyDrawPrize && this._luckyDrawPrize.type === 'revive') {
            // 复活大奖：原地续玩，不消耗广告复活次数、不置 _reviveConsumed
            this._engine.revive();
            // _luckyDrawUsed 保持 true，防止再次摇奖
        } else {
            // 金币档：即时入账（不计日上限）
            if (this._luckyDrawPrize) {
                coinManager.rewardAdBonus(this._luckyDrawPrize.amount);
                this._coinEarned += this._luckyDrawPrize.amount;
            }
            this._maybeShowReviveOrResult();
        }
    }
    /** 摇奖遮罩渲染 */
    _renderLuckyDrawOverlay(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // celebrate：金色恭喜标题 + 副文案，期间不渲染三列窗口与按钮（点击不响应）
        if (this._luckyDrawPhase === 'celebrate') {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText('恭喜获得幸运卷轴！', W / 2, H / 2 - 60);
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px sans-serif';
            ctx.fillText('即将进入摇奖…', W / 2, H / 2 + 10);
            this._luckyDrawBtnRect = null;
            return;
        }
        // 居中标题
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('幸运卷轴', W / 2, H / 2 - 165);

        // 三列老虎机窗口参数：每列可视 3 行（中间行为结果参考行）
        const cellH = 84;
        const winH = cellH * 3;
        const reelW = 76;
        const gap = 8;
        const winW = 3 * reelW + 2 * gap;
        const winLeft = W / 2 - winW / 2;
        const winTop = H / 2 - winH / 2 - 8;
        const centerY = winTop + cellH;
        const cellW = cellH * 0.86;

        // 深色圆角底板 + 金色描边
        ctx.fillStyle = 'rgba(10, 12, 30, 0.92)';
        this._roundRect(ctx, winLeft, winTop, winW, winH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.lineWidth = 2;
        this._roundRect(ctx, winLeft, winTop, winW, winH, 12);
        ctx.stroke();

        // idle / rolling / result：每列按各自 scroll 裁剪绘制窗口上下各溢出 1 格。
        // idle 阶段 scroll=0，直接展示预构建的彩色方块序列（老虎机语义），
        // 点「开始摇奖」后同一批方块无缝进入滚动。
        for (let i = 0; i < 3; i++) {
            const reel = this._luckyDrawReels[i];
            if (!reel || reel.rolling.length === 0) continue;
            const colLeft = winLeft + i * (reelW + gap);
            const blockX = colLeft + (reelW - cellW) / 2;
            const len = reel.rolling.length;

            ctx.save();
            ctx.beginPath();
            ctx.rect(colLeft, winTop, reelW, winH);
            ctx.clip();

            const firstK = Math.floor((winTop - cellH - centerY - reel.scroll) / cellH);
            for (let k = firstK; k <= firstK + 5; k++) {
                const sy = k * cellH + reel.scroll + centerY;
                const idx = ((k % len) + len) % len;
                const type = reel.rolling[idx];
                this._drawReelBlock(ctx, blockX, sy, cellW, cellH, type);
            }

            ctx.restore();
        }
        // 中间判定行金色矩形描边框（静态不闪动，绘制在所有方块之上）
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.lineWidth = 2.5;
        this._roundRect(ctx, winLeft - 4, winTop + cellH - 4, winW + 8, cellH + 8, 12);
        ctx.stroke();

        // idle：方块序列静止展示，绘制「开始摇奖」按钮
        if (this._luckyDrawPhase === 'idle') {
            this._luckyDrawBtnRect = this._drawLuckyDrawButton(ctx, '开始摇奖', H / 2 + 205);
            return;
        }

        // result：奖品文案 + 确定领取按钮
        if (this._luckyDrawPhase === 'result') {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 22px sans-serif';
            const text = this._luckyDrawPrize.type === 'revive'
                ? '三连大奖！幸运复活！'
                : '+' + this._luckyDrawPrize.amount + ' 金币';
            ctx.fillText(text, W / 2, H / 2 + 149);
            this._luckyDrawConfirmRect = this._drawLuckyDrawButton(ctx, '确定领取', H / 2 + 205);
        }
    }
    /** 摇奖滚筒方块：扁平简约风格，背景块暗色统一无立体，七种方块形状彩色且小方块等尺寸，result 中奖格外扩金色静态细框 */
    _drawReelBlock(ctx, x, y, w, h, type) {
        const color = 'rgba(80, 85, 120, 0.5)';
        // 方块主体（圆角矩形，半径与滚筒窗口一致）
        ctx.fillStyle = color;
        this._roundRect(ctx, x, y, w, h, 12);
        ctx.fill();

        // 绘制方块形状（彩色等尺寸小方块，白色细描边，居中）
        const shape = (PIECES[type] && PIECES[type].shapes && PIECES[type].shapes[0]) || null;
        if (shape) {
            const rows = shape.length;
            const cols = shape[0].length;
            const cell = Math.floor(Math.min(w, h) * 0.20);
            const gap = Math.max(1, Math.floor(cell * 0.2));
            const ox = x + (w - (cols * cell + (cols - 1) * gap)) / 2;
            const oy = y + (h - (rows * cell + (rows - 1) * gap)) / 2;
            ctx.fillStyle = (PIECE_COLORS[type] || '#888888');
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (shape[r][c] === 1) {
                        const bx = ox + c * (cell + gap);
                        const by = oy + r * (cell + gap);
                        ctx.fillRect(bx, by, cell, cell);
                        ctx.strokeRect(bx + 0.5, by + 0.5, cell - 1, cell - 1);
                    }
                }
            }
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold ' + (h * 0.42) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(type, x + w / 2, y + h / 2);
        }
    }

    /** 金色圆角按钮（摇奖页用），返回 {x,y,w,h} 命中区 */
    _drawLuckyDrawButton(ctx, label, cy) {
        const W = GameGlobal.game.width;
        const bw = Math.min(220, W * 0.6);
        const bh = 50;
        const bx = W / 2 - bw / 2;
        const by = cy - bh / 2;

        ctx.fillStyle = '#f0a000';
        this._roundRect(ctx, bx, by, bw, bh, 12);
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, bx, by, bw, bh, 12);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(label, W / 2, cy);

        return { x: bx, y: by, w: bw, h: bh };
    }

    _goToResult(score, level, lines, stats) {
        // 成就系统：上报本局结果（仅一次），解锁成就并发放金币
        if (!this._achievementReported) {
            this._achievementReported = true;
            try {
                achievementManager.reportGameResult({
                    score, level, lines, mode: this._mode, stats,
                    duration: Math.floor(this._surviveTime || 0),
                });
                // 仅统计标准 7 种方块，特殊方块（C/D/P/M）不参与「用遍所有方块」成就判定
                const STANDARD_PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
                const standardUsedCount = Object.keys(this._usedPieceTypes)
                    .filter((t) => STANDARD_PIECE_TYPES.indexOf(t) >= 0).length;
                if (standardUsedCount >= 7) {
                    achievementManager.reportUseAllPieces();
                }
            } catch (e) {
                // 忽略成就上报异常
            }
        }
        // 生成回放数据并持久化（仅当本局录入了有效输入）
        const replayData = this._recorder ? this._recorder.finish({ score, level, lines, mode: this._mode, duration: Math.floor(this._surviveTime || 0) }) : null;
        const replayKey = (replayData && replayData.inputs && replayData.inputs.length > 0) ? 'gc_replay_last' : '';
        if (replayKey) {
            this._recorder.save(replayKey, replayData);
        }
        setTimeout(() => {
            if (this._challengeLaunch) {
                GameGlobal.game.sceneManager.switchTo('challengeResult', {
                    score, level, lines, mode: this._mode, stats,
                    coinEarned: this._coinEarned || 0,
                    replayKey,
                    challengeTargetName: this._challengeTargetName || '',
                    challengeTargetAvatar: this._challengeTargetAvatar || '',
                    challengeTargetOpenid: this._challengeTargetOpenid || '',
                });
            } else {
                GameGlobal.game.sceneManager.switchTo('result', {
                    score, level, lines, mode: this._mode, stats,
                    coinEarned: this._coinEarned || 0,
                    challengeId: this._challengeId || '',
                    targetScore: this._targetScore,
                    replayKey,
                });
            }
        }, 800);
    }
    _tryRevive() {
        if (this._reviveConsumed || !this._revivePending) return;
        this._revivePending = false;
        adManager.showRewardedVideo()
            .then(() => {
                this._reviveConsumed = true;
                const ok = this._engine.revive();
                if (!ok) {
                    this._goToResult(
                        this._engine.getScore(),
                        this._engine.getLevel(),
                        this._engine.getLines(),
                        this._engine.getStats()
                    );
                }
            })
            .catch(() => {
                this._goToResult(
                    this._engine.getScore(),
                    this._engine.getLevel(),
                    this._engine.getLines(),
                    this._engine.getStats()
                );
            });
    }

    _declineRevive() {
        this._revivePending = false;
        this._goToResult(
            this._engine.getScore(),
            this._engine.getLevel(),
            this._engine.getLines(),
            this._engine.getStats()
        );
    }

    /**
     * 暂停菜单：退出对局返回首页（直接切场景，不触发 finishGame/结算流程）
     */
    _quitToHome() {
        this._paused = false;
        this._revivePending = false;
        this._tapConsumed = false;
        GameGlobal.game.sceneManager.switchTo('home');
    }

    /**
     * 暂停菜单：重新开始本局（保留当前模式与挑战参数，完整重置引擎与全部本局状态）
     */
    _restartGame() {
        // 清理当前局资源（与 onExit 一致，避免特效/按钮重复创建）
        if (this._bgEffects) { this._bgEffects.destroy(); this._bgEffects = null; }
        if (this._miniFx) { this._miniFx.destroy(); this._miniFx = null; }
        if (this._confettiFx) { this._confettiFx.destroy(); this._confettiFx = null; }
        for (const btn of this._buttons) {
            if (btn.destroy) btn.destroy();
        }
        for (const btn of this._dirButtons) {
            if (btn.destroy) btn.destroy();
        }
        this._buttons = [];
        this._dirButtons = [];
        this._activeTouches = {};
        // 停止旧音频，避免重启后旧 BGM 继续播放（onEnter 会创建新实例）
        if (this._audio) { this._audio.destroy(); this._audio = null; }
        // 触点消费标记复位（与 _quitToHome 一致），防止恢复瞬间误吞点击
        this._tapConsumed = false;
        // 以相同参数重新进入本场景，复用完整开局初始化流程
        this.onEnter(this._params);
    }

    _hitRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    _renderReviveOverlay(ctx) {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('游戏结束', W / 2, H / 2 - 96);

        ctx.font = '15px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText('看一段广告即可复活继续挑战', W / 2, H / 2 - 56);

        const bw = Math.min(240, W - 60);
        const bh = 56;
        const bx = W / 2 - bw / 2;
        const by = H / 2 - 10;

        // 复活按钮
        this._reviveBtnRect = { x: bx, y: by, w: bw, h: bh };
        this._roundRect(ctx, bx, by, bw, bh, 12);
        ctx.fillStyle = '#2ecc71';
        ctx.fill();
        const reviveText = '看广告复活';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#ffffff';
        const rtw = ctx.measureText(reviveText).width;
        const rStartX = W / 2 - (rtw + 26) / 2;
        IconRenderer.draw(ctx, 'tv', rStartX + 11, by + bh / 2, 22, '#ffffff');
        // IconRenderer.draw 内部 save/restore 会把 fillStyle 还原为背景色，必须重新置白再绘制文字
        ctx.fillStyle = '#ffffff';
        ctx.fillText(reviveText, rStartX + 26 + rtw / 2, by + bh / 2);

        // 结束按钮（实底背景 + 描边，避免透明不可见）
        const by2 = by + bh + 16;
        this._declineBtnRect = { x: bx, y: by2, w: bw, h: bh };
        this._roundRect(ctx, bx, by2, bw, bh, 12);
        ctx.fillStyle = '#3a3a55';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, bx, by2, bw, bh, 12);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px sans-serif';
        ctx.fillText('结束游戏', W / 2, by2 + bh / 2);
    }
}

module.exports = GameScene;
