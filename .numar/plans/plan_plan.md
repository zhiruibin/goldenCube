---
id: plan
title: 我已经切成PLAN 模式了，你可以开搞了
created: 2026-08-10
updated: 2026-08-10
---

## Requirement (What & Why)
> User request: 「要有一个挑战结果列表页（待挑战列表、待对方应战列表、已完成列表等）」——即做一个完整的"向好友发起挑战"社交功能：游戏结束后把分数连同挑战话术分享给好友，好友应战比拼，并提供一个列表页管理三类记录。

现有分享只是"炫耀型"（`result-scene.js` 的 `_share()` 分享分数文案，卡片上写"你能超过我吗？"），没有挑战目标、没有胜负状态、没有记录列表。要形成"发起→应战→比拼→回击"的营销闭环，必须引入**云端挑战记录**（跨设备状态无法用本地 storage同步：本地无法知道对方是否已应战），并新增一个三 Tab 列表页。

## Scope
**Includes**:
- 挑战云函数：createChallenge / respondChallenge / getMyChallenges / getChallengeById 四个 action
- 客户端云服务封装 + 集合常量 + 云开发未部署时的优雅降级
- 新场景 challenge-scene：待对方应战 / 待我应战 / 已完成 三 Tab 列表页（含回击入口）
- 入口接入：game.js 场景注册 + 启动/回前台读取分享 query；home-scene 底部"挑战"入口
- 结算页改造：分享升级为"发起挑战"（带 query 挑战话术）；有未完成挑战时自动应战对比并写回，展示胜负横幅

**Excludes**:
- 好友排行榜改造（rank-scene 已有，不动）
- 云开发环境开通与函数部署（代码交付 + 部署说明，实际开通需用户在微信后台操作）
- 挑战成就 / 金币奖励联动（后续迭代）

## Approach
**Core idea**: 挑战记录以云数据库为准，本地只做"从卡片进入"的登记缓存。分享前先建 pending 记录并把记录 id 放进分享 `query`；被挑战者从卡片进入后本地登记为"待我应战"，玩完一局结算时自动对比分数并调云函数写回结果；列表页按三类状态从云端拉取展示，已完成记录支持"回击"（以自己更高分数重新发起）。

**挑战记录数据模型**（云集合 `challenges`）:
```
{ _id, challengerOpenid, challengerName, mode, score,
  status: 'pending' | 'completed',
  winner: 'challenger_win' | 'responder_win' | 'tie',
  createdAt, respondedAt }
```

**三个 Tab 语义**:
- **待对方应战** = 云端我发起且 `status=pending` 的记录（可撤回）
- **待我应战** = 本地 `pending_challenges` 缓存（从挑战卡片进入、尚未玩完，点击直接开局）
- **已完成** = 我发起或我应战且 `status=completed` 的记录（含胜负标识，每行"回击"按钮）

**Key technical choices**:
- 分享 `query` 携带 `challengeId`（`wx.shareAppMessage` 的 query 字段），被挑战者经 `wx.getLaunchOptionsSync()` / `wx.onShow(options)` 读取
- 云集合权限设为「仅云函数可读写」：应战者需更新发起者创建的记录，只能通过云函数（respondChallenge 用挑战 id + 当前用户 openid 鉴权，防止篡改他人记录）
- 挑战话术区分发起与应战：发起"向你发起挑战！经典模式 12345 分，敢超越吗？"，回击"我反超了！45678 分，再来？"
- 云开发未部署时全部降级：createChallenge 返回 offline → 分享退化为纯文案挑战（不带 query）；列表页显示"云开发未配置"提示，不阻塞游戏

**Alternatives considered and rejected**:
- 分享时不预建记录、只在应战时写库 → 无法支撑"待对方应战"列表，拒绝
- 挑战记录纯存本地 storage → 对方状态永远无法同步，跨设备需求不满足，拒绝
- 用好友排行榜数据代替挑战记录 → 排行榜无"待应战"语义、无法表达单人挑战，拒绝

## Affected files
| 文件 | 改动 |
|---|---|
| `cloudfunctions/challenge/index.js` | **新建**：四个 action 云函数 + 部署说明注释 |
| `js/scenes/challenge-scene.js` | **新建**：三 Tab 列表页（复用 rank-scene 的 Tab + 滚动模式） |
| `utils/cloud-config.js` | + `CHALLENGE_COLLECTION` 常量 |
| `utils/cloud-service.js` | + 4 个云函数封装（含未部署降级） |
| `game.js` | 注册 challenge 场景；启动/回前台读取 `query.challengeId` 登记本地 `pending_challenges` || `js/scenes/home-scene.js` | 底部功能行加「挑战」入口 |
| `js/scenes/result-scene.js` | `_share()` 改为先 createChallenge 再带 query 挑战话术；结算时若有待应战挑战自动对比、respondChallenge 写回、展示胜负横幅 |

## Risk
- **云开发未开通**：功能整体降级（分享退化为纯文案、列表页提示未配置），核心游戏不受影响——降级逻辑是本方案硬性要求
- **query透传失败**：部分安卓机型从卡片进入可能拿不到 query → 兜底为本地登记失败时提示"请在游戏中挑战"，不崩溃
- **openid 鉴权**：respondChallenge 必须校验记录属主/应战者身份，防止越权改分

## TODO LIST
- [✔] 设计并实现 challenge 云函数（createChallenge/respondChallenge/getMyChallenges/getChallengeById + 鉴权 + 部署说明）
- [✔] 扩展 cloud-service 与 cloud-config（挑战集合常量 + 4 个云能力封装 + 未部署降级）
- [✔] 新建挑战列表场景 challenge-scene（三 Tab：待对方应战/待我应战/已完成 + 滚动 + 撤回 + 回击）
- [✔] 接入入口与启动登记（game.js 注册场景与 query 读取、home-scene 挑战入口）
- [✔] 改造结算页为挑战分享 + 自动应战（_share 带 query 挑战话术、结算对比写回、胜负横幅）
- [✔] 语法检查与挑战闭环冒烟验证（创建→登记→应战→查询→降级路径）

## Acceptance (Done When)
- [ ] 全部新增/修改文件 `node --check` 语法通过、无语言服务诊断错误
- [ ] 挑战闭环（创建 pending → query 登记 → 应战写回 completed → 三 Tab 查询）经临时脚本冒烟验证通过
- [ ] 云开发未部署时：分享退化为纯文案、列表页提示"云开发未配置"，游戏可正常游玩
- [ ] 已完成挑战记录带胜负标识与"回击"入口，可再次发起新挑战
