# 排行榜云函数部署指南

本云函数提供「全服排行榜」能力：分数提交、排行榜查询、我的排名查询。好友排行榜走微信开放数据域（见 `openDataContext/`），无需云函数。

## 一、部署步骤

1. **开通云开发**
   - 在微信开发者工具中点击「云开发」按钮，按提示开通（需绑定 AppID，个人主体亦可）。
   - 开通后记录环境 ID（如 `tetris-1a2b3c`）。

2. **配置环境 ID**
   - 打开 `utils/cloud-config.js`，将 `CLOUD_ENV` 改为你的环境 ID。
   - 留空则使用默认环境（推荐显式指定，避免多环境混淆）。

3. **上传云函数**
   - 在微信开发者工具中，右键 `cloudfunctions/rank` 目录 →「上传并部署：云端安装依赖」。
   - 等待部署完成（首次部署会自动安装 `wx-server-sdk`）。

4. **创建数据库集合**
   - 新建 `rankings`：生涯总榜，兼容旧数据。
   - 权限设置选择「所有用户可读，仅创建者可读写」。
     - 说明：全服排行榜需要所有玩家都能读到他人记录，因此不能选「仅创建者可读写」；
     - 云函数使用管理端权限读写，不受集合权限限制，因此安全性由云函数保证。

5. **（可选）验证**
   - 在云开发控制台 →「云函数」→ `rank` →「云端测试」，传入：

```json
{
  "action": "submitScore",
  "data": { "mode": "stage", "score": 1000 }
}
```

   应返回 `{ "success": true, "isNewRecord": true, "rank": 1 }`。

## 二、数据库集合字段说明

`rankings` 集合每条记录：

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动生成 |
| `openid` | string | 用户标识（云函数自动获取） |
| `mode` | string | `stage`（榜分区 boardKey） |
| `score` | number | 该用户该模式历史最高分 |
| `detail` | object/null | 游戏详情（消行、T-Spin 等） |
| `nickname` | string | 昵称（可为空，前端显示默认名） |
| `avatarUrl` | string | 头像 URL（可为空） |
| `updatedAt` | number | 最近写入时间（含资料回写） |
| `achievedAt` | number | 当前生涯最佳的达成时间，用于完全同分时稳定排序 |

**写入策略**：每个用户每个模式仅保留一条记录；仅当本次分数高于历史最高分时才更新分数与 `achievedAt`；仅改昵称/头像时不得刷新 `achievedAt`。

**索引（必须）**：

- `rankings`：`mode` + `clearedCount DESC` + `linesSum ASC` + `piecesSum ASC` + `timeSum ASC` + `achievedAt ASC`
为了计算精确的「我的名次」，还需以 `mode` 开头，依次追加 `clearedCount`、`linesSum`、`piecesSum`、`timeSum` 建立计数索引。

**旧数据**：缺 `achievedAt` 的记录会在下次 `submitScore`（含纯资料回写）时用历史 `updatedAt`/`createdAt` 回填，不会写成当前时间。

## 三、云函数 API

### 1. `submitScore` 提交分数

```json
{
  "action": "submitScore",
  "data": {
    "mode": "stage",
    "score": 1000,
    "detail": { "lines": 20 },
    "nickname": "玩家A",
    "avatarUrl": "https://..."
  }
}
```

返回：`{ success, isNewRecord, rank, score, mode }`

### 2. `getRankList` 查询排行榜

```json
{
  "action": "getRankList",
  "data": {
    "mode": "stage",
    "type": "all"
  }
}
```

- `type`: `all`（全服）| `friend`（好友，需 `friendOpenIds`）
- 全服榜固定只返回生涯 Top 20，不分页、不设周榜/月榜。
- 返回：`{ success, list, total, page, pageSize, myRank, myScore }`

### 3. `getMyRank` 查询我的排名

```json
{ "action": "getMyRank", "data": { "mode": "stage" } }
```

返回：`{ success, myRank, myScore, hasRecord }`

## 四、费用说明（个人小游戏起步够用）

- 云开发免费额度包含一定量的数据库读写次数、云函数调用次数、存储空间。
- 排行榜场景：每局游戏 1 次写入 + 少量查询，个人项目远低于免费额度。
- 若后续用户量增长，可在控制台按需升级，无需自建服务器。

## 五、常见问题

- **调用云函数报 `env not found`**：`CLOUD_ENV` 填错或未开通对应环境，检查 `utils/cloud-config.js`。
- **查询为空但已提交分数**：确认 `rankings` 集合和上述复合索引已创建。
- **真机好友榜为空**：好友榜需要双方都玩过且授权「好友关系」，且需在开放数据域中确认 `openDataContext/` 已正确配置（`game.json` 的 `openDataContext` 字段）。
- **本地开发者工具无好友数据**：开发者工具不支持 `wx.getFriendCloudStorage` 返回真实好友，属正常现象，真机预览可见。
