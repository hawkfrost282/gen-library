import { createHash } from 'node:crypto';
import type { VaultSource } from '../../src/shared/vault-routing';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, chmodSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultManager } from '../../src/main/vault-manager';
const roots: string[] = [];
function fixture() {
  mkdirSync('.local', { recursive: true }); const root = mkdtempSync(path.resolve('.local/vault-unit-')); roots.push(root);
  let busy = false;
  const run = vi.fn(async (args: string[]) => { if (args[0] === 'create') mkdirSync(args.at(-1)!, { recursive: true }); if (args[0] === 'attach') chmodSync(args.at(-1)!, 0o700); if (args[0] === 'detach') { if (busy) throw new Error('Volume busy'); chmodSync(path.dirname(args[1]!), 0o700); rmSync(args[1]!, { recursive: true, force: true }); } return ''; });
  const spawn = vi.fn<(args: string[], env: NodeJS.ProcessEnv) => ChildProcess>(() => {
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, { exitCode: null, signalCode: null, kill: vi.fn(() => { queueMicrotask(() => child.emit('exit', 0)); return true; }) });
    return child;
  });
  const info = vi.fn(async (args: string[]): Promise<Record<string, unknown>> => args[0] === 'isencrypted' ? { encrypted: true } : { images: [] });
  const manager = new VaultManager({ userData: root, mountRoot: path.join(root, 'vault-mounts'), executable: '/app/Electron', appPath: '/app/app.asar', packaged: true, runDisk: run, info, spawnWorkspace: spawn });
  return { root, run, spawn, info, manager, setBusy(value: boolean) { busy = value; } };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('encrypted-library lifecycle', () => {
  it('passes passwords through the runner separately and keeps them out of arguments, child environment and journal', async () => {
    const f = fixture(); const secret = 'synthetic-unit-password';
    await f.manager.create(path.join(f.root, 'Private.sparsebundle'), 'Private', secret, 1);
    expect(f.run.mock.calls[0]?.[0]).toContain('AES-256');
    expect(JSON.stringify(f.run.mock.calls.map((call) => call[0]))).not.toContain(secret);
    expect(readFileSync(path.join(f.root, 'vault-sessions.json'), 'utf8')).not.toContain(secret);
    const options = f.spawn.mock.calls[0]!; expect(JSON.stringify(options)).not.toContain(secret);
    const mount = [...f.manager.sessions.values()][0]!.mount;
    expect(options[1].TMPDIR).toBe(path.join(mount, '.tmp'));
    expect(options[1].GEN_LIBRARY_PRIVATE_ROOT).toBe(mount);
    expect(options[0]).toContain(`--user-data-dir=${path.join(mount, '.gen-library-profile')}`);
    expect(f.manager.snapshot().sessions).toHaveLength(1);
    await f.manager.lockAll(); expect(f.manager.snapshot().sessions).toHaveLength(0);
    expect(f.run.mock.calls.filter((call) => call[0][0] === 'detach')).toHaveLength(1);
    expect(f.run.mock.calls.some((call) => call[0].includes('-force'))).toBe(false);
  });
  it('keeps a busy volume visibly unlocked, then allows a successful retry', async () => {
    const f = fixture(); await f.manager.create(path.join(f.root, 'Private.sparsebundle'), 'Private', 'synthetic-password', 1);
    f.setBusy(true); await expect(f.manager.lockAll()).rejects.toThrow('unlocked');
    expect(f.manager.snapshot().sessions[0]?.error).toContain('busy');
    f.setBusy(false); await f.manager.lockAll(); expect(f.manager.active).toBe(false);
  });
  it('rejects an unencrypted image before attaching it', async () => {
    const f = fixture(); f.info.mockResolvedValue({ encrypted: false });
    await expect(f.manager.open(path.join(f.root, 'plain.sparsebundle'), 'synthetic')).rejects.toThrow('not encrypted');
    expect(f.run).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
  });
  it('rejects opening a second workspace through an alias of the same encrypted container', async () => {
    const f = fixture(); const image = path.join(f.root, 'Private.sparsebundle');
    await f.manager.create(image, 'Private', 'synthetic-password', 1);
    const alias = path.join(f.root, 'Alias.sparsebundle'); symlinkSync(image, alias, 'dir');
    await expect(f.manager.open(alias, 'synthetic-password')).rejects.toThrow('already unlocked');
    expect(f.spawn).toHaveBeenCalledOnce(); await f.manager.lockAll();
  });
  it('only enlarges locked encrypted vaults and keeps the password outside arguments', async () => {
    const f = fixture(); const image = path.join(f.root, 'Capacity.sparsebundle'); mkdirSync(image);
    f.run.mockResolvedValueOnce('53248 2097072 18014398509481903');
    await f.manager.expand(image, 'synthetic-resize-password', 2);
    expect(f.run.mock.calls.map((call) => call[0])).toEqual([
      ['resize', '-limits', '-stdinpass', image], ['resize', '-size', '2g', '-stdinpass', image],
    ]);
    expect(JSON.stringify(f.run.mock.calls.map((call) => call[0]))).not.toContain('synthetic-resize-password');
    expect(f.spawn).not.toHaveBeenCalled();
  });
  it('refuses same-size or smaller capacities before changing the disk image', async () => {
    const f = fixture(); const image = path.join(f.root, 'Capacity.sparsebundle'); mkdirSync(image);
    f.run.mockResolvedValue('53248 4194224 18014398509481903');
    await expect(f.manager.expand(image, 'synthetic-resize-password', 1)).rejects.toThrow('only be enlarged');
    await expect(f.manager.expand(image, 'synthetic-resize-password', 2)).rejects.toThrow('only be enlarged');
    expect(f.run.mock.calls.every((call) => call[0].includes('-limits'))).toBe(true);
  });
  it('rejects a mounted vault without passing its password to a utility', async () => {
    const f = fixture(); const image = path.join(f.root, 'Capacity.sparsebundle'); mkdirSync(image);
    f.info.mockResolvedValue({ images: [{ 'image-path': image }], encrypted: true });
    await expect(f.manager.expand(image, 'synthetic-resize-password', 2)).rejects.toThrow('Unmount');
    expect(f.run).not.toHaveBeenCalled();
  });
  it('does not resize when limits are invalid or password verification fails', async () => {
    const f = fixture(); const image = path.join(f.root, 'Capacity.sparsebundle'); mkdirSync(image);
    f.run.mockResolvedValueOnce('unexpected output');
    await expect(f.manager.expand(image, 'synthetic-resize-password', 2)).rejects.toThrow('not changed');
    f.run.mockRejectedValueOnce(new Error('The vault password was not accepted.'));
    await expect(f.manager.expand(image, 'synthetic-resize-password', 2)).rejects.toThrow('password');
    expect(f.run.mock.calls.every((call) => call[0].includes('-limits'))).toBe(true);
  });
  it('recovers a mounted volume from the journal and never claims it is locked when detach fails', async () => {
    const f = fixture(); const id = '744d0d74-9b6b-4f3f-95c2-b7d6af7b8000'; const mount = path.join(f.root, 'vault-mounts', id, 'v'); mkdirSync(mount, { recursive: true });
    writeFileSync(path.join(f.root, 'vault-sessions.json'), JSON.stringify([{ id, name: 'Recovered', image: path.join(f.root, 'vault.sparsebundle'), mount }]));
    f.info.mockResolvedValue({ images: [{ 'system-entities': [{ 'mount-point': mount }] }] }); f.setBusy(true);
    await f.manager.recover(); expect(f.manager.snapshot().sessions[0]?.error).toContain('busy');
    f.setBusy(false); await f.manager.lockRecovered(); expect(f.manager.active).toBe(false);
  });
});

