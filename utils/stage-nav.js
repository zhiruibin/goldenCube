/**
 * 闯关导航栈：首页 → 世界地图 → 章内关卡卡 → 对局
 * 结算 / 失败 / 暂停退出用 leaveTo 重置栈，避免叠两层关选。
 */

const WORLD_MAP = 'worldMap';
const STAGE_SELECT = 'stageSelect';

function worldMapStack() {
    return ['home'];
}

function stageSelectStack() {
    return ['home', WORLD_MAP];
}

function stagePlayStack() {
    return ['home', WORLD_MAP, STAGE_SELECT];
}

module.exports = {
    WORLD_MAP,
    STAGE_SELECT,
    worldMapStack,
    stageSelectStack,
    stagePlayStack,
};
