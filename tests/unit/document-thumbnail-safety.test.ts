import { describe, expect, it, vi } from 'vitest';
const { created, executeJavaScript, destroy, loadURL } = vi.hoisted(() => ({ created: vi.fn(), executeJavaScript: vi.fn(), destroy: vi.fn(), loadURL: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: class {
  constructor(options: unknown) { created(options); }
  webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), executeJavaScript, capturePage: vi.fn(async () => ({ isEmpty: () => false, toPNG: () => Buffer.from([137,80,78,71,13,10,26,10,0]), getSize: () => ({ width: 1024, height: 800 }) })) };
  loadURL = loadURL; isDestroyed = () => false; destroy = destroy;
} }));
import { renderDocumentThumbnail } from '../../src/main/document-thumbnail-renderer';
describe('static document thumbnails', () => {
  it('captures with scripts disabled without using a page-script readiness probe', async () => {
    const logger = { error: vi.fn() };
    const result = await renderDocumentThumbnail({ type: 'document-thumbnail.render-request', requestId: 'demo', url: 'serpent://source/library/asset', width: 1024 }, logger as never);
    expect(result.status).toBe('ok');
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ webPreferences: expect.objectContaining({ javascript: false, sandbox: true, nodeIntegration: false }) }));
    expect(executeJavaScript).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
