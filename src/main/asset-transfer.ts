import type { WorkerCommand } from '../shared/protocol/requests';
import type { WorkerResult } from '../shared/protocol/responses';
import { catalogTagKey, relativeFolderSchema, type RoutedMetadata } from '../shared/vault-routing';
export type TransferRpc = (command: WorkerCommand) => Promise<WorkerResult>;
/** Folder placement and descriptive metadata are intentionally separate operations. */
export async function ensurePhysicalFolder(rpc: TransferRpc, libraryId: string, relativePath: string): Promise<string | undefined> {
  relativeFolderSchema.parse(relativePath);
  const listed = await rpc({ type: 'folder.list', libraryId });
  if (!listed.ok || listed.type !== 'folder.list') throw new Error('Cannot read destination folders.');
  let parent: string | undefined;
  for (const name of relativePath.split('/').filter(Boolean)) {
    let folder = listed.folders.find((item) => (item.parentFolderId ?? undefined) === parent && item.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'));
    if (!folder) {
      const created = await rpc({ type: 'folder.create', libraryId, name, ...(parent ? { parentFolderId: parent } : {}) });
      if (!created.ok || created.type !== 'folder.created') throw new Error('Cannot create a destination folder.');
      folder = created.folder; listed.folders.push(folder);
    }
    parent = folder.folderId;
  }
  return parent;
}
export async function restoreTransferredMetadata(rpc: TransferRpc, libraryId: string, assetId: string, metadata: RoutedMetadata, modifiedAt?: string, identities?: Record<string, string>): Promise<void> {
  const current = await rpc({ type: 'asset.metadata.get', libraryId, assetId });
  if (!current.ok || current.type !== 'asset.metadata.got') throw new Error('Cannot read the imported metadata.');
  const restored = await rpc({ type: 'asset.metadata.set', libraryId, assetId, expectedVersion: current.metadata.entityVersion, description: metadata.description ?? '', rating: metadata.rating, favorite: metadata.favorite, ...(metadata.palette ? { palette: metadata.palette } : {}), sourcePageUrl: metadata.sourcePageUrl ?? '', author: metadata.author ?? '' });
  if (!restored.ok) throw new Error('Metadata was not saved.');
  const tags = await rpc({ type: 'tag.list', libraryId });
  if (!tags.ok || tags.type !== 'tag.list') throw new Error('Cannot list destination tags.');
  const ids: string[] = [];
  for (const name of metadata.tags) {
    let tag = tags.tags.find((item) => catalogTagKey(item.name) === catalogTagKey(name));
    if (!tag) { const created = await rpc({ type: 'tag.create', libraryId, name }); if (!created.ok || created.type !== 'tag.created') throw new Error('Cannot restore a tag.'); tag = created.tag; tags.tags.push(tag); }
    ids.push(tag.tagId);
  }
  if (ids.length) { const assigned = await rpc({ type: 'tag.assign', libraryId, assetIds: [assetId], tagIds: ids, applyStoragePolicies: false }); if (!assigned.ok) throw new Error('Tags were not saved.'); }
  const layers = await rpc({ type: 'vault.metadata.restore-layers', libraryId, assetId, metadata, ...(modifiedAt ? { modifiedAt } : {}), ...(identities ? { identities } : {}) });
  if (!layers.ok) throw new Error('AI metadata and tag provenance were not restored.');
}
