export interface StatusUsageMetric {
  used: number | null;
  total: number | null;
  percent: number | null;
}

export interface StatusNetworkMetric {
  up: number | null;
  down: number | null;
  totalUp: number | null;
  totalDown: number | null;
}

export interface PublicStatusNode {
  name: string;
  flag: string | null;
  location: string | null;
  provider: string | null;
  os: string | null;
  arch: string | null;
  online: boolean;
  cpuPercent: number | null;
  memory: StatusUsageMetric;
  disk: StatusUsageMetric;
  network: StatusNetworkMetric;
  uptimeSeconds: number | null;
  processCount: number | null;
  updatedAt: string | null;
}

export interface StatusSummary {
  total: number;
  online: number;
  regions: number;
  networkUp: number;
  networkDown: number;
}

export interface StatusSnapshot {
  success: true;
  generatedAt: string;
  degraded: boolean;
  summary: StatusSummary;
  nodes: PublicStatusNode[];
}
