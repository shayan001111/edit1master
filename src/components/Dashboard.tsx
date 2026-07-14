import React, { useEffect, useState } from "react";
import { VpnStatus } from "../types";
import { 
  Activity, ArrowUp, ArrowDown, Timer, Shield, Info, Server, Cpu, RefreshCw
} from "lucide-react";
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid 
} from "recharts";

interface DashboardProps {
  status: VpnStatus;
  onConnect: (profile: string) => void;
  onDisconnect: () => void;
  isLoading: boolean;
}

interface SpeedHistory {
  time: string;
  up: number;
  down: number;
}

export default function Dashboard({ status, onConnect, onDisconnect, isLoading }: DashboardProps) {
  const [speedHistory, setSpeedHistory] = useState<SpeedHistory[]>([]);
  const [profile, setProfile] = useState("Default Balanced Profile");

  // Keep a rolling history of upload and download speeds
  useEffect(() => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSpeedHistory(prev => {
      const next = [...prev, { time: now, up: status.transferSpeedUp, down: status.transferSpeedDown }];
      if (next.length > 20) {
        next.shift();
      }
      return next;
    });
  }, [status.transferSpeedUp, status.transferSpeedDown]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [
      h > 0 ? String(h).padStart(2, '0') + 'h' : '',
      String(m).padStart(2, '0') + 'm',
      String(s).padStart(2, '0') + 's'
    ].filter(Boolean).join(" ");
  };

  return (
    <div id="dashboard_view" className="space-y-6">
      {/* Top Banner with Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${status.isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400 animate-pulse'}`}>
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide">
              {status.isConnected ? "Client Tunnel Active" : "Client Tunnel Disconnected"}
            </h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {status.isConnected 
                ? `Multipath DNS Tunneling via ${status.currentProfile}` 
                : "Configure your settings and launch the tunnel client."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {!status.isConnected ? (
            <>
              <select 
                value={profile} 
                onChange={(e) => setProfile(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 px-3 py-2.5 rounded-lg text-sm outline-none focus:border-slate-600 transition-colors cursor-pointer w-full md:w-48"
              >
                <option value="Default Balanced Profile">Balanced Profile</option>
                <option value="Aggressive Low-Latency">Aggressive Latency</option>
                <option value="High Loss Duplication Profile">Heavy Loss (X3 Duplication)</option>
                <option value="ZSTD Compression Profile">Compressive (ZSTD)</option>
              </select>
              <button
                onClick={() => onConnect(profile)}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-2.5 rounded-lg transition-all text-sm shadow-lg shadow-emerald-900/20 active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                Launch Client
              </button>
            </>
          ) : (
            <button
              onClick={onDisconnect}
              disabled={isLoading}
              className="bg-rose-600 hover:bg-rose-500 text-white font-medium px-6 py-2.5 rounded-lg transition-all text-sm shadow-lg shadow-rose-900/20 active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap w-full md:w-auto"
            >
              Stop Client
            </button>
          )}
        </div>
      </div>

      {/* Main Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Download Rate */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Download</span>
            <ArrowDown className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono tracking-tight text-emerald-400">
              {status.transferSpeedDown}
            </span>
            <span className="text-slate-400 text-sm">KB/s</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex justify-between">
            <span>Total Recv</span>
            <span className="font-mono text-slate-300">{formatBytes(status.totalDataReceived)}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/10"></div>
        </div>

        {/* Card 2: Upload Rate */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Upload</span>
            <ArrowUp className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono tracking-tight text-sky-400">
              {status.transferSpeedUp}
            </span>
            <span className="text-slate-400 text-sm">KB/s</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex justify-between">
            <span>Total Sent</span>
            <span className="font-mono text-slate-300">{formatBytes(status.totalDataSent)}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-500/10"></div>
        </div>

        {/* Card 3: Network Stats */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Path Quality</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-2 justify-between">
            <div>
              <span className="text-xl font-bold font-mono text-purple-400">{status.averageLatency}</span>
              <span className="text-slate-500 text-xs ml-1">ms</span>
            </div>
            <div>
              <span className="text-xl font-bold font-mono text-pink-400">{(status.packetLossRate * 100).toFixed(1)}</span>
              <span className="text-slate-500 text-xs ml-1">% loss</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex justify-between">
            <span>Active Streams</span>
            <span className="font-mono text-slate-300">{status.activeStreamCount} sockets</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-500/10"></div>
        </div>

        {/* Card 4: Synced MTU */}
        <div className="bg-slate-900/60 border border-slate-900 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Session Uptime</span>
            <Timer className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-amber-400">
              {status.isConnected ? formatUptime(status.uptime) : "00:00"}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex justify-between">
            <span>SOCKS Proxy</span>
            <span className="text-slate-300 font-mono">127.0.0.1:18000</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500/10"></div>
        </div>
      </div>

      {/* Chart & MTU detail row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Realtime Performance Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h3 className="text-md font-bold font-display">Real-Time Throughput</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">Roll-rate 1.0s</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedHistory}>
                <defs>
                  <linearGradient id="colorDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area name="Download Speed (KB/s)" type="monotone" dataKey="down" stroke="#10b981" fillOpacity={1} fill="url(#colorDown)" strokeWidth={2} />
                <Area name="Upload Speed (KB/s)" type="monotone" dataKey="up" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorUp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sync MTU & Path Redundancy Stats */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <h3 className="text-md font-bold font-display flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            Path Negotiation Stats
          </h3>

          <div className="space-y-4">
            {/* Synced Upload MTU */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-medium">Negotiated Upload MTU</span>
                <span className="font-mono text-sky-400 font-bold">{status.syncedMtuUp} Bytes</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2.5">
                <div 
                  className="bg-sky-400 h-1.5 rounded-full" 
                  style={{ width: `${Math.min(100, (status.syncedMtuUp / 300) * 100)}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Clamped by bottleneck resolvers. Safe payload limit is 120 bytes.
              </p>
            </div>

            {/* Synced Download MTU */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-medium">Negotiated Download MTU</span>
                <span className="font-mono text-emerald-400 font-bold">{status.syncedMtuDown} Bytes</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 mt-2.5">
                <div 
                  className="bg-emerald-400 h-1.5 rounded-full" 
                  style={{ width: `${Math.min(100, (status.syncedMtuDown / 4000) * 100)}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                TXT and CNAME responses payload reassembly capacity.
              </p>
            </div>

            {/* ARQ Sliding Window */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/60 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">ARQ Sliding Window Size:</span>
                <span className="font-mono text-slate-200">1000 Packets</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Encryption Active:</span>
                <span className="font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  ChaCha20 (AES)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tunnel Method:</span>
                <span className="font-mono text-slate-200">DNS TXT + CNAME Subdomains</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simulator Quick Tips */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex gap-3 text-xs text-slate-400 leading-relaxed">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-slate-300">How the active client operates:</p>
          <p className="mt-1">
            In standard mode, MasterDnsVPN intercepts local software connections (e.g., SOCKS5 browser traffic), fragments TCP streams into small MTU blocks, adds light 5-byte custom headers, encodes using lowercase formats, and routes them via balanced public DNS resolvers to avoid active network interception.
          </p>
        </div>
      </div>
    </div>
  );
}
