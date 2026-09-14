/** 主题活动配置云函数。集合 theme_events 建议设为仅云函数可读写。 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLLECTION = 'theme_events';
const ALLOWED_SKINS = ['btnSquareAmber', 'btnSquareGold', 'btnSquareBrown', 'btnSquareTeal'];

exports.main = async (event) => {
  const action = event && event.action;
  if (action !== 'getCurrent') return { success: false, errMsg: 'unknown action: ' + action };
  const now = Date.now();
  try {
    const result = await db.collection(COLLECTION).where({ enabled: true }).limit(20).get();
    const candidates = (result.data || []).slice().sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    const active = candidates.find((item) => {
      const start = toMillis(item.startAt);
      const end = toMillis(item.endAt);
      return (!start || start <= now) && (!end || end > now);
    });
    return { success: true, serverNow: now, event: active ? sanitize(active, now) : null };
  } catch (err) {
    console.error('[theme-event] getCurrent failed', err);
    return { success: false, errMsg: (err && err.message) || 'internal error' };
  }
};

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sanitize(item, now) {
  const skin = ALLOWED_SKINS.indexOf(item.buttonSkin) >= 0 ? item.buttonSkin : 'btnSquareTeal';
  return {
    active: true,
    eventId: String(item.eventId || item._id || '').slice(0, 64),
    title: String(item.title || '主题挑战').slice(0, 8),
    subtitle: String(item.subtitle || '限时挑战进行中').slice(0, 28),
    description: String(item.description || '').slice(0, 160),
    rules: Array.isArray(item.rules) ? item.rules.slice(0, 5) : [],
    buttonSkin: skin,
    accentColor: /^#[0-9a-fA-F]{6}$/.test(item.accentColor || '') ? item.accentColor : '#1aa8a0',
    badge: String(item.badge || '').slice(0, 4),
    startAt: toMillis(item.startAt),
    endAt: toMillis(item.endAt),
    serverNow: now,
  };
}
