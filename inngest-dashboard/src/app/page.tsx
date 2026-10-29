"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Zap, Shield, Eye, RefreshCw, Terminal, Play, Copy,
  CheckCircle2, XCircle, Clock, Loader2, ChevronRight,
  Server, Code2, Cpu, Layers, ExternalLink,
  GitBranch, Activity, Box, Sparkles, Package,
  BarChart3, Database, AlertTriangle, Info,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Types & constants
───────────────────────────────────────────── */
type StepStatus = "idle" | "queued" | "running" | "succeeded" | "failed";
type Tab = "setup" | "playground" | "concepts";

interface LogEntry {
  id: string;
  ts: string;
  level: "info" | "success" | "warn" | "error" | "debug";
  msg: string;
}

interface StepState {
  id: string;
  label: string;
  status: StepStatus;
  duration?: number;
}

const SETUP_STEPS = [
  {
    num: 1,
    title: "Install Inngest SDK",
    desc: "Add the Inngest package to your Next.js project",
    code: "npm install inngest",
    lang: "bash",
    filename: undefined as string | undefined,
    icon: Package,
  },
  {
    num: 2,
    title: "Create Inngest Client",
    desc: "Initialize the client in app/inngest/client.ts",
    lang: "typescript",
    filename: "app/inngest/client.ts",
    code: `import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "ai-agents" });`,
    icon: Code2,
  },
  {
    num: 3,
    title: "Create API Route",
    desc: "Set up the serving endpoint in app/api/inngest/route.ts",
    lang: "typescript",
    filename: "app/api/inngest/route.ts",
    code: `import { serve } from "inngest/next";
import { inngest } from "../../inngest/client";
import { simpleGreeter } from "../../inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [simpleGreeter],
});`,
    icon: Server,
  },
  {
    num: 4,
    title: "Run Dev Server",
    desc: "Start the Inngest Dev Server for local development",
    code: "npx inngest-cli@latest dev",
    lang: "bash",
    filename: undefined as string | undefined,
    icon: Terminal,
  },
];

const CONCEPT_CARDS = [
  {
    icon: Shield,
    color: "#7c5af8",
    title: "Durable Execution",
    subtitle: "step.run() guarantees completion",
    desc: "Each step.run() call persists its state to Inngest's durable store. If your server crashes mid-execution, Inngest replays from the last successful checkpoint — no data loss.",
    tag: "Core Primitive",
    tagColor: "rgba(124,90,248,0.15)",
    tagText: "#9d7dff",
    detail: "Perfect for multi-step LLM pipelines where intermediate results are expensive to recompute.",
  },
  {
    icon: RefreshCw,
    color: "#22d3ee",
    title: "Automatic Retries",
    subtitle: "Configurable retry logic, zero boilerplate",
    desc: "OpenAI rate limits? Network blip? Inngest automatically retries failed steps with exponential backoff. Configure max retries per function or per step.",
    tag: "Resilience",
    tagColor: "rgba(34,211,238,0.15)",
    tagText: "#22d3ee",
    detail: 'Default: 3 retries. Customizable: { retries: { max: 5, initialInterval: 1000 } }',
  },
  {
    icon: Eye,
    color: "#10b981",
    title: "Built-in Observability",
    subtitle: "Full execution traces out of the box",
    desc: "The Inngest Dev Server provides a real-time UI showing every function run, step timing, payload, output, and retry history — without any extra instrumentation code.",
    tag: "Monitoring",
    tagColor: "rgba(16,185,129,0.15)",
    tagText: "#10b981",
    detail: "Access at http://localhost:8288 during development.",
  },
  {
    icon: Zap,
    color: "#f59e0b",
    title: "LLM Rate Limit Handling",
    subtitle: "Throttle & concurrency controls",
    desc: "Use step.sleep() to wait between LLM calls, or configure throttle/concurrency limits to stay within provider rate limits without manual queuing code.",
    tag: "AI Agents",
    tagColor: "rgba(245,158,11,0.15)",
    tagText: "#f59e0b",
    detail: "step.sleep('1m') or throttle: { limit: 10, period: '1m' }",
  },
  {
    icon: Database,
    color: "#a855f7",
    title: "Step Caching",
    subtitle: "Avoid recomputing expensive steps",
    desc: "Completed step results are cached in Inngest's store. On replay or retry, already-succeeded steps are instantly returned from cache, saving tokens and API costs.",
    tag: "Performance",
    tagColor: "rgba(168,85,247,0.15)",
    tagText: "#a855f7",
    detail: "Transparent to your code — no cache keys, TTLs, or Redis needed.",
  },
  {
    icon: Layers,
    color: "#ef4444",
    title: "Fan-out & Parallelism",
    subtitle: "Orchestrate agent sub-tasks in parallel",
    desc: "Use Promise.all with multiple step.run() calls to execute independent agent tasks in parallel. Inngest handles scheduling, coordination, and aggregating results.",
    tag: "Scalability",
    tagColor: "rgba(239,68,68,0.15)",
    tagText: "#ef4444",
    detail: "Parallel steps execute concurrently without blocking each other.",
  },
];

