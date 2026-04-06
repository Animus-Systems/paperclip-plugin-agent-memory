import React, { useState, useCallback } from "react";
import type { PluginDashboardWidgetProps, PluginDetailTabProps, PluginSettingsPageProps } from "@paperclipai/plugin-sdk/ui";
import {
  usePluginData,
  usePluginAction,
  useHostContext,
} from "@paperclipai/plugin-sdk/ui";

// ── Types ─────────────────────────────────────────────────────

interface MemoryStats {
  totalStored: number;
  totalInjected: number;
  totalSearches: number;
  lastStoreAt?: string;
  lastInjectAt?: string;
  byAgent: Record<string, { stored: number; injected: number }>;
  memosConnected?: boolean;
  memosTotal?: number;
  memosAgents?: Record<string, number>;
}

interface Memory {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  name?: string;
  confidence?: number;
  tags?: string[];
  procedure?: string;
  experience?: string[];
  preference?: string[];
  source?: string;
  memoryType?: string;
}

interface ActivityEntry {
  agentName: string;
  runId: string;
  issueId: string;
  timestamp: string;
  summaryLength: number;
  hadIssue: boolean;
}

interface MemosStatus {
  memosConnected: boolean;
  memosUrl: string;
  totalMemories: number | string;
  agentsWithMemory?: number;
  agentsScanned?: number;
  totalAgents?: number;
  lastCheckAt?: string;
  config: {
    enabled?: boolean;
    memosUrl?: string;
    autoExtract: boolean;
    autoInject: boolean;
    maxMemoriesPerInjection: number;
    injectionTokenBudget: number;
    extractionMode: string;
    llmExtractionModel: string;
    llmFallbackModel: string;
  };
}

// ── Shared styles ─────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  border: "1px solid rgba(255,255,255,0.08)",
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "0.8rem",
};

const badge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: "0.7rem",
  fontWeight: 500,
  background: "rgba(99,102,241,0.2)",
  color: "rgb(165,168,255)",
  marginRight: 4,
};

const sectionLabel: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: 6,
};

