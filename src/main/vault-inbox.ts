import { ensurePhysicalFolder, restoreTransferredMetadata } from './asset-transfer';
import { vaultReturnCommandSchema } from '../shared/vault-return';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { comparableMetadata, vaultTransferSchema, vaultReceiptSchema, type VaultReceipt } from '../shared/vault-routing';
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
      await this.returnCommands();
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
  private async returnCommands(): Promise<void> {
    const root = vaultDirectory(this.root, '.vault-transfers', 'return');
    for (const id of readdirSync(root)) {
      if (!/^[a-f0-9-]{36}$/u.test(id)) continue;
      const directory = vaultDirectory(root, id); const file = path.join(directory, 'request.json'); const response = path.join(directory, 'response.json');
      if (!existsSync(file) || existsSync(response)) continue;
      try {
        if (lstatSync(file).isSymbolicLink() || lstatSync(file).size > 2 * 1024 * 1024) throw new Error('Invalid Vault return request.');
        const command = vaultReturnCommandSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
        if (command.operation === 'remove' && command.source.libraryId !== this.libraryId) throw new Error('The source belongs to a different private catalog.');
        const result = await this.rpc(command.operation === 'organization.get' ? { type: 'organization.get', libraryId: this.libraryId } : command.operation === 'organization.set' ? { type: 'organization.set', libraryId: this.libraryId, settings: command.settings } : command.operation === 'inventory' ? { type: 'vault.return.inventory', libraryId: this.libraryId } : command.operation === 'prepare' ? { type: 'vault.return.prepare', libraryId: this.libraryId, assetId: command.assetId } : { type: 'vault.return.remove', source: command.source });
        if (!result.ok) throw new Error(result.error.message);
        if (result.type === 'organization.settings') atomicVaultJson(response, { organization: result.settings });
        else if (result.type === 'vault.return.inventory') atomicVaultJson(response, { inventory: result.inventory });
        else if (result.type === 'vault.source.prepared') atomicVaultJson(response, { source: result.source });
        else if (result.type === 'asset.deleted-from-disk') atomicVaultJson(response, { removed: result.deletedCount === 1 });
        else throw new Error('The private worker did not acknowledge the return request.');
      } catch (error) { atomicVaultJson(response, { error: error instanceof Error ? error.message : 'The Vault return request failed. Protected originals are retained unless individually verified.' }); }
    }
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
    const targetId = await ensurePhysicalFolder(this.rpc, this.libraryId, transfer.folder);
    const progressFile = path.join(folder, 'progress.json');
    let assetId: string | undefined;
    if (existsSync(progressFile)) assetId = (JSON.parse(readFileSync(progressFile, 'utf8')) as { assetId?: string }).assetId;
    if (!assetId) {
      let imported = await this.rpc({ type: 'asset.import.prepare', libraryId: this.libraryId, ...(targetId ? { targetFolderId: targetId } : {}), sourceKind: 'files', sourcePaths: [image], createImageSequence: false });
      if (imported.ok && imported.type === 'asset.import.conflicts') imported = await this.rpc({ type: 'asset.import.resolve', importId: imported.plan.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
      if (!imported.ok || imported.type !== 'asset.import.completed' || imported.completion.assets.length !== 1) throw new Error('The private import failed.');
      assetId = imported.completion.assets[0]!.assetId; atomicVaultJson(progressFile, { assetId });
    }
    const metadata = transfer.source.metadata;
    await restoreTransferredMetadata(this.rpc, this.libraryId, assetId, metadata, transfer.source.modifiedAt, transfer.source.identities);
    const checked = await this.rpc({ type: 'vault.destination.verify', libraryId: this.libraryId, assetId, sha256: transfer.source.sha256, metadata });
    if (!checked.ok) throw new Error('Destination verification failed.');
    const metadataHash = createHash('sha256').update(JSON.stringify(comparableMetadata(metadata))).digest('hex');
    if (metadataHash !== transfer.source.metadataHash) throw new Error('Invalid metadata fingerprint.');
    const receipt: VaultReceipt = { transferId: transfer.transferId, verificationNonce: transfer.verificationNonce, assetId, sha256: transfer.source.sha256, metadataHash };
    atomicVaultJson(receiptFile, receipt); rmSync(folder, { recursive: true });
  }
}
