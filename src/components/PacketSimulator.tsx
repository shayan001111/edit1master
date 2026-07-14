import React, { useState } from "react";
import { ArrowRight, Cpu, Layers, HelpCircle, RefreshCw, Send, CheckCircle2 } from "lucide-react";

interface Fragment {
  id: number;
  text: string;
  hexHeader: string;
  encodedPayload: string;
  dnsQuery: string;
}

export default function PacketSimulator() {
  const [inputText, setInputText] = useState("GET /index.html HTTP/1.1\r\nHost: myvpn.secure");
  const [mtu, setMtu] = useState(30);
  const [encoder, setEncoder] = useState<"base64" | "base32" | "base36">("base32");
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [receivedText, setReceivedText] = useState("");
  const [simulatedLoss, setSimulatedLoss] = useState(false);
  const [arqRetries, setArqRetries] = useState<string[]>([]);

  // Simple string-to-hex converter
  const toHex = (str: string) => {
    let hex = "";
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(2, "0") + " ";
    }
    return hex.trim();
  };

  // Simplified Base Encoders to match basecodec package behavior
  const encodePayload = (str: string, mode: "base64" | "base32" | "base36") => {
    if (mode === "base64") {
      return btoa(str).replace(/=/g, "").toLowerCase(); // raw lower base64
    } else if (mode === "base32") {
      // standard mock lower base32
      const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
      let bits = "";
      for (let i = 0; i < str.length; i++) {
        bits += str.charCodeAt(i).toString(2).padStart(8, "0");
      }
      let encoded = "";
      for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.substr(i, 5).padEnd(5, "0");
        encoded += alphabet[parseInt(chunk, 2)];
      }
      return encoded;
    } else {
      // simple lower base36 mock representation
      return str.split("").map(c => c.charCodeAt(0).toString(36)).join("");
    }
  };

  const handleSimulate = () => {
    if (!inputText) return;
    setIsSimulating(true);
    setActiveStep(1);
    setReceivedText("");
    setArqRetries([]);

    // Step 1: Segmentation
    const chunks: Fragment[] = [];
    const streamIdHex = "1a2b"; // mock stream id
    
    let fragId = 1;
    for (let i = 0; i < inputText.length; i += mtu) {
      const chunkText = inputText.substr(i, mtu);
      
      // Step 2: 5-Byte custom transport header
      // byte 0: Flag type (0x02 = Stream Data)
      // byte 1-2: Stream ID (e.g. 0x1A2B)
      // byte 3-4: Sequence number (e.g. 0x0001)
      const flagHex = "02";
      const seqHex = fragId.toString(16).padStart(4, "0");
      const hexHeader = `${flagHex} ${streamIdHex.substr(0,2)} ${streamIdHex.substr(2,2)} ${seqHex.substr(0,2)} ${seqHex.substr(2,2)}`;

      // Step 3: Base encoding
      const payloadToEncode = String.fromCharCode(2) + String.fromCharCode(26, 43) + String.fromCharCode(0, fragId) + chunkText;
      const encoded = encodePayload(payloadToEncode, encoder);

      // Step 4: DNS query subdomain wrapping
      // <payload>.<stream-id>.<seq>.v.domain.com
      const dnsQuery = `${encoded.substring(0, 32)}.${streamIdHex}.${fragId}.v.domain.com`;

      chunks.push({
        id: fragId,
        text: chunkText,
        hexHeader,
        encodedPayload: encoded,
        dnsQuery
      });
      fragId++;
    }

    setFragments(chunks);

    // Timed stepper animations
    setTimeout(() => setActiveStep(2), 1200); // Header build
    setTimeout(() => setActiveStep(3), 2400); // Basecodec encoding
    setTimeout(() => setActiveStep(4), 3600); // DNS Mapping
    setTimeout(() => {
      setActiveStep(5); // Multipath sending
      if (simulatedLoss) {
        setArqRetries(["Loss detected at resolver 8.8.8.8. Resending sequence 2 via 1.1.1.1 (ARQ trigger)..."]);
      }
    }, 4800);
    setTimeout(() => {
      setActiveStep(6); // Assembly complete
      setReceivedText(inputText);
      setIsSimulating(false);
    }, 6500);
  };

  return (
    <div id="packet_simulator_view" className="space-y-6">
      {/* Simulation Playground Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-md font-bold font-display flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Interactive DNS Tunnel Simulator
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Input Payload (SOCKS Stream Data)</label>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isSimulating}
              className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-lg px-3.5 py-2 text-xs outline-none text-slate-100 font-mono transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Target MTU Block Size</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="10"
                max="100"
                value={mtu}
                onChange={(e) => setMtu(Number(e.target.value))}
                disabled={isSimulating}
                className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
              <span className="font-mono text-xs text-slate-300 w-12 text-right">{mtu} Bytes</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-medium">Encoding Mode</label>
            <select
              value={encoder}
              onChange={(e) => setEncoder(e.target.value as any)}
              disabled={isSimulating}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs outline-none focus:border-slate-600 cursor-pointer text-slate-200"
            >
              <option value="base32">LowerBase32 (CNAME/A safe)</option>
              <option value="base64">RawBase64 (TXT queries)</option>
              <option value="base36">LowerBase36 (Strict firewalls)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={simulatedLoss}
              onChange={(e) => setSimulatedLoss(e.target.checked)}
              disabled={isSimulating}
              className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500/20 bg-slate-950 h-4 w-4"
            />
            Simulate 25% Packet Loss (Triggers ARQ Automatic Retransmit)
          </label>

          <button
            onClick={handleSimulate}
            disabled={isSimulating || !inputText}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Simulate Packet Flow
          </button>
        </div>
      </div>

      {/* Stepper Visualization */}
      {activeStep > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stepper Progress Map */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-bold font-display text-slate-200">Simulation Steps</h4>
            <div className="space-y-3.5 relative">
              <div className="absolute left-3.5 top-3 bottom-3 w-0.5 bg-slate-800"></div>

              {/* Step 1: Segmentation */}
              <div className="flex gap-3 relative">
                <div className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  activeStep >= 1 ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"
                }`}>
                  1
                </div>
                <div>
                  <h5 className={`text-xs font-bold ${activeStep >= 1 ? "text-indigo-400" : "text-slate-500"}`}>Stream Segmentation</h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">Stream split into {fragments.length} blocks matching MTU.</p>
                </div>
              </div>

              {/* Step 2: Custom Header wrapping */}
              <div className="flex gap-3 relative">
                <div className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  activeStep >= 2 ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"
                }`}>
                  2
                </div>
                <div>
                  <h5 className={`text-xs font-bold ${activeStep >= 2 ? "text-indigo-400" : "text-slate-500"}`}>5-Byte Header Insertion</h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">Type flag, Stream ID, and Sequence sequence added.</p>
                </div>
              </div>

              {/* Step 3: Basecodec */}
              <div className="flex gap-3 relative">
                <div className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  activeStep >= 3 ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"
                }`}>
                  3
                </div>
                <div>
                  <h5 className={`text-xs font-bold ${activeStep >= 3 ? "text-indigo-400" : "text-slate-500"}`}>Base Encoding (basecodec)</h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">Payload string base-encoded to protect integrity.</p>
                </div>
              </div>

              {/* Step 4: DNS subdomains */}
              <div className="flex gap-3 relative">
                <div className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  activeStep >= 4 ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"
                }`}>
                  4
                </div>
                <div>
                  <h5 className={`text-xs font-bold ${activeStep >= 4 ? "text-indigo-400" : "text-slate-500"}`}>DNS Query Construction</h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">Mapped into valid subdomains for root domain.</p>
                </div>
              </div>

              {/* Step 5: Multipath Routing */}
              <div className="flex gap-3 relative">
                <div className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  activeStep >= 5 ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"
                }`}>
                  5
                </div>
                <div>
                  <h5 className={`text-xs font-bold ${activeStep >= 5 ? "text-indigo-400" : "text-slate-500"}`}>Multipath Transmission</h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">Packets balancing through multiple public resolvers.</p>
                </div>
              </div>

              {/* Step 6: Server Reassembly */}
              <div className="flex gap-3 relative">
                <div className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  activeStep >= 6 ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-500"
                }`}>
                  6
                </div>
                <div>
                  <h5 className={`text-xs font-bold ${activeStep >= 6 ? "text-emerald-400" : "text-slate-500"}`}>Server Reassembly</h5>
                  <p className="text-[10px] text-slate-400 mt-0.5">Packets re-aligned and stream compiled back.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Code & Packet Inspector Panels */}
          <div className="lg:col-span-2 flex flex-col space-y-4">
            {/* Fragments Inspector */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex-1 flex flex-col justify-between">
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span className="font-bold">Active Fragment Queue ({fragments.length})</span>
                  <span>MTU: {mtu}B</span>
                </div>

                <div className="space-y-3.5">
                  {fragments.map((frag) => (
                    <div key={frag.id} className="bg-slate-950 rounded-lg p-3 border border-slate-800/80 text-xs space-y-2">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-indigo-400 font-bold font-mono">Fragment #{frag.id}</span>
                        <span className="text-slate-500">Plain text size: {frag.text.length}B</span>
                      </div>

                      {/* Plain content */}
                      <div className="grid grid-cols-3 gap-3 pt-1 text-[11px]">
                        <div>
                          <p className="text-[10px] text-slate-500">Plain Content:</p>
                          <p className="font-mono text-slate-200 truncate mt-0.5">{frag.text}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">5-Byte Custom Header:</p>
                          <p className="font-mono text-amber-400 truncate mt-0.5">{activeStep >= 2 ? frag.hexHeader : "?? ?? ?? ?? ??"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">basecodec ({encoder}):</p>
                          <p className="font-mono text-sky-400 truncate mt-0.5">{activeStep >= 3 ? frag.encodedPayload : "Pending..."}</p>
                        </div>
                      </div>

                      {/* DNS constructed domain */}
                      {activeStep >= 4 && (
                        <div className="bg-slate-900 p-2 rounded border border-slate-800/50 mt-1 font-mono text-[10px] text-slate-300 break-all select-all">
                          <span className="text-slate-500">DNS Query: </span>
                          dig {encoder === "base64" ? "TXT" : "CNAME"} {frag.dnsQuery}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ARQ Retransmit details */}
              {arqRetries.length > 0 && activeStep >= 5 && (
                <div className="bg-rose-950/20 border border-rose-500/20 p-3.5 rounded-lg mt-4 text-xs space-y-1.5 font-mono text-rose-300">
                  <div className="font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                    ARQ Reliability Engine Active
                  </div>
                  {arqRetries.map((retry, index) => (
                    <p key={index} className="text-[11px] text-rose-400">{retry}</p>
                  ))}
                </div>
              )}

              {/* Assembled Server Output */}
              {activeStep >= 6 && (
                <div className="bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-lg mt-4 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Server Reassembled Stream Successfully</span>
                  </div>
                  <pre className="bg-slate-950 p-2.5 rounded border border-slate-800/80 font-mono text-slate-300 overflow-x-auto text-[11px]">
                    {receivedText}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
