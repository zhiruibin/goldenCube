/**
 * openDataContext - 开放数据域：好友排行榜
 * 职责：拉取好友分数（wx.getFriendCloudStorage）、渲染到 sharedCanvas、
 *       接收主域触摸消息实现滚动、在主域请求时重绘、上报本用户分数
 *
 * 运行环境说明：
 *   - 本文件运行在独立的开放数据域 JS 上下文，只能使用受限的 wx API
 *   - 主域通过 wx.getOpenDataContext().postMessage() 发送消息
 *   - 本域通过 wx.onMessage() 接收，并把结果绘制到 wx.getSharedCanvas()
 *   - 开放数据域不能直接监听触摸事件，滚动由主域捕获后转发
 *
 * 渲染链路（关键，勿改）：
 *   - sharedCanvas 的宽高在真机上不可靠地支持设置（默认固定为屏幕尺寸），
 *     因此本文件【不修改 sharedCanvas 尺寸】，始终使用默认宽高绘制；
 *   - 主域把好友榜在主屏的逻辑位置 (x, y)、尺寸 (width, height) 与
 *     屏幕逻辑宽高 (screenW, screenH) 传进来；
 *   - 本域按 sharedCanvas 实际宽度/高度 与 屏幕逻辑宽高之比做均匀缩放
 *     （逻辑尺寸 → 单位矩阵；物理尺寸 → scale(dpr)），绘制坐标使用屏幕逻辑坐标；
 *   - 主域按同一比例做 1:1 拷贝 sharedCanvas（见 rank-scene.js），
 *     任何机型下都清晰、不变形、不放大、不遮挡。
 */


const sharedCanvas = wx.getSharedCanvas();
const ctx = sharedCanvas.getContext('2d');

/** 列表布局常量（行高、头部预留、左右内边距、前三名奖牌） */
const ITEM_H = 56;
const HEADER_H = 12;
/** 列表底部粘性提示条（距上一名） */
const FOOTER_H = 30;
const PADDING_X = 12;
const MEDAL_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

let mode = 'stage';
/** 好友榜在主屏的逻辑位置与尺寸（由主域传入，屏幕逻辑坐标） */
let x0 = 0;
let y0 = 0;
let width = 320;
let height = 400;
/** 屏幕逻辑宽高（由主域传入，用于把 sharedCanvas 实际尺寸换算成绘制缩放） */
let screenW = 375;
let screenH = 667;
let rankList = [];
/** 当前用户 openid（开放域 getUserInfo selfOpenId） */
let selfOpenId = '';




/** 好友榜存储键前缀（与 utils/cloud-config.js FRIEND_RANK_KEY 一致） */
const KEY_PREFIX = 'gc_rank_score_';

let loading = false;
let fetchFailed = false;
let lastError = '';
let scrollY = 0;
let maxScroll = 0;

/** 触摸状态 */
let touchId = null;
let touchStartX = 0;
let touchStartY = 0;
let isScrolling = false;

function friendKey(m) {
    return KEY_PREFIX + m;
}

/** 解析当前用户 openid，用于「距上一名」与高亮自己 */
function resolveSelf(done) {
    try {
        wx.getUserInfo({
            openIdList: ['selfOpenId'],
            success(res) {
                if (res && res.data && res.data[0] && res.data[0].openid) {
                    selfOpenId = res.data[0].openid;
                }
                if (typeof done === 'function') done();
            },
            fail() {
                if (typeof done === 'function') done();
            },
        });
    } catch (e) {
        if (typeof done === 'function') done();
    }
}

/** 上报本用户分数到好友榜（开放数据域专属 API） */
function submitScore(m, score) {
    try {
        const key = friendKey(m);
        const value = JSON.stringify({
            wxgame: { score: Math.floor(Number(score) || 0), updateTime: Date.now() },
        });
        wx.setUserCloudStorage({
            KVDataList: [{ key, value }],
            fail: () => {},
        });
    } catch (e) {
        // 忽略
    }
}

/** 同模式缓存与请求节流，避免切换经典/限时/马拉松时触发 frequency limit */
const FETCH_COOLDOWN_MS = 2800;
const CACHE_TTL_MS = 90 * 1000;
/** @type {Object.<string, {list:Array, ts:number}>} */
const rankCache = {};
let lastNetworkFetchAt = 0;
let fetchTimer = null;
let fetching = false;

