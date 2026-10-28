import { z } from 'zod';
export const VAULT_CHANNEL = 'gen-library:vault';
const password = z.string().min(1).max(1024).refine((value) => ![0,10,13].some((code) => value.includes(String.fromCharCode(code))));
export const vaultRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('status') }),
  z.strictObject({ operation: z.literal('create'), name: z.string().trim().min(1).max(80).regex(/^[^/\\]+$/), password: password.refine((value) => value.length >= 12), sizeGiB: z.number().int().min(1).max(1000) }),
  z.strictObject({ operation: z.literal('open'), password }),
  z.strictObject({ operation: z.literal('lock'), id: z.string().uuid().optional() }),
]);
export type VaultRequest = z.infer<typeof vaultRequestSchema>;
export const vaultStatusSchema = z.strictObject({
  supported: z.boolean(), privateWorkspace: z.boolean(), privateLibraryPath: z.string().nullable(),
  sessions: z.array(z.strictObject({ id: z.string().uuid(), name: z.string(), running: z.boolean(), error: z.string().optional() })),
  error: z.string().optional(),
});
export type VaultStatus = z.infer<typeof vaultStatusSchema>;
export type VaultApi = { privateWorkspace?: boolean; request(input: VaultRequest): Promise<VaultStatus> };
export const vaultCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('status') }),
  z.strictObject({ operation: z.literal('create'), image: z.string().max(4096), name: z.string().max(80), password, sizeGiB: z.number().int().min(1).max(1000) }),
  z.strictObject({ operation: z.literal('open'), image: z.string().max(4096), password }),
  z.strictObject({ operation: z.literal('lock'), id: z.string().uuid() }),
  z.strictObject({ operation: z.literal('lock-all') }),
]);
export type VaultCommand = z.infer<typeof vaultCommandSchema>;
