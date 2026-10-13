# 开发指南

[返回 README](../README.md) · [部署指南](deployment.md)

## 架构

```text
Agent ── WebSocket / WSS ──> Hub 内存状态 ── REST / WebSocket ──> React 看板
                                  │
                                  └── Downsampler ──> SQLite 历史记录
```

Agent 默认每秒采集并上报；Hub 维护当前节点状态并广播，Downsampler 默认每 15 秒批量写入历史，默认保留 7 天。原生与 Komari 兼容接口共用服务端状态与鉴权边界。

前端采用 React 19、Vite、Tailwind CSS 4、HeroUI；内置波形使用 Canvas。构建资源通过 Go embed 编入服务端。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `cmd/agent`、`cmd/server` | Agent 与服务端入口，服务端 `dist/` 为嵌入的前端产物 |
| `cmd/simulator` | Go 多节点模拟器 |
| `pkg/agent` | 采集、探测与上报 |
| `pkg/server` | Hub、存储、鉴权、主题管理、兼容 API、通知 |
| `pkg/model`、`pkg/netguard`、`pkg/version` | 数据模型、出站地址检查、构建版本 |
| `web/src` | 前端组件、会话 Hook、类型、工具和独立主题入口 |
| `deploy` | 安装脚本、Agent YAML 示例、systemd 模板 |
| `themes` | 运行时下载的主题，除占位文件外不纳入版本控制 |
| `scripts` | Python 模拟脚本 |
| `docs` | 按用途划分的使用与维护文档 |

## 构建与测试

从仓库根目录执行：

```bash
make build-all

go test -race ./...
```

仅构建网页：

```bash
cd web
npm ci
npm run build
```

产物输出至 `cmd/server/dist`。修改网页后，应连同更新后的嵌入资源一起提交，确保直接编译 Go 服务端时使用匹配的界面。

独立 btop 主题入口可单独构建（在 `web/` 执行）：

```bash
npx vite build --config vite.btop.config.ts
```

默认输出到 `themes/btop-terminal/dist`；对外发布独立主题包需要对应仓库的打包与发布流程。

## 本地开发

服务端从仓库根目录启动，使用独立的测试数据库：

```bash
go run ./cmd/server -addr :8080 -db /tmp/probe-dev.db
```

另一个终端进入 `web/` 执行 `npm run dev`。Vite 默认端口为 `5173`，API 代理配置见 [vite.config.ts](../web/vite.config.ts)；实时流联调需确保代理支持对应 WebSocket 路由。完整的静态资源与实时流集成验证可在构建后直接访问 Go 服务端。

## 多节点模拟

模拟器会向指定服务端写入模拟遥测，使用独立开发实例和有效 Agent Token。

```bash
go run ./cmd/simulator \
  -server ws://127.0.0.1:8080/api/v1/agent/ws \
  -token '<Agent Token>'
```

Python 备选脚本：

```bash
python3 -m venv /tmp/probe-simulator-venv
/tmp/probe-simulator-venv/bin/pip install websocket-client
/tmp/probe-simulator-venv/bin/python scripts/simulate_nodes.py \
  ws://127.0.0.1:8080/api/v1/agent/ws '<Agent Token>'
```

## 文档维护

README 只保留项目概览、快速上手和文档入口。新增配置更新 `configuration.md`，使用行为更新相应专题。功能变化、修复和升级影响统一写入 [CHANGELOG](../CHANGELOG.md) 对应日期或版本的条目，专题文档不插入更新记录；安全审计的复现与验证证据独立归档。临时任务日志、进程号及本地绝对路径不放入项目使用文档。
