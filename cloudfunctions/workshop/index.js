/**
 * 工坊 / 关卡广场云函数 workshop
 * 职责：
 *  - publishStage   提交发布（机审通过即上架）
 *  - delistStage    作者下架
 *  - listPlaza      广场列表（官方 / 新关 / 热门 / 好通关）
 *  - getStage       单关详情（含布局，供开打）
 *  - reportPlay     开打计数
 *  - reportClear    通关计数（更新热度；作者分成日限服务端记账可选）
 *  - bumpChallenge  挑战发起计数
 *
 * 集合：workshop_stages（权限建议仅云函数可写；客户端只走本函数）
 * 部署：右键 cloudfunctions/workshop → 上传并部署：云端安装依赖
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTION = 'workshop_stages';
const MAX_LIST = 50;
const SUBMIT_DAILY_MAX = 3;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, errMsg: 'unauthorized' };
  }
  const { action, data = {} } = event || {};
  try {
    switch (action) {
      case 'publishStage':
        return await publishStage(OPENID, data);
      case 'delistStage':
        return await delistStage(OPENID, data);
      case 'listPlaza':
        return await listPlaza(OPENID, data);
      case 'getStage':
        return await getStage(OPENID, data);
      case 'reportPlay':
        return await reportPlay(OPENID, data);
      case 'reportClear':
        return await reportClear(OPENID, data);
      case 'bumpChallenge':
        return await bumpChallenge(OPENID, data);
      default:
        return { success: false, errMsg: 'unknown action: ' + action };
    }
  } catch (err) {
    console.error('[workshop] unhandled:', err);
    return { success: false, errMsg: (err && err.message) || 'internal error' };
  }
};

function layoutHash(rows) {
  const keys = Object.keys(rows || {}).map(Number).sort((a, b) => a - b);
  let s = '';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    s += k + ':' + (rows[String(k)] || rows[k] || '') + '|';
  }
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function analyzeLayout(rows) {
  let garbageCount = 0;
  let minLines = 0;
  for (let r = 0; r < 20; r++) {
    const line = String((rows && (rows[String(r)] || rows[r])) || '..........');
    let has = false;
    for (let c = 0; c < 10; c++) {
      if (line[c] === '#') {
        garbageCount++;
        has = true;
      }
    }
    if (has) minLines++;
  }
  return { garbageCount, minLines };
}

function validateLayout(rows) {
  if (!rows || typeof rows !== 'object') return { ok: false, reason: 'empty' };
  let topGarbage = 20;
  let garbageCount = 0;
  let minLines = 0;
  for (let r = 0; r < 20; r++) {
    const line = String(rows[String(r)] || rows[r] || '');
    if (line.length !== 10) return { ok: false, reason: 'bad-row-' + r };
    let filled = 0;
    let hasG = false;
    for (let c = 0; c < 10; c++) {
      const ch = line[c];
      if (ch !== '.' && ch !== '#') return { ok: false, reason: 'bad-char' };
      if (ch === '#') {
        filled++;
        garbageCount++;
        hasG = true;
        if (r < topGarbage) topGarbage = r;
      }
    }
    if (filled >= 10) return { ok: false, reason: 'full-row' };
    if (hasG) minLines++;
  }
  if (garbageCount < 8 || garbageCount > 80) return { ok: false, reason: 'garbage-range' };
  if (minLines < 3 || minLines > 16) return { ok: false, reason: 'minLines-range' };
  if (topGarbage < 6) return { ok: false, reason: 'too-high' };
  return { ok: true };
}

function calcHeat(doc) {
  const st = doc.stats || {};
  let heat = (st.clearCount || 0) * 3
    + (st.playCount || 0) * 1
    + (st.challengeSendCount || 0) * 2
    + (st.likeCount || 0) * 2;
  if (doc.publishedAt) {
    const weeks = Math.floor((Date.now() - doc.publishedAt) / (7 * 24 * 3600 * 1000));
    let decay = 1;
    for (let i = 0; i < weeks; i++) decay *= 0.92;
    heat *= Math.max(0.5, decay);
  }
  return Math.round(heat * 100) / 100;
}

function sanitizeStage(doc, includeRows) {
  if (!doc) return null;
  const out = {
    stageId: doc.stageId,
    authorOpenid: doc.authorOpenid || '',
    authorName: doc.authorName || '',
    authorAvatar: doc.authorAvatar || '',
    title: doc.title || '未命名',
    status: doc.status || '',
    source: doc.source || 'ugc',
    featured: !!doc.featured,
    featuredRank: Number(doc.featuredRank) || 0,
    tags: Array.isArray(doc.tags) ? doc.tags.slice(0, 8) : [],
    seriesId: doc.seriesId || '',
    layoutHash: doc.layoutHash || '',
    minLines: doc.minLines || 0,
    garbageCount: doc.garbageCount || 0,
    coinThreshold: doc.coinThreshold || 0,
    dropIntervalMs: doc.dropIntervalMs || 1000,
    authorBest: doc.authorBest || null,
    stats: doc.stats || { playCount: 0, clearCount: 0, challengeSendCount: 0, likeCount: 0 },
    heatScore: typeof doc.heatScore === 'number' ? doc.heatScore : calcHeat(doc),
    publishedAt: doc.publishedAt || 0,
    updatedAt: doc.updatedAt || 0,
    createdAt: doc.createdAt || 0,
  };
  if (includeRows) {
    out.rows = doc.rows || {};
  }
  return out;
}

function todayStr() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

async function countTodaySubmits(openid) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const res = await db.collection(COLLECTION)
    .where({
      authorOpenid: openid,
      'review.submittedAt': _.gte(start.getTime()),
    })
    .count();
  return res.total || 0;
}

/**
 * 发布到广场：机审通过即 published
 * data: { stageId, title, rows, authorBest, dropIntervalMs, nickname, avatarUrl }
 */
