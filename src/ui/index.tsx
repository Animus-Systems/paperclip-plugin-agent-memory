import React, { useState, useCallback } from "react";
import type { PluginDashboardWidgetProps, PluginDetailTabProps, PluginPageProps, PluginSettingsPageProps, PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
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
        kbBriefModel: cfg.kbBriefModel ?? "google/gemini-2.5-flash",
        kbWatchFolders: cfg.kbWatchFolders ?? [],
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
        <div style={configRow}>
          <span style={muted}>Brief generation model</span>
          <input style={inputStyle} value={String(cfg.kbBriefModel ?? "google/gemini-2.5-flash")} onChange={(e) => handleChange("kbBriefModel", e.target.value)} />
        </div>
        <div style={{ ...configRow, borderBottom: "none", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <span style={muted}>Watch folders (one per line — indexed every 6 hours)</span>
          <textarea
            style={{ ...inputStyle, textAlign: "left", minHeight: 60, fontFamily: "monospace", fontSize: "0.75rem", resize: "vertical" }}
            value={((cfg.kbWatchFolders as string[]) ?? []).join("\n")}
            onChange={(e) => handleChange("kbWatchFolders", e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean))}
            placeholder="/data/accounts/Animus-Systems-SL&#10;/data/github/animusystems"
          />
        </div>
      </div>

      {/* Index folder (manual) */}
      <div style={sectionTitle}>Index Folder</div>
      <div style={card}>
        <div style={{ ...configRow, borderBottom: "none", gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1, textAlign: "left" }}
            placeholder="/data/accounts/Animus-Systems-SL"
            id="kb-folder-path"
          />
          <button
            onClick={async () => {
              const input = document.getElementById("kb-folder-path") as HTMLInputElement;
              const path = input?.value?.trim();
              if (!path) return;
              input.disabled = true;
              try {
                const res = await fetch(`/api/plugins/animusystems.agent-memory/actions/kb:index-folder`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ companyId: context.companyId, path, recursive: true }),
                }).then((r) => r.json());
                alert(res.ok ? `Indexed ${res.indexed} files (${res.skipped} skipped, ${res.errors} errors)` : `Error: ${res.error}`);
              } catch (err) {
                alert(`Failed: ${err}`);
              }
              input.disabled = false;
            }}
            style={{
              padding: "6px 14px", borderRadius: 5, border: "none",
              background: "rgba(59,130,246,0.25)", color: "rgb(147,197,253)",
              fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Index Now
          </button>
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
  const [results, setResults] = useState<ParsedKBEntry[] | null>(null);
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
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{r.title}</div>
                <div style={{ opacity: 0.6 }}>{r.excerpt}</div>
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

// ══════════════════════════════════════════════════════════════
// KB SIDEBAR LINK
// ══════════════════════════════════════════════════════════════

const KB_ROUTE = "knowledge-base";

export function KBSidebarLink({ context }: PluginSidebarProps) {
  const href = context.companyPrefix ? `/${context.companyPrefix}/${KB_ROUTE}` : `/${KB_ROUTE}`;
  const isActive = typeof window !== "undefined" && window.location.pathname === href;
  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      </span>
      <span className="flex-1 truncate">Knowledge Base</span>
    </a>
  );
}

// ══════════════════════════════════════════════════════════════
// KB FULL PAGE — Apple-inspired design
// ══════════════════════════════════════════════════════════════

interface ParsedKBEntry {
  id: string;
  title: string;
  source: string;
  agent: string | null;
  issue: string | null;
  cleanContent: string;
  excerpt: string;
  score?: number;
  tags: string[];
}
interface KBFolderInfo { watchFolders: string[]; hashCount: number; }

// ── Design tokens ──────────────────────────────────────────

const KB = {
  radius: 14,
  radiusSm: 10,
  radiusXs: 8,
  gap: 16,
  // Surfaces
  bg: "rgba(255,255,255,0.02)",
  cardBg: "rgba(255,255,255,0.04)",
  cardBgHover: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.06)",
  cardBorderHover: "rgba(255,255,255,0.10)",
  inputBg: "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.10)",
  inputFocus: "rgba(99,102,241,0.4)",
  // Text
  textPrimary: "#fff",
  textSecondary: "rgba(255,255,255,0.65)",
  textTertiary: "rgba(255,255,255,0.40)",
  textQuaternary: "rgba(255,255,255,0.25)",
  // Accent
  accent: "rgb(99,102,241)",
  accentBg: "rgba(99,102,241,0.12)",
  accentText: "rgb(165,168,255)",
  // Status
  green: "rgb(34,197,94)",
  greenBg: "rgba(34,197,94,0.10)",
  greenText: "rgb(134,239,172)",
  blue: "rgb(59,130,246)",
  blueBg: "rgba(59,130,246,0.10)",
  blueText: "rgb(147,197,253)",
  purple: "rgb(168,85,247)",
  purpleBg: "rgba(168,85,247,0.10)",
  purpleText: "rgb(196,167,255)",
  red: "rgb(239,68,68)",
  redBg: "rgba(239,68,68,0.10)",
  redText: "rgb(252,165,165)",
  amber: "rgb(245,158,11)",
  amberBg: "rgba(245,158,11,0.10)",
  amberText: "rgb(252,211,77)",
  zinc: "rgb(161,161,170)",
  zincBg: "rgba(161,161,170,0.10)",
} as const;

