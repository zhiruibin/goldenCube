# 挖个方块 · 「模式」残留纠正设计

> 状态：**设计定稿，分阶段改代码**  
> 背景：产品从「方块过把瘾 / tetris-mini」fork 而来，UI 与经济文档已明确**没有**经典 / 限时 / 马拉松等「模式」；但引擎、结算、挑战、回放、云配置仍大量使用 `mode` 与旧模式名，易造成无效改动与二次污染。  
> 对齐：[`gc-economy-design.md`](./gc-economy-design.md) §3、「产品只有章节残局闯关」；[`gc-workshop-plaza-design.md`](./gc-workshop-plaza-design.md)。

---

## 1. 产品事实（说什么、不说什么）

### 1.1 玩家可见的玩法入口（不是「模式」）

| 入口 | 玩家说法 | 实际内容 |
|------|----------|----------|
| 闯关 | 选章选关 | 官方 10×10 残局 |
| 关卡广场 | 逛关 / 开打 | 官方精选 + UGC 发布关 |
| 工坊 | 造关 / 自通 / 发布 | 作者布局，不产金方块 |
| 好友挑战 | 发起 / 应战 / 回击 | **挂在某一关上的对决**，不是独立模式 |

首页不应出现「经典模式 / 限时赛 / 马拉松」等入口或文案。

### 1.2 禁止的旧作概念

以下属于 **tetris-mini 遗留**，挖个方块**不提供、不上榜、不结算**：

- `classic` / `timed` / `marathon` / `special`（方块实验室）
- 「模式分榜」「模式名 HUD」「看广告复活（经典）」
- `gc_bestScore_classic` 一类按模式存最佳分（若仍写入，视为死数据）

### 1.3 允许保留的「类型」字段（改名，勿当模式）

系统内部仍需要区分「这局在打什么盘」，但**产品语言不要叫模式**：

| 建议字段名 | 取值 | 含义 |
|------------|------|------|
| `playContext`（对局上下文） | `stage` \| `plaza` \| `workshop` \| `challenge` | 从哪条产品线开的局 |
| `layoutSource`（盘面来源） | `official_stage` \| `official_plaza` \| `ugc` | 布局从哪来 |
| `challengeKind`（挑战内容类型） | `stage` \| `workshop` \| `plaza` | 挑战挂的是哪类关 |

**过渡期**：代码里可继续叫 `mode`，但**取值集合必须收敛**；对外文案禁止「××模式」。

---

## 2. 现状盘点（代码里 `mode` 实际在干什么）

### 2.1 已基本正确

| 位置 | 现状 |
|------|------|
| `cloudfunctions/rank` | `ALLOWED_MODES = ['stage']`，复合键闯关榜 |
| `GAME_MODES`（cloud配置） | 仅 `['stage']` |
| 闯关 / 广场开打 | 多数传 `mode: 'stage'` + `stageId` / workshop 布局 |
| 经济 / 工坊设计文档 | 已写死「无经典限时马拉松」 |

### 2.2 仍是旧作逻辑（需纠正）

| 位置 | 问题 |
|------|------|
| `game-scene.js` | 默认 `_mode = 'classic'`；仍有 `timed` 倒计时、`marathon` 目标行、经典复活分支 |
| `tetris-engine.js` | `setMode` 默认 `classic`，保留旧模式行为 |
| `result-scene.js` | `_modeName`、按 `mode` 存 `gc_bestScore_*`、重开带 `mode: classic` |
| `challenge-result-scene.js` | `MODE_NAMES` 含经典/限时/马拉松；标题区展示「经典模式」 |
| `utils/cloud-config.js` | `CHALLENGE_MODES` 仍含 `classic/timed/marathon/special`；`MODE_NAMES` 仍有旧名 |
| `challenge` 云函数 README / 示例 | 示例 `mode: "classic"` |
| `replay-scene.js` | 缺省 `classic`；非 classic 才附加「模式」文案 |
| 回放 `meta.mode` | 混用 `stage` / `classic`，语义不清 |

### 2.3 易混淆点（改时最容易改错）

1. **排行榜的 `mode: 'stage'`**  
   不是「闯关模式」产品名，而是**榜分区键**（每人每区一条）。挖个方块主榜只有这一区。可保留字段名 `mode`，但文档与注释应写成 **`boardKey` / 榜分区 = stage（闯关复合榜）**。

2. **挑战记录的 `mode`**  
   表示「挑战挂在哪类关」：`stage` / `workshop`（及将来 `plaza`）。**不是**经典限时马拉松。应收敛为挑战内容类型，删除对旧模式的允许列表。

3. **引擎 `setMode('stage')`**  
   表示残局规则（垃圾不坠落、SETTLING 塌缩等），是**规则开关**，不是产品「模式页」。可保留引擎内部枚举，但取值只留与残局相关的（如 `stage`），删掉 timed/marathon 分支或标为 dead code。

