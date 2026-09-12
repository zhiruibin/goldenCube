/**
 * 微信右上角「···」分享菜单。
 * 根据当前场景生成独立文案，并分别记录好友/朋友圈分享成就。
 */

const goldenBlock = require('./golden-block-manager');
const { achievementManager } = require('./achievement-manager');
const { getAllAchievements } = require('../data/achievements');

let initialized = false;

function progressText() {
    return `${goldenBlock.getClearedCount()}/${goldenBlock.getTotalStageCount()}`;
}

function achievementText() {
    const all = getAllAchievements();
    const active = new Set(all.map((item) => item.id));
    const unlocked = achievementManager.getUnlocked().filter((id) => active.has(id)).length;
    return `${unlocked}/${all.length}`;
}

function getCurrentScene() {
    try {
        const manager = GameGlobal.game && GameGlobal.game.sceneManager;
        return manager ? { name: manager.currentName, scene: manager.current } : {};
    } catch (e) {
        return {};
    }
}

function buildShareMessage(channel) {
    const current = getCurrentScene();
    const isTimeline = channel === 'timeline';
    let title = isTimeline
        ? '挖个方块：动动脑，把残局挖通！'
        : '来玩挖个方块，看看谁能挖通更多残局！';
    let source = 'home';

    if (current.name === 'worldMap') {
        source = 'worldMap';
        title = isTimeline
            ? `我的挖矿进度 ${progressText()}，下一章继续！`
            : `我在挖个方块已通关 ${goldenBlock.getClearedCount()} 关，来一起闯关！`;
    } else if (current.name === 'rank') {
        source = 'rank';
        const cleared = goldenBlock.getClearedCount();
        const rank = current.scene && current.scene._tab === 'global' && current.scene._myRank;
        if (isTimeline) {
            title = rank
                ? `挖个方块全服第 ${rank} 名，已通关 ${cleared} 关！`
                : `挖个方块排行榜：我已通关 ${cleared} 关！`;
        } else {
            title = rank
                ? `我在挖个方块全服排名第 ${rank}，来挑战我的名次！`
                : `我已通关 ${cleared} 关，来排行榜比一比！`;
        }
    } else if (current.name === 'achievement') {
        source = 'achievement';
        title = isTimeline
            ? `我的挖个方块成就进度 ${achievementText()}，继续收集！`
            : `我已解锁 ${achievementText()} 项成就，你能超过我吗？`;
    } else if (current.name === 'stageResult') {
        source = 'stageResult';
        const stage = current.scene && current.scene._stage;
        const result = current.scene && current.scene._result;
        const stageId = stage && stage.id != null ? stage.id : '';
        const lines = result && Math.max(0, Number(result.lines) || 0);
        title = `我成功挖通第 ${stageId || '?'} 关，消除了 ${lines || 0} 行！`;
    }

    const message = {
        title,
        query: `shareScene=${source}`,
    };
    if (current.scene && current.scene._shareImageUrl) {
        message.imageUrl = current.scene._shareImageUrl;
    }
    return message;
}

function report(channel) {
    try {
        if (channel === 'timeline') achievementManager.reportTimelineShare();
        else achievementManager.reportFriendShare();
    } catch (e) { /* 分享不应被成就统计异常阻断 */ }
}

function initShareMenu() {
    if (initialized) return;
    initialized = true;

    try {
        if (typeof wx.showShareMenu === 'function') {
            wx.showShareMenu({
                withShareTicket: true,
                menus: ['shareAppMessage', 'shareTimeline'],
            });
        }
        if (typeof wx.onShareAppMessage === 'function') {
            wx.onShareAppMessage(() => {
                report('friend');
                return buildShareMessage('friend');
            });
        }
        if (typeof wx.onShareTimeline === 'function') {
            wx.onShareTimeline(() => {
                report('timeline');
                return buildShareMessage('timeline');
            });
        }
    } catch (e) {
        console.warn('[ShareMenu] 分享菜单初始化失败', e);
    }
}

module.exports = {
    buildShareMessage,
    initShareMenu,
};
