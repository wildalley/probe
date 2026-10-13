export type RegionLayoutStyle = "tower" | "ring" | "honeycomb" | "matrix";

export interface PingItem {
  target: string;
  label: string;
  latency_ms: number;
  packet_loss: number;
  color?: string;
}

export interface BillingDetails {
  price?: number;
  price_monthly?: number;
  currency?: string;
  billing_cycle?: string;
  expiry_date?: string;
  remaining_days?: number;
  remaining_value?: number;
  bandwidth_quota?: number;
  bandwidth_used?: number;
}

export interface ThemeNode {
  id: string;
  name: string;
  region: string;
  tags: string[];
  is_online: boolean;
  last_seen: number;
  
  // Real-time loads
  cpu: number; // 0 - 100
  mem: number; // 0 - 100
  mem_used: number; // bytes
  mem_total: number; // bytes
  disk: number; // 0 - 100
  disk_used: number; // bytes
  disk_total: number; // bytes
  swap?: number;
  swap_used?: number;
  swap_total?: number;

  // Real-time network throughput
  rate_down: number; // bytes/s
  rate_up: number; // bytes/s
  traffic_down?: number; // total bytes
  traffic_up?: number; // total bytes
  traffic_quota?: number; // total quota in bytes

  // System metrics
  load_1?: number;
  load_5?: number;
  load_15?: number;
  tcp_conn?: number;
  udp_conn?: number;
  uptime: number; // seconds
  uptime_str?: string;

  // Specifications
  os: string;
  kernel: string;
  cpu_model: string;
  cpu_cores: number;
  public_ip?: string;
  public_ipv6?: string;
  provider?: string;

  // Network probe
  latency?: number; // ms
  packet_loss?: number; // %
  jitter?: number;
  pings?: PingItem[];

  // Billing
  billing?: BillingDetails;
}

export interface RegionGroupData {
  regionKey: string;
  regionName: string;
  flag: string;
  nodes: ThemeNode[];
  onlineCount: number;
  totalCount: number;
  totalDownRate: number;
  totalUpRate: number;
  avgLatency: number;
}

export interface SiteInfo {
  title: string;
  description?: string;
  user?: string | null;
  canManage: boolean;
  isProbeBackend: boolean;
  isKomariBackend: boolean;
  isDemoMode: boolean;
}
