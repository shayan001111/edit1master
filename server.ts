import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini client lazily
let ai: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!ai && process.env.GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (e) {
      console.error("Failed to initialize Gemini API client:", e);
    }
  }
  return ai;
}

// Global In-Memory Simulated VPN State
let isConnected = false;
let transferSpeedUp = 0; // KB/s
let transferSpeedDown = 0; // KB/s
let totalDataSent = 0; // bytes
let totalDataReceived = 0; // bytes
let syncedMtuUp = 138;
let syncedMtuDown = 2400;
let packetLossRate = 0.02; // 2% loss
let averageLatency = 45; // ms
let activeStreamCount = 0;
let sessionStartTime: number | null = null;
let currentProfile = "Default Balanced Profile";

// Simulated Logs
let logs: Array<{ id: string; timestamp: string; level: string; message: string }> = [
  { id: "1", timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "MasterDnsVPN Simulator Engine initialized." },
  { id: "2", timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "Loaded client_config.toml.simple successfully." }
];

// Seed public DNS Resolvers for benchmarks
const DEFAULT_RESOLVERS = [
  { name: "Cloudflare", ip: "1.1.1.1" },
  { name: "Google DNS", ip: "8.8.8.8" },
  { name: "Quad9", ip: "9.9.9.9" },
  { name: "Cisco OpenDNS", ip: "208.67.222.222" },
  { name: "AdGuard DNS", ip: "94.140.14.14" },
  { name: "CleanBrowsing", ip: "185.228.168.9" },
  { name: "Level3", ip: "4.2.2.2" },
  { name: "Shecan (Iran)", ip: "178.22.122.100" }
];

// Background Simulator Task to update metrics and logs when connected
setInterval(() => {
  if (!isConnected) {
    transferSpeedUp = 0;
    transferSpeedDown = 0;
    activeStreamCount = 0;
    return;
  }

  // Simulate active stream counts fluctuating
  if (Math.random() < 0.2) {
    activeStreamCount = Math.max(1, Math.min(12, activeStreamCount + (Math.random() > 0.5 ? 1 : -1)));
  }

  // Simulate speeds based on stream count
  transferSpeedUp = Math.floor(activeStreamCount * (10 + Math.random() * 25));
  transferSpeedDown = Math.floor(activeStreamCount * (50 + Math.random() * 210));

  totalDataSent += transferSpeedUp * 1024;
  totalDataReceived += transferSpeedDown * 1024;

  // Fluctuations in latency & loss
  averageLatency = Math.max(15, Math.min(450, Math.floor(averageLatency + (Math.random() > 0.5 ? 5 : -5))));
  packetLossRate = Math.max(0, Math.min(0.2, packetLossRate + (Math.random() > 0.5 ? 0.005 : -0.005)));

  // Generate simulated DNS packet logs
  if (Math.random() < 0.4) {
    const rxNxt = Math.floor(Math.random() * 5000);
    const mockDomains = ["v.domain.com", "v2.domain.com"];
    const targetDomain = mockDomains[Math.floor(Math.random() * mockDomains.length)];
    const queries = ["TXT", "CNAME", "A"];
    const qType = queries[Math.floor(Math.random() * queries.length)];

    const packetTypes = [
      `[TUNNEL] Outgoing encoded payload size=${Math.floor(Math.random() * syncedMtuUp)}B on domain=${targetDomain} qtype=${qType}`,
      `[ARQ] Sent DATA_PACKET sequence=${rxNxt} retries=0`,
      `[ARQ] Received ACK for sequence=${Math.max(0, rxNxt - 1)}`,
      `[SOCKS5] Multiplexed active connection TCP stream id=${Math.floor(Math.random() * 1000)} routing traffic`,
      `[BALANCER] Selected DNS resolver IP=${DEFAULT_RESOLVERS[Math.floor(Math.random() * DEFAULT_RESOLVERS.length)].ip} mode=LeastLoss`
    ];

    logs.push({
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      level: "INFO",
      message: packetTypes[Math.floor(Math.random() * packetTypes.length)]
    });

    // Trim logs
    if (logs.length > 100) {
      logs.shift();
    }
  }
}, 1000);

// Helper to test a single DNS server resolver
async function testSingleResolver(ip: string, domainToResolve: string = "google.com"): Promise<number> {
  return new Promise((resolve) => {
    const resolver = new dns.Resolver();
    resolver.setServers([ip]);
    
    // Set a timeout of 2000ms
    const timeout = setTimeout(() => {
      resolve(-1); // Timeout indicator
    }, 2000);

    const startTime = Date.now();
    resolver.resolve4(domainToResolve, (err, addresses) => {
      clearTimeout(timeout);
      if (err || !addresses || addresses.length === 0) {
        resolve(-1); // Error indicator
      } else {
        const latency = Date.now() - startTime;
        resolve(latency);
      }
    });
  });
}

// API Routes

// Get Configuration templates/configs
app.get("/api/config/client", async (req, res) => {
  try {
    let fileContent = "";
    try {
      fileContent = await fs.readFile(path.join(process.cwd(), "client_config.toml"), "utf-8");
    } catch {
      fileContent = await fs.readFile(path.join(process.cwd(), "client_config.toml.simple"), "utf-8");
    }
    res.json({ content: fileContent });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to read client config: " + err.message });
  }
});

app.post("/api/config/client", async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Invalid content format" });
    }
    await fs.writeFile(path.join(process.cwd(), "client_config.toml"), content, "utf-8");
    logs.push({
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      level: "INFO",
      message: "Updated client_config.toml with custom settings."
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to write client config: " + err.message });
  }
});

