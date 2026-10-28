import { fork, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { diskImageInfo } from '../../src/main/vault-manager';
import type { VaultStatus } from '../../src/shared/vault';

const enabled = process.env.GEN_LIBRARY_VAULT_DISK_TEST === '1' && process.platform === 'darwin';
it.skipIf(!enabled)('secures a real vault after parent disconnection and recovers after the controller is killed', async () => {
  mkdirSync('.local', { recursive: true });
  const root = mkdtempSync(path.resolve('.local/vault-supervisor-native-'));
  const entry = path.resolve('.local/vault-supervisor-test/vault_supervisor.js');
  const workspace = path.join(root, 'synthetic-workspace.cjs');
  writeFileSync(workspace, `const fs = require('node:fs'), path = require('node:path');
const mount = process.argv[process.argv.indexOf('--gen-library-vault') + 1];
fs.writeFileSync(path.join(mount, 'synthetic-private.txt'), 'private-test-payload');
process.on('SIGUSR2', () => process.exit(0));
setInterval(() => { try { process.kill(Number(process.env.GEN_LIBRARY_VAULT_SUPERVISOR_PID), 0); } catch { process.exit(0); } }, 100);
`);
  let sequence = 0;
  const controllers: ChildProcess[] = [];
  const createController = () => {
    const child = fork(entry, [], { stdio: ['ignore','ignore','ignore','ipc'] }); controllers.push(child); return child;
  };
  const request = (child: ChildProcess, command: unknown): Promise<VaultStatus> => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { child.off('message', receive); reject(new Error('Synthetic controller timed out')); }, 30_000);
    function receive(message: unknown) {
      const reply = message as { id: number; value: VaultStatus }; if (reply.id !== id) return;
      clearTimeout(timer); child.off('message', receive); resolve(reply.value);
    }
    child.on('message', receive); child.send({ id, command });
  });
  const waitUntil = async (predicate: () => boolean | Promise<boolean>) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
    throw new Error('Synthetic vault lifecycle did not settle');
  };
  const initialize = (child: ChildProcess) => request(child, { operation: 'initialize', userData: path.join(root, 'controller'), executable: process.execPath, appPath: workspace, packaged: false });
  const password = randomBytes(24).toString('base64url');
  const image = path.join(root, 'Synthetic.sparsebundle');
  try {
    let child = createController(); expect((await initialize(child)).error).toBeUndefined();
    let state = await request(child, { operation: 'create', image, name: 'Synthetic', password, sizeGiB: 1 });
    expect(state.error).toBeUndefined(); expect(state.sessions).toHaveLength(1);
    let journal = JSON.parse(readFileSync(path.join(root, 'controller/vault-sessions.json'), 'utf8')) as { mount: string }[];
    const firstMount = journal[0]!.mount;
    await waitUntil(() => existsSync(path.join(firstMount, 'synthetic-private.txt')));
    child.disconnect();
    await waitUntil(() => child.exitCode !== null);
    expect(existsSync(path.join(firstMount, 'synthetic-private.txt'))).toBe(false);

    child = createController(); expect((await initialize(child)).sessions).toHaveLength(0);
    state = await request(child, { operation: 'open', image, password }); expect(state.error).toBeUndefined();
    journal = JSON.parse(readFileSync(path.join(root, 'controller/vault-sessions.json'), 'utf8')) as { mount: string }[];
    const recoveredMount = journal[0]!.mount;
    await waitUntil(() => existsSync(path.join(recoveredMount, 'synthetic-private.txt')));
    child.kill('SIGKILL'); await waitUntil(() => child.signalCode !== null);
    // The orphaned workspace observes the controller's death and exits before recovery.
    await new Promise((resolve) => setTimeout(resolve, 500));
    child = createController(); state = await initialize(child);
    expect(state.error).toBeUndefined(); expect(state.sessions).toHaveLength(0);
    expect(existsSync(path.join(recoveredMount, 'synthetic-private.txt'))).toBe(false);
    const mounts = JSON.stringify(await diskImageInfo(['info'])); expect(mounts).not.toContain(recoveredMount);
    child.disconnect(); await waitUntil(() => child.exitCode !== null);
  } finally {
    for (const controller of controllers) if (controller.connected) controller.disconnect();
    // Preserve test files on a lifecycle failure rather than deleting a potentially mounted vault.
    const mounted = JSON.stringify(await diskImageInfo(['info']));
    if (!mounted.includes(root)) rmSync(root, { recursive: true, force: true });
  }
}, 120_000);
