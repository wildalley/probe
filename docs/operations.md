# Agent 与日常运维

[返回 README](../README.md) · [配置参考](configuration.md) · [安全说明](security.md)

## 安装 Agent

在 `/admin` 的快速部署入口复制包含有效 Token 的命令，在目标 Linux 主机执行。安装脚本会注册 `probe-agent.service`，默认配置文件为 `/etc/probe/agent.yaml`。

以下为 HTTPS 部署示例，请替换域名与 Token：

```bash
curl -fsSL https://probe.example.com/install.sh | sudo bash -s -- \
  --server "wss://probe.example.com" \
  --token "<从管理后台复制的 Agent Token>" \
  --name "Tokyo Node" \
  --region "JP"
```

省略 `--region` 时使用自动地区识别。自定义地区不会停止公网地址探测，Agent 会周期性复查出口地址。

## 升级 Agent

```bash
curl -fsSL https://probe.example.com/install.sh | sudo bash -s -- --upgrade
```

升级脚本读取已有配置中的 `server_url`，下载二进制并重启服务。它保留 Token、节点标识和其他配置，不需要重新填写 Token。下载到同目录临时文件、完成 ELF 格式检查后再替换；下载或格式检查失败时保留旧二进制。格式检查不等于签名校验，也不保证新版本运行正常，应使用可信的服务端下载地址并检查升级后状态。

```bash
systemctl status probe-agent
journalctl -u probe-agent -f
systemctl restart probe-agent
probe-agent --version
```

若已下载安装脚本，可运行 `bash install.sh --upgrade`；`bash install.sh --uninstall` 用于卸载并清理服务。

看板以服务端报告的基准版本与节点版本比较：不带版本号的 Agent 显示「未知（旧版）」；不同版本显示「版本不一致」，不代表服务端能判定哪一版更新。服务端版本为 `dev` 或缺失时不作比较。手工替换供下载的二进制时应同步版本标识。

## 旧 Agent 兼容性

- 访客 IP 隐藏由服务端过滤，不需要更新 Agent。
- 公网 IPv6、分核 CPU、可用/缓存内存等字段依赖 Agent 上报；旧版缺少时可能显示为空，可更新 Agent 或在后台手动覆盖公网地址。
- 旧版携带的演示价格、配额和标签不作为配置来源。计费、配额、标签以管理后台配置为准，更新 Agent 不会自动补齐这些业务配置。
- 精确的逐次丢包历史依赖 `probed_at` 和丢失事件位；旧版回退统计的含义见[指标语义](themes.md#指标语义)。

## 节点与公网地址

删除节点前先停止对应 Agent。仍保持连接时删除返回 `409`；Agent 断开后即可删除，不必等待告警的离线判定阈值。看板在线状态与通知阈值独立于这一删除检查。

地址优先级：后台手填 > Agent 上报 > 连接来源地址。默认过滤回环、私网、链路本地、CGNAT 等地址，避免把容器网关展示为公网 IP。地址也用于 GeoIP 查询；IPv6 主机可用于地区解析。是否允许内部地址由 `PROBE_ALLOW_PRIVATE_TARGETS` 控制，启用影响不止地址展示，详见[安全说明](security.md)。

## 计费与流量校准

在主机设置中维护价格、币种、周期、到期日、提供商、备注和配额。单节点按本币展示，管理后台汇总按人民币折算。汇率、通知渠道与监测目标在管理后台维护。

配额按**上传 + 下载**计算：上传 10 GB、下载 20 GB 计为 30 GB，当前不提供单向配额。默认用量来自经过虚拟网卡过滤的网卡累计值，可能与服务商只统计公网流量的账单口径不同。

手工校准时填写服务商当前已用总量作为基线。此后的流量继续累加；网卡计数器归零时，系统把已经计入的增量折回基线并重新锚定。改名、改价格等操作不会重置锚点；基线填 `0` 表示取消校准。

上下行明细相加等于总量。单一校准基线按锚定时的网卡方向比例拆分，此后的增量按实际方向累计。重新打开设置时会读取已保存基线，读取失败会阻止保存，避免误清零。

## 探测与告警

监测目标支持 ICMP、TCP 和 HTTP，可指定执行节点。未指定节点且关闭「默认自动开启监测」时，目标只分配给当时已接入的节点，后续新节点不会自动加入。

通知支持 Telegram、Discord、自定义 Webhook；预设可用于飞书、钉钉、企业微信群机器人、Bark 或通用 JSON。可配置节点离线阈值、恢复通知、流量预警和每日简报。投递结果可在通知日志中查看，简报时间使用服务端时区。

## 账号恢复

已有账号通过登录后的改密入口修改密码；更改启动环境变量不会覆盖已有密码。

若确实遗失管理员密码，先停止服务并完整备份数据库，再在**实际使用的数据库**上清空管理员和会话记录，重启后由首次启动流程重建账号：

```sql
BEGIN;
DELETE FROM sessions;
DELETE FROM admin_users;
COMMIT;
```

这会删除全部管理员及会话，但保留节点、历史和 Agent Token。重启前检查预设账号环境变量；未预设密码时从启动日志取回新生成的密码。备份步骤见[部署指南](deployment.md#更新与备份)。
