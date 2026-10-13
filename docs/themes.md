# 主题与 Komari 兼容接口

[返回 README](../README.md) · [配置参考](configuration.md) · [安全说明](security.md)

## 内置主题与安装

内置 btop++ 看板包含集群、监控、详情视图，支持深浅色外观；Canvas 绘制实时波形，可切换盲文点阵、TTY 和方块符号。服务端还内嵌了 Meridian 子午（工业蓝图风格 3D 地图主题）：3D 地图节点分布、实时速率、告警与节点详情，数据全部来自 Cyber Probe 原生接口。管理后台固定使用 `/admin`，可从主题市场安装，也可上传第三方 ZIP。

独立 btop 主题维护在 [komari-theme-btop 仓库](https://github.com/wildalley/komari-theme-btop)。Meridian 主题维护在 [komari-theme-meridian 仓库](https://github.com/wildalley/komari-theme-meridian)，其编译产物放在 `cmd/server/themes/meridian`，随服务端二进制内嵌：服务端启动时若主题目录中没有该主题、或已装版本与内嵌版本不同，会自动安装，之后在管理后台「主题扩展 → 原生精选」中即可切换（不会自动改变当前启用的主题）。主题仓库发布新版本（提升 `komari-theme.json` 的 `version`）后，执行 `make sync-theme-meridian` 更新内嵌副本再重新构建，已部署实例才会覆盖更新。该主题曾名 Nezha Live（标识 `nezha-live`）：启动时若检测到旧主题，会删除旧目录，原先启用它的站点自动切换到 `meridian`。其它独立主题包有自己的发布周期，更新 Probe 不会自动更新已安装的主题包。

主题安装目录默认是工作目录的 `themes/`，可用 `PROBE_THEMES_DIR` 指向可写路径。Compose 将 `/app/themes` 挂载为持久卷，升级容器不会丢失已安装主题。

主题代码运行在站点的浏览器上下文中，安装来源应可信。ZIP 路径与大小校验保护文件系统边界，不是第三方 JavaScript 的安全审核。

## 市场与下载镜像

默认市场索引不可达时回退至 jsDelivr。设置 `PROBE_THEME_MARKET_URL` 可指定自有 `v1.json`，设置后不使用默认回退。

`PROBE_THEME_ASSET_MIRROR` 支持 URL 前缀或含 `{url}` 的模板，只改写 GitHub / githubusercontent 下载地址。提供 SHA256 的主题包仍会校验摘要。索引、包下载、镜像改写后的地址及重定向均受出站地址防护约束；内网源需显式启用相应配置。

安装包限制及名称规则见[安全说明](security.md#主题与请求限额)。

## 访问与 IP 显示

原生与 Komari 兼容遥测接口统一遵循站点公开/私有模式；管理接口及 `admin:` RPC 始终需要管理员会话。主题不能通过更换数据接口绕过登录要求。

公开模式下，访客的节点 IPv4 / IPv6 在服务端响应和推送中清空；内置主题同时移除 IP 栏与复制入口。第三方主题可能保留空白或占位符，但不会从这些节点地址字段得到真实 IP。管理员登录后，支持 IP 字段的接口正常返回地址。名称、备注或监测目标中手工填写的 IP 不会被文本扫描替换。

## 兼容接口

这是当前实现的接口范围，并非完整 Komari 服务端替代。主题依赖本表之外的接口时，需要单独适配。

| 传输 | 入口 | 用途 |
| --- | --- | --- |
| JSON-RPC 2.0 | `/api/rpc2`（HTTP POST / WebSocket） | 节点、实时状态、历史与指标 |
| REST | `/api/nodes` | 节点列表 |
| REST | `/api/recent/{uuid}` | 最近最多 150 个状态点 |
| REST | `/api/records/load`、`/api/records/ping` | 负载与探测记录 |
| REST | `/api/task/ping` | 探测任务 |
| REST | `/api/public`、`/api/version`、`/api/me` | 站点信息、版本与当前登录状态 |
| WebSocket | `/api/clients` | 实时遥测 |
| 管理 REST | `/api/admin/client/list`、`/api/admin/database/size` | 需管理员会话的兼容入口 |
| 静态资源 | `/assets/flags/*`、`/assets/flags-4x3/*`、`/assets/logo/*` | 地区旗帜与 OS 图标，找不到时提供内嵌兜底图标 |

常用 RPC：

- `common:getNodes`、`common:getNodesLatestStatus`、`common:getNodeRecentStatus`、`common:getRecords`（ping 记录除 `records` 外还返回 `tasks` 列表，附带窗口聚合的 `loss`、`avg`、`min`、`max`、`latest`，兼容 Blueprint 等调用 `task.loss.toFixed()` 的主题详情页）。
- `common:getPublicInfo`、`common:getVersion`、`common:getBackendVersion`。
- `public:listMetricDefinitions`、`public:queryMetrics`、`public:getPingMetricStats`、`public:getPublicPingTasks`。

方法名的 `public:` 前缀不代表私有站点允许匿名访问。实现与字段映射见 [komari_api.go](../pkg/server/komari_api.go) 和 [komari_model.go](../pkg/server/komari_model.go)。

## 指标语义

`public:queryMetrics` 提供 `ping.latency_ms`、`ping.loss`、`cpu.usage`、`memory.used`、`net.in.rate`、`net.out.rate`、`load.load1` 等指标；完整定义可通过 `public:listMetricDefinitions` 查询。

Ping 序列按 `tags.task_id` 分组。`ping.loss` 表示丢包事件：干净桶为 `0`，丢包桶为 `100`，丢包桶不下发延迟样本；窗口平均丢包率从统计接口与实时卡片获取，不能直接把事件值当作平均丢包率。

Agent 带 `probed_at` 时，每次真实探测只落库一次，以探测时间记录；重复上报不产生额外样本。`public:getPingMetricStats` 的丢包率按丢包次数 / 总次数计算，延迟 min / avg / p50 / p99 只统计成功探测；丢包行在 ping 记录中以 `value: -1` 表示。

旧 Agent 不带探测时间时回退为每次落库一行，丢包率标记 `loss_approximate`。获得逐次丢包记录需要同时支持探测时间和丢失事件位的 Agent。
