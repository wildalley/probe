#!/usr/bin/env bash
# ==============================================================================
# Cyber Probe Agent 一键安装与管理脚本
# 支持系统: Linux (Debian, Ubuntu, CentOS, Rocky, Alma, Arch, Alpine, etc.)
# 架构支持: x86_64 / amd64, aarch64 / arm64
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

INSTALL_DIR="/usr/local/bin"
BIN_NAME="probe-agent"
BIN_PATH="${INSTALL_DIR}/${BIN_NAME}"
SERVICE_PATH="/etc/systemd/system/probe-agent.service"
CONFIG_DIR="/etc/probe"
CONFIG_PATH="${CONFIG_DIR}/agent.yaml"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$(id -u)" != "0" ]; then
        log_error "本脚本需要 root 权限执行，请使用 sudo 或切换至 root 用户。"
        exit 1
    fi
}

# 等待 probe-agent 进入 active，最多约 10 秒。
wait_for_service() {
    local i
    for i in $(seq 1 20); do
        if systemctl is-active --quiet probe-agent; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

# 由 SERVER_URL 推算 HTTP 下载根地址 (ws:// -> http://, wss:// -> https://)
resolve_http_base() {
    local http_base="${SERVER_URL}"
    http_base="${http_base/ws:\/\//http:\/\/}"
    http_base="${http_base/wss:\/\//https:\/\/}"
    # 去除 path
    echo "$http_base" | sed -E 's/(\/(api|ws).*|\/)$//'
}

# read_config_value KEY —— 从已有 agent.yaml 中读取一个顶层键，兼容带引号与不
# 带引号两种写法。取不到时返回 1。
#
# 注意 `|| true`：grep 无匹配时返回 1，而这是普通赋值语句，在 set -e 下会让整个
# 脚本无提示地中止。所以每一次 grep 都必须显式兜底。
read_config_value() {
    local key="$1" line value
    [ -f "${CONFIG_PATH}" ] || return 1
    line="$(grep -E "^[[:space:]]*${key}:" "${CONFIG_PATH}" 2>/dev/null | head -n 1 || true)"
    [ -n "$line" ] || return 1
    # 按第一个冒号切分：键分隔符在前，值里的冒号（ws://host:port）不受影响。
    value="${line#*:}"
    value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    [ -n "$value" ] || return 1
    printf '%s' "$value"
}

# 打印某个二进制的自身版本。老版本 Agent 没有 --version，会以退出码 2 结束，
# 因此必须兜底——否则 set -e 会让升级在最后一步误报失败。
agent_version_of() {
    local bin="$1" out
    [ -n "$bin" ] && [ -x "$bin" ] || { printf '未知'; return 0; }
    out="$("$bin" --version 2>/dev/null || true)"
    [ -n "$out" ] || { printf '未知（旧版）'; return 0; }
    printf '%s' "$out"
}

# 校验下载结果确实是 Linux 可执行文件。
# curl -f 只拒绝 4xx/5xx；透明代理或门户认证返回 200 + HTML 时，旧脚本会把网页
# 写进 BIN_PATH 并 chmod +x，随后 systemd 反复 Exec format error 崩溃重启。
validate_agent_binary() {
    local path="$1" magic
    [ -f "$path" ] || { log_error "二进制文件不存在: ${path}"; return 1; }
    [ -s "$path" ] || { log_error "下载内容为空文件，可能下载中断。"; return 1; }
    magic="$(head -c 4 "$path" | od -An -tx1 | tr -d ' \n')"
    if [ "$magic" != "7f454c46" ]; then
        log_error "下载内容不是有效的 Linux 可执行文件（收到的是网页或错误页？）"
        return 1
    fi
    return 0
}

# 原子替换 BIN_PATH。
#
# 旧脚本直接 `curl -o ${BIN_PATH}`。Linux 拒绝以写方式打开正在执行的文件
# (ETXTBSY)，而用这个脚本升级时 Agent 必然正在运行——于是下载失败，脚本却报
# 「请检查网络」。rename(2) 没有这个限制：正在运行的进程继续持有旧 inode，
# 下一次 restart 才切到新文件。
#
# 暂存文件必须与 BIN_PATH 同目录：跨文件系统的 mv 会退化成拷贝+删除，而拷贝会
# 以 O_TRUNC 打开目标，又踩回 ETXTBSY。
BIN_TMP=""
stage_binary_target() {
    BIN_TMP="$(mktemp "${BIN_PATH}.XXXXXX")"
    # 幂等清理：成功提交后 BIN_TMP 置空，此处即为空操作。
    trap '[ -n "${BIN_TMP}" ] && rm -f "${BIN_TMP}"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
}

# 校验暂存文件并落位。校验不通过时旧二进制原封不动，服务不受影响。
commit_staged_binary() {
    validate_agent_binary "${BIN_TMP}" || return 1
    # 用 0755 而不是 +x，避免结果受调用者 umask 影响。
    chmod 0755 "${BIN_TMP}"
    mv -f "${BIN_TMP}" "${BIN_PATH}"
    BIN_TMP=""
    return 0
}

detect_arch() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        armv7*|armhf)
            ARCH="arm"
            ;;
        *)
            log_error "不支持的系统架构: $arch"
            exit 1
            ;;
    esac
}

