# 已知未完成项

本文记录 `feat/heroui-migration` 分支当前已经确认、但尚未完成的工作，供后续继续开发和验收。

## 1. 管理弹窗的密码状态与修改流程

状态：阻塞前端构建。

`web/src/App.tsx` 已向 `AdminModal` 传入以下属性：

- `passwordIsTemp`
- `onPasswordChanged`

但 `web/src/components/AdminModal.tsx` 中的 `AdminModalProps` 尚未声明并实现它们。因此执行：

```bash
cd web
npm run build
```

会出现 `TS2322`：`passwordIsTemp` 不属于 `AdminModalProps`。

后续处理建议：

1. 为 `AdminModalProps` 补充对应属性。
2. 当初始密码仍为临时密码时，在管理后台显示明确提示。
3. 增加修改密码表单，调用 `POST /api/v1/auth/password`。
4. 修改成功后调用 `onPasswordChanged`，清理前端登录状态并要求使用新密码重新登录。

## 2. 页头登录状态与退出入口

状态：属性已接入，界面尚未完成。

`Header` 已接收 `isAuthed`、`adminUser` 和 `onLogout`，但目前没有使用这些属性。后续应在页头展示当前管理员，并提供明确的退出入口；未登录时继续显示管理后台登录入口。

## 3. 快速部署入口的登录保护

状态：鉴权流程尚未闭环。

`AddNodeModal` 会读取和创建 Agent Token，而这些接口已经要求管理员会话；但当前“添加节点”按钮仍会直接打开弹窗。未登录用户打开后只能看到默认占位 Token，接口请求会返回 `401`。

后续应让“添加节点”和“管理后台”共用同一套登录跳转逻辑：登录成功后再打开原本请求的弹窗，并在会话过期时关闭受保护界面或重新提示登录。

## 4. 重新生成嵌入式前端资源

状态：等待前端类型错误修复。

修复以上问题并确认 `npm run build` 通过后，需要重新生成 `cmd/server/dist/`，确保 Go 服务端嵌入的静态资源与 `web/src/` 源码一致。

## 验收清单

- `go test ./...` 通过。
- `cd web && npm run build` 通过。
- 未登录用户可正常查看只读看板，但无法读取 Token 或执行修改操作。
- 管理后台与添加节点入口均能在登录后恢复原操作。
- 临时密码提示、修改密码、强制重新登录流程正常。
- 页头能正确显示管理员身份并完成退出。
- `cmd/server/dist/` 已由最终源码重新构建。
