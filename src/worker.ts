import { definePlugin, startWorkerRpcHost } from "@paperclipai/plugin-sdk";
import type { PluginEvent, ScopeKey } from "@paperclipai/plugin-sdk";
import { MemosClient } from "./worker/memos-client.js";
import { extractMemories } from "./worker/extractor.js";
import { extractMemoriesWithLlm } from "./worker/llm-extractor.js";
import { consolidateAgent, findCrossAgentFacts } from "./worker/consolidator.js";
import type { MemoryPluginConfig, MemoryStats, Memory, KBStats } from "./worker/types.js";
import { generateExecutiveBrief } from "./worker/brief-generator.js";
import { parseFile, isSupportedFile, ensurePythonDeps } from "./worker/file-parser.js";
import { parseKBMemory } from "./worker/kb-utils.js";
import { scanAndRedact, isSensitiveFile, formatDetectionSummary } from "./worker/sanitizer.js";

const DEFAULT_CONFIG: MemoryPluginConfig = {
  enabled: true,
  memosUrl: "http://memos:8000",
  autoExtract: true,
  autoInject: true,
  maxMemoriesPerInjection: 5,
  injectionTokenBudget: 800,
  extractionMode: "hybrid",
  llmExtractionModel: "mistralai/mistral-small-3.2-24b-instruct",
  llmFallbackModel: "google/gemini-2.5-flash",
  kbAutoIndex: true,
  kbAutoBreif: true,
  kbBriefModel: "google/gemini-2.5-flash",
  kbWatchFolders: [],
};

function kbStatsKey(companyId: string): ScopeKey {
  return { scopeKind: "company", scopeId: companyId, stateKey: "kb-stats" };
}

