import { z } from 'zod';
export type SmartFolderRule =
  | { kind: 'all' | 'any'; rules: SmartFolderRule[] }
  | { kind: 'not'; rule: SmartFolderRule }
  | { kind: 'tag' | 'character' | 'contentLevel'; value: string }
  | { kind: 'rating'; operator: 'is' | 'atLeast' | 'atMost'; value: number }
  | { kind: 'favorite'; value: boolean }
  | { kind: 'author' | 'description' | 'metadata'; value: string };
const text = z.string().trim().min(1).max(255);
const leaves = [
  z.strictObject({ kind: z.enum(['tag', 'character', 'contentLevel']), value: text }),
  z.strictObject({ kind: z.literal('rating'), operator: z.enum(['is', 'atLeast', 'atMost']), value: z.number().int().min(0).max(5) }),
  z.strictObject({ kind: z.literal('favorite'), value: z.boolean() }),
  z.strictObject({ kind: z.enum(['author', 'description', 'metadata']), value: text }),
] as const;
function boundedRule(depth: number): z.ZodType<SmartFolderRule> {
  if (depth >= 8) return z.union(leaves);
  return z.union([...leaves,
    z.strictObject({ kind: z.enum(['all', 'any']), rules: z.array(z.lazy(() => boundedRule(depth + 1))).min(1).max(32) }),
    z.strictObject({ kind: z.literal('not'), rule: z.lazy(() => boundedRule(depth + 1)) }),
  ]);
}
export const smartFolderRuleSchema = boundedRule(0).superRefine((rule, context) => {
  let count = 0; const pending = [rule];
  while (pending.length) { const item = pending.pop()!; if (++count > 512) { context.addIssue({ code: 'custom', message: 'A Smart Folder supports up to 512 rule nodes.' }); break; } if ('rules' in item) pending.push(...item.rules); else if (item.kind === 'not') pending.push(item.rule); }
});
/** Exclusion wins, including when an item also matches rules or an inclusion. */
export function withSmartFolderOverride<T extends { includeAssetIds?: string[]; excludeAssetIds?: string[] }>(definition: T, assetIds: readonly string[], choice: 'include' | 'exclude' | 'automatic'): T {
  const selected = new Set(assetIds);
  const include = (definition.includeAssetIds ?? []).filter((id) => !selected.has(id));
  const exclude = (definition.excludeAssetIds ?? []).filter((id) => !selected.has(id));
  return { ...definition, includeAssetIds: choice === 'include' ? [...new Set([...include, ...assetIds])] : include, excludeAssetIds: choice === 'exclude' ? [...new Set([...exclude, ...assetIds])] : exclude };
}
