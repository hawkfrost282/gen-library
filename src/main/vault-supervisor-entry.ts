import { existsSync, mkdirSync, openSync, readFileSync, closeSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { vaultCommandSchema } from '../shared/vault';
import { VaultManager } from './vault-manager';

const initSchema = z.strictObject({ operation: z.literal('initialize'), userData: z.string(), executable: z.string(), appPath: z.string(), packaged: z.boolean() });
let manager: VaultManager | undefined;
let initialized = false;
let lockPath: string | undefined;
let queue = Promise.resolve();
let orphaned = false;
let recovering: ReturnType<typeof setInterval> | undefined;
function send(id: unknown, value: unknown) { if (process.connected) process.send?.({ id, value }); }
async function shutdownOrphan(): Promise<void> {
  if (!manager) { process.exit(0); return; }
  await manager.lockAll().catch(() => {});
  if (!manager.active) { if (lockPath) { try { unlinkSync(lockPath); } catch { /* Stale lock is recovered on next launch. */ } } process.exit(0); }
  else setTimeout(() => { void shutdownOrphan(); }, 5000);
}
process.on('message', (message: unknown) => {
  queue = queue.then(async () => {
    const envelope = z.object({ id: z.number().int(), command: z.unknown() }).safeParse(message);
    if (!envelope.success) return;
    const { id, command } = envelope.data;
    try {
      if (!manager) {
        const init = initSchema.parse(command);
        mkdirSync(init.userData, { recursive: true, mode: 0o700 });
        lockPath = path.join(init.userData, 'vault-supervisor.lock');
        if (existsSync(lockPath)) {
          const owner = Number(readFileSync(lockPath, 'utf8'));
          let live = false;
          if (Number.isSafeInteger(owner) && owner > 1) { try { process.kill(owner, 0); live = true; } catch { /* Old controller ended. */ } }
          if (live) throw new Error('The previous vault controller is still securing its volumes. Close any files using them and try again shortly.');
          unlinkSync(lockPath);
        }
        const handle = openSync(lockPath, 'wx', 0o600); writeFileSync(handle, String(process.pid)); closeSync(handle);
        manager = new VaultManager(init); await manager.recover(); initialized = true;
        recovering = setInterval(() => { if (manager) void manager.lockRecovered(); }, 5000);
        send(id, manager.snapshot()); return;
      }
      const request = vaultCommandSchema.parse(command);
      if (request.operation === 'transfer') {
        const transferReceipt = await manager.transfer(request.image, request.source, request.folder); send(id, { ...manager.snapshot(), transferReceipt }); return;
      }
      if (request.operation === 'create') await manager.create(request.image, request.name, request.password, request.sizeGiB);
      if (request.operation === 'open') await manager.open(request.image, request.password);
      if (request.operation === 'expand') {
        await manager.expand(request.image, request.password, request.sizeGiB);
        send(id, { ...manager.snapshot(), notice: 'The capacity ceiling was increased. The vault still uses only the space its contents need.' }); return;
      }
      if (request.operation === 'lock') await manager.lock(request.id);
      if (request.operation === 'lock-all') await manager.lockAll();
      send(id, manager.snapshot());
    } catch (error) {
      send(id, { ...(manager?.snapshot() ?? { supported: true, privateWorkspace: false, privateLibraryPath: null, sessions: [] }), error: error instanceof z.ZodError ? 'Invalid vault request.' : error instanceof Error ? error.message : 'The vault operation failed.' });
      if (!initialized) { process.disconnect?.(); process.exitCode = 1; }
    }
  }).catch(() => { /* Fail closed: journal survives a controller failure. */ });
});
process.on('disconnect', () => {
  orphaned = true; if (recovering) clearInterval(recovering);
  queue = queue.then(shutdownOrphan);
});
process.on('SIGTERM', () => { if (!orphaned) { orphaned = true; queue = queue.then(shutdownOrphan); } });
