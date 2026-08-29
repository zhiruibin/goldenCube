/*** 挑战云函数 challenge
 ** 职责：
 * - createChallenge  发起挑战：创建一条 pending 状态的挑战记录
 * - respondChallenge 应战：校验后原子更新，防止并发重复应战
 * - getMyChallenges  我的挑战：返回我的 pending 与 completed 挑战列表
 * - getChallengeById 挑战详情：按 challengeId 返回单条挑战记录
 * - cancelChallenge  撤回挑战：仅发起者可撤回 pending 状态挑战
 * - syncMyProfile    资料回写：授权后刷新本人相关挑战上的昵称头像
 ** 调用约定：
 * - 入参 { action, data }，action 为方法名，data 为业务参数
 * - 通过 cloud.getWXContext() 获取 OPENID 鉴权，未授权返回 { success:false, errMsg:'unauthorized' }
 * - 成功返回 { success:true, ...data }，失败返回 { success:false, errMsg }
 ** 部署指引：
 * 1. 在微信开发者工具中右键 cloudfunctions/challenge -> “上传并部署：云端安装依赖”
 * 2. 在云开发控制台创建名为 challenges 的集合（与 utils/cloud-config.js 的 COLLECTION 保持一致）
 * 3. 集合权限建议设置为“仅创建者可读写”，便于挑战发起方管理自己的记录
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const COLLECTION = 'challenges'
const ALLOWED_MODES = ['classic', 'timed', 'marathon', 'special', 'stage', 'workshop']
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
const MAX_PENDING = 20
const MAX_LIST_SIZE = 50

/** 工坊挑战：消行越少越好，编码为越大越优的 score 以兼容旧比较逻辑 */
function encodeWorkshopScore(lines, pieces, timeMs) {
  const L = Math.min(999, Math.max(0, Math.floor(Number(lines) || 0)))
  const P = Math.min(999, Math.max(0, Math.floor(Number(pieces) || 0)))
  const T = Math.min(99999, Math.max(0, Math.floor((Number(timeMs) || 0) / 100)))
  return (1000 - L) * 100000000 + (1000 - P) * 100000 + (100000 - T)
}

function workshopIsBetter(a, b) {
  // a 是否优于 b（更少消行 → 更少块 → 更短时间）
  if (!b) return true
  if (a.lines !== b.lines) return a.lines < b.lines
  if ((a.pieces || 0) !== (b.pieces || 0)) return (a.pieces || 0) < (b.pieces || 0)
  return (a.timeMs || 0) < (b.timeMs || 0)
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { success: false, errMsg: 'unauthorized' }
  }

  const { action, data = {} } = event || {}

  try {
    switch (action) {
      case 'createChallenge':
        return await createChallenge(OPENID, data)
      case 'respondChallenge':
        return await respondChallenge(OPENID, data)
      case 'getMyChallenges':
        return await getMyChallenges(OPENID, data)
      case 'getChallengeById':
        return await getChallengeById(OPENID, data)
      case 'cancelChallenge':
        return await cancelChallenge(OPENID, data)
      case 'syncMyProfile':
        return await syncMyProfile(OPENID, data)
      default:
        return { success: false, errMsg: `unknown action: ${action}` }
    }
  } catch (err) {
    console.error('[challenge] unhandled error:', err)
    return { success: false, errMsg: err.message || 'internal error' }
  }
}

/*** 发起挑战
 * @param {string} openid 挑战发起者 openid
 * @param {Object} data { mode, score, nickname, avatarUrl, targetName, targetAvatar, targetOpenid,
 *   workshopStageId, workshopTitle, layoutSnapshot, challengerLines, challengerPieces, challengerTimeMs }
 */