print_banner() {
    echo -e "${CYAN}${BOLD}"
    echo "========================================================"
    echo "    CYBER PROBE · 高性能服务器探针系统 Agent 安装程序   "
    echo "========================================================"
    echo -e "${NC}"
}

usage() {
    echo -e "${BOLD}使用方法:${NC}"
    echo "  $0 [选项]"
    echo ""
    echo -e "${BOLD}选项列表:${NC}"
    echo "  -s, --server <URL>       服务端地址 (如 ws://1.2.3.4:8080 或 wss://probe.example.com)"
    echo "  -t, --token <TOKEN>      Agent 认证 Token (必填)"
    echo "  -i, --node-id <ID>       节点唯一标识 (默认: 系统主机名)"
    echo "  -n, --name <NAME>        节点展示名称 (默认: 系统主机名)"
    echo "  -r, --region <REGION>    节点所在地区/机房 (如 HK, US, JP, SG, 默认: AP-CN)"
    echo "  --interval <SEC>         采集汇报间隔秒数 (默认: 1)"
    echo "  --download-url <URL>     自定义二进制下载地址"
    echo "  --upgrade                仅更新二进制（保留现有配置与节点标识）"
    echo "  --uninstall              彻底卸载 Agent 及系统服务"
    echo "  --status                 查看 Agent 运行状态"
    echo "  --restart                重启 Agent 服务"
    echo "  --logs                   查看 Agent 实时运行日志"
    echo "  -h, --help               显示帮助信息"
    echo ""
    echo -e "${BOLD}一键示例:${NC}"
    echo "  curl -sSL http://1.2.3.4:8080/install.sh | sudo bash -s -- --server ws://1.2.3.4:8080 --token sk_xxx --name \"My VPS\" --region \"HK\""
    echo ""
    echo -e "${BOLD}升级示例 (无需 token，节点标识与配置保持不变):${NC}"
    echo "  curl -sSL http://1.2.3.4:8080/install.sh | sudo bash -s -- --upgrade"
    echo ""
}