function timeAgo(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ══════════════════════════════════════════════════════════════
// Dashboard Widget
// ══════════════════════════════════════════════════════════════

export function MemoryDashboardWidget() {
  const context = useHostContext();
  const { data: stats } = usePluginData<MemoryStats>("memory:stats", {
    companyId: context.companyId,
  });
  const { data: activity } = usePluginData<ActivityEntry[]>("memory:activity", {
    companyId: context.companyId,
  });

  const s = stats ?? { totalStored: 0, totalInjected: 0, totalSearches: 0, byAgent: {} };
  const memosAgents = s.memosAgents ?? {};
  const agentEntries = Object.entries(memosAgents).sort(([, a], [, b]) => b - a);
  const events = activity ?? [];

  return (
    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: s.memosConnected ? "rgb(34,197,94)" : "rgb(239,68,68)",
          }} />
          <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }}>
            MemOS {s.memosConnected ? "connected" : "offline"}
          </span>
        </div>
        <span style={muted}>
          {agentEntries.length} agents · {s.memosTotal ?? 0} knowledge objects
        </span>
      </div>

      {/* Agents with knowledge */}
      {agentEntries.length > 0 && (
        <div>
          <div style={sectionLabel}>Agents with Knowledge</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {agentEntries.map(([name, count]) => (
              <span key={name} style={{
                ...badge,
                background: "rgba(34,197,94,0.12)",
                color: "rgb(134,239,172)",
                fontSize: "0.75rem",
                padding: "3px 8px",
              }}>
                {name} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {events.length > 0 ? (
        <div>
          <div style={sectionLabel}>Recent Runs</div>
          {events.slice(0, 8).map((e, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "3px 0", fontSize: "0.8rem",
              borderBottom: i < Math.min(events.length, 8) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                  background: e.hadIssue ? "rgb(134,239,172)" : "rgba(255,255,255,0.15)",
                }} />
                <span style={{ color: "rgba(255,255,255,0.8)" }}>{e.agentName}</span>
                {e.hadIssue && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }}>→ stored</span>}
              </span>
              <span style={muted}>{timeAgo(e.timestamp)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...muted, fontStyle: "italic" }}>
          Activity feed populates as agents complete runs.
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Agent Memory Tab
// ══════════════════════════════════════════════════════════════

export function MemoryAgentTab({ context }: PluginDetailTabProps) {
  const agentId = context.entityId;
  const companyId = context.companyId;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Memory[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addContent, setAddContent] = useState("");
  const [addCategory, setAddCategory] = useState("note");
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"knowledge" | "search" | "add">("knowledge");

  const { data: memories, isLoading, refresh } = usePluginData<Memory[]>(
    "memory:list",
    { companyId, entityId: agentId },
  );

  const searchAction = usePluginAction("memory:search-action");
  const addAction = usePluginAction("memory:manual-add");

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = (await searchAction({ companyId, entityId: agentId, query: searchQuery })) as Memory[];
      setSearchResults(res ?? []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [searchQuery, companyId, agentId, searchAction]);

  const handleAdd = useCallback(async () => {
    if (!addContent.trim()) return;
    setAdding(true);
    try {
      await addAction({ companyId, agentId, content: addContent, category: addCategory });
      setAddContent("");
      refresh();
    } catch (err) { console.error("Failed to add memory:", err); }
    setAdding(false);
  }, [addContent, addCategory, companyId, agentId, addAction, refresh]);

  // ── Render a knowledge card ─────────────────────────────────
  const renderKnowledge = (mem: Memory, i: number) => {
    const meta = mem.metadata ?? {};
    const name = (meta.name ?? meta.key ?? "") as string;
    const confidence = meta.confidence as number | undefined;
    const tags = (meta.tags ?? []) as string[];
    const procedure = (meta.procedure ?? "") as string;
    const experience = (meta.experience ?? []) as string[];
    const preference = (meta.preference ?? []) as string[];
    const memType = (meta.memory_type ?? meta.type ?? "") as string;
    const sources = (meta.sources ?? []) as Array<{ content?: string; chat_time?: string; role?: string }>;
    const updatedAt = (meta.updated_at ?? "") as string;
    const description = (meta.description ?? mem.content ?? "") as string;

    return (
      <div key={mem.id || i} style={{ ...card, marginBottom: 10 }}>
        {/* Title + type */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            {name && <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>{name}</div>}
            <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginTop: 2 }}>
              {description}
            </div>
          </div>
          {confidence != null && (
            <span style={{ ...badge, background: "rgba(34,197,94,0.15)", color: "rgb(134,239,172)", flexShrink: 0 }}>
              {(confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {/* Tags */}
        {(tags.length > 0 || memType) && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {memType && <span style={badge}>{memType}</span>}
            {mem.score != null && (
              <span style={{ ...badge, background: "rgba(59,130,246,0.15)", color: "rgb(147,197,253)" }}>
                {(mem.score * 100).toFixed(0)}% match
              </span>
            )}
            {tags.map((t, j) => <span key={j} style={badge}>{t}</span>)}
            {updatedAt && <span style={muted}>{timeAgo(updatedAt)}</span>}
          </div>
        )}

        {/* Key learnings — shown prominently */}
        {experience.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={sectionLabel}>Learned</div>
            {experience.map((e, j) => (
              <div key={j} style={{
                fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.4,
                paddingLeft: 8, borderLeft: "2px solid rgba(99,102,241,0.3)", marginBottom: 3,
              }}>
                {e}
              </div>
            ))}
          </div>
        )}

        {/* Preferences */}
        {preference.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={sectionLabel}>Preferences</div>
            {preference.map((p, j) => (
              <div key={j} style={{
                fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.4,
                paddingLeft: 8, borderLeft: "2px solid rgba(234,179,8,0.3)", marginBottom: 3,
              }}>
                {p}
              </div>
            ))}
          </div>
        )}

        {/* Procedure — collapsed by default */}
        {procedure && (
          <details style={{ marginBottom: 6 }}>
            <summary style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              Procedure ({procedure.split(/\d+\./).length - 1} steps)
            </summary>
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginTop: 4 }}>
              {procedure}
            </div>
          </details>
        )}

        {/* Sources — shows which runs contributed */}
        {sources.length > 0 && (
          <details>
            <summary style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              Built from {sources.length} run{sources.length > 1 ? "s" : ""} {sources[0]?.chat_time ? `· last: ${sources[0].chat_time}` : ""}
            </summary>
            <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
              {sources.map((src, j) => (
                <div key={j} style={{
                  fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.5,
                  padding: "6px 8px", background: "rgba(0,0,0,0.2)", borderRadius: 4,
                  whiteSpace: "pre-wrap", maxHeight: 150, overflow: "auto",
                }}>
                  {src.chat_time && <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{src.chat_time}</div>}
                  {(src.content ?? "").substring(0, 800)}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 500,
    cursor: "pointer", border: "none",
    background: active ? "rgba(99,102,241,0.25)" : "transparent",
    color: active ? "rgb(165,168,255)" : "rgba(255,255,255,0.5)",
  });

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)", color: "#fff",
    fontSize: "0.85rem", outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4 }}>
        <button style={tabStyle(tab === "knowledge")} onClick={() => setTab("knowledge")}>
          Knowledge {memories?.length ? `(${memories.length})` : ""}
        </button>
        <button style={tabStyle(tab === "search")} onClick={() => setTab("search")}>Search</button>
        <button style={tabStyle(tab === "add")} onClick={() => setTab("add")}>Add</button>
      </div>

      {/* Knowledge tab */}
      {tab === "knowledge" && (
        <div>
          {isLoading && <div style={muted}>Loading...</div>}
          {!isLoading && (!memories || memories.length === 0) && (
            <div style={{ ...card, ...muted, fontStyle: "italic" }}>
              No knowledge yet. This agent will build knowledge automatically as it completes tasks.
              Each task contributes to evolving knowledge objects — skills, procedures, and preferences.
            </div>
          )}
          {memories && memories.map(renderKnowledge)}
        </div>
      )}

      {/* Search tab */}
      {tab === "search" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search this agent's knowledge..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleSearch} disabled={searching || !searchQuery.trim()} style={{
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: "rgba(99,102,241,0.3)", color: "rgb(165,168,255)",
              fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
              opacity: searching || !searchQuery.trim() ? 0.5 : 1,
            }}>
              {searching ? "..." : "Search"}
            </button>
          </div>
          {searchResults !== null && (
            searchResults.length === 0
              ? <div style={muted}>No matching knowledge found.</div>
              : searchResults.map(renderKnowledge)
          )}
        </div>
      )}

      {/* Add tab */}
      {tab === "add" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <textarea
            value={addContent} onChange={(e) => setAddContent(e.target.value)}
            placeholder="Add knowledge for this agent (a fact, decision, or preference)..."
            rows={4} style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={addCategory} onChange={(e) => setAddCategory(e.target.value)}
              style={{ ...inputStyle, padding: "6px 10px" }}>
              <option value="note">Note</option>
              <option value="decision">Decision</option>
              <option value="learning">Learning</option>
              <option value="fact">Fact</option>
              <option value="preference">Preference</option>
            </select>
            <button onClick={handleAdd} disabled={adding || !addContent.trim()} style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: "rgba(34,197,94,0.25)", color: "rgb(134,239,172)",
              fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
              opacity: adding || !addContent.trim() ? 0.5 : 1,
            }}>
              {adding ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Settings Page
// ══════════════════════════════════════════════════════════════

const configRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.85rem",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: 8, marginTop: 16,
};

export function MemorySettingsPage({ context }: PluginSettingsPageProps) {
  const { data, isLoading, refresh } = usePluginData<MemosStatus>("memory:status", {
    companyId: context.companyId,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const status = data ?? {
    memosConnected: false, memosUrl: "unknown", totalMemories: 0,
    config: { autoExtract: true, autoInject: true, maxMemoriesPerInjection: 5, injectionTokenBudget: 800, extractionMode: "hybrid", llmExtractionModel: "mistralai/mistral-small-3.2-24b-instruct", llmFallbackModel: "google/gemini-2.5-flash" },
  };

  // Read config directly from the Paperclip config API (not the data handler which caches)
  const [dbConfig, setDbConfig] = useState<Record<string, unknown> | null>(null);
  React.useEffect(() => {
    fetch(`/api/plugins/animusystems.agent-memory/config`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.configJson) setDbConfig(d.configJson); })
      .catch(() => {});
  }, []);

  const [localConfig, setLocalConfig] = useState<Record<string, unknown> | null>(null);
  // Priority: local edits > DB config > data handler config > defaults
  const cfg = { ...status.config, ...(dbConfig ?? {}), ...(localConfig ?? {}) };

  const handleChange = (key: string, value: unknown) => {
    setLocalConfig((prev) => ({ ...(prev ?? {}), [key]: value }));
    setSaveMsg("");
  };

  const handleSave = useCallback(async () => {
    if (!localConfig) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const fullConfig = {
        enabled: cfg.enabled ?? true,
        memosUrl: cfg.memosUrl ?? "http://memos:8000",
        autoExtract: cfg.autoExtract,
        autoInject: cfg.autoInject,
        maxMemoriesPerInjection: cfg.maxMemoriesPerInjection,
        injectionTokenBudget: cfg.injectionTokenBudget,
        extractionMode: cfg.extractionMode,
        llmExtractionModel: cfg.llmExtractionModel,
        llmFallbackModel: cfg.llmFallbackModel,
        kbAutoIndex: cfg.kbAutoIndex ?? true,
        kbAutoBreif: cfg.kbAutoBreif ?? true,
        kbBriefModel: cfg.kbBriefModel ?? "deepseek/deepseek-v3.2",
      };
      const res = await fetch(`/api/plugins/animusystems.agent-memory/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configJson: fullConfig }),
      });
      if (res.ok) {
        setSaveMsg("Saved");
        setDbConfig(fullConfig);
        setLocalConfig(null);
      } else {
        const body = await res.text().catch(() => "");
        setSaveMsg(`Save failed (${res.status}): ${body.substring(0, 100)}`);
      }
    } catch (err) {
      setSaveMsg(String(err));
    }
    setSaving(false);
  }, [localConfig, cfg, refresh]);

  if (isLoading) return <div style={{ padding: "1.5rem", ...muted }}>Loading...</div>;

  const dot = (on: boolean) => (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: on ? "rgb(34,197,94)" : "rgb(239,68,68)", marginRight: 6,
    }} />
  );

  const selectStyle: React.CSSProperties = {
    padding: "5px 8px", borderRadius: 4,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)", color: "#fff",
    fontSize: "0.8rem", fontFamily: "inherit", outline: "none",
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle, fontFamily: "monospace", minWidth: 220, textAlign: "right" as const,
  };

  const toggleStyle = (on: boolean): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 4, border: "none",
    background: on ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.15)",
    color: on ? "rgb(134,239,172)" : "rgb(252,165,165)",
    fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
  });

  const hasChanges = localConfig !== null && Object.keys(localConfig).length > 0;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700 }}>
      <div style={sectionTitle}>{dot(status.memosConnected)} MemOS Connection</div>
      <div style={card}>
        <div style={configRow}>
          <span style={muted}>URL</span>
          <span style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.8rem" }}>{status.memosUrl}</span>
        </div>
        <div style={configRow}>
          <span style={muted}>Status</span>
          <span style={{ color: status.memosConnected ? "rgb(134,239,172)" : "rgb(252,165,165)" }}>
            {status.memosConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div style={configRow}>
          <span style={muted}>Last check</span>
          <span style={{ color: "rgba(255,255,255,0.7)" }}>{status.lastCheckAt ? timeAgo(status.lastCheckAt) : "checking..."}</span>
        </div>
      </div>

      <div style={sectionTitle}>Infrastructure</div>
      <div style={card}>
        <div style={configRow}><span style={muted}>Embedder</span><span style={{ color: "#fff" }}>Ollama — nomic-embed-text (768d, Metal GPU)</span></div>
        <div style={configRow}><span style={muted}>Chat LLM</span><span style={{ color: "#fff" }}>OpenRouter — mistral-small-3.2-24b-instruct</span></div>
        <div style={configRow}><span style={muted}>Vector DB</span><span style={{ color: "#fff" }}>Qdrant (768d cosine)</span></div>
        <div style={configRow}><span style={muted}>Graph DB</span><span style={{ color: "#fff" }}>Neo4j 5.26</span></div>
      </div>

      <div style={sectionTitle}>Knowledge Stats</div>
      <div style={card}>
        <div style={configRow}>
          <span style={muted}>Knowledge objects</span>
          <span style={{ color: "#fff", fontWeight: 600 }}>{status.totalMemories}</span>
        </div>
        <div style={configRow}>
          <span style={muted}>Agents with knowledge</span>
          <span style={{ color: "#fff" }}>{status.agentsWithMemory ?? "—"} / {status.totalAgents ?? "—"}</span>
        </div>
      </div>

      <div style={sectionTitle}>Plugin Configuration</div>
      <div style={card}>
        <div style={configRow}>
          <span style={muted}>Auto-extract</span>
          <button style={toggleStyle(cfg.autoExtract as boolean)} onClick={() => handleChange("autoExtract", !cfg.autoExtract)}>
            {cfg.autoExtract ? "enabled" : "disabled"}
          </button>
        </div>
        <div style={configRow}>
          <span style={muted}>Auto-inject</span>
          <button style={toggleStyle(cfg.autoInject as boolean)} onClick={() => handleChange("autoInject", !cfg.autoInject)}>
            {cfg.autoInject ? "enabled" : "disabled"}
          </button>
        </div>
        <div style={configRow}>
          <span style={muted}>Extraction mode</span>
          <select style={selectStyle} value={cfg.extractionMode as string} onChange={(e) => handleChange("extractionMode", e.target.value)}>
            <option value="rule_based">Rule-based (free)</option>
            <option value="hybrid">Hybrid (rule + LLM fallback)</option>
            <option value="llm">LLM only</option>
          </select>
        </div>
        <div style={configRow}>
          <span style={muted}>LLM extraction model</span>
          <input style={inputStyle} value={cfg.llmExtractionModel as string} onChange={(e) => handleChange("llmExtractionModel", e.target.value)} placeholder="mistralai/mistral-small-3.2-24b-instruct" />
        </div>
        <div style={configRow}>
          <span style={muted}>Fallback model</span>
          <input style={inputStyle} value={String(cfg.llmFallbackModel ?? "google/gemini-2.5-flash")} onChange={(e) => handleChange("llmFallbackModel", e.target.value)} />
        </div>
        <div style={configRow}>
          <span style={muted}>Max memories per injection</span>
          <input style={{ ...selectStyle, width: 80, textAlign: "center" }} type="number" min={1} max={20} value={cfg.maxMemoriesPerInjection as number} onChange={(e) => handleChange("maxMemoriesPerInjection", parseInt(e.target.value) || 5)} />
        </div>
        <div style={configRow}>
          <span style={muted}>Token budget</span>
          <input style={{ ...selectStyle, width: 100, textAlign: "center" }} type="number" min={100} max={5000} step={100} value={cfg.injectionTokenBudget as number} onChange={(e) => handleChange("injectionTokenBudget", parseInt(e.target.value) || 800)} />
        </div>
      </div>

      <div style={sectionTitle}>Knowledge Base</div>
      <div style={card}>
        <div style={configRow}>
          <span style={muted}>Auto-index completed issues</span>
          <button style={toggleStyle(cfg.kbAutoIndex as boolean ?? true)} onClick={() => handleChange("kbAutoIndex", !(cfg.kbAutoIndex ?? true))}>
            {(cfg.kbAutoIndex ?? true) ? "enabled" : "disabled"}
          </button>
        </div>
        <div style={configRow}>
          <span style={muted}>Auto-generate executive briefs</span>
          <button style={toggleStyle(cfg.kbAutoBreif as boolean ?? true)} onClick={() => handleChange("kbAutoBreif", !(cfg.kbAutoBreif ?? true))}>
            {(cfg.kbAutoBreif ?? true) ? "enabled" : "disabled"}
          </button>
        </div>
        <div style={{ ...configRow, borderBottom: "none" }}>
          <span style={muted}>Brief generation model</span>
          <input style={inputStyle} value={String(cfg.kbBriefModel ?? "deepseek/deepseek-v3.2")} onChange={(e) => handleChange("kbBriefModel", e.target.value)} />
        </div>
      </div>

      {/* Save bar */}
      {hasChanges && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "8px 20px", borderRadius: 6, border: "none",
            background: "rgba(99,102,241,0.3)", color: "rgb(165,168,255)",
            fontSize: "0.85rem", fontWeight: 500, cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button onClick={() => { setLocalConfig(null); setSaveMsg(""); }} style={{
            padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent", color: "rgba(255,255,255,0.5)",
            fontSize: "0.8rem", cursor: "pointer",
          }}>
            Cancel
          </button>
          {saveMsg && (
            <span style={{ fontSize: "0.8rem", color: saveMsg === "Saved" ? "rgb(134,239,172)" : "rgb(252,165,165)" }}>
              {saveMsg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// KB DASHBOARD WIDGET
// ══════════════════════════════════════════════════════════════

interface KBStats {
  indexedIssues: number;
  uploadedDocuments: number;
  generatedBriefs: number;
  lastIndexAt?: string;
  lastBriefAt?: string;
}

export function KBDashboardWidget({ context }: PluginDashboardWidgetProps) {
  const { data: stats } = usePluginData<KBStats>("kb:stats", {
    companyId: context.companyId,
  });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Memory[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchAction = usePluginAction("kb:search");

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchAction({ companyId: context.companyId, query: query.trim() });
      setResults(Array.isArray(res) ? res : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, context.companyId, searchAction]);

  const s = stats ?? { indexedIssues: 0, uploadedDocuments: 0, generatedBriefs: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        <div style={{ textAlign: "center", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{s.indexedIssues}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>Indexed Issues</div>
        </div>
        <div style={{ textAlign: "center", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{s.uploadedDocuments}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>Documents</div>
        </div>
        <div style={{ textAlign: "center", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{s.generatedBriefs}</div>
          <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>Briefs</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search knowledge base..."
          style={{
            flex: 1, padding: "6px 10px", fontSize: "0.85rem",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "5px", color: "inherit", outline: "none",
          }}
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          style={{
            padding: "6px 12px", fontSize: "0.8rem",
            background: "rgba(59,130,246,0.8)", border: "none",
            borderRadius: "5px", color: "#fff", cursor: "pointer",
            opacity: searching ? 0.5 : 1,
          }}
        >
          {searching ? "..." : "Search"}
        </button>
      </div>

      {results !== null && (
        <div style={{ maxHeight: "200px", overflowY: "auto", fontSize: "0.8rem" }}>
          {results.length === 0 ? (
            <div style={{ opacity: 0.5, padding: "8px" }}>No results found.</div>
          ) : (
            results.slice(0, 5).map((r, i) => (
              <div key={r.id || i} style={{ padding: "8px", borderBottom: "1px solid rgba(255,255,255,0.06)", lineHeight: 1.4 }}>
                {r.content.substring(0, 200)}{r.content.length > 200 ? "..." : ""}
              </div>
            ))
          )}
        </div>
      )}

      {s.lastIndexAt && (
        <div style={{ fontSize: "0.7rem", opacity: 0.4 }}>
          Last indexed: {new Date(s.lastIndexAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
