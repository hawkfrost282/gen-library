import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { assertPrivateCommand, preparePrivateProfile, privateCommandBlocked } from '../../src/shared/private-runtime-policy';
const roots: string[] = [];
function root() { mkdirSync('.local', { recursive: true }); const p = mkdtempSync(path.resolve('.local/private-profile-')); roots.push(p); writeFileSync(path.join(p, '.gen-library-vault.json'), JSON.stringify({ format: 'gen-library-vault', version: 1 })); return p; }
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
describe('private workspace boundaries', () => {
  it('keeps profile, temp, logs and crash dumps under the mounted root', () => {
    const p = root(); const profile = preparePrivateProfile(['app', '--gen-library-vault', p])!;
    for (const value of [profile.profile, profile.temp, profile.logs, profile.crashes]) expect(value.startsWith(p + path.sep)).toBe(true);
    expect(profile.root).toBe(p);
  });
  it('rejects a profile redirected outside the vault by a symbolic link', () => {
    const p = root(); const elsewhere = root(); symlinkSync(elsewhere, path.join(p, '.gen-library-profile'), 'dir');
    expect(() => preparePrivateProfile(['app', '--gen-library-vault', p])).toThrow('cannot link');
  });
  it('rejects symlinked cache files before the application can write outside the vault', () => {
    const p = root(); const elsewhere = root(); const profile = path.join(p, '.gen-library-profile'); mkdirSync(profile);
    writeFileSync(path.join(elsewhere, 'outside'), 'synthetic'); symlinkSync(path.join(elsewhere, 'outside'), path.join(profile, 'Preferences'));
    expect(() => preparePrivateProfile(['app', '--gen-library-vault', p])).toThrow('cannot link');
  });
  it('denies cloud features, linked imports and external sharing but allows local ratings and metadata', () => {
    for (const type of ['ai.analyze','sync.push','semantic.index','plugin.install','asset.import-linked','asset.open-external.request','library.export']) expect(privateCommandBlocked(type)).toBe(true);
    for (const type of ['asset.rating.set','asset.metadata.get','asset.import.prepare']) expect(privateCommandBlocked(type)).toBe(false);
    expect(() => assertPrivateCommand({ type: 'library.open', selectedLibraryPath: '/outside' }, '/vault')).toThrow();
    expect(() => assertPrivateCommand({ type: 'library.open', selectedLibraryPath: '/vault/Private Library' }, '/vault')).not.toThrow();
  });
  it('blocks TCP and fetch in an isolated Node process', () => {
    const module = pathToFileURL(path.resolve('src/shared/private-runtime-policy.ts')).href;
    const code = `import { installPrivateNetworkGuard } from ${JSON.stringify(module)}; import net from 'node:net'; installPrivateNetworkGuard(); let blocked = false; try { net.connect(9, '127.0.0.1'); } catch { blocked = true; } if (!blocked) process.exit(2); try { await fetch('https://example.invalid'); process.exit(3); } catch {} console.log('offline guard verified');`;
    expect(execFileSync(process.execPath, ['--input-type=module','-e',code], { encoding: 'utf8', env: { ...process.env, GEN_LIBRARY_PRIVATE_WORKSPACE: '0' } })).toContain('offline guard verified');
  });
});
