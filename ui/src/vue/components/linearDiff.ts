export interface LinearDiffEdit {
  kind: "context" | "added" | "removed";
  text: string;
}

/** Myers line diff. Produces a minimal edit script without quadratic memory. */
export function linearDiff(oldContent: string, newContent: string): LinearDiffEdit[] {
  const before = oldContent.split("\n");
  const after = newContent.split("\n");
  const max = before.length + after.length;
  const trace: Array<Map<number, number>> = [];
  const furthest = new Map<number, number>([[1, 0]]);

  for (let distance = 0; distance <= max; distance++) {
    trace.push(new Map(furthest));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = furthest.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
      const right = furthest.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
      let x = diagonal === -distance || (diagonal !== distance && right < down) ? down : right + 1;
      if (!Number.isFinite(x)) x = 0;
      let y = x - diagonal;
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x++;
        y++;
      }
      furthest.set(diagonal, x);
      if (x >= before.length && y >= after.length) {
        return backtrack(trace, before, after, distance);
      }
    }
  }
  throw new Error("Unable to compute line diff");
}

function backtrack(
  trace: Array<Map<number, number>>,
  before: string[],
  after: string[],
  finalDistance: number,
): LinearDiffEdit[] {
  let x = before.length;
  let y = after.length;
  const edits: LinearDiffEdit[] = [];

  for (let distance = finalDistance; distance >= 0; distance--) {
    const furthest = trace[distance];
    const diagonal = x - y;
    const down = furthest.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
    const right = furthest.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
    const previousDiagonal =
      diagonal === -distance || (diagonal !== distance && right < down)
        ? diagonal + 1
        : diagonal - 1;
    const previousX = furthest.get(previousDiagonal) ?? 0;
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      edits.push({ kind: "context", text: before[x - 1] });
      x--;
      y--;
    }
    if (distance === 0) break;
    if (x === previousX) {
      edits.push({ kind: "added", text: after[y - 1] });
      y--;
    } else {
      edits.push({ kind: "removed", text: before[x - 1] });
      x--;
    }
  }
  return edits.reverse();
}
