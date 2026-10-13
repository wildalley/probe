# Changelog

## 2026-10-13 - 管理后台工业蓝图风格重构与 Meridian 子午主题

### 🎨 管理后台视觉重构 (Industrial Warm Blueprint)
- **统一步调与硬朗工业设计语言**：
  - 管理后台（`/admin`）整体全面重构为哪吒工业蓝图风格（直角 `rounded-none`、等宽字体 `font-mono`、工业线框 `var(--nezha-line)`、暖橙主色 `var(--nezha-accent)` 及双层面板底色）。
  - 统一操作按钮规整高度（`h-7` 28px 与 `h-8` 32px），规范所有图标尺寸与交互间距。
- **模块重构**：
  - **主机列表与资产卡片**（`HostTable`、`HostEditDialog`、`HostDeployDialog`、`AddNodeModal`）：重构价格显示、计费周期换算、到期剩余天数进度与状态标识，统一流量配额与手工校准设置。
  - **主题与扩展中心**（`ThemeManagerModal`）：完整重构 4 大子面板（内置精选、已安装主题、Komari 官方主题市场、ZIP/URL 导入自定义主题），支持一键安装、生效切换、独立包导出与卸载。
  - **全套辅助模块**：登录界面（`LoginScreen`）、密码修改弹窗（`ChangePasswordModal`）、标签输入框（`TagInput`）、带宽配置（`BandwidthConfig`）等全套组件视觉统一。

