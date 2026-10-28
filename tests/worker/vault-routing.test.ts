import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { VaultManager } from '../../src/main/vault-manager';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LibraryService } from '../../src/worker/library-service';
import { VaultInbox } from '../../src/main/vault-inbox';
import { atomicVaultJson, vaultDirectory } from '../../src/main/vault-transfer-io';
import type { WorkerCommand } from '../../src/shared/protocol/requests';
import type { WorkerResult } from '../../src/shared/protocol/responses';
import { vaultSourceSchema } from '../../src/shared/vault-routing';
import type { VaultReceipt } from '../../src/shared/vault-routing';
const services: LibraryService[] = []; const roots: string[] = []; const inboxes: VaultInbox[] = [];
afterEach(() => { inboxes.splice(0).forEach((inbox) => inbox.stop()); services.splice(0).forEach((service) => service.closeAll()); roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); });
function fixture(privateRootOverride?: string, stage = true) {
  mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/routing-worker-')); roots.push(root);
  const source = new LibraryService(); const destination = new LibraryService(); services.push(source, destination);
  const library = source.createLibrary({ displayName: 'Source', selectedParentPath: root });
  const privateRoot = privateRootOverride ?? path.join(root, 'Private'); if (!existsSync(privateRoot)) mkdirSync(privateRoot);
  const privateLibrary = destination.createLibrary({ displayName: 'Private Library', selectedParentPath: privateRoot });
  const file = path.join(root, 'synthetic.png');
  writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  const imported = source.prepareOrExecuteImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [file] });
  if (!('assets' in imported)) throw new Error('Unexpected synthetic import conflict');
  const assetId = imported.assets[0]!.assetId;
  source.setAssetMetadata({ libraryId: library.libraryId, assetId, expectedVersion: 0, description: 'Synthetic metadata', rating: 5, favorite: true, author: 'Synthetic author', sourcePageUrl: 'https://example.com/synthetic' });
  for (const name of ['NSFW', 'Character: Momo']) { const tag = source.createTag({ libraryId: library.libraryId, name }); source.assignTags({ libraryId: library.libraryId, assetIds: [assetId], tagIds: [tag.tagId] }); }
  const rpc = async (command: WorkerCommand): Promise<WorkerResult> => {
    try {
      switch (command.type) {
        case 'folder.list': return { ok: true, type: 'folder.list', folders: destination.listManagedFolders(command.libraryId) };
        case 'folder.create': return { ok: true, type: 'folder.created', folder: destination.createManagedFolder(command) };
        case 'asset.import.prepare': { const result = destination.prepareOrExecuteImport(command); if (!('assets' in result)) throw new Error('Unexpected private conflict'); return { ok: true, type: 'asset.import.completed', completion: result }; }
        case 'asset.metadata.get': return { ok: true, type: 'asset.metadata.got', metadata: destination.getAssetMetadata(command) };
        case 'asset.metadata.set': return { ok: true, type: 'asset.metadata.got', metadata: destination.setAssetMetadata(command) };
        case 'tag.list': return { ok: true, type: 'tag.list', tags: destination.listTags(command.libraryId) };
        case 'tag.create': return { ok: true, type: 'tag.created', tag: destination.createTag(command) };
        case 'tag.assign': destination.assignTags(command); return { ok: true, type: 'library.closed', libraryId: command.libraryId };
        case 'vault.destination.verify': destination.verifyVaultDestination(command); return { ok: true, type: 'library.closed', libraryId: command.libraryId };
        default: throw new Error(`Unexpected command: ${command.type}`);
      }
    } catch { return { ok: false, error: { code: 'INVALID_STATE_TRANSITION', message: 'Synthetic verification failure' } }; }
  };
  const inbox = new VaultInbox(privateRoot, privateLibrary.libraryId, rpc); inbox.stop(); inboxes.push(inbox);
  const command = { type: 'vault.source.prepare' as const, libraryId: library.libraryId, assetId };
  const snapshot = vaultSourceSchema.parse(source.prepareVaultTransfer(command));
  const transferId = randomUUID(); const verificationNonce = randomUUID();
  const staged = vaultDirectory(privateRoot, '.vault-transfers', 'pending', transferId); const files = vaultDirectory(staged, 'files');
  writeFileSync(path.join(files, snapshot.fileName), readFileSync(snapshot.sourcePath));
  if (stage) atomicVaultJson(path.join(staged, 'manifest.json'), { transferId, verificationNonce, source: snapshot, folder: 'Momo' });
  const receiptFile = path.join(privateRoot, '.vault-transfers', 'receipts', `${transferId}.json`);
  return { root, source, destination, library, privateLibrary, privateRoot, assetId, snapshot, inbox, staged, transferId, verificationNonce, receiptFile };
}
it('imports and verifies original bytes, character folder, stars, favorites and tags before source cleanup', async () => {
  const f = fixture(); await f.inbox.tick();
  expect(existsSync(f.receiptFile)).toBe(true);
  const receipt = JSON.parse(readFileSync(f.receiptFile, 'utf8')) as VaultReceipt;
  expect(receipt.verificationNonce).toBe(f.verificationNonce);
  const privateAsset = f.destination.listAssets({ libraryId: f.privateLibrary.libraryId, recursive: true })[0]!;
  expect(f.destination.listManagedFolders(f.privateLibrary.libraryId).find((folder) => folder.folderId === privateAsset.managedFolderId)?.name).toBe('Momo');
  const metadata = f.destination.getAssetMetadata({ libraryId: f.privateLibrary.libraryId, assetId: receipt.assetId });
  expect(metadata.rating).toBe(5); expect(metadata.favorite).toBe(true); expect(metadata.description).toBe('Synthetic metadata');
  expect(metadata.tags.map((tag) => tag.name).sort()).toEqual(['Character: Momo', 'NSFW']);
  expect(readFileSync(f.destination.resolveAssetPath(f.privateLibrary.libraryId, receipt.assetId))).toEqual(readFileSync(f.snapshot.sourcePath));
  expect(existsSync(f.snapshot.sourcePath)).toBe(true);
  await f.source.removeVaultTransferredSource(f.snapshot);
  expect(existsSync(f.snapshot.sourcePath)).toBe(false);
  expect(f.source.listAssets({ libraryId: f.library.libraryId, recursive: true })).toHaveLength(0);
});
it('rejects changed source metadata and leaves the original file in place', async () => {
  const f = fixture(); await f.inbox.tick();
  const current = f.source.getAssetMetadata({ libraryId: f.library.libraryId, assetId: f.assetId });
  f.source.setAssetMetadata({ libraryId: f.library.libraryId, assetId: f.assetId, expectedVersion: current.entityVersion, rating: 4 });
  await expect(f.source.removeVaultTransferredSource(f.snapshot)).rejects.toThrow();
  expect(existsSync(f.snapshot.sourcePath)).toBe(true);
});
it('rejects changed source bytes and a damaged staged copy without issuing a receipt', async () => {
  const f = fixture(); writeFileSync(path.join(f.staged, 'files', f.snapshot.fileName), 'damaged staged bytes');
  await f.inbox.tick(); expect(existsSync(f.receiptFile)).toBe(false); expect(existsSync(f.snapshot.sourcePath)).toBe(true);
  writeFileSync(f.snapshot.sourcePath, 'changed original bytes');
  await expect(f.source.removeVaultTransferredSource(f.snapshot)).rejects.toThrow(); expect(existsSync(f.snapshot.sourcePath)).toBe(true);
});
it('rechecks a prior receipt with a fresh nonce, and refuses it if the private image was deleted', async () => {
  const f = fixture(); await f.inbox.tick();
  const first = JSON.parse(readFileSync(f.receiptFile, 'utf8')) as VaultReceipt;
  const staged = vaultDirectory(f.privateRoot, '.vault-transfers', 'pending', f.transferId);
  const nonce = randomUUID(); atomicVaultJson(path.join(staged, 'manifest.json'), { transferId: f.transferId, verificationNonce: nonce, source: f.snapshot, folder: 'Momo' });
  await f.inbox.tick(); expect((JSON.parse(readFileSync(f.receiptFile, 'utf8')) as VaultReceipt).verificationNonce).toBe(nonce);
  f.destination.deleteAssetsFromDisk({ libraryId: f.privateLibrary.libraryId, assetIds: [first.assetId] });
  const retried = vaultDirectory(f.privateRoot, '.vault-transfers', 'pending', f.transferId);
  const staleNonce = randomUUID(); atomicVaultJson(path.join(retried, 'manifest.json'), { transferId: f.transferId, verificationNonce: staleNonce, source: f.snapshot, folder: 'Momo' });
  await f.inbox.tick(); expect((JSON.parse(readFileSync(f.receiptFile, 'utf8')) as VaultReceipt).verificationNonce).not.toBe(staleNonce);
  expect(existsSync(path.join(retried, 'error.json'))).toBe(true); expect(existsSync(f.snapshot.sourcePath)).toBe(true);
});

