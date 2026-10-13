# 安全排查记录

[返回 README](../README.md) · [当前安全与访问控制](security.md)

日期：2026-10-12（Asia/Shanghai）。初始审计代码基线：`88f66e9`。

## 修复状态（2026-10-12）

本次已在源码中修复全部 5 类应用问题，并升级相关依赖与 Docker Go 工具链。下方原始审计记录保留用于追踪修复原因，其中代码行号、版本及临时漏洞复现命令对应修复前基线。

| 项目 | 完成内容 |
| --- | --- |
| 兼容接口鉴权 | 遥测入口复用 viewer 鉴权；admin REST/RPC 始终要求会话；HTTP 与 WS 共用 RPC 校验；私有 WS 会话撤销后断开 |
| 主题路径越界 | 严格主题标识校验、os.Root 文件系统边界、隔离解压与替换失败回滚；拒绝符号链接、特殊文件和重复文件 |
| 资源限制 | 普通请求及浏览器 WS 1 MiB；RPC 最多 32 项/批、8 个消息并发；批次限额在完整分配前检查；HTTP/WS 超时及 ZIP 解压限额 |
| SSRF | 主题索引、下载和镜像接入 netguard，连接时与重定向目标均受防护 |
| Cookie | 两种登录及改密均刷新两个名称的同一会话，统一 Secure/HttpOnly/SameSite；两个退出入口均清理两种 Cookie |
| 依赖 | Go 1.27.2、x/net 0.60.0、quic-go 0.59.1、source-map-js 1.2.2；同步升级关联 x/* 依赖 |

验证结果：

- `go test -race ./...`：通过。
- 最后调整 Cookie 同步与 RPC 流式批次解析后，定向竞态回归 `go test -race ./pkg/server -run 'TestSecurityRPC|TestSecurityCompatibilityCookies|TestKomariRPC2Endpoints' -count=1`：通过。
- 新增 12 个安全测试函数（含多个场景），覆盖私有/公开访问边界、管理 RPC、会话撤销、Cookie、超大 HTTP/WS 消息、批次与并发限制、主题目录穿越、链接、限额、无效更新保留原安装、正常升级及 SSRF。
- `npm run build`：通过。npm 更新后审计：0 vulnerabilities。
- `govulncheck v1.9.0 ./...`：0 可达漏洞、0 已导入包漏洞。仍有 1 条模块级提示：[GO-2026-5932](https://pkg.go.dev/vuln/GO-2026-5932)，涉及未被本项目导入的 `golang.org/x/crypto/openpgp`，无修复版本；本项目通过同模块使用 bcrypt，未使用 openpgp。
- 未重新部署或重启运行服务；Dockerfile 已更新，但未执行 Docker 镜像构建。重新构建、部署服务端后修复才会对运行实例生效。

兼容性变化：管理员兼容接口不再匿名开放；主题标识只接受英文字母、数字、连字符和下划线（最多 128 位，`builtin` 保留）；ZIP 32 MiB、总解压 128 MiB、单文件 32 MiB、manifest 128 KiB、条目 4096。私有主题市场/镜像需要显式开启服务端 `PROBE_ALLOW_PRIVATE_TARGETS=1`。

## 后续隐私回归（2026-10-13）

新增访客节点 IP 过滤：REST、原生 WebSocket、Komari HTTP/WS RPC 及批量调用均覆盖；验证管理员可见、会话撤销后隐藏、原始状态不被修改。`go test -race ./...`、前端与独立主题构建通过；使用模拟数据在浏览器核对访客列表、监控、详情页与管理员地址显示。

## 原始审计记录


本次检查了服务端鉴权、Komari 兼容接口、WebSocket、主题安装与删除、出站请求防护、Agent 通信、安装脚本、前端依赖及 Docker 配置。通过临时数据库、临时目录和本地测试 HTTP 服务验证问题，未读取现有数据库内容，未修改业务代码或依赖。

发现 5 类应用安全问题，其中主题目录问题有两条独立触发路径。以下优先级基于本项目中的攻击条件和影响，不是 CVSS 评分。

## 1. 高：Komari 兼容接口绕过私有模式鉴权

位置：[komari_api.go:25](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/komari_api.go#L25)、[komari_api.go:43](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/komari_api.go#L43)、[komari_api.go:47](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/komari_api.go#L47)。

兼容接口没有挂载 `requireViewer()` 或 `requireAuth()`，处理函数也未检查会话。它们始终注册，与是否安装、启用第三方主题无关。设置 `PROBE_PUBLIC_VIEW=false` 只能保护原生接口，不能保护这些入口。

**已复现：** 将测试 Server 设为私有模式，不发送 Cookie 或 Authorization：

- `GET /api/v1/nodes` 返回 401；
- `GET /api/nodes`、`GET /api/admin/client/list` 返回 200，包含预置的私有节点；
- `POST /api/rpc2` 调用 `common:getNodes` 同样返回私有节点；
- `/api/rpc2` WebSocket 接受来自不可信 Origin 的匿名连接。

代码中的 `/api/clients`、历史记录、ping 任务及 recent 接口也缺少相同保护。RPC 节点映射包含公网 IP、系统版本、标签和计费信息，攻击者可绕过登录页读取节点清单和监控数据。本次未发现这些接口直接泄露管理员密码或 Agent token。

**修复：** 所有兼容遥测入口统一使用 viewer 鉴权；真正的管理接口使用 admin 鉴权。兼容 WebSocket 复用可信 Origin 检查，并像原生客户端 WebSocket 一样，在会话注销或过期后断开连接。补充默认私有模式下的 HTTP/WS 匿名访问测试。

## 2. 高：主题标识符路径穿越，可越界删除和写入

位置：[theme_manager.go:286](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/theme_manager.go#L286)、[theme_manager.go:236](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/theme_manager.go#L236)。

安装时只检查 manifest 的 `short` 非空，直接执行 `filepath.Join(themesDir, manifest.Short)`，随后 `os.RemoveAll(targetDir)`。ZIP 成员路径中的 `..` 检查无法保护由 manifest 控制的目标根目录。删除接口同样只排除了 `builtin`。

**已复现两条路径：**

1. 在一次性测试目录中安装 `short="../victim"` 的主题包，主题目录外的 `victim/keep.txt` 被删除，`victim/index.html` 被写入包内内容。即使函数最后返回“无法注册主题”，破坏已经发生。
2. 使用测试管理员会话请求 `DELETE /api/v1/themes/..`，返回 200，删除了临时 themes 目录的父目录及标记文件。

安装、删除 API 需要管理员登录。实际攻击可通过诱导管理员安装恶意主题包触发；并非匿名远程写文件。影响范围受服务进程文件系统权限限制，可能涉及应用文件、数据目录或其他可写文件；本次未尝试代码执行。

**修复：** 对安装、删除、查询中的主题标识统一使用严格单段名称白名单，拒绝 `.`、`..`、路径分隔符与保留名称；验证最终路径位于主题根目录内，处理符号链接边界。先在隔离临时目录完整验证、限额解压，再替换目标主题，避免验证前执行递归删除。删除前还应确认主题已注册。

## 3. 高：匿名 RPC 与 WebSocket 缺少输入和资源上限

位置：[komari_api.go:595](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/komari_api.go#L595)、[komari_api.go:548](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/komari_api.go#L548)。

HTTP RPC 对请求体直接 `io.ReadAll`；兼容 WebSocket 在没有 `SetReadLimit` 的情况下使用 `ReadMessage`；RPC 批次也没有数量上限。当前鉴权遗漏使这些路径在私有模式下仍可匿名触达。原生客户端 WebSocket 同样没有消息大小上限。

**已复现：** 匿名 HTTP 和带不可信 Origin 的匿名 WebSocket 均接受 2 MiB 的 RPC 消息并返回 `pong`。这是受控的小规模验证；未执行内存耗尽或压力攻击。结合无上限的整包读取实现，大消息或并发请求存在耗尽内存、CPU 的拒绝服务风险。

服务入口 [main.go:135](https://github.com/wildalley/probe/blob/88f66e9/cmd/server/main.go#L135) 也未设置 HTTP 读取/空闲超时。主题下载、上传和解压缺少总大小上限，属于需要登录或恶意主题包参与的相关资源风险。

**修复：** HTTP 使用 `http.MaxBytesReader`；所有 WebSocket 设置消息大小、读写期限；限制 RPC 批次、查询范围和并发。补充 HTTP header/body/idle 超时，对主题包设置下载大小、文件数量、单文件和总解压大小上限。

## 4. 中：主题下载绕过现有 SSRF 防护

位置：[theme_manager.go:355](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/theme_manager.go#L355)、[komari_api.go:1090](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/komari_api.go#L1090)。

主题安装接收管理员提供的任意 URL，使用普通 `http.Client` 下载，没有复用 `netguard`。默认重定向行为也允许跟随到内网，因此 `PROBE_ALLOW_PRIVATE_TARGETS=false` 对这条路径不起作用。

**已复现：** 显式关闭 private targets 后，主题下载仍成功请求到测试用 `127.0.0.1` HTTP 服务。响应不是 ZIP，最终安装失败，但内部 HTTP 请求已经完成。

攻击前提是管理员会话，或管理员使用攻击者提供的主题下载地址；可触达服务端内网 HTTP 服务、发起盲 SSRF。未验证任意响应内容回传，也未访问真实云元数据服务。

**修复：** 对镜像改写后的最终 URL 使用 `ValidateOutboundURL` 与 `NewGuardedHTTPClient`，覆盖 DNS 解析和每次重定向；同时限制响应体大小。

## 5. 中：兼容登录在 HTTPS 下签发非 Secure 管理员会话 Cookie

位置：[komari_api.go:211](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/komari_api.go#L211)、[auth.go:391](https://github.com/wildalley/probe/blob/88f66e9/pkg/server/auth.go#L391)。

`/api/login` 为同一个管理员会话签发两个 Cookie。`probe_session` 根据 HTTPS 设置 Secure，但兼容 Cookie `session_token` 将 Secure 硬编码为 false，且未显式设置 SameSite；后端接受它作为完整管理员凭证。

**已复现：** 测试 HTTPS 登录得到 `probe_session: Secure=true, SameSite=Lax`，以及 `session_token: Secure=false, SameSite未设置`。

如果浏览器能够向同一主机发出明文 HTTP 请求，且没有 HSTS 等措施阻断，兼容 Cookie 可能随请求泄露给网络攻击者。HTTP 重定向到 HTTPS 不会消除首个明文请求的泄露。已有严格 HSTS 的部署会降低风险。

**修复：** 两种 Cookie 使用一致的 HTTPS/Secure、HttpOnly、SameSite 策略；统一清理两个名称，并检查反向代理配置。

## 依赖与构建告警

以下是扫描命中及官方修复信息，不等于已经证明当前生产部署能被对应 CVE 利用。

| 组件 | 审计时版本 | 告警与修复版本 |
| --- | --- | --- |
| `golang.org/x/net` | `v0.51.0` | [GO-2026-6617](https://pkg.go.dev/vuln/GO-2026-6617)、[GO-2026-6612](https://pkg.go.dev/vuln/GO-2026-6612)、[GO-2026-6611](https://pkg.go.dev/vuln/GO-2026-6611)、[GO-2026-6603](https://pkg.go.dev/vuln/GO-2026-6603)，修复版本 `v0.60.0` |
| `github.com/quic-go/quic-go` | `v0.59.0` | HTTP/3 QPACK 内存耗尽，[GO-2026-5676](https://pkg.go.dev/vuln/GO-2026-5676)，修复版本 `v0.59.1` |
| `source-map-js` | `1.2.1` | 恶意 indexed source map 导致事件循环阻塞；`npm audit` 判定 high，[官方 1.2.2 修复记录](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) |

`govulncheck` 在 `./pkg/...` 中报告 2 个模块的 5 个符号级命中，另有未显示调用的导入包/模块告警。扫描覆盖库入口，部分调用链包含保守的接口分析；当前 main 使用普通 HTTP `ListenAndServe`，没有显式启用 HTTP/3。需要结合实际 TLS、HTTP/2/3 与代理部署判断远程可达性。

`source-map-js` 由 Tailwind/Vite/PostCSS 构建链引入，本次没有发现生产 Go API 接收并解析 source map 的路径，主要作为构建工具依赖风险处理。

另需同步更新 [Dockerfile:24](https://github.com/wildalley/probe/blob/88f66e9/Dockerfile#L24)：它固定使用 Go `1.27.1`，本机扫描运行于 Go `1.27.2`，因此本机没有标准库告警不能代表容器构建安全。上述 HTTP/2 官方通告包括 Go 1.27 分支 `<1.27.2` 的受影响范围；建议至少使用修复后的工具链重新构建并复扫。

## 验证与边界

- `go test ./pkg/...`：全部通过。这说明原有测试未覆盖上述安全边界。
- 6 个临时安全验证用例：全部成功复现预期的不安全行为，覆盖鉴权绕过、ZIP 越界、删除越界、SSRF、Cookie 和大消息 HTTP/WS。
- 原始复现使用临时 Go overlay，断言的是修复前存在漏洞；临时材料不属于仓库。修复后的回归用例已保存在 `pkg/server/security_test.go`、`theme_security_test.go` 和 `privacy_test.go`，可运行 `go test -race ./pkg/server -run 'TestSecurity|TestTheme|TestPrivacy'`。
- Go 扫描：`go run golang.org/x/vuln/cmd/govulncheck@latest ./pkg/...`，本次工具版本 `v1.9.0`。
- 前端扫描：在 web 目录执行 `npm audit --json`，1 项 high；`npm ls source-map-js` 确认解析到 `1.2.1`。
- 未检查线上反向代理、实际运行镜像与历史入侵日志；没有对运行服务执行破坏性测试。不能据此保证不存在其他漏洞。

以上是修复前的审计结论；已完成的修复和验证结果见本文开头。扫描结论对应记录日期，不代表后续依赖版本或部署环境的持续安全保证。