### 🚀 Meridian 子午主题与构建体系
- **实时监控蓝图工业风主题**（独立仓库 [komari-theme-meridian](https://github.com/wildalley/komari-theme-meridian)，原名 Nezha Live）：
  - 3D 地球 / 平面地图展示节点分布，配合节点列表、集群带宽曲线、告警流与节点详情大屏。
  - 数据全部来自 Cyber Probe 原生接口（`/api/v1/nodes` + `/api/v1/client/ws` 实时推送），移除演示数据与模拟刷新；流量、配额、资费、探测目标和硬件规格均读取节点真实状态，告警由离线 / 恢复、CPU 高负载与配额 ≥80% 的实际变化产生。
  - 主题随服务端二进制内嵌（`cmd/server/themes`），启动时若未安装或版本不同则自动安装，管理后台「原生精选」中即可切换，不改变当前启用的主题；`make sync-theme-meridian` 从独立仓库更新内嵌副本。
  - 改名为 Meridian 子午（标识 `meridian`），避免与哪吒监控混淆；启动时自动移除旧的 `nezha-live`，原先启用旧主题的站点切换到新主题。
  - 界面统一：顶栏只保留一个连接状态指示，切换按钮去掉 emoji，详情弹窗与焦点卡片全部接入四种语言，深浅色默认跟随系统；修复禁用本地存储时页面无法加载。
  - 可读性：网络柱 / 图例改用强调色（原先浅色下近白、深色下近黑，与底色难以区分）；3D 详情标签加宽，指标名不再与进度条重叠；统计条标签不再折行。
  - 移动端：顶栏折为两行，不再横向截断；节点列表排在地图之后、控制面板之前；3D 标签限制在地图范围内；详情弹窗隐藏空 IP 行，探测表收起地址列以容纳全部指标。

### 🔌 Komari 兼容
- `common:getRecords` 的 ping 记录额外返回 `tasks` 列表，附带窗口聚合的 `loss`、`avg`、`min`、`max`、`latest`，修复 Blueprint 等主题详情页调用 `task.loss.toFixed()` 报错。

### 🐛 交互体验与 Linux/Wayland 兼容性修复
- **下拉菜单与日期选择器浮层漂移修复**：
  - 彻底移除在 Linux/Chromium + Wayland 环境下会导致弹出层漂移至屏幕最左侧 `(0, y)` 的原生 `<input type="date">` 及 Portal 浮层。
  - 自研并引入相对容器锚定的内联蓝图下拉框 `BlueprintSelect` 与日历组件 `DatePicker`（支持预设快捷日期、剩余天数徽章与月历视图），确保在任何环境下均在触发器正下方精准展开。

## 2026-10-13 - 文档整理

- README 收敛为功能概览、快速部署与导航；配置、部署、运维、主题兼容、开发和安全说明拆分至 `docs/`。
- 移除过时的 uPlot、旧界面描述和中断任务日志，校正 Agent YAML 优先级、模拟器 Token 参数和历史更新日期。
- 安全审计归档到 `docs/security-audit-2026-10-12.md`，区分历史漏洞、已完成修复和部署边界。

## 2026-10-12 - 安全修复

- 公开模式下统一隐藏访客的节点 IPv4/IPv6：原生 REST、WebSocket 和 Komari RPC 均在服务端过滤；内置主题移除访客 IP 区域与复制入口，管理员登录后仍可查看。
- 修复私有模式下 Komari REST、RPC 和 WebSocket 的匿名数据访问；公开模式下管理接口仍要求会话。
- 修复主题安装和删除中的目录越界；新增隔离解压、文件类型与大小检查，以及旧主题替换失败回滚。
- 限制 HTTP/WS 消息大小、RPC 批次和处理并发，补充读写超时及会话撤销后断连。
- 主题市场、包下载及镜像接入 netguard，统一两个会话 Cookie 的 Secure、HttpOnly、SameSite 属性与退出清理。
- 升级 Go 工具链至 1.27.2、x/net 至 0.60.0、quic-go 至 0.59.1、source-map-js 至 1.2.2，并补充安全回归测试。

### 升级说明

- 重新构建并部署服务端后，权限修复和访客 IP 隐藏生效；无需 Agent 协议升级。
- Go 工具链更新不会自动进入现有二进制。要让 Agent 获得相应更新，需重新构建并升级各节点，操作见 [Agent 升级说明](docs/operations.md#升级-agent)。
- 管理兼容接口不再允许匿名访问；主题名称及 ZIP 限额开始严格校验，内网主题源需显式启用出站私网访问。详细边界见[安全说明](docs/security.md)。

## 2026-10-09 - 主题兼容性修复与统计准确性增强

### 🐛 主题兼容性修复

#### Blueprint 主题控制台错误修复
- **修复 `TypeError: Cannot read properties of undefined (reading 'toFixed')`**
  - `common:getRecords` 的 `tasks` 字段现在包含完整的聚合统计（min/max/avg/loss/p50/p99 等）
  - 新增 `komariPingTaskSummaries()` 函数生成符合主题预期的任务统计
  - 只包含有实际样本的任务（`Total > 0`），避免编造 0% 丢包率的占位数据
  - 添加测试 `TestKomariGetRecordsPingTaskStats` 验证统计值正确性

- **修复 `Manifest: Line: 1, column: 1, Syntax error`**
  - 改进管理路由匹配逻辑，使用完整路径段匹配而非简单前缀
  - `/admin-app/manifest.json` 等主题资源现在正确返回其自身内容
  - 新增 `isPathUnder()` 辅助函数和 `TestIsPathUnder` 测试

#### 前端体积优化
- Dashboard 首次加载 JS 体积：255 kB → **98 kB** gzip (-61%)
- CSS 体积：38.4 kB → **33.1 kB** gzip (-14%)
- 模态框改为 `React.lazy()` + `Suspense`，仅在打开时按需加载
- 添加 `class-utils` chunk 分离 clsx/tailwind-merge，避免静态引入整个 HeroUI
- 移除 12 个未使用组件：AgentVersionMark, Header, MetricBar, NodeDetailView, OsIcon, PingTracker, ServerCard, ServerDetailModal, ServerTable, TimeSeriesChart, AnimatedGradientText, BlurFade, Ripple, Spotlight
- 移除 uPlot 依赖及相关样式
- 清理 index.css 中未使用的动画和颜色变量

### 🔧 统计准确性增强

#### GeoIP 查询优化
- **修复并发重复查询问题**
  - 每个未解析 IP 的上报都会启动独立 goroutine + 最多 3 次 HTTP 请求，无并发控制
  - 新增 `geoIPInflight` sync.Map 追踪进行中的查询，防止重复启动
  - 添加 `beginGeoLookup()` 和 `endGeoLookup()` 函数实现飞行中去重

- **修复失败结果永久缓存**
  - 查询失败后缓存 `GLOBAL` 直到服务器重启，单次网络抖动会永久锁定节点为"未知"
  - 新增 `geoIPFailures` sync.Map 记录失败时间，10 分钟后自动重试
  - 仅缓存成功的解析结果，失败时返回 `GLOBAL` 但不持久化
  - 添加测试 `TestBeginGeoLookup` 验证并发去重和失败退避逻辑

#### Agent 时钟偏移校正
- **修复时钟偏移导致历史数据错位**
  - 历史记录和 ping 时间戳直接使用 Agent 上报的时间戳
  - NTP 失败或时钟大幅偏移的 Agent 会将数据写入未来或过去
  - 导致范围查询遗漏、retention 提前清理数据
  
- **实现自动时钟校正**
  - 新增 `clockOffset()` 函数检测 Agent 时钟与服务器时钟的偏移
  - 偏移超过 5 分钟时，统一将 `lastReportTs` 和所有 `ProbedAt` 时间戳重定基到服务器时钟
  - 保留相对间隔，小偏移保持原样以精确保留探测时间
  - 添加测试 `TestDownsamplerRebasesSkewedAgentClock` 验证一天偏移的数据正确落在服务器时间附近

#### 统计代码验证
- ✅ CPU 百分比：gopsutil 内部维护上次采样状态，多次调用正确计算增量
- ✅ 内存使用：gopsutil v4.26.8 在 Linux 上使用 `MemTotal - MemAvailable`，正确排除 buffers/cache
- ✅ 网络接口过滤：排除 lo/docker/veth/bridge/tun/wg 等虚拟接口，仅汇总物理网卡
- ✅ 网络速率：使用实际时间间隔计算，正确处理计数器重置
- ✅ Ping 延迟：单位毫秒，超时计为丢包而非延迟
- ✅ 丢包率：滑动窗口统计，百分比 (0-100)
- ✅ 流量校准模型：正确实现 baseline + (live - anchor)，计数器重置时折叠已统计流量
- ✅ Downsampler 去重：同一 `probed_at` 的重复探测仅存储一次

### 📝 技术细节

#### 文件变更
- `pkg/server/hub.go`: GeoIP 查询并发控制和失败重试逻辑
- `pkg/server/downsampler.go`: Agent 时钟偏移校正
- `pkg/server/komari_api.go`: Komari API 任务统计完整性
- `pkg/server/api.go`: 管理路由路径匹配改进
- `pkg/server/stats_fixes_test.go`: 新增统计修复测试
- `pkg/server/komari_rpc_test.go`: 更新相关测试
- `web/src/App.tsx`: 模态框懒加载
- `web/vite.config.ts`: class-utils chunk 分离
- `web/src/index.css`: 清理未使用样式
- `web/package.json`: 移除 uPlot 依赖

#### 测试覆盖
所有修复均有对应的单元测试：
- `TestClockOffset`: 验证时钟偏移计算
- `TestDownsamplerRebasesSkewedAgentClock`: 验证偏移校正的端到端行为
- `TestBeginGeoLookup`: 验证 GeoIP 并发控制和退避
- `TestKomariGetRecordsPingTaskStats`: 验证 Komari API 统计完整性
- `TestIsPathUnder`: 验证路径匹配逻辑

所有测试通过：`go test ./...` ✅

### 📦 部署说明
- **无需 Agent 更新**：所有修复均在服务端，现有 Agent 无需重新部署
- **向后兼容**：保持现有 Agent 协议，并补齐主题所需的兼容接口字段
- **自动生效**：更新服务端后，所有功能自动启用

---
