import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LibraryService } from '../../src/worker/library-service';
import type { SmartCollectionQueryDefinition } from '../../src/shared/asset-types';
const roots: string[] = []; const services: LibraryService[] = [];
afterEach(() => { services.splice(0).forEach((service) => service.closeAll()); roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); });
function fixture() {
  mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/smart-folders-')); roots.push(root);
  const service = new LibraryService(); services.push(service); const library = service.createLibrary({ displayName: 'Synthetic', selectedParentPath: root });
  const assets = Array.from({ length: 4 }, (_, index) => {
    const source = path.join(root, `${index}.png`); writeFileSync(source, `synthetic image ${index}`);
    const result = service.prepareOrExecuteImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [source] });
    if (!('assets' in result)) throw new Error('Unexpected fixture conflict');
    return result.assets[0]!.assetId;
 });
 const tags = ['Character: Momo', 'NSFW', 'Vault'].map((name) => service.createTag({ libraryId: library.libraryId, name }));
 service.assignTags({ libraryId: library.libraryId, assetIds: [assets[0]!], tagIds: [tags[0]!.tagId] });
 service.assignTags({ libraryId: library.libraryId, assetIds: [assets[1]!], tagIds: [tags[1]!.tagId] });
 assets.forEach((assetId, index) => service.setAssetMetadata({ libraryId: library.libraryId, assetId, expectedVersion: 0, rating: [4, 1, 2, 5][index]!, favorite: index === 3 }));
 const definition: SmartCollectionQueryDefinition = { rules: { kind: 'all', rules: [{ kind: 'any', rules: [{ kind: 'character', value: 'Momo' }, { kind: 'favorite', value: true }] }, { kind: 'rating', operator: 'atLeast', value: 4 }, { kind: 'not', rule: { kind: 'tag', value: 'Vault' } }] }, includeAssetIds: [assets[2]!], excludeAssetIds: [assets[3]!] };
 const smart = service.createSmartCollection({ libraryId: library.libraryId, name: 'Favorites and Momo', queryDefinitionJson: JSON.stringify(definition) });
 return { service, library, assets, smart };
}
it('uses AND/OR/NOT with manual inclusion and exclusion without copying or moving the canonical files', () => {
 const f = fixture(); const before = f.assets.map((assetId) => f.service.resolveAssetPath(f.library.libraryId, assetId));
 const result = f.service.executeSmartCollection({ libraryId: f.library.libraryId, collectionId: f.smart.collectionId });
 expect(result.items.map((asset) => asset.assetId).sort()).toEqual([f.assets[0], f.assets[2]].sort());
 expect(f.service.listSmartCollections(f.library.libraryId)[0]?.assetCount).toBe(2);
 expect(f.assets.map((assetId) => f.service.resolveAssetPath(f.library.libraryId, assetId))).toEqual(before);
 expect(before.every(existsSync)).toBe(true); expect(readdirSync(path.join(f.library.libraryPath, 'Assets'))).toHaveLength(4);
});
it('uses the same membership for paged browsing and ANDs live filters outside the saved rule', () => {
 const f = fixture();
 const browse = f.service.createBrowseSession({ libraryId: f.library.libraryId, libraryGeneration: 1, smartCollectionId: f.smart.collectionId, query: null, limit: 1 });
 expect(browse.total).toBe(2);
 const second = f.service.readBrowseSessionPage({ libraryId: f.library.libraryId, libraryGeneration: 1, sessionId: browse.session.sessionId, offset: 1, limit: 1 });
 expect(second.status).toBe('ready'); if (second.status === 'ready') expect(second.items).toHaveLength(1);
 const filtered = f.service.searchAssets({ libraryId: f.library.libraryId, scope: { kind: 'smart_collection', collectionId: f.smart.collectionId }, filters: [{ field: 'rating', values: ['4','5'], exclude: false }] });
 expect(filtered.items.map((asset) => asset.assetId)).toEqual([f.assets[0]]);
});
it('supports multiple virtual memberships and treats rule text as data rather than SQL', () => {
 const f = fixture();
 const other = f.service.createSmartCollection({ libraryId: f.library.libraryId, name: 'Another view', queryDefinitionJson: JSON.stringify({ rules: { kind: 'character', value: 'Momo' } }) });
 expect(f.service.executeSmartCollection({ libraryId: f.library.libraryId, collectionId: other.collectionId }).items[0]?.assetId).toBe(f.assets[0]);
 const malicious = f.service.createSmartCollection({ libraryId: f.library.libraryId, name: 'Literal text', queryDefinitionJson: JSON.stringify({ rules: { kind: 'tag', value: "' OR 1=1 --" } }) });
 expect(f.service.executeSmartCollection({ libraryId: f.library.libraryId, collectionId: malicious.collectionId }).total).toBe(0);
 expect(f.service.listAssets({ libraryId: f.library.libraryId, recursive: true })).toHaveLength(4);
});
it('keeps physical folders manual by default, and uses character, Shared and Unassigned only after opt-in', () => {
 const f = fixture(); const before = f.assets.map((assetId) => f.service.resolveAssetPath(f.library.libraryId, assetId));
 expect(f.service.organizePhysicalFiles({ libraryId: f.library.libraryId }).movedCount).toBe(0);
 f.service.setOrganizationSettings(f.library.libraryId, { autoCharacterFolders: true, characterFolders: {} });
 expect(f.assets.map((assetId) => f.service.resolveAssetPath(f.library.libraryId, assetId))).toEqual(before);
 const secondCharacter = f.service.createTag({ libraryId: f.library.libraryId, name: 'Character: Una' }); f.service.assignTags({ libraryId: f.library.libraryId, assetIds: [f.assets[0]!], tagIds: [secondCharacter.tagId] });
 const unrelated = f.service.listTags(f.library.libraryId).find((tag) => tag.name === 'NSFW')!;
 expect(f.service.organizePhysicalFiles({ libraryId: f.library.libraryId, assetIds: [f.assets[0]!], changedTagIds: [unrelated.tagId] }).movedCount).toBe(0);
 f.service.organizePhysicalFiles({ libraryId: f.library.libraryId });
 expect(f.service.listAssets({ libraryId: f.library.libraryId, recursive: true }).find((asset) => asset.assetId === f.assets[0])?.relativeFilePath).toBe('Shared/0.png');
 expect(f.service.listAssets({ libraryId: f.library.libraryId, recursive: true }).find((asset) => asset.assetId === f.assets[2])?.relativeFilePath).toBe('Unassigned/2.png');
});
