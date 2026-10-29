import { expect, test, vi } from 'vitest';

import { shell, parseReadAppLogResult, parseRevealAppLogResult } from '../../src/preload/bridge/shell';

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

test('parseRevealAppLogResult accepts success and known failure codes', () => {
  expect(parseRevealAppLogResult({ ok: true })).toEqual({ ok: true });
  expect(parseRevealAppLogResult({ ok: false, code: 'log_missing' })).toEqual({
    ok: false,
    code: 'log_missing',
  });
  expect(parseRevealAppLogResult({ ok: false, code: 'unauthorized_sender' })).toEqual({
    ok: false,
    code: 'unauthorized_sender',
  });
  expect(parseRevealAppLogResult({ ok: false, code: 'not-a-code' })).toEqual({
    ok: false,
    code: 'shell_failure',
  });
  expect(parseRevealAppLogResult(false)).toEqual({ ok: false, code: 'shell_failure' });
});

test('parseReadAppLogResult keeps valid entries and maps unknown codes', () => {
  const entry = {
    timestamp: '2026-09-21T00:00:00.000Z',
    level: 'info',
    scope: 'app',
    message: 'opened',
  };
  expect(parseReadAppLogResult({
    ok: true,
    fileName: 'serpent.log',
    entries: [entry, { skip: true }],
  })).toEqual({
    ok: true,
    fileName: 'serpent.log',
    entries: [entry],
  });
  expect(parseReadAppLogResult({ ok: false, code: 'malformed_request' })).toEqual({
    ok: false,
    code: 'malformed_request',
  });
  expect(parseReadAppLogResult({ ok: false, code: 'not-a-code' })).toEqual({
    ok: false,
    code: 'read_failure',
  });
});


test('native menu bridge delivers shared commands and drops unknown commands', async () => {
  const { ipcRenderer } = await import('electron');
  const listener = vi.fn(); const off = shell.onApplicationMenuCommand(listener);
  const handler = vi.mocked(ipcRenderer.on).mock.calls.at(-1)?.[1];
  expect(handler).toBeDefined();
  for (const command of ['file.paste-image','library.show-missing-linked','canvas.view.list']) handler?.({} as Electron.IpcRendererEvent, command);
  handler?.({} as Electron.IpcRendererEvent, 'unknown.command');
  expect(listener.mock.calls.map(([event]) => event.command)).toEqual(['file.paste-image','library.show-missing-linked','canvas.view.list']);
  off(); expect(ipcRenderer.removeListener).toHaveBeenCalled();
});
