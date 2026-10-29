import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { VaultRouting } from '../../src/main/vault-routing';
import { DEFAULT_ROUTING_CONFIG, characterFolder, characterFolderSchema, isNsfwTag, type VaultSource } from '../../src/shared/vault-routing';
import { rendererRequestSchema } from '../../src/shared/protocol/requests';
import type { WorkerCommand } from '../../src/shared/protocol/requests';
import type { WorkerResult } from '../../src/shared/protocol/responses';
import type { VaultCommand, VaultStatus } from '../../src/shared/vault';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/routing-unit-')); roots.push(root);
  const source: VaultSource = { libraryId: 'library', assetId: 'asset', revisionId: 'revision', sourcePath: '/synthetic/image.png', fileName: 'image.png', sha256: 'a'.repeat(64), metadataHash: 'b'.repeat(64), metadata: { description: 'Synthetic only', rating: 5, favorite: true, palette: null, sourcePageUrl: null, author: null, tags: ['NSFW', 'Character: Momo'] } };
  const worker = vi.fn(async (command: WorkerCommand): Promise<WorkerResult> => {
    switch (command.type) {
      case 'asset.metadata.get': return { ok: true, type: 'asset.metadata.got', metadata: { ...source.metadata, tags: source.metadata.tags.map((name, index) => ({ id: String(index), name, source: 'user' })), entityVersion: 1 } } as WorkerResult;
      case 'asset.list': return { ok: true, type: 'asset.list', assets: [{ assetId: 'asset', displayName: 'Synthetic image', relativeFilePath: 'image.png' }] } as WorkerResult;
      case 'vault.source.prepare': return { ok: true, type: 'vault.source.prepared', source };
      case 'vault.source.remove': return { ok: true, type: 'asset.deleted-from-disk', deletedCount: 1 };
      case 'library.list': return { ok: true, type: 'library.list', libraries: [] };
      default: throw new Error(`Unexpected ${command.type}`);
    }
  });
  const state: VaultStatus = { supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [] };
  const vault = vi.fn(async (command: VaultCommand): Promise<VaultStatus> => command.operation === 'return-command' ? { ...state, returnResult: { organization: { autoCharacterFolders: routing.snapshot().config.autoCharacterFolders, characterFolders: {} } } } : command.operation === 'transfer' ? { ...state, transferReceipt: { transferId: 'ebaf17d7-d54a-43f6-a499-4117a6500021', verificationNonce: 'cbaf17d7-d54a-43f6-a499-4117a6500021', assetId: 'private-image', sha256: source.sha256, metadataHash: source.metadataHash } } : state);
  const clearCache = vi.fn(async () => {}); const policyChanged = vi.fn();
  const image = path.join(root, 'Private.sparsebundle'); mkdirSync(image);
  const routing = new VaultRouting({ stateFile: path.join(root, 'routing.json'), worker, vault, clearCache, policyChanged });
  routing.chooseVault(image); routing.configure(true, false, { existingMatches: 'future', autoCharacterFolders: true });
  const removed = () => worker.mock.calls.filter(([command]) => command.type === 'vault.source.remove');
  return { root, image, source, worker, vault, routing, clearCache, policyChanged, removed };
}
it('matches exact NSFW and resolves only unambiguous safe character folders', () => {
  expect(isNsfwTag(' nsfw ')).toBe(true); expect(isNsfwTag('maybe-nsfw')).toBe(false); expect(isNsfwTag('SFW')).toBe(false);
  expect(characterFolder(['Character: Momo'], DEFAULT_ROUTING_CONFIG)).toBe('Momo');
  expect(characterFolder(['Character: Momo', 'Character: Una'], DEFAULT_ROUTING_CONFIG)).toBeNull();
  expect(characterFolder(['Momo'], { ...DEFAULT_ROUTING_CONFIG, characterFolders: { Momo: 'Red Panda' } })).toBe('Red Panda');
  for (const unsafe of ['..', '../outside', 'Momo/Other', 'Momo\\Other', 'a\0b']) expect(characterFolderSchema.safeParse(unsafe).success).toBe(false);
});
it('verifies the encrypted copy before removing the source, preserving the transfer metadata', async () => {
  const f = fixture(); await f.routing.enqueue('library', ['asset']);
  await f.routing.moveNext();
  expect(f.vault).toHaveBeenCalledWith({ operation: 'transfer', image: f.image, source: f.source, folder: 'Momo' });
  expect(f.removed()).toHaveLength(1); expect(f.clearCache).toHaveBeenCalledOnce(); expect(f.routing.snapshot().pending).toEqual([]);
  expect(f.vault.mock.invocationCallOrder[0]).toBeLessThan(f.worker.mock.invocationCallOrder.at(-1)!);
});
it('keeps the source when the vault is locked or destination verification fails', async () => {
  const f = fixture(); await f.routing.enqueue('library', ['asset']);
  f.vault.mockResolvedValue({ supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [], error: 'Unlock the selected vault' });
  await f.routing.moveNext(); expect(f.removed()).toHaveLength(0); expect(f.routing.snapshot().pending[0]?.error).toContain('Unlock');
  f.vault.mockResolvedValue({ supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [], transferReceipt: { transferId: 'ebaf17d7-d54a-43f6-a499-4117a6500021', verificationNonce: 'cbaf17d7-d54a-43f6-a499-4117a6500021', assetId: 'private', sha256: '0'.repeat(64), metadataHash: f.source.metadataHash } });
  await f.routing.moveNext(); expect(f.removed()).toHaveLength(0);
});
it('keeps the original when routing is disabled during transfer', async () => {
  const f = fixture(); await f.routing.enqueue('library', ['asset']);
  const successful = f.vault.getMockImplementation()!;
  f.vault.mockImplementation(async (command) => { const result = await successful(command); f.routing.configure(false, false); return result; });
  await f.routing.moveNext(); expect(f.removed()).toHaveLength(0); expect(f.routing.snapshot().pending).toHaveLength(1);
});
it('does not move old matches merely because automatic routing is enabled', async () => {
  const f = fixture(); f.routing.configure(true, true, { existingMatches: 'future', autoCharacterFolders: true }); await f.routing.enqueue('library', ['asset']);
  await f.routing.automaticallyMoveNew(); expect(f.vault).not.toHaveBeenCalled(); expect(f.removed()).toHaveLength(0);
  expect(f.policyChanged).toHaveBeenLastCalledWith(true);
});
it('uses Shared for multiple characters and rejects a stale pending-image selection', async () => {
  const f = fixture(); f.source.metadata.tags.push('Character: Una'); await f.routing.enqueue('library', ['asset']);
  expect(f.routing.snapshot().pending[0]?.folder).toBe('Shared');
  await expect(f.routing.moveNext('Momo', undefined, 'wrong-job')).rejects.toThrow('pending image changed');
  expect(f.removed()).toHaveLength(0);
});
it('removes pending references after a move, and restores pending identifiers after restart', async () => {
  const f = fixture(); await f.routing.enqueue('library', ['asset']);
  const restored = new VaultRouting({ stateFile: path.join(f.root, 'routing.json'), worker: f.worker, vault: f.vault, clearCache: f.clearCache, policyChanged: f.policyChanged });
  expect(restored.snapshot().pending).toHaveLength(1); await restored.moveNext('Momo');
  const clean = new VaultRouting({ stateFile: path.join(f.root, 'routing.json'), worker: f.worker, vault: f.vault, clearCache: f.clearCache, policyChanged: f.policyChanged });
  expect(clean.snapshot().pending).toHaveLength(0);
});

