# 🛸 Cyber Probe · 自研高性能极客服务器探针系统

<p align="center">
  <img src="https://img.shields.io/badge/Agent%20RAM-5~10MB-emerald?style=flat-square&logo=go" alt="Agent RAM" />
  <img src="https://img.shields.io/badge/Agent%20CPU-~0%25-blue?style=flat-square&logo=linux" alt="Agent CPU" />
  <img src="https://img.shields.io/badge/UI%20Engine-uPlot%20%2B%20React%2019-violet?style=flat-square&logo=react" alt="Frontend" />
  <img src="https://img.shields.io/badge/Themes-Cyber%20Dark%20%7C%20Blueprint-indigo?style=flat-square" alt="Themes" />
  <img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License" />
</p>

> **极简轻量 Agent · 纯内存事件分发 Hub · 双主题赛博/蓝图看板 · 财务汇率与网络延迟丢包监测**  
> 一款专为极客、运维与 VPS 玩家打造的高性能、低开销自研服务器探针系统。

---

## ✨ 核心特性一览

### 1. 极轻被控端 (Agent)
- **零依赖单二进制**：纯 Go 静态交叉编译（`CGO_ENABLED=0`），内存严格控制在 **5~10MB**，日常 CPU 占用趋近于 **0%**。
- **单向出站长连接**：Agent 主动通过 WebSocket/WSS 向上连入 Hub，**无需开放受控机入站端口**，轻松穿透 NAT、家庭宽带与内网环境。
- **自动环境探测**：自动识别公网 IPv4 / IPv6、地理归属国家/地区、系统内核、虚拟化架构（KVM/Xen/LXC 等）。
- **流量与网速算法**：物理网卡与虚拟网卡智能过滤，自研差分即时速率算法，自动规避重启计数器归零与溢出异常。

### 2. 纯内存调度与时序分层持久化 (Server Hub)
- **纯内存高频广播**：Goroutine 高并发处理 Agent 连接池与 Web 客户端 1Hz 实时数据流推送。
- **Downsampler 降采样分层存储**：实时数据秒级内存广播；历史时序由降采样引擎批量写入嵌入式纯 Go SQLite（`modernc.org/sqlite`），杜绝磁盘 I/O 损耗与数据库膨胀。
- **单二进制全内置**：Web 前端基于 `//go:embed` 完整编译进单一二进制，无须额外安装 Nginx 或配置反向代理即可直接运行。

### 3. 极客视觉与交互系统 (Web Dashboard)
- **现代前端技术栈**：基于 React 19、Tailwind CSS 4 与 HeroUI 构建，兼顾统一交互、响应式布局与组件可访问性。
- **双主题支持**：**赛博暗黑（Cyber Dark）** 与 **蓝图工程（Geek Blueprint）**，全面优化强对比度与视觉层次，一键平滑切换。
- **uPlot 毫秒级时序图**：体积仅 30KB，微秒级渲染上万点数据；全功能 **Hover 垂直标尺 + 毛玻璃浮动指示气泡**，实时展示精确时间与数值。
- **网络质量监测系统 (Network Probes)**：支持 ICMP / TCP / HTTP 探测（Google、电信、YouTube、ChatGPT、Claude 等），多目标延迟与丢包率对比分析。
- **设备全景详情页**：
  - CPU 与负载、物理内存与 Swap、实时网络吞吐、TCP/UDP 连接数、磁盘读写 IOPS、进程数等 6 组轻量时序图表。
  - 公网 IPv4 / IPv6 双栈展示，支持 **IP 地址一键脱敏隐藏** 与 **一键复制真实地址**。
  - 硬件规格、CPU 型号、物理核心数、虚拟化类型、系统内核与厂商信息。
- **多资产财务定价与实时汇率折算**：
  - 支持多货币定价（USD, CNY, EUR, HKD, GBP, JPY），计费周期（按月/季/半年/年/两年/三年/一次性）。
  - 支持到期时间管理、剩余天数与自动续费提醒。
  - 自动拉取实时央行汇率，精确统计全集群每月总成本与当前各主机 **实时剩余价值（Remaining Value）**。
