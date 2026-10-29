/**
 * Safe, zero-eval parser for .env files.
 * Correctly parses key-value pairs without executing any arbitrary scripts or shell substitutions.
 */
export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  let currentKey: string | null = null;
  let currentValue = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (const line of lines) {
    // If we're inside a multiline quote
    if (inDoubleQuote) {
      const closingIndex = findClosingQuote(line, '"');
      if (closingIndex !== -1) {
        currentValue += '\n' + line.slice(0, closingIndex);
        inDoubleQuote = false;
        if (currentKey) {
          result[currentKey] = unescapeDoubleQuotes(currentValue);
          currentKey = null;
          currentValue = '';
        }
      } else {
        currentValue += '\n' + line;
      }
      continue;
    }

    if (inSingleQuote) {
      const closingIndex = line.indexOf("'");
      if (closingIndex !== -1) {
        currentValue += '\n' + line.slice(0, closingIndex);
        inSingleQuote = false;
        if (currentKey) {
          result[currentKey] = currentValue;
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

    // Find the first equals sign
    const equalsIndex = lineWithoutExport.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = lineWithoutExport.slice(0, equalsIndex).trim();
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    let rawVal = lineWithoutExport.slice(equalsIndex + 1).trim();

    // Check for quoted values
    if (rawVal.startsWith('"')) {
      const closingIndex = findClosingQuote(rawVal.slice(1), '"');
      if (closingIndex !== -1) {
        result[key] = unescapeDoubleQuotes(rawVal.slice(1, closingIndex + 1));
      } else {
        // Multi-line double quote starts
        inDoubleQuote = true;
        currentKey = key;
        currentValue = rawVal.slice(1);
      }
    } else if (rawVal.startsWith("'")) {
      const closingIndex = rawVal.indexOf("'", 1);
      if (closingIndex !== -1) {
        result[key] = rawVal.slice(1, closingIndex);
      } else {
        // Multi-line single quote starts
        inSingleQuote = true;
        currentKey = key;
        currentValue = rawVal.slice(1);
      }
    } else {
      // Unquoted value: strip trailing comments if separated by space
      const commentIndex = rawVal.search(/\s+#/);
      if (commentIndex !== -1) {
        rawVal = rawVal.slice(0, commentIndex);
      }
      result[key] = rawVal.trim();
    }
  }

  return result;
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
