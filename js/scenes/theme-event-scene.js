/** 中秋专题关卡页：先完成章节式页面，关卡内容后续逐关确定。 */
const { Button } = require('../widgets/button');
const { fillNightBackground } = require('../theme/arcade-night');
const { drawThemeBackground, getThemeImage } = require('../theme/theme-images');
const { roundRectPath } = require('../render/board-tiles');
const IconRenderer = require('../render/icon-renderer');
const themeEventManager = require('../../utils/theme-event-manager');
const midAutumn = require('../../data/mid-autumn-stages');
const themeBadges = require('../../data/theme-badges');

const TITLE = '中秋 · 团团圆圆';
const SUBTITLE = '好时节，愿得年年，常见中秋月';
const SCROLL_BOTTOM_PAD = 42;
const CHAPTERS = [
    {
        title: '上篇 · 月升 · 清辉入梦',
        stages: [
            ['海上生明月', '天涯共此时'],
            ['暮云收尽溢清寒', '银汉无声转玉盘'],
            ['天将今夜月', '一遍洗寰瀛'],
            ['皓魄当空宝镜升', '云间仙籁寂无声'],
            ['无云世界秋三五', '共看蟾盘上海涯'],
            ['中庭地白树栖鸦', '冷露无声湿桂花'],
            ['玉颗珊珊下月轮', '殿前拾得露华新'],
            ['十轮霜影转庭梧', '此夕羁人独向隅'],
            ['此时瞻白兔', '直欲数秋毫'],
            ['目穷淮海满如银', '万道虹光育蚌珍'],
        ],
    },
    {
        title: '下篇 · 月圆 · 天涯共此',
        stages: [
            ['凉风遥夜清秋半', '一望金波照粉田'],
            ['圆魄上寒空', '皆言四海同'],
            ['西北望乡何处是', '东南见月几回圆'],
            ['此夜若无月', '一年虚过秋'],
            ['及至中秋满', '还胜别夜圆'],
            ['转缺霜轮上转迟', '好风偏似送佳期'],
            ['桂魄飞来，光射处', '冷浸一天秋碧'],
            ['一轮秋影转金波', '飞镜又重磨'],
            ['好时节，愿得年年', '常见中秋月'],
            ['但愿人长久', '千里共婵娟'],
        ],
    },
];
CHAPTERS.forEach((chapter, chapterIndex) => {
    chapter.stages = chapter.stages.map((lines, i) => ({
        no: chapterIndex * 10 + i + 1,
        line1: lines[0],
        line2: lines[1],
    }));
});
const STAGES = CHAPTERS.reduce((all, chapter) => all.concat(chapter.stages), []);

// 7×6 微缩剪影；正式关卡确定后可直接替换为实际棋盘布局。
const PREVIEW_SHAPES = [
    ['..###..', '.#####.', '.#####.', '..###..', '.......', '##.####'], // 月出海面
    ['...#...', '..###..', '.#####.', '...#...', '.#####.', '#######'], // 月影
    ['...#...', '.#.#.#.', '..###..', '.#####.', '..###..', '.#.#.#.'], // 桂树
    ['.#...#.', '.##.##.', '..###..', '.#####.', '..#.#..', '.#...#.'], // 玉兔
    ['..###..', '.#####.', '..###..', '...#...', '..###..', '.#####.'], // 酒杯
    ['.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#######'], // 相望
    ['..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'], // 满月
    ['...#...', '..###..', '.#####.', '##.#.##', '.#####.', '#..#..#'], // 故园
    ['.#.#.#.', '#######', '.#.#.#.', '#######', '.#.#.#.', '#######'], // 万家灯火
    ['..###..', '.#####.', '#######', '#######', '.#####.', '..###..'], // 团圆
    ['.......', '#.#.#..', '.#.#.#.', '#.#.#.#', '.#.#.#.', '#######'], // 秋风稻浪
    ['..##...', '.###...', '..##...', '.#####.', '..#..#.', '.#...#.'], // 玉兔
    ['#.....#', '.#...#.', '..###..', '..###..', '.#...#.', '#.....#'],
    ['.......', '.......', '..###..', '.#####.', '..###..', '.......'],
    ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..'],
    ['.......', '..###..', '.#####.', '..###..', '.#...#.', '#.....#'],
    ['#......', '.#..#..', '..####.', '.#####.', '...##..', '..#..#.'], // 桂枝
    ['.#####.', '##...##', '#.....#', '#..#..#', '##...##', '.#####.'], // 月门
    ['#.....#', '.#...#.', '..###..', '.#####.', '#.....#', '#######'],
    ['..###..', '.#####.', '#######', '##.#.##', '#.....#', '#.....#'],
];

