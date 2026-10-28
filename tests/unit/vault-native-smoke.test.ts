import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { VaultManager, runDiskImage } from '../../src/main/vault-manager';
import { preparePrivateProfile } from '../../src/shared/private-runtime-policy';
it.skipIf(process.env.GEN_LIBRARY_VAULT_DISK_TEST !== '1' || process.platform !== 'darwin')('creates, locks and reopens a real encrypted APFS sparse bundle with isolated private data', async () => {
  mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/native-vault-'));
  const password = randomBytes(24).toString('base64url');
  const manager = new VaultManager({ userData: path.join(root, 'controller'), executable: process.execPath, appPath: '', packaged: true, spawnWorkspace: () => {
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, { exitCode: null, signalCode: null, kill: () => { queueMicrotask(() => child.emit('exit', 0)); return true; } }); return child;
  } });
  try {
    const image = path.join(root, 'Synthetic.sparsebundle');
    await manager.create(image, 'Synthetic test', password, 1);
    const mounted = [...manager.sessions.values()][0]!; const profile = preparePrivateProfile(['app','--gen-library-vault',mounted.mount])!;
    const payload = 'synthetic-private-catalog-and-thumbnail'; writeFileSync(path.join(profile.profile, 'privacy-fixture.txt'), payload);
    const privateFile = path.join(profile.profile, 'privacy-fixture.txt');
    // Simulate storage disappearing while a workspace still exists. A stale path must not accept plaintext.
    await runDiskImage(['detach', mounted.mount]);
    expect(() => mkdirSync(path.join(mounted.mount, '.gen-library-profile'), { recursive: true })).toThrow();
    await runDiskImage(['attach', image, '-stdinpass','-nobrowse','-noautoopen','-mountpoint',mounted.mount], password);
    await manager.lockAll(); expect(existsSync(privateFile)).toBe(false);
    expect(readFileSync(path.join(root, 'controller/vault-sessions.json'), 'utf8')).not.toContain(payload);
    await expect(manager.open(image, 'incorrect-synthetic-password')).rejects.toThrow(); expect(manager.active).toBe(false);
    await expect(manager.expand(image, 'incorrect-synthetic-password', 2)).rejects.toThrow();
    await manager.expand(image, password, 2);
    await expect(manager.expand(image, password, 1)).rejects.toThrow('only be enlarged');
    await manager.open(image, password); const reopened = [...manager.sessions.values()][0]!;
    expect(readFileSync(path.join(reopened.mount, '.gen-library-profile/privacy-fixture.txt'), 'utf8')).toBe(payload);
    const capacity = statfsSync(reopened.mount); expect(capacity.bsize * capacity.blocks).toBeGreaterThan(1.5 * 1024 ** 3);
    await manager.lockAll(); expect(manager.active).toBe(false);
  } finally { await manager.lockAll(); rmSync(root, { recursive: true, force: true }); }
}, 120_000);
