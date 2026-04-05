/**
 * LLM-based memory extraction from agent run summaries.
 *
 * Calls OpenRouter (gpt-4o-mini) to extract structured memories
 * when rule-based extraction yields insufficient results.
 *
 * Cost: ~$0.0003 per extraction (2K token summary at $0.15/1M input).
 */

import type { ExtractedMemory } from "./extractor.js";

const EXTRACTION_PROMPT = `You are a memory extraction system for an AI agent platform. Given an agent's run summary, extract distinct, self-contained facts, decisions, learnings, and preferences.

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

const MAX_SUMMARY_CHARS = 3000;

export interface LlmExtractorConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModel?: string;
}

/**
 * Extract memories from a run summary using an LLM.
 * Returns empty array on any failure (best-effort).
 */
export async function extractMemoriesWithLlm(
  summary: string,
  config: LlmExtractorConfig,
): Promise<ExtractedMemory[]> {
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
          "X-Title": "Paperclip Memory Extraction",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            { role: "user", content: `Extract memories from this agent run summary:\n\n${truncatedSummary}` },
          ],
          max_tokens: 1024,
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        if (res.status === 429 && modelsToTry.indexOf(model) < modelsToTry.length - 1) continue;
        return [];
      }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data?.choices?.[0]?.message?.content;
    if (!content) return [];

    // Parse the JSON response — handle both array and object-wrapped formats
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to extract JSON array from the response text
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try { parsed = JSON.parse(arrayMatch[0]); } catch { return []; }
      } else {
        return [];
      }
    }

    // Handle { memories: [...] } wrapper
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.memories)) parsed = obj.memories;
      else if (Array.isArray(obj.results)) parsed = obj.results;
      else if (Array.isArray(obj.extractions)) parsed = obj.extractions;
      else return [];
    }

    if (!Array.isArray(parsed)) return [];

    const results: ExtractedMemory[] = [];
    for (const item of parsed) {
      const m = item as { content?: string; category?: string; confidence?: number };
      if (!m.content || typeof m.content !== "string") continue;
      if (m.content.length < 15 || m.content.length > 300) continue;

      const category = (["decision", "learning", "fact", "preference", "note"] as const)
        .includes(m.category as ExtractedMemory["category"])
        ? (m.category as ExtractedMemory["category"])
        : "note";

      const confidence = typeof m.confidence === "number"
        ? Math.max(0, Math.min(1, m.confidence))
        : 0.7;

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