async function publishStage(openid, data) {
  const stageId = String((data && data.stageId) || '').slice(0, 64);
  if (!stageId) return { success: false, errMsg: 'stageId required' };

  const rows = (data && data.rows) || null;
  const v = validateLayout(rows);
  if (!v.ok) return { success: false, errMsg: 'invalid layout: ' + v.reason };

  const hash = layoutHash(rows);
  const best = (data && data.authorBest) || null;
  if (!best || best.layoutHash !== hash) {
    return { success: false, errMsg: 'need author clear for current layout' };
  }
  if (!(Number(best.lines) >= 1)) {
    return { success: false, errMsg: 'invalid authorBest' };
  }

  const submitted = await countTodaySubmits(openid);
  // 允许更新已发布关：同一 stageId 作者重提不占新次数（仅首次/换稿计）
  let existing = null;
  try {
    const got = await db.collection(COLLECTION).where({ stageId, authorOpenid: openid }).limit(1).get();
    existing = (got.data && got.data[0]) || null;
  } catch (e) { /* ignore */ }

  if (!existing && submitted >= SUBMIT_DAILY_MAX) {
    return { success: false, errMsg: 'daily-limit' };
  }

  const meta = analyzeLayout(rows);
  const now = Date.now();
  const title = String((data && data.title) || '未命名').trim().slice(0, 20) || '未命名';
  const nickname = String((data && data.nickname) || '').slice(0, 32);
  const avatarUrl = String((data && data.avatarUrl) || '').slice(0, 512);

  const doc = {
    stageId,
    authorOpenid: openid,
    authorName: nickname || ('玩家' + openid.slice(-4)),
    authorAvatar: avatarUrl,
    title,
    status: 'published',
    rows,
    layoutHash: hash,
    minLines: meta.minLines,
    garbageCount: meta.garbageCount,
    coinThreshold: Math.max(meta.minLines * 2, 1),
    dropIntervalMs: Math.max(200, Math.floor(Number((data && data.dropIntervalMs) || 1000))),
    authorBest: {
      lines: Math.floor(Number(best.lines) || 0),
      pieces: Math.floor(Number(best.pieces) || 0),
      timeMs: Math.floor(Number(best.timeMs) || 0),
      clearedAt: Number(best.clearedAt) || now,
      layoutHash: hash,
    },
    stats: (existing && existing.stats) || {
      playCount: 0,
      clearCount: 0,
      challengeSendCount: 0,
      likeCount: 0,
    },
    review: {
      submittedAt: now,
      reviewedAt: now,
      rejectReason: '',
      snapshotId: hash,
      auto: true,
    },
    publishedAt: (existing && existing.publishedAt) || now,
    updatedAt: now,
    createdAt: (existing && existing.createdAt) || now,
  };
  doc.heatScore = calcHeat(doc);

  if (existing && existing._id) {
    await db.collection(COLLECTION).doc(existing._id).update({ data: doc });
    return { success: true, stage: sanitizeStage(Object.assign({ _id: existing._id }, doc), true) };
  }

  const addRes = await db.collection(COLLECTION).add({ data: doc });
  return {
    success: true,
    stage: sanitizeStage(Object.assign({ _id: addRes._id }, doc), true),
  };
}