const SOURCE_THEME: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  issue_completion: { bg: KB.greenBg, text: KB.greenText, label: "Issue", icon: "checkmark.circle.fill" },
  document: { bg: KB.blueBg, text: KB.blueText, label: "Document", icon: "doc.fill" },
  executive_brief: { bg: KB.purpleBg, text: KB.purpleText, label: "Brief", icon: "text.document.fill" },
  manual_upload: { bg: KB.blueBg, text: KB.blueText, label: "Upload", icon: "arrow.up.doc.fill" },
  unknown: { bg: KB.zincBg, text: KB.zinc, label: "Other", icon: "questionmark.circle" },
};

// ── Shared Apple-style components ──────────────────────────

function KBCard({ children, style, onClick, hoverable = false }: {
  children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void; hoverable?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={hoverable ? () => setHovered(true) : undefined}
      onMouseLeave={hoverable ? () => setHovered(false) : undefined}
      style={{
        background: hovered ? KB.cardBgHover : KB.cardBg,
        borderRadius: KB.radius,
        border: `1px solid ${hovered ? KB.cardBorderHover : KB.cardBorder}`,
        transition: "all 0.2s ease",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function KBInput({ value, onChange, onKeyDown, placeholder, style, large, mono }: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string; style?: React.CSSProperties; large?: boolean; mono?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      style={{
        padding: large ? "12px 16px" : "9px 13px",
        borderRadius: KB.radiusSm,
        border: `1px solid ${focused ? KB.inputFocus : KB.inputBorder}`,
        background: KB.inputBg,
        color: KB.textPrimary,
        fontSize: large ? "1rem" : "0.875rem",
        fontFamily: mono ? "ui-monospace, 'SF Mono', monospace" : "inherit",
        outline: "none",
        width: "100%",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        boxShadow: focused ? `0 0 0 3px ${KB.accentBg}` : "none",
        ...style,
      }}
    />
  );
}

function KBTextarea({ value, onChange, placeholder, rows = 4, mono, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean; style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      rows={rows}
      style={{
        padding: "10px 14px",
        borderRadius: KB.radiusSm,
        border: `1px solid ${focused ? KB.inputFocus : KB.inputBorder}`,
        background: KB.inputBg,
        color: KB.textPrimary,
        fontSize: "0.875rem",
        fontFamily: mono ? "ui-monospace, 'SF Mono', monospace" : "inherit",
        outline: "none",
        width: "100%",
        resize: "vertical" as const,
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        boxShadow: focused ? `0 0 0 3px ${KB.accentBg}` : "none",
        lineHeight: 1.5,
        ...style,
      }}
    />
  );
}

function KBButton({ children, onClick, disabled, variant = "primary", size = "md", style }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md"; style?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const base: React.CSSProperties = {
    padding: size === "sm" ? "6px 14px" : "9px 20px",
    borderRadius: KB.radiusXs,
    border: "none",
    fontSize: size === "sm" ? "0.8rem" : "0.875rem",
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.15s ease",
    whiteSpace: "nowrap" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "inherit",
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: hovered && !disabled ? "rgba(99,102,241,0.35)" : "rgba(99,102,241,0.22)",
      color: KB.accentText,
    },
    secondary: {
      background: hovered && !disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
      color: KB.textSecondary,
      border: `1px solid ${KB.cardBorder}`,
    },
    ghost: {
      background: hovered && !disabled ? "rgba(255,255,255,0.06)" : "transparent",
      color: KB.textTertiary,
    },
  };
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

function KBBadge({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: 6, fontSize: "0.7rem", fontWeight: 600,
      background: bg, color, letterSpacing: "0.02em",
      textTransform: "uppercase" as const,
    }}>
      {children}
    </span>
  );
}

