/** A memory record as stored/retrieved from MemOS. */
export interface Memory {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** Metadata attached to every memory write. */
export interface MemoryMetadata {
  agentId: string;
  agentName: string;
  companyId: string;
  projectId?: string;
  issueId?: string;
  runId?: string;
  source: "auto_extract" | "agent_tool" | "manual" | "event";
  category?: "decision" | "learning" | "fact" | "preference" | "note";
  confidence?: number;
  tags?: string[];
}

/** Plugin stats stored in plugin state. */
export interface MemoryStats {
  totalStored: number;
  totalInjected: number;
  totalSearches: number;
  lastStoreAt?: string;
  lastInjectAt?: string;
  byAgent: Record<string, { stored: number; injected: number }>;
}

/** Config shape matching the manifest schema. */
export interface MemoryPluginConfig {
  enabled: boolean;
  memosUrl: string;
  autoExtract: boolean;
  autoInject: boolean;
  maxMemoriesPerInjection: number;
  injectionTokenBudget: number;
  extractionMode: "rule_based" | "llm" | "hybrid";
  llmExtractionModel: string;
  llmFallbackModel: string;
  // Knowledge Base
  kbAutoIndex: boolean;
  kbAutoBreif: boolean;
  kbBriefModel: string;
}

/** A knowledge base entry indexed from completed work or uploaded documents. */
export interface KBEntry {
  id: string;
  content: string;
  title: string;
  source: "issue_completion" | "document" | "executive_brief";
  issueId?: string;
  issueIdentifier?: string;
  projectId?: string;
  agentId?: string;
  agentName?: string;
  tags?: string[];
  createdAt?: string;
}

/** KB stats stored in plugin state. */
export interface KBStats {
  indexedIssues: number;
  uploadedDocuments: number;
  generatedBriefs: number;
  lastIndexAt?: string;
  lastBriefAt?: string;
}
