import React, { useState } from "react";
import { DnsResolverResult } from "../types";
import { Play, Shield, Globe, Info, Zap, AlertTriangle, CheckCircle, BarChart2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

export default function ResolverTester() {
  const [targetDomain, setTargetDomain] = useState("google.com");
  const [results, setResults] = useState<DnsResolverResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState("");

  const runBenchmark = async () => {
    setIsTesting(true);
    setError("");
    try {
      const res = await fetch("/api/dns/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDomain })
      });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
      } else {
        setError(data.error || "Benchmark failed");
      }
    } catch (err: any) {
      setError("Failed to reach server backend: " + err.message);
    } finally {
      setIsTesting(false);
    }
  };

  // Find fastest online resolver
  const onlineResolvers = results.filter(r => r.latency !== null);
  const fastestResolver = onlineResolvers.length > 0 
    ? [...onlineResolvers].sort((a, b) => (a.latency || 0) - (b.latency || 0))[0] 
    : null;

  return (
    <div id="resolver_tester_view" className="space-y-6">
      {/* Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-sky-400" />
          <h3 className="text-md font-bold font-display">Active DNS Path Benchmark</h3>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-xs text-slate-400 font-medium">Target Host Domain for Test Lookups</label>
            <input
              type="text"
              value={targetDomain}
              onChange={(e) => setTargetDomain(e.target.value)}
              disabled={isTesting}
              placeholder="e.g. google.com, cloudflare.com, wikipedia.org"
              className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-3.5 py-2.5 text-xs outline-none text-slate-100 font-mono transition-colors"
            />
          </div>

          <button
            onClick={runBenchmark}
            disabled={isTesting || !targetDomain}
            className="bg-sky-600 hover:bg-sky-500 text-white font-medium px-6 py-2.5 rounded-lg transition-all text-xs flex items-center gap-1.5 shadow-lg shadow-sky-950/20 active:scale-95 disabled:opacity-50 cursor-pointer h-[38px] whitespace-nowrap"
          >
            <Play className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            {isTesting ? "Benchmarking Lookups..." : "Run Active Speed Test"}
          </button>
        </div>

        <p className="text-[11px] text-slate-500 mt-1">
          This test performs actual real-time IPv4 DNS queries from the AI Studio container to measure lookup response times (RTT) across multiple standard resolver servers.
        </p>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List and Leaderboard of results */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h4 className="text-xs font-bold font-display tracking-wider text-slate-400 uppercase">Benchmark Results</h4>
            
            {fastestResolver && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">Fastest Path Selected</p>
                  <p className="text-xs font-bold text-emerald-400">{fastestResolver.name} ({fastestResolver.ip})</p>
                  <p className="text-xs font-mono font-bold text-slate-200 mt-0.5">Latency: {fastestResolver.latency} ms</p>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {results.map((res) => (
                <div key={res.ip} className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-200">{res.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{res.ip}</p>
                  </div>
                  <div className="text-right">
                    {res.latency !== null ? (
                      <span className="font-mono text-emerald-400 font-bold">{res.latency} ms</span>
                    ) : (
                      <span className="text-rose-400 text-[11px] font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Timeout
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bar Chart Representation of speeds */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs font-bold font-display tracking-wider text-slate-400 uppercase">Latency comparison (lower is better)</h4>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results.filter(r => r.latency !== null)}>
                  <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="latency" radius={[4, 4, 0, 0]}>
                    {results.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.latency && fastestResolver && entry.latency === fastestResolver.latency ? '#10b981' : '#6366f1'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 mt-4 text-xs text-slate-400 space-y-1">
              <span className="font-bold text-slate-200">How MasterDnsVPN balances these:</span>
              <p className="text-[11px] leading-relaxed">
                The tunnel client runs periodic parallel background latency/loss checks (the equivalent of this test). Depending on your chosen <strong>RESOLVER_BALANCING_STRATEGY</strong> (e.g. Mode 5: Hybrid Score, or Mode 6: Loss Then Latency), the client routes packets selectively to the top 10% optimal paths, eliminating bottleneck servers that slow down transfer speeds.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Error running lookup test: {error}</span>
        </div>
      )}
    </div>
  );
}