function KBMetricCard({ value, label, icon }: { value: number | string; label: string; icon: React.ReactNode }) {
  return (
    <KBCard style={{ padding: "20px 16px", textAlign: "center" }}>
      <div style={{ marginBottom: 8, opacity: 0.5 }}>{icon}</div>
      <div style={{
        fontSize: "1.75rem", fontWeight: 700, color: KB.textPrimary,
        letterSpacing: "-0.02em", lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: "0.75rem", color: KB.textTertiary, marginTop: 6,
        fontWeight: 500, letterSpacing: "0.02em",
      }}>
        {label}
      </div>
    </KBCard>
  );
}

function KBToast({ message, type = "info" }: { message: string; type?: "success" | "error" | "info" }) {
  const colors = {
    success: { bg: KB.greenBg, border: "rgba(34,197,94,0.2)", text: KB.greenText, icon: "\u2713" },
    error: { bg: KB.redBg, border: "rgba(239,68,68,0.2)", text: KB.redText, icon: "\u2717" },
    info: { bg: KB.accentBg, border: "rgba(99,102,241,0.2)", text: KB.accentText, icon: "\u2139" },
  };
  const c = colors[type];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 16px", borderRadius: KB.radiusSm,
      background: c.bg, border: `1px solid ${c.border}`,
      fontSize: "0.85rem", color: c.text,
      animation: "fadeIn 0.2s ease",
    }}>
      <span style={{ fontSize: "0.9rem", fontWeight: 700 }}>{c.icon}</span>
      {message}
    </div>
  );
}

function KBEmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", textAlign: "center",
    }}>
      <div style={{ marginBottom: 16, opacity: 0.3 }}>{icon}</div>
      <div style={{ fontSize: "1rem", fontWeight: 600, color: KB.textSecondary, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: "0.85rem", color: KB.textTertiary, maxWidth: 360, lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

function KBSectionHeader({ title, count, right }: { title: string; count?: number; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 12, marginTop: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: KB.textSecondary, letterSpacing: "0.03em" }}>
          {title}
        </span>
        {count != null && (
          <span style={{
            fontSize: "0.7rem", fontWeight: 600, color: KB.textTertiary,
            background: "rgba(255,255,255,0.06)", padding: "1px 7px", borderRadius: 10,
          }}>
            {count}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

// SVG icons (inline, Apple SF Symbols inspired)
const Icons = {
  search: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  ),
  doc: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  folder: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  ),
  brief: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  chart: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  check: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  upload: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  chevron: (size = 14) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  sparkle: (size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  refresh: (size = 14) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  ),
};

// ── Page layout ────────────────────────────────────────────

const TABS = [
  { key: "search", label: "Search", icon: Icons.search },
  { key: "documents", label: "Documents", icon: Icons.doc },
  { key: "folders", label: "Folders", icon: Icons.folder },
  { key: "briefs", label: "Briefs", icon: Icons.brief },
  { key: "stats", label: "Overview", icon: Icons.chart },
] as const;

type KBTabKey = typeof TABS[number]["key"];

export function KBPage({ context }: PluginPageProps) {
  const [tab, setTab] = useState<KBTabKey>("search");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: "1.5rem", fontWeight: 700, color: KB.textPrimary,
          letterSpacing: "-0.02em", margin: 0,
        }}>
          Knowledge Base
        </h1>
        <p style={{ fontSize: "0.85rem", color: KB.textTertiary, margin: "4px 0 0" }}>
          Search, manage, and explore your team's collective knowledge.
        </p>
      </div>

      {/* Segmented control */}
      <div style={{
        display: "inline-flex", gap: 2, padding: 3,
        background: "rgba(255,255,255,0.04)",
        borderRadius: KB.radiusSm, marginBottom: 28,
        border: `1px solid ${KB.cardBorder}`,
      }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 16px", borderRadius: KB.radiusXs,
                border: "none", cursor: "pointer",
                background: active ? "rgba(255,255,255,0.10)" : "transparent",
                color: active ? KB.textPrimary : KB.textTertiary,
                fontSize: "0.82rem", fontWeight: 500,
                transition: "all 0.15s ease",
                fontFamily: "inherit",
              }}
            >
              <span style={{ opacity: active ? 0.9 : 0.5, display: "flex" }}>{t.icon(14)}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {tab === "search" && <KBSearchTab companyId={context.companyId} />}
        {tab === "documents" && <KBDocumentsTab companyId={context.companyId} />}
        {tab === "folders" && <KBFoldersTab companyId={context.companyId} />}
        {tab === "briefs" && <KBBriefsTab companyId={context.companyId} />}
        {tab === "stats" && <KBStatsTab companyId={context.companyId} />}
      </div>
    </div>
  );
}

