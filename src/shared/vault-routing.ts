import { vaultTriggerSchema, physicalCharacterFolder, folderNameSchema } from './organization';
import { z } from 'zod';
export const characterFolderSchema = folderNameSchema;
export const relativeFolderSchema = z.string().max(4096).refine((value) => value === '' || value.split('/').every((part) => characterFolderSchema.safeParse(part).success));
export const routedMetadataSchema = z.strictObject({
  description: z.string().nullable(), rating: z.number().int().min(0).max(5), favorite: z.boolean(),
  palette: z.array(z.string()).max(20).nullable(), sourcePageUrl: z.string().nullable(), author: z.string().nullable(),
  tags: z.array(z.string().min(1).max(255)).max(1000),
  tagSources: z.record(z.string(), z.enum(['user','ai','both'])).optional(),
  aiTags: z.array(z.strictObject({ name: z.string(), modelId: z.string(), modelVersion: z.string() })).max(1000).optional(),
  aiContent: z.array(z.strictObject({ fieldName: z.string(), value: z.string(), modelId: z.string(), modelVersion: z.string(), generatedAt: z.string() })).max(1000).optional(),
});
export type RoutedMetadata = z.infer<typeof routedMetadataSchema>;
export const storageIdentitiesSchema = z.record(z.string().min(1).max(255), z.string().min(1).max(255));
export const vaultSourceSchema = z.strictObject({
  identities: storageIdentitiesSchema.optional(), libraryId: z.string().min(1), assetId: z.string().min(1), revisionId: z.string().min(1),
  relativeFolder: relativeFolderSchema.optional(), modifiedAt: z.string().datetime().optional(),
  sourcePath: z.string().min(1).max(4096), fileName: z.string().min(1).max(255).refine((name) => !name.includes('/') && !name.includes('\\') && !Array.from(name).some((char) => char.charCodeAt(0) < 32) && name !== '.' && name !== '..'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), metadataHash: z.string().regex(/^[a-f0-9]{64}$/u), metadata: routedMetadataSchema,
});
export type VaultSource = z.infer<typeof vaultSourceSchema>;
export const vaultTransferSchema = z.strictObject({ transferId: z.string().uuid(), verificationNonce: z.string().uuid(), source: vaultSourceSchema, folder: relativeFolderSchema });
export type VaultTransfer = z.infer<typeof vaultTransferSchema>;
export const vaultReceiptSchema = z.strictObject({ transferId: z.string().uuid(), verificationNonce: z.string().uuid(), assetId: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/u), metadataHash: z.string().regex(/^[a-f0-9]{64}$/u) });
export type VaultReceipt = z.infer<typeof vaultReceiptSchema>;
export const routingConfigSchema = z.strictObject({ enabled: z.boolean(), automatic: z.boolean(), trigger: vaultTriggerSchema.default('nsfw'), autoCharacterFolders: z.boolean().default(false), vaultState: z.enum(['enabled','disabling','disabled']).default('enabled'), vaultImage: z.string().nullable(), characterFolders: z.record(z.string(), characterFolderSchema) });
export type RoutingConfig = z.infer<typeof routingConfigSchema>;
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = { enabled: false, automatic: false, trigger: 'nsfw', autoCharacterFolders: false, vaultState: 'enabled', vaultImage: null, characterFolders: {} };
export const routingStateSchema = z.strictObject({ config: routingConfigSchema, busy: z.boolean(), pending: z.array(z.strictObject({ id: z.string().uuid(), name: z.string(), tags: z.array(z.string()), folder: relativeFolderSchema.nullable(), error: z.string().optional() })), message: z.string().optional(), needsExistingChoice: z.boolean().optional() });
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
  const tags = [...new Set(value.tags)].sort();
  return { description: value.description, rating: value.rating, favorite: value.favorite, palette: value.palette, sourcePageUrl: value.sourcePageUrl, author: value.author, tags, tagSources: Object.fromEntries(tags.map((name) => [name, value.tagSources?.[name] ?? 'user'])), aiTags: [...(value.aiTags ?? [])].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), aiContent: [...(value.aiContent ?? [])].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}

export function routedPhysicalFolder(tags: readonly string[], config: RoutingConfig, existingFolder: string): string {
  return physicalCharacterFolder(tags, { autoCharacterFolders: config.autoCharacterFolders, characterFolders: config.characterFolders }) ?? existingFolder;
}

export function catalogTagKey(name: string): string { return name.replace(/[A-Z]/gu, (letter) => letter.toLowerCase()); }
/** Case-insensitive tag identity matches the catalog's tag uniqueness contract; display spelling is preserved. */
export function comparableMetadata(value: RoutedMetadata): RoutedMetadata {
  const canonical = canonicalMetadata(value); const fold = catalogTagKey;
  return canonicalMetadata({ ...canonical, tags: canonical.tags.map(fold), tagSources: Object.fromEntries(Object.entries(canonical.tagSources ?? {}).map(([name, source]) => [fold(name), source])), aiTags: canonical.aiTags?.map((tag) => ({ ...tag, name: fold(tag.name) })) });
}
