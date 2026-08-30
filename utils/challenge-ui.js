/**
 * 好友挑战 · 挖个方块（残局 stage / workshop / plaza）
 */

const { MODE_NAMES } = require('./cloud-config');

const BRAND_NAME = '挖个方块';

function isPuzzleChallenge(rec) {
    if (!rec) return false;
    if (rec.mode === 'workshop' || rec.challengeMode === 'workshop') return true;
    if (rec.mode === 'stage' || rec.challengeMode === 'stage') {
        return !!(rec.layoutSnapshot || rec.challengerLines != null || rec.workshop);
    }
    return false;
}

function challengeTitle(rec) {
    if (!rec) return '好友挑战';
    return rec.workshopTitle || rec.stageTitle || MODE_NAMES[rec.mode] || '闯关挑战';
}

function modeLabel(rec) {
    if (!rec) return MODE_NAMES.stage || '闯关挑战';
    if (rec.workshopTitle) return rec.workshopTitle;
    return MODE_NAMES[rec.mode] || rec.mode || '挑战';
}

function formatLines(lines) {
    if (typeof lines !== 'number' || isNaN(lines)) return '--';
    return lines + ' 行';
}

function formatScore(score) {
    if (score == null || score === '') return '--';
    return String(score) + ' 分';
}

function formatMetric(value, puzzle) {
    return puzzle ? formatLines(value) : formatScore(value);
}

/** 列表/卡片：发起方成绩展示 */
function challengerMetricLabel(rec) {
    if (!rec) return '--';
    if (isPuzzleChallenge(rec)) {
        if (typeof rec.challengerLines === 'number') return formatLines(rec.challengerLines);
        if (rec.challengerScore != null && rec.challengerScore < 10000) {
            return formatLines(rec.challengerScore);
        }
        return '--';
    }
    return rec.challengerScore != null ? formatScore(rec.challengerScore) : '--';
}

/**
 * 应战者视角：挑战胜负文案（云 result 为发起方视角）
 * @param {object} sync 含 result, challengerLines, responderLines, challengerScore, responderScore, mode
 */
function formatResponderResultText(sync) {
    if (!sync || !sync.result) return '';
    // 应战未通关（顶格/中途结束）：不按消行比拼文案
    if (sync.failed || sync.challengeFailed) {
        return '未通关，挑战失败';
    }
    const puzzle = isPuzzleChallenge(sync);
    const mine = puzzle
        ? (typeof sync.responderLines === 'number' ? sync.responderLines : null)
        : (typeof sync.responderScore === 'number' ? sync.responderScore : null);
    const theirs = puzzle
        ? (typeof sync.challengerLines === 'number' ? sync.challengerLines : null)
        : (typeof sync.challengerScore === 'number' ? sync.challengerScore : null);
    const mu = puzzle ? '行' : '分';
    const myStr = mine != null ? mine : '--';
    const theirStr = theirs != null ? theirs : '--';

    if (sync.result === 'responder_win') {
        return puzzle
            ? `挑战成功！你 ${myStr} 行更少，优于对方 ${theirStr} 行`
            : `挑战成功！你 ${myStr} ${mu}，超越对方 ${theirStr} ${mu}`;
    }
    if (sync.result === 'challenger_win') {
        return puzzle
            ? `挑战失败！残局比谁消行更少（对方 ${theirStr} 行，你 ${myStr} 行）`
            : `挑战失败！对方 ${theirStr} ${mu}，你 ${myStr} ${mu}`;
    }
    return puzzle
        ? `平局！双方均为 ${theirStr} 行`
        : `平局！双方均为 ${theirStr} ${mu}`;
}

/**
 * 从结算页参数或已完成记录组装 createChallenge 请求体
 */