# 默认参数
SERVER_URL=""
TOKEN=""
NODE_ID="$(hostname 2>/dev/null || echo "node-$$")"
NODE_NAME="${NODE_ID}"
REGION="auto"
INTERVAL="1"
CUSTOM_DOWNLOAD_URL=""
ACTION="install"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--server)
            SERVER_URL="$2"
            shift 2
            ;;
        -t|--token)
            TOKEN="$2"
            shift 2
            ;;
        -i|--node-id)
            NODE_ID="$2"
            shift 2
            ;;
        -n|--name)
            NODE_NAME="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        --interval)
            INTERVAL="$2"
            shift 2
            ;;
        --download-url)
            CUSTOM_DOWNLOAD_URL="$2"
            shift 2
            ;;
        --uninstall)
            ACTION="uninstall"
            shift
            ;;
        --status)
            ACTION="status"
            shift
            ;;
        --restart)
            ACTION="restart"
            shift
            ;;
        --upgrade)
            ACTION="upgrade"
            shift
            ;;
        --logs)
            ACTION="logs"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "未知参数: $1"
            usage
            exit 1
            ;;
    esac
done

do_uninstall() {
    check_root
    log_info "正在卸载 Cyber Probe Agent..."
    if systemctl is-active --quiet probe-agent 2>/dev/null; then
        systemctl stop probe-agent
        log_info "已停止正在运行的 probe-agent 服务"
    fi
    if systemctl is-enabled --quiet probe-agent 2>/dev/null; then
        systemctl disable probe-agent
        log_info "已禁用 probe-agent 开机自启"
    fi
    rm -f "${SERVICE_PATH}"
    rm -f "${BIN_PATH}"
    rm -rf "${CONFIG_DIR}"
    systemctl daemon-reload
    log_success "Cyber Probe Agent 已彻底卸载完成！"
    exit 0
}

do_status() {
    if systemctl list-unit-files | grep -q "probe-agent.service"; then
        systemctl status probe-agent --no-pager
    else
        log_warn "未检测到 probe-agent.service 系统服务。"
    fi
    exit 0
}

do_restart() {
    check_root
    log_info "正在重启 probe-agent 服务..."
    systemctl restart probe-agent
    systemctl status probe-agent --no-pager
    exit 0
}

do_logs() {
    journalctl -u probe-agent -f -n 50
    exit 0
}

# 交互模式检查
interactive_setup() {
    if [ -z "$SERVER_URL" ]; then
        echo -en "${CYAN}请输入服务端地址 (如 ws://1.2.3.4:8080 或 wss://probe.domain.com): ${NC}"
        read -r input_server
        SERVER_URL="${input_server:-ws://127.0.0.1:8080}"
    fi

    if [ -z "$TOKEN" ]; then
        echo -en "${CYAN}请输入认证 Token (可在服务端 Web 面板右上角查看): ${NC}"
        read -r input_token
        TOKEN="${input_token:-sk_default_secret_probe_token}"
    fi

    if [ -z "$NODE_NAME" ] || [ "$NODE_NAME" = "$NODE_ID" ]; then
        echo -en "${CYAN}请输入节点展示名称 [默认: ${NODE_ID}]: ${NC}"
        read -r input_name
        if [ -n "$input_name" ]; then
            NODE_NAME="$input_name"
        fi
    fi

    if [ -z "$REGION" ] || [ "$REGION" = "AP-CN" ]; then
        echo -en "${CYAN}请输入节点所属地区 (如 HK, JP, US, SG, DE) [默认: HK]: ${NC}"
        read -r input_region
        if [ -n "$input_region" ]; then
            REGION="$input_region"
        else
            REGION="HK"
        fi
    fi
}

