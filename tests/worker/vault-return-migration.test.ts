import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { VaultManager } from '../../src/main/vault-manager';
import { VaultInbox } from '../../src/main/vault-inbox';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryService } from '../../src/worker/library-service';
import { VaultReturnMigration } from '../../src/main/vault-return-migration';
import { transferRpc } from './helpers/transfer-rpc';
import type { VaultCommand, VaultStatus } from '../../src/shared/vault';
const roots: string[] = []; const services: LibraryService[] = [];
afterEach(() => { services.splice(0).forEach((service) => service.closeAll()); roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); });
function fixture(privateParent?: string) {
 mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/vault-return-')); roots.push(root);
 const normal = new LibraryService(); const privateService = new LibraryService(); services.push(normal, privateService);
 const library = normal.createLibrary({ displayName: 'Normal', selectedParentPath: root }); const vault = privateService.createLibrary({ displayName: 'Private', selectedParentPath: privateParent ?? root });
 const folder = privateService.createManagedFolder({ libraryId: vault.libraryId, name: 'Custom folder' });
 const source = path.join(root, 'synthetic.png'); writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
 utimesSync(source, new Date('2022-01-03T12:00:00.000Z'), new Date('2022-01-03T12:00:00.000Z'));
 const imported = privateService.prepareOrExecuteImport({ libraryId: vault.libraryId, sourceKind: 'files', sourcePaths: [source], targetFolderId: folder.folderId }); if (!('assets' in imported)) throw new Error('Fixture import failed');
 const assetId = imported.assets[0]!.assetId;
 privateService.setAssetMetadata({ libraryId: vault.libraryId, assetId, expectedVersion: 0, rating: 5, favorite: true, description: 'Synthetic private metadata', author: 'Synthetic author' });
 for (const name of ['NSFW', 'Vault', 'Character: Momo']) { const tag = privateService.createTag({ libraryId: vault.libraryId, name }); privateService.assignTags({ libraryId: vault.libraryId, assetIds: [assetId], tagIds: [tag.tagId] }); }
 privateService.createSmartCollection({ libraryId: vault.libraryId, name: 'My picks', queryDefinitionJson: JSON.stringify({ includeAssetIds: [assetId], rules: { kind: 'tag', value: 'Vault' } }) });
 const collection = privateService.createCollection({ libraryId: vault.libraryId, name: 'Keepers' }); privateService.addCollectionAssets({ libraryId: vault.libraryId, collectionId: collection.collectionId, assetIds: [assetId] });
 const state: VaultStatus = { supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [{ id: 'f5fc478f-6ab6-4778-ad6b-bc7e1e6f94bf', image: '/synthetic/Vault.sparsebundle', name: 'Synthetic', running: true }] };
 let dropRemovalAck = false; let locked = false;
 const control = vi.fn(async (command: VaultCommand): Promise<VaultStatus> => {
  if (command.operation === 'return-authenticate') { if (command.password !== 'synthetic-password') return { ...state, error: 'The Vault password was not accepted.' }; locked = false; return state; }
  if (command.operation === 'status') return { ...state, sessions: locked ? [] : state.sessions };
  if (command.operation === 'lock') { locked = true; return { ...state, sessions: [] }; }
  if (command.operation !== 'return-command') throw new Error('Unexpected synthetic controller command');
  const request = command.command;
  if (request.operation === 'organization.get') return { ...state, returnResult: { organization: privateService.getOrganizationSettings(vault.libraryId) } };
  if (request.operation === 'organization.set') return { ...state, returnResult: { organization: privateService.setOrganizationSettings(vault.libraryId, request.settings) } };
  if (request.operation === 'inventory') return { ...state, returnResult: { inventory: privateService.vaultReturnInventory(vault.libraryId) } };
  if (request.operation === 'prepare') return { ...state, returnResult: { source: privateService.prepareVaultTransfer({ libraryId: vault.libraryId, assetId: request.assetId }) } };
  await privateService.removeVaultTransferredSource(request.source);
  if (dropRemovalAck) { dropRemovalAck = false; throw new Error('Synthetic controller disconnect after verified removal'); }
  return { ...state, returnResult: { removed: true } };
 });
 const worker = vi.fn(transferRpc(normal)); const finish = vi.fn(); const start = vi.fn();
 const options = { stateDirectory: path.join(root, 'journals'), worker, vault: control, startDisable: start, finishDisable: finish, clearCache: vi.fn(async () => {}), progress: vi.fn() };
 return { root, normal, privateService, library, vault, assetId, source, worker, control, finish, start, options, migration: new VaultReturnMigration(options), dropAck() { dropRemovalAck = true; } };
}
it('merges canonical files, metadata, Collections and remapped Smart Folder memberships into the normal Library', async () => {
 const f = fixture(); const initialDate = f.privateService.listAssets({ libraryId: f.vault.libraryId, recursive: true })[0]!.modifiedAt; await f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 expect(f.finish).toHaveBeenCalledOnce(); expect(f.privateService.listAssets({ libraryId: f.vault.libraryId, recursive: true })).toHaveLength(0);
 const assets = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true }); expect(assets).toHaveLength(1);
 const asset = assets[0]!; expect(asset.modifiedAt).toBe(initialDate); expect(asset.relativeFilePath).toBe('Custom folder/synthetic.png');
 expect(readFileSync(f.normal.resolveAssetPath(f.library.libraryId, asset.assetId))).toEqual(readFileSync(f.source));
 const metadata = f.normal.getAssetMetadata({ libraryId: f.library.libraryId, assetId: asset.assetId });
 expect(metadata.rating).toBe(5); expect(metadata.favorite).toBe(true); expect(metadata.tags.map((tag) => tag.name).sort()).toEqual(['Character: Momo','NSFW','Vault']);
 const smart = f.normal.listSmartCollections(f.library.libraryId)[0]!; expect(f.normal.executeSmartCollection({ libraryId: f.library.libraryId, collectionId: smart.collectionId }).items[0]?.assetId).toBe(asset.assetId);
 expect(f.normal.listCollectionAssets({ libraryId: f.library.libraryId, collectionId: f.normal.listCollections(f.library.libraryId)[0]!.collectionId, recursive: false })[0]?.assetId).toBe(asset.assetId);
});
it('rejects a wrong password before copying files and never marks the Vault disabled', async () => {
 const f = fixture(); await expect(f.migration.run('/synthetic/Vault.sparsebundle', 'wrong', f.library.libraryId)).rejects.toThrow('password');
 expect(f.finish).not.toHaveBeenCalled(); expect(f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })).toHaveLength(0); expect(f.privateService.listAssets({ libraryId: f.vault.libraryId, recursive: true })).toHaveLength(1);
});
it('recovers a lost removal acknowledgement without making another canonical copy', async () => {
 const f = fixture(); f.dropAck(); await expect(f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId)).rejects.toThrow('disconnect');
 expect(f.finish).not.toHaveBeenCalled(); const before = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })[0]!.assetId;
 await new VaultReturnMigration(f.options).run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 const after = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true }); expect(after).toHaveLength(1); expect(after[0]!.assetId).toBe(before); expect(f.finish).toHaveBeenCalledOnce();
});
it('uses character organization only when the normal Library opted in', async () => {
 const f = fixture(); f.normal.setOrganizationSettings(f.library.libraryId, { autoCharacterFolders: true, characterFolders: {} });
 await f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 expect(f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })[0]!.relativeFilePath).toBe('Momo/synthetic.png');
});
it('preflights unsupported companion files without moving anything or disabling the Vault', async () => {
 const f = fixture(); writeFileSync(f.privateService.resolveAssetPath(f.vault.libraryId, f.assetId) + '.json', '{"prompt":"synthetic"}');
 await expect(f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId)).rejects.toThrow('No files were moved');
 expect(f.finish).not.toHaveBeenCalled(); expect(f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })).toHaveLength(0); expect(f.privateService.listAssets({ libraryId: f.vault.libraryId, recursive: true })).toHaveLength(1);
});