it('does not expose internal source removal or path-bearing transfer commands to the renderer', () => {
  const f = fixture();
  expect(rendererRequestSchema.safeParse({ type: 'vault.source.remove', source: f.source }).success).toBe(false);
  expect(rendererRequestSchema.safeParse({ type: 'vault.source.prepare', libraryId: 'library', assetId: 'asset' }).success).toBe(false);
});
it('automatically moves a new unambiguous manual match only when its selected vault is unlocked', async () => {
  const f = fixture(); f.routing.configure(true, true, { existingMatches: 'future', autoCharacterFolders: true }); await f.routing.enqueue('library', ['asset'], true);
  await f.routing.automaticallyMoveNew(); expect(f.removed()).toHaveLength(0);
  const successful = f.vault.getMockImplementation()!;
  f.vault.mockImplementation(async (command) => command.operation === 'status' ? { supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [{ id: 'ebaf17d7-d54a-43f6-a499-4117a6500021', name: 'Private', running: true, image: f.image }] } : successful(command));
  await f.routing.automaticallyMoveNew(); expect(f.removed()).toHaveLength(1);
  expect(f.routing.snapshot().pending).toHaveLength(0);
});

it('requires an explicit existing-match choice and keeps physical organization independent from trigger selection', async () => {
  const f = fixture(); f.routing.configure(false, false);
  expect(f.routing.configure(true, true, { trigger: 'vault' })).toBe(false);
  expect(f.routing.enabled).toBe(false); expect(f.routing.snapshot().needsExistingChoice).toBe(true);
  expect(f.routing.configure(true, true, { trigger: 'vault', existingMatches: 'future', autoCharacterFolders: false })).toBe(true);
  f.source.metadata.tags = ['Vault', 'Character: Momo']; await f.routing.enqueue('library', ['asset']);
  expect(f.routing.snapshot().pending[0]?.folder).toBe('');
  await f.routing.moveNext(); expect(f.vault).toHaveBeenCalledWith(expect.objectContaining({ operation: 'transfer', folder: '' }));
});
it('allows a manual Vault move without an NSFW tag or enabled tag routing', async () => {
  const f = fixture(); f.routing.configure(false, false, { trigger: 'manual', autoCharacterFolders: false });
  f.source.metadata.tags = ['Character: Momo']; await f.routing.enqueue('library', ['asset'], false, true);
  await f.routing.moveNext(); expect(f.removed()).toHaveLength(1); expect(f.routing.enabled).toBe(false);
});
it('keeps storage enabled while returning files and disables routing only after verified completion', () => {
  const f = fixture(); f.routing.startDisable();
  expect(f.routing.snapshot().config.vaultState).toBe('disabling'); expect(f.routing.backgroundPaused).toBe(true); expect(f.routing.enabled).toBe(false);
  f.routing.migrationFailed('Synthetic copy failed'); expect(f.routing.snapshot().config.vaultState).toBe('disabling');
  f.routing.startDisable(); f.routing.finishDisable(); expect(f.routing.snapshot().config.vaultState).toBe('disabled'); expect(f.routing.snapshot().config.enabled).toBe(false);
  f.routing.reenableStorage(); expect(f.routing.snapshot().config.vaultState).toBe('enabled'); expect(f.routing.configure(true, false)).toBe(false); expect(f.routing.snapshot().needsExistingChoice).toBe(true);
});
