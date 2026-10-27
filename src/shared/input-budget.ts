/** Bound validation work before handing arbitrary JSON to third-party protocol validators. */
export function assertInputBudget(value: unknown, maxElements = 10_000, maxDepth = 64): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let elements = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++elements > maxElements || item.depth > maxDepth) throw new Error('Request structure is too complex.');
    if (item.value !== null && typeof item.value === 'object') {
      const values = Object.values(item.value);
      if (elements + pending.length + values.length > maxElements) throw new Error('Request contains too many elements.');
      for (const child of values) pending.push({ value: child, depth: item.depth + 1 });
    }
  }
}
