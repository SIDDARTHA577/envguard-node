/**
 * Dependency-free Unified Diff Generator for EnvGuard reviewable fixes.
 * Produces standard unidiff strings suitable for CLI preview and patch review.
 *
 * @param {string} filePath - Relative file path being diffed
 * @param {string|null} originalContent - Original file content (or null if new file)
 * @param {string} proposedContent - Proposed modified content
 * @returns {string} Standard unified diff string
 */
export function generateUnifiedDiff(filePath, originalContent, proposedContent) {
  const isNewFile = originalContent === null || originalContent === undefined;
  
  const splitLines = (text) => {
    if (text === null || text === undefined || text === '') return [];
    const normalized = String(text).replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines;
  };

  const origLines = isNewFile ? [] : splitLines(originalContent);
  const propLines = splitLines(proposedContent);

  const oldHeader = isNewFile ? '/dev/null' : `a/${filePath}`;
  const newHeader = `b/${filePath}`;

  let diff = `--- ${oldHeader}\n+++ ${newHeader}\n`;

  if (isNewFile) {
    diff += `@@ -0,0 +1,${propLines.length} @@\n`;
    for (const line of propLines) {
      diff += `+${line}\n`;
    }
    return diff;
  }

  // Simple, deterministic unified hunk generation
  const hunks = [];
  let i = 0;
  let j = 0;

  // Find differing regions
  while (i < origLines.length || j < propLines.length) {
    if (i < origLines.length && j < propLines.length && origLines[i] === propLines[j]) {
      i++;
      j++;
    } else {
      const startOrig = i;
      const startProp = j;

      const removed = [];
      const added = [];

      while (i < origLines.length && (j >= propLines.length || origLines[i] !== propLines[j])) {
        removed.push(origLines[i]);
        i++;
      }
      while (j < propLines.length && (i >= origLines.length || origLines[i] !== propLines[j])) {
        added.push(propLines[j]);
        j++;
      }

      hunks.push({
        origStart: startOrig + 1,
        origCount: removed.length,
        propStart: startProp + 1,
        propCount: added.length,
        removed,
        added,
      });
    }
  }

  if (hunks.length === 0) {
    return `${diff}@@ -1 +1 @@\n (No changes)\n`;
  }

  for (const h of hunks) {
    diff += `@@ -${h.origStart},${h.origCount} +${h.propStart},${h.propCount} @@\n`;
    for (const r of h.removed) {
      diff += `-${r}\n`;
    }
    for (const a of h.added) {
      diff += `+${a}\n`;
    }
  }

  return diff;
}