app.get("/api/config/server", async (req, res) => {
  try {
    let fileContent = "";
    try {
      fileContent = await fs.readFile(path.join(process.cwd(), "server_config.toml"), "utf-8");
    } catch {
      fileContent = await fs.readFile(path.join(process.cwd(), "server_config.toml.simple"), "utf-8");
    }
    res.json({ content: fileContent });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to read server config: " + err.message });
  }
});

app.post("/api/config/server", async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Invalid content format" });
    }
    await fs.writeFile(path.join(process.cwd(), "server_config.toml"), content, "utf-8");
    logs.push({
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      level: "INFO",
      message: "Updated server_config.toml with custom settings."
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to write server config: " + err.message });
  }
});

// Live DNS Resolver Benchmark endpoint
app.post("/api/dns/benchmark", async (req, res) => {
  const { resolvers, targetDomain } = req.body;
  const target = targetDomain || "google.com";
  const serversToTest = Array.isArray(resolvers) && resolvers.length > 0 ? resolvers : DEFAULT_RESOLVERS;

  logs.push({
    id: Math.random().toString(),
    timestamp: new Date().toLocaleTimeString(),
    level: "INFO",
    message: `Initiating active DNS benchmark on target=${target} for ${serversToTest.length} resolvers...`
  });

  try {
    const results = await Promise.all(
      serversToTest.map(async (srv: any) => {
        const latency = await testSingleResolver(srv.ip, target);
        return {
          name: srv.name,
          ip: srv.ip,
          latency: latency === -1 ? null : latency,
          status: latency === -1 ? "Timeout/Error" : "Online"
        };
      })
    );

    logs.push({
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      level: "INFO",
      message: `DNS benchmark complete. Fast resolver found: ${
        results.filter(r => r.latency !== null).sort((a, b) => (a.latency || 0) - (b.latency || 0))[0]?.name || "None"
      }`
    });

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// VPN Connection Controls
app.post("/api/vpn/connect", (req, res) => {
  if (isConnected) {
    return res.json({ success: true, message: "Already connected" });
  }

  const { profileName, customMtuUp, customMtuDown } = req.body;
  isConnected = true;
  sessionStartTime = Date.now();
  currentProfile = profileName || "Default Balanced Profile";
  activeStreamCount = 2;
  syncedMtuUp = customMtuUp || 138;
  syncedMtuDown = customMtuDown || 2400;

  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "=== STARTING MASTERDNSVPN TUNNEL ===" });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: `Selected tunnel config profile: ${currentProfile}` });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "Launching background packet workers..." });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "Probing DNS Resolvers for synced MTU..." });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: `Synced MTUs negotiated successfully. Upload=${syncedMtuUp}B, Download=${syncedMtuDown}B` });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "Performing cryptographic handshake using ChaCha20..." });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "Client tunnel is ONLINE. Exposing SOCKS5 proxy on 127.0.0.1:18000" });

  res.json({ success: true });
});

app.post("/api/vpn/disconnect", (req, res) => {
  if (!isConnected) {
    return res.json({ success: true, message: "Already disconnected" });
  }
  
  isConnected = false;
  sessionStartTime = null;
  activeStreamCount = 0;
  
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "Stopping tunnel RX/TX workers..." });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "Flushing pending ARQ sliding windows..." });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "SOCKS5 local listener shut down." });
  logs.push({ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level: "INFO", message: "=== MASTERDNSVPN TUNNEL STOPPED ===" });

  res.json({ success: true });
});

// Clear Logs API
app.post("/api/vpn/clear-logs", (req, res) => {
  logs = [{
    id: Math.random().toString(),
    timestamp: new Date().toLocaleTimeString(),
    level: "INFO",
    message: "Console log cleared."
  }];
  res.json({ success: true });
});

// Status API
app.get("/api/vpn/status", (req, res) => {
  res.json({
    isConnected,
    transferSpeedUp,
    transferSpeedDown,
    totalDataSent,
    totalDataReceived,
    syncedMtuUp,
    syncedMtuDown,
    packetLossRate,
    averageLatency,
    activeStreamCount,
    currentProfile,
    uptime: sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0,
    logs
  });
});

// AI explain API using modern Gemini SDK
app.post("/api/explain", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const aiClient = getGeminiClient();
  if (!aiClient) {
    // Graceful fallback when no API key is set
    return res.json({
      text: "👋 I can help you analyze packets, decode protocols, or configure DNS settings! Please configure your **GEMINI_API_KEY** in the AI Studio Settings menu to unlock my full AI brain. \n\nHere is a basic answer: MasterDnsVPN tunnels TCP traffic by encapsulating stream data into base-encoded payloads inside DNS query subdomains (e.g., TXT queries for downstream data, and subdomain CNAME queries for upstream). It uses ARQ for sliding-window reliability on top of unreliable DNS queries."
    });
  }

  try {
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are an expert on MasterDnsVPN and DNS Tunneling protocols. 
      Answer the following question about DNS tunneling, encryption, ARQ sliding windows, MTU discovery, or configuration files in a professional, clear, and highly educational manner. Focus on MasterDnsVPN's custom protocol architecture:
      
      Question: ${prompt}`
    });

    res.json({ text: response.text });
  } catch (err: any) {
    res.status(500).json({ error: "Gemini API failed: " + err.message });
  }
});

// Configure Vite or production static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
