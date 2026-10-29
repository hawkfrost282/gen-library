import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { VaultCommand, VaultStatus } from '../shared/vault';
import { vaultInventorySchema, type VaultReturnCommand, type VaultReturnResult } from '../shared/vault-return';
import { catalogTagKey, vaultSourceSchema } from '../shared/vault-routing';
import { physicalCharacterFolder } from '../shared/organization';
import { smartCollectionQueryDefinitionSchema } from '../shared/asset-types';
import { atomicVaultJson, syncVaultFile, vaultFileHash, vaultDirectory } from './vault-transfer-io';
import { ensurePhysicalFolder, restoreTransferredMetadata, type TransferRpc } from './asset-transfer';
const recordSchema = z.strictObject({ source: vaultSourceSchema, assetId: z.string().optional(), verified: z.boolean().default(false), removed: z.boolean().default(false) });
const journalSchema = z.strictObject({ version: z.literal(1), image: z.string(), libraryId: z.string(), inventory: vaultInventorySchema, files: z.record(z.string(), recordSchema), folders: z.record(z.string(), z.string()), tags: z.record(z.string(), z.string()), collections: z.record(z.string(), z.string()), smartFolders: z.record(z.string(), z.string()), complete: z.boolean() });
type Journal = z.infer<typeof journalSchema>;
type Options = { stateDirectory: string; worker: TransferRpc; vault(command: VaultCommand): Promise<VaultStatus>; startDisable(): void; finishDisable(): void; clearCache(): Promise<void>; progress(message: string): void };
/** A reversible copy/verify phase precedes each source removal; failed migrations never disable storage. */
export class VaultReturnMigration {
  private running = false;
  constructor(private readonly options: Options) {}
  get busy(): boolean { return this.running; }
  async run(image: string, password: string, libraryId: string): Promise<void> {
    if (this.running) throw new Error('A Vault return is already running.');
    this.running = true;
    try {
      this.options.startDisable();
      const authenticated = await this.options.vault({ operation: 'return-authenticate', image, password });
      if (authenticated.error) throw new Error(authenticated.error);
      const live = await this.privateCommand(image, { operation: 'inventory' });
      if (!live.inventory) throw new Error('The private catalog could not be inventoried. The Vault remains enabled.');
      const unsupported = live.inventory.assets.filter((asset) => !asset.supported);
      if (unsupported.length) throw new Error(`No files were moved. ${unsupported.length} Vault item(s) need review: ${unsupported[0]!.name}. ${unsupported[0]!.reason ?? ''}`);
      const libraries = await this.options.worker({ type: 'library.list' });
      if (!libraries.ok || libraries.type !== 'library.list') throw new Error('Open the destination Library first.');
      const target = libraries.libraries.find((item) => item.libraryId === libraryId);
      if (!target || target.libraryId === live.inventory.libraryId) throw new Error('Choose the normal Library as the return destination.');
      mkdirSync(this.options.stateDirectory, { recursive: true, mode: 0o700 });
      const key = createHash('sha256').update(JSON.stringify([image, libraryId, live.inventory.libraryId])).digest('hex');
      const journalFile = path.join(this.options.stateDirectory, `${key}.json`);
      if (existsSync(journalFile) && lstatSync(journalFile).isSymbolicLink()) throw new Error('Invalid Vault return journal.');
      const previous = existsSync(journalFile) ? journalSchema.parse(JSON.parse(readFileSync(journalFile, 'utf8'))) : undefined;
      if (previous && (previous.image !== image || previous.libraryId !== libraryId || previous.inventory.libraryId !== live.inventory.libraryId)) throw new Error('The migration journal belongs to a different Library.');
      // A completed return belongs to an earlier enable/disable cycle. Normal files may have changed since then.
      const journal: Journal = previous && !previous.complete ? previous : { version: 1, image, libraryId, inventory: live.inventory, files: {}, folders: {}, tags: {}, collections: {}, smartFolders: {}, complete: false };
      // If new files were deliberately added after an interrupted attempt, include them before proceeding.
      const known = new Set(journal.inventory.assets.map((asset) => asset.assetId));
      journal.inventory.assets.push(...live.inventory.assets.filter((asset) => !known.has(asset.assetId)));
      const save = () => atomicVaultJson(journalFile, journal);
      save();
      for (const folder of journal.inventory.folders) {
        const id = await ensurePhysicalFolder(this.options.worker, libraryId, folder.relativePath);
        if (id) journal.folders[folder.folderId] = id;
      }
      const staging = vaultDirectory(target.libraryPath, '.serpent', 'vault-return-staging', key);
      const normalAssets = await this.options.worker({ type: 'asset.list', libraryId, recursive: true });
      if (!normalAssets.ok || normalAssets.type !== 'asset.list') throw new Error('Cannot read the destination Library.');
      let completed = 0;
      for (const asset of journal.inventory.assets) {
        this.options.progress(`Returning Vault files: ${completed} of ${journal.inventory.assets.length} verified.`);
        let record = journal.files[asset.assetId];
        if (record?.assetId && !record.removed && !live.inventory.assets.some((item) => item.assetId === asset.assetId)) { record.removed = true; save(); }
        if (!record?.removed) {
          const prepared = await this.privateCommand(image, { operation: 'prepare', assetId: asset.assetId });
          if (!prepared.source) {
            // A removal can commit just before a crash prevents journaling its acknowledgement.
            if (!record?.assetId || live.inventory.assets.some((item) => item.assetId === asset.assetId)) throw new Error('A protected source could not be read. The Vault remains enabled.');
            record.removed = true; save();
          } else {
            const source = prepared.source;
            if (record && (record.source.sha256 !== source.sha256 || record.source.metadataHash !== source.metadataHash || record.source.modifiedAt !== source.modifiedAt)) throw new Error('A Vault file changed during the interrupted migration. Review both copies before continuing.');
            record ??= { source, removed: false, verified: false }; journal.files[asset.assetId] = record; record.source = source; save();
            const organization = await this.options.worker({ type: 'organization.get', libraryId });
            if (!organization.ok || organization.type !== 'organization.settings') throw new Error('Cannot read the Library organization settings.');
            const relativeFolder = physicalCharacterFolder(source.metadata.tags, organization.settings) ?? source.relativeFolder ?? '';
            const targetFolderId = await ensurePhysicalFolder(this.options.worker, libraryId, relativeFolder);
            const stagingName = `Vault-return-${asset.assetId}${path.extname(source.fileName)}`;
            const stagedFile = path.join(staging, stagingName);
            if (!record.assetId) {
              // The deterministic temporary name recovers an import committed just before journal update.
              const recovered = normalAssets.assets.find((item) => item.displayName === stagingName && (item.managedFolderId ?? undefined) === targetFolderId);
              if (recovered) record.assetId = recovered.assetId;
              else {
                if (existsSync(stagedFile) && vaultFileHash(stagedFile) !== source.sha256) rmSync(stagedFile);
                if (!existsSync(stagedFile)) { copyFileSync(source.sourcePath, stagedFile); if (source.modifiedAt) utimesSync(stagedFile, new Date(source.modifiedAt), new Date(source.modifiedAt)); syncVaultFile(stagedFile); }
                if (vaultFileHash(stagedFile) !== source.sha256) throw new Error('The Vault source changed during copying. Its protected original was kept.');
                let imported = await this.options.worker({ type: 'asset.import.prepare', libraryId, sourceKind: 'files', sourcePaths: [stagedFile], ...(targetFolderId ? { targetFolderId } : {}), createImageSequence: false });
                if (imported.ok && imported.type === 'asset.import.conflicts') imported = await this.options.worker({ type: 'asset.import.resolve', importId: imported.plan.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
                if (!imported.ok || imported.type !== 'asset.import.completed' || imported.completion.assets.length !== 1) throw new Error('The normal Library import did not finish. The protected original was kept.');
                record.assetId = imported.completion.assets[0]!.assetId;
              }
              save();
            }
            if (record.verified) { const unchanged = await this.options.worker({ type: 'vault.destination.verify', libraryId, assetId: record.assetId, sha256: source.sha256, metadata: source.metadata }); if (!unchanged.ok) throw new Error('A verified returned file was edited. Review it before resuming; the protected original was kept.'); }
            else await restoreTransferredMetadata(this.options.worker, libraryId, record.assetId, source.metadata, source.modifiedAt, source.identities);
            const current = await this.options.worker({ type: 'asset.list', libraryId, assetIds: [record.assetId], recursive: true });
            if (!current.ok || current.type !== 'asset.list' || !current.assets[0]) throw new Error('The returned file is not available in the Library.');
            if (current.assets[0].displayName === stagingName) {
              const extension = path.extname(source.fileName); const stem = source.fileName.slice(0, source.fileName.length - extension.length);
              let renamed = false;
              for (let suffix = 0; suffix < 100 && !renamed; suffix++) {
                let name = suffix ? `${stem} (Vault ${suffix})${extension}` : source.fileName;
                if (suffix) { const characters = Array.from(stem); while (Buffer.byteLength(name, 'utf8') > 255 && characters.length) { characters.pop(); name = `${characters.join('')} (Vault ${suffix})${extension}`; } }
                const result = await this.options.worker({ type: 'asset.rename-file', libraryId, assetId: record.assetId, newFileName: name });
                renamed = result.ok;
                if (!result.ok && result.error.code !== 'ASSET_FILE_NAME_CONFLICT') {
                  throw new Error('The original file name could not be restored. The protected original was kept.');
                }
              }
              if (!renamed) throw new Error('No safe destination file name was available. The protected original was kept.');
            }
            const verified = await this.options.worker({ type: 'vault.destination.verify', libraryId, assetId: record.assetId, sha256: source.sha256, metadata: source.metadata });
            if (!verified.ok) throw new Error('Returned bytes or metadata did not verify. The protected original was kept.');
            record.verified = true; save();
            const removed = await this.privateCommand(image, { operation: 'remove', source });
            if (!removed.removed) throw new Error('The source changed or could not be removed. The Vault remains enabled; review both copies.');
            record.removed = true; save();
            if (existsSync(stagedFile)) rmSync(stagedFile);
          }
        }
        if (!record?.assetId) throw new Error('A returned image has no verified Library identity.');
        const verified = await this.options.worker({ type: 'vault.destination.verify', libraryId, assetId: record.assetId, sha256: record.source.sha256, metadata: record.source.metadata });
        if (!verified.ok) throw new Error('A returned Library file changed. The Vault cannot be marked disabled until the migration is verified.');
        completed++;
      }
      this.options.progress('Restoring tags, Collections and Smart Folders…');
      await this.restoreViews(journal, save);
      const final = await this.privateCommand(image, { operation: 'inventory' });
      if (!final.inventory || final.inventory.assets.length) throw new Error('Some Vault files remain. Vault storage has not been disabled.');
      const status = await this.options.vault({ operation: 'status' });
      const session = status.sessions.find((item) => item.image === image);
      if (session) { const locked = await this.options.vault({ operation: 'lock', id: session.id }); if (locked.error || locked.sessions.some((item) => item.image === image)) throw new Error('Files were returned, but the Vault could not be locked. It has not been marked disabled.'); }
      journal.complete = true; save();
      this.options.finishDisable();
      await this.options.clearCache();
      this.options.progress(`Vault disabled. ${completed} canonical file(s) returned with tags and metadata preserved.`);
      rmSync(staging, { recursive: true, force: true });
    } finally { this.running = false; }
  }
  private async privateCommand(image: string, command: VaultReturnCommand): Promise<VaultReturnResult> {
    const result = await this.options.vault({ operation: 'return-command', image, command });
    if (result.error || !result.returnResult) throw new Error(result.error ?? 'The Vault return request was not acknowledged.');
    if (result.returnResult.error) throw new Error(result.returnResult.error);
    return result.returnResult;
  }
  private async restoreViews(journal: Journal, save: () => void): Promise<void> {
    const rpc = this.options.worker; const libraryId = journal.libraryId;
    const listed = await rpc({ type: 'tag.list', libraryId }); if (!listed.ok || listed.type !== 'tag.list') throw new Error('Cannot restore tag definitions.');
    for (const tag of journal.inventory.tags) {
      let existing = listed.tags.find((item) => catalogTagKey(item.name) === catalogTagKey(tag.name));
      if (!existing) { const created = await rpc({ type: 'tag.create', libraryId, name: tag.name }); if (!created.ok || created.type !== 'tag.created') throw new Error('A Vault tag could not be restored.'); existing = created.tag; listed.tags.push(existing); }
      journal.tags[tag.tagId] = existing.tagId;
    }
    const pending = [...journal.inventory.collections];
    while (pending.length) {
      const index = pending.findIndex((item) => !item.parentId || journal.collections[item.parentId]);
      if (index < 0) throw new Error('The Vault Collection hierarchy is invalid.');
      const collection = pending.splice(index, 1)[0]!;
      if (!journal.collections[collection.collectionId]) {
        const created = await rpc({ type: 'collection.create', libraryId, name: collection.name, ...(collection.parentId ? { parentId: journal.collections[collection.parentId] } : {}) });
        if (!created.ok || created.type !== 'collection.created') throw new Error('A Vault Collection could not be restored.');
        journal.collections[collection.collectionId] = created.collection.collectionId; save();
      }
      if (collection.description) { const result = await rpc({ type: 'collection.update', libraryId, collectionId: journal.collections[collection.collectionId]!, description: collection.description }); if (!result.ok) throw new Error('Collection metadata was not restored.'); }
      const assetIds = collection.assetIds.map((id) => journal.files[id]?.assetId).filter((id): id is string => Boolean(id));
      if (assetIds.length) { const result = await rpc({ type: 'collection.assets.add', libraryId, collectionId: journal.collections[collection.collectionId]!, assetIds }); if (!result.ok) throw new Error('Collection membership was not restored.'); }
    }
    // Returning a canonical file restores manual memberships held by this Library before it entered protected storage.
    const previousIds = new Map<string, string>();
    for (const record of Object.values(journal.files)) { const previous = record.source.identities?.[libraryId]; if (previous && record.assetId && previous !== record.assetId) previousIds.set(previous, record.assetId); }
    if (previousIds.size) {
      const existing = await rpc({ type: 'smart-collection.list', libraryId });
      if (!existing.ok || existing.type !== 'smart-collection.list') throw new Error('Cannot restore original Smart Folder memberships.');
      for (const folder of existing.collections) {
        const definition = smartCollectionQueryDefinitionSchema.parse(JSON.parse(folder.queryDefinition)); let changed = false;
        const remap = (ids?: string[]) => ids?.map((id) => { const next = previousIds.get(id); if (next) changed = true; return next ?? id; });
        if (definition.includeAssetIds) definition.includeAssetIds = remap(definition.includeAssetIds);
        if (definition.excludeAssetIds) definition.excludeAssetIds = remap(definition.excludeAssetIds);
        if (changed) { const updated = await rpc({ type: 'smart-collection.update', libraryId, collectionId: folder.collectionId, queryDefinitionJson: JSON.stringify(definition) }); if (!updated.ok) throw new Error('Original manual Smart Folder choices could not be restored.'); }
      }
    }
    const folders = await rpc({ type: 'smart-collection.list', libraryId }); if (!folders.ok || folders.type !== 'smart-collection.list') throw new Error('Cannot restore Smart Folders.');
    for (const folder of journal.inventory.smartFolders) {
      if (journal.smartFolders[folder.collectionId]) continue;
      const definition = smartCollectionQueryDefinitionSchema.parse(JSON.parse(folder.queryDefinition));
      const mapIds = (ids?: string[]) => ids?.map((id) => journal.files[id]?.assetId ?? id);
      if (definition.includeAssetIds) definition.includeAssetIds = mapIds(definition.includeAssetIds);
      if (definition.excludeAssetIds) definition.excludeAssetIds = mapIds(definition.excludeAssetIds);
      for (const filter of definition.filters ?? []) if ('values' in filter) {
        if (filter.field === 'tag') filter.values = filter.values.map((id) => journal.tags[id] ?? id);
      }
      const queryDefinitionJson = JSON.stringify(definition);
      const equivalent = folders.collections.find((item) => item.name === folder.name && item.queryDefinition === queryDefinitionJson);
      if (equivalent) journal.smartFolders[folder.collectionId] = equivalent.collectionId;
      else {
        let name = folder.name; let suffix = 1;
        while (folders.collections.some((item) => item.name === name)) name = `${folder.name} (Vault ${suffix++})`;
        const created = await rpc({ type: 'smart-collection.create', libraryId, name, queryDefinitionJson });
        if (!created.ok || created.type !== 'smart-collection.created') throw new Error('A Vault Smart Folder could not be restored.');
        journal.smartFolders[folder.collectionId] = created.collection.collectionId; folders.collections.push(created.collection);
      }
      save();
    }
    save();
  }
}