class ThemeEventScene {
    constructor() {
        this._params = null;
        this._buttons = [];
        this._cards = [];
        this._event = themeEventManager.getCurrent();
        this._clearedIds = midAutumn.getClearedIds();
        this._badgeOwned = themeBadges.has(midAutumn.BADGE_ID);
        this._toast = '';
        this._toastUntil = 0;
        this._scrollY = 0;
        this._scrollVel = 0;
        this._moveSamples = [];
        this._drag = null;
        this._suppressTap = false;
    }

    onEnter(params) {
        this._params = params || {};
        this._scrollVel = 0;
        this._moveSamples = [];
        this._clearedIds = midAutumn.getClearedIds();
        this._badgeOwned = themeBadges.has(midAutumn.BADGE_ID);
        this._layout();
        themeEventManager.refresh().then((event) => {
            this._event = event;
            try { if (GameGlobal.game.kickLoop) GameGlobal.game.kickLoop(); } catch (e) { /* ignore */ }
        });
    }
    onExit() { this._buttons = []; this._cards = []; this._scrollVel = 0; this._moveSamples = []; }
    onPause() {}
    onResume() {
        this._clearedIds = midAutumn.getClearedIds();
        this._badgeOwned = themeBadges.has(midAutumn.BADGE_ID);
    }
    update(dt) {
        const vel = this._scrollVel || 0;
        if (this._drag || Math.abs(vel) < 24) {
            if (!this._drag) this._scrollVel = 0;
            return;
        }
        const sec = Math.max(0, Math.min(.05, Number(dt) || 0));
        if (sec <= 0) return;
        const next = this._clampScroll(this._scrollY + vel * sec);
        this._scrollY = next;
        const max = this._getMaxScroll();
        if (next <= 0 || next >= max) {
            this._scrollVel = 0;
            return;
        }
        // 指数衰减使不同帧率下的滑动距离保持接近，约每帧保留 91% 速度。
        this._scrollVel = vel * Math.pow(.91, sec * 60);
    }

    _metrics() {
        const W = GameGlobal.game.width;
        const H = GameGlobal.game.height;
        const sys = GameGlobal.game.systemInfo || {};
        const safe = sys.safeArea || {};
        let capsuleBottom = Math.max(Number(sys.statusBarHeight) || 0, Number(safe.top) || 0) + 32;
        try {
            const rect = wx.getMenuButtonBoundingClientRect();
            if (rect && rect.bottom) capsuleBottom = rect.bottom;
        } catch (e) { /* ignore */ }
        const headerY = capsuleBottom + 16;
        const gridTop = headerY + 118;
        const cardsTop = gridTop;
        const side = 14;
        const gapX = 0;
        // 素材上下自带透明留白，使用轻微负间距压缩视觉空档。
        const gapY = -16;
        const bottomInset = safe.bottom && H > safe.bottom ? H - safe.bottom : 0;
        const backW = Math.min(188, Math.round(W * 0.48));
        const image = getThemeImage('mapBtnBack');
        const ratio = image.ready && image.img ? image.img.width / Math.max(1, image.img.height) : 2.23;
        const backH = Math.max(44, Math.round(backW / ratio));
        const backY = H - bottomInset - backH - 28;
        const cardW = W - side * 2;
        // 三种状态共用 3:1 的轮廓，禁止按状态拉伸素材。
        const cardH = Math.round(cardW / 3);
        return { W, H, headerY, gridTop, cardsTop, side, gapX, gapY, cardW, cardH, backW, backH, backY };
    }