async function delistStage(openid, data) {
  const stageId = String((data && data.stageId) || '').slice(0, 64);
  if (!stageId) return { success: false, errMsg: 'stageId required' };
  const got = await db.collection(COLLECTION).where({ stageId, authorOpenid: openid }).limit(1).get();
  const existing = (got.data && got.data[0]) || null;
  if (!existing) return { success: false, errMsg: 'not found' };
  if (existing.status !== 'published') return { success: false, errMsg: 'not-published' };
  await db.collection(COLLECTION).doc(existing._id).update({
    data: { status: 'delisted', updatedAt: Date.now() },
  });
  return { success: true, stageId };
}

async function listPlaza(openid, data) {
  const sort = (data && data.sort) || 'new';
  const page = Math.max(1, Math.floor(Number((data && data.page) || 1)));
  const pageSize = Math.min(MAX_LIST, Math.max(1, Math.floor(Number((data && data.pageSize) || 30))));
  const skip = (page - 1) * pageSize;

  // 取一批再本地排序（MVP；数据量大后再建索引+orderBy）
  const res = await db.collection(COLLECTION)
    .where({ status: 'published' })
    .limit(100)
    .get();
  let list = (res.data || []).map((d) => {
    d.heatScore = calcHeat(d);
    return d;
  });

  if (sort === 'official') {
    list = list.filter((d) => d.source === 'official' && d.featured !== false);
    list.sort((a, b) => (Number(a.featuredRank) || 0) - (Number(b.featuredRank) || 0));
  } else if (sort === 'heat') {
    list.sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0));
  } else if (sort === 'clearRate') {
    list.sort((a, b) => {
      const ra = ((a.stats && a.stats.clearCount) || 0) / Math.max(1, (a.stats && a.stats.playCount) || 0);
      const rb = ((b.stats && b.stats.clearCount) || 0) / Math.max(1, (b.stats && b.stats.playCount) || 0);
      if (rb !== ra) return rb - ra;
      return ((b.stats && b.stats.playCount) || 0) - ((a.stats && a.stats.playCount) || 0);
    });
  } else {
    list.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  }

  const total = list.length;
  const slice = list.slice(skip, skip + pageSize).map((d) => sanitizeStage(d, true));
  return { success: true, list: slice, total, page, pageSize };
}

async function getStage(openid, data) {
  const stageId = String((data && data.stageId) || '').slice(0, 64);
  if (!stageId) return { success: false, errMsg: 'stageId required' };
  const res = await db.collection(COLLECTION).where({ stageId }).limit(1).get();
  const doc = (res.data && res.data[0]) || null;
  if (!doc) return { success: false, errMsg: 'not found' };
  if (doc.status !== 'published' && doc.authorOpenid !== openid) {
    return { success: false, errMsg: 'not published' };
  }
  return { success: true, stage: sanitizeStage(doc, true) };
}

