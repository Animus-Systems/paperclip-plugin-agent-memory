/**
 * Rule-based memory extraction from agent run summaries.
 *
 * Scans text for decisions, learnings, facts, and preferences
 * without requiring an LLM call. Phase 3 will add LLM-based extraction.
 */

export interface ExtractedMemory {
  content: string;
  category: "decision" | "learning" | "fact" | "preference" | "note";
  confidence: number;
}

/** Patterns that signal a memory-worthy statement. */
const PATTERNS: Array<{
  category: ExtractedMemory["category"];
  patterns: RegExp[];
  confidence: number;
}> = [
  {
    category: "decision",
    confidence: 0.8,
    patterns: [
      /(?:decided|choosing|chose|went with|opted for|selected|picked)\s+(?:to\s+)?(.{15,200})/gi,
      /(?:the approach|our approach|my approach)\s+(?:is|was|will be)\s+(.{15,200})/gi,
      /(?:chose|prefer(?:red)?)\s+(.{10,150})\s+over\s+(.{10,150})/gi,
      /(?:going (?:to|with)|settling on|committing to)\s+(.{15,200})/gi,
    ],
  },
  {
    category: "learning",
    confidence: 0.75,
    patterns: [
      /(?:turns? out|discovered|found out|realized|learned|it appears)\s+(?:that\s+)?(.{15,200})/gi,
      /(?:the (?:issue|problem|bug|root cause|fix|solution))\s+(?:is|was)\s+(.{15,200})/gi,
      /(?:this (?:works|worked|fails|failed) because)\s+(.{15,200})/gi,
      /(?:key (?:insight|takeaway|finding)):\s*(.{15,200})/gi,
      /(?:important(?:ly)?|notably|crucially)[:,]?\s+(.{15,200})/gi,
    ],
  },
  {
    category: "fact",
    confidence: 0.7,
    patterns: [
      /(?:the (?:API|endpoint|URL|service|schema|database|table|config))\s+(?:is|uses|lives at|can be found at)\s+(.{10,200})/gi,
      /(?:located at|stored (?:in|at)|configured (?:in|via)|defined (?:in|at))\s+(.{10,200})/gi,
      /(?:the (?:password|key|token|secret|credential))\s+(?:is|for)\s+(.{10,150})/gi,
      /(?:version|port|host)\s+(?:is|=)\s+(.{5,100})/gi,
    ],
  },
  {
    category: "preference",
    confidence: 0.65,
    patterns: [
      /(?:(?:the )?user|they|he|she|client|stakeholder)\s+(?:prefers?|wants?|likes?|requested|asked for)\s+(.{15,200})/gi,
      /(?:always|never|must|should)\s+(.{15,200})/gi,
      /(?:convention|standard|rule)\s+(?:is|:)\s+(.{15,200})/gi,
    ],
  },
];

/** Minimum text length for extraction to run. */
const MIN_TEXT_LENGTH = 100;

/** Maximum memories to extract from a single run. */
const MAX_EXTRACTIONS = 8;

/**
 * Extract memory-worthy statements from agent output text.
 * Returns deduplicated, scored extraction results.
 */
export function extractMemories(text: string): ExtractedMemory[] {
  if (text.length < MIN_TEXT_LENGTH) return [];

  const results: ExtractedMemory[] = [];
  const seen = new Set<string>();

  for (const group of PATTERNS) {
    for (const pattern of group.patterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) && results.length < MAX_EXTRACTIONS) {
        const content = (match[1] || match[0]).trim();

        // Skip very short or very long matches
        if (content.length < 15 || content.length > 300) continue;

        // Skip duplicates (by normalized content)
        const key = content.toLowerCase().replace(/\s+/g, " ");
        if (seen.has(key)) continue;
        seen.add(key);

        // Skip if it looks like code or a path rather than a statement
        if (/^[{[\/(]/.test(content) || /\.(ts|js|py|json|yaml|yml)$/.test(content)) continue;

        results.push({
          content,
          category: group.category,
          confidence: group.confidence,
        });
      }
    }
  }

  // Sort by confidence descending, limit to MAX_EXTRACTIONS
  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_EXTRACTIONS);
}