/** 可见列表高度（去掉底部粘性提示） */
function listBodyH() {
  return Math.max(0, height - FOOTER_H);
}

function applyList(list, failed, errText) {
  rankList = Array.isArray(list) ? list : [];
  fetchFailed = !!failed;
  lastError = errText || '';
  loading = false;
  maxScroll = Math.max(0, rankList.length * ITEM_H - (listBodyH() - HEADER_H));
  scrollY = Math.min(scrollY, maxScroll);
  draw();
}

/** 拉取好友分数并重绘（带缓存 + 冷却，防止 frequency limit） */
function loadRank() {
  const m = mode;
  const now = Date.now();
  const cached = rankCache[m];

  // 缓存未过期：直接展示，不打接口
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    applyList(cached.list, false, '');
    return;
  }

  const wait = Math.max(0, FETCH_COOLDOWN_MS - (now - lastNetworkFetchAt));
  if (wait > 0 || fetching) {
    // 冷却中：有旧缓存先显示，否则 loading；到期再拉
    if (cached) {
      applyList(cached.list, false, '');
    } else {
      loading = true;
      draw();
    }
    if (fetchTimer) {
      clearTimeout(fetchTimer);
    }
    fetchTimer = setTimeout(function () {
      fetchTimer = null;
      if (mode === m) {
        loadRankFromNetwork(m);
      }
    }, Math.max(wait, 80));
    return;
  }

  loadRankFromNetwork(m);
}

function loadRankFromNetwork(requestMode) {
  const m = requestMode || mode;
  if (fetching) {
    return;
  }
  fetching = true;
  loading = true;
  draw();
  lastNetworkFetchAt = Date.now();

  const afterFetch = function () {
    fetching = false;
    loading = false;
    maxScroll = Math.max(0, rankList.length * ITEM_H - (listBodyH() - HEADER_H));
    scrollY = Math.min(scrollY, maxScroll);
    draw();
  };

  try {
    wx.getFriendCloudStorage({
      keyList: [friendKey(m)],
      success: (res) => {
        // 若用户已切走模式，仍写入对应缓存，当前屏只在模式匹配时刷新
        const users = res.data || [];
        const list = users
          .map((u) => {
            let score = 0;
            try {
              const kv = (u.KVDataList || []).find((k) => k.key === friendKey(m));
              if (kv && kv.value) {
                const parsed = JSON.parse(kv.value);
                score = (parsed.wxgame && parsed.wxgame.score) || 0;
              }
            } catch (e) {
              score = 0;
            }
            return {
              openid: u.openid || '',
              nickname: u.nickname || '玩家',
              avatarUrl: u.avatarUrl || '',
              score: score,
            };
          })
          .filter((u) => u.score > 0)
          .sort((a, b) => b.score - a.score);

        rankCache[m] = { list: list, ts: Date.now() };
        fetchFailed = false;
        lastError = '';
        if (mode === m) {
          rankList = list;
          resolveSelf(afterFetch);
        } else {
          fetching = false;
        }
      },
      fail: (err) => {
        const errMsg = (err && err.errMsg) || 'unknown';
        console.error('[friendRank] getFriendCloudStorage fail:', err);
        let tip = errMsg;
        if (err && (err.errno === 1026 || err.errno === 1025
          || (errMsg.indexOf('announce your privacy') >= 0))) {
          tip = '隐私未生效，请同意隐私协议后重试';
        } else if (errMsg.indexOf('frequency limit') >= 0 || errMsg.indexOf('slowdown') >= 0) {
          tip = '请求太快，请稍后再切换模式';
        }
        // 频控失败：优先回退缓存
        const cached = rankCache[m];
        if (cached && cached.list) {
          if (mode === m) {
            rankList = cached.list;
            fetchFailed = false;
            lastError = tip;
            resolveSelf(afterFetch);
          } else {
            fetching = false;
          }
          return;
        }
        if (mode === m) {
          lastError = tip;
          fetchFailed = true;
          rankList = [];
          maxScroll = 0;
          scrollY = 0;
          afterFetch();
        } else {
          fetching = false;
        }
      },
    });
  } catch (e) {
    fetching = false;
    lastError = (e && e.errMsg) || String(e);
    console.error('[friendRank] loadRank error:', e);
    fetchFailed = true;
    rankList = [];
    maxScroll = 0;
    afterFetch();
  }
}