async function createChallenge(openid, data) {
  try {
    const mode = data.mode
    if (!ALLOWED_MODES.includes(mode)) {
      return { success: false, errMsg: 'invalid mode' }
    }

    const nickname = String(data.nickname || '').slice(0, 32)
    const avatarUrl = String(data.avatarUrl || '').slice(0, 512)
    const targetName = String(data.targetName || '').slice(0, 32)
    const targetAvatar = String(data.targetAvatar || '').slice(0, 512)
    const targetOpenid = typeof data.targetOpenid === 'string' ? data.targetOpenid.slice(0, 64) : ''

    let score = Math.floor(Number(data.score))
    let workshopStageId = ''
    let workshopTitle = ''
    let layoutSnapshot = null
    let challengerLines = null
    let challengerPieces = null
    let challengerTimeMs = null

    // 工坊 / 官方关残局挑战：同一盘面比行数·块数·用时
    const isPuzzle = mode === 'workshop'
      || (mode === 'stage' && data.layoutSnapshot && typeof data.layoutSnapshot === 'object')
    if (isPuzzle) {
      workshopStageId = String(data.workshopStageId || data.stageId || '').slice(0, 64)
      workshopTitle = String(data.workshopTitle || data.stageTitle || (mode === 'stage' ? '闯关挑战' : '工坊关卡')).slice(0, 20)
      layoutSnapshot = data.layoutSnapshot || null
      if (!layoutSnapshot || typeof layoutSnapshot !== 'object') {
        return { success: false, errMsg: 'layoutSnapshot required' }
      }
      challengerLines = Math.max(0, Math.floor(Number(data.challengerLines) || 0))
      challengerPieces = Math.max(0, Math.floor(Number(data.challengerPieces) || 0))
      challengerTimeMs = Math.max(0, Math.floor(Number(data.challengerTimeMs) || 0))
      if (!(challengerLines >= 1)) {
        return { success: false, errMsg: 'invalid challenger lines' }
      }
      score = encodeWorkshopScore(challengerLines, challengerPieces, challengerTimeMs)
    } else {
      if (!(score > 0) || score > 99999999) {
        return { success: false, errMsg: 'invalid score' }
      }
    }

    const countRes = await db.collection(COLLECTION)
      .where({ status: 'pending', challengerOpenid: openid })
      .count()
    if (countRes.total >= MAX_PENDING) {
      return { success: false, errMsg: 'too many pending challenges' }
    }

    const now = Date.now()
    const record = {
      challengerOpenid: openid,
      challengerName: nickname || defaultName(openid),
      challengerAvatar: avatarUrl,
      mode,
      challengerScore: score,
      targetName,
      targetAvatar,
      targetOpenid,
      responderOpenid: '',
      responderName: '',
      responderAvatar: '',
      responderScore: null,
      status: 'pending',
      result: null,
      createdAt: now,
      respondedAt: null,
      expiresAt: now + EXPIRY_MS,
      workshopStageId,
      workshopTitle,
      layoutSnapshot,
      challengerLines,
      challengerPieces,
      challengerTimeMs,
      responderLines: null,
      responderPieces: null,
      responderTimeMs: null,
    }

    const res = await db.collection(COLLECTION).add({ data: record })
    return {
      success: true,
      challengeId: res._id,
      challenge: sanitize(record, res._id)
    }
  } catch (err) {
    console.error('[challenge] createChallenge error:', err)
    return { success: false, errMsg: err.message || 'create challenge failed' }
  }
}

/*** 应战
 * @param {string} openid 应战者 openid
 * @param {Object} data { challengeId, score, nickname, avatarUrl, lines, pieces, timeMs }
 */