- **流量配额智能换算**：支持总额（GB / TB / PB / 无限）与已用流量配置，智能换算用量进度条与超额预警。
- **通信鉴权 Token 管理**：内置安全令牌体系，一键生成命令自动嵌入 Token，提供交互式换 Token 与动态吊销。
- **管理后台会话鉴权**：公开看板保持只读访问；节点配置、Token、通知与其他写操作需管理员登录，并支持修改密码后注销全部既有会话。
- **多色彩语义标签与收藏**：根据线路与特性（CN2, BGP, GIA, 1Gbps, 原生IP 等）自动渲染多彩色微光标签；支持单机星标置顶与收藏筛选。

---

## 🏛 架构与原理

```
  ┌────────────────────────────────────────────────────────┐
  │              Target Hosts (受控服务器集群)               │
  │                                                        │
  │  ┌──────────────────────┐    ┌──────────────────────┐  │
  │  │   Probe Agent (Go)   │    │   Probe Agent (Go)   │  │
  │  │   RAM: 5~10MB        │    │   RAM: 5~10MB        │  │
  │  │   CPU: ~0%           │    │   CPU: ~0%           │  │
  │  └──────────┬───────────┘    └──────────┬───────────┘  │
  └─────────────┼───────────────────────────┼──────────────┘
                │ WSS Outbound (单向主动出站) │
                ▼                           ▼
  ┌────────────────────────────────────────────────────────┐
  │             Server Hub (事件中心 / API 网关)             │
  │                                                        │
  │  ┌──────────────────────────────────────────────────┐  │
  │  │ In-Memory Node States & WebSocket Connection Pool│  │
  │  └──────────────────────────┬───────────────────────┘  │
  │               ▲             │                          │
  │               │             ▼ Downsampler              │
  │               │      ┌───────────────────────────┐     │
  │               │      │ modernc.org/sqlite        │     │
  │               │      │ (分层降采样持久化时序库)    │     │
  │               │      └───────────────────────────┘     │
  └───────────────┼────────────────────────────────────────┘
                  │ WebSocket Live Stream (1Hz 实时广播)
                  ▼
  ┌────────────────────────────────────────────────────────┐
  │    Web Dashboard (React 19 + Tailwind 4 + HeroUI)     │
  │                                                        │
  │  • 赛博暗黑 / 蓝图工程双主题，高对比度与网格微光纹理       │
  │  • uPlot 极速时序图 (带垂直光标指示与毛玻璃 Hover Tooltip)│
  │  • 网站延迟丢包质量监测 (Google / Cloudflare / 电信等)  │
  │  • 财务汇率月度总览、剩余价值折算、流量配额进度计算       │
  │  • 单二进制 embed.FS 零依赖打包分发                    │
  └────────────────────────────────────────────────────────┘
```

---

## 🚀 快速上手

### 1. 编译全部可执行文件

本系统支持一键打包编译：

```bash
# 克隆仓库
git clone https://github.com/wildalley/probe.git
cd probe

# 编译全部组件（前端自动打包并嵌入服务端二进制中）
make build-all
```

编译产物位于 `bin/` 目录：
- `bin/probe-server`：包含 API 网关、WSS Hub、SQLite 存储与 Web 前端界面的单二进制程序（约 25MB）。
- `bin/probe-agent`：纯静态交叉编译的被控端 Agent 二进制程序（约 6.8MB）。

---

### 2. 启动服务端 (Probe Server)

```bash
# 推荐在首次启动前显式设置管理员密码
PROBE_ADMIN_USER=admin \
PROBE_ADMIN_PASSWORD='请替换为强密码' \
./bin/probe-server -addr :8080 -db probe.db
```

常用参数说明：
- `-addr`：监听地址与端口（默认 `:8080`）。
- `-db`：SQLite 数据文件路径（默认 `probe.db`）。
- `-flush-interval`：历史数据批量写入间隔秒数（默认 `15` 秒）。
- `-retention-days`：历史时序数据保存天数（默认 `7` 天）。

服务启动后，在浏览器访问 `http://localhost:8080` 即可打开只读监控看板；进入管理后台时需要登录。

首次启动时会同时创建管理员账号与 Agent 通信 Token：

- 未设置 `PROBE_ADMIN_PASSWORD` 时，服务端会生成随机初始密码并仅在首次启动日志中显示；登录后应及时修改。
- 未设置管理员用户名时使用 `admin`。数据库中已存在管理员账号时，环境变量不会覆盖现有密码。
- 初始 Agent Token 也会按安装随机生成并写入启动日志，可登录管理后台复制或轮换，不再使用固定默认 Token。

