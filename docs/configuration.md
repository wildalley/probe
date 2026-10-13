# 配置参考

[返回 README](../README.md) · [部署指南](deployment.md)

## 服务端环境变量

命令行参数优先于对应的环境变量。表中 `—` 表示没有对应参数；并非每个环境变量都有命令行形式。

| 变量 | 对应参数 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PROBE_ADMIN_USER` | — | `admin` | 首次创建管理员时使用的用户名 |
| `PROBE_ADMIN_PASSWORD` | — | 随机生成 | 首次创建管理员时使用的密码；建议生产环境显式设置 |
| `PROBE_ALLOWED_ORIGINS` | — | 服务自身来源 | 额外允许携带会话 Cookie 的跨域来源，多个来源用逗号分隔 |
| `PROBE_TRUSTED_PROXIES` | — | 不信任任何代理 | 反向代理的地址或网段，多个用逗号分隔。只有列入的来源才允许通过 `X-Forwarded-For` 覆盖客户端 IP |
| `PROBE_ALLOW_PRIVATE_TARGETS` | — | `false` | 置为 `1` 后放开出站私网地址和探测端口限制，涉及探测、Webhook、GeoIP 与主题下载等；内网探测还需在对应 Agent 上设置 |
| `PROBE_SERVER_ADDR` | `-addr` | `:8080` | 监听地址与端口 |
| `PROBE_PORT` | — | — | 仅端口的简写（纯数字或 `:端口`），等价 `-addr :端口`；`PROBE_SERVER_ADDR` 未设置时生效。Docker 部署用它可以同时改端口与健康检查 |
| `PROBE_DB_PATH` | `-db` | `probe.db` | SQLite 数据文件路径 |
| `PROBE_PUBLIC_VIEW` | `-public` | `false` | 置为 `true` 等同于加 `-public`，开放匿名只读看板 |
| `PROBE_THEMES_DIR` | — | 工作目录下 `themes` | 主题（插件包）安装目录；工作目录只读或权限受限（如非特权容器）时指向可写路径 |
| `PROBE_THEME_MARKET_URL` | — | 上游市场（失败自动回退 jsDelivr） | 主题市场索引 `v1.json` 的自定义地址；设置后不再使用内置镜像回退 |
| `PROBE_THEME_ASSET_MIRROR` | — | 不重写 | GitHub 主题包下载加速：前缀式（`https://gh-proxy.com/`）或含 `{url}` 的模板；只重写 github.com / githubusercontent.com 链接，带 SHA256 的包下载后仍校验完整性 |

## 仅通过命令行配置的服务端选项

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-flush-interval` | `15` | 历史数据批量写入间隔，单位秒 |
| `-retention-days` | `7` | 历史时序保留天数 |
| `-session-hours` | `168` | 管理员会话有效期，单位小时 |
| `-version` | `false` | 打印版本后退出 |

监听地址优先级为 `-addr` > `PROBE_SERVER_ADDR` > `PROBE_PORT` > `:8080`。

## Compose 与构建配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TZ` | `Asia/Shanghai` | 容器时区，影响每日简报触发时间 |
| `PROBE_VERSION` | `dev` | Docker 构建时注入两个二进制的版本；修改后需重建 |
| `GOPROXY` | `https://goproxy.cn,direct` | Docker Go 构建的模块代理 |
| `GOSUMDB` | `sum.golang.google.cn` | Docker Go 构建的校验数据库 |

Compose 从仓库根目录 `.env` 读取变量，并只将 [docker-compose.yml](../docker-compose.yml) 中声明的项传入容器。服务端直接运行时不会自动加载 `.env`，需在进程环境中设置变量。

`PROBE_ADMIN_USER` / `PROBE_ADMIN_PASSWORD` 只在数据库尚无管理员时生效，修改 `.env` 不会重置已有账号。`PROBE_PUBLIC_VIEW=true` 开放匿名遥测查看，但节点 IP 仍对访客隐藏。

## Agent 环境变量

不使用配置文件时，命令行参数优先于环境变量。

| 变量 | 对应参数 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PROBE_SERVER` | `--server` | `ws://127.0.0.1:8080` | 服务端地址，公网部署建议用 `wss://` |
| `PROBE_TOKEN` | `--token` | 历史占位值（不可用于当前部署） | 必须填写管理后台生成的有效 Agent Token |
| `PROBE_NODE_ID` | `--node-id` | 主机名 | 节点唯一标识 |
| `PROBE_NAME` | `--name` | 主机名 | 看板显示名称 |
| `PROBE_REGION` | `--region` | `auto` | 归属地区，`auto` 表示按公网 IP 自动识别 |
| `PROBE_INTERVAL` | `--interval` | `1` | 采集上报间隔秒数 |
| `PROBE_ALLOW_PRIVATE_TARGETS` | — | `false` | 置为 `1` 后允许该 Agent 探测内网地址和非白名单端口 |

额外参数：`--config` 指定 YAML 文件，`--insecure` 关闭 TLS 证书校验，`--version` 打印版本后退出。正常部署保持 TLS 校验开启。

**当前 YAML 加载顺序晚于命令行解析**：使用 `--config` 时，文件中提供的字段会覆盖对应的命令行及环境变量值。不要依赖命令行覆盖同名 YAML 字段。

```yaml
server_url: "wss://probe.example.com"
token: "替换为管理后台生成的 Agent Token"
node_id: "node-01"
node_name: "Tokyo Node"
region: "auto"
report_interval: 1s
insecure_tls: false
```

一键安装默认写入 `/etc/probe/agent.yaml`。手动运行示例：

```bash
./bin/probe-agent --config /etc/probe/agent.yaml
```

`PROBE_ALLOW_PRIVATE_TARGETS` 由进程环境读取，不是 YAML 字段。systemd 管理的 Agent 需要在服务环境中配置，单独修改当前终端环境不会影响已启动的服务。
