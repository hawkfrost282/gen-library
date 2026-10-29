import { ipcRenderer } from 'electron';
import { TABLE_CHANNEL, tableRequestSchema, tableResponseSchema, type AssetTableApi } from '../../shared/asset-table';
export const assetTable: AssetTableApi = Object.freeze({ async request(input) { return tableResponseSchema.parse(await ipcRenderer.invoke(TABLE_CHANNEL,tableRequestSchema.parse(input))); } });