    _layout() {
        const m = this._metrics();
        this._cards = STAGES.map((stage, index) => {
            const finale = stage.no === 20;
            const w = m.cardW;
            return {
                stage,
                finale,
                x: m.side,
                y: m.cardsTop + index * (m.cardH + m.gapY),
                w,
                h: m.cardH,
            };
        });
        this._buttons = [new Button({
            x: m.W / 2 - m.backW / 2, y: m.backY, w: m.backW, h: m.backH,
            text: '返回', color: '#5a4534', skin: 'mapBtnBack', layout: 'text',
            labelColor: '#fff8ec', fontScale: 1.05, letterSpacing: 4,
            onClick: () => GameGlobal.game.sceneManager.back(),
        })];
    }

    render(ctx) {
        const m = this._metrics();
        if (!drawThemeBackground(ctx, 'mapMineBg', m.W, m.H)) fillNightBackground(ctx, m.W, m.H);
        else { ctx.fillStyle = 'rgba(16,9,3,.30)'; ctx.fillRect(0, 0, m.W, m.H); }
        this._drawMoonGlow(ctx, m.W - 58, m.headerY + 25);

        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(40,24,10,.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#FFE566'; ctx.font = 'bold 25px sans-serif';
        ctx.fillText(TITLE, 15, m.headerY + 12);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.fillStyle = 'rgba(255,245,218,.86)'; ctx.font = '13px sans-serif';
        ctx.fillText(SUBTITLE, 16, m.headerY + 45);
        this._drawBadgeProgress(ctx, m);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, m.cardsTop - 3, m.W, m.backY - m.cardsTop - 27);
        ctx.clip();
        this._cards.forEach((card) => {
            const drawCard = Object.assign({}, card, { y: card.y - this._scrollY });
            if (drawCard.y + drawCard.h >= m.cardsTop - 3 && drawCard.y <= m.backY - 27) {
                this._drawCard(ctx, drawCard);
            }
        });
        ctx.restore();
        ctx.fillStyle = 'rgba(255,238,190,.65)'; ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('上下滑动浏览全部 20 关', m.W / 2, m.backY - 15);
        this._buttons.forEach((button) => button.render(ctx));
        if (this._toast && Date.now() < this._toastUntil) this._drawToast(ctx, m);
    }

    _drawMoonGlow(ctx, cx, cy) {
        ctx.save();
        const glowRadius = 52;
        const moonRadius = 22;
        const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, glowRadius);
        glow.addColorStop(0, 'rgba(255,244,174,.58)');
        glow.addColorStop(.45, 'rgba(255,215,90,.20)');
        glow.addColorStop(1, 'rgba(255,215,90,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(cx, cy, moonRadius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(177,129,49,.18)'; ctx.beginPath(); ctx.arc(cx - 6, cy - 5, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    _drawBadgeProgress(ctx, m) {
        const progress = midAutumn.getProgress();
        const x = 15;
        const y = m.headerY + 64;
        const w = m.W - 30;
        const h = 38;
        roundRectPath(ctx, x, y, w, h, 10);
        ctx.fillStyle = 'rgba(44,27,12,.76)'; ctx.fill();
        ctx.strokeStyle = this._badgeOwned ? 'rgba(255,229,102,.92)' : 'rgba(255,216,118,.42)';
        ctx.lineWidth = 1; ctx.stroke();

        const cx = x + 22;
        const cy = y + h / 2;
        const badgeImage = getThemeImage('badgeMidAutumn');
        if (badgeImage.ready && badgeImage.img) {
            ctx.save();
            ctx.globalAlpha = this._badgeOwned ? 1 : .42;
            if (this._badgeOwned) {
                ctx.shadowColor = 'rgba(255,220,92,.72)';
                ctx.shadowBlur = 7;
            }
            ctx.drawImage(badgeImage.img, cx - 16, cy - 16, 32, 32);
            ctx.restore();
        } else {
            ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2);
            ctx.fillStyle = this._badgeOwned ? '#FFE566' : 'rgba(255,238,190,.14)'; ctx.fill();
            ctx.strokeStyle = this._badgeOwned ? '#fff3ad' : 'rgba(255,238,190,.48)'; ctx.stroke();
        }

        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = this._badgeOwned ? '#FFE566' : '#fff1ce';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(this._badgeOwned ? '中秋徽章 · 已获得' : '中秋徽章', x + 43, y + 12);
        const barX = x + 43;
        const barY = y + 24;
        const barW = w - 105;
        roundRectPath(ctx, barX, barY, barW, 6, 3);
        ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fill();
        const ratio = Math.max(0, Math.min(1, progress.cleared / progress.total));
        if (ratio > 0) {
            roundRectPath(ctx, barX, barY, Math.max(6, barW * ratio), 6, 3);
            ctx.fillStyle = '#F6C945'; ctx.fill();
        }
        ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,245,218,.78)'; ctx.font = '12px sans-serif';
        ctx.fillText(progress.cleared + '/' + progress.total, x + w - 12, y + 26);
    }