it.skipIf(process.env.GEN_LIBRARY_VAULT_DISK_TEST !== '1' || process.platform !== 'darwin')('moves a synthetic image through the controller into real encrypted APFS storage and reopens it', async () => {
  mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/native-routing-')); roots.push(root);
  const manager = new VaultManager({ userData: path.join(root, 'controller'), executable: process.execPath, appPath: '', packaged: true, spawnWorkspace: () => {
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, { exitCode: null, signalCode: null, kill: () => { queueMicrotask(() => child.emit('exit', 0)); return true; } }); return child;
  } });
  const password = randomUUID(); let f: ReturnType<typeof fixture> | undefined;
  const image = path.join(root, 'Synthetic.sparsebundle');
  try {
    await manager.create(image, 'Synthetic routing', password, 1);
    const mount = [...manager.sessions.values()][0]!.mount; f = fixture(mount, false);
    const moved = manager.transfer(image, f.snapshot, 'Momo');
    await f.inbox.tick(); const receipt = await moved; const assetId = receipt.assetId;
    expect(receipt.sha256).toBe(f.snapshot.sha256); expect(existsSync(f.snapshot.sourcePath)).toBe(true);
    await f.source.removeVaultTransferredSource(f.snapshot); expect(existsSync(f.snapshot.sourcePath)).toBe(false);
    f.inbox.stop(); f.destination.closeAll(); await manager.lockAll(); expect(existsSync(path.join(mount, 'Private Library'))).toBe(false);
    await manager.open(image, password); const reopened = [...manager.sessions.values()][0]!.mount;
    const reopenedLibrary = f.destination.openLibrary(path.join(reopened, 'Private Library'));
    const metadata = f.destination.getAssetMetadata({ libraryId: reopenedLibrary.libraryId, assetId });
    expect(metadata.rating).toBe(5); expect(metadata.favorite).toBe(true); expect(metadata.tags.map((tag) => tag.name)).toContain('Character: Momo');
    f.destination.closeAll(); await manager.lockAll();
  } finally { f?.inbox.stop(); f?.destination.closeAll(); await manager.lockAll(); }
}, 120000);

