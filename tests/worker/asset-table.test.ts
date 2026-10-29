import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach,expect,it } from 'vitest';
import { LibraryService } from '../../src/worker/library-service';
import { AssetTableService } from '../../src/worker/asset-table-service';
import { tableResponseSchema,tableRequestSchema } from '../../src/shared/asset-table';
const fixtures: Array<{ root: string; service: LibraryService }> = [];
function fixture(count = 3) {
 mkdirSync('.local',{ recursive: true }); const root = mkdtempSync(path.resolve('.local/list-table-')); const service = new LibraryService(); fixtures.push({ root,service });
 const library = service.createLibrary({ displayName: 'Synthetic table',selectedParentPath: root }); const source = path.join(root,'sources'); mkdirSync(source);
 const paths = Array.from({ length: count },(_,i) => { const file = path.join(source,`Image-${String(i).padStart(3,'0')}.png`); writeFileSync(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')); return file; });
 const imported = service.prepareOrExecuteImport({ libraryId: library.libraryId,sourceKind: 'files',sourcePaths: paths,createImageSequence: false }); if (!('assets' in imported)) throw new Error('Fixture import failed');
 const request = { libraryId: library.libraryId,sort: { column: 'name',order: 'asc' as const },columns: ['name','rating','tags','characters','author'],offset: 0,limit: 100 };
 return { service,library,root,assets: imported.assets,table: new AssetTableService(service),request };
}
afterEach(() => { for (const f of fixtures.splice(0)) { f.service.closeAll(); rmSync(f.root,{ recursive: true,force: true }); } });
it('sorts the complete scope before paging rather than sorting the visible first page',async () => {
 const f = fixture(205); const last = f.assets.find((a) => a.displayName === 'Image-204.png')!;
 f.service.setAssetMetadata({ libraryId: f.library.libraryId,assetId: last.assetId,expectedVersion: 0,rating: 5,author: 'Zebra' });
 const result = tableResponseSchema.parse(await f.table.page({ ...f.request,sort: { column: 'rating',order: 'desc' },limit: 1 }));
 expect(result.total).toBe(205); expect(result.rows[0]?.asset.assetId).toBe(last.assetId);
 const second = await f.table.page({ ...f.request,sort: { column: 'rating',order: 'desc' },offset: 1,limit: 100 }); expect(second.rows).toHaveLength(100); expect(second.rows.some((r) => r.asset.assetId === last.assetId)).toBe(false);
});
it('sorts metadata globally, keeps empty values last and refreshes after a metadata edit',async () => {
 const f = fixture(); const last = f.assets[2]!;
 f.service.setAssetMetadata({ libraryId: f.library.libraryId,assetId: last.assetId,expectedVersion: 0,description: 'Alpha' });
 const request = { ...f.request,sort: { column: 'description',order: 'asc' as const },columns: ['name','description'],limit: 1 };
 expect((await f.table.page(request)).rows[0]?.asset.assetId).toBe(last.assetId);
 const first = f.assets[0]!; f.service.setAssetMetadata({ libraryId: f.library.libraryId,assetId: first.assetId,expectedVersion: 0,description: 'Aardvark' });
 expect((await f.table.page(request)).rows[0]?.asset.assetId).toBe(first.assetId);
 const desc = await f.table.page({ ...request,sort: { column: 'description',order: 'desc' },limit: 100 }); expect(desc.rows.at(-1)?.values.description).toBeNull();
});
it('keeps Smart Folder manual exclusions and live filters when listing and selecting ranges',async () => {
 const f = fixture(); const tag = f.service.createTag({ libraryId: f.library.libraryId,name: 'Character: Momo' });
 f.service.assignTags({ libraryId: f.library.libraryId,assetIds: f.assets.map((a) => a.assetId),tagIds: [tag.tagId] });
 const smart = f.service.createSmartCollection({ libraryId: f.library.libraryId,name: 'Momo',queryDefinitionJson: JSON.stringify({ rules: { kind: 'character',value: 'Momo' },excludeAssetIds: [f.assets[1]!.assetId] }) });
 const request = { ...f.request,scope: { kind: 'smart_collection' as const,collectionId: smart.collectionId },sort: { column: 'characters',order: 'asc' as const } };
 const rows = await f.table.page(request); expect(rows.total).toBe(2); expect(rows.rows.every((row) => row.values.characters === 'Momo')).toBe(true);
 const filtered = await f.table.page({ ...request,filters: [{ field: 'rating',values: ['5'],exclude: false }] }); expect(filtered.total).toBe(0);
 const ids = await f.table.page({ ...request,idsOnly: true,limit: 10000 }); expect(ids.rows).toHaveLength(0); expect(ids.assetIds).toEqual(rows.rows.map((r) => r.asset.assetId));
 expect(f.service.listAssets({ libraryId: f.library.libraryId,recursive: true })).toHaveLength(3);
});
it('reads original generation columns locally and sorts high precision seeds correctly',async () => {
 const f = fixture();
 function png(text: string) { const base=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'); const data=Buffer.from('parameters\0'+text); const header=Buffer.alloc(8); header.writeUInt32BE(data.length); header.write('tEXt',4); return Buffer.concat([base.subarray(0,base.length-12),header,data,Buffer.alloc(4),base.subarray(base.length-12)]); }
 // The local metadata reader reads text chunks without decoding/recompressing the image.
 for (const [index,seed] of ['18446744073709551615','18446744073709551614'].entries()) {
  const file=path.join(f.root,`Generation-${index}.png`);writeFileSync(file,png(`a library <lora:Paper:0.6>\nNegative prompt: blur\nSteps: 28, Sampler: Euler, CFG scale: 6.5, Seed: ${seed}, Size: 1x1, Model: Model-${index}`));
  f.service.prepareOrExecuteImport({ libraryId: f.library.libraryId,sourceKind: 'files',sourcePaths: [file],createImageSequence: false });
 }
 const result=await f.table.page({ ...f.request,sort: { column: 'generation.seed',order: 'asc' },columns: ['name','generation.seed','generation.models','generation.loras','generation.prompt'] });
 expect(result.rows[0]?.values['generation.seed']).toBe('18446744073709551614'); expect(result.rows[1]?.values['generation.seed']).toBe('18446744073709551615'); expect(result.rows[0]?.values['generation.models']).toContain('Model-1'); expect(result.rows[0]?.values['generation.loras']).toContain('Paper');
});
it('rejects unknown sort keys and path-bearing requests at the boundary',() => {
 const f=fixture(); expect(tableRequestSchema.safeParse({ ...f.request,sort: { column: 'DROP TABLE assets',order: 'asc' } }).success).toBe(false); expect(tableRequestSchema.safeParse({ ...f.request,sourcePath: '/outside' }).success).toBe(false);
});

it('sorts Name by the file name independently of its physical folder',async () => {
 const f = fixture(); const a = f.service.createManagedFolder({ libraryId: f.library.libraryId,name: 'A folder' }); const z = f.service.createManagedFolder({ libraryId: f.library.libraryId,name: 'Z folder' });
 f.service.moveAssets({ libraryId: f.library.libraryId,assetIds: [f.assets[0]!.assetId],targetFolderId: z.folderId,conflictStrategy: 'keep-both' });
 f.service.moveAssets({ libraryId: f.library.libraryId,assetIds: [f.assets[2]!.assetId],targetFolderId: a.folderId,conflictStrategy: 'keep-both' });
 const result = await f.table.page(f.request); expect(result.rows.map((row) => row.asset.displayName)).toEqual(['Image-000.png','Image-001.png','Image-002.png']);
});
