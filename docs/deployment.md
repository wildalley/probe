# 部署指南

[返回 README](../README.md) · [配置参考](configuration.md) · [安全与访问控制](security.md)

## Docker Compose

从仓库根目录执行：

```bash
cp .env.example .env
# 编辑 .env，设置 PROBE_ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f server
```

默认访问地址为 `http://<服务器地址>:8080`。容器以 `probe` 用户运行；数据库目录 `/data` 和主题目录 `/app/themes` 可写，并分别挂载命名卷 `probe-data`、`probe-themes`。实际卷名通常带 Compose 项目前缀，可用 `docker volume ls` 查看。

健康检查访问 `/api/v1/auth/status`，可用 `docker compose ps` 查看状态。`TZ` 默认 `Asia/Shanghai`，每日简报按容器本地时间执行。

### 端口、版本与构建网络

- `.env` 中设置 `PROBE_PORT=9090`，会同时调整宿主机端口映射、容器监听端口和健康检查。更改后执行 `docker compose up -d`。
- 发布时设置 `PROBE_VERSION` 后重新构建，服务端和随镜像分发的 Agent 使用相同版本标识。默认 `dev` 表示未指定发布版本。
- Go 模块构建默认使用 `goproxy.cn`，可按网络环境覆盖：

```bash
GOPROXY=https://proxy.golang.org,direct GOSUMDB=sum.golang.org docker compose build
```

镜像携带当前构建架构的 Linux Agent。不同架构的目标主机需要匹配的 Agent 二进制；当前下载入口不会自动选择不同架构的产物。

## 从源码构建

工具链要求见仓库 [go.mod](../go.mod) 和 [Dockerfile](../Dockerfile)：当前为 Go 1.27.2，Docker 前端构建使用 Node 22。宿主机需要 Go、Node.js、npm 和 Make。

```bash
make build-all
PROBE_ADMIN_USER=admin \
PROBE_ADMIN_PASSWORD='替换为自己的强密码' \
./bin/probe-server -addr :8080 -db probe.db
```

产物为 `bin/probe-server` 和 `bin/probe-agent`。前端编译进服务端，但一键部署入口仍从工作目录读取 `deploy/install.sh`、`bin/probe-agent`，因此建议从仓库根目录启动。单独复制服务端时，需同时带上这两个文件才能提供 Agent 下载与安装。

发布版本可显式指定：

```bash
make build-all PROBE_VERSION=1.2.3
./bin/probe-server --version
./bin/probe-agent --version
```

未指定时，Makefile 使用 `git describe --tags --always --dirty`。Docker 构建不会读取 `.git`，需由宿主机传入 `PROBE_VERSION`。手工分发时应保持服务端版本标识与实际供下载的 Agent 产物一致。

## HTTPS 与反向代理

在公网使用 HTTPS / WSS。代理需支持 WebSocket Upgrade；若代理与服务端位于同一主机，可将 Compose 端口映射改为 `127.0.0.1:8080:8080`，仅允许本机代理访问。使用自定义端口时同步修改映射。

设置 `PROBE_TRUSTED_PROXIES` 为服务端实际看到的代理来源 IP 或 CIDR。默认不信任转发头；容器中看到的来源可能是桥接网络地址，不能直接假设为 `127.0.0.1`。代理应正确传递 HTTPS 协议信息，使会话 Cookie 设置 `Secure`。

只有前后端确实跨来源时才配置 `PROBE_ALLOWED_ORIGINS`；它控制允许的来源，不替代登录，也不改变浏览器的 Cookie 策略。更多边界见[安全说明](security.md)。

## 更新与备份

更新前备份 SQLite、已安装主题和部署配置。SQLite 使用 WAL；运行中不要只复制 `probe.db` 而忽略尚未合并的事务。可使用 SQLite 在线备份，或先停止服务再备份整个数据目录。

Docker 下可在停机窗口将数据库目录复制到宿主机：

```bash
mkdir -p backup/data backup/themes
docker compose stop server
docker compose cp server:/data/. backup/data/
docker compose cp server:/app/themes/. backup/themes/
docker compose start server
```

每次备份应使用新的目录，另行妥善保管 `.env`。如自定义了主题路径，备份实际路径。确认备份完成后更新：

```bash
git pull --ff-only
docker compose up -d --build
```

`docker compose down` 保留数据卷；`docker compose down -v` 会删除卷及其中的数据，不用于普通更新。

服务端更新不会自动替换已部署 Agent。各版本是否需要更新 Agent，见 [CHANGELOG](../CHANGELOG.md) 中对应的升级说明；执行步骤见 [Agent 升级说明](operations.md#升级-agent)。