    _drawCard(ctx, card) {
        const s = card.stage;
        const unlocked = this._isStageUnlocked(s.no);
        const cleared = this._clearedIds.indexOf(s.no) >= 0;
        const state = cleared ? 'cleared' : (unlocked ? 'current' : 'locked');
        const skinKey = card.finale
            ? 'midAutumnCardFinale'
            : (state === 'cleared'
                ? 'midAutumnCardCleared'
                : (state === 'current' ? 'midAutumnCardCurrent' : 'midAutumnCardLocked'));
        ctx.save();
        const skin = getThemeImage(skinKey);
        if (skin.ready && skin.img) {
            ctx.globalAlpha = state === 'locked' ? .62 : 1;
            ctx.drawImage(skin.img, card.x - 2, card.y - 2, card.w + 4, card.h + 4);
            ctx.globalAlpha = 1;
        } else {
            roundRectPath(ctx, card.x, card.y, card.w, card.h, 10);
            ctx.fillStyle = unlocked ? 'rgba(40,74,83,.88)' : 'rgba(20,35,50,.78)'; ctx.fill();
            ctx.strokeStyle = cleared ? '#e9c979' : 'rgba(198,220,226,.56)';
            ctx.lineWidth = unlocked ? 2 : 1; ctx.stroke();
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const numX = card.x + 15;
        const textX = card.x + card.w * .18;
        const centerY = card.y + card.h / 2;
        ctx.shadowColor = card.finale ? 'rgba(15,8,3,.96)' : 'rgba(8,18,28,.88)';
        ctx.shadowBlur = card.finale ? 4 : 2; ctx.shadowOffsetY = 1;
        ctx.fillStyle = card.finale ? '#FFE5A0'
            : (unlocked ? '#F4E5BD' : 'rgba(214,225,230,.62)');
        ctx.font = 'bold 25px sans-serif';
        ctx.fillText(String(s.no).padStart(2, '0'), numX, centerY);
        this._drawStagePreview(ctx, card, PREVIEW_SHAPES[s.no - 1]);
        if (!unlocked) {
            IconRenderer.draw(
                ctx,
                'lock',
                card.x + card.w * .80 + 5,
                card.y + card.h / 2 - 5,
                30,
                'rgba(226,205,151,.82)'
            );
        }
        ctx.font = '15px sans-serif';
        ctx.fillStyle = card.finale ? '#FFF0C9'
            : (unlocked ? '#F7F1DF' : 'rgba(208,219,225,.64)');
        const poemMaxW = card.w * (card.finale ? .48 : .50);
        ctx.fillText(s.line1, textX, centerY - 10, poemMaxW);
        ctx.fillText(s.line2, textX, centerY + 10, poemMaxW);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.restore();
    }

    _drawStagePreview(ctx, card, shape) {
        const rows = shape || [];
        const cols = 7;
        const cell = Math.max(3.8, Math.min(card.finale ? 6.2 : 5.8, card.h * .055));
        const boardW = cols * cell;
        const boardH = 6 * cell;
        // 新卡片月盘中心约位于横向 82%，剪影据此严格居中。
        const moonCx = card.x + card.w * .82 - 3;
        const x = moonCx - boardW / 2;
        const y = card.y + card.h / 2 - boardH / 2;
        const unlocked = this._isStageUnlocked(card.stage.no);
        rows.forEach((row, r) => {
            for (let c = 0; c < cols; c++) {
                if (row[c] !== '#') continue;
                const isMoon = card.stage.no === 1 && r < 4;
                ctx.fillStyle = unlocked
                    ? (isMoon ? '#dcecf0' : 'rgba(76,176,193,.94)')
                    : 'rgba(171,188,198,.34)';
                ctx.fillRect(x + c * cell + .5, y + r * cell + .5, cell - 1, cell - 1);
            }
        });
    }

    _drawToast(ctx, m) {
        const w = Math.min(250, m.W - 40); const h = 44; const x = (m.W - w) / 2; const y = m.H * .48;
        roundRectPath(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(24,15,8,.94)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,92,.75)'; ctx.stroke();
        ctx.fillStyle = '#fff3d0'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this._toast, m.W / 2, y + h / 2);
    }