it('does not remove the protected original or disable storage when normal-Library verification fails', async () => {
 const f = fixture(); const actual = f.worker.getMockImplementation()!;
 f.worker.mockImplementation(async (command) => command.type === 'vault.destination.verify' ? { ok: false, error: { code: 'INVALID_STATE_TRANSITION', message: 'Synthetic verification failure' } } : actual(command));
 await expect(f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId)).rejects.toThrow('did not verify');
 expect(f.finish).not.toHaveBeenCalled(); expect(f.privateService.listAssets({ libraryId: f.vault.libraryId, recursive: true })).toHaveLength(1);
});
it('keeps existing normal files intact and chooses a non-conflicting returned name', async () => {
 const f = fixture(); const folder = f.normal.createManagedFolder({ libraryId: f.library.libraryId, name: 'Custom folder' });
 const existingRoot = path.join(f.root, 'Existing'); mkdirSync(existingRoot); const file = path.join(existingRoot, 'synthetic.png'); writeFileSync(file, 'synthetic existing normal file');
 const result = f.normal.prepareOrExecuteImport({ libraryId: f.library.libraryId, sourceKind: 'files', sourcePaths: [file], targetFolderId: folder.folderId }); if (!('assets' in result)) throw new Error('Fixture import failed');
 const oldId = result.assets[0]!.assetId; const oldPath = f.normal.resolveAssetPath(f.library.libraryId, oldId);
 await f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 expect(readFileSync(oldPath, 'utf8')).toBe('synthetic existing normal file');
 const assets = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true }); expect(assets).toHaveLength(2);
 expect(assets.find((asset) => asset.assetId !== oldId)?.displayName).toBe('synthetic (Vault 1).png'); expect(f.finish).toHaveBeenCalledOnce();
});