const FUNCTION_CODE = `import { inngest } from "./client";

export const simpleGreeter = inngest.createFunction(
  { id: "simple-greeter", name: "Simple Greeter" },
  { event: "greet/user" },
  async ({ event, step }) => {
    // Durable step — auto-retried on failure
    const greeting = await step.run("say-hello", async () => {
      const name = event.data?.name ?? "World";
      return {
        message: \`Hello, \${name}! Welcome to Inngest.\`,
        timestamp: new Date().toISOString(),
        model: "gpt-4o",
        tokens: 42,
      };
    });

    // Second step — cached if previous run succeeded
    const result = await step.run("process-response", async () => {
      return { status: "completed", data: greeting };
    });

    return result;
  }
);`;

const STEP_ANATOMY_CODE = `// Each step.run() call:
// Persists its result to durable storage
// Is automatically retried on failure (up to N times)
// Returns cached result on replay (no re-execution)
// Appears as a traced span in the Inngest UI

const result = await step.run(
  "fetch-llm-response",      // Unique step name (used in UI + caching)
  async () => {              // The actual work to do
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: event.data.prompt }],
    });
    return response.choices[0].message.content;
  }                          // Return value is persisted & passed forward
);

// If this step was already completed in a prior run,
// the cached value is returned instantly — no LLM call made.`;

/* ─────────────────────────────────────────────
   Utilities
───────────────────────────────────────────── */
function getNow() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function StatusDot({ status }: { status: StepStatus }) {
  const colors: Record<StepStatus, string> = {
    idle: "#55557a",
    queued: "#f59e0b",
    running: "#22d3ee",
    succeeded: "#10b981",
    failed: "#ef4444",
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colors[status],
        boxShadow: status !== "idle" ? `0 0 8px ${colors[status]}` : "none",
        flexShrink: 0,
      }}
    />
  );
}

function StepNode({ step, index }: { step: StepState; index: number }) {
  const icons: Record<StepStatus, React.ReactNode> = {
    idle: <span style={{ color: "#55557a", fontSize: 13 }}>{index + 1}</span>,
    queued: <Clock size={16} color="#f59e0b" />,
    running: <Loader2 size={16} color="#22d3ee" className="animate-spin" />,
    succeeded: <CheckCircle2 size={16} color="#10b981" />,
    failed: <XCircle size={16} color="#ef4444" />,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div className={`step-node ${step.status}`}>{icons[step.status]}</div>
      <div style={{ textAlign: "center", maxWidth: 90 }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
          {step.label}
        </p>
        {step.duration !== undefined && (
          <p style={{ fontSize: 9, color: "var(--text-secondary)", marginTop: 2 }}>
            {step.duration}ms
          </p>
        )}
      </div>
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Copy failed");
    }
  }, [code]);

  return (
    <button onClick={copy} className="btn-secondary" style={{ padding: "5px 10px", fontSize: 11 }}>
      {copied ? (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <CheckCircle2 size={11} color="#10b981" />
          <span style={{ color: "#10b981" }}>Copied!</span>
        </span>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Copy size={11} />
          Copy
        </span>
      )}
    </button>
  );
}