async function _findByStageId(stageId) {
  const res = await db.collection(COLLECTION).where({ stageId }).limit(1).get();
  return (res.data && res.data[0]) || null;
}

/** 官方精选关：首次上报 stats 时自动建 stub（布局仍在客户端本地包） */
async function _ensureOfficialStatsDoc(stageId) {
  if (!stageId || !String(stageId).startsWith('official_plaza_')) return null;
  const existing = await _findByStageId(stageId);
  if (existing) return existing;
  const now = Date.now();
  const stub = {
    stageId,
    source: 'official',
    featured: true,
    featuredRank: parseInt(String(stageId).slice(-3), 10) || 0,
    title: stageId,
    authorOpenid: '',
    authorName: '官方',
    authorAvatar: '',
    status: 'published',
    stats: {
      playCount: 0,
      clearCount: 0,
      challengeSendCount: 0,
      likeCount: 0,
    },
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  stub.heatScore = calcHeat(stub);
  const addRes = await db.collection(COLLECTION).add({ data: stub });
  return Object.assign({ _id: addRes._id }, stub);
}

async function _resolvePublishedStage(stageId) {
  let doc = await _findByStageId(stageId);
  if (doc && doc.status === 'published') return doc;
  if (!doc) doc = await _ensureOfficialStatsDoc(stageId);
  if (doc && doc.status === 'published') return doc;
  return null;
}

async function reportPlay(openid, data) {
  const stageId = String((data && data.stageId) || '').slice(0, 64);
  if (!stageId) return { success: false, errMsg: 'stageId required' };
  const doc = await _resolvePublishedStage(stageId);
  if (!doc) return { success: false, errMsg: 'not found' };
  const stats = doc.stats || {};
  stats.playCount = (stats.playCount || 0) + 1;
  const heatScore = calcHeat(Object.assign({}, doc, { stats }));
  await db.collection(COLLECTION).doc(doc._id).update({
    data: { stats, heatScore, updatedAt: Date.now() },
  });
  return { success: true, playCount: stats.playCount, heatScore };
}

async function reportClear(openid, data) {
  const stageId = String((data && data.stageId) || '').slice(0, 64);
  if (!stageId) return { success: false, errMsg: 'stageId required' };
  const doc = await _resolvePublishedStage(stageId);
  if (!doc) return { success: false, errMsg: 'not found' };
  const stats = doc.stats || {};
  stats.clearCount = (stats.clearCount || 0) + 1;
  const heatScore = calcHeat(Object.assign({}, doc, { stats }));
  await db.collection(COLLECTION).doc(doc._id).update({
    data: { stats, heatScore, updatedAt: Date.now() },
  });
  // 作者分成由客户端按日限发放；此处仅返回是否应为作者记分成（非本人）
  const grantShare = doc.authorOpenid && doc.authorOpenid !== openid;
  return {
    success: true,
    clearCount: stats.clearCount,
    heatScore,
    grantShare: !!grantShare,
    authorOpenid: grantShare ? doc.authorOpenid : '',
  };
}

async function bumpChallenge(openid, data) {
  const stageId = String((data && data.stageId) || '').slice(0, 64);
  if (!stageId) return { success: false, errMsg: 'stageId required' };
  const doc = await _findByStageId(stageId);
  if (!doc) return { success: false, errMsg: 'not found' };
  const stats = doc.stats || {};
  stats.challengeSendCount = (stats.challengeSendCount || 0) + 1;
  const heatScore = calcHeat(Object.assign({}, doc, { stats }));
  await db.collection(COLLECTION).doc(doc._id).update({
    data: { stats, heatScore, updatedAt: Date.now() },
  });
  return { success: true, challengeSendCount: stats.challengeSendCount, heatScore };
}