async function respondChallenge(openid, data) {
  try {
    const challengeId = data && data.challengeId
    if (!challengeId) {
      return { success: false, errMsg: 'challengeId required' }
    }

    const nickname = String(data.nickname || '').slice(0, 32)
    const avatarUrl = String(data.avatarUrl || '').slice(0, 512)

    let record
    try {
      const res = await db.collection(COLLECTION).doc(challengeId).get()
      record = res.data
    } catch (err) {
      console.error('[challenge] get challenge error:', err)
      return { success: false, errMsg: 'challenge not found' }
    }

    if (record.status !== 'pending') {
      return { success: false, errMsg: 'challenge already responded' }
    }
    if (record.challengerOpenid === openid) {
      return { success: false, errMsg: 'cannot respond to own challenge' }
    }
    if (record.expiresAt < Date.now()) {
      return { success: false, errMsg: 'challenge expired' }
    }

    let score = Math.floor(Number(data.score))
    let responderLines = null
    let responderPieces = null
    let responderTimeMs = null
    let result

    const isPuzzle = record.mode === 'workshop'
      || (record.mode === 'stage' && record.layoutSnapshot)
    if (isPuzzle) {
      responderLines = Math.max(0, Math.floor(Number(data.lines != null ? data.lines : data.challengerLines) || 0))
      responderPieces = Math.max(0, Math.floor(Number(data.pieces != null ? data.pieces : 0) || 0))
      responderTimeMs = Math.max(0, Math.floor(Number(data.timeMs != null ? data.timeMs : 0) || 0))
      if (!(responderLines >= 1)) {
        return { success: false, errMsg: 'invalid lines' }
      }
      score = encodeWorkshopScore(responderLines, responderPieces, responderTimeMs)
      const a = { lines: responderLines, pieces: responderPieces, timeMs: responderTimeMs }
      const b = {
        lines: Number(record.challengerLines) || 0,
        pieces: Number(record.challengerPieces) || 0,
        timeMs: Number(record.challengerTimeMs) || 0,
      }
      if (workshopIsBetter(a, b)) {
        result = 'responder_win'
      } else if (workshopIsBetter(b, a)) {
        result = 'challenger_win'
      } else {
        result = 'tie'
      }
    } else {
      if (!(score >= 0) || score > 99999999) {
        return { success: false, errMsg: 'invalid score' }
      }
      if (score > record.challengerScore) {
        result = 'responder_win'
      } else if (score < record.challengerScore) {
        result = 'challenger_win'
      } else {
        result = 'tie'
      }
    }

    const now = Date.now()
    const updateData = {
      responderOpenid: openid,
      responderName: nickname || defaultName(openid),
      responderAvatar: avatarUrl,
      responderScore: score,
      status: 'completed',
      result,
      respondedAt: now,
    }
    if (isPuzzle) {
      updateData.responderLines = responderLines
      updateData.responderPieces = responderPieces
      updateData.responderTimeMs = responderTimeMs
    }

    const updateRes = await db.collection(COLLECTION)
      .where({ _id: challengeId, status: 'pending' })
      .update({ data: updateData })

    if (!updateRes.stats || updateRes.stats.updated === 0) {
      return { success: false, errMsg: 'challenge already responded' }
    }

    const merged = Object.assign({}, record, updateData)

    return {
      success: true,
      challengeId,
      result,
      mode: record.mode,
      challengerScore: record.challengerScore,
      responderScore: score,
      challengerLines: record.challengerLines,
      responderLines,
      challenge: sanitize(merged, challengeId, {
        opponentOpenid: record.challengerOpenid || '',
      })
    }
  } catch (err) {
    console.error('[challenge] respondChallenge error:', err)
    return { success: false, errMsg: err.message || 'respond challenge failed' }
  }
}

/**
/*** 撤回挑战
 * @param {string} openid 当前用户 openid
 * @param {Object} data { challengeId }
 */
async function cancelChallenge(openid, data) {
  try {
    const challengeId = data && data.challengeId
    if (!challengeId) {
      return { success: false, errMsg: 'challengeId required' }
    }

    let record
    try {
      const res = await db.collection(COLLECTION).doc(challengeId).get()
      record = res.data
    } catch (err) {
      console.error('[challenge] get challenge error:', err)
      return { success: false, errMsg: 'challenge not found' }
    }

    if (record.challengerOpenid !== openid) {
      return { success: false, errMsg: 'not authorized' }
    }
    if (record.status !== 'pending') {
      return { success: false, errMsg: 'challenge already responded' }
    }

    const updateRes = await db.collection(COLLECTION)
      .where({ _id: challengeId, status: 'pending' })
      .update({
        data: {
          status: 'cancelled',
          respondedAt: Date.now()
        }
      })

    if (!updateRes.stats || updateRes.stats.updated === 0) {
      return { success: false, errMsg: 'challenge already responded' }
    }

    return { success: true, challengeId }
  } catch (err) {
    console.error('[challenge] cancelChallenge error:', err)
    return { success: false, errMsg: err.message || 'cancel challenge failed' }
  }
}