function buildCreateChallengePayload(opts) {
    const o = opts || {};
    const profile = o.profile || {};
    const opponent = o.opponent || {};
    const rec = o.completedRecord || null;
    const params = o.gameParams || {};

    let mode = 'stage';
    let layoutSnapshot = null;
    let workshopStageId = '';
    let workshopTitle = '';
    let challengerLines = 0;
    let challengerPieces = 0;
    let challengerTimeMs = 0;
    let score = 0;

    if (rec) {
        mode = rec.mode || 'stage';
        layoutSnapshot = rec.layoutSnapshot || null;
        workshopStageId = rec.workshopStageId || rec.stageId || '';
        workshopTitle = rec.workshopTitle || rec.stageTitle || challengeTitle(rec);
        if (isPuzzleChallenge(rec)) {
            const myRole = rec.myRole;
            challengerLines = myRole === 'challenger'
                ? (rec.challengerLines != null ? rec.challengerLines : 0)
                : (rec.responderLines != null ? rec.responderLines : 0);
            challengerPieces = myRole === 'challenger'
                ? (rec.challengerPieces || 0)
                : (rec.responderPieces || 0);
            challengerTimeMs = myRole === 'challenger'
                ? (rec.challengerTimeMs || 0)
                : (rec.responderTimeMs || 0);
        } else {
            score = rec.myRole === 'challenger' ? rec.challengerScore : rec.responderScore;
            score = Math.max(0, Math.floor(Number(score) || 0));
        }
    } else if (params) {
        mode = params.challengeMode || params.mode || 'stage';
        if (mode === 'stage' && params.workshop) mode = 'stage';
        layoutSnapshot = params.layoutSnapshot || params.workshopRows || null;
        workshopStageId = String(params.workshopStageId || params.stageId || '');
        workshopTitle = params.workshopTitle || challengeTitle({ mode, workshopTitle: params.workshopTitle });
        challengerLines = Math.max(0, Math.floor(Number(params.lines != null ? params.lines : params.score) || 0));
        challengerPieces = Math.max(0, Math.floor(Number(params.pieces) || 0));
        challengerTimeMs = Math.max(0, Math.floor(Number(params.timeMs) || 0));
        score = Math.max(0, Math.floor(Number(params.score) || 0));
    }

    const puzzle = isPuzzleChallenge({ mode, layoutSnapshot, challengerLines });

    const payload = {
        mode: puzzle ? mode : (mode || 'stage'),
        nickname: (profile.nickname) || '',
        avatarUrl: (profile.avatarUrl) || '',
        targetName: (opponent.name || opponent.targetName || rec && (rec.myRole === 'challenger' ? rec.responderName : rec.challengerName) || '') || '',
        targetAvatar: (opponent.avatar || opponent.targetAvatar || '') || '',
        targetOpenid: (opponent.openid || opponent.targetOpenid || rec && rec.opponentOpenid || '') || '',
    };

    if (puzzle && layoutSnapshot) {
        payload.layoutSnapshot = layoutSnapshot;
        payload.workshopStageId = workshopStageId;
        payload.stageId = workshopStageId;
        payload.workshopTitle = workshopTitle;
        payload.stageTitle = workshopTitle;
        payload.challengerLines = challengerLines;
        payload.challengerPieces = challengerPieces;
        payload.challengerTimeMs = challengerTimeMs;
        payload.score = challengerLines;
    } else {
        payload.score = score;
    }

    return payload;
}

function buildShareTitle(opts) {
    const o = opts || {};
    const isCounter = !!o.isCounter;
    const oppName = o.opponentName ? String(o.opponentName).slice(0, 12) : '';
    const payload = o.payload || {};
    const puzzle = isPuzzleChallenge(payload);
    const title = challengeTitle(payload);
    const metric = puzzle
        ? formatLines(payload.challengerLines)
        : formatScore(payload.score);

    if (isCounter && oppName) {
        return puzzle
            ? `回击 ${oppName}！${title} · ${metric}，敢再来吗？`
            : `回击 ${oppName}！${modeLabel(payload)} ${metric}，敢再来吗？`;
    }
    if (puzzle) {
        return `${title} · ${metric.replace(' ', '')}，敢来挑战吗？`;
    }
    return oppName
        ? `回击 ${oppName}！我在『${modeLabel(payload)}』拿了 ${payload.score} 分，敢再来吗？`
        : `向你发起挑战！我在『${modeLabel(payload)}』拿了 ${payload.score} 分，敢来超越吗？`;
}

