import React, { useState } from "react";
import { Sparkles, Send, Bot, User, HelpCircle, Terminal } from "lucide-react";

interface Message {
  role: "user" | "bot";
  text: string;
}

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "👋 Hello! I am the MasterDnsVPN AI Assistant. I have read the complete protocol specs (ARQ windows, basecodec structures, custom 5-byte packet overhead, and failover balancers).\n\nAsk me anything! For example:\n- *'How does MasterDnsVPN save 88% overhead compared to DNSTT?'*\n- *'Explain the difference between LowerBase32 and RawBase64 in DNS subdomains.'*\n- *'How does the ARQ sliding window handle DNS packet loss?'*"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    const userQuery = inputText;
    setInputText("");
    setMessages(prev => [...prev, { role: "user", text: userQuery }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userQuery })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "bot", text: data.text || "I was unable to get a response from the Gemini model. Verify your API key." }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "bot", text: "Failed to connect to the backend server. Make sure the server is fully running." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSampleQuestion = (q: string) => {
    setInputText(q);
  };

  return (
    <div id="ai_assistant_view" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col md:flex-row h-[550px]">
      {/* Suggestions and Info Sidebar */}
      <div className="w-full md:w-64 bg-slate-950 p-5 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-200">Protocol Assistant</h4>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Unravel the complexity of high-performance DNS Tunneling algorithms. Select a sample topic below or type your custom query.
          </p>

          <div className="space-y-2 pt-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Quick Suggestions</span>
            <button
              onClick={() => loadSampleQuestion("How does MasterDnsVPN achieve up to 9x speed boost compared to DNSTT?")}
              className="w-full text-left bg-slate-900 hover:bg-slate-800/80 p-2 rounded text-[11px] text-slate-300 transition-colors border border-slate-800/50 block cursor-pointer truncate"
            >
              🚀 Why is it 9x faster than DNSTT?
            </button>
            <button
              onClick={() => loadSampleQuestion("Explain the 5-byte packet header structure in MasterDnsVPN")}
              className="w-full text-left bg-slate-900 hover:bg-slate-800/80 p-2 rounded text-[11px] text-slate-300 transition-colors border border-slate-800/50 block cursor-pointer truncate"
            >
              📦 Custom 5-byte packet header
            </button>
            <button
              onClick={() => loadSampleQuestion("What does the ARQ window and packet duplication count do for lossy links?")}
              className="w-full text-left bg-slate-900 hover:bg-slate-800/80 p-2 rounded text-[11px] text-slate-300 transition-colors border border-slate-800/50 block cursor-pointer truncate"
            >
              🔄 ARQ & Duplication counts
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-900 text-[10px] text-slate-500 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Gemini 2.5 Flash Active</span>
        </div>
      </div>

      {/* Chat Canvas */}
      <div className="flex-1 flex flex-col justify-between h-full bg-slate-900/40">
        {/* Messages feed */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[450px]">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex gap-3 max-w-3xl ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                m.role === "user" ? "bg-sky-600/20 text-sky-400" : "bg-indigo-600/20 text-indigo-400"
              }`}>
                {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`rounded-xl p-4 text-xs leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                m.role === "user" 
                  ? "bg-sky-600/10 text-sky-100 border border-sky-500/20" 
                  : "bg-slate-950 text-slate-200 border border-slate-800/80 shadow-md"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 mr-auto items-center text-xs text-slate-400 font-mono animate-pulse pl-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              <span>AI is thinking about the protocol specs...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-slate-950/40 border-t border-slate-800/80 flex gap-2">
          <input
            type="text"
            placeholder="Ask about sliding windows, packet encryption, DNS subdomains..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={isLoading}
            className="flex-1 bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 rounded-lg px-4 py-2.5 text-xs outline-none transition-all"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputText.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