/*** 我的挑战（pending + completed）
 * @param {string} openid 当前用户 openid
 * @param {Object} data 预留参数
 */
async function getMyChallenges(openid, data) {
  let pending = []
  let completed = []

  try {
    const pendingRes = await db.collection(COLLECTION)
      .where({
        status: 'pending',
        challengerOpenid: openid,
        expiresAt: _.gt(Date.now())
      })
      .orderBy('createdAt', 'desc')
      .limit(MAX_LIST_SIZE)
      .get()
    pending = (pendingRes.data || []).map((rec) => sanitize(rec, rec._id, { myRole: 'challenger' }))
  } catch (err) {
    console.error('[challenge] getMyChallenges pending error:', err)
    // 查询失败必须透出错误，避免前端把「查询挂了」误判成「确实没有挑战」
    return { success: false, errMsg: (err && (err.errMsg || err.message)) || 'get pending challenges failed' }
  }

  try {
    const [asChallenger, asResponder] = await Promise.all([
      db.collection(COLLECTION)
        .where({ status: 'completed', challengerOpenid: openid })
        .orderBy('respondedAt', 'desc')
        .limit(MAX_LIST_SIZE)
        .get(),
      db.collection(COLLECTION)
        .where({ status: 'completed', responderOpenid: openid })
        .orderBy('respondedAt', 'desc')
        .limit(MAX_LIST_SIZE)
        .get()
    ])

    const seen = {}
    const mergedList = (asChallenger.data || [])
      .concat(asResponder.data || [])
      .sort((a, b) => (b.respondedAt || 0) - (a.respondedAt || 0))

    completed = []
    for (const rec of mergedList) {
      if (seen[rec._id]) continue
      seen[rec._id] = true
      const iAmChallenger = rec.challengerOpenid === openid
      completed.push(sanitize(rec, rec._id, {
        myRole: iAmChallenger ? 'challenger' : 'responder',
        // 仅回传「对手」openid，供回击时写入 targetOpenid（不暴露双方全部 openid）
        opponentOpenid: iAmChallenger ? (rec.responderOpenid || '') : (rec.challengerOpenid || ''),
      }))
      if (completed.length >= MAX_LIST_SIZE) break
    }
  } catch (err) {
    console.error('[challenge] getMyChallenges completed error:', err)
    // 查询失败必须透出错误，避免前端把「查询挂了」误判成「没有完成的对决」
    return { success: false, errMsg: (err && (err.errMsg || err.message)) || 'get completed challenges failed' }
  }

  return { success: true, pending, completed }
}

/*** 挑战详情
 * @param {string} openid 当前用户 openid
 * @param {Object} data { challengeId }
 */
async function getChallengeById(openid, data) {
  try {
    const challengeId = data && data.challengeId
    if (!challengeId) {
      return { success: false, errMsg: 'challengeId required' }
    }

    let record
    try {
      const res = await db.collection(COLLECTION).doc(challengeId).get()
      record = res.data
    } catch (err) {
      console.error('[challenge] getChallengeById error:', err)
      return { success: false, errMsg: 'challenge not found' }
    }

    // 分享卡分流：前端据此区分发起方 / 被挑战方
    let myRole = 'invitee'
    if (record.challengerOpenid === openid) {
      myRole = 'challenger'
    } else if (record.responderOpenid === openid) {
      myRole = 'responder'
    }
    return {
      success: true,
      challenge: sanitize(record, challengeId, { myRole }),
    }
  } catch (err) {
    console.error('[challenge] getChallengeById error:', err)
    return { success: false, errMsg: err.message || 'get challenge failed' }
  }
}

