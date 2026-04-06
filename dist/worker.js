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
      const res = await fetch(`${this.baseUrl}/openapi.json`, {
        signal: AbortSignal.timeout(5e3)
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
  // ── Knowledge Base ──────────────────────────────────────────
  /** Store a knowledge base entry (completed work or document). */
  async storeKnowledgeEntry(content, opts) {
    const kbUserId = `kb-${opts.companyId}`;
    await this.registerUser(kbUserId, "Knowledge Base");
    const metaParts = [
      content,
      `[type: knowledge_base]`,
      `[kb_source: ${opts.source}]`,
      `[title: ${opts.title}]`
    ];
    if (opts.issueIdentifier) metaParts.push(`[issue: ${opts.issueIdentifier}]`);
    if (opts.issueId) metaParts.push(`[issue_id: ${opts.issueId}]`);
    if (opts.projectId) metaParts.push(`[project: ${opts.projectId}]`);
    if (opts.agentId) metaParts.push(`[agent_id: ${opts.agentId}]`);
    if (opts.agentName) metaParts.push(`[agent: ${opts.agentName}]`);
    if (opts.tags?.length) metaParts.push(`[tags: ${opts.tags.join(", ")}]`);
    const res = await fetch(`${this.baseUrl}/product/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: kbUserId,
        writable_cube_ids: [opts.companyId],
        messages: [{ role: "assistant", content: metaParts.join("\n") }],
        async_mode: "sync"
      }),
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MemOS KB store failed (${res.status}): ${text.substring(0, 200)}`);
    }
  }
  /** Search the knowledge base (completed work + documents). */
  async searchKnowledge(query, companyId, topK = 8) {
    const kbUserId = `kb-${companyId}`;
    return this.searchMemories(query, kbUserId, companyId, topK);
  }
  /** Store a document in the KB (chunked if large). */
  async storeDocument(name, content, companyId, tags) {
    const chunks = this.chunkText(content, 2e3);
    for (let i = 0; i < chunks.length; i++) {
      const chunkLabel = chunks.length > 1 ? ` (part ${i + 1}/${chunks.length})` : "";
      await this.storeKnowledgeEntry(chunks[i], {
        companyId,
        title: `${name}${chunkLabel}`,
        source: "document",
        tags
      });
    }
    return { chunkCount: chunks.length };
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
  /** Split text into chunks at paragraph boundaries. */
  chunkText(text, maxChars) {
    if (text.length <= maxChars) return [text];
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let current = "";
    for (const p of paragraphs) {
      if (current.length + p.length + 2 > maxChars && current.length > 0) {
        chunks.push(current.trim());
        current = "";
      }
      current += (current ? "\n\n" : "") + p;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [text.substring(0, maxChars)];
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

// src/worker/llm-extractor.ts
var EXTRACTION_PROMPT = `You are a memory extraction system for an AI agent platform. Given an agent's run summary, extract distinct, self-contained facts, decisions, learnings, and preferences.

Rules:
- Each memory must be a clear, standalone statement (15-300 characters)
- Categorize each as: decision, learning, fact, preference, or note
- Assign a confidence score (0.0 to 1.0) based on how clearly stated the information is
- Extract at most 8 memories
- Skip code snippets, file paths, and generic statements
- Focus on information that would be valuable in future runs

Respond with a JSON array. Example:
[
  {"content": "Client prefers weekly reports sent on Monday mornings", "category": "preference", "confidence": 0.85},
  {"content": "The API rate limit for endpoint X is 100 requests per minute", "category": "fact", "confidence": 0.9}
]

If there is nothing worth extracting, respond with an empty array: []`;
var MAX_SUMMARY_CHARS = 3e3;
async function extractMemoriesWithLlm(summary, config) {
  if (!summary || summary.length < 100) return [];
  if (!config.apiKey) return [];
  const truncatedSummary = summary.substring(0, MAX_SUMMARY_CHARS);
  const modelsToTry = [config.model];
  if (config.fallbackModel && config.fallbackModel !== config.model) {
    modelsToTry.push(config.fallbackModel);
  }
  for (const model of modelsToTry) {
    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://paperclip.ing",
          "X-Title": "Paperclip Memory Extraction"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            { role: "user", content: `Extract memories from this agent run summary:

${truncatedSummary}` }
          ],
          max_tokens: 1024,
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
        signal: AbortSignal.timeout(1e4)
      });
      if (!res.ok) {
        if (res.status === 429 && modelsToTry.indexOf(model) < modelsToTry.length - 1) continue;
        return [];
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return [];
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try {
            parsed = JSON.parse(arrayMatch[0]);
          } catch {
            return [];
          }
        } else {
          return [];
        }
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed;
        if (Array.isArray(obj.memories)) parsed = obj.memories;
        else if (Array.isArray(obj.results)) parsed = obj.results;
        else if (Array.isArray(obj.extractions)) parsed = obj.extractions;
        else return [];
      }
      if (!Array.isArray(parsed)) return [];
      const results = [];
      for (const item of parsed) {
        const m = item;
        if (!m.content || typeof m.content !== "string") continue;
        if (m.content.length < 15 || m.content.length > 300) continue;
        const category = ["decision", "learning", "fact", "preference", "note"].includes(m.category) ? m.category : "note";
        const confidence = typeof m.confidence === "number" ? Math.max(0, Math.min(1, m.confidence)) : 0.7;
        results.push({ content: m.content, category, confidence });
      }
      return results.slice(0, 8);
    } catch {
      if (modelsToTry.indexOf(model) < modelsToTry.length - 1) continue;
      return [];
    }
  }
  return [];
}