it('refuses an image with a companion metadata file instead of leaving that companion exposed', () => {
  const f = fixture(); writeFileSync(f.snapshot.sourcePath + '.json', '{"prompt":"synthetic only"}');
  expect(() => f.source.prepareVaultTransfer({ libraryId: f.library.libraryId, assetId: f.assetId })).toThrow();
  expect(existsSync(f.snapshot.sourcePath)).toBe(true);
});

it('removes a current derived thumbnail from the normal library after destination verification', async () => {
  const f = fixture();
  const artifact = path.join(f.library.libraryPath, '.serpent', 'artifacts', 'synthetic-thumbnail.png');
  writeFileSync(artifact, 'synthetic thumbnail');
  const Database = createRequire(import.meta.url)('better-sqlite3') as new (file: string) => { prepare(sql: string): { run(...values: unknown[]): unknown }; close(): void };
  const db = new Database(path.join(f.library.libraryPath, '.serpent', 'library.db'));
  try {
    db.prepare("INSERT INTO revision_artifacts (artifact_id, revision_id, kind, mime_type, byte_size, file_path, generator_version, status) VALUES (?, ?, 'thumbnail', 'image/png', 19, 'synthetic-thumbnail.png', 'synthetic', 'ready')").run(randomUUID(), f.snapshot.revisionId);
  } finally { db.close(); }
  await f.inbox.tick(); expect(existsSync(f.receiptFile)).toBe(true);
  await f.source.removeVaultTransferredSource(f.snapshot); expect(existsSync(artifact)).toBe(false);
});
