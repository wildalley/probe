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
    echo "  --uninstall              彻底卸载 Agent 及系统服务"
    echo "  --status                 查看 Agent 运行状态"
    echo "  --restart                重启 Agent 服务"
    echo "  --logs                   查看 Agent 实时运行日志"
    echo "  -h, --help               显示帮助信息"
    echo ""
    echo -e "${BOLD}一键示例:${NC}"
    echo "  curl -sSL http://1.2.3.4:8080/install.sh | sudo bash -s -- --server ws://1.2.3.4:8080 --token sk_xxx --name \"My VPS\" --region \"HK\""
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

    # 优先检查本地脚本同级或父级目录是否存在现成的 probe-agent 二进制
    local found_local=""
    for candidate in "./bin/probe-agent" "./probe-agent" "../bin/probe-agent" "/tmp/probe-agent"; do
        if [ -f "$candidate" ] && [ -x "$candidate" ]; then
            found_local="$candidate"
            break
        fi
    done

    if [ -n "$found_local" ]; then
        log_info "发现本地可用二进制文件: ${found_local}，直接拷贝安装..."
        cp -f "$found_local" "${BIN_PATH}"
    else
        # 否则尝试从服务端或者指定 URL 下载
        local download_url="${CUSTOM_DOWNLOAD_URL}"
        if [ -z "$download_url" ]; then
            # 从 SERVER_URL 推算 HTTP 下载地址
            local http_base="${SERVER_URL}"
            http_base="${http_base/ws:\/\//http:\/\/}"
            http_base="${http_base/wss:\/\//https:\/\/}"
            # 去除 path
            http_base="$(echo "$http_base" | sed -E 's/(\/(api|ws).*|\/)$//')"
            download_url="${http_base}/download/probe-agent"
        fi

        log_info "从服务端下载二进制: ${download_url} ..."
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL -o "${BIN_PATH}" "${download_url}" || {
                log_error "curl 下载失败，请检查网络或服务端是否在线。"
                exit 1
            }
        elif command -v wget >/dev/null 2>&1; then
            wget -q -O "${BIN_PATH}" "${download_url}" || {
                log_error "wget 下载失败，请检查网络或服务端是否在线。"
                exit 1
            }
        else
            log_error "系统缺少 curl 或 wget，请先安装其中之一。"
            exit 1
        fi
    fi

    chmod +x "${BIN_PATH}"
    log_success "二进制程序已安装至: ${BIN_PATH}"

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

        sleep 1.5
        if systemctl is-active --quiet probe-agent; then
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
    install)
        do_install
        ;;
esac