/** 绘制一帧（屏幕逻辑坐标，列表左上角为 (x0, y0)） */
function draw() {
    // 清空整张 sharedCanvas（其余区域保持透明，露出主域背景）
    ctx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);

    // 列表背景（与主域列表底色一致，仅填充列表区域）
    ctx.fillStyle = 'rgba(15, 15, 35, 0.9)';
    ctx.fillRect(x0, y0, width, height);

    if (loading) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('好友数据加载中...', x0 + width / 2, y0 + height / 2);
        return;
    }

    if (rankList.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const msg = fetchFailed
            ? '好友数据获取失败，请重试'
            : '该模式暂无好友成绩，去挑战一下吧';
        ctx.fillText(msg, x0 + width / 2, y0 + height / 2);
        if (fetchFailed && lastError) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(lastError, x0 + width / 2, y0 + height / 2 + 20);
        }
        return;
    }

    const bodyBottom = y0 + listBodyH();
    const startY = y0 + HEADER_H - scrollY;

    for (let i = 0; i < rankList.length; i++) {
        const item = rankList[i];
        const y = startY + i * ITEM_H;
        if (y + ITEM_H < y0 || y > bodyBottom) continue;

        const isMe = selfOpenId && item.openid === selfOpenId;

        // 行背景（自己行略暖高亮）
        ctx.fillStyle = isMe
            ? 'rgba(255, 200, 87, 0.14)'
            : (i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)');
        _roundRect(ctx, x0 + PADDING_X, y + 2, width - PADDING_X * 2, ITEM_H - 4, 8);
        ctx.fill();

        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#ffffff';
        if (i < 3) {
            _drawMedal(ctx, x0 + PADDING_X + 22, y + ITEM_H / 2 - 1, 24, MEDAL_COLORS[i]);
        } else {
            ctx.fillText(String(i + 1), x0 + PADDING_X + 22, y + ITEM_H / 2 - 1);
        }

        // 头像（异步加载，失败不影响文字）
        _drawAvatar(item.avatarUrl, x0 + PADDING_X + 50, y + ITEM_H / 2 - 16, 32);

        // 昵称（超出宽度裁剪到分数左侧）
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        const nameX = x0 + PADDING_X + 90;
        const scoreRight = x0 + width - PADDING_X - 10;
        const nameMax = scoreRight - nameX - 16;
        _fillClippedText(item.nickname, nameX, y + ITEM_H / 2 - 1, nameMax);

        // 通关数（好友 KV 存复合编码分）
        const CLEARED_MUL = 1e10;
        const cleared = Math.floor(Math.max(0, Number(item.score) || 0) / CLEARED_MUL);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFC857';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(cleared + ' 关', scoreRight, y + ITEM_H / 2 - 1);
    }

    // 底部粘性：「距上一名还差」
    _drawGapFooter();
}

/** 列表底部：距上一名 / 当前第一 */
function _drawGapFooter() {
    const fy = y0 + height - FOOTER_H;
    ctx.fillStyle = 'rgba(20, 24, 40, 0.95)';
    ctx.fillRect(x0, fy, width, FOOTER_H);

    ctx.strokeStyle = 'rgba(255, 200, 87, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + PADDING_X, fy + 0.5);
    ctx.lineTo(x0 + width - PADDING_X, fy + 0.5);
    ctx.stroke();

    let tip = '打一局上榜，再来比一把';
    if (selfOpenId && rankList.length > 0) {
        let myIdx = -1;
        for (let i = 0; i < rankList.length; i++) {
            if (rankList[i].openid === selfOpenId) {
                myIdx = i;
                break;
            }
        }
        if (myIdx === 0) {
            tip = '当前第一 · 继续保持';
        } else if (myIdx > 0) {
            const MUL = 1e10;
            const ahead = Math.floor(rankList[myIdx - 1].score / MUL);
            const mine = Math.floor(rankList[myIdx].score / MUL);
            tip = ahead > mine
                ? ('距上一名还差 ' + (ahead - mine) + ' 关')
                : '同关数 · 比消行效率';
        } else {
            tip = '还没上榜 · 去通关吧';
        }
    }

    ctx.fillStyle = 'rgba(255, 236, 210, 0.85)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tip, x0 + width / 2, fy + FOOTER_H / 2);
}

