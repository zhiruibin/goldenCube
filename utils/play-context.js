/**
 * 对局上下文 / 挑战类型参数适配（P2）
 * 新代码优先 playContext / challengeKind；库字段 mode 仍可读作兼容。
 */

const VALID_PLAY_CONTEXTS = ['stage', 'plaza', 'workshop', 'challenge'];
const VALID_CHALLENGE_KINDS = ['stage', 'workshop', 'plaza'];

function resolvePlayContext(params) {
    const p = params || {};
    if (p.playContext && VALID_PLAY_CONTEXTS.indexOf(p.playContext) >= 0) {
        return p.playContext;
    }
    if (p.challengeId) return 'challenge';
    if (p.workshop || p.workshopStageId) {
        const origin = (p.workshopListParams && p.workshopListParams.origin) || '';
        if (origin === 'plaza' && !p.authorTrial) return 'plaza';
        return 'workshop';
    }
    if (p.stageId != null) return 'stage';
    return 'stage';
}

function resolveChallengeKind(params) {
    const p = params || {};
    if (p.challengeKind && VALID_CHALLENGE_KINDS.indexOf(p.challengeKind) >= 0) {
        return p.challengeKind;
    }
    const mode = p.challengeMode || p.mode;
    if (mode && VALID_CHALLENGE_KINDS.indexOf(mode) >= 0) return mode;
    if (p.workshop) return 'workshop';
    return 'stage';
}

/** 规范化开局参数：补 playContext/challengeKind，引擎规则固定 stage */
function normalizeGameParams(params) {
    const p = Object.assign({}, params || {});
    p.playContext = resolvePlayContext(p);
    if (p.challengeId) {
        p.challengeKind = resolveChallengeKind(p);
        p.challengeMode = p.challengeKind;
    }
    p.mode = 'stage';
    return p;
}

/** 回放 meta 附加 playContext（写入 recorder.finish） */
function replayMetaFromGame(scene) {
    const meta = {
        playContext: scene._playContext || 'stage',
        stageId: scene._stageId || null,
        workshopStageId: scene._workshopStageId || null,
        workshopRows: scene._workshopRows || null,
        workshopTitle: scene._workshopTitle || '',
        challengeId: scene._challengeId || '',
        challengeKind: scene._challengeMode || '',
    };
    return meta;
}

module.exports = {
    VALID_PLAY_CONTEXTS,
    VALID_CHALLENGE_KINDS,
    resolvePlayContext,
    resolveChallengeKind,
    normalizeGameParams,
    replayMetaFromGame,
};
