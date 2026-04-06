import type { Memory } from "./types";

// ── Parsed KB entry — consistent shape for all KB handlers ──

export interface ParsedKBEntry {
  id: string;
  title: string;
  source: string; // "issue_completion" | "document" | "executive_brief" | "unknown"
  agent: string | null;
  issue: string | null;
  cleanContent: string;
  excerpt: string;
  score?: number;
  tags: string[];
}

// ── Tag extraction regex ────────────────────────────────────

const TAG_REGEX = /\[(\w+(?:_\w+)*): ([^\]]+)\]/g;

function extractTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = TAG_REGEX.exec(raw)) !== null) {
    tags[m[1]] = m[2];
  }
  TAG_REGEX.lastIndex = 0; // reset stateful regex
  return tags;
}

function stripTags(raw: string): string {
  return raw.replace(/\[[\w_]+: [^\]]+\]\s*/g, "").trim();
}

// ── Title derivation ────────────────────────────────────────

export function deriveTitleFromContent(content: string): string {
  // 1. Try markdown heading
  const headingMatch = content.match(/^#+\s+(.+)/m);
  if (headingMatch && headingMatch[1].trim().length > 5) {
    return headingMatch[1].trim().substring(0, 100);
  }

  // 2. Try first substantial line
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.replace(/^[#*>\-\s]+/, "").trim();
    if (trimmed.length > 15 && trimmed.length < 120) {
      return trimmed;
    }
  }

  // 3. Fallback: first 80 chars
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.substring(0, 80) + (flat.length > 80 ? "..." : "");
}

// ── Main parser ─────────────────────────────────────────────

export function parseKBMemory(mem: Memory): ParsedKBEntry {
  const tags = extractTags(mem.content);
  const meta = mem.metadata ?? {};
  const cleanContent = stripTags(mem.content);

  // Title: tags > metadata > derive from content
  const title =
    tags["title"] ??
    (meta.name as string | undefined) ??
    deriveTitleFromContent(cleanContent);

  // Source: tags > metadata > unknown
  const source =
    tags["kb_source"] ??
    tags["source"] ??
    (meta.type as string | undefined) ??
    "unknown";

  // Agent
  const agent = tags["agent"] ?? (meta.agent as string | undefined) ?? null;

  // Issue
  const issue =
    tags["issue"] ?? (meta.issue as string | undefined) ?? null;

  // Tags array
  const tagList = tags["tags"]
    ? tags["tags"].split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // Excerpt
  const excerpt =
    cleanContent.substring(0, 200) +
    (cleanContent.length > 200 ? "..." : "");

  return {
    id: mem.id,
    title,
    source,
    agent,
    issue,
    cleanContent,
    excerpt,
    score: mem.score,
    tags: tagList,
  };
}
