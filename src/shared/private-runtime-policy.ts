import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { existsSync, lstatSync, readdirSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
export const PRIVATE_LIBRARY_NAME = 'Private Library';
export function privateCommandBlocked(type: string): boolean {
  return /^(ai|sync|semantic|embedding|plugin|automation|extension|linked-folder)\./.test(type)
    || /^library\.(export|import|inspect|open-eagle|open-billfish|delete-from-disk)/.test(type)
    || /^asset\.(import-linked|import-eagle|import-billfish)/.test(type)
    || /^asset\.(open-external|open-with|reveal-in-folder|copy-file-path|copy|cut|export)/.test(type)
    || /^folder\.(open-in-file-manager|open-with|copy-path|copy|cut)/.test(type);
}
export function assertPrivateCommand(command: { type: string; [key: string]: unknown }, root = process.env.GEN_LIBRARY_PRIVATE_ROOT): void {
  if (!root) return;
  if (privateCommandBlocked(command.type)) throw new Error('This feature is disabled in a private workspace. Cloud AI, sync, plugins, linked sources and external sharing are unavailable.');
  if (command.type === 'library.open' && command.selectedLibraryPath !== path.join(root, PRIVATE_LIBRARY_NAME)) throw new Error('Only the encrypted library can be opened in this workspace.');
  if (command.type === 'library.create' && (command.selectedParentPath !== root || command.displayName !== PRIVATE_LIBRARY_NAME)) throw new Error('Create additional vaults from the main Gen Library window.');
}
let guarded = false;
/** Private workspaces start offline. Block Node TCP and renderer networking separately. */
export function installPrivateNetworkGuard(): void {
  if (guarded) return; guarded = true;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    // IPC uses Unix paths / named pipes; no TCP connections are needed in this workspace.
    const localPath = typeof first === 'string' && !/^\d+$/.test(first)
      || Boolean(first && typeof first === 'object' && 'path' in first && typeof first.path === 'string');
    if (!localPath) throw new Error('Network connections are disabled in private workspaces.');
    return originalConnect.apply(this, args as never);
  } as typeof net.Socket.prototype.connect;
  globalThis.fetch = (async () => { throw new Error('Network requests are disabled in private workspaces.'); }) as typeof fetch;
  syncBuiltinESMExports();
}
const originalConnect = net.Socket.prototype.connect;
if (process.env.GEN_LIBRARY_PRIVATE_WORKSPACE === '1') installPrivateNetworkGuard();

/** Must run before Electron's instance lock, sessions, logs or Worker startup. */
export function preparePrivateProfile(argv: string[]): { root: string; profile: string; temp: string; logs: string; crashes: string } | null {
  const at = argv.indexOf('--gen-library-vault'); if (at < 0) return null;
  const candidate = argv[at + 1];
  if (!candidate || !path.isAbsolute(candidate)) throw new Error('A private workspace requires a mounted vault.');
  const root = realpathSync(candidate);
  const markerPath = path.join(root, '.gen-library-vault.json');
  if (lstatSync(markerPath).isSymbolicLink()) throw new Error('The vault marker cannot be a symbolic link.');
  const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { format?: string; version?: number };
  if (marker.format !== 'gen-library-vault' || marker.version !== 1) throw new Error('Invalid private workspace.');
  const directory = (relative: string) => {
    let current = root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      if (existsSync(current)) { const info = lstatSync(current); if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('A private workspace folder cannot link outside its vault.'); }
      else mkdirSync(current, { mode: 0o700 });
    }
    return current;
  };
  if (existsSync(path.join(root, PRIVATE_LIBRARY_NAME))) directory(PRIVATE_LIBRARY_NAME);
  const profile = directory('.gen-library-profile');
  const temp = directory('.tmp');
  // Reject redirected catalog/cache paths before Chromium or the library can write through them.
  for (const scanRoot of [profile, temp, path.join(root, PRIVATE_LIBRARY_NAME)]) {
    if (!existsSync(scanRoot)) continue;
    const pending = [scanRoot]; let entries = 0;
    while (pending.length) {
      const current = pending.pop()!;
      for (const item of readdirSync(current, { withFileTypes: true })) {
        if (++entries > 200_000) throw new Error('The private workspace is too large to validate safely.');
        if ((current === profile || current.startsWith(temp + path.sep)) && ['SingletonLock','SingletonCookie','SingletonSocket'].includes(item.name)) continue;
        if (item.isSymbolicLink()) throw new Error('Private catalog and cache files cannot link outside the vault.');
        if (item.isDirectory()) pending.push(path.join(current, item.name));
      }
    }
  }
  const result = { root, profile, temp, logs: directory('.gen-library-profile/logs'), crashes: directory('.gen-library-profile/crashes') };
  return result;
}
export function activatePrivateProfileEnvironment(profile: { root: string; temp: string }): void {
  process.env.GEN_LIBRARY_PRIVATE_WORKSPACE = '1'; process.env.GEN_LIBRARY_PRIVATE_ROOT = profile.root;
  process.env.TMPDIR = profile.temp; process.env.TEMP = profile.temp; process.env.TMP = profile.temp;
  installPrivateNetworkGuard();
}
