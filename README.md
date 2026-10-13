# Cyber Probe

基于 Go 和 React 的服务器监控系统。Agent 主动连接服务端，上报主机资源、流量和网络探测结果；服务端提供实时看板、历史记录、节点管理和告警。

## 主要功能

- **主机监控**：CPU、内存、磁盘、网络吞吐、系统规格与公网 IPv4 / IPv6。
- **实时看板**：内置 btop++ 风格的集群、单机监控和详情视图，支持深浅色外观与移动端。
- **网络探测**：ICMP、TCP、HTTP 延迟与丢包记录，可按节点分配目标。
- **资产管理**：价格、计费周期、到期日、汇率折算、流量配额与手工校准。
- **通知**：Telegram、Discord、自定义 Webhook，支持离线、恢复、流量预警和每日简报。
- **主题扩展**：主题市场、ZIP 安装及 Komari 兼容数据接口；内置 [Nezha-Live](https://github.com/wildalley/komari-theme-nezha-live) 工业蓝图风格实时地图主题，启动后自动安装，可在后台直接切换。
- **管理后台**：工业蓝图风格仪表板，全集群资产与配额折算、告警策略、探测管理与主题热插拔。
- **访问控制**：默认需要登录；可开启公开看板，访客看不到节点 IP，管理操作仍需登录。

Agent 通过 WebSocket / WSS 主动出站，无需开放被控主机的入站端口。服务端使用 SQLite，内嵌前端资源，可通过 Docker Compose 或单二进制部署。

## 快速部署

需要 Git、Docker 和 Docker Compose。前端与 Go 程序在镜像内构建，宿主机无需安装编译工具。

```bash
git clone https://github.com/wildalley/probe.git
cd probe
cp .env.example .env
```

编辑 `.env`，设置 `PROBE_ADMIN_PASSWORD`，然后启动：

```bash
docker compose up -d --build
```

访问 `http://<服务器地址>:8080`，默认管理员用户名为 `admin`。未设置密码时，首次启动会生成随机密码，可用 `docker compose logs server` 查看；首次登录后需修改密码。账号环境变量仅在首次创建账号时生效。

登录后进入 `/admin`，复制 Agent 安装命令，在目标 Linux 主机上执行。安装脚本会创建 systemd 服务。公网访问建议配置 HTTPS，并使用 `wss://` 连接 Agent。

常用命令：

```bash
docker compose logs -f server       # 查看日志
docker compose restart server       # 重启服务
git pull --ff-only                  # 更新源码
docker compose up -d --build        # 重建并更新服务端
docker compose down                # 停止服务，保留数据卷
```

SQLite 与已安装主题分别保存在 `probe-data`、`probe-themes` 命名卷中。更新前的备份、反向代理和源码部署步骤见[部署指南](docs/deployment.md)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [部署指南](docs/deployment.md) | Docker、源码构建、HTTPS、更新与备份 |
| [配置参考](docs/configuration.md) | 服务端与 Agent 参数、环境变量、配置优先级 |
| [Agent 与日常运维](docs/operations.md) | 安装升级、版本提示、流量校准、监测和通知 |
| [主题与兼容接口](docs/themes.md) | 主题安装、镜像配置、Komari API、指标语义 |
| [安全与访问控制](docs/security.md) | 访客 IP 隐私、权限边界、凭据、出站及上传限制 |
| [开发指南](docs/development.md) | 架构、目录结构、构建、测试与模拟器 |
| [更新记录](CHANGELOG.md) | 按日期记录功能变化和修复 |
| [安全审计记录](docs/security-audit-2026-10-12.md) | 2026-10-12 的历史问题、修复和验证范围 |

## 开源许可

[MIT License](LICENSE)。
