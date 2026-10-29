import { z } from 'zod';
import { tableColumnIdSchema, tableSortSchema } from '../shared/asset-table';
export const listPreferencesSchema = z.strictObject({ version: z.literal(1), columns: z.array(tableColumnIdSchema).min(1).max(200), widths: z.record(z.string(),z.number().int().min(80).max(640)), thumbnails: z.boolean(), sort: tableSortSchema });
export type ListPreferences = z.infer<typeof listPreferencesSchema>;
export const DEFAULT_LIST_PREFERENCES: ListPreferences = { version: 1, columns: ['name','rating','favorite','characters','tags','generation.models','byteSize','modifiedAt'], widths: {}, thumbnails: false, sort: { column: 'name',order: 'asc' } };
export function loadListPreferences(libraryId: string, storage: Pick<Storage,'getItem'> = localStorage): ListPreferences { try { const parsed = listPreferencesSchema.parse(JSON.parse(storage.getItem(`gen-library.list.${libraryId}.v1`) ?? 'null')); return { ...parsed, columns: ['name',...new Set(parsed.columns.filter((key) => key !== 'name'))] }; } catch { return structuredClone(DEFAULT_LIST_PREFERENCES); } }
export function saveListPreferences(libraryId: string, value: ListPreferences, storage: Pick<Storage,'setItem'> = localStorage): void { storage.setItem(`gen-library.list.${libraryId}.v1`,JSON.stringify(value)); }
