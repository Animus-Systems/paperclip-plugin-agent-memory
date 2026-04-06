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
  const tabStyle2 = (active) => ({
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
      /* @__PURE__ */ jsxs("button", { style: tabStyle2(tab === "knowledge"), onClick: () => setTab("knowledge"), children: [
        "Knowledge ",
        memories?.length ? `(${memories.length})` : ""
      ] }),
      /* @__PURE__ */ jsx("button", { style: tabStyle2(tab === "search"), onClick: () => setTab("search"), children: "Search" }),
      /* @__PURE__ */ jsx("button", { style: tabStyle2(tab === "add"), onClick: () => setTab("add"), children: "Add" })
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
        kbBriefModel: cfg.kbBriefModel ?? "deepseek/deepseek-v3.2",
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
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: String(cfg.kbBriefModel ?? "deepseek/deepseek-v3.2"), onChange: (e) => handleChange("kbBriefModel", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { ...configRow, borderBottom: "none", flexDirection: "column", alignItems: "stretch", gap: 6 }, children: [
        /* @__PURE__ */ jsx("span", { style: muted, children: "Watch folders (one per line \u2014 indexed every 6 hours)" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            style: { ...inputStyle, textAlign: "left", minHeight: 60, fontFamily: "monospace", fontSize: "0.75rem", resize: "vertical" },
            value: (cfg.kbWatchFolders ?? []).join("\n"),
            onChange: (e) => handleChange("kbWatchFolders", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)),
            placeholder: "/data/accounts/Animus-Systems-SL\n/data/github/animusystems"
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
          placeholder: "/data/accounts/Animus-Systems-SL",
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
      r.content.substring(0, 200),
      r.content.length > 200 ? "..." : ""
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
var pageBg = { padding: "1.5rem 2rem", maxWidth: 960, margin: "0 auto" };
var tabBar = { display: "flex", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 };
var tabStyle = (active) => ({
  padding: "8px 16px",
  fontSize: "0.85rem",
  fontWeight: 500,
  cursor: "pointer",
  borderBottom: active ? "2px solid rgb(99,102,241)" : "2px solid transparent",
  color: active ? "#fff" : "rgba(255,255,255,0.5)",
  background: "none",
  border: "none",
  borderBottomStyle: "solid"
});
var cardStyle = { background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 };
var rowStyle = { padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "0.85rem" };
var badgeStyle = (color) => ({ display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: "0.7rem", fontWeight: 500, background: `${color}22`, color, marginRight: 4 });
var inputCss = { padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: "0.85rem", outline: "none", width: "100%" };
var btnPrimary = { padding: "8px 18px", borderRadius: 6, border: "none", background: "rgba(99,102,241,0.3)", color: "rgb(165,168,255)", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer" };
var mutedSm = { fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" };
var SOURCE_COLORS = {
  issue_completion: "rgb(34,197,94)",
  document: "rgb(59,130,246)",
  executive_brief: "rgb(168,85,247)",
  unknown: "rgb(161,161,170)"
};
function KBPage({ context }) {
  const [tab, setTab] = useState("search");
  return /* @__PURE__ */ jsxs("div", { style: pageBg, children: [
    /* @__PURE__ */ jsx("h2", { style: { fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginBottom: 12 }, children: "Knowledge Base" }),
    /* @__PURE__ */ jsx("div", { style: tabBar, children: ["search", "documents", "folders", "briefs", "stats"].map((t) => /* @__PURE__ */ jsx("button", { style: tabStyle(tab === t), onClick: () => setTab(t), children: t.charAt(0).toUpperCase() + t.slice(1) }, t)) }),
    tab === "search" && /* @__PURE__ */ jsx(KBSearchTab, { companyId: context.companyId }),
    tab === "documents" && /* @__PURE__ */ jsx(KBDocumentsTab, { companyId: context.companyId }),
    tab === "folders" && /* @__PURE__ */ jsx(KBFoldersTab, { companyId: context.companyId }),
    tab === "briefs" && /* @__PURE__ */ jsx(KBBriefsTab, { companyId: context.companyId }),
    tab === "stats" && /* @__PURE__ */ jsx(KBStatsTab, { companyId: context.companyId })
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
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, marginBottom: 16 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          style: { ...inputCss, flex: 1, fontSize: "1rem", padding: "10px 14px" },
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && doSearch(),
          placeholder: "Search completed work, documents, briefs..."
        }
      ),
      /* @__PURE__ */ jsx("button", { style: btnPrimary, onClick: doSearch, disabled: searching, children: searching ? "Searching..." : "Search" })
    ] }),
    results !== null && results.length === 0 && /* @__PURE__ */ jsx("div", { style: { ...mutedSm, padding: 20, textAlign: "center" }, children: "No results found." }),
    results && results.map((r, i) => {
      const titleMatch = r.content.match(/\[title: ([^\]]+)\]/);
      const sourceMatch = r.content.match(/\[kb_source: ([^\]]+)\]/);
      const agentMatch = r.content.match(/\[agent: ([^\]]+)\]/);
      const issueMatch = r.content.match(/\[issue: ([^\]]+)\]/);
      const cleanContent = r.content.replace(/\[[\w_]+: [^\]]+\]/g, "").trim();
      const source = sourceMatch?.[1] ?? "unknown";
      const isExpanded = expanded === (r.id || String(i));
      return /* @__PURE__ */ jsxs("div", { style: cardStyle, children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            style: { ...rowStyle, cursor: "pointer", borderBottom: isExpanded ? "1px solid rgba(255,255,255,0.06)" : "none" },
            onClick: () => setExpanded(isExpanded ? null : r.id || String(i)),
            children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }, children: [
                /* @__PURE__ */ jsx("span", { style: badgeStyle(SOURCE_COLORS[source] ?? SOURCE_COLORS.unknown), children: source.replace("_", " ") }),
                /* @__PURE__ */ jsx("span", { style: { fontWeight: 600, color: "#fff" }, children: titleMatch?.[1] ?? "Untitled" }),
                issueMatch && /* @__PURE__ */ jsx("span", { style: mutedSm, children: issueMatch[1] }),
                agentMatch && /* @__PURE__ */ jsxs("span", { style: mutedSm, children: [
                  "by ",
                  agentMatch[1]
                ] }),
                /* @__PURE__ */ jsx("span", { style: { ...mutedSm, marginLeft: "auto" }, children: isExpanded ? "\u25BE" : "\u25B8" })
              ] }),
              !isExpanded && /* @__PURE__ */ jsxs("div", { style: { ...mutedSm, lineHeight: 1.4 }, children: [
                cleanContent.substring(0, 150),
                "..."
              ] })
            ]
          }
        ),
        isExpanded && /* @__PURE__ */ jsx("div", { style: { padding: "12px 14px", fontSize: "0.85rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto" }, children: cleanContent })
      ] }, r.id || i);
    })
  ] });
}
function KBDocumentsTab({ companyId }) {
  const { data: docs } = usePluginData("kb:list-documents", { companyId });
  const [uploadName, setUploadName] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadAction = usePluginAction("kb:upload-document");
  const handleUpload = useCallback(async () => {
    if (!uploadName.trim() || !uploadContent.trim()) return;
    setUploading(true);
    try {
      await uploadAction({ companyId, name: uploadName.trim(), content: uploadContent.trim() });
      setUploadName("");
      setUploadContent("");
    } catch {
    }
    setUploading(false);
  }, [uploadName, uploadContent, companyId, uploadAction]);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { ...cardStyle, padding: 14 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 8 }, children: "Upload Document" }),
      /* @__PURE__ */ jsx("input", { style: { ...inputCss, marginBottom: 8 }, value: uploadName, onChange: (e) => setUploadName(e.target.value), placeholder: "Document name" }),
      /* @__PURE__ */ jsx("textarea", { style: { ...inputCss, minHeight: 80, resize: "vertical", fontFamily: "monospace", fontSize: "0.8rem" }, value: uploadContent, onChange: (e) => setUploadContent(e.target.value), placeholder: "Paste document content here..." }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: 8 }, children: /* @__PURE__ */ jsx("button", { style: btnPrimary, onClick: handleUpload, disabled: uploading || !uploadName.trim() || !uploadContent.trim(), children: uploading ? "Uploading..." : "Upload" }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginTop: 16, marginBottom: 8 }, children: [
      (docs ?? []).length,
      " documents indexed"
    ] }),
    (docs ?? []).map((d) => /* @__PURE__ */ jsxs("div", { style: { ...rowStyle, display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx("span", { style: badgeStyle(SOURCE_COLORS[d.source] ?? SOURCE_COLORS.unknown), children: d.source.replace("_", " ") }),
      /* @__PURE__ */ jsx("span", { style: { fontWeight: 500, color: "#fff", flex: 1 }, children: d.title }),
      d.issue && /* @__PURE__ */ jsx("span", { style: mutedSm, children: d.issue }),
      d.agent && /* @__PURE__ */ jsx("span", { style: mutedSm, children: d.agent })
    ] }, d.id))
  ] });
}
function KBFoldersTab({ companyId }) {
  const { data: info } = usePluginData("kb:indexed-folders", { companyId });
  const [newFolder, setNewFolder] = useState("");
  const [indexing, setIndexing] = useState(null);
  const indexAction = usePluginAction("kb:index-folder");
  const handleIndex = useCallback(async (path) => {
    setIndexing(path);
    try {
      const res = await indexAction({ companyId, path, recursive: true });
      alert(res.ok ? `Indexed ${res.indexed} new files (${res.unchanged} unchanged, ${res.skipped} skipped)` : `Error: ${res.error}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : String(err);
      alert(`Failed: ${msg.includes("502") || msg.includes("timeout") ? "Timed out \u2014 the brief may still be generating. Check back shortly." : msg}`);
    }
    setIndexing(null);
  }, [companyId, indexAction]);
  const folders = info?.watchFolders ?? [];
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { ...cardStyle, padding: 14 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 8 }, children: "Index a Folder" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx("input", { style: { ...inputCss, flex: 1 }, value: newFolder, onChange: (e) => setNewFolder(e.target.value), placeholder: "/data/accounts/Animus-Systems-SL" }),
        /* @__PURE__ */ jsx("button", { style: btnPrimary, onClick: () => {
          if (newFolder.trim()) handleIndex(newFolder.trim());
        }, disabled: !!indexing || !newFolder.trim(), children: indexing === newFolder ? "Indexing..." : "Index Now" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginTop: 16, marginBottom: 8 }, children: [
      "Watch Folders (",
      folders.length,
      ") \xB7 ",
      info?.hashCount ?? 0,
      " files tracked"
    ] }),
    folders.length === 0 ? /* @__PURE__ */ jsx("div", { style: { ...mutedSm, padding: 12 }, children: "No watch folders configured. Add them in Agent Memory Settings." }) : folders.map((f) => /* @__PURE__ */ jsxs("div", { style: { ...rowStyle, display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsx("span", { style: { fontFamily: "monospace", fontSize: "0.8rem", color: "#fff", flex: 1 }, children: f }),
      /* @__PURE__ */ jsx(
        "button",
        {
          style: { ...btnPrimary, padding: "4px 12px", fontSize: "0.75rem" },
          onClick: () => handleIndex(f),
          disabled: !!indexing,
          children: indexing === f ? "..." : "Re-index"
        }
      )
    ] }, f))
  ] });
}
function KBBriefsTab({ companyId }) {
  const { data: briefs } = usePluginData("kb:list-briefs", { companyId });
  const [expanded, setExpanded] = useState(null);
  const [issueId, setIssueId] = useState("");
  const [generating, setGenerating] = useState(false);
  const briefAction = usePluginAction("kb:generate-brief");
  const handleGenerate = useCallback(async () => {
    if (!issueId.trim()) return;
    setGenerating(true);
    try {
      const res = await briefAction({ companyId, issueId: issueId.trim() });
      if (res.ok) {
        alert("Brief generated successfully!");
        setIssueId("");
      } else {
        alert(`Error: ${res.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : String(err);
      alert(`Failed: ${msg.includes("502") || msg.includes("timeout") ? "Timed out \u2014 the brief may still be generating. Check back shortly." : msg}`);
    }
    setGenerating(false);
  }, [issueId, companyId, briefAction]);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { style: { ...cardStyle, padding: 14 }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 8 }, children: "Generate Executive Brief" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx("input", { style: { ...inputCss, flex: 1 }, value: issueId, onChange: (e) => setIssueId(e.target.value), placeholder: "Issue ID (e.g. ANI-877)" }),
        /* @__PURE__ */ jsx("button", { style: btnPrimary, onClick: handleGenerate, disabled: generating || !issueId.trim(), children: generating ? "Generating..." : "Generate" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.6)", marginTop: 16, marginBottom: 8 }, children: [
      (briefs ?? []).length,
      " executive briefs"
    ] }),
    (briefs ?? []).map((b) => {
      const isExpanded = expanded === b.id;
      return /* @__PURE__ */ jsxs("div", { style: cardStyle, children: [
        /* @__PURE__ */ jsx("div", { style: { ...rowStyle, cursor: "pointer" }, onClick: () => setExpanded(isExpanded ? null : b.id), children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ jsx("span", { style: badgeStyle("rgb(168,85,247)"), children: "brief" }),
          /* @__PURE__ */ jsx("span", { style: { fontWeight: 500, color: "#fff" }, children: b.title }),
          b.issue && /* @__PURE__ */ jsx("span", { style: mutedSm, children: b.issue }),
          /* @__PURE__ */ jsx("span", { style: { ...mutedSm, marginLeft: "auto" }, children: isExpanded ? "\u25BE" : "\u25B8" })
        ] }) }),
        isExpanded && /* @__PURE__ */ jsx("div", { style: { padding: "12px 14px", fontSize: "0.85rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 500, overflowY: "auto" }, children: b.content })
      ] }, b.id);
    })
  ] });
}
function KBStatsTab({ companyId }) {
  const { data: stats } = usePluginData("kb:stats", { companyId });
  const { data: folders } = usePluginData("kb:indexed-folders", { companyId });
  const { data: status } = usePluginData("memory:status", { companyId });
  const s = stats ?? { indexedIssues: 0, uploadedDocuments: 0, generatedBriefs: 0 };
  const connected = status?.memosConnected ?? false;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }, children: [
      { label: "Indexed Issues", value: s.indexedIssues },
      { label: "Documents", value: s.uploadedDocuments },
      { label: "Briefs", value: s.generatedBriefs },
      { label: "Tracked Files", value: folders?.hashCount ?? 0 }
    ].map((item) => /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", padding: 14, ...cardStyle }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: "1.5rem", fontWeight: 700, color: "#fff" }, children: item.value }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }, children: item.label })
    ] }, item.label)) }),
    /* @__PURE__ */ jsxs("div", { style: cardStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: rowStyle, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "rgba(255,255,255,0.5)" }, children: "MemOS" }),
        /* @__PURE__ */ jsx("span", { style: { float: "right", color: connected ? "rgb(34,197,94)" : "rgb(239,68,68)" }, children: connected ? "Connected" : "Disconnected" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: rowStyle, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "rgba(255,255,255,0.5)" }, children: "Watch Folders" }),
        /* @__PURE__ */ jsx("span", { style: { float: "right", color: "#fff" }, children: folders?.watchFolders?.length ?? 0 })
      ] }),
      s.lastIndexAt && /* @__PURE__ */ jsxs("div", { style: rowStyle, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "rgba(255,255,255,0.5)" }, children: "Last Indexed" }),
        /* @__PURE__ */ jsx("span", { style: { float: "right", color: "#fff" }, children: new Date(s.lastIndexAt).toLocaleString() })
      ] }),
      s.lastBriefAt && /* @__PURE__ */ jsxs("div", { style: { ...rowStyle, borderBottom: "none" }, children: [
        /* @__PURE__ */ jsx("span", { style: { color: "rgba(255,255,255,0.5)" }, children: "Last Brief" }),
        /* @__PURE__ */ jsx("span", { style: { float: "right", color: "#fff" }, children: new Date(s.lastBriefAt).toLocaleString() })
      ] })
    ] })
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