function CodeBlock({ code, lang, filename, label }: {
  code: string;
  lang: string;
  filename?: string;
  label?: string;
}) {
  return (
    <div className="code-block">
      <div className="code-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lang === "bash" ? (
            <Terminal size={12} color="#10b981" />
          ) : (
            <Code2 size={12} color="#7c5af8" />
          )}
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "JetBrains Mono, monospace" }}>
            {filename ?? label ?? (lang === "bash" ? "terminal" : "typescript")}
          </span>
        </div>
        <CopyButton code={code} />
      </div>
      <pre style={{ padding: "16px 20px", overflowX: "auto", fontSize: 12, lineHeight: 1.8, margin: 0, background: "transparent" }}>
        {code.split("\n").map((line, i) => {
          const isComment = line.trimStart().startsWith("//") || line.trimStart().startsWith("#");
          const keywords = ["import", "export", "const", "async", "await", "return", "new", "from", "let", "var"];

          const renderLine = () => {
            if (isComment) {
              return <span style={{ color: "#5c6370", fontStyle: "italic" }}>{line}</span>;
            }
            if (lang === "bash") {
              const parts = line.split(" ");
              return (
                <>
                  <span style={{ color: "#10b981" }}>{parts[0]}</span>
                  {parts.length > 1 && <span style={{ color: "#e2e8f0" }}> {parts.slice(1).join(" ")}</span>}
                </>
              );
            }

            let highlighted = line;
            keywords.forEach((kw) => {
              highlighted = highlighted.replace(new RegExp(`\\b${kw}\\b`, "g"), `@@KW:${kw}@@`);
            });

            const segments = highlighted.split(/(@@KW:\w+@@|"[^"]*"|'[^']*'|`[^`]*`)/g);
            return segments.map((seg, si) => {
              if (seg.startsWith("@@KW:")) {
                return <span key={si} style={{ color: "#c084fc" }}>{seg.replace("@@KW:", "").replace("@@", "")}</span>;
              }
              if (seg.startsWith('"') || seg.startsWith("'") || seg.startsWith("`")) {
                return <span key={si} style={{ color: "#a5d6a7" }}>{seg}</span>;
              }
              return <span key={si} style={{ color: "#e2e8f0" }}>{seg}</span>;
            });
          };

          return (
            <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <span style={{ color: "#3a3a55", userSelect: "none", minWidth: 20, textAlign: "right", fontSize: 10, paddingTop: 2 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>{renderLine()}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function LogConsole({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  const levelStyle: Record<string, { color: string; prefix: string }> = {
    info: { color: "#8888a8", prefix: "INFO " },
    success: { color: "#10b981", prefix: "DONE " },
    warn: { color: "#f59e0b", prefix: "WARN " },
    error: { color: "#ef4444", prefix: "ERR  " },
    debug: { color: "#7c5af8", prefix: "DBG  " },
  };

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-dot" style={{ background: "#ef4444" }} />
        <div className="terminal-dot" style={{ background: "#f59e0b" }} />
        <div className="terminal-dot" style={{ background: "#10b981" }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: "#55557a", fontFamily: "JetBrains Mono, monospace" }}>
          inngest — execution log
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="animate-pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          <span style={{ fontSize: 10, color: "#10b981" }}>LIVE</span>
        </div>
      </div>
      <div
        ref={ref}
        style={{ height: 260, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}
      >
        {logs.length === 0 ? (
          <div style={{ color: "#3a3a55", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
            <span style={{ color: "#22d3ee" }}>$ </span>
            Waiting for events...
            <span style={{ display: "inline-block", width: 7, height: 13, background: "#7c5af8", marginLeft: 4, verticalAlign: "middle", opacity: 0.8 }} />
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="animate-log" style={{ display: "flex", gap: 12, fontSize: 11, lineHeight: 1.6, fontFamily: "JetBrains Mono, monospace" }}>
              <span style={{ color: "#3a3a55", flexShrink: 0 }}>{log.ts}</span>
              <span style={{ color: levelStyle[log.level].color, flexShrink: 0, fontWeight: 700 }}>{levelStyle[log.level].prefix}</span>
              <span style={{ color: log.level === "success" ? "#10b981" : "#c8c8e8", flex: 1, wordBreak: "break-all" }}>{log.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Dashboard
───────────────────────────────────────────── */
export default function InngestDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const [activeSetupStep, setActiveSetupStep] = useState(0);
  const [devServerConnected, setDevServerConnected] = useState(false);
  const [userName, setUserName] = useState("Ada Lovelace");
  const [eventPayload, setEventPayload] = useState('{\n  "name": "Ada Lovelace"\n}');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [steps, setSteps] = useState<StepState[]>([
    { id: "trigger", label: "Event Trigger", status: "idle" },
    { id: "say-hello", label: "say-hello", status: "idle" },
    { id: "process", label: "process-response", status: "idle" },
    { id: "complete", label: "Function Done", status: "idle" },
  ]);
  const [runResult, setRunResult] = useState<null | { message: string; tokens: number; duration: number; retries: number }>(null);
  const [totalRuns, setTotalRuns] = useState(0);
  const [failScenario, setFailScenario] = useState(false);

  const addLog = useCallback((level: LogEntry["level"], msg: string) => {
    setLogs((prev) => [...prev, { id: uid(), ts: getNow(), level, msg }]);
  }, []);

  const resetSteps = useCallback(() => {
    setSteps([
      { id: "trigger", label: "Event Trigger", status: "idle" },
      { id: "say-hello", label: "say-hello", status: "idle" },
      { id: "process", label: "process-response", status: "idle" },
      { id: "complete", label: "Function Done", status: "idle" },
    ]);
  }, []);

  const setStepStatus = useCallback((id: string, status: StepStatus, duration?: number) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, duration } : s)));
  }, []);

  const simulateRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setRunResult(null);
    setLogs([]);
    resetSteps();

    const start = Date.now();
    let parsedName = "World";
    try {
      const parsed = JSON.parse(eventPayload);
      parsedName = parsed.name ?? "World";
    } catch { /* noop */ }

    addLog("info", `Sending event "greet/user" → { name: "${parsedName}" }`);
    setStepStatus("trigger", "running");
    await delay(400);
    setStepStatus("trigger", "succeeded", Date.now() - start);
    addLog("debug", `Event queued. Run ID: run_${uid()}`);

    await delay(200);
    setStepStatus("say-hello", "queued");
    addLog("info", `step.run("say-hello") → QUEUED`);
    await delay(500);
    setStepStatus("say-hello", "running");
    addLog("info", `step.run("say-hello") → RUNNING`);
    addLog("debug", `Calling OpenAI API... model=gpt-4o`);

    if (failScenario) {
      await delay(800);
      addLog("warn", `OpenAI rate limit hit (429) → retrying in 1000ms (attempt 1/3)`);
      await delay(600);
      addLog("warn", `Retry attempt 2/3 → RUNNING`);
    }

    await delay(failScenario ? 1200 : 900);
    const step1End = Date.now() - start;
    setStepStatus("say-hello", "succeeded", step1End);
    addLog("success", `step.run("say-hello") → SUCCEEDED (${step1End}ms) { message: "Hello, ${parsedName}!..." }`);

    await delay(250);
    setStepStatus("process", "queued");
    addLog("info", `step.run("process-response") → QUEUED`);
    await delay(400);
    setStepStatus("process", "running");
    addLog("info", `step.run("process-response") → RUNNING`);
    await delay(600);
    const step2End = Date.now() - start;
    setStepStatus("process", "succeeded", step2End - step1End);
    addLog("success", `step.run("process-response") → SUCCEEDED (${step2End - step1End}ms)`);

    await delay(200);
    const total = Date.now() - start;
    setStepStatus("complete", "succeeded", total);

    const retryCount = failScenario ? 2 : 0;
    addLog("success", `Function "simple-greeter" COMPLETED in ${total}ms — retries: ${retryCount}`);
    addLog("debug", `Result: { status: "completed", tokens: 42, duration_ms: ${total} }`);

    setRunResult({ message: `Hello, ${parsedName}! Welcome to Inngest for AI Agents.`, tokens: 42, duration: total, retries: retryCount });
    setTotalRuns((n) => n + 1);
    setIsRunning(false);
  }, [isRunning, eventPayload, failScenario, resetSteps, addLog, setStepStatus]);

  const tabs = [
    { id: "setup" as Tab, label: "Quick Setup", icon: Package },
    { id: "playground" as Tab, label: "Event Playground", icon: Play },
    { id: "concepts" as Tab, label: "Core Concepts", icon: Layers },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Ambient glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 800, height: 500, background: "radial-gradient(ellipse, rgba(124,90,248,0.12) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 500, height: 500, background: "radial-gradient(ellipse, rgba(34,211,238,0.06) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", top: "40%", right: -100, width: 400, height: 400, background: "radial-gradient(ellipse, rgba(168,85,247,0.07) 0%, transparent 70%)" }} />
      </div>

      {/* ── Nav */}
      <nav className="glass" style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #7c5af8, #22d3ee)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={18} color="white" />
            </div>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Inngest</span>
              <span style={{ fontSize: 11, color: "var(--accent-purple-light)", marginLeft: 8, fontWeight: 500 }}>for AI Agents</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="metric-card" style={{ padding: "8px 14px", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={12} color="#10b981" />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Runs: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{totalRuns}</span>
                </span>
              </div>
            </div>
            <div className="metric-card" style={{ padding: "8px 14px", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: devServerConnected ? "#10b981" : "#55557a" }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Dev Server: <span style={{ color: devServerConnected ? "#10b981" : "var(--text-secondary)", fontWeight: 600 }}>{devServerConnected ? "Online" : "Offline"}</span>
                </span>
              </div>
            </div>
            <a href="https://www.inngest.com/docs" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: "none", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              Docs <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </nav>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* ── Hero */}
        <section className="hero-grid" style={{ padding: "80px 24px 64px", textAlign: "center", position: "relative" }}>
          <div className="animate-fade-in-up" style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 100, background: "rgba(124,90,248,0.1)", border: "1px solid rgba(124,90,248,0.2)", marginBottom: 28 }}>
              <Sparkles size={12} color="#9d7dff" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#9d7dff" }}>Interactive Learning Dashboard</span>
            </div>

            <h1 style={{ fontSize: "clamp(30px, 5vw, 54px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.04em", marginBottom: 20 }}>
              Build <span className="gradient-text">Production-Ready</span>
              <br />AI Agents with Inngest
            </h1>

            <p style={{ fontSize: "clamp(14px, 2vw, 17px)", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 40, maxWidth: 540, margin: "0 auto 40px" }}>
              The complete guide to durable AI agent workflows — set it and forget it, with built-in retries, observability, and infinite scale.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 44 }}>
              {[
                { icon: Shield, label: "Durable by default" },
                { icon: RefreshCw, label: "Auto-retries" },
                { icon: Eye, label: "Full observability" },
                { icon: Zap, label: "Set & forget" },
                { icon: Cpu, label: "LLM-ready" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 100, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                  <Icon size={12} color="#7c5af8" />
                  {label}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" style={{ fontSize: 15, padding: "13px 26px" }} onClick={() => setActiveTab("playground")}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Play size={15} />Try the Playground</span>
              </button>
              <button className="btn-secondary" style={{ fontSize: 15, padding: "13px 26px" }} onClick={() => setActiveTab("setup")}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Package size={15} />Quick Setup →</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── Stats row */}
        <section style={{ padding: "0 24px 48px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            {[
              { label: "Function Runs", value: totalRuns.toString(), icon: BarChart3, color: "#7c5af8", sub: "this session" },
              { label: "Success Rate", value: "100%", icon: CheckCircle2, color: "#10b981", sub: "across all runs" },
              { label: "Steps Supported", value: "∞", icon: GitBranch, color: "#22d3ee", sub: "unlimited step.run()" },
              { label: "Default Retries", value: "3×", icon: RefreshCw, color: "#f59e0b", sub: "configurable" },
              { label: "Observability", value: "100%", icon: Eye, color: "#a855f7", sub: "full trace coverage" },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="metric-card animate-fade-in-up">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={14} color={color} />
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>{value}</div>
                <div style={{ fontSize: 10, color: "#55557a", marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Tabs */}
        <section style={{ padding: "0 24px 28px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`tab-btn ${activeTab === id ? "active" : "inactive"}`} onClick={() => setActiveTab(id)}>
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon size={13} />{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Tab content */}
        <section style={{ padding: "0 24px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>

            {/* ══ SETUP TAB ══ */}
            {activeTab === "setup" && (
              <div className="animate-fade-in" style={{ display: "grid", gap: 28 }}>
                <div>
                  <p className="section-label" style={{ marginBottom: 6 }}>Part 1</p>
                  <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>Quick Setup Guide</h2>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>Get Inngest running in your Next.js project in 4 steps.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 22, alignItems: "start" }}>
                  {/* Step sidebar */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {SETUP_STEPS.map((step, i) => {
                      const Icon = step.icon;
                      const active = activeSetupStep === i;
                      return (
                        <button key={step.num} onClick={() => setActiveSetupStep(i)} style={{ background: active ? "rgba(124,90,248,0.12)" : "var(--bg-card)", border: `1px solid ${active ? "rgba(124,90,248,0.4)" : "var(--border)"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 7, background: active ? "rgba(124,90,248,0.2)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Icon size={14} color={active ? "#9d7dff" : "#55557a"} />
                          </div>
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: active ? "#7c5af8" : "#55557a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Step {step.num}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>{step.title}</div>
                          </div>
                          {active && <ChevronRight size={13} color="#7c5af8" style={{ marginLeft: "auto", flexShrink: 0 }} />}
                        </button>
                      );
                    })}

                    {/* Dev server status card */}
                    <div style={{ marginTop: 6, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                        <Server size={12} color={devServerConnected ? "#10b981" : "#55557a"} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Dev Server</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: devServerConnected ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${devServerConnected ? "rgba(16,185,129,0.2)" : "var(--border)"}`, borderRadius: 7, marginBottom: 10 }}>
                        <div className={devServerConnected ? "animate-pulse-dot" : ""} style={{ width: 7, height: 7, borderRadius: "50%", background: devServerConnected ? "#10b981" : "#55557a", flexShrink: 0 }} />
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: devServerConnected ? "#10b981" : "#55557a" }}>localhost:8288</span>
                      </div>
                      <button className={devServerConnected ? "btn-secondary" : "btn-primary"} style={{ width: "100%", fontSize: 11, padding: "8px" }} onClick={() => setDevServerConnected((v) => !v)}>
                        {devServerConnected ? "Disconnect" : "Simulate Connect"}
                      </button>
                    </div>
                  </div>

                  {/* Code panel */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(124,90,248,0.12)", border: "1px solid rgba(124,90,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {(() => { const Icon = SETUP_STEPS[activeSetupStep].icon; return <Icon size={17} color="#9d7dff" />; })()}
                        </div>
                        <div>
                          <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{SETUP_STEPS[activeSetupStep].title}</h3>
                          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{SETUP_STEPS[activeSetupStep].desc}</p>
                        </div>
                      </div>
                      <CodeBlock code={SETUP_STEPS[activeSetupStep].code} lang={SETUP_STEPS[activeSetupStep].lang} filename={SETUP_STEPS[activeSetupStep].filename} />
                    </div>

                    {/* Progress dots */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
                      {SETUP_STEPS.map((s, i) => (
                        <div key={s.num} style={{ display: "flex", alignItems: "center" }}>
                          <button onClick={() => setActiveSetupStep(i)} style={{ width: 26, height: 26, borderRadius: "50%", background: i === activeSetupStep ? "linear-gradient(135deg,#7c5af8,#a855f7)" : i < activeSetupStep ? "rgba(16,185,129,0.2)" : "var(--bg-card)", border: `2px solid ${i === activeSetupStep ? "#7c5af8" : i < activeSetupStep ? "#10b981" : "var(--border)"}`, color: i === activeSetupStep ? "white" : i < activeSetupStep ? "#10b981" : "var(--text-secondary)", fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {i < activeSetupStep ? <CheckCircle2 size={11} /> : s.num}
                          </button>
                          {i < SETUP_STEPS.length - 1 && <div style={{ width: 36, height: 2, background: i < activeSetupStep ? "linear-gradient(90deg,#10b981,#7c5af8)" : "var(--border)", transition: "background 0.5s" }} />}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn-secondary" disabled={activeSetupStep === 0} onClick={() => setActiveSetupStep((n) => Math.max(0, n - 1))} style={{ flex: 1 }}>← Previous</button>
                      <button className="btn-primary" disabled={activeSetupStep === SETUP_STEPS.length - 1} onClick={() => setActiveSetupStep((n) => Math.min(SETUP_STEPS.length - 1, n + 1))} style={{ flex: 1 }}>Next Step →</button>
                    </div>
                  </div>
                </div>

                {/* Part 2 function code */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <p className="section-label">Part 2</p>
                    <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
                  </div>
                  <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>Your First Inngest Function</h2>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 }}>
                    The <code style={{ color: "#9d7dff" }}>simpleGreeter</code> function shows <code style={{ color: "#22d3ee" }}>step.run()</code> for durable, auto-retried execution.
                  </p>
                  <CodeBlock code={FUNCTION_CODE} lang="typescript" filename="app/inngest/functions.ts" />
                </div>
              </div>
            )}

            {/* ══ PLAYGROUND TAB ══ */}
            {activeTab === "playground" && (
              <div className="animate-fade-in" style={{ display: "grid", gap: 28 }}>
                <div>
                  <p className="section-label" style={{ marginBottom: 6 }}>Part 2 — Live Demo</p>
                  <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>Event Trigger Playground</h2>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
                    Fire a <code style={{ color: "#9d7dff" }}>"greet/user"</code> event and watch step execution animate in real-time.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, alignItems: "start" }}>
                  {/* Left: form */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Fire Event</h3>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>
                        Trigger <code style={{ background: "rgba(124,90,248,0.1)", color: "#9d7dff", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>greet/user</code>
                      </p>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>User Name</label>
                        <input className="input-field" value={userName} onChange={(e) => { setUserName(e.target.value); setEventPayload(`{\n  "name": "${e.target.value}"\n}`); }} placeholder="Enter a name..." />
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Event Payload (JSON)</label>
                        <textarea className="input-field" value={eventPayload} onChange={(e) => setEventPayload(e.target.value)} rows={3} style={{ resize: "none", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }} />
                      </div>

                      {/* Fail toggle */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: failScenario ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${failScenario ? "rgba(245,158,11,0.2)" : "var(--border)"}`, borderRadius: 10, marginBottom: 18, cursor: "pointer" }} onClick={() => setFailScenario((v) => !v)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <AlertTriangle size={13} color={failScenario ? "#f59e0b" : "#55557a"} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: failScenario ? "#f59e0b" : "var(--text-secondary)" }}>Simulate Rate Limit</div>
                            <div style={{ fontSize: 10, color: "#55557a" }}>Watch auto-retry in action</div>
                          </div>
                        </div>
                        <div style={{ width: 34, height: 18, borderRadius: 9, background: failScenario ? "#f59e0b" : "var(--border)", position: "relative", transition: "background 0.3s" }}>
                          <div style={{ position: "absolute", top: 2, left: failScenario ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 0.3s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                        </div>
                      </div>

                      <button className="btn-primary" style={{ width: "100%", fontSize: 14, padding: "13px" }} disabled={isRunning} onClick={simulateRun}>
                        {isRunning ? (
                          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Loader2 size={15} className="animate-spin" />Executing…</span>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Play size={15} />Trigger Event / Run Function</span>
                        )}
                      </button>
                      <button className="btn-secondary" style={{ width: "100%", marginTop: 8, fontSize: 12 }} onClick={() => { resetSteps(); setLogs([]); setRunResult(null); }} disabled={isRunning}>Reset</button>
                    </div>

                    {/* Result */}
                    {runResult && (
                      <div className="animate-fade-in-up" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14, padding: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          <CheckCircle2 size={15} color="#10b981" />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>Function Completed</span>
                        </div>
                        <div style={{ background: "#070710", borderRadius: 10, padding: 12, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#a5d6a7", lineHeight: 1.9 }}>
                          <div><span style={{ color: "#7c5af8" }}>message</span><span style={{ color: "#e2e8f0" }}>: </span><span style={{ color: "#a5d6a7" }}>"{runResult.message}"</span></div>
                          <div><span style={{ color: "#7c5af8" }}>tokens</span><span style={{ color: "#e2e8f0" }}>: </span><span style={{ color: "#f59e0b" }}>{runResult.tokens}</span></div>
                          <div><span style={{ color: "#7c5af8" }}>duration_ms</span><span style={{ color: "#e2e8f0" }}>: </span><span style={{ color: "#22d3ee" }}>{runResult.duration}</span></div>
                          <div><span style={{ color: "#7c5af8" }}>retries</span><span style={{ color: "#e2e8f0" }}>: </span><span style={{ color: runResult.retries > 0 ? "#f59e0b" : "#10b981" }}>{runResult.retries}</span></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: visualizer + log */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Step visualizer */}
                    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Step Execution Visualizer</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: isRunning ? "rgba(34,211,238,0.1)" : steps[steps.length - 1].status === "succeeded" ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${isRunning ? "rgba(34,211,238,0.3)" : steps[steps.length - 1].status === "succeeded" ? "rgba(16,185,129,0.3)" : "var(--border)"}` }}>
                          <StatusDot status={isRunning ? "running" : steps[steps.length - 1].status} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: isRunning ? "#22d3ee" : steps[steps.length - 1].status === "succeeded" ? "#10b981" : "var(--text-secondary)", textTransform: "uppercase" }}>
                            {isRunning ? "RUNNING" : steps[steps.length - 1].status === "succeeded" ? "SUCCEEDED" : "IDLE"}
                          </span>
                        </div>
                      </div>

                      {/* Step flow */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, overflowX: "auto", paddingBottom: 6 }}>
                        {steps.map((step, i) => (
                          <div key={step.id} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 70 }}>
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                              <StepNode step={step} index={i} />
                            </div>
                            {i < steps.length - 1 && (
                              <div className={`connector-line ${step.status === "succeeded" ? "active" : "idle"}`} style={{ minWidth: 16, marginTop: -20 }} />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Step detail */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                        {steps.slice(1, -1).map((step) => (
                          <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: step.status === "running" ? "rgba(34,211,238,0.06)" : step.status === "succeeded" ? "rgba(16,185,129,0.06)" : step.status === "queued" ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${step.status === "running" ? "rgba(34,211,238,0.15)" : step.status === "succeeded" ? "rgba(16,185,129,0.15)" : step.status === "queued" ? "rgba(245,158,11,0.15)" : "var(--border)"}`, borderRadius: 9, transition: "all 0.3s" }}>
                            <StatusDot status={step.status} />
                            <code style={{ flex: 1, fontSize: 11, color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>step.run("{step.id}")</code>
                            {step.status !== "idle" && (
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: step.status === "running" ? "#22d3ee" : step.status === "succeeded" ? "#10b981" : step.status === "queued" ? "#f59e0b" : "#55557a" }}>
                                {step.status}{step.duration !== undefined ? ` · ${step.duration}ms` : ""}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Log console */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                        <Terminal size={12} color="#7c5af8" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Live Execution Log</span>
                      </div>
                      <LogConsole logs={logs} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ CONCEPTS TAB ══ */}
            {activeTab === "concepts" && (
              <div className="animate-fade-in" style={{ display: "grid", gap: 28 }}>
                <div>
                  <p className="section-label" style={{ marginBottom: 6 }}>Core Concepts</p>
                  <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>Why step.run() for AI Agents?</h2>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, maxWidth: 540 }}>
                    Understanding the primitives that make Inngest the ideal orchestration layer for production AI agent workflows.
                  </p>
                </div>

                {/* Concept cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
                  {CONCEPT_CARDS.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.title} className="concept-card">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 11, background: `${card.color}18`, border: `1px solid ${card.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Icon size={20} color={card.color} />
                          </div>
                          <div>
                            <div style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 20, background: card.tagColor, fontSize: 9, fontWeight: 700, color: card.tagText, marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{card.tag}</div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{card.title}</h3>
                            <p style={{ fontSize: 11, color: card.color, marginTop: 2, fontWeight: 500 }}>{card.subtitle}</p>
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>{card.desc}</p>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 11px", background: `${card.color}08`, border: `1px solid ${card.color}20`, borderRadius: 8 }}>
                          <Info size={11} color={card.color} style={{ flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 10, color: card.tagText, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.6 }}>{card.detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* step.run() anatomy */}
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, padding: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(34,211,238,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Box size={17} color="#22d3ee" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Anatomy of step.run()</h3>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Every step is a named, durable checkpoint in your agent workflow</p>
                    </div>
                  </div>
                  <CodeBlock code={STEP_ANATOMY_CODE} lang="typescript" label="step.run() anatomy" />
                </div>

                {/* Comparison table */}
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden" }}>
                  <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", background: "rgba(124,90,248,0.04)" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>With Inngest vs. Without</h3>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                          {["Challenge", "Without Inngest ✗", "With Inngest ✓"].map((h) => (
                            <th key={h} style={{ padding: "11px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { challenge: "LLM API failure", without: "Manual try/catch + retry loops", with: "Auto-retry with exponential backoff" },
                          { challenge: "Server crash mid-run", without: "Lost state, re-run from scratch", with: "Resume from last completed step" },
                          { challenge: "Rate limit (429)", without: "Complex queue management", with: "step.sleep() or throttle config" },
                          { challenge: "Debugging failures", without: "grep through logs manually", with: "Visual step trace in Dev UI" },
                          { challenge: "Scaling to 10k+ users", without: "Build custom worker infrastructure", with: "Auto-scales, zero config" },
                        ].map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "13px 18px", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{row.challenge}</td>
                            <td style={{ padding: "13px 18px" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#ef4444" }}>
                                <XCircle size={12} color="#ef4444" />{row.without}
                              </span>
                            </td>
                            <td style={{ padding: "13px 18px" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#10b981" }}>
                                <CheckCircle2 size={12} color="#10b981" />{row.with}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Footer */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "28px 24px", textAlign: "center" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg, #7c5af8, #22d3ee)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={13} color="white" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Inngest for AI Agents — Interactive Dashboard</span>
            </div>
            <p style={{ fontSize: 11, color: "#55557a" }}>Built with Next.js, Tailwind CSS & Lucide React. All simulations run client-side.</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 12 }}>
              {[
                { label: "inngest.com", href: "https://www.inngest.com" },
                { label: "Docs", href: "https://www.inngest.com/docs" },
                { label: "GitHub", href: "https://github.com/inngest/inngest" },
              ].map(({ label, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#55557a", textDecoration: "none", transition: "color 0.2s" }} onMouseOver={(e) => (e.currentTarget.style.color = "#9d7dff")} onMouseOut={(e) => (e.currentTarget.style.color = "#55557a")}>{label}</a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
