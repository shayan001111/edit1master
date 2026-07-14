export interface PacketLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

export interface VpnStatus {
  isConnected: boolean;
  transferSpeedUp: number;
  transferSpeedDown: number;
  totalDataSent: number;
  totalDataReceived: number;
  syncedMtuUp: number;
  syncedMtuDown: number;
  packetLossRate: number;
  averageLatency: number;
  activeStreamCount: number;
  currentProfile: string;
  uptime: number;
  logs: PacketLog[];
}

export interface DnsResolverResult {
  name: string;
  ip: string;
  latency: number | null;
  status: string;
}

export interface SimPacket {
  id: string;
  type: "UPSTREAM" | "DOWNSTREAM" | "ACK" | "CONTROL";
  seq: number;
  size: number;
  resolver: string;
  encodedPayload: string;
  status: "sending" | "success" | "lost" | "queued";
}
