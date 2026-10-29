import { organizationSettingsSchema } from './organization';
import { z } from 'zod';
import { vaultSourceSchema, relativeFolderSchema } from './vault-routing';
export const vaultInventorySchema = z.strictObject({
  libraryId: z.string().min(1),
  assets: z.array(z.strictObject({ assetId: z.string().min(1), name: z.string(), supported: z.boolean(), reason: z.string().optional() })),
  folders: z.array(z.strictObject({ folderId: z.string(), relativePath: relativeFolderSchema })),
  tags: z.array(z.strictObject({ tagId: z.string(), name: z.string() })),
  smartFolders: z.array(z.strictObject({ collectionId: z.string(), name: z.string(), queryDefinition: z.string() })),
  collections: z.array(z.strictObject({ collectionId: z.string(), parentId: z.string().nullable(), name: z.string(), description: z.string().nullable(), assetIds: z.array(z.string()) })),
});
export type VaultInventory = z.infer<typeof vaultInventorySchema>;
export const vaultReturnCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('inventory') }),
  z.strictObject({ operation: z.literal('organization.get') }),
  z.strictObject({ operation: z.literal('organization.set'), settings: organizationSettingsSchema }),
  z.strictObject({ operation: z.literal('prepare'), assetId: z.string().min(1) }),
  z.strictObject({ operation: z.literal('remove'), source: vaultSourceSchema }),
]);
export type VaultReturnCommand = z.infer<typeof vaultReturnCommandSchema>;
export const vaultReturnResultSchema = z.strictObject({ organization: organizationSettingsSchema.optional(), inventory: vaultInventorySchema.optional(), source: vaultSourceSchema.optional(), removed: z.boolean().optional(), error: z.string().optional() });
export type VaultReturnResult = z.infer<typeof vaultReturnResultSchema>;
