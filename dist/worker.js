// src/worker.ts
import { definePlugin, startWorkerRpcHost } from "@paperclipai/plugin-sdk";

// src/worker/memos-client.ts
var MemosClient = class {
  baseUrl;
  timeoutMs;
  constructor(baseUrl, timeoutMs = 5e3) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }
  // ── Health check ────────────────────────────────────────────
  async healthy() {
    try {
      const res = await fetch(`${this.baseUrl}/docs`, {
        signal: AbortSignal.timeout(3e3)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  // ── User registration ──────────────────────────────────────
  /** Register an agent as a MemOS user. Idempotent — safe to call repeatedly. */
  async registerUser(agentId, agentName) {
    try {
      await fetch(`${this.baseUrl}/product/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: agentId,
          user_name: agentName
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
    }
  }
  // ── Store memory ───────────────────────────────────────────
  /** Store content as memory for an agent in a company cube. */
  async storeMemory(content, meta) {
    const cubeId = meta.companyId;
    const res = await fetch(`${this.baseUrl}/product/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: meta.agentId,
        writable_cube_ids: [cubeId],
        messages: [
          {
            role: "assistant",
            content: this.formatMemoryContent(content, meta)
          }
        ],
        async_mode: "sync"
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MemOS store failed (${res.status}): ${text.substring(0, 200)}`);
    }
    const data = await res.json();
    return { taskId: data?.data?.task_id };
  }
  // ── Search memories ────────────────────────────────────────
  /** Search for relevant memories by query text. */
  async searchMemories(query, agentId, companyId, topK = 5) {
    const res = await fetch(`${this.baseUrl}/product/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        user_id: agentId,
        readable_cube_ids: [companyId],
        top_k: topK,
        mode: "fast"
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!res.ok) return [];
    const body = await res.json();
    const results = [];
    const data = body.data ?? {};
    for (const [memType, entries] of Object.entries(data)) {
      if (typeof entries === "string" && entries.length > 5) {
        results.push({ id: memType, content: entries });
        continue;
      }
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const e = entry;
        for (const mem of e.memories ?? []) {
          if (mem.memory && mem.memory.length > 5) {
            results.push({
              id: mem.id ?? "",
              content: mem.memory,
              score: mem.score,
              metadata: { type: memType, ...mem.metadata ?? {} }
            });
          }
        }
      }
    }
    return results;
  }
  // ── List all memories ──────────────────────────────────────
  /** List all memories for an agent in a company cube.
   *  MemOS stores across many types (skill_mem, tool_mem, etc.) but get_all
   *  only works for text_mem/act_mem/param_mem/para_mem. So we use a broad
   *  search to capture everything. */
  async listMemories(agentId, companyId) {
    return this.searchMemories("*", agentId, companyId, 50);
  }
  // ── Get single memory ──────────────────────────────────────
  async getMemory(memoryId, agentId) {
    try {
      const res = await fetch(`${this.baseUrl}/product/get_memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: agentId,
          memory_id: memoryId
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!res.ok) return null;
      const body = await res.json();
      if (!body.data) return null;
      return {
        id: body.data.id ?? memoryId,
        content: body.data.content ?? body.data.text ?? "",
        metadata: body.data.metadata
      };
    } catch {
      return null;
    }
  }
  // ── Helpers ────────────────────────────────────────────────
  /** Format memory content with metadata tags for retrieval. */
  formatMemoryContent(content, meta) {
    const parts = [content];
    if (meta.category) parts.push(`[category: ${meta.category}]`);
    if (meta.projectId) parts.push(`[project: ${meta.projectId}]`);
    if (meta.issueId) parts.push(`[issue: ${meta.issueId}]`);
    if (meta.tags?.length) parts.push(`[tags: ${meta.tags.join(", ")}]`);
    if (meta.source) parts.push(`[source: ${meta.source}]`);
    return parts.join("\n");
  }
};

// src/worker/extractor.ts
var PATTERNS = [
  {
    category: "decision",
    confidence: 0.8,
    patterns: [
      /(?:decided|choosing|chose|went with|opted for|selected|picked)\s+(?:to\s+)?(.{15,200})/gi,
      /(?:the approach|our approach|my approach)\s+(?:is|was|will be)\s+(.{15,200})/gi,
      /(?:chose|prefer(?:red)?)\s+(.{10,150})\s+over\s+(.{10,150})/gi,
      /(?:going (?:to|with)|settling on|committing to)\s+(.{15,200})/gi
    ]
  },
  {
    category: "learning",
    confidence: 0.75,
    patterns: [
      /(?:turns? out|discovered|found out|realized|learned|it appears)\s+(?:that\s+)?(.{15,200})/gi,
      /(?:the (?:issue|problem|bug|root cause|fix|solution))\s+(?:is|was)\s+(.{15,200})/gi,
      /(?:this (?:works|worked|fails|failed) because)\s+(.{15,200})/gi,
      /(?:key (?:insight|takeaway|finding)):\s*(.{15,200})/gi,
      /(?:important(?:ly)?|notably|crucially)[:,]?\s+(.{15,200})/gi
    ]
  },
  {
    category: "fact",
    confidence: 0.7,
    patterns: [
      /(?:the (?:API|endpoint|URL|service|schema|database|table|config))\s+(?:is|uses|lives at|can be found at)\s+(.{10,200})/gi,
      /(?:located at|stored (?:in|at)|configured (?:in|via)|defined (?:in|at))\s+(.{10,200})/gi,
      /(?:the (?:password|key|token|secret|credential))\s+(?:is|for)\s+(.{10,150})/gi,
      /(?:version|port|host)\s+(?:is|=)\s+(.{5,100})/gi
    ]
  },
  {
    category: "preference",
    confidence: 0.65,
    patterns: [
      /(?:(?:the )?user|they|he|she|client|stakeholder)\s+(?:prefers?|wants?|likes?|requested|asked for)\s+(.{15,200})/gi,
      /(?:always|never|must|should)\s+(.{15,200})/gi,
      /(?:convention|standard|rule)\s+(?:is|:)\s+(.{15,200})/gi
    ]
  }
];
var MIN_TEXT_LENGTH = 100;
var MAX_EXTRACTIONS = 8;
function extractMemories(text) {
  if (text.length < MIN_TEXT_LENGTH) return [];
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  for (const group of PATTERNS) {
    for (const pattern of group.patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) && results.length < MAX_EXTRACTIONS) {
        const content = (match[1] || match[0]).trim();
        if (content.length < 15 || content.length > 300) continue;
        const key = content.toLowerCase().replace(/\s+/g, " ");
        if (seen.has(key)) continue;
        seen.add(key);
        if (/^[{[\/(]/.test(content) || /\.(ts|js|py|json|yaml|yml)$/.test(content)) continue;
        results.push({
          content,
          category: group.category,
          confidence: group.confidence
        });
      }
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_EXTRACTIONS);
}

// src/worker.ts
var DEFAULT_CONFIG = {
  enabled: true,
  memosUrl: "http://memos:8000",
  autoExtract: true,
  autoInject: true,
  maxMemoriesPerInjection: 5,
  injectionTokenBudget: 800
};
function statsKey(companyId) {
  return { scopeKind: "company", scopeId: companyId, stateKey: "memory-stats" };
}
function emptyStats() {
  return { totalStored: 0, totalInjected: 0, totalSearches: 0, byAgent: {} };
}
var plugin = definePlugin({
  async setup(ctx) {
    const rawConfig = await ctx.config.get();
    const cfg = { ...DEFAULT_CONFIG, ...rawConfig };
    const client = new MemosClient(cfg.memosUrl);
    ctx.logger.info("Agent Memory plugin starting", { memosUrl: cfg.memosUrl, autoExtract: cfg.autoExtract });
    const memosOk = await client.healthy();
    if (!memosOk) {
      ctx.logger.warn("MemOS is not reachable \u2014 memory features will be degraded", { url: cfg.memosUrl });
    } else {
      ctx.logger.info("MemOS connection OK");
    }
    async function bumpStats(companyId, agentId, field, count = 1) {
      try {
        const existing = await ctx.state.get(statsKey(companyId)) ?? emptyStats();
        if (field === "stored") {
          existing.totalStored += count;
          existing.lastStoreAt = (/* @__PURE__ */ new Date()).toISOString();
        } else if (field === "injected") {
          existing.totalInjected += count;
          existing.lastInjectAt = (/* @__PURE__ */ new Date()).toISOString();
        } else {
          existing.totalSearches += count;
        }
        if (!existing.byAgent[agentId]) existing.byAgent[agentId] = { stored: 0, injected: 0 };
        if (field === "stored") existing.byAgent[agentId].stored += count;
        if (field === "injected") existing.byAgent[agentId].injected += count;
        await ctx.state.set(statsKey(companyId), existing);
      } catch {
      }
    }
    ctx.events.on("agent.run.finished", async (event) => {
      const payload = event.payload;
      const summary = payload?.summary ?? payload?.lastMessage ?? "";
      const agentId = payload?.agentId ?? "";
      const agentName = payload?.agentName ?? "";
      const runId = payload?.runId ?? "";
      const issueId = payload?.issueId ?? "";
      const projectId = payload?.projectId ?? "";
      const companyId = event.companyId;
      if (companyId) {
        await ctx.state.set({ scopeKind: "instance", stateKey: "known-company-id" }, companyId).catch(() => {
        });
      }
      if (agentId && companyId) {
        try {
          const activityKey = { scopeKind: "company", scopeId: companyId, stateKey: "memory-activity" };
          const existing = await ctx.state.get(activityKey) ?? [];
          existing.unshift({
            agentId,
            agentName: agentName || agentId,
            runId,
            issueId,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            summaryLength: summary.length,
            hadIssue: !!issueId
          });
          await ctx.state.set(activityKey, existing.slice(0, 50));
        } catch {
        }
      }
      if (!cfg.enabled || !cfg.autoExtract) return;
      if (!summary || summary.length < 100 || !agentId) return;
      ctx.logger.info("Extracting memories from run", { agentId, runId, summaryLen: summary.length });
      await client.registerUser(agentId, agentName || agentId);
      const extracted = extractMemories(summary);
      if (extracted.length === 0) {
        ctx.logger.debug("No memories extracted from run", { runId });
        return;
      }
      let stored = 0;
      for (const mem of extracted) {
        try {
          await client.storeMemory(mem.content, {
            agentId,
            agentName: agentName || agentId,
            companyId,
            projectId: projectId || void 0,
            issueId: issueId || void 0,
            runId: runId || void 0,
            source: "auto_extract",
            category: mem.category,
            confidence: mem.confidence
          });
          stored++;
        } catch (err) {
          ctx.logger.warn("Failed to store extracted memory", { error: String(err) });
        }
      }
      if (stored > 0) {
        await bumpStats(companyId, agentId, "stored", stored);
        await ctx.activity.log({
          companyId,
          message: `Memory: extracted ${stored} memories from ${agentName || agentId}'s run`,
          entityType: "agent",
          entityId: agentId,
          metadata: { runId, extracted: stored, categories: extracted.map((m) => m.category) }
        });
        ctx.logger.info("Stored extracted memories", { agentId, stored, total: extracted.length });
      }
    });
    ctx.data.register("memory:stats", async (params) => {
      const companyId = params.companyId;
      const stats = await ctx.state.get(statsKey(companyId)) ?? emptyStats();
      try {
        const memosHealthy = await client.healthy();
        stats.memosConnected = memosHealthy;
        if (memosHealthy) {
          const agents = await ctx.agents.list({ companyId });
          let totalMemosMemories = 0;
          const agentMemoryCounts = {};
          for (const agent of agents.slice(0, 20)) {
            try {
              const mems = await client.searchMemories("*", agent.id, companyId, 50);
              if (mems.length > 0) {
                totalMemosMemories += mems.length;
                agentMemoryCounts[agent.name || agent.id] = mems.length;
              }
            } catch {
            }
          }
          stats.memosTotal = totalMemosMemories;
          stats.memosAgents = agentMemoryCounts;
        }
      } catch {
      }
      return stats;
    });
    ctx.data.register("memory:activity", async (params) => {
      const companyId = params.companyId;
      const activityKey = { scopeKind: "company", scopeId: companyId, stateKey: "memory-activity" };
      return await ctx.state.get(activityKey) ?? [];
    });
    ctx.data.register("memory:list", async (params) => {
      const companyId = params.companyId;
      const agentId = params.entityId;
      if (!agentId || !companyId) return [];
      return client.listMemories(agentId, companyId);
    });
    ctx.data.register("memory:search", async (params) => {
      const companyId = params.companyId;
      const agentId = params.entityId;
      const query = params.query;
      if (!query || !agentId || !companyId) return [];
      const results = await client.searchMemories(query, agentId, companyId, cfg.maxMemoriesPerInjection);
      await bumpStats(companyId, agentId, "searches");
      return results;
    });
    ctx.actions.register("memory:search-action", async (params) => {
      const companyId = params.companyId;
      const agentId = params.entityId;
      const query = params.query;
      if (!query || !agentId || !companyId) return [];
      const results = await client.searchMemories(query, agentId, companyId, cfg.maxMemoriesPerInjection);
      await bumpStats(companyId, agentId, "searches");
      return results;
    });
    ctx.actions.register("memory:manual-add", async (params) => {
      const companyId = params.companyId;
      const agentId = params.agentId;
      const agentName = params.agentName ?? agentId;
      const content = params.content;
      const category = params.category ?? "note";
      if (!content || !agentId || !companyId) {
        return { ok: false, error: "Missing required fields" };
      }
      await client.registerUser(agentId, agentName);
      await client.storeMemory(content, {
        agentId,
        agentName,
        companyId,
        source: "manual",
        category
      });
      await bumpStats(companyId, agentId, "stored");
      return { ok: true };
    });
    ctx.actions.register("memory:register-agent", async (params) => {
      const agentId = params.agentId;
      const agentName = params.agentName ?? agentId;
      if (!agentId) return { ok: false, error: "Missing agentId" };
      await client.registerUser(agentId, agentName);
      return { ok: true };
    });
    ctx.jobs.register("memos-health-check", async () => {
      const healthy = await client.healthy();
      let companyId = "";
      try {
        const instanceState = await ctx.state.get({ scopeKind: "instance", stateKey: "known-company-id" });
        if (instanceState && typeof instanceState === "string") companyId = instanceState;
      } catch {
      }
      if (!companyId) {
        ctx.logger.info("MemOS health check (no company context yet)", { healthy });
        return;
      }
      {
        const company = { id: companyId };
        const agents = await ctx.agents.list({ companyId });
        let totalMemories = 0;
        let agentsWithMemory = 0;
        for (const agent of agents.slice(0, 20)) {
          try {
            const mems = await client.searchMemories("*", agent.id, company.id, 50);
            if (mems.length > 0) {
              totalMemories += mems.length;
              agentsWithMemory++;
            }
          } catch {
          }
        }
        await ctx.state.set(
          { scopeKind: "company", scopeId: company.id, stateKey: "memos-status" },
          {
            memosConnected: healthy,
            memosUrl: cfg.memosUrl,
            embedderBackend: "ollama (nomic-embed-text)",
            chatProvider: "openrouter (gpt-4o-mini)",
            totalMemories,
            agentsWithMemory,
            agentsScanned: Math.min(agents.length, 20),
            totalAgents: agents.length,
            lastCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
            config: {
              autoExtract: cfg.autoExtract,
              autoInject: cfg.autoInject,
              maxMemoriesPerInjection: cfg.maxMemoriesPerInjection,
              injectionTokenBudget: cfg.injectionTokenBudget
            }
          }
        );
        await ctx.activity.log({
          companyId: company.id,
          message: `Memory health: MemOS ${healthy ? "connected" : "DOWN"} | ${totalMemories} memories | ${agentsWithMemory}/${Math.min(agents.length, 20)} agents with memory`
        });
        ctx.logger.info("MemOS health check complete", {
          healthy,
          totalMemories,
          agentsWithMemory,
          totalAgents: agents.length
        });
      }
    });
    ctx.data.register("memory:status", async (params) => {
      const companyId = params.companyId;
      const cached = await ctx.state.get(
        { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" }
      );
      if (cached) return cached;
      const healthy = await client.healthy();
      let totalMemories = 0;
      let agentsWithMemory = 0;
      let agentsScanned = 0;
      let totalAgents = 0;
      if (healthy && companyId) {
        try {
          const agents = await ctx.agents.list({ companyId });
          totalAgents = agents.length;
          for (const agent of agents.slice(0, 20)) {
            agentsScanned++;
            try {
              const mems = await client.searchMemories("*", agent.id, companyId, 50);
              if (mems.length > 0) {
                totalMemories += mems.length;
                agentsWithMemory++;
              }
            } catch {
            }
          }
        } catch {
        }
      }
      const result = {
        memosConnected: healthy,
        memosUrl: cfg.memosUrl,
        embedderBackend: "ollama (nomic-embed-text)",
        chatProvider: "openrouter (gpt-4o-mini)",
        totalMemories,
        agentsWithMemory,
        agentsScanned,
        totalAgents,
        lastCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
        config: {
          autoExtract: cfg.autoExtract,
          autoInject: cfg.autoInject,
          maxMemoriesPerInjection: cfg.maxMemoriesPerInjection,
          injectionTokenBudget: cfg.injectionTokenBudget
        }
      };
      if (companyId) {
        await ctx.state.set(
          { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" },
          result
        ).catch(() => {
        });
      }
      return result;
    });
  },
  async onHealth() {
    const healthy = await new MemosClient(DEFAULT_CONFIG.memosUrl).healthy();
    return {
      status: healthy ? "ok" : "degraded",
      message: healthy ? "MemOS connected" : "MemOS unreachable",
      details: {
        memosUrl: DEFAULT_CONFIG.memosUrl,
        memosConnected: healthy
      }
    };
  }
});
var worker_default = plugin;
startWorkerRpcHost({ plugin });
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