可用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PROBE_ADMIN_USER` | `admin` | 首次创建管理员时使用的用户名 |
| `PROBE_ADMIN_PASSWORD` | 随机生成 | 首次创建管理员时使用的密码；建议生产环境显式设置 |
| `PROBE_ALLOWED_ORIGINS` | 本地 Vite 开发地址 | 额外允许携带会话 Cookie 的跨域来源，多个来源用逗号分隔 |

> 管理会话保存在服务端内存中，有效期为 7 天；重启服务端会使已有会话失效。生产环境建议通过 HTTPS 访问，以启用 Cookie 的 `Secure` 属性。

---

### 3. 一键部署被控端 (Agent)

使用管理员账号登录后，在 Web 界面点击右上角 **「管理后台」** 或 **「快速部署」**，即可获取自动嵌入当前通信 Token 与自适应参数的命令。

只需在目标 Linux 服务器上以 root 身份执行：

```bash
curl -sSL http://<你的服务端IP或域名>:8080/install.sh | sudo bash -s -- \
  --server "ws://<你的服务端IP或域名>:8080" \
  --token "<从管理后台复制的 Agent Token>" \
  --name "Silicon Valley Gateway" \
  --region "US"
```

> **自动特性**：
> - 地区参数 `--region` 留空时，脚本将自动根据公网 IP 智能识别归属国家与城市。
> - 脚本会自动创建并注册 `probe-agent.service` Systemd 系统服务，支持开机自启与异常断线自愈。

#### Agent 常用运维命令
```bash
systemctl status probe-agent   # 查看探针运行状态
journalctl -u probe-agent -f   # 查看实时运行日志
systemctl restart probe-agent  # 重启探针服务
bash install.sh --uninstall    # 一键彻底卸载探针与清理服务
```

---

### 4. 手动运行 Agent (调试模式)

```bash
./bin/probe-agent \
  --server "ws://127.0.0.1:8080" \
  --token "<从管理后台复制的 Agent Token>" \
  --node-id "node-01" \
  --name "本地主机" \
  --region "CN" \
  --interval 1
```

---

### 5. 多节点仿真测试

无需真实部署多台 VPS，即可通过内置的仿真脚本体验 4 台分布式节点的实时动态监控：

```bash
python3 -m pip install websocket-client
python3 scripts/simulate_nodes.py \
  ws://127.0.0.1:8080/api/v1/agent/ws \
  "<从管理后台复制的 Agent Token>"
```

---

## 📁 目录结构

```
probe/
├── cmd/
│   ├── agent/                 # Agent 采集端入口
│   └── server/                # Server 调度端入口（含 //go:embed 静态资源打包）
├── pkg/
│   ├── agent/                 # 采集逻辑、网卡过滤、差分速率计算、WSS 客户端
│   ├── model/                 # 协议模型与数据结构
│   └── server/                # 纯内存 Hub、Downsampler 降采样、SQLite 持久化、REST API
├── web/                       # React 19 + Vite + Tailwind CSS 4 + HeroUI + uPlot 前端源码
│   ├── src/
│   │   ├── components/        # 仪表盘卡片、图表组件、管理弹窗、详情页等
│   │   ├── utils/             # 标签配色系统、汇率计算、国旗解析、单位格式化
│   │   └── types/             # 前端 TypeScript 类型定义
├── deploy/                    # 一键部署脚本与 Systemd 模板
├── scripts/                   # 集群模拟器与辅助运维脚本
├── Makefile                   # 统一构建自动化
└── README.md                  # 详细使用文档
```

---

## 🛡️ 安全与权限规范

1. **管理后台鉴权**：监控数据可只读访问；所有修改操作、通信 Token 与通知凭据均受管理员会话保护。密码使用 bcrypt 哈希存储，修改后会注销全部已有会话。
2. **Token 鉴权机制**：服务端与被控端之间采用每套安装随机生成的安全 Token 握手机制，未授权的连接直接被拒绝，支持后台多 Token 动态分发与废止。
3. **只读信息采集**：Agent 端仅采集只读的系统硬件、负载与流量指标，不具备任何远程命令执行（RCE）通道，保障受控主机绝对安全。
4. **敏感信息脱敏**：前端提供 IP 脱敏隐藏开关（如 `154.82.***.***`），方便截图分享与多用户公开展示。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 协议开源。
