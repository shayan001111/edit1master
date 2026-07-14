import React, { useState, useEffect, useRef } from "react";
import { PacketLog } from "../types";
import { Terminal, Trash2, Download, Search, Settings } from "lucide-react";

interface TerminalConsoleProps {
  logs: PacketLog[];
  onClearLogs: () => void;
}

export default function TerminalConsole({ logs, onClearLogs }: TerminalConsoleProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [logLevelFilter, setLogLevelFilter] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel = logLevelFilter === "ALL" || log.message.includes(`[${logLevelFilter}]`) || log.level === logLevelFilter;
    return matchesSearch && matchesLevel;
  });

  const downloadLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `masterdnsvpn_session_${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLogColorClass = (message: string) => {
    if (message.includes("[ARQ]")) return "text-orange-400";
    if (message.includes("[SOCKS5]")) return "text-sky-400";
    if (message.includes("[BALANCER]")) return "text-indigo-400";
    if (message.includes("[TUNNEL]")) return "text-purple-400";
    if (message.includes("ERROR") || message.includes("failed")) return "text-rose-400 font-bold";
    if (message.includes("ONLINE") || message.includes("=== STARTING")) return "text-emerald-400 font-bold";
    return "text-slate-300";
  };

  return (
    <div id="terminal_console_view" className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[500px]">
      {/* Console Header / Action Bar */}
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-indigo-400 animate-pulse" />
          <h3 className="text-xs font-bold font-display uppercase tracking-wider text-slate-200">Terminal & Core Engine Console</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Search */}
          <div className="relative w-full sm:w-44">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none transition-all"
            />
          </div>

          {/* Type Filter */}
          <select
            value={logLevelFilter}
            onChange={(e) => setLogLevelFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs outline-none cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="ARQ">ARQ Sliding Window</option>
            <option value="SOCKS5">SOCKS5 Proxy</option>
            <option value="TUNNEL">DNS Tunnel RX/TX</option>
            <option value="BALANCER">Resolver Balancer</option>
          </select>

          {/* Action Buttons */}
          <button
            onClick={downloadLogs}
            title="Download Logs"
            className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded-lg border border-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClearLogs}
            title="Clear Console"
            className="p-2 bg-slate-950 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 hover:border-rose-900/50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Canvas */}
      <div className="flex-1 p-5 overflow-y-auto font-mono text-xs leading-relaxed space-y-1.5 bg-slate-950/50 flex flex-col">
        {filteredLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 hover:bg-slate-900/30 py-0.5 rounded px-1 transition-colors group">
            <span className="text-slate-600 select-none text-[10px] pt-0.5">{log.timestamp}</span>
            <span className="text-slate-500 select-none text-[10px] bg-slate-900 px-1.5 py-0.5 rounded font-bold border border-slate-800 shrink-0">
              {log.level}
            </span>
            <span className={`${getLogColorClass(log.message)} break-all`}>
              {log.message}
            </span>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 space-y-1 py-12">
            <Settings className="w-8 h-8 text-slate-800 animate-spin" style={{ animationDuration: '6s' }} />
            <span className="text-xs">No logs matching criteria found</span>
          </div>
        )}
        <div ref={consoleEndRef}></div>
      </div>

      {/* Console Footer */}
      <div className="bg-slate-900/80 px-4 py-2 border-t border-slate-800/60 flex justify-between items-center text-[10px] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Engine Status: Active (Simulator)</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 h-3 w-3 cursor-pointer"
          />
          Auto-scroll
        </label>
      </div>
    </div>
  );
}