/*** 输出白名单字段，避免泄露 openid 等内部信息
 * @param {Object} rec 数据库记录
 * @param {string} id challengeId
 */
function sanitize(rec, id, extra) {
  const r = rec || {}
  const out = {
    challengeId: id,
    mode: r.mode || '',
    challengerName: r.challengerName || defaultName(r.challengerOpenid),
    challengerAvatar: r.challengerAvatar || '',
    challengerScore: typeof r.challengerScore === 'number' ? r.challengerScore : null,
    targetName: r.targetName || '',
    targetAvatar: r.targetAvatar || '',
    responderName: r.responderName || (r.responderOpenid ? defaultName(r.responderOpenid) : ''),
    responderAvatar: r.responderAvatar || '',
    responderScore: typeof r.responderScore === 'number' ? r.responderScore : null,
    status: r.status || '',
    result: r.result || null,
    createdAt: r.createdAt || null,
    respondedAt: r.respondedAt || null,
    expiresAt: r.expiresAt || null,
    workshopStageId: r.workshopStageId || '',
    workshopTitle: r.workshopTitle || '',
    challengerLines: typeof r.challengerLines === 'number' ? r.challengerLines : null,
    challengerPieces: typeof r.challengerPieces === 'number' ? r.challengerPieces : null,
    challengerTimeMs: typeof r.challengerTimeMs === 'number' ? r.challengerTimeMs : null,
    responderLines: typeof r.responderLines === 'number' ? r.responderLines : null,
    responderPieces: typeof r.responderPieces === 'number' ? r.responderPieces : null,
    responderTimeMs: typeof r.responderTimeMs === 'number' ? r.responderTimeMs : null,
    ...(extra || {})
  }
  // 应战开局需要布局；列表也可带上（体积可控：残局 rows 很小）
  if (r.layoutSnapshot) {
    out.layoutSnapshot = r.layoutSnapshot
  }
  return out
}

/**
 * 用户授权/更新资料后回写：刷新本人作为发起方、应战方、意向目标的挑战展示字段。
 * 解决「对方后来授权了，列表里仍是默认昵称/无头像」的快照过期问题。
 */
async function syncMyProfile(openid, data) {
  const nickname = String((data && data.nickname) || '').slice(0, 32)
  const avatarUrl = String((data && data.avatarUrl) || '').slice(0, 512)
  if (!nickname) {
    return { success: false, errMsg: 'nickname required' }
  }

  let asChallenger = 0
  let asResponder = 0
  let asTarget = 0
  try {
    const c1 = await db.collection(COLLECTION).where({ challengerOpenid: openid }).update({
      data: {
        challengerName: nickname,
        challengerAvatar: avatarUrl,
      },
    })
    asChallenger = (c1 && c1.stats && c1.stats.updated) || 0
  } catch (e) {
    console.error('[challenge] syncMyProfile challenger:', e)
  }
  try {
    const c2 = await db.collection(COLLECTION).where({ responderOpenid: openid }).update({
      data: {
        responderName: nickname,
        responderAvatar: avatarUrl,
      },
    })
    asResponder = (c2 && c2.stats && c2.stats.updated) || 0
  } catch (e) {
    console.error('[challenge] syncMyProfile responder:', e)
  }
  try {
    const c3 = await db.collection(COLLECTION).where({ targetOpenid: openid }).update({
      data: {
        targetName: nickname,
        targetAvatar: avatarUrl,
      },
    })
    asTarget = (c3 && c3.stats && c3.stats.updated) || 0
  } catch (e) {
    console.error('[challenge] syncMyProfile target:', e)
  }

  return {
    success: true,
    updated: { asChallenger, asResponder, asTarget },
  }
}

/*** 默认昵称：玩家 + openid 后四位
 * @param {string} openid
 */
function defaultName(openid) {
  if (!openid || typeof openid !== 'string') return '玩家'
  return '玩家' + openid.slice(-4)
}