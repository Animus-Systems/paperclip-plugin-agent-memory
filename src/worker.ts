import { definePlugin, startWorkerRpcHost } from "@paperclipai/plugin-sdk";
import type { PluginEvent, ScopeKey } from "@paperclipai/plugin-sdk";
import { MemosClient } from "./worker/memos-client.js";
import { extractMemories } from "./worker/extractor.js";
import type { MemoryPluginConfig, MemoryStats } from "./worker/types.js";

const DEFAULT_CONFIG: MemoryPluginConfig = {
  enabled: true,
  memosUrl: "http://memos:8000",
  autoExtract: true,
  autoInject: true,
  maxMemoriesPerInjection: 5,
  injectionTokenBudget: 800,
};

function statsKey(companyId: string): ScopeKey {
  return { scopeKind: "company", scopeId: companyId, stateKey: "memory-stats" };
}

function emptyStats(): MemoryStats {
  return { totalStored: 0, totalInjected: 0, totalSearches: 0, byAgent: {} };
}

const plugin = definePlugin({
  async setup(ctx) {
    const rawConfig = await ctx.config.get();
    const cfg: MemoryPluginConfig = { ...DEFAULT_CONFIG, ...(rawConfig as Partial<MemoryPluginConfig>) };
    const client = new MemosClient(cfg.memosUrl);

    ctx.logger.info("Agent Memory plugin starting", { memosUrl: cfg.memosUrl, autoExtract: cfg.autoExtract });

    // ── Startup health check ──────────────────────────────────
    const memosOk = await client.healthy();
    if (!memosOk) {
      ctx.logger.warn("MemOS is not reachable — memory features will be degraded", { url: cfg.memosUrl });
    } else {
      ctx.logger.info("MemOS connection OK");
    }

    // ── Helper: bump stats ────────────────────────────────────
    async function bumpStats(
      companyId: string,
      agentId: string,
      field: "stored" | "injected" | "searches",
      count = 1,
    ) {
      try {
        const existing = ((await ctx.state.get(statsKey(companyId))) ?? emptyStats()) as MemoryStats;
        if (field === "stored") {
          existing.totalStored += count;
          existing.lastStoreAt = new Date().toISOString();
        } else if (field === "injected") {
          existing.totalInjected += count;
          existing.lastInjectAt = new Date().toISOString();
        } else {
          existing.totalSearches += count;
        }
        if (!existing.byAgent[agentId]) existing.byAgent[agentId] = { stored: 0, injected: 0 };
        if (field === "stored") existing.byAgent[agentId].stored += count;
        if (field === "injected") existing.byAgent[agentId].injected += count;
        await ctx.state.set(statsKey(companyId), existing);
      } catch { /* stats are best-effort */ }
    }

    // ══════════════════════════════════════════════════════════
    // EVENT: agent.run.finished — auto-extract memories
    // ══════════════════════════════════════════════════════════
    ctx.events.on("agent.run.finished", async (event: PluginEvent) => {
      const payload = event.payload as Record<string, unknown>;
      const summary = (payload?.summary ?? payload?.lastMessage ?? "") as string;
      const agentId = (payload?.agentId ?? "") as string;
      const agentName = (payload?.agentName ?? "") as string;
      const runId = (payload?.runId ?? "") as string;
      const issueId = (payload?.issueId ?? "") as string;
      const projectId = (payload?.projectId ?? "") as string;
      const companyId = event.companyId;

      // Track every run in the activity log (whether or not we extract)
      if (companyId) {
        // Persist company ID so the health check job can use it
        await ctx.state.set({ scopeKind: "instance", stateKey: "known-company-id" }, companyId).catch(() => {});
      }
      if (agentId && companyId) {
        try {
          // Store recent activity in plugin state (ring buffer of last 50 events)
          const activityKey: ScopeKey = { scopeKind: "company", scopeId: companyId, stateKey: "memory-activity" };
          const existing = ((await ctx.state.get(activityKey)) ?? []) as Array<Record<string, unknown>>;
          existing.unshift({
            agentId,
            agentName: agentName || agentId,
            runId,
            issueId,
            timestamp: new Date().toISOString(),
            summaryLength: summary.length,
            hadIssue: !!issueId,
          });
          await ctx.state.set(activityKey, existing.slice(0, 50));
        } catch { /* best effort */ }
      }

      if (!cfg.enabled || !cfg.autoExtract) return;
      if (!summary || summary.length < 100 || !agentId) return;

      ctx.logger.info("Extracting memories from run", { agentId, runId, summaryLen: summary.length });

      // Ensure agent is registered as a MemOS user
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
            projectId: projectId || undefined,
            issueId: issueId || undefined,
            runId: runId || undefined,
            source: "auto_extract",
            category: mem.category,
            confidence: mem.confidence,
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
          metadata: { runId, extracted: stored, categories: extracted.map((m) => m.category) },
        });
        ctx.logger.info("Stored extracted memories", { agentId, stored, total: extracted.length });
      }
    });

    // ══════════════════════════════════════════════════════════
    // DATA HANDLERS — expose data to UI
    // ══════════════════════════════════════════════════════════

    /** Overview stats for the dashboard widget. */
    ctx.data.register("memory:stats", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const stats = ((await ctx.state.get(statsKey(companyId))) ?? emptyStats()) as MemoryStats;

      // Supplement with live MemOS data
      try {
        const memosHealthy = await client.healthy();
        (stats as Record<string, unknown>).memosConnected = memosHealthy;

        if (memosHealthy) {
          // Get actual memory counts from MemOS by searching broadly per agent
          const agents = await ctx.agents.list({ companyId });
          let totalMemosMemories = 0;
          const agentMemoryCounts: Record<string, number> = {};
          for (const agent of agents.slice(0, 20)) {
            try {
              const mems = await client.searchMemories("*", agent.id, companyId, 50);
              if (mems.length > 0) {
                totalMemosMemories += mems.length;
                agentMemoryCounts[agent.name || agent.id] = mems.length;
              }
            } catch { /* skip */ }
          }
          (stats as Record<string, unknown>).memosTotal = totalMemosMemories;
          (stats as Record<string, unknown>).memosAgents = agentMemoryCounts;
        }
      } catch { /* best effort */ }
      return stats;
    });

    /** Recent memory activity across all agents. */
    ctx.data.register("memory:activity", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const activityKey: ScopeKey = { scopeKind: "company", scopeId: companyId, stateKey: "memory-activity" };
      return ((await ctx.state.get(activityKey)) ?? []) as Array<Record<string, unknown>>;
    });

    /** List memories for a specific agent. */
    ctx.data.register("memory:list", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const agentId = params.entityId as string;
      if (!agentId || !companyId) return [];
      return client.listMemories(agentId, companyId);
    });

    /** Search memories for a specific agent. */
    ctx.data.register("memory:search", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const agentId = params.entityId as string;
      const query = params.query as string;
      if (!query || !agentId || !companyId) return [];
      const results = await client.searchMemories(query, agentId, companyId, cfg.maxMemoriesPerInjection);
      await bumpStats(companyId, agentId, "searches");
      return results;
    });

    // ══════════════════════════════════════════════════════════
    // ACTION HANDLERS — UI-triggered operations
    // ══════════════════════════════════════════════════════════

    /** Search memories (action handler for UI). */
    ctx.actions.register("memory:search-action", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const agentId = params.entityId as string;
      const query = params.query as string;
      if (!query || !agentId || !companyId) return [];
      const results = await client.searchMemories(query, agentId, companyId, cfg.maxMemoriesPerInjection);
      await bumpStats(companyId, agentId, "searches");
      return results;
    });

    /** Manually add a memory for an agent. */
    ctx.actions.register("memory:manual-add", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const agentId = params.agentId as string;
      const agentName = (params.agentName ?? agentId) as string;
      const content = params.content as string;
      const category = (params.category ?? "note") as string;

      if (!content || !agentId || !companyId) {
        return { ok: false, error: "Missing required fields" };
      }

      await client.registerUser(agentId, agentName);
      await client.storeMemory(content, {
        agentId,
        agentName,
        companyId,
        source: "manual",
        category: category as "note",
      });
      await bumpStats(companyId, agentId, "stored");
      return { ok: true };
    });

    /** Register an agent with MemOS (ensures user exists). */
    ctx.actions.register("memory:register-agent", async (params: Record<string, unknown>) => {
      const agentId = params.agentId as string;
      const agentName = (params.agentName ?? agentId) as string;
      if (!agentId) return { ok: false, error: "Missing agentId" };
      await client.registerUser(agentId, agentName);
      return { ok: true };
    });

    // ══════════════════════════════════════════════════════════
    // SCHEDULED JOB — MemOS health check (shows on Status page)
    // ══════════════════════════════════════════════════════════

    ctx.jobs.register("memos-health-check", async () => {
      const healthy = await client.healthy();

      // Get company ID from the last known activity, or from plugin state
      let companyId = "";
      try {
        // Check if we have any activity stored that contains a company ID
        const instanceState = await ctx.state.get({ scopeKind: "instance", stateKey: "known-company-id" });
        if (instanceState && typeof instanceState === "string") companyId = instanceState;
      } catch { /* fallback */ }

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
          } catch { /* skip */ }
        }

        // Store status snapshot in plugin state
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
            lastCheckAt: new Date().toISOString(),
            config: {
              autoExtract: cfg.autoExtract,
              autoInject: cfg.autoInject,
              maxMemoriesPerInjection: cfg.maxMemoriesPerInjection,
              injectionTokenBudget: cfg.injectionTokenBudget,
            },
          },
        );

        await ctx.activity.log({
          companyId: company.id,
          message: `Memory health: MemOS ${healthy ? "connected" : "DOWN"} | ${totalMemories} memories | ${agentsWithMemory}/${Math.min(agents.length, 20)} agents with memory`,
        });

        ctx.logger.info("MemOS health check complete", {
          healthy,
          totalMemories,
          agentsWithMemory,
          totalAgents: agents.length,
        });
      }
    }); // end job

    // ══════════════════════════════════════════════════════════
    // STATUS DATA — serves the plugin status/dashboard page
    // ══════════════════════════════════════════════════════════

    ctx.data.register("memory:status", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;

      // Check cached status first
      const cached = await ctx.state.get(
        { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" },
      );
      if (cached) return cached;

      // No cached status — do a live check and count
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
            } catch { /* skip */ }
          }
        } catch { /* agents.list may fail without capability */ }
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
        lastCheckAt: new Date().toISOString(),
        config: {
          autoExtract: cfg.autoExtract,
          autoInject: cfg.autoInject,
          maxMemoriesPerInjection: cfg.maxMemoriesPerInjection,
          injectionTokenBudget: cfg.injectionTokenBudget,
        },
      };

      // Cache it
      if (companyId) {
        await ctx.state.set(
          { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" },
          result,
        ).catch(() => {});
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
        memosConnected: healthy,
      },
    };
  },
});

export default plugin;
startWorkerRpcHost({ plugin });