// ── Search Tab ──────────────────────────────────────────────

function KBSearchTab({ companyId }: { companyId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParsedKBEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const searchAction = usePluginAction("kb:search");

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchAction({ companyId, query: query.trim() });
      setResults(Array.isArray(res) ? res : []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, [query, companyId, searchAction]);

  return (
    <div>
      {/* Search bar */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 24, alignItems: "center",
      }}>
        <div style={{ flex: 1, position: "relative" }}>
          <span style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            color: KB.textTertiary, display: "flex", pointerEvents: "none",
          }}>
            {Icons.search(16)}
          </span>
          <KBInput
            value={query}
            onChange={setQuery}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Search completed work, documents, briefs..."
            large
            style={{ paddingLeft: 40 }}
          />
        </div>
        <KBButton onClick={doSearch} disabled={searching || !query.trim()}>
          {searching ? "Searching..." : "Search"}
        </KBButton>
      </div>

      {/* Results */}
      {results === null && (
        <KBEmptyState
          icon={Icons.search(40)}
          title="Search your knowledge"
          description="Find context from completed tasks, uploaded documents, and executive briefs. Results are ranked by relevance."
        />
      )}

      {results !== null && results.length === 0 && (
        <KBEmptyState
          icon={Icons.search(40)}
          title="No results found"
          description="Try different keywords or a broader search query."
        />
      )}

      {results && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: "0.75rem", color: KB.textTertiary, fontWeight: 500, marginBottom: 4 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
          {results.map((r, i) => {
            const source = SOURCE_THEME[r.source] ?? SOURCE_THEME.unknown;
            const key = r.id || String(i);
            const isExpanded = expanded === key;
            const relevance = r.score != null ? Math.round(r.score * 100) : null;

            return (
              <KBCard key={key} hoverable onClick={() => setExpanded(isExpanded ? null : key)}>
                <div style={{ padding: "14px 18px" }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isExpanded ? 12 : 6 }}>
                    <KBBadge bg={source.bg} color={source.text}>{source.label}</KBBadge>
                    <span style={{
                      fontSize: "0.92rem", fontWeight: 600, color: KB.textPrimary,
                      flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.title}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {r.issue && (
                        <span style={{
                          fontSize: "0.75rem", color: KB.textTertiary, fontWeight: 500,
                          background: "rgba(255,255,255,0.05)", padding: "2px 8px",
                          borderRadius: 6, fontFamily: "ui-monospace, monospace",
                        }}>
                          {r.issue}
                        </span>
                      )}
                      {relevance != null && (
                        <span style={{ fontSize: "0.7rem", color: KB.textQuaternary, fontWeight: 500 }}>
                          {relevance}%
                        </span>
                      )}
                      <span style={{
                        display: "flex", transition: "transform 0.2s ease",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        color: KB.textQuaternary,
                      }}>
                        {Icons.chevron()}
                      </span>
                    </div>
                  </div>

                  {/* Meta pills */}
                  {r.agent && !isExpanded && (
                    <span style={{ fontSize: "0.75rem", color: KB.textTertiary }}>
                      by {r.agent}
                    </span>
                  )}

                  {/* Preview when collapsed */}
                  {!isExpanded && (
                    <div style={{
                      fontSize: "0.835rem", color: KB.textTertiary, lineHeight: 1.5,
                      marginTop: 4, display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}>
                      {r.excerpt}
                    </div>
                  )}

                  {/* Expanded content */}
                  {isExpanded && (
                    <div>
                      {r.agent && (
                        <div style={{ fontSize: "0.8rem", color: KB.textTertiary, marginBottom: 12 }}>
                          Generated by <span style={{ color: KB.textSecondary, fontWeight: 500 }}>{r.agent}</span>
                        </div>
                      )}
                      <div style={{
                        fontSize: "0.875rem", color: KB.textSecondary, lineHeight: 1.7,
                        whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto",
                        padding: "14px 16px", borderRadius: KB.radiusSm,
                        background: "rgba(0,0,0,0.15)",
                      }}>
                        {r.cleanContent}
                      </div>
                    </div>
                  )}
                </div>
              </KBCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Documents Tab ───────────────────────────────────────────

function KBDocumentsTab({ companyId }: { companyId: string }) {
  const { data: docs } = usePluginData<ParsedKBEntry[]>("kb:list-documents", { companyId });
  const [uploadName, setUploadName] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const uploadAction = usePluginAction("kb:upload-document");

  const handleUpload = useCallback(async () => {
    if (!uploadName.trim() || !uploadContent.trim()) return;
    setUploading(true);
    setToast(null);
    try {
      await uploadAction({ companyId, name: uploadName.trim(), content: uploadContent.trim() });
      setUploadName(""); setUploadContent("");
      setToast({ msg: "Document uploaded successfully", type: "success" });
    } catch {
      setToast({ msg: "Failed to upload document", type: "error" });
    }
    setUploading(false);
    setTimeout(() => setToast(null), 4000);
  }, [uploadName, uploadContent, companyId, uploadAction]);

  const docList = docs ?? [];

  return (
    <div>
      {/* Upload section */}
      <KBCard style={{ padding: "20px 22px", marginBottom: 8 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
        }}>
          <span style={{ color: KB.textTertiary, display: "flex" }}>{Icons.upload(16)}</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: KB.textSecondary }}>
            Upload Document
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <KBInput
            value={uploadName} onChange={setUploadName}
            placeholder="Document title"
          />
          <KBTextarea
            value={uploadContent} onChange={setUploadContent}
            placeholder="Paste document content..."
            rows={4} mono
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <KBButton
              onClick={handleUpload}
              disabled={uploading || !uploadName.trim() || !uploadContent.trim()}
            >
              {uploading ? "Uploading..." : "Upload"}
            </KBButton>
            {toast && <KBToast message={toast.msg} type={toast.type} />}
          </div>
        </div>
      </KBCard>

      {/* Document list */}
      <KBSectionHeader title="Documents" count={docList.length} />

      {docList.length === 0 ? (
        <KBEmptyState
          icon={Icons.doc(40)}
          title="No documents yet"
          description="Upload a document above or enable auto-indexing to capture completed issue output."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docList.map((d) => {
            const theme = SOURCE_THEME[d.source] ?? SOURCE_THEME.unknown;
            return (
              <KBCard key={d.id} hoverable style={{ padding: "12px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <KBBadge bg={theme.bg} color={theme.text}>{theme.label}</KBBadge>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500, color: KB.textPrimary, flex: 1 }}>
                    {d.title}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {d.issue && (
                      <span style={{
                        fontSize: "0.75rem", color: KB.textTertiary,
                        fontFamily: "ui-monospace, monospace",
                      }}>
                        {d.issue}
                      </span>
                    )}
                    {d.agent && (
                      <span style={{ fontSize: "0.75rem", color: KB.textQuaternary }}>
                        {d.agent}
                      </span>
                    )}
                  </div>
                </div>
              </KBCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Folders Tab ─────────────────────────────────────────────

function KBFoldersTab({ companyId }: { companyId: string }) {
  const { data: info } = usePluginData<KBFolderInfo>("kb:indexed-folders", { companyId });
  const [newFolder, setNewFolder] = useState("");
  const [indexing, setIndexing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const indexAction = usePluginAction("kb:index-folder");

  const handleIndex = useCallback(async (path: string) => {
    setIndexing(path);
    setToast(null);
    try {
      const res = await indexAction({ companyId, path, recursive: true }) as Record<string, unknown>;
      if (res.ok) {
        setToast({ msg: `Indexed ${res.indexed} files (${res.unchanged} unchanged, ${res.skipped} skipped)`, type: "success" });
        if (path === newFolder) setNewFolder("");
      } else {
        setToast({ msg: `Error: ${res.error}`, type: "error" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg: msg.includes("502") || msg.includes("timeout")
        ? "Timed out \u2014 indexing may still be running" : `Failed: ${msg}`, type: "error" });
    }
    setIndexing(null);
    setTimeout(() => setToast(null), 6000);
  }, [companyId, indexAction, newFolder]);

  const folders = info?.watchFolders ?? [];

  return (
    <div>
      {/* Index new folder */}
      <KBCard style={{ padding: "20px 22px", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ color: KB.textTertiary, display: "flex" }}>{Icons.folder(16)}</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: KB.textSecondary }}>
            Index a Folder
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <KBInput
            value={newFolder} onChange={setNewFolder}
            placeholder="/data/accounts/Animus-Systems-SL"
            mono style={{ flex: 1 }}
          />
          <KBButton
            onClick={() => { if (newFolder.trim()) handleIndex(newFolder.trim()); }}
            disabled={!!indexing || !newFolder.trim()}
          >
            {indexing === newFolder ? "Indexing..." : "Index Now"}
          </KBButton>
        </div>
        {toast && <div style={{ marginTop: 12 }}><KBToast message={toast.msg} type={toast.type} /></div>}
      </KBCard>

      {/* Watch folders */}
      <KBSectionHeader
        title="Watch Folders"
        count={folders.length}
        right={
          <span style={{ fontSize: "0.75rem", color: KB.textQuaternary }}>
            {info?.hashCount ?? 0} files tracked
          </span>
        }
      />

      {folders.length === 0 ? (
        <KBEmptyState
          icon={Icons.folder(40)}
          title="No watch folders"
          description="Configure watch folders in Agent Memory Settings to auto-index files every 6 hours."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {folders.map((f) => (
            <KBCard key={f} hoverable style={{ padding: "12px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: KB.textTertiary, display: "flex" }}>{Icons.folder(15)}</span>
                <span style={{
                  fontFamily: "ui-monospace, 'SF Mono', monospace",
                  fontSize: "0.825rem", color: KB.textPrimary, flex: 1,
                }}>
                  {f}
                </span>
                <KBButton
                  size="sm" variant="secondary"
                  onClick={() => handleIndex(f)}
                  disabled={!!indexing}
                >
                  {indexing === f ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "flex", animation: "spin 1s linear infinite" }}>{Icons.refresh()}</span>
                      Indexing
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {Icons.refresh()} Re-index
                    </span>
                  )}
                </KBButton>
              </div>
            </KBCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Briefs Tab ──────────────────────────────────────────────

function KBBriefsTab({ companyId }: { companyId: string }) {
  const { data: briefs, refresh } = usePluginData<ParsedKBEntry[]>("kb:list-briefs", { companyId });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [issueId, setIssueId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const briefAction = usePluginAction("kb:generate-brief");

  const handleGenerate = useCallback(async () => {
    if (!issueId.trim()) return;
    setGenerating(true);
    setToast(null);
    try {
      const res = await briefAction({ companyId, issueId: issueId.trim() }) as Record<string, unknown>;
      if (res.ok) {
        setToast({ msg: "Brief generated successfully", type: "success" });
        setIssueId("");
        refresh();
      } else {
        setToast({ msg: `Error: ${res.error}`, type: "error" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg: msg.includes("502") || msg.includes("timeout")
        ? "Timed out \u2014 the brief may still be generating" : `Failed: ${msg}`, type: "error" });
    }
    setGenerating(false);
    setTimeout(() => setToast(null), 6000);
  }, [issueId, companyId, briefAction, refresh]);

  const briefList = briefs ?? [];

  return (
    <div>
      {/* Generate brief */}
      <KBCard style={{ padding: "20px 22px", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ color: KB.purpleText, display: "flex" }}>{Icons.sparkle(16)}</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: KB.textSecondary }}>
            Generate Executive Brief
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <KBInput
            value={issueId} onChange={setIssueId}
            placeholder="Issue ID (e.g. ANI-877)"
            mono style={{ flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          />
          <KBButton onClick={handleGenerate} disabled={generating || !issueId.trim()}>
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "flex", animation: "spin 1s linear infinite" }}>{Icons.refresh()}</span>
                Generating...
              </span>
            ) : "Generate"}
          </KBButton>
        </div>
        {toast && <div style={{ marginTop: 12 }}><KBToast message={toast.msg} type={toast.type} /></div>}
      </KBCard>

      {/* Briefs list */}
      <KBSectionHeader title="Executive Briefs" count={briefList.length} />

      {briefList.length === 0 ? (
        <KBEmptyState
          icon={Icons.brief(40)}
          title="No briefs yet"
          description="Generate an executive brief from a completed issue above, or enable auto-brief to generate them automatically."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {briefList.map((b) => {
            const isExpanded = expanded === b.id;
            return (
              <KBCard key={b.id} hoverable onClick={() => setExpanded(isExpanded ? null : b.id)}>
                <div style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <KBBadge bg={KB.purpleBg} color={KB.purpleText}>Brief</KBBadge>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: KB.textPrimary, flex: 1 }}>
                      {b.title}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {b.issue && (
                        <span style={{
                          fontSize: "0.75rem", color: KB.textTertiary,
                          fontFamily: "ui-monospace, monospace",
                        }}>
                          {b.issue}
                        </span>
                      )}
                      <span style={{
                        display: "flex", transition: "transform 0.2s ease",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        color: KB.textQuaternary,
                      }}>
                        {Icons.chevron()}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      marginTop: 14, padding: "16px 18px",
                      borderRadius: KB.radiusSm, background: "rgba(0,0,0,0.15)",
                      fontSize: "0.875rem", color: KB.textSecondary,
                      lineHeight: 1.7, whiteSpace: "pre-wrap",
                      maxHeight: 500, overflowY: "auto",
                    }}>
                      {b.cleanContent}
                    </div>
                  )}
                </div>
              </KBCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Stats Tab (Overview) ───────────────────────────────────

function KBStatsTab({ companyId }: { companyId: string }) {
  const { data: stats } = usePluginData<KBStats>("kb:stats", { companyId });
  const { data: folders } = usePluginData<KBFolderInfo>("kb:indexed-folders", { companyId });
  const { data: status } = usePluginData<MemosStatus>("memory:status", { companyId });

  const s = stats ?? { indexedIssues: 0, uploadedDocuments: 0, generatedBriefs: 0 };
  const connected = (status as Record<string, unknown> | null)?.memosConnected ?? false;

  return (
    <div>
      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <KBMetricCard value={s.indexedIssues} label="Indexed Issues" icon={Icons.check(22)} />
        <KBMetricCard value={s.uploadedDocuments} label="Documents" icon={Icons.doc(22)} />
        <KBMetricCard value={s.generatedBriefs} label="Briefs" icon={Icons.brief(22)} />
        <KBMetricCard value={folders?.hashCount ?? 0} label="Tracked Files" icon={Icons.folder(22)} />
      </div>

      {/* System status */}
      <KBSectionHeader title="System Status" />
      <KBCard>
        {[
          {
            label: "MemOS",
            value: connected ? "Connected" : "Disconnected",
            color: connected ? KB.greenText : KB.redText,
            dot: connected ? KB.green : KB.red,
          },
          {
            label: "Watch Folders",
            value: String(folders?.watchFolders?.length ?? 0),
            color: KB.textPrimary,
          },
          ...(s.lastIndexAt ? [{
            label: "Last Indexed",
            value: new Date(s.lastIndexAt).toLocaleString(),
            color: KB.textSecondary,
          }] : []),
          ...(s.lastBriefAt ? [{
            label: "Last Brief",
            value: new Date(s.lastBriefAt).toLocaleString(),
            color: KB.textSecondary,
          }] : []),
        ].map((row, i, arr) => (
          <div key={row.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "13px 18px",
            borderBottom: i < arr.length - 1 ? `1px solid ${KB.cardBorder}` : "none",
          }}>
            <span style={{ fontSize: "0.85rem", color: KB.textTertiary }}>{row.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {"dot" in row && (
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: row.dot, display: "inline-block",
                }} />
              )}
              <span style={{ fontSize: "0.85rem", color: row.color, fontWeight: 500 }}>
                {row.value}
              </span>
            </div>
          </div>
        ))}
      </KBCard>
    </div>
  );
}