function emptyKBStats(): KBStats {
  return { indexedIssues: 0, uploadedDocuments: 0, generatedBriefs: 0 };
}

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

    // Ensure Python parsing deps are available for KB file ingestion
    ensurePythonDeps();

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
    // AGENT TOOLS — recall_memories + store_memory
    // ══════════════════════════════════════════════════════════

    ctx.tools.register(
      "recall_memories",
      {
        displayName: "Recall Memories",
        description:
          "Search for relevant context from previous runs stored in long-term memory.",
        parametersSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to search for" },
          },
          required: ["query"],
        },
      },
      async (params, runCtx) => {
        const { query } = params as { query?: string };
        if (!query) return { content: "Error: query is required" };

        const agentId = runCtx.agentId;
        const companyId = runCtx.companyId;

        try {
          const results = await client.searchMemories(query, agentId, companyId, cfg.maxMemoriesPerInjection);
          await bumpStats(companyId, agentId, "searches");

          if (results.length === 0) {
            return { content: "No relevant memories found." };
          }

          const formatted = results
            .slice(0, cfg.maxMemoriesPerInjection)
            .map((m, i) => `${i + 1}. ${m.content.substring(0, 500)}`)
            .join("\n\n");

          await bumpStats(companyId, agentId, "injected", results.length);
          ctx.logger.info("Recalled memories for agent", { agentId, query: query.substring(0, 80), count: results.length });

          return {
            content: `## Memories matching "${query.substring(0, 60)}"\n${formatted}`,
            data: { count: results.length, agentId },
          };
        } catch (err) {
          ctx.logger.warn("Memory recall failed", { error: String(err) });
          return { content: `Memory search failed: ${String(err).substring(0, 200)}` };
        }
      },
    );

    ctx.tools.register(
      "store_memory",
      {
        displayName: "Store Memory",
        description:
          "Save an important learning, decision, or fact to long-term memory for future runs.",
        parametersSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "The memory to save" },
            category: { type: "string", enum: ["decision", "learning", "fact", "preference", "note"] },
          },
          required: ["content"],
        },
      },
      async (params, runCtx) => {
        const { content, category } = params as { content?: string; category?: string };
        if (!content) return { content: "Error: content is required" };

        const agentId = runCtx.agentId;
        const companyId = runCtx.companyId;

        try {
          // Ensure agent is registered
          const agents = await ctx.agents.list({ companyId });
          const agent = agents.find((a) => a.id === agentId);
          const agentName = agent?.name || agentId;

          await client.registerUser(agentId, agentName);
          await client.storeMemory(content, {
            agentId,
            agentName,
            companyId,
            projectId: runCtx.projectId || undefined,
            source: "agent_tool",
            category: (category as "decision" | "learning" | "fact" | "preference" | "note") || "note",
          });

          await bumpStats(companyId, agentId, "stored");
          ctx.logger.info("Agent stored memory", { agentId, category, contentLen: content.length });

          return {
            content: `Memory saved: "${content.substring(0, 100)}"`,
            data: { agentId, category: category || "note" },
          };
        } catch (err) {
          ctx.logger.warn("Memory store failed", { error: String(err) });
          return { content: `Failed to save memory: ${String(err).substring(0, 200)}` };
        }
      },
    );

    // ══════════════════════════════════════════════════════════
    // AGENT TOOL — search_knowledge (Knowledge Base)
    // ══════════════════════════════════════════════════════════

    ctx.tools.register(
      "search_knowledge",
      {
        displayName: "Search Knowledge Base",
        description:
          "Search completed work, research reports, and company documents. " +
          "Use when you need context from prior completed tasks, audits, or uploaded reference material.",
        parametersSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to search for" },
          },
          required: ["query"],
        },
      },
      async (params, runCtx) => {
        const { query } = params as { query?: string };
        if (!query) return { content: "Error: query is required" };

        const companyId = runCtx.companyId;
        try {
          const results = await client.searchKnowledge(query, companyId, 8);
          if (results.length === 0) {
            return { content: "No knowledge base entries found for that query." };
          }

          const formatted = results
            .slice(0, 8)
            .map((m, i) => `${i + 1}. ${m.content.substring(0, 600)}`)
            .join("\n\n");

          ctx.logger.info("KB search", { query: query.substring(0, 80), results: results.length });
          return {
            content: `## Knowledge Base results for "${query.substring(0, 60)}"\n${formatted}`,
            data: { count: results.length },
          };
        } catch (err) {
          ctx.logger.warn("KB search failed", { error: String(err) });
          return { content: `Knowledge base search failed: ${String(err).substring(0, 200)}` };
        }
      },
    );

    // ══════════════════════════════════════════════════════════
    // AGENT TOOL — index_folder (Knowledge Base)
    // ══════════════════════════════════════════════════════════

    ctx.tools.register(
      "index_folder",
      {
        displayName: "Index Folder",
        description:
          "Index all documents in a folder into the Knowledge Base. " +
          "Supports PDF, DOCX, XLSX, CSV, markdown, HTML, text files. " +
          "Use to make project files searchable via search_knowledge.",
        parametersSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute folder path to index (e.g. /data/shared/accounts/Animus-Systems-SL)" },
            recursive: { type: "boolean", description: "Include subfolders (default: true)" },
          },
          required: ["path"],
        },
      },
      async (params, runCtx) => {
        const folderPath = (params as { path: string }).path;
        const recursive = (params as { recursive?: boolean }).recursive !== false;
        const companyId = runCtx.companyId;

        try {
          const result = await indexFolder(folderPath, companyId, recursive);
          ctx.logger.info("KB: folder indexed via agent tool", { folderPath, ...result });
          return {
            content: `Indexed ${result.indexed} new files from ${folderPath} (${result.unchanged} unchanged, ${result.skipped} skipped, ${result.errors} errors). Formats: ${Object.entries(result.byFormat).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
            data: result,
          };
        } catch (err) {
          return { content: `Error indexing folder: ${String(err).substring(0, 200)}` };
        }
      },
    );

    /** Shared folder indexing logic used by both agent tool and action handler. */
    async function indexFolder(folderPath: string, companyId: string, recursive: boolean) {
      const { readdir, stat, readFile: readFileRaw } = await import("node:fs/promises");
      const { join, basename } = await import("node:path");
      const { createHash } = await import("node:crypto");

      // Load existing file hash manifest
      const manifestKey: ScopeKey = { scopeKind: "company", scopeId: companyId, stateKey: "kb-file-hashes" };
      const hashManifest = ((await ctx.state.get(manifestKey)) ?? {}) as Record<string, string>;

      const files: string[] = [];
      async function walk(dir: string) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory() && recursive && !entry.name.startsWith(".") && entry.name !== "node_modules") {
            await walk(full);
          } else if (entry.isFile() && isSupportedFile(full) && !isSensitiveFile(full)) {
            files.push(full);
          }
        }
      }
      await walk(folderPath);

      let indexed = 0;
      let skipped = 0;
      let unchanged = 0;
      let errors = 0;
      const byFormat: Record<string, number> = {};

      for (const filePath of files) {
        try {
          const fileStat = await stat(filePath);
          if (fileStat.size > 10 * 1024 * 1024) { skipped++; continue; }
          if (fileStat.size < 10) { skipped++; continue; }

          // Hash file content and skip if unchanged
          const raw = await readFileRaw(filePath);
          const hash = createHash("md5").update(raw).digest("hex");
          if (hashManifest[filePath] === hash) { unchanged++; continue; }

          const result = await parseFile(filePath);
          if (result.text.length < 20) { skipped++; continue; }

          // Sanitize content before storing
          const scan = scanAndRedact(result.text);
          if (scan.hasSensitiveData) {
            ctx.logger.warn(`KB: redacted sensitive data in ${filePath}: ${formatDetectionSummary(scan.detections)}`);
          }
          const safeText = scan.redactedContent;

          const name = basename(filePath);
          await client.storeKnowledgeEntry(safeText.substring(0, 8000), {
            companyId,
            title: name,
            source: "document",
            tags: [result.format, "folder-index"],
          });

          hashManifest[filePath] = hash;
          indexed++;
          byFormat[result.format] = (byFormat[result.format] ?? 0) + 1;
        } catch {
          errors++;
        }
      }

      // Persist updated hash manifest
      await ctx.state.set(manifestKey, hashManifest);

      // Update KB stats
      if (indexed > 0) {
        const kbStats = ((await ctx.state.get(kbStatsKey(companyId))) ?? emptyKBStats()) as KBStats;
        kbStats.uploadedDocuments += indexed;
        await ctx.state.set(kbStatsKey(companyId), kbStats);
      }

      await ctx.activity.log({
        companyId,
        message: `KB: indexed ${indexed} new files from ${folderPath} (${unchanged} unchanged, ${skipped} skipped, ${errors} errors)`,
      });

      return { indexed, unchanged, skipped, errors, total: files.length, byFormat };
    }

    // ══════════════════════════════════════════════════════════
    // EVENT: issue.updated — auto-index completed work into KB
    // ══════════════════════════════════════════════════════════

    ctx.events.on("issue.updated", async (event: PluginEvent) => {
      if (!cfg.enabled || !cfg.kbAutoIndex) return;

      const payload = event.payload as Record<string, unknown>;
      const status = payload?.status as string;
      if (status !== "done") return;

      const companyId = event.companyId;
      const issueId = event.entityId || (payload?.entityId ?? payload?.issueId ?? "") as string;
      const identifier = (payload?.identifier ?? "") as string;
      if (!issueId || !companyId) return;

      ctx.logger.info("KB: indexing completed issue", { issueId, identifier });

      try {
        // Fetch issue details + comments via SDK
        const issue = await (ctx.issues as any).get(issueId, companyId) as Record<string, unknown> | null;
        if (!issue) return;

        let comments: Array<Record<string, unknown>> = [];
        try {
          comments = (await (ctx.issues as any).listComments(issueId, companyId)) as Array<Record<string, unknown>>;
        } catch { /* */ }

        // Get agent name
        let agentName = "";
        if (issue.assigneeAgentId) {
          try {
            const agents = await ctx.agents.list({ companyId });
            agentName = agents.find((a) => a.id === issue.assigneeAgentId)?.name || "";
          } catch { /* best effort */ }
        }

        // Build KB content from final comments (last 3 substantive agent comments)
        const agentComments = comments
          .filter((c) => c.authorAgentId && (c.body as string).length > 100)
          .slice(-3);

        if (agentComments.length === 0 && (!issue.description || (issue.description as string).length < 50)) {
          ctx.logger.debug("KB: no substantial content to index", { issueId });
          return;
        }

        const rawContent = [
          `# ${issue.identifier || issueId}: ${issue.title || "Untitled"}`,
          "",
          issue.description ? `## Task Description\n${(issue.description as string).substring(0, 1000)}` : "",
          "",
          ...agentComments.map((c) => (c.body as string).substring(0, 2000)),
        ].filter(Boolean).join("\n\n");

        // Sanitize before storing
        const issueScan = scanAndRedact(rawContent);
        if (issueScan.hasSensitiveData) {
          ctx.logger.warn(`KB: redacted sensitive data from issue ${issue.identifier}: ${formatDetectionSummary(issueScan.detections)}`);
        }
        const content = issueScan.redactedContent;

        await client.storeKnowledgeEntry(content, {
          companyId,
          title: `${issue.identifier || ""} ${issue.title || ""}`.trim(),
          source: "issue_completion",
          issueId: issue.id as string,
          issueIdentifier: issue.identifier as string,
          projectId: issue.projectId as string,
          agentId: issue.assigneeAgentId as string,
          agentName,
        });

        // Bump KB stats
        const kbStats = ((await ctx.state.get(kbStatsKey(companyId))) ?? emptyKBStats()) as KBStats;
        kbStats.indexedIssues++;
        kbStats.lastIndexAt = new Date().toISOString();
        await ctx.state.set(kbStatsKey(companyId), kbStats);

        await ctx.activity.log({
          companyId,
          message: `KB: indexed ${issue.identifier || issueId} "${(issue.title || "").substring(0, 60)}" by ${agentName || "unknown"}`,
          entityType: "issue",
          entityId: issueId,
        });

        ctx.logger.info("KB: indexed issue", { issueId, identifier: issue.identifier, contentLen: content.length });

        // ── Auto-generate executive brief for synthesis issues ──
        if (cfg.kbAutoBreif && issue.parentId) {
          // This is a subtask — check if all siblings are done (parent synthesis)
          // Skip: briefs are triggered on the parent closing, not subtask
        }
        if (cfg.kbAutoBreif && !issue.parentId) {
          // Check if this is a parent with completed subtasks
          try {
            const childrenRes = await fetch(
              `http://localhost:${port}/api/companies/${companyId}/issues?parentId=${issueId}`,
              { headers, signal: AbortSignal.timeout(5000) },
            );
            if (childrenRes.ok) {
              const children = await childrenRes.json() as Array<{ id: string; identifier?: string; title?: string; status?: string }>;
              if (children.length > 0 && children.every((c) => c.status === "done" || c.status === "cancelled")) {
                // All subtasks complete — generate executive brief
                ctx.logger.info("KB: generating executive brief for synthesis", { issueId, subtasks: children.length });

                const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
                if (apiKey) {
                  // Collect subtask outputs
                  const subtaskOutputs: Array<{ identifier: string; title: string; content: string }> = [];
                  for (const child of children.filter((c) => c.status === "done")) {
                    try {
                      const childCommentsRes = await fetch(
                        `http://localhost:${port}/api/issues/${child.id}/comments`,
                        { headers, signal: AbortSignal.timeout(5000) },
                      );
                      if (childCommentsRes.ok) {
                        const childComments = await childCommentsRes.json() as Array<{ body: string; authorAgentId?: string }>;
                        const lastAgentComment = childComments.filter((c) => c.authorAgentId).pop();
                        subtaskOutputs.push({
                          identifier: child.identifier || child.id.substring(0, 8),
                          title: child.title || "Untitled",
                          content: lastAgentComment?.body.substring(0, 3000) || "(no output)",
                        });
                      }
                    } catch { /* skip */ }
                  }

                  if (subtaskOutputs.length > 0) {
                    const briefResult = await generateExecutiveBrief({
                      parentTitle: (issue.title || "Untitled") as string,
                      parentIdentifier: (issue.identifier || issueId) as string,
                      subtasks: subtaskOutputs,
                      apiKey,
                      baseUrl: "https://openrouter.ai/api/v1",
                      model: cfg.kbBriefModel,
                    });
                    const brief = briefResult.brief;

                    if (brief) {
                      // Store brief in KB
                      await client.storeKnowledgeEntry(brief, {
                        companyId,
                        title: `Executive Brief: ${issue.identifier || ""} ${issue.title || ""}`.trim(),
                        source: "executive_brief",
                        issueId: issue.id,
                        issueIdentifier: issue.identifier,
                        projectId: issue.projectId,
                        agentId: issue.assigneeAgentId,
                        agentName,
                      });

                      // Post brief as comment on the parent issue
                      try {
                        await fetch(`http://localhost:${port}/api/issues/${issueId}/comments`, {
                          method: "POST",
                          headers,
                          body: JSON.stringify({ body: brief }),
                          signal: AbortSignal.timeout(10000),
                        });
                      } catch { /* best effort */ }

                      kbStats.generatedBriefs++;
                      kbStats.lastBriefAt = new Date().toISOString();
                      await ctx.state.set(kbStatsKey(companyId), kbStats);

                      await ctx.activity.log({
                        companyId,
                        message: `KB: generated executive brief for ${issue.identifier || issueId} (${subtaskOutputs.length} subtasks)`,
                        entityType: "issue",
                        entityId: issueId,
                      });

                      ctx.logger.info("KB: executive brief generated", { issueId, subtasks: subtaskOutputs.length, briefLen: brief.length });
                    }
                  }
                }
              }
            }
          } catch (err) {
            ctx.logger.warn("KB: brief generation failed", { issueId, error: String(err) });
          }
        }
      } catch (err) {
        ctx.logger.warn("KB: failed to index issue", { issueId, error: String(err) });
      }
    });

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

      ctx.logger.info("Extracting memories from run", { agentId, runId, summaryLen: summary.length, mode: cfg.extractionMode });

      // Ensure agent is registered as a MemOS user
      await client.registerUser(agentId, agentName || agentId);

      // ── Extraction based on configured mode ─────────────────
      let extracted = cfg.extractionMode === "llm" ? [] : extractMemories(summary);

      if (cfg.extractionMode === "llm" || (cfg.extractionMode === "hybrid" && extracted.length < 2 && summary.length > 500)) {
        // LLM extraction — either primary or fallback
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
        if (apiKey) {
          const llmExtracted = await extractMemoriesWithLlm(summary, {
            apiKey,
            baseUrl: "https://openrouter.ai/api/v1",
            model: cfg.llmExtractionModel,
            fallbackModel: cfg.llmFallbackModel,
          });
          if (llmExtracted.length > 0) {
            ctx.logger.info("LLM extraction yielded memories", { count: llmExtracted.length, fallback: cfg.extractionMode === "hybrid" });
            // In hybrid mode, merge (LLM results augment rule-based, deduplicated by content similarity)
            if (cfg.extractionMode === "hybrid" && extracted.length > 0) {
              const existingKeys = new Set(extracted.map((m) => m.content.toLowerCase().substring(0, 60)));
              for (const llmMem of llmExtracted) {
                const key = llmMem.content.toLowerCase().substring(0, 60);
                if (!existingKeys.has(key)) {
                  extracted.push(llmMem);
                  existingKeys.add(key);
                }
              }
              extracted = extracted.slice(0, 8);
            } else {
              extracted = llmExtracted;
            }
          }
        } else {
          ctx.logger.debug("LLM extraction skipped — OPENROUTER_API_KEY not set");
        }
      }

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
    // KB DATA HANDLERS — expose KB data to UI
    // ══════════════════════════════════════════════════════════

    ctx.data.register("kb:stats", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      return ((await ctx.state.get(kbStatsKey(companyId))) ?? emptyKBStats()) as KBStats;
    });

    ctx.data.register("kb:search", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const query = params.query as string;
      if (!query || !companyId) return [];
      const results = await client.searchKnowledge(query, companyId, 15);
      // Only return actual KB entries (have [type: knowledge_base] or [kb_source:] tags)
      return results.map(parseKBMemory).filter((r) => r.source !== "unknown");
    });

    /** KB search as action (for UI usePluginAction calls). */
    ctx.actions.register("kb:search", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const query = params.query as string;
      if (!query || !companyId) return [];
      const results = await client.searchKnowledge(query, companyId, 15);
      return results.map(parseKBMemory).filter((r) => r.source !== "unknown");
    });

    /** List all KB entries (documents, indexed issues, briefs). */
    ctx.data.register("kb:list-documents", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      if (!companyId) return [];
      const results = await client.searchKnowledge("*", companyId, 50);
      return results.map(parseKBMemory).filter((r) => r.source !== "unknown");
    });

    /** List executive briefs only. */
    ctx.data.register("kb:list-briefs", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      if (!companyId) return [];
      const results = await client.searchKnowledge("Executive Brief", companyId, 20);
      return results.map(parseKBMemory).filter((r) => r.source === "executive_brief");
    });

    /** List watched folders with last-index info. */
    ctx.data.register("kb:indexed-folders", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      if (!companyId) return { watchFolders: [], hashCount: 0 };
      const latestRaw = await ctx.config.get();
      const latestCfg = { ...DEFAULT_CONFIG, ...(latestRaw as Record<string, unknown>) };
      const watchFolders = (latestCfg.kbWatchFolders ?? []) as string[];
      const manifestKey: ScopeKey = { scopeKind: "company", scopeId: companyId, stateKey: "kb-file-hashes" };
      const hashes = ((await ctx.state.get(manifestKey)) ?? {}) as Record<string, string>;
      return { watchFolders, hashCount: Object.keys(hashes).length };
    });

    // ══════════════════════════════════════════════════════════
    // ACTION HANDLERS — UI-triggered operations
    // ══════════════════════════════════════════════════════════

    /** Upload a document to the KB. */
    ctx.actions.register("kb:upload-document", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const name = params.name as string;
      const content = params.content as string;
      const tags = (params.tags as string[] | undefined) ?? [];
      if (!companyId || !name || !content) return { ok: false, error: "name and content required" };

      // Sanitize uploaded content
      const uploadScan = scanAndRedact(content);
      if (uploadScan.hasSensitiveData) {
        ctx.logger.warn(`KB: redacted sensitive data from upload "${name}": ${formatDetectionSummary(uploadScan.detections)}`);
      }

      const { chunkCount } = await client.storeDocument(name, uploadScan.redactedContent, companyId, tags);

      const kbStats = ((await ctx.state.get(kbStatsKey(companyId))) ?? emptyKBStats()) as KBStats;
      kbStats.uploadedDocuments++;
      await ctx.state.set(kbStatsKey(companyId), kbStats);

      await ctx.activity.log({
        companyId,
        message: `KB: uploaded document "${name}" (${chunkCount} chunk${chunkCount > 1 ? "s" : ""})`,
      });

      return { ok: true, chunkCount };
    });

    /** Index a folder into the KB (UI-triggered). */
    ctx.actions.register("kb:index-folder", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const folderPath = params.path as string;
      const recursive = (params.recursive as boolean) !== false;
      if (!companyId || !folderPath) return { ok: false, error: "companyId and path required" };

      try {
        const result = await indexFolder(folderPath, companyId, recursive);
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: String(err).substring(0, 200) };
      }
    });

    /** Generate executive brief for an issue. */
    ctx.actions.register("kb:generate-brief", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;
      const issueIdOrIdentifier = params.issueId as string;
      if (!companyId || !issueIdOrIdentifier) return { ok: false, error: "companyId and issueId required" };

      const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
      if (!apiKey) return { ok: false, error: "API key not available" };

      // Fetch issue via SDK (supports both UUID and identifier like ANI-859)
      let issue: Record<string, unknown> | null = null;
      try {
        issue = (await (ctx.issues as any).get(issueIdOrIdentifier, companyId)) as Record<string, unknown> | null;
      } catch (err) {
        ctx.logger.warn("KB brief: issues.get failed", { issueIdOrIdentifier, error: String(err).substring(0, 200) });
      }
      if (!issue) return { ok: false, error: `Issue "${issueIdOrIdentifier}" not found` };

      const issueId = issue.id as string;
      ctx.logger.info("KB brief: issue found", { issueId, identifier: issue.identifier, title: (issue.title as string)?.substring(0, 50) });

      // Check for subtasks
      let children: Array<Record<string, unknown>> = [];
      try {
        children = (await ctx.issues.list({ companyId, parentId: issueId } as Record<string, unknown>)) as Array<Record<string, unknown>>;
      } catch { /* */ }

      const subtaskOutputs: Array<{ identifier: string; title: string; content: string }> = [];
      for (const child of children.filter((c) => c.status === "done")) {
        try {
          const comments = await (ctx.issues as any).listComments(child.id as string, companyId) as Array<Record<string, unknown>>;
          const lastAgentComment = comments.filter((c: Record<string, unknown>) => c.authorAgentId).pop();
          subtaskOutputs.push({
            identifier: (child.identifier || (child.id as string).substring(0, 8)) as string,
            title: (child.title || "Untitled") as string,
            content: ((lastAgentComment?.body as string) ?? "(no output)").substring(0, 3000),
          });
        } catch { /* skip */ }
      }

      if (subtaskOutputs.length === 0) {
        // No subtasks — generate brief from issue comments directly
        let comments: Array<Record<string, unknown>> = [];
        try {
          comments = await (ctx.issues as any).listComments(issueId, companyId) as Array<Record<string, unknown>>;
          ctx.logger.info("KB brief: got comments", { issueId, count: comments.length });
        } catch (err) {
          ctx.logger.error("KB brief: listComments error", { error: String(err).substring(0, 200) });
        }
        const agentComments = comments.filter((c) => c.authorAgentId && String(c.body ?? "").length > 50);
        if (agentComments.length === 0) return { ok: false, error: `No agent output (${comments.length} comments, none from agents)` };
        subtaskOutputs.push({
          identifier: (issue.identifier || issueId.substring(0, 8)) as string,
          title: (issue.title || "Untitled") as string,
          content: agentComments.map((c) => (c.body as string).substring(0, 2000)).join("\n\n"),
        });
      }

      // Read model from fresh config (not startup cache)
      const freshCfg = { ...DEFAULT_CONFIG, ...((await ctx.config.get()) as Record<string, unknown>) };
      const briefModel = (freshCfg.kbBriefModel || "google/gemini-2.5-flash") as string;

      const result = await generateExecutiveBrief({
        parentTitle: (issue.title || "Untitled") as string,
        parentIdentifier: (issue.identifier || issueId) as string,
        subtasks: subtaskOutputs,
        apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        model: briefModel,
      });

      if (!result.brief) return { ok: false, error: result.error || "Brief generation failed" };
      const brief = result.brief;

      await client.storeKnowledgeEntry(brief, {
        companyId,
        title: `Executive Brief: ${issue.identifier || ""} ${issue.title || ""}`.trim(),
        source: "executive_brief",
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        projectId: issue.projectId,
      });

      const kbStats = ((await ctx.state.get(kbStatsKey(companyId))) ?? emptyKBStats()) as KBStats;
      kbStats.generatedBriefs++;
      kbStats.lastBriefAt = new Date().toISOString();
      await ctx.state.set(kbStatsKey(companyId), kbStats);

      return { ok: true, brief };
    });

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

    /** Update plugin configuration. */
    ctx.actions.register("memory:update-config", async (params: Record<string, unknown>) => {
      const updates = params.config as Record<string, unknown> | undefined;
      if (!updates || typeof updates !== "object") {
        return { ok: false, error: "Missing config object" };
      }

      // Merge updates with current config
      const newCfg = { ...cfg, ...updates };

      // Persist by calling the Paperclip config API
      const port = process.env.PORT || "3100";
      try {
        const pluginId = params._pluginId as string || "";
        // We need to get our own plugin ID — use the internal state
        const res = await fetch(`http://localhost:${port}/api/plugins/animusystems.agent-memory/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            configJson: {
              enabled: newCfg.enabled,
              memosUrl: newCfg.memosUrl,
              autoExtract: newCfg.autoExtract,
              autoInject: newCfg.autoInject,
              maxMemoriesPerInjection: newCfg.maxMemoriesPerInjection,
              injectionTokenBudget: newCfg.injectionTokenBudget,
              extractionMode: newCfg.extractionMode,
              llmExtractionModel: newCfg.llmExtractionModel,
            },
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, error: `Config save failed (${res.status}): ${text.substring(0, 200)}` };
        }

        // Update in-memory config
        Object.assign(cfg, updates);

        // Clear cached status so the settings page shows updated values
        const companyId = params.companyId as string;
        if (companyId) {
          await ctx.state.set(
            { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" },
            null as unknown as Record<string, unknown>,
          ).catch(() => {});
        }

        return { ok: true, config: newCfg };
      } catch (err) {
        return { ok: false, error: String(err).substring(0, 200) };
      }
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

        // Read fresh config from DB so cached status reflects latest saved values
        const jobRaw = await ctx.config.get();
        const jobCfg = { ...DEFAULT_CONFIG, ...(jobRaw as Record<string, unknown>) };

        // Store status snapshot in plugin state
        await ctx.state.set(
          { scopeKind: "company", scopeId: company.id, stateKey: "memos-status" },
          {
            memosConnected: healthy,
            memosUrl: jobCfg.memosUrl,
            embedderBackend: "ollama (nomic-embed-text)",
            chatProvider: "openrouter (gpt-4o-mini)",
            totalMemories,
            agentsWithMemory,
            agentsScanned: Math.min(agents.length, 20),
            totalAgents: agents.length,
            lastCheckAt: new Date().toISOString(),
            config: {
              autoExtract: jobCfg.autoExtract,
              autoInject: jobCfg.autoInject,
              maxMemoriesPerInjection: jobCfg.maxMemoriesPerInjection,
              injectionTokenBudget: jobCfg.injectionTokenBudget,
              extractionMode: jobCfg.extractionMode,
              llmExtractionModel: jobCfg.llmExtractionModel,
              llmFallbackModel: jobCfg.llmFallbackModel,
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
    }); // end health-check job

    // ══════════════════════════════════════════════════════════
    // SCHEDULED JOB — AutoDream consolidation (daily at 3am)
    // ══════════════════════════════════════════════════════════

    ctx.jobs.register("autodream-consolidate", async () => {
      let companyId = "";
      try {
        const stored = await ctx.state.get({ scopeKind: "instance", stateKey: "known-company-id" });
        if (stored && typeof stored === "string") companyId = stored;
      } catch { /* no company yet */ }

      if (!companyId) {
        ctx.logger.debug("AutoDream: no company context yet");
        return;
      }

      ctx.logger.info("AutoDream consolidation starting", { companyId });

      const agents = await ctx.agents.list({ companyId });
      const results = [];
      const agentMemoriesMap = new Map<string, Memory[]>();

      for (const agent of agents.slice(0, 30)) {
        try {
          const result = await consolidateAgent(client, agent.id, agent.name || agent.id, companyId);
          results.push(result);

          // Collect memories for cross-agent analysis
          if (result.memoriesBefore > 0) {
            const memories = await client.listMemories(agent.id, companyId);
            agentMemoriesMap.set(agent.id, memories);
          }
        } catch (err) {
          ctx.logger.warn("AutoDream: failed to consolidate agent", { agentId: agent.id, error: String(err) });
        }
      }

      // Cross-agent fact promotion
      const crossFacts = findCrossAgentFacts(agentMemoriesMap, 3);

      const totalDupes = results.reduce((s, r) => s + r.duplicatesRemoved, 0);
      const totalStale = results.reduce((s, r) => s + r.staleArchived, 0);

      // Store consolidation result
      await ctx.state.set(
        { scopeKind: "company", scopeId: companyId, stateKey: "autodream-last-run" },
        {
          timestamp: new Date().toISOString(),
          agentsProcessed: results.length,
          totalDuplicatesFound: totalDupes,
          totalStaleFound: totalStale,
          crossAgentFacts: crossFacts.length,
          results: results.filter((r) => r.duplicatesRemoved > 0 || r.staleArchived > 0 || r.errors.length > 0),
        },
      );

      await ctx.activity.log({
        companyId,
        message: `AutoDream: consolidated ${results.length} agents — ${totalDupes} duplicates, ${totalStale} stale, ${crossFacts.length} cross-agent facts`,
        metadata: { totalDupes, totalStale, crossAgentFacts: crossFacts.length },
      });

      ctx.logger.info("AutoDream consolidation complete", {
        agentsProcessed: results.length,
        totalDupes,
        totalStale,
        crossAgentFacts: crossFacts.length,
      });
    }); // end autodream job

    // ══════════════════════════════════════════════════════════
    // SCHEDULED JOB — KB folder watch (periodic re-index)
    // ══════════════════════════════════════════════════════════

    ctx.jobs.register("kb-folder-watch", async () => {
      const latestRaw = await ctx.config.get();
      const latestCfg = { ...DEFAULT_CONFIG, ...(latestRaw as Record<string, unknown>) };
      const watchFolders = (latestCfg.kbWatchFolders ?? []) as string[];
      if (watchFolders.length === 0) return;

      let companyId = "";
      try {
        const stored = await ctx.state.get({ scopeKind: "instance", stateKey: "known-company-id" });
        if (stored && typeof stored === "string") companyId = stored;
      } catch { /* no company yet */ }
      if (!companyId) return;

      ctx.logger.info("KB folder watch starting", { folders: watchFolders.length });

      for (const folder of watchFolders) {
        try {
          const result = await indexFolder(folder, companyId, true);
          ctx.logger.info("KB folder watch indexed", { folder, ...result });
        } catch (err) {
          ctx.logger.warn("KB folder watch failed", { folder, error: String(err) });
        }
      }
    }); // end kb-folder-watch job

    // ══════════════════════════════════════════════════════════
    // STATUS DATA — serves the plugin status/dashboard page
    // ══════════════════════════════════════════════════════════

    ctx.data.register("memory:status", async (params: Record<string, unknown>) => {
      const companyId = params.companyId as string;

      // Check cached status first, but always overlay fresh config from DB
      const cached = await ctx.state.get(
        { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" },
      ) as Record<string, unknown> | null;
      if (cached) {
        const latestRaw = await ctx.config.get();
        const latestCfg = { ...DEFAULT_CONFIG, ...(latestRaw as Record<string, unknown>) };
        return {
          ...cached,
          config: {
            autoExtract: latestCfg.autoExtract,
            autoInject: latestCfg.autoInject,
            maxMemoriesPerInjection: latestCfg.maxMemoriesPerInjection,
            injectionTokenBudget: latestCfg.injectionTokenBudget,
            extractionMode: latestCfg.extractionMode,
            llmExtractionModel: latestCfg.llmExtractionModel,
            llmFallbackModel: latestCfg.llmFallbackModel,
          },
        };
      }

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

      // Read fresh config from DB (not in-memory cache) so UI reflects saved values
      const freshRaw = await ctx.config.get();
      const freshCfg = { ...DEFAULT_CONFIG, ...(freshRaw as Record<string, unknown>) };

      const result = {
        memosConnected: healthy,
        memosUrl: freshCfg.memosUrl,
        embedderBackend: "ollama (nomic-embed-text)",
        chatProvider: "openrouter (gpt-4o-mini)",
        totalMemories,
        agentsWithMemory,
        agentsScanned,
        totalAgents,
        lastCheckAt: new Date().toISOString(),
        config: {
          autoExtract: freshCfg.autoExtract,
          autoInject: freshCfg.autoInject,
          maxMemoriesPerInjection: freshCfg.maxMemoriesPerInjection,
          injectionTokenBudget: freshCfg.injectionTokenBudget,
          extractionMode: freshCfg.extractionMode,
          llmExtractionModel: freshCfg.llmExtractionModel,
          llmFallbackModel: freshCfg.llmFallbackModel,
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
