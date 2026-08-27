# 挑战云函数部署指南

挑战云函数为小程序提供好友挑战能力，包含发起挑战（createChallenge）、应战（respondChallenge）、我的挑战（getMyChallenges）、挑战详情（getChallengeById）四个接口。所有挑战记录均存储在云数据库 `challenges` 集合中，客户端不直接连接该集合，一切读写操作均通过云函数完成。

## 一、部署步骤

1. **开通云开发**：在微信开发者工具中点击「云开发」按钮开通，复用与 `rank` 云函数相同的云环境，并记录环境 ID。
2. **配置环境 ID**：打开 `utils/cloud-config.js`，将 `CLOUD_ENV` 配置为上一步记录的云环境 ID。
3. **上传并部署云函数**：在资源管理器中右键 `cloudfunctions/challenge`，选择「上传并部署：云端安装依赖」，首次部署会自动安装 `wx-server-sdk`。
4. **创建数据库集合**：在云开发控制台新建集合 `challenges`，权限选择「仅创建者可读写」。由于客户端不直接连接该集合，所有读写均通过云函数的管理端权限完成，因此可以设置为最严格的权限。
5. **（可选）创建索引**：建议为以下查询场景创建索引：
   - 待应战列表：`status`、`challengerOpenid`、`createdAt`
   - 我发起的已完成挑战：`status`、`challengerOpenid`、`respondedAt`
   - 我收到的已完成挑战：`status`、`responderOpenid`、`respondedAt`
6. **（可选）云端测试**：在云开发控制台的云函数测试面板选择 `challenge` 函数，传入测试参数：

```json
{
  "action": "createChallenge",
  "data": {
    "mode": "classic",
    "score": 1000,
    "nickname": "玩家A"
  }
}
```

预期返回：

```json
{
  "success": true,
  "challengeId": "xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

## 二、数据库集合字段说明

`challenges` 集合中的每条记录对应一次挑战，字段说明如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 自动生成的文档 ID，即 challengeId |
| `challengerOpenid` | string | 发起者 OpenID |
| `challengerName` | string | 发起者昵称 |
| `challengerAvatar` | string | 发起者头像 |
| `mode` | string | 挑战模式（如 `classic`） |
| `challengerScore` | number | 发起者分数 |
| `responderOpenid` | string | 应战者 OpenID |
| `responderName` | string | 应战者昵称 |
| `responderAvatar` | string | 应战者头像 |
| `responderScore` | number | 应战者分数 |
| `status` | string | 挑战状态：`pending`（待应战）/ `completed`（已完成） |
| `result` | string | 挑战结果（发起者视角）：`challenger_win` / `responder_win` / `tie` |
| `createdAt` | number | 创建时间戳 |
| `respondedAt` | number | 应战时间戳 |
| `expiresAt` | number | 过期时间戳（创建后 7 天过期） |

**状态流转说明**：

- `pending` 状态表示挑战等待被应战，应战后变为 `completed`，每条挑战仅可被应战一次；
- 发起者不能应战自己发起的挑战；
- 挑战过期（超过 `expiresAt`）后，不再出现在待应战列表中，且不可被应战。

## 三、云函数 API

云函数统一通过 `{ action, data }` 结构分发请求，客户端调用 `wx.cloud.callFunction({ name: 'challenge', data: { action, data } })`。所有接口均返回 `{ success: true, ... }`，失败时返回 `{ success: false, errMsg: '...' }`。

### 1. createChallenge — 发起挑战

请求：

```json
{
  "action": "createChallenge",
  "data": {
    "mode": "classic",
    "score": 1000,
    "nickname": "玩家A",
    "avatar": "https://example.com/avatar.png"
  }
}
```

响应：返回 `challengeId` 与 `challenge` 详情。

```json
{
  "success": true,
  "challengeId": "xxxxxxxxxxxxxxxxxxxxxxxx",
  "challenge": {
    "_id": "xxxxxxxxxxxxxxxxxxxxxxxx",
    "challengerOpenid": "oXXXX",
    "challengerName": "玩家A",
    "challengerAvatar": "https://example.com/avatar.png",
    "mode": "classic",
    "challengerScore": 1000,
    "status": "pending",
    "createdAt": 1700000000000,
    "expiresAt": 1700604800000
  }
}
```

### 2. respondChallenge — 应战

请求：

```json
{
  "action": "respondChallenge",
  "data": {
    "challengeId": "xxxxxxxxxxxxxxxxxxxxxxxx",
    "score": 950,
    "nickname": "玩家B",
    "avatar": "https://example.com/avatar-b.png"
  }
}
```

响应：返回 `result` 与双方分数。

```json
{
  "success": true,
  "result": "challenger_win",
  "challengerScore": 1000,
  "responderScore": 950
}
```

### 3. getMyChallenges — 我的挑战

请求：

```json
{
  "action": "getMyChallenges"
}
```

响应：返回 `pending` 与 `completed` 两类挑战数组。

```json
{
  "success": true,
  "pending": [
    {
      "_id": "xxxxxxxxxxxxxxxxxxxxxxxx",
      "challengerOpenid": "oXXXX",
      "challengerName": "玩家A",
      "challengerAvatar": "https://example.com/avatar.png",
      "mode": "classic",
      "challengerScore": 1000,
      "status": "pending",
      "createdAt": 1700000000000,
      "expiresAt": 1700604800000
    }
  ],
  "completed": [
    {
      "_id": "xxxxxxxxxxxxxxxxxxxxxxxx",
      "challengerOpenid": "oXXXX",
      "challengerName": "玩家A",
      "mode": "classic",
      "challengerScore": 1000,
      "responderOpenid": "oYYYY",
      "responderName": "玩家B",
      "responderScore": 950,
      "status": "completed",
      "result": "challenger_win",
      "createdAt": 1700000000000,
      "respondedAt": 1700003600000
    }
  ]
}
```

### 4. getChallengeById — 挑战详情

请求：

```json
{
  "action": "getChallengeById",
  "data": {
    "challengeId": "xxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

响应：返回 `challenge` 详情。

```json
{
  "success": true,
  "challenge": {
    "_id": "xxxxxxxxxxxxxxxxxxxxxxxx",
    "challengerOpenid": "oXXXX",
    "challengerName": "玩家A",
    "challengerAvatar": "https://example.com/avatar.png",
    "mode": "classic",
    "challengerScore": 1000,
    "responderOpenid": "oYYYY",
    "responderName": "玩家B",
    "responderAvatar": "https://example.com/avatar-b.png",
    "responderScore": 950,
    "status": "completed",
    "result": "challenger_win",
    "createdAt": 1700000000000,
    "respondedAt": 1700003600000,
    "expiresAt": 1700604800000
  }
}
```

## 四、费用说明

`challenge` 云函数复用与 `rank` 相同的云环境，无需额外开通资源。每次发起或应战挑战仅产生 1 次数据库写入和少量查询操作，远低于云开发免费额度，正常情况下无需担心费用问题。

## 五、常见问题

**Q1：通过分享卡片进入小程序后，查不到挑战？**

检查分享参数中的 `challengeId` 是否完整透传到目标页面，或该挑战是否已超过 7 天有效期。

**Q2：应战提示 `already responded`？**

说明该挑战已被其他用户抢先应战。每条挑战仅允许被应战一次，刷新待应战列表即可看到最新状态。

**Q3：客户端提示「云开发未配置」？**

检查 `challenges` 集合是否已创建、`challenge` 云函数是否已成功部署，以及 `utils/cloud-config.js` 中的 `CLOUD_ENV` 是否与当前云环境 ID 一致。