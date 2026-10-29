import { z } from 'zod';
export const folderNameSchema = z.string().trim().min(1).max(255).refine((value) => value !== '.' && value !== '..' && !/[\\/]/u.test(value) && !Array.from(value).some((char) => char.charCodeAt(0) < 32));
export const organizationSettingsSchema = z.strictObject({
  autoCharacterFolders: z.boolean().default(false),
  characterFolders: z.record(z.string(), folderNameSchema).default({}),
});
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;
export const DEFAULT_ORGANIZATION: OrganizationSettings = { autoCharacterFolders: false, characterFolders: {} };
export function charactersForTags(tags: readonly string[], settings: OrganizationSettings): string[] {
  const found = new Map<string, string>();
  for (const tag of tags) {
    const mapping = Object.entries(settings.characterFolders).find(([name]) => name.toLocaleLowerCase('en-US') === tag.toLocaleLowerCase('en-US'))?.[1];
    const parsed = folderNameSchema.safeParse(mapping ?? /^character\s*:\s*(.+)$/iu.exec(tag)?.[1]);
    if (parsed.success) found.set(parsed.data.toLocaleLowerCase('en-US'), parsed.data);
  }
  return [...found.values()];
}
/** This is a storage policy, not tag-assignment behavior. Call only after opt-in. */
export function physicalCharacterFolder(tags: readonly string[], settings: OrganizationSettings): string | null {
  if (!settings.autoCharacterFolders) return null;
  const characters = charactersForTags(tags, settings);
  return characters.length === 1 ? characters[0]! : characters.length > 1 ? 'Shared' : 'Unassigned';
}
export const vaultTriggerSchema = z.enum(['manual', 'nsfw', 'vault', 'nsfw-or-vault']);
export type VaultTrigger = z.infer<typeof vaultTriggerSchema>;
export function matchesVaultTrigger(tags: readonly string[], trigger: VaultTrigger): boolean {
  const names = tags.map((name) => name.trim().toLocaleLowerCase('en-US'));
  return trigger === 'nsfw' ? names.includes('nsfw') : trigger === 'vault' ? names.includes('vault') : trigger === 'nsfw-or-vault' ? names.includes('nsfw') || names.includes('vault') : false;
}

export const ORGANIZATION_CHANNEL = 'gen-library:organization';
export const organizationRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('get'), libraryId: z.string().min(1).max(255) }),
  z.strictObject({ operation: z.literal('set'), libraryId: z.string().min(1).max(255), settings: organizationSettingsSchema }),
  z.strictObject({ operation: z.literal('organize-existing'), libraryId: z.string().min(1).max(255) }),
]);
export type OrganizationRequest = z.infer<typeof organizationRequestSchema>;
export const organizationResponseSchema = z.strictObject({ settings: organizationSettingsSchema, movedCount: z.number().int().nonnegative().optional(), skippedCount: z.number().int().nonnegative().optional(), error: z.string().optional() });
export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;
export type OrganizationApi = { request(input: OrganizationRequest): Promise<OrganizationResponse> };
