import { ipcRenderer } from 'electron';
import { VAULT_CHANNEL, vaultRequestSchema, vaultStatusSchema, type VaultApi } from '../../shared/vault';
export const vault: VaultApi = Object.freeze({ privateWorkspace: process.argv.includes('--gen-library-private-workspace'), async request(input) { return vaultStatusSchema.parse(await ipcRenderer.invoke(VAULT_CHANNEL, vaultRequestSchema.parse(input))); } });
