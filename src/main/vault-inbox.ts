import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { canonicalMetadata, vaultTransferSchema, vaultReceiptSchema, type VaultReceipt } from '../shared/vault-routing';
import type { WorkerCommand } from '../shared/protocol/requests';
import type { WorkerResult } from '../shared/protocol/responses';
import { atomicVaultJson, vaultDirectory, vaultFileHash } from './vault-transfer-io';
type Rpc = (command: WorkerCommand) => Promise<WorkerResult>;
export class VaultInbox {
  private busy = false;
  private readonly pending: string;
  private readonly receipts: string;
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(private readonly root: string, private readonly libraryId: string, private readonly rpc: Rpc) {
    this.pending = vaultDirectory(root, '.vault-transfers', 'pending');
    this.receipts = vaultDirectory(root, '.vault-transfers', 'receipts');
    this.timer = setInterval(() => { void this.tick(); }, 500); this.timer.unref();
  }
  stop(): void { clearInterval(this.timer); }
  async tick(): Promise<void> {
    if (this.busy) return; this.busy = true;
    try {
      for (const id of readdirSync(this.pending)) {
        if (!/^[a-f0-9-]{36}$/u.test(id)) continue;
        const folder = path.join(this.pending, id); if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink()) continue;
        const manifest = path.join(folder, 'manifest.json'); if (!existsSync(manifest)) continue;
        try { await this.accept(folder, manifest); } catch {
          atomicVaultJson(path.join(folder, 'error.json'), { message: 'The private import did not finish. The original has been kept. Review this transfer before retrying.' });
        }
      }
    } catch { /* An unavailable volume must never be recreated as plaintext. */ }
    finally { this.busy = false; }
  }
  private async accept(folder: string, manifest: string): Promise<void> {
    if (existsSync(path.join(folder, 'error.json'))) return;
    if (lstatSync(manifest).isSymbolicLink() || lstatSync(manifest).size > 2 * 1024 * 1024) throw new Error('Invalid transfer record.');
    const transfer = vaultTransferSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')));
    if (path.basename(folder) !== transfer.transferId) throw new Error('Invalid transfer directory.');
    const receiptFile = path.join(this.receipts, `${transfer.transferId}.json`);
    if (existsSync(receiptFile)) {
      const previous = vaultReceiptSchema.parse(JSON.parse(readFileSync(receiptFile, 'utf8')));
      const verified = await this.rpc({ type: 'vault.destination.verify', libraryId: this.libraryId, assetId: previous.assetId, sha256: transfer.source.sha256, metadata: transfer.source.metadata });
      if (!verified.ok || previous.sha256 !== transfer.source.sha256 || previous.metadataHash !== transfer.source.metadataHash) throw new Error('The previous destination is no longer verified.');
      atomicVaultJson(receiptFile, { ...previous, verificationNonce: transfer.verificationNonce });
      rmSync(folder, { recursive: true }); return;
    }
    const image = path.join(vaultDirectory(folder, 'files'), transfer.source.fileName);
    if (vaultFileHash(image) !== transfer.source.sha256) throw new Error('The staged file changed.');
    const listed = await this.rpc({ type: 'folder.list', libraryId: this.libraryId });
    if (!listed.ok || listed.type !== 'folder.list') throw new Error('Cannot list private folders.');
    let target = listed.folders.find((item) => !item.parentFolderId && item.name === transfer.folder);
    if (!target) {
      const created = await this.rpc({ type: 'folder.create', libraryId: this.libraryId, name: transfer.folder });
      if (!created.ok || created.type !== 'folder.created') throw new Error('Cannot create the character folder.'); target = created.folder;
    }
    const progressFile = path.join(folder, 'progress.json');
    let assetId: string | undefined;
    if (existsSync(progressFile)) assetId = (JSON.parse(readFileSync(progressFile, 'utf8')) as { assetId?: string }).assetId;
    if (!assetId) {
      let imported = await this.rpc({ type: 'asset.import.prepare', libraryId: this.libraryId, targetFolderId: target.folderId, sourceKind: 'files', sourcePaths: [image], createImageSequence: false });
      if (imported.ok && imported.type === 'asset.import.conflicts') imported = await this.rpc({ type: 'asset.import.resolve', importId: imported.plan.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
      if (!imported.ok || imported.type !== 'asset.import.completed' || imported.completion.assets.length !== 1) throw new Error('The private import failed.');
      assetId = imported.completion.assets[0]!.assetId; atomicVaultJson(progressFile, { assetId });
    }
    const current = await this.rpc({ type: 'asset.metadata.get', libraryId: this.libraryId, assetId });
    if (!current.ok || current.type !== 'asset.metadata.got') throw new Error('Cannot restore metadata.');
    const metadata = transfer.source.metadata;
    const restored = await this.rpc({ type: 'asset.metadata.set', libraryId: this.libraryId, assetId, expectedVersion: current.metadata.entityVersion,
      description: metadata.description ?? '', rating: metadata.rating, favorite: metadata.favorite,
      ...(metadata.palette ? { palette: metadata.palette } : {}), sourcePageUrl: metadata.sourcePageUrl ?? '', author: metadata.author ?? '' });
    if (!restored.ok) throw new Error('Metadata was not saved.');
    const tags = await this.rpc({ type: 'tag.list', libraryId: this.libraryId });
    if (!tags.ok || tags.type !== 'tag.list') throw new Error('Cannot list private tags.');
    const ids: string[] = [];
    for (const name of metadata.tags) {
      let tag = tags.tags.find((item) => item.name === name);
      if (!tag) { const created = await this.rpc({ type: 'tag.create', libraryId: this.libraryId, name }); if (!created.ok || created.type !== 'tag.created') throw new Error('Cannot restore a tag.'); tag = created.tag; }
      ids.push(tag.tagId);
    }
    if (ids.length) { const assigned = await this.rpc({ type: 'tag.assign', libraryId: this.libraryId, assetIds: [assetId], tagIds: ids }); if (!assigned.ok) throw new Error('Tags were not saved.'); }
    const checked = await this.rpc({ type: 'vault.destination.verify', libraryId: this.libraryId, assetId, sha256: transfer.source.sha256, metadata });
    if (!checked.ok) throw new Error('Destination verification failed.');
    const metadataHash = createHash('sha256').update(JSON.stringify(canonicalMetadata(metadata))).digest('hex');
    if (metadataHash !== transfer.source.metadataHash) throw new Error('Invalid metadata fingerprint.');
    const receipt: VaultReceipt = { transferId: transfer.transferId, verificationNonce: transfer.verificationNonce, assetId, sha256: transfer.source.sha256, metadataHash };
    atomicVaultJson(receiptFile, receipt); rmSync(folder, { recursive: true });
  }
}
