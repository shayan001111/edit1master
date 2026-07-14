import React, { useEffect, useState } from "react";
import { Server, User, Save, CheckCircle, AlertCircle, FileText, Sparkles } from "lucide-react";

export default function ConfigEditor() {
  const [activeTab, setActiveTab] = useState<"client" | "server">("client");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [explainResult, setExplainResult] = useState("");
  const [isExplaining, setIsExplaining] = useState(false);

  // Load configuration on mount and active tab change
  useEffect(() => {
    loadConfig();
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`/api/config/${activeTab}`);
      const data = await res.json();
      if (data.content) {
        setContent(data.content);
        setSaveStatus("idle");
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`/api/config/${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("success");
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExplain = async () => {
    setIsExplaining(true);
    setExplainResult("");
    try {
      const prompt = `Please analyze the current selected ${activeTab === 'client' ? 'Client' : 'Server'} config and provide a high-level summary of:
      1. Active domains and proxy listeners.
      2. Security settings (encryption and key settings).
      3. Balancing, duplication, and reliability strategies active.
      
      Here is the config file content:
      ${content.substring(0, 3000)}`;

      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      setExplainResult(data.text || "No response received.");
    } catch (err) {
      setExplainResult("Failed to generate analysis. Ensure your Gemini API Key is configured.");
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <div id="config_editor_view" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Sidebar - Settings Guide */}
      <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          <h3 className="text-md font-bold font-display">Configuration Guide</h3>
        </div>

        <div className="space-y-3 text-xs leading-relaxed">
          <p className="text-slate-400">
            MasterDnsVPN parameters are tuned through TOML formatting. Modify variables inside the editor.
          </p>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <h4 className="font-bold text-slate-300">DOMAINS</h4>
            <p className="text-slate-400">The root wildcard domain representing your VPN tunnel (e.g. <code>v.domain.com</code>). Must match server exactly.</p>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <h4 className="font-bold text-slate-300">DATA_ENCRYPTION</h4>
            <p className="text-slate-400">Method used for raw payload wrapping. Supports <code>None (0)</code>, <code>XOR (1)</code>, <code>ChaCha20 (2)</code>, or <code>AES-GCM (3)</code>.</p>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <h4 className="font-bold text-slate-300">BALANCING STRATEGY</h4>
            <p className="text-slate-400">Multipath routing mode. Modes like <code>Least Loss (3)</code> or <code>Lowest Latency (4)</code> auto-rank servers dynamically.</p>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <h4 className="font-bold text-slate-300">PACKET DUPLICATION</h4>
            <p className="text-slate-400">Sets how many redundant copies of a packet are sent. Vital for overcoming packet loss on censored networks.</p>
          </div>
        </div>
      </div>

      {/* Editor Main Canvas */}
      <div className="lg:col-span-3 flex flex-col space-y-4">
        {/* Tab Controls */}
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("client")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === "client" 
                  ? "bg-slate-800 text-sky-400 shadow-md shadow-black/25" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <User className="w-4 h-4" />
              Client Profile (client_config.toml)
            </button>
            <button
              onClick={() => setActiveTab("server")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === "server" 
                  ? "bg-slate-800 text-sky-400 shadow-md shadow-black/25" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Server className="w-4 h-4" />
              Server Profile (server_config.toml)
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExplain}
              disabled={isExplaining || !content}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isExplaining ? "Analyzing..." : "Analyze with AI"}
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-md shadow-sky-950/20 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving..." : "Save Config"}
            </button>
          </div>
        </div>

        {/* Save feedback block */}
        {saveStatus === "success" && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>Config updated and applied to the simulation pipeline successfully!</span>
          </div>
        )}
        {saveStatus === "error" && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>Failed to save the configuration. Check server permissions.</span>
          </div>
        )}

        {/* Editor Area */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-inner flex-1 flex flex-col min-h-[450px]">
          <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex justify-between text-xs text-slate-500">
            <span>TOML Syntax Highlighter Active</span>
            <span>UTF-8 Encoding</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full bg-slate-950 p-5 text-slate-300 font-mono text-xs leading-relaxed outline-none resize-none focus:bg-slate-950/90 transition-all border-none focus:ring-0"
            spellCheck={false}
          />
        </div>

        {/* AI Explanation block */}
        {explainResult && (
          <div className="bg-indigo-950/30 border border-indigo-500/20 p-5 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold font-display text-indigo-400">
              <Sparkles className="w-4 h-4" />
              <span>AI Configuration Breakdown</span>
            </div>
            <div className="text-xs text-slate-300 space-y-2 whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto pr-2">
              {explainResult}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
