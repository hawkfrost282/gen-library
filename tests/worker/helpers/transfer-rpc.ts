import { createPublicError } from '../../../src/shared/protocol/errors';
import type { WorkerCommand } from '../../../src/shared/protocol/requests';
import { workerResultSchema, type WorkerResult } from '../../../src/shared/protocol/responses';
import { type LibraryService, LibraryServiceError } from '../../../src/worker/library-service';
/** Exercises the strict transport shape while using real disposable SQLite catalogs and files. */
export function transferRpc(service: LibraryService) {
  return async (command: WorkerCommand): Promise<WorkerResult> => {
    let result: WorkerResult;
    try {
      switch (command.type) {
        case 'library.list': result = { ok: true, type: 'library.list', libraries: service.listLibraries() }; break;
        case 'asset.list': result = { ok: true, type: 'asset.list', assets: service.listAssets(command) }; break;
        case 'folder.list': result = { ok: true, type: 'folder.list', folders: service.listManagedFolders(command.libraryId) }; break;
        case 'folder.create': result = { ok: true, type: 'folder.created', folder: service.createManagedFolder(command) }; break;
        case 'asset.import.prepare': { const value = service.prepareOrExecuteImport(command); if ('assets' in value) result = { ok: true, type: 'asset.import.completed', completion: value }; else if ('fileCount' in value) result = { ok: true, type: 'asset.import.conflicts', plan: value }; else throw new Error('Synthetic import source failure'); break; }
        case 'asset.import.resolve': result = { ok: true, type: 'asset.import.completed', completion: service.resolveImport(command) }; break;
        case 'asset.metadata.get': result = { ok: true, type: 'asset.metadata.got', metadata: service.getAssetMetadata(command) }; break;
        case 'asset.metadata.set': result = { ok: true, type: 'asset.metadata.updated', metadata: service.setAssetMetadata(command) }; break;
        case 'asset.rename-file': { const value = service.renameAssetFile(command); result = { ok: true, type: 'asset.file-renamed', asset: value.asset }; break; }
        case 'tag.list': result = { ok: true, type: 'tag.list', tags: service.listTags(command.libraryId) }; break;
        case 'tag.create': result = { ok: true, type: 'tag.created', tag: service.createTag(command) }; break;
        case 'tag.assign': { const value = service.assignTags(command); result = { ok: true, type: 'tag.assigned', ...value }; break; }
        case 'vault.destination.verify': service.verifyVaultDestination(command); result = { ok: true, type: 'library.closed', libraryId: command.libraryId }; break;
        case 'vault.metadata.restore-layers': service.restoreVaultMetadataLayers(command); result = { ok: true, type: 'library.closed', libraryId: command.libraryId }; break;
        case 'organization.get': result = { ok: true, type: 'organization.settings', settings: service.getOrganizationSettings(command.libraryId) }; break;
        case 'organization.apply': result = { ok: true, type: 'organization.settings', settings: service.getOrganizationSettings(command.libraryId), ...service.organizePhysicalFiles(command) }; break;
        case 'organization.set': result = { ok: true, type: 'organization.settings', settings: service.setOrganizationSettings(command.libraryId, command.settings) }; break;
        case 'smart-collection.list': result = { ok: true, type: 'smart-collection.list', collections: service.listSmartCollections(command.libraryId) }; break;
        case 'smart-collection.update': result = { ok: true, type: 'smart-collection.updated', collection: service.updateSmartCollection(command) }; break;
        case 'smart-collection.create': result = { ok: true, type: 'smart-collection.created', collection: service.createSmartCollection(command) }; break;
        case 'collection.list': result = { ok: true, type: 'collection.list', collections: service.listCollections(command.libraryId) }; break;
        case 'collection.create': result = { ok: true, type: 'collection.created', collection: service.createCollection(command) }; break;
        case 'collection.update': result = { ok: true, type: 'collection.updated', collection: service.updateCollection(command) }; break;
        case 'collection.assets.add': { const value = service.addCollectionAssets(command); result = { ok: true, type: 'collection.assets.added', ...value }; break; }
        case 'vault.return.inventory': result = { ok: true, type: 'vault.return.inventory', inventory: service.vaultReturnInventory(command.libraryId) }; break;
        case 'vault.return.prepare': case 'vault.source.prepare': result = { ok: true, type: 'vault.source.prepared', source: service.prepareVaultTransfer(command) }; break;
        case 'vault.return.remove': case 'vault.source.remove': result = { ok: true, type: 'asset.deleted-from-disk', ...await service.removeVaultTransferredSource(command.source) }; break;
        default: throw new Error(`Unsupported synthetic RPC ${command.type}`);
      }
    } catch (error) { result = { ok: false, error: createPublicError(error instanceof LibraryServiceError ? error.code : 'INTERNAL_ERROR') }; }
    return workerResultSchema.parse(result);
  };
}
