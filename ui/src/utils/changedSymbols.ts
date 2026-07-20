const DECLARATION_PATTERNS = [
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:func|function|class|def|fn|type|interface|enum|struct|trait|const|let|var|package|module|namespace)\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/,
  /^func\s+\([^)]*\)\s*([A-Za-z_$][\w$]*)\s*\(/,
];

/** Best-effort declaration names from added/removed unified-diff lines. */
export function extractChangedSymbols(diff: string): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of diff.split("\n")) {
    if (!/^[+-]/.test(rawLine) || rawLine.startsWith("+++") || rawLine.startsWith("---")) {
      continue;
    }
    const line = rawLine.slice(1).trim();
    for (const pattern of DECLARATION_PATTERNS) {
      const name = line.match(pattern)?.[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      symbols.push(name);
      break;
    }
  }
  return symbols;
}
