/**
 * Content sanitizer — detects and redacts sensitive data before storing in MemOS.
 * Also provides file-level exclusion for folder indexing.
 */

import { basename } from "node:path";

// ── Sensitive file detection ────────────────────────────────

const SENSITIVE_FILENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.staging",
  ".env.test",
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".pgpass",
  ".my.cnf",
  ".docker/config.json",
  "credentials.json",
  "credentials.yaml",
  "credentials.yml",
  "service-account.json",
  "serviceAccountKey.json",
  "secrets.json",
  "secrets.yaml",
  "secrets.yml",
  "vault.json",
  ".htpasswd",
  "shadow",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "id_dsa",
  "known_hosts",
  "authorized_keys",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".crt",
  ".cer",
  ".der",
  ".pkcs8",
]);

/** Returns true if the file should be excluded from indexing. */
export function isSensitiveFile(filePath: string): boolean {
  const name = basename(filePath).toLowerCase();

  // Exact match on known sensitive filenames
  if (SENSITIVE_FILENAMES.has(name)) return true;

  // Check extensions
  for (const ext of SENSITIVE_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }

  // Pattern-based exclusions
  if (name.startsWith(".env")) return true; // .env.anything
  if (name.includes("credential")) return true;
  if (name.includes("secret") && (name.endsWith(".json") || name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".toml"))) return true;

  return false;
}

// ── Content-level sensitive data detection ───────────────────

interface ScanResult {
  hasSensitiveData: boolean;
  detections: Detection[];
  redactedContent: string;
}

interface Detection {
  type: string;
  count: number;
}

// Patterns for sensitive data — ordered by specificity
const SENSITIVE_PATTERNS: Array<{ name: string; regex: RegExp; redaction: string }> = [
  // Credit card numbers (Visa, MC, Amex, Discover)
  {
    name: "credit_card",
    regex: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{1,4}\b/g,
    redaction: "[REDACTED:credit_card]",
  },
  // IBAN
  {
    name: "iban",
    regex: /\b[A-Z]{2}\d{2}[- ]?[A-Z0-9]{4}[- ]?(?:\d{4}[- ]?){2,7}\d{1,4}\b/g,
    redaction: "[REDACTED:iban]",
  },
  // Social Security Numbers (US)
  {
    name: "ssn",
    regex: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,
    redaction: "[REDACTED:ssn]",
  },
  // Private keys (PEM format)
  {
    name: "private_key",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    redaction: "[REDACTED:private_key]",
  },
  // AWS Access Keys
  {
    name: "aws_key",
    regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    redaction: "[REDACTED:aws_key]",
  },
  // AWS Secret Keys
  {
    name: "aws_secret",
    regex: /(?<=aws_secret_access_key\s*=\s*|AWS_SECRET_ACCESS_KEY\s*=\s*)[A-Za-z0-9/+=]{40}/g,
    redaction: "[REDACTED:aws_secret]",
  },
  // Generic API keys (sk-xxx, key-xxx, api_key=xxx patterns)
  {
    name: "api_key",
    regex: /\b(?:sk-(?:or-v1-)?[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9\-]{20,}|xox[bps]-[a-zA-Z0-9\-]{10,})\b/g,
    redaction: "[REDACTED:api_key]",
  },
  // Password assignments (password = "xxx", password: xxx, etc.)
  {
    name: "password",
    regex: /(?:password|passwd|pwd|secret|token|api_key|apikey|access_token|auth_token)[\s]*[:=][\s]*["']?[^\s"',;}{]{6,}["']?/gi,
    redaction: "[REDACTED:password]",
  },
  // Bearer tokens
  {
    name: "bearer_token",
    regex: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g,
    redaction: "[REDACTED:bearer_token]",
  },
  // Connection strings with credentials
  {
    name: "connection_string",
    regex: /(?:postgres|mysql|mongodb|redis|amqp|smtp):\/\/[^:]+:[^@]+@[^\s"']+/gi,
    redaction: "[REDACTED:connection_string]",
  },
  // JWT tokens (3 base64 sections separated by dots)
  {
    name: "jwt",
    regex: /\beyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g,
    redaction: "[REDACTED:jwt]",
  },
];

/** Scan content for sensitive data and return redacted version. */
export function scanAndRedact(content: string): ScanResult {
  const detections: Detection[] = [];
  let redacted = content;

  for (const pattern of SENSITIVE_PATTERNS) {
    const matches = redacted.match(pattern.regex);
    if (matches && matches.length > 0) {
      detections.push({ type: pattern.name, count: matches.length });
      redacted = redacted.replace(pattern.regex, pattern.redaction);
    }
  }

  return {
    hasSensitiveData: detections.length > 0,
    detections,
    redactedContent: redacted,
  };
}

/** Quick check — returns true if content likely contains sensitive data. */
export function containsSensitiveData(content: string): boolean {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.regex.test(content)) {
      pattern.regex.lastIndex = 0; // reset stateful regex
      return true;
    }
    pattern.regex.lastIndex = 0;
  }
  return false;
}

/** Format detection summary for logging. */
export function formatDetectionSummary(detections: Detection[]): string {
  if (detections.length === 0) return "clean";
  return detections.map((d) => `${d.count}x ${d.type}`).join(", ");
}
