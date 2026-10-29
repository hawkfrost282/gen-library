import { ipcRenderer } from 'electron';
import { ORGANIZATION_CHANNEL, organizationRequestSchema, organizationResponseSchema, type OrganizationApi } from '../../shared/organization';
export const organization: OrganizationApi = Object.freeze({ async request(input) { return organizationResponseSchema.parse(await ipcRenderer.invoke(ORGANIZATION_CHANNEL, organizationRequestSchema.parse(input))); } });
