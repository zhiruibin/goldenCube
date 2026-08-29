# 工坊 / 关卡广场云函数部署指南

`workshop` 云函数负责 UGC 发布、广场列表与游玩统计。客户端不直连集合，一律 `callFunction`。

## 部署

1. 复用与 `rank` / `challenge` 相同的云环境（`utils/cloud-config.js` 的 `CLOUD_ENV`）。
2. 右键 `cloudfunctions/workshop` → **上传并部署：云端安装依赖**。
3. 云开发控制台新建集合 **`workshop_stages`**，权限建议「仅创建者可读写」或更严（仅云函数管理员写）。
4. （可选）索引：`status` + `publishedAt`；`status` + `heatScore`；`stageId`；`authorOpenid`。

## API（`{ action, data }`）

| action | 说明 |
| --- | --- |
| `publishStage` | 机审 + 上架（须携带当前布局的 `authorBest.layoutHash`） |
| `delistStage` | 作者下架 |
| `listPlaza` | 广场列表 `sort=new\|heat\|clearRate` |
| `getStage` | 单关详情（含 `rows`） |
| `reportPlay` | 开打 +1 |
| `reportClear` | 通关 +1；返回 `grantShare` 供客户端发作者分成 |
| `bumpChallenge` | 该关被用来发起好友挑战 +1 |

## 日提交上限

同一作者每日新投稿 ≤ **3**（同 `stageId` 更新已发布关不另计）。
