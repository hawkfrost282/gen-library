import { z } from 'zod';
export const characterFolderSchema = z.string().trim().min(1).max(80).refine((name) => name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\') && !Array.from(name).some((char) => char.charCodeAt(0) < 32));
export const routedMetadataSchema = z.strictObject({
  description: z.string().nullable(), rating: z.number().int().min(0).max(5), favorite: z.boolean(),
  palette: z.array(z.string()).max(20).nullable(), sourcePageUrl: z.string().nullable(), author: z.string().nullable(),
  tags: z.array(z.string().min(1).max(255)).max(1000),
});
export type RoutedMetadata = z.infer<typeof routedMetadataSchema>;
export const vaultSourceSchema = z.strictObject({
  libraryId: z.string().min(1), assetId: z.string().min(1), revisionId: z.string().min(1),
  sourcePath: z.string().min(1).max(4096), fileName: z.string().min(1).max(255).refine((name) => !name.includes('/') && !name.includes('\\') && !Array.from(name).some((char) => char.charCodeAt(0) < 32) && name !== '.' && name !== '..'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), metadataHash: z.string().regex(/^[a-f0-9]{64}$/u), metadata: routedMetadataSchema,
});
export type VaultSource = z.infer<typeof vaultSourceSchema>;
export const vaultTransferSchema = z.strictObject({ transferId: z.string().uuid(), verificationNonce: z.string().uuid(), source: vaultSourceSchema, folder: characterFolderSchema });
export type VaultTransfer = z.infer<typeof vaultTransferSchema>;
export const vaultReceiptSchema = z.strictObject({ transferId: z.string().uuid(), verificationNonce: z.string().uuid(), assetId: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/u), metadataHash: z.string().regex(/^[a-f0-9]{64}$/u) });
export type VaultReceipt = z.infer<typeof vaultReceiptSchema>;
export const routingConfigSchema = z.strictObject({ enabled: z.boolean(), automatic: z.boolean(), vaultImage: z.string().nullable(), characterFolders: z.record(z.string(), characterFolderSchema) });
export type RoutingConfig = z.infer<typeof routingConfigSchema>;
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = { enabled: false, automatic: false, vaultImage: null, characterFolders: {} };
export const routingStateSchema = z.strictObject({ config: routingConfigSchema, busy: z.boolean(), pending: z.array(z.strictObject({ id: z.string().uuid(), name: z.string(), tags: z.array(z.string()), folder: characterFolderSchema.nullable(), error: z.string().optional() })), message: z.string().optional() });
export type RoutingState = z.infer<typeof routingStateSchema>;
export function isNsfwTag(name: string): boolean { return name.trim().toLocaleLowerCase('en-US') === 'nsfw'; }
export function characterFolder(tags: readonly string[], config: RoutingConfig): string | null {
  const candidates = new Set<string>();
  for (const tag of tags) {
    const mapped = Object.entries(config.characterFolders).find(([key]) => key.toLocaleLowerCase('en-US') === tag.toLocaleLowerCase('en-US'))?.[1];
    const prefixed = /^character\s*:\s*(.+)$/iu.exec(tag)?.[1];
    const parsed = characterFolderSchema.safeParse(mapped ?? prefixed); if (parsed.success) candidates.add(parsed.data);
  }
  return candidates.size === 1 ? [...candidates][0]! : null;
}
export function canonicalMetadata(value: RoutedMetadata): RoutedMetadata {
  return { description: value.description, rating: value.rating, favorite: value.favorite, palette: value.palette, sourcePageUrl: value.sourcePageUrl, author: value.author, tags: [...new Set(value.tags)].sort() };
}
