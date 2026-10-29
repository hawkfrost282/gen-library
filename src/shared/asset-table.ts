import { z } from 'zod';
import { assetSummarySchema, extractedVideoMetadataSchema, filterClauseSchema, searchQuerySchema, searchScopeSchema, type SortDefinition } from './asset-types';
import { generationMetadataSchema } from './generation-metadata';
export type TableColumn = { id: string; label: string; group: string; numeric?: boolean; sqlSort?: SortDefinition['field'] };
const label = (key: string) => key.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/^./u, (s) => s.toUpperCase());
export const TABLE_COLUMNS: TableColumn[] = [
  { id: 'name', label: 'Name', group: 'File' },
  { id: 'folder', label: 'Folder', group: 'File' }, { id: 'path', label: 'Relative path', group: 'File' },
  { id: 'format', label: 'Format', group: 'File' }, { id: 'mediaType', label: 'Media type', group: 'File' },
  { id: 'byteSize', label: 'File size', group: 'File', numeric: true, sqlSort: 'byte_size' },
  { id: 'modifiedAt', label: 'Date modified', group: 'File', sqlSort: 'modified_at' },
  { id: 'createdAt', label: 'Date added', group: 'File', sqlSort: 'created_at' },
  { id: 'width', label: 'Width', group: 'File', numeric: true }, { id: 'height', label: 'Height', group: 'File', numeric: true },
  { id: 'durationMs', label: 'Duration (ms)', group: 'File', numeric: true, sqlSort: 'duration' },
  { id: 'availability', label: 'Availability', group: 'File' }, { id: 'locationKind', label: 'Storage type', group: 'File' },
  ...['rating','favorite','tags','characters','contentLevel','description','author','sourcePageUrl','palette','updatedAt'].map((id): TableColumn => ({ id, label: ({ rating: 'Stars', favorite: 'Favorite', contentLevel: 'Content level', sourcePageUrl: 'Source URL', updatedAt: 'Metadata updated' } as Record<string,string>)[id] ?? label(id), group: 'Organization', ...(id === 'rating' ? { numeric: true, sqlSort: 'rating' } : id === 'author' ? { sqlSort: 'author' } : {}) })),
  ...Object.keys(generationMetadataSchema.shape).map((key): TableColumn => ({ id: `generation.${key}`, label: ({ models: 'Generation model', loras: 'LoRAs', cfg: 'Guidance / CFG', source: 'Generation source', raw: 'Original generation metadata' } as Record<string,string>)[key] ?? label(key), group: 'Generation', ...(['steps','cfg','width','height'].includes(key) ? { numeric: true } : {}) })),
  ...Object.keys(extractedVideoMetadataSchema.shape).map((key): TableColumn => ({ id: `technical.${key}`, label: label(key), group: 'Technical' })),
  ...['description','rating','tags','modelId','modelVersion','generatedAt'].map((key): TableColumn => ({ id: `ai.${key}`, label: `AI ${label(key)}`, group: 'AI analysis', ...(key === 'rating' ? { numeric: true } : {}) })),
];
const columnIds = new Set(TABLE_COLUMNS.map((c) => c.id));
export const tableColumnIdSchema = z.string().refine((id) => columnIds.has(id), 'Unknown list column.');
export const tableSortSchema = z.strictObject({ column: tableColumnIdSchema, order: z.enum(['asc','desc']) });
export const tableRequestSchema = z.strictObject({
  libraryId: z.string().min(1).max(255), query: searchQuerySchema.nullable().optional(), filters: z.array(filterClauseSchema).optional(), scope: searchScopeSchema.optional(), showIgnored: z.boolean().optional(),
  sort: tableSortSchema, columns: z.array(tableColumnIdSchema).max(200), offset: z.number().int().min(0), limit: z.number().int().min(1).max(10000), idsOnly: z.boolean().optional(),
});
export const tableValueSchema = z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
export const tableRowSchema = z.strictObject({ asset: assetSummarySchema, values: z.record(z.string(),tableValueSchema) });
export const tableResponseSchema = z.strictObject({ rows: z.array(tableRowSchema).max(200), assetIds: z.array(z.string()).max(10000), total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), error: z.string().optional() });
export type TableRequest = z.infer<typeof tableRequestSchema>;
export type TableResponse = z.infer<typeof tableResponseSchema>;
export type TableRow = z.infer<typeof tableRowSchema>;
export type TableValue = z.infer<typeof tableValueSchema>;
export const TABLE_CHANNEL = 'gen-library:asset-table';
export type AssetTableApi = { request(input: TableRequest): Promise<TableResponse> };
/** Stable, numeric-aware ordering. Empty values stay last in both directions; seeds retain integer precision. */
export function compareTableValues(a: TableValue | undefined, b: TableValue | undefined, column: TableColumn, order: 'asc'|'desc'): number {
  const emptyA = a == null || a === ''; const emptyB = b == null || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  let result: number;
  if (column.id === 'generation.seed' && /^-?\d+$/u.test(String(a)) && /^-?\d+$/u.test(String(b))) result = BigInt(String(a)) < BigInt(String(b)) ? -1 : BigInt(String(a)) > BigInt(String(b)) ? 1 : 0;
  else if ((column.numeric || typeof a === 'number') && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) result = Number(a) - Number(b);
  else result = String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
  return order === 'asc' ? result : -result;
}
