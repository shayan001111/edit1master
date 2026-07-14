import React, { useEffect, useState } from "react";
import { VpnStatus } from "./types";
import Dashboard from "./components/Dashboard";
import ConfigEditor from "./components/ConfigEditor";
import PacketSimulator from "./components/PacketSimulator";
import ResolverTester from "./components/ResolverTester";
import TerminalConsole from "./components/TerminalConsole";
import AiAssistant from "./components/AiAssistant";
import { Shield, LayoutDashboard, Settings2, HelpCircle, Activity, Server, FileText, Sparkles, Terminal } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "config" | "benchmark" | "simulator" | "terminal" | "ai">("dashboard");
  const [status, setStatus] = useState<VpnStatus>({
    isConnected: false,
    transferSpeedUp: 0,
    transferSpeedDown: 0,
    totalDataSent: 0,
    totalDataReceived: 0,
    syncedMtuUp: 138,
    syncedMtuDown: 2400,
    packetLossRate: 0.02,
    averageLatency: 45,
    activeStreamCount: 0,
    currentProfile: "Default Balanced Profile",
    uptime: 0,
    logs: []
  });
  const [isLoading, setIsLoading] = useState(false);

  // Poll status endpoint every 1.5 seconds
  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 1500);
    return () => clearInterval(timer);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/vpn/status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Error fetching VPN status:", err);
    }
  };

  const handleConnect = async (profileName: string) => {
    setIsLoading(true);
    try {
      // Pass custom MTUs based on profiles
      let up = 138;
      let down = 2400;
      if (profileName.includes("Heavy")) {
        up = 110;
        down = 1800;
      } else if (profileName.includes("Aggressive")) {
        up = 150;
        down = 3500;
      }

      await fetch("/api/vpn/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileName, customMtuUp: up, customMtuDown: down })
      });
      await fetchStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/vpn/disconnect", { method: "POST" });
      await fetchStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/vpn/clear-logs", { method: "POST" });
      await fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Visual Navigation Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600/10 text-indigo-400 rounded-lg border border-indigo-500/15">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-md font-bold font-display tracking-tight text-white">MasterDnsVPN Portal</h1>
              <span className="text-[10px] bg-indigo-950 text-indigo-400 font-mono border border-indigo-900 px-1.5 py-0.5 rounded font-medium">v1.2.0 Go</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">Research-oriented high-speed DNS Tunnel & TCP Balancer</p>
          </div>
        </div>

        {/* Global Connection Badge */}
        <div className="flex items-center gap-2">
          {status.isConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold font-mono shadow-sm">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              TUNNEL ONLINE
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-slate-400 border border-slate-800 rounded-full text-xs font-semibold font-mono">
              <span className="w-1.5 h-1.5 bg-slate-600 rounded-full"></span>
              DISCONNECTED
            </div>
          )}
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Navigation Rail */}
        <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-900 bg-slate-950/40 p-5 space-y-2 shrink-0">
          <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase pl-2.5 block mb-2.5 select-none">Navigation</span>
          
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab("config")}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "config"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Configuration Editor
          </button>

          <button
            onClick={() => setActiveTab("benchmark")}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "benchmark"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
          >
            <Activity className="w-4 h-4" />
            DNS Path Benchmark
          </button>

          <button
            onClick={() => setActiveTab("simulator")}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "simulator"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
          >
            <Server className="w-4 h-4" />
            Protocol Visualizer
          </button>

          <button
            onClick={() => setActiveTab("terminal")}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "terminal"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
          >
            <Terminal className="w-4 h-4" />
            Terminal Console
          </button>

          <button
            onClick={() => setActiveTab("ai")}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "ai"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI Protocol Companion
          </button>
        </aside>

        {/* Dynamic Canvas Workspace */}
        <main className="flex-1 p-6 md:p-8 bg-slate-950 overflow-y-auto max-w-7xl mx-auto w-full">
          {activeTab === "dashboard" && (
            <Dashboard 
              status={status} 
              onConnect={handleConnect} 
              onDisconnect={handleDisconnect} 
              isLoading={isLoading} 
            />
          )}

          {activeTab === "config" && <ConfigEditor />}

          {activeTab === "benchmark" && <ResolverTester />}

          {activeTab === "simulator" && <PacketSimulator />}

          {activeTab === "terminal" && (
            <TerminalConsole 
              logs={status.logs} 
              onClearLogs={handleClearLogs} 
            />
          )}

          {activeTab === "ai" && <AiAssistant />}
        </main>
      </div>

      {/* Footer copyright */}
      <footer className="border-t border-slate-900 py-3 text-center text-[10px] text-slate-600 font-mono select-none">
        MasterDnsVPN scientific research tunnel | TON: masterking32.ton
      </footer>
    </div>
  );
}