function buildShareQuery(challengeId, payload) {
    const puzzle = isPuzzleChallenge(payload);
    const score = puzzle ? (payload.challengerLines || 0) : (payload.score || 0);
    return 'challengeId=' + encodeURIComponent(challengeId)
        + '&mode=' + encodeURIComponent(payload.mode || 'stage')
        + '&score=' + encodeURIComponent(String(score));
}

/** 用云端 challenge 补全本地待应战条目（分享卡 / 列表展示） */
function mergePendingFromCloud(local, cloud) {
    if (!local || !cloud) return local;
    if (cloud.mode) local.mode = cloud.mode;
    if (cloud.challengerName) local.challengerName = cloud.challengerName;
    if (cloud.challengerAvatar) local.challengerAvatar = cloud.challengerAvatar;
    if (typeof cloud.challengerLines === 'number') local.challengerLines = cloud.challengerLines;
    else if (local.challengerLines == null && typeof cloud.challengerScore === 'number'
        && cloud.challengerScore < 10000) {
        local.challengerLines = cloud.challengerScore;
    }
    if (typeof cloud.challengerScore === 'number') local.challengerScore = cloud.challengerScore;
    if (cloud.workshopStageId) local.workshopStageId = cloud.workshopStageId;
    if (cloud.workshopTitle) local.workshopTitle = cloud.workshopTitle;
    if (cloud.layoutSnapshot) local.layoutSnapshot = cloud.layoutSnapshot;
    return local;
}

function formatChapterIndex(chapterId) {
    const map = {
        1: '一', 2: '二', 3: '三', 4: '四', 5: '五',
        6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
    };
    const n = Number(chapterId);
    if (map[n]) return '第' + map[n] + '章';
    if (n > 0) return '第' + n + '章';
    return '';
}

/** 分享卡/列表：「第一章·数字课」 */
function resolveChapterLine(rec) {
    if (!rec) return '';
    if (rec.chapterLine) return String(rec.chapterLine);
    const mode = rec.mode || rec.challengeMode || '';
    if (mode === 'workshop') return '工坊关卡';
    const stageId = rec.workshopStageId || rec.stageId;
    if (!stageId) return '';
    try {
        const goldenBlock = require('./golden-block-manager');
        const stage = goldenBlock.getStage(Number(stageId) || stageId);
        if (!stage) return '';
        const cid = Number(stage.chapterId);
        if (!cid) return '';
        const chapters = goldenBlock.getChapters();
        const ch = chapters.find((c) => Number(c.id) === cid);
        if (!ch || !ch.name) return '';
        const prefix = formatChapterIndex(cid);
        return prefix ? (prefix + '·' + ch.name) : ch.name;
    } catch (e) {
        return '';
    }
}

function mergeSyncIntoResult(res) {
    if (!res) return null;
    const ch = res.challenge || {};
    return {
        result: res.result,
        mode: res.mode || ch.mode || '',
        challengerScore: res.challengerScore,
        responderScore: res.responderScore,
        challengerLines: typeof res.challengerLines === 'number'
            ? res.challengerLines
            : ch.challengerLines,
        responderLines: typeof res.responderLines === 'number'
            ? res.responderLines
            : ch.responderLines,
        challengerPieces: ch.challengerPieces,
        responderPieces: ch.responderPieces,
        layoutSnapshot: ch.layoutSnapshot,
        workshopStageId: ch.workshopStageId,
        workshopTitle: ch.workshopTitle,
    };
}

module.exports = {
    BRAND_NAME,
    isPuzzleChallenge,
    challengeTitle,
    modeLabel,
    formatLines,
    formatScore,
    formatMetric,
    challengerMetricLabel,
    formatResponderResultText,
    formatChapterIndex,
    resolveChapterLine,
    buildCreateChallengePayload,
    buildShareTitle,
    buildShareQuery,
    mergeSyncIntoResult,
    mergePendingFromCloud,
};
