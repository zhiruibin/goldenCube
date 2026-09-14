# theme-event 云函数

部署后创建 `theme_events` 集合，并设置为仅云函数可读写。客户端调用 `getCurrent` 获取当前有效活动。

示例文档：

```json
{
  "eventId": "mid_autumn_2026",
  "enabled": true,
  "priority": 100,
  "title": "中秋专题",
  "subtitle": "月满矿洞，限时开挖",
  "description": "完成中秋限定挑战，收集金色方块。",
  "buttonSkin": "btnSquareGold",
  "accentColor": "#f2c94c",
  "badge": "限时",
  "startAt": 1789056000000,
  "endAt": 1790265600000
}
```

`buttonSkin` 当前支持 `btnSquareAmber`、`btnSquareGold`、`btnSquareBrown`、`btnSquareTeal`。新图片资源需先随小游戏版本预埋，再扩充白名单。