do_install() {
    check_root
    detect_arch
    print_banner

    # 规范化 Server URL
    if [[ "$SERVER_URL" =~ ^http:// ]]; then
        SERVER_URL="ws://${SERVER_URL#http://}"
    elif [[ "$SERVER_URL" =~ ^https:// ]]; then
        SERVER_URL="wss://${SERVER_URL#https://}"
    elif [[ ! "$SERVER_URL" =~ ^(ws|wss):// ]]; then
        SERVER_URL="ws://${SERVER_URL}"
    fi

    # 如果缺乏必要参数且处于交互终端，进入交互式填写
    if [ -t 0 ] && ([ -z "$SERVER_URL" ] || [ -z "$TOKEN" ]); then
        interactive_setup
    fi

    if [ -z "$TOKEN" ]; then
        log_error "必须提供认证 Token！使用 -t 或 --token 指定。"
        exit 1
    fi

    # 自动识别地区
    if [ -z "$REGION" ] || [ "$REGION" = "auto" ] || [ "$REGION" = "AUTO" ]; then
        log_info "正在自动识别服务器公网 IP 与所在地区..."
        DETECTED_COUNTRY=""
        CF_TRACE=$(curl -s --connect-timeout 2 https://cloudflare.com/cdn-cgi/trace 2>/dev/null || true)
        if [ -n "$CF_TRACE" ]; then
            DETECTED_COUNTRY=$(echo "$CF_TRACE" | grep -E '^loc=' | cut -d= -f2 | tr -d '\r\n')
        fi
        if [ -z "$DETECTED_COUNTRY" ]; then
            DETECTED_COUNTRY=$(curl -s --connect-timeout 2 "http://ip-api.com/line/?fields=countryCode" 2>/dev/null | tr -d '\r\n' || true)
        fi
        if [ -z "$DETECTED_COUNTRY" ]; then
            DETECTED_COUNTRY=$(curl -s --connect-timeout 2 "https://api.country.is/" 2>/dev/null | grep -o '"country":"[^"]*"' | cut -d'"' -f4 || true)
        fi
        if [ -n "$DETECTED_COUNTRY" ]; then
            REGION="$DETECTED_COUNTRY"
            log_success "已自动识别服务器地区为: ${REGION}"
        else
            REGION="AUTO"
            log_info "未能即时探测地区，已设置为 AUTO (将由服务端自动识别)"
        fi
    fi

    log_info "正在配置安装环境..."
    log_info "目标架构: ${ARCH}"
    log_info "服务端地址: ${SERVER_URL}"
    log_info "节点名称: ${NODE_NAME} (ID: ${NODE_ID})"
    log_info "地区标识: ${REGION}"

    # 1. 获取二进制文件
    log_info "正在获取二进制程序 ${BIN_NAME}..."
    mkdir -p "${INSTALL_DIR}"

    # 优先检查本地脚本同级或父级目录是否存在现成的 probe-agent 二进制。
    #
    # 仅信任 root 所有、且不是符号链接的文件。文档给出的调用方式是
    # `curl ... | sudo bash`，其工作目录就是运维当时所在的位置；若不过滤属主，
    # 任何本地普通用户往那儿放一个同名文件就能让它以 root 身份被安装并运行。
    # （/tmp/probe-agent 曾经也在候选列表里，那是人人可写的目录。）
    local found_local=""
    for candidate in "./bin/probe-agent" "./probe-agent" "../bin/probe-agent"; do
        if [ -f "$candidate" ] && [ -x "$candidate" ]; then
            if [ -L "$candidate" ]; then
                log_warn "忽略符号链接: ${candidate}"
                continue
            fi
            if [ "$(stat -c %U "$candidate" 2>/dev/null || echo unknown)" != "root" ]; then
                log_warn "忽略非 root 所有的本地文件: ${candidate}"
                continue
            fi
            found_local="$candidate"
            break
        fi
    done

    stage_binary_target

    if [ -n "$found_local" ]; then
        log_info "发现本地可用二进制文件: ${found_local}，正在安装..."
        cp -f "$found_local" "${BIN_TMP}"
    else
        # 否则尝试从服务端或者指定 URL 下载
        local download_url="${CUSTOM_DOWNLOAD_URL}"
        if [ -z "$download_url" ]; then
            download_url="$(resolve_http_base)/download/probe-agent"
        fi

        log_info "从服务端下载二进制: ${download_url} ..."
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL -o "${BIN_TMP}" "${download_url}" || {
                log_error "下载失败: ${download_url}"
                log_error "请确认服务端地址可达、且 ${SERVER_URL} 正在运行。"
                exit 1
            }
        elif command -v wget >/dev/null 2>&1; then
            wget -q -O "${BIN_TMP}" "${download_url}" || {
                log_error "下载失败: ${download_url}"
                log_error "请确认服务端地址可达、且 ${SERVER_URL} 正在运行。"
                exit 1
            }
        else
            log_error "系统缺少 curl 或 wget，请先安装其中之一。"
            exit 1
        fi
    fi

    # 校验在替换之前完成：不通过则 BIN_PATH 保持原样，正在运行的服务不受影响。
    if ! commit_staged_binary; then
        log_error "二进制文件校验未通过，已保留原有安装。"
        exit 1
    fi

    log_success "二进制程序已安装至: ${BIN_PATH} ($(agent_version_of "${BIN_PATH}"))"

    # 2. 写入配置文件
    mkdir -p "${CONFIG_DIR}"
    cat << EOF > "${CONFIG_PATH}"
server_url: "${SERVER_URL}"
token: "${TOKEN}"
node_id: "${NODE_ID}"
node_name: "${NODE_NAME}"
region: "${REGION}"
report_interval: ${INTERVAL}s
insecure_tls: false
EOF
    chmod 600 "${CONFIG_PATH}"
    log_success "配置文件已生成至: ${CONFIG_PATH}"

    # 3. 配置 Systemd 系统服务
    if command -v systemctl >/dev/null 2>&1; then
        log_info "正在配置 Systemd 服务守护 (${SERVICE_PATH})..."
        cat << EOF > "${SERVICE_PATH}"
[Unit]
Description=Cyber Probe Agent (Extreme Low Resource Telemetry Daemon)
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
ExecStart=${BIN_PATH} --config ${CONFIG_PATH}
Restart=always
RestartSec=5
LimitNOFILE=65535

# 内存上限与资源限制保护 (严格控制在 30MB 以内)
MemoryHigh=20M
MemoryMax=35M

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        systemctl enable probe-agent
        systemctl restart probe-agent

        # 轮询而不是固定 sleep 一次：systemd 有时还没来得及把状态翻成 active，
        # 一次判断就会在升级成功之后打印「服务启动可能遇到异常」。
        if wait_for_service; then
            log_success "Cyber Probe Agent 服务已成功启动并配置开机自启！"
        else
            log_warn "服务启动可能遇到异常，正在打印最近日志:"
            journalctl -u probe-agent -n 15 --no-pager
        fi
    else
        log_warn "当前系统未安装 Systemd，已跳过服务注册。"
        log_info "你可以通过以下命令在后台直接运行:"
        echo "  nohup ${BIN_PATH} --config ${CONFIG_PATH} > /var/log/probe-agent.log 2>&1 &"
    fi

    echo ""
    echo -e "${GREEN}${BOLD}========================================================${NC}"
    echo -e "${GREEN}${BOLD}         ✓ Cyber Probe Agent 安装配置完成！            ${NC}"
    echo -e "${GREEN}${BOLD}========================================================${NC}"
    echo -e "常用管理命令:"
    echo -e "  查看运行状态: ${CYAN}systemctl status probe-agent${NC}  或  ${CYAN}$0 --status${NC}"
    echo -e "  查看实时日志: ${CYAN}journalctl -u probe-agent -f${NC}  或  ${CYAN}$0 --logs${NC}"
    echo -e "  重启探针服务: ${CYAN}systemctl restart probe-agent${NC} 或  ${CYAN}$0 --restart${NC}"
    echo -e "  停止探针服务: ${CYAN}systemctl stop probe-agent${NC}"
    echo -e "  彻底卸载探针: ${CYAN}$0 --uninstall${NC}"
    echo ""
}

# 升级：只换二进制，其余一律不碰。
#
# 单独成一个函数而不是复用 do_install，因为 do_install 会做四件升级时不该做的
# 事：要求 --token（管道执行时无法交互，必然失败）、跑一次地区自动识别并可能改写
# region、无条件截断重写 agent.yaml（会毁掉 insecure_tls、手工调过的
# report_interval 等），以及重写 systemd unit（会覆盖运维自定义的资源限制）。
#
# node_id 与 token 都保存在 agent.yaml 里，换二进制不会改变它们，因此升级后看板上
# 仍是同一个节点，历史曲线、计费与目标分配全部延续——不需要删掉重新添加。
do_upgrade() {
    check_root

    if [ ! -f "${CONFIG_PATH}" ]; then
        log_error "未找到配置文件 ${CONFIG_PATH}，这台主机似乎还没有安装过 Agent。"
        log_info "请改用常规安装: $0 --server <URL> --token <TOKEN>"
        exit 1
    fi

    # 配置文件里的 server_url 是升级时唯一需要的东西；命令行参数优先，便于换服务端。
    if [ -z "${SERVER_URL}" ]; then
        SERVER_URL="$(read_config_value server_url || true)"
    fi
    if [ -z "${SERVER_URL}" ]; then
        log_error "无法从 ${CONFIG_PATH} 读取 server_url，请用 --server 显式指定。"
        exit 1
    fi

    local node_id
    node_id="$(read_config_value node_id || true)"

    local old_version
    old_version="$(agent_version_of "${BIN_PATH}")"

    log_info "正在升级 Cyber Probe Agent..."
    log_info "节点 ID   : ${node_id:-未知}"
    log_info "服务端    : ${SERVER_URL}"
    log_info "当前版本  : ${old_version}"

    mkdir -p "${INSTALL_DIR}"
    stage_binary_target

    local download_url="${CUSTOM_DOWNLOAD_URL}"
    if [ -z "$download_url" ]; then
        download_url="$(resolve_http_base)/download/probe-agent"
    fi

    log_info "正在下载最新二进制: ${download_url} ..."
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "${BIN_TMP}" "${download_url}" || {
            log_error "下载失败: ${download_url}"
            log_error "原有安装未做任何改动，Agent 仍在正常运行。"
            exit 1
        }
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "${BIN_TMP}" "${download_url}" || {
            log_error "下载失败: ${download_url}"
            log_error "原有安装未做任何改动，Agent 仍在正常运行。"
            exit 1
        }
    else
        log_error "系统缺少 curl 或 wget，请先安装其中之一。"
        exit 1
    fi

    # 校验在替换之前：不通过则 BIN_PATH 原封不动，运行中的服务不受影响。
    if ! commit_staged_binary; then
        log_error "新二进制校验未通过，已保留原有安装。"
        exit 1
    fi

    local new_version
    new_version="$(agent_version_of "${BIN_PATH}")"
    log_success "二进制已更新: ${old_version} → ${new_version}"

    if [ -z "${node_id}" ]; then
        log_warn "未能读到 node_id，请确认 ${CONFIG_PATH} 中的节点标识。"
    fi
    log_info "配置文件 ${CONFIG_PATH} 未做任何改动。"

    if command -v systemctl >/dev/null 2>&1; then
        systemctl restart probe-agent
        if wait_for_service; then
            log_success "Agent 已使用新版本重新上线，看板上的节点不会变化。"
        else
            log_warn "服务未能进入 active 状态，正在打印最近日志:"
            journalctl -u probe-agent -n 15 --no-pager
            exit 1
        fi
    else
        log_warn "当前系统未安装 Systemd，请手动重启 Agent 进程以载入新版本。"
    fi
}

# 执行对应操作
case "$ACTION" in
    uninstall)
        do_uninstall
        ;;
    status)
        do_status
        ;;
    restart)
        do_restart
        ;;
    logs)
        do_logs
        ;;
    upgrade)
        do_upgrade
        ;;
    install)
        do_install
        ;;
esac
