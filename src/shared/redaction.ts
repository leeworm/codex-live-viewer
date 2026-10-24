/**
 * Shared, DOM-safe credential masking for text previews and main-process output.
 * Identifiers and arbitrary hashes remain intact; these are recognizable credentials only.
 */
export function redactCredentialText(text: string): string {
  return text.replace(/\bsk-(?:or-v1-|proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g, '[redacted]');
}

const SECRET_SHAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted private key]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g, '[redacted]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, '[redacted]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[redacted]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[redacted]'],
  [/\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, '[redacted]'],
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted]'],
  [/\b(Authorization:\s*(?:Basic|Bearer|Token))\s+[^\s"']+/gi, '$1 [redacted]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g, 'Bearer [redacted]'],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[redacted]@'],
  [/(\/mcp\/[a-z0-9-]+\/)[A-Za-z0-9_-]{20,}/g, '$1[redacted]']
];

/**
 * Masks known credentials before applying viewer length caps.
 * This is deliberately conservative, not an exhaustive arbitrary-secret detector.
 */
export function redactSecretText(text: string): string {
  let out = redactCredentialText(text);
  for (const [pattern, replacement] of SECRET_SHAPES) out = out.replace(pattern, replacement);
  return out;
}
