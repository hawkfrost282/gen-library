import path from 'node:path';
import { setImmediate as yieldToWorker } from 'node:timers/promises';
import type { AssetSummary } from '../shared/asset-types';
import { TABLE_COLUMNS, compareTableValues, type TableRequest, type TableResponse, type TableValue } from '../shared/asset-table';
import type { LibraryService } from './library-service';
import { readGenerationMetadata } from './generation-metadata-reader';
/** Read-only local read model. Retains ordered IDs, never a second catalog or another canonical file. */
export class AssetTableService {
  private snapshots = new Map<string, { key: string; ids: string[] }>();
  private builds = new Map<string, { key: string; promise: Promise<string[]> }>();
  constructor(private readonly service: LibraryService) {}
  private async values(libraryId: string, asset: AssetSummary, columns: readonly string[]): Promise<Record<string,TableValue>> {
    const values: Record<string,TableValue> = { name: asset.displayName, path: asset.relativeFilePath, folder: path.posix.dirname(asset.relativeFilePath) === '.' ? '' : path.posix.dirname(asset.relativeFilePath), format: path.extname(asset.displayName).slice(1).toUpperCase(), mediaType: asset.mediaType, byteSize: asset.byteSize, modifiedAt: asset.modifiedAt, width: asset.width, height: asset.height, durationMs: asset.durationMs, availability: asset.availability, locationKind: asset.locationKind, rating: asset.rating, favorite: asset.favorite };
    if (columns.includes('createdAt')) values.createdAt = this.service.getAssetTableCreatedAt(libraryId, asset.assetId);
    if (columns.some((key) => TABLE_COLUMNS.some((c) => c.id === key && c.group === 'Organization'))) {
      const metadata = this.service.getAssetMetadata({ libraryId, assetId: asset.assetId });
      for (const [key,value] of Object.entries(metadata)) if (['description','author','sourcePageUrl','palette','updatedAt'].includes(key)) values[key] = scalar(value);
      const names = metadata.tags.map((tag) => tag.name);
      values.tags = names.join(', '); values.characters = names.map((name) => /^character\s*:\s*(.+)$/iu.exec(name)?.[1]).filter(Boolean).join(', ');
      values.contentLevel = names.filter((name) => /^nsfw$/iu.test(name) || /^content\s*:/iu.test(name)).join(', ');
    }
    if (columns.some((key) => key.startsWith('technical.'))) {
      try { const result = this.service.getExtractedMetadata({ libraryId, assetId: asset.assetId }); for (const [key,value] of Object.entries(result.metadata ?? {})) values[`technical.${key}`] = scalar(value); } catch { /* Offline metadata stays empty. */ }
    }
    if (columns.some((key) => key.startsWith('generation.'))) {
      try { const source = this.service.resolveAssetFilePath(libraryId, asset.assetId); const generation = await readGenerationMetadata(source.filePath); for (const [key,value] of Object.entries(generation ?? {})) values[`generation.${key}`] = scalar(value); } catch { /* Missing sources remain browsable. */ }
    }
    if (columns.some((key) => key.startsWith('ai.'))) {
      const contents = this.service.getAiContent(libraryId, asset.assetId);
      for (const content of contents) values[`ai.${content.fieldName}`] = content.fieldName === 'rating' && Number.isFinite(Number(content.value)) ? Number(content.value) : content.value;
      values['ai.modelId'] = [...new Set(contents.map((c) => c.modelId))].join(', '); values['ai.modelVersion'] = [...new Set(contents.map((c) => c.modelVersion))].join(', '); values['ai.generatedAt'] = contents.map((c) => c.generatedAt).sort().at(-1) ?? null;
    }
    return Object.fromEntries(columns.map((key) => [key, values[key] ?? null]));
  }
  async page(input: TableRequest): Promise<TableResponse> {
    const service = this.service; const limit = input.idsOnly ? input.limit : Math.min(200,input.limit);
    const column = TABLE_COLUMNS.find((c) => c.id === input.sort.column); if (!column) throw new Error('Unknown list sort column.');
    const search = { libraryId: input.libraryId, query: input.query, filters: input.filters, scope: input.scope, showIgnored: input.showIgnored };
    let items: AssetSummary[]; let ids: string[]; let total: number;
    if (column.sqlSort) {
      const result = service.searchAssets({ ...search, sort: { field: column.sqlSort, order: input.sort.order }, offset: input.offset, limit, ...(input.idsOnly ? { idsOnly: true, idsPage: true } : {}) });
      items = result.items; ids = result.assetIds ?? items.map((asset) => asset.assetId); total = result.total;
    } else {
      const sequence = service.getBrowseChangeSequence(input.libraryId);
      const key = JSON.stringify([search,input.sort,sequence,service.getChangeSequence(input.libraryId)]);
      let snapshot = this.snapshots.get(input.libraryId);
      if (snapshot?.key !== key) {
        let building = this.builds.get(input.libraryId);
        if (building?.key !== key) {
          const build = async () => {
            const ranked: Array<{ id: string; value: TableValue }> = [];
            for (let offset = 0; ; offset += 200) {
              if (this.builds.get(input.libraryId)?.key !== key || service.getBrowseChangeSequence(input.libraryId) !== sequence) throw new Error('The list changed while sorting. Refresh to try again.');
              const page = service.searchAssets({ ...search, sort: { field: 'name', order: 'asc' }, offset, limit: 200 });
              for (const asset of page.items) ranked.push({ id: asset.assetId, value: (await this.values(input.libraryId,asset,[column.id]))[column.id] ?? null });
              if (offset + page.items.length >= page.total || !page.items.length) break;
              await yieldToWorker();
            }
            if (service.getBrowseChangeSequence(input.libraryId) !== sequence) throw new Error('The list changed while sorting. Refresh to try again.');
            ranked.sort((a,b) => compareTableValues(a.value,b.value,column,input.sort.order) || a.id.localeCompare(b.id));
            const sorted = ranked.map((row) => row.id); this.snapshots.set(input.libraryId,{ key,ids: sorted });
            while (this.snapshots.size > 4) this.snapshots.delete(this.snapshots.keys().next().value!);
            return sorted;
          };
          const promise = Promise.resolve().then(build); building = { key,promise }; this.builds.set(input.libraryId,building);
          void promise.finally(() => { if (this.builds.get(input.libraryId)?.promise === promise) this.builds.delete(input.libraryId); }).catch(() => {});
        }
        const sorted = await building.promise; snapshot = { key,ids: sorted };
      }
      total = snapshot.ids.length; ids = snapshot.ids.slice(input.offset,input.offset + limit);
      if (input.idsOnly) items = [];
      else { const result = service.searchAssets({ libraryId: input.libraryId, sessionAssetIds: snapshot.ids, offset: input.offset, limit }); const byId = new Map(result.items.map((asset) => [asset.assetId,asset])); items = ids.map((id) => byId.get(id)).filter((asset): asset is AssetSummary => Boolean(asset)); }
    }
    const rows = [];
    for (const asset of items) { const values = await this.values(input.libraryId,asset,input.columns); rows.push({ asset, values: Object.fromEntries(Object.entries(values).map(([key,value]) => [key, typeof value === 'string' && value.length > 65536 ? value.slice(0,65536) + '…' : value])) }); }
    return { rows, assetIds: ids,total,offset: input.offset };
  }
}
function scalar(value: unknown): TableValue { if (value == null) return null; if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value; if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', '); return JSON.stringify(value); }