---

## 3. 目标模型（改完后长什么样）

```
开局参数（建议语义）
├─ playContext: stage | plaza | workshop | challenge
├─ layout: { stageId } | { workshopStageId, rows } | { plazaStageId, rows }
├─ challengeId?（仅挑战）
└─ engineRule: stage   // 挖个方块对局一律残局规则

结算 / 回放
├─ 文案：关卡名 / 广场关名 / 「好友挑战」，禁止「经典模式」
├─ 本地回放 key：按 playContext + id，不按 classic/timed
└─ 上报排行：仅主线闯关复合键 → boardKey=stage；广场/工坊不上主榜

挑战
├─ challengeKind: stage | workshop | plaza
└─ 列表副文案：「闯关挑战」「工坊关挑战」「广场关挑战」
```

---

## 4. 分阶段落地（避免无效大改）

### P0 · 文案与入口止血（小、安全）

**目标**：玩家看不见「模式」旧词；默认不再落到 `classic`。

1. 删除 / 改写所有面向玩家的「经典模式 / 限时赛 / 马拉松 / 方块实验室」。  
2. `challenge-result` / `result`：有关卡名或挑战类型就显示关卡/挑战文案；无则显示「本局结束」，**不**显示模式名。  
3. `cloud-config.MODE_NAMES`：只保留 `stage` / `workshop` / `plaza` 的挑战文案；旧 key 可留映射但 UI 不用。  
4. `game-scene` 开局：无参时默认 **`stage` 残局规则**（或强制要求调用方传清上下文），禁止默认 `classic`。  
5. `CHALLENGE_MODES`：改为 `['stage', 'workshop']`（+ 可选 `plaza`）；拒绝创建 classic/timed/marathon。

**验收**：全局搜玩家可见字符串，无「经典模式」「限时」「马拉松」；挑战列表副文案为「闯关挑战 / 工坊挑战」。

### P1 · 对局路径收敛（中）

**目标**：所有真实开局都走残局规则；旧模式分支不再可达。

1. 盘点所有 `switchTo('game' / 'switchTo')`：必须带 `playContext`（或现有等价：`stage` + stageId / workshop 标记）。  
2. 删除或 `#ifdef` 掉 `timed` / `marathon` 倒计时与目标行逻辑、经典复活。  
3. `result-scene`：去掉按 `gc_bestScore_${mode}` 的经典最佳分；主线成绩只走金方块 / 关卡最佳。  
4. 回放：`meta` 写清 `playContext` + `stageId` / `workshopRows`；缺省按 stage 残局初始化，不按 classic。

**验收**：代码路径上无法开到 timed/marathon；回放工坊关不依赖 classic。

### P2 · 命名清理与云示例（可缓）

**目标**：降低后续误用；不强制一次改完字段名。

1. 注释 / README：rank 的 `mode` 标明「榜分区 boardKey」；challenge 的 `mode` 标明「challengeKind」。  
2. 挑战云函数 README 示例改为 `stage` / `workshop`。  
3. （可选）新代码用 `playContext` / `challengeKind`；旧字段 `mode` 做一层适配，避免大爆炸重命名。

**不建议一次性全局 rename `mode` → `playContext`**：触面过大，收益主要是可读性，应放在行为收敛之后。

---

## 5. 明确不做（防止无效改动）

| 不做 | 原因 |
|------|------|
| 为广场/工坊再开一套 rank `mode` | 主榜已定复合键；广场热度另算，不混 rankings |
| 把「官方 / 新关 / 热门」做成 mode | 那是广场排序 Tab，不是对局模式 |
| 复活 / 限时 HUD 迁到闯关 | 产品未定义；残局失败走失败页与广告入场 |
| 先大改引擎 API 名再改产品路径 | 应先断旧入口，再考虑 rename |
| 为兼容 tetris-mini 保留可玩的 classic | 双产品心智冲突，且经济文档已废弃 |

---

## 6. 与「回放」的关系

回放扩展时遵守本设计：

- 结算「回看本局」按 **playContext** 存 key，不按 classic/timed。  
- 云端 rankings.replay：仅随 **闯关复合榜破纪录** 更新（已是「最佳一局」而非全量）；与「模式」无关。  
- 勿新增 `mode: classic` 的回传。

---

## 7. 建议实施顺序（确认后再写代码）

1. **先合本设计**（本文）  
2. **P0 文案 + 默认值 + 挑战允许列表**（半日级）  
3. **P1 砍 timed/marathon/classic 可达路径**（需回归：闯关、广场、工坊、挑战）  
4. **P2 注释与可选 rename**（有空再做）

确认 P0 / P1 范围后，再按阶段改代码，避免在旧「模式」框架上继续堆功能。

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-30 | 初稿：厘清无「模式」、盘点残留、playContext/challengeKind、分阶段与禁止项 |