// src/worker/consolidator.ts
function findDuplicates(memories) {
  const pairs = [];
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const wordsA = new Set(memories[i].content.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      const wordsB = new Set(memories[j].content.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      if (wordsA.size === 0 || wordsB.size === 0) continue;
      const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
      const similarity = intersection / Math.min(wordsA.size, wordsB.size);
      if (similarity > 0.6) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}
function isStale(memory, staleDays) {
  const meta = memory.metadata;
  if (!meta) return false;
  const created = meta.created_at || meta.createdAt || meta.timestamp;
  if (typeof created === "string") {
    const age = Date.now() - new Date(created).getTime();
    return age > staleDays * 24 * 60 * 60 * 1e3;
  }
  return false;
}
async function consolidateAgent(client, agentId, agentName, companyId, staleDays = 30) {
  const result = {
    agentId,
    agentName,
    memoriesBefore: 0,
    duplicatesRemoved: 0,
    staleArchived: 0,
    errors: []
  };
  try {
    const memories = await client.listMemories(agentId, companyId);
    result.memoriesBefore = memories.length;
    if (memories.length < 2) return result;
    const duplicatePairs = findDuplicates(memories);
    const toRemove = /* @__PURE__ */ new Set();
    for (const [, j] of duplicatePairs) {
      toRemove.add(j);
    }
    result.duplicatesRemoved = toRemove.size;
    for (const mem of memories) {
      if (isStale(mem, staleDays)) {
        result.staleArchived++;
      }
    }
  } catch (err) {
    result.errors.push(String(err).substring(0, 200));
  }
  return result;
}
function findCrossAgentFacts(agentMemories, minAgents = 3) {
  const factMap = /* @__PURE__ */ new Map();
  for (const [agentId, memories] of agentMemories) {
    for (const mem of memories) {
      const key = mem.content.toLowerCase().replace(/\s+/g, " ").substring(0, 100);
      if (!factMap.has(key)) factMap.set(key, /* @__PURE__ */ new Set());
      factMap.get(key).add(agentId);
    }
  }
  const crossAgentFacts = [];
  for (const [content, agents] of factMap) {
    if (agents.size >= minAgents) {
      crossAgentFacts.push({ content, agents: [...agents] });
    }
  }
  return crossAgentFacts;
}

// src/worker/brief-generator.ts
async function generateExecutiveBrief(input) {
  const { parentTitle, parentIdentifier, subtasks, apiKey, baseUrl, model } = input;
  const subtaskSummaries = subtasks.map((s) => `### ${s.identifier}: ${s.title}
${s.content}`).join("\n\n---\n\n");
  const prompt = `You are generating an executive brief that compiles the results of multiple completed subtasks into a clear, actionable summary.

Parent task: ${parentIdentifier} \u2014 ${parentTitle}

Completed subtask outputs:
${subtaskSummaries}

Generate a professional executive brief in markdown with these sections:
1. **Summary** \u2014 2-3 sentence overview of the overall findings
2. **Key Findings** \u2014 bullet points of the most important discoveries/results
3. **Recommendations** \u2014 actionable next steps based on the findings
4. **Sources** \u2014 list each subtask identifier and title

Keep it concise and focused on what matters. Do not repeat raw data \u2014 synthesize insights.
Format the output as clean markdown starting with: # Executive Brief: ${parentIdentifier} \u2014 ${parentTitle}`;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2e3,
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(6e4)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const brief = data.choices?.[0]?.message?.content?.trim();
    if (!brief || brief.length < 50) return null;
    return brief + `

---
*Generated by Paperclip AI | ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}*`;
  } catch {
    return null;
  }
}

// src/worker/file-parser.ts
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve, extname } from "node:path";
import { tmpdir } from "node:os";
var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".md",
  ".txt",
  ".csv",
  ".html",
  ".htm",
  ".json",
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls"
]);
function isSupportedFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}
function ensurePythonDeps() {
  try {
    execSync(
      "python3 -c 'import PyPDF2, docx, openpyxl' 2>/dev/null || python3 -m pip install --break-system-packages -q pypdf2 python-docx openpyxl 2>/dev/null",
      { timeout: 12e4, stdio: "ignore" }
    );
  } catch {
  }
}
async function parseFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
    case ".txt":
    case ".csv":
      return parseTextFile(filePath, ext.slice(1));
    case ".html":
    case ".htm":
      return parseHtmlFile(filePath);
    case ".json":
      return parseJsonFile(filePath);
    case ".pdf":
      return parsePdf(filePath);
    case ".docx":
    case ".doc":
      return parseDocx(filePath);
    case ".xlsx":
    case ".xls":
      return parseXlsx(filePath);
    default:
      throw new Error(`Unsupported format: ${ext}`);
  }
}
async function parseTextFile(filePath, format) {
  const text = await readFile(filePath, "utf-8");
  return { text, format, charCount: text.length };
}
async function parseHtmlFile(filePath) {
  const raw = await readFile(filePath, "utf-8");
  const text = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  return { text, format: "html", charCount: text.length };
}
async function parseJsonFile(filePath) {
  const raw = await readFile(filePath, "utf-8");
  try {
    const obj = JSON.parse(raw);
    const text = JSON.stringify(obj, null, 2);
    return { text, format: "json", charCount: text.length };
  } catch {
    return { text: raw, format: "json", charCount: raw.length };
  }
}
function runPythonScript(script, timeoutMs = 3e4) {
  const tmpFile = resolve(tmpdir(), `.kb_parse_${Date.now()}.py`);
  try {
    writeFileSync(tmpFile, script, "utf-8");
    const result = execSync(`python3 "${tmpFile}"`, {
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024
    });
    return result;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
    }
  }
}
function parsePdf(filePath) {
  const script = `
import sys
from PyPDF2 import PdfReader

try:
    reader = PdfReader(${JSON.stringify(filePath)})
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text and text.strip():
            pages.append(text.strip())
    result = "\\n\\n".join(pages)
    print(result)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
  const text = runPythonScript(script).trim();
  return { text, format: "pdf", charCount: text.length };
}
function parseDocx(filePath) {
  const script = `
import sys
from docx import Document

try:
    doc = Document(${JSON.stringify(filePath)})
    paragraphs = []
    for para in doc.paragraphs:
        if para.text.strip():
            paragraphs.append(para.text.strip())
    # Also extract tables
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                paragraphs.append(" | ".join(cells))
    print("\\n\\n".join(paragraphs))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
  const text = runPythonScript(script).trim();
  return { text, format: "docx", charCount: text.length };
}
function parseXlsx(filePath) {
  const script = `
import sys
from openpyxl import load_workbook

try:
    wb = load_workbook(${JSON.stringify(filePath)}, data_only=True)
    sheets = []
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            if any(c.strip() for c in cells):
                rows.append(" | ".join(c for c in cells if c.strip()))
        if rows:
            header = f"## Sheet: {ws.title}" if len(wb.worksheets) > 1 else ""
            sheets.append((header + "\\n" if header else "") + "\\n".join(rows))
    print("\\n\\n".join(sheets))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
  const text = runPythonScript(script).trim();
  return { text, format: "xlsx", charCount: text.length };
}

// src/worker.ts
var DEFAULT_CONFIG = {
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
  kbBriefModel: "deepseek/deepseek-v3.2",
  kbWatchFolders: []
};
function kbStatsKey(companyId) {
  return { scopeKind: "company", scopeId: companyId, stateKey: "kb-stats" };
}
function emptyKBStats() {
  return { indexedIssues: 0, uploadedDocuments: 0, generatedBriefs: 0 };
}
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
    ensurePythonDeps();
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
    ctx.tools.register(
      "recall_memories",
      {
        displayName: "Recall Memories",
        description: "Search for relevant context from previous runs stored in long-term memory.",
        parametersSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to search for" }
          },
          required: ["query"]
        }
      },
      async (params, runCtx) => {
        const { query } = params;
        if (!query) return { content: "Error: query is required" };
        const agentId = runCtx.agentId;
        const companyId = runCtx.companyId;
        try {
          const results = await client.searchMemories(query, agentId, companyId, cfg.maxMemoriesPerInjection);
          await bumpStats(companyId, agentId, "searches");
          if (results.length === 0) {
            return { content: "No relevant memories found." };
          }
          const formatted = results.slice(0, cfg.maxMemoriesPerInjection).map((m, i) => `${i + 1}. ${m.content.substring(0, 500)}`).join("\n\n");
          await bumpStats(companyId, agentId, "injected", results.length);
          ctx.logger.info("Recalled memories for agent", { agentId, query: query.substring(0, 80), count: results.length });
          return {
            content: `## Memories matching "${query.substring(0, 60)}"
${formatted}`,
            data: { count: results.length, agentId }
          };
        } catch (err) {
          ctx.logger.warn("Memory recall failed", { error: String(err) });
          return { content: `Memory search failed: ${String(err).substring(0, 200)}` };
        }
      }
    );
    ctx.tools.register(
      "store_memory",
      {
        displayName: "Store Memory",
        description: "Save an important learning, decision, or fact to long-term memory for future runs.",
        parametersSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "The memory to save" },
            category: { type: "string", enum: ["decision", "learning", "fact", "preference", "note"] }
          },
          required: ["content"]
        }
      },
      async (params, runCtx) => {
        const { content, category } = params;
        if (!content) return { content: "Error: content is required" };
        const agentId = runCtx.agentId;
        const companyId = runCtx.companyId;
        try {
          const agents = await ctx.agents.list({ companyId });
          const agent = agents.find((a) => a.id === agentId);
          const agentName = agent?.name || agentId;
          await client.registerUser(agentId, agentName);
          await client.storeMemory(content, {
            agentId,
            agentName,
            companyId,
            projectId: runCtx.projectId || void 0,
            source: "agent_tool",
            category: category || "note"
          });
          await bumpStats(companyId, agentId, "stored");
          ctx.logger.info("Agent stored memory", { agentId, category, contentLen: content.length });
          return {
            content: `Memory saved: "${content.substring(0, 100)}"`,
            data: { agentId, category: category || "note" }
          };
        } catch (err) {
          ctx.logger.warn("Memory store failed", { error: String(err) });
          return { content: `Failed to save memory: ${String(err).substring(0, 200)}` };
        }
      }
    );
    ctx.tools.register(
      "search_knowledge",
      {
        displayName: "Search Knowledge Base",
        description: "Search completed work, research reports, and company documents. Use when you need context from prior completed tasks, audits, or uploaded reference material.",
        parametersSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to search for" }
          },
          required: ["query"]
        }
      },
      async (params, runCtx) => {
        const { query } = params;
        if (!query) return { content: "Error: query is required" };
        const companyId = runCtx.companyId;
        try {
          const results = await client.searchKnowledge(query, companyId, 8);
          if (results.length === 0) {
            return { content: "No knowledge base entries found for that query." };
          }
          const formatted = results.slice(0, 8).map((m, i) => `${i + 1}. ${m.content.substring(0, 600)}`).join("\n\n");
          ctx.logger.info("KB search", { query: query.substring(0, 80), results: results.length });
          return {
            content: `## Knowledge Base results for "${query.substring(0, 60)}"
${formatted}`,
            data: { count: results.length }
          };
        } catch (err) {
          ctx.logger.warn("KB search failed", { error: String(err) });
          return { content: `Knowledge base search failed: ${String(err).substring(0, 200)}` };
        }
      }
    );
    ctx.tools.register(
      "index_folder",
      {
        displayName: "Index Folder",
        description: "Index all documents in a folder into the Knowledge Base. Supports PDF, DOCX, XLSX, CSV, markdown, HTML, text files. Use to make project files searchable via search_knowledge.",
        parametersSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute folder path to index (e.g. /data/accounts/Animus-Systems-SL)" },
            recursive: { type: "boolean", description: "Include subfolders (default: true)" }
          },
          required: ["path"]
        }
      },
      async (params, runCtx) => {
        const folderPath = params.path;
        const recursive = params.recursive !== false;
        const companyId = runCtx.companyId;
        try {
          const result = await indexFolder(folderPath, companyId, recursive);
          ctx.logger.info("KB: folder indexed via agent tool", { folderPath, ...result });
          return {
            content: `Indexed ${result.indexed} new files from ${folderPath} (${result.unchanged} unchanged, ${result.skipped} skipped, ${result.errors} errors). Formats: ${Object.entries(result.byFormat).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
            data: result
          };
        } catch (err) {
          return { content: `Error indexing folder: ${String(err).substring(0, 200)}` };
        }
      }
    );
    async function indexFolder(folderPath, companyId, recursive) {
      const { readdir, stat, readFile: readFileRaw } = await import("node:fs/promises");
      const { join, basename } = await import("node:path");
      const { createHash } = await import("node:crypto");
      const manifestKey = { scopeKind: "company", scopeId: companyId, stateKey: "kb-file-hashes" };
      const hashManifest = await ctx.state.get(manifestKey) ?? {};
      const files = [];
      async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory() && recursive && !entry.name.startsWith(".") && entry.name !== "node_modules") {
            await walk(full);
          } else if (entry.isFile() && isSupportedFile(full)) {
            files.push(full);
          }
        }
      }
      await walk(folderPath);
      let indexed = 0;
      let skipped = 0;
      let unchanged = 0;
      let errors = 0;
      const byFormat = {};
      for (const filePath of files) {
        try {
          const fileStat = await stat(filePath);
          if (fileStat.size > 10 * 1024 * 1024) {
            skipped++;
            continue;
          }
          if (fileStat.size < 10) {
            skipped++;
            continue;
          }
          const raw = await readFileRaw(filePath);
          const hash = createHash("md5").update(raw).digest("hex");
          if (hashManifest[filePath] === hash) {
            unchanged++;
            continue;
          }
          const result = await parseFile(filePath);
          if (result.text.length < 20) {
            skipped++;
            continue;
          }
          const name = basename(filePath);
          await client.storeKnowledgeEntry(result.text.substring(0, 8e3), {
            companyId,
            title: name,
            source: "document",
            tags: [result.format, "folder-index"]
          });
          hashManifest[filePath] = hash;
          indexed++;
          byFormat[result.format] = (byFormat[result.format] ?? 0) + 1;
        } catch {
          errors++;
        }
      }
      await ctx.state.set(manifestKey, hashManifest);
      if (indexed > 0) {
        const kbStats = await ctx.state.get(kbStatsKey(companyId)) ?? emptyKBStats();
        kbStats.uploadedDocuments += indexed;
        await ctx.state.set(kbStatsKey(companyId), kbStats);
      }
      await ctx.activity.log({
        companyId,
        message: `KB: indexed ${indexed} new files from ${folderPath} (${unchanged} unchanged, ${skipped} skipped, ${errors} errors)`
      });
      return { indexed, unchanged, skipped, errors, total: files.length, byFormat };
    }
    ctx.events.on("issue.updated", async (event) => {
      if (!cfg.enabled || !cfg.kbAutoIndex) return;
      const payload = event.payload;
      const status = payload?.status;
      if (status !== "done") return;
      const companyId = event.companyId;
      const issueId = event.entityId || (payload?.entityId ?? payload?.issueId ?? "");
      const identifier = payload?.identifier ?? "";
      if (!issueId || !companyId) return;
      ctx.logger.info("KB: indexing completed issue", { issueId, identifier });
      try {
        const issue = await ctx.issues.get(issueId, companyId);
        if (!issue) return;
        let comments = [];
        try {
          comments = await ctx.issues.listComments(issueId, companyId);
        } catch {
        }
        let agentName = "";
        if (issue.assigneeAgentId) {
          try {
            const agents = await ctx.agents.list({ companyId });
            agentName = agents.find((a) => a.id === issue.assigneeAgentId)?.name || "";
          } catch {
          }
        }
        const agentComments = comments.filter((c) => c.authorAgentId && c.body.length > 100).slice(-3);
        if (agentComments.length === 0 && (!issue.description || issue.description.length < 50)) {
          ctx.logger.debug("KB: no substantial content to index", { issueId });
          return;
        }
        const content = [
          `# ${issue.identifier || issueId}: ${issue.title || "Untitled"}`,
          "",
          issue.description ? `## Task Description
${issue.description.substring(0, 1e3)}` : "",
          "",
          ...agentComments.map((c) => c.body.substring(0, 2e3))
        ].filter(Boolean).join("\n\n");
        await client.storeKnowledgeEntry(content, {
          companyId,
          title: `${issue.identifier || ""} ${issue.title || ""}`.trim(),
          source: "issue_completion",
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          projectId: issue.projectId,
          agentId: issue.assigneeAgentId,
          agentName
        });
        const kbStats = await ctx.state.get(kbStatsKey(companyId)) ?? emptyKBStats();
        kbStats.indexedIssues++;
        kbStats.lastIndexAt = (/* @__PURE__ */ new Date()).toISOString();
        await ctx.state.set(kbStatsKey(companyId), kbStats);
        await ctx.activity.log({
          companyId,
          message: `KB: indexed ${issue.identifier || issueId} "${(issue.title || "").substring(0, 60)}" by ${agentName || "unknown"}`,
          entityType: "issue",
          entityId: issueId
        });
        ctx.logger.info("KB: indexed issue", { issueId, identifier: issue.identifier, contentLen: content.length });
        if (cfg.kbAutoBreif && issue.parentId) {
        }
        if (cfg.kbAutoBreif && !issue.parentId) {
          try {
            const childrenRes = await fetch(
              `http://localhost:${port}/api/companies/${companyId}/issues?parentId=${issueId}`,
              { headers, signal: AbortSignal.timeout(5e3) }
            );
            if (childrenRes.ok) {
              const children = await childrenRes.json();
              if (children.length > 0 && children.every((c) => c.status === "done" || c.status === "cancelled")) {
                ctx.logger.info("KB: generating executive brief for synthesis", { issueId, subtasks: children.length });
                const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
                if (apiKey) {
                  const subtaskOutputs = [];
                  for (const child of children.filter((c) => c.status === "done")) {
                    try {
                      const childCommentsRes = await fetch(
                        `http://localhost:${port}/api/issues/${child.id}/comments`,
                        { headers, signal: AbortSignal.timeout(5e3) }
                      );
                      if (childCommentsRes.ok) {
                        const childComments = await childCommentsRes.json();
                        const lastAgentComment = childComments.filter((c) => c.authorAgentId).pop();
                        subtaskOutputs.push({
                          identifier: child.identifier || child.id.substring(0, 8),
                          title: child.title || "Untitled",
                          content: lastAgentComment?.body.substring(0, 3e3) || "(no output)"
                        });
                      }
                    } catch {
                    }
                  }
                  if (subtaskOutputs.length > 0) {
                    const brief = await generateExecutiveBrief({
                      parentTitle: issue.title || "Untitled",
                      parentIdentifier: issue.identifier || issueId,
                      subtasks: subtaskOutputs,
                      apiKey,
                      baseUrl: "https://openrouter.ai/api/v1",
                      model: cfg.kbBriefModel
                    });
                    if (brief) {
                      await client.storeKnowledgeEntry(brief, {
                        companyId,
                        title: `Executive Brief: ${issue.identifier || ""} ${issue.title || ""}`.trim(),
                        source: "executive_brief",
                        issueId: issue.id,
                        issueIdentifier: issue.identifier,
                        projectId: issue.projectId,
                        agentId: issue.assigneeAgentId,
                        agentName
                      });
                      try {
                        await fetch(`http://localhost:${port}/api/issues/${issueId}/comments`, {
                          method: "POST",
                          headers,
                          body: JSON.stringify({ body: brief }),
                          signal: AbortSignal.timeout(1e4)
                        });
                      } catch {
                      }
                      kbStats.generatedBriefs++;
                      kbStats.lastBriefAt = (/* @__PURE__ */ new Date()).toISOString();
                      await ctx.state.set(kbStatsKey(companyId), kbStats);
                      await ctx.activity.log({
                        companyId,
                        message: `KB: generated executive brief for ${issue.identifier || issueId} (${subtaskOutputs.length} subtasks)`,
                        entityType: "issue",
                        entityId: issueId
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
      ctx.logger.info("Extracting memories from run", { agentId, runId, summaryLen: summary.length, mode: cfg.extractionMode });
      await client.registerUser(agentId, agentName || agentId);
      let extracted = cfg.extractionMode === "llm" ? [] : extractMemories(summary);
      if (cfg.extractionMode === "llm" || cfg.extractionMode === "hybrid" && extracted.length < 2 && summary.length > 500) {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
        if (apiKey) {
          const llmExtracted = await extractMemoriesWithLlm(summary, {
            apiKey,
            baseUrl: "https://openrouter.ai/api/v1",
            model: cfg.llmExtractionModel,
            fallbackModel: cfg.llmFallbackModel
          });
          if (llmExtracted.length > 0) {
            ctx.logger.info("LLM extraction yielded memories", { count: llmExtracted.length, fallback: cfg.extractionMode === "hybrid" });
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
          ctx.logger.debug("LLM extraction skipped \u2014 OPENROUTER_API_KEY not set");
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
    ctx.data.register("kb:stats", async (params) => {
      const companyId = params.companyId;
      return await ctx.state.get(kbStatsKey(companyId)) ?? emptyKBStats();
    });
    ctx.data.register("kb:search", async (params) => {
      const companyId = params.companyId;
      const query = params.query;
      if (!query || !companyId) return [];
      return client.searchKnowledge(query, companyId, 10);
    });
    ctx.data.register("kb:list-documents", async (params) => {
      const companyId = params.companyId;
      if (!companyId) return [];
      const results = await client.searchKnowledge("*", companyId, 50);
      return results.map((r) => {
        const titleMatch = r.content.match(/\[title: ([^\]]+)\]/);
        const sourceMatch = r.content.match(/\[kb_source: ([^\]]+)\]/);
        const issueMatch = r.content.match(/\[issue: ([^\]]+)\]/);
        const agentMatch = r.content.match(/\[agent: ([^\]]+)\]/);
        return {
          id: r.id,
          title: titleMatch?.[1] ?? r.content.substring(0, 60),
          source: sourceMatch?.[1] ?? "unknown",
          issue: issueMatch?.[1] ?? null,
          agent: agentMatch?.[1] ?? null,
          excerpt: r.content.replace(/\[[\w_]+: [^\]]+\]/g, "").trim().substring(0, 200),
          score: r.score
        };
      });
    });
    ctx.data.register("kb:list-briefs", async (params) => {
      const companyId = params.companyId;
      if (!companyId) return [];
      const results = await client.searchKnowledge("Executive Brief", companyId, 20);
      return results.filter((r) => r.content.includes("[kb_source: executive_brief]")).map((r) => {
        const titleMatch = r.content.match(/\[title: ([^\]]+)\]/);
        const issueMatch = r.content.match(/\[issue: ([^\]]+)\]/);
        return {
          id: r.id,
          title: titleMatch?.[1] ?? "Untitled Brief",
          issue: issueMatch?.[1] ?? null,
          content: r.content.replace(/\[[\w_]+: [^\]]+\]/g, "").trim()
        };
      });
    });
    ctx.data.register("kb:indexed-folders", async (params) => {
      const companyId = params.companyId;
      if (!companyId) return { watchFolders: [], hashCount: 0 };
      const latestRaw = await ctx.config.get();
      const latestCfg = { ...DEFAULT_CONFIG, ...latestRaw };
      const watchFolders = latestCfg.kbWatchFolders ?? [];
      const manifestKey = { scopeKind: "company", scopeId: companyId, stateKey: "kb-file-hashes" };
      const hashes = await ctx.state.get(manifestKey) ?? {};
      return { watchFolders, hashCount: Object.keys(hashes).length };
    });
    ctx.actions.register("kb:upload-document", async (params) => {
      const companyId = params.companyId;
      const name = params.name;
      const content = params.content;
      const tags = params.tags ?? [];
      if (!companyId || !name || !content) return { ok: false, error: "name and content required" };
      const { chunkCount } = await client.storeDocument(name, content, companyId, tags);
      const kbStats = await ctx.state.get(kbStatsKey(companyId)) ?? emptyKBStats();
      kbStats.uploadedDocuments++;
      await ctx.state.set(kbStatsKey(companyId), kbStats);
      await ctx.activity.log({
        companyId,
        message: `KB: uploaded document "${name}" (${chunkCount} chunk${chunkCount > 1 ? "s" : ""})`
      });
      return { ok: true, chunkCount };
    });
    ctx.actions.register("kb:index-folder", async (params) => {
      const companyId = params.companyId;
      const folderPath = params.path;
      const recursive = params.recursive !== false;
      if (!companyId || !folderPath) return { ok: false, error: "companyId and path required" };
      try {
        const result = await indexFolder(folderPath, companyId, recursive);
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: String(err).substring(0, 200) };
      }
    });
    ctx.actions.register("kb:generate-brief", async (params) => {
      const companyId = params.companyId;
      const issueIdOrIdentifier = params.issueId;
      if (!companyId || !issueIdOrIdentifier) return { ok: false, error: "companyId and issueId required" };
      const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
      if (!apiKey) return { ok: false, error: "API key not available" };
      let issue = null;
      try {
        issue = await ctx.issues.get(issueIdOrIdentifier, companyId);
      } catch {
      }
      if (!issue) return { ok: false, error: `Issue "${issueIdOrIdentifier}" not found` };
      const issueId = issue.id;
      let children = [];
      try {
        children = await ctx.issues.list({ companyId, parentId: issueId });
      } catch {
      }
      const subtaskOutputs = [];
      for (const child of children.filter((c) => c.status === "done")) {
        try {
          const comments = await ctx.issues.listComments(child.id, companyId);
          const lastAgentComment = comments.filter((c) => c.authorAgentId).pop();
          subtaskOutputs.push({
            identifier: child.identifier || child.id.substring(0, 8),
            title: child.title || "Untitled",
            content: (lastAgentComment?.body ?? "(no output)").substring(0, 3e3)
          });
        } catch {
        }
      }
      if (subtaskOutputs.length === 0) {
        let comments = [];
        try {
          const raw = await ctx.issues.listComments(issueId, companyId);
          comments = Array.isArray(raw) ? raw : [];
          ctx.logger.info("KB brief: listComments OK", { issueId, count: comments.length });
          if (comments.length > 0) {
            ctx.logger.info("KB brief: comment sample", { keys: Object.keys(comments[0]) });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? `${err.message}
${err.stack}` : JSON.stringify(err);
          ctx.logger.error("KB brief: listComments FAILED", { issueId, error: errMsg.substring(0, 500) });
        }
        const agentComments = comments.filter((c) => (c.authorAgentId || c.author_agent_id) && String(c.body ?? "").length > 50);
        if (agentComments.length === 0) return { ok: false, error: `No agent output to summarize (${comments.length} comments found, none from agents)` };
        subtaskOutputs.push({
          identifier: issue.identifier || issueId.substring(0, 8),
          title: issue.title || "Untitled",
          content: agentComments.map((c) => c.body.substring(0, 2e3)).join("\n\n")
        });
      }
      const brief = await generateExecutiveBrief({
        parentTitle: issue.title || "Untitled",
        parentIdentifier: issue.identifier || issueId,
        subtasks: subtaskOutputs,
        apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        model: cfg.kbBriefModel
      });
      if (!brief) return { ok: false, error: "Brief generation failed" };
      await client.storeKnowledgeEntry(brief, {
        companyId,
        title: `Executive Brief: ${issue.identifier || ""} ${issue.title || ""}`.trim(),
        source: "executive_brief",
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        projectId: issue.projectId
      });
      const kbStats = await ctx.state.get(kbStatsKey(companyId)) ?? emptyKBStats();
      kbStats.generatedBriefs++;
      kbStats.lastBriefAt = (/* @__PURE__ */ new Date()).toISOString();
      await ctx.state.set(kbStatsKey(companyId), kbStats);
      return { ok: true, brief };
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
    ctx.actions.register("memory:update-config", async (params) => {
      const updates = params.config;
      if (!updates || typeof updates !== "object") {
        return { ok: false, error: "Missing config object" };
      }
      const newCfg = { ...cfg, ...updates };
      const port2 = process.env.PORT || "3100";
      try {
        const pluginId = params._pluginId || "";
        const res = await fetch(`http://localhost:${port2}/api/plugins/animusystems.agent-memory/config`, {
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
              llmExtractionModel: newCfg.llmExtractionModel
            }
          }),
          signal: AbortSignal.timeout(5e3)
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, error: `Config save failed (${res.status}): ${text.substring(0, 200)}` };
        }
        Object.assign(cfg, updates);
        const companyId = params.companyId;
        if (companyId) {
          await ctx.state.set(
            { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" },
            null
          ).catch(() => {
          });
        }
        return { ok: true, config: newCfg };
      } catch (err) {
        return { ok: false, error: String(err).substring(0, 200) };
      }
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
        const jobRaw = await ctx.config.get();
        const jobCfg = { ...DEFAULT_CONFIG, ...jobRaw };
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
            lastCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
            config: {
              autoExtract: jobCfg.autoExtract,
              autoInject: jobCfg.autoInject,
              maxMemoriesPerInjection: jobCfg.maxMemoriesPerInjection,
              injectionTokenBudget: jobCfg.injectionTokenBudget,
              extractionMode: jobCfg.extractionMode,
              llmExtractionModel: jobCfg.llmExtractionModel,
              llmFallbackModel: jobCfg.llmFallbackModel
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
    ctx.jobs.register("autodream-consolidate", async () => {
      let companyId = "";
      try {
        const stored = await ctx.state.get({ scopeKind: "instance", stateKey: "known-company-id" });
        if (stored && typeof stored === "string") companyId = stored;
      } catch {
      }
      if (!companyId) {
        ctx.logger.debug("AutoDream: no company context yet");
        return;
      }
      ctx.logger.info("AutoDream consolidation starting", { companyId });
      const agents = await ctx.agents.list({ companyId });
      const results = [];
      const agentMemoriesMap = /* @__PURE__ */ new Map();
      for (const agent of agents.slice(0, 30)) {
        try {
          const result = await consolidateAgent(client, agent.id, agent.name || agent.id, companyId);
          results.push(result);
          if (result.memoriesBefore > 0) {
            const memories = await client.listMemories(agent.id, companyId);
            agentMemoriesMap.set(agent.id, memories);
          }
        } catch (err) {
          ctx.logger.warn("AutoDream: failed to consolidate agent", { agentId: agent.id, error: String(err) });
        }
      }
      const crossFacts = findCrossAgentFacts(agentMemoriesMap, 3);
      const totalDupes = results.reduce((s, r) => s + r.duplicatesRemoved, 0);
      const totalStale = results.reduce((s, r) => s + r.staleArchived, 0);
      await ctx.state.set(
        { scopeKind: "company", scopeId: companyId, stateKey: "autodream-last-run" },
        {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          agentsProcessed: results.length,
          totalDuplicatesFound: totalDupes,
          totalStaleFound: totalStale,
          crossAgentFacts: crossFacts.length,
          results: results.filter((r) => r.duplicatesRemoved > 0 || r.staleArchived > 0 || r.errors.length > 0)
        }
      );
      await ctx.activity.log({
        companyId,
        message: `AutoDream: consolidated ${results.length} agents \u2014 ${totalDupes} duplicates, ${totalStale} stale, ${crossFacts.length} cross-agent facts`,
        metadata: { totalDupes, totalStale, crossAgentFacts: crossFacts.length }
      });
      ctx.logger.info("AutoDream consolidation complete", {
        agentsProcessed: results.length,
        totalDupes,
        totalStale,
        crossAgentFacts: crossFacts.length
      });
    });
    ctx.jobs.register("kb-folder-watch", async () => {
      const latestRaw = await ctx.config.get();
      const latestCfg = { ...DEFAULT_CONFIG, ...latestRaw };
      const watchFolders = latestCfg.kbWatchFolders ?? [];
      if (watchFolders.length === 0) return;
      let companyId = "";
      try {
        const stored = await ctx.state.get({ scopeKind: "instance", stateKey: "known-company-id" });
        if (stored && typeof stored === "string") companyId = stored;
      } catch {
      }
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
    });
    ctx.data.register("memory:status", async (params) => {
      const companyId = params.companyId;
      const cached = await ctx.state.get(
        { scopeKind: "company", scopeId: companyId, stateKey: "memos-status" }
      );
      if (cached) {
        const latestRaw = await ctx.config.get();
        const latestCfg = { ...DEFAULT_CONFIG, ...latestRaw };
        return {
          ...cached,
          config: {
            autoExtract: latestCfg.autoExtract,
            autoInject: latestCfg.autoInject,
            maxMemoriesPerInjection: latestCfg.maxMemoriesPerInjection,
            injectionTokenBudget: latestCfg.injectionTokenBudget,
            extractionMode: latestCfg.extractionMode,
            llmExtractionModel: latestCfg.llmExtractionModel,
            llmFallbackModel: latestCfg.llmFallbackModel
          }
        };
      }
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
      const freshRaw = await ctx.config.get();
      const freshCfg = { ...DEFAULT_CONFIG, ...freshRaw };
      const result = {
        memosConnected: healthy,
        memosUrl: freshCfg.memosUrl,
        embedderBackend: "ollama (nomic-embed-text)",
        chatProvider: "openrouter (gpt-4o-mini)",
        totalMemories,
        agentsWithMemory,
        agentsScanned,
        totalAgents,
        lastCheckAt: (/* @__PURE__ */ new Date()).toISOString(),
        config: {
          autoExtract: freshCfg.autoExtract,
          autoInject: freshCfg.autoInject,
          maxMemoriesPerInjection: freshCfg.maxMemoriesPerInjection,
          injectionTokenBudget: freshCfg.injectionTokenBudget,
          extractionMode: freshCfg.extractionMode,
          llmExtractionModel: freshCfg.llmExtractionModel,
          llmFallbackModel: freshCfg.llmFallbackModel
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
