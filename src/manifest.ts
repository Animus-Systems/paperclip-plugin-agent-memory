import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "animusystems.agent-memory",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Agent Memory",
  description:
    "Persistent memory across agent runs via MemOS — auto-injects context, auto-extracts learnings.",
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
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
  ],

  instanceConfigSchema: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        title: "Enable Memory",
        default: true,
      },
      memosUrl: {
        type: "string",
        title: "MemOS URL",
        description: "Internal Docker hostname for the MemOS service",
        default: "http://memos:8000",
      },
      autoExtract: {
        type: "boolean",
        title: "Auto-Extract Memories",
        description: "Automatically extract learnings from completed agent runs",
        default: true,
      },
      autoInject: {
        type: "boolean",
        title: "Auto-Inject Memories",
        description:
          "Automatically inject relevant memories into agent system prompts (requires adapter support)",
        default: true,
      },
      maxMemoriesPerInjection: {
        type: "number",
        title: "Max Memories Per Injection",
        description: "Maximum number of memories to inject into a prompt",
        default: 5,
      },
      injectionTokenBudget: {
        type: "number",
        title: "Injection Token Budget",
        description: "Approximate max tokens for injected memory context",
        default: 800,
      },
    },
  },

  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },

  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "memory-overview",
        displayName: "Agent Memory",
        exportName: "MemoryDashboardWidget",
      },
      {
        type: "detailTab",
        id: "memory-agent-tab",
        displayName: "Memory",
        exportName: "MemoryAgentTab",
        entityTypes: ["agent"],
        order: 25,
      },
      {
        type: "settingsPage",
        id: "memory-settings",
        displayName: "Agent Memory Settings",
        exportName: "MemorySettingsPage",
      },
    ],
  },

  jobs: [
    {
      jobKey: "memos-health-check",
      displayName: "MemOS Health Check",
      description: "Checks MemOS connectivity, collects memory stats, and logs status",
      schedule: "*/5 * * * *",
    },
  ],
};

export default manifest;
