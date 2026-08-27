/*** 成就定义数据
 * 四大系列：新手、高手、收集、社交
 * 每项包含 id / 名称 / 描述 / 图标 / 条件 / 奖励金币
 * 图标字段为统一矢量图标库 icon-renderer.js 中的图标名（非 emoji），
 * 由渲染层 IconRenderer.draw(ctx, icon, ...) 绘制，跨机型一致。
 *
 * 2025-08 经济平衡调整：
 *  - 下调零门槛/低难度成就奖励（点击即得、7-Bag 机制白送、存活时间型）
 *  - 保留高技术/肝帝证明项（3万分 800、T-Spin Double 400、Combo10 500、
 *    榜一 1000、5000 行 1500 等）作为长期目标
 *  - 成就奖励为一次性收益，不计入每日消行金币上限
 */

const achievements = {
  // ==================== 新手系列 ====================
  beginner: [
    {
      id: 'beginner_first_clear',
      name: '初见消行',
      desc: '首次消除一行',
      icon: 'sparkle',
      condition: { type: 'single_clear', count: 1 },
      reward: 10,
    },
    {
      id: 'beginner_double_clear',
      name: 'DOUBLE 入门',
      desc: '单次消除两行',
      icon: 'star',
      condition: { type: 'multi_clear', lines: 2, count: 1 },
      reward: 20,
    },
    {
      id: 'beginner_triple_clear',
      name: 'TRIPLE 达人',
      desc: '单次消除三行',
      icon: 'sparkle',
      condition: { type: 'multi_clear', lines: 3, count: 1 },
      reward: 40,
    },
    {
      id: 'beginner_tetris',
      name: 'PERFECT QUAD',
      desc: '单次消除四行',
      icon: 'fireworks',
      condition: { type: 'multi_clear', lines: 4, count: 1 },
      reward: 80,
    },
    {
      id: 'beginner_score_1000',
      name: '千分突破',
      desc: '单局得分达到 1000',
      icon: 'target',
      condition: { type: 'single_score', score: 1000 },
      reward: 20,
    },
    {
      id: 'beginner_play_5',
      name: '初出茅庐',
      desc: '累计游戏 5 局',
      icon: 'gamepad',
      condition: { type: 'total_games', count: 5 },
      reward: 15,
    },
    {
      id: 'beginner_clear_50',
      name: '消行新手',
      desc: '累计消除 50 行',
      icon: 'brick',
      condition: { type: 'total_clears', count: 50 },
      reward: 20,
    },
    {
      id: 'beginner_survive_60',
      name: '坚持一分钟',
      desc: '单局存活超过 60 秒',
      icon: 'clock',
      condition: { type: 'survive_time', seconds: 60 },
      reward: 15,
    },
  ],

  // ==================== 高手系列 ====================
  expert: [
    {
      id: 'expert_score_5000',
      name: '五千大关',
      desc: '单局得分达到 5000',
      icon: 'fire',
      condition: { type: 'single_score', score: 5000 },
      reward: 80,
    },
    {
      id: 'expert_score_10000',
      name: '万分俱乐部',
      desc: '单局得分达到 10000',
      icon: 'diamond',
      condition: { type: 'single_score', score: 10000 },
      reward: 200,
    },
    {
      id: 'expert_score_30000',
      name: '三万分传说',
      desc: '单局得分达到 30000',
      icon: 'crown',
      condition: { type: 'single_score', score: 30000 },
      reward: 800,
    },
    {
      id: 'expert_tetris_5',
      name: 'QUAD 大师',
      desc: '累计完成 5 次 QUAD',
      icon: 'bomb',
      condition: { type: 'multi_clear', lines: 4, count: 5 },
      reward: 120,
    },
    {
      id: 'expert_tspin',
      name: '旋转的艺术',
      desc: '完成一次 T-Spin 消行',
      icon: 'tornado',
      condition: { type: 'tspin_clear', count: 1 },
      reward: 150,
    },
    {
      id: 'expert_tspin_double',
      name: 'T-SPIN DOUBLE',
      desc: '完成一次 T-Spin Double',
      icon: 'tornado',
      condition: { type: 'tspin_clear', lines: 2, count: 1 },
      reward: 400,
    },
    {
      id: 'expert_back_to_back',
      name: '连击之王',
      desc: '达成 Back-to-Back 连续 3 次',
      icon: 'bolt',
      condition: { type: 'back_to_back', count: 3 },
      reward: 180,
    },
    {
      id: 'expert_combo_5',
      name: 'COMBO ×5',
      desc: '单局达成 5 连 COMBO',
      icon: 'link',
      condition: { type: 'combo', count: 5 },
      reward: 150,
    },
    {
      id: 'expert_combo_10',
      name: 'COMBO ×10',
      desc: '单局达成 10 连 COMBO',
      icon: 'rainbow',
      condition: { type: 'combo', count: 10 },
      reward: 500,
    },
    {
      id: 'expert_level_10',
      name: '速度恶魔',
      desc: '单局达到 10 级',
      icon: 'rocket',
      condition: { type: 'max_level', level: 10 },
      reward: 200,
    },
    {
      id: 'expert_clear_500',
      name: '消行专家',
      desc: '累计消除 500 行',
      icon: 'construction',
      condition: { type: 'total_clears', count: 500 },
      reward: 150,
    },
    {
      id: 'expert_survive_300',
      name: '五分钟不死',
      desc: '单局存活超过 300 秒',
      icon: 'shield',
      condition: { type: 'survive_time', seconds: 300 },
      reward: 180,
    },
  ],

  // ==================== 收集系列 ====================
  collection: [
    {
      id: 'collect_play_50',
      name: '乐此不疲',
      desc: '累计游戏 50 局',
      icon: 'dice',
      condition: { type: 'total_games', count: 50 },
      reward: 80,
    },
    {
      id: 'collect_play_200',
      name: '百战老将',
      desc: '累计游戏 200 局',
      icon: 'medal',
      condition: { type: 'total_games', count: 200 },
      reward: 250,
    },
    {
      id: 'collect_clear_100',
      name: '百行斩',
      desc: '累计消除 100 行',
      icon: 'hundred',
      condition: { type: 'total_clears', count: 100 },
      reward: 60,
    },
    {
      id: 'collect_clear_1000',
      name: '千行斩',
      desc: '累计消除 1000 行',
      icon: 'trophy',
      condition: { type: 'total_clears', count: 1000 },
      reward: 400,
    },
    {
      id: 'collect_clear_5000',
      name: '万行传说',
      desc: '累计消除 5000 行',
      icon: 'sparkle',
      condition: { type: 'total_clears', count: 5000 },
      reward: 1500,
    },
    {
      id: 'collect_tetris_20',
      name: 'QUAD 收藏家',
      desc: '累计完成 20 次 QUAD',
      icon: 'gift',
      condition: { type: 'multi_clear', lines: 4, count: 20 },
      reward: 350,
    },
    {
      id: 'collect_tspin_10',
      name: '旋转收藏家',
      desc: '累计完成 10 次 T-Spin 消行',
      icon: 'crystal',
      condition: { type: 'tspin_clear', count: 10 },
      reward: 500,
    },
    {
      id: 'collect_all_pieces',
      name: '七种武器',
      desc: '在一局中使用全部 7 种方块各至少一次',
      icon: 'puzzle',
      condition: { type: 'use_all_pieces', count: 1 },
      reward: 60,
    },
    {
      id: 'collect_coins_5000',
      name: '小有积蓄',
      desc: '累计获得金币达到 5000',
      icon: 'coin',
      condition: { type: 'total_coins', count: 5000 },
      reward: 150,
    },
    {
      id: 'collect_coins_20000',
      name: '富甲一方',
      desc: '累计获得金币达到 20000',
      icon: 'bank',
      condition: { type: 'total_coins', count: 20000 },
      reward: 500,
    },
  ],

  // ==================== 社交系列 ====================
  social: [
    {
      id: 'social_first_share',
      name: '分享快乐',
      desc: '首次分享游戏给好友',
      icon: 'share',
      condition: { type: 'share', count: 1 },
      reward: 10,
    },
    {
      id: 'social_share_10',
      name: '社交达人',
      desc: '累计分享 10 次',
      icon: 'megaphone',
      condition: { type: 'share', count: 10 },
      reward: 80,
    },
    {
      id: 'social_first_rank',
      name: '榜上有名',
      desc: '首次进入排行榜',
      icon: 'chart',
      condition: { type: 'enter_rank', count: 1 },
      reward: 15,
    },
    {
      id: 'social_rank_top_10',
      name: '前十强',
      desc: '在好友排行榜中进入前 10 名',
      icon: 'medal',
      condition: { type: 'rank_top', rank: 10 },
      reward: 100,
    },
    {
      id: 'social_rank_top_3',
      name: '三甲荣耀',
      desc: '在好友排行榜中进入前 3 名',
      icon: 'medal',
      condition: { type: 'rank_top', rank: 3 },
      reward: 400,
    },
    {
      id: 'social_rank_top_1',
      name: '王者之巅',
      desc: '在好友排行榜中夺得第 1 名',
      icon: 'trophy',
      condition: { type: 'rank_top', rank: 1 },
      reward: 1000,
    },
    {
      id: 'social_invite_friend',
      name: '呼朋唤友',
      desc: '通过分享邀请好友进入游戏',
      icon: 'handshake',
      condition: { type: 'invite_friend', count: 1 },
      reward: 30,
    },
    {
      id: 'social_invite_5',
      name: '人脉广布',
      desc: '累计邀请 5 位好友进入游戏',
      icon: 'users',
      condition: { type: 'invite_friend', count: 5 },
      reward: 250,
    },
  ],
}

/*** 获取所有成就的扁平列表
 * @returns {Array} 所有成就数组
 */
function getAllAchievements() {
  const list = []
  for (const category of Object.keys(achievements)) {
    for (const item of achievements[category]) {
      list.push({ ...item, category })
    }
  }
  return list
}

/*** 根据 id 查找成就
 * @param {string} id - 成就 id
 * @returns {Object|null} 成就对象或 null
 */
function getAchievementById(id) {
  for (const category of Object.keys(achievements)) {
    const found = achievements[category].find((a) => a.id === id)
    if (found) return { ...found, category }
  }
  return null
}

/*** 获取某系列成就列表
 * @param {string} category - 系列名称 (beginner / expert / collection / social)
 * @returns {Array} 成就数组
 */
function getAchievementsByCategory(category) {
  return achievements[category] || []
}

/*** 获取系列中文名映射
 */
const categoryNames = {
  beginner: '新手系列',
  expert: '高手系列',
  collection: '收集系列',
  social: '社交系列',
}

module.exports = {
  achievements,
  categoryNames,
  getAllAchievements,
  getAchievementById,
  getAchievementsByCategory,
}
