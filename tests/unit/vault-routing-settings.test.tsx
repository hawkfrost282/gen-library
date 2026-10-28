// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { VaultRoutingSettings } from '../../src/renderer/VaultRoutingSettings';
import { DEFAULT_ROUTING_CONFIG } from '../../src/shared/vault-routing';
import type { VaultStatus } from '../../src/shared/vault';
let root: Root | undefined; let container: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); });
function mount() { container = document.createElement('div'); document.body.append(container); root = createRoot(container); }
it('keeps optional routing folded and disabled until a destination is chosen', async () => {
  mount(); const send = vi.fn(async () => {});
  const status: VaultStatus = { supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [], routing: { config: DEFAULT_ROUTING_CONFIG, busy: false, pending: [] } };
  await act(async () => root!.render(createElement(VaultRoutingSettings, { status, busy: false, send })));
  expect(container!.querySelector('details')!.open).toBe(false);
  expect(container!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
  expect(send).not.toHaveBeenCalled();
});
it('blocks a locked destination and submits the reviewed folder with its exact pending-image ID', async () => {
  mount(); const send = vi.fn(async () => {}); const id = 'ebaf17d7-d54a-43f6-a499-4117a6500021';
  const status: VaultStatus = { supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [], routing: { config: { ...DEFAULT_ROUTING_CONFIG, enabled: true, vaultImage: '/synthetic/Private.sparsebundle' }, busy: false, pending: [{ id, name: 'Synthetic.png', tags: ['NSFW', 'Character: Momo'], folder: 'Momo' }] } };
  const render = async () => { await act(async () => root!.render(createElement(VaultRoutingSettings, { status, busy: false, send }))); };
  await render();
  const move = () => [...container!.querySelectorAll('button')].find((button) => button.textContent === 'Move next image')!;
  expect(move().disabled).toBe(true); expect(container!.textContent).toContain('Unlock the destination vault');
  status.sessions = [{ id, name: 'Private', image: '/synthetic/Private.sparsebundle', running: true }]; await render();
  expect(move().disabled).toBe(false); await act(async () => move().click());
  expect(send).toHaveBeenCalledWith({ operation: 'routing.move-next', id, folder: 'Momo' });
});