/** 绘制圆角头像（异步，加载后重绘当前帧） */
function _drawAvatar(url, x, y, size) {
    if (!url) return;
    try {
        const img = wx.createImage();
        img.onload = () => {
            ctx.save();
            _roundRect(ctx, x, y, size, size, size / 2);
            ctx.clip();
            ctx.drawImage(img, x, y, size, size);
            ctx.restore();
        };
        img.src = url;
    } catch (e) {
        // 忽略头像加载异常
    }
}

/** 绘制矢量奖牌（金/银/铜，开放数据域内联实现，不依赖主域模块） */
function _drawMedal(c, x, y, size, color) {
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = Math.max(1, Math.round(size * 0.08));
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x - size * 0.22, y - size * 0.38);
    c.lineTo(x - size * 0.3, y + size * 0.12);
    c.quadraticCurveTo(x, y + size * 0.04, x + size * 0.3, y + size * 0.12);
    c.lineTo(x + size * 0.22, y - size * 0.38);
    c.stroke();
    c.beginPath();
    c.arc(x, y + size * 0.1, size * 0.3, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(x, y + size * 0.1, size * 0.12, 0, Math.PI * 2);
    c.stroke();
    c.restore();
}

/** 绘制截断文本（超出 maxWidth 裁剪） */
function _fillClippedText(text, x, y, maxWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y - 20, maxWidth, 40);
    ctx.clip();
    ctx.fillText(String(text || ''), x, y);
    ctx.restore();
}

/** 圆角矩形路径 */
function _roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
}

/** 接收主域消息 */
wx.onMessage((msg) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.action) {
        case 'init':
        case 'render': {
            const nextMode = msg.mode || 'stage';
            const modeChanged = nextMode !== mode;

            // 列表在主屏的逻辑位置与尺寸（屏幕逻辑坐标）
            x0 = Math.max(0, Math.floor(Number(msg.x) || 0));
            y0 = Math.max(0, Math.floor(Number(msg.y) || 0));
            width = Math.max(1, Math.floor(Number(msg.width) || width));
            height = Math.max(1, Math.floor(Number(msg.height) || height));
            screenW = Math.max(1, Math.floor(Number(msg.screenW) || screenW));
            screenH = Math.max(1, Math.floor(Number(msg.screenH) || screenH));
            const sx = sharedCanvas.width / screenW;
            const sy = sharedCanvas.height / screenH;
            ctx.setTransform(sx, 0, 0, sy, 0, 0);

            mode = nextMode;
            if (modeChanged) {
                scrollY = 0;
            }
            // 仅模式变化或尚无数据时拉榜；纯布局刷新直接重绘，避免连打接口
            if (modeChanged || !rankList.length || fetchFailed) {
                loadRank();
            } else {
                draw();
            }
            break;
        }


        case 'submitScore':
            submitScore(msg.mode || 'stage', msg.score || 0);
            break;

        case 'touchStart':
            touchId = msg.identifier;
            touchStartX = msg.x;
            touchStartY = msg.y;
            isScrolling = false;
            break;

        case 'touchMove':
            if (msg.identifier !== touchId) return;
            {
                const dx = msg.x - touchStartX;
                const dy = msg.y - touchStartY;
                if (!isScrolling) {
                    if (Math.abs(dy) < 12 && Math.abs(dx) < 12) return;
                    isScrolling = true;
                }
                scrollY = Math.max(0, Math.min(maxScroll, scrollY - dy));
                touchStartX = msg.x;
                touchStartY = msg.y;
                draw();
            }
            break;

        case 'touchEnd':
            if (msg.identifier === -1 || msg.identifier === touchId) {
                touchId = null;
                isScrolling = false;
            }
            break;

        case 'reset':
            mode = msg.mode || 'stage';
            scrollY = 0;
            loadRank();
            break;
    }
});
