import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync, realpathSync, lstatSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { VaultStatus } from '../shared/vault';
import { preparePrivateProfile } from '../shared/private-runtime-policy';

export async function runDiskImage(args: string[], password?: string): Promise<string> {
  return runNative('/usr/bin/hdiutil', args, password === undefined ? undefined : Buffer.from(`${password}\0`, 'utf8'));
}
async function runNative(executable: string, args: string[], input?: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe','pipe','pipe'], shell: false });
    let output = ''; let error = ''; let bytes = 0; let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true; child.kill('SIGTERM');
      // End an unresponsive utility, never force-unmount its volume. The recovery journal survives.
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, 120_000);
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes <= 4 * 1024 * 1024) output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { if (error.length < 16384) error += chunk.toString(); });
    child.once('error', () => { clearTimeout(timer); clearTimeout(killTimer); input?.fill(0); reject(new Error('Could not start macOS encrypted storage.')); });
    child.once('close', (code) => {
      clearTimeout(timer); clearTimeout(killTimer); input?.fill(0);
      if (timedOut) { const failure = new Error('The disk operation timed out. Its mount state must be checked in Disk Utility.'); failure.name = 'VaultDiskTimeout'; reject(failure); }
      else if (code === 0 && bytes <= 4 * 1024 * 1024) resolve(output);
      else reject(new Error(/authentication|password/i.test(error) ? 'The vault password was not accepted.' : 'The disk operation failed. A busy volume remains unlocked; close files using it and retry.'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input, () => input?.fill(0));
  });
}
export async function diskImageInfo(args: string[]): Promise<Record<string, unknown>> {
  const xml = await runDiskImage([...args, '-plist']);
  const json = await runNative('/usr/bin/plutil', ['-convert','json','-o','-','-'], Buffer.from(xml));
  return JSON.parse(json) as Record<string, unknown>;
}
const storedSession = z.object({ id: z.string().uuid(), name: z.string().max(80), image: z.string(), mount: z.string() });
type Session = z.infer<typeof storedSession> & { child: ChildProcess | null; error?: string; locking?: Promise<void>; recovered?: boolean };
export type VaultManagerOptions = {
  userData: string; mountRoot?: string; executable: string; appPath: string; packaged: boolean;
  runDisk?: typeof runDiskImage; info?: typeof diskImageInfo;
  spawnWorkspace?: (args: string[], env: NodeJS.ProcessEnv) => ChildProcess;
};
export class VaultManager {
  readonly sessions = new Map<string, Session>();
  private readonly runDisk: typeof runDiskImage;
  private readonly info: typeof diskImageInfo;
  private readonly journal: string;
  private readonly mountRoot: string;
  constructor(private readonly options: VaultManagerOptions) {
    this.runDisk = options.runDisk ?? runDiskImage; this.info = options.info ?? diskImageInfo;
    mkdirSync(options.userData, { recursive: true, mode: 0o700 });
    this.journal = path.join(options.userData, 'vault-sessions.json');
    // Chromium uses Unix sockets with a short path limit. The disk image remains at the user's chosen path.
    this.mountRoot = options.mountRoot ?? path.join('/private/tmp', `glv-${process.getuid?.() ?? 'user'}`);
    mkdirSync(this.mountRoot, { recursive: true, mode: 0o700 });
    const rootInfo = lstatSync(this.mountRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || (process.getuid && rootInfo.uid !== process.getuid())) throw new Error('The vault mount directory is not owned by this account.');
    chmodSync(this.mountRoot, 0o700);
  }
  get active(): boolean { return this.sessions.size > 0; }
  snapshot(): VaultStatus {
    return { supported: process.platform === 'darwin', privateWorkspace: false, privateLibraryPath: null,
      sessions: [...this.sessions.values()].map(({ id, name, child, error }) => ({ id, name, running: child !== null, ...(error ? { error } : {}) })) };
  }
  private persist(): void {
    const records = [...this.sessions.values()].map(({ id, name, image, mount }) => ({ id, name, image, mount }));
    const temporary = `${this.journal}.tmp`;
    writeFileSync(temporary, JSON.stringify(records), { mode: 0o600 }); renameSync(temporary, this.journal);
  }
  async recover(): Promise<void> {
    if (!existsSync(this.journal)) return;
    const records = z.array(storedSession).max(100).parse(JSON.parse(readFileSync(this.journal, 'utf8')));
    for (const record of records) {
      if (record.mount !== path.join(this.mountRoot, record.id, 'v')) throw new Error('The vault recovery record is invalid.');
    }
    const info = await this.info(['info']);
    const mounted = new Set<string>();
    for (const image of Array.isArray(info.images) ? info.images : []) {
      const entities = (image as Record<string, unknown>)['system-entities'];
      for (const entity of Array.isArray(entities) ? entities : []) {
        const mount = (entity as Record<string, unknown>)['mount-point']; if (typeof mount === 'string') mounted.add(mount);
      }
    }
    for (const record of records) {
      if (mounted.has(record.mount)) this.sessions.set(record.id, { ...record, child: null, recovered: true, error: 'Recovered unlocked volume. Close any private workspace or files using it, then Lock.' });
    }
    this.persist();
    await this.lockRecovered();
  }
  async lockRecovered(): Promise<void> {
    for (const session of this.sessions.values()) if (session.recovered) await this.lock(session.id).catch(() => {});
  }
  async create(image: string, name: string, password: string, sizeGiB: number): Promise<void> {
    await this.runDisk(['create','-size',`${sizeGiB}g`,'-fs','APFS','-type','SPARSEBUNDLE','-encryption','AES-256','-stdinpass','-nospotlight','-volname','Gen Library Private',image], password);
    await this.open(image, password, name, true);
  }
  async expand(image: string, password: string, sizeGiB: number): Promise<void> {
    if (!path.isAbsolute(image) || !image.toLowerCase().endsWith('.sparsebundle')) throw new Error('Choose a Gen Library encrypted sparse bundle.');
    if (!Number.isSafeInteger(sizeGiB) || sizeGiB < 1 || sizeGiB > 16384) throw new Error('Choose a capacity between 1 and 16384 GB.');
    image = realpathSync(image);
    if ([...this.sessions.values()].some((session) => session.image === image)) throw new Error('Lock the vault before increasing its capacity.');
    const attached = await this.info(['info']);
    for (const item of Array.isArray(attached.images) ? attached.images : []) {
      const mountedImage = (item as Record<string, unknown>)['image-path'];
      if (typeof mountedImage === 'string' && (() => { try { return realpathSync(mountedImage) === image; } catch { return path.resolve(mountedImage) === image; } })()) throw new Error('Unmount the vault before increasing its capacity.');
    }
    if ((await this.info(['isencrypted', image])).encrypted !== true) throw new Error('This disk image is not encrypted.');
    const bounds = (await this.runDisk(['resize', '-limits', '-stdinpass', image], password)).trim().split(/\s+/u);
    if (bounds.length !== 3 || bounds.some((value) => !/^\d+$/u.test(value))) throw new Error('macOS did not return valid vault capacity limits. The vault was not changed.');
    const current = BigInt(bounds[1]!); const maximum = BigInt(bounds[2]!);
    const gib = 1024n ** 3n; const requestedSectors = BigInt(sizeGiB) * gib / 512n;
    const currentCeilingGiB = (current * 512n + gib - 1n) / gib;
    if (BigInt(sizeGiB) <= currentCeilingGiB) throw new Error(`Choose more than the current ${currentCeilingGiB} GB capacity. Vaults can only be enlarged here.`);
    if (requestedSectors > maximum) throw new Error('The requested capacity exceeds the format limit. The vault was not changed.');
    await this.runDisk(['resize', '-size', `${sizeGiB}g`, '-stdinpass', image], password);
  }
  async open(image: string, password: string, name = path.basename(image, '.sparsebundle'), initialize = false): Promise<void> {
    if (this.sessions.size >= 100) throw new Error('Lock another vault before opening more.');
    if (!path.isAbsolute(image) || !image.toLowerCase().endsWith('.sparsebundle')) throw new Error('Choose a Gen Library encrypted sparse bundle.');
    if ((await this.info(['isencrypted', image])).encrypted !== true) throw new Error('This disk image is not encrypted and cannot be opened as a private library.');
    image = realpathSync(image);
    name = name.slice(0, 80) || 'Private Library';
    if ([...this.sessions.values()].some((session) => session.image === image)) throw new Error('This vault is already unlocked.');
    const id = randomUUID(); const parent = path.join(this.mountRoot, id); const mount = path.join(parent, 'v');
    mkdirSync(parent, { mode: 0o700 }); mkdirSync(mount, { mode: 0o500 });
    // If storage disappears unexpectedly, application mkdir calls cannot recreate a plaintext profile here.
    chmodSync(parent, 0o500);
    // Journal BEFORE mounting: a crash or interrupted attach cannot lose its recovery record.
    const session: Session = { id, name, image, mount, child: null }; this.sessions.set(id, session); this.persist();
    try {
      await this.runDisk(['attach', image, '-stdinpass','-nobrowse','-noautoopen','-mountpoint',mount], password);
      const marker = path.join(mount, '.gen-library-vault.json');
      if (initialize) {
        writeFileSync(marker, JSON.stringify({ format: 'gen-library-vault', version: 1 }), { flag: 'wx', mode: 0o600 });
        writeFileSync(path.join(mount, '.metadata_never_index'), '', { mode: 0o600 });
      } else {
        const data = JSON.parse(readFileSync(marker, 'utf8')) as { format?: string; version?: number };
        if (data.format !== 'gen-library-vault' || data.version !== 1) throw new Error('This is not a supported Gen Library vault.');
      }
      const profile = preparePrivateProfile(['--gen-library-vault', mount])!;
      const args = [...(this.options.packaged ? [] : [this.options.appPath]), `--user-data-dir=${profile.profile}`, '--gen-library-vault', mount];
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined, GEN_LIBRARY_PRIVATE_WORKSPACE: '1', GEN_LIBRARY_PRIVATE_ROOT: mount, TMPDIR: profile.temp, TEMP: profile.temp, TMP: profile.temp, GEN_LIBRARY_VAULT_SUPERVISOR_PID: String(process.pid), SERPENT_ALLOW_MULTI_INSTANCE: undefined, SERPENT_E2E: undefined, SERPENT_E2E_USER_DATA_PATH: undefined };
      session.child = this.options.spawnWorkspace?.(args, env) ?? spawn(this.options.executable, args, { stdio: 'ignore', detached: false, env });
      session.child.once('error', () => { session.child = null; void this.lock(id).catch(() => {}); });
      session.child.once('exit', () => { session.child = null; void this.lock(id).catch(() => {}); });
    } catch (error) {
      const mounted = await this.info(['info']).then((data) => {
        for (const image of Array.isArray(data.images) ? data.images : []) {
          const entities = (image as Record<string, unknown>)['system-entities'];
          if ((Array.isArray(entities) ? entities : []).some((item: Record<string, unknown>) => item['mount-point'] === mount)) return true;
        }
        return false;
      }).catch(() => true);
      if (error instanceof Error && error.name === 'VaultDiskTimeout') { session.recovered = true; session.error = error.message; }
      else if (mounted) await this.lock(id).catch(() => {});
      else { this.sessions.delete(id); this.persist(); this.removeMountDirectory(mount); }
      throw error;
    }
  }
  private removeMountDirectory(mount: string): void {
    try { rmdirSync(mount); } catch { /* hdiutil may already have removed the empty mount point. */ }
    try { rmdirSync(path.dirname(mount)); } catch { /* Preserve anything unexpected. */ }
  }
  async lock(id: string): Promise<void> {
    const session = this.sessions.get(id); if (!session) return;
    if (session.locking) return session.locking;
    session.locking = Promise.resolve().then(async () => {
      try {
        const child = session.child;
        if (child && child.exitCode === null && child.signalCode === null) {
          await new Promise<void>((resolve, reject) => {
            const exited = () => { clearTimeout(timeout); resolve(); };
            const timeout = setTimeout(() => { child.off('exit', exited); reject(new Error('The private workspace is still closing. The vault remains unlocked.')); }, 30_000);
            child.once('exit', exited); child.kill('SIGUSR2');
          });
        }
        await this.runDisk(['detach', session.mount]); // Never force-unmount.
        this.sessions.delete(id); this.persist();
        this.removeMountDirectory(session.mount);
      } catch (error) {
        session.error = error instanceof Error ? error.message : 'The vault is still unlocked.'; throw error;
      } finally { session.locking = undefined; }
    });
    return session.locking;
  }
  async lockAll(): Promise<void> {
    const results = await Promise.allSettled([...this.sessions.keys()].map((id) => this.lock(id)));
    if (results.some((result) => result.status === 'rejected')) throw new Error('One or more vaults are still unlocked. Close files using them and retry Lock.');
  }
}
