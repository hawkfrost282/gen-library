// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { VaultEntry } from '../../src/renderer/VaultEntry';
import type { VaultRequest, VaultStatus } from '../../src/shared/vault';
let root: Root | undefined; let container: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); root = undefined; container = undefined; });

it('keeps capacity advanced by default and clears the password after a successful enlargement request', async () => {
  const state: VaultStatus = { supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [] };
  const request = vi.fn(async (input: VaultRequest): Promise<VaultStatus> => input.operation === 'expand' ? { ...state, notice: 'The capacity ceiling was increased.' } : state);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(createElement(VaultEntry, { api: { request } })); });
  await act(async () => { container!.querySelector<HTMLButtonElement>('[aria-label="Vaults"]')!.click(); });
  const advanced = container.querySelector('.vault-capacity-settings') as HTMLDetailsElement; expect(advanced.open).toBe(false);
  expect(container.textContent).toContain('does not reserve its full capacity');
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Increase Vault Capacity…')!;
  expect(button.disabled).toBe(true);
  const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  const capacity = container.querySelector<HTMLInputElement>('input[type="number"]')!;
  const setValue = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => { setValue(password, 'synthetic-ui-password'); setValue(capacity, '100'); });
  expect(button.disabled).toBe(false);
  await act(async () => { button.click(); });
  expect(request).toHaveBeenCalledWith({ operation: 'expand', password: 'synthetic-ui-password', sizeGiB: 100 });
  expect(password.value).toBe(''); expect(container.textContent).toContain('ceiling was increased');
});
