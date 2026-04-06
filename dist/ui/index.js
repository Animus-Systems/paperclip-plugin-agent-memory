// src/ui/index.tsx
import React, { useState, useCallback } from "react";
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
    config: { autoExtract: true, autoInject: true, maxMemoriesPerInjection: 5, injectionTokenBudget: 800, extractionMode: "hybrid", llmExtractionModel: "mistralai/mistral-small-3.2-24b-instruct", llmFallbackModel: "google/gemini-2.5-flash" }
  };
  const [dbConfig, setDbConfig] = useState(null);
  React.useEffect(() => {
    fetch(`/api/plugins/animusystems.agent-memory/config`).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.configJson) setDbConfig(d.configJson);
    }).catch(() => {
    });
  }, []);
  const [localConfig, setLocalConfig] = useState(null);
  const cfg = { ...status.config, ...dbConfig ?? {}, ...localConfig ?? {} };
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
        llmFallbackModel: cfg.llmFallbackModel,
        kbAutoIndex: cfg.kbAutoIndex ?? true,
        kbAutoBreif: cfg.kbAutoBreif ?? true,
        kbBriefModel: cfg.kbBriefModel ?? "google/gemini-2.5-flash",
        kbWatchFolders: cfg.kbWatchFolders ?? []
      };
      const res = await fetch(`/api/plugins/animusystems.agent-memory/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configJson: fullConfig })
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
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: cfg.llmExtractionModel, onChange: (e) => handleChange("llmExtractionModel", e.target.value), placeholder: "mistralai/mistral-small-3.2-24b-instruct" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Fallback model" }),
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: String(cfg.llmFallbackModel ?? "google/gemini-2.5-flash"), onChange: (e) => handleChange("llmFallbackModel", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Max memories per injection" }),
        /* @__PURE__ */ jsx("input", { style: { ...selectStyle, width: 80, textAlign: "center" }, type: "number", min: 1, max: 20, value: cfg.maxMemoriesPerInjection, onChange: (e) => handleChange("maxMemoriesPerInjection", parseInt(e.target.value) || 5) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Token budget" }),
        /* @__PURE__ */ jsx("input", { style: { ...selectStyle, width: 100, textAlign: "center" }, type: "number", min: 100, max: 5e3, step: 100, value: cfg.injectionTokenBudget, onChange: (e) => handleChange("injectionTokenBudget", parseInt(e.target.value) || 800) })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: sectionTitle, children: "Knowledge Base" }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Auto-index completed issues" }),
        /* @__PURE__ */ jsx("button", { style: toggleStyle(cfg.kbAutoIndex ?? true), onClick: () => handleChange("kbAutoIndex", !(cfg.kbAutoIndex ?? true)), children: cfg.kbAutoIndex ?? true ? "enabled" : "disabled" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Auto-generate executive briefs" }),
        /* @__PURE__ */ jsx("button", { style: toggleStyle(cfg.kbAutoBreif ?? true), onClick: () => handleChange("kbAutoBreif", !(cfg.kbAutoBreif ?? true)), children: cfg.kbAutoBreif ?? true ? "enabled" : "disabled" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: configRow, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Brief generation model" }),
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: String(cfg.kbBriefModel ?? "google/gemini-2.5-flash"), onChange: (e) => handleChange("kbBriefModel", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { ...configRow, borderBottom: "none", flexDirection: "column", alignItems: "stretch", gap: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Watch folders (one per line \u2014 indexed every 6 hours)" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            style: { ...inputStyle, textAlign: "left", minHeight: 60, fontFamily: "monospace", fontSize: "0.75rem", resize: "vertical" },
            value: (cfg.kbWatchFolders ?? []).join("\n"),
            onChange: (e) => handleChange("kbWatchFolders", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)),
            placeholder: "/data/shared/accounts/Animus-Systems-SL\n/data/github/animusystems"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: sectionTitle, children: "Index Folder" }),
    /* @__PURE__ */ jsx("div", { style: card, children: /* @__PURE__ */ jsxs("div", { style: { ...configRow, borderBottom: "none", gap: 8 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          style: { ...inputStyle, flex: 1, textAlign: "left" },
          placeholder: "/data/shared/accounts/Animus-Systems-SL",
          id: "kb-folder-path"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: async () => {
            const input = document.getElementById("kb-folder-path");
            const path = input?.value?.trim();
            if (!path) return;
            input.disabled = true;
            try {
              const res = await fetch(`/api/plugins/animusystems.agent-memory/actions/kb:index-folder`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: context.companyId, path, recursive: true })
              }).then((r) => r.json());
              alert(res.ok ? `Indexed ${res.indexed} files (${res.skipped} skipped, ${res.errors} errors)` : `Error: ${res.error}`);
            } catch (err) {
              alert(`Failed: ${err}`);
            }
            input.disabled = false;
          },
          style: {
            padding: "6px 14px",
            borderRadius: 5,
            border: "none",
            background: "rgba(59,130,246,0.25)",
            color: "rgb(147,197,253)",
            fontSize: "0.8rem",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap"
          },
          children: "Index Now"
        }
      )
    ] }) }),
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
function KBDashboardWidget({ context }) {
  const { data: stats } = usePluginData("kb:stats", {
    companyId: context.companyId
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
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
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: "1.3rem", fontWeight: 700 }, children: s.indexedIssues }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: "0.7rem", opacity: 0.6 }, children: "Indexed Issues" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: "1.3rem", fontWeight: 700 }, children: s.uploadedDocuments }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: "0.7rem", opacity: 0.6 }, children: "Documents" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: "1.3rem", fontWeight: 700 }, children: s.generatedBriefs }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: "0.7rem", opacity: 0.6 }, children: "Briefs" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && handleSearch(),
          placeholder: "Search knowledge base...",
          style: {
            flex: 1,
            padding: "6px 10px",
            fontSize: "0.85rem",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "5px",
            color: "inherit",
            outline: "none"
          }
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleSearch,
          disabled: searching || !query.trim(),
          style: {
            padding: "6px 12px",
            fontSize: "0.8rem",
            background: "rgba(59,130,246,0.8)",
            border: "none",
            borderRadius: "5px",
            color: "#fff",
            cursor: "pointer",
            opacity: searching ? 0.5 : 1
          },
          children: searching ? "..." : "Search"
        }
      )
    ] }),
    results !== null && /* @__PURE__ */ jsx("div", { style: { maxHeight: "200px", overflowY: "auto", fontSize: "0.8rem" }, children: results.length === 0 ? /* @__PURE__ */ jsx("div", { style: { opacity: 0.5, padding: "8px" }, children: "No results found." }) : results.slice(0, 5).map((r, i) => /* @__PURE__ */ jsxs("div", { style: { padding: "8px", borderBottom: "1px solid rgba(255,255,255,0.06)", lineHeight: 1.4 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontWeight: 500, marginBottom: 2 }, children: r.title }),
      /* @__PURE__ */ jsx("div", { style: { opacity: 0.6 }, children: r.excerpt })
    ] }, r.id || i)) }),
    s.lastIndexAt && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.7rem", opacity: 0.4 }, children: [
      "Last indexed: ",
      new Date(s.lastIndexAt).toLocaleString()
    ] })
  ] });
}
var KB_ROUTE = "knowledge-base";
function KBSidebarLink({ context }) {
  const href = context.companyPrefix ? `/${context.companyPrefix}/${KB_ROUTE}` : `/${KB_ROUTE}`;
  const isActive = typeof window !== "undefined" && window.location.pathname === href;
  return /* @__PURE__ */ jsxs(
    "a",
    {
      href,
      "aria-current": isActive ? "page" : void 0,
      className: [
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      ].join(" "),
      children: [
        /* @__PURE__ */ jsx("span", { className: "flex h-5 w-5 items-center justify-center", children: /* @__PURE__ */ jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" }) }) }),
        /* @__PURE__ */ jsx("span", { className: "flex-1 truncate", children: "Knowledge Base" })
      ]
    }
  );
}
var KB = {
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
  zincBg: "rgba(161,161,170,0.10)"
};
var SOURCE_THEME = {
  issue_completion: { bg: KB.greenBg, text: KB.greenText, label: "Issue", icon: "checkmark.circle.fill" },
  document: { bg: KB.blueBg, text: KB.blueText, label: "Document", icon: "doc.fill" },
  executive_brief: { bg: KB.purpleBg, text: KB.purpleText, label: "Brief", icon: "text.document.fill" },
  manual_upload: { bg: KB.blueBg, text: KB.blueText, label: "Upload", icon: "arrow.up.doc.fill" },
  unknown: { bg: KB.zincBg, text: KB.zinc, label: "Other", icon: "questionmark.circle" }
};
function KBCard({ children, style, onClick, hoverable = false }) {
  const [hovered, setHovered] = useState(false);
  return /* @__PURE__ */ jsx(
    "div",
    {
      onClick,
      onMouseEnter: hoverable ? () => setHovered(true) : void 0,
      onMouseLeave: hoverable ? () => setHovered(false) : void 0,
      style: {
        background: hovered ? KB.cardBgHover : KB.cardBg,
        borderRadius: KB.radius,
        border: `1px solid ${hovered ? KB.cardBorderHover : KB.cardBorder}`,
        transition: "all 0.2s ease",
        cursor: onClick ? "pointer" : void 0,
        ...style
      },
      children
    }
  );
}
function KBInput({ value, onChange, onKeyDown, placeholder, style, large, mono }) {
  const [focused, setFocused] = useState(false);
  return /* @__PURE__ */ jsx(
    "input",
    {
      type: "text",
      value,
      onChange: (e) => onChange(e.target.value),
      onKeyDown,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      style: {
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
        ...style
      }
    }
  );
}
function KBTextarea({ value, onChange, placeholder, rows = 4, mono, style }) {
  const [focused, setFocused] = useState(false);
  return /* @__PURE__ */ jsx(
    "textarea",
    {
      value,
      onChange: (e) => onChange(e.target.value),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      rows,
      style: {
        padding: "10px 14px",
        borderRadius: KB.radiusSm,
        border: `1px solid ${focused ? KB.inputFocus : KB.inputBorder}`,
        background: KB.inputBg,
        color: KB.textPrimary,
        fontSize: "0.875rem",
        fontFamily: mono ? "ui-monospace, 'SF Mono', monospace" : "inherit",
        outline: "none",
        width: "100%",
        resize: "vertical",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        boxShadow: focused ? `0 0 0 3px ${KB.accentBg}` : "none",
        lineHeight: 1.5,
        ...style
      }
    }
  );
}
function KBButton({ children, onClick, disabled, variant = "primary", size = "md", style }) {
  const [hovered, setHovered] = useState(false);
  const base = {
    padding: size === "sm" ? "6px 14px" : "9px 20px",
    borderRadius: KB.radiusXs,
    border: "none",
    fontSize: size === "sm" ? "0.8rem" : "0.875rem",
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "inherit"
  };
  const variants = {
    primary: {
      background: hovered && !disabled ? "rgba(99,102,241,0.35)" : "rgba(99,102,241,0.22)",
      color: KB.accentText
    },
    secondary: {
      background: hovered && !disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
      color: KB.textSecondary,
      border: `1px solid ${KB.cardBorder}`
    },
    ghost: {
      background: hovered && !disabled ? "rgba(255,255,255,0.06)" : "transparent",
      color: KB.textTertiary
    }
  };
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick,
      disabled,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      style: { ...base, ...variants[variant], ...style },
      children
    }
  );
}
function KBBadge({ children, bg, color }) {
  return /* @__PURE__ */ jsx("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: "0.7rem",
    fontWeight: 600,
    background: bg,
    color,
    letterSpacing: "0.02em",
    textTransform: "uppercase"
  }, children });
}
function KBMetricCard({ value, label, icon }) {
  return /* @__PURE__ */ jsxs(KBCard, { style: { padding: "20px 16px", textAlign: "center" }, children: [
    /* @__PURE__ */ jsx("div", { style: { marginBottom: 8, opacity: 0.5 }, children: icon }),
    /* @__PURE__ */ jsx("div", { style: {
      fontSize: "1.75rem",
      fontWeight: 700,
      color: KB.textPrimary,
      letterSpacing: "-0.02em",
      lineHeight: 1
    }, children: value }),
    /* @__PURE__ */ jsx("div", { style: {
      fontSize: "0.75rem",
      color: KB.textTertiary,
      marginTop: 6,
      fontWeight: 500,
      letterSpacing: "0.02em"
    }, children: label })
  ] });
}
function KBToast({ message, type = "info" }) {
  const colors = {
    success: { bg: KB.greenBg, border: "rgba(34,197,94,0.2)", text: KB.greenText, icon: "\u2713" },
    error: { bg: KB.redBg, border: "rgba(239,68,68,0.2)", text: KB.redText, icon: "\u2717" },
    info: { bg: KB.accentBg, border: "rgba(99,102,241,0.2)", text: KB.accentText, icon: "\u2139" }
  };
  const c = colors[type];
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    borderRadius: KB.radiusSm,
    background: c.bg,
    border: `1px solid ${c.border}`,
    fontSize: "0.85rem",
    color: c.text,
    animation: "fadeIn 0.2s ease"
  }, children: [
    /* @__PURE__ */ jsx("span", { style: { fontSize: "0.9rem", fontWeight: 700 }, children: c.icon }),
    message
  ] });
}
function KBEmptyState({ icon, title, description }) {
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    textAlign: "center"
  }, children: [
    /* @__PURE__ */ jsx("div", { style: { marginBottom: 16, opacity: 0.3 }, children: icon }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: "1rem", fontWeight: 600, color: KB.textSecondary, marginBottom: 6 }, children: title }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: KB.textTertiary, maxWidth: 360, lineHeight: 1.5 }, children: description })
  ] });
}
function KBSectionHeader({ title, count, right }) {
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 24
  }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.8rem", fontWeight: 600, color: KB.textSecondary, letterSpacing: "0.03em" }, children: title }),
      count != null && /* @__PURE__ */ jsx("span", { style: {
        fontSize: "0.7rem",
        fontWeight: 600,
        color: KB.textTertiary,
        background: "rgba(255,255,255,0.06)",
        padding: "1px 7px",
        borderRadius: 10
      }, children: count })
    ] }),
    right
  ] });
}
var Icons = {
  search: (size = 18) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("circle", { cx: "11", cy: "11", r: "8" }),
    /* @__PURE__ */ jsx("path", { d: "m21 21-4.35-4.35" })
  ] }),
  doc: (size = 18) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" }),
    /* @__PURE__ */ jsx("polyline", { points: "14 2 14 8 20 8" })
  ] }),
  folder: (size = 18) => /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }) }),
  brief: (size = 18) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" }),
    /* @__PURE__ */ jsx("polyline", { points: "14 2 14 8 20 8" }),
    /* @__PURE__ */ jsx("line", { x1: "16", y1: "13", x2: "8", y2: "13" }),
    /* @__PURE__ */ jsx("line", { x1: "16", y1: "17", x2: "8", y2: "17" }),
    /* @__PURE__ */ jsx("line", { x1: "10", y1: "9", x2: "8", y2: "9" })
  ] }),
  chart: (size = 18) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("line", { x1: "18", y1: "20", x2: "18", y2: "10" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "20", x2: "12", y2: "4" }),
    /* @__PURE__ */ jsx("line", { x1: "6", y1: "20", x2: "6", y2: "14" })
  ] }),
  check: (size = 18) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }),
    /* @__PURE__ */ jsx("polyline", { points: "22 4 12 14.01 9 11.01" })
  ] }),
  upload: (size = 18) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    /* @__PURE__ */ jsx("polyline", { points: "17 8 12 3 7 8" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "3", x2: "12", y2: "15" })
  ] }),
  chevron: (size = 14) => /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("polyline", { points: "9 18 15 12 9 6" }) }),
  sparkle: (size = 18) => /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" }) }),
  refresh: (size = 14) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
    /* @__PURE__ */ jsx("path", { d: "M3 3v5h5" }),
    /* @__PURE__ */ jsx("path", { d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" }),
    /* @__PURE__ */ jsx("path", { d: "M16 16h5v5" })
  ] })
};
var TABS = [
  { key: "search", label: "Search", icon: Icons.search },
  { key: "documents", label: "Documents", icon: Icons.doc },
  { key: "folders", label: "Folders", icon: Icons.folder },
  { key: "briefs", label: "Briefs", icon: Icons.brief },
  { key: "stats", label: "Overview", icon: Icons.chart }
];
function KBPage({ context }) {
  const [tab, setTab] = useState("search");
  return /* @__PURE__ */ jsxs("div", { style: { padding: "24px 32px", maxWidth: 1e3, margin: "0 auto" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { marginBottom: 24 }, children: [
      /* @__PURE__ */ jsx("h1", { style: {
        fontSize: "1.5rem",
        fontWeight: 700,
        color: KB.textPrimary,
        letterSpacing: "-0.02em",
        margin: 0
      }, children: "Knowledge Base" }),
      /* @__PURE__ */ jsx("p", { style: { fontSize: "0.85rem", color: KB.textTertiary, margin: "4px 0 0" }, children: "Search, manage, and explore your team's collective knowledge." })
    ] }),
    /* @__PURE__ */ jsx("div", { style: {
      display: "inline-flex",
      gap: 2,
      padding: 3,
      background: "rgba(255,255,255,0.04)",
      borderRadius: KB.radiusSm,
      marginBottom: 28,
      border: `1px solid ${KB.cardBorder}`
    }, children: TABS.map((t) => {
      const active = tab === t.key;
      return /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setTab(t.key),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 16px",
            borderRadius: KB.radiusXs,
            border: "none",
            cursor: "pointer",
            background: active ? "rgba(255,255,255,0.10)" : "transparent",
            color: active ? KB.textPrimary : KB.textTertiary,
            fontSize: "0.82rem",
            fontWeight: 500,
            transition: "all 0.15s ease",
            fontFamily: "inherit"
          },
          children: [
            /* @__PURE__ */ jsx("span", { style: { opacity: active ? 0.9 : 0.5, display: "flex" }, children: t.icon(14) }),
            t.label
          ]
        },
        t.key
      );
    }) }),
    /* @__PURE__ */ jsxs("div", { children: [
      tab === "search" && /* @__PURE__ */ jsx(KBSearchTab, { companyId: context.companyId }),
      tab === "documents" && /* @__PURE__ */ jsx(KBDocumentsTab, { companyId: context.companyId }),
      tab === "folders" && /* @__PURE__ */ jsx(KBFoldersTab, { companyId: context.companyId }),
      tab === "briefs" && /* @__PURE__ */ jsx(KBBriefsTab, { companyId: context.companyId }),
      tab === "stats" && /* @__PURE__ */ jsx(KBStatsTab, { companyId: context.companyId })
    ] })
  ] });
}
function KBSearchTab({ companyId }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const searchAction = usePluginAction("kb:search");
  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchAction({ companyId, query: query.trim() });
      setResults(Array.isArray(res) ? res : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, companyId, searchAction]);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: {
      display: "flex",
      gap: 10,
      marginBottom: 24,
      alignItems: "center"
    }, children: [
      /* @__PURE__ */ jsxs("div", { style: { flex: 1, position: "relative" }, children: [
        /* @__PURE__ */ jsx("span", { style: {
          position: "absolute",
          left: 14,
          top: "50%",
          transform: "translateY(-50%)",
          color: KB.textTertiary,
          display: "flex",
          pointerEvents: "none"
        }, children: Icons.search(16) }),
        /* @__PURE__ */ jsx(
          KBInput,
          {
            value: query,
            onChange: setQuery,
            onKeyDown: (e) => e.key === "Enter" && doSearch(),
            placeholder: "Search completed work, documents, briefs...",
            large: true,
            style: { paddingLeft: 40 }
          }
        )
      ] }),
      /* @__PURE__ */ jsx(KBButton, { onClick: doSearch, disabled: searching || !query.trim(), children: searching ? "Searching..." : "Search" })
    ] }),
    results === null && /* @__PURE__ */ jsx(
      KBEmptyState,
      {
        icon: Icons.search(40),
        title: "Search your knowledge",
        description: "Find context from completed tasks, uploaded documents, and executive briefs. Results are ranked by relevance."
      }
    ),
    results !== null && results.length === 0 && /* @__PURE__ */ jsx(
      KBEmptyState,
      {
        icon: Icons.search(40),
        title: "No results found",
        description: "Try different keywords or a broader search query."
      }
    ),
    results && results.length > 0 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.75rem", color: KB.textTertiary, fontWeight: 500, marginBottom: 4 }, children: [
        results.length,
        " result",
        results.length !== 1 ? "s" : ""
      ] }),
      results.map((r, i) => {
        const source = SOURCE_THEME[r.source] ?? SOURCE_THEME.unknown;
        const key = r.id || String(i);
        const isExpanded = expanded === key;
        const relevance = r.score != null ? Math.round(r.score * 100) : null;
        return /* @__PURE__ */ jsx(KBCard, { hoverable: true, onClick: () => setExpanded(isExpanded ? null : key), children: /* @__PURE__ */ jsxs("div", { style: { padding: "14px 18px" }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: isExpanded ? 12 : 6 }, children: [
            /* @__PURE__ */ jsx(KBBadge, { bg: source.bg, color: source.text, children: source.label }),
            /* @__PURE__ */ jsx("span", { style: {
              fontSize: "0.92rem",
              fontWeight: 600,
              color: KB.textPrimary,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }, children: r.title }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }, children: [
              r.issue && /* @__PURE__ */ jsx("span", { style: {
                fontSize: "0.75rem",
                color: KB.textTertiary,
                fontWeight: 500,
                background: "rgba(255,255,255,0.05)",
                padding: "2px 8px",
                borderRadius: 6,
                fontFamily: "ui-monospace, monospace"
              }, children: r.issue }),
              relevance != null && /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.7rem", color: KB.textQuaternary, fontWeight: 500 }, children: [
                relevance,
                "%"
              ] }),
              /* @__PURE__ */ jsx("span", { style: {
                display: "flex",
                transition: "transform 0.2s ease",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                color: KB.textQuaternary
              }, children: Icons.chevron() })
            ] })
          ] }),
          r.agent && !isExpanded && /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.75rem", color: KB.textTertiary }, children: [
            "by ",
            r.agent
          ] }),
          !isExpanded && /* @__PURE__ */ jsx("div", { style: {
            fontSize: "0.835rem",
            color: KB.textTertiary,
            lineHeight: 1.5,
            marginTop: 4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }, children: r.excerpt }),
          isExpanded && /* @__PURE__ */ jsxs("div", { children: [
            r.agent && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", color: KB.textTertiary, marginBottom: 12 }, children: [
              "Generated by ",
              /* @__PURE__ */ jsx("span", { style: { color: KB.textSecondary, fontWeight: 500 }, children: r.agent })
            ] }),
            /* @__PURE__ */ jsx("div", { style: {
              fontSize: "0.875rem",
              color: KB.textSecondary,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              maxHeight: 400,
              overflowY: "auto",
              padding: "14px 16px",
              borderRadius: KB.radiusSm,
              background: "rgba(0,0,0,0.15)"
            }, children: r.cleanContent })
          ] })
        ] }) }, key);
      })
    ] })
  ] });
}
function KBDocumentsTab({ companyId }) {
  const { data: docs } = usePluginData("kb:list-documents", { companyId });
  const [uploadName, setUploadName] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const uploadAction = usePluginAction("kb:upload-document");
  const handleUpload = useCallback(async () => {
    if (!uploadName.trim() || !uploadContent.trim()) return;
    setUploading(true);
    setToast(null);
    try {
      await uploadAction({ companyId, name: uploadName.trim(), content: uploadContent.trim() });
      setUploadName("");
      setUploadContent("");
      setToast({ msg: "Document uploaded successfully", type: "success" });
    } catch {
      setToast({ msg: "Failed to upload document", type: "error" });
    }
    setUploading(false);
    setTimeout(() => setToast(null), 4e3);
  }, [uploadName, uploadContent, companyId, uploadAction]);
  const docList = docs ?? [];
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs(KBCard, { style: { padding: "20px 22px", marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 16
      }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: KB.textTertiary, display: "flex" }, children: Icons.upload(16) }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: "0.875rem", fontWeight: 600, color: KB.textSecondary }, children: "Upload Document" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
        /* @__PURE__ */ jsx(
          KBInput,
          {
            value: uploadName,
            onChange: setUploadName,
            placeholder: "Document title"
          }
        ),
        /* @__PURE__ */ jsx(
          KBTextarea,
          {
            value: uploadContent,
            onChange: setUploadContent,
            placeholder: "Paste document content...",
            rows: 4,
            mono: true
          }
        ),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
          /* @__PURE__ */ jsx(
            KBButton,
            {
              onClick: handleUpload,
              disabled: uploading || !uploadName.trim() || !uploadContent.trim(),
              children: uploading ? "Uploading..." : "Upload"
            }
          ),
          toast && /* @__PURE__ */ jsx(KBToast, { message: toast.msg, type: toast.type })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(KBSectionHeader, { title: "Documents", count: docList.length }),
    docList.length === 0 ? /* @__PURE__ */ jsx(
      KBEmptyState,
      {
        icon: Icons.doc(40),
        title: "No documents yet",
        description: "Upload a document above or enable auto-indexing to capture completed issue output."
      }
    ) : /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: docList.map((d) => {
      const theme = SOURCE_THEME[d.source] ?? SOURCE_THEME.unknown;
      return /* @__PURE__ */ jsx(KBCard, { hoverable: true, style: { padding: "12px 18px" }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
        /* @__PURE__ */ jsx(KBBadge, { bg: theme.bg, color: theme.text, children: theme.label }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: "0.875rem", fontWeight: 500, color: KB.textPrimary, flex: 1 }, children: d.title }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          d.issue && /* @__PURE__ */ jsx("span", { style: {
            fontSize: "0.75rem",
            color: KB.textTertiary,
            fontFamily: "ui-monospace, monospace"
          }, children: d.issue }),
          d.agent && /* @__PURE__ */ jsx("span", { style: { fontSize: "0.75rem", color: KB.textQuaternary }, children: d.agent })
        ] })
      ] }) }, d.id);
    }) })
  ] });
}
function KBFoldersTab({ companyId }) {
  const { data: info } = usePluginData("kb:indexed-folders", { companyId });
  const [newFolder, setNewFolder] = useState("");
  const [indexing, setIndexing] = useState(null);
  const [toast, setToast] = useState(null);
  const indexAction = usePluginAction("kb:index-folder");
  const handleIndex = useCallback(async (path) => {
    setIndexing(path);
    setToast(null);
    try {
      const res = await indexAction({ companyId, path, recursive: true });
      if (res.ok) {
        setToast({ msg: `Indexed ${res.indexed} files (${res.unchanged} unchanged, ${res.skipped} skipped)`, type: "success" });
        if (path === newFolder) setNewFolder("");
      } else {
        setToast({ msg: `Error: ${res.error}`, type: "error" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg: msg.includes("502") || msg.includes("timeout") ? "Timed out \u2014 indexing may still be running" : `Failed: ${msg}`, type: "error" });
    }
    setIndexing(null);
    setTimeout(() => setToast(null), 6e3);
  }, [companyId, indexAction, newFolder]);
  const folders = info?.watchFolders ?? [];
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs(KBCard, { style: { padding: "20px 22px", marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: KB.textTertiary, display: "flex" }, children: Icons.folder(16) }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: "0.875rem", fontWeight: 600, color: KB.textSecondary }, children: "Index a Folder" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10 }, children: [
        /* @__PURE__ */ jsx(
          KBInput,
          {
            value: newFolder,
            onChange: setNewFolder,
            placeholder: "/data/shared/accounts/Animus-Systems-SL",
            mono: true,
            style: { flex: 1 }
          }
        ),
        /* @__PURE__ */ jsx(
          KBButton,
          {
            onClick: () => {
              if (newFolder.trim()) handleIndex(newFolder.trim());
            },
            disabled: !!indexing || !newFolder.trim(),
            children: indexing === newFolder ? "Indexing..." : "Index Now"
          }
        )
      ] }),
      toast && /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx(KBToast, { message: toast.msg, type: toast.type }) })
    ] }),
    /* @__PURE__ */ jsx(
      KBSectionHeader,
      {
        title: "Watch Folders",
        count: folders.length,
        right: /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.75rem", color: KB.textQuaternary }, children: [
          info?.hashCount ?? 0,
          " files tracked"
        ] })
      }
    ),
    folders.length === 0 ? /* @__PURE__ */ jsx(
      KBEmptyState,
      {
        icon: Icons.folder(40),
        title: "No watch folders",
        description: "Configure watch folders in Agent Memory Settings to auto-index files every 6 hours."
      }
    ) : /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: folders.map((f) => /* @__PURE__ */ jsx(KBCard, { hoverable: true, style: { padding: "12px 18px" }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
      /* @__PURE__ */ jsx("span", { style: { color: KB.textTertiary, display: "flex" }, children: Icons.folder(15) }),
      /* @__PURE__ */ jsx("span", { style: {
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        fontSize: "0.825rem",
        color: KB.textPrimary,
        flex: 1
      }, children: f }),
      /* @__PURE__ */ jsx(
        KBButton,
        {
          size: "sm",
          variant: "secondary",
          onClick: () => handleIndex(f),
          disabled: !!indexing,
          children: indexing === f ? /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
            /* @__PURE__ */ jsx("span", { style: { display: "flex", animation: "spin 1s linear infinite" }, children: Icons.refresh() }),
            "Indexing"
          ] }) : /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
            Icons.refresh(),
            " Re-index"
          ] })
        }
      )
    ] }) }, f)) })
  ] });
}
function KBBriefsTab({ companyId }) {
  const { data: briefs, refresh } = usePluginData("kb:list-briefs", { companyId });
  const [expanded, setExpanded] = useState(null);
  const [issueId, setIssueId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState(null);
  const briefAction = usePluginAction("kb:generate-brief");
  const handleGenerate = useCallback(async () => {
    if (!issueId.trim()) return;
    setGenerating(true);
    setToast(null);
    try {
      const res = await briefAction({ companyId, issueId: issueId.trim() });
      if (res.ok) {
        setToast({ msg: "Brief generated successfully", type: "success" });
        setIssueId("");
        refresh();
      } else {
        setToast({ msg: `Error: ${res.error}`, type: "error" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg: msg.includes("502") || msg.includes("timeout") ? "Timed out \u2014 the brief may still be generating" : `Failed: ${msg}`, type: "error" });
    }
    setGenerating(false);
    setTimeout(() => setToast(null), 6e3);
  }, [issueId, companyId, briefAction, refresh]);
  const briefList = briefs ?? [];
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs(KBCard, { style: { padding: "20px 22px", marginBottom: 8 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: KB.purpleText, display: "flex" }, children: Icons.sparkle(16) }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: "0.875rem", fontWeight: 600, color: KB.textSecondary }, children: "Generate Executive Brief" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10 }, children: [
        /* @__PURE__ */ jsx(
          KBInput,
          {
            value: issueId,
            onChange: setIssueId,
            placeholder: "Issue ID (e.g. ANI-877)",
            mono: true,
            style: { flex: 1 },
            onKeyDown: (e) => e.key === "Enter" && handleGenerate()
          }
        ),
        /* @__PURE__ */ jsx(KBButton, { onClick: handleGenerate, disabled: generating || !issueId.trim(), children: generating ? /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
          /* @__PURE__ */ jsx("span", { style: { display: "flex", animation: "spin 1s linear infinite" }, children: Icons.refresh() }),
          "Generating..."
        ] }) : "Generate" })
      ] }),
      toast && /* @__PURE__ */ jsx("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ jsx(KBToast, { message: toast.msg, type: toast.type }) })
    ] }),
    /* @__PURE__ */ jsx(KBSectionHeader, { title: "Executive Briefs", count: briefList.length }),
    briefList.length === 0 ? /* @__PURE__ */ jsx(
      KBEmptyState,
      {
        icon: Icons.brief(40),
        title: "No briefs yet",
        description: "Generate an executive brief from a completed issue above, or enable auto-brief to generate them automatically."
      }
    ) : /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: briefList.map((b) => {
      const isExpanded = expanded === b.id;
      return /* @__PURE__ */ jsx(KBCard, { hoverable: true, onClick: () => setExpanded(isExpanded ? null : b.id), children: /* @__PURE__ */ jsxs("div", { style: { padding: "14px 18px" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
          /* @__PURE__ */ jsx(KBBadge, { bg: KB.purpleBg, color: KB.purpleText, children: "Brief" }),
          /* @__PURE__ */ jsx("span", { style: { fontSize: "0.9rem", fontWeight: 600, color: KB.textPrimary, flex: 1 }, children: b.title }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }, children: [
            b.issue && /* @__PURE__ */ jsx("span", { style: {
              fontSize: "0.75rem",
              color: KB.textTertiary,
              fontFamily: "ui-monospace, monospace"
            }, children: b.issue }),
            /* @__PURE__ */ jsx("span", { style: {
              display: "flex",
              transition: "transform 0.2s ease",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              color: KB.textQuaternary
            }, children: Icons.chevron() })
          ] })
        ] }),
        isExpanded && /* @__PURE__ */ jsx("div", { style: {
          marginTop: 14,
          padding: "16px 18px",
          borderRadius: KB.radiusSm,
          background: "rgba(0,0,0,0.15)",
          fontSize: "0.875rem",
          color: KB.textSecondary,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          maxHeight: 500,
          overflowY: "auto"
        }, children: b.cleanContent })
      ] }) }, b.id);
    }) })
  ] });
}
function KBStatsTab({ companyId }) {
  const { data: stats } = usePluginData("kb:stats", { companyId });
  const { data: folders } = usePluginData("kb:indexed-folders", { companyId });
  const { data: status } = usePluginData("memory:status", { companyId });
  const s = stats ?? { indexedIssues: 0, uploadedDocuments: 0, generatedBriefs: 0 };
  const connected = status?.memosConnected ?? false;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }, children: [
      /* @__PURE__ */ jsx(KBMetricCard, { value: s.indexedIssues, label: "Indexed Issues", icon: Icons.check(22) }),
      /* @__PURE__ */ jsx(KBMetricCard, { value: s.uploadedDocuments, label: "Documents", icon: Icons.doc(22) }),
      /* @__PURE__ */ jsx(KBMetricCard, { value: s.generatedBriefs, label: "Briefs", icon: Icons.brief(22) }),
      /* @__PURE__ */ jsx(KBMetricCard, { value: folders?.hashCount ?? 0, label: "Tracked Files", icon: Icons.folder(22) })
    ] }),
    /* @__PURE__ */ jsx(KBSectionHeader, { title: "System Status" }),
    /* @__PURE__ */ jsx(KBCard, { children: [
      {
        label: "MemOS",
        value: connected ? "Connected" : "Disconnected",
        color: connected ? KB.greenText : KB.redText,
        dot: connected ? KB.green : KB.red
      },
      {
        label: "Watch Folders",
        value: String(folders?.watchFolders?.length ?? 0),
        color: KB.textPrimary
      },
      ...s.lastIndexAt ? [{
        label: "Last Indexed",
        value: new Date(s.lastIndexAt).toLocaleString(),
        color: KB.textSecondary
      }] : [],
      ...s.lastBriefAt ? [{
        label: "Last Brief",
        value: new Date(s.lastBriefAt).toLocaleString(),
        color: KB.textSecondary
      }] : []
    ].map((row, i, arr) => /* @__PURE__ */ jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "13px 18px",
      borderBottom: i < arr.length - 1 ? `1px solid ${KB.cardBorder}` : "none"
    }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontSize: "0.85rem", color: KB.textTertiary }, children: row.label }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        "dot" in row && /* @__PURE__ */ jsx("span", { style: {
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: row.dot,
          display: "inline-block"
        } }),
        /* @__PURE__ */ jsx("span", { style: { fontSize: "0.85rem", color: row.color, fontWeight: 500 }, children: row.value })
      ] })
    ] }, row.label)) })
  ] });
}
export {
  KBDashboardWidget,
  KBPage,
  KBSidebarLink,
  MemoryAgentTab,
  MemoryDashboardWidget,
  MemorySettingsPage
};
//# sourceMappingURL=index.js.map
