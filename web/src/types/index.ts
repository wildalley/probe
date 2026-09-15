export interface PingStat {
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
  remaining_value: number;
  bandwidth_quota: number;
  bandwidth_used?: number;
  provider: string;
  auto_renewal?: boolean;
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
  bandwidth_used?: number;
  auto_renewal: boolean;
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