it.skipIf(process.env.GEN_LIBRARY_VAULT_DISK_TEST !== '1' || process.platform !== 'darwin')('authenticates a real encrypted Vault, merges through its private inbox, and locks before disabling', async () => {
 mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/native-vault-return-')); roots.push(root);
 const image = path.join(root, 'Synthetic.sparsebundle'); const password = 'Synthetic-native-return-password';
 const manager = new VaultManager({ userData: path.join(root, 'controller'), executable: process.execPath, appPath: '', packaged: true, spawnWorkspace: () => { const child = new EventEmitter() as ChildProcess; Object.assign(child, { exitCode: null, signalCode: null, kill: () => { queueMicrotask(() => child.emit('exit', 0)); return true; } }); return child; } });
 let f: ReturnType<typeof fixture> | undefined; let inbox: VaultInbox | undefined;
 try {
  await manager.create(image, 'Synthetic return', password, 1); f = fixture([...manager.sessions.values()][0]!.mount);
  const example = f;
  const controller = async (command: VaultCommand): Promise<VaultStatus> => {
   if (command.operation === 'return-authenticate') {
    inbox?.stop(); example.privateService.closeAll(); await manager.authenticateReturn(command.image, command.password);
    const mount = [...manager.sessions.values()][0]!.mount; example.privateService.openLibrary(path.join(mount, 'Private')); inbox = new VaultInbox(mount, example.vault.libraryId, transferRpc(example.privateService));
   } else if (command.operation === 'return-command') {
    const returned = manager.returnCommand(command.image, command.command); await inbox!.tick(); return { ...manager.snapshot(), returnResult: await returned };
   } else if (command.operation === 'lock') { inbox?.stop(); example.privateService.closeAll(); await manager.lock(command.id); }
   return manager.snapshot();
  };
  await new VaultReturnMigration({ ...f.options, vault: controller }).run(image, password, f.library.libraryId);
  expect(manager.active).toBe(false); expect(f.finish).toHaveBeenCalledOnce();
  const assets = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true }); expect(assets).toHaveLength(1);
  expect(f.normal.getAssetMetadata({ libraryId: f.library.libraryId, assetId: assets[0]!.assetId }).tags.map((tag) => tag.name)).toContain('Vault');
 } finally { inbox?.stop(); f?.privateService.closeAll(); await manager.lockAll(); }
}, 120000);

