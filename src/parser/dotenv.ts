import { EnvGuardConfigError } from '../errors.js';

export interface ParseDotenvOptions {
  /**
   * Maximum allowed file size in bytes to prevent Denial of Service attacks.
   * Default: 5MB (5 * 1024 * 1024 bytes)
   */
  maxBytes?: number;

  /**
   * If true, throws or records warnings when duplicate keys are encountered.
   * Default: false (standard dotenv behavior: last value wins)
   */
  detectDuplicates?: boolean;
}

export interface ParseDotenvResult {
  env: Record<string, string>;
  duplicateKeys: string[];
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Safe, zero-eval parser for .env files.
 * Correctly parses key-value pairs without executing any arbitrary scripts or shell substitutions.
 * Strips UTF-8 Byte Order Marks (BOM), guards against Denial-of-Service via file size limits,
 * and handles multi-line strings, escapes, and CRLF line breaks.
 */
export function parseDotenv(
  content: string,
  options: ParseDotenvOptions = {}
): Record<string, string> {
  const { env } = parseDotenvWithMetadata(content, options);
  return env;
}

/**
 * Advanced dotenv parser that also returns structural metadata such as duplicate keys.
 */
export function parseDotenvWithMetadata(
  content: string,
  options: ParseDotenvOptions = {}
): ParseDotenvResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (typeof content !== 'string') {
    throw new EnvGuardConfigError('Dotenv content must be a string.');
  }

  // Guard against oversized inputs / memory exhaustion DoS
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > maxBytes) {
    throw new EnvGuardConfigError(
      `Dotenv content exceeds maximum allowed size (${byteLength} bytes > ${maxBytes} bytes limit).`
    );
  }

  // Strip UTF-8 Byte Order Mark (BOM) if present
  let cleanContent = content;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }

  const result: Record<string, string> = {};
  const duplicateKeys: string[] = [];
  const seenKeys = new Set<string>();

  const lines = cleanContent.split(/\r?\n/);

  let currentKey: string | null = null;
  let currentValue = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Multi-line double-quoted value continuation
    if (inDoubleQuote) {
      const closingIndex = findClosingQuote(line, '"');
      if (closingIndex !== -1) {
        currentValue += '\n' + line.slice(0, closingIndex);
        inDoubleQuote = false;
        if (currentKey) {
          assignKey(currentKey, unescapeDoubleQuotes(currentValue));
          currentKey = null;
          currentValue = '';
        }
      } else {
        currentValue += '\n' + line;
      }
      continue;
    }

    // Multi-line single-quoted value continuation
    if (inSingleQuote) {
      const closingIndex = line.indexOf("'");
      if (closingIndex !== -1) {
        currentValue += '\n' + line.slice(0, closingIndex);
        inSingleQuote = false;
        if (currentKey) {
          assignKey(currentKey, currentValue);
          currentKey = null;
          currentValue = '';
        }
      } else {
        currentValue += '\n' + line;
      }
      continue;
    }

    const trimmed = line.trim();

    // Ignore empty lines and comment lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Strip optional "export " prefix
    const lineWithoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;

    // Find first equals sign
    const equalsIndex = lineWithoutExport.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = lineWithoutExport.slice(0, equalsIndex).trim();

    // Disallow dangerous keys to prevent prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let rawVal = lineWithoutExport.slice(equalsIndex + 1).trim();

    // Check for quoted values
    if (rawVal.startsWith('"')) {
      const closingIndex = findClosingQuote(rawVal.slice(1), '"');
      if (closingIndex !== -1) {
        assignKey(key, unescapeDoubleQuotes(rawVal.slice(1, closingIndex + 1)));
      } else {
        inDoubleQuote = true;
        currentKey = key;
        currentValue = rawVal.slice(1);
      }
    } else if (rawVal.startsWith("'")) {
      const closingIndex = rawVal.indexOf("'", 1);
      if (closingIndex !== -1) {
        assignKey(key, rawVal.slice(1, closingIndex));
      } else {
        inSingleQuote = true;
        currentKey = key;
        currentValue = rawVal.slice(1);
      }
    } else {
      // Unquoted value: strip trailing comment if preceded by space
      const commentIndex = rawVal.search(/\s+#/);
      if (commentIndex !== -1) {
        rawVal = rawVal.slice(0, commentIndex);
      }
      assignKey(key, rawVal.trim());
    }
  }

  function assignKey(k: string, val: string) {
    if (seenKeys.has(k)) {
      if (!duplicateKeys.includes(k)) {
        duplicateKeys.push(k);
      }
    } else {
      seenKeys.add(k);
    }
    result[k] = val;
  }

  return { env: result, duplicateKeys };
}

function findClosingQuote(str: string, quoteChar: string): number {
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (char === quoteChar && !escaped) {
      return i;
    }
    escaped = false;
  }
  return -1;
}

function unescapeDoubleQuotes(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
