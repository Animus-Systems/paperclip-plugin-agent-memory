import type { Memory, MemoryMetadata } from "./types.js";

/**
 * MemOS REST API client.
 *
 * MemOS organises memory around `user_id` (= Paperclip agentId) and
 * `mem_cube_id` (= Paperclip companyId — one cube per company).
 *
 * Endpoints used:
 *   POST /product/register   — onboard a new user
 *   POST /product/add        — store messages as memory
 *   POST /product/search     — semantic search
 *   POST /product/get_all    — list all memories for a user/cube
 */
export class MemosClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 5_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  // ── Health check ────────────────────────────────────────────

  async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/docs`, {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── User registration ──────────────────────────────────────

  /** Register an agent as a MemOS user. Idempotent — safe to call repeatedly. */
  async registerUser(agentId: string, agentName: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/product/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: agentId,
          user_name: agentName,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Best effort — user may already exist.
    }
  }

  // ── Store memory ───────────────────────────────────────────

  /** Store content as memory for an agent in a company cube. */
  async storeMemory(
    content: string,
    meta: MemoryMetadata,
  ): Promise<{ taskId?: string }> {
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
            content: this.formatMemoryContent(content, meta),
          },
        ],
        async_mode: "sync",
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MemOS store failed (${res.status}): ${text.substring(0, 200)}`);
    }

    const data = (await res.json()) as { data?: { task_id?: string } };
    return { taskId: data?.data?.task_id };
  }

  // ── Search memories ────────────────────────────────────────

  /** Search for relevant memories by query text. */
  async searchMemories(
    query: string,
    agentId: string,
    companyId: string,
    topK = 5,
  ): Promise<Memory[]> {
    const res = await fetch(`${this.baseUrl}/product/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        user_id: agentId,
        readable_cube_ids: [companyId],
        top_k: topK,
        mode: "fast",
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) return [];

    const body = (await res.json()) as {
      code?: number;
      data?: Record<string, unknown[] | string | unknown>;
    };

    // MemOS returns { data: { text_mem: [...], skill_mem: [...], pref_note: "...", ... } }
    const results: Memory[] = [];
    const data = body.data ?? {};
    for (const [memType, entries] of Object.entries(data)) {
      if (typeof entries === "string" && entries.length > 5) {
        // pref_note is a plain string
        results.push({ id: memType, content: entries });
        continue;
      }
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const e = entry as { cube_id?: string; memories?: Array<{ id?: string; memory?: string; score?: number; metadata?: Record<string, unknown> }>; total_nodes?: number };
        for (const mem of e.memories ?? []) {
          if (mem.memory && mem.memory.length > 5) {
            results.push({
              id: mem.id ?? "",
              content: mem.memory,
              score: mem.score,
              metadata: { type: memType, ...(mem.metadata ?? {}) },
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
  async listMemories(
    agentId: string,
    companyId: string,
  ): Promise<Memory[]> {
    // Use broad search to get all memory types
    return this.searchMemories("*", agentId, companyId, 50);
  }

  // ── Get single memory ──────────────────────────────────────

  async getMemory(
    memoryId: string,
    agentId: string,
  ): Promise<Memory | null> {
    try {
      const res = await fetch(`${this.baseUrl}/product/get_memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: agentId,
          memory_id: memoryId,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: { id?: string; content?: string; text?: string; metadata?: Record<string, unknown> };
      };
      if (!body.data) return null;
      return {
        id: body.data.id ?? memoryId,
        content: body.data.content ?? body.data.text ?? "",
        metadata: body.data.metadata,
      };
    } catch {
      return null;
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  /** Format memory content with metadata tags for retrieval. */
  private formatMemoryContent(content: string, meta: MemoryMetadata): string {
    const parts = [content];
    if (meta.category) parts.push(`[category: ${meta.category}]`);
    if (meta.projectId) parts.push(`[project: ${meta.projectId}]`);
    if (meta.issueId) parts.push(`[issue: ${meta.issueId}]`);
    if (meta.tags?.length) parts.push(`[tags: ${meta.tags.join(", ")}]`);
    if (meta.source) parts.push(`[source: ${meta.source}]`);
    return parts.join("\n");
  }
}