    handleTouchStart(identifier, x, y) {
        this._scrollVel = 0;
        this._moveSamples = [{ t: Date.now(), y }];
        this._drag = { id: identifier, startY: y, lastY: y, baseScroll: this._scrollY };
        this._suppressTap = false;
    }

    handleTouchMove(identifier, x, y) {
        if (!this._drag || this._drag.id !== identifier) return;
        this._drag.lastY = y;
        const dy = y - this._drag.startY;
        if (Math.abs(dy) > 8) this._suppressTap = true;
        this._scrollY = this._clampScroll(this._drag.baseScroll - dy);
        const now = Date.now();
        this._moveSamples.push({ t: now, y });
        while (this._moveSamples.length > 2 && now - this._moveSamples[0].t > 120) {
            this._moveSamples.shift();
        }
    }

    handleTouchEnd(identifier) {
        if (!this._drag || this._drag.id !== identifier) return;
        this._drag = null;
        const samples = this._moveSamples;
        this._moveSamples = [];
        if (!this._suppressTap || samples.length < 2) return;
        const newest = samples[samples.length - 1];
        let oldest = samples[0];
        for (let i = samples.length - 2; i >= 0; i--) {
            if (newest.t - samples[i].t > 100) break;
            oldest = samples[i];
        }
        const seconds = Math.max(.016, (newest.t - oldest.t) / 1000);
        let velocity = (oldest.y - newest.y) / seconds;
        velocity = Math.max(-3600, Math.min(3600, velocity));
        this._scrollVel = Math.abs(velocity) >= 150 ? velocity : 0;
    }

    _getMaxScroll() {
        const m = this._metrics();
        const contentBottom = this._cards.length
            ? Math.max.apply(null, this._cards.map((card) => card.y + card.h))
            : m.cardsTop;
        const contentH = contentBottom - m.cardsTop + SCROLL_BOTTOM_PAD;
        const viewportH = m.backY - 27 - m.cardsTop;
        return Math.max(0, contentH - viewportH);
    }

    _clampScroll(value) {
        return Math.max(0, Math.min(this._getMaxScroll(), Number(value) || 0));
    }

    _isStageUnlocked(stageNo) {
        const no = Number(stageNo) || 0;
        return no === 1 || this._clearedIds.indexOf(no - 1) >= 0;
    }

    handleTap(x, y) {
        if (this._suppressTap) { this._suppressTap = false; return; }
        for (const button of this._buttons) if (button.hitTest(x, y)) { button.trigger(); return; }
        const m = this._metrics();
        if (y < m.cardsTop - 3 || y > m.backY - 27) return;
        const contentY = y + this._scrollY;
        const card = this._cards.find((item) => x >= item.x && x <= item.x + item.w && contentY >= item.y && contentY <= item.y + item.h);
        if (!card) return;
        if (this._isStageUnlocked(card.stage.no)) {
            this._startStage(card.stage.no);
            return;
        }
        this._toast = '通关上一关后解锁';
        this._toastUntil = Date.now() + 1800;
        try { if (GameGlobal.game.kickLoop) GameGlobal.game.kickLoop(); } catch (e) { /* ignore */ }
    }

    _startStage(stageId) {
        const stage = midAutumn.getStage(stageId);
        if (!stage) return;
        GameGlobal.game.sceneManager.switchTo('game', {
            mode: 'stage',
            workshop: true,
            themeEvent: true,
            themeEventStageId: stage.id,
            workshopStageId: 'mid_autumn_' + stage.id,
            workshopTitle: stage.title,
            workshopRows: stage.rows,
            themeId: stage.themeId,
            dropIntervalMs: stage.dropIntervalMs,
            firstPiece: stage.firstPiece,
            entryPaid: 0,
        });
    }
}

module.exports = ThemeEventScene;
