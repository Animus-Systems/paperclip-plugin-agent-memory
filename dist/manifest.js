// src/manifest.ts
var manifest = {
  id: "animusystems.agent-memory",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Agent Memory",
  description: "Persistent memory + Knowledge Base via MemOS \u2014 auto-extracts learnings, indexes completed work, generates executive briefs.",
  author: "Animus Systems",
  categories: ["automation", "connector"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "agents.read",
    "issues.read",
    "projects.read",
    "http.outbound",
    "activity.log.write",
    "jobs.schedule",
    "agent.tools.register",
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
    "instance.settings.register"
  ],
  tools: [
    {
      name: "recall_memories",
      displayName: "Recall Memories",
      description: "Search for relevant context from previous runs stored in long-term memory. Use at the start of a task to check for prior decisions, learnings, or facts. Also useful mid-task when you need context about people, projects, or past work.",
      parametersSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for \u2014 describe the context you need (e.g., 'previous campaign results for client X')"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "search_knowledge",
      displayName: "Search Knowledge Base",
      description: "Search completed work, research reports, and company documents. Use when you need context from prior completed tasks, audits, or uploaded reference material.",
      parametersSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for \u2014 describe what context you need"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "store_memory",
      displayName: "Store Memory",
      description: "Save an important learning, decision, or fact to long-term memory for future runs. Use when you discover something that should persist \u2014 decisions made, facts found, approaches that worked or failed.",
      parametersSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The memory to save (a clear, self-contained statement)"
          },
          category: {
            type: "string",
            description: "Memory type",
            enum: ["decision", "learning", "fact", "preference", "note"]
          }
        },
        required: ["content"]
      }
    }
  ],
  instanceConfigSchema: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        title: "Enable Memory",
        default: true
      },
      memosUrl: {
        type: "string",
        title: "MemOS URL",
        description: "Internal Docker hostname for the MemOS service",
        default: "http://memos:8000"
      },
      autoExtract: {
        type: "boolean",
        title: "Auto-Extract Memories",
        description: "Automatically extract learnings from completed agent runs",
        default: true
      },
      autoInject: {
        type: "boolean",
        title: "Auto-Inject Memories",
        description: "Automatically inject relevant memories into agent system prompts (requires adapter support)",
        default: true
      },
      maxMemoriesPerInjection: {
        type: "number",
        title: "Max Memories Per Injection",
        description: "Maximum number of memories to inject into a prompt",
        default: 5
      },
      injectionTokenBudget: {
        type: "number",
        title: "Injection Token Budget",
        description: "Approximate max tokens for injected memory context",
        default: 800
      },
      extractionMode: {
        type: "string",
        title: "Extraction Mode",
        description: "How to extract memories: rule_based (free), llm (uses API), or hybrid (rule-based first, LLM fallback)",
        enum: ["rule_based", "llm", "hybrid"],
        default: "hybrid"
      },
      llmExtractionModel: {
        type: "string",
        title: "LLM Extraction Model",
        description: "OpenRouter model for LLM extraction (only used in llm/hybrid mode)",
        default: "openai/gpt-4o-mini"
      },
      llmFallbackModel: {
        type: "string",
        title: "Fallback model (used when primary hits rate limits)",
        default: "google/gemini-2.5-flash"
      },
      kbAutoIndex: {
        type: "boolean",
        title: "Auto-Index Completed Issues",
        description: "Automatically index issue output into the Knowledge Base when issues are marked done",
        default: true
      },
      kbAutoBreif: {
        type: "boolean",
        title: "Auto-Generate Executive Briefs",
        description: "Automatically generate executive briefs when decomposed tasks (with subtasks) complete",
        default: true
      },
      kbBriefModel: {
        type: "string",
        title: "Brief Generation Model",
        description: "OpenRouter model for compiling executive briefs",
        default: "deepseek/deepseek-v3.2"
      }
    }
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "memory-overview",
        displayName: "Agent Memory",
        exportName: "MemoryDashboardWidget"
      },
      {
        type: "detailTab",
        id: "memory-agent-tab",
        displayName: "Memory",
        exportName: "MemoryAgentTab",
        entityTypes: ["agent"],
        order: 25
      },
      {
        type: "dashboardWidget",
        id: "kb-overview",
        displayName: "Knowledge Base",
        exportName: "KBDashboardWidget"
      },
      {
        type: "settingsPage",
        id: "memory-settings",
        displayName: "Agent Memory Settings",
        exportName: "MemorySettingsPage"
      }
    ]
  },
  jobs: [
    {
      jobKey: "memos-health-check",
      displayName: "MemOS Health Check",
      description: "Checks MemOS connectivity, collects memory stats, and logs status",
      schedule: "*/5 * * * *"
    },
    {
      jobKey: "autodream-consolidate",
      displayName: "AutoDream Consolidation",
      description: "Daily memory consolidation \u2014 deduplicates, prunes stale memories, promotes cross-agent facts",
      schedule: "0 3 * * *"
    }
  ]
};
var manifest_default = manifest;
export {
  manifest_default as default
};
//# sourceMappingURL=manifest.js.map
