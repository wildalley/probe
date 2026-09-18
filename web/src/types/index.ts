export interface PingStat {
  id?: number;
  target: string;
  label: string;
  color: string;
  latency_ms: number;
  packet_loss: number;
  jitter: number;
}

export interface BillingInfo {
  price?: number;
  price_per_month: number;
  currency: string;
  billing_cycle?: string;
  expiry_date?: string;
  remaining_days: number;
  /** 剩余价值（人民币基准，后台汇总用）。 */
  remaining_value: number;
  /** 剩余价值（节点本币，卡片展示用）。 */
  remaining_value_native?: number;
  bandwidth_quota: number;
  /** 生效已用流量：校准基线 + 锚定后累计。缺省 0。 */
  bandwidth_used?: number;
  /**
   * 已用流量的上行/下行拆分，两者之和恒等于 `bandwidth_used`，所以明细永远
   * 不会和配额所依据的总量互相矛盾。配额本身仍是合并口径，这两个字段只用于
   * 展示，不构成独立限额。
   *
   * 校准基线是服务商面板上的单一合并数字，其自身方向占比无法得知，由服务端
   * 按锚定时刻的网卡上下行比例折算；锚定之后的流量则归属真实承载它的方向。
   */
  bandwidth_used_up?: number;
  bandwidth_used_down?: number;
  /** 服务端下发的实时网卡累计（bytes since boot），供校准 UI 展示。 */
  bandwidth_live?: number;
  /** 实时网卡累计的方向拆分，两者之和等于 `bandwidth_live`。 */
  bandwidth_live_up?: number;
  bandwidth_live_down?: number;
  provider: string;
  auto_renewal?: boolean;
  note?: string;
}

export interface PingTargetConfig {
  id?: number;
  label: string;
  target: string;
  color: string;
  protocol?: string;
  port?: number;
  interval?: number;
  servers?: string[];
  auto_start?: boolean;
  enabled?: boolean;
  created_at?: number;
}

export interface NodeSettings {
  node_id: string;
  name?: string;
  region?: string;
  tags?: string[];
  provider?: string;
  public_ip?: string;
  public_ipv6?: string;
  price: number;
  currency: string;
  billing_cycle: string;
  expiry_date: string;
  bandwidth_quota: number;
  /** 校准基线（0 = 取消校准，回到纯实时口径）。 */
  bandwidth_used?: number;
  /** 校准基线对应的网卡累计快照，由服务端锚定，前端一般不填。 */
  bandwidth_base_counter?: number;
  /**
   * 锚点的方向拆分，同样由服务端写入，前端不填。服务端保存时会把三个锚点一起
   * 更新，用于把合并基线折算到上行/下行。
   */
  bandwidth_base_counter_up?: number;
  bandwidth_base_counter_down?: number;
  auto_renewal: boolean;
  note?: string;
  updated_at?: number;
}

export interface SystemSettings {
  base_currency: string;
  exchange_rates: Record<string, number>;
  last_rate_update: number;
}

export interface SystemInfo {
  os: string;
  kernel: string;
  /**
   * 上报这份数据的 Agent 的构建版本。
   *
   * 可选，且缺失是有意义的：早于该字段的 Agent 不会发送它，未打版本戳的构建
   * 会发送空串。两种情况都必须渲染成「未知（旧版）」，不能填占位串——缺失本身
   * 就是要看的信号。
   */
  agent_version?: string;
  uptime: number;
  cpu_model?: string;
  cpu_mark?: string;
  virtualization?: string;
  public_ip?: string;
  public_ipv6?: string;
  cpu_percent: number;
  cpu_count?: number;
  mem_used: number;
  mem_total: number;
  swap_used?: number;
  swap_total?: number;
  disk_percent: number;
  disk_used?: number;
  disk_total?: number;
  load_1?: number;
  load_5?: number;
  load_15?: number;
  process_count?: number;
}

export interface NetworkInfo {
  bytes_sent: number;
  bytes_recv: number;
  tcp_established: number;
  udp_established?: number;
  rate_upload: number;
  rate_download: number;
  monthly_peak_down?: number;
  monthly_peak_up?: number;
}

export interface NodeState {
  node_id: string;
  name: string;
  region: string;
  tags?: string[];
  billing?: BillingInfo;
  is_online: boolean;
  last_seen: number;
  system: SystemInfo;
  network: NetworkInfo;
  pings?: PingStat[];
  cpu: number;
  mem: number;
  swap?: number;
  disk: number;
  rate_down: number;
  rate_up: number;
  uptime_str: string;
}

export interface HistoryPoint {
  node_id: string;
  timestamp: number;
  cpu_percent: number;
  mem_percent?: number;
  load_1?: number;
  mem_used?: number;
  mem_total?: number;
  swap_used?: number;
  swap_total?: number;
  disk_used?: number;
  disk_total?: number;
  rate_download: number;
  rate_upload: number;
  tcp_count?: number;
  udp_count?: number;
  process_count?: number;
}

export interface PingHistoryPoint {
  node_id: string;
  timestamp: number;
  target: string;
  label: string;
  latency_ms: number;
  packet_loss: number;
}

export interface WSEvent {
  type: "nodes_snapshot" | "node_update" | "node_offline" | "node_delete";
  timestamp: number;
  data: any;
}

export interface SystemSummary {
  total_nodes: number;
  online_nodes: number;
  offline_nodes: number;
  total_rate_down: number;
  total_rate_up: number;
  avg_cpu: number;
  avg_mem: number;
}

export interface TokenItem {
  token: string;
  label: string;
  created_at: number;
}

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  secret?: string;
  format: "generic" | "feishu" | "dingtalk" | "wecom" | "bark";
}

export interface DiscordConfig {
  enabled: boolean;
  webhook_url: string;
  /** Overrides the webhook's default bot name when set. */
  username?: string;
}

export interface NotificationRules {
  offline_alert: boolean;
  offline_threshold_sec: number;
  recovery_alert: boolean;
  traffic_alert: boolean;
  traffic_threshold_pct: number;
  daily_report: boolean;
  daily_report_time: string;
}

export interface NotificationSettings {
  telegram: TelegramConfig;
  webhook: WebhookConfig;
  discord: DiscordConfig;
  rules: NotificationRules;
  updated_at?: number;
}

export interface NotificationLog {
  id: number;
  timestamp: number;
  channel: string;
  type: string;
  title: string;
  content: string;
  status: "success" | "failed";
  error_msg?: string;
}
