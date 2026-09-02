/**
 * 绘制预算
 * - 当前可见页面：60fps
 * - 不可见（切后台、无当前场景、栈里被盖住的页）：0，不 update / 不 render、不排下一帧
 */
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1 / TARGET_FPS;
const LIST_FRAME_INTERVAL = FRAME_INTERVAL;

module.exports = {
    TARGET_FPS,
    FRAME_INTERVAL,
    LIST_FRAME_INTERVAL,
};
