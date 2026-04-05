// src/ui/index.tsx
import { useState, useCallback } from "react";
import {
  usePluginData,
  usePluginAction,
  useHostContext
} from "@paperclipai/plugin-sdk/ui";
import { jsx, jsxs } from "react/jsx-runtime";
var card = {
  background: "rgba(255,255,255,0.04)",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  border: "1px solid rgba(255,255,255,0.08)"
};
var muted = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "0.8rem"
};
var badge = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: "0.7rem",
  fontWeight: 500,
  background: "rgba(99,102,241,0.2)",
  color: "rgb(165,168,255)",
  marginRight: 4
};
var sectionLabel = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6
};
function timeAgo(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 6e4) return "just now";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
  return `${Math.floor(diff / 864e5)}d ago`;
}
function MemoryDashboardWidget() {
  const context = useHostContext();
  const { data: stats } = usePluginData("memory:stats", {
    companyId: context.companyId
  });
  const { data: activity } = usePluginData("memory:activity", {
    companyId: context.companyId
  });
  const s = stats ?? { totalStored: 0, totalInjected: 0, totalSearches: 0, byAgent: {} };
  const memosAgents = s.memosAgents ?? {};
  const agentEntries = Object.entries(memosAgents).sort(([, a], [, b]) => b - a);
  const events = activity ?? [];
  return /* @__PURE__ */ jsxs("div", { style: { padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: {
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: s.memosConnected ? "rgb(34,197,94)" : "rgb(239,68,68)"
        } }),
        /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.8rem", color: "rgba(255,255,255,0.7)" }, children: [
          "MemOS ",
          s.memosConnected ? "connected" : "offline"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("span", { style: muted, children: [
        agentEntries.length,
        " agents \xB7 ",
        s.memosTotal ?? 0,
        " knowledge objects"
      ] })
    ] }),
    agentEntries.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { style: sectionLabel, children: "Agents with Knowledge" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 }, children: agentEntries.map(([name, count]) => /* @__PURE__ */ jsxs("span", { style: {
        ...badge,
        background: "rgba(34,197,94,0.12)",
        color: "rgb(134,239,172)",
        fontSize: "0.75rem",
        padding: "3px 8px"
      }, children: [
        name,
        " (",
        count,
        ")"
      ] }, name)) })
    ] }),
    events.length > 0 ? /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { style: sectionLabel, children: "Recent Runs" }),
      events.slice(0, 8).map((e, i) => /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "3px 0",
        fontSize: "0.8rem",
        borderBottom: i < Math.min(events.length, 8) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none"
      }, children: [
        /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
          /* @__PURE__ */ jsx("span", { style: {
            width: 6,
            height: 6,
            borderRadius: "50%",
            display: "inline-block",
            background: e.hadIssue ? "rgb(134,239,172)" : "rgba(255,255,255,0.15)"
          } }),
          /* @__PURE__ */ jsx("span", { style: { color: "rgba(255,255,255,0.8)" }, children: e.agentName }),
          e.hadIssue && /* @__PURE__ */ jsx("span", { style: { color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }, children: "\u2192 stored" })
        ] }),
        /* @__PURE__ */ jsx("span", { style: muted, children: timeAgo(e.timestamp) })
      ] }, i))
    ] }) : /* @__PURE__ */ jsx("div", { style: { ...muted, fontStyle: "italic" }, children: "Activity feed populates as agents complete runs." })
  ] });
}
function MemoryAgentTab({ context }) {
  const agentId = context.entityId;
  const companyId = context.companyId;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addContent, setAddContent] = useState("");
  const [addCategory, setAddCategory] = useState("note");
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState("knowledge");
  const { data: memories, isLoading, refresh } = usePluginData(
    "memory:list",
    { companyId, entityId: agentId }
  );
  const searchAction = usePluginAction("memory:search-action");
  const addAction = usePluginAction("memory:manual-add");
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchAction({ companyId, entityId: agentId, query: searchQuery });
      setSearchResults(res ?? []);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, [searchQuery, companyId, agentId, searchAction]);
  const handleAdd = useCallback(async () => {
    if (!addContent.trim()) return;
    setAdding(true);
    try {
      await addAction({ companyId, agentId, content: addContent, category: addCategory });
      setAddContent("");
      refresh();
    } catch (err) {
      console.error("Failed to add memory:", err);
    }
    setAdding(false);
  }, [addContent, addCategory, companyId, agentId, addAction, refresh]);
  const renderKnowledge = (mem, i) => {
    const meta = mem.metadata ?? {};
    const name = meta.name ?? meta.key ?? "";
    const confidence = meta.confidence;
    const tags = meta.tags ?? [];
    const procedure = meta.procedure ?? "";
    const experience = meta.experience ?? [];
    const preference = meta.preference ?? [];
    const memType = meta.memory_type ?? meta.type ?? "";
    const sources = meta.sources ?? [];
    const updatedAt = meta.updated_at ?? "";
    const description = meta.description ?? mem.content ?? "";
    return /* @__PURE__ */ jsxs("div", { style: { ...card, marginBottom: 10 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          name && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.95rem", fontWeight: 600, color: "#fff" }, children: name }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginTop: 2 }, children: description })
        ] }),
        confidence != null && /* @__PURE__ */ jsxs("span", { style: { ...badge, background: "rgba(34,197,94,0.15)", color: "rgb(134,239,172)", flexShrink: 0 }, children: [
          (confidence * 100).toFixed(0),
          "%"
        ] })
      ] }),
      (tags.length > 0 || memType) && /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }, children: [
        memType && /* @__PURE__ */ jsx("span", { style: badge, children: memType }),
        mem.score != null && /* @__PURE__ */ jsxs("span", { style: { ...badge, background: "rgba(59,130,246,0.15)", color: "rgb(147,197,253)" }, children: [
          (mem.score * 100).toFixed(0),
          "% match"
        ] }),
        tags.map((t, j) => /* @__PURE__ */ jsx("span", { style: badge, children: t }, j)),
        updatedAt && /* @__PURE__ */ jsx("span", { style: muted, children: timeAgo(updatedAt) })
      ] }),
      experience.length > 0 && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx("div", { style: sectionLabel, children: "Learned" }),
        experience.map((e, j) => /* @__PURE__ */ jsx("div", { style: {
          fontSize: "0.8rem",
          color: "rgba(255,255,255,0.75)",
          lineHeight: 1.4,
          paddingLeft: 8,
          borderLeft: "2px solid rgba(99,102,241,0.3)",
          marginBottom: 3
        }, children: e }, j))
      ] }),
      preference.length > 0 && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 8 }, children: [
        /* @__PURE__ */ jsx("div", { style: sectionLabel, children: "Preferences" }),
        preference.map((p, j) => /* @__PURE__ */ jsx("div", { style: {
          fontSize: "0.8rem",
          color: "rgba(255,255,255,0.75)",
          lineHeight: 1.4,
          paddingLeft: 8,
          borderLeft: "2px solid rgba(234,179,8,0.3)",
          marginBottom: 3
        }, children: p }, j))
      ] }),
      procedure && /* @__PURE__ */ jsxs("details", { style: { marginBottom: 6 }, children: [
        /* @__PURE__ */ jsxs("summary", { style: { fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", cursor: "pointer" }, children: [
          "Procedure (",
          procedure.split(/\d+\./).length - 1,
          " steps)"
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.5, marginTop: 4 }, children: procedure })
      ] }),
      sources.length > 0 && /* @__PURE__ */ jsxs("details", { children: [
        /* @__PURE__ */ jsxs("summary", { style: { fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", cursor: "pointer" }, children: [
          "Built from ",
          sources.length,
          " run",
          sources.length > 1 ? "s" : "",
          " ",
          sources[0]?.chat_time ? `\xB7 last: ${sources[0].chat_time}` : ""
        ] }),
        /* @__PURE__ */ jsx("div", { style: { marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }, children: sources.map((src, j) => /* @__PURE__ */ jsxs("div", { style: {
          fontSize: "0.8rem",
          color: "rgba(255,255,255,0.5)",
          lineHeight: 1.5,
          padding: "6px 8px",
          background: "rgba(0,0,0,0.2)",
          borderRadius: 4,
          whiteSpace: "pre-wrap",
          maxHeight: 150,
          overflow: "auto"
        }, children: [
          src.chat_time && /* @__PURE__ */ jsx("div", { style: { fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", marginBottom: 2 }, children: src.chat_time }),
          (src.content ?? "").substring(0, 800)
        ] }, j)) })
      ] })
    ] }, mem.id || i);
  };
  const tabStyle = (active) => ({
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: "0.8rem",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    background: active ? "rgba(99,102,241,0.25)" : "transparent",
    color: active ? "rgb(165,168,255)" : "rgba(255,255,255,0.5)"
  });
  const inputStyle = {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: "0.85rem",
    outline: "none",
    fontFamily: "inherit"
  };
  return /* @__PURE__ */ jsxs("div", { style: { padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4 }, children: [
      /* @__PURE__ */ jsxs("button", { style: tabStyle(tab === "knowledge"), onClick: () => setTab("knowledge"), children: [
        "Knowledge ",
        memories?.length ? `(${memories.length})` : ""
      ] }),
      /* @__PURE__ */ jsx("button", { style: tabStyle(tab === "search"), onClick: () => setTab("search"), children: "Search" }),
      /* @__PURE__ */ jsx("button", { style: tabStyle(tab === "add"), onClick: () => setTab("add"), children: "Add" })
    ] }),
    tab === "knowledge" && /* @__PURE__ */ jsxs("div", { children: [
      isLoading && /* @__PURE__ */ jsx("div", { style: muted, children: "Loading..." }),
      !isLoading && (!memories || memories.length === 0) && /* @__PURE__ */ jsx("div", { style: { ...card, ...muted, fontStyle: "italic" }, children: "No knowledge yet. This agent will build knowledge automatically as it completes tasks. Each task contributes to evolving knowledge objects \u2014 skills, procedures, and preferences." }),
      memories && memories.map(renderKnowledge)
    ] }),
    tab === "search" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && handleSearch(),
            placeholder: "Search this agent's knowledge...",
            style: { ...inputStyle, flex: 1 }
          }
        ),
        /* @__PURE__ */ jsx("button", { onClick: handleSearch, disabled: searching || !searchQuery.trim(), style: {
          padding: "8px 16px",
          borderRadius: 6,
          border: "none",
          background: "rgba(99,102,241,0.3)",
          color: "rgb(165,168,255)",
          fontSize: "0.8rem",
          fontWeight: 500,
          cursor: "pointer",
          opacity: searching || !searchQuery.trim() ? 0.5 : 1
        }, children: searching ? "..." : "Search" })
      ] }),
      searchResults !== null && (searchResults.length === 0 ? /* @__PURE__ */ jsx("div", { style: muted, children: "No matching knowledge found." }) : searchResults.map(renderKnowledge))
    ] }),
    tab === "add" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem" }, children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: addContent,
          onChange: (e) => setAddContent(e.target.value),
          placeholder: "Add knowledge for this agent (a fact, decision, or preference)...",
          rows: 4,
          style: { ...inputStyle, resize: "vertical" }
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: addCategory,
            onChange: (e) => setAddCategory(e.target.value),
            style: { ...inputStyle, padding: "6px 10px" },
            children: [
              /* @__PURE__ */ jsx("option", { value: "note", children: "Note" }),
              /* @__PURE__ */ jsx("option", { value: "decision", children: "Decision" }),
              /* @__PURE__ */ jsx("option", { value: "learning", children: "Learning" }),
              /* @__PURE__ */ jsx("option", { value: "fact", children: "Fact" }),
              /* @__PURE__ */ jsx("option", { value: "preference", children: "Preference" })
            ]
          }
        ),
        /* @__PURE__ */ jsx("button", { onClick: handleAdd, disabled: adding || !addContent.trim(), style: {
          padding: "6px 16px",
          borderRadius: 6,
          border: "none",
          background: "rgba(34,197,94,0.25)",
          color: "rgb(134,239,172)",
          fontSize: "0.8rem",
          fontWeight: 500,
          cursor: "pointer",
          opacity: adding || !addContent.trim() ? 0.5 : 1
        }, children: adding ? "Saving..." : "Save" })
      ] })
    ] })
  ] });
}
var configRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: "0.85rem"
};
var sectionTitle = {
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "#fff",
  marginBottom: 8,
  marginTop: 16
};
function MemorySettingsPage({ context }) {
  const { data, isLoading, refresh } = usePluginData("memory:status", {
    companyId: context.companyId
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const status = data ?? {
    memosConnected: false,
    memosUrl: "unknown",
    totalMemories: 0,
    config: { autoExtract: true, autoInject: true, maxMemoriesPerInjection: 5, injectionTokenBudget: 800, extractionMode: "hybrid", llmExtractionModel: "openai/gpt-4o-mini", llmFallbackModel: "google/gemini-2.5-flash" }
  };
  const [localConfig, setLocalConfig] = useState(null);
  const cfg = { ...status.config, ...localConfig ?? {} };
  const handleChange = (key, value) => {
    setLocalConfig((prev) => ({ ...prev ?? {}, [key]: value }));
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
        llmFallbackModel: cfg.llmFallbackModel
      };
      const res = await fetch(`/api/plugins/animusystems.agent-memory/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configJson: fullConfig })
      });
      if (res.ok) {
        setSaveMsg("Saved");
        setLocalConfig(null);
        refresh();
      } else {
        const body = await res.text().catch(() => "");
        setSaveMsg(`Save failed (${res.status}): ${body.substring(0, 100)}`);
      }
    } catch (err) {
      setSaveMsg(String(err));
    }
    setSaving(false);
  }, [localConfig, cfg, refresh]);
  if (isLoading) return /* @__PURE__ */ jsx("div", { style: { padding: "1.5rem", ...muted }, children: "Loading..." });
  const dot = (on) => /* @__PURE__ */ jsx("span", { style: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: on ? "rgb(34,197,94)" : "rgb(239,68,68)",
    marginRight: 6
  } });
  const selectStyle = {
    padding: "5px 8px",
    borderRadius: 4,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontSize: "0.8rem",
    fontFamily: "inherit",
    outline: "none",
    cursor: "pointer"
  };
  const inputStyle = {
    ...selectStyle,
    fontFamily: "monospace",
    minWidth: 220,
    textAlign: "right"
  };
  const toggleStyle = (on) => ({
    padding: "4px 10px",
    borderRadius: 4,
    border: "none",
    background: on ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.15)",
    color: on ? "rgb(134,239,172)" : "rgb(252,165,165)",
    fontSize: "0.8rem",
    fontWeight: 500,
    cursor: "pointer"
  });
  const hasChanges = localConfig !== null && Object.keys(localConfig).length > 0;
  return /* @__PURE__ */ jsxs("div", { style: { padding: "1.5rem", maxWidth: 700 }, children: [
    /* @__PURE__ */ jsxs("div", { style: sectionTitle, children: [
      dot(status.memosConnected),
      " MemOS Connection"
    ] }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "URL" }),
        /* @__PURE__ */ jsx("span", { style: { color: "#fff", fontFamily: "monospace", fontSize: "0.8rem" }, children: status.memosUrl })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Status" }),
        /* @__PURE__ */ jsx("span", { style: { color: status.memosConnected ? "rgb(134,239,172)" : "rgb(252,165,165)" }, children: status.memosConnected ? "Connected" : "Disconnected" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Last check" }),
        /* @__PURE__ */ jsx("span", { style: { color: "rgba(255,255,255,0.7)" }, children: status.lastCheckAt ? timeAgo(status.lastCheckAt) : "checking..." })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: sectionTitle, children: "Infrastructure" }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Embedder" }),
        /* @__PURE__ */ jsx("span", { style: { color: "#fff" }, children: "Ollama \u2014 nomic-embed-text (768d, Metal GPU)" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Chat LLM" }),
        /* @__PURE__ */ jsx("span", { style: { color: "#fff" }, children: "OpenRouter \u2014 mistral-small-3.2-24b-instruct" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Vector DB" }),
        /* @__PURE__ */ jsx("span", { style: { color: "#fff" }, children: "Qdrant (768d cosine)" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Graph DB" }),
        /* @__PURE__ */ jsx("span", { style: { color: "#fff" }, children: "Neo4j 5.26" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: sectionTitle, children: "Knowledge Stats" }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Knowledge objects" }),
        /* @__PURE__ */ jsx("span", { style: { color: "#fff", fontWeight: 600 }, children: status.totalMemories })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Agents with knowledge" }),
        /* @__PURE__ */ jsxs("span", { style: { color: "#fff" }, children: [
          status.agentsWithMemory ?? "\u2014",
          " / ",
          status.totalAgents ?? "\u2014"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: sectionTitle, children: "Plugin Configuration" }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Auto-extract" }),
        /* @__PURE__ */ jsx("button", { style: toggleStyle(cfg.autoExtract), onClick: () => handleChange("autoExtract", !cfg.autoExtract), children: cfg.autoExtract ? "enabled" : "disabled" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Auto-inject" }),
        /* @__PURE__ */ jsx("button", { style: toggleStyle(cfg.autoInject), onClick: () => handleChange("autoInject", !cfg.autoInject), children: cfg.autoInject ? "enabled" : "disabled" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Extraction mode" }),
        /* @__PURE__ */ jsxs("select", { style: selectStyle, value: cfg.extractionMode, onChange: (e) => handleChange("extractionMode", e.target.value), children: [
          /* @__PURE__ */ jsx("option", { value: "rule_based", children: "Rule-based (free)" }),
          /* @__PURE__ */ jsx("option", { value: "hybrid", children: "Hybrid (rule + LLM fallback)" }),
          /* @__PURE__ */ jsx("option", { value: "llm", children: "LLM only" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "LLM extraction model" }),
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: cfg.llmExtractionModel, onChange: (e) => handleChange("llmExtractionModel", e.target.value), placeholder: "openai/gpt-4o-mini" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Fallback model" }),
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: cfg.llmFallbackModel ?? "", onChange: (e) => handleChange("llmFallbackModel", e.target.value), placeholder: "google/gemini-2.5-flash" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Max memories per injection" }),
        /* @__PURE__ */ jsx("input", { style: { ...selectStyle, width: 80, textAlign: "center" }, type: "number", min: 1, max: 20, value: cfg.maxMemoriesPerInjection, onChange: (e) => handleChange("maxMemoriesPerInjection", parseInt(e.target.value) || 5) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { ...configRow, borderBottom: "none" }, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Token budget" }),
        /* @__PURE__ */ jsx("input", { style: { ...selectStyle, width: 100, textAlign: "center" }, type: "number", min: 100, max: 5e3, step: 100, value: cfg.injectionTokenBudget, onChange: (e) => handleChange("injectionTokenBudget", parseInt(e.target.value) || 800) })
      ] })
    ] }),
    hasChanges && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 }, children: [
      /* @__PURE__ */ jsx("button", { onClick: handleSave, disabled: saving, style: {
        padding: "8px 20px",
        borderRadius: 6,
        border: "none",
        background: "rgba(99,102,241,0.3)",
        color: "rgb(165,168,255)",
        fontSize: "0.85rem",
        fontWeight: 500,
        cursor: saving ? "wait" : "pointer",
        opacity: saving ? 0.6 : 1
      }, children: saving ? "Saving..." : "Save Changes" }),
      /* @__PURE__ */ jsx("button", { onClick: () => {
        setLocalConfig(null);
        setSaveMsg("");
      }, style: {
        padding: "8px 14px",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "transparent",
        color: "rgba(255,255,255,0.5)",
        fontSize: "0.8rem",
        cursor: "pointer"
      }, children: "Cancel" }),
      saveMsg && /* @__PURE__ */ jsx("span", { style: { fontSize: "0.8rem", color: saveMsg === "Saved" ? "rgb(134,239,172)" : "rgb(252,165,165)" }, children: saveMsg })
    ] })
  ] });
}
export {
  MemoryAgentTab,
  MemoryDashboardWidget,
  MemorySettingsPage
};
//# sourceMappingURL=index.js.map