it('allows an explicit retry after an import error and waits for a fresh private acknowledgement', async () => {
  const f = fixture(); const image = path.join(f.root, 'Private.sparsebundle');
  await f.manager.create(image, 'Private', 'synthetic-password', 1);
  const sourcePath = path.join(f.root, 'synthetic.png'); const data = Buffer.from('synthetic image bytes'); writeFileSync(sourcePath, data);
  const source: VaultSource = { libraryId: 'synthetic-library', assetId: 'synthetic-asset', revisionId: 'synthetic-revision', sourcePath, fileName: 'synthetic.png', sha256: createHash('sha256').update(data).digest('hex'), metadataHash: 'b'.repeat(64), metadata: { description: null, rating: 5, favorite: true, palette: null, sourcePageUrl: null, author: null, tags: ['NSFW', 'Character: Momo'] } };
  const mount = [...f.manager.sessions.values()][0]!.mount;
  const first = f.manager.transfer(image, source, 'Momo');
  const pending = path.join(mount, '.vault-transfers', 'pending'); const batch = path.join(pending, readdirSync(pending)[0]!);
  writeFileSync(path.join(batch, 'error.json'), '{"message":"synthetic interruption"}');
  await expect(first).rejects.toThrow('original has been kept');
  const retry = f.manager.transfer(image, source, 'Momo');
  expect(existsSync(path.join(batch, 'error.json'))).toBe(false);
  const transfer = JSON.parse(readFileSync(path.join(batch, 'manifest.json'), 'utf8')) as { transferId: string; verificationNonce: string };
  const receipt = { transferId: transfer.transferId, verificationNonce: transfer.verificationNonce, assetId: 'private-synthetic-asset', sha256: source.sha256, metadataHash: source.metadataHash };
  writeFileSync(path.join(mount, '.vault-transfers', 'receipts', transfer.transferId + '.json'), JSON.stringify(receipt));
  await expect(retry).resolves.toEqual(receipt); expect(readFileSync(sourcePath)).toEqual(data);
  await f.manager.lockAll();
});