it('preserves AI tag provenance and analysis fields while merging case-equivalent tag names', async () => {
 const f = fixture(); f.normal.createTag({ libraryId: f.library.libraryId, name: 'nsfw' });
 f.privateService.writeAiAnalysisResult({ libraryId: f.vault.libraryId, assetId: f.assetId, tags: ['FromModel','NSFW'], description: 'Synthetic model analysis', rating: 4, modelId: 'synthetic-model', modelVersion: 'test-v1', enabledFields: { tags: true, description: true, rating: true } });
 const originalAi = f.privateService.getAiContent(f.vault.libraryId, f.assetId);
 await f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 const asset = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })[0]!;
 const metadata = f.normal.getAssetMetadata({ libraryId: f.library.libraryId, assetId: asset.assetId });
 expect(metadata.tags.find((tag) => tag.name === 'FromModel')?.source).toBe('ai'); expect(metadata.rating).toBe(5);
 expect(f.normal.getAiContent(f.library.libraryId, asset.assetId)).toEqual(originalAi); expect(f.finish).toHaveBeenCalledOnce();
});
it('restores original manual Smart Folder choices when a canonical file returns from Vault storage', async () => {
 const f = fixture(); const originalPublicId = 'previous-normal-library-image';
 const source = f.privateService.prepareVaultTransfer({ libraryId: f.vault.libraryId, assetId: f.assetId });
 f.privateService.restoreVaultMetadataLayers({ libraryId: f.vault.libraryId, assetId: f.assetId, metadata: source.metadata, identities: { [f.library.libraryId]: originalPublicId } });
 const include = f.normal.createSmartCollection({ libraryId: f.library.libraryId, name: 'Always included', queryDefinitionJson: JSON.stringify({ includeAssetIds: [originalPublicId] }) });
 const exclude = f.normal.createSmartCollection({ libraryId: f.library.libraryId, name: 'Always excluded', queryDefinitionJson: JSON.stringify({ rules: { kind: 'tag', value: 'Vault' }, excludeAssetIds: [originalPublicId] }) });
 await f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 const asset = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })[0]!;
 expect(f.normal.executeSmartCollection({ libraryId: f.library.libraryId, collectionId: include.collectionId }).items[0]?.assetId).toBe(asset.assetId);
 expect(f.normal.executeSmartCollection({ libraryId: f.library.libraryId, collectionId: exclude.collectionId }).total).toBe(0);
});

it('starts a fresh return after re-enabling instead of rechecking files from a completed cycle', async () => {
 const f = fixture(); await f.migration.run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 const returned = f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })[0]!;
 const metadata = f.normal.getAssetMetadata({ libraryId: f.library.libraryId, assetId: returned.assetId });
 f.normal.setAssetMetadata({ libraryId: f.library.libraryId, assetId: returned.assetId, expectedVersion: metadata.entityVersion, rating: 2, description: 'Edited normally after the first return' });
 const second = path.join(f.root, 'second.png'); writeFileSync(second, readFileSync(f.source));
 const imported = f.privateService.prepareOrExecuteImport({ libraryId: f.vault.libraryId, sourceKind: 'files', sourcePaths: [second] });
 if (!('assets' in imported)) throw new Error('Second-cycle fixture import failed');
 await new VaultReturnMigration(f.options).run('/synthetic/Vault.sparsebundle', 'synthetic-password', f.library.libraryId);
 expect(f.finish).toHaveBeenCalledTimes(2);
 expect(f.privateService.listAssets({ libraryId: f.vault.libraryId, recursive: true })).toHaveLength(0);
 expect(f.normal.listAssets({ libraryId: f.library.libraryId, recursive: true })).toHaveLength(2);
 expect(f.normal.getAssetMetadata({ libraryId: f.library.libraryId, assetId: returned.assetId }).rating).toBe(2);
});
